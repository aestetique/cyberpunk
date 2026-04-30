import {
    weaponTypes,
    reliability,
    concealability,
    meleeDamageTypes,
    exoticEffects,
    weaponToAmmoType,
    ammoWeaponTypes,
    ammoTypes,
    ammoCalibersByWeaponType,
    ammoAbbreviations,
    ordnanceTemplateTypes
} from "../lookups.js";
import { COVER_TYPES } from "../conditions.js";

/**
 * Build the cover-row toggle data for a sheet. Each entry has the shape the
 * cover-row.hbs partial expects: { key, sp, label, desc, active }.
 *
 * @param {Actor} actor
 * @param {{exclude?: string[]}} options - cover keys to omit (e.g., ["drywall"] for drones)
 * @returns {Array<Object>}
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

/**
 * Get loaded ammo type abbreviation, or '' if none.
 */
function getLoadedAmmoLabel(loadedAmmoType) {
    if (!loadedAmmoType) return '';
    return ammoAbbreviations[loadedAmmoType] || '';
}

/**
 * Build the per-row data shape for an actor's weapon items.
 * Returns an array consumable by templates/actor/parts/weapons-block.hbs.
 * Cyberweapons are NOT included — those live in actor-sheet.js because they
 * depend on cyberlimb structure that drones don't have.
 *
 * @param {Actor} actor
 * @returns {Array<Object>}
 */
export function buildWeaponsList(actor) {
    const weapons = actor.itemTypes.weapon || [];
    return weapons.map(w => {
        const sys = w.system;
        const wType = sys.weaponType || '';
        const isRanged = !['Melee', 'Exotic'].includes(wType);
        const isMelee = wType === 'Melee';
        const isExotic = wType === 'Exotic';

        const rel = sys.reliability && reliability[sys.reliability]
            ? game.i18n.localize("CYBERPUNK." + reliability[sys.reliability])
            : '';
        const conc = sys.concealability && concealability[sys.concealability]
            ? game.i18n.localize("CYBERPUNK." + concealability[sys.concealability])
            : '';
        const range = sys.range ? `${sys.range} m` : '';

        let context = '';
        if (isRanged) {
            const weaponTypeLabel = weaponTypes[wType] || wType || '';
            const ammoKey = weaponToAmmoType[wType];
            const calibers = ammoKey ? (ammoCalibersByWeaponType[ammoKey] || {}) : {};
            const calLabelKey = calibers[sys.caliber];
            const caliber = calLabelKey ? game.i18n.localize(`CYBERPUNK.${calLabelKey}`) : '';
            const loadedAmmoLabel = getLoadedAmmoLabel(sys.loadedAmmoType);
            const caliberWeaponType = [caliber, weaponTypeLabel].filter(p => p).join(' ');
            const contextParts = [caliberWeaponType, rel, conc, loadedAmmoLabel, range].filter(p => p);
            context = contextParts.join(' · ');
        } else if (isMelee) {
            const damageTypeKey = meleeDamageTypes[sys.damageType];
            const damageType = damageTypeKey ? game.i18n.localize(`CYBERPUNK.${damageTypeKey}`) : '';
            const contextParts = ['Melee', damageType, rel, conc, range].filter(p => p);
            context = contextParts.join(' · ');
        } else if (isExotic) {
            const effectKey = (sys.effect && sys.effect !== "none") ? exoticEffects[sys.effect] : null;
            const effect = effectKey ? game.i18n.localize(`CYBERPUNK.${effectKey}`) : '';
            const contextParts = ['Exotic', effect, rel, conc, range].filter(p => p);
            context = contextParts.join(' · ');
        }

        return {
            id: w.id,
            img: w.img,
            name: w.name,
            context: context,
            price: sys.cost || 0,
            weight: sys.weight || 0,
            damage: sys.damage && sys.damage !== '0' && sys.damage !== 0 ? sys.damage : '–',
            shotsLeft: sys.shotsLeft ?? 0,
            shots: sys.shots ?? 0,
            charges: sys.charges ?? 0,
            chargesMax: sys.chargesMax ?? 0,
            chargesDisplay: (sys.charges || sys.chargesMax) ? `${sys.charges ?? 0} / ${sys.chargesMax ?? 0}` : '–',
            rof: sys.rof ?? 0,
            canReload: (sys.shotsLeft ?? 0) < (sys.shots ?? 0),
            canCharge: (sys.charges ?? 0) < (sys.chargesMax ?? 0),
            isCyberware: false,
            isRanged: isRanged,
            isMelee: isMelee,
            isExotic: isExotic
        };
    });
}

