/**
 * Cyberpunk 2020 Conditions System
 * Defines status effects for wounds, shock, and death
 */

/**
 * All condition IDs that represent wound states (for easy iteration)
 */
export const WOUND_CONDITION_IDS = [
    "lightly-wounded",
    "seriously-wounded",
    "critically-wounded",
    "mortally-wounded-0",
    "mortally-wounded-1",
    "mortally-wounded-2",
    "mortally-wounded-3",
    "mortally-wounded-4",
    "mortally-wounded-5",
    "mortally-wounded-6"
];

/**
 * Map wound state (1-10) to condition ID
 */
export const WOUND_STATE_TO_CONDITION = {
    1: "lightly-wounded",
    2: "seriously-wounded",
    3: "critically-wounded",
    4: "mortally-wounded-0",
    5: "mortally-wounded-1",
    6: "mortally-wounded-2",
    7: "mortally-wounded-3",
    8: "mortally-wounded-4",
    9: "mortally-wounded-5",
    10: "mortally-wounded-6"
};

/**
 * Cover type definitions: key -> { sp, label, desc }
 */
export const COVER_TYPES = {
    drywall:  { sp: 5,  label: "Drywall",  desc: "Thin interior wall. Reduces incoming damage by 5." },
    concrete: { sp: 10, label: "Concrete", desc: "Solid concrete barrier. Reduces incoming damage by 10." },
    hardwood: { sp: 15, label: "Hardwood", desc: "Heavy wooden furniture or wall. Reduces incoming damage by 15." },
    steel:    { sp: 20, label: "Steel",    desc: "Steel door or plate. Reduces incoming damage by 20." },
    brick:    { sp: 25, label: "Brick",    desc: "Brick wall. Reduces incoming damage by 25." },
    stone:    { sp: 30, label: "Stone",    desc: "Stone wall or pillar. Reduces incoming damage by 30." },
    utility:  { sp: 35, label: "Utility",  desc: "Utility pole or heavy machinery. Reduces incoming damage by 35." },
    kevlar:   { sp: 40, label: "Kevlar",   desc: "Kevlar-reinforced barricade. Reduces incoming damage by 40." }
};

/**
 * All condition IDs that represent cover states (for easy iteration)
 */
export const COVER_CONDITION_IDS = Object.values(COVER_TYPES).map(c => `cover-${c.sp}`);

/**
 * Map cover key (e.g. "drywall") to condition ID (e.g. "cover-5")
 */
export const COVER_KEY_TO_CONDITION = Object.fromEntries(
    Object.entries(COVER_TYPES).map(([key, { sp }]) => [key, `cover-${sp}`])
);

/**
 * Condition definitions for CONFIG.statusEffects
 * These appear in the token HUD and can be toggled on tokens
 */
