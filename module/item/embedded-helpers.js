/**
 * Shared context-builders and listener-binders for the Effect tab and the
 * embedded Weapon tab. Used by both cyberware-sheet.js and outfit-sheet.js
 * so the two item types render and behave identically on those tabs.
 *
 * Context-builders mutate the sheetData object the caller hands them; they
 * never read from `this`. Listener-binders take (html, item, opts) and wire
 * the event handlers; they assume the partial markup matches the shared
 * templates under templates/item/parts/shared/.
 */

import {
    concealability, reliability,
    weaponTypes, getWeaponClasses,
    meleeDamageTypes, weaponEffects,
    ordnanceTemplateTypes,
    getAttackSkillsForWeapon,
    getRangedClassesForSkill,
    resolveWeaponDiscriminator,
    toolBonusProperties
} from "../lookups.js";
import { calibers as CALIBERS, getDamageForCaliber } from "../calibers.js";

/**
 * Default weaponClass used when the user switches the embedded-weapon
 * discriminator. Cyberware/armor can only embed Martial/Ranged/Exotic.
 */
export const DEFAULT_CLASS_BY_TYPE = {
    Martial: "Melee",
    Ranged:  "Pistol",
    Exotic:  "Exotic"
};

// ---------------------------------------------------------------------------
// Effect / Bonuses context
// ---------------------------------------------------------------------------

/** Build display-ready bonus rows for the Effect tab. */
export function prepareBonuses(rawBonuses) {
    return (rawBonuses || []).map(bonus => {
        const op = bonus.op || "+";
        const opOptions = [
            { value: "+", label: "+", selected: op === "+" },
            { value: "×", label: "×", selected: op === "×" },
            { value: "=", label: "=", selected: op === "=" }
        ];
        if (bonus.type === "property") {
            const labelKey = toolBonusProperties[bonus.property];
            return {
                ...bonus,
                op, opOptions,
                isProperty: true,
                label: labelKey ? game.i18n.localize(`CYBERPUNK.${labelKey}`) : bonus.property
            };
        }
        return {
            ...bonus,
            op, opOptions,
            isSkill: true,
            hasFilled: !!(bonus.skillUuid),
            label: bonus.skillName || ""
        };
    });
}

