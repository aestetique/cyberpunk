import { localize } from "../utils.js";

/**
 * Move Items dialog — lets the user pick how many units of a stackable item
 * to transfer from one character to another. Mirrors the medical-help dialog
 * UI (reload-header wrapper, fire-mode-section, luck-style stepper).
 *
 * Resolves with the chosen quantity (1..maxQuantity) when "Move" is clicked,
 * or null when the user closes the dialog.
 */
export class MoveItemsDialog extends Application {

  /**
   * @param {number} maxQuantity   Total units available on the source.
   * @param {string} itemName      Display name (used in dialog title only).
   * @param {object} [opts]
   * @param {string} [opts.titleKey]   Override the dialog title localization key.
   * @param {string} [opts.buttonKey]  Override the confirm button label key.
   */
  constructor(maxQuantity, itemName = "", opts = {}) {
    super();
    this._maxQuantity = Math.max(1, Number(maxQuantity) || 1);
    this._itemName = itemName;
    this._quantity = this._maxQuantity;
    this._titleKey = opts.titleKey || "MoveItemsTitle";
    this._buttonKey = opts.buttonKey || "MoveItems";
    this._resolved = false;
    this._resolver = null;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "move-items-dialog",
      classes: ["cyberpunk", "move-items-dialog"],
      template: "systems/cyberpunk/templates/dialog/move-items.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return localize(this._titleKey);
  }

  /**
   * Open the dialog and return a promise that resolves with the chosen
   * quantity, or null if the user dismissed without confirming.
   */
  async prompt() {
    return new Promise(resolve => {
      this._resolver = resolve;
      this.render(true);
    });
  }

  /** @override */
  getData() {
    return {
      quantity: this._quantity,
      maxQuantity: this._maxQuantity,
      canIncrease: this._quantity < this._maxQuantity,
      canDecrease: this._quantity > 1,
      titleKey: this._titleKey,
      buttonKey: this._buttonKey
    };
  }

  _clamp(n) {
    const v = Math.floor(Number(n) || 0);
    if (!Number.isFinite(v)) return 1;
    return Math.min(this._maxQuantity, Math.max(1, v));
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Drag header
    const header = html.find('.reload-header')[0];
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, html, header, false);
    }
    html.find('.header-control.close').click(() => this.close());

    html.find('.qty-plus-btn').click(() => {
      this._quantity = this._clamp(this._quantity + 1);
      this.render(false);
    });
    html.find('.qty-minus-btn').click(() => {
      this._quantity = this._clamp(this._quantity - 1);
      this.render(false);
    });
    html.find('.qty-input').on('change blur', (ev) => {
      this._quantity = this._clamp(ev.currentTarget.value);
      this.render(false);
    });

    html.find('.move-btn').click(() => {
      this._resolved = true;
      const q = this._quantity;
      this.close().then(() => this._resolver?.(q));
    });
  }

  /** @override */
  async close(opts) {
    const out = await super.close(opts);
    if (!this._resolved && this._resolver) {
      this._resolver(null);
      this._resolver = null;
    }
    return out;
  }
}