export const CYBERPUNK_CONDITIONS = [
    {
        id: "lightly-wounded",
        name: "CYBERPUNK.Conditions.LightlyWounded",
        img: "systems/cyberpunk/img/conditions/light.svg",
        statuses: ["lightly-wounded"]
    },
    {
        id: "seriously-wounded",
        name: "CYBERPUNK.Conditions.SeriouslyWounded",
        img: "systems/cyberpunk/img/conditions/serious.svg",
        statuses: ["seriously-wounded"]
    },
    {
        id: "critically-wounded",
        name: "CYBERPUNK.Conditions.CriticallyWounded",
        img: "systems/cyberpunk/img/conditions/critical.svg",
        statuses: ["critically-wounded"]
    },
    {
        id: "mortally-wounded-0",
        name: "CYBERPUNK.Conditions.MortallyWounded0",
        img: "systems/cyberpunk/img/conditions/mortal0.svg",
        statuses: ["mortally-wounded-0"]
    },
    {
        id: "mortally-wounded-1",
        name: "CYBERPUNK.Conditions.MortallyWounded1",
        img: "systems/cyberpunk/img/conditions/mortal1.svg",
        statuses: ["mortally-wounded-1"]
    },
    {
        id: "mortally-wounded-2",
        name: "CYBERPUNK.Conditions.MortallyWounded2",
        img: "systems/cyberpunk/img/conditions/mortal2.svg",
        statuses: ["mortally-wounded-2"]
    },
    {
        id: "mortally-wounded-3",
        name: "CYBERPUNK.Conditions.MortallyWounded3",
        img: "systems/cyberpunk/img/conditions/mortal3.svg",
        statuses: ["mortally-wounded-3"]
    },
    {
        id: "mortally-wounded-4",
        name: "CYBERPUNK.Conditions.MortallyWounded4",
        img: "systems/cyberpunk/img/conditions/mortal4.svg",
        statuses: ["mortally-wounded-4"]
    },
    {
        id: "mortally-wounded-5",
        name: "CYBERPUNK.Conditions.MortallyWounded5",
        img: "systems/cyberpunk/img/conditions/mortal5.svg",
        statuses: ["mortally-wounded-5"]
    },
    {
        id: "mortally-wounded-6",
        name: "CYBERPUNK.Conditions.MortallyWounded6",
        img: "systems/cyberpunk/img/conditions/mortal6.svg",
        statuses: ["mortally-wounded-6"]
    },
    {
        id: "shocked",
        name: "CYBERPUNK.Conditions.Shocked",
        img: "systems/cyberpunk/img/conditions/shocked.svg",
        statuses: ["shocked"]
    },
    {
        // Drone-specific: drone is offline / cannot act. No automatic stat changes.
        id: "disabled",
        name: "CYBERPUNK.Conditions.Disabled",
        img: "systems/cyberpunk/img/conditions/disabled.svg",
        statuses: ["disabled"]
    },
    {
        id: "dead",
        name: "CYBERPUNK.Conditions.Dead",
        img: "systems/cyberpunk/img/conditions/dead.svg",
        statuses: ["dead"]
    },
    {
        id: "stabilized",
        name: "CYBERPUNK.Conditions.Stabilized",
        img: "systems/cyberpunk/img/conditions/stabilized.svg",
        statuses: ["stabilized"]
    },
    {
        id: "lost-left-arm",
        name: "CYBERPUNK.Conditions.LostLeftArm",
        img: "systems/cyberpunk/img/conditions/lost-left-arm.svg",
        statuses: ["lost-left-arm"]
    },
    {
        id: "lost-right-arm",
        name: "CYBERPUNK.Conditions.LostRightArm",
        img: "systems/cyberpunk/img/conditions/lost-right-arm.svg",
        statuses: ["lost-right-arm"]
    },
    {
        id: "lost-left-leg",
        name: "CYBERPUNK.Conditions.LostLeftLeg",
        img: "systems/cyberpunk/img/conditions/lost-left-leg.svg",
        statuses: ["lost-left-leg"]
    },
    {
        id: "lost-right-leg",
        name: "CYBERPUNK.Conditions.LostRightLeg",
        img: "systems/cyberpunk/img/conditions/lost-right-leg.svg",
        statuses: ["lost-right-leg"]
    },
    {
        id: "fast-draw",
        name: "CYBERPUNK.Conditions.FastDraw",
        img: "systems/cyberpunk/img/conditions/fast-draw.svg",
        statuses: ["fast-draw"]
    },
    {
        id: "action-surge",
        name: "CYBERPUNK.Conditions.ActionSurge",
        img: "systems/cyberpunk/img/conditions/action-surge.svg",
        statuses: ["action-surge"]
    },
    {
        id: "poisoned",
        name: "CYBERPUNK.Conditions.Poisoned",
        img: "systems/cyberpunk/img/conditions/poisoned.svg",
        statuses: ["poisoned"]
    },
    {
        id: "confused",
        name: "CYBERPUNK.Conditions.Confused",
        img: "systems/cyberpunk/img/conditions/confused.svg",
        statuses: ["confused"]
    },
    {
        id: "tearing",
        name: "CYBERPUNK.Conditions.Tearing",
        img: "systems/cyberpunk/img/conditions/tearing.svg",
        statuses: ["tearing"]
    },
    {
        id: "unconscious",
        name: "CYBERPUNK.Conditions.Unconscious",
        img: "systems/cyberpunk/img/conditions/unconscious.svg",
        statuses: ["unconscious"]
    },
    {
        id: "burning",
        name: "CYBERPUNK.Conditions.Burning",
        img: "systems/cyberpunk/img/conditions/burning.svg",
        statuses: ["burning"]
    },
    {
        id: "acid",
        name: "CYBERPUNK.Conditions.Acid",
        img: "systems/cyberpunk/img/conditions/acid.svg",
        statuses: ["acid"]
    },
    {
        id: "blinded",
        name: "CYBERPUNK.Conditions.Blinded",
        img: "systems/cyberpunk/img/conditions/blinded.svg",
        statuses: ["blinded"]
    },
    {
        id: "shorted",
        name: "CYBERPUNK.Conditions.Shorted",
        img: "systems/cyberpunk/img/conditions/microwave.svg",
        statuses: ["shorted"]
    },
    {
        id: "deafened",
        name: "CYBERPUNK.Conditions.Deafened",
        img: "systems/cyberpunk/img/conditions/deafened.svg",
        statuses: ["deafened"]
    },
    {
        id: "grappling",
        name: "CYBERPUNK.Conditions.Grappling",
        img: "systems/cyberpunk/img/conditions/grappling.svg",
        statuses: ["grappling"]
    },
    {
        id: "restrained",
        name: "CYBERPUNK.Conditions.Restrained",
        img: "systems/cyberpunk/img/conditions/restrained.svg",
        statuses: ["restrained"]
    },
    {
        id: "immobilized",
        name: "CYBERPUNK.Conditions.Immobilized",
        img: "systems/cyberpunk/img/conditions/immobilized.svg",
        statuses: ["immobilized"]
    },
    {
        id: "prone",
        name: "CYBERPUNK.Conditions.Prone",
        img: "systems/cyberpunk/img/conditions/prone.svg",
        statuses: ["prone"]
    },
    {
        id: "tired",
        name: "CYBERPUNK.Conditions.Tired",
        img: "systems/cyberpunk/img/conditions/tired.svg",
        statuses: ["tired"]
    },
    {
        id: "fatigued",
        name: "CYBERPUNK.Conditions.Fatigued",
        img: "systems/cyberpunk/img/conditions/fatigued.svg",
        statuses: ["fatigued"]
    },
    {
        id: "exhausted",
        name: "CYBERPUNK.Conditions.Exhausted",
        img: "systems/cyberpunk/img/conditions/exhausted.svg",
        statuses: ["exhausted"]
    },
    {
        id: "debilitated",
        name: "CYBERPUNK.Conditions.Debilitated",
        img: "systems/cyberpunk/img/conditions/debilitated.svg",
        statuses: ["debilitated"]
    },
    {
        id: "collapse",
        name: "CYBERPUNK.Conditions.Collapse",
        img: "systems/cyberpunk/img/conditions/collapse.svg",
        statuses: ["collapse"]
    },
    {
        id: "fresh",
        name: "CYBERPUNK.Conditions.Fresh",
        img: "systems/cyberpunk/img/conditions/fresh.svg",
        statuses: ["fresh"]
    },
    {
        id: "anxious",
        name: "CYBERPUNK.Conditions.Anxious",
        img: "systems/cyberpunk/img/conditions/anxious.svg",
        statuses: ["anxious"]
    },
    {
        id: "tense",
        name: "CYBERPUNK.Conditions.Tense",
        img: "systems/cyberpunk/img/conditions/tense.svg",
        statuses: ["tense"]
    },
    {
        id: "stressed",
        name: "CYBERPUNK.Conditions.Stressed",
        img: "systems/cyberpunk/img/conditions/stressed.svg",
        statuses: ["stressed"]
    },
    {
        id: "cracked",
        name: "CYBERPUNK.Conditions.Cracked",
        img: "systems/cyberpunk/img/conditions/cracked.svg",
        statuses: ["cracked"]
    },
    {
        id: "suffocating",
        name: "CYBERPUNK.Conditions.Suffocating",
        img: "systems/cyberpunk/img/conditions/suffocating.svg",
        statuses: ["suffocating"]
    },
    {
        id: "jacked-in",
        name: "CYBERPUNK.Conditions.JackedIn",
        img: "systems/cyberpunk/img/conditions/jacked-in.svg",
        statuses: ["jacked-in"]
    },
    {
        id: "insane",
        name: "CYBERPUNK.Conditions.Insane",
        img: "systems/cyberpunk/img/conditions/insane.svg",
        statuses: ["insane"]
    },
    {
        id: "scrambled",
        name: "CYBERPUNK.Conditions.Scrambled",
        img: "systems/cyberpunk/img/conditions/scrambled.svg",
        statuses: ["scrambled"]
    },
    {
        id: "desynced",
        name: "CYBERPUNK.Conditions.Desynced",
        img: "systems/cyberpunk/img/conditions/desynced.svg",
        statuses: ["desynced"]
    },
    {
        id: "gridlocked",
        name: "CYBERPUNK.Conditions.Gridlocked",
        img: "systems/cyberpunk/img/conditions/gridlocked.svg",
        statuses: ["gridlocked"]
    },
    {
        id: "lagging",
        name: "CYBERPUNK.Conditions.Lagging",
        img: "systems/cyberpunk/img/conditions/lagging.svg",
        statuses: ["lagging"]
    },
    {
        id: "tagged",
        name: "CYBERPUNK.Conditions.Tagged",
        img: "systems/cyberpunk/img/conditions/tagged.svg",
        statuses: ["tagged"]
    },
    {
        id: "insomnia",
        name: "CYBERPUNK.Conditions.Insomnia",
        img: "systems/cyberpunk/img/conditions/insomnia.svg",
        statuses: ["insomnia"]
    },
    {
        id: "surprised",
        name: "CYBERPUNK.Conditions.Surprised",
        img: "systems/cyberpunk/img/conditions/surprised.svg",
        statuses: ["surprised"]
    },
    {
        id: "frightened",
        name: "CYBERPUNK.Conditions.Frightened",
        img: "systems/cyberpunk/img/conditions/frightened.svg",
        statuses: ["frightened"]
    },
    {
        id: "fleeing",
        name: "CYBERPUNK.Conditions.Fleeing",
        img: "systems/cyberpunk/img/conditions/fleeing.svg",
        statuses: ["fleeing"]
    },
    // Sleep deprivation conditions
    ...Array.from({ length: 6 }, (_, i) => ({
        id: `sleep-dep-${i + 1}`,
        name: `CYBERPUNK.Conditions.SleepDep${i + 1}`,
        img: `systems/cyberpunk/img/conditions/sleep${i + 1}.svg`,
        statuses: [`sleep-dep-${i + 1}`]
    })),
    // Cover conditions
    ...Object.entries(COVER_TYPES).map(([key, { sp, label }]) => ({
        id: `cover-${sp}`,
        name: `CYBERPUNK.Conditions.Cover${label}`,
        img: "systems/cyberpunk/img/conditions/cover.svg",
        statuses: [`cover-${sp}`]
    }))
];

