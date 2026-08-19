/**
 * Drug Design registry — Pharmacology helper (per house-rules).
 *
 * Single source of truth for the Design dialog, cost / difficulty
 * bracket math, and the effect → drug-bonus mapping that produces the
 * final Drug item on a successful roll.
 *
 * Every effect entry declares its DESIGN VALUE (what the Pharmacology
 * math uses to price the batch) and an `apply` callback that appends
 * the drug-side bonus rows this effect maps to. Positive design values
 * make cost & difficulty go up; negative ones drop cost but still
 * raise difficulty when summed by absolute value.
 */

import { cumulativeEffects } from "./lookups.js";

/**
 * Push a property bonus row onto a bonus set. `value` is coerced to a
 * non-negative integer via floor-min-0 — mirrors what the drug sheet
 * would produce if a human authored the row by hand.
 */
function pushProp(list, property, op, value) {
    const clean = Math.max(0, Math.floor(Number(value) || 0));
    list.push({ type: "property", property, op, value: clean });
}

/** Add a flavour row to the given bonus set. */
function pushFlavour(list, flavour) {
    list.push({ type: "flavour", flavour });
}

/**
 * Skill bonus rows resolve on the actor by lowercased-name match when
 * no uuid is set — good enough here since we don't have a compendium
 * uuid at design time, and any character carrying the localized skill
 * name will pick the bonus up automatically.
 */
function pushSkill(list, skillName, op, value) {
    const clean = Math.max(0, Math.floor(Number(value) || 0));
    list.push({ type: "skill", skillUuid: "", skillName, op: op, value: clean });
}

/**
 * PRIMARY EFFECTS — the good stuff. Push to `bonuses` (Active phase).
 * All design values are POSITIVE (they cost more; they're desirable).
 */
export const PRIMARY_EFFECTS = {
    accelerator: {
        label: "Accelerator",
        value: 5,
        apply: (out, str) => pushProp(out.bonuses, "initiativeMod", "+", str)
    },
    analgesic: {
        label: "Analgesic",
        value: 4,
        apply: (out, str) => pushProp(out.bonuses, "stunSaveMod", "+", str)
    },
    antidote: {
        label: "Antidote",
        value: 6,
        apply: (out, str) => pushProp(out.bonuses, "poisonSaveMod", "+", str)
    },
    aphrodisiac: {
        label: "Aphrodisiac",
        value: 2,
        apply: (out, str) => pushProp(out.bonuses, "stats.emp", "+", str)
    },
    concentrator: {
        label: "Concentrator",
        value: 5,
        apply: (out, str) => pushProp(out.bonuses, "stats.int", "+", str)
    },
    contraceptive: {
        label: "Contraceptive",
        value: 1,
        apply: (out) => pushFlavour(out.bonuses, "contraceptive")
    },
    euphoric: {
        label: "Euphoric",
        value: 2,
        apply: (out, str) => pushProp(out.bonuses, "stats.cool", "+", str)
    },
    hypnotic: {
        label: "Hypnotic",
        value: 5,
        apply: (out) => pushFlavour(out.bonuses, "hypnotic")
    },
    psychedelic: {
        label: "Psychedelic",
        value: 2,
        apply: (out) => pushFlavour(out.bonuses, "psychedelic")
    },
    sedative: {
        label: "Sedative",
        value: 3,
        apply: (out, str) => pushProp(out.bonuses, "stress", "−", str)
    },
    soporific: {
        label: "Soporific",
        value: 3,
        apply: (out, str) => pushProp(out.bonuses, "sleepRollBonus", "+", str)
    },
    speed: {
        label: "Speed",
        value: 5,
        apply: (out, str) => pushProp(out.bonuses, "stats.ref", "+", Math.floor(str / 2))
    },
    speedheal: {
        label: "Speedheal",
        value: 6,
        apply: (out, str) => pushProp(out.bonuses, "healingRateBoost", "+", Math.floor(str / 2))
    },
    stimulant: {
        label: "Stimulant",
        value: 3,
        apply: (out, str) => pushSkill(out.bonuses, "Awareness/Notice", "+", str)
    }
};

/**
 * SECONDARY EFFECTS — undesirable side effects active during the drug
 * itself. All design values are NEGATIVE.
 */
