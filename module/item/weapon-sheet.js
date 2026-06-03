import {
    availability, concealability, reliability,
    weaponTypes, getWeaponClasses,
    rangedClasses, martialClasses, ordnanceClasses, exoticClasses, ammoClasses,
    meleeDamageTypes, exoticEffects, ammoTypes,
    ordnanceTemplateTypes,
    getAttackSkillsForWeapon,
    getRangedClassesForSkill
} from "../lookups.js";
import { calibers as CALIBERS, getValidAmmoTypesForCaliber, getDamageForCaliber } from "../calibers.js";
import { CyberpunkItemSheet } from "./item-sheet-base.js";

// Legacy weaponType strings (pre-overhaul) → new discriminator + class.
const LEGACY_TYPE = {
    Pistol:   { weaponType: "Ranged",   weaponClass: "Pistol" },
    SMG:      { weaponType: "Ranged",   weaponClass: "SMG" },
    Shotgun:  { weaponType: "Ranged",   weaponClass: "Shotgun" },
    Rifle:    { weaponType: "Ranged",   weaponClass: "Rifle" },
    Heavy:    { weaponType: "Ranged",   weaponClass: "Heavy" },
    Bow:      { weaponType: "Martial",  weaponClass: "Bow" },
    Crossbow: { weaponType: "Martial",  weaponClass: "Crossbow" },
    Melee:    { weaponType: "Martial",  weaponClass: "Melee" },
    Exotic:   { weaponType: "Exotic",   weaponClass: "Exotic" }
};

/**
 * Sensible defaults for the dynamic fields when the user switches weaponType.
 */
const DEFAULT_CLASS_BY_TYPE = {
    Martial:  "Melee",
    Ranged:   "Pistol",
    Exotic:   "Exotic",
    Ordnance: "Grenade",
    Ammo:     "Pistol"
};

/**
 * Weapon Item Sheet with a single layout that branches by weaponType.
 * @extends {CyberpunkItemSheet}
 */
export class CyberpunkWeaponSheet extends CyberpunkItemSheet {

