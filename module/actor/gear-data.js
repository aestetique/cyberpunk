import {
    reliability,
    concealability,
    meleeDamageTypes,
    weaponEffects,
    ammoTypes,
    ammoAbbreviations,
    ammoClasses,
    martialClasses,
    rangedClasses,
    exoticClasses,
    ordnanceClasses,
    ordnanceTemplateTypes,
    getWeaponClasses,
    getMartialSubtypeLabelKey,
    getOrdnanceSubtypeLabelKey,
    resolveWeaponDiscriminator,
    toolBonusProperties,
    surgeryCodes,
    getCyberwareSubtypes,
    programSubtypes,
    boosterBonuses,
    defenderDefences,
    attackerClasses,
    attackerEffects
} from "../lookups.js";
import { calibers as CALIBERS } from "../calibers.js";
import { COVER_TYPES } from "../conditions.js";

const discrim = (sys) => resolveWeaponDiscriminator(sys);

/**
 * Build the cover-row toggle data for a sheet.
 */
export function buildCoverToggles(actor, { exclude = [] } = {}) {
    const activeCover = actor?.system?.activeCover || null;
    return Object.entries(COVER_TYPES)
        .filter(([key]) => !exclude.includes(key))
        .map(([key, { sp, label, desc }]) => ({
            key,
            sp,
            label,
            desc,
            active: activeCover === key
        }));
}

function getLoadedAmmoLabel(ammoType) {
    if (!ammoType) return '';
    return ammoAbbreviations[ammoType] || '';
}

function localizeKey(key) {
    if (!key) return '';
    return game.i18n.localize(`CYBERPUNK.${key}`);
}

/**
 * Build the context-line subtext for a weapon row (gear tab). Shared between
 * regular weapons (gear-data.js#buildWeaponsList) and cyberware embedded
 * weapons (actor-sheet.js cyberweaponsList builder). The two callers used to
 * each carry their own near-identical version of this assembly.
 *
 * Inputs:
 *   sys           — the weapon's system block (already discriminator-resolved)
 *   wType, wClass — outputs of resolveWeaponDiscriminator(sys)
 *   attachedAmmo  — the live Ammo Item (or null)
 *
 * Returns a `·`-joined string. Output is identical to the prior inline code.
 */
export function buildWeaponContextString({ sys, wType, wClass, attachedAmmo }) {
    const rel  = sys.reliability && reliability[sys.reliability] ? localizeKey(reliability[sys.reliability]) : '';
    const conc = sys.concealability && concealability[sys.concealability] ? localizeKey(concealability[sys.concealability]) : '';
    const range = sys.range ? `${sys.range} m` : '';

    if (wType === "Ranged") {
        const classKey = rangedClasses[wClass];
        const classLabel = classKey ? localizeKey(classKey) : (wClass || '');
        const caliberSlug = attachedAmmo?.system?.caliber || sys.caliber;
        const calLabelKey = caliberSlug ? CALIBERS[caliberSlug] : null;
        const caliber = calLabelKey ? localizeKey(calLabelKey) : '';
        const loadedAmmoLabel = getLoadedAmmoLabel(attachedAmmo?.system?.ammoType);
        const caliberClass = [caliber, classLabel].filter(Boolean).join(' ');
        return [caliberClass, rel, conc, loadedAmmoLabel, range].filter(Boolean).join(' · ');
    }
    if (wType === "Martial") {
        const subKey = getMartialSubtypeLabelKey(sys.attackSkill);
        const subLabel = subKey ? localizeKey(subKey) : localizeKey("WeaponTypeMartial");
        const bits = [subLabel];
        if (sys.damageType) {
            const dmgKey = meleeDamageTypes[sys.damageType];
            if (dmgKey) bits.push(localizeKey(dmgKey));
        }
        return bits.concat([rel, conc, range]).filter(Boolean).join(' · ');
    }
    if (wType === "Exotic") {
        const effectKey = (sys.effect && sys.effect !== "none") ? weaponEffects[sys.effect] : null;
        const effect = effectKey ? localizeKey(effectKey) : '';
        return [localizeKey("WeaponTypeExotic"), effect, rel, conc, range].filter(Boolean).join(' · ');
    }
    return '';
}