/**
 * Build the per-row data shape for an actor's ordnance items.
 * Returns an array consumable by templates/actor/parts/ordnance-block.hbs.
 *
 * @param {Actor} actor
 * @returns {Array<Object>}
 */
/**
 * Build the per-row data shape for an actor's ammo items.
 * Returns an array consumable by templates/actor/parts/ammo-block.hbs.
 *
 * @param {Actor} actor
 * @returns {Array<Object>}
 */
export function buildAmmoList(actor) {
    const ammoItems = actor.itemTypes.ammo || [];
    return ammoItems.map(a => {
        const sys = a.system;
        const wt = ammoWeaponTypes[sys.weaponType];
        const wtLabel = wt ? game.i18n.localize(`CYBERPUNK.${wt}`) : '';
        const calibers = ammoCalibersByWeaponType[sys.weaponType] || {};
        const calLabel = calibers[sys.caliber] ? game.i18n.localize(`CYBERPUNK.${calibers[sys.caliber]}`) : '';
        const atLabel = ammoTypes[sys.ammoType] ? game.i18n.localize(`CYBERPUNK.${ammoTypes[sys.ammoType]}`) : '';
        const contextParts = [wtLabel, calLabel, atLabel].filter(p => p);

        const packSize = Number(sys.packSize) || 1;
        const quantity = Number(sys.quantity) || 0;
        const costPerRound = (Number(sys.cost) || 0) / packSize;
        const totalPrice = Math.round(costPerRound * quantity * 100) / 100;

        return {
            id: a.id,
            img: a.img,
            name: a.name,
            context: contextParts.join(' · '),
            totalPrice: totalPrice,
            weight: sys.weight || 0,
            quantity: quantity
        };
    });
}

/**
 * Build a stripped-down skill-row data shape for drones: just the bits the
 * drone-skills-block partial renders (id, name, statLabel, total) plus
 * flavor for the row tooltip. No career/special/chipped/IP machinery —
 * drones don't have those mechanics.
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

export function buildOrdnanceList(actor) {
    const ordnance = actor.itemTypes.ordnance || [];
    return ordnance.map(o => {
        const sys = o.system;
        const templateLabel = ordnanceTemplateTypes[sys.templateType]
            ? game.i18n.localize(`CYBERPUNK.${ordnanceTemplateTypes[sys.templateType]}`)
            : '';
        const radiusStr = sys.radius ? `${sys.radius} m` : '';
        const effectKey = (sys.effect && sys.effect !== "none") ? exoticEffects[sys.effect] : null;
        const effectLabel = effectKey ? game.i18n.localize(`CYBERPUNK.${effectKey}`) : '';
        const relLabel = reliability[sys.reliability]
            ? game.i18n.localize(`CYBERPUNK.${reliability[sys.reliability]}`)
            : '';
        const concLabel = concealability[sys.concealability]
            ? game.i18n.localize(`CYBERPUNK.${concealability[sys.concealability]}`)
            : '';
        const range = sys.range ? `${sys.range} m` : '';
        const contextParts = [templateLabel, radiusStr, effectLabel, relLabel, concLabel, range].filter(p => p);

        return {
            id: o.id,
            img: o.img,
            name: o.name,
            context: contextParts.join(' · '),
            price: sys.cost || 0,
            weight: sys.weight || 0,
            damage: sys.damage && sys.damage !== '0' && sys.damage !== 0 ? sys.damage : '–',
            charges: sys.charges || 0,
            chargesMax: sys.chargesMax || 0,
            chargesDisplay: (sys.charges || sys.chargesMax) ? `${sys.charges ?? 0} / ${sys.chargesMax ?? 0}` : '–',
            canCharge: (sys.charges ?? 0) < (sys.chargesMax ?? 0),
            removeOnZero: sys.removeOnZero ?? false
        };
    });
}
