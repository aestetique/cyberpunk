/**
 * Jack In / Jack Out — spawn/despawn the NET icon token in response to the
 * `jacked-in` status effect on the actor.
 *
 * The trigger is the existing status effect (already toggled by the
 * cyberdeck button on the character sheet, the token HUD, TAH, macros, etc.).
 * This module just listens for that effect appearing/disappearing on an
 * Actor and translates it into TokenDocument create/delete on the active
 * scene.
 *
 * Token model:
 *   - The NET icon is a TokenDocument pointing at the SAME actor doc as the
 *     physical token (so damage, status, items, sheet — all one source of
 *     truth, no duplication).
 *   - Token data is copied from the physical token so the icon inherits the
 *     actor's portrait, name, scale, vision settings, etc. We override only
 *     `flags.cyberpunk.isNetIcon=true`, the spawn offset, and `sight.enabled`
 *     so the icon has a vision source on the canvas.
 *   - Spawn offset: one grid cell to the right of the physical token. Real
 *     "entry point" placement comes later.
 *
 * Multi-user / permissions model:
 *   - The hook fires on every connected client when the status effect is
 *     created/deleted. Token create/delete is a scene-level write — only
 *     GMs can do it — so we delegate the actual create/delete to the
 *     singleton `game.users.activeGM` client. That keeps multi-GM sessions
 *     from racing on identical creates, and lets PLAYERS jack themselves
 *     in/out (the cyberdeck button on their own sheet is a status-toggle
 *     they already have permission to perform, since they own the actor;
 *     the GM client picks up the hook and spawns the icon on their behalf).
 *   - To hand control of the freshly-spawned icon back to the right user,
 *     we stamp `flags.cyberpunk.pilotUser` on the token at creation time.
 *     The matching client picks it up via the `createToken` hook below and
 *     calls `.control()`. The pilot is preferred to be a connected non-GM
 *     owner of the actor (so a GM toggling the effect for a player still
 *     hands control to the player), falling back to whoever triggered the
 *     effect, falling back to the local user. Same flag drives auto-
 *     re-control of the physical token on jack-out.
 */

const NET_ICON_FLAG = "isNetIcon";
const SPAWN_OFFSET_CELLS = 1;

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

    const gridSize = canvas.scene.grid.size || 100;
    const data = physical.toObject();
    delete data._id;
    data.x = physical.x + SPAWN_OFFSET_CELLS * gridSize;
    data.y = physical.y;
    data.flags = data.flags ?? {};

    const pilot = pickPilot(actor, userId);
    data.flags.cyberpunk = {
        ...(data.flags.cyberpunk ?? {}),
        [NET_ICON_FLAG]: true,
        pilotUser: pilot.id
    };
    // Vision config:
    //   - sight.enabled=true so V13 has a polygon to compute from (otherwise
    //     it falls back to "show entire scene")
    //   - sight.range=999 so the polygon covers the whole scene. Combined
    //     with vision-polygon.js stripping wall edges from NET-icon sight
    //     polygons, the polygon sweeps unbounded — every NET token on the
    //     scene falls inside, so their portraits paint properly. In meat
    //     realm the `hasSight` wrap drops the NET icon from the pool, so
    //     this range doesn't leak into the netrunner's meat vision.
    //   - detectionModes: just `netSense`, our custom mode that detects
    //     NET-flagged tokens regardless of walls / LOS / range.
    data.sight = { ...(data.sight ?? {}), enabled: true, range: 999 };
    data.detectionModes = [{ id: "netSense", enabled: true, range: 999 }];

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

    const icon = findNetIcon(actor, canvas.scene);
    if (!icon) return;
    await canvas.scene.deleteEmbeddedDocuments("Token", [icon.id]);
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
 * Self-heal pass on every scene load: stamp every existing NET icon with the
 * "degenerate vision" config (enabled=true, range=0, no detection modes). The
 * config has been a moving target across builds; this normalises whatever the
 * scene currently holds. Runs only on the GM client so we don't fire N times.
 */
Hooks.on("canvasReady", async () => {
    if (!canvas.scene) return;
    const updates = [];
    for (const token of canvas.scene.tokens) {
        if (token.getFlag("cyberpunk", "isNetIcon") !== true) continue;
        // Only heal NET icons we have permission to update — players will
        // migrate their own actor's NET icon when they load the scene; the
        // GM picks up any orphans.
        if (!token.canUserModify?.(game.user, "update")) continue;
        const sightOK  = token.sight?.enabled === true && (token.sight?.range ?? 0) >= 999;
        const modes    = token.detectionModes ?? [];
        const hasNetSense = modes.some(m => m.id === "netSense" && m.enabled === true);
        const onlyNetSense = modes.length === 1 && hasNetSense;
        if (!sightOK || !onlyNetSense) {
            updates.push({
                _id: token.id,
                "sight.enabled": true,
                "sight.range": 999,
                detectionModes: [{ id: "netSense", enabled: true, range: 999 }]
            });
        }
    }
    if (updates.length) await canvas.scene.updateEmbeddedDocuments("Token", updates);
});
