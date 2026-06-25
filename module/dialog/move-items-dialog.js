import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Move Items dialog — lets the user pick how many units of a stackable item
 * to transfer. Resolves with the chosen quantity (1..maxQuantity) when "Move"
 * is clicked, or null when the user closes the dialog.
 * @extends {ApplicationV2}
 */
export class MoveItemsDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {number} maxQuantity   Total units available on the source.
   * @param {string} itemName      Display name (used in dialog title only).
   * @param {object} [opts]
   * @param {string} [opts.titleKey]   Override the dialog title localization key.
   * @param {string} [opts.buttonKey]  Override the confirm button label key.
   */
  constructor(maxQuantity, itemName = "", opts = {}) {
    super({});
    this._maxQuantity = Math.max(1, Number(maxQuantity) || 1);
    this._itemName = itemName;
    this._quantity = this._maxQuantity;
    this._titleKey = opts.titleKey || "MoveItemsTitle";
    this._buttonKey = opts.buttonKey || "MoveItems";
    this._resolved = false;
    this._resolver = null;
  }

  static DEFAULT_OPTIONS = {
    id: "move-items-dialog",
    classes: ["cyberpunk", "move-items-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog: MoveItemsDialog._onCloseDialog,
      qtyPlus:     MoveItemsDialog._onQtyPlus,
      qtyMinus:    MoveItemsDialog._onQtyMinus,
      confirm:     MoveItemsDialog._onConfirm
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/move-items.hbs" }
  };

  get title() {
    return localize(this._titleKey);
  }

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onQtyPlus(event, _target) {
    event?.preventDefault?.();
    this._quantity = this._clamp(this._quantity + 1);
    this.render();
  }

  static _onQtyMinus(event, _target) {
    event?.preventDefault?.();
    this._quantity = this._clamp(this._quantity - 1);
    this.render();
  }

  static _onConfirm(event, _target) {
    event?.preventDefault?.();
    this._resolved = true;
    const q = this._quantity;
    this.close({ animate: false }).then(() => this._resolver?.(q));
  }

  /** Open the dialog and return a promise that resolves with the chosen quantity, or null. */
  async prompt() {
    return new Promise(resolve => {
      this._resolver = resolve;
      this.render(true);
    });
  }

  async _prepareContext(_options) {
    return {
      quantity: this._quantity,
      maxQuantity: this._maxQuantity,
      canIncrease: this._quantity < this._maxQuantity,
      canDecrease: this._quantity > 1,
      titleKey: this._titleKey,
      buttonKey: this._buttonKey
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    // Direct typing into the qty input — not an action click; keep manual.
    const qtyInput = this.element.querySelector('.qty-input');
    if (qtyInput) {
      const onChange = ev => {
        this._quantity = this._clamp(ev.currentTarget.value);
        this.render();
      };
      qtyInput.addEventListener('change', onChange);
      qtyInput.addEventListener('blur', onChange);
    }
  }

  _clamp(n) {
    const v = Math.floor(Number(n) || 0);
    if (!Number.isFinite(v)) return 1;
    return Math.min(this._maxQuantity, Math.max(1, v));
  }

  async close(opts) {
    const out = await super.close(opts);
    if (!this._resolved && this._resolver) {
      this._resolver(null);
      this._resolver = null;
    }
    return out;
  }
}
