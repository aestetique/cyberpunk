/**
 * Black ICE lifecycle hooks.
 *
 * Damage on a Black ICE actor (REZ → 0 sets Disabled / Dead) lives in
 * chat-message.js's `_applyBlackIceDamage`. This module reacts to those
 * state changes on a DEPLOYED instance (synth actor spawned from a
 * Black-ICE program) and reflects them back onto the owning program:
 *
 *   - Actor REZ climbs above 0 while Disabled → clear Disabled on the
 *     actor (recovery) AND flip owning program back to "active".
 *   - Actor gets Disabled → owning program → "derezzed" (locked out;
 *     netrunner can't redeploy until the actor is destroyed or recovered).
 *   - Actor gets Dead → owning program is DELETED. Cyberpunk RED calls it
 *     — destroyed Black ICE is gone for good.
 *   - Deployed token is deleted from the scene without the actor being
 *     Dead → owning program returns to "inactive" (unlocks for redeploy).
 *   - Deployed actor's REZ ticks → owning character's netware tab refreshes
 *     so the runner sees live REZ during combat.
 *
 * Single-fire: every hook is gated on the triggering user's own client so
 * a change fires the item update exactly once per network event.
 */

/**
 * Deploy-token-UUID → programs index. Built lazily on first lookup,
 * invalidated by item / actor mutations below. Cuts REZ-tick lookups
 * from O(world actors × items) per hit to O(1) after warm-up — the
 * updateActor watcher fires every damage roll during a fight, so the
 * old full walk was a real hot path.
 */
let _linkedIndex = null;

function _buildLinkedIndex() {
    const map = new Map();
    for (const character of game.actors ?? []) {
        for (const item of character.items) {
            if (item.type !== "netware") continue;
            if (item.system?.programSubtype !== "blackIce") continue;
            const uuid = item.system?.deployedTokenUuid;
            if (!uuid) continue;
            let arr = map.get(uuid);
            if (!arr) { arr = []; map.set(uuid, arr); }
            arr.push({ characterId: character.id, itemId: item.id });
        }
    }
    return map;
}

function _invalidateLinkedIndex() { _linkedIndex = null; }

/**
 * Find world character items whose `deployedTokenUuid` points to the
 * given tokenUuid. Each match is a `{ character, item }` pair. Reads
 * through the cached index — invalidated by the item / actor mutation
 * hooks at the bottom of this file. Ids in the cache are re-resolved on
 * every lookup so a stale delete never surfaces a dangling doc.
 */
function findLinkedPrograms(tokenUuid) {
    if (!tokenUuid) return [];
    if (_linkedIndex === null) _linkedIndex = _buildLinkedIndex();
    const arr = _linkedIndex.get(tokenUuid);
    if (!arr) return [];
    const hits = [];
    for (const { characterId, itemId } of arr) {
        const character = game.actors?.get?.(characterId);
        const item = character?.items?.get?.(itemId);
        if (character && item) hits.push({ character, item });
    }
    return hits;
}

/**
 * Extract the underlying TokenDocument's UUID from a synth actor UUID.
 * Synth actor UUIDs read `Scene.<sid>.Token.<tid>.Actor.<aid>`; strip
 * `.Actor.<aid>` to recover the token doc UUID we stored on the item.
 */
function tokenUuidFromActor(actor) {
    const uuid = actor?.uuid || "";
    const idx = uuid.indexOf(".Actor.");
    return idx > 0 ? uuid.slice(0, idx) : "";
}

/**
 * REZ recovery — actor's REZ climbing above 0 clears the Disabled status
 * (unless Dead, which is permanent). This is the "actor healed" path;
 * the item-state watcher below then picks up the Disabled clear.
 */
Hooks.on("updateActor", async (actor, changes, _options, userId) => {
    if (userId !== game.user.id) return;
    if (actor?.type !== "netware") return;
    if (actor.system?.subtype !== "blackIce") return;

    // Live REZ mirror — re-render owning character sheets so the netware
    // tab shows the deployed instance's current REZ during combat.
    if (changes?.system?.rez !== undefined) {
        const tokenUuid = tokenUuidFromActor(actor);
        for (const { character } of findLinkedPrograms(tokenUuid)) {
            character.sheet?.render(false);
        }
    }

    // Old REZ-recovery behavior kept: raising REZ above 0 clears the
    // Disabled status effect on the actor. Dead is permanent — no
    // resurrection via REZ climb.
    if (changes?.system?.rez === undefined) return;
    const newRez = Number(changes.system.rez) || 0;
    if (newRez <= 0) return;
    if (actor.statuses?.has?.("dead")) return;
    if (!actor.statuses?.has?.("disabled")) return;
    await actor.toggleStatusEffect("disabled", { active: false });
});