/**
 * Active Effect changes for each condition
 * These define the mechanical penalties applied by each condition
 */
export const CONDITION_EFFECTS = {
    "lightly-wounded": {
        // No mechanical effect
        changes: []
    },
    "seriously-wounded": {
        // REF -2
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2" }
        ]
    },
    "critically-wounded": {
        // REF, INT, COOL reduced by half
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.5" }
        ]
    },
    "mortally-wounded-0": {
        // REF, INT, COOL reduced to 1/3
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" }
        ]
    },
    "mortally-wounded-1": {
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" }
        ]
    },
    "mortally-wounded-2": {
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" }
        ]
    },
    "mortally-wounded-3": {
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" }
        ]
    },
    "mortally-wounded-4": {
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" }
        ]
    },
    "mortally-wounded-5": {
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" }
        ]
    },
    "mortally-wounded-6": {
        changes: [
            { key: "system.stats.ref.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.int.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" },
            { key: "system.stats.cool.value", mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: "0.33" }
        ]
    },
    "shocked": {
        // Cannot act - no stat changes, handled via combat logic
        changes: []
    },
    "disabled": {
        // Drone cannot act - no automatic stat changes
        changes: []
    },
    "dead": {
        // Cannot act - no stat changes, handled via combat logic
        changes: []
    },
    "stabilized": {
        // Prevents Death Save at turn start - no stat changes
        changes: []
    },
    "lost-left-arm": {
        // Limb loss - no automatic stat changes
        changes: []
    },
    "lost-right-arm": {
        // Limb loss - no automatic stat changes
        changes: []
    },
    "lost-left-leg": {
        // Limb loss - no automatic stat changes
        changes: []
    },
    "lost-right-leg": {
        // Limb loss - no automatic stat changes
        changes: []
    },
    "fast-draw": {
        // +3 initiative, -3 to all rolls - applied manually in rolls
        changes: []
    },
    "action-surge": {
        // -3 on all rolls - applied manually in rolls
        changes: []
    },
    "poisoned": {
        // REF -4
        changes: [
            { key: "system.stats.ref.tempMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-4" }
        ]
    },
    "confused": {
        // INT -4
        changes: [
            { key: "system.stats.int.tempMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-4" }
        ]
    },
    "tearing": {
        // REF -2
        changes: [
            { key: "system.stats.ref.tempMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2" }
        ]
    },
    "unconscious": {
        // No vision, -8 to Awareness/Notice rolls, can't act - handled in combat/skill logic
        changes: []
    },
    "burning": {
        // Damage over time: 2d10 (turn 1), 1d10 (turn 2), 1d6 (turn 3) - handled in combat logic
        changes: []
    },
    "acid": {
        // Armor damage 1d6 SP per round for 3 rounds - handled in combat logic
        changes: []
    },
    "blinded": {
        // No vision, -4 to Awareness/Notice rolls - handled in skill logic
        changes: []
    },
    "shorted": {
        // REF -3
        changes: [
            { key: "system.stats.ref.tempMod", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-3" }
        ]
    },
    "deafened": {
        // -2 to Awareness/Notice rolls - handled in skill logic
        changes: []
    },
    "grappling": {
        // -2 on all checks - applied manually in rolls
        changes: []
    },
    "restrained": {
        // -2 on all checks - applied manually in rolls
        changes: []
    },
    "immobilized": {
        // Movement reduced to 0 - handled in movement logic
        changes: []
    },
    "prone": {
        // Movement reduced to 0 - handled in movement logic
        changes: []
    },
    "tired": {
        // -1 on all rolls - applied manually in rolls
        changes: []
    },
    "fatigued": {
        // -2 on all rolls - applied manually in rolls
        changes: []
    },
    "exhausted": {
        // -3 on all rolls - applied manually in rolls
        changes: []
    },
    "debilitated": {
        // -5 on all rolls - applied manually in rolls
        changes: []
    },
    "collapse": {
        // -8 on all rolls - applied manually in rolls
        changes: []
    },
    "fresh": {
        // +1 on COOL rolls - applied manually in rolls
        changes: []
    },
    "anxious": {
        // -1 on COOL rolls - applied manually in rolls
        changes: []
    },
    "tense": {
        // -2 on COOL rolls, -1 on other rolls - applied manually in rolls
        changes: []
    },
    "stressed": {
        // -3 on COOL rolls, -2 on other rolls - applied manually in rolls
        changes: []
    },
    "cracked": {
        // -5 on COOL rolls, -3 on other rolls - applied manually in rolls
        changes: []
    },
    "suffocating": {
        // No mechanical effect for now
        changes: []
    },
    "jacked-in": {
        // No mechanical effect for now
        changes: []
    },
    "insane": {
        // Pushed Over the Edge — roll on Insanity table
        changes: []
    },
    "scrambled": {
        // INT and REF reduced by 1d6 (rolled on apply, stored as flag) — applied in _computeDerivedStats
        changes: []
    },
    "desynced": {
        // MOVE -1 (min 2) — applied in _computeDerivedStats
        changes: []
    },
    "gridlocked": {
        // Cannot progress deeper into Architecture or Jack Out safely
        changes: []
    },
    "lagging": {
        // -1 NET Actions next turn (min 2)
        changes: []
    },
    "tagged": {
        // -2 on Slide Checks
        changes: []
    },
    "insomnia": {
        // Must make checks to fall asleep
        changes: []
    },
    "surprised": {
        // -5 to initiative — applied in getRollData()
        changes: []
    },
    "frightened": {
        // Freezes in place, cannot act
        changes: []
    },
    "fleeing": {
        // Runs from fright source
        changes: []
    },
    // Sleep deprivation conditions - stat/skill penalties applied manually in prepareDerivedData and rollSkillCheck
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`sleep-dep-${i + 1}`, { changes: [] }])),
    // Cover conditions - no stat changes, handled via armor stacking in prepareDerivedData
    ...Object.fromEntries(COVER_CONDITION_IDS.map(id => [id, { changes: [] }]))
};

