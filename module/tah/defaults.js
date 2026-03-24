/**
 * Token Action HUD default layout for Cyberpunk 2020.
 * Must be built inside the tokenActionHudCoreApiReady hook so that
 * coreModule.api.Utils.i18n is available for localization.
 */

import { GROUP } from "./constants.js";

export let DEFAULTS = null;

Hooks.once("tokenActionHudCoreApiReady", async (coreModule) => {
    const groups = GROUP;

    // Localize group names and add listName for TAH Core
    Object.values(groups).forEach((group) => {
        group.name = coreModule.api.Utils.i18n(group.name);
        group.listName = `Group: ${coreModule.api.Utils.i18n(group.listName ?? group.name)}`;
    });

    const groupsArray = Object.values(groups);

    DEFAULTS = {
        layout: [
            {
                nestId: "skills",
                id: "skills",
                name: "Skills",
                groups: [
                    { ...groups.attributes, nestId: "skills_attributes" },
                    { ...groups.skills, nestId: "skills_skills" }
                ]
            },
            {
                nestId: "weapons",
                id: "weapons",
                name: "Weapons",
                groups: [
                    { ...groups.unarmed, nestId: "weapons_unarmed" },
                    { ...groups.ranged, nestId: "weapons_ranged" },
                    { ...groups.melee, nestId: "weapons_melee" },
                    { ...groups.exotic, nestId: "weapons_exotic" },
                    { ...groups.ordnance, nestId: "weapons_ordnance" }
                ]
            },
            {
                nestId: "conditions",
                id: "conditions",
                name: "Conditions",
                groups: [
                    { ...groups.cover, nestId: "conditions_cover" },
                    { ...groups.lostLimbs, nestId: "conditions_lostLimbs" },
                    { ...groups.actions, nestId: "conditions_actions" },
                    { ...groups.netrunning, nestId: "conditions_netrunning" },
                    { ...groups.mental, nestId: "conditions_mental" },
                    { ...groups.conditions, nestId: "conditions_conditions" }
                ]
            },
            {
                nestId: "utility",
                id: "utility",
                name: "Utility",
                groups: [
                    { ...groups.initiative, nestId: "utility_initiative" },
                    { ...groups.saves, nestId: "utility_saves" },
                    { ...groups.stress, nestId: "utility_stress" },
                    { ...groups.fright, nestId: "utility_fright" },
                    { ...groups.fatigue, nestId: "utility_fatigue" },
                    { ...groups.sleep, nestId: "utility_sleep" }
                ]
            }
        ],
        groups: groupsArray
    };
});
