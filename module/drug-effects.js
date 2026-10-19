/**
 * Drug → ActiveEffect plumbing.
 *
 * Drugs are unique in this system: they're the one item type whose effects
 * detach from the source on use, get a duration / icon / token display, and
 * can flip between "active" and "withdrawal" phases mid-life. We model them
 * as Foundry ActiveEffect documents on the target actor (decoupled from the
 * supply item), and centralise every read / write in this module so the
 * chat-card Apply handler, the State-tab phase button, and the migration
 * pass all build effects from the same shape.
 *
 * Key design notes:
 *   - The applied effect carries BOTH the active and withdrawal bonus lists
 *     in its flags (`activeChanges` / `withdrawalChanges`) so the phase
 *     button can swap `effect.changes` + `effect.duration` without re-
 *     fetching the supply (which may have been used up or deleted).
 *   - The bonus pipeline in actor.js reads the raw flag list for the
 *     current phase rather than decoding `effect.changes[].key`. That keeps
 *     the propertyOps machinery untouched and source-attributed.
 *   - Foundry's native auto-apply would run BEFORE prepareDerivedData and
 *     in a different ordering than our × → + → = pipeline, so the actor
 *     overrides `applyActiveEffects` to skip drug effects. See actor.js.
 */

import { CUMULATIVE_STRENGTH_MUL, effectiveBonusOp } from "./lookups.js";
import {
    MIXING_TABLE, OVERDOSE_TABLE, MAX_STACKED_DOSES,
    bandFor, bandByKey, drugIdentity, pairKey, isOverdose,
    mixChangeFor, mixFlagPatch, drugRowsFromFlags, effectiveStrengthFromFlags
} from "./drug-interactions.js";
import { renderTemplateCompat, actorsWithOwnEffects } from "./utils.js";
import { processFormulaRoll } from "./dice.js";

const DRUG_EFFECT_FLAG = "isDrugEffect";

/**
 * Increment the actor's cumulative counters for every key in `keys` by
 * the drug-strength → multiplier lookup. No-op for strengths outside
 * 1..6 (out-of-range drug misconfig — no meaningful multiplier).
 *
 * Called once per Onset → Active (or direct-apply → Active) transition.
 * Never called on wear-off — the accumulator persists past the drug
 * itself; only the GM can lower it.
 */
async function bumpCumulatives(actor, keys, strength) {
    if (!actor || !keys?.length) return;
    const inc = CUMULATIVE_STRENGTH_MUL[strength];
    if (!inc) return;
    // Flat map of numbers — a shallow spread is enough; deepClone was
    // wasted work on the hot Active-entry path.
    const cur = { ...(actor.system?.cumulative || {}) };
    for (const k of keys) {
        if (!k) continue;
        cur[k] = (Number(cur[k]) || 0) + inc;
    }
    await actor.update({ "system.cumulative": cur });
}

/**
 * Read the cumulative-bump inputs off an effect (or effect-create-data)
 * and apply them to `actor`. Both Active-phase entry points (direct
 * apply + Onset expiry) go through here so the "cumulative bump on
 * Active entry" invariant lives in one place.
 */
async function bumpCumulativesFromEffect(effectOrData, actor) {
    const flags = effectOrData?.flags?.cyberpunk;
    if (!flags) return;
    // Effective strength — a Partially Compatible mix halves the bump too.
    await bumpCumulatives(actor, flags.cumulativeKeys || [], effectiveStrengthFromFlags(flags));
}

/**
 * Current in-game time in seconds, sourced from the system's own clock
 * (`cyberpunk.gameTimeOffset`). Combat-round advancement and the calendar
 * toolbox both bump that setting, so a single source covers both flows.
 */
function currentGameSeconds() {
    return Math.floor((game.settings.get("cyberpunk", "gameTimeOffset") || 0) / 1000);
}

/** Duration flag name for a given lifecycle phase. */
function durationFlagFor(phase) {
    if (phase === "onset")      return "onsetDuration";
    if (phase === "withdrawal") return "withdrawalDuration";
    return "activeDuration";
}

/**
 * Remaining seconds before the effect's CURRENT phase expires.
 *   - Effect carries `startedAt` (game-seconds) + phase-duration flag.
 *   - Returns `Infinity` for drugs with no duration on the active phase
 *     (manual wear-off only — never auto-advances).
 *   - Returns 0 once elapsed ≥ phase duration; never negative.
 */
