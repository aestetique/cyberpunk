/**
 * Defender-program helpers — read-side lookups + the one mutation we
 * need (consuming a Shield). The attack-roll path (Flak suppression)
 * calls the read helpers; the apply-damage path in chat-message.js
 * calls the read helpers + consumeOneShield.
 *
 * Defender classes (from `lookups.js#defenderDefences`):
 *   - "shield"  — nullifies one incoming NET hit and self-derezzes.
 *                 Fires only when Armor alone can't fully absorb the
 *                 hit, so a trivial attack doesn't burn a Shield
 *                 charge. Applies against every NET attacker,
 *                 including Black ICE. Stacking = multiple charges
 *                 (each qualifying hit consumes one shield).
 *   - "flak"    — suppresses the attacker's ATK / Zap bonus on the
 *                 incoming attack roll. Stays active afterwards.
 *   - "armor"   — flat damage reduction. `system.defenderValue` is the
 *                 reduction (4 by default per the game rule). Applies
 *                 to every NET hit including Black ICE. Stays active.
 */

/**
 * All active defenders on `actor` matching `defenceType`, restricted to
 * programs slotted on the actor's currently-equipped cyberdeck. Defenders
 * on an unequipped deck contribute nothing (same rule as boosters — only
 * the equipped deck's attached netware affects stats). Empty array if
 * nothing equipped or no matching defender is active.
 */
export function getActiveDefenders(actor, defenceType) {
    if (!actor?.items) return [];
    const equippedDeck = actor.items.find(i =>
        i.type === "netware"
        && i.system?.netwareType === "cyberdeck"
        && i.system?.equipped
    );
    if (!equippedDeck) return [];
    return actor.items.filter(i =>
        i.type === "netware"
        && i.system?.netwareType === "program"
        && i.system?.programSubtype === "defender"
        && i.system?.defenderDefence === defenceType
        && i.system?.programState === "active"
        && i.getFlag?.("cyberpunk", "attachedTo") === equippedDeck.id
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
