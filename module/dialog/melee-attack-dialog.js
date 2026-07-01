import { localize, getHiddenLocationsForTargets, resolveTargetActor, renderTemplateCompat } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Melee Attack Dialog — streamlined dialog for melee weapon strikes.
 * @extends {ApplicationV2}
 */
export class MeleeAttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, weapon, targetTokens = []) {
    super({});
    this.actor = actor;
    this.weapon = weapon;
    this.targetTokens = targetTokens;
    this._executeSelected = false;
    this._conditions = { prepared: false, ambush: false, distracted: false, indirect: false };
    this._selectedLocation = null;
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ?? actor.system.stats.luck?.total ?? 0;
  }

  static DEFAULT_OPTIONS = {
    id: "melee-attack-dialog",
    classes: ["cyberpunk", "melee-attack-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:     MeleeAttackDialog._onCloseDialog,
      toggleExecute:   MeleeAttackDialog._onToggleExecute,
      toggleCondition: MeleeAttackDialog._onToggleCondition,
      pickLocation:    MeleeAttackDialog._onPickLocation,
      luckPlus:        MeleeAttackDialog._onLuckPlus,
      luckMinus:       MeleeAttackDialog._onLuckMinus,
      roll:            MeleeAttackDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/melee-attack.hbs" }
  };

  static _onCloseDialog(event, _target) { event?.preventDefault?.(); this.close({ animate: false }); }

  static _onToggleExecute(event, target) {
    event?.preventDefault?.();
    this._executeSelected = !this._executeSelected;
    target.classList.toggle('selected', this._executeSelected);
    if (this._executeSelected) {
      this._luckToSpend = 0;
      this._updateLuckDisplay();
      this.element.querySelector('.luck-controls')?.classList.add('disabled');
      for (const key of Object.keys(this._conditions)) this._conditions[key] = false;
      this.element.querySelectorAll('.condition-btn').forEach(b => b.classList.remove('selected'));
      this.element.querySelectorAll('.conditions-grid:not(.conditions-grid--single)').forEach(g => g.classList.add('disabled'));
      this._selectedLocation = null;
      this.element.querySelectorAll('.location-btn').forEach(btn => {
        btn.classList.remove('selected');
        const loc = btn.dataset.location;
        const img = btn.querySelector('img');
        if (img) img.setAttribute('src', `systems/cyberpunk/img/chat/${loc}-disabled.svg`);
      });
      this.element.querySelector('.location-grid')?.classList.add('disabled');
    } else {
      this.element.querySelector('.luck-controls')?.classList.toggle('disabled', this._availableLuck <= 0);
      this._updateLuckDisplay();
      this.element.querySelectorAll('.conditions-grid:not(.conditions-grid--single)').forEach(g => g.classList.remove('disabled'));
      this.element.querySelector('.location-grid')?.classList.remove('disabled');
      this.element.querySelectorAll('.location-btn').forEach(btn => {
        const loc = btn.dataset.location;
        const img = btn.querySelector('img');
        if (img) img.setAttribute('src', `systems/cyberpunk/img/chat/${loc}.svg`);
      });
    }
  }

  static _onToggleCondition(event, target) {
    event?.preventDefault?.();
    if (this._executeSelected) return;
    const condition = target?.dataset?.condition;
    if (!condition) return;
    this._conditions[condition] = !this._conditions[condition];
    target.classList.toggle('selected', this._conditions[condition]);
  }

  static _onPickLocation(event, target) {
    event?.preventDefault?.();
    if (this._executeSelected) return;
    if (target.classList.contains('no-zone')) return;
    const location = target.dataset.location;
    if (this._selectedLocation === location) {
      this._selectedLocation = null;
      target.classList.remove('selected');
    } else {
      this.element.querySelectorAll('.location-btn').forEach(b => b.classList.remove('selected'));
      this._selectedLocation = location;
      target.classList.add('selected');
    }
  }

  static _onLuckPlus(event, _target) {
    event?.preventDefault?.();
    if (!this._executeSelected && this._luckToSpend < this._availableLuck) {
      this._luckToSpend++;
      this._updateLuckDisplay();
    }
  }

  static _onLuckMinus(event, _target) {
    event?.preventDefault?.();
    if (!this._executeSelected && this._luckToSpend > 0) {
      this._luckToSpend--;
      this._updateLuckDisplay();
    }
  }

  static _onRoll(event, _target) { event?.preventDefault?.(); this._executeRoll(); }

  async _prepareContext(_options) {
    const damageType = this.weapon.weaponData.damageType || "blunt";
    const isEdged = ["edged", "spike", "monoblade"].includes(damageType);
    return {
      weaponName: this.weapon.name,
      executeLabel: isEdged ? localize("CoupDeGrace") : localize("Knockout"),
      executeCondition: isEdged ? "coupDeGrace" : "knockout",
      executeSelected: this._executeSelected,
      hiddenLocations: getHiddenLocationsForTargets(this.targetTokens),
      luckToSpend: this._luckToSpend,
      availableLuck: this._availableLuck,
      canIncreaseLuck: this._luckToSpend < this._availableLuck && !this._executeSelected,
      canDecreaseLuck: this._luckToSpend > 0 && !this._executeSelected,
      hasAnyLuck: this._availableLuck > 0,
      luckDisabled: this._executeSelected || this._availableLuck <= 0
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
    const minusDisabled = this._executeSelected || this._luckToSpend <= 0;
    const plusDisabled = this._executeSelected || this._luckToSpend >= this._availableLuck;
    const minusBtn = this.element.querySelector('.luck-minus-btn');
    const plusBtn = this.element.querySelector('.luck-plus-btn');
    minusBtn?.classList.toggle('disabled', minusDisabled);
    plusBtn?.classList.toggle('disabled', plusDisabled);
    minusBtn?.querySelector('img')?.setAttribute('src', `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    plusBtn?.querySelector('img')?.setAttribute('src', `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  async _executeRoll() {
    const damageType = this.weapon.weaponData.damageType || "blunt";
    const isEdged = ["edged", "spike", "monoblade"].includes(damageType);

    if (this._executeSelected) {
      const conditionId = isEdged ? "coupDeGrace" : "knockout";
      const effectLabel = isEdged ? localize("CoupDeGrace") : localize("Knockout");
      const effectIcon = isEdged ? "dead" : "unconscious";
      const templateData = {
        weaponName: this.weapon.name,
        weaponImage: this.weapon.img,
        weaponType: this.weapon.getWeaponLineType(),
        effectLabel, effectIcon, conditionId
      };
      const content = await renderTemplateCompat(
        "systems/cyberpunk/templates/chat/melee-execute.hbs",
        templateData
      );
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content
      });
      const { registerAction } = await import("../action-tracker.js");
      await registerAction(this.actor, `melee execute (${this.weapon.name})`);
      this.close({ animate: false });
    } else {
      if (this._luckToSpend > 0) {
        const currentSpent = this.actor.system.stats.luck.spent || 0;
        const currentSpentAt = this.actor.system.stats.luck.spentAt;
        this.actor.update({
          "system.stats.luck.spent": currentSpent + this._luckToSpend,
          "system.stats.luck.spentAt": currentSpentAt || Date.now()
        });
      }
      const attackMods = {
        extraMod: (this._conditions.prepared ? 2 : 0)
                + (this._conditions.ambush ? 5 : 0)
                + (this._conditions.distracted ? -2 : 0)
                + (this._conditions.indirect ? -5 : 0)
                + (this._selectedLocation ? -4 : 0)
                + this._luckToSpend,
        cyberTerminus: "NoCyberlimb",
        targetArea: this._selectedLocation || "",
        targetActor: resolveTargetActor(this.targetTokens?.[0])
      };
      this.close({ animate: false });
      this.weapon._resolveAttack(attackMods, this.targetTokens);
      const { registerAction } = await import("../action-tracker.js");
      await registerAction(this.actor, `melee attack (${this.weapon.name})`);
    }
  }
}