export function getDrugRemainingSeconds(effect) {
    if (!isDrugEffect(effect)) return Infinity;
    const phase = effect.getFlag("cyberpunk", "phase") || "active";
    const total = Number(effect.getFlag("cyberpunk", durationFlagFor(phase))) || 0;
    if (total <= 0) return Infinity;
    const startedAt = Number(effect.getFlag("cyberpunk", "startedAt") || currentGameSeconds());
    // Clamp elapsed at zero so a backwards-tick of the GM clock doesn't
    // inflate `remaining` above the original duration.
    const elapsed = Math.max(0, currentGameSeconds() - startedAt);
    return Math.max(0, total - elapsed);
}

/**
 * Map a bonus op to a Foundry ACTIVE_EFFECT_MODES code + an adjusted value.
 * We override `applyActiveEffects` on the actor to skip drug effects (we read
 * them manually in the pipeline), so the mode/value here is what 3rd-party
 * modules and Foundry's own UI see — we want them to interpret the change
 * correctly in case anything iterates `effect.changes` directly.
 *
 *   "+"  → ADD       (value as-is)
 *   "−"  → ADD       (value negated)
 *   "×"  → MULTIPLY  (value as-is)
 *   "÷"  → MULTIPLY  (1/value, with a divide-by-zero guard)
 *   "="  → OVERRIDE  (value as-is)
 *   other → ADD      (defensive default)
 */
function modeAndValueForOp(op, value) {
    // V14: ActiveEffect change.mode is a string type from
    // CONST.ACTIVE_EFFECT_CHANGE_TYPES ("add" / "multiply" /
    // "override" / …). The old numeric `ACTIVE_EFFECT_MODES` constants
    // still work with a deprecation warning; using strings directly
    // is future-proof through V16 removal.
    if (op === "×") return { mode: "multiply", value };
    if (op === "÷") return { mode: "multiply", value: value === 0 ? 1 : 1 / value };
    if (op === "−") return { mode: "add",      value: -value };
    if (op === "=") return { mode: "override", value };
    return { mode: "add", value };
}

/**
 * Convert a list of bonus rows to Foundry ActiveEffect.changes entries.
 *
 * Bonus.property shapes the pipeline accepts:
 *   - "stats.<key>"          → `system.stats.<key>.total`
 *   - "stats.<key>.tempMod"  → `system.stats.<key>.total` (legacy → normalised)
 *   - "<propName>"           → `system.<propName>`
 *
 * Only `property`-type bonuses become changes — skill-type bonuses don't
 * have a clean ActiveEffect mapping (skills resolve through a separate
 * pipeline in actor._resolveSkillValue) and are carried in the flag
 * payload only, where the actor reads them back as item-style entries.
 */
export function bonusesToChanges(bonuses = []) {
    const out = [];
    for (const b of bonuses) {
        if (b?.type !== "property" || !b.property) continue;
        const parts = String(b.property).split(".");
        let key;
        if (parts[0] === "stats" && parts.length >= 2) {
            key = `system.stats.${parts[1]}.total`;
        } else {
            key = `system.${b.property}`;
        }
        const { mode, value } = modeAndValueForOp(effectiveBonusOp(b.property, b.op), Number(b.value) || 0);
        out.push({
            key,
            mode,
            value: String(value),
            priority: undefined // Foundry picks per-mode default
        });
    }
    return out;
}

/**
 * Build the create-data for the ActiveEffect that represents one applied
 * dose of `supply`. Enters the Onset phase when `onsetDuration > 0`
 * (no bonuses in force until the timer ticks over); otherwise goes
 * straight to Active. Withdrawal duration is rolled 2d6 hours on the
 * Active → Withdrawal transition rather than authored per-drug, so
 * there's nothing to precompute here for withdrawal timing.
 */
