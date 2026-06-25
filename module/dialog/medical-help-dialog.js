import { localize } from "../utils.js";
import { getSkillsForCategory } from "../lookups.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Medical Help Roll Dialog — helper rolls a medical skill against the wounded actor's wound count.
 * @extends {ApplicationV2}
 */
export class MedicalHelpDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, woundedActorId) {
    super({});
    this.actor = actor;
    this.woundedActorId = woundedActorId;
    this._dropdownOpen = false;
    this._selectedSkill = null;
    this._selectedCondition = null;
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ?? actor.system.stats.luck?.total ?? 0;

    this._skillOptions = this._buildSkillOptions();
    if (this._skillOptions.length > 0) this._selectedSkill = this._skillOptions[0];
  }

  static DEFAULT_OPTIONS = {
    id: "medical-help-dialog",
    classes: ["cyberpunk", "medical-help-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:     MedicalHelpDialog._onCloseDialog,
      toggleDropdown:  MedicalHelpDialog._onToggleDropdown,
      pickSkill:       MedicalHelpDialog._onPickSkill,
      toggleCondition: MedicalHelpDialog._onToggleCondition,
      luckPlus:        MedicalHelpDialog._onLuckPlus,
      luckMinus:       MedicalHelpDialog._onLuckMinus,
      roll:            MedicalHelpDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/medical-help.hbs" }
  };

  get title() { return localize("HelpRoll"); }

  static _onCloseDialog(event, _target) { event?.preventDefault?.(); this.close({ animate: false }); }

  static _onToggleDropdown(event, _target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this._dropdownOpen = !this._dropdownOpen;
    this.element.querySelector('.range-dropdown-list')?.classList.toggle('open', this._dropdownOpen);
    this.element.querySelector('.range-dropdown-btn')?.classList.toggle('open', this._dropdownOpen);
  }

  static _onPickSkill(event, target) {
    event?.preventDefault?.();
    const skillId = target.dataset.skillId;
    const selected = this._skillOptions.find(s => s.id === skillId);
    if (!selected) return;
    this._selectedSkill = selected;
    this._dropdownOpen = false;
    const labelEl = this.element.querySelector('.range-dropdown-btn .range-label');
    if (labelEl) labelEl.textContent = selected.label;
    this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
    this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
    this.element.querySelectorAll('.range-option').forEach(el => el.classList.remove('selected'));
    target.classList.add('selected');
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

  _buildSkillOptions() {
    const mappedNames = new Set();
    for (const name of getSkillsForCategory("stabilisationSkills")) mappedNames.add(name);
    const options = [];
    for (const skillName of mappedNames) {
      const skill = this.actor.itemTypes.skill.find(s => s.name === skillName);
      if (!skill) continue;
      const skillValue = this.actor.resolveSkillTotal(skillName);
      if (skillValue <= 0) continue;
      options.push({
        id: skill.id,
        name: skill.name,
        stat: skill.system.stat,
        value: skillValue,
        label: `${skill.name} +${skillValue}`
      });
    }
    return options;
  }

  async _prepareContext(_options) {
    const hasSkills = this._skillOptions.length > 0;
    return {
      skills: this._skillOptions,
      hasSkills,
      selectedSkillLabel: this._selectedSkill?.label || localize("NoSkillsBonus"),
      noSkillsLabel: localize("NoSkillsBonus"),
      selectedCondition: this._selectedCondition,
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
    $(document).off('click.medicalHelpDropdown');
    $(document).on('click.medicalHelpDropdown', (ev) => {
      if (!$(ev.target).closest('.range-dropdown').length) {
        this._dropdownOpen = false;
        this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
        this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
      }
    });
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
    if (!this._selectedSkill) return;
    const woundedActor = game.actors.get(this.woundedActorId);
    const woundCount = woundedActor?.system.damage || 0;
    if (woundCount <= 0) {
      ui.notifications.info(localize("MedicalTreatment") + ": 0");
      this.close({ animate: false });
      return;
    }
    let conditionMod = 0;
    if (this._selectedCondition === "ambulance") conditionMod = 3;
    else if (this._selectedCondition === "hospital") conditionMod = 5;
    const extraMod = conditionMod + this._luckToSpend;

    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    this.close({ animate: false });
    this.actor.rollSkillCheck(this._selectedSkill.id, woundCount, extraMod);
  }

  async close(options) {
    $(document).off('click.medicalHelpDropdown');
    return super.close(options);
  }
}
