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
    toolBonusProperties,
    toolBooleanProperties,
    toolModifierProperties,
    toolStateProperties,
    isAttributeProperty,
    isBooleanProperty,
    isStateProperty,
    netBonusProperties,
    isNetBonusProperty,
    netwareFlavours,
    drugFlavours,
    getFlavourMeta
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

/**
 * Build display-ready bonus rows for the Effect tab.
 *
 * Property-type rows split into TWO categories at the UI level:
 *   - `isAttribute` — keys like `stats.int`, `stats.emp`, ... (Key Attributes)
 *   - `isProperty`  — everything else (initiativeMod, saves, ignoreFatigue, …)
 * The underlying data shape is identical (`type: "property"` + `property`
 * key); the split is purely so the dropdown can offer the relevant subset
 * and the label can read "Attribute" vs "Property". Pre-existing rows
 * detect their category from the key itself, so older saved bonuses keep
 * working without migration.
 */
export function prepareBonuses(rawBonuses) {
    // Full op set for stats / modifiers / skills.
    const fullOps = ["+", "−", "×", "÷", "="];
    // NET Bonuses and State bonuses are additive-only — no scaling, no
    // override. Legacy rows that saved a `×` / `÷` / `=` op collapse to
    // "+" in both the display and the pipeline (see actor.js pushBonus).
    const addSubOps = ["+", "−"];
    const mkOpOptions = (op, allowed) => allowed.map(v => ({
        value: v, label: v, selected: op === v
    }));

    return (rawBonuses || []).map(bonus => {
        if (bonus.type === "flavour") {
            // Flavour rows apply a status/narrative flavour when the
            // effect spawns. No op, no value; just a picker + hint.
            // Metadata carries the label i18n key + hover text.
            const meta = getFlavourMeta(bonus.flavour);
            return {
                ...bonus,
                isFlavour: true,
                label: meta?.labelKey
                    ? game.i18n.localize(`CYBERPUNK.${meta.labelKey}`)
                    : (bonus.flavour || "")
            };
        }
        if (bonus.type === "property") {
            const netBonus  = isNetBonusProperty(bonus.property);
            const state     = !netBonus && isStateProperty(bonus.property);
            const attribute = !netBonus && !state && isAttributeProperty(bonus.property);
            const boolean   = !netBonus && !state && !attribute && isBooleanProperty(bonus.property);
            // Anything that isn't stat / boolean / State / NET Bonus falls
            // into the numeric Modifier bucket (uses op + value UI). This
            // keeps legacy rows whose key predates the split renderable.
            const modifier  = !netBonus && !state && !attribute && !boolean;
            const labelKey  = netBonus
                ? netBonusProperties[bonus.property]
                : toolBonusProperties[bonus.property];
            const rawOp = bonus.op || "+";
            const allowed = (netBonus || state) ? addSubOps : fullOps;
            const op = allowed.includes(rawOp) ? rawOp : "+";
            return {
                ...bonus,
                op,
                opOptions: mkOpOptions(op, allowed),
                isAttribute: attribute,
                isProperty:  boolean,
                isModifier:  modifier,
                isState:     state,
                isNetBonus:  netBonus,
                label: labelKey ? game.i18n.localize(`CYBERPUNK.${labelKey}`) : bonus.property
            };
        }
        const op = bonus.op || "+";
        return {
            ...bonus,
            op,
            opOptions: mkOpOptions(op, fullOps),
            isSkill: true,
            hasFilled: !!(bonus.skillUuid),
            label: bonus.skillName || ""
        };
    });
}

/**
 * Property-key catalogues filtered by category and de-duplicated against
 * what's already in `bonuses`. Returns `{attributes, properties}` so the
 * sheet can populate the two split dropdowns.
 */
export function getAvailablePropertyOptions(bonuses) {
    const used = new Set((bonuses || []).filter(b => b.type === "property").map(b => b.property));
    const mkOpts = (source) =>
        Object.entries(source)
            .filter(([key]) => !used.has(key))
            .map(([value, labelKey]) => ({ value, label: game.i18n.localize(`CYBERPUNK.${labelKey}`) }));
    // Attributes still come from the toolBonusProperties union — stats.*
    // isn't in the split subsets. Modifier / Property (boolean) / NET
    // each draws from its own dedicated map.
    const attributes = Object.entries(toolBonusProperties)
        .filter(([key]) => !used.has(key) && isAttributeProperty(key))
        .map(([value, labelKey]) => ({ value, label: game.i18n.localize(`CYBERPUNK.${labelKey}`) }));
    return {
        attributes,
        properties: mkOpts(toolBooleanProperties),
        modifiers:  mkOpts(toolModifierProperties),
        states:     mkOpts(toolStateProperties),
        netBonuses: mkOpts(netBonusProperties)
    };
}

