/**
 * Cyberdeck Upgrade helpers.
 *
 * Upgrades are netware items with `system.netwareType === "upgrade"`, slotted
 * into a parent cyberdeck via `flags.cyberpunk.attachedTo === deck.id`. Unlike
 * programs they have no active/inactive state — they are always effective
 * while attached. Each carries a single `system.upgradeEffect` (a key from
 * lookups.upgradeEffects) and an optional `system.upgradeValue` used by the
 * Range upgrade.
 *
 * Effect mechanics live next to their trigger sites (chat-message microwave
 * case, anti-program REZ kill, exotic effect application, scanner roll). This
 * module only resolves "which upgrades does deck X have."
 */

/** Every upgrade currently slotted on `deck`. */
export function getDeckUpgrades(deck) {
    const actor = deck?.parent;
    if (!actor) return [];
    const deckId = deck.id;
    return actor.items.filter(i =>
        i.type === "netware"
        && i.system?.netwareType === "upgrade"
        && i.getFlag?.("cyberpunk", "attachedTo") === deckId
    );
}

/** True if any upgrade on `deck` provides the named effect. */
export function deckHasUpgrade(deck, effectKey) {
    if (!deck || !effectKey || effectKey === "none") return false;
    return getDeckUpgrades(deck).some(u => u.system?.upgradeEffect === effectKey);
}

/** Sum of `upgradeValue` for every matching upgrade on `deck` (stacks). */
export function deckUpgradeValue(deck, effectKey) {
    if (!deck || !effectKey) return 0;
    return getDeckUpgrades(deck)
        .filter(u => u.system?.upgradeEffect === effectKey)
        .reduce((sum, u) => sum + (Number(u.system?.upgradeValue) || 0), 0);
}

/**
 * The cyberdeck the actor is currently jacked in via, or null. Used for
 * upgrades whose effect is gated on the deck being the active link
 * (Insulated, Anti-Crash). Reads `system.equipped` — the same flag the
 * jack-in flow toggles.
 */
export function getEquippedDeck(actor) {
    if (!actor) return null;
    return actor.items.find(i =>
        i.type === "netware"
        && i.system?.netwareType === "cyberdeck"
        && i.system?.equipped === true
    ) || null;
}
