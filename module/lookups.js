// This is where all the magic values go, because cyberpunk has SO many of those
// Any given string value is the same as its key in the localization file, and will be used for translation
import { getMartialKeyByName, localize } from './utils.js';
import { calibers, CALIBERS_BY_AMMO_CLASS } from './calibers.js';

// ============================================================================
// Weapon taxonomy
// ----------------------------------------------------------------------------
// Top-level discriminator: 5 categories that share a single "weapon" Item type.
//   Martial  — unarmed/melee/bows/crossbows/slings. No charges, no ammo.
//   Ranged   — pistols/SMGs/shotguns/rifles/heavies. Use attached Ammo.
//   Exotic   — energy/beam weapons. Rechargeable charges. Own damage/effect.
//   Ordnance — single-shot disposables (grenades, missiles, charges). Destroys on fire.
//   Ammo     — the pile-of-rounds item. Carries damage/effect/template.
// Each weapon also has a `weaponClass` field — the subclass within its category.
// ============================================================================

/** Top-level weaponType discriminator (5 categories). */
export const weaponTypes = {
    Martial:  "WeaponTypeMartial",
    Ranged:   "WeaponTypeRanged",
    Exotic:   "WeaponTypeExotic",
    Ordnance: "WeaponTypeOrdnance",
    Ammo:     "WeaponTypeAmmo"
};

/**
 * Single source of truth for the legacy 2.0.2-and-earlier weaponType strings
 * → new (weaponType, weaponClass) discriminator. Used by every sheet/handler
 * that has to read possibly-un-migrated data and decide how to render it.
 *
 * `resolveWeaponDiscriminator(sys)` is the canonical reader.
 */
export const LEGACY_WEAPON_TYPE_TO_NEW = {
    Pistol:   { weaponType: "Ranged",  weaponClass: "Pistol" },
    SMG:      { weaponType: "Ranged",  weaponClass: "SubMachinegun" },
    Shotgun:  { weaponType: "Ranged",  weaponClass: "Shotgun" },
    Rifle:    { weaponType: "Ranged",  weaponClass: "AssaultRifle" },
    Heavy:    { weaponType: "Ranged",  weaponClass: "Machinegun" },
    Bow:      { weaponType: "Martial", weaponClass: "Bow" },
    Crossbow: { weaponType: "Martial", weaponClass: "Crossbow" },
    Melee:    { weaponType: "Martial", weaponClass: "Melee" },
    Exotic:   { weaponType: "Exotic",  weaponClass: "Exotic" }
};

/**
 * Normalize a weapon `system` block to its new (weaponType, weaponClass)
 * shape, falling through legacy values. Pass `sys` (either Item#system or
 * actorData) and a `defaultClassByType` map for the post-legacy default.
 *
 * Replaces the five hand-rolled discrim()/LEGACY_TYPE_TO_CLASS variants that
 * used to live in gear-data.js, weapon-sheet.js, cyberware-sheet.js, item.js,
 * and gear-handlers.js.
 */
export function resolveWeaponDiscriminator(sys, defaultClassByType = {}) {
    const raw = sys?.weaponType || "";
    const map = LEGACY_WEAPON_TYPE_TO_NEW[raw];
    if (map) {
        return {
            weaponType: map.weaponType,
            weaponClass: sys.weaponClass || map.weaponClass
        };
    }
    return {
        weaponType: raw,
        weaponClass: sys.weaponClass || defaultClassByType[raw] || ""
    };
}

/** Martial subclasses */
export const martialClasses = {
    Unarmed:  "MartialUnarmed",
    Melee:    "MartialMelee",
    Bow:      "MartialBow",
    Crossbow: "MartialCrossbow",
    Sling:    "MartialSling"
};

/**
 * Ranged subclasses. Skill drives which subclasses are available — see
 * RANGED_CLASSES_BY_SKILL. The gear-tab subtext is "Caliber + class label".
 */
export const rangedClasses = {
    Pistol:           "RangedPistol",
    SubMachinegun:    "RangedSubMachinegun",
    AssaultRifle:     "RangedAssaultRifle",
    SniperRifle:      "RangedSniperRifle",
    Shotgun:          "RangedShotgun",
    AntiMateriel:     "RangedAntiMateriel",
    Autocannon:       "RangedAutocannon",
    GrenadeLauncher:  "RangedGrenadeLauncher",
    Machinegun:       "RangedMachinegun",
    Minigun:          "RangedMinigun"
};

/**
 * For Ranged weapons the available weaponClass values depend on the chosen
 * attack skill. Pick the skill, narrow the subtype dropdown.
 */
export const RANGED_CLASSES_BY_SKILL = {
    "Handgun":        ["Pistol"],
    "Submachine Gun": ["SubMachinegun"],
    "Rifle":          ["AssaultRifle", "SniperRifle", "Shotgun"],
    "Heavy Weapons":  ["AntiMateriel", "Autocannon", "GrenadeLauncher", "Machinegun", "Minigun"]
};

/** Return the allowed Ranged weaponClass keys for an attack skill. */
export function getRangedClassesForSkill(skill) {
    return RANGED_CLASSES_BY_SKILL[skill] || [];
}

/** Exotic subclasses (currently flat — user may subdivide later) */
export const exoticClasses = {
    Exotic: "ExoticExotic"
};

/** Ordnance subclasses */
export const ordnanceClasses = {
    Grenade: "OrdnanceGrenade",
    Mine:    "OrdnanceMine",
    Charge:  "OrdnanceCharge",
    Missile: "OrdnanceMissile",
    RPG:     "OrdnanceRPG"
};

/** Ammo subclasses — which weapon class chambers this ammo. */
export const ammoClasses = {
    Pistol:   "AmmoPistolSMG",
    Rifle:    "AmmoRifle",
    Shotgun:  "AmmoShotgun",
    Heavy:    "AmmoHeavy",
    Bow:      "AmmoBow",
    Crossbow: "AmmoCrossbow"
};

/** weaponClass lookup, keyed by weaponType. */
export const WEAPON_CLASSES = {
    Martial:  martialClasses,
    Ranged:   rangedClasses,
    Exotic:   exoticClasses,
    Ordnance: ordnanceClasses,
    Ammo:     ammoClasses
};

/**
 * Return the weaponClass enum object for a given weaponType.
 * @param {string} weaponType
 * @returns {Object} class enum (key → localization key)
 */
export function getWeaponClasses(weaponType) {
    return WEAPON_CLASSES[weaponType] || {};
}

// ============================================================================
// Skill mapping
// ----------------------------------------------------------------------------
// Names match the shipped Skills compendium (canonical).
// ============================================================================

export const SKILL_MAPPINGS = {
    pistols:             ["Handgun"],
    rifles:              ["Rifle"],
    shotguns:            ["Rifle"],
    submachineGuns:      ["Submachine Gun"],
    heavyWeapons:        ["Heavy Weapons"],
    throw:               ["Athletics"],
    bows:                ["Archery"],
    crossbows:           ["Archery"],
    slings:              ["Athletics"],
    meleeAttacks:        ["Fencing", "Melee", "Brawling"],
    unarmedAttacks: [
        "Brawling",
        "Martial: Aikido", "Martial: Animal Kung Fu", "Martial: Arasaka-Te",
        "Martial: Boxing", "Martial: Capoeira", "Martial: Choi Li Fut",
        "Martial: Gun-Fu", "Martial: Jeet Kun Do", "Martial: Judo",
        "Martial: Jujitsu", "Martial: Karate", "Martial: Koppo",
        "Martial: Ninjutsu", "Martial: PanzerFaust", "Martial: Sambo",
        "Martial: Savate", "Martial: Sumo", "Martial: Tae Kwon Do",
        "Martial: Tai Chi Chuan", "Martial: Te", "Martial: Thai Kick Boxing",
        "Martial: Thamoc", "Martial: Thrash Boxing", "Martial: Wing Chung",
        "Martial: Wrestling"
    ],
    escapeSkills:        ["Dodge & Escape", "Athletics"],
    stabilisationSkills: ["First Aid", "Medical Tech"],
    awarenessSkills:     ["Awareness/Notice"],
    interfaceSkills:     ["Interface"],
    demolitionsSkills:   ["Demolitions"]
};

