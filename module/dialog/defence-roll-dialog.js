import { localize } from "../utils.js";
import { getSkillsForCategory } from "../lookups.js";
import { buildD10Roll, RollBundle } from "../dice.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Defence Roll Dialog — Parry / Dodge / Escape against an incoming melee attack.
 * @extends {ApplicationV2}
 */
export class DefenceRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, defenceType, attackTotal) {
    super({});
    this.actor = actor;
    this.defenceType = defenceType;
    this.attackTotal = attackTotal;
    this._dropdownOpen = false;
    this._selectedSkill = null;
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ?? actor.system.stats.luck?.total ?? 0;
    this._skillOptions = this._buildSkillOptions();
    if (this._skillOptions.length > 0) this._selectedSkill = this._skillOptions[0];
  }

  static DEFAULT_OPTIONS = {
    id: "defence-roll-dialog",
    classes: ["cyberpunk", "defence-roll-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:    DefenceRollDialog._onCloseDialog,
      toggleDropdown: DefenceRollDialog._onToggleDropdown,
      pickSkill:      DefenceRollDialog._onPickSkill,
      luckPlus:       DefenceRollDialog._onLuckPlus,
      luckMinus:      DefenceRollDialog._onLuckMinus,
      roll:           DefenceRollDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/defence-roll.hbs" }
  };

  get title() { return localize("DefenceRoll"); }

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
    const categories = this.defenceType === "parry"
      ? ["meleeAttacks", "unarmedAttacks"]
      : ["escapeSkills", "unarmedAttacks"];
    const mappedNames = new Set();
    for (const cat of categories) {
      for (const name of getSkillsForCategory(cat)) mappedNames.add(name);
    }
    const options = [];
    for (const skillName of mappedNames) {
      const skill = this.actor.itemTypes.skill.find(s => s.name === skillName);
      if (!skill) continue;
      const skillValue = this.actor.resolveSkillTotal(skillName);
      if (skillValue <= 0) continue;
      let martialBonus = 0;
      if (skill.system.isMartial && skill.system.martial) {
        martialBonus = Number(skill.system.martial[this.defenceType]) || 0;
      }
      const totalDisplay = skillValue + martialBonus;
      options.push({
        id: skill.id, name: skill.name, stat: skill.system.stat,
        isMartial: skill.system.isMartial, value: skillValue, martialBonus,
        label: `${skill.name} +${totalDisplay}`
      });
    }
    return options;
  }

  async _prepareContext(_options) {
    const hasSkills = this._skillOptions.length > 0;
    const luckDisabled = this._availableLuck <= 0;
    let defenceLabel;
    if (this.defenceType === "parry") defenceLabel = localize("Parry");
    else if (this.defenceType === "escape") defenceLabel = localize("Escape");
    else defenceLabel = localize("Dodge");
    return {
      defenceLabel,
      skills: this._skillOptions,
      hasSkills,
      selectedSkillLabel: this._selectedSkill?.label || localize("NoSkillsBonus"),
      noSkillsLabel: localize("NoSkillsBonus"),
      luckToSpend: this._luckToSpend,
      availableLuck: this._availableLuck,
      canIncreaseLuck: this._luckToSpend < this._availableLuck,
      canDecreaseLuck: this._luckToSpend > 0,
      hasAnyLuck: this._availableLuck > 0,
      luckDisabled
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    $(document).off('click.defenceRollDropdown');
    $(document).on('click.defenceRollDropdown', (ev) => {
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
    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    this.close({ animate: false });

    if (!this._selectedSkill) {
      const roll = buildD10Roll(
        [this._luckToSpend || null].filter(Boolean),
        this.actor.system
      );
      await roll.evaluate();
      const d10Result = roll.dice[0]?.results[0]?.result;
      const isNatural1 = d10Result === 1;
      const success = !isNatural1 && roll.total >= this.attackTotal;
      let actionLabel;
      if (this.defenceType === "parry") actionLabel = localize("Parry");
      else if (this.defenceType === "escape") actionLabel = localize("Escape");
      else actionLabel = localize("Dodge");
      const fumble = isNatural1 ? await this.actor.rollFumbleData() : null;
      const speaker = ChatMessage.getSpeaker({ actor: this.actor });
      new RollBundle(actionLabel)
        .addRoll(roll)
        .execute(speaker, "systems/cyberpunk/templates/chat/skill-check.hbs", {
          statIcon: "defend",
          difficulty: this.attackTotal,
          success,
          fumble
        });
      return;
    }

    const skill = this.actor.items.get(this._selectedSkill.id);
    if (!skill) return;
    const actionSurgePenalty = this.actor.statuses.has("action-surge") ? -3 : 0;
    const fastDrawPenalty = this.actor.statuses.has("fast-draw") ? -3 : 0;
    const restrainedPenalty = this.actor.statuses.has("restrained") ? -2 : 0;
    const grapplingPenalty = this.actor.statuses.has("grappling") ? -2 : 0;
    const monomaniaPenalty = (this.actor.system.humanityLoss?.obsession ?? 0) >= 51 ? -4 : 0;
    const skillValue = this._selectedSkill.value;
    const martialBonus = this._selectedSkill.martialBonus;
    const parts = [
      skillValue,
      skill.system.stat ? `@stats.${skill.system.stat}.total` : null,
      martialBonus || null,
      this._luckToSpend || null,
      actionSurgePenalty || null,
      fastDrawPenalty || null,
      restrainedPenalty || null,
      grapplingPenalty || null,
      monomaniaPenalty || null
    ].filter(Boolean);

    const roll = buildD10Roll(parts, this.actor.system);
    await roll.evaluate();
    const d10Result = roll.dice[0]?.results[0]?.result;
    const isNatural1 = d10Result === 1;
    const success = !isNatural1 && roll.total >= this.attackTotal;

    let ipGained = 0;
    const { overridden: isOverridden } = this.actor._resolveSkillValue(skill);
    if (success && !isOverridden) {
      const firstDigit = parseInt(String(roll.total)[0]);
      const isCrit = d10Result === 10;
      ipGained = firstDigit + (isCrit ? 1 : 0);
      const currentIp = skill.system.ip || 0;
      await this.actor.updateEmbeddedDocuments("Item", [{
        _id: skill.id,
        "system.ip": currentIp + ipGained
      }]);
    }

    let actionLabel;
    if (this.defenceType === "parry") actionLabel = localize("Parry");
    else if (this.defenceType === "escape") actionLabel = localize("Escape");
    else actionLabel = localize("Dodge");
    const fumble = isNatural1 ? await this.actor.rollFumbleData() : null;
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    new RollBundle(actionLabel)
      .addRoll(roll)
      .execute(speaker, "systems/cyberpunk/templates/chat/skill-check.hbs", {
        statIcon: "defend",
        difficulty: this.attackTotal,
        success,
        ipGained,
        fumble
      });
  }

  async close(options) {
    $(document).off('click.defenceRollDropdown');
    return super.close(options);
  }
}
