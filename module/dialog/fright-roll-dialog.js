import { localize } from "../utils.js";
import { NumberInput } from "./number-input.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Fright Roll Dialog — COOL check against a difficulty with familiarity and luck modifiers.
 * @extends {ApplicationV2}
 */
export class FrightRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor) {
    super({});
    this.actor = actor;
    this._difficulty = 15;
    this._familiarity = 0;
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ??
                          actor.system.stats.luck?.total ?? 0;
  }

  static DEFAULT_OPTIONS = {
    id: "fright-roll-dialog",
    classes: ["cyberpunk", "fright-roll-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:      FrightRollDialog._onCloseDialog,
      familiarityPlus:  FrightRollDialog._onFamiliarityPlus,
      familiarityMinus: FrightRollDialog._onFamiliarityMinus,
      luckPlus:         FrightRollDialog._onLuckPlus,
      luckMinus:        FrightRollDialog._onLuckMinus,
      roll:             FrightRollDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/fright-roll.hbs" }
  };

  get title() { return localize("FrightRoll"); }

  static _onCloseDialog(event, _target) { event?.preventDefault?.(); this.close({ animate: false }); }

  static _onFamiliarityPlus(event, _target) {
    event?.preventDefault?.();
    if (this._familiarity < 10) { this._familiarity++; this._updateFamiliarityDisplay(); }
  }

  static _onFamiliarityMinus(event, _target) {
    event?.preventDefault?.();
    if (this._familiarity > 0) { this._familiarity--; this._updateFamiliarityDisplay(); }
  }

  static _onLuckPlus(event, _target) {
    event?.preventDefault?.();
    if (this._luckToSpend < this._availableLuck) { this._luckToSpend++; this._updateLuckDisplay(); }
  }

  static _onLuckMinus(event, _target) {
    event?.preventDefault?.();
    if (this._luckToSpend > 0) { this._luckToSpend--; this._updateLuckDisplay(); }
  }

  static _onRoll(event, _target) { event?.preventDefault?.(); this._executeRoll(); }

  async _prepareContext(_options) {
    return {
      difficulty: this._difficulty,
      luckToSpend: this._luckToSpend,
      availableLuck: this._availableLuck,
      canIncreaseLuck: this._luckToSpend < this._availableLuck,
      canDecreaseLuck: this._luckToSpend > 0,
      hasAnyLuck: this._availableLuck > 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    // NumberInput stepper for difficulty
    const $el = $(this.element);
    this._difficultyInput = new NumberInput($el, '.difficulty-input-wrap', {
      min: 10, max: 40, step: 5, value: this._difficulty,
      onChange: (v) => { this._difficulty = v; }
    });
  }

  _updateFamiliarityDisplay() {
    const val = this.element.querySelector('.familiarity-value');
    if (val) val.textContent = this._familiarity;
    const minusDisabled = this._familiarity <= 0;
    const plusDisabled = this._familiarity >= 10;
    const minusBtn = this.element.querySelector('.familiarity-minus-btn');
    const plusBtn = this.element.querySelector('.familiarity-plus-btn');
    minusBtn?.classList.toggle('disabled', minusDisabled);
    plusBtn?.classList.toggle('disabled', plusDisabled);
    minusBtn?.querySelector('img')?.setAttribute('src',
      `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    plusBtn?.querySelector('img')?.setAttribute('src',
      `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  _updateLuckDisplay() {
    // Skip .familiarity-value when updating luck text
    this.element.querySelectorAll('.luck-value').forEach(el => {
      if (!el.classList.contains('familiarity-value')) el.textContent = this._luckToSpend;
    });
    const minusDisabled = this._luckToSpend <= 0;
    const plusDisabled = this._luckToSpend >= this._availableLuck;
    const minusBtn = this.element.querySelector('.luck-minus-btn');
    const plusBtn = this.element.querySelector('.luck-plus-btn');
    minusBtn?.classList.toggle('disabled', minusDisabled);
    plusBtn?.classList.toggle('disabled', plusDisabled);
    minusBtn?.querySelector('img')?.setAttribute('src',
      `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    plusBtn?.querySelector('img')?.setAttribute('src',
      `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  async _executeRoll() {
    const extraMod = this._familiarity + this._luckToSpend;
    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }
    this.close({ animate: false });
    this.actor.rollFrightCheck(this._difficulty, extraMod);
    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, "fright roll");
  }
}
