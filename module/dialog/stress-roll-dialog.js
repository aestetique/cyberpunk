import { localize } from "../utils.js";
import { processFormulaRoll } from "../dice.js";

/**
 * Stress Roll Dialog — select stress severity and roll to add stress points.
 */
export class StressRollDialog extends Application {

  /**
   * @param {Actor} actor  The actor receiving stress
   */
  constructor(actor) {
    super();
    this.actor = actor;
    this._dropdownOpen = false;

    // Default selection: first option
    this._selectedSeverity = {
      key: "minorNuisance",
      formula: "1",
      label: localize("SeverityMinorNuisance")
    };
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "stress-roll-dialog",
      classes: ["cyberpunk", "stress-roll-dialog"],
      template: "systems/cyberpunk/templates/dialog/stress-roll.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return localize("StressRoll");
  }

  /** @override */
  getData() {
    const severityOptions = [
      { key: "minorNuisance",  formula: "1",   label: localize("SeverityMinorNuisance") },
      { key: "nuisance",       formula: "1d2", label: localize("SeverityNuisance") },
      { key: "majorNuisance",  formula: "1d3", label: localize("SeverityMajorNuisance") },
      { key: "annoyance",      formula: "1d6", label: localize("SeverityAnnoyance") },
      { key: "unsettling",     formula: "2d6", label: localize("SeverityUnsettling") },
      { key: "veryDisturbing", formula: "3d6", label: localize("SeverityVeryDisturbing") },
      { key: "lifeShattering", formula: "4d6", label: localize("SeverityLifeShattering") }
    ];

    severityOptions.forEach(opt => {
      opt.selected = opt.key === this._selectedSeverity.key;
    });

    return {
      severityOptions,
      selectedSeverityLabel: this._selectedSeverity.label
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

    // Severity dropdown toggle
    html.find('.range-dropdown-btn').click(ev => {
      ev.stopPropagation();
      this._dropdownOpen = !this._dropdownOpen;
      html.find('.range-dropdown-list').toggleClass('open', this._dropdownOpen);
      html.find('.range-dropdown-btn').toggleClass('open', this._dropdownOpen);
    });

    // Severity option selection
    html.find('.range-option').click(ev => {
      const key = ev.currentTarget.dataset.severity;
      const formula = ev.currentTarget.dataset.formula;
      const label = ev.currentTarget.textContent.trim();

      this._selectedSeverity = { key, formula, label };
      this._dropdownOpen = false;

      // Update display
      html.find('.range-dropdown-btn .range-label').text(label);
      html.find('.range-dropdown-list').removeClass('open');
      html.find('.range-dropdown-btn').removeClass('open');

      // Update visual selection
      html.find('.range-option').removeClass('selected');
      ev.currentTarget.classList.add('selected');
    });

    // Close dropdown when clicking outside
    $(document).on('click.stressRollDropdown', (ev) => {
      if (!$(ev.target).closest('.range-dropdown').length) {
        this._dropdownOpen = false;
        html.find('.range-dropdown-list').removeClass('open');
        html.find('.range-dropdown-btn').removeClass('open');
      }
    });

    // Roll button
    html.find('.roll-btn').click(() => {
      this._executeRoll();
    });
  }

  /**
   * Execute the stress roll, update actor, and post chat message.
   */
  async _executeRoll() {
    const formula = this._selectedSeverity.formula;
    const roll = new Roll(formula);
    await roll.evaluate();

    // Add result to current stress
    const currentStress = this.actor.system.stress || 0;
    await this.actor.update({
      "system.stress": currentStress + roll.total
    });

    // Build chat message using formula-roll pattern
    const templateData = processFormulaRoll(roll);
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/cyberpunk/templates/chat/stress-roll.hbs",
      templateData
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: content,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    });

    this.close();
  }

  /** @override */
  close(options) {
    $(document).off('click.stressRollDropdown');
    return super.close(options);
  }
}
