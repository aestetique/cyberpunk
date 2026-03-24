/**
 * Token Action HUD constants for the Cyberpunk 2020 system.
 * Defines action types, groups, and default layout.
 */

export const REQUIRED_CORE_MODULE_VERSION = "2.0";

/**
 * Action type identifiers — used in encodedValue as the first segment.
 */
export const ACTION_TYPE = {
    attribute: "attribute",
    skill: "skill",
    weapon: "weapon",
    unarmed: "unarmed",
    ordnance: "ordnance",
    save: "save",
    condition: "condition",
    utility: "utility"
};

/**
 * Group definitions — each group appears as a subcategory in the HUD.
 */
export const GROUP = {
    // Skills parent
    attributes: { id: "attributes", name: "Attributes", type: "system" },
    skills: { id: "skills", name: "Skills", type: "system" },

    // Weapons parent
    unarmed: { id: "unarmed", name: "Unarmed", type: "system" },
    ranged: { id: "ranged", name: "Ranged", type: "system" },
    melee: { id: "melee", name: "Melee", type: "system" },
    exotic: { id: "exotic", name: "Exotic", type: "system" },
    ordnance: { id: "ordnance", name: "Ordnance", type: "system" },

    // Conditions parent
    cover: { id: "cover", name: "Cover", type: "system" },
    lostLimbs: { id: "lostLimbs", name: "Lost Limbs", type: "system" },
    actions: { id: "actions", name: "Actions", type: "system" },
    netrunning: { id: "netrunning", name: "Netrunning", type: "system" },
    mental: { id: "mental", name: "Mental", type: "system" },
    conditions: { id: "conditions", name: "Conditions", type: "system" },

    // Utility parent
    initiative: { id: "initiative", name: "Initiative", type: "system" },
    saves: { id: "saves", name: "Saves", type: "system" },
    stress: { id: "stress", name: "Stress", type: "system" },
    fright: { id: "fright", name: "Fright", type: "system" },
    fatigue: { id: "fatigue", name: "Fatigue", type: "system" },
    sleep: { id: "sleep", name: "Sleep", type: "system" }
};

/**
 * Condition IDs that are applied automatically by the system and should be
 * hidden from the manual toggle list in the HUD.
 */
export const AUTO_CONDITIONS = new Set([
    // Wounds (set by updateWoundStatus)
    "lightly-wounded", "seriously-wounded", "critically-wounded",
    "mortally-wounded-0", "mortally-wounded-1", "mortally-wounded-2",
    "mortally-wounded-3", "mortally-wounded-4", "mortally-wounded-5", "mortally-wounded-6",
    // Stress (set by updateStressStatus)
    "fresh", "anxious", "tense", "stressed", "cracked",
    // Fatigue (set by updateFatigueStatus)
    "tired", "fatigued", "exhausted", "debilitated", "collapse",
    // Sleep deprivation (set by updateSleepDeprivationStatus)
    "sleep-dep-1", "sleep-dep-2", "sleep-dep-3", "sleep-dep-4", "sleep-dep-5", "sleep-dep-6"
]);

/**
 * Cover condition IDs.
 */
export const COVER_CONDITIONS = new Set([
    "cover-5", "cover-10", "cover-15", "cover-20",
    "cover-25", "cover-30", "cover-35", "cover-40"
]);

/**
 * Lost limb condition IDs.
 */
export const LOST_LIMB_CONDITIONS = new Set([
    "lost-left-arm", "lost-right-arm", "lost-left-leg", "lost-right-leg"
]);

/**
 * Action modifier conditions (Fast Draw, Action Surge).
 */
export const ACTION_CONDITIONS = new Set([
    "fast-draw", "action-surge"
]);

/**
 * Netrunning condition IDs.
 */
export const NETRUNNING_CONDITIONS = new Set([
    "jacked-in", "scrambled", "desynced", "gridlocked", "lagging", "tagged"
]);

/**
 * Mental condition IDs.
 */
export const MENTAL_CONDITIONS = new Set([
    "surprised", "frightened", "fleeing", "insomnia", "insane"
]);

/**
 * Stat keys used in the system, in display order.
 */
export const STAT_KEYS = ["int", "ref", "tech", "cool", "attr", "luck", "ma", "bt", "emp"];

/**
 * Stat abbreviation to full localization key mapping.
 */
export const STAT_LABELS = {
    int: "CYBERPUNK.IntFull",
    ref: "CYBERPUNK.RefFull",
    tech: "CYBERPUNK.TechFull",
    cool: "CYBERPUNK.CoolFull",
    attr: "CYBERPUNK.AttrFull",
    luck: "CYBERPUNK.LuckFull",
    ma: "CYBERPUNK.MaFull",
    bt: "CYBERPUNK.BtFull",
    emp: "CYBERPUNK.EmpFull"
};