export const SECONDARY_EFFECTS = {
    aggressive: {
        label: "Aggressive",
        value: -2,
        apply: (out) => pushFlavour(out.bonuses, "aggressive")
    },
    alienation: {
        label: "Alienation",
        value: -2,
        apply: (out, str) => pushProp(out.bonuses, "stateBonus.alienation", "+", str)
    },
    analgesia: {
        label: "Analgesia",
        value: -1,
        apply: (out, str) => pushProp(out.bonuses, "stunSaveMod", "+", str)
    },
    anxiety: {
        label: "Anxiety",
        value: -1,
        apply: (out, str) => {
            pushProp(out.bonuses, "stats.cool",     "−", str);
            pushProp(out.bonuses, "sleepRollBonus", "−", str);
            pushProp(out.bonuses, "stress",         "+", str);
        }
    },
    blackout: {
        label: "Blackout",
        value: -4,
        apply: (out) => pushFlavour(out.bonuses, "blackout")
    },
    catatonic: {
        label: "Catatonic",
        value: -3,
        apply: (out) => pushFlavour(out.bonuses, "catatonic")
    },
    "clouded-thinking": {
        label: "Clouded Thinking",
        value: -2,
        apply: (out, str) => pushProp(out.bonuses, "stats.int", "−", str)
    },
    convulsions: {
        label: "Convulsions",
        value: -2,
        apply: (out, str) => pushProp(out.bonuses, "stats.ref", "−", str)
    },
    "death-risk": {
        label: "Death Risk",
        value: -5,
        apply: (out, str) => {
            pushProp(out.bonuses, "deathSaveMod", "−", str);
            pushFlavour(out.bonuses, "death-risk");
        }
    },
    delusions: {
        label: "Delusions",
        value: -2,
        apply: (out) => pushFlavour(out.bonuses, "delusions")
    },
    disorientation: {
        label: "Disorientation",
        value: -1,
        apply: (out) => pushFlavour(out.bonuses, "disorientation")
    },
    drowsiness: {
        label: "Drowsiness",
        value: -1,
        apply: (out, str) => {
            pushSkill(out.bonuses, "Awareness/Notice", "−", str);
            pushProp(out.bonuses,  "stats.int",         "−", Math.floor(str / 2));
            pushProp(out.bonuses,  "stats.ref",         "−", Math.floor(str / 3));
        }
    },
    egotism: {
        label: "Egotism",
        value: -2,
        apply: (out, str) => pushProp(out.bonuses, "stateBonus.egotism", "+", str)
    },
    hallucinations: {
        label: "Hallucinations",
        value: -3,
        apply: (out) => pushFlavour(out.bonuses, "hallucination")
    },
    obsession: {
        label: "Obsession",
        value: -2,
        apply: (out, str) => pushProp(out.bonuses, "stateBonus.obsession", "+", str)
    },
    paranoia: {
        label: "Paranoia",
        value: -2,
        apply: (out, str) => pushProp(out.bonuses, "stateBonus.paranoia", "+", str)
    },
    "time-distortion": {
        label: "Time Distortion",
        value: -3,
        apply: (out) => pushFlavour(out.bonuses, "time-distortion")
    }
};

/**
 * AFTER EFFECTS — kick in during Withdrawal. All negative design
 * values. Push to `withdrawal`.
 */
export const AFTER_EFFECTS = {
    anxiety: {
        label: "Anxiety",
        value: -2,
        apply: (out, str) => {
            pushProp(out.withdrawal, "stats.cool",     "−", str);
            pushProp(out.withdrawal, "sleepRollBonus", "−", str);
            pushProp(out.withdrawal, "stress",         "+", str);
        }
    },
    convulsions: {
        label: "Convulsions",
        value: -3,
        apply: (out, str) => pushProp(out.withdrawal, "stats.ref", "−", str)
    },
    "death-risk": {
        label: "Death Risk",
        value: -5,
        apply: (out, str) => {
            pushProp(out.withdrawal, "deathSaveMod", "−", str);
            pushFlavour(out.withdrawal, "death-risk");
        }
    },
    depression: {
        label: "Depression",
        value: -1,
        apply: (out, str) => pushProp(out.withdrawal, "allRollBonus", "−", str)
    },
    drowsiness: {
        label: "Drowsiness",
        value: -1,
        apply: (out, str) => {
            pushSkill(out.withdrawal, "Awareness/Notice", "−", str);
            pushProp(out.withdrawal,  "stats.int",         "−", Math.floor(str / 2));
            pushProp(out.withdrawal,  "stats.ref",         "−", Math.floor(str / 3));
        }
    },
    hunger: {
        label: "Hunger",
        value: -1,
        apply: (out) => pushFlavour(out.withdrawal, "hunger")
    },
    "instant-addiction": {
        label: "Instant Addiction",
        value: -5,
        apply: (out) => pushFlavour(out.withdrawal, "addiction")
    },
    sleepiness: {
        label: "Sleepiness",
        value: -2,
        apply: (out, str) => pushProp(out.withdrawal, "sleepRollBonus", "+", str)
    }
};

