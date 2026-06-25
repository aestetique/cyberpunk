import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Initiative Roll Dialog — select Fast Draw and Luck before rolling initiative.
 * @extends {ApplicationV2}
 */
export class InitiativeRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, combatant, combat, callback) {
    super({});
    this.actor = actor;
    this.combatant = combatant;
    this.combat = combat;
    this.callback = callback;
    this._fastDraw = false;
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ??
                          actor.system.stats.luck?.total ?? 0;
    this._rolled = false;
  }

  static DEFAULT_OPTIONS = {
    id: "initiative-roll-dialog",
    classes: ["cyberpunk", "initiative-roll-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:   InitiativeRollDialog._onCloseDialog,
      toggleFastDraw: InitiativeRollDialog._onToggleFastDraw,
      luckPlus:      InitiativeRollDialog._onLuckPlus,
      luckMinus:     InitiativeRollDialog._onLuckMinus,
      roll:          InitiativeRollDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/initiative-roll.hbs" }
  };

  get title() { return localize("InitiativeRoll"); }

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onToggleFastDraw(event, target) {
    event?.preventDefault?.();
    this._fastDraw = !this._fastDraw;
    target.classList.toggle('selected', this._fastDraw);
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

  async _prepareContext(_options) {
    return {
      title: localize("InitiativeRoll"),
      fastDraw: this._fastDraw,
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
    if (this._fastDraw) {
      await this.actor.toggleStatusEffect("fast-draw", { active: true });
    }
    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      await this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }
    this._rolled = true;
    this.close({ animate: false });
    if (this.callback) {
      this.callback({ luckMod: this._luckToSpend });
    }
  }

  static async show(actor, combatant, combat) {
    return new Promise((resolve) => {
      const dialog = new InitiativeRollDialog(actor, combatant, combat, (modifiers) => {
        resolve(modifiers);
      });
      dialog.render(true);
      const originalClose = dialog.close.bind(dialog);
      dialog.close = async (options) => {
        if (!dialog._rolled) resolve(null);
        return originalClose(options);
      };
    });
  }
}
