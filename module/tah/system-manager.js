/**
 * Token Action HUD System Manager for Cyberpunk 2020.
 * Bridge between TAH Core and the system-specific handlers.
 */

import { ActionHandler } from "./action-handler.js";
import { RollHandler } from "./roll-handler.js";
import { DEFAULTS } from "./defaults.js";

export let SystemManager = null;

Hooks.once("tokenActionHudCoreApiReady", async (coreModule) => {
    SystemManager = class CyberpunkSystemManager extends coreModule.api.SystemManager {

        getActionHandler() {
            return new ActionHandler();
        }

        getAvailableRollHandlers() {
            return { core: "Cyberpunk 2020" };
        }

        getRollHandler(rollHandlerId) {
            return new RollHandler();
        }

        async registerDefaults() {
            return DEFAULTS;
        }

        async registerSettings(coreUpdate) {
            // No custom TAH settings for now
        }
    };
});
