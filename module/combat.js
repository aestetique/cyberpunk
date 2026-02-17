import { RollBundle } from "./dice.js";
import { localize } from "./utils.js";
import { InitiativeRollDialog } from "./dialog/initiative-roll-dialog.js";

/**
 * Extend the base Combat to customize initiative roll rendering
 * Uses the RollBundle system with initiative.hbs template for styled chat messages
 */
export class CyberpunkCombat extends Combat {

    /**
     * Override rollInitiative to use our custom chat template
     * Shows Initiative Roll Dialog for player-owned actors
     * @override
     */
    async rollInitiative(ids, {formula=null, updateTurn=true, messageOptions={}}={}) {
        // Get the combatants
        const combatantIds = typeof ids === "string" ? [ids] : ids;
        const combatants = combatantIds.map(id => this.combatants.get(id));

        // Roll for each combatant
        const updates = [];

        for (const combatant of combatants) {
            if (!combatant?.actor) continue;

            let luckMod = 0;
            let surprisedPenalty = 0;

            // Show dialog for actors owned by the current user
            if (combatant.actor.isOwner) {
                const result = await InitiativeRollDialog.show(
                    combatant.actor,
                    combatant,
                    this
                );

                // If dialog was cancelled, skip this combatant
                if (result === null) continue;

                luckMod = result.luckMod;
                surprisedPenalty = result.surprisedPenalty;
            }

            // Use the provided formula or the system's initiative formula from system.json
            let rollFormula = formula ?? game.system.initiative;

            // Add luck modifier if any
            if (luckMod > 0) {
                rollFormula = `${rollFormula} + ${luckMod}`;
            }

            // Apply surprised penalty if any
            if (surprisedPenalty) {
                rollFormula = `${rollFormula} + ${surprisedPenalty}`;
            }

            const roll = await new Roll(rollFormula, combatant.actor.getRollData()).evaluate();

            // Store the initiative value
            updates.push({_id: combatant.id, initiative: roll.total});

            // Create chat message using our RollBundle system
            const speaker = ChatMessage.getSpeaker({
                actor: combatant.actor,
                token: combatant.token,
                alias: combatant.name
            });

            const multiroll = new RollBundle(localize("InitiativeRoll"));
            multiroll.addRoll(roll, { name: "1d10" });

            // Execute with our custom template (this creates the chat message)
            await multiroll.execute(speaker, "systems/cyberpunk/templates/chat/initiative.hbs", {
                refValue: combatant.actor.system?.stats?.ref?.total ?? 0
            });
        }

        // Update combatant initiatives
        if (updates.length) {
            await this.updateEmbeddedDocuments("Combatant", updates);
        }

        // Update turn order if needed
        if (updateTurn && this.combatant?.id && combatantIds.includes(this.combatant.id)) {
            await this.update({turn: this.turns.findIndex(t => t.id === this.combatant.id)});
        }

        return this;
    }
}
