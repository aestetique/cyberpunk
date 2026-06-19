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

const DRUG_EFFECT_FLAG = "isDrugEffect";

/**
 * Current in-game time in seconds, sourced from the system's own clock
 * (`cyberpunk.gameTimeOffset`). Combat-round advancement and the calendar
 * toolbox both bump that setting, so a single source covers both flows.
 */
function currentGameSeconds() {
    return Math.floor((game.settings.get("cyberpunk", "gameTimeOffset") || 0) / 1000);
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
    const total = Number(phase === "withdrawal"
        ? effect.getFlag("cyberpunk", "withdrawalDuration")
        : effect.getFlag("cyberpunk", "activeDuration")) || 0;
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
    if (op === "×") return { mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value };
    if (op === "÷") return { mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY, value: value === 0 ? 1 : 1 / value };
    if (op === "−") return { mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -value };
    if (op === "=") return { mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value };
    return { mode: CONST.ACTIVE_EFFECT_MODES.ADD, value };
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
 * dose of `supply`. Always starts in the active phase; the State-tab
 * button later flips it to withdrawal or wears it off.
 */
export function buildDrugEffectData(supply) {
    const sys = supply.system || {};
    const activeBonuses     = sys.bonuses     || [];
    const withdrawalBonuses = sys.withdrawal  || [];
    const activeDuration     = Math.max(0, Math.floor(Number(sys.duration)            || 0));
    const withdrawalDuration = Math.max(0, Math.floor(Number(sys.withdrawalDuration)  || 0));

    return {
        name: supply.name,
        img:  supply.img,
        changes: bonusesToChanges(activeBonuses),
        duration: activeDuration > 0 ? { seconds: activeDuration } : {},
        statuses: ["drug-active"],
        flags: {
            cyberpunk: {
                [DRUG_EFFECT_FLAG]: true,
                sourceUuid: supply.uuid,
                sourceImg:  supply.img,
                sourceName: supply.name,
                phase: "active",
                // Anchor for elapsed-time math. Updated on phase advance so
                // the withdrawal countdown starts fresh, not from the apply
                // time.
                startedAt: currentGameSeconds(),
                activeChanges:     activeBonuses,      // raw bonus rows
                withdrawalChanges: withdrawalBonuses,  // raw bonus rows
                activeDuration,
                withdrawalDuration,
                strength:           Math.max(0, Math.floor(Number(sys.strength)           || 0)),
                withdrawalStrength: Math.max(0, Math.floor(Number(sys.withdrawalStrength) || 0))
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
 * machinery alongside item bonuses.
 */
export function activeDrugBonuses(effect) {
    if (!isDrugEffect(effect)) return [];
    const phase = effect.getFlag("cyberpunk", "phase") || "active";
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
export async function applyDrugToActor(supply, targetActor) {
    if (!supply || !targetActor) return null;

    const effectData = buildDrugEffectData(supply);
    const [effect] = await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);

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

    return effect ?? null;
}

/**
 * Toggle a drug effect through its lifecycle:
 *   "active" + has withdrawal    → flip to "withdrawal" (swap changes + duration + status)
 *   "active" + no withdrawal     → wear off (skip the empty phase, drop the effect)
 *   "withdrawal"                 → wear off (delete the effect entirely)
 *
 * The "no withdrawal" path is the common case for stimulants and other
 * one-phase drugs — without it the player would have to click twice to
 * dismiss an active effect that has nothing to transition into.
 *
 * Called by the State-tab phase button.
 */
export async function advanceDrugPhase(effect) {
    if (!isDrugEffect(effect)) return;
    const phase = effect.getFlag("cyberpunk", "phase") || "active";

    if (phase === "active") {
        const wdChanges = effect.getFlag("cyberpunk", "withdrawalChanges") || [];
        if (wdChanges.length === 0) {
            await effect.delete();
            return;
        }
        const wdDuration = effect.getFlag("cyberpunk", "withdrawalDuration") || 0;
        await effect.update({
            changes: bonusesToChanges(wdChanges),
            duration: wdDuration > 0 ? { seconds: wdDuration } : {},
            statuses: ["drug-withdrawal"],
            "flags.cyberpunk.phase": "withdrawal",
            "flags.cyberpunk.startedAt": currentGameSeconds()
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