/** Property keys not yet used by another bonus row. */
export function getAvailablePropertyOptions(bonuses) {
    const used = new Set((bonuses || []).filter(b => b.type === "property").map(b => b.property));
    return Object.entries(toolBonusProperties)
        .filter(([key]) => !used.has(key))
        .map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`)
        }));
}

/** Convenience: stuff both prepared bonuses and propertyOptions into sheetData. */
export function prepareEffectTabContext(data, rawBonuses) {
    data.bonuses = prepareBonuses(rawBonuses);
    data.propertyOptions = getAvailablePropertyOptions(rawBonuses);
}

// ---------------------------------------------------------------------------
// Embedded Weapon context
// ---------------------------------------------------------------------------

/**
 * Populate `data` with everything tab-weapon.hbs needs. The embedded weapon
 * lives at `system[weaponPath].weapon` — for cyberware that's "system.weapon"
 * (weaponPath="weapon"); for armor it's the same path because armor's embedded
 * weapon block also lives at system.weapon. Caller passes the resolved object.
 */
export function prepareWeaponTabContext(data, weapon) {
    weapon = weapon || {};
    const d = resolveWeaponDiscriminator(weapon, DEFAULT_CLASS_BY_TYPE);
    const wt = d.weaponType;
    const wc = d.weaponClass;

    data.weaponType  = wt;
    data.weaponClass = wc;
    data.weaponIsMartial = wt === "Martial";
    data.weaponIsRanged  = wt === "Ranged";
    data.weaponIsExotic  = wt === "Exotic";

    // ----- WeaponType (discriminator) — only Martial/Ranged/Exotic embed -----
    const allowedTypes = ["Martial", "Ranged", "Exotic"];
    data.weaponTypeOptions = allowedTypes.map(value => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${weaponTypes[value]}`),
        selected: wt === value
    }));
    data.selectedWeaponTypeLabel = game.i18n.localize(`CYBERPUNK.${weaponTypes[wt] || "WeaponTypeMartial"}`);

    // ----- WeaponClass (Subtype) -----
    const classEnum = getWeaponClasses(wt) || {};
    let classKeys = Object.keys(classEnum);
    if (wt === "Ranged") {
        const allowed = getRangedClassesForSkill(weapon.attackSkill);
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

    // ----- Concealability -----
    data.weaponConcealabilityOptions = Object.entries(concealability).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: weapon.concealability === value
    }));
    data.selectedWeaponConcealabilityLabel = game.i18n.localize(`CYBERPUNK.${concealability[weapon.concealability] || "ConcealHidden"}`);

    // ----- Reliability -----
    data.weaponReliabilityOptions = Object.entries(reliability).map(([value, labelKey]) => ({
        value,
        label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
        selected: weapon.reliability === value
    }));
    data.selectedWeaponReliabilityLabel = game.i18n.localize(`CYBERPUNK.${reliability[weapon.reliability] || "Standard"}`);

    // ----- Attack Skill -----
    const skillsList = getAttackSkillsForWeapon(wt, wc);
    const currentSkill = weapon.attackSkill || skillsList[0] || "";
    data.weaponAttackSkillOptions = skillsList.map(name => ({
        value: name,
        label: game.i18n.has(`CYBERPUNK.Skill${name}`)
            ? game.i18n.localize(`CYBERPUNK.Skill${name}`)
            : name,
        selected: currentSkill === name
    }));
    data.selectedWeaponAttackSkillLabel = currentSkill
        ? (game.i18n.has(`CYBERPUNK.Skill${currentSkill}`)
            ? game.i18n.localize(`CYBERPUNK.Skill${currentSkill}`)
            : currentSkill)
        : "";

    // ----- Damage Type (Martial only) -----
    if (data.weaponIsMartial) {
        data.weaponDamageTypeOptions = Object.entries(meleeDamageTypes).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: weapon.damageType === value
        }));
        data.selectedWeaponDamageTypeLabel = game.i18n.localize(`CYBERPUNK.${meleeDamageTypes[weapon.damageType] || "DmgEdged"}`);
    }

    // ----- Effect (Martial / Exotic) -----
    if (data.weaponIsMartial || data.weaponIsExotic) {
        const effectKeys = Object.keys(weaponEffects);
        const currentEffect = weapon.effect || effectKeys[0];
        data.weaponEffectOptions = Object.entries(weaponEffects).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: currentEffect === value
        }));
        data.selectedWeaponEffectLabel = game.i18n.localize(`CYBERPUNK.${weaponEffects[currentEffect] || weaponEffects[effectKeys[0]]}`);
    }

    // ----- Template (Exotic only) -----
    if (data.weaponIsExotic) {
        const baseOptions = Object.entries(ordnanceTemplateTypes).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: weapon.templateType === value
        }));
        data.weaponTemplateOptions = [
            { value: "", label: game.i18n.localize("CYBERPUNK.TemplateNone"), selected: !weapon.templateType },
            ...baseOptions
        ];
        const selKey = ordnanceTemplateTypes[weapon.templateType];
        data.selectedWeaponTemplateLabel = selKey
            ? game.i18n.localize(`CYBERPUNK.${selKey}`)
            : game.i18n.localize("CYBERPUNK.TemplateNone");
        const tplKind = weapon.templateType || "circle";
        data.weaponRadiusLabel = (tplKind === "circle")
            ? game.i18n.localize("CYBERPUNK.RadiusM")
            : game.i18n.localize("CYBERPUNK.WidthM");
    }

    // ----- Caliber (Ranged only) -----
    if (data.weaponIsRanged) {
        data.weaponCaliberOptions = Object.entries(CALIBERS).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: weapon.caliber === value
        }));
        const selCal = CALIBERS[weapon.caliber];
        data.selectedWeaponCaliberLabel = selCal ? game.i18n.localize(`CYBERPUNK.${selCal}`) : "";
    }
}

// ---------------------------------------------------------------------------
// Listener-binders
// ---------------------------------------------------------------------------

/**
 * Wire up Effect-tab listeners (add property, add skill, remove, value
 * change, property select). Caller passes the item and locked flag.
 */
