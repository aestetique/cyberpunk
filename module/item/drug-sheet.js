import { availability, toolBonusProperties, isAttributeProperty } from "../lookups.js";
import { CyberpunkItemSheetV2 } from "./item-sheet-base-v2.js";
import { prepareBonuses, getAvailablePropertyOptions } from "./embedded-helpers.js";

/**
 * Drug Item Sheet — consumable variant of Tool with two bonus sets
 * ("bonuses" Effect tab, "withdrawal" Withdrawal tab).
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkDrugSheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["drug-sheet"],
    dragDrop: [{ dropSelector: "[data-drop-target]" }]
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/drug-sheet.hbs" }
  };

  _bonusSetFor(target) {
    const el = target?.closest?.("[data-bonus-set]");
    const set = el?.dataset?.bonusSet;
    return set === "withdrawal" ? "withdrawal" : "bonuses";
  }

  _buildBonusViewData(rawBonuses) {
    const shaped = prepareBonuses(rawBonuses);
    const opts = getAvailablePropertyOptions(rawBonuses);
    return { shaped, attributeOptions: opts.attributes, propertyOptions: opts.properties };
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);

    ctx.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: ctx.system.availability === value
    }));
    const selectedAvail = availability[ctx.system.availability] || "Common";
    ctx.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

    const effect = this._buildBonusViewData(this.document.system.bonuses || []);
    ctx.bonuses = effect.shaped;
    ctx.attributeOptions = effect.attributeOptions;
    ctx.propertyOptions = effect.propertyOptions;

    const wd = this._buildBonusViewData(this.document.system.withdrawal || []);
    ctx.withdrawal = wd.shaped;
    ctx.withdrawalAttributeOptions = wd.attributeOptions;
    ctx.withdrawalPropertyOptions = wd.propertyOptions;

    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._isLocked) return;

    const html = $(this.element);
    const item = this.document;

    html.find('.drug-meta-input').on('change blur', ev => {
      const clean = Math.max(0, Math.floor(Number(ev.currentTarget.value) || 0));
      ev.currentTarget.value = String(clean);
    });

    const addPropertyBonus = async (target, filterFn) => {
      const set = this._bonusSetFor(target);
      const bonuses = [...(item.system[set] || [])];
      const used = new Set(bonuses.filter(b => b.type === "property").map(b => b.property));
      const firstAvailable = Object.keys(toolBonusProperties).find(k => !used.has(k) && filterFn(k));
      if (!firstAvailable) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        return;
      }
      bonuses.push({ type: "property", property: firstAvailable, op: "+", value: 0 });
      await item.update({ [`system.${set}`]: bonuses });
    };
    html.find('.add-attribute').on('click', ev => { ev.preventDefault(); addPropertyBonus(ev.currentTarget, isAttributeProperty); });
    html.find('.add-property').on('click', ev => { ev.preventDefault(); addPropertyBonus(ev.currentTarget, k => !isAttributeProperty(k)); });

    html.find('.add-skill').on('click', async ev => {
      ev.preventDefault();
      const set = this._bonusSetFor(ev.currentTarget);
      const bonuses = [...(item.system[set] || [])];
      bonuses.push({ type: "skill", skillUuid: "", skillName: "", op: "+", value: 0 });
      await item.update({ [`system.${set}`]: bonuses });
    });

    html.find('.remove-bonus').on('click', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const set = this._bonusSetFor(ev.currentTarget);
      const index = parseInt(ev.currentTarget.dataset.index);
      const bonuses = [...(item.system[set] || [])];
      bonuses.splice(index, 1);
      await item.update({ [`system.${set}`]: bonuses });
    });

    html.find('.bonus-property-select').on('change', async ev => {
      const set = this._bonusSetFor(ev.currentTarget);
      const index = parseInt(ev.currentTarget.dataset.index);
      const newProperty = ev.currentTarget.value;
      const bonuses = [...(item.system[set] || [])];
      if (bonuses.some((b, i) => i !== index && b.type === "property" && b.property === newProperty)) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        this.render();
        return;
      }
      bonuses[index] = { ...bonuses[index], property: newProperty };
      await item.update({ [`system.${set}`]: bonuses });
    });

    html.find('.bonus-value-input').on('change blur', async ev => {
      const set = this._bonusSetFor(ev.currentTarget);
      const index = parseInt(ev.currentTarget.dataset.index);
      const value = parseInt(ev.currentTarget.value) || 0;
      const bonuses = [...(item.system[set] || [])];
      if (bonuses[index] && bonuses[index].value !== value) {
        bonuses[index] = { ...bonuses[index], value };
        await item.update({ [`system.${set}`]: bonuses });
      }
    });

    html.find('.bonus-op-select').on('change', async ev => {
      const set = this._bonusSetFor(ev.currentTarget);
      const index = parseInt(ev.currentTarget.dataset.index);
      const op = ev.currentTarget.value;
      const bonuses = [...(item.system[set] || [])];
      if (bonuses[index] && bonuses[index].op !== op) {
        bonuses[index] = { ...bonuses[index], op };
        await item.update({ [`system.${set}`]: bonuses });
      }
    });
  }

  async _onDrop(event) {
    event.preventDefault();
    if (this._isLocked) return;

    let data;
    try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return; }
    if (data.type !== "Item") return;

    const item = await Item.implementation.fromDropData(data);
    if (!item) return;

    if (item.type !== "skill") {
      ui.notifications.warn(game.i18n.localize("CYBERPUNK.OnlySkillsCanBeAdded"));
      return;
    }

    const set = this._bonusSetFor(event.target);
    const bonuses = [...(this.document.system[set] || [])];

    const isDuplicate = bonuses.some(b =>
      b.type === "skill" && b.skillUuid && (
        b.skillUuid === item.uuid ||
        b.skillName.toLowerCase() === item.name.toLowerCase()
      )
    );
    if (isDuplicate) {
      ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
      return;
    }

    const emptyIndex = bonuses.findIndex(b => b.type === "skill" && !b.skillUuid);
    if (emptyIndex >= 0) {
      bonuses[emptyIndex] = { ...bonuses[emptyIndex], skillUuid: item.uuid, skillName: item.name };
    } else {
      bonuses.push({ type: "skill", skillUuid: item.uuid, skillName: item.name, op: "+", value: 0 });
    }

    await this.document.update({ [`system.${set}`]: bonuses });
  }
}