/**
 * Get the condition ID for a given wound state
 * @param {number} woundState - The wound state (0-10)
 * @returns {string|null} The condition ID, or null if uninjured
 */
export function getConditionForWoundState(woundState) {
    return WOUND_STATE_TO_CONDITION[woundState] || null;
}

/**
 * Check if a condition ID is a wound condition (vs shocked/dead)
 * @param {string} conditionId - The condition ID to check
 * @returns {boolean}
 */
export function isWoundCondition(conditionId) {
    return WOUND_CONDITION_IDS.includes(conditionId);
}

/**
 * All condition IDs that represent fatigue states (for easy iteration)
 */
export const FATIGUE_CONDITION_IDS = [
    "tired", "fatigued", "exhausted", "debilitated", "collapse"
];

/**
 * Map fatigue level (1-5) to condition ID
 */
export const FATIGUE_LEVEL_TO_CONDITION = {
    1: "tired",
    2: "fatigued",
    3: "exhausted",
    4: "debilitated",
    5: "collapse"
};

/**
 * Penalty on all rolls for each fatigue condition
 */
export const FATIGUE_PENALTIES = {
    "tired": -1,
    "fatigued": -2,
    "exhausted": -3,
    "debilitated": -5,
    "collapse": -8
};

/**
 * All condition IDs that represent stress states (for easy iteration)
 */
