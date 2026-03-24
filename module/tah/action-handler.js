/**
 * Token Action HUD Action Handler for Cyberpunk 2020.
 * Builds the action list displayed in the HUD when a token is selected.
 */

import {
    ACTION_TYPE, STAT_KEYS, STAT_LABELS,
    AUTO_CONDITIONS, COVER_CONDITIONS, LOST_LIMB_CONDITIONS,
    ACTION_CONDITIONS, NETRUNNING_CONDITIONS, MENTAL_CONDITIONS
} from "./constants.js";
import { CONDITION_TOGGLE_ROWS } from "../conditions.js";

export let ActionHandler = null;

/**
 * Global map of encodedValue → tooltip HTML.
 * Populated during buildSystemActions, consumed by the cursor-following
 * tooltip handler registered in init.js.
 */
export const TOOLTIP_MAP = new Map();

// Build a flat lookup of condition ID → { flavor, calc } from the sheet's toggle rows
const CONDITION_TOOLTIP_MAP = new Map();
for (const row of CONDITION_TOGGLE_ROWS) {
    for (const cond of row) {
        CONDITION_TOOLTIP_MAP.set(cond.id, { flavor: cond.flavor, calc: cond.calc });
    }
}

/**
 * Build tooltip HTML matching the system's cyberpunk-tooltip style.
 */
function buildTooltipHtml(name, desc, calc) {
    let html = `<div class="cyberpunk-tooltip cyberpunk-tooltip--tah">`;
    html += `<div class="tooltip-header"><div class="tooltip-name">${name}</div></div>`;
    if (desc) html += `<div class="tooltip-desc">${desc}</div>`;
    if (calc) html += `<div class="tooltip-calc">${calc}</div>`;
    html += `</div>`;
    return html;
}

/**
 * Store tooltip in the global map keyed by encodedValue.
 */
function setTooltip(encodedValue, name, desc, calc) {
    TOOLTIP_MAP.set(encodedValue, buildTooltipHtml(name, desc, calc));
}

// Stat flavor descriptions (same as actor-sheet.js)
const STAT_FLAVORS = {
    int: "Problem solving ability, awareness, perception, memory, and the ability to learn quickly.",
    ref: "Combined agility, manual dexterity, and reaction speed. Affects combat initiative and ranged weapon accuracy.",
    tech: "Ability to manipulate tools or instruments. How well you relate to hardware and operate machinery.",
    cool: "Ability to withstand stress, fear, pressure, physical pain, and/or torture.",
    attr: "How good-looking you are. Determines first impressions and social interactions based on appearance.",
    bt: "Size, toughness, and resistance to damage. Determines carrying capacity and Body Type Modifier.",
    emp: "Ability to relate to and care about others. Reduced by cyberware through humanity loss.",
    ma: "How fast you can move. Determines zones of movement per combat round.",
    luck: "How the Universe smiles upon you. Spend Luck points to adjust important die rolls."
};

