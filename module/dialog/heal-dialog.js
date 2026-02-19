import { localize } from "../utils.js";

/**
 * Heal Dialog — lets a player heal wounds via First Aid or Medical Tech,
 * or take 2 wounds if no treatment is selected.
 */
export class HealDialog extends Application {

  /**
   * @param {Actor} actor  The actor being healed
   */
  constructor(actor) {
    super();
    this.actor = actor;

    // Radio-style condition: null | "firstAid" | "medTech"
    this._selectedCondition = null;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "heal-dialog",
      classes: ["cyberpunk", "heal-dialog"],
      template: "systems/cyberpunk/templates/dialog/heal.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return localize("Heal");
  }

  /**
   * Compute the heal/damage amount based on the current selection.
   * @returns {{ label: string, amount: number, isHeal: boolean }}
   */
  _computeAction() {
    const boost = this.actor.system.healingRateBoost || 0;

    if (this._selectedCondition === "firstAid") {
      const amount = 0.5 + boost;
      return { label: `${localize("Heal")} ${amount} ${localize("Wounds").toLowerCase()}`, amount, isHeal: true };
    }
    if (this._selectedCondition === "medTech") {
      const amount = 1 + boost;
      return { label: `${localize("Heal")} ${amount} ${localize("Wounds").toLowerCase()}`, amount, isHeal: true };
    }
    // No selection — take 2 wounds
    return { label: `${localize("Take")} 2 ${localize("Wounds").toLowerCase()}`, amount: 2, isHeal: false };
  }

  /** @override */
  getData() {
    const action = this._computeAction();
    return {
      actionLabel: action.label
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Make header draggable
    const header = html.find('.reload-header')[0];
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, html, header, false);
    }

    // Close button
    html.find('.header-control.close').click(() => this.close());

    // Condition buttons (radio-style: one or none selected)
    html.find('.condition-btn').click(ev => {
      const btn = ev.currentTarget;
      const condition = btn.dataset.condition;

      if (this._selectedCondition === condition) {
        // Deselect
        this._selectedCondition = null;
        btn.classList.remove('selected');
      } else {
        // Select this one, deselect the other
        this._selectedCondition = condition;
        html.find('.condition-btn').removeClass('selected');
        btn.classList.add('selected');
      }

      // Update the action button text
      const action = this._computeAction();
      html.find('.action-btn').text(action.label);
    });

    // Action button
    html.find('.action-btn').click(() => {
      this._executeAction();
    });
  }

  /**
   * Execute the heal/damage action.
   */
  async _executeAction() {
    const currentDamage = this.actor.system.damage || 0;
    const action = this._computeAction();

    let newDamage;
    if (action.isHeal) {
      newDamage = currentDamage - action.amount;
    } else {
      newDamage = currentDamage + action.amount;
    }

    // Clamp to [0, 40]
    newDamage = Math.max(0, Math.min(40, newDamage));

    await this.actor.update({ "system.damage": newDamage });
    this.close();
  }
}