/**
 * CUMULATIVE EFFECTS — persistent per-actor counters that outlive the
 * drug. Push to `cumulative` (the drug's cumulative list). Only the
 * design cost lives here; label / description / roll metadata comes
 * from `cumulativeEffects` in lookups.js. Consumers resolve entries
 * via `lookupEffect("cumulative", key)` / `tierEntriesAlpha` which
 * compose the two registries at call time (needs `game.i18n`, so
 * resolving eagerly at module load would fire before Foundry init).
 */
const CUMULATIVE_DESIGN_VALUES = {
    alienation:         -2,
    amnesia:            -4,
    brainDegeneration:  -5,
    carcinogen:         -4,
    egotism:            -2,
    flashbacks:         -3,
    insomnia:           -2,
    nerveDegeneration:  -4,
    obsession:          -2,
    paranoia:           -2,
    physicalAddiction:  -4,
    suicidal:           -5
};

/** Resolve one cumulative-design entry — merges design value + i18n label. */
function cumulativeDesignEntry(key) {
    const value = CUMULATIVE_DESIGN_VALUES[key];
    if (value === undefined) return null;
    const meta = cumulativeEffects[key];
    const label = meta?.labelKey ? game.i18n.localize(`CYBERPUNK.${meta.labelKey}`) : key;
    return { label, value, key };
}

/**
 * Method Taken. `drugKey` matches the drug schema's methodTaken enum
 * key so the created Item picks up the right dropdown value.
 */
export const METHOD_OPTIONS = [
    { key: "ingested", label: "Ingested",  value: -2, drugKey: "ingested" },
    { key: "injected", label: "Injected",  value:  0, drugKey: "injected" },
    { key: "inhaled",  label: "Inhaled",   value:  2, drugKey: "inhaled"  },
    { key: "contact",  label: "Contact",   value:  4, drugKey: "contact"  }
];

/** Detection level (design cost / difficulty knob + drug metadata). */
export const DETECTION_OPTIONS = [
    { key: "distinctive", label: "Distinctive", value: -4, drugKey: "distinctive" },
    { key: "noticeable",  label: "Noticeable",  value:  0, drugKey: "noticeable"  },
    { key: "faint",       label: "Faint",       value:  2, drugKey: "faint"       },
    { key: "veryFaint",   label: "Very Faint",  value:  4, drugKey: "veryFaint"   },
    { key: "invisible",   label: "Invisible",   value:  8, drugKey: "invisible"   }
];

/** Residue level. */
export const RESIDUE_OPTIONS = [
    { key: "ample",     label: "Ample Residue",  value: -4, drugKey: "ample"     },
    { key: "normal",    label: "Normal Residue", value:  0, drugKey: "normal"    },
    { key: "little",    label: "Little Residue", value:  2, drugKey: "little"    },
    { key: "onlyTrace", label: "Only Traces",    value:  4, drugKey: "onlyTrace" },
    { key: "noTrace",   label: "No Traces",      value:  8, drugKey: "noTrace"   }
];

/**
 * Onset / Duration pairs. `onsetSeconds` and `durationSeconds` feed
 * `system.onsetDuration` / `system.duration` on the created drug. The
 * label pair reads "onset / duration" per the confirmed convention.
 */
