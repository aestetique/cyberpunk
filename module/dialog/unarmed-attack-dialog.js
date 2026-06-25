import { PunchDialog } from "./punch-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Unarmed Attack Dialog — select unarmed action to perform.
 * Shows different actions depending on whether the actor has the Grappling condition.
 * @extends {ApplicationV2}
 */
export class UnarmedAttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @param {Actor} actor */
  constructor(actor) {
    super({});
    this.actor = actor;
  }

  static DEFAULT_OPTIONS = {
    id: "unarmed-attack-dialog",
    classes: ["cyberpunk", "ranged-attack-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:   UnarmedAttackDialog._onCloseDialog,
      unarmedAction: UnarmedAttackDialog._onUnarmedAction
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/unarmed-attack.hbs" }
  };

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onUnarmedAction(event, target) {
    event?.preventDefault?.();
    const action = target?.dataset?.key;
    if (!action) return;

    if (action === "Release") {
      this._executeRelease();
      this.close({ animate: false });
      return;
    }

    new PunchDialog(this.actor, { actionKey: action }).render(true);
    this.close({ animate: false });
  }

  async _prepareContext(_options) {
    const isGrappling = this.actor.statuses.has("grappling");
    const actions = isGrappling
      ? ["Hold", "Break", "Choke", "Crush", "Throw", "Release"]
      : ["Punch", "Kick", "Disarm", "Grapple", "Sweep", "Ram"];

    return {
      actions: actions.map(key => ({
        key,
        label: game.i18n.localize(`CYBERPUNK.${key}`)
      }))
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
  }

  /**
   * Execute Release action immediately - post chat message and apply effects.
   */
  async _executeRelease() {
    const { localize } = await import("../utils.js");
    const { RollBundle } = await import("../dice.js");

    const templateData = {
      actionIcon: "ref",
      fireModeLabel: localize("Release"),
      attackRoll: null,
      hasDamage: false,
      hasApply: true,
      areaDamages: {},
      weaponName: localize("UnarmedAttack"),
      weaponImage: "systems/cyberpunk/img/ui/unarmed.svg",
      weaponType: "Melee · 1 m",
      loadedAmmoType: "standard",
      damageType: "blunt",
      weaponEffect: "release",
      hasEffect: true,
      effectIcon: "released",
      effectLabel: localize("Conditions.Released"),
      hitLocation: ""
    };

    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    new RollBundle(localize("Release"))
      .execute(speaker, "systems/cyberpunk/templates/chat/melee-hit.hbs", templateData);

    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, "release grapple");
  }
}
