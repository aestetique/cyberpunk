/**
 * Jack In / Jack Out — spawn/despawn the NET icon token in response to the
 * `jacked-in` status effect on the actor.
 *
 * The trigger is the existing status effect (toggled by the cyberdeck
 * button on the character sheet, the token HUD, TAH, macros, etc.). This
 * module just listens for that effect appearing/disappearing on an Actor
 * and translates it into TokenDocument create/delete on the active scene.
 *
 * Token model:
 *   - The NET icon is a TokenDocument pointing at the SAME actor doc as the
 *     physical token (so damage, status, items, sheet — all one source of
 *     truth, no duplication).
 *   - Token data is cloned from the physical token so the icon inherits the
 *     actor's portrait, name, scale, vision settings, etc. We override only
 *     `flags.cyberpunk.isNetIcon=true` and the spawn offset.
 *   - Spawn offset: one grid cell to the right of the physical token.
 *
 * Multi-user / permissions model:
 *   - The hook fires on every connected client when the status effect is
 *     created/deleted. Token create/delete is a scene-level write — only
 *     GMs can do it — so we delegate the actual create/delete to the
 *     singleton `game.users.activeGM` client. That keeps multi-GM sessions
 *     from racing on identical creates, and lets PLAYERS jack themselves
 *     in/out (they trigger the status toggle on their own actor; the GM
 *     client picks up the hook and spawns the icon on their behalf).
 *   - To hand control of the freshly-spawned icon back to the right user,
 *     we stamp `flags.cyberpunk.pilotUser` on the token at creation time.
 *     The matching client picks it up via the `createToken` hook below and
 *     calls `.control()`. Preference: connected non-GM owner → triggering
 *     user → local user. Same flag drives auto-re-control of the physical
 *     token on jack-out.
 */

import {
    accessPointsCovering,
    nearestCoveringAccessPoint,
    getEntryRegionSpawn,
    getApCentreSpawn
} from "./access-points.js";
import { getEquippedDeck } from "./upgrades.js";

const NET_ICON_FLAG = "isNetIcon";

/** True if `effect` carries the `jacked-in` status. */
function isJackedInEffect(effect) {
    return effect?.statuses?.has?.("jacked-in") === true;
}

/** True if the effect's parent is an Actor (works on V13 without needing a class import). */
function parentIsActor(effect) {
    return effect?.parent?.documentName === "Actor";
}

/** First token on `scene` whose actor matches and is NOT a NET icon. */
function findPhysicalToken(actor, scene) {
    return scene.tokens.find(t =>
        t.actorId === actor.id
        && t.getFlag("cyberpunk", NET_ICON_FLAG) !== true
    ) || null;
}

/** Existing NET icon for `actor` on `scene`, if any. */
function findNetIcon(actor, scene) {
    return scene.tokens.find(t =>
        t.actorId === actor.id
        && t.getFlag("cyberpunk", NET_ICON_FLAG) === true
    ) || null;
}

/**
 * Pick the user who should auto-control a NET icon for `actor`. Preference:
 * a connected non-GM owner (the player whose character this is) → the user
 * who triggered the effect → the local user as a last resort. Returning a
 * deterministic id keeps the createToken hook on every other client a no-op.
 */
function pickPilot(actor, triggeringUserId) {
    const ownerPlayer = game.users?.find(u =>
        u.active && !u.isGM && actor.testUserPermission?.(u, "OWNER")
    );
    if (ownerPlayer) return ownerPlayer;
    return game.users?.get?.(triggeringUserId) ?? game.user;
}

/**
 * Spawn the NET icon next to the actor's physical token. Runs on the active
 * GM client only; the pilot picks up control via the `createToken` hook.
 */
async function jackIn(actor, userId) {
    if (!canvas.scene) return;
    if (findNetIcon(actor, canvas.scene)) return; // already jacked in

    const activeGM = game.users?.activeGM;
    if (!activeGM) {
        if (userId === game.user.id) {
            ui.notifications.warn("Jack-in requires an active GM on the session.");
        }
        return;
    }
    if (game.user.id !== activeGM.id) return; // singleton GM handles the create

    const physical = findPhysicalToken(actor, canvas.scene);
    if (!physical) {
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.JackInNoPhysicalToken"));
        return;
    }

    // Proximity gate — the meat token must be inside the (Range-upgrade-
    // extended) radius of at least one Access Point. Nearest AP wins when
    // multiple cover. No AP in range → undo the jack-in toggle entirely
    // (delete the just-created effect) so the runner doesn't end up stuck
    // in a "jacked-in but no NET icon" half-state. The dialog path
    // pre-gates with its own warning; this post-gate catches token-HUD /
    // macro paths and only surfaces locally to the GM that's executing the
    // spawn.
    const equippedDeck = getEquippedDeck(actor);
    const ap = nearestCoveringAccessPoint(physical, canvas.scene, equippedDeck);
    if (!ap) {
        const triggeringEffect = actor.effects.find(e => e.statuses?.has?.("jacked-in"));
        if (triggeringEffect) await triggeringEffect.delete();
        ui.notifications.warn(game.i18n.localize("CYBERPUNK.JackInNoAccessPoint"));
        return;
    }

    // Spawn target: AP's linked region centre if set, else AP token centre.
    // Region-mode lets the GM pre-paint the NET map; AP-centre is the lazy
    // fallback for testing / quick play.
    const spawn = getEntryRegionSpawn(ap) ?? getApCentreSpawn(ap);
    const data = physical.toObject();
    delete data._id;
    if (spawn) {
        data.x = spawn.x;
        data.y = spawn.y;
    } else {
        // No AP placement either — shouldn't happen post-gate, but degrade
        // gracefully to one-cell-right of the meat token.
        const gridSize = canvas.scene.grid.size || 100;
        data.x = physical.x + gridSize;
        data.y = physical.y;
    }
    data.flags = data.flags ?? {};

    const pilot = pickPilot(actor, userId);
    data.flags.cyberpunk = {
        ...(data.flags.cyberpunk ?? {}),
        [NET_ICON_FLAG]: true,
        pilotUser: pilot.id
    };

    await canvas.scene.createEmbeddedDocuments("Token", [data]);
}

