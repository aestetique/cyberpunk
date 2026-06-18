/**
 * Visual treatment for NET icon tokens — translucent, cyan-tinted, matching
 * the "ghostly cyberspace projection" feel (similar to the invisibility
 * effect in the dnd5e Foundry system).
 *
 * Implementation: hook on `refreshToken` / `drawToken` and override the
 * token mesh's alpha + tint when the document carries `cyberpunk.isNetIcon`.
 * Foundry resets `mesh.alpha`/`mesh.tint` from the document on every refresh,
 * so we re-apply our override every cycle — it's effectively a "post-refresh
 * cosmetic layer". Tokens that lose the flag fall back to default on the
 * next refresh automatically (we don't reset, so the engine's own values win).
 */

import { isNetIcon, viewerIsInNet, canViewerSeeNetIcon } from "./realm.js";

const NET_ICON_TINT  = 0x66DDFF; // soft cyan, less harsh than pure 00FFFF
const NET_ICON_ALPHA = 0.6;      // translucent enough to read as "projection"

/**
 * Visual treatment for a NET icon, plus the brute-force override that
 * keeps its portrait visible to other NET viewers regardless of physical
 * walls between them.
 *
 * Foundry V13 applies a per-frame vision-mask to each token's mesh based on
 * the controlled token's sight polygon. None of our perception-level wraps
 * (detection mode / isVisible / observer / testUserPermission / sight
 * polygon wall stripping) override that final mask. The only reliable
 * counter is to wipe the mask directly on the mesh and any tint/filter
 * that might dim it on every frame the token refreshes.
 */
function applyNetIconFx(token) {
    if (!token?.mesh) return;
    if (!isNetIcon(token)) return;

    token.mesh.alpha = NET_ICON_ALPHA;
    token.mesh.tint  = NET_ICON_TINT;

    if (!viewerIsInNet()) return;

    // Room rule: if the target lives in a different NET region than the
    // viewer's controlled NET icon, don't force it visible. The standard
    // visibility chain (via our isVisible wrap) has already set
    // mesh.visible=false; we just need to not override it back to true.
    if (!canViewerSeeNetIcon(token)) return;

    // Detection + permission state — covers the "silhouette" path.
    token.detected = true;
    if (typeof token.impreciseVisible === "boolean") token.impreciseVisible = false;

    // Visibility flags — fight whatever sets these false per-frame.
    token.mesh.visible    = true;
    token.mesh.renderable = true;

    // The mask V13 applies to occlude this mesh outside the vision
    // polygon. Wiping it on the mesh itself is fine; we used to also wipe
    // `mesh.parent.mask`, but the parent is `canvas.primary` — shared by
    // every mesh in the primary group — so that hammer was leaking across
    // unrelated content. With the `tokenVision` wrap now bypassing the
    // entire visibility chain, the per-mesh wipe alone is sufficient.
    token.mesh.mask = null;

    // Filters can also dim/clip the mesh. Clear any vision-related filters
    // (we keep the system's own filters intact — only clear when we're
    // overriding the perception clip).
    if (Array.isArray(token.mesh.filters) && token.mesh.filters.length) {
        token.mesh.filters = null;
    }
}

Hooks.on("refreshToken", applyNetIconFx);
Hooks.on("drawToken",    applyNetIconFx);