export const ONSET_DURATION_OPTIONS = [
    { key: "12h/15s",  label: "12 Hours / 15 Seconds", value: -12, onsetSeconds: 12 * 3600, durationSeconds:  15 },
    { key: "6h/30s",   label: "6 Hours / 30 Seconds",  value:  -8, onsetSeconds:  6 * 3600, durationSeconds:  30 },
    { key: "3h/1m",    label: "3 Hours / 1 Minute",    value:  -6, onsetSeconds:  3 * 3600, durationSeconds:  60 },
    { key: "1h/5m",    label: "1 Hour / 5 Minutes",    value:  -4, onsetSeconds:      3600, durationSeconds: 300 },
    { key: "30m/10m",  label: "30 Minutes / 10 Minutes", value: -2, onsetSeconds:    30 * 60, durationSeconds: 10 * 60 },
    { key: "10m/15m",  label: "10 Minutes / 15 Minutes", value: -1, onsetSeconds:    10 * 60, durationSeconds: 15 * 60 },
    { key: "1m/30m",   label: "1 Minute / 30 Minutes",   value:  0, onsetSeconds:         60, durationSeconds: 30 * 60 },
    { key: "30s/1h",   label: "30 Seconds / 1 Hour",     value:  1, onsetSeconds:         30, durationSeconds:      3600 },
    { key: "15s/3h",   label: "15 Seconds / 3 Hours",    value:  2, onsetSeconds:         15, durationSeconds:  3 * 3600 },
    { key: "8s/6h",    label: "8 Seconds / 6 Hours",     value:  4, onsetSeconds:          8, durationSeconds:  6 * 3600 },
    { key: "4s/12h",   label: "4 Seconds / 12 Hours",    value:  8, onsetSeconds:          4, durationSeconds: 12 * 3600 },
    { key: "2s/18h",   label: "2 Seconds / 18 Hours",    value: 12, onsetSeconds:          2, durationSeconds: 18 * 3600 },
    { key: "1s/1d",    label: "1 Second / 1 Day",        value: 14, onsetSeconds:          1, durationSeconds: 24 * 3600 },
    { key: "inst/2d",  label: "Instant / 2 Days",        value: 18, onsetSeconds:          0, durationSeconds: 48 * 3600 }
];

/**
 * Cost brackets — mapped from the signed sum. Each entry carries the
 * one-off "Prototype" price (used as the created drug's `cost`) and
 * the mass-produce price, which shows alongside in the display bar
 * per the house-rules table.
 */
export const COST_BRACKETS = [
    { max: -11, prototype:   2, mass: 0.5 },
    { max:  -6, prototype:   5, mass:   1 },
    { max:   0, prototype:  10, mass:   5 },
    { max:   5, prototype:  25, mass:  10 },
    { max:  10, prototype:  50, mass:  25 },
    { max: Infinity, prototype: 100, mass: 50 }
];

export function bracketForCostTotal(total) {
    // First match wins — brackets are inclusive on `max`. The last row
    // uses `max: Infinity` so `total > 10` still returns a bracket.
    return COST_BRACKETS.find(b => total <= b.max);
}

export function priceForCostTotal(total) {
    return bracketForCostTotal(total).prototype;
}

/** Human-readable bracket text used in the dialog's Cost bar. */
export function costDisplayForTotal(total) {
    const b = bracketForCostTotal(total);
    return `€$${b.prototype} Prototype / €$${b.mass} mass`;
}

/**
 * Difficulty & rarity brackets — mapped from the absolute-value sum.
 * Returns { dv, rarity }.
 */
export function difficultyForTotal(total) {
    if (total <= 30) return { dv: 10, rarity: "common"    };
    if (total <= 50) return { dv: 15, rarity: "common"    };
    if (total <= 70) return { dv: 20, rarity: "limited"   };
    if (total <= 90) return { dv: 25, rarity: "limited"   };
    if (total <= 110) return { dv: 30, rarity: "exclusive" };
    return { dv: 35, rarity: "iconic" };
}

/**
 * Unified factor list — the four non-effect knobs (method / detection
 * / residue / onset). Effect design values apply as `strength × value`
 * per the house-rules formula.
 */
function factorValues(state) {
    const method    = METHOD_OPTIONS.find(o => o.key === state.method);
    const detection = DETECTION_OPTIONS.find(o => o.key === state.detection);
    const residue   = RESIDUE_OPTIONS.find(o => o.key === state.residue);
    const onset     = ONSET_DURATION_OPTIONS.find(o => o.key === state.onset);
    return [
        method?.value    ?? 0,
        detection?.value ?? 0,
        residue?.value   ?? 0,
        onset?.value     ?? 0
    ];
}

/** Effect contribution: `strength × effectValue` for each selected effect. */
function effectContributions(state) {
    const str = Math.max(0, Number(state.strength) || 0);
    const out = [];
    for (const e of state.effects) {
        const meta = lookupEffect(e.tier, e.key);
        if (!meta) continue;
        out.push(str * meta.value);
    }
    return out;
}

