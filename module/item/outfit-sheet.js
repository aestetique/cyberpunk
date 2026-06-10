import { availability } from "../lookups.js";
import { localize } from "../utils.js";
import { CyberpunkItemSheet } from "./item-sheet-base.js";
import {
  prepareEffectTabContext,
  prepareWeaponTabContext,
  bindEffectTabListeners,
  bindWeaponTabListeners,
  handleSkillDropForBonus
} from "./embedded-helpers.js";

/**
 * Outfit (Armor) Item Sheet with custom card design and tabs.
 *
 * Armor type values:
 *   - "soft" / "hard"  full coverage armor that can accept option inserts
 *   - "option"        attachment armor (insert, plate, plug). Its SP layers
 *                     onto the parent it's attached to via the actor flag
 *                     flags.cyberpunk.attachedTo (set from the actor's gear
 *                     panel, mirroring cyberware options). No slot/space
 *                     accounting — any number of options can attach.
 *
 * Optional Weapon tab (`system.isWeapon`) mirrors cyberware's embedded weapon
 * block: it lives at system.weapon and uses the shared tab-weapon partial.
 *
 * @extends {CyberpunkItemSheet}
 */
export class CyberpunkOutfitSheet extends CyberpunkItemSheet {

  /** @type {string} */
  _activeTab = "description";

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["cyberpunk", "sheet", "item", "outfit-sheet"],
      template: "systems/cyberpunk/templates/item/outfit-sheet.hbs",
      dragDrop: [{ dropSelector: "[data-drop-target]" }]
    });
  }

  /** @override */
  getData() {
    const data = super.getData();
    const sys = data.system;
    data.activeTab = this._activeTab;

    // ----- Capability flags -----
    data.isOption = sys.armorType === "option";
    data.isShield = sys.armorType === "shield";
    data.isWeapon = !!sys.isWeapon;
    data.showWeaponTab = data.isWeapon;

    // If the active tab vanished (e.g. user unchecked Is Weapon), bounce back.
    if (this._activeTab === "weapon" && !data.showWeaponTab) {
      this._activeTab = "armor";
      data.activeTab = "armor";
    }

    // ----- Availability dropdown -----
    data.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: sys.availability === value
    }));
    const selectedAvail = availability[sys.availability] || "Common";
    data.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

    // ----- Armor Type dropdown -----
    data.armorTypeOptions = [
      { value: "soft",   label: game.i18n.localize("CYBERPUNK.SoftArmor"),       selected: sys.armorType === "soft" },
      { value: "hard",   label: game.i18n.localize("CYBERPUNK.HardArmor"),       selected: sys.armorType === "hard" },
      { value: "shield", label: game.i18n.localize("CYBERPUNK.ArmorTypeShield"), selected: sys.armorType === "shield" },
      { value: "option", label: game.i18n.localize("CYBERPUNK.ArmorTypeOption"), selected: sys.armorType === "option" }
    ];
    const armorTypeLabelKey = sys.armorType === "hard"   ? "HardArmor"
                            : sys.armorType === "shield" ? "ArmorTypeShield"
                            : sys.armorType === "option" ? "ArmorTypeOption"
                                                         : "SoftArmor";
    data.selectedArmorTypeLabel = game.i18n.localize(`CYBERPUNK.${armorTypeLabelKey}`);

    // ----- SP frame contents -----
    // Shields render a single centred "Shield" block (stored at system.shield);
    // every other armor type renders the 6-zone grid stored at system.coverage.
    if (data.isShield) {
      const sh = sys.shield || { stoppingPower: 0, ablation: 0 };
      const maxSP = Number(sh.stoppingPower) || 0;
      const ablation = Number(sh.ablation) || 0;
      const currentSP = Math.max(0, maxSP - ablation);
      data.shieldBlock = {
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
      data.coverageRows = [
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

    // ----- Effect tab context (always present) -----
    prepareEffectTabContext(data, sys.bonuses);

    // ----- Weapon tab context (only when isWeapon) -----
    if (data.showWeaponTab) {
      prepareWeaponTabContext(data, sys.weapon);
    }

    return data;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Tab switching
    html.find('.tab-header').click(ev => {
      ev.preventDefault();
      const tab = ev.currentTarget.dataset.tab;
      if (tab && tab !== this._activeTab) {
        this._activeTab = tab;
        this.render(false);
      }
    });

    // Skill bonus row → open the skill sheet on click
    html.find('.skill-name[data-uuid]').click(async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const uuid = ev.currentTarget.dataset.uuid;
      if (uuid) {
        const item = await fromUuid(uuid);
        if (item) item.sheet.render(true);
      }
    });

    if (this._isLocked) return;

    // Generic boolean toggle (same pattern as cyberware-sheet's checkbox-toggle).
    html.find('.checkbox-toggle').click(async ev => {
      ev.preventDefault();
      const field = ev.currentTarget.dataset.field;
      if (!field) return;
      const current = foundry.utils.getProperty(this.item, field);
      await this.item.update({ [field]: !current });
    });

    // Current SP input — convert to ablation on change.
    // Shields write to system.shield.ablation; everything else writes to the
    // zone-keyed system.coverage.<key>.ablation.
    html.find('.sp-current-input').change(async ev => {
      const input = ev.currentTarget;
      const key = input.dataset.key;
      const maxSP = Number(input.dataset.max) || 0;
      const newCurrent = Math.max(0, Math.min(maxSP, Number(input.value) || 0));
      const ablation = maxSP - newCurrent;
      const path = key === "shield"
        ? "system.shield.ablation"
        : `system.coverage.${key}.ablation`;
      await this.item.update({ [path]: ablation });
    });

    // Effect-tab listeners (shared)
    bindEffectTabListeners(html, this.item, { isLocked: this._isLocked });

    // Weapon-tab listeners (shared) — safe to bind even when tab hidden
    bindWeaponTabListeners(html, this.item, { isLocked: this._isLocked });
  }

  /** @override */
  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this._isLocked) return;

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      return;
    }

    if (data.type !== "Item") return;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return;

    // Only skill items can be added (as Effect-tab bonuses).
    if (item.type !== "skill") {
      ui.notifications.warn(game.i18n.localize("CYBERPUNK.OnlySkillsCanBeAdded"));
      return;
    }
    await handleSkillDropForBonus(this.item, item);
  }
}