Hooks.once("tokenActionHudCoreApiReady", async (coreModule) => {
    ActionHandler = class CyberpunkActionHandler extends coreModule.api.ActionHandler {

        /**
         * Build system-specific actions for the HUD.
         * Called by TAH Core whenever the selected token changes.
         */
        buildSystemActions(groupIds) {
            const actor = this.actor;
            if (!actor) return;

            TOOLTIP_MAP.clear();
            this._buildAttributeActions(actor);
            this._buildSkillActions(actor);
            this._buildWeaponActions(actor);
            this._buildUnarmedActions(actor);
            this._buildOrdnanceActions(actor);
            this._buildConditionActions(actor);
            this._buildInitiativeAction();
            this._buildSaveActions();
            this._buildStressActions(actor);
            this._buildFrightActions(actor);
            this._buildFatigueActions(actor);
            this._buildSleepActions();
        }

        /**
         * Build stat calc string matching the sheet's buildStatCalc().
         */
        _buildStatCalc(actor, key) {
            const s = actor.system.stats[key];
            if (!s) return "";
            const base = s.base ?? 0;
            const parts = [`Base ${base}`];
            const tempMod = s.tempMod || 0;
            if (tempMod !== 0) parts.push(`Gear ${tempMod > 0 ? "+" : ""}${tempMod}`);
            if (key === "ref" && s.armorMod) parts.push(`Armor ${s.armorMod}`);
            if (key === "emp") {
                const hloss = Math.floor((s.humanityDamage || 0) / 10);
                if (hloss > 0) parts.push(`Humanity \u2212${hloss}`);
            }
            if (key === "luck" && (s.spent || 0) > 0) parts.push(`Spent \u2212${s.spent}`);
            if (["ref", "int", "cool"].includes(key) && s.woundMod) parts.push(`Wounds ${s.woundMod}`);
            if (s.scrambledMod) parts.push(`Scrambled ${s.scrambledMod}`);
            if (s.sleepMod) parts.push(`Sleep ${s.sleepMod}`);
            const total = key === "luck" ? (s.effective ?? s.total ?? base) : (s.total ?? base);
            let calc = parts.length > 1 ? `${parts.join(" ")} = ${total}` : `Base ${base}`;
            if (key === "ma") calc += ` | Run ${s.run ?? 0} | Leap ${s.leap ?? 0}`;
            if (key === "bt") calc += ` | Carry ${s.carry ?? 0}kg | Lift ${s.lift ?? 0}kg | BTM ${s.modifier ?? 0}`;
            return calc;
        }

        /**
         * Attribute stat checks (INT, REF, TECH, etc.)
         */
        _buildAttributeActions(actor) {
            const actions = STAT_KEYS.map(stat => {
                const total = actor.system.stats[stat]?.total ?? 0;
                const name = game.i18n.localize(STAT_LABELS[stat]);
                const calc = this._buildStatCalc(actor, stat);
                const ev = [ACTION_TYPE.attribute, stat].join("|");
                setTooltip(ev, name, STAT_FLAVORS[stat], calc);
                return {
                    id: stat,
                    name: name,
                    encodedValue: ev,
                    info1: { text: String(total) }
                };
            });
            this.addActions(actions, { id: "attributes", type: "system" });
        }

        /**
         * All actor skills, sorted alphabetically.
         */
        _buildSkillActions(actor) {
            const skills = actor.itemTypes.skill;
            if (!skills?.length) return;

            const actions = skills
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(skill => {
                    const level = skill.system.value || 0;
                    const stat = skill.system.stat || "";
                    const statTotal = actor.system.stats[stat]?.total ?? 0;
                    const total = level + statTotal;
                    const flavor = skill.system.flavor || "";
                    const statLabel = stat ? stat.toUpperCase() : "";
                    const calcParts = [];
                    if (statLabel) calcParts.push(`${statLabel} ${statTotal}`);
                    calcParts.push(`Skill ${level}`);
                    const calcStr = `${calcParts.join(" + ")} = ${total}`;
                    const ev = [ACTION_TYPE.skill, skill.id].join("|");
                    setTooltip(ev, skill.name, flavor, calcStr);
                    return {
                        id: skill.id,
                        name: skill.name,
                        encodedValue: ev,
                        info1: { text: String(total) },
                        cssClass: skill.system.isChipped ? "active" : ""
                    };
                });
            this.addActions(actions, { id: "skills", type: "system" });
        }

        /**
         * Equipped weapons, split by category into ranged/melee/exotic groups.
         */
        _buildWeaponActions(actor) {
            const weapons = actor.itemTypes.weapon || [];
            // Also include cyberware weapons
            const cyberWeapons = (actor.itemTypes.cyberware || [])
                .filter(cw => cw.system.isWeapon && cw.system.isInstalled);

            const allWeapons = [...weapons, ...cyberWeapons];

            const rangedActions = [];
            const meleeActions = [];
            const exoticActions = [];

            for (const weapon of allWeapons) {
                const wd = weapon.type === "cyberware" ? weapon.system.weapon : weapon.system;
                const wType = wd?.weaponType;
                if (!wType) continue;

                const dmg = wd.damage || "";
                const weaponCalc = [wType, dmg ? `Damage ${dmg}` : ""].filter(Boolean).join(" | ");
                const ev = [ACTION_TYPE.weapon, weapon.id].join("|");
                setTooltip(ev, weapon.name, weapon.system.flavor || "", weaponCalc);
                const action = {
                    id: weapon.id,
                    name: weapon.name,
                    encodedValue: ev,
                    img: weapon.img
                };

                if (wType === "Exotic") {
                    exoticActions.push(action);
                } else if (wType === "Melee") {
                    meleeActions.push(action);
                } else {
                    rangedActions.push(action);
                }
            }

            if (rangedActions.length) {
                this.addActions(rangedActions, { id: "ranged", type: "system" });
            }
            if (meleeActions.length) {
                this.addActions(meleeActions, { id: "melee", type: "system" });
            }
            if (exoticActions.length) {
                this.addActions(exoticActions, { id: "exotic", type: "system" });
            }
        }

        /**
         * Unarmed martial actions.
         */
        _buildUnarmedActions(actor) {
            const actionKeys = [
                "Punch", "Kick", "Disarm", "Sweep",
                "Grapple", "Hold", "Break", "Choke", "Crush", "Throw", "Ram"
            ];

            const actions = actionKeys.map(key => ({
                id: key,
                name: game.i18n.localize(`CYBERPUNK.${key}`),
                encodedValue: [ACTION_TYPE.unarmed, key].join("|")
            }));

            this.addActions(actions, { id: "unarmed", type: "system" });
        }

        /**
         * Ordnance items (grenades, explosives, etc.)
         */
        _buildOrdnanceActions(actor) {
            const ordnance = actor.itemTypes.ordnance || [];
            if (!ordnance.length) return;

            const actions = ordnance.map(item => {
                const charges = item.system.charges || 0;
                const dmg = item.system.damage || "";
                const ordCalc = [dmg ? `Damage ${dmg}` : "", `Charges ${charges}`].filter(Boolean).join(" | ");
                const ev = [ACTION_TYPE.ordnance, item.id].join("|");
                setTooltip(ev, item.name, item.system.flavor || "", ordCalc);
                return {
                    id: item.id,
                    name: item.name,
                    encodedValue: ev,
                    img: item.img,
                    info1: { text: String(charges) }
                };
            });
            this.addActions(actions, { id: "ordnance", type: "system" });
        }

        /**
         * Conditions toggle (status effects).
         * Auto-applied conditions (wounds, stress, fatigue, sleep) are hidden.
         * Remaining conditions are split into categorized groups.
         */
        _buildConditionActions(actor) {
            const allConditions = CONFIG.statusEffects;
            if (!allConditions?.length) return;

            const buckets = {
                cover: [],
                lostLimbs: [],
                actions: [],
                netrunning: [],
                mental: [],
                conditions: []
            };

            for (const condition of allConditions) {
                const statusId = condition.statuses?.[0] || condition.id;

                // Skip auto-applied conditions
                if (AUTO_CONDITIONS.has(statusId)) continue;

                const isActive = actor.statuses?.has(statusId);
                const tooltipData = CONDITION_TOOLTIP_MAP.get(statusId);
                const ev = [ACTION_TYPE.condition, statusId].join("|");
                if (tooltipData) setTooltip(ev, condition.name, tooltipData.flavor, tooltipData.calc);
                const action = {
                    id: statusId,
                    name: condition.name,
                    encodedValue: ev,
                    img: condition.img,
                    cssClass: isActive ? "toggle active" : "toggle"
                };

                if (COVER_CONDITIONS.has(statusId)) buckets.cover.push(action);
                else if (LOST_LIMB_CONDITIONS.has(statusId)) buckets.lostLimbs.push(action);
                else if (ACTION_CONDITIONS.has(statusId)) buckets.actions.push(action);
                else if (NETRUNNING_CONDITIONS.has(statusId)) buckets.netrunning.push(action);
                else if (MENTAL_CONDITIONS.has(statusId)) buckets.mental.push(action);
                else buckets.conditions.push(action);
            }

            for (const [groupId, actions] of Object.entries(buckets)) {
                if (actions.length) {
                    this.addActions(actions, { id: groupId, type: "system" });
                }
            }
        }

        /**
         * Initiative roll action.
         */
        _buildInitiativeAction() {
            const actions = [{
                id: "initiative",
                name: game.i18n.localize("CYBERPUNK.Initiative"),
                encodedValue: [ACTION_TYPE.utility, "initiative"].join("|")
            }];
            this.addActions(actions, { id: "initiative", type: "system" });
        }

        /**
         * Saves: Stun, Death, Poison.
         */
        _buildSaveActions() {
            const saves = [
                { id: "stunSave", name: game.i18n.localize("CYBERPUNK.StunSave") },
                { id: "deathSave", name: game.i18n.localize("CYBERPUNK.DeathSave") },
                { id: "poisonSave", name: game.i18n.localize("CYBERPUNK.PoisonSave") }
            ];

            const actions = saves.map(save => ({
                id: save.id,
                name: save.name,
                encodedValue: [ACTION_TYPE.save, save.id].join("|")
            }));
            this.addActions(actions, { id: "saves", type: "system" });
        }

        /**
         * Stress increase (roll dialog) / decrease buttons.
         */
        _buildStressActions(actor) {
            const actions = [
                {
                    id: "stress-up",
                    name: game.i18n.localize("CYBERPUNK.IncreaseStress"),
                    encodedValue: [ACTION_TYPE.utility, "stress-up"].join("|")
                },
                {
                    id: "stress-down",
                    name: game.i18n.localize("CYBERPUNK.DecreaseStress"),
                    encodedValue: [ACTION_TYPE.utility, "stress-down"].join("|")
                }
            ];
            this.addActions(actions, { id: "stress", type: "system" });
        }

        /**
         * Fright increase (COOL check dialog) / decrease buttons.
         */
        _buildFrightActions(actor) {
            const actions = [
                {
                    id: "fright-up",
                    name: game.i18n.localize("CYBERPUNK.IncreaseFright"),
                    encodedValue: [ACTION_TYPE.utility, "fright-up"].join("|")
                },
                {
                    id: "fright-down",
                    name: game.i18n.localize("CYBERPUNK.DecreaseFright"),
                    encodedValue: [ACTION_TYPE.utility, "fright-down"].join("|")
                }
            ];
            this.addActions(actions, { id: "fright", type: "system" });
        }

        /**
         * Fatigue increase / decrease buttons.
         */
        _buildFatigueActions(actor) {
            const actions = [
                {
                    id: "fatigue-up",
                    name: game.i18n.localize("CYBERPUNK.IncreaseFatigue"),
                    encodedValue: [ACTION_TYPE.utility, "fatigue-up"].join("|")
                },
                {
                    id: "fatigue-down",
                    name: game.i18n.localize("CYBERPUNK.DecreaseFatigue"),
                    encodedValue: [ACTION_TYPE.utility, "fatigue-down"].join("|")
                }
            ];
            this.addActions(actions, { id: "fatigue", type: "system" });
        }

        /**
         * Sleep: Stay Awake / Fall Asleep buttons.
         */
        _buildSleepActions() {
            const actions = [
                {
                    id: "stayAwake",
                    name: game.i18n.localize("CYBERPUNK.StayAwake"),
                    encodedValue: [ACTION_TYPE.utility, "stayAwake"].join("|")
                },
                {
                    id: "fallAsleep",
                    name: game.i18n.localize("CYBERPUNK.FallAsleep"),
                    encodedValue: [ACTION_TYPE.utility, "fallAsleep"].join("|")
                }
            ];
            this.addActions(actions, { id: "sleep", type: "system" });
        }
    };
});
