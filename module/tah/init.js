/**
 * Token Action HUD integration entry point for Cyberpunk 2020.
 * Only activates if the token-action-hud-core module is installed and ready.
 *
 * The other TAH files (defaults.js, system-manager.js, action-handler.js,
 * roll-handler.js) each register their own Hooks.once("tokenActionHudCoreApiReady")
 * to define their classes. This file uses Hooks.on (fires after Hooks.once)
 * to register the fully-initialized SystemManager with TAH Core.
 */

import { REQUIRED_CORE_MODULE_VERSION } from "./constants.js";
// These imports trigger the Hooks.once registrations in each file
import "./defaults.js";
import { SystemManager } from "./system-manager.js";
import { TOOLTIP_MAP } from "./action-handler.js";
import "./roll-handler.js";

Hooks.on("tokenActionHudCoreApiReady", async () => {
    const module = game.modules.get("token-action-hud-core");
    module.api = {
        requiredCoreModuleVersion: REQUIRED_CORE_MODULE_VERSION,
        SystemManager
    };
    Hooks.call("tokenActionHudSystemReady", module);

    // --- Cursor-following tooltips for TAH buttons ---
    _registerTahTooltips();
});

/**
 * Cursor-following tooltip for TAH buttons. There's only ever ONE tooltip
 * element in the DOM at a time, tracked via the module-local `activeTooltip`,
 * not via a `_cpTooltip` ref on the button.
 *
 * The single-element design is what fixes the "ghost tooltip" bug — when TAH
 * rerenders (e.g. after applying a condition triggers a recompute), the
 * button that owned the tooltip gets removed from the DOM before `mouseleave`
 * has a chance to fire. The old per-button ref couldn't be cleaned because
 * the button was already gone; with one global element we just rip it on
 * any of: mousedown anywhere, cursor leaving the TAH region, selection
 * change (which is what triggers most TAH rerenders), or a defensive sweep
 * on every show.
 */
let activeTooltip = null;

function _tahButton(target) {
    return target?.closest?.("#token-action-hud button[value]") ?? null;
}

function _positionTip(tip, cx, cy) {
    let top  = cy + 16;
    let left = cx + 12;
    if (top  + tip.offsetHeight > window.innerHeight) top  = cy - tip.offsetHeight - 8;
    if (left + 290              > window.innerWidth)  left = cx - 290              - 12;
    tip.style.top  = `${top}px`;
    tip.style.left = `${left}px`;
}

function _hideTip() {
    if (activeTooltip) {
        activeTooltip.remove();
        activeTooltip = null;
    }
    // Defensive sweep — any orphan tip that somehow escaped the global
    // reference (rare race during TAH rerender) gets cleaned here too.
    document.querySelectorAll(".cyberpunk-tooltip").forEach(el => el.remove());
}

function _showTip(html, cx, cy) {
    _hideTip(); // never let two coexist
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const tip = wrapper.firstElementChild;
    if (!tip) return;
    tip.className = "cyberpunk-tooltip"; // reset TAH modifier class, keep base
    document.body.appendChild(tip);
    activeTooltip = tip;
    _positionTip(tip, cx, cy);
}

function _registerTahTooltips() {
    document.addEventListener("mouseenter", (ev) => {
        const btn = _tahButton(ev.target);
        if (!btn) return;
        const html = TOOLTIP_MAP.get(btn.value);
        if (!html) return;
        _showTip(html, ev.clientX, ev.clientY);
    }, true);

    document.addEventListener("mousemove", (ev) => {
        if (!activeTooltip) return;
        // Cursor left the TAH region while the tip was visible — drop it.
        // Catches the case where TAH redraws under the cursor and the old
        // button silently disappears.
        if (!_tahButton(ev.target)) {
            _hideTip();
            return;
        }
        _positionTip(activeTooltip, ev.clientX, ev.clientY);
    }, true);

    document.addEventListener("mouseleave", (ev) => {
        if (!activeTooltip) return;
        if (_tahButton(ev.target)) _hideTip();
    }, true);

    // Any click anywhere kills the tip — covers the costly-condition flow
    // where the click triggers a rerender that removes the source button
    // before `mouseleave` ever fires.
    document.addEventListener("mousedown", _hideTip, true);

    // TAH rebuilds on selection change. Snipe the tooltip on any of these
    // signals so a stale one can't outlive its button.
    Hooks.on("controlToken", _hideTip);
    Hooks.on("updateActor",  _hideTip);
    Hooks.on("updateToken",  _hideTip);
}
