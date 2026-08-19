import { availability, toolBonusProperties, toolBooleanProperties, toolModifierProperties, toolStateProperties, isAttributeProperty, drugMethods, drugDetections, drugResidues, drugFlavours, cumulativeEffects } from "../lookups.js";
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
    // Drug flavour options — dropdown source for the new Flavour rows.
    // NET Bonus is intentionally not offered on drugs; the old bucket
    // was swapped out. Legacy NET Bonus rows on existing drug items
    // still render (prepareBonuses tags them), but they can only be
    // deleted, not added.
    const usedFlavours = new Set((rawBonuses || []).filter(b => b.type === "flavour").map(b => b.flavour));
    const flavourOptions = Object.entries(drugFlavours)
      .filter(([key]) => !usedFlavours.has(key))
      .map(([value, meta]) => ({ value, label: game.i18n.localize(`CYBERPUNK.${meta.labelKey}`) }));
    return {
      shaped,
      attributeOptions: opts.attributes,
      propertyOptions:  opts.properties,
      modifierOptions:  opts.modifiers,
      stateOptions:     opts.states,
      flavourOptions
    };
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

    // Drug tab flavour dropdowns (Method Taken / Detection / Residue).
    // Pure display — no mechanical effect. Selected label reads from the
    // enum so a locked sheet still shows the current choice.
    const dropdownFor = (enumMap, currentKey, fallback) => {
      const options = Object.entries(enumMap).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: currentKey === value
      }));
      const selectedLabelKey = enumMap[currentKey] || fallback;
      return {
        options,
        selectedLabel: game.i18n.localize(`CYBERPUNK.${selectedLabelKey}`)
      };
    };
    const mt = dropdownFor(drugMethods,    ctx.system.methodTaken, "DrugMethodIngested");
    const dt = dropdownFor(drugDetections, ctx.system.detection,   "DrugDetectionNoticeable");
    const rs = dropdownFor(drugResidues,   ctx.system.residue,     "DrugResidueNormal");
    ctx.drugMethodOptions       = mt.options; ctx.selectedDrugMethodLabel    = mt.selectedLabel;
    ctx.drugDetectionOptions    = dt.options; ctx.selectedDrugDetectionLabel = dt.selectedLabel;
    ctx.drugResidueOptions      = rs.options; ctx.selectedDrugResidueLabel   = rs.selectedLabel;

    const effect = this._buildBonusViewData(this.document.system.bonuses || []);
    ctx.bonuses = effect.shaped;
    ctx.attributeOptions = effect.attributeOptions;
    ctx.propertyOptions = effect.propertyOptions;
    ctx.modifierOptions = effect.modifierOptions;
    ctx.stateOptions = effect.stateOptions;
    ctx.flavourOptions = effect.flavourOptions;

    const wd = this._buildBonusViewData(this.document.system.withdrawal || []);
    ctx.withdrawal = wd.shaped;
    ctx.withdrawalAttributeOptions = wd.attributeOptions;
    ctx.withdrawalPropertyOptions = wd.propertyOptions;
    ctx.withdrawalModifierOptions = wd.modifierOptions;
    ctx.withdrawalStateOptions = wd.stateOptions;
    ctx.withdrawalFlavourOptions = wd.flavourOptions;

    // Cumulative tab — persistent per-actor counters the drug feeds on
    // Onset→Active. Rows carry only a key (no op / value); the increment
    // is fixed by drug strength via CUMULATIVE_STRENGTH_MUL at apply
    // time. Author-side we render one row per selected key with a
    // dropdown of the remaining unused options.
    const rawCumulative = this.document.system.cumulative || [];
    const usedCumulative = new Set(rawCumulative.map(c => c.cumulative).filter(Boolean));
    const cumulativeAll = Object.entries(cumulativeEffects).map(([value, meta]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${meta.labelKey}`)
    }));
    ctx.cumulativeRows = rawCumulative.map((row, index) => {
      const meta = cumulativeEffects[row.cumulative];
      const options = cumulativeAll
        .filter(o => !usedCumulative.has(o.value) || o.value === row.cumulative)
        .map(o => ({ ...o, selected: o.value === row.cumulative }));
      return {
        index,
        cumulative: row.cumulative || "",
        label: meta ? game.i18n.localize(`CYBERPUNK.${meta.labelKey}`) : (row.cumulative || ""),
        options
      };
    });

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

    const addPropertyBonus = async (target, keyPool, filterFn) => {
      const set = this._bonusSetFor(target);
      const bonuses = [...(item.system[set] || [])];
      const used = new Set(bonuses.filter(b => b.type === "property").map(b => b.property));
      const firstAvailable = Object.keys(keyPool).find(k => !used.has(k) && filterFn(k));
      if (!firstAvailable) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        return;
      }
      bonuses.push({ type: "property", property: firstAvailable, op: "+", value: 0 });
      await item.update({ [`system.${set}`]: bonuses });
    };
    html.find('.add-attribute').on('click', ev => { ev.preventDefault(); addPropertyBonus(ev.currentTarget, toolBonusProperties, isAttributeProperty); });
    html.find('.add-property').on('click', ev => { ev.preventDefault(); addPropertyBonus(ev.currentTarget, toolBooleanProperties, () => true); });
    html.find('.add-modifier').on('click', ev => { ev.preventDefault(); addPropertyBonus(ev.currentTarget, toolModifierProperties, () => true); });
    html.find('.add-state').on('click', ev => { ev.preventDefault(); addPropertyBonus(ev.currentTarget, toolStateProperties, () => true); });
    // Flavour row — the drug's narrative "you feel X" hook. Pushes a
    // `type: "flavour"` row with the first unused drug flavour key.
    html.find('.add-flavour').on('click', async ev => {
      ev.preventDefault();
      const set = this._bonusSetFor(ev.currentTarget);
      const bonuses = [...(item.system[set] || [])];
      const used = new Set(bonuses.filter(b => b.type === "flavour").map(b => b.flavour));
      const firstFree = Object.keys(drugFlavours).find(k => !used.has(k));
      if (!firstFree) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        return;
      }
      bonuses.push({ type: "flavour", flavour: firstFree });
      await item.update({ [`system.${set}`]: bonuses });
    });

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

    // Flavour dropdown change — same shape as property-select, but
    // scoped to `type: "flavour"` rows and keyed on `.flavour` field.
    html.find('.bonus-flavour-select').on('change', async ev => {
      const set = this._bonusSetFor(ev.currentTarget);
      const index = parseInt(ev.currentTarget.dataset.index);
      const newFlavour = ev.currentTarget.value;
      const bonuses = [...(item.system[set] || [])];
      if (bonuses.some((b, i) => i !== index && b.type === "flavour" && b.flavour === newFlavour)) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        this.render();
        return;
      }
      bonuses[index] = { ...bonuses[index], flavour: newFlavour };
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

    // Cumulative tab handlers — stand-alone from the bonus-set toggle
    // above since cumulatives live in their own list (`system.cumulative`)
    // and never share the Effect / Withdrawal split.
    html.find('.add-cumulative').on('click', async ev => {
      ev.preventDefault();
      const cum = [...(item.system.cumulative || [])];
      const used = new Set(cum.map(c => c.cumulative).filter(Boolean));
      const firstFree = Object.keys(cumulativeEffects).find(k => !used.has(k));
      if (!firstFree) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        return;
      }
      cum.push({ type: "cumulative", cumulative: firstFree });
      await item.update({ "system.cumulative": cum });
    });

    html.find('.cumulative-select').on('change', async ev => {
      const index = parseInt(ev.currentTarget.dataset.index);
      const newKey = ev.currentTarget.value;
      const cum = [...(item.system.cumulative || [])];
      if (cum.some((c, i) => i !== index && c.cumulative === newKey)) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        this.render();
        return;
      }
      cum[index] = { ...cum[index], cumulative: newKey };
      await item.update({ "system.cumulative": cum });
    });

    html.find('.cumulative-remove').on('click', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const index = parseInt(ev.currentTarget.dataset.index);
      const cum = [...(item.system.cumulative || [])];
      cum.splice(index, 1);
      await item.update({ "system.cumulative": cum });
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
