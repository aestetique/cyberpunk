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
    "Sub Machinegun": ["SubMachinegun"],
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
    submachineGuns:      ["Sub Machinegun"],
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

/**
 * Legacy compat: attackSkills keyed by the OLD weaponType strings
 * ("Pistol", "SMG", "Heavy", etc.) — old item.js / dialogs still use this
 * shape until they migrate to getAttackSkillsForWeapon(type, class).
 * @deprecated Use getAttackSkillsForWeapon(weaponType, weaponClass).
 */
export const attackSkills = (() => {
    const out = {};
    const legacy = {
        "Pistol":   "pistols",
        "SMG":      "submachineGuns",
        "Shotgun":  "shotguns",
        "Rifle":    "rifles",
        "Heavy":    "heavyWeapons",
        "Bow":      "bows",
        "Crossbow": "crossbows",
        "Melee":    "meleeAttacks",
        "Exotic":   null
    };
    for (const [wType, catKey] of Object.entries(legacy)) {
        if (wType === "Exotic") {
            const all = new Set();
            for (const [, ck] of Object.entries(legacy)) {
                if (!ck) continue;
                for (const n of SKILL_MAPPINGS[ck] || []) all.add(n);
            }
            all.delete("Brawling");
            out[wType] = [...all].sort();
        } else {
            out[wType] = catKey ? [...(SKILL_MAPPINGS[catKey] || [])] : [];
        }
    }
    // Bridge new discriminator keys → unions of underlying skill categories.
    // Lets legacy spreads like `attackSkills[wType]` work for new "Ranged"/"Martial"/etc. data.
    out.Ranged   = [...new Set([out.Pistol, out.SMG, out.Shotgun, out.Rifle, out.Heavy].flat())].sort();
    out.Martial  = [...new Set([out.Melee, out.Bow, out.Crossbow, ...(SKILL_MAPPINGS.unarmedAttacks || []), ...(SKILL_MAPPINGS.slings || [])].flat())].sort();
    out.Ordnance = [...new Set([
        ...(SKILL_MAPPINGS.throw || []), ...(SKILL_MAPPINGS.demolitionsSkills || []),
        ...(SKILL_MAPPINGS.heavyWeapons || [])
    ])].sort();
    out.Ammo     = [];
    return out;
})();

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

/**
 * Maps a Ranged weapon's weaponClass → the ammoClass that chambers in it.
 * Compatibility is caliber-based so this is now informational; kept so callers
 * that infer "ammo family" from class still work after the class enum expanded.
 */
export const WEAPON_TO_AMMO_CLASS = {
    Pistol:           "Pistol",
    SubMachinegun:    "Pistol",
    AssaultRifle:     "Rifle",
    SniperRifle:      "Rifle",
    Shotgun:          "Shotgun",
    AntiMateriel:     "Heavy",
    Autocannon:       "Heavy",
    GrenadeLauncher:  "Heavy",
    Machinegun:       "Heavy",
    Minigun:          "Heavy",
    Bow:              "Bow",
    Crossbow:         "Crossbow"
};

/**
 * Can this weapon chamber this ammo?
 * Compatibility is caliber-based — both must share the same caliber slug.
 * @param {Item} weapon
 * @param {Item} ammo
 * @returns {boolean}
 */
export function isAmmoCompatibleWith(weapon, ammo) {
    if (!weapon || !ammo) return false;
    const wd = weapon.system;
    const ad = ammo.system;
    if (ad?.weaponType !== "Ammo") return false;
    if (!wd?.caliber || !ad?.caliber) return false;
    return wd.caliber === ad.caliber;
}

/**
 * Validity matrix: which ammo types are valid for an ammo (weaponClass, caliber).
 */
export function isAmmoTypeValid(weaponClass, caliber, ammoType) {
    if (ammoType === "standard") return true;
    if (ammoType === "grenade") return false; // Grenade is its own class — only valid on grenade-style ammo with a template
    if (weaponClass === "Bow" || weaponClass === "Crossbow") {
        return ammoType === "armorPiercing" || ammoType === "rubberSlug";
    }
    if (weaponClass === "Shotgun") {
        return ammoType === "rubberSlug";
    }
    if (weaponClass === "Heavy" && ammoType === "hollowPoint") return false;
    if (weaponClass === "Rifle" && ammoType === "hollowPoint" && ["sniper", "antiMateriel"].includes(caliber)) return false;
    if (ammoType === "rubberSlug") {
        return weaponClass === "Pistol" && ["light", "medium", "heavy"].includes(caliber);
    }
    return true;
}

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

/**
 * Get the actor's Interface skill rank from the mapping.
 * @param {Actor} actor
 * @returns {number} Skill rank, or 0 if not found.
 */
