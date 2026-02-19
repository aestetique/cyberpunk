import { localize } from "../utils.js";
import { getSkillsForCategory } from "../lookups.js";

/**
 * Medical Help Roll Dialog — lets a helper roll a medical skill against wound count.
 * Shows a skill dropdown (populated from stabilisation skill mappings),
 * condition buttons (Ambulance / Hospital), and luck controls.
 */
export class MedicalHelpDialog extends Application {

  /**
   * @param {Actor}  actor           The helping actor
   * @param {string} woundedActorId  The wounded actor's ID
   */
  constructor(actor, woundedActorId) {
    super();
    this.actor = actor;
    this.woundedActorId = woundedActorId;

    this._dropdownOpen = false;
    this._selectedSkill = null; // { id, name, stat, value }

    // Condition selection (radio-style: null | "ambulance" | "hospital")
    this._selectedCondition = null;

    // Luck spending
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ?? actor.system.stats.luck?.total ?? 0;

    // Build skill options once
    this._skillOptions = this._buildSkillOptions();
    if (this._skillOptions.length > 0) {
      this._selectedSkill = this._skillOptions[0];
    }
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "medical-help-dialog",
      classes: ["cyberpunk", "medical-help-dialog"],
      template: "systems/cyberpunk/templates/dialog/medical-help.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return localize("HelpRoll");
  }

  /**
   * Build the list of available stabilisation skills for this actor.
   */
  _buildSkillOptions() {
    const mappedNames = new Set();
    for (const name of getSkillsForCategory("stabilisationSkills")) {
      mappedNames.add(name);
    }

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

  /** @override */
  getData() {
    const hasSkills = this._skillOptions.length > 0;

    return {
      skills: this._skillOptions,
      hasSkills,
      selectedSkillLabel: this._selectedSkill?.label || localize("NoSkillsBonus"),
      noSkillsLabel: localize("NoSkillsBonus"),
      selectedCondition: this._selectedCondition,
      // Luck data
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

    // Skill dropdown toggle
    html.find('.range-dropdown-btn').click(ev => {
      ev.stopPropagation();
      this._dropdownOpen = !this._dropdownOpen;
      html.find('.range-dropdown-list').toggleClass('open', this._dropdownOpen);
      html.find('.range-dropdown-btn').toggleClass('open', this._dropdownOpen);
    });

    // Skill option selection
    html.find('.range-option').click(ev => {
      const skillId = ev.currentTarget.dataset.skillId;
      const selected = this._skillOptions.find(s => s.id === skillId);
      if (selected) {
        this._selectedSkill = selected;
        this._dropdownOpen = false;

        html.find('.range-dropdown-btn .range-label').text(selected.label);
        html.find('.range-dropdown-list').removeClass('open');
        html.find('.range-dropdown-btn').removeClass('open');

        html.find('.range-option').removeClass('selected');
        ev.currentTarget.classList.add('selected');
      }
    });

    // Close dropdown when clicking outside
    $(document).on('click.medicalHelpDropdown', (ev) => {
      if (!$(ev.target).closest('.range-dropdown').length) {
        this._dropdownOpen = false;
        html.find('.range-dropdown-list').removeClass('open');
        html.find('.range-dropdown-btn').removeClass('open');
      }
    });

    // Condition buttons (radio-style: only one can be selected at a time)
    html.find('.condition-btn').click(ev => {
      const btn = ev.currentTarget;
      const condition = btn.dataset.condition;

      if (this._selectedCondition === condition) {
        // Deselect if clicking the already-selected one
        this._selectedCondition = null;
        btn.classList.remove('selected');
      } else {
        // Select this one, deselect the other
        this._selectedCondition = condition;
        html.find('.condition-btn').removeClass('selected');
        btn.classList.add('selected');
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
   * Update the luck display and button states
   * @param {jQuery} html - The dialog HTML element
   */
  _updateLuckDisplay(html) {
    html.find('.luck-value').text(this._luckToSpend);

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
   * Execute the medical help roll
   */
  async _executeRoll() {
    if (!this._selectedSkill) return;

    // Get fresh wound count from the wounded actor
    const woundedActor = game.actors.get(this.woundedActorId);
    const woundCount = woundedActor?.system.damage || 0;
    if (woundCount <= 0) {
      ui.notifications.info(localize("MedicalTreatment") + ": 0");
      this.close();
      return;
    }

    // Compute condition modifier
    let conditionMod = 0;
    if (this._selectedCondition === "ambulance") conditionMod = 3;
    else if (this._selectedCondition === "hospital") conditionMod = 5;

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

    // Execute the skill check against wound count as difficulty
    this.actor.rollSkillCheck(this._selectedSkill.id, woundCount, extraMod);
  }

  /** @override */
  close(options) {
    $(document).off('click.medicalHelpDropdown');
    return super.close(options);
  }
}
