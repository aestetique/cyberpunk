import { localize } from "../utils.js";

// Stay Awake: fatigue makes it harder, stress/insomnia makes it easier
const STAY_AWAKE_FATIGUE_PENALTIES = { 2: -1, 3: -2, 4: -4, 5: -8 };
const STAY_AWAKE_STRESS_BONUSES = { 2: 2, 3: 4, 4: 6 };

// Fall Asleep: stress makes it harder, fatigue makes it easier
const FALL_ASLEEP_STRESS_PENALTIES = { 2: -2, 3: -4, 4: -6 };
const FALL_ASLEEP_FATIGUE_BONUSES = { 2: 1, 3: 2, 4: 4, 5: 8 };

/**
 * Sleep Roll Dialog — roll to Stay Awake or Fall Asleep.
 * Stay Awake: 1d10 + INT vs INT DV, fatigue penalties.
 * Fall Asleep: 1d10 + INT vs INT DV, stress penalties (only when Insomnia).
 */
export class SleepRollDialog extends Application {

  /**
   * @param {Actor} actor  The owning actor
   * @param {string} mode  "stayAwake" or "fallAsleep"
   */
  constructor(actor, mode) {
    super();
    this.actor = actor;
    this.mode = mode;

    // Condition toggles
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
      id: "sleep-roll-dialog",
      classes: ["cyberpunk", "skill-roll-dialog"],
      template: "systems/cyberpunk/templates/dialog/sleep-roll.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return this.mode === "stayAwake" ? localize("StayAwake") : localize("FallAsleep");
  }

  /**
   * Get the combined situational modifier based on mode.
   * Each roll has penalties from one condition and bonuses from the opposite.
   */
  _getSituationalMod() {
    const fatigueLevel = this.actor.getFatigueLevel();
    const stressLevel = this.actor.getStressLevel();

    if (this.mode === "stayAwake") {
      // Fatigue makes it harder, stress makes it easier
      return (STAY_AWAKE_FATIGUE_PENALTIES[fatigueLevel] || 0) +
             (STAY_AWAKE_STRESS_BONUSES[stressLevel] || 0);
    } else {
      // Stress makes it harder, fatigue makes it easier
      return (FALL_ASLEEP_STRESS_PENALTIES[stressLevel] || 0) +
             (FALL_ASLEEP_FATIGUE_BONUSES[fatigueLevel] || 0);
    }
  }

  /** @override */
  getData() {
    const isStayAwake = this.mode === "stayAwake";
    const title = isStayAwake ? localize("StayAwake") : localize("FallAsleep");
    const chatIcon = isStayAwake ? "awake" : "sleep";
    const dv = this.actor.system.stats.int.total;
    return {
      title,
      chatIcon,
      dv,
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
    const situationalMod = this._getSituationalMod();
    const extraMod = conditionMod + this._luckToSpend + situationalMod;

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
    await this.actor.rollSleepCheck(this.mode, extraMod);
  }
}