/**
 * Ammo context line. Non-grenade: caliber · ammoType. Grenade:
 * caliber · ammoType · effect · template · radius/width.
 * Same shape used on standalone ammo rows and the attached-ammo addon row.
 */
export function buildAmmoContext(ammoSys) {
    if (!ammoSys) return '';
    const calLabel = ammoSys.caliber && CALIBERS[ammoSys.caliber] ? localizeKey(CALIBERS[ammoSys.caliber]) : '';
    const atLabel = ammoTypes[ammoSys.ammoType] ? localizeKey(ammoTypes[ammoSys.ammoType]) : '';
    if (ammoSys.ammoType !== "grenade") {
        return [calLabel, atLabel].filter(Boolean).join(' · ');
    }
    const effectLabel = (ammoSys.effect && ammoSys.effect !== "none" && weaponEffects[ammoSys.effect])
        ? localizeKey(weaponEffects[ammoSys.effect])
        : '';
    const templateLabel = ammoSys.templateType && ordnanceTemplateTypes[ammoSys.templateType]
        ? localizeKey(ordnanceTemplateTypes[ammoSys.templateType])
        : '';
    const radiusStr = ammoSys.radius ? `${ammoSys.radius} m` : '';
    return [calLabel, atLabel, effectLabel, templateLabel, radiusStr].filter(Boolean).join(' · ');
}

/**
 * Build the per-row data for an actor's WEAPON items (Martial / Ranged / Exotic).
 * Excludes Ordnance and Ammo — those have their own builders.
 * Cyberweapons are NOT included.
 *
 * @param {Actor} actor
 * @returns {Array<Object>}
 */
export function buildWeaponsList(actor) {
    const items = actor.itemTypes.weapon || [];
    return items
        .filter(w => {
            const d = discrim(w.system);
            return d.weaponType === "Martial" || d.weaponType === "Ranged" || d.weaponType === "Exotic";
        })
        .map(w => {
            const sys = w.system;
            const d = discrim(sys);
            const wType = d.weaponType;
            const wClass = d.weaponClass;

            const isRanged = wType === "Ranged";
            const isMelee  = wType === "Martial" && wClass === "Melee";
            const isExotic = wType === "Exotic";

            // Resolve attached ammo (Ranged only)
            let attachedAmmo = null;
            if (isRanged && sys.attachedAmmoId) {
                attachedAmmo = actor.items.get(sys.attachedAmmoId) || null;
                if (attachedAmmo && attachedAmmo.system?.weaponType !== "Ammo") attachedAmmo = null;
            }

            const context = buildWeaponContextString({ sys, wType, wClass, attachedAmmo });

            return {
                id: w.id,
                img: w.img,
                name: w.name,
                context,
                price: sys.cost || 0,
                weight: sys.weight || 0,
                damage: (() => {
                    // For Ranged, the damage on the line is the ammo's damage
                    const dmg = isRanged ? (attachedAmmo?.system?.damage || sys.damage) : sys.damage;
                    return dmg && dmg !== '0' && dmg !== 0 ? dmg : '–';
                })(),
                shotsLeft: sys.shotsLeft ?? 0,
                shots: sys.shots ?? 0,
                charges: sys.charges ?? 0,
                chargesMax: sys.chargesMax ?? 0,
                chargesDisplay: (sys.charges || sys.chargesMax) ? `${sys.charges ?? 0} / ${sys.chargesMax ?? 0}` : '–',
                rof: sys.rof ?? 0,
                canReload: isRanged && !!sys.attachedAmmoId && (sys.shotsLeft ?? 0) < (sys.shots ?? 0),
                canCharge: (sys.charges ?? 0) < (sys.chargesMax ?? 0),
                isCyberware: false,
                isRanged,
                isMelee,
                isExotic,
                weaponType: wType,
                weaponClass: wClass,
                // Attached ammo addon data (Ranged only)
                hasAttachedAmmo: !!attachedAmmo,
                attachedAmmoId: attachedAmmo?.id || '',
                attachedAmmoName: attachedAmmo?.name || '',
                attachedAmmoImg: attachedAmmo?.img || '',
                attachedAmmoQuantity: attachedAmmo?.system?.quantity ?? 0,
                attachedAmmoContext: attachedAmmo ? buildAmmoContext(attachedAmmo.system) : '',
                attachedAmmoPrice: attachedAmmo ? (() => {
                    const aSys = attachedAmmo.system || {};
                    const pkg = Number(aSys.packSize) || 1;
                    const qty = Number(aSys.quantity) || 0;
                    return Math.round((Number(aSys.cost) || 0) / pkg * qty * 100) / 100;
                })() : 0,
                attachedAmmoWeight: attachedAmmo?.system?.weight ?? 0
            };
        });
}

