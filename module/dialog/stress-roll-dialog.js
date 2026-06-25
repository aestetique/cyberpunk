import { localize } from "../utils.js";
import { processFormulaRoll } from "../dice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Stress Roll Dialog — select stress severity and roll to add stress points.
 * @extends {ApplicationV2}
 */
export class StressRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @param {Actor} actor */
  constructor(actor) {
    super({});
    this.actor = actor;
    this._dropdownOpen = false;
    this._selectedSeverity = {
      key: "minorNuisance",
      formula: "1",
      label: localize("SeverityMinorNuisance")
    };
  }

  static DEFAULT_OPTIONS = {
    id: "stress-roll-dialog",
    classes: ["cyberpunk", "stress-roll-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:    StressRollDialog._onCloseDialog,
      toggleDropdown: StressRollDialog._onToggleDropdown,
      pickSeverity:   StressRollDialog._onPickSeverity,
      roll:           StressRollDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/stress-roll.hbs" }
  };

  get title() { return localize("StressRoll"); }

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onToggleDropdown(event, _target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this._dropdownOpen = !this._dropdownOpen;
    this.element.querySelector('.range-dropdown-list')?.classList.toggle('open', this._dropdownOpen);
    this.element.querySelector('.range-dropdown-btn')?.classList.toggle('open', this._dropdownOpen);
  }

  static _onPickSeverity(event, target) {
    event?.preventDefault?.();
    const key = target?.dataset?.severity;
    const formula = target?.dataset?.formula;
    const label = target?.textContent.trim();

    this._selectedSeverity = { key, formula, label };
    this._dropdownOpen = false;

    const labelEl = this.element.querySelector('.range-dropdown-btn .range-label');
    if (labelEl) labelEl.textContent = label;
    this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
    this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
    this.element.querySelectorAll('.range-option').forEach(el => el.classList.remove('selected'));
    target.classList.add('selected');
  }

  static _onRoll(event, _target) {
    event?.preventDefault?.();
    this._executeRoll();
  }

  async _prepareContext(_options) {
    const severityOptions = [
      { key: "minorNuisance",  formula: "1",   label: localize("SeverityMinorNuisance") },
      { key: "nuisance",       formula: "1d2", label: localize("SeverityNuisance") },
      { key: "majorNuisance",  formula: "1d3", label: localize("SeverityMajorNuisance") },
      { key: "annoyance",      formula: "1d6", label: localize("SeverityAnnoyance") },
      { key: "unsettling",     formula: "2d6", label: localize("SeverityUnsettling") },
      { key: "veryDisturbing", formula: "3d6", label: localize("SeverityVeryDisturbing") },
      { key: "lifeShattering", formula: "4d6", label: localize("SeverityLifeShattering") }
    ];
    severityOptions.forEach(opt => { opt.selected = opt.key === this._selectedSeverity.key; });
    return {
      severityOptions,
      selectedSeverityLabel: this._selectedSeverity.label
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    // Close dropdown when clicking outside
    $(document).off('click.stressRollDropdown');
    $(document).on('click.stressRollDropdown', (ev) => {
      if (!$(ev.target).closest('.range-dropdown').length) {
        this._dropdownOpen = false;
        this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
        this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
      }
    });
  }

  async _executeRoll() {
    const formula = this._selectedSeverity.formula;
    const roll = new Roll(formula);
    await roll.evaluate();

    const currentStress = this.actor.system.stress || 0;
    await this.actor.update({ "system.stress": currentStress + roll.total });

    const templateData = processFormulaRoll(roll);
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/cyberpunk/templates/chat/stress-roll.hbs",
      templateData
    );
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    });

    this.close({ animate: false });
  }

  async close(options) {
    $(document).off('click.stressRollDropdown');
    return super.close(options);
  }
}