/**
 * Maps (weaponType, weaponClass) → skill-mapping category key.
 * `null` means dynamic (Exotic uses all ranged+melee skills minus Brawling).
 * Ammo has no entry — ammo doesn't attack.
 */
export const WEAPON_CLASS_TO_SKILL_CATEGORY = {
    // Martial
    "Martial/Unarmed":   "unarmedAttacks",
    "Martial/Melee":     "meleeAttacks",
    "Martial/Bow":       "bows",
    "Martial/Crossbow":  "crossbows",
    "Martial/Sling":     "slings",

    // Ranged
    "Ranged/Pistol":          "pistols",
    "Ranged/SubMachinegun":   "submachineGuns",
    "Ranged/AssaultRifle":    "rifles",
    "Ranged/SniperRifle":     "rifles",
    "Ranged/Shotgun":         "rifles",
    "Ranged/AntiMateriel":    "heavyWeapons",
    "Ranged/Autocannon":      "heavyWeapons",
    "Ranged/GrenadeLauncher": "heavyWeapons",
    "Ranged/Machinegun":      "heavyWeapons",
    "Ranged/Minigun":         "heavyWeapons",

    // Exotic — dynamic
    "Exotic/Exotic":     null,

    // Ordnance
    "Ordnance/Grenade":  "throw",
    "Ordnance/Mine":     "demolitionsSkills",
    "Ordnance/Charge":   "demolitionsSkills",
    "Ordnance/Missile":  "heavyWeapons",
    "Ordnance/RPG":      "heavyWeapons"
};


// ============================================================================
// Ammo system
// ============================================================================

/**
 * Re-export calibers (defined in module/calibers.js as a flat enum).
 */
export { calibers, CALIBERS_BY_AMMO_CLASS };

/** Ammo types (variants — what kind of round) */
export const ammoTypes = {
    standard:      "AmmoStandard",
    armorPiercing: "AmmoArmorPiercing",
    hollowPoint:   "AmmoHollowPoint",
    rubberSlug:    "AmmoRubberSlug",
    grenade:       "AmmoGrenade"
};

export const ammoAbbreviations = {
    standard:      "SD",
    armorPiercing: "AP",
    hollowPoint:   "HP",
    rubberSlug:    "RS",
    grenade:       "GR"
};

// ============================================================================
// Skill resolution
// ============================================================================

/**
 * Skills for a category from the hardcoded mapping.
 * @param {string} categoryKey - e.g. "pistols", "escapeSkills"
 * @returns {string[]} Array of skill names (canonical pack names).
 */
export function getSkillsForCategory(categoryKey) {
    return SKILL_MAPPINGS[categoryKey] || [];
}

/**
 * Attack-skill list for a weaponType. The list is FLAT (per-type) — the user
 * picks any of the type's eligible skills, and that drives the subtype label
 * (Martial / Ordnance) or the available subtype dropdown (Ranged).
 *
 * - Exotic dispatches to all weapon-skill categories minus Brawling.
 * - Ammo returns [] (ammo doesn't attack).
 *
 * `weaponClass` is accepted but ignored — preserved for back-compat with
 * legacy call sites that still pass it.
 *
 * @param {string} weaponType
 * @returns {string[]}
 */
export function getAttackSkillsForWeapon(weaponType /*, weaponClass — ignored */) {
    if (weaponType === "Exotic") {
        const all = new Set();
        for (const [key, catKey] of Object.entries(WEAPON_CLASS_TO_SKILL_CATEGORY)) {
            const [wt] = key.split("/");
            if (wt === "Exotic" || !catKey) continue;
            for (const n of SKILL_MAPPINGS[catKey] || []) all.add(n);
        }
        all.delete("Brawling");
        return [...all].sort();
    }
    if (weaponType === "Martial") {
        const skills = new Set([
            ...(SKILL_MAPPINGS.bows         || []),  // Archery
            ...(SKILL_MAPPINGS.meleeAttacks || []),  // Fencing, Melee, Brawling
            ...(SKILL_MAPPINGS.unarmedAttacks || []),// Brawling + Martial:* variants
            ...(SKILL_MAPPINGS.slings       || [])   // Athletics (thrown)
        ]);
        return [...skills];
    }
    if (weaponType === "Ranged") {
        const skills = new Set([
            ...(SKILL_MAPPINGS.pistols        || []),
            ...(SKILL_MAPPINGS.submachineGuns || []),
            ...(SKILL_MAPPINGS.rifles         || []),
            ...(SKILL_MAPPINGS.heavyWeapons   || [])
        ]);
        return [...skills];
    }
    if (weaponType === "Ordnance") {
        const skills = new Set([
            ...(SKILL_MAPPINGS.throw              || []),
            ...(SKILL_MAPPINGS.demolitionsSkills  || []),
            ...(SKILL_MAPPINGS.heavyWeapons       || [])
        ]);
        return [...skills];
    }
    return [];
}

/**
 * Skill → Martial subtype label key. Used for the gear-tab subtext on Martial
 * weapons (and martial cyberweapons). Returns a CYBERPUNK.* lang key suffix.
 */
export function getMartialSubtypeLabelKey(skill) {
    if (!skill) return "";
    if (skill === "Archery")  return "MartialSubtypeArchery";
    if (skill === "Athletics") return "MartialSubtypeThrown";
    if (skill === "Melee" || skill === "Brawling" || skill === "Fencing") return "MartialSubtypeMelee";
    if (typeof skill === "string" && skill.startsWith("Martial:")) return "MartialSubtypeMartial";
    return "";
}

/**
 * Skill → Ordnance subtype label key. Used for the gear-tab subtext on Ordnance.
 */
export function getOrdnanceSubtypeLabelKey(skill) {
    if (skill === "Athletics")     return "OrdnanceSubtypeGrenade";
    if (skill === "Demolitions")   return "OrdnanceSubtypeExplosive";
    if (skill === "Heavy Weapons") return "OrdnanceSubtypeMissile";
    return "";
}

// ============================================================================
// Other lookups (unchanged from prior file)
// ============================================================================

/** Melee damage types affecting armor penetration */
export const meleeDamageTypes = {
    blunt: "DmgBlunt",
    edged: "DmgEdged",
    spike: "DmgSpike",
    monoblade: "DmgMonoblade"
};

/** Ordnance template types (area of effect shapes) */
export const ordnanceTemplateTypes = {
    circle: "TemplateCircle",
    cone: "TemplateCone",
    beam: "TemplateBeam"
};

/**
 * Boolean-toggle Properties — presence on a bonus list means the target
 * is set to 1; absence means 0. No op / value UI, no stacking maths.
 * Reserved for capability flags where scaling doesn't make sense
 * (either you can see in the dark or you can't).
 */
