/**
 * Visual treatment for NET icon tokens — translucent + cyan-tinted, matching
 * the "ghostly cyberspace projection" feel (similar to the invisibility
 * effect in dnd5e).
 *
 * Foundry resets `mesh.alpha`/`mesh.tint` from the document on every refresh,
 * so we re-apply the override on every `refreshToken` / `drawToken`. Tokens
 * that lose the flag fall back to default on the next refresh automatically
 * (we don't reset, so the engine's own values win).
 */

const NET_ICON_TINT  = 0x66DDFF; // soft cyan, less harsh than pure 00FFFF
const NET_ICON_ALPHA = 0.6;      // translucent enough to read as "projection"

function applyNetIconFx(token) {
    if (!token?.mesh) return;
    if (token.document?.getFlag?.("cyberpunk", "isNetIcon") !== true) return;
    token.mesh.alpha = NET_ICON_ALPHA;
    token.mesh.tint  = NET_ICON_TINT;
}

Hooks.on("refreshToken", applyNetIconFx);
Hooks.on("drawToken",    applyNetIconFx);
