/**
 * Drug Mixing, Multiple Doses and Overdose — the rules layer.
 *
 * Pure functions only (no Foundry globals), so the tables and the row
 * maths can be unit-tested in Node. drug-effects.js owns the Foundry
 * side: reading the actor's effects, rolling, updating flags and
 * posting the chat cards.
 *
 * Vocabulary used throughout:
 *   - identity  — normalized drug name; two doses of the same drug share it.
 *   - potency   — multiplier on a drug effect's numeric rows (Partially
 *                 Compatible halves it).
 *   - nullify   — null | "positive" | "all": which onset/active rows stop
 *                 applying. The effect itself stays, so its withdrawal and
 *                 cumulatives still arrive when the time comes.
 */

import { effectiveBonusOp, isBooleanProperty } from "./lookups.js";

/**
 * Drug Mixing table, rolled d100 + both drugs' Strength. Bands are
 * matched by their upper bound; the last one is open-ended.
 *   - potency — multiplier for both drugs
 *   - nullify — "all" / "positive" for both drugs; "loser" for the drug
 *               that lost Single Dominance only
 *   - damage / comaDays / deathSave — consequences offered on the card
 */
export const MIXING_TABLE = [
    { key: "fullyCompatible",     max: 5,        labelKey: "MixFullyCompatible" },
    { key: "partiallyCompatible", max: 15,       labelKey: "MixPartiallyCompatible", potency: 0.5 },
    { key: "singleDominance",     max: 35,       labelKey: "MixSingleDominance",     nullify: "loser" },
    { key: "cancelOut",           max: 60,       labelKey: "MixCancelOut",           nullify: "all" },
    { key: "badCancelOut",        max: 70,       labelKey: "MixBadCancelOut",        nullify: "positive" },
    { key: "mildlyPoisonous",     max: 80,       labelKey: "MixMildlyPoisonous",     nullify: "all", damage: "1d6" },
    { key: "poisonous",           max: 90,       labelKey: "MixPoisonous",           nullify: "all", damage: "2d6" },
    { key: "extremelyPoisonous",  max: 95,       labelKey: "MixExtremelyPoisonous",  nullify: "all", damage: "3d6" },
    { key: "coma",                max: 98,       labelKey: "MixComa",                nullify: "all", comaDays: "2d6" },
    { key: "death",               max: Infinity, labelKey: "MixDeath",               nullify: "all", deathSave: -4, comaDays: "2d6" }
];

/**
 * Drug Overdose table, rolled d100 + the drug's Strength.
 *   - illness — "severe" / "extreme", shown with `illDays`
 */
export const OVERDOSE_TABLE = [
    { key: "unconsciousness", max: 15,       labelKey: "OdUnconsciousness", unconsciousHours: "2d6" },
    { key: "nauseous",        max: 40,       labelKey: "OdNauseous",        damage: "1d6" },
    { key: "ill",             max: 60,       labelKey: "OdIll",             damage: "2d6", illness: "severe",  illDays: "1d6" },
    { key: "seriouslyIll",    max: 85,       labelKey: "OdSeriouslyIll",    damage: "3d6", illness: "extreme", illDays: "2d6" },
    { key: "coma",            max: 95,       labelKey: "OdComa",            comaDays: "2d6" },
    { key: "death",           max: Infinity, labelKey: "OdDeath",           deathSave: -4, comaDays: "2d6" }
];

/** Doses of one drug that stack before further doses add nothing (rules: the 2nd doubles). */
export const MAX_STACKED_DOSES = 2;

/** Doses × Strength at which a drug overdoses (rules: 30 / Strength doses). */
const OVERDOSE_BUDGET = 30;

/** Band a roll total lands in. */
export function bandFor(table, total) {
    return table.find(b => total <= b.max) ?? table[table.length - 1];
}

/** Band by its key, or null for a stale / unknown key. */
export function bandByKey(table, key) {
    return table.find(b => b.key === key) ?? null;
}

/** Normalized drug name — the identity two doses of the same drug share. */
export function drugIdentity(name) {
    return String(name ?? "").normalize("NFKC").trim().toLowerCase();
}

/** Order-independent key for a pair of identities. */
export function pairKey(a, b) {
    return [a, b].sort().join("|");
}

/** True when the `doses`-th dose of a drug at `strength` overdoses. Strength 0 never does. */
export function isOverdose(doses, strength) {
    const s = Number(strength) || 0;
    if (s <= 0) return false;
    return doses * s >= OVERDOSE_BUDGET;
}

/** First dose number that overdoses, or Infinity for Strength 0. */
export function overdoseThreshold(strength) {
    const s = Number(strength) || 0;
    return s > 0 ? Math.ceil(OVERDOSE_BUDGET / s) : Infinity;
}

/** Strongest of two nullify levels ("all" > "positive" > null). */
export function mergeNullify(a, b) {
    if (a === "all" || b === "all") return "all";
    if (a === "positive" || b === "positive") return "positive";
    return null;
}

/**
 * What a mixing band does to one side of the pair.
 * @returns {{potency: number, nullify: null|"positive"|"all"}}
 */