export function buildDrugEffectData(supply) {
    const sys = supply.system || {};
    const activeBonuses     = sys.bonuses     || [];
    const withdrawalBonuses = sys.withdrawal  || [];
    // Flavour rows split from property rows — flavours don't
    // contribute to the ActiveEffect changes, they surface as
    // hint-icon slots on the State-tab drug row and (when authored
    // with roll metadata) as clickable resistance-check buttons.
    const activeFlavours     = activeBonuses.filter(b => b?.type === "flavour").map(b => b.flavour).filter(Boolean);
    const withdrawalFlavours = withdrawalBonuses.filter(b => b?.type === "flavour").map(b => b.flavour).filter(Boolean);
    // Cumulative keys authored on the drug; carried as a flag so the
    // effect can bump the actor's per-key counter when it enters the
    // Active phase (independent of the underlying supply, which may
    // have been consumed by then).
    const cumulativeKeys = (sys.cumulative || [])
        .filter(c => c?.type === "cumulative" || c?.type == null) // legacy rows w/o `type` still count
        .map(c => c.cumulative)
        .filter(Boolean);
    const activeDuration = Math.max(0, Math.floor(Number(sys.duration)      || 0));
    const onsetDuration  = Math.max(0, Math.floor(Number(sys.onsetDuration) || 0));
    const startInOnset   = onsetDuration > 0;
    const phase       = startInOnset ? "onset"      : "active";
    const status      = startInOnset ? "drug-onset" : "drug-active";
    const initialChanges = startInOnset ? [] : bonusesToChanges(activeBonuses);
    const initialTimer   = startInOnset
        ? (onsetDuration > 0  ? { seconds: onsetDuration  } : {})
        : (activeDuration > 0 ? { seconds: activeDuration } : {});

    return {
        name: supply.name,
        img:  supply.img,
        changes: initialChanges,
        duration: initialTimer,
        statuses: [status],
        flags: {
            cyberpunk: {
                [DRUG_EFFECT_FLAG]: true,
                sourceUuid: supply.uuid,
                sourceImg:  supply.img,
                sourceName: supply.name,
                phase,
                // Anchor for elapsed-time math. Updated on phase advance so
                // each phase's countdown starts fresh, not from apply time.
                startedAt: currentGameSeconds(),
                activeChanges:     activeBonuses,      // raw bonus rows
                withdrawalChanges: withdrawalBonuses,  // raw bonus rows
                activeFlavours,                        // string[] — for state-tab hint icons
                withdrawalFlavours,                    // string[] — swapped in on phase advance
                cumulativeKeys,                        // string[] — bumped on Active-phase entry
                onsetDuration,
                activeDuration,
                // Withdrawal duration is rolled 2d6h at the Active →
                // Withdrawal transition. Stored as 0 until then.
                withdrawalDuration: 0,
                strength: Math.max(0, Math.floor(Number(sys.strength) || 0)),
                // Mixing / multiple-dose state, filled in by
                // evaluateDrugIntake right after the effect is created.
                // `safeToMix` is copied here because the supply item may
                // be used up before the drug meets another one.
                safeToMix: sys.safeToMix === true,
                dose: 1,
                potency: 1,
                nullify: null,
                mixedWith: []
            }
        }
    };
}

/** True if `effect` is a drug-applied effect created by this system. */
export function isDrugEffect(effect) {
    return effect?.getFlag?.("cyberpunk", DRUG_EFFECT_FLAG) === true;
}

/**
 * Bonuses currently in force for `effect`: its phase's rows after mixing
 * potency and nullify. Onset returns an empty list — no effects apply
 * until the drug takes hold.
 */
export function activeDrugBonuses(effect) {
    if (!isDrugEffect(effect)) return [];
    return drugRowsFromFlags(effect.flags.cyberpunk);
}

/**
 * Apply one dose of `supply` to `targetActor`: create the effect, decrement
 * the supply by one (deleting the supply item when it hits zero).
 *
 * Safe to call cross-actor — the only writes are on `targetActor.effects`
 * (effect create) and `supply.parent` (quantity decrement / delete).
 *
 * @returns {Promise<ActiveEffect|null>} The created effect, or null on failure.
 */
/**
 * Materialise a drug effect on `targetActor` from a drug item template
 * WITHOUT touching the source's quantity. Use this when the drug is a
 * shared template (weapon-attached, compendium-referenced) rather than
 * a consumable dose sitting in someone's gear.
 *
 * Also handles the cumulative counter bump for drugs that skip Onset
 * — same behaviour as `applyDrugToActor` minus the supply decrement.
 */
export async function spawnDrugEffect(source, targetActor) {
    if (!source || !targetActor) return null;

    const effectData = buildDrugEffectData(source);
    const [effect] = await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    if (!effect) return null;

    // Multiple doses / mixing / overdose run before the cumulative bump
    // so a Partially Compatible mix halves the bump as well. A failure
    // here must not lose the dose itself.
    try {
        await evaluateDrugIntake(targetActor, effect);
    } catch (err) {
        console.error("CYBERPUNK | Drug interaction check failed:", err);
    }

    if (effect.getFlag("cyberpunk", "phase") === "active") {
        await bumpCumulativesFromEffect(effect, targetActor);
    }
    return effect;
}