/** Signed sum — positives / negatives cancel. */
export function computeCostTotal(state) {
    const contribs = [...effectContributions(state), ...factorValues(state)];
    return contribs.reduce((a, b) => a + b, 0);
}

/** Absolute-value sum — positives / negatives ADD. */
export function computeDifficultyTotal(state) {
    const contribs = [...effectContributions(state), ...factorValues(state)];
    return contribs.reduce((a, b) => a + Math.abs(b), 0);
}

/** Resolve `{tier, key}` to its registry entry. */
export function lookupEffect(tier, key) {
    switch (tier) {
        case "primary":    return PRIMARY_EFFECTS[key];
        case "secondary":  return SECONDARY_EFFECTS[key];
        case "after":      return AFTER_EFFECTS[key];
        case "cumulative": return cumulativeDesignEntry(key);
        default: return null;
    }
}

/**
 * Build the Drug item's `system` payload from the dialog state. Called
 * on a successful roll to hand off to `Item.create`.
 */
export function buildDrugSystemPayload(state, actorName) {
    const method    = METHOD_OPTIONS.find(o => o.key === state.method)    ?? METHOD_OPTIONS[0];
    const detection = DETECTION_OPTIONS.find(o => o.key === state.detection) ?? DETECTION_OPTIONS[1];
    const residue   = RESIDUE_OPTIONS.find(o => o.key === state.residue)   ?? RESIDUE_OPTIONS[1];
    const onset     = ONSET_DURATION_OPTIONS.find(o => o.key === state.onset) ?? ONSET_DURATION_OPTIONS[6];

    const cost = priceForCostTotal(computeCostTotal(state));
    const { rarity } = difficultyForTotal(computeDifficultyTotal(state));

    // Accumulator handed to each effect's `apply` callback. Primary +
    // Secondary land in `bonuses` (Active tab), After lands in
    // `withdrawal`, Cumulative lands as `{type: "cumulative"}` rows.
    const out = { bonuses: [], withdrawal: [], cumulative: [] };
    const strength = Math.max(0, Math.min(6, Number(state.strength) || 0));

    for (const e of state.effects) {
        const meta = lookupEffect(e.tier, e.key);
        if (!meta) continue;
        if (e.tier === "cumulative") {
            out.cumulative.push({ type: "cumulative", cumulative: meta.key });
        } else {
            meta.apply(out, strength);
        }
    }

    return {
        quantity: 1,
        cost,
        weight: 0.01,                              // 10 g per house-rules
        availability: rarity,
        strength,
        methodTaken: method.drugKey,
        detection:   detection.drugKey,
        residue:     residue.drugKey,
        onsetDuration: onset.onsetSeconds,
        duration:      onset.durationSeconds,
        source:        actorName ? `Designed by ${actorName}` : "",
        bonuses:    out.bonuses,
        withdrawal: out.withdrawal,
        cumulative: out.cumulative
    };
}

/**
 * Alphabetical sort helper for the picker dialog + Effects list on
 * the design dialog. Returns entries keyed by design-registry key.
 */
export function tierEntriesAlpha(tier) {
    // Cumulative entries are composed on the fly from
    // `CUMULATIVE_DESIGN_VALUES` + `cumulativeEffects` label. The
    // other tiers are static registries keyed by lowercase slug.
    if (tier === "cumulative") {
        return Object.keys(CUMULATIVE_DESIGN_VALUES)
            .map(cumulativeDesignEntry)
            .filter(Boolean)
            .sort((a, b) => a.label.localeCompare(b.label));
    }
    const source = { primary: PRIMARY_EFFECTS, secondary: SECONDARY_EFFECTS, after: AFTER_EFFECTS }[tier];
    if (!source) return [];
    return Object.entries(source)
        .map(([key, meta]) => ({ ...meta, key }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Row-ordering for the Effects list on the main dialog: Primary →
 * Secondary → After → Cumulative, alphabetized within tier.
 */
const TIER_ORDER = ["primary", "secondary", "after", "cumulative"];
export function orderEffects(effects) {
    return [...effects].sort((a, b) => {
        const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
        if (t !== 0) return t;
        const la = lookupEffect(a.tier, a.key)?.label ?? "";
        const lb = lookupEffect(b.tier, b.key)?.label ?? "";
        return la.localeCompare(lb);
    });
}