export const STRESS_CONDITION_IDS = [
    "fresh", "anxious", "tense", "stressed", "cracked"
];

/**
 * Map stress level to condition ID
 * Level -1 = Fresh (bonus), 0 = none, 1-4 = negative conditions
 */
export const STRESS_LEVEL_TO_CONDITION = {
    "-1": "fresh",
    1: "anxious",
    2: "tense",
    3: "stressed",
    4: "cracked"
};

/**
 * Penalty on COOL rolls for each stress condition
 */
export const STRESS_COOL_PENALTIES = {
    "fresh": 1,
    "anxious": -1,
    "tense": -2,
    "stressed": -3,
    "cracked": -5
};

/**
 * Penalty on non-COOL rolls for each stress condition
 */
export const STRESS_GENERAL_PENALTIES = {
    "fresh": 0,
    "anxious": 0,
    "tense": -1,
    "stressed": -2,
    "cracked": -3
};

/**
 * All condition IDs that represent sleep deprivation states (for easy iteration)
 */
export const SLEEP_CONDITION_IDS = [
    "sleep-dep-1", "sleep-dep-2", "sleep-dep-3",
    "sleep-dep-4", "sleep-dep-5", "sleep-dep-6"
];

/**
 * Map sleep deprivation level (1–6) to condition ID
 */