/**
 * Build the per-row data shape for an actor's AMMO items.
 *
 * @param {Actor} actor
 * @returns {Array<Object>}
 */
export function buildAmmoList(actor) {
    const items = actor.itemTypes.weapon || [];
    return items
        .filter(w => discrim(w.system).weaponType === "Ammo")
        .filter(w => !w.getFlag?.("cyberpunk", "attachedTo"))
        .map(a => {
            const sys = a.system;
            const d = discrim(sys);
            const wClass = d.weaponClass;
            const context = buildAmmoContext(sys);

            const packSize = Number(sys.packSize) || 1;
            const quantity = Number(sys.quantity) || 0;
            const costPerRound = (Number(sys.cost) || 0) / packSize;
            const totalPrice = Math.round(costPerRound * quantity * 100) / 100;

            return {
                id: a.id,
                img: a.img,
                name: a.name,
                context,
                totalPrice,
                weight: sys.weight || 0,
                quantity,
                ammoType: sys.ammoType || 'standard',
                weaponClass: wClass,
                caliber: sys.caliber || '',
                isAttached: !!a.getFlag?.("cyberpunk", "attachedTo")
            };
        });
}

/**
 * Build the per-row data shape for an actor's ORDNANCE items.
 *
 * @param {Actor} actor
 * @returns {Array<Object>}
 */
export function buildOrdnanceList(actor) {
    const items = actor.itemTypes.weapon || [];
    return items
        .filter(w => discrim(w.system).weaponType === "Ordnance")
        .map(o => {
            const sys = o.system;
            const templateLabel = ordnanceTemplateTypes[sys.templateType]
                ? localizeKey(ordnanceTemplateTypes[sys.templateType])
                : '';
            const radiusStr = sys.radius ? `${sys.radius} m` : '';
            const effectKey = (sys.effect && sys.effect !== "none") ? weaponEffects[sys.effect] : null;
            const effectLabel = effectKey ? localizeKey(effectKey) : '';
            const relLabel = reliability[sys.reliability] ? localizeKey(reliability[sys.reliability]) : '';
            const concLabel = concealability[sys.concealability] ? localizeKey(concealability[sys.concealability]) : '';
            const range = sys.range ? `${sys.range} m` : '';
            // Ordnance subtype label is skill-driven (Grenade / Explosive / Missile).
            // Fall back to the legacy weaponClass label if the skill isn't recognized.
            const subKey = getOrdnanceSubtypeLabelKey(sys.attackSkill);
            const classKey = subKey || ordnanceClasses[discrim(sys).weaponClass];
            const classLabel = classKey ? localizeKey(classKey) : '';
            const contextParts = [classLabel, templateLabel, radiusStr, effectLabel, relLabel, concLabel, range].filter(Boolean);

            return {
                id: o.id,
                img: o.img,
                name: o.name,
                context: contextParts.join(' · '),
                price: sys.cost || 0,
                weight: sys.weight || 0,
                damage: sys.damage && sys.damage !== '0' && sys.damage !== 0 ? sys.damage : '–',
                // Ordnance is 1-shot; expose simple "1" for templates that still render charges
                charges: 1,
                chargesMax: 1,
                chargesDisplay: '1',
                canCharge: false,
                removeOnZero: true
            };
        });
}

