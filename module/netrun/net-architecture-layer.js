/**
 * NET Architecture canvas layer — paints the cyan outline / soft fill of the
 * NET region(s) the controlled NET icon currently occupies.
 *
 * Sits in the `primary` canvas group at zIndex 500: above the scene
 * background, below tokens (~700) so the netrunner's icon overlays the
 * geometry, and below the effects group where fog-of-war lives. With
 * realm-rendering hiding the scene background in NET mode, the cyan
 * polygon is what gives the netrunner a sense of "this is the room I'm in."
 *
 * "Current region" semantics: any Foundry Region flagged `cyberpunk.netRoom`
 * is candidate architecture. We render only the candidates that geometrically
 * contain the controlled NET icon's center. When Pathfinder lands (later
 * pass), we'll expand this to "current + every region reachable through
 * doors whose DV ≤ roll."
 */

import { viewerIsInNet, isNetIcon, findNetRegionContaining } from "./realm.js";

const CYAN = 0x00FFFF;

class NetArchitectureLayer extends foundry.canvas.layers.CanvasLayer {

    static get layerOptions() {
        return foundry.utils.mergeObject(super.layerOptions, {
            name: "netArchitecture",
            baseClass: NetArchitectureLayer,
            // Was 500 in the primary group, but primary's children get
            // vision-masked — fog clipped the cyan even after hiding fog
            // visibility. Interface group sits above the masked stack and
            // still pans with the scene transform.
            zIndex: 50
        });
    }

    /** @override — CanvasLayer's `_draw` is abstract; DO NOT call super. */
    async _draw(_options) {
        this.graphics = this.addChild(new PIXI.Graphics());
        this.refresh();
    }

    /** @override */
    async _tearDown(_options) {
        this.removeChildren().forEach(c => c.destroy?.({ children: true }));
        this.graphics = null;
    }

    /**
     * Paint the cyan glow for every NET-flagged region containing the
     * controlled NET icon. Cleared first — wall count is tiny, full redraw
     * is the easy correct option.
     */
    refresh() {
        if (!this.graphics || !canvas.scene) return;
        this.graphics.clear();

        const netIcon = this._findControlledNetIcon();
        if (!netIcon) return;

        const region = findNetRegionContaining(netIcon.center);
        if (!region) return;
        this._drawRegion(region);
    }

    /** First controlled token flagged as a NET icon, or null. */
    _findControlledNetIcon() {
        const controlled = canvas?.tokens?.controlled || [];
        return controlled.find(isNetIcon) || null;
    }

    /**
     * Draw the full region. Path of preference:
     *   1) `region.polygons` (V13 ships these as the unified shape result;
     *      one PIXI.Polygon per disjoint piece, ready to draw).
     *   2) Per-shape rendering against `region.shapes` typed data.
     *   3) `region.bounds` rectangle — always defined, last-resort visual.
     */
    _drawRegion(region) {
        const polys = region.polygons ?? region.object?.polygons;
        if (Array.isArray(polys) && polys.length) {
            for (const poly of polys) this._drawPolygon(poly.points ?? poly);
            return;
        }

        const shapes = region.shapes ?? [];
        let drew = false;
        for (const shape of shapes) {
            if (this._drawShape(shape)) drew = true;
        }
        if (drew) return;

        // Last-resort: outline the bounding box.
        const b = region.bounds ?? region.object?.bounds;
        if (b) this._drawShape({ type: "rectangle", x: b.x, y: b.y, width: b.width, height: b.height });
    }

    /**
     * Draw a polygon (flat `[x1, y1, x2, y2, ...]` array). Used by the
     * polygons fast-path.
     */
    _drawPolygon(points) {
        if (!Array.isArray(points) || points.length < 6) return;
        this._withGlow(() => this.graphics.drawPolygon(points));
    }

    /**
     * Stroke + fill a typed shape (rectangle / ellipse / polygon). Returns
     * true if we recognised and drew the shape, false otherwise (so the
     * caller can fall back).
     */
    _drawShape(shape) {
        const trace = () => this._traceShape(shape);
        if (!this._canTraceShape(shape)) return false;
        this._withGlow(trace);
        return true;
    }

    _canTraceShape(shape) {
        return shape?.type === "rectangle"
            || shape?.type === "ellipse"
            || (shape?.type === "polygon" && Array.isArray(shape.points));
    }

    /** Stack of stroke passes + soft inner fill; takes a callback that issues the geometry. */
    _withGlow(traceFn) {
        const passes = [
            { width: 16, alpha: 0.12 },
            { width: 10, alpha: 0.25 },
            { width: 5,  alpha: 0.55 },
            { width: 2,  alpha: 1.00 }
        ];
        for (const p of passes) {
            this.graphics.lineStyle({
                width: p.width,
                color: CYAN,
                alpha: p.alpha,
                cap:   PIXI.LINE_CAP.ROUND,
                join:  PIXI.LINE_JOIN.ROUND
            });
            traceFn();
        }
        this.graphics.lineStyle(0);
        this.graphics.beginFill(CYAN, 0.06);
        traceFn();
        this.graphics.endFill();
    }

    /**
     * Issue the geometry draw call for one region shape against V13's
     * typed shape data. Rotation isn't applied yet — layer it on if scenes
     * start using rotated regions.
     */
    _traceShape(shape) {
        const type = shape?.type;
        if (type === "rectangle") {
            this.graphics.drawRect(shape.x, shape.y, shape.width, shape.height);
        } else if (type === "ellipse") {
            // V13 ellipse: center (x,y) + radii.
            this.graphics.drawEllipse(shape.x, shape.y, shape.radiusX, shape.radiusY);
        } else if (type === "polygon") {
            this.graphics.drawPolygon(shape.points);
        }
    }
}

/** Show the layer iff the viewer is currently driving a NET icon. */
function updateLayerVisibility() {
    const layer = canvas.netArchitecture;
    if (!layer) return;
    layer.visible = viewerIsInNet();
}

/** Force a redraw on the active scene's NET layer. */
function refreshLayer() {
    canvas.netArchitecture?.refresh();
}

// --- Wiring -----------------------------------------------------------------

Hooks.once("init", () => {
    CONFIG.Canvas.layers.netArchitecture = {
        layerClass: NetArchitectureLayer,
        group: "interface"
    };
});

Hooks.on("canvasReady", () => {
    refreshLayer();
    updateLayerVisibility();
});

// Selection change can both flip visibility AND change which region the
// controlled NET icon is in, so always do both.
Hooks.on("controlToken", () => {
    updateLayerVisibility();
    refreshLayer();
});

// Token movement (commit) — the NET icon may have crossed into a new region.
Hooks.on("updateToken", (_doc, changes) => {
    if (changes.flags?.cyberpunk?.isNetIcon !== undefined) updateLayerVisibility();
    if (changes.x !== undefined || changes.y !== undefined) refreshLayer();
});

// Region changes: shape edits, flag flips, creation, deletion.
Hooks.on("createRegion", refreshLayer);
Hooks.on("updateRegion", refreshLayer);
Hooks.on("deleteRegion", refreshLayer);