export async function applyDrugToActor(supply, targetActor) {
    if (!supply || !targetActor) return null;

    const effect = await spawnDrugEffect(supply, targetActor);

    // Decrement supply on its owning actor (may be a different actor than target).
    const supplyActor = supply.parent;
    if (supplyActor?.documentName === "Actor") {
        const newQty = (Number(supply.system?.quantity) || 1) - 1;
        if (newQty <= 0) {
            await supply.delete();
        } else {
            await supply.update({ "system.quantity": newQty });
        }
    }

    return effect;
}

/**
 * Toggle a drug effect through its lifecycle:
 *   "onset"                      → flip to "active" (apply the active bonuses, start Duration timer)
 *   "active" + has withdrawal    → flip to "withdrawal" (roll 2d6h, swap changes + status)
 *   "active" + no withdrawal     → wear off (skip the empty phase, drop the effect)
 *   "withdrawal"                 → wear off (delete the effect entirely)
 *
 * The "no withdrawal" path is the common case for stimulants and other
 * one-phase drugs — without it the player would have to click twice to
 * dismiss an active effect that has nothing to transition into.
 *
 * Called both by the State-tab phase button and by the timer expiry
 * sweep, so a click and a game-clock tick land on identical behaviour.
 */
export async function advanceDrugPhase(effect) {
    if (!isDrugEffect(effect)) return;
    const phase = effect.getFlag("cyberpunk", "phase") || "active";

    if (phase === "onset") {
        // Onset → Active. Apply the drug's active bonuses and start the
        // Duration timer. Skipping this phase from a manual click before
        // the onset timer expires is fine — the active phase inherits a
        // fresh `startedAt` so its own countdown is intact.
        const activeChanges = effect.getFlag("cyberpunk", "activeChanges") || [];
        const activeDuration = effect.getFlag("cyberpunk", "activeDuration") || 0;
        await effect.update({
            changes: bonusesToChanges(activeChanges),
            duration: activeDuration > 0 ? { seconds: activeDuration } : {},
            statuses: ["drug-active"],
            "flags.cyberpunk.phase": "active",
            "flags.cyberpunk.startedAt": currentGameSeconds()
        });
        // Cumulative bump lands on Active entry (deferred from apply
        // because the drug started in Onset).
        await bumpCumulativesFromEffect(effect, effect.parent);
        return;
    }

    if (phase === "active") {
        const wdChanges = effect.getFlag("cyberpunk", "withdrawalChanges") || [];
        if (wdChanges.length === 0) {
            await effect.delete();
            return;
        }
        // Withdrawal duration is always 2d6 hours — rolled now, stored
        // on the effect so display and expiry read the same value.
        const wdHours = (await new Roll("2d6").evaluate()).total;
        const wdSeconds = wdHours * 3600;
        await effect.update({
            changes: bonusesToChanges(wdChanges),
            duration: { seconds: wdSeconds },
            statuses: ["drug-withdrawal"],
            "flags.cyberpunk.phase": "withdrawal",
            "flags.cyberpunk.startedAt": currentGameSeconds(),
            "flags.cyberpunk.withdrawalDuration": wdSeconds
        });
        return;
    }

    // withdrawal → wear off
    await effect.delete();
}

/**
 * Walk every drug effect on every actor; advance any whose current phase
 * has expired. Runs only on the active GM client so the wear-off / phase-
 * swap fires exactly once per expiration event.
 *
 * Triggered by the `cyberpunk.gameTimeOffset` setting's onChange — both
 * the calendar dialog (manual advance) and combat-round ticking (3 sec/
 * round, from the `updateCombat` hook) feed that setting, so this single
 * entry point covers both time-flow paths.
 */
export async function checkDrugEffectExpiration() {
    if (game.user?.id !== game.users?.activeGM?.id) return;
    if (!game.actors) return;
    const pending = [];
    for (const actor of actorsWithOwnEffects()) {
        for (const effect of actor.effects) {
            if (!isDrugEffect(effect)) continue;
            if (getDrugRemainingSeconds(effect) > 0) continue;
            pending.push(advanceDrugPhase(effect));
        }
    }
    await Promise.all(pending);
}