/**
 * Build a stripped-down skill-row data shape for drones.
 *
 * @param {Actor} actor
 * @returns {Array<Object>}
 */
export function buildDroneSkillsList(actor) {
    const skills = actor.itemTypes.skill || [];
    const statLabels = { int: "INT", ref: "REF", tech: "TECH", ma: "MA", luck: "LUCK" };
    return skills
        .map(skill => {
            const baseLevel = skill.system.level || 0;
            const ipLevel = skill.system.ipLevel || 0;
            return {
                id: skill.id,
                name: skill.name,
                statLabel: statLabels[skill.system.stat] || skill.system.stat?.toUpperCase() || "",
                total: baseLevel + ipLevel,
                flavor: skill.system.flavor || ""
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Subtext (gear-row "context line") builders, shared between the character
// sheet's gear / cyberware / netware tabs and the shop sheet's listings. Each
// builder takes a full item (not just `system`) and returns a `·`-joined
// string, matching the character sheet's formatting exactly.
// ---------------------------------------------------------------------------

/**
 * Format a single bonus row: "INT +2", "BT ×2", "Reflex = 5". The `+` op keeps
 * the signed form so negative additives read naturally ("INT -3").
 */
export function formatBonusLabel(label, op, value) {
    if (op === "×") return `${label} ×${value}`;
    if (op === "=") return `${label} = ${value}`;
    return `${label} ${value >= 0 ? '+' : ''}${value}`;
}

/**
 * Summarise the first N bonus entries on a bonuses array. Property bonuses get
 * localized through `toolBonusProperties`; skill bonuses use the stored name.
 * Used by tool, drug and chipware contexts.
 */
function summariseBonuses(bonuses, limit = 2) {
    return (bonuses || []).slice(0, limit).map(b => {
        const op = b.op || "+";
        if (b.type === "property") {
            const propKey = toolBonusProperties[b.property];
            const propLabel = propKey ? game.i18n.localize(`CYBERPUNK.${propKey}`) : b.property;
            return formatBonusLabel(propLabel, op, b.value);
        }
        if (b.skillName) return formatBonusLabel(b.skillName, op, b.value);
        return '';
    }).filter(Boolean);
}

/**
 * Armor / outfit subtext — "Hard Armor · Head · Torso · Arms" etc.
 * Shields show just "Shield"; options show just "Option".
 */
export function buildArmorContext(item) {
    const sys = item.system || {};
    const typeLabel = sys.armorType === 'hard'   ? 'Hard Armor'
                    : sys.armorType === 'shield' ? 'Shield'
                    : sys.armorType === 'option' ? 'Option'
                                                 : 'Soft Armor';
    if (sys.armorType === 'shield' || sys.armorType === 'option') return typeLabel;

    const coverage = sys.coverage || {};
    const areas = [];
    if (coverage.Head?.stoppingPower > 0)  areas.push('Head');
    if (coverage.Torso?.stoppingPower > 0) areas.push('Torso');
    if (coverage.lArm?.stoppingPower  > 0 || coverage.rArm?.stoppingPower > 0) areas.push('Arms');
    if (coverage.lLeg?.stoppingPower  > 0 || coverage.rLeg?.stoppingPower > 0) areas.push('Legs');
    return [typeLabel, ...areas].join(' · ');
}

/**
 * Cyberware subtext. Format differs per cyberwareType:
 *   sensor    → subtype · base|option · surgery [· Weapon]
 *   cyberlimb → subtype · base|option · surgery
 *   implant   → subtype · surgery [· Weapon] [· Armor]
 *   chipware  → subtype · {first 2 bonuses}
 */
export function buildCyberwareContext(item) {
    const sys = item.system || {};
    const cyberType = sys.cyberwareType || 'implant';
    const subtypes = getCyberwareSubtypes(cyberType);
    const subtypeKey = subtypes[sys.cyberwareSubtype];
    const subtypeLabel = subtypeKey ? game.i18n.localize(`CYBERPUNK.${subtypeKey}`) : (sys.cyberwareSubtype || '');
    const surgeryKey = surgeryCodes[sys.surgeryCode];
    const surgeryLabel = surgeryKey ? game.i18n.localize(`CYBERPUNK.${surgeryKey}`) : (sys.surgeryCode || '');
    const baseOrOption = sys.isOption ? 'Option' : 'Base';

    const parts = [];
    switch (cyberType) {
        case 'sensor':
            if (subtypeLabel) parts.push(subtypeLabel);
            parts.push(baseOrOption);
            if (surgeryLabel) parts.push(surgeryLabel);
            if (sys.isWeapon) parts.push('Weapon');
            break;
        case 'cyberlimb':
            if (subtypeLabel) parts.push(subtypeLabel);
            parts.push(baseOrOption);
            if (surgeryLabel) parts.push(surgeryLabel);
            break;
        case 'implant':
            if (subtypeLabel) parts.push(subtypeLabel);
            if (surgeryLabel) parts.push(surgeryLabel);
            if (sys.isWeapon) parts.push('Weapon');
            if (sys.isArmor)  parts.push('Armor');
            break;
        case 'chipware':
            if (subtypeLabel) parts.push(subtypeLabel);
            parts.push(...summariseBonuses(sys.bonuses));
            break;
    }
    return parts.join(' · ');
}

/**
 * Netware subtext. Cyberdeck shows slot count; programs branch by subtype.
 */
export function buildNetwareContext(item) {
    const sys = item.system || {};
    const type = sys.netwareType;
    if (type === 'cyberdeck') return `Cyberdeck · ${sys.slots || 0} slots`;
    if (type === 'upgrade')   return 'Upgrade';
    if (type === 'program') {
        const subtype = sys.programSubtype;
        if (subtype === 'defender') {
            const defKey = defenderDefences[sys.defenderDefence];
            const defLabel = defKey ? game.i18n.localize(`CYBERPUNK.${defKey}`) : sys.defenderDefence;
            const valuePart = sys.defenderDefence === 'armor' && sys.defenderValue ? ` ${sys.defenderValue}` : '';
            return `Defender · ${defLabel}${valuePart}`;
        }
        if (subtype === 'booster') {
            const bonusKey = boosterBonuses[sys.boosterBonus];
            const bonusLabel = bonusKey ? game.i18n.localize(`CYBERPUNK.${bonusKey}`) : sys.boosterBonus;
            return `Booster · ${bonusLabel} +${sys.boosterValue || 0}`;
        }
        if (subtype === 'attacker') {
            const classKey = attackerClasses[sys.attackerClass];
            const classLabel = classKey ? game.i18n.localize(`CYBERPUNK.${classKey}`) : sys.attackerClass;
            const parts = ['Attacker', classLabel];
            if (sys.attackerEffect && sys.attackerEffect !== 'none') {
                const effectKey = attackerEffects[sys.attackerEffect];
                const effectLabel = effectKey ? game.i18n.localize(`CYBERPUNK.${effectKey}`) : sys.attackerEffect;
                parts.push(effectLabel);
            }
            if (sys.attackerDamage) parts.push(sys.attackerDamage);
            return parts.join(' · ');
        }
        const fallbackKey = programSubtypes[subtype];
        const fallbackLabel = fallbackKey ? game.i18n.localize(`CYBERPUNK.${fallbackKey}`) : subtype;
        return `Program · ${fallbackLabel}`;
    }
    return '';
}

/** Tool subtext — "Tool · {first 2 bonuses}". */
export function buildToolContext(item) {
    const parts = ['Tool', ...summariseBonuses(item.system?.bonuses)];
    return parts.join(' · ');
}

/**
 * Drug subtext — "Drug · {first 2 bonuses}". Always summarises the standard
 * bonus list (not withdrawal), since shop drugs are inert.
 */
export function buildDrugContext(item) {
    const parts = ['Drug', ...summariseBonuses(item.system?.bonuses)];
    return parts.join(' · ');
}

/** Commodity subtext — fixed string, mirrors the character sheet's Gear tab. */
export function buildCommodityContext(_item) {
    return 'Commodity';
}
