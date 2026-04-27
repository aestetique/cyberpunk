import { localize } from "../utils.js";
import { NumberInput } from "./number-input.js";

/**
 * Fright Roll Dialog — COOL check against a difficulty with familiarity and luck modifiers.
 * On failure, (difficulty − result) is added as fright points.
 */
export class FrightRollDialog extends Application {

  /**
   * @param {Actor} actor  The actor making the fright check
   */
  constructor(actor) {
    super();
    this.actor = actor;

    // Default difficulty: 15 (clamped 10-40 by the NumberInput)
    this._difficulty = 15;

    // Familiarity (0–10)
    this._familiarity = 0;

    // Luck spending
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ??
                          actor.system.stats.luck?.total ?? 0;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "fright-roll-dialog",
      classes: ["cyberpunk", "fright-roll-dialog"],
      template: "systems/cyberpunk/templates/dialog/fright-roll.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return localize("FrightRoll");
  }

  /** @override */
  getData() {
    return {
      difficulty: this._difficulty,
      luckToSpend: this._luckToSpend,
      availableLuck: this._availableLuck,
      canIncreaseLuck: this._luckToSpend < this._availableLuck,
      canDecreaseLuck: this._luckToSpend > 0,
      hasAnyLuck: this._availableLuck > 0
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

    // Difficulty number-input stepper
    this._difficultyInput = new NumberInput(html, '.difficulty-input-wrap', {
      min: 10, max: 40, step: 5, value: this._difficulty,
      onChange: (v) => { this._difficulty = v; }
    });

    // Familiarity plus button
    html.find('.familiarity-plus-btn').click(() => {
      if (this._familiarity < 10) {
        this._familiarity++;
        this._updateFamiliarityDisplay(html);
      }
    });

    // Familiarity minus button
    html.find('.familiarity-minus-btn').click(() => {
      if (this._familiarity > 0) {
        this._familiarity--;
        this._updateFamiliarityDisplay(html);
      }
    });

    // Luck plus button
    html.find('.luck-plus-btn').click(() => {
      if (this._luckToSpend < this._availableLuck) {
        this._luckToSpend++;
        this._updateLuckDisplay(html);
      }
    });

    // Luck minus button
    html.find('.luck-minus-btn').click(() => {
      if (this._luckToSpend > 0) {
        this._luckToSpend--;
        this._updateLuckDisplay(html);
      }
    });

    // Roll button
    html.find('.roll-btn').click(() => {
      this._executeRoll();
    });
  }

  /**
   * Update the familiarity display and button states
   */
  _updateFamiliarityDisplay(html) {
    html.find('.familiarity-value').text(this._familiarity);

    const minusDisabled = this._familiarity <= 0;
    const plusDisabled = this._familiarity >= 10;

    html.find('.familiarity-minus-btn').toggleClass('disabled', minusDisabled);
    html.find('.familiarity-plus-btn').toggleClass('disabled', plusDisabled);

    html.find('.familiarity-minus-btn img').attr('src',
      `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    html.find('.familiarity-plus-btn img').attr('src',
      `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  /**
   * Update the luck display and button states
   */
  _updateLuckDisplay(html) {
    html.find('.luck-value').not('.familiarity-value').text(this._luckToSpend);

    const minusDisabled = this._luckToSpend <= 0;
    const plusDisabled = this._luckToSpend >= this._availableLuck;

    html.find('.luck-minus-btn').toggleClass('disabled', minusDisabled);
    html.find('.luck-plus-btn').toggleClass('disabled', plusDisabled);

    html.find('.luck-minus-btn img').attr('src',
      `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    html.find('.luck-plus-btn img').attr('src',
      `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  /**
   * Execute the fright roll
   */
  async _executeRoll() {
    const extraMod = this._familiarity + this._luckToSpend;

    // Spend luck if any was used
    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    this.close();

    // Perform the COOL check via actor method
    this.actor.rollFrightCheck(
      this._difficulty,
      extraMod
    );

    // Register action
    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, "fright roll");
  }

  /** @override */
  close(options) {
    return super.close(options);
  }
}