/** Convenience: stuff both prepared bonuses and split-options into sheetData. */
export function prepareEffectTabContext(data, rawBonuses) {
    data.bonuses = prepareBonuses(rawBonuses);
    const opts = getAvailablePropertyOptions(rawBonuses);
    data.attributeOptions = opts.attributes;
    data.propertyOptions  = opts.properties;
    data.modifierOptions  = opts.modifiers;
    data.stateOptions     = opts.states;
    data.netBonusOptions  = opts.netBonuses;
}

/**
 * Attacker / Black-ICE Effect tab context. A stripped variant of the
 * shared Effect tab restricted to Attribute + NET Bonus categories,
 * with op forced to `−` (no selector rendered) and Attribute values
 * treated as string-editable so a GM can author formulas (`1d6`,
 * `2d6+1`) that get rolled at apply time.
 *
 * The `bonuses` payload retains the standard row shape — the pipeline
 * on the actor side never runs for these (they're spawned only when
 * the attacker hits a target), so schema consistency is one-way: we
 * store like everyone else, but the sheet + apply pipeline treat
 * these rows specially.
 */
export function prepareAttackerEffectTabContext(data, rawBonuses) {
    const rows = (rawBonuses || []).map(b => {
        // Flavour rows are a new bonus type; they carry a `flavour`
        // key rather than a `property` key and produce no numeric
        // change — they just apply a status when the effect spawns.
        // Kept in the same `bonuses[]` array so persistence, apply,
        // and remove all share one pipeline.
        if (b?.type === "flavour") {
            const flavourKey = b.flavour || "";
            const meta = netwareFlavours[flavourKey];
            return {
                ...b,
                isFlavour: true,
                label: meta?.labelKey ? game.i18n.localize(`CYBERPUNK.${meta.labelKey}`) : flavourKey
            };
        }
        const property = b.property || "";
        const isNetBonus = isNetBonusProperty(property);
        const isAttribute = !isNetBonus && isAttributeProperty(property);
        const labelKey = isNetBonus
            ? netBonusProperties[property]
            : toolBonusProperties[property];
        return {
            ...b,
            // Persisted rows may have `value` as either a number or a
            // formula string. For the Attribute editor input, show
            // whatever was stored verbatim so `"1d6"` round-trips.
            value: b.value ?? 0,
            isAttribute,
            isNetBonus,
            label: labelKey ? game.i18n.localize(`CYBERPUNK.${labelKey}`) : property
        };
    });
    const usedProperties = new Set(rows.filter(r => r.property).map(r => r.property));
    const usedFlavours   = new Set(rows.filter(r => r.isFlavour).map(r => r.flavour));
    // Property maps carry a raw labelKey string per entry; flavour
    // maps carry a metadata object with a `labelKey` field. One helper
    // that reads either shape covers both — the caller doesn't care.
    const mkOpts = (source, usedSet, extraFilter = null) =>
        Object.entries(source)
            .filter(([key]) => !usedSet.has(key) && (!extraFilter || extraFilter(key)))
            .map(([value, entry]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${typeof entry === "string" ? entry : entry.labelKey}`)
            }));
    const attributeOptions = mkOpts(toolBonusProperties, usedProperties, isAttributeProperty);

    data.attackerBonuses       = rows;
    data.attackerAttrOptions   = attributeOptions;
    data.attackerNetOptions    = mkOpts(netBonusProperties, usedProperties);
    data.attackerFlavourOptions = mkOpts(netwareFlavours, usedFlavours);
}

/**
 * Wire the Attacker Effect tab listeners. Add-attribute stamps op
 * `−`, value `"1d6"` as the default authoring shape (matches the
 * migrated Scrambled effect); add-net-bonus stamps op `−`, value `1`.
 * Value + property changes write back through the standard bonuses
 * array on `system.bonuses`.
 */
export function bindAttackerEffectTabListeners(html, item, { isLocked = false } = {}) {
    if (isLocked) return;

    const addAttrRow = async () => {
        const bonuses = [...(item.system.bonuses || [])];
        const used = new Set(bonuses.filter(b => b.type === "property").map(b => b.property));
        const firstFree = Object.keys(toolBonusProperties).find(k => !used.has(k) && isAttributeProperty(k));
        if (!firstFree) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
            return;
        }
        bonuses.push({ type: "property", property: firstFree, op: "−", value: "1d6" });
        await item.update({ "system.bonuses": bonuses });
    };
    const addNetRow = async () => {
        const bonuses = [...(item.system.bonuses || [])];
        const used = new Set(bonuses.filter(b => b.type === "property").map(b => b.property));
        const firstFree = Object.keys(netBonusProperties).find(k => !used.has(k));
        if (!firstFree) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
            return;
        }
        bonuses.push({ type: "property", property: firstFree, op: "−", value: 1 });
        await item.update({ "system.bonuses": bonuses });
    };

    const addFlavourRow = async () => {
        const bonuses = [...(item.system.bonuses || [])];
        const used = new Set(bonuses.filter(b => b.type === "flavour").map(b => b.flavour));
        const firstFree = Object.keys(netwareFlavours).find(k => !used.has(k));
        if (!firstFree) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
            return;
        }
        bonuses.push({ type: "flavour", flavour: firstFree });
        await item.update({ "system.bonuses": bonuses });
    };

    html.find('.attacker-add-attribute').click(ev => { ev.preventDefault(); addAttrRow(); });
    html.find('.attacker-add-net').click(ev => { ev.preventDefault(); addNetRow(); });
    html.find('.attacker-add-flavour').click(ev => { ev.preventDefault(); addFlavourRow(); });

    html.find('.attacker-bonus-flavour-select').change(async ev => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const newFlavour = ev.currentTarget.value;
        const bonuses = [...(item.system.bonuses || [])];
        if (bonuses.some((b, i) => i !== index && b.type === "flavour" && b.flavour === newFlavour)) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
            item.sheet.render(false);
            return;
        }
        bonuses[index] = { ...bonuses[index], flavour: newFlavour };
        await item.update({ "system.bonuses": bonuses });
    });

    html.find('.attacker-remove-bonus').click(async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const index = parseInt(ev.currentTarget.dataset.index);
        const bonuses = [...(item.system.bonuses || [])];
        bonuses.splice(index, 1);
        await item.update({ "system.bonuses": bonuses });
    });

    html.find('.attacker-bonus-property-select').change(async ev => {
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

    html.find('.attacker-bonus-value-input').on('change blur', async ev => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const raw = ev.currentTarget.value;
        const bonuses = [...(item.system.bonuses || [])];
        if (!bonuses[index]) return;
        const isAttribute = isAttributeProperty(bonuses[index].property);
        // Attribute rows accept a formula string; NET Bonus rows are
        // integer-only. For NET Bonus, coerce whatever the user typed
        // into an integer so downstream math never sees a string.
        const value = isAttribute ? String(raw).trim() : (parseInt(raw) || 0);
        if (bonuses[index].value !== value) {
            bonuses[index] = { ...bonuses[index], value };
            await item.update({ "system.bonuses": bonuses });
        }
    });
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

    // Property-add helpers. `keyPool` picks the enum to draw the first
    // unused key from; `filterFn` narrows within it. Attribute + Property
    // share the same toolBonusProperties pool (split by isAttributeProperty);
    // NET Bonus draws from netBonusProperties.
    const addPropertyBonus = async (keyPool, filterFn, warnKey) => {
        const bonuses = [...(item.system.bonuses || [])];
        const used = new Set(bonuses.filter(b => b.type === "property").map(b => b.property));
        const firstAvailable = Object.keys(keyPool).find(k => !used.has(k) && filterFn(k));
        if (!firstAvailable) {
            ui.notifications.warn(game.i18n.localize(warnKey));
            return;
        }
        bonuses.push({ type: "property", property: firstAvailable, op: "+", value: 0 });
        await item.update({ "system.bonuses": bonuses });
    };
    html.find('.add-attribute').click(ev => {
        ev.preventDefault();
        addPropertyBonus(toolBonusProperties, isAttributeProperty, "CYBERPUNK.DuplicateBonus");
    });
    html.find('.add-property').click(ev => {
        ev.preventDefault();
        addPropertyBonus(toolBooleanProperties, () => true, "CYBERPUNK.DuplicateBonus");
    });
    html.find('.add-modifier').click(ev => {
        ev.preventDefault();
        addPropertyBonus(toolModifierProperties, () => true, "CYBERPUNK.DuplicateBonus");
    });
    html.find('.add-state').click(ev => {
        ev.preventDefault();
        addPropertyBonus(toolStateProperties, () => true, "CYBERPUNK.DuplicateBonus");
    });
    html.find('.add-net-bonus').click(ev => {
        ev.preventDefault();
        addPropertyBonus(netBonusProperties, () => true, "CYBERPUNK.DuplicateBonus");
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