export function bindEffectTabListeners(html, item, { isLocked = false } = {}) {
    if (isLocked) return;

    html.find('.add-property').click(async ev => {
        ev.preventDefault();
        const bonuses = [...(item.system.bonuses || [])];
        const used = new Set(bonuses.filter(b => b.type === "property").map(b => b.property));
        const firstAvailable = Object.keys(toolBonusProperties).find(k => !used.has(k));
        if (!firstAvailable) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
            return;
        }
        bonuses.push({ type: "property", property: firstAvailable, op: "+", value: 0 });
        await item.update({ "system.bonuses": bonuses });
    });

    html.find('.add-skill').click(async ev => {
        ev.preventDefault();
        const bonuses = [...(item.system.bonuses || [])];
        bonuses.push({ type: "skill", skillUuid: "", skillName: "", op: "+", value: 0 });
        await item.update({ "system.bonuses": bonuses });
    });

    html.find('.remove-bonus').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const index = parseInt(ev.currentTarget.dataset.index);
        const bonuses = [...(item.system.bonuses || [])];
        bonuses.splice(index, 1);
        await item.update({ "system.bonuses": bonuses });
    });

    html.find('.bonus-property-select').change(async ev => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const newProperty = ev.currentTarget.value;
        const bonuses = [...(item.system.bonuses || [])];
        if (bonuses.some((b, i) => i !== index && b.type === "property" && b.property === newProperty)) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
            item.sheet.render(false);
            return;
        }
        bonuses[index] = { ...bonuses[index], property: newProperty };
        await item.update({ "system.bonuses": bonuses });
    });

    html.find('.bonus-value-input').on('change blur', async ev => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const value = parseInt(ev.currentTarget.value) || 0;
        const bonuses = [...(item.system.bonuses || [])];
        if (bonuses[index] && bonuses[index].value !== value) {
            bonuses[index] = { ...bonuses[index], value };
            await item.update({ "system.bonuses": bonuses });
        }
    });

    html.find('.bonus-op-select').change(async ev => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const op = ev.currentTarget.value;
        const bonuses = [...(item.system.bonuses || [])];
        if (bonuses[index] && bonuses[index].op !== op) {
            bonuses[index] = { ...bonuses[index], op };
            await item.update({ "system.bonuses": bonuses });
        }
    });
}

/**
 * Wire up embedded-weapon listeners (type change → reset skill+class,
 * skill change → narrow Ranged class, caliber change → re-stamp damage).
 */
export function bindWeaponTabListeners(html, item, { isLocked = false } = {}) {
    if (isLocked) return;

    html.find('select[name="system.weapon.weaponType"]').change(async ev => {
        const newType = ev.currentTarget.value;
        const defaultSkill = getAttackSkillsForWeapon(newType)[0] || "";
        const updates = {
            "system.weapon.weaponType":  newType,
            "system.weapon.attackSkill": defaultSkill
        };
        if (newType === "Ranged") {
            const allowed = getRangedClassesForSkill(defaultSkill);
            updates["system.weapon.weaponClass"] = allowed[0] || "Pistol";
            const dmg = getDamageForCaliber(item.system.weapon?.caliber);
            if (dmg) updates["system.weapon.damage"] = dmg;
        } else {
            updates["system.weapon.weaponClass"] = DEFAULT_CLASS_BY_TYPE[newType] || "";
        }
        await item.update(updates);
    });

    html.find('select[name="system.weapon.weaponClass"]').change(async ev => {
        await item.update({ "system.weapon.weaponClass": ev.currentTarget.value });
    });

    html.find('select[name="system.weapon.attackSkill"]').change(async ev => {
        const newSkill = ev.currentTarget.value;
        const updates = { "system.weapon.attackSkill": newSkill };
        const w = item.system.weapon || {};
        if (w.weaponType === "Ranged") {
            const allowed = getRangedClassesForSkill(newSkill);
            if (allowed.length && !allowed.includes(w.weaponClass)) {
                updates["system.weapon.weaponClass"] = allowed[0];
            }
        }
        await item.update(updates);
    });

    html.find('select[name="system.weapon.caliber"]').change(async ev => {
        const newCal = ev.currentTarget.value;
        const updates = { "system.weapon.caliber": newCal };
        const dmg = getDamageForCaliber(newCal);
        if (dmg) updates["system.weapon.damage"] = dmg;
        await item.update(updates);
    });
}

/**
 * Handle a dragged Skill item drop onto a bonus row. Mirrors the cyberware
 * sheet's behaviour: refuses duplicates, fills the first empty skill bonus
 * row, otherwise appends a new one.
 *
 * Returns true if the drop was consumed.
 */
export async function handleSkillDropForBonus(item, droppedItem) {
    if (!droppedItem || droppedItem.type !== "skill") return false;

    const bonuses = [...(item.system.bonuses || [])];
    const isDuplicate = bonuses.some(b =>
        b.type === "skill" && b.skillUuid && (
            b.skillUuid === droppedItem.uuid ||
            b.skillName.toLowerCase() === droppedItem.name.toLowerCase()
        )
    );
    if (isDuplicate) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
        return true;
    }

    const skillStat = droppedItem.system?.stat || "ref";
    const emptyIndex = bonuses.findIndex(b => b.type === "skill" && !b.skillUuid);
    if (emptyIndex >= 0) {
        bonuses[emptyIndex] = {
            ...bonuses[emptyIndex],
            skillUuid: droppedItem.uuid,
            skillName: droppedItem.name,
            skillStat
        };
    } else {
        bonuses.push({
            type: "skill",
            skillUuid: droppedItem.uuid,
            skillName: droppedItem.name,
            skillStat,
            op: "+",
            value: 0
        });
    }

    await item.update({ "system.bonuses": bonuses });
    return true;
}