export function getInterfaceSkillRank(actor) {
    const names = getSkillsForCategory("interfaceSkills");
    if (!names.length) return 0;
    const skill = actor.itemTypes.skill?.find(s => names.includes(s.name));
    return Number(skill?.system?.level) || 0;
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

/** Tool bonus properties — actor property paths a tool can modify */
export const toolBonusProperties = {
    "stats.int.tempMod": "PropINT",
    "stats.ref.tempMod": "PropREF",
    "stats.tech.tempMod": "PropTECH",
    "stats.cool.tempMod": "PropCOOL",
    "stats.attr.tempMod": "PropATTR",
    "stats.luck.tempMod": "PropLUCK",
    "stats.ma.tempMod": "PropMA",
    "stats.bt.tempMod": "PropBT",
    "stats.emp.tempMod": "PropEMP",
    "initiativeMod": "PropInitiative",
    "stunSaveMod": "PropStunSave",
    "deathSaveMod": "PropDeathSave",
    "poisonSaveMod": "PropPoisonSave",
    "unarmedDamageMultiplier": "PropUnarmedMultiplier",
    "healingRateBoost": "PropHealingRateBoost",
    "stayAwakeBonus": "PropStayAwakeBonus",
    "fallAsleepBonus": "PropFallAsleepBonus",
    "bonusActions": "PropBonusActions",
    "ignoreStressFright": "PropIgnoreStressFright",
    "ignoreFatigue": "PropIgnoreFatigue"
};

/** Netware types */
export const netwareTypes = {
    cyberdeck: "NetwareTypeCyberdeck",
    upgrade: "NetwareTypeUpgrade",
    program: "NetwareTypeProgram"
};

/** Program subtypes (when netwareType === "program") */
export const programSubtypes = {
    booster: "ProgramSubBooster",
    defender: "ProgramSubDefender",
    attacker: "ProgramSubAttacker"
};

/** Booster bonus types */
export const boosterBonuses = {
    scanner: "BoosterScanner",
    backdoor: "BoosterBackdoor",
    cloak: "BoosterCloak",
    control: "BoosterControl",
    eyedee: "BoosterEyeDee",
    pathfinder: "BoosterPathfinder",
    slide: "BoosterSlide",
    speed: "BoosterSpeed",
    zap: "BoosterZap"
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

/** Attacker effect types */
export const attackerEffects = {
    none: "EffectNone",
    gridlocked: "EffectGridlocked",
    scrambled: "EffectScrambled",
    desynced: "EffectDesynced",
    lagging: "EffectLagging",
    tagged: "EffectTagged",
    burning: "EffectBurning",
    crashed: "EffectCrashed"
};

/** Cyberware types */
export const cyberwareTypes = {
    sensor: "CyberTypeSensor",
    cyberlimb: "CyberTypeCyberlimb",
    implant: "CyberTypeImplant",
    chipware: "CyberTypeChipware"
};

/** Cyberware subtypes by type */
export const cyberwareSubtypes = {
    sensor: {
        voice: "CyberSubVoice",
        audio: "CyberSubAudio",
        optics: "CyberSubOptics"
    },
    cyberlimb: {
        leftArm: "CyberSubLeftArm",
        rightArm: "CyberSubRightArm",
        leftLeg: "CyberSubLeftLeg",
        rightLeg: "CyberSubRightLeg",
        extraArm: "CyberSubExtraArm",
        meatLimbs: "CyberSubMeatLimbs"
    },
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

/** Surgery codes */
export const surgeryCodes = {
    N: "SurgHarmless",
    M: "SurgNegligible",
    MA: "SurgMinor",
    CR: "SurgMajor",
    CRP: "SurgCritical"
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
 * Check if cyberware type can have options (slots/spaces)
 */
export function canHaveOptions(cyberwareType) {
    return cyberwareType === "sensor" || cyberwareType === "cyberlimb";
}

/**
 * Check if cyberware type can be a weapon
 */
export function canBeWeapon(cyberwareType, isOption) {
    if (cyberwareType === "implant") return true;
    if ((cyberwareType === "sensor" || cyberwareType === "cyberlimb") && isOption) return true;
    return false;
}

/**
 * Check if cyberware type can be armor
 */
export function canBeArmor(cyberwareType) {
    return cyberwareType === "implant";
}

/** Exotic weapon effects */
export const exoticEffects = {
    none: "EffNone",
    confusion: "EffConfusion",
    poisoned: "EffPoisoned",
    tearing: "EffTearing",
    unconscious: "EffUnconscious",
    stunAt2: "EffStunAt2",
    stunAt4: "EffStunAt4",
    burning: "EffBurning",
    microwave: "EffMicrowave",
    acid: "EffAcid",
    blindness: "EffBlindness",
    laser: "EffLaser",
    immobilized: "EffImmobilized"
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

export let reliability = {
    very: "VeryReliable",
    standard: "Standard",
    unreliable: "Unreliable"
};

export let fireModes = {
    fullAuto: "FullAuto",
    threeRoundBurst: "ThreeRoundBurst",
    twoRoundBurst: "TwoRoundBurst",
    suppressive: "Suppressive",
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
        {localKey:"FireZoneWidth",  dataPath:"zoneWidth",  dtype:"Number", defaultValue: 2},
        {localKey:"RoundsFiredLbl", dataPath:"roundsFired", dtype:"Number", defaultValue: weapon.system.rof},
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
    if(body <= 2) {
        return 0;
    }
    switch(body) {
        case 2: return 0;
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

export function meleeDamageBonus(bt) {
    let btm = bodyTypeModifier(bt);
    if(btm < 5)
        return btm - 2;
    switch(bt) {
        case 11:
        case 12: return 4;
        case 13:
        case 14: return 6;
        default: return 8;
    }
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
