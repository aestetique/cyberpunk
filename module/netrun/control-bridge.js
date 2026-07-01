/**
 * Control bridge — runs on every client; reacts to the GM's Apply on a
 * Control chat card by switching the netrunner's view to their drone
 * for one action, then back to their NET icon.
 *
 * Transport is `actor.setFlag("cyberpunk", "controlPendingDrone", uuid)`
 * on the netrunner actor. The GM has permission to set that flag on any
 * actor; the player listens for `updateActor` on actors they own.
 *
 * After the player swaps to the drone, `cyberpunk.actionRegistered` is
 * armed with a one-shot listener: as soon as the drone performs an
 * action (any roll path through `registerAction`), view snaps back.
 * Ownership granted by Apply persists — subsequent Control attempts by
 * the same character on the same Control Point are silent (no roll).
 */

import { localize } from "../utils.js";

const FLAG_SCOPE   = "cyberpunk";
const FLAG_PENDING = "controlPendingDrone";

/**
 * Resolve any drone-link UUID (Token / Actor / synthetic) to (actor, tokenDoc).
 */
async function _resolveDrone(uuid) {
    if (!uuid) return { actor: null, tokenDoc: null };
    const doc = await fromUuid(uuid);
    if (!doc) return { actor: null, tokenDoc: null };
    if (doc.documentName === "Token") return { actor: doc.actor, tokenDoc: doc };
    if (doc.documentName === "Actor") {
        const tokenDoc = doc.token
            ?? canvas.scene?.tokens?.find(t => t.actorId === doc.id);
        return { actor: doc, tokenDoc };
    }
    return { actor: null, tokenDoc: null };
}

/** Locate the netrunner's NET-icon TokenDocument on the active scene. */
function _findNetIcon(netrunner) {
    if (!netrunner || !canvas?.scene) return null;
    return canvas.scene.tokens.find(t =>
        t.actorId === netrunner.id
        && t.getFlag(FLAG_SCOPE, "isNetIcon") === true
    ) || null;
}

/**
 * Switch the local user's view to the drone token, open the drone's
 * sheet, and arm a one-shot `actionRegistered` listener on the drone
 * actor so the view snaps back to the netrunner's NET icon after the
 * next drone action. Sheets the player had open before stay open —
 * closing them across V1/V2 + linked/unlinked combos turned out to be
 * unreliable across hook ordering, so we leave that to the user.
 *
 * @param {Actor}  netrunner       Actor whose NET icon we return to.
 * @param {string} droneTokenUuid  UUID of the drone TokenDocument / Actor.
 */
export async function engageDrone(netrunner, droneTokenUuid) {
    const { actor: droneActor, tokenDoc: droneTokenDoc } = await _resolveDrone(droneTokenUuid);
    if (!droneActor || !droneTokenDoc) return; // silent — transient race
    if (!droneActor.testUserPermission?.(game.user, "OWNER")) {
        // Apply hasn't landed yet (or this user isn't the netrunner). Bail
        // silently so the same hook firing on the wrong client is a no-op.
        return;
    }

    const dronePlaceable = canvas.tokens?.get?.(droneTokenDoc.id);
    if (dronePlaceable) {
        dronePlaceable.control({ releaseOthers: true });
        const c = dronePlaceable.center;
        if (c) canvas.pan({ x: c.x, y: c.y });
    }
    try { droneActor.sheet?.render(true); } catch { /* ignore */ }

    ui.notifications.info(localize("ControlEngaged"));

    const handler = (actingActor) => {
        if (actingActor?.id !== droneActor.id) return;
        Hooks.off("cyberpunk.actionRegistered", handler);
        const netIconDoc = _findNetIcon(netrunner);
        const netIconPlaceable = netIconDoc?.id ? canvas.tokens?.get(netIconDoc.id) : null;
        if (netIconPlaceable) {
            netIconPlaceable.control({ releaseOthers: true });
            const c = netIconPlaceable.center;
            if (c) canvas.pan({ x: c.x, y: c.y });
        }
        ui.notifications.info(localize("ControlReleased"));
    };
    Hooks.on("cyberpunk.actionRegistered", handler);
}

/**
 * Listen for the GM stamping `controlPendingDrone` on the netrunner.
 * Only the player who OWNs the netrunner reacts; everyone else no-ops.
 * Clears the flag immediately so retries on hook re-fire don't repeat.
 */
Hooks.on("updateActor", async (actor, changes) => {
    const pending = changes?.flags?.[FLAG_SCOPE]?.[FLAG_PENDING];
    if (!pending) return;
    if (!actor.testUserPermission?.(game.user, "OWNER")) return;
    // Only act on the OWNING player's client — not the GM who set it.
    // The GM is OWNER too, so this gate would catch them; skip if GM
    // unless GM is also the assigned player (i.e. no non-GM owner).
    const hasPlayerOwner = game.users?.some(u =>
        !u.isGM && actor.testUserPermission?.(u, "OWNER")
    );
    if (game.user.isGM && hasPlayerOwner) return;

    // Clear the flag so the next Apply re-triggers cleanly. The unsetFlag
    // re-fires this same `updateActor` hook, but the `if (!pending) return;`
    // guard above catches the re-entry (pending is undefined after unset).
    try { await actor.unsetFlag(FLAG_SCOPE, FLAG_PENDING); }
    catch { /* clearing is best-effort — player can't always unset on synth */ }

    await engageDrone(actor, pending);
});
