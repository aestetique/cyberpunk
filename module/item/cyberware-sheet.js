import {
  availability,
  cyberwareTypes, surgeryCodes, placementOptions,
  getCyberwareSubtypes, canHaveOptions, canBeWeapon, canBeArmor,
  isPlacementRequired,
  isCyberlimbBase, isCyberlimbOption,
  isSensorBase, isSensorOption,
  SENSOR_TYPES
} from "../lookups.js";
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
 * Cyberware Item Sheet with conditional tabs (weapon/armor).
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkCyberwareSheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["cyberware-sheet"],
    dragDrop: [{ dropSelector: "[data-drop-target]" }],
    actions: {
      rollHumanity:  CyberpunkCyberwareSheet._onRollHumanity,
      resetHumanity: CyberpunkCyberwareSheet._onResetHumanity
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/cyberware-sheet.hbs" }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const sys = ctx.system;
    const cyberType = sys.cyberwareType || "implant";
    const cyberSubtype = sys.cyberwareSubtype || "";

    ctx.cyberwareType = cyberType;
    ctx.cyberwareSubtype = cyberSubtype;
    ctx.isCyberlimb = cyberType === "cyberlimb";
    ctx.isSensor = SENSOR_TYPES.has(cyberType);
    ctx.isImplant = cyberType === "implant";
    ctx.isChipware = cyberType === "chipware";
    ctx.isSkillChip = cyberType === "chipware" && cyberSubtype === "skill";

    ctx.isCyberlimbBase   = isCyberlimbBase(this.document);
    ctx.isCyberlimbOption = isCyberlimbOption(this.document);
    ctx.isSensorBase      = isSensorBase(this.document);
    ctx.isSensorOption    = isSensorOption(this.document);
    ctx.isBase            = ctx.isCyberlimbBase || ctx.isSensorBase;
    ctx.isOption          = ctx.isCyberlimbOption || ctx.isSensorOption;

    // EMP Shielding only renders on cyberlimb built-ins, optics options, audio options
    // — these protect their parent from the matching microwave roll result.
    ctx.canEmpShield = (cyberType === "cyberlimb" && cyberSubtype === "builtIn")
                    || (cyberType === "optics"    && cyberSubtype === "option")
                    || (cyberType === "audio"     && cyberSubtype === "option");


    ctx.canHaveOptions = canHaveOptions(cyberType, cyberSubtype);
    ctx.needsPlacement = isPlacementRequired(cyberType, cyberSubtype);
    ctx.showStructure  = ctx.isCyberlimbBase;
    ctx.showSdpBonus   = ctx.isCyberlimbOption;
    ctx.showHasSlots   = ctx.isBase;
    ctx.showTakesSpace = ctx.isOption;

    if (ctx.showStructure && this.document.actor) {
      const baseMax = sys.structure?.max ?? 0;
      const baseDisablesAt = sys.disablesAt ?? 0;
      const attachedOptions = this.document.actor.items.filter(i =>
        isCyberlimbOption(i) && i.getFlag("cyberpunk", "attachedTo") === this.document.id
      );
      const sdpBonusTotal = attachedOptions.reduce((sum, opt) => sum + (opt.system.sdpBonus || 0), 0);
      ctx.sdpBonusTotal = sdpBonusTotal;
      ctx.effectiveMaxStructure = baseMax + sdpBonusTotal;
      ctx.effectiveDisablesAt = baseDisablesAt + sdpBonusTotal;
      ctx.hasBonus = sdpBonusTotal > 0;
    } else {
      ctx.sdpBonusTotal = 0;
      ctx.effectiveMaxStructure = sys.structure?.max ?? 0;
      ctx.effectiveDisablesAt = sys.disablesAt ?? 0;
      ctx.hasBonus = false;
    }

    ctx.canBeWeapon = canBeWeapon(cyberType, cyberSubtype);
    ctx.canBeArmor = canBeArmor(cyberType, cyberSubtype);
    ctx.isWeapon = sys.isWeapon && ctx.canBeWeapon;
    ctx.isArmor = sys.isArmor && ctx.canBeArmor;

    ctx.showWeaponTab = ctx.isWeapon;
    ctx.showArmorTab = ctx.isArmor;

    if (this._activeTab === "weapon" && !ctx.showWeaponTab) {
      this._activeTab = "description";
      ctx.activeTab = "description";
    }
    if (this._activeTab === "armor" && !ctx.showArmorTab) {
      this._activeTab = "description";
      ctx.activeTab = "description";
    }

    ctx.humanityRolled = sys.humanityRolled || false;
    ctx.canRollHumanity = !ctx.humanityRolled && sys.humanityCost;

    ctx.cyberwareTypeOptions = Object.entries(cyberwareTypes).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: cyberType === value
    }));
    const selectedTypeKey = cyberwareTypes[cyberType] || "CyberTypeImplant";
    ctx.selectedTypeLabel = game.i18n.localize(`CYBERPUNK.${selectedTypeKey}`);

    const subtypes = getCyberwareSubtypes(cyberType);
    ctx.cyberwareSubtypeOptions = Object.entries(subtypes).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: sys.cyberwareSubtype === value
    }));
    const selectedSubKey = subtypes[sys.cyberwareSubtype];
    ctx.selectedSubtypeLabel = selectedSubKey ? game.i18n.localize(`CYBERPUNK.${selectedSubKey}`) : "";

    if (ctx.needsPlacement) {
      ctx.placementOptions = Object.entries(placementOptions).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: sys.placement === value
      }));
      const selectedPlacementKey = placementOptions[sys.placement];
      ctx.selectedPlacementLabel = selectedPlacementKey
        ? game.i18n.localize(`CYBERPUNK.${selectedPlacementKey}`)
        : "";
    }

    ctx.surgeryCodeOptions = Object.entries(surgeryCodes).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: sys.surgeryCode === value
    }));
    const selectedSurgKey = surgeryCodes[sys.surgeryCode] || "SurgNegligible";
    ctx.selectedSurgeryLabel = game.i18n.localize(`CYBERPUNK.${selectedSurgKey}`);

    ctx.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: sys.availability === value
    }));
    const selectedAvail = availability[sys.availability] || "Common";
    ctx.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

    prepareEffectTabContext(ctx, sys.bonuses);
    if (ctx.showWeaponTab) prepareWeaponTabContext(ctx, sys.weapon);
    if (ctx.showArmorTab) this._prepareArmorData(ctx);

    return ctx;
  }

  _prepareArmorData(ctx) {
    const armor = ctx.system.armor || {};

    ctx.armorTypeOptions = [
      { value: "soft", label: game.i18n.localize("CYBERPUNK.SoftArmor"), selected: armor.armorType === "soft" },
      { value: "hard", label: game.i18n.localize("CYBERPUNK.HardArmor"), selected: armor.armorType === "hard" }
    ];
    ctx.selectedArmorTypeLabel = armor.armorType === "hard"
      ? game.i18n.localize("CYBERPUNK.HardArmor")
      : game.i18n.localize("CYBERPUNK.SoftArmor");

    const locationOrder = [
      { key: "lArm", label: localize("lArm") },
      { key: "Head", label: localize("Head") },
      { key: "rArm", label: localize("rArm") },
      { key: "lLeg", label: localize("lLeg") },
      { key: "Torso", label: localize("Torso") },
      { key: "rLeg", label: localize("rLeg") }
    ];

    const coverage = armor.coverage || {};
    ctx.coverageRows = [
      locationOrder.slice(0, 3),
      locationOrder.slice(3, 6)
    ].map(row => row.map(loc => {
      const cov = coverage[loc.key] || { stoppingPower: 0, ablation: 0 };
      const maxSP = Number(cov.stoppingPower) || 0;
      const ablation = Number(cov.ablation) || 0;
      const currentSP = Math.max(0, maxSP - ablation);
      return { key: loc.key, label: loc.label, currentSP, maxSP, isDamaged: currentSP < maxSP };
    }));
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = $(this.element);
    const item = this.document;

    if (this._isLocked) return;

    html.find('select[name="system.cyberwareType"]').on('change', async ev => {
      const newType = ev.currentTarget.value;
      const subtypes = getCyberwareSubtypes(newType);
      const firstSubtype = Object.keys(subtypes)[0] || "";
      await item.update({
        "system.cyberwareType":    newType,
        "system.cyberwareSubtype": firstSubtype,
        "system.placement":        isPlacementRequired(newType, firstSubtype) ? "left" : "",
        "system.isOption":         false,
        "system.isWeapon":         false,
        "system.isArmor":          false
      });
    });

    html.find('select[name="system.cyberwareSubtype"]').on('change', async ev => {
      const newSubtype = ev.currentTarget.value;
      const cyberType = item.system.cyberwareType;
      const update = { "system.cyberwareSubtype": newSubtype };
      if (isPlacementRequired(cyberType, newSubtype)) {
        if (!item.system.placement) update["system.placement"] = "left";
      } else {
        update["system.placement"] = "";
      }
      if (!canBeWeapon(cyberType, newSubtype) && item.system.isWeapon) {
        update["system.isWeapon"] = false;
      }
      await item.update(update);
    });

    html.find('.sp-current-input').on('change', async ev => {
      const input = ev.currentTarget;
      const key = input.dataset.key;
      const maxSP = Number(input.dataset.max) || 0;
      const newCurrent = Math.max(0, Math.min(maxSP, Number(input.value) || 0));
      const ablation = maxSP - newCurrent;
      await item.update({ [`system.armor.coverage.${key}.ablation`]: ablation });
    });

    bindEffectTabListeners(html, item, { isLocked: this._isLocked });
    bindWeaponTabListeners(html, item, { isLocked: this._isLocked });
  }

  static async _onRollHumanity(event, _target) {
    event?.preventDefault?.();
    const formula = this.document.system.humanityCost;
    if (!formula || this.document.system.humanityRolled) return;

    const roll = new Roll(formula);
    await roll.evaluate();

    const { processFormulaRoll } = await import("../dice.js");
    const templateData = processFormulaRoll(roll);
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/cyberpunk/templates/chat/humanity-roll.hbs",
      templateData
    );
    const speaker = this.document.actor
      ? ChatMessage.getSpeaker({ actor: this.document.actor })
      : ChatMessage.getSpeaker();
    await ChatMessage.create({
      speaker,
      content,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    });

    await this.document.update({
      "system.humanityLoss": roll.total,
      "system.humanityRolled": true
    });
  }

  static async _onResetHumanity(event, _target) {
    event?.preventDefault?.();
    await this.document.update({
      "system.humanityLoss": 0,
      "system.humanityRolled": false
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
    await handleSkillDropForBonus(this.document, item);
  }
}