export const toolBooleanProperties = {
    "ignoreGasEffects":   "PropIgnoreGasEffects",
    "ignoreBurning":      "PropIgnoreBurning",
    "ignoreStressFright": "PropIgnoreStressFright",
    "ignoreFatigue":      "PropIgnoreFatigue",
    "ignoreWounds":       "PropIgnoreWounds",
    "grantLowLight":      "PropGrantLowLight",
    "grantInfrared":      "PropGrantInfrared",
    "grantThermo":        "PropGrantThermo"
};

/**
 * Numeric Modifier properties — take a value + operator (+ / − / × / ÷ / =)
 * and flow through the standard actor property pipeline the same way
 * Attribute rows do. Rendered under a dedicated "Modifier" dropdown so
 * boolean toggles above don't compete for the same list.
 */
export const toolModifierProperties = {
    "initiativeMod":           "PropInitiative",
    "stunSaveMod":             "PropStunSave",
    "deathSaveMod":            "PropDeathSave",
    "poisonSaveMod":           "PropPoisonSave",
    "rangedAttackBonus":       "PropRangedAttackBonus",
    "unarmedDamageMultiplier": "PropUnarmedMultiplier",
    "healingRateBoost":        "PropHealingRateBoost",
    "stabilizeBonus":          "PropStabilizeBonus",
    "sleepRollBonus":          "PropSleepRollBonus",
    "allRollBonus":            "PropAllRollBonus",
    "bonusActions":            "PropBonusActions"
};

/**
 * State bonuses — additive-only tweaks to the character's condition
 * bars (Stress / Fright / Fatigue) and to the psychosis bracket
 * calculators for the four Humanity Loss flavours. Bonuses stack while
 * their carrier item is active and clamp at 0 on the low end.
 *
 * Path routing:
 *   - `stress` / `fright` / `fatigue` write directly to `system.<key>`.
 *     Every downstream consumer already reads that field, so the bumped
 *     value shows up in rolls, thresholds, and the sheet automatically.
 *   - `stateBonus.<flavour>` writes to a dedicated container that never
 *     touches `system.humanityLoss.<flavour>`. The derived
 *     `system.psychosis.<flavour>` (built later in prepareDerivedData
 *     as `max(0, humanityLoss.<flavour> + stateBonus.<flavour>)`) is
 *     what bracket / penalty consumers read; overall Humanity Loss and
 *     EMP calcs stay on the raw humanityLoss values.
 */
export const toolStateProperties = {
    "stress":                "PropStateStress",
    "fright":                "PropStateFright",
    "fatigue":               "PropStateFatigue",
    "stateBonus.alienation": "PropStateAlienation",
    "stateBonus.egotism":    "PropStateEgotism",
    "stateBonus.obsession":  "PropStateObsession",
    "stateBonus.paranoia":   "PropStateParanoia"
};

/**
 * Union of everything a bonus row's `property` field can point at
 * OUTSIDE the NET bonus bucket: stats.*, numeric Modifiers, boolean
 * Properties, and State bonuses. Used by prepareBonuses for label
 * lookup regardless of category; UI dropdowns iterate the per-category
 * maps instead.
 */
export const toolBonusProperties = {
    "stats.int":  "PropINT",
    "stats.ref":  "PropREF",
    "stats.tech": "PropTECH",
    "stats.cool": "PropCOOL",
    "stats.attr": "PropATTR",
    "stats.luck": "PropLUCK",
    "stats.ma":   "PropMA",
    "stats.bt":   "PropBT",
    "stats.emp":  "PropEMP",
    ...toolModifierProperties,
    ...toolBooleanProperties,
    ...toolStateProperties
};

/** True if a `toolBonusProperties` key targets a Key Attribute (stats.*). */
export function isAttributeProperty(key) {
    return typeof key === "string" && key.startsWith("stats.");
}

/** True if a key is a boolean toggle Property (presence → 1). */
export function isBooleanProperty(key) {
    return Object.prototype.hasOwnProperty.call(toolBooleanProperties, key);
}

/** True if a key is a numeric Modifier (uses op / value UI). */
export function isModifierProperty(key) {
    return Object.prototype.hasOwnProperty.call(toolModifierProperties, key);
}

/** True if a key is a State bonus (Stress / Fright / Fatigue / HL flavours). */
export function isStateProperty(key) {
    return Object.prototype.hasOwnProperty.call(toolStateProperties, key);
}

/**
 * NET bonus properties — one-per-NET-action buffs (plus Cyberdeck Slots,
 * which lives in this bucket because it's netrunning-adjacent). Rendered
 * in the Effect tab under a dedicated "Add a NET bonus" button, separate
 * from ordinary Property bonuses so the list doesn't drown a runner's
 * dropdown in NET keys they don't need.
 *
 * All values feed the same actor-side aggregation the ordinary property
 * pipeline uses; nested `netBonuses.<key>` paths get walked automatically
 * by the pipeline (see actor.js#prepareDerivedData).
 */
export const netBonusProperties = {
    "netBonuses.scanner":    "PropNetBonusScanner",
    "netBonuses.cloak":      "PropNetBonusCloak",
    "netBonuses.eyedee":     "PropNetBonusEyeDee",
    "netBonuses.slide":      "PropNetBonusSlide",
    "netBonuses.backdoor":   "PropNetBonusBackdoor",
    "netBonuses.control":    "PropNetBonusControl",
    "netBonuses.detect":     "PropNetBonusDetect",
    "netBonuses.speed":      "PropNetBonusSpeed",
    "netBonuses.pathfinder": "PropNetBonusPathfinder",
    "netBonuses.zap":        "PropNetBonusZap",
    "netBonuses.actions":    "PropNetBonusActions",
    "cyberdeckSlots":        "PropCyberdeckSlots"
};

/** True if a key belongs to the NET bonus bucket (dropdown categorisation). */
export function isNetBonusProperty(key) {
    return Object.prototype.hasOwnProperty.call(netBonusProperties, key);
}

/** Netware types */
export const netwareTypes = {
    cyberdeck: "NetwareTypeCyberdeck",
    upgrade: "NetwareTypeUpgrade",
    program: "NetwareTypeProgram"
};

/** Netware ACTOR subtypes — NET-architecture objects placed on the map. */
export const netwareActorSubtypes = {
    accessPoint:  "NetActorSubAccessPoint",
    password:     "NetActorSubPassword",
    file:         "NetActorSubFile",
    account:      "NetActorSubAccount",
    controlPoint: "NetActorSubControlPoint",
    blackIce:     "NetActorSubBlackIce"
};

/** Program subtypes (when netwareType === "program") */
export const programSubtypes = {
    booster: "ProgramSubBooster",
    defender: "ProgramSubDefender",
    attacker: "ProgramSubAttacker",
    blackIce: "ProgramSubBlackIce"
};

/**
 * Booster bonus types — the eight NET actions boosters can enhance.
 * Zap was previously in this list but has been dropped: no booster in
 * the system boosts Zap; the built-in Zap attack of the cyberdeck now
 * receives inherent-deck bonuses through the same `activeBoosterValue`
 * pathway (see the deck's `cyberdeckBonuses` object on template.json).
 */
export const boosterBonuses = {
    scanner:    "BoosterScanner",
    backdoor:   "BoosterBackdoor",
    cloak:      "BoosterCloak",
    control:    "BoosterControl",
    eyedee:     "BoosterEyeDee",
    detect:     "BoosterDetect",
    slide:      "BoosterSlide",
    speed:      "BoosterSpeed",
    pathfinder: "BoosterPathfinder",
    zap:        "BoosterZap"
};

/** Defender defence types */
export const defenderDefences = {
    armor: "DefenderArmor",
    flak: "DefenderFlak",
    shield: "DefenderShield"
};

