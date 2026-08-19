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

import { CUMULATIVE_STRENGTH_MUL } from "./lookups.js";

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
    await bumpCumulatives(actor, flags.cumulativeKeys || [], flags.strength || 0);
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
        const { mode, value } = modeAndValueForOp(b.op || "+", Number(b.value) || 0);
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
                strength: Math.max(0, Math.floor(Number(sys.strength) || 0))
            }
        }
    };
}

/** True if `effect` is a drug-applied effect created by this system. */
export function isDrugEffect(effect) {
    return effect?.getFlag?.("cyberpunk", DRUG_EFFECT_FLAG) === true;
}

/**
 * Bonuses currently in force for `effect`, based on its phase flag. Used by
 * the bonus pipeline to feed drug contributions into the per-stat × → + → =
 * machinery alongside item bonuses. Onset returns an empty list — no
 * effects apply until the drug takes hold.
 */
export function activeDrugBonuses(effect) {
    if (!isDrugEffect(effect)) return [];
    const phase = effect.getFlag("cyberpunk", "phase") || "active";
    if (phase === "onset") return [];
    const key = phase === "withdrawal" ? "withdrawalChanges" : "activeChanges";
    return effect.getFlag("cyberpunk", key) || [];
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

    if (effectData?.flags?.cyberpunk?.phase === "active") {
        await bumpCumulativesFromEffect(effectData, targetActor);
    }
    return effect ?? null;
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
    for (const actor of game.actors) {
        for (const effect of actor.effects) {
            if (!isDrugEffect(effect)) continue;
            if (getDrugRemainingSeconds(effect) > 0) continue;
            pending.push(advanceDrugPhase(effect));
        }
    }
    await Promise.all(pending);
}
