import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Heal Dialog — lets a player heal wounds via First Aid or Medical Tech,
 * or take 2 wounds if no treatment is selected.
 * @extends {ApplicationV2}
 */
export class HealDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @param {Actor} actor */
  constructor(actor) {
    super({});
    this.actor = actor;
    // Radio-style condition: null | "firstAid" | "medTech"
    this._selectedCondition = null;
  }

  static DEFAULT_OPTIONS = {
    id: "heal-dialog",
    classes: ["cyberpunk", "heal-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:    HealDialog._onCloseDialog,
      toggleCondition: HealDialog._onToggleCondition,
      execute:        HealDialog._onExecute
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/heal.hbs" }
  };

  get title() { return localize("Heal"); }

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onToggleCondition(event, target) {
    event?.preventDefault?.();
    const condition = target?.dataset?.condition;
    if (!condition) return;

    if (this._selectedCondition === condition) {
      this._selectedCondition = null;
      target.classList.remove('selected');
    } else {
      this._selectedCondition = condition;
      this.element.querySelectorAll('.condition-btn').forEach(b => b.classList.remove('selected'));
      target.classList.add('selected');
    }
    const action = this._computeAction();
    const actionBtn = this.element.querySelector('.action-btn');
    if (actionBtn) actionBtn.textContent = action.label;
  }

  static _onExecute(event, _target) {
    event?.preventDefault?.();
    this._executeAction();
  }

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
    return { label: `${localize("Take")} 2 ${localize("Wounds").toLowerCase()}`, amount: 2, isHeal: false };
  }

  async _prepareContext(_options) {
    return { actionLabel: this._computeAction().label };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
  }

  async _executeAction() {
    const currentDamage = this.actor.system.damage || 0;
    const action = this._computeAction();
    let newDamage = action.isHeal ? currentDamage - action.amount : currentDamage + action.amount;
    newDamage = Math.max(0, Math.min(40, newDamage));
    await this.actor.update({ "system.damage": newDamage });
    this.close({ animate: false });
  }
}
