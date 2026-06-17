/**
 * Token Action HUD Roll Handler for Cyberpunk 2020.
 * Executes actions when the user clicks a button in the HUD.
 */

import { ACTION_TYPE } from "./constants.js";

export let RollHandler = null;

Hooks.once("tokenActionHudCoreApiReady", async (coreModule) => {
    RollHandler = class CyberpunkRollHandler extends coreModule.api.RollHandler {

        /**
         * Handle action click from the HUD.
         *
         * Multi-token broadcast: when more than one token is controlled, the
         * generic actions — Attributes / Saves / Initiative / Conditions —
         * apply to every selected token in one click. Weapons / Skills /
         * Unarmed / Ordnance stay single-actor (they're tied to whichever
         * actor the HUD was built for).
         *
         * Attribute broadcast intentionally bypasses the SkillRollDialog —
         * popping N dialogs would defeat the point. Rolls use the dialog's
         * default difficulty (15) and no extra modifier; for fine-grained
         * single-actor rolls the GM can deselect the rest.
         *
         * @param {Event} event - The click event
         * @param {string} encodedValue - Pipe-delimited "actionType|actionId"
         */
        async handleActionClick(event, encodedValue) {
            const [actionType, actionId] = encodedValue.split("|");

            const controlled = canvas?.tokens?.controlled || [];
            const isBroadcastable = (
                actionType === ACTION_TYPE.attribute ||
                actionType === ACTION_TYPE.save ||
                actionType === ACTION_TYPE.condition ||
                (actionType === ACTION_TYPE.utility && actionId === "initiative")
            );

            if (isBroadcastable && controlled.length > 1) {
                return this._broadcast(controlled, actionType, actionId);
            }

            const actor = this.actor;
            if (!actor) return;

            const token = this.token;

            switch (actionType) {
                case ACTION_TYPE.attribute:
                    return this._handleAttribute(actor, actionId);
                case ACTION_TYPE.skill:
                    return this._handleSkill(actor, actionId);
                case ACTION_TYPE.weapon:
                    return this._handleWeapon(actor, actionId);
                case ACTION_TYPE.unarmed:
                    return this._handleUnarmed(actor, actionId);
                case ACTION_TYPE.ordnance:
                    return this._handleOrdnance(actor, actionId);
                case ACTION_TYPE.save:
                    return this._handleSave(actor, actionId);
                case ACTION_TYPE.condition:
                    return this._handleCondition(actor, token, actionId);
                case ACTION_TYPE.utility:
                    return this._handleUtility(actor, actionId);
            }
        }

        /**
         * Apply a broadcast-safe action to every controlled token. Initiative
         * goes through a single `combat.rollInitiative([...ids])` call; the
         * rest iterate per actor.
         */
        async _broadcast(tokens, actionType, actionId) {
            if (actionType === ACTION_TYPE.utility && actionId === "initiative") {
                return this._broadcastInitiative(tokens);
            }

            for (const token of tokens) {
                const actor = token.actor;
                if (!actor) continue;
                switch (actionType) {
                    case ACTION_TYPE.attribute:
                        await actor.rollStatCheck(actionId, 15);
                        break;
                    case ACTION_TYPE.save:
                        await this._handleSave(actor, actionId);
                        break;
                    case ACTION_TYPE.condition:
                        await this._handleCondition(actor, token, actionId);
                        break;
                }
            }
        }

        /**
         * Initiative for every controlled token whose actor is in the active
         * combat — single call, one chat batch.
         */
        async _broadcastInitiative(tokens) {
            const combat = game.combat;
            if (!combat) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.NoCombat"));
                return;
            }
            const combatantIds = tokens
                .map(t => combat.combatants.find(c => c.actorId === t.actor?.id)?.id)
                .filter(Boolean);
            if (!combatantIds.length) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.NotInCombat"));
                return;
            }
            return combat.rollInitiative(combatantIds);
        }

        /**
         * Roll a stat check — opens SkillRollDialog with rollType: "stat".
         */
        async _handleAttribute(actor, statName) {
            const { SkillRollDialog } = await import("../dialog/skill-roll-dialog.js");
            const { localize, toTitleCase } = await import("../utils.js");
            const fullStatName = localize(toTitleCase(statName) + "Full");

            // Close any existing skill roll dialog
            const existing = Object.values(ui.windows).find(w => w.id === "skill-roll-dialog");
            if (existing) existing.close();

            new SkillRollDialog(actor, {
                rollType: "stat",
                statName: statName,
                title: fullStatName,
                statIcon: statName
            }).render(true);
        }

        /**
         * Roll a skill check — opens SkillRollDialog with rollType: "skill".
         */
        async _handleSkill(actor, skillId) {
            const { SkillRollDialog } = await import("../dialog/skill-roll-dialog.js");

            const skill = actor.items.get(skillId);
            if (!skill) return;

            // Close any existing skill roll dialog
            const existing = Object.values(ui.windows).find(w => w.id === "skill-roll-dialog");
            if (existing) existing.close();

            new SkillRollDialog(actor, {
                rollType: "skill",
                skillId: skillId,
                title: skill.name,
                statIcon: skill.system.stat
            }).render(true);
        }

        /**
         * Attack with a weapon — opens the appropriate modifier dialog.
         */
        async _handleWeapon(actor, itemId) {
            const item = actor.items.get(itemId);
            if (!item) return;

            const targetTokens = Array.from(game.users.current.targets.values()).map(t => ({
                name: t.document.name,
                id: t.id
            }));

            const LEGACY = {
                Pistol:"Ranged",SMG:"Ranged",Shotgun:"Ranged",Rifle:"Ranged",Heavy:"Ranged",
                Bow:"Martial",Crossbow:"Martial",Melee:"Martial",Exotic:"Exotic"
            };
            const wd = item.weaponData || {};
            const rawType = wd.weaponType;
            const t = LEGACY[rawType] || rawType;

            // Any AoE weapon — Ordnance, Exotic w/ template, Ranged w/ grenade ammo
            if (typeof item._isAreaWeapon === "function" && item._isAreaWeapon()) {
                if (t === "Exotic") {
                    const charges = Number(wd.charges) || 0;
                    if (charges <= 0) {
                        ui.notifications.warn(game.i18n.localize("CYBERPUNK.OutOfCharges"));
                        return;
                    }
                }
                const { OrdnanceAttackDialog } = await import("../dialog/ordnance-attack-dialog.js");
                new OrdnanceAttackDialog(actor, item, targetTokens).render(true);
                return;
            }

            // Exotic without template — charges check, then mode picker
            if (t === "Exotic") {
                const charges = Number(wd.charges) || 0;
                if (charges <= 0) {
                    ui.notifications.warn(game.i18n.localize("CYBERPUNK.OutOfCharges"));
                    return;
                }
                const rof = Number(wd.rof) || 1;
                if (rof > 1) {
                    const { RangedAttackDialog } = await import("../dialog/ranged-attack-dialog.js");
                    new RangedAttackDialog(actor, item, targetTokens).render(true);
                } else {
                    const { fireModes } = await import("../lookups.js");
                    const { RangeSelectionDialog } = await import("../dialog/range-selection-dialog.js");
                    new RangeSelectionDialog(actor, item, fireModes.singleShot, targetTokens).render(true);
                }
                return;
            }

            // Ranged (non-grenade ammo)
            if (t === "Ranged") {
                const { RangedAttackDialog } = await import("../dialog/ranged-attack-dialog.js");
                new RangedAttackDialog(actor, item, targetTokens).render(true);
                return;
            }

            // Martial
            if (t === "Martial") {
                if (wd.attackType === "Martial") {
                    const { ModifiersDialog } = await import("../dialog/modifiers.js");
                    const { buildMartialModifierGroups } = await import("../lookups.js");
                    const modifierGroups = buildMartialModifierGroups(actor);
                    new ModifiersDialog(actor, {
                        weapon: item,
                        targetTokens: targetTokens,
                        modifierGroups: modifierGroups,
                        onConfirm: (fireOptions) => item._resolveAttack(fireOptions, targetTokens)
                    }).render(true);
                } else {
                    const { MeleeAttackDialog } = await import("../dialog/melee-attack-dialog.js");
                    new MeleeAttackDialog(actor, item, targetTokens).render(true);
                }
                return;
            }
        }

        /**
         * Unarmed attack — opens PunchDialog directly for the chosen action.
         */
        async _handleUnarmed(actor, actionKey) {
            const { PunchDialog } = await import("../dialog/punch-dialog.js");
            new PunchDialog(actor, { actionKey }).render(true);
        }

        /**
         * Ordnance attack — opens OrdnanceAttackDialog.
         */
        async _handleOrdnance(actor, itemId) {
            // Back-compat: forward to _handleWeapon (which routes Ordnance to the AoE dialog).
            return this._handleWeapon(actor, itemId);
        }

        /**
         * Roll a save (Stun, Death, Poison).
         */
        async _handleSave(actor, saveId) {
            switch (saveId) {
                case "stunSave": return actor.rollStunSave();
                case "deathSave": return actor.rollDeathSave();
                case "poisonSave": return actor.rollPoisonSave();
            }
        }

        /**
         * Toggle a status effect on the actor. Foundry V13 removed
         * `token.toggleActiveEffect` — `actor.toggleStatusEffect(statusId,
         * { active })` is the supported path now, and matches the rest of
         * the codebase (drone sheet, conditions, chat-message handlers).
         */
        async _handleCondition(actor, token, statusId) {
            if (!actor) return;
            const isActive = actor.statuses?.has(statusId) === true;
            await actor.toggleStatusEffect(statusId, { active: !isActive });
        }

        /**
         * Handle utility actions. After the stress / fright / fatigue / sleep
         * removal this is just initiative.
         */
        async _handleUtility(actor, actionId) {
            if (actionId === "initiative") return this._handleInitiative(actor);
        }

        /**
         * Roll initiative for the actor in the current combat.
         */
        async _handleInitiative(actor) {
            const combat = game.combat;
            if (!combat) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.NoCombat"));
                return;
            }

            const combatant = combat.combatants.find(c => c.actorId === actor.id);
            if (!combatant) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.NotInCombat"));
                return;
            }

            return combat.rollInitiative([combatant.id]);
        }
    };
});