/**
 * Status-effect appearing on a Black ICE actor:
 *   - "dead"     → delete every owning program item (permanent kill).
 *   - "disabled" → flip owning program state to "derezzed" (locked).
 */
Hooks.on("createActiveEffect", async (effect, _options, userId) => {
    if (userId !== game.user.id) return;
    if (effect.parent?.documentName !== "Actor") return;
    const actor = effect.parent;
    if (actor.type !== "netware") return;
    if (actor.system?.subtype !== "blackIce") return;
    const tokenUuid = tokenUuidFromActor(actor);
    const linked = findLinkedPrograms(tokenUuid);
    if (!linked.length) return;

    if (effect.statuses?.has?.("dead")) {
        for (const { character, item } of linked) {
            try { await character.deleteEmbeddedDocuments("Item", [item.id]); }
            catch (err) { console.warn("Cyberpunk | Black ICE program delete failed:", err); }
        }
        return;
    }
    if (effect.statuses?.has?.("disabled")) {
        for (const { character, item } of linked) {
            if (item.system?.programState === "derezzed") continue;
            try {
                await character.updateEmbeddedDocuments("Item",
                    [{ _id: item.id, "system.programState": "derezzed" }]);
            } catch (err) { console.warn("Cyberpunk | Black ICE program derezz failed:", err); }
        }
    }
});

/**
 * Status-effect being removed:
 *   - "disabled" cleared while item is derezzed → return to "active"
 *     (actor was healed, program re-arms without a fresh deploy).
 *   - "dead" never gets cleared in practice (item was already deleted).
 */
Hooks.on("deleteActiveEffect", async (effect, _options, userId) => {
    if (userId !== game.user.id) return;
    if (!effect.statuses?.has?.("disabled")) return;
    if (effect.parent?.documentName !== "Actor") return;
    const actor = effect.parent;
    if (actor.type !== "netware") return;
    if (actor.system?.subtype !== "blackIce") return;
    if (actor.statuses?.has?.("dead")) return;   // dead trumps everything
    const tokenUuid = tokenUuidFromActor(actor);
    const linked = findLinkedPrograms(tokenUuid);
    for (const { character, item } of linked) {
        if (item.system?.programState !== "derezzed") continue;
        try {
            await character.updateEmbeddedDocuments("Item",
                [{ _id: item.id, "system.programState": "active" }]);
        } catch (err) { console.warn("Cyberpunk | Black ICE program re-arm failed:", err); }
    }
});

/**
 * Deployed token being deleted from the scene → owning program returns
 * to "inactive" and its deployedTokenUuid is cleared, so the netrunner
 * can redeploy on the next Activate. This is the "GM despawned without
 * killing" path — a Dead actor would have already deleted the item via
 * the createActiveEffect hook above, so a race here finds no items.
 */
Hooks.on("deleteToken", async (tokenDoc, _options, userId) => {
    if (userId !== game.user.id) return;
    const actor = tokenDoc.actor;
    if (actor?.type !== "netware") return;
    if (actor?.system?.subtype !== "blackIce") return;
    const linked = findLinkedPrograms(tokenDoc.uuid);
    for (const { character, item } of linked) {
        try {
            await character.updateEmbeddedDocuments("Item", [{
                _id: item.id,
                "system.programState": "inactive",
                "system.deployedTokenUuid": ""
            }]);
        } catch (err) { console.warn("Cyberpunk | Black ICE program reset failed:", err); }
    }
});

// Index invalidation — any change that could shift a Black ICE program's
// deployedTokenUuid link busts the cache. Runs on every client (index is
// per-client) so all clients rebuild independently on next lookup.
function _isBlackIceProgram(item) {
    return item?.type === "netware" && item?.system?.programSubtype === "blackIce";
}
Hooks.on("createItem", (item) => { if (_isBlackIceProgram(item)) _invalidateLinkedIndex(); });
Hooks.on("deleteItem", (item) => { if (_isBlackIceProgram(item)) _invalidateLinkedIndex(); });
Hooks.on("updateItem", (item, changes) => {
    if (!_isBlackIceProgram(item)) return;
    // Only invalidate when the deployed link actually changes.
    if ("deployedTokenUuid" in (changes.system ?? {})) _invalidateLinkedIndex();
});
// A character with active Black-ICE programs being deleted also breaks
// the index — bust wholesale.
Hooks.on("deleteActor", () => _invalidateLinkedIndex());