/** Attacker class types */
export const attackerClasses = {
    antiProgram: "AttackerAntiProgram",
    antiPersonnel: "AttackerAntiPersonnel"
};

/**
 * Upgrade effect types — chrome bolted onto a cyberdeck.
 *
 *   - backup       — programs detach (not destroy) when REZ→0 with the
 *                    Destroyed effect; they reappear in Unslotted.
 *   - dnaLock      — flavor; no mechanical effect.
 *   - empShielding — protects the parent deck from the Microwave Inoperable
 *                    result (random-cyberdeck pick skips shielded decks).
 *   - insulated    — while jacked-in via this deck, Burning status is blocked.
 *   - antiCrash    — while jacked-in via this deck, Crashed status is blocked.
 *   - range        — uses upgradeValue (metres) to widen every Access
 *                    Point's effective radius from this runner's view
 *                    (jack-in proximity gate + auto jack-out gate).
 */
export const upgradeEffects = {
    none: "UpgradeNone",
    backup: "UpgradeBackup",
    dnaLock: "UpgradeDnaLock",
    empShielding: "UpgradeEmpShielding",
    insulated: "UpgradeInsulated",
    antiCrash: "UpgradeAntiCrash",
    range: "UpgradeRange"
};

/**
 * Attacker / Black-ICE primary effect. All are one-shot side-effects at
 * apply time:
 *   - none      — no primary side-effect
 *   - superglue — apply the Superglue status (movement lock)
 *   - burning   — apply the Burning status (3-turn 2d10/1d10/1d6 tick)
 *   - crashed   — force jack-out (gated by Anti-Crash upgrade)
 *   - destroyed — anti-program mode: on hit, destroy target program
 *                 instead of derezz
 *   - custom    — no primary side-effect on its own; instead, the
 *                 item's Effect-tab bonus rows are spawned as a
 *                 timed ActiveEffect on the target (effectDuration
 *                 controls lifetime). Attribute rows may carry dice
 *                 formulas that are rolled at apply time.
 * Op on Effect-tab rows is always subtraction; no op selector rendered.
 */
export const attackerEffects = {
    none: "EffectNone",
    burning: "EffectBurning",
    crashed: "EffectCrashed",
    derezz: "EffectDerezz",
    destroyed: "EffectDestroyed",
    custom: "EffectCustom"
};

/**
 * Netware "flavour" statuses — narrative-only conditions authored on a
 * Custom effect's Effect tab as Flavour rows. Each one applies a
 * status condition (via the spawned ActiveEffect's `statuses` array)
 * and surfaces as a 32×32 status-hint icon on the State-tab netware
 * effect row for at-a-glance recognition + hover text.
 *
 * Kept intentionally small — flavour statuses aren't the everyday
 * combat conditions (burn / acid / shock / unconscious live on the
 * mental-works cond-toggle row). Only rare netware-induced statuses
 * belong here so the mental works row stays uncluttered.
 */
/**
 * Netware Flavour registry. Value shape:
 *   labelKey — i18n key (prefixed by "CYBERPUNK.")
 *   flavor   — hover-tooltip description (English literal — narrative
 *              descriptions are hard to translate mechanically; kept
 *              inline for editability)
 *   calc     — hover-tooltip mechanics summary
 *   icon     — filename in `img/conditions/`, without extension. The
 *              `-on` variant convention is baked in per icon.
 *   roll     — optional roll metadata { stat, penaltyMul?, kind?,
 *              label }. Presence makes the state-tab hint icon
 *              clickable → posts a resistance-roll chat card
 *              auto-modified by the applied effect's strength.
 */
export const netwareFlavours = {
    superglue: {
        labelKey: "FlavourSuperglue",
        flavor:   "Locked in place on the NET by a hostile program. Cannot progress deeper into the architecture or Jack Out safely.",
        calc:     "",
        icon:     "superglue-on"
    }
};

/**
 * Drug Flavour registry. Same shape as netwareFlavours.
 *
 * `roll` metadata forms (character-sheet click handler consumes):
 *   { dv: "stat", stat: "int"|"cool"|"ref", penaltyMul: 1|2 }
 *     → post: 1d10 − (strength × penaltyMul) vs the actor's stat total
 *   { dv: "str" }
 *     → post: 1d10 vs the drug's strength (no penalty term)
 *   { dv: "death" }
 *     → dispatches to actor.rollDeathSave(-strength + 2). Reuses the
 *       system's Death Save card + auto-applies Dead on failure.
 *   omit `roll` entirely → passive flavour, hint only (no click).
 */
export const drugFlavours = {
    contraceptive: {
        labelKey: "FlavourContraceptive",
        flavor:   "The character's reproductive system is quelled. Only a 1% chance of inducing or becoming pregnant while the drug is effective.",
        calc:     "",
        icon:     "contraceptive-on"
    },
    hypnotic: {
        labelKey: "FlavourHypnotic",
        flavor:   "The character feels like going along with whatever is asked of them; their inhibitions are lowered. Failing the resist means they comply with the request (+5 for an unreasonable one).",
        calc:     "1d10 − Str vs INT",
        icon:     "hypnotic-on",
        roll:     { dv: "stat", stat: "int", penaltyMul: 1 }
    },
    psychedelic: {
        labelKey: "FlavourPsychedelic",
        flavor:   "The character hallucinates. The hallucinations tend to be pleasant and rarely result in \"bad trips\".",
        calc:     "1d10 vs Str",
        icon:     "psychedelic-on",
        roll:     { dv: "str" }
    },
    aggressive: {
        labelKey: "FlavourAggressive",
        flavor:   "The character becomes very aggressive and combative. Strength is subtracted from all Restraint checks (Heat Waves). Failing the resist means they attack anyone who provokes them.",
        calc:     "1d10 − Str vs COOL",
        icon:     "aggressive-on",
        roll:     { dv: "stat", stat: "cool", penaltyMul: 1 }
    },
    blackout: {
        labelKey: "FlavourBlackout",
        flavor:   "The character struggles to remember what happened during the drug's duration. GMs should enforce failure as heavily as possible.",
        calc:     "1d10 − Str vs INT",
        icon:     "blackout-on",
        roll:     { dv: "stat", stat: "int", penaltyMul: 1 }
    },
    catatonic: {
        labelKey: "FlavourCatatonic",
        flavor:   "The character sometimes goes catatonic. Every 5 minutes or whenever anything stressful happens, failing the resist means they go catatonic for 5 minutes (then roll again).",
        calc:     "1d10 − Str vs COOL",
        icon:     "catatonic-on",
        roll:     { dv: "stat", stat: "cool", penaltyMul: 1 }
    },
    delusions: {
        labelKey: "FlavourDelusions",
        flavor:   "The character begins to imagine falsehoods are true (they're immortal, the lamppost is following them, their gun talks, etc.). Failing the resist means the delusion holds.",
        calc:     "1d10 − Str × 2 vs INT",
        icon:     "delusions-on",
        roll:     { dv: "stat", stat: "int", penaltyMul: 2 }
    },
    disorientation: {
        labelKey: "FlavourDisorientation",
        flavor:   "The character loses their bearings; failing the resist means they get lost after any movement. At strength 4+ they also need REF checks every standing turn or fall down (−2 at strength 6).",
        calc:     "1d10 − Str vs INT",
        icon:     "disorientation-on",
        roll:     { dv: "stat", stat: "int", penaltyMul: 1 }
    },
    hallucination: {
        labelKey: "FlavourHallucination",
        flavor:   "The character hallucinates in increasing degrees. Often unpleasant \"bad trips\".",
        calc:     "1d10 vs Str",
        icon:     "hallucination-on",
        roll:     { dv: "str" }
    },
    "time-distortion": {
        labelKey: "FlavourTimeDistortion",
        flavor:   "The character's perception of time is slowed or accelerated at random. The distortion factor is strength + 1d6, direction chosen randomly. Doesn't help in combat.",
        calc:     "",
        icon:     "time-distortion-on"
    },
    hunger: {
        labelKey: "FlavourHunger",
        flavor:   "The character experiences extreme hunger. Failing the resist means they immediately seek food; otherwise they act as Drowsy at the same strength.",
        calc:     "1d10 − Str vs INT",
        icon:     "hunger-on",
        roll:     { dv: "stat", stat: "int", penaltyMul: 1 }
    },
    addiction: {
        labelKey: "FlavourAddiction",
        flavor:   "The character must make an Addiction check every time the drug is taken. Failure means they need one dose every 12 hours or take 1d6 Stress per missed 12-hour period; the addiction ends after 7 days clean.",
        calc:     "1d10 − Str vs COOL",
        icon:     "addiction-on",
        roll:     { dv: "stat", stat: "cool", penaltyMul: 1 }
    },
    "death-risk": {
        labelKey: "FlavourDeathRisk",
        flavor:   "This drug is very dangerous — and almost certainly illegal. The character must make a Death Save modified by −Strength + 2 or die.",
        calc:     "Death Save − Str + 2",
        icon:     "dead-on",
        roll:     { dv: "death" }
    }
};