/* -------------------------------------------- */
/*  Multiple doses, mixing and overdose          */
/* -------------------------------------------- */

/** Phases in which a drug counts as "in the system" for mixing and dose counting. */
const PRESENT_PHASES = new Set(["onset", "active"]);

/**
 * Reactions rolled on this client that the GM hasn't saved to the world
 * setting yet, so a second dose moments later doesn't re-roll a pair the
 * setting hasn't caught up with. Cleared entry by entry as they persist.
 */
const pendingMemory = { pairs: {}, overdoses: {} };

const L = (key) => game.i18n.localize(`CYBERPUNK.${key}`);
const F = (key, data) => game.i18n.format(`CYBERPUNK.${key}`, data);

function reactionMemory() {
    try { return game.settings.get("cyberpunk", "drugReactions") || {}; }
    catch { return {}; }
}

function rememberedPair(key) {
    return pendingMemory.pairs[key] ?? reactionMemory().pairs?.[key] ?? null;
}

function rememberedOverdose(identity) {
    return pendingMemory.overdoses[identity] ?? reactionMemory().overdoses?.[identity] ?? null;
}

function automationEnabled(settingKey) {
    try { return game.settings.get("cyberpunk", settingKey) !== false; }
    catch { return true; }
}

function drugPhase(effect) {
    return effect.getFlag("cyberpunk", "phase") || "active";
}

function identityOf(effect) {
    return drugIdentity(effect.getFlag("cyberpunk", "sourceName") || effect.name);
}

/** `{ potency: … }` → `{ "flags.cyberpunk.potency": … }` for an effect update. */
function flagUpdate(patch) {
    return Object.fromEntries(Object.entries(patch).map(([k, v]) => [`flags.cyberpunk.${k}`, v]));
}

/**
 * Rules check for every new dose — the drug card and gas weapons both
 * land here through spawnDrugEffect:
 *   - counts doses of the same drug still in onset / active; past the
 *     2nd, a dose is nullified (the rules' doubling cap);
 *   - mixes the dose with every other drug in onset / active, unless
 *     either side is Safe to mix;
 *   - checks the overdose threshold (30 / Strength doses).
 * Changes to the drugs land immediately; consequences (damage,
 * unconsciousness, a death save) go to chat cards with GM-only Apply
 * buttons, one card per reaction.
 */
async function evaluateDrugIntake(actor, effect) {
    if (actor?.type !== "character") return;
    const flags = effect.flags.cyberpunk;
    const identity = identityOf(effect);
    const present = actor.effects.filter(e =>
        e.id !== effect.id && isDrugEffect(e) && PRESENT_PHASES.has(drugPhase(e)));

    const dose = present.filter(e => identityOf(e) === identity).length + 1;
    let own = { dose, potency: 1, nullify: dose > MAX_STACKED_DOSES ? "all" : null, mixedWith: [] };

    const cards = [];
    if (automationEnabled("drugMixing") && !flags.safeToMix) {
        const others = new Map();
        for (const e of present) {
            const id = identityOf(e);
            if (id === identity) continue;
            if (!others.has(id)) others.set(id, []);
            others.get(id).push(e);
        }
        for (const [otherId, otherEffects] of others) {
            if (otherEffects.some(e => e.getFlag("cyberpunk", "safeToMix") === true)) continue;
            const reaction = await resolveMixing(identity, flags, otherId, otherEffects[0].flags.cyberpunk);
            const ownPatch = mixFlagPatch(own, mixChangeFor(reaction.band, identity, reaction.winner),
                otherId, reaction.band.key);
            if (ownPatch) own = { ...own, ...ownPatch };
            for (const other of otherEffects) {
                const patch = mixFlagPatch(other.flags.cyberpunk, mixChangeFor(reaction.band, otherId, reaction.winner),
                    identity, reaction.band.key);
                if (patch) await other.update(flagUpdate(patch));
            }
            cards.push(await mixingCard(actor, effect, otherEffects[0], reaction));
        }
    }
    await effect.update(flagUpdate(own));

    if (automationEnabled("drugOverdose") && isOverdose(dose, flags.strength)) {
        cards.push(await overdoseCard(actor, effect, identity, dose));
    }
    for (const card of cards) await ChatMessage.create(card);
}

/**
 * Mixing result for a pair: the remembered band if the world has seen this
 * pair before, otherwise a fresh d100 + both drugs' effective Strength.
 * Single Dominance picks its winner at random once; it's remembered too.
 */
