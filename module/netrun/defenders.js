/**
 * Defender-program helpers — read-side lookups + the one mutation we
 * need (consuming a Shield). The attack-roll path (Flak suppression)
 * calls the read helpers; the apply-damage path in chat-message.js
 * calls the read helpers + consumeOneShield.
 *
 * Defender classes (from `lookups.js#defenderDefences`):
 *   - "shield"  — nullifies one incoming non-Black-ICE NET hit, then
 *                 self-derezzes. Stacking = multiple charges (each hit
 *                 consumes one shield).
 *   - "flak"    — suppresses the attacker's ATK / Zap bonus on the
 *                 incoming attack roll. Stays active afterwards.
 *   - "armor"   — flat damage reduction. `system.defenderValue` is the
 *                 reduction (4 by default per the game rule). Applies
 *                 to every NET hit including Black ICE. Stays active.
 */

/** All active defenders on `actor` matching `defenceType`. Empty array if none. */
export function getActiveDefenders(actor, defenceType) {
    if (!actor?.items) return [];
    return actor.items.filter(i =>
        i.type === "netware"
        && i.system?.netwareType === "program"
        && i.system?.programSubtype === "defender"
        && i.system?.defenderDefence === defenceType
        && i.system?.programState === "active"
    );
}

/** Convenience: does the target carry at least one active Flak? */
export function targetHasActiveFlak(actor) {
    return getActiveDefenders(actor, "flak").length > 0;
}

/** Sum of `defenderValue` across active Armor programs. Stacks. */
export function totalActiveArmorValue(actor) {
    return getActiveDefenders(actor, "armor")
        .reduce((sum, d) => sum + (Number(d.system?.defenderValue) || 0), 0);
}

/**
 * Derezz the first active Shield on `actor`. Returns true if one was
 * consumed (caller should nullify the incoming damage); false if no
 * Shield was active. Safe to double-call — the second call finds no
 * active shields and no-ops.
 */
export async function consumeOneShield(actor) {
    const shields = getActiveDefenders(actor, "shield");
    if (!shields.length) return false;
    await shields[0].update({ "system.programState": "derezzed" });
    return true;
}