/**
 * Unified flavour lookup — returns whichever registry holds `key`, or
 * null. Consumers wanting a hint icon / label / roll metadata read
 * through this one call site regardless of domain.
 */
export function getFlavourMeta(key) {
    return drugFlavours[key] ?? netwareFlavours[key] ?? null;
}

/**
 * Cumulative Effects registry.
 *
 * A cumulative is a per-actor persistent counter that ticks up when a
 * drug carrying that key transitions into its Active phase (either from
 * Onset expiry, or directly on apply if the drug has no onset). The
 * increment scales with the drug's strength via CUMULATIVE_STRENGTH_MUL.
 * Values never decay automatically — the GM edits or deletes rows on
 * the State tab.
 *
 * Row shape:
 *   labelKey — CYBERPUNK i18n suffix
 *   flavor   — hover-tooltip description (matches Flavour hint pattern)
 *   calc     — hover-tooltip calc line (formula for rollables, mechanic
 *              summary for stat-modifiers)
 *   roll?    — same shape family as flavour `roll`:
 *              { kind: "check", stat: "int"|"cool"|"body" }
 *                → 1d10 + stat.total vs Math.ceil(value), higher = pass
 *              omit → no click roll (pure flavour or auto-applied
 *              stat/state modifier)
 *   derive?  — declarative derive-time application, iterated by the
 *              actor's stat pipeline. Two shapes:
 *              { statBonus: "alienation"|"egotism"|"obsession"|"paranoia" }
 *                → adds `⌊value⌋` into `system.stateBonus.<key>` before
 *                psychosis composition.
 *              { statSub: "int"|"ref"|... , floor?: number = 2 }
 *                → subtracts `⌊value⌋` from `stats.<key>.total` with a
 *                `Math.max(floor, ...)` clamp.
 *              { fieldSub: "sleepRollBonus" }
 *                → subtracts `⌊value⌋` from `system.<field>`.
 *              omit → no derive-time effect (pure flavour like
 *              Carcinogen, or a rollable that only matters on click).
 */
export const cumulativeEffects = {
    alienation: {
        labelKey: "CumulativeAlienation",
        flavor:   "The drug alienates the character from society. Alienation Humanity points are gained, equal to the Strength Multiplier per dose taken.",
        calc:     "+Value floor → Alienation state",
        derive:   { statBonus: "alienation" }
    },
    egotism: {
        labelKey: "CumulativeEgotism",
        flavor:   "The drug pushes the character to think of themselves as superior to others. Egotism Humanity points are gained, equal to the Strength Multiplier per dose taken.",
        calc:     "+Value floor → Egotism state",
        derive:   { statBonus: "egotism" }
    },
    obsession: {
        labelKey: "CumulativeObsession",
        flavor:   "The drug fixates the character on obsessive thought patterns. Obsession Humanity points are gained, equal to the Strength Multiplier per dose taken.",
        calc:     "+Value floor → Obsession state",
        derive:   { statBonus: "obsession" }
    },
    paranoia: {
        labelKey: "CumulativeParanoia",
        flavor:   "The drug erodes the character's trust in others. Paranoia Humanity points are gained, equal to the Strength Multiplier per dose taken.",
        calc:     "+Value floor → Paranoia state",
        derive:   { statBonus: "paranoia" }
    },
    brainDegeneration: {
        labelKey: "CumulativeBrainDegeneration",
        flavor:   "The drug causes brain damage. The character's INT is reduced by the Strength Multiplier per dose taken.",
        calc:     "−Value floor → INT",
        derive:   { statSub: "int", floor: 2 }
    },
    nerveDegeneration: {
        labelKey: "CumulativeNerveDegeneration",
        flavor:   "The drug causes nerve damage. The character's REF is reduced by the Strength Multiplier per dose taken.",
        calc:     "−Value floor → REF",
        derive:   { statSub: "ref", floor: 2 }
    },
    insomnia: {
        labelKey: "CumulativeInsomnia",
        flavor:   "The drug makes the character restless and unable to sleep. The character develops Insomnia (minus strength to checks). Even if the check is made, the character only gets 1d6 hours of sleep.",
        calc:     "−Value floor → Sleep Roll Bonus",
        derive:   { fieldSub: "sleepRollBonus" }
    },
    carcinogen: {
        labelKey: "CumulativeCarcinogen",
        flavor:   "The drug is a carcinogen. The character takes Rad points equal to the Strength Multiplier ×5 per dose taken. Excessive carcinogens can have nasty effects.",
        calc:     ""
    },
    amnesia: {
        labelKey: "CumulativeAmnesia",
        flavor:   "The character begins to forget things rapidly. Any time the character wants to remember something, make an INT check against the DL determined by the Strength Multiplier Total. If failed, the character cannot remember that information or incident.",
        calc:     "1d10 + INT vs Value",
        roll:     { kind: "check", stat: "int" }
    },
    flashbacks: {
        labelKey: "CumulativeFlashbacks",
        flavor:   "The character experiences vivid memories of the time spent under the influence. In a stressful situation, make a COOL check against the DL determined by the Strength Multiplier Total. If failed, the character has a flashback for 1d10 Turns during which no action is possible, and for 1d6 hours after their COOL is reduced by −2.",
        calc:     "1d10 + COOL vs Value",
        roll:     { kind: "check", stat: "cool" }
    },
    physicalAddiction: {
        labelKey: "CumulativePhysicalAddiction",
        flavor:   "The drug is physically addictive. Every use requires a BODY check against the DL determined by the Strength Multiplier Total. If failed, the character becomes physically addicted: a dose is needed every 8 hours or the character must make a Death Save (minus strength +2) every 24 hours for 1d6 days.",
        calc:     "1d10 + BODY vs Value",
        roll:     { kind: "check", stat: "bt" }
    },
    suicidal: {
        labelKey: "CumulativeSuicidal",
        flavor:   "The character begins to feel suicidal. Every use, make a COOL check against the DL determined by the Strength Multiplier Total. If failed, the character attempts suicide (GM adjudicates the outcome).",
        calc:     "1d10 + COOL vs Value",
        roll:     { kind: "check", stat: "cool" }
    }
};

