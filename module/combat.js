import { Multiroll } from "./dice.js";
import { localize } from "./utils.js";

/**
 * Extend the base Combat to customize initiative roll rendering
 * Uses the Multiroll system with initiative.hbs template for styled chat messages
 */
export class CyberpunkCombat extends Combat {

    /**
     * Override rollInitiative to use our custom chat template
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

            // Use the provided formula or the system's initiative formula from system.json
            const rollFormula = formula ?? game.system.initiative;
            const roll = await new Roll(rollFormula, combatant.actor.getRollData()).evaluate();

            // Store the initiative value
            updates.push({_id: combatant.id, initiative: roll.total});

            // Create chat message using our Multiroll system
            const speaker = ChatMessage.getSpeaker({
                actor: combatant.actor,
                token: combatant.token,
                alias: combatant.name
            });

            const multiroll = new Multiroll(localize("InitiativeRoll"));
            multiroll.addRoll(roll, { name: "1d10" });

            // Execute with our custom template (this creates the chat message)
            await multiroll.execute(speaker, "systems/cp2020/templates/chat/initiative.hbs", {
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
