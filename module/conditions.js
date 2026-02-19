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
 * Cover type definitions: key -> { sp, label }
 */
export const COVER_TYPES = {
    drywall:  { sp: 5,  label: "Drywall" },
    concrete: { sp: 10, label: "Concrete" },
    hardwood: { sp: 15, label: "Hardwood" },
    steel:    { sp: 20, label: "Steel" },
    brick:    { sp: 25, label: "Brick" },
    stone:    { sp: 30, label: "Stone" },
    utility:  { sp: 35, label: "Utility" },
    kevlar:   { sp: 40, label: "Kevlar" }
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
        id: "cyberpsycho",
        name: "CYBERPUNK.Conditions.Cyberpsycho",
        img: "systems/cyberpunk/img/conditions/cyberpsycho.svg",
        statuses: ["cyberpsycho"]
    },
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
    "cyberpsycho": {
        // No mechanical effect for now
        changes: []
    },
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
 * Condition toggle layout for the State tab.
 * 3 rows of 8 toggles each. icon = SVG base name (without path/extension).
 */
export const CONDITION_TOGGLE_ROWS = [
    [
        { id: "grappling",    label: "Grappling",    icon: "grappling" },
        { id: "restrained",   label: "Restrained",   icon: "restrained" },
        { id: "immobilized",  label: "Immobilized",  icon: "immobilized" },
        { id: "prone",        label: "Prone",        icon: "prone" },
        { id: "action-surge", label: "Action Surge", icon: "action-surge" },
        { id: "shocked",      label: "Shocked",      icon: "shocked" },
        { id: "stabilized",   label: "Stabilized",   icon: "stabilized" },
        { id: "unconscious",  label: "Unconscious",  icon: "unconscious" }
    ],
    [
        { id: "poisoned",  label: "Poisoned", icon: "poisoned" },
        { id: "confused",  label: "Confused", icon: "confused" },
        { id: "tearing",   label: "Tearing",  icon: "tearing" },
        { id: "burning",   label: "Burning",  icon: "burning" },
        { id: "acid",      label: "Acid",     icon: "acid" },
        { id: "shorted",   label: "Shorted",  icon: "microwave" },
        { id: "blinded",   label: "Blinded",  icon: "blinded" },
        { id: "deafened",  label: "Deafened",  icon: "deafened" }
    ],
    [
        { id: "lost-left-arm",  label: "Left Arm",    icon: "lost-left-arm" },
        { id: "lost-right-arm", label: "Right Arm",   icon: "lost-right-arm" },
        { id: "lost-left-leg",  label: "Left Leg",    icon: "lost-left-leg" },
        { id: "lost-right-leg", label: "Right Leg",   icon: "lost-right-leg" },
        { id: "suffocating",    label: "Suffocating",  icon: "suffocating" },
        { id: "jacked-in",      label: "Jacked In",    icon: "jacked-in" },
        { id: "cyberpsycho",    label: "Cyberpsycho",  icon: "cyberpsycho" },
        { id: "dead",           label: "Dead",         icon: "dead" }
    ]
];