/**
 * Drug strength → cumulative-value increment lookup. Applied once per
 * Onset→Active (or direct-apply→Active) transition, per cumulative key
 * carried by the drug.
 */
export const CUMULATIVE_STRENGTH_MUL = {
    1: 0.1,
    2: 0.2,
    3: 0.5,
    4: 1.0,
    5: 1.5,
    6: 2.0
};

/**
 * Cyberware types.
 *
 * The previous single `sensor` type fanned out into `optics` / `voice` / `audio`
 * so each kind has its own base/option grouping in the gear tab. The three
 * types are still displayed under one "Sensors" header (see character-sheet).
 */
export const cyberwareTypes = {
    cyberlimb: "CyberTypeCyberlimb",
    optics:    "CyberTypeOptics",
    voice:     "CyberTypeVoice",
    audio:     "CyberTypeAudio",
    implant:   "CyberTypeImplant",
    chipware:  "CyberTypeChipware"
};

/**
 * Cyberware subtypes by type.
 *
 *   - Cyberlimb subtype encodes role directly: arm/leg are bases, hand/feet/
 *     finger/builtIn are options. The legacy `isOption` boolean is no longer
 *     read (still in template.json as dead data for backward compat). For
 *     arm/leg, the `placement` field (left/right/extra) supplies the actual
 *     limb slot.
 *   - Sensor types (optics/voice/audio) each have a parallel base/option pair.
 *   - Implant / chipware unchanged.
 */
export const cyberwareSubtypes = {
    cyberlimb: {
        arm:     "CyberSubArm",
        leg:     "CyberSubLeg",
        hand:    "CyberSubHand",
        feet:    "CyberSubFeet",
        finger:  "CyberSubFinger",
        builtIn: "CyberSubBuiltIn"
    },
    optics:    { base: "CyberSubBase", option: "CyberSubOption" },
    voice:     { base: "CyberSubBase", option: "CyberSubOption" },
    audio:     { base: "CyberSubBase", option: "CyberSubOption" },
    implant: {
        fashionware: "CyberSubFashionware",
        neuralware: "CyberSubNeuralware",
        bioware: "CyberSubBioware",
        nanotech: "CyberSubNanotech",
        bodyImplant: "CyberSubBodyImplant",
        bodyWeapon: "CyberSubBodyWeapon",
        bodyPlating: "CyberSubBodyPlating",
        linearFrame: "CyberSubLinearFrame"
    },
    chipware: {
        skill: "CyberSubSkillChip",
        behavior: "CyberSubBehavior",
        storage: "CyberSubStorage"
    }
};

/** Cyberlimb base subtypes (each takes a `placement`). */
export const CYBERLIMB_BASE_SUBTYPES = new Set(["arm", "leg"]);

/** Cyberlimb option subtypes (attach to a base via `flags.cyberpunk.attachedTo`). */
export const CYBERLIMB_OPTION_SUBTYPES = new Set(["hand", "feet", "finger", "builtIn"]);

/** Cyberware types that participate in the "Sensors" gear-tab section. */
export const SENSOR_TYPES = new Set(["optics", "voice", "audio"]);

/** Placement values for cyberlimb bases. */
export const placementOptions = {
    left:  "PlacementLeft",
    right: "PlacementRight",
    extra: "PlacementExtra"
};

/**
 * Attachment rules: which (cyberware) bases an option may attach to.
 * Cyberlimb options route by subtype; sensor options route by type.
 *
 *   hand    → cyberlimb arm
 *   feet    → cyberlimb leg
 *   finger  → cyberlimb arm
 *   builtIn → cyberlimb arm OR cyberlimb leg
 *   optics-option → optics-base
 *   voice-option  → voice-base
 *   audio-option  → audio-base
 */
const CYBERLIMB_ATTACH_RULES = {
    hand:    new Set(["arm"]),
    feet:    new Set(["leg"]),
    finger:  new Set(["arm"]),
    builtIn: new Set(["arm", "leg"])
};

/** True if `item` is a cyberlimb base (arm or leg). */
export function isCyberlimbBase(item) {
    if (item?.type !== "cyberware") return false;
    return item.system?.cyberwareType === "cyberlimb"
        && CYBERLIMB_BASE_SUBTYPES.has(item.system?.cyberwareSubtype);
}

/** True if `item` is a cyberlimb option (hand/feet/finger/built-in). */
export function isCyberlimbOption(item) {
    if (item?.type !== "cyberware") return false;
    return item.system?.cyberwareType === "cyberlimb"
        && CYBERLIMB_OPTION_SUBTYPES.has(item.system?.cyberwareSubtype);
}

/** True if `item` is a sensor base (optics/voice/audio base). */
export function isSensorBase(item) {
    if (item?.type !== "cyberware") return false;
    return SENSOR_TYPES.has(item.system?.cyberwareType)
        && item.system?.cyberwareSubtype === "base";
}

/** True if `item` is a sensor option. */
export function isSensorOption(item) {
    if (item?.type !== "cyberware") return false;
    return SENSOR_TYPES.has(item.system?.cyberwareType)
        && item.system?.cyberwareSubtype === "option";
}

/**
 * True if `option` can attach to `base`. Both must be cyberware items.
 * The role check (option/base) is part of this — calling with two bases
 * or two options always returns false.
 */
export function canAttachOptionToBase(option, base) {
    if (!option || !base) return false;
    if (option.type !== "cyberware" || base.type !== "cyberware") return false;
    const ot = option.system?.cyberwareType;
    const os = option.system?.cyberwareSubtype;
    const bt = base.system?.cyberwareType;
    const bs = base.system?.cyberwareSubtype;

    if (ot === "cyberlimb") {
        if (bt !== "cyberlimb") return false;
        const allowed = CYBERLIMB_ATTACH_RULES[os];
        return !!(allowed && allowed.has(bs));
    }
    if (SENSOR_TYPES.has(ot)) {
        return ot === bt && os === "option" && bs === "base";
    }
    return false;
}

/** Surgery codes — CP2020 standard four-letter codes. */
export const surgeryCodes = {
    N: "SurgNegligible",
    M: "SurgMinor",
    MA: "SurgMajor",
    CR: "SurgCritical"
};

/**
 * Get subtypes for a given cyberware type
 * @param {string} cyberwareType - The cyberware type (sensor, cyberlimb, implant, chipware)
 * @returns {Object} Subtypes lookup object
 */
export function getCyberwareSubtypes(cyberwareType) {
    return cyberwareSubtypes[cyberwareType] || {};
}

/**
 * True if a (type, subtype) combination can host options (i.e. it's a base).
 * Cyberlimb arms/legs and sensor bases can; cyberlimb options, sensor
 * options, implants, and chipware never.
 */
export function canHaveOptions(cyberwareType, cyberwareSubtype) {
    if (cyberwareType === "cyberlimb") return CYBERLIMB_BASE_SUBTYPES.has(cyberwareSubtype);
    if (SENSOR_TYPES.has(cyberwareType)) return cyberwareSubtype === "base";
    return false;
}

/**
 * True if a (type, subtype) combination can carry an embedded weapon
 * (system.isWeapon → renders Weapon tab on the sheet).
 *
 *   - All implants (book is broad on this)
 *   - Cyberlimb options: hand, feet, finger, built-in
 *   - Sensor options (any of optics / voice / audio)
 */
