import { availability } from "../lookups.js";
import { localize } from "../utils.js";
import { CyberpunkItemSheetV2 } from "./item-sheet-base-v2.js";
import {
  prepareEffectTabContext,
  prepareWeaponTabContext,
  bindEffectTabListeners,
  bindWeaponTabListeners,
  handleSkillDropForBonus
} from "./embedded-helpers.js";

/**
 * Outfit (Armor) Item Sheet with custom card design and tabs.
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkOutfitSheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["outfit-sheet"],
    dragDrop: [{ dropSelector: "[data-drop-target]" }]
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/outfit-sheet.hbs" }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const sys = ctx.system;

    ctx.isOption = sys.armorType === "option";
    ctx.isShield = sys.armorType === "shield";
    ctx.isWeapon = !!sys.isWeapon;
    ctx.showWeaponTab = ctx.isWeapon;

    if (this._activeTab === "weapon" && !ctx.showWeaponTab) {
      this._activeTab = "armor";
      ctx.activeTab = "armor";
    }

    ctx.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: sys.availability === value
    }));
    const selectedAvail = availability[sys.availability] || "Common";
    ctx.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

    ctx.armorTypeOptions = [
      { value: "soft",   label: game.i18n.localize("CYBERPUNK.SoftArmor"),       selected: sys.armorType === "soft" },
      { value: "hard",   label: game.i18n.localize("CYBERPUNK.HardArmor"),       selected: sys.armorType === "hard" },
      { value: "shield", label: game.i18n.localize("CYBERPUNK.ArmorTypeShield"), selected: sys.armorType === "shield" },
      { value: "option", label: game.i18n.localize("CYBERPUNK.ArmorTypeOption"), selected: sys.armorType === "option" }
    ];
    const armorTypeLabelKey = sys.armorType === "hard"   ? "HardArmor"
                            : sys.armorType === "shield" ? "ArmorTypeShield"
                            : sys.armorType === "option" ? "ArmorTypeOption"
                                                         : "SoftArmor";
    ctx.selectedArmorTypeLabel = game.i18n.localize(`CYBERPUNK.${armorTypeLabelKey}`);

    if (ctx.isShield) {
      const sh = sys.shield || { stoppingPower: 0, ablation: 0 };
      const maxSP = Number(sh.stoppingPower) || 0;
      const ablation = Number(sh.ablation) || 0;
      const currentSP = Math.max(0, maxSP - ablation);
      ctx.shieldBlock = {
        key: "shield",
        label: game.i18n.localize("CYBERPUNK.Shield"),
        currentSP,
        maxSP,
        isDamaged: currentSP < maxSP
      };
    } else {
      const locationOrder = [
        { key: "lArm",  label: localize("lArm")  },
        { key: "Head",  label: localize("Head")  },
        { key: "rArm",  label: localize("rArm")  },
        { key: "lLeg",  label: localize("lLeg")  },
        { key: "Torso", label: localize("Torso") },
        { key: "rLeg",  label: localize("rLeg")  }
      ];
      ctx.coverageRows = [
        locationOrder.slice(0, 3),
        locationOrder.slice(3, 6)
      ].map(row => row.map(loc => {
        const cov = sys.coverage?.[loc.key] || { stoppingPower: 0, ablation: 0 };
        const maxSP = Number(cov.stoppingPower) || 0;
        const ablation = Number(cov.ablation) || 0;
        const currentSP = Math.max(0, maxSP - ablation);
        return {
          key: loc.key,
          label: loc.label,
          currentSP,
          maxSP,
          isDamaged: currentSP < maxSP
        };
      }));
    }

    prepareEffectTabContext(ctx, sys.bonuses);
    if (ctx.showWeaponTab) prepareWeaponTabContext(ctx, sys.weapon);

    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._isLocked) return;

    const html = $(this.element);
    const item = this.document;

    html.find('.sp-current-input').on('change', async ev => {
      const input = ev.currentTarget;
      const key = input.dataset.key;
      const maxSP = Number(input.dataset.max) || 0;
      const newCurrent = Math.max(0, Math.min(maxSP, Number(input.value) || 0));
      const ablation = maxSP - newCurrent;
      const path = key === "shield" ? "system.shield.ablation" : `system.coverage.${key}.ablation`;
      await item.update({ [path]: ablation });
    });

    bindEffectTabListeners(html, item, { isLocked: this._isLocked });
    bindWeaponTabListeners(html, item, { isLocked: this._isLocked });
  }

  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
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
    await handleSkillDropForBonus(this.document, item);
  }
}
