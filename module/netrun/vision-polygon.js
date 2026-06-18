/**
 * NET-realm sight polygons — strips wall edges so cyberspace sight isn't
 * bounded by physical architecture.
 *
 * Why: V13 uses the controlled token's sight polygon as a literal mask for
 * how it paints OTHER tokens. A NET token outside that polygon has its
 * mesh (portrait sprite) hidden — detection mode, permissions, and
 * `isVisible` all pass green, but the polygon clips the sprite anyway. The
 * default polygon is a wall-bounded sweep, so a NET token on the other
 * side of a meat wall is clipped.
 *
 * Fix: wrap `ClockwiseSweepPolygon._identifyEdges`. When the local viewer
 * is currently in NET realm and the polygon's type is sight, drop every
 * wall edge before the sweep computes. Polygon then sweeps unbounded out
 * to its full sight radius, all NET tokens fall inside, portraits paint.
 *
 * Broader than source-specific filtering because we don't reliably have
 * the source token at the point _identifyEdges runs — but it's safe: in
 * meat realm the wrap is a no-op, and in NET realm the only meatspace
 * tokens visible to the viewer are hidden by realm-rendering anyway.
 *
 * Patches on `init` so the prototype change is in place before the first
 * vision polygon is ever computed.
 */

import { viewerIsInNet } from "./realm.js";

Hooks.once("init", () => {
    // Foundry V13: `foundry.canvas.geometry.ClockwiseSweepPolygon`. Older
    // builds keep a global. Try both.
    const SweepPoly = foundry?.canvas?.geometry?.ClockwiseSweepPolygon
        ?? globalThis.ClockwiseSweepPolygon;
    if (!SweepPoly) return;

    const orig = SweepPoly.prototype._identifyEdges;
    if (typeof orig !== "function") return;

    SweepPoly.prototype._identifyEdges = function () {
        orig.call(this);

        // Only sight polygons; movement / sound / light keep walls.
        if (this.config?.type !== "sight") return;

        // Only modify when the LOCAL viewer is in NET realm. Other clients
        // get the original wall-bounded polygon.
        if (!viewerIsInNet()) return;

        // Drop every wall edge.
        const toRemove = [];
        for (const edge of this.edges) {
            const wall = edge?.wall ?? edge?.object;
            if (wall?.documentName === "Wall") toRemove.push(edge);
        }
        for (const e of toRemove) this.edges.delete(e);
    };
});