export function canBeWeapon(cyberwareType, cyberwareSubtype) {
    if (cyberwareType === "implant") return true;
    if (cyberwareType === "cyberlimb") return CYBERLIMB_OPTION_SUBTYPES.has(cyberwareSubtype);
    if (SENSOR_TYPES.has(cyberwareType)) return cyberwareSubtype === "option";
    return false;
}

/**
 * True if a (type, subtype) can carry an embedded armor block.
 *   - Implants always (body plating, subcutaneous plates, etc.)
 *   - Optics Base (armored face plate over the optics)
 *   - Cyberlimb Built-in option (armor-clad built-in fitting on a limb)
 */
export function canBeArmor(cyberwareType, cyberwareSubtype) {
    if (cyberwareType === "implant") return true;
    if (cyberwareType === "optics" && cyberwareSubtype === "base") return true;
    if (cyberwareType === "cyberlimb" && cyberwareSubtype === "builtIn") return true;
    return false;
}

/**
 * True if a cyberware item requires the `placement` field (Left/Right/Extra).
 * Only cyberlimb arm/leg bases — every other subtype ignores placement.
 */
export function isPlacementRequired(cyberwareType, cyberwareSubtype) {
    return cyberwareType === "cyberlimb" && CYBERLIMB_BASE_SUBTYPES.has(cyberwareSubtype);
}

/**
 * Weapon effects. Despite the legacy name "weaponEffects" this is now the
 * key. Used by every Effect dropdown across Martial / Ranged / Exotic /
 * Ordnance / Ammo sheets.
 */
export const weaponEffects = {
    none: "EffNone",
    // Unified drug applicator — the three fixed gas conditions
    // (confusion / poisoned / tearing) it replaced were retired after
    // the 2.7.0 compendium migration. When selected the weapon shows
    // a drop slot for an inhaled/contact drug item; on a failed Poison
    // Save the drug is applied to the target with its own onset /
    // duration / bonuses. Ignore-Gas-Effects still suppresses the save.
    drug: "EffDrug",
    unconscious: "EffUnconscious",
    stunAt0: "EffStunAt0",
    stunAt1: "EffStunAt1",
    stunAt2: "EffStunAt2",
    stunAt3: "EffStunAt3",
    stunAt4: "EffStunAt4",
    deathAt0: "EffDeathAt0",
    burning: "EffBurning",
    microwave: "EffMicrowave",
    acid: "EffAcid",
    blindness: "EffBlindness",
    laser: "EffLaser",
    immobilized: "EffImmobilized",
    smoke: "EffSmoke",
    light: "EffLight"
};

export function getStatNames() {
    // v13+
    const docTypes = game?.system?.documentTypes?.Actor;
    if (docTypes) {
        if (docTypes.character?.stats)
            return Object.keys(docTypes.character.stats);
        if (docTypes.templates?.stats?.stats)
            return Object.keys(docTypes.templates.stats.stats);
    }
    // v11–v12
    const tpl = CONFIG?.Actor?.template;
    if (tpl?.templates?.stats?.stats)
        return Object.keys(tpl.templates.stats.stats);
    if (tpl?.character?.stats)
        return Object.keys(tpl.character.stats);
    return ["int", "ref", "tech", "cool", "attr", "luck", "ma", "bt", "emp"];
}

// Attack-type sub-enums (used for fire-mode dispatch, AoE behavior, etc.)
export let rangedAttackTypes = {
    auto: "Auto",
    paint: "Paint",
    drugs: "Drugs",
    acid: "Acid",
    taser: "Taser",
    dart: "Dart",
    squirt: "Squirt",
    throwable: "Throw",
    archer: "Archer",
    laser: "Laser",
    microwave: "Microwave",
    shotgun: "Shotgun",
    autoshotgun: "Autoshotgun",
    grenade: "Grenade",
    gas: "Gas",
    flamethrow: "Flamethrow",
    landmine: "Landmine",
    claymore: "Claymore",
    rpg: "RPG",
    missile: "Missile",
    explosiveCharge: "Explocharge"
};

export let meleeAttackTypes = {
    melee: "Melee",
    mono: "Mono",
    martial: "Martial",
    cyberbeast: "Beast"
};

export let sortedAttackTypes = Object.values(rangedAttackTypes).concat(Object.values(meleeAttackTypes)).sort();

export let concealability = {
    hidden: "ConcealHidden",
    pocket: "ConcealPocket",
    jacket: "ConcealJacket",
    longcoat: "ConcealLongcoat",
    noHide: "ConcealNoHide"
};

export let availability = {
    common: "Common",
    limited: "Limited",
    exclusive: "Exclusive",
    iconic: "Iconic"
};

/**
 * Drug flavour enums — pure roleplay/GM-info dropdowns on the Drug tab.
 * No mechanical effect; the values feed labels only.
 */
export const drugMethods = {
    ingested: "DrugMethodIngested",
    injected: "DrugMethodInjected",
    inhaled:  "DrugMethodInhaled",
    contact:  "DrugMethodContact"
};

export const drugDetections = {
    distinctive: "DrugDetectionDistinctive",
    noticeable:  "DrugDetectionNoticeable",
    faint:       "DrugDetectionFaint",
    veryFaint:   "DrugDetectionVeryFaint",
    invisible:   "DrugDetectionInvisible"
};

export const drugResidues = {
    ample:     "DrugResidueAmple",
    normal:    "DrugResidueNormal",
    little:    "DrugResidueLittle",
    onlyTrace: "DrugResidueOnlyTrace",
    noTrace:   "DrugResidueNoTrace"
};

export let reliability = {
    very: "VeryReliable",
    standard: "Standard",
    unreliable: "Unreliable"
};

export let fireModes = {
    fullAuto: "FullAuto",
    threeRoundBurst: "ThreeRoundBurst",
    twoRoundBurst: "TwoRoundBurst",
    singleShot: "SingleShot"
};

export let martialActions = {
    dodge: "Dodge",
    blockParry: "BlockParry",
    strike: "Strike",
    kick: "Kick",
    disarm: "Disarm",
    sweepTrip: "SweepTrip",
    grapple: "Grapple",
    hold: "Hold",
    choke: "Choke",
    throw: "Throw",
    escape: "Escape"
};

export let ranges = {
    pointBlank: "RangePointBlank",
    close: "RangeClose",
    medium: "RangeMedium",
    long: "RangeLong",
    extreme: "RangeExtreme"
};
let rangeDCs = {};
rangeDCs[ranges.pointBlank] = 10;
rangeDCs[ranges.close] = 15;
rangeDCs[ranges.medium] = 20;
rangeDCs[ranges.long] = 25;
rangeDCs[ranges.extreme] = 30;
let rangeResolve = {};
rangeResolve[ranges.pointBlank] = range => 1;
rangeResolve[ranges.close] = range => range/4;
rangeResolve[ranges.medium] = range => range/2;
rangeResolve[ranges.long] = range => range;
rangeResolve[ranges.extreme] = range => range*2;
export { rangeDCs, rangeResolve };

export let defaultTargetLocations = ["Head", "Torso", "lArm", "rArm", "lLeg", "rLeg"];
export let areaLookupTable = {
    1: "Head",
    2: "Torso",
    3: "Torso",
    4: "Torso",
    5: "rArm",
    6: "lArm",
    7: "lLeg",
    8: "lLeg",
    9: "rLeg",
    10: "rLeg"
};