/**
 * Remove the actor's NET icon from the active scene. Runs on the active GM
 * client only; the pilot picks up the physical-token re-control via the
 * `deleteToken` hook.
 */
async function jackOut(actor, userId) {
    if (!canvas.scene) return;

    const activeGM = game.users?.activeGM;
    if (!activeGM) {
        if (userId === game.user.id) {
            ui.notifications.warn("Jack-out requires an active GM on the session.");
        }
        return;
    }
    if (game.user.id !== activeGM.id) return;

    // Despawn the NET icon token.
    const icon = findNetIcon(actor, canvas.scene);
    if (icon) await canvas.scene.deleteEmbeddedDocuments("Token", [icon.id]);

    // Power down the equipped cyberdeck and deactivate every active
    // booster/defender slotted on it. Runs regardless of HOW jack-out was
    // triggered — manual click on the dialog, GM toggling the status,
    // forced jack-out from a Crashed effect, etc. Idempotent: if the
    // dialog already cleaned things up before removing the status, the
    // updates here find nothing to change and no-op.
    const deck = actor.items.find(i =>
        i.type === "netware"
        && i.system?.netwareType === "cyberdeck"
        && i.system?.equipped
    );
    if (!deck) return;

    const activePrograms = actor.items.filter(i =>
        i.type === "netware"
        && i.system?.netwareType === "program"
        && (i.system?.programSubtype === "booster" || i.system?.programSubtype === "defender")
        && i.getFlag("cyberpunk", "attachedTo") === deck.id
        && i.system?.programState === "active"
    );
    if (activePrograms.length) {
        const updates = activePrograms.map(p => ({ _id: p.id, "system.programState": "inactive" }));
        await actor.updateEmbeddedDocuments("Item", updates);
    }
    await deck.update({ "system.equipped": false });
}

/**
 * The new NET icon arrived — if WE are the pilot, take the wheel.
 * Foundry's createToken hook fires on every connected client, but the
 * `pilotUser` flag filters it down to exactly one.
 */
Hooks.on("createToken", (tokenDoc) => {
    if (tokenDoc.getFlag?.("cyberpunk", NET_ICON_FLAG) !== true) return;
    if (tokenDoc.getFlag?.("cyberpunk", "pilotUser") !== game.user.id) return;
    const placeable = canvas.tokens?.get?.(tokenDoc.id);
    if (placeable) placeable.control({ releaseOthers: true });
});

/**
 * The NET icon was removed — pilot returns to their physical body. Same
 * single-client filter via the `pilotUser` flag the icon carried.
 */
Hooks.on("deleteToken", (tokenDoc) => {
    if (tokenDoc.getFlag?.("cyberpunk", NET_ICON_FLAG) !== true) return;
    if (tokenDoc.getFlag?.("cyberpunk", "pilotUser") !== game.user.id) return;
    const physical = canvas.scene?.tokens?.find(t =>
        t.actorId === tokenDoc.actorId
        && t.getFlag("cyberpunk", NET_ICON_FLAG) !== true
    );
    const placeable = physical ? canvas.tokens?.get?.(physical.id) : null;
    if (placeable) placeable.control({ releaseOthers: true });
});

Hooks.on("createActiveEffect", (effect, _options, userId) => {
    if (!isJackedInEffect(effect) || !parentIsActor(effect)) return;
    jackIn(effect.parent, userId);
});

Hooks.on("deleteActiveEffect", (effect, _options, userId) => {
    if (!isJackedInEffect(effect) || !parentIsActor(effect)) return;
    jackOut(effect.parent, userId);
});

/**
 * Auto jack-out when the runner walks out of every AP radius.
 *
 * Singleton rule: the user who issued the move is the one who fires the
 * effect delete. That keeps it from running N times across N clients and,
 * crucially, lets a PLAYER move their own meat token (and lose connection)
 * without needing the GM to babysit the gate. The triggering user always
 * has permission to delete an ActiveEffect on the actor they just moved.
 * Token despawn / deck cleanup further down still rides the GM via the
 * cascading deleteActiveEffect → jackOut() chain.
 *
 * `update` may carry just `x`, just `y`, or both. We only fire when at
 * least one of them changed (skipping pure-flag updates etc.).
 */
Hooks.on("updateToken", async (tokenDoc, update, _options, userId) => {
    if (update.x === undefined && update.y === undefined) return;
    if (tokenDoc.getFlag?.("cyberpunk", NET_ICON_FLAG) === true) return;
    if (userId !== game.user.id) return;

    const actor = tokenDoc.actor;
    if (!actor?.statuses?.has?.("jacked-in")) return;

    // Doc-based centre means accessPointsCovering reads the post-update x/y
    // — Foundry has already mutated tokenDoc in place by the time this hook
    // fires. Equipped deck (with its Range upgrades) widens every AP's
    // effective radius from this runner's perspective, so we test the same
    // extended radius they walked in with.
    const equippedDeck = getEquippedDeck(actor);
    const covering = accessPointsCovering(tokenDoc, canvas.scene, equippedDeck);
    if (covering.length) return;

    const effect = actor.effects.find(e => e.statuses?.has?.("jacked-in"));
    if (effect) await effect.delete();
    ui.notifications.info(game.i18n.localize("CYBERPUNK.AutoJackedOutNoAccessPoint"));
});