export function mixChangeFor(band, identity, winner) {
    let nullify = band?.nullify ?? null;
    if (nullify === "loser") nullify = identity === winner ? null : "all";
    return { potency: band?.potency ?? 1, nullify };
}

/**
 * Flag patch that applies a mixing change to one effect, or null when the
 * effect already reacted with that partner — a remembered reaction must
 * not land twice on the same dose (no ½ × ½ when B meets a 2nd dose of A).
 * `mixedWith` is an array, not a map: identities may contain dots, which
 * Foundry's update path would expand into nested keys.
 */
export function mixFlagPatch(flags, change, partner, bandKey) {
    const mixedWith = Array.isArray(flags?.mixedWith) ? flags.mixedWith : [];
    if (mixedWith.some(m => m?.id === partner)) return null;
    return {
        potency: potencyOf(flags) * (change?.potency ?? 1),
        nullify: mergeNullify(flags?.nullify ?? null, change?.nullify ?? null),
        mixedWith: [...mixedWith, { id: partner, band: bandKey }]
    };
}

/**
 * Whether higher values of a property help the character. Stress, fright,
 * fatigue and the psychosis state bonuses hurt as they rise; everything
 * else (stats, saves, initiative, healing, NET bonuses …) helps.
 */
export function propertyPolarity(property) {
    const p = String(property ?? "");
    if (p === "stress" || p === "fright" || p === "fatigue" || p.startsWith("stateBonus.")) return -1;
    return 1;
}

/** Op a row actually applies with (property rows go through the per-property op rules). */
function rowOp(row) {
    return row?.type === "property" ? effectiveBonusOp(row.property, row.op) : (row?.op || "+");
}

/**
 * True when a bonus row helps the character — what Bad Cancel Out takes
 * away. Flavours are narrative side effects and never count; boolean
 * capabilities (ignore* / grant*) and "=" overrides are deliberate grants.
 */
export function isPositiveRow(row) {
    if (!row || row.type === "flavour") return false;
    if (row.type === "property" && isBooleanProperty(row.property)) return true;
    const op = rowOp(row);
    if (op === "=") return true;
    const v = Number(row.value) || 0;
    let direction;
    if (op === "×")      direction = v > 1 ? 1 : (v < 1 ? -1 : 0);
    else if (op === "÷") direction = v > 1 ? -1 : (v > 0 && v < 1 ? 1 : 0);
    else if (op === "−") direction = -Math.sign(v);
    else                 direction = Math.sign(v);
    const polarity = row.type === "property" ? propertyPolarity(row.property) : 1;
    return direction * polarity > 0;
}

/**
 * Scale one row by `potency`. +/− values shrink toward zero (+3 → +1 at
 * half strength); × / ÷ move toward 1 (×2 → ×1.5). Booleans, "=" and
 * flavours have no magnitude to scale.
 */
export function scaleRow(row, potency) {
    if (potency === 1 || !row || row.type === "flavour") return row;
    if (row.type === "property" && isBooleanProperty(row.property)) return row;
    const op = rowOp(row);
    if (op === "=") return row;
    const v = Number(row.value) || 0;
    const value = (op === "×" || op === "÷") ? 1 + (v - 1) * potency : Math.trunc(v * potency);
    return { ...row, value };
}

/** Potency stored on an effect's flags (1 when unset). */
export function potencyOf(flags) {
    const p = Number(flags?.potency);
    return Number.isFinite(p) && p >= 0 ? p : 1;
}

/**
 * Bonus rows a drug effect applies right now, from its flag bag. Onset
 * applies nothing; nullify only touches the onset/active phase, so
 * withdrawal always arrives (scaled by potency).
 */
export function drugRowsFromFlags(flags) {
    if (!flags?.isDrugEffect) return [];
    const phase = flags.phase || "active";
    if (phase === "onset") return [];
    let rows = (phase === "withdrawal" ? flags.withdrawalChanges : flags.activeChanges) || [];
    if (phase === "active") {
        if (flags.nullify === "all") return [];
        if (flags.nullify === "positive") rows = rows.filter(r => !isPositiveRow(r));
    }
    const potency = potencyOf(flags);
    return potency === 1 ? rows : rows.map(r => scaleRow(r, potency));
}

/**
 * Flavour keys in force right now, from the flag bag. Flavours are side
 * effects: Bad Cancel Out keeps them, a full nullify drops them.
 */
export function drugFlavoursFromFlags(flags) {
    if (!flags?.isDrugEffect) return [];
    const phase = flags.phase || "active";
    if (phase === "onset") return [];
    if (phase === "withdrawal") return flags.withdrawalFlavours || [];
    if (flags.nullify === "all") return [];
    return flags.activeFlavours || [];
}

/** Strength after potency — drives cumulative bumps, resist rolls and later mixing rolls. */
export function effectiveStrengthFromFlags(flags) {
    const s = Math.max(0, Math.floor(Number(flags?.strength) || 0));
    return Math.floor(s * potencyOf(flags));
}
