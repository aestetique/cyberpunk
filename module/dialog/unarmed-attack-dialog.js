import { PunchDialog } from "./punch-dialog.js";

/**
 * Unarmed Attack Dialog — select unarmed action to perform.
 * Shows different actions depending on whether the actor has the Grappling condition.
 */
export class UnarmedAttackDialog extends Application {

  /**
   * @param {Actor} actor  The acting actor
   */
  constructor(actor) {
    super();
    this.actor = actor;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "unarmed-attack-dialog",
      classes: ["cyberpunk", "ranged-attack-dialog"],
      template: "systems/cyberpunk/templates/dialog/unarmed-attack.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  getData() {
    const isGrappling = this.actor.statuses.has("grappling");
    const actions = isGrappling
      ? ["Hold", "Choke", "Throw", "Release"]
      : ["Punch", "Kick", "Disarm", "Grapple", "Sweep", "Ram"];

    return {
      actions: actions.map(key => ({
        key,
        label: game.i18n.localize(`CYBERPUNK.${key}`)
      }))
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Make header draggable
    const header = html.find('.reload-header')[0];
    if (header) {
      new Draggable(this, html, header, false);
    }

    // Close button
    html.find('.header-control.close').click(() => this.close());

    // Action buttons
    html.find('.unarmed-action-btn').click(ev => {
      const action = ev.currentTarget.dataset.action;
      if (action === "Punch" || action === "Kick") {
        new PunchDialog(this.actor, { actionKey: action }).render(true);
        this.close();
      }
    });
  }
}
