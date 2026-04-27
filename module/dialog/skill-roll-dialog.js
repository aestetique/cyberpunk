import { localize } from "../utils.js";
import { NumberInput } from "./number-input.js";

/**
 * Skill/Attribute Roll Dialog — select difficulty and modifiers before rolling.
 */
export class SkillRollDialog extends Application {

  /**
   * @param {Actor} actor        The owning actor
   * @param {Object} options     Configuration options
   * @param {string} options.rollType - "skill" or "stat"
   * @param {string} options.skillId  - Skill item ID (for skill rolls)
   * @param {string} options.statName - Stat key (for stat rolls)
   * @param {string} options.title    - Display title for the dialog header
   * @param {string} options.statIcon - Icon key for the section bar
   */
  constructor(actor, options = {}) {
    super();
    this.actor = actor;
    this.rollType = options.rollType || "skill";
    this.skillId = options.skillId || null;
    this.statName = options.statName || null;
    this._dialogTitle = options.title || localize("Skill");
    this.statIcon = options.statIcon || null;

    // Difficulty selection (default: 15, clamped 10-40 by the NumberInput)
    this._difficulty = 15;

    // Condition toggles (only Prepared and Distracted)
    this._conditions = {
      prepared: false,
      distracted: false
    };

    // Luck spending
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ??
                          actor.system.stats.luck?.total ?? 0;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "skill-roll-dialog",
      classes: ["cyberpunk", "skill-roll-dialog"],
      template: "systems/cyberpunk/templates/dialog/skill-roll.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return this._dialogTitle;
  }

  /** @override */
  getData() {
    return {
      title: this._dialogTitle,
      statIcon: this.statIcon,
      difficulty: this._difficulty,
      conditions: this._conditions,
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

    // Condition button toggles
    html.find('.condition-btn').click(ev => {
      const btn = ev.currentTarget;
      const condition = btn.dataset.condition;
      this._conditions[condition] = !this._conditions[condition];
      btn.classList.toggle('selected', this._conditions[condition]);
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
   * Update the luck display and button states
   * @param {jQuery} html - The dialog HTML element
   */
  _updateLuckDisplay(html) {
    html.find('.luck-value').text(this._luckToSpend);

    const minusDisabled = this._luckToSpend <= 0;
    const plusDisabled = this._luckToSpend >= this._availableLuck;

    html.find('.luck-minus-btn').toggleClass('disabled', minusDisabled);
    html.find('.luck-plus-btn').toggleClass('disabled', plusDisabled);

    // Swap icons based on disabled state
    html.find('.luck-minus-btn img').attr('src',
      `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    html.find('.luck-plus-btn img').attr('src',
      `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  /**
   * Execute roll with selected options
   */
  async _executeRoll() {
    // Calculate condition modifiers
    const conditionMod = (this._conditions.prepared ? 2 : 0) +
                         (this._conditions.distracted ? -2 : 0);
    const extraMod = conditionMod + this._luckToSpend;

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

    // Perform the roll via actor method
    if (this.rollType === "skill") {
      this.actor.rollSkillCheck(
        this.skillId,
        this._difficulty,
        extraMod
      );
    } else {
      this.actor.rollStatCheck(
        this.statName,
        this._difficulty,
        extraMod
      );
    }

    // Register action AFTER executing
    const { registerAction } = await import("../action-tracker.js");
    const actionType = this.rollType === "skill" ? "skill roll" : "stat roll";
    await registerAction(this.actor, actionType);
  }

  /** @override */
  close(options) {
    return super.close(options);
  }
}
