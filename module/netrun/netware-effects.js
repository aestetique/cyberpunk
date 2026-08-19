/**
 * Netware-effect plumbing — the "Custom" attacker/BI effect at apply
 * time. When an attacker/BI item hits a target with `attackerEffect ===
 * "custom"`, we spawn an ActiveEffect on the target derived from the
 * item's `bonuses[]` payload and lifetime from `effectDuration`.
 *
 * Design mirrors the drug-effect pipeline (`drug-effects.js`) so both
 * ActiveEffect flavours read the same on the actor:
 *   - Flag `isNetwareEffect: true` marks the effect as netware-origin.
 *   - `activeChanges` carries the authored bonus rows (property + op
 *     + value); the standard actor pipeline reads it back the same way
 *     it reads drug `activeChanges`.
 *   - `startedAt` + `activeDuration` power the countdown + auto-expiry.
 *   - Attribute rows may carry a dice formula in `value` — rolled ONCE
 *     at apply time and frozen to the integer result on the spawned
 *     effect (so the resulting effect matches the "roll once when the
 *     attack lands" spec, not a re-roll on every prep pass).
 *
 * Op on all rows is forced to `−` by the authoring UI; we keep whatever
 * op was stored and let the actor pipeline apply it faithfully.
 */

const NETWARE_EFFECT_FLAG = "isNetwareEffect";

/**
 * Compact one-line summary of an attacker/BI Custom effect's authored
 * bonus rows for chat-card display. Uses short stat codes (INT / REF /
 * MA / …) and the bare last segment of NET Bonus keys ("Speed" not
 * "NET Bonus: Speed"). Values render verbatim so authored formulas
 * (`1d6`) stay legible — chat cards are posted before the effect is
 * applied, so this is the strike-time view of what the target will
 * roll into on Apply.
 *
 * @param {Array} bonuses  `system.bonuses` from the attacker item /
 *                         Black-ICE actor authoring the Custom effect.
 * @returns {string}       e.g. "INT −1d6 REF −1d6"
 */
const NETWARE_STAT_SHORT = {
    "stats.int": "INT",  "stats.ref": "REF",   "stats.tech": "TECH",
    "stats.cool": "COOL", "stats.attr": "ATTR", "stats.luck": "LUCK",
    "stats.ma": "MA",    "stats.bt": "BT",     "stats.emp": "EMP"
};
export function compactNetwareEffectSummary(bonuses) {
    return (bonuses || []).map(b => {
        if (b?.type !== "property" || !b.property) return "";
        const op = b.op === "−" ? "−" : (b.op || "+");
        const val = b.value ?? 0;
        let label = NETWARE_STAT_SHORT[b.property] || null;
        if (!label && b.property.startsWith("netBonuses.")) {
            const key = b.property.slice("netBonuses.".length);
            label = key.charAt(0).toUpperCase() + key.slice(1);
        }
        if (!label) label = b.property;
        return `${label} ${op}${val}`;
    }).filter(Boolean).join(" ");
}

function currentGameSeconds() {
    return Math.floor((game.settings.get("cyberpunk", "gameTimeOffset") || 0) / 1000);
}

/** True if `effect` is a netware-applied ActiveEffect spawned by this system. */
export function isNetwareEffect(effect) {
    return effect?.getFlag?.("cyberpunk", NETWARE_EFFECT_FLAG) === true;
}

/**
 * Remaining seconds before the effect expires. Mirrors
 * `getDrugRemainingSeconds` — clamped ≥ 0; `Infinity` when the effect
 * has no duration (author left it 0).
 */
export function getNetwareEffectRemainingSeconds(effect) {
    if (!isNetwareEffect(effect)) return Infinity;
    const total = Number(effect.getFlag("cyberpunk", "activeDuration")) || 0;
    if (total <= 0) return Infinity;
    const startedAt = Number(effect.getFlag("cyberpunk", "startedAt") || currentGameSeconds());
    const elapsed = Math.max(0, currentGameSeconds() - startedAt);
    return Math.max(0, total - elapsed);
}

/**
 * Bonuses currently in force for `effect` — matches the drug-side
 * `activeDrugBonuses` shape so `actor.js#prepareDerivedData` can read
 * both flavours through one call site.
 */
export function activeNetwareBonuses(effect) {
    if (!isNetwareEffect(effect)) return [];
    return effect.getFlag("cyberpunk", "activeChanges") || [];
}

