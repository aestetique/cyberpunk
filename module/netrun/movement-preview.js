/**
 * Movement-path shaping for NET icons. Two responsibilities, both bolted
 * onto `Token#constrainMovementPath` — the choke point V13 funnels every
 * pathfinder query and every drag-commit through (`findMovementPath` and
 * `TokenDocument#move` both call it under the hood).
 *
 *   1. PHYSICAL WALLS ARE TRANSPARENT. We inject `ignoreWalls: true` into
 *      the options for NET icons in NET realm. That bypasses the wall-
 *      collision branch of constrainMovementPath natively, and since
 *      findMovementPath delegates to it, the pathfinder also stops routing
 *      around walls — drags produce a straight line. This replaces the
 *      previous global `Scene#testSurfaceCollision` and `polygonBackends
 *      .move.testCollision` wraps, which were broad hammers that
 *      universally disabled wall collision for ALL movement on any client
 *      with a NET viewer (a side-channel that would have broken AOE
 *      templates, AI movement, and any future module checking collisions).
 *
 *   2. REGION BOUNDARIES BLOCK MOVEMENT, WITH FOUNDRY'S DASHED-LINE UX.
 *      After the original runs, walk the returned path; the first waypoint
 *      whose center lands outside the origin's NET region is dropped along
 *      with everything after it, and `wasConstrained` flips to true. The
 *      ruler then dashes from the last kept waypoint to the cursor — the
 *      same visual every player recognises as "you can't go there".
 *
 * GM bypasses both behaviours — they're authoring, not playing.
 */

import { isNetIcon, viewerIsInNet, findNetRegionContaining } from "./realm.js";

Hooks.once("ready", () => {
    const TokenClass = foundry?.canvas?.placeables?.Token ?? globalThis.Token;
    if (!TokenClass) return;

    const orig = TokenClass.prototype.constrainMovementPath;
    if (typeof orig !== "function") return;

    TokenClass.prototype.constrainMovementPath = function (waypoints, options = {}) {
        const isNetMover = !game.user?.isGM && isNetIcon(this) && viewerIsInNet();

        // Phase through walls — natively, via Foundry's own ignoreWalls flag.
        if (isNetMover) options = { ...options, ignoreWalls: true };

        const [path, wasConstrained] = orig.call(this, waypoints, options);

        if (!isNetMover) return [path, wasConstrained];
        if (!Array.isArray(path) || path.length === 0) return [path, wasConstrained];

        // The token's origin must sit inside a NET region for there to be a
        // boundary to enforce. If it's outside everything (GM staging state),
        // no constraint applies — matches collision.js.
        const originCenter = this.document.getCenterPoint(path[0]);
        const lockRegion = findNetRegionContaining(originCenter);
        if (!lockRegion) return [path, wasConstrained];

        // Walk the constrained path. Keep waypoints whose center stays
        // inside the lock region; drop everything from the first straying
        // waypoint onwards. Foundry's ruler dashes from the last kept
        // waypoint to the player's drag target.
        const truncated = [path[0]];
        let constrained = wasConstrained;
        for (let i = 1; i < path.length; i++) {
            const center = this.document.getCenterPoint(path[i]);
            const here = findNetRegionContaining(center);
            if (here?.id === lockRegion.id) {
                truncated.push(path[i]);
            } else {
                constrained = true;
                break;
            }
        }
        return [truncated, constrained];
    };
});
