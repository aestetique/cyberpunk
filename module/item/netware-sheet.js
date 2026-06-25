import {
  availability,
  netwareTypes, programSubtypes,
  boosterBonuses, defenderDefences,
  attackerClasses, attackerEffects
} from "../lookups.js";
import { CyberpunkItemSheetV2 } from "./item-sheet-base-v2.js";

/**
 * Netware Item Sheet with conditional fields.
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkNetwareSheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["netware-sheet"]
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/netware-sheet.hbs" }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);

    const sys = ctx.system;
    const nType = sys.netwareType || "program";

    ctx.isCyberdeck = nType === "cyberdeck";
    ctx.isUpgrade = nType === "upgrade";
    ctx.isProgram = nType === "program";

    const subtype = sys.programSubtype || "booster";
    ctx.isBooster = ctx.isProgram && subtype === "booster";
    ctx.isDefender = ctx.isProgram && subtype === "defender";
    ctx.isAttacker = ctx.isProgram && subtype === "attacker";
    ctx.isArmorDefence = ctx.isDefender && (sys.defenderDefence || "armor") === "armor";

    ctx.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: sys.availability === value
    }));
    const selectedAvail = availability[sys.availability] || "Common";
    ctx.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

    ctx.netwareTypeOptions = Object.entries(netwareTypes).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: nType === value
    }));
    const selectedTypeKey = netwareTypes[nType] || "NetwareTypeProgram";
    ctx.selectedNetwareTypeLabel = game.i18n.localize(`CYBERPUNK.${selectedTypeKey}`);

    if (ctx.isProgram) {
      ctx.programSubtypeOptions = Object.entries(programSubtypes).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: subtype === value
      }));
      const selectedSubKey = programSubtypes[subtype] || "ProgramSubBooster";
      ctx.selectedProgramSubtypeLabel = game.i18n.localize(`CYBERPUNK.${selectedSubKey}`);
    }

    if (ctx.isBooster) {
      const bonus = sys.boosterBonus || "scanner";
      ctx.boosterBonusOptions = Object.entries(boosterBonuses).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: bonus === value
      }));
      const selectedBonusKey = boosterBonuses[bonus] || "BoosterScanner";
      ctx.selectedBoosterBonusLabel = game.i18n.localize(`CYBERPUNK.${selectedBonusKey}`);
    }

    if (ctx.isDefender) {
      const defence = sys.defenderDefence || "armor";
      ctx.defenderDefenceOptions = Object.entries(defenderDefences).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: defence === value
      }));
      const selectedDefKey = defenderDefences[defence] || "DefenderArmor";
      ctx.selectedDefenderDefenceLabel = game.i18n.localize(`CYBERPUNK.${selectedDefKey}`);
    }

    if (ctx.isAttacker) {
      const cls = sys.attackerClass || "antiProgram";
      ctx.attackerClassOptions = Object.entries(attackerClasses).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: cls === value
      }));
      const selectedClsKey = attackerClasses[cls] || "AttackerAntiProgram";
      ctx.selectedAttackerClassLabel = game.i18n.localize(`CYBERPUNK.${selectedClsKey}`);

      const effect = sys.attackerEffect || "none";
      ctx.attackerEffectOptions = Object.entries(attackerEffects).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: effect === value
      }));
      const selectedEffKey = attackerEffects[effect] || "EffectNone";
      ctx.selectedAttackerEffectLabel = game.i18n.localize(`CYBERPUNK.${selectedEffKey}`);
    }

    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._isLocked) return;

    const html = $(this.element);
    const item = this.document;

    html.find('select[name="system.netwareType"]').on('change', async ev => {
      const newType = ev.currentTarget.value;
      const updates = { "system.netwareType": newType };
      if (newType !== "program") updates["system.programSubtype"] = "booster";
      await item.update(updates);
    });

    html.find('select[name="system.programSubtype"]').on('change', async ev => {
      await item.update({ "system.programSubtype": ev.currentTarget.value });
    });
  }
}
