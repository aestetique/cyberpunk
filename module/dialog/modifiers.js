import { setByPath, localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Modifiers dialog — pick attack modifiers (and optionally adv/dis) before firing.
 * V2 form: root is `<form>`, submission flows through the configured `form.handler`.
 * @extends {ApplicationV2}
 */
export class ModifiersDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {Actor}  actor     The actor firing — used to register the action after confirm.
   * @param {object} options   Per-call config (weapon, modifierGroups, targetTokens, etc.).
   */
  constructor(actor, options = {}) {
    super({});
    this.actor = actor;
    // V2 freezes this.options, so stash the per-call config separately.
    this._cfg = {
      weapon:         options.weapon ?? null,
      modifierGroups: options.modifierGroups ?? [],
      targetTokens:   options.targetTokens ?? [],
      extraMod:       options.extraMod ?? true,
      showAdvDis:     options.showAdvDis ?? false,
      advantage:      options.advantage ?? false,
      disadvantage:   options.disadvantage ?? false,
      onConfirm:      options.onConfirm ?? (() => {})
    };
  }

  static DEFAULT_OPTIONS = {
    id: "weapon-modifier",
    classes: ["cyberpunk"],
    tag: "form",
    position: { width: 500, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    form: {
      handler: ModifiersDialog._onSubmitForm,
      closeOnSubmit: false,
      submitOnChange: false
    },
    actions: {
      reload: ModifiersDialog._onReload
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/modifiers.hbs" }
  };

  get title() { return localize("AttackModifiers"); }

  static async _onReload(event, _target) {
    event?.preventDefault?.();
    const weapon = this._cfg.weapon;
    if (!weapon) return;
    await weapon.update({ "system.shotsLeft": weapon.system.shots });
    ui.notifications.info(localize("Reloaded"));
    weapon.system.shotsLeft = weapon.system.shots;
    const shotsInput = this.element.querySelector('input.number[readonly]');
    if (shotsInput) shotsInput.value = weapon.system.shots;
  }

  static async _onSubmitForm(event, form, formData) {
    const data = formData.object;
    const fired = await this._cfg.onConfirm(data);
    if (fired !== false && this._cfg.weapon) {
      const { registerAction } = await import("../action-tracker.js");
      await registerAction(this.actor, `weapon attack (${this._cfg.weapon.name})`);
    }
    if (fired !== false) this.close({ animate: false });
  }

  async _prepareContext(_options) {
    const groups = JSON.parse(JSON.stringify(this._cfg.modifierGroups || []));

    if (this._cfg.extraMod) {
      const already = groups.some(g => g.some(m => m.dataPath === "extraMod"));
      if (!already) {
        groups.push([{
          localKey: "ExtraModifiers",
          dataPath: "extraMod",
          defaultValue: 0
        }]);
      }
    }

    const defaultValues = {};
    groups.forEach(group => {
      group.forEach(mod => {
        mod.fieldPath = `fields/${mod.choices ? "select" : typeof mod.defaultValue}`;
        setByPath(defaultValues, mod.dataPath,
          mod.defaultValue !== undefined ? mod.defaultValue : "");
      });
    });

    return {
      modifierGroups: groups,
      targetTokens: this._cfg.targetTokens,
      defaultValues,
      isRanged: this._cfg.weapon?.isRanged?.() ?? false,
      shotsLeft: this._cfg.weapon?.system.shotsLeft ?? 0,
      showAdvDis: this._cfg.showAdvDis,
      advantage: this._cfg.advantage,
      disadvantage: this._cfg.disadvantage
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Mutual exclusion between Advantage / Disadvantage checkboxes
    this.element.querySelectorAll('input.adv, input.dis').forEach(el => {
      el.addEventListener('change', () => {
        if (el.classList.contains('adv') && el.checked) {
          this.element.querySelectorAll('input.dis').forEach(d => d.checked = false);
        }
        if (el.classList.contains('dis') && el.checked) {
          this.element.querySelectorAll('input.adv').forEach(a => a.checked = false);
        }
      });
    });
  }
}
