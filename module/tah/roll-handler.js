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
         * @param {Event} event - The click event
         * @param {string} encodedValue - Pipe-delimited "actionType|actionId"
         */
        async handleActionClick(event, encodedValue) {
            const [actionType, actionId] = encodedValue.split("|");

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

            if (item.isRanged()) {
                if (item.weaponData.weaponType === "Exotic") {
                    // Check charges
                    const charges = Number(item.weaponData.charges) || 0;
                    if (charges <= 0) {
                        ui.notifications.warn(game.i18n.localize("CYBERPUNK.OutOfCharges"));
                        return;
                    }
                    const { fireModes } = await import("../lookups.js");
                    const { RangeSelectionDialog } = await import("../dialog/range-selection-dialog.js");
                    new RangeSelectionDialog(actor, item, fireModes.singleShot, targetTokens).render(true);
                } else {
                    const { RangedAttackDialog } = await import("../dialog/ranged-attack-dialog.js");
                    new RangedAttackDialog(actor, item, targetTokens).render(true);
                }
            } else {
                // Melee weapons
                const wd = item.weaponData;
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
            const item = actor.items.get(itemId);
            if (!item) return;

            const charges = Number(item.system.charges) || 0;
            if (charges <= 0) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.OutOfCharges"));
                return;
            }

            const targetTokens = Array.from(game.users.current.targets.values()).map(t => ({
                name: t.document.name,
                id: t.id
            }));

            const { OrdnanceAttackDialog } = await import("../dialog/ordnance-attack-dialog.js");
            new OrdnanceAttackDialog(actor, item, targetTokens).render(true);
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
         * Toggle a condition on the token.
         */
        async _handleCondition(actor, token, statusId) {
            const effect = CONFIG.statusEffects.find(e =>
                (e.statuses?.[0] || e.id) === statusId
            );
            if (!effect) return;

            if (token) {
                await token.toggleActiveEffect(effect);
            }
        }

        /**
         * Handle utility actions (initiative, stress, fright, fatigue, sleep).
         */
        async _handleUtility(actor, actionId) {
            switch (actionId) {
                case "initiative":
                    return this._handleInitiative(actor);

                case "stress-up": {
                    const { StressRollDialog } = await import("../dialog/stress-roll-dialog.js");
                    return new StressRollDialog(actor).render(true);
                }
                case "stress-down": {
                    const current = actor.system.stress || 0;
                    if (current > 0) return actor.update({ "system.stress": current - 1 });
                    return;
                }

                case "fright-up": {
                    const { FrightRollDialog } = await import("../dialog/fright-roll-dialog.js");
                    return new FrightRollDialog(actor).render(true);
                }
                case "fright-down": {
                    const current = actor.system.fright || 0;
                    if (current > 0) return actor.update({ "system.fright": current - 1 });
                    return;
                }

                case "fatigue-up":
                    return actor.update({ "system.fatigue": (actor.system.fatigue || 0) + 1 });
                case "fatigue-down": {
                    const current = actor.system.fatigue || 0;
                    if (current > 0) return actor.update({ "system.fatigue": current - 1 });
                    return;
                }

                case "stayAwake": {
                    const { SleepRollDialog } = await import("../dialog/sleep-roll-dialog.js");
                    return new SleepRollDialog(actor, "stayAwake").render(true);
                }
                case "fallAsleep": {
                    if (actor.statuses.has("insomnia")) {
                        const { SleepRollDialog } = await import("../dialog/sleep-roll-dialog.js");
                        return new SleepRollDialog(actor, "fallAsleep").render(true);
                    } else {
                        const current = actor.system.sleep || 0;
                        if (current > 0) {
                            await actor.update({ "system.sleep": current - 1 });
                            if (actor.system.damage > 0) {
                                const { HealDialog } = await import("../dialog/heal-dialog.js");
                                new HealDialog(actor).render(true);
                            }
                        }
                    }
                    return;
                }
            }
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