export function hitLocationDefaults() {
    const actorDocs = game?.system?.documentTypes?.Actor;
    const tpl = actorDocs?.templates?.hitLocations?.hitLocations;
    if (tpl) return tpl;
    const chr = actorDocs?.character?.hitLocations;
    if (chr) return chr;
    return {
        Head: { location: [1], stoppingPower: 0, ablation: 0},
        Torso: { location: [2, 4], stoppingPower: 0, ablation: 0},
        lArm: { location: [6], stoppingPower: 0, ablation: 0},
        rArm: { location: [5], stoppingPower: 0, ablation: 0},
        lLeg: { location: [7, 8], stoppingPower: 0, ablation: 0},
        rLeg: { location: [9, 10], stoppingPower: 0, ablation: 0}
    };
}

export function buildRangedModifierGroups(weapon, targetTokens=[]) {
    let range = weapon.system.range || 50;
    let fireModes = weapon._availableFireModes() || [];
    return [
        [{
            localKey: "FireMode",
            dataPath: "fireMode",
            choices: fireModes,
            defaultValue: fireModes[0]
        },
        {
            localKey: "Range",
            dataPath: "range",
            defaultValue: "RangeClose",
            choices: [
                {value:"RangePointBlank", localData: {range: 1}},
                {value:"RangeClose", localData: {range: range/4}},
                {value:"RangeMedium", localData: {range: range/2}},
                {value:"RangeLong", localData: {range: range}},
                {value:"RangeExtreme", localData: {range: range*2}}
            ]
        }],
        [{
            localKey: "Aiming",
            dataPath: "aimRounds",
            defaultValue: 0,
            choices: [0,1,2,3].map(x => {
                return { value: x, localKey: "Rounds", localData: {rounds: x}}
            }),
        },
        {
            localKey: "TargetArea",
            dataPath: "targetArea",
            defaultValue: "",
            choices: defaultTargetLocations,
            allowBlank: true
        },
        {localKey:"Ambush", dataPath:"ambush",defaultValue: false},
        {localKey:"Blinded", dataPath:"blinded",defaultValue: false},
        {localKey:"DualWield", dataPath:"dualWield",defaultValue: false},
        {localKey:"FastDraw", dataPath:"fastDraw",defaultValue: false},
        {localKey:"Hipfire", dataPath:"hipfire",defaultValue: false},
        {localKey:"Ricochet", dataPath:"ricochet",defaultValue: false},
        {localKey:"Running", dataPath:"running",defaultValue: false},
        {localKey:"TurnFace", dataPath:"turningToFace",defaultValue: false},
        {
            localKey: "TargetsCount",
            dataPath:"targetsCount",
            dtype:"Number",
            defaultValue: Math.max(1, targetTokens.length)
        },
        ]
    ];
}

export function buildMartialModifierGroups(actor) {
    return [
        [{
            localKey: "Action",
            dataPath: "action",
            choices: [
                {groupName: "Defensive", choices: [
                    "Dodge",
                    "BlockParry"
                ]},
                {groupName: "Attacks", choices: [
                    "Strike",
                    "Kick",
                    "Disarm",
                    "SweepTrip"
                ]},
                {groupName: "Grapple", choices: [
                    "Grapple",
                    "Hold",
                    "Choke",
                    "Throw",
                    "Escape"
                ]}
            ]
        },
        {
            localKey: "MartialArt",
            dataPath: "martialArt",
            choices: [{value: game.i18n.localize("CYBERPUNK.SkillBrawling"), localKey: "SkillBrawling"}, ...(actor.getLearnedMartialArts().map(martialName => {
                return {value: martialName, localKey: "Skill" + getMartialKeyByName(martialName)}
            }))]
        },
        {
            localKey: "CyberTerminus",
            dataPath: "cyberTerminus",
            defaultValue: "NoCyberlimb",
            choices: [
                { value: "NoCyberlimb", localKey: "NoCyberlimb" },
                { value: "CyberTerminusX2", localKey: "CyberTerminusX2" },
                { value: "CyberTerminusX3", localKey: "CyberTerminusX3" }
            ]
        }
    ]];
}

export function buildMeleeModifierGroups() {
    return [[
        {
            localKey: "TargetArea",
            dataPath: "targetArea",
            defaultValue: "",
            choices: defaultTargetLocations,
            allowBlank: true
        },
        {
            localKey: "CyberTerminus",
            dataPath: "cyberTerminus",
            defaultValue: "NoCyberlimb",
            choices: [
                { value: "NoCyberlimb", localKey: "NoCyberlimb" },
                { value: "CyberTerminusX2", localKey: "CyberTerminusX2" },
                { value: "CyberTerminusX3", localKey: "CyberTerminusX3" }
            ]
        }
    ]];
}

/**
 * BTM lookup — non-linear thresholds require explicit mapping.
 */
export function bodyTypeModifier(body) {
    if (body <= 2) return 0;
    switch (body) {
        case 3:
        case 4: return 1;
        case 5:
        case 6:
        case 7: return 2;
        case 8:
        case 9: return 3;
        case 10: return 4;
        default: return 5;
    }
}

/**
 * CP2020 melee damage bonus, indexed off raw BODY for consistency. Up through
 * body 10 the bonus tracks BTM (BTM − 2). Beyond that the BTM cap stops moving
 * but the melee bonus continues to scale in pairs of body values, so we
 * dispatch on bt itself rather than BTM. Returns -2…+8.
 */
export function meleeDamageBonus(bt) {
    if (bt <= 10) return bodyTypeModifier(bt) - 2;
    if (bt <= 12) return 4;
    if (bt <= 14) return 6;
    return 8;
}

// ============================================================================
// DEPRECATED — backward-compat shims used during the weapon-overhaul rollout.
// Will be removed once all consumers move to the new taxonomy.
// ============================================================================

/** @deprecated Use CALIBERS_BY_AMMO_CLASS instead. Keyed by legacy lowercase ammo weaponType. */
export const ammoCalibersByWeaponType = {
    pistol:   { light: "CaliberLight", medium: "CaliberMedium", heavy: "CaliberHeavy", veryHeavy: "CaliberVeryHeavy" },
    rifle:    { light: "CaliberLight", medium: "CaliberMedium", assault: "CaliberAssault", sniper: "CaliberSniper", antiMateriel: "CaliberAntiMateriel" },
    shotgun:  { light: "CaliberLight", medium: "CaliberMedium", heavy: "CaliberHeavy" },
    heavy:    { light: "CaliberLight", medium: "CaliberMedium", heavy: "CaliberHeavy", autocannon: "CaliberAutocannon" },
    bow:      { arrow: "CaliberArrow" },
    crossbow: { bolt: "CaliberBolt" }
};

/** @deprecated Use WEAPON_TO_AMMO_CLASS instead. Maps legacy uppercase weaponType → lowercase ammo weaponType. */
export const weaponToAmmoType = {
    "Pistol": "pistol",
    "SMG": "pistol",
    "Shotgun": "shotgun",
    "Rifle": "rifle",
    "Heavy": "heavy",
    "Bow": "bow",
    "Crossbow": "crossbow",
    "Melee": null,
    "Exotic": null
};

/**
 * Get base damage formula for Ram attack based on BODY stat
 */
export function ramBaseDamage(body) {
    if (body <= 2) return "1d6-2";
    if (body <= 4) return "1d6-1";
    if (body === 5) return "1d6";
    if (body <= 7) return "2d6";
    if (body <= 9) return "2d6+1";
    if (body === 10) return "2d6+2";
    if (body <= 12) return "3d6+4";
    if (body <= 14) return "3d6+6";
    if (body === 15) return "3d6+8";
    if (body <= 20) return "4d6+8";
    const extraDice = body - 20;
    return `${4 + extraDice}d6+8`;
}