export const SLEEP_LEVEL_TO_CONDITION = {
    1: "sleep-dep-1", 2: "sleep-dep-2", 3: "sleep-dep-3",
    4: "sleep-dep-4", 5: "sleep-dep-5", 6: "sleep-dep-6"
};

/**
 * Skill roll penalties for each sleep deprivation level.
 * Level 1 only affects Awareness; levels 2+ affect all skill rolls.
 */
export const SLEEP_SKILL_PENALTIES = {
    "sleep-dep-1": 0,
    "sleep-dep-2": -1,
    "sleep-dep-3": -2,
    "sleep-dep-4": -3,
    "sleep-dep-5": -4,
    "sleep-dep-6": -5
};

/**
 * Condition toggle layout for the State tab.
 * 4 rows of 8 toggles each. icon = SVG base name (without path/extension).
 */
export const CONDITION_TOGGLE_ROWS = [
    [
        { id: "grappling",    label: "Grappling",    icon: "grappling",    flavor: "Locked in a close-quarters struggle with an opponent.", calc: "−2 on all checks" },
        { id: "restrained",   label: "Restrained",   icon: "restrained",   flavor: "Bound or held in place by physical restraints.", calc: "−2 on all checks" },
        { id: "immobilized",  label: "Immobilized",  icon: "immobilized",  flavor: "Unable to move from current position.", calc: "MA = 0" },
        { id: "prone",        label: "Prone",        icon: "prone",        flavor: "Knocked down or lying flat on the ground.", calc: "MA = 0" },
        { id: "unconscious",  label: "Unconscious",  icon: "unconscious",  flavor: "Completely unaware and unresponsive.", calc: "Cannot act | −8 Awareness" },
        { id: "shocked",      label: "Shocked",      icon: "shocked",      flavor: "Overwhelmed by pain or trauma, unable to respond.", calc: "Cannot act" },
        { id: "stabilized",   label: "Stabilized",   icon: "stabilized",   flavor: "Vital signs stabilized by medical intervention.", calc: "Skip Death Save at turn start" },
        { id: "dead",         label: "Dead",         icon: "dead",          flavor: "Flatlined. No coming back without extraordinary measures.", calc: "Cannot act" }
    ],
    [
        { id: "poisoned",  label: "Poisoned", icon: "poisoned",  flavor: "Toxins coursing through the body, impairing reflexes.", calc: "REF −4" },
        { id: "confused",  label: "Confused", icon: "confused",  flavor: "Mental faculties scrambled, unable to think clearly.", calc: "INT −4" },
        { id: "tearing",   label: "Tearing",  icon: "tearing",   flavor: "Eyes burning from tear gas exposure.", calc: "REF −2" },
        { id: "burning",   label: "Burning",  icon: "burning",   flavor: "Engulfed in flames, taking escalating damage each turn.", calc: "2d10 → 1d10 → 1d6 over 3 turns" },
        { id: "acid",      label: "Acid",     icon: "acid",      flavor: "Corrosive substance eating through protective gear.", calc: "Armor −1d6 SP/round for 3 rounds" },
        { id: "shorted",   label: "Shorted",  icon: "microwave", flavor: "Neural circuits disrupted by electromagnetic pulse.", calc: "REF −3" },
        { id: "blinded",   label: "Blinded",  icon: "blinded",   flavor: "Unable to see, relying on other senses.", calc: "Cannot see | −4 Awareness" },
        { id: "deafened",  label: "Deafened",  icon: "deafened",  flavor: "Hearing compromised, struggling to perceive surroundings.", calc: "−2 Awareness" }
    ],
    [
        { id: "jacked-in",   label: "Jacked In",   icon: "jacked-in",   flavor: "Mind plugged directly into cyberspace.", calc: "Connected to the Net" },
        { id: "scrambled",   label: "Scrambled",   icon: "scrambled",   flavor: "Nervous system overloaded by a hostile NET program like Nervescrub.", calc: "INT, REF −1d6 (min 2)" },
        { id: "desynced",    label: "Desynced",    icon: "desynced",    flavor: "Motor functions disrupted by a hostile NET program like Scorpio.", calc: "MA −1 (min 2)" },
        { id: "gridlocked",  label: "Gridlocked",  icon: "gridlocked",  flavor: "Locked in place on the NET by a hostile program like Superglue.", calc: "Cannot progress or Jack Out safely" },
        { id: "lagging",     label: "Lagging",     icon: "lagging",     flavor: "Processing delays caused by a hostile NET program like Vrizzbolt.", calc: "−1 NET Actions next turn (min 2)" },
        { id: "tagged",      label: "Tagged",      icon: "tagged",      flavor: "Marked by a hostile NET program like Skunk.", calc: "−2 on Slide Checks" },
        { id: "suffocating", label: "Suffocating", icon: "suffocating", flavor: "Running out of breathable air.", calc: "Risk of death" },
        { id: "insomnia",    label: "Insomnia",    icon: "insomnia",    flavor: "Accumulated stress prevents restful sleep.", calc: "Must check to fall asleep" }
    ],
    [
        { id: "surprised",      label: "Surprised",   icon: "surprised",      flavor: "Caught off guard by a sudden threat.", calc: "−5 Initiative" },
        { id: "frightened",     label: "Frightened",  icon: "frightened",     flavor: "Terrified and frozen in place, unable to act.", calc: "Cannot act" },
        { id: "fleeing",        label: "Fleeing",     icon: "fleeing",        flavor: "Overcome with terror, running from the source of fright.", calc: "Must flee" },
        { id: "insane",         label: "Insane",      icon: "insane",         flavor: "Pushed Over the Edge — must roll on the Insanity table.", calc: "Roll on Insanity table" },
        { id: "lost-left-arm",  label: "Left Arm",    icon: "lost-left-arm",  flavor: "Limb severed or rendered completely nonfunctional.", calc: "Left arm destroyed" },
        { id: "lost-right-arm", label: "Right Arm",   icon: "lost-right-arm", flavor: "Limb severed or rendered completely nonfunctional.", calc: "Right arm destroyed" },
        { id: "lost-left-leg",  label: "Left Leg",    icon: "lost-left-leg",  flavor: "Limb severed or rendered completely nonfunctional.", calc: "Left leg destroyed | MA = 0" },
        { id: "lost-right-leg", label: "Right Leg",   icon: "lost-right-leg", flavor: "Limb severed or rendered completely nonfunctional.", calc: "Right leg destroyed | MA = 0" }
    ]
];

