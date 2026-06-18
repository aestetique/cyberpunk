/**
 * Realm-aware canvas rendering — what the local user sees when they enter
 * NET mode (controlling a NET icon) versus meatspace.
 *
 * In NET mode we hide every "physical" canvas surface — scene background,
 * tile layers, lighting / illumination effects — so the netrunner's view is
 * the void with our custom cyan-glow NET-architecture layer (which lives in
 * a separate CanvasLayer and is toggled visible by net-architecture-layer.js)
 * plus whichever NET-flagged tokens the fog reveals.
 *
 * Important: visibility is set on the LOCAL canvas only. Each connected
 * client has its own `canvas` object, so flipping `.visible` here doesn't
 * affect any other player — exactly what we want, because realm is a
 * per-user perspective, not a scene-wide state.
 *
 * This is the inspiration from theripper93/Levels: instead of trying to
 * teach Foundry that "realms exist," we wrap the small number of places
 * where Foundry asks "is this visible?" and answer it ourselves.
 *
 * Lights, sight polygon walls, and movement-collision filters get their
 * own modules; this file is just the "what canvas groups render" pass.
 */

import { currentRealmView } from "./realm.js";

/**
 * Apply realm-aware visibility to the local canvas. Cheap — every entry is
 * a single `.visible = bool` assignment with a defensive existence check.
 * V13 has been shuffling these surfaces across primary / effects / dedicated
 * layers, so we probe each known location and skip what isn't there.
 */
function applyRealmRendering() {
    if (!canvas?.ready) return;
    const inNet = currentRealmView() === "net";
    const showPhysical = !inNet;

    // --- Meatspace surfaces (hidden in NET realm) ---
    // Scene background image. The "physical floor" of the world.
    if (canvas.primary?.background) canvas.primary.background.visible = showPhysical;
    // Foreground tile sprite group — overhead tiles, ceiling-style decoration.
    if (canvas.primary?.foreground) canvas.primary.foreground.visible = showPhysical;
    // The tiles editor layer (placeable markers when in tile-tool mode).
    if (canvas.tiles)               canvas.tiles.visible               = showPhysical;
    // Light source placeables layer (the editable bulbs).
    if (canvas.lighting)            canvas.lighting.visible            = showPhysical;
    // Drawings — sketches the GM scribbled on the map; physical too.
    if (canvas.drawings)            canvas.drawings.visible            = showPhysical;
    // Sounds layer placeables (sound markers, not the audio itself).
    if (canvas.sounds)              canvas.sounds.visible              = showPhysical;
    // Walls placeable layer (door click icons, wall edit handles).
    if (canvas.walls)               canvas.walls.visible               = showPhysical;
    // Everything in the effects group (fog of war, lighting overlays, weather,
    // vision masks). This is the heavy hammer that ensures the cyan layer
    // isn't clipped by any vision/fog mask in NET realm. We restore in
    // meatspace so fog still works for the physical view.
    if (canvas.effects)             canvas.effects.visible             = showPhysical;
    // Map notes (journal pins). V13's Note#isVisible early-returns true
    // when `canvas.visibility.tokenVision` is false — which our wrap makes
    // it in NET realm — so without this hide, every accessible note pin
    // paints over the cyan layer. Same logic for door controls below.
    if (canvas.notes)               canvas.notes.visible               = showPhysical;
    // Door icons live in `canvas.controls.doors` (a PIXI.Container). Same
    // tokenVision-bypass problem as notes: DoorControl#isVisible returns
    // true when tokenVision is false, so every door would paint.
    if (canvas.controls?.doors)     canvas.controls.doors.visible      = showPhysical;
}

// --- Wiring -----------------------------------------------------------------

// First paint and on scene swap.
Hooks.on("canvasReady", applyRealmRendering);

// Selection change — the very signal the realm depends on.
Hooks.on("controlToken", applyRealmRendering);

// A token's NET-icon flag flipping re-evaluates realm for anyone who has it
// in their selection.
Hooks.on("updateToken", (_doc, changes) => {
    if (changes.flags?.cyberpunk?.isNetIcon !== undefined) applyRealmRendering();
});
