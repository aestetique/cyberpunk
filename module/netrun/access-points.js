/**
 * Access Point proximity helpers.
 *
 * An Access Point is a netware-type actor with `system.subtype === "accessPoint"`
 * placed on the scene as a Token. It carries:
 *   - `system.radius`      — detection range in metres (scene-grid units)
 *   - `system.entryRegion` — optional RegionDocument UUID; when set, the
 *                            netrunner's NET icon is spawned at the centre of
 *                            that region on jack-in.
 *
 * The jack-in flow uses these helpers to:
 *   1. Gate jack-in on the runner's meat token being inside SOME AP's radius.
 *   2. Pick that AP's spawn target (region centre when set, AP centre otherwise).
 *   3. Force auto-jack-out when the meat token wanders out of every AP radius
 *      while jacked in.
 *
 * Range upgrade: when a cyberdeck has Range upgrade(s) attached, the runner
 * carrying that deck sees every AP's radius extended by the upgrade value(s).
 * Callers pass the relevant deck (the one being jacked into, or the equipped
 * one when already jacked in); proximity APIs read its `range` upgrade total
 * and bake it into the effective radius before testing coverage.
 */

import { deckUpgradeValue } from "./upgrades.js";

/** All Access Point Tokens currently on `scene`. */
export function getAccessPointTokens(scene) {
    if (!scene?.tokens) return [];
    return scene.tokens.filter(t =>
        t.actor?.type === "netware"
        && t.actor?.system?.subtype === "accessPoint"
    );
}

/**
 * TokenDocument centre in canvas pixels — computed from the doc's own x/y
 * + size so it reflects the latest position even when the PlaceableObject
 * hasn't refreshed yet (the `updateToken` hook fires before redraw).
 */
export function tokenCentre(t) {
    const gridSize = canvas.scene?.grid?.size || 100;
    const w = (Number(t.width)  || 1) * gridSize;
    const h = (Number(t.height) || 1) * gridSize;
    return { x: t.x + w / 2, y: t.y + h / 2 };
}

/**
 * Scene-distance (in scene units, typically metres) between two TokenDocuments.
 * Uses V14's grid.measurePath when available so square / hex / euclidean modes
 * all behave correctly; falls back to centre-to-centre euclidean on V13.
 */
export function tokenDistance(a, b) {
    if (!a || !b) return Infinity;
    const ac = tokenCentre(a);
    const bc = tokenCentre(b);
    const grid = canvas.grid;
    if (grid?.measurePath) {
        const m = grid.measurePath([ac, bc]);
        return Number(m?.distance ?? m) || 0;
    }
    const dx = ac.x - bc.x;
    const dy = ac.y - bc.y;
    return Math.hypot(dx, dy) / canvas.scene.grid.size * canvas.scene.grid.distance;
}

/**
 * Every AP whose effective radius covers `meatToken`'s current position,
 * paired with the measured distance for downstream sorting. `deck` (when
 * supplied) contributes its Range-upgrade total in metres to every AP's
 * effective radius — the runner reaches further with the right chrome.
 */
export function accessPointsCovering(meatToken, scene = canvas.scene, deck = null) {
    if (!meatToken) return [];
    const aps = getAccessPointTokens(scene);
    const rangeBonus = deck ? deckUpgradeValue(deck, "range") : 0;
    const hits = [];
    for (const ap of aps) {
        const base = Number(ap.actor?.system?.radius) || 0;
        if (base <= 0) continue;
        const effective = base + rangeBonus;
        const distance = tokenDistance(meatToken, ap);
        if (distance <= effective) hits.push({ ap, distance });
    }
    return hits;
}

/** Nearest AP whose effective radius covers `meatToken`, or null. */
export function nearestCoveringAccessPoint(meatToken, scene = canvas.scene, deck = null) {
    const hits = accessPointsCovering(meatToken, scene, deck);
    if (!hits.length) return null;
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0].ap;
}

/**
 * Resolve `ap.actor.system.entryRegion` (a RegionDocument UUID) to its centre
 * point in canvas pixels, or null if unset / unresolved / pre-V14. Centre is
 * taken from the region's bounding box — predictable single point regardless
 * of shape complexity. The token's top-left is offset by half a grid cell
 * so the *token centre* lands on the region centre.
 *
 * Returns `{x, y}` in token-document coords (top-left), or null.
 */
export function getEntryRegionSpawn(ap) {
    const uuid = ap?.actor?.system?.entryRegion;
    if (!uuid) return null;
    const region = fromUuidSync?.(uuid);
    if (!region || region.documentName !== "Region") return null;
    const bounds = region.object?.bounds ?? region.bounds;
    if (!bounds) return null;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const gridSize = canvas.scene?.grid?.size || 100;
    return { x: cx - gridSize / 2, y: cy - gridSize / 2 };
}

/**
 * Fallback spawn point when no entryRegion is set: the AP token's centre.
 * Returns `{x, y}` in token-document coords (top-left).
 */
export function getApCentreSpawn(ap) {
    if (!ap) return null;
    const gridSize = canvas.scene?.grid?.size || 100;
    const c = ap.object?.center ?? { x: ap.x + gridSize / 2, y: ap.y + gridSize / 2 };
    return { x: c.x - gridSize / 2, y: c.y - gridSize / 2 };
}