async function resolveMixing(identity, flags, otherId, otherFlags) {
    const key = pairKey(identity, otherId);
    const known = rememberedPair(key);
    const knownBand = known && bandByKey(MIXING_TABLE, known.band);
    if (knownBand) return { band: knownBand, winner: known.winner ?? null, rolls: [], remember: null };

    const roll = await new Roll("1d100").evaluate();
    const total = roll.total + effectiveStrengthFromFlags(flags) + effectiveStrengthFromFlags(otherFlags);
    const band = bandFor(MIXING_TABLE, total);
    const winner = band.nullify === "loser" ? (Math.random() < 0.5 ? identity : otherId) : null;
    const entry = { band: band.key, winner };
    pendingMemory.pairs[key] = entry;
    return { band, winner, rolls: [roll], remember: { pairs: [{ key, ...entry }] } };
}

/** Overdose result for a drug: remembered band, or a fresh d100 + Strength. */
async function resolveOverdose(identity, strength) {
    const known = bandByKey(OVERDOSE_TABLE, rememberedOverdose(identity));
    if (known) return { band: known, rolls: [], remember: null };

    const roll = await new Roll("1d100").evaluate();
    const band = bandFor(OVERDOSE_TABLE, roll.total + strength);
    pendingMemory.overdoses[identity] = band.key;
    return { band, rolls: [roll], remember: { overdoses: [{ id: identity, band: band.key }] } };
}

function strengthOf(flags) {
    return Math.max(0, Math.floor(Number(flags?.strength) || 0));
}

function drugRow(effect, subtext) {
    return { img: effect.img, name: effect.name, subtext };
}

/** Condition icon path — the same glyphs the hit cards' effect rows use. */
function conditionIcon(id) {
    return `systems/cyberpunk/img/conditions/${id}.svg`;
}

/** "1 day" / "9 days", "7 hours" — `unit` is "Day" or "Hour". */
export function drugReactionDuration(n, unit) {
    return F(`DrugReaction${unit}${n === 1 ? "" : "s"}`, { n });
}

/**
 * What a mixing band does to the two drugs, as effect rows. Fully
 * Compatible changes nothing, so it has none — the result name says it.
 */
function mixingDrugRows(band, sides, winner) {
    const row = (side, key) => ({ icon: side.effect.img, label: F(key, { drug: side.effect.name }) });
    if ((band.potency ?? 1) !== 1) return sides.map(s => row(s, "DrugReactionHalfStrength"));
    if (band.nullify === "all") return sides.map(s => row(s, "DrugReactionNullified"));
    if (band.nullify === "positive") return sides.map(s => row(s, "DrugReactionPositivesNullified"));
    if (band.nullify === "loser") {
        return sides.filter(s => s.identity !== winner).map(s => row(s, "DrugReactionNullified"));
    }
    return [];
}

/**
 * What a band does to the character, as card rows — a damage roll or an
 * effect row — plus the actions their Apply buttons run. Damage, hours
 * and days are rolled now (every time — only the band is remembered); a
 * death save's coma days are rolled when the save succeeds. Nausea needs
 * no row of its own: the result name already says it.
 */
async function consequenceRows(band, rolls) {
    const rows = [];
    const actions = [];
    const roll = async (formula) => {
        const r = await new Roll(formula).evaluate();
        rolls.push(r);
        return r;
    };
    // `hasAction` because Handlebars reads action index 0 as falsy.
    const withAction = (row, action) => {
        actions.push(action);
        return { ...row, hasAction: true, actionIndex: actions.length - 1 };
    };

    if (band.damage) {
        const r = await roll(band.damage);
        rows.push(withAction({ damage: processFormulaRoll(r) }, { type: "damage", amount: r.total }));
    }
    if (band.illness) {
        const days = (await roll(band.illDays)).total;
        const name = band.illness === "extreme" ? "DrugReactionExtremelyIll" : "DrugReactionSeverelyIll";
        rows.push({ icon: conditionIcon("poisoned"), label: `${L(name)} · ${drugReactionDuration(days, "Day")}` });
    }
    if (band.unconsciousHours) {
        const hours = (await roll(band.unconsciousHours)).total;
        rows.push(withAction(
            { icon: conditionIcon("unconscious"), label: `${L("DrugReactionUnconscious")} · ${drugReactionDuration(hours, "Hour")}` },
            { type: "unconscious" }));
    }
    if (band.deathSave) {
        rows.push(withAction(
            { icon: conditionIcon("dead"), label: `${L("DrugReactionDeathSave")} −${Math.abs(band.deathSave)}` },
            { type: "deathSave", modifier: band.deathSave, comaDays: band.comaDays }));
    } else if (band.comaDays) {
        const days = (await roll(band.comaDays)).total;
        rows.push(withAction(
            { icon: conditionIcon("unconscious"), label: `${L("DrugReactionComa")} · ${drugReactionDuration(days, "Day")}` },
            { type: "unconscious" }));
    }
    return { rows, actions };
}