/**
 * Freeze an authored bonus row into an apply-time payload. Attribute
 * rows whose `value` is a dice formula string get rolled once here;
 * NET Bonus rows pass through as integers (the authoring UI already
 * coerces them to int at save time).
 */
async function freezeBonusRow(bonus) {
    const value = bonus?.value;
    // Numbers pass through untouched — the common case.
    if (typeof value === "number") return { ...bonus, value };
    // Strings may be formulas (`1d6`, `2d6+1`) or plain numeric text.
    const asNum = Number(value);
    if (Number.isFinite(asNum) && String(asNum) === String(value).trim()) {
        return { ...bonus, value: asNum };
    }
    // Dice formula path. Evaluate once; freeze the total.
    try {
        const roll = await new Roll(String(value)).evaluate();
        return { ...bonus, value: Math.floor(Number(roll.total) || 0) };
    } catch (err) {
        console.warn(`CYBERPUNK | Netware effect: failed to roll formula "${value}" on ${bonus.property}:`, err);
        return { ...bonus, value: 0 };
    }
}

/**
 * Spawn a netware ActiveEffect on `targetActor` from `sourceItem`
 * (attacker program) or `sourceActor` (Black ICE). Rolls any formula
 * values, stamps the frozen bonus payload, sets duration + startedAt.
 *
 * Returns the created ActiveEffect (or null on failure / no-op).
 *
 * @param {Actor} targetActor
 * @param {Item|Actor} source  Attacker item OR Black ICE actor.
 */
export async function applyNetwareEffectToTarget(targetActor, source) {
    if (!targetActor || !source) return null;
    const sys = source.system || {};
    // Only fire when the source is actually authoring a Custom effect
    // — the caller usually knows this already, but guarding here means
    // the apply pipeline can call unconditionally without a pre-check.
    if (sys.attackerEffect !== "custom") return null;

    const rawBonuses = Array.isArray(sys.bonuses) ? sys.bonuses : [];
    if (rawBonuses.length === 0) return null;

    // Split property (numeric) rows from flavour (status) rows. Flavours
    // don't roll or freeze — each contributes one status to the spawned
    // ActiveEffect's `statuses` array. Foundry aggregates statuses
    // across all active effects on the actor, so the status stays on
    // as long as at least one effect declares it.
    const frozen = [];
    const flavours = [];
    for (const b of rawBonuses) {
        if (b?.type === "flavour" && b.flavour) {
            flavours.push(b.flavour);
        } else if (b?.type === "property" && b.property) {
            frozen.push(await freezeBonusRow(b));
        }
    }
    if (frozen.length === 0 && flavours.length === 0) return null;

    const duration = Math.max(0, Math.floor(Number(sys.effectDuration) || 0));

    const effectData = {
        name: source.name,
        img:  source.img,
        // We skip the standard `changes` mapping — the actor pipeline
        // reads `activeChanges` from flags directly, same as drugs.
        changes: [],
        duration: duration > 0 ? { seconds: duration } : {},
        // `statuses` array carries flavour statuses so Foundry's
        // condition-aggregation shows them on the token / propagates
        // to any consumer that reads `actor.statuses`.
        statuses: flavours,
        flags: {
            cyberpunk: {
                [NETWARE_EFFECT_FLAG]: true,
                sourceUuid: source.uuid,
                sourceImg:  source.img,
                sourceName: source.name,
                startedAt:  currentGameSeconds(),
                activeChanges:  frozen,
                // Store the flavour list on flags too so the State-tab
                // row builder can render the hint icons without
                // re-parsing the raw bonuses list.
                flavours,
                activeDuration: duration
            }
        }
    };

    const [effect] = await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    return effect ?? null;
}

/**
 * Walk every netware effect on every actor; delete any whose duration
 * has elapsed. Runs only on the active GM client so wear-off fires
 * exactly once per expiration event. Same shape as drug's
 * `checkDrugEffectExpiration` — both hook the gameTimeOffset onChange.
 */
export async function checkNetwareEffectExpiration() {
    if (game.user?.id !== game.users?.activeGM?.id) return;
    if (!game.actors) return;
    const pending = [];
    for (const actor of game.actors) {
        for (const effect of actor.effects) {
            if (!isNetwareEffect(effect)) continue;
            if (getNetwareEffectRemainingSeconds(effect) > 0) continue;
            pending.push(effect.delete());
        }
    }
    await Promise.all(pending);
}
