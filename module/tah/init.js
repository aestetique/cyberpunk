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
 * Attach delegated mouseenter/mousemove/mouseleave handlers on the TAH
 * container so our cyberpunk-tooltip follows the cursor, exactly like
 * the actor sheet tooltips.
 */
function _registerTahTooltips() {
    document.addEventListener("mouseenter", (ev) => {
        // Match any TAH action button with an encoded value
        const btn = ev.target.closest?.("#token-action-hud button[value]");
        if (!btn) return;

        const encodedValue = btn.value;
        const html = TOOLTIP_MAP.get(encodedValue);
        if (!html) return;

        // html from TOOLTIP_MAP is a full <div class="cyberpunk-tooltip ...">...</div>
        // Parse it and transplant content into our positioned tooltip element
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        const tip = wrapper.firstElementChild;
        // Reset TAH modifier class, keep base cyberpunk-tooltip for styling
        tip.className = "cyberpunk-tooltip";
        document.body.appendChild(tip);
        btn._cpTooltip = tip;

        let top = ev.clientY + 16;
        let left = ev.clientX + 12;
        if (top + tip.offsetHeight > window.innerHeight) top = ev.clientY - tip.offsetHeight - 8;
        if (left + 290 > window.innerWidth) left = ev.clientX - 290 - 12;
        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
    }, true);

    document.addEventListener("mousemove", (ev) => {
        const btn = ev.target.closest?.("#token-action-hud button[value]");
        if (!btn?._cpTooltip) return;

        const tip = btn._cpTooltip;
        let top = ev.clientY + 16;
        let left = ev.clientX + 12;
        if (top + tip.offsetHeight > window.innerHeight) top = ev.clientY - tip.offsetHeight - 8;
        if (left + 290 > window.innerWidth) left = ev.clientX - 290 - 12;
        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
    }, true);

    document.addEventListener("mouseleave", (ev) => {
        const btn = ev.target.closest?.("#token-action-hud button[value]");
        if (!btn?._cpTooltip) return;

        btn._cpTooltip.remove();
        btn._cpTooltip = null;
    }, true);

    // Also clean up on mousedown (clicking the button)
    document.addEventListener("mousedown", (ev) => {
        const btn = ev.target.closest?.("#token-action-hud button[value]");
        if (!btn?._cpTooltip) return;

        btn._cpTooltip.remove();
        btn._cpTooltip = null;
    }, true);
}
