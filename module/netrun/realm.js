/**
 * Realm helpers — the single source of truth for "is this a NET icon?" and
 * "what realm is the local viewer currently in?". Imported by every other
 * netrun module so the rule lives in one place; change it here and every
 * downstream behaviour (token visibility, canvas rendering, tint, collision)
 * follows.
 */

/**
 * True if `tokenOrDoc` is a NET-icon manifestation. Accepts either a Token
 * placeable (whose `.document` is the TokenDocument) OR a TokenDocument
 * directly — hooks like `preUpdateToken` / `updateToken` / `createToken`
 * pass the document, while canvas iteration gives us the placeable.
 *
 * Before this dual handling, every hook-based realm check was silently
 * false because `tokenDoc.document` is undefined.
 */
export function isNetIcon(tokenOrDoc) {
    if (!tokenOrDoc) return false;
    const doc = tokenOrDoc.document ?? tokenOrDoc;
    return doc?.getFlag?.("cyberpunk", "isNetIcon") === true;
}

/** True if any of the local user's currently-controlled tokens is a NET icon. */
export function viewerIsInNet() {
    const controlled = canvas?.tokens?.controlled || [];
    return controlled.some(isNetIcon);
}

/**
 * Resolve the local viewer's realm from the current selection.
 *
 *   "net"  — controlling at least one NET icon (regardless of mix).
 *   "meat" — controlling at least one physical token and no NET icons.
 *   "free" — controlling nothing (GM-friendly authoring view).
 *
 * Players with nothing controlled default to "meat" because they don't get
 * an authoring view — meatspace is their default reality.
 */
export function currentRealmView() {
    const controlled = canvas?.tokens?.controlled || [];
    if (controlled.length === 0) return game.user?.isGM ? "free" : "meat";

    const anyNet = controlled.some(isNetIcon);
    return anyNet ? "net" : "meat";
}

/**
 * Defensive point-in-region test. V13 has shuffled the testPoint surface a
 * couple of times — the canonical call lives on the document, sometimes on
 * the placeable, and may need an `elevation`. We probe both with elevation,
 * then fall back to a bounding-box test if every attempt rejects the call.
 */
function regionContainsPoint(region, point) {
    const probe = { x: point.x, y: point.y, elevation: 0 };
    for (const target of [region, region?.object]) {
        if (!target) continue;
        try {
            if (typeof target.testPoint === "function") {
                const result = target.testPoint(probe);
                if (typeof result === "boolean") return result;
            }
        } catch { /* try next */ }
    }
    const b = region?.bounds ?? region?.object?.bounds;
    if (b) {
        return point.x >= b.x && point.x <= b.x + b.width
            && point.y >= b.y && point.y <= b.y + b.height;
    }
    return false;
}

/**
 * Return the first NET-flagged region on the active scene that contains
 * `point`, or `null`. Used by the canvas layer (to decide which region to
 * paint) and the collision wrap (to decide whether a movement crosses a
 * region boundary).
 */
export function findNetRegionContaining(point) {
    if (!canvas?.scene?.regions || !point) return null;
    for (const region of canvas.scene.regions) {
        if (region.getFlag?.("cyberpunk", "netRoom") !== true) continue;
        if (regionContainsPoint(region, point)) return region;
    }
    return null;
}

/**
 * Room-isolation rule for NET token visibility. Caller has already established
 * that the local viewer is in NET realm and `token` is a NET icon — this
 * helper just decides whether they share a sub-network.
 *
 *   Viewer's NET icon in region R, target in region R   → true  (same room)
 *   Viewer's NET icon in region R, target in region R'  → false (different room)
 *   Viewer's NET icon in region R, target outside       → false (off-grid)
 *   Viewer's NET icon outside any region (staging)      → true  (no constraint)
 *
 * Cyberspace topology is room-by-room: two netrunners in different NET
 * regions are effectively in different sub-networks and shouldn't see each
 * other. Pathfinding-Netrunning will later relax this for tokens whose
 * owner has run the action — that override lives elsewhere; this helper
 * remains the baseline room rule.
 */
export function canViewerSeeNetIcon(token) {
    const controlled = canvas?.tokens?.controlled || [];
    let viewerRegion = null;
    for (const t of controlled) {
        if (!isNetIcon(t)) continue;
        const r = findNetRegionContaining(t.center);
        if (r) { viewerRegion = r; break; }
    }
    if (!viewerRegion) return true; // staging / not in any region — no isolation yet
    if (!token?.center) return true; // can't resolve target center — safe default
    const targetRegion = findNetRegionContaining(token.center);
    return targetRegion?.id === viewerRegion.id;
}