/**
 * Drone-specific condition toggles. Single row of 8.
 */
export const DRONE_CONDITION_TOGGLE_ROW = [
    { id: "restrained",  label: "Restrained",  icon: "restrained",  flavor: "Bound or held in place by physical restraints.", calc: "−2 on all checks" },
    { id: "immobilized", label: "Immobilized", icon: "immobilized", flavor: "Unable to move from current position.", calc: "MA = 0" },
    { id: "prone",       label: "Prone",       icon: "prone",       flavor: "Knocked down or lying flat on the ground.", calc: "MA = 0" },
    { id: "burning",     label: "Burning",     icon: "burning",     flavor: "Engulfed in flames, taking escalating damage each turn.", calc: "2d10 → 1d10 → 1d6 over 3 turns" },
    { id: "acid",        label: "Acid",        icon: "acid",        flavor: "Corrosive substance eating through protective gear.", calc: "Armor −1d6 SP/round for 3 rounds" },
    { id: "blinded",     label: "Blinded",     icon: "blinded",     flavor: "Sensors compromised — unable to see surroundings.", calc: "Cannot see | −4 Awareness" },
    { id: "disabled",    label: "Disabled",    icon: "disabled",    flavor: "Drone is offline and cannot act.", calc: "Cannot act" },
    { id: "dead",        label: "Dead",        icon: "dead",        flavor: "Wrecked beyond recovery.", calc: "Cannot act" }
];
