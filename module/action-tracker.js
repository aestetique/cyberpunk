/**
 * Action Surge Tracking System
 * Automatically tracks actions taken during combat and applies Action Surge condition
 * when an actor takes a second action in their turn.
 */

/**
 * Register an action taken by an actor and apply Action Surge if needed
 * @param {Actor} actor - The actor performing the action
 * @param {string} actionType - Type of action (for debugging/logging)
 * @returns {Promise<boolean>} True if action surge was applied
 */
export async function registerAction(actor, actionType = "action") {
  // Only track actions during combat
  if (!game.combat) return false;

  // Only track for the current combatant's actor
  const currentCombatant = game.combat.combatant;
  if (!currentCombatant || currentCombatant.actorId !== actor.id) return false;

  // Get current action count for this turn
  const actionCount = actor.getFlag("cyberpunk", "actionCount") || 0;

  // Increment action count FIRST
  const newActionCount = actionCount + 1;
  await actor.setFlag("cyberpunk", "actionCount", newActionCount);

  // Apply Action Surge after free actions are used up
  // Bonus actions from items (e.g. Sandevistan) increase the number of free actions
  const bonusActions = actor.system.bonusActions || 0;
  const threshold = 1 + bonusActions;
  if (newActionCount === threshold && !actor.statuses.has("action-surge")) {
    await actor.toggleStatusEffect("action-surge", { active: true });
  }

  return newActionCount > 1;
}

/**
 * Spend a NET Action. Tracks usage when an active combat exists and the actor has a
 * NET Actions pool (Interface skill mapped, rank ≥ 1). Outside combat or for non-netrunners,
 * the action passes through with no charge. Independent of Meat Action economy.
 * @param {Actor} actor - The actor performing the NET action
 * @param {string} actionType - Label for the action (used in the blocking notification)
 * @returns {Promise<boolean>} True if the action may proceed, false if blocked (no actions left).
 */
export async function spendNetAction(actor, actionType = "NET action") {
  if (!game.combat) return true;

  const na = actor.system.netActions;
  if (!na) return true;

  if (na.available <= 0) {
    ui.notifications.warn(`No NET Actions left this turn — cannot ${actionType}.`);
    return false;
  }

  await actor.setFlag("cyberpunk", "netActionsUsed", na.used + 1);
  return true;
}
