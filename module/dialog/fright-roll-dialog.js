import { localize } from "../utils.js";

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
    this._dropdownOpen = false;

    // Default difficulty: Average / 15
    this._selectedDifficulty = {
      key: "average",
      value: 15,
      label: localize("DifficultyAverage")
    };

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
    const difficultyOptions = [
      { key: "easy", value: 10, label: localize("DifficultyEasy") },
      { key: "average", value: 15, label: localize("DifficultyAverage") },
      { key: "difficult", value: 20, label: localize("DifficultyDifficult") },
      { key: "veryDifficult", value: 25, label: localize("DifficultyVeryDifficult") },
      { key: "nearlyImpossible", value: 30, label: localize("DifficultyNearlyImpossible") },
      { key: "impossible", value: 40, label: localize("DifficultyImpossible") }
    ];

    difficultyOptions.forEach(opt => {
      opt.selected = opt.key === this._selectedDifficulty.key;
    });

    return {
      difficultyOptions,
      selectedDifficultyLabel: this._selectedDifficulty.label,
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

    // Difficulty dropdown toggle
    html.find('.range-dropdown-btn').click(ev => {
      ev.stopPropagation();
      this._dropdownOpen = !this._dropdownOpen;
      html.find('.range-dropdown-list').toggleClass('open', this._dropdownOpen);
      html.find('.range-dropdown-btn').toggleClass('open', this._dropdownOpen);
    });

    // Difficulty option selection
    html.find('.range-option').click(ev => {
      const key = ev.currentTarget.dataset.difficulty;
      const value = Number(ev.currentTarget.dataset.value);
      const label = ev.currentTarget.textContent.trim();

      this._selectedDifficulty = { key, value, label };
      this._dropdownOpen = false;

      html.find('.range-dropdown-btn .range-label').text(label);
      html.find('.range-dropdown-list').removeClass('open');
      html.find('.range-dropdown-btn').removeClass('open');

      html.find('.range-option').removeClass('selected');
      ev.currentTarget.classList.add('selected');
    });

    // Close dropdown when clicking outside
    $(document).on('click.frightRollDropdown', (ev) => {
      if (!$(ev.target).closest('.range-dropdown').length) {
        this._dropdownOpen = false;
        html.find('.range-dropdown-list').removeClass('open');
        html.find('.range-dropdown-btn').removeClass('open');
      }
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
      this._selectedDifficulty.value,
      extraMod
    );

    // Register action
    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, "fright roll");
  }

  /** @override */
  close(options) {
    $(document).off('click.frightRollDropdown');
    return super.close(options);
  }
}
