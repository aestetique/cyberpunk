import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const STAY_AWAKE_FATIGUE_PENALTIES = { 2: -1, 3: -2, 4: -4, 5: -8 };
const STAY_AWAKE_STRESS_BONUSES = { 2: 2, 3: 4, 4: 6 };
const FALL_ASLEEP_STRESS_PENALTIES = { 2: -2, 3: -4, 4: -6 };
const FALL_ASLEEP_FATIGUE_BONUSES = { 2: 1, 3: 2, 4: 4, 5: 8 };

/**
 * Sleep Roll Dialog — roll to Stay Awake or Fall Asleep.
 * @extends {ApplicationV2}
 */
export class SleepRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, mode) {
    super({});
    this.actor = actor;
    this.mode = mode;
    this._conditions = { prepared: false, distracted: false };
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ??
                          actor.system.stats.luck?.total ?? 0;
  }

  static DEFAULT_OPTIONS = {
    id: "sleep-roll-dialog",
    classes: ["cyberpunk", "skill-roll-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:    SleepRollDialog._onCloseDialog,
      toggleCondition: SleepRollDialog._onToggleCondition,
      luckPlus:       SleepRollDialog._onLuckPlus,
      luckMinus:      SleepRollDialog._onLuckMinus,
      roll:           SleepRollDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/sleep-roll.hbs" }
  };

  get title() { return this.mode === "stayAwake" ? localize("StayAwake") : localize("FallAsleep"); }

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onToggleCondition(event, target) {
    event?.preventDefault?.();
    const condition = target?.dataset?.condition;
    if (!condition) return;
    this._conditions[condition] = !this._conditions[condition];
    target.classList.toggle('selected', this._conditions[condition]);
  }

  static _onLuckPlus(event, _target) {
    event?.preventDefault?.();
    if (this._luckToSpend < this._availableLuck) {
      this._luckToSpend++;
      this._updateLuckDisplay();
    }
  }

  static _onLuckMinus(event, _target) {
    event?.preventDefault?.();
    if (this._luckToSpend > 0) {
      this._luckToSpend--;
      this._updateLuckDisplay();
    }
  }

  static _onRoll(event, _target) {
    event?.preventDefault?.();
    this._executeRoll();
  }

  _getSituationalMod() {
    const fatigueLevel = this.actor.getFatigueLevel();
    const stressLevel = this.actor.getStressLevel();
    if (this.mode === "stayAwake") {
      return (STAY_AWAKE_FATIGUE_PENALTIES[fatigueLevel] || 0) +
             (STAY_AWAKE_STRESS_BONUSES[stressLevel] || 0);
    } else {
      return (FALL_ASLEEP_STRESS_PENALTIES[stressLevel] || 0) +
             (FALL_ASLEEP_FATIGUE_BONUSES[fatigueLevel] || 0);
    }
  }

  async _prepareContext(_options) {
    const isStayAwake = this.mode === "stayAwake";
    return {
      title: isStayAwake ? localize("StayAwake") : localize("FallAsleep"),
      chatIcon: isStayAwake ? "awake" : "sleep",
      dv: this.actor.system.stats.int.total,
      conditions: this._conditions,
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
  }

  _updateLuckDisplay() {
    const luckVal = this.element.querySelector('.luck-value');
    if (luckVal) luckVal.textContent = this._luckToSpend;
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
    const conditionMod = (this._conditions.prepared ? 2 : 0) +
                         (this._conditions.distracted ? -2 : 0);
    const situationalMod = this._getSituationalMod();
    const extraMod = conditionMod + this._luckToSpend + situationalMod;

    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    this.close({ animate: false });
    await this.actor.rollSleepCheck(this.mode, extraMod);
  }
}
