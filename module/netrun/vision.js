/**
 * Token visibility filter — gates which tokens render for the local viewer.
 *
 *   GM with no selection      → sees everything (overview / authoring).
 *   Viewer in NET (driving    → sees NET icons + NET-flagged tokens; physical
 *     a NET icon)               tokens are HIDDEN, even the netrunner's own
 *                               meat body. Cyberspace is a different realm.
 *   Viewer in meatspace       → sees physical tokens; NET icons are HIDDEN
 *     (anything else)           except the ones they own (otherwise they
 *                               could never click their own NET icon to
 *                               control it — chicken-and-egg).
 *
 * The "owner exception" is the key bit: when the GM toggles `jacked-in` on
 * the player's actor, the NET icon is created by the GM client (because
 * players can't create tokens). Without the owner exception, the player
 * would never see the NET icon at all — vision.js would hide it because
 * the player isn't yet in NET.
 *
 * Implementation: wrap the `Token#isVisible` getter. Re-read on every
 * perception refresh, so a `canvas.perception.update(...)` call after the
 * user's selection changes is enough to re-evaluate.
 */

import { isNetIcon, viewerIsInNet, canViewerSeeNetIcon } from "./realm.js";

Hooks.once("ready", () => {
    const TokenClass = foundry?.canvas?.placeables?.Token ?? globalThis.Token;
    if (!TokenClass) return;

    // --- isVisible: gate WHICH tokens render to the local viewer ---
    const origIsVisible = TokenClass.prototype.__lookupGetter__("isVisible");
    if (origIsVisible) {
        Object.defineProperty(TokenClass.prototype, "isVisible", {
            configurable: true,
            get() {
                const controlled = canvas?.tokens?.controlled || [];

                // GM overview mode (no token controlled) — see everything.
                if (game.user?.isGM && controlled.length === 0) {
                    return origIsVisible.call(this);
                }

                const targetIsNet = isNetIcon(this);
                const inNet = viewerIsInNet();

                // NET icon hidden from non-NET viewers, full stop. Owners
                // find their own NET icon via the Netrunning realm-switcher
                // dialog rather than seeing it directly on the canvas — the
                // icon "lives" in cyberspace and shouldn't render in the
                // meatspace view at all.
                if (targetIsNet && !inNet) return false;

                // Physical token hidden from NET viewers — meatspace doesn't
                // exist for someone whose consciousness is in cyberspace.
                if (!targetIsNet && inNet) return false;

                // NET viewer looking at a NET icon → visible iff the target
                // is in the same NET region as the viewer's controlled NET
                // icon. Cyberspace is room-by-room: two netrunners in
                // different regions are in different sub-networks. The
                // origIsVisible fallback would lose to our tokenVision wrap
                // (it returns true for everything in NET realm), so the room
                // rule has to be enforced here directly.
                if (targetIsNet && inNet) return canViewerSeeNetIcon(this);

                return origIsVisible.call(this);
            }
        });
    }

    // --- hasSight: gate WHICH tokens contribute to the local user's vision pool ---
    // Foundry V13 unions vision sources from every OWNED token, not just the
    // controlled one. Without this wrap, a player who owns both the physical
    // and the NET icon gets vision contributions from BOTH at all times —
    // meaning the NET icon's vision (even with range=0) still influences
    // their fog. We want the NET icon to count as a vision source ONLY when
    // the viewer is actually driving NET; otherwise it should be effectively
    // invisible to the perception pool, so the player sees what their
    // physical body sees and nothing else.
    const origHasSight = TokenClass.prototype.__lookupGetter__("hasSight");
    if (origHasSight) {
        Object.defineProperty(TokenClass.prototype, "hasSight", {
            configurable: true,
            get() {
                if (isNetIcon(this) && !viewerIsInNet()) {
                    // GM with no selection sees all vision sources (overview).
                    const controlled = canvas?.tokens?.controlled || [];
                    if (game.user?.isGM && controlled.length === 0) {
                        return origHasSight.call(this);
                    }
                    return false;
                }
                return origHasSight.call(this);
            }
        });
    }
});

// --- CanvasVisibility#tokenVision wrap — THE bypass for portrait clipping --
// `Token#isVisible` checks `canvas.visibility.tokenVision` early — if it's
// false, the function returns true immediately, skipping every fog / LOS /
// vision-polygon test. Toggling this off while the local viewer is in NET
// realm makes every token universally visible, no walls considered. NET
// portraits then paint regardless of the controlled NET icon's sight
// polygon shape. Our existing `isVisible` override still hides meatspace
// tokens from NET viewers, so only NET icons surface.
Hooks.once("ready", () => {
    const CanvasVisibility = foundry?.canvas?.groups?.CanvasVisibility
        ?? globalThis.CanvasVisibility;
    if (!CanvasVisibility) return;
    const origTokenVision = CanvasVisibility.prototype.__lookupGetter__("tokenVision");
    if (!origTokenVision) return;
    Object.defineProperty(CanvasVisibility.prototype, "tokenVision", {
        configurable: true,
        get() {
            if (viewerIsInNet()) return false;
            return origTokenVision.call(this);
        }
    });
});

// Perception refresh on selection change or NET-flag flip. We need
// `initializeVision` (not just `refreshVision`) because the `hasSight` wrap
// changes the SET of vision sources in the pool when realm flips — fog
// itself must rebuild, not just re-test visibility against the existing pool.
function refreshPerception() {
    canvas?.perception?.update?.({ initializeVision: true });
}

Hooks.on("controlToken", refreshPerception);

Hooks.on("updateToken", (doc, changes) => {
    if (changes.flags?.cyberpunk?.isNetIcon !== undefined) refreshPerception();
    // NET icon moved → cross-region visibility may have changed for the
    // local viewer. Re-evaluate so a netrunner walking into a different
    // sub-network appears/disappears from everyone else's view.
    if ((changes.x !== undefined || changes.y !== undefined) && isNetIcon(doc)) {
        refreshPerception();
    }
});
