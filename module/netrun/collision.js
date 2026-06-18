/**
 * NET icon movement rules:
 *
 *   1. Physical walls are TRANSPARENT to NET icons — cyberspace ignores
 *      brick and steel.
 *   2. The NET icon is CONFINED to its current NET region. A drag/move
 *      that would take it across a region boundary is blocked.
 *   3. Outside any NET region — GM-staging state — movement is unrestricted
 *      so the GM can drop the icon into the right region.
 *
 * Enforcement layers:
 *
 *   - `Token#checkCollision` wrap (this file). The boolean drag-preview
 *     "is this move blocked?" indicator. Returns true (= blocked) when a
 *     NET icon's move would cross the region boundary; bypasses wall
 *     collision entirely for NET icons.
 *
 *   - `Token#constrainMovementPath` wrap (movement-preview.js). Injects
 *     `ignoreWalls: true` natively for NET-icon paths AND truncates the
 *     constrained path at the region boundary so Foundry's standard
 *     dashed-line ruler kicks in. This is the entry point V13 uses for
 *     both findMovementPath and the actual drag commit.
 *
 *   - `preUpdateToken` hook (this file). Commit-time veto: if a movement
 *     update would take the NET icon across a region boundary, strip x/y
 *     from changes AND return false. Catches macros, the token-config
 *     dialog, and any path that skips the wrapped methods.
 *
 *   - `updateToken` post-hook (this file). Final safety net: arrow-key
 *     and a few other V13 paths don't honour our pre-update veto. If a
 *     NET icon ended up outside its locked region, snap it back to centre.
 */

import { isNetIcon, findNetRegionContaining } from "./realm.js";

/**
 * Is moving from `origin` to `destination` allowed for a NET icon?
 *   - Origin not in any NET region → no constraint, allow.
 *   - Origin in region R, destination in region R → allow.
 *   - Origin in region R, destination outside region R → block.
 */
function moveAllowed(origin, destination) {
    const originRegion = findNetRegionContaining(origin);
    if (!originRegion) return true;
    const destRegion = findNetRegionContaining(destination);
    return destRegion?.id === originRegion.id;
}

/** Resolve a token document's center given its corner (x, y). */
function tokenCenterFrom(tokenDoc, x, y) {
    const gridSize = canvas?.scene?.grid?.size || 100;
    const halfW = ((tokenDoc.width ?? 1) * gridSize) / 2;
    const halfH = ((tokenDoc.height ?? 1) * gridSize) / 2;
    return { x: x + halfW, y: y + halfH };
}

Hooks.once("ready", () => {
    // --- Token#checkCollision wrap (drag-preview feedback) ------------------
    const TokenClass = foundry?.canvas?.placeables?.Token ?? globalThis.Token;
    if (TokenClass) {
        const origCheckCollision = TokenClass.prototype.checkCollision;
        TokenClass.prototype.checkCollision = function (destination, options = {}) {
            const type = options.type ?? "move";
            const mode = options.mode ?? "any";

            if (type !== "move" || mode !== "any") {
                return origCheckCollision.call(this, destination, options);
            }
            if (!isNetIcon(this)) {
                return origCheckCollision.call(this, destination, options);
            }

            // NET icon: walls phase through; only region boundary blocks.
            const origin = options.origin ?? this.center;
            return !moveAllowed(origin, destination);
        };
    }
});

// --- preUpdateToken hook (commit-time veto + change scrubbing) --------------

Hooks.on("preUpdateToken", (token, changes, _options, userId) => {
    if (!isNetIcon(token)) return;
    // GM bypass — staging, teleport scaffolding, manual repositioning.
    if (game.users?.get?.(userId)?.isGM) return;
    const newX = changes.x;
    const newY = changes.y;
    if (newX === undefined && newY === undefined) return;

    const origin = tokenCenterFrom(token, token.x, token.y);
    const dest   = tokenCenterFrom(token, newX ?? token.x, newY ?? token.y);
    if (origin.x === dest.x && origin.y === dest.y) return;

    if (!moveAllowed(origin, dest)) {
        // Strip x/y from the update AND return false. The strip handles the
        // case where Foundry processes the change before the false-return
        // can cancel it; the false-return handles the case where a sibling
        // hook tried to put x/y back. Belt and suspenders.
        delete changes.x;
        delete changes.y;
        return false;
    }
});

// --- Region lock: in-memory cache + post-update revert ---------------------
// Arrow-key movement and a few other V13 paths don't honour our pre-update
// veto. The catch-all is a post-update check: if a NET icon ended up
// anywhere other than its locked region, we shove it back to that region's
// centre.
//
// Why in-memory instead of `setFlag`: the flag write is async, so two
// arrow taps in quick succession leave the cache empty on the second tap
// (first setFlag hadn't resolved). An in-memory Map writes synchronously
// and never races with itself.

const lockedRegionByTokenId = new Map();

function rememberRegionFor(token) {
    if (!isNetIcon(token)) return;
    const center = tokenCenterFrom(token, token.x, token.y);
    const region = findNetRegionContaining(center);
    if (region) lockedRegionByTokenId.set(token.id, region.id);
    else lockedRegionByTokenId.delete(token.id);
}

// Seed the cache when the scene loads (for NET icons already on the map)
// and when a new NET icon is created (jack-in).
Hooks.on("canvasReady", () => {
    lockedRegionByTokenId.clear();
    if (!canvas?.scene) return;
    for (const token of canvas.scene.tokens) rememberRegionFor(token);
});

Hooks.on("createToken", (token) => rememberRegionFor(token));

Hooks.on("deleteToken", (token) => {
    lockedRegionByTokenId.delete(token.id);
});

Hooks.on("updateToken", async (token, changes, _options, userId) => {
    if (!isNetIcon(token)) return;
    if (changes.x === undefined && changes.y === undefined) return;
    // GM bypass — they can drag NET icons across regions (mirrors the
    // preUpdateToken bypass above). Also keep the lock cache in sync so a
    // GM-initiated move resets the lock to the new region.
    if (game.users?.get?.(userId)?.isGM) {
        rememberRegionFor(token);
        return;
    }

    const lockedId = lockedRegionByTokenId.get(token.id);

    // No locked region yet — first time we're seeing this icon move. Lock
    // wherever it landed. Free-movement state until then.
    if (!lockedId) {
        rememberRegionFor(token);
        return;
    }

    const lockedRegion = canvas?.scene?.regions?.get?.(lockedId);
    if (!lockedRegion) {
        // Region was deleted — release the lock and let the icon roam.
        lockedRegionByTokenId.delete(token.id);
        return;
    }

    const center = tokenCenterFrom(token, token.x, token.y);
    const here = findNetRegionContaining(center);
    if (here?.id === lockedId) return; // still inside the locked region

    // Left the locked region (now outside all regions OR inside a different
    // one). Snap back to the locked region's centre. Only the user who has
    // permission to update the token performs the revert.
    if (!token.canUserModify?.(game.user, "update")) return;

    const b = lockedRegion.bounds ?? lockedRegion.object?.bounds;
    if (!b) return;
    const gridSize = canvas?.scene?.grid?.size || 100;
    const halfW = ((token.width ?? 1) * gridSize) / 2;
    const halfH = ((token.height ?? 1) * gridSize) / 2;
    const backX = b.x + b.width  / 2 - halfW;
    const backY = b.y + b.height / 2 - halfH;
    await token.update({ x: backX, y: backY });
});