/** Chat-message data for one reaction card. */
async function reactionCard(actor, { kind, drugs, band, rolls, rows, actions, remember }) {
    const content = await renderTemplateCompat("systems/cyberpunk/templates/chat/drug-reaction.hbs", {
        sectionLabel: L(kind === "overdose" ? "Overdose" : "MixingDrugs"),
        drugs,
        resultLabel: L(band.labelKey),
        rows
    });
    const drugReaction = { kind, band: band.key, actorUuid: actor.uuid, actions, applied: {} };
    if (remember) drugReaction.remember = remember;
    return {
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        rolls,
        flags: { cyberpunk: { drugReaction } }
    };
}

async function mixingCard(actor, effect, otherEffect, reaction) {
    const sides = [
        { identity: identityOf(effect), effect },
        { identity: identityOf(otherEffect), effect: otherEffect }
    ];
    const rolls = [...reaction.rolls];
    const consequences = await consequenceRows(reaction.band, rolls);
    return reactionCard(actor, {
        kind: "mixing",
        drugs: sides.map(s => drugRow(s.effect, `${L("DrugStrength")} ${strengthOf(s.effect.flags.cyberpunk)}`)),
        band: reaction.band,
        rolls,
        rows: [...mixingDrugRows(reaction.band, sides, reaction.winner), ...consequences.rows],
        actions: consequences.actions,
        remember: reaction.remember
    });
}

async function overdoseCard(actor, effect, identity, dose) {
    const strength = strengthOf(effect.flags.cyberpunk);
    const od = await resolveOverdose(identity, strength);
    const rolls = [...od.rolls];
    const consequences = await consequenceRows(od.band, rolls);
    return reactionCard(actor, {
        kind: "overdose",
        drugs: [drugRow(effect, `${L("DrugStrength")} ${strength} · ${F("DrugReactionDose", { n: dose })}`)],
        band: od.band,
        rolls,
        rows: consequences.rows,
        actions: consequences.actions,
        remember: od.remember
    });
}

/**
 * Save newly rolled reactions to the world setting. Only Assistant GM and
 * up may write world settings, so the rolling client ships them in the
 * card's flags and the active GM's client persists them. The first roll
 * of a pair wins; existing entries are never overwritten.
 */
async function persistReactionMemory(remember) {
    const memory = foundry.utils.deepClone(reactionMemory());
    memory.pairs ??= {};
    memory.overdoses ??= {};
    let changed = false;
    for (const { key, band, winner } of remember.pairs ?? []) {
        if (!key || memory.pairs[key]) continue;
        memory.pairs[key] = { band, winner: winner ?? null };
        changed = true;
    }
    for (const { id, band } of remember.overdoses ?? []) {
        if (!id || memory.overdoses[id]) continue;
        memory.overdoses[id] = band;
        changed = true;
    }
    if (changed) await game.settings.set("cyberpunk", "drugReactions", memory);
}

/**
 * Drop this client's pending entries once they're in the world setting —
 * called from the setting's onChange, so a GM forgetting a reaction later
 * isn't masked by a stale local copy.
 */
export function syncPendingDrugMemory(memory) {
    for (const key of Object.keys(pendingMemory.pairs)) {
        if (memory?.pairs?.[key]) delete pendingMemory.pairs[key];
    }
    for (const id of Object.keys(pendingMemory.overdoses)) {
        if (memory?.overdoses?.[id]) delete pendingMemory.overdoses[id];
    }
}

// Singleton, registered at module load like the chat-message hooks.
Hooks.on("createChatMessage", (message) => {
    const remember = message.flags?.cyberpunk?.drugReaction?.remember;
    if (!remember) return;
    if (game.user?.id !== game.users?.activeGM?.id) return;
    persistReactionMemory(remember)
        .catch(err => console.error("CYBERPUNK | Could not save drug reaction memory:", err));
});