    /** @type {string} */
    _activeTab = "description";

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["cyberpunk", "sheet", "item", "weapon-sheet"],
            template: "systems/cyberpunk/templates/item/weapon-sheet.hbs"
        });
    }

    /** Normalise weaponType + weaponClass, falling through legacy values. */
    _resolveDiscriminator(sys) {
        const raw = sys.weaponType || "Martial";
        if (LEGACY_TYPE[raw]) {
            return {
                weaponType: LEGACY_TYPE[raw].weaponType,
                weaponClass: sys.weaponClass || LEGACY_TYPE[raw].weaponClass
            };
        }
        return { weaponType: raw, weaponClass: sys.weaponClass || DEFAULT_CLASS_BY_TYPE[raw] || "" };
    }

    /** @override */
    getData() {
        const data = super.getData();
        data.activeTab = this._activeTab;

        const d = this._resolveDiscriminator(data.system);
        const wt = d.weaponType;
        const wc = d.weaponClass;
        data.weaponType  = wt;
        data.weaponClass = wc;
        data.isMartial  = wt === "Martial";
        data.isRanged   = wt === "Ranged";
        data.isExotic   = wt === "Exotic";
        data.isOrdnance = wt === "Ordnance";
        data.isAmmo     = wt === "Ammo";
        data.showHeaderTriviaRows = !data.isAmmo;

        // ----- WeaponType (discriminator) dropdown -----
        data.weaponTypeOptions = Object.entries(weaponTypes).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: wt === value
        }));
        data.selectedWeaponTypeLabel = game.i18n.localize(`CYBERPUNK.${weaponTypes[wt] || "WeaponTypeMartial"}`);

        // ----- WeaponClass (Subtype) dropdown -----
        // For Ranged: the available options are narrowed by the selected attack
        // skill (Handgun → Pistol; Rifle → AssaultRifle/SniperRifle/Shotgun; etc).
        // For other types: full class enum is still offered (sheets that hide the
        // dropdown — Martial/Exotic/Ordnance — simply ignore this).
        const classEnum = getWeaponClasses(wt) || {};
        let classKeys = Object.keys(classEnum);
        if (wt === "Ranged") {
            const allowed = getRangedClassesForSkill(data.system.attackSkill);
            if (allowed.length) classKeys = allowed;
        }
        data.weaponClassOptions = classKeys.map(value => ({
            value,
            label: classEnum[value] ? game.i18n.localize(`CYBERPUNK.${classEnum[value]}`) : value,
            selected: wc === value
        }));
        data.selectedWeaponClassLabel = classEnum[wc]
            ? game.i18n.localize(`CYBERPUNK.${classEnum[wc]}`)
            : wc;

        // ----- Availability -----
        data.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: data.system.availability === value
        }));
        const selectedAvail = availability[data.system.availability] || "Common";
        data.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

        // ----- Concealability (non-Ammo) -----
        data.concealabilityOptions = Object.entries(concealability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: data.system.concealability === value
        }));
        const selectedConceal = concealability[data.system.concealability] || "ConcealPocket";
        data.selectedConcealabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedConceal}`);

        // ----- Reliability (non-Ammo) -----
        data.reliabilityOptions = Object.entries(reliability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: data.system.reliability === value
        }));
        const selectedRel = reliability[data.system.reliability] || "Standard";
        data.selectedReliabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedRel}`);

        // ----- Attack Skill (non-Ammo) -----
        if (!data.isAmmo) {
            const skillsList = getAttackSkillsForWeapon(wt, wc);
            const currentSkill = data.system.attackSkill || skillsList[0] || "";
            data.attackSkillOptions = skillsList.map(name => ({
                value: name,
                label: game.i18n.has(`CYBERPUNK.Skill${name}`)
                    ? game.i18n.localize(`CYBERPUNK.Skill${name}`)
                    : name,
                selected: currentSkill === name
            }));
            data.selectedAttackSkillLabel = currentSkill
                ? (game.i18n.has(`CYBERPUNK.Skill${currentSkill}`)
                    ? game.i18n.localize(`CYBERPUNK.Skill${currentSkill}`)
                    : currentSkill)
                : "";
        }

        // ----- Damage Type (Martial only) -----
        if (data.isMartial) {
            data.damageTypeOptions = Object.entries(meleeDamageTypes).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: data.system.damageType === value
            }));
            const selectedDT = meleeDamageTypes[data.system.damageType] || "DmgBlunt";
            data.selectedDamageTypeLabel = game.i18n.localize(`CYBERPUNK.${selectedDT}`);
        }

        // ----- Effect (Martial / Exotic / Ordnance / Ammo) -----
        if (data.isMartial || data.isExotic || data.isOrdnance || data.isAmmo) {
            const effectKeys = Object.keys(exoticEffects);
            const currentEffect = data.system.effect || effectKeys[0];
            data.effectOptions = Object.entries(exoticEffects).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: currentEffect === value
            }));
            const selectedEff = exoticEffects[currentEffect] || exoticEffects[effectKeys[0]];
            data.selectedEffectLabel = game.i18n.localize(`CYBERPUNK.${selectedEff}`);
        }

        // ----- Template (Exotic / Ordnance / Ammo) -----
        if (data.isExotic || data.isOrdnance || data.isAmmo) {
            // Exotic alone supports "None" — that flips it from AoE back to a
            // standard fire-mode weapon. Ordnance and grenade Ammo always have
            // a template shape.
            // For non-Exotic (Ordnance / grenade Ammo) the shape list has no
            // "None" entry, so an empty templateType would leave the <select>
            // with no selected option — the browser would visually highlight
            // "Circle" while the underlying data stays "". Fall back to
            // selecting "circle" in that case, matching the runtime default
            // used in ordnance-attack-dialog.js.
            const fallbackToCircle = !data.isExotic && !data.system.templateType;
            const baseOptions = Object.entries(ordnanceTemplateTypes).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: data.system.templateType === value || (fallbackToCircle && value === "circle")
            }));
            if (data.isExotic) {
                data.templateOptions = [
                    {
                        value: "",
                        label: game.i18n.localize("CYBERPUNK.TemplateNone"),
                        selected: !data.system.templateType
                    },
                    ...baseOptions
                ];
            } else {
                data.templateOptions = baseOptions;
            }
            const selKey = ordnanceTemplateTypes[data.system.templateType];
            data.selectedTemplateLabel = selKey
                ? game.i18n.localize(`CYBERPUNK.${selKey}`)
                : (data.isExotic ? game.i18n.localize("CYBERPUNK.TemplateNone") : game.i18n.localize("CYBERPUNK.TemplateCircle"));
            // Label switches with templateType: Radius, m for circles; Width, m for cones/beams.
            const tplKind = data.system.templateType || "circle";
            data.radiusLabel = (tplKind === "circle")
                ? game.i18n.localize("CYBERPUNK.RadiusM")
                : game.i18n.localize("CYBERPUNK.WidthM");
        }

        // ----- Caliber (Ranged + Ammo) -----
        // Both cards show the full caliber set. Compatibility is enforced at attach time
        // by exact caliber match (see isAmmoCompatibleWith in lookups.js).
        if (data.isRanged || data.isAmmo) {
            data.caliberOptions = Object.entries(CALIBERS).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: data.system.caliber === value
            }));
            const selCal = CALIBERS[data.system.caliber];
            data.selectedCaliberLabel = selCal ? game.i18n.localize(`CYBERPUNK.${selCal}`) : "";
        }

        // ----- Ammo AoE rows visible only when ammoType is Grenade -----
        data.showAmmoAoe = data.isAmmo && data.system.ammoType === "grenade";

        // ----- Damage locking by caliber -----
        // Ranged weapons: damage is always the caliber's damage (locked, no override).
        // Ammo (non-grenade): damage is the caliber's damage (locked, no override).
        // Ammo (grenade): damage is pre-filled with the caliber's damage but editable —
        //                 grenade payloads can carry effect-specific damage.
        // Unknown caliber → fall back to whatever's stored (no lock, no prefill).
        const calDmg = getDamageForCaliber(data.system.caliber);
        data.calibersDamage = calDmg;
        data.damageLocked = !!calDmg && (data.isRanged || (data.isAmmo && data.system.ammoType !== "grenade"));

        // ----- Ammo Type (Ammo only) — filtered to those valid for the caliber -----
        if (data.isAmmo) {
            const validTypes = new Set(getValidAmmoTypesForCaliber(data.system.caliber));
            data.ammoTypeOptions = Object.entries(ammoTypes)
                .filter(([slug]) => validTypes.has(slug))
                .map(([value, labelKey]) => ({
                    value,
                    label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                    selected: data.system.ammoType === value
                }));
            const selAT = ammoTypes[data.system.ammoType] || "AmmoStandard";
            data.selectedAmmoTypeLabel = game.i18n.localize(`CYBERPUNK.${selAT}`);
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

        if (this._isLocked) return;

        // WeaponType change → reset weaponClass + clear attackSkill (so the
        // sheet picks the new type's first canonical skill on next render).
        html.find('select[name="system.weaponType"]').change(async ev => {
            const newType = ev.currentTarget.value;
            const updates = { "system.weaponType": newType };
            // Pick a sensible default skill so the Ranged class dropdown isn't empty.
            const defaultSkill = getAttackSkillsForWeapon(newType)[0] || "";
            updates["system.attackSkill"] = defaultSkill;
            // For Ranged: default class is the first allowed by the default skill.
            // For other types: keep the type's default class (ignored by sheets
            // that don't render the dropdown).
            if (newType === "Ranged") {
                const allowed = getRangedClassesForSkill(defaultSkill);
                updates["system.weaponClass"] = allowed[0] || "Pistol";
            } else {
                updates["system.weaponClass"] = DEFAULT_CLASS_BY_TYPE[newType] || "";
            }
            // Switching INTO Ranged stamps the caliber's damage (if any).
            if (newType === "Ranged") {
                const dmg = getDamageForCaliber(this.item.system.caliber);
                if (dmg) updates["system.damage"] = dmg;
            }
            await this.item.update(updates);
        });

        // weaponClass (Subtype) change — just write the new class; skill stays.
        html.find('select[name="system.weaponClass"]').change(async ev => {
            await this.item.update({ "system.weaponClass": ev.currentTarget.value });
        });

        // attackSkill change — for Ranged, narrow the weaponClass to the new
        // skill's allowed set. If the current class is no longer valid, reset to
        // the first allowed.
        html.find('select[name="system.attackSkill"]').change(async ev => {
            const newSkill = ev.currentTarget.value;
            const updates = { "system.attackSkill": newSkill };
            if (this.item.system.weaponType === "Ranged") {
                const allowed = getRangedClassesForSkill(newSkill);
                if (allowed.length && !allowed.includes(this.item.system.weaponClass)) {
                    updates["system.weaponClass"] = allowed[0];
                }
            }
            await this.item.update(updates);
        });

        // Caliber change — keep ammoType valid (Ammo) and re-stamp the
        // locked damage from the new caliber (Ranged + non-grenade Ammo).
        html.find('select[name="system.caliber"]').change(async ev => {
            const newCal = ev.currentTarget.value;
            const sys = this.item.system;
            const wt = sys.weaponType;
            const updates = { "system.caliber": newCal };
            const dmg = getDamageForCaliber(newCal);
            if (wt === "Ammo") {
                const valid = new Set(getValidAmmoTypesForCaliber(newCal));
                let nextAmmoType = sys.ammoType;
                if (!nextAmmoType || !valid.has(nextAmmoType)) {
                    nextAmmoType = valid.has("standard")
                        ? "standard"
                        : [...valid][0] || "armorPiercing";
                    updates["system.ammoType"] = nextAmmoType;
                }
                if (dmg && nextAmmoType !== "grenade") updates["system.damage"] = dmg;
                else if (dmg && nextAmmoType === "grenade" && !sys.damage) updates["system.damage"] = dmg;
            } else if (wt === "Ranged" && dmg) {
                updates["system.damage"] = dmg;
            }
            await this.item.update(updates);
        });

        // AmmoType change — re-lock damage when moving back into a non-grenade mode.
        html.find('select[name="system.ammoType"]').change(async ev => {
            if (this.item.system.weaponType !== "Ammo") return;
            const newAt = ev.currentTarget.value;
            const dmg = getDamageForCaliber(this.item.system.caliber);
            if (!dmg) return;
            const updates = { "system.ammoType": newAt };
            if (newAt !== "grenade") updates["system.damage"] = dmg;
            else if (!this.item.system.damage) updates["system.damage"] = dmg;
            await this.item.update(updates);
        });
    }
}
