import {
  availability,
  netwareTypes, programSubtypes,
  boosterBonuses, defenderDefences,
  attackerClasses, attackerEffects,
  upgradeEffects
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
    ctx.isBlackIceProgram = ctx.isProgram && subtype === "blackIce";
    ctx.isArmorDefence = ctx.isDefender && (sys.defenderDefence || "armor") === "armor";

    // Resolve the linked Black ICE actor (when set) so the sheet can
    // mirror its current REZ / Damage / Class / Effect as display-only
    // fields. fromUuidSync is sync-safe on world docs and returns null
    // for stale or cross-pack references.
    if (ctx.isBlackIceProgram) {
      const link = sys.actorLink || "";
      const linked = link ? (fromUuidSync?.(link) ?? null) : null;
      const isBlackIceActor = linked?.documentName === "Actor"
                           && linked?.type === "netware"
                           && linked?.system?.subtype === "blackIce";
      ctx.linkedBlackIce = isBlackIceActor ? linked : null;
      ctx.hasLinkedBlackIce = !!ctx.linkedBlackIce;
      if (ctx.hasLinkedBlackIce) {
        const a = ctx.linkedBlackIce;
        ctx.linkedRez    = Number(a.system?.rez) || 0;
        ctx.linkedDamage = a.system?.attackerDamage || "";
        ctx.linkedAtk    = Number(a.system?.atk) || 0;
        const aCls       = a.system?.attackerClass || "antiProgram";
        ctx.linkedClassLabel  = game.i18n.localize(`CYBERPUNK.${attackerClasses[aCls] ?? "AttackerAntiProgram"}`);
        const aEff       = a.system?.attackerEffect || "none";
        ctx.linkedEffectLabel = (aEff && aEff !== "none")
          ? game.i18n.localize(`CYBERPUNK.${attackerEffects[aEff] ?? "EffectNone"}`)
          : "";
      }
    }

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

      // Effect dropdown filtered by attacker class:
      //   - "crashed"   only on Anti-Personnel (forces target jack-out)
      //   - "destroyed" only on Anti-Program  (REZ→0 destroys instead of derezzes)
      // The already-saved value is included regardless so the dropdown
      // never renders the field blank after a class switch.
      const effect = sys.attackerEffect || "none";
      const allowEffect = (key) => {
        if (key === "crashed")   return cls === "antiPersonnel" || effect === key;
        if (key === "destroyed") return cls === "antiProgram"   || effect === key;
        return true;
      };
      ctx.attackerEffectOptions = Object.entries(attackerEffects)
        .filter(([value]) => allowEffect(value))
        .map(([value, labelKey]) => ({
          value,
          label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
          selected: effect === value
        }));
      const selectedEffKey = attackerEffects[effect] || "EffectNone";
      ctx.selectedAttackerEffectLabel = game.i18n.localize(`CYBERPUNK.${selectedEffKey}`);
    }

    if (ctx.isUpgrade) {
      const upgEffect = sys.upgradeEffect || "none";
      ctx.upgradeEffectOptions = Object.entries(upgradeEffects).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: upgEffect === value
      }));
      const selectedUpgKey = upgradeEffects[upgEffect] || "UpgradeNone";
      ctx.selectedUpgradeEffectLabel = game.i18n.localize(`CYBERPUNK.${selectedUpgKey}`);
      // Range upgrade gets a second numeric field (metres added to Scanner range).
      ctx.isRangeUpgrade = upgEffect === "range";
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

    // Actor Link drop zone — accepts a Black ICE actor dragged from the
    // sidebar (NOT from the scene; we only honour world-doc UUIDs). Scene
    // tokens carry "Scene.<id>.Token.<id>.Actor.<id>" UUIDs and would
    // break next time the scene token is removed, so we reject them.
    const linkInput = this.element.querySelector('input[name="system.actorLink"]');
    if (linkInput) {
      linkInput.addEventListener("dragover", ev => ev.preventDefault());
      linkInput.addEventListener("drop", async ev => {
        ev.preventDefault();
        let payload;
        try { payload = JSON.parse(ev.dataTransfer.getData("text/plain")); }
        catch { return; }
        if (payload?.type !== "Actor" || !payload?.uuid) {
          ui.notifications.warn(game.i18n.localize("CYBERPUNK.BlackIceProgramActorNotBlackIce"));
          return;
        }
        // Reject scene-token UUIDs — only world docs are valid.
        if (payload.uuid.includes(".Token.")) {
          ui.notifications.warn(game.i18n.localize("CYBERPUNK.BlackIceProgramActorNotBlackIce"));
          return;
        }
        const doc = await fromUuid(payload.uuid);
        const isBlackIceActor = doc?.type === "netware"
                             && doc?.system?.subtype === "blackIce";
        if (!isBlackIceActor) {
          ui.notifications.warn(game.i18n.localize("CYBERPUNK.BlackIceProgramActorNotBlackIce"));
          return;
        }
        await item.update({ "system.actorLink": payload.uuid });
      });
    }
  }
}
