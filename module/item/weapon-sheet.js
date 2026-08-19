import {
  availability, concealability, reliability,
  weaponTypes, getWeaponClasses,
  meleeDamageTypes, weaponEffects, ammoTypes,
  ordnanceTemplateTypes,
  getAttackSkillsForWeapon,
  getRangedClassesForSkill,
  resolveWeaponDiscriminator
} from "../lookups.js";
import { calibers as CALIBERS, getValidAmmoTypesForCaliber, getDamageForCaliber } from "../calibers.js";
import { CyberpunkItemSheetV2 } from "./item-sheet-base-v2.js";
import { localize } from "../utils.js";

/** Drug methods that can be delivered as a gas weapon payload. */
const GAS_DELIVERY_METHODS = new Set(["inhaled", "contact"]);

/**
 * Sensible defaults when the user switches weaponType.
 */
const DEFAULT_CLASS_BY_TYPE = {
  Martial:  "Melee",
  Ranged:   "Pistol",
  Exotic:   "Exotic",
  Ordnance: "Grenade",
  Ammo:     "Pistol"
};

/**
 * Weapon Item Sheet — single layout branched by weaponType.
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkWeaponSheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["weapon-sheet"],
    // Enables the drug drop slot on gas weapons (effect === "drug").
    // The slot itself carries `data-drop-target="weapon-drug"` and the
    // sheet's `_onDrop` validates method + writes `system.drugUuid`.
    dragDrop: [{ dropSelector: "[data-drop-target='weapon-drug']" }]
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/weapon-sheet.hbs" }
  };

  _resolveDiscriminator(sys) {
    return resolveWeaponDiscriminator(sys, DEFAULT_CLASS_BY_TYPE);
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);

    const d = this._resolveDiscriminator(ctx.system);
    const wt = d.weaponType;
    const wc = d.weaponClass;
    ctx.weaponType  = wt;
    ctx.weaponClass = wc;
    ctx.isMartial  = wt === "Martial";
    ctx.isRanged   = wt === "Ranged";
    ctx.isExotic   = wt === "Exotic";
    ctx.isOrdnance = wt === "Ordnance";
    ctx.isAmmo     = wt === "Ammo";
    ctx.showHeaderTriviaRows = !ctx.isAmmo;

    ctx.weaponTypeOptions = Object.entries(weaponTypes).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: wt === value
    }));
    ctx.selectedWeaponTypeLabel = game.i18n.localize(`CYBERPUNK.${weaponTypes[wt] || "WeaponTypeMartial"}`);

    const classEnum = getWeaponClasses(wt) || {};
    let classKeys = Object.keys(classEnum);
    if (wt === "Ranged") {
      const allowed = getRangedClassesForSkill(ctx.system.attackSkill);
      if (allowed.length) classKeys = allowed;
    }
    ctx.weaponClassOptions = classKeys.map(value => ({
      value,
      label: classEnum[value] ? game.i18n.localize(`CYBERPUNK.${classEnum[value]}`) : value,
      selected: wc === value
    }));
    ctx.selectedWeaponClassLabel = classEnum[wc]
      ? game.i18n.localize(`CYBERPUNK.${classEnum[wc]}`)
      : wc;

    ctx.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: ctx.system.availability === value
    }));
    const selectedAvail = availability[ctx.system.availability] || "Common";
    ctx.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

    if (!ctx.isAmmo) {
      ctx.concealabilityOptions = Object.entries(concealability).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: ctx.system.concealability === value
      }));
      const selectedConceal = concealability[ctx.system.concealability] || "ConcealPocket";
      ctx.selectedConcealabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedConceal}`);

      ctx.reliabilityOptions = Object.entries(reliability).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: ctx.system.reliability === value
      }));
      const selectedRel = reliability[ctx.system.reliability] || "Standard";
      ctx.selectedReliabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedRel}`);
    }

    if (!ctx.isAmmo) {
      const skillsList = getAttackSkillsForWeapon(wt, wc);
      const currentSkill = ctx.system.attackSkill || skillsList[0] || "";
      ctx.attackSkillOptions = skillsList.map(name => ({
        value: name,
        label: game.i18n.has(`CYBERPUNK.Skill${name}`)
          ? game.i18n.localize(`CYBERPUNK.Skill${name}`)
          : name,
        selected: currentSkill === name
      }));
      ctx.selectedAttackSkillLabel = currentSkill
        ? (game.i18n.has(`CYBERPUNK.Skill${currentSkill}`)
            ? game.i18n.localize(`CYBERPUNK.Skill${currentSkill}`)
            : currentSkill)
        : "";
    }

    if (ctx.isMartial) {
      ctx.damageTypeOptions = Object.entries(meleeDamageTypes).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: ctx.system.damageType === value
      }));
      const selectedDT = meleeDamageTypes[ctx.system.damageType] || "DmgBlunt";
      ctx.selectedDamageTypeLabel = game.i18n.localize(`CYBERPUNK.${selectedDT}`);
    }

    if (ctx.isMartial || ctx.isExotic || ctx.isOrdnance || ctx.isAmmo) {
      const effectKeys = Object.keys(weaponEffects);
      const currentEffect = ctx.system.effect || effectKeys[0];
      ctx.effectOptions = Object.entries(weaponEffects).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: currentEffect === value
      }));
      const selectedEff = weaponEffects[currentEffect] || weaponEffects[effectKeys[0]];
      ctx.selectedEffectLabel = game.i18n.localize(`CYBERPUNK.${selectedEff}`);
    }

    if (ctx.isExotic || ctx.isOrdnance || ctx.isAmmo) {
      const fallbackToCircle = !ctx.isExotic && !ctx.system.templateType;
      const baseOptions = Object.entries(ordnanceTemplateTypes).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: ctx.system.templateType === value || (fallbackToCircle && value === "circle")
      }));
      if (ctx.isExotic) {
        ctx.templateOptions = [
          { value: "", label: game.i18n.localize("CYBERPUNK.TemplateNone"), selected: !ctx.system.templateType },
          ...baseOptions
        ];
      } else {
        ctx.templateOptions = baseOptions;
      }
      const selKey = ordnanceTemplateTypes[ctx.system.templateType];
      ctx.selectedTemplateLabel = selKey
        ? game.i18n.localize(`CYBERPUNK.${selKey}`)
        : (ctx.isExotic ? game.i18n.localize("CYBERPUNK.TemplateNone") : game.i18n.localize("CYBERPUNK.TemplateCircle"));
      const tplKind = ctx.system.templateType || "circle";
      ctx.radiusLabel = (tplKind === "circle")
        ? game.i18n.localize("CYBERPUNK.RadiusM")
        : game.i18n.localize("CYBERPUNK.WidthM");
    }

    if (ctx.isRanged || ctx.isAmmo) {
      ctx.caliberOptions = Object.entries(CALIBERS).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: ctx.system.caliber === value
      }));
      const selCal = CALIBERS[ctx.system.caliber];
      ctx.selectedCaliberLabel = selCal ? game.i18n.localize(`CYBERPUNK.${selCal}`) : "";
    }

    ctx.showAmmoAoe = ctx.isAmmo && ctx.system.ammoType === "grenade";

    const calDmg = getDamageForCaliber(ctx.system.caliber);
    ctx.calibersDamage = calDmg;
    ctx.damageLocked = !!calDmg && (ctx.isRanged || (ctx.isAmmo && ctx.system.ammoType !== "grenade"));

    if (ctx.isAmmo) {
      const validTypes = new Set(getValidAmmoTypesForCaliber(ctx.system.caliber));
      ctx.ammoTypeOptions = Object.entries(ammoTypes)
        .filter(([slug]) => validTypes.has(slug))
        .map(([value, labelKey]) => ({
          value,
          label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
          selected: ctx.system.ammoType === value
        }));
      const selAT = ammoTypes[ctx.system.ammoType] || "AmmoStandard";
      ctx.selectedAmmoTypeLabel = game.i18n.localize(`CYBERPUNK.${selAT}`);
    }

    // Drug-effect slot — visible only when the weapon's effect is
    // "drug". Resolves the attached drug (if any) synchronously so we
    // can render name + icon in the drop area.
    ctx.isDrugEffect = ctx.system.effect === "drug";
    ctx.attachedDrug = null;
    if (ctx.isDrugEffect && ctx.system.drugUuid) {
        const doc = fromUuidSync(ctx.system.drugUuid);
        if (doc && doc.type === "drug") {
            ctx.attachedDrug = { uuid: doc.uuid, name: doc.name, img: doc.img };
        }
    }

    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (this._isLocked) return;

    const html = $(this.element);
    const item = this.document;

    html.find('select[name="system.weaponType"]').on('change', async ev => {
      const newType = ev.currentTarget.value;
      const updates = { "system.weaponType": newType };
      const defaultSkill = getAttackSkillsForWeapon(newType)[0] || "";
      updates["system.attackSkill"] = defaultSkill;
      if (newType === "Ranged") {
        const allowed = getRangedClassesForSkill(defaultSkill);
        updates["system.weaponClass"] = allowed[0] || "Pistol";
      } else {
        updates["system.weaponClass"] = DEFAULT_CLASS_BY_TYPE[newType] || "";
      }
      if (newType === "Ranged") {
        const dmg = getDamageForCaliber(item.system.caliber);
        if (dmg) updates["system.damage"] = dmg;
      }
      await item.update(updates);
    });

    html.find('select[name="system.weaponClass"]').on('change', async ev => {
      await item.update({ "system.weaponClass": ev.currentTarget.value });
    });

    html.find('select[name="system.attackSkill"]').on('change', async ev => {
      const newSkill = ev.currentTarget.value;
      const updates = { "system.attackSkill": newSkill };
      if (item.system.weaponType === "Ranged") {
        const allowed = getRangedClassesForSkill(newSkill);
        if (allowed.length && !allowed.includes(item.system.weaponClass)) {
          updates["system.weaponClass"] = allowed[0];
        }
      }
      await item.update(updates);
    });

    html.find('select[name="system.caliber"]').on('change', async ev => {
      const newCal = ev.currentTarget.value;
      const sys = item.system;
      const wt = sys.weaponType;
      const updates = { "system.caliber": newCal };
      const dmg = getDamageForCaliber(newCal);
      if (wt === "Ammo") {
        const valid = new Set(getValidAmmoTypesForCaliber(newCal));
        let nextAmmoType = sys.ammoType;
        if (!nextAmmoType || !valid.has(nextAmmoType)) {
          nextAmmoType = valid.has("standard") ? "standard" : [...valid][0] || "armorPiercing";
          updates["system.ammoType"] = nextAmmoType;
        }
        if (dmg && nextAmmoType !== "grenade") updates["system.damage"] = dmg;
        else if (dmg && nextAmmoType === "grenade" && !sys.damage) updates["system.damage"] = dmg;
      } else if (wt === "Ranged" && dmg) {
        updates["system.damage"] = dmg;
      }
      await item.update(updates);
    });

    html.find('select[name="system.ammoType"]').on('change', async ev => {
      if (item.system.weaponType !== "Ammo") return;
      const newAt = ev.currentTarget.value;
      const dmg = getDamageForCaliber(item.system.caliber);
      if (!dmg) return;
      const updates = { "system.ammoType": newAt };
      if (newAt !== "grenade") updates["system.damage"] = dmg;
      else if (!item.system.damage) updates["system.damage"] = dmg;
      await item.update(updates);
    });

    // Drug slot — remove button (unslot the drug) and open on click.
    html.find('.weapon-drug-slot-remove').on('click', async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      await item.update({ "system.drugUuid": "" });
    });
    html.find('.weapon-drug-slot.filled .weapon-drug-slot-open').on('click', async ev => {
      ev.preventDefault();
      const uuid = ev.currentTarget.dataset.uuid;
      const doc = uuid ? await fromUuid(uuid) : null;
      if (doc) doc.sheet.render(true);
    });
  }

  /**
   * Gas weapons accept a single drug via drag-drop. Only inhaled or
   * contact methods make sense as a gas payload — anything else is
   * rejected at drop time with a warning.
   */
  async _onDrop(event) {
    event.preventDefault();
    if (this._isLocked) return;

    let data;
    try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return; }
    if (data.type !== "Item") return;

    const dropped = await Item.implementation.fromDropData(data);
    if (!dropped || dropped.type !== "drug") {
      ui.notifications.warn(localize("DrugSlotOnlyGasWarning"));
      return;
    }
    const method = dropped.system?.methodTaken;
    if (!GAS_DELIVERY_METHODS.has(method)) {
      ui.notifications.warn(localize("DrugSlotOnlyGasWarning"));
      return;
    }
    await this.document.update({ "system.drugUuid": dropped.uuid });
  }
}
