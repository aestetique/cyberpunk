import { localize, commitPendingEdits, getFilePickerClass, getImagePopoutClass } from "../utils.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ItemSheetV2Base =
  foundry.applications.sheets.ItemSheetV2 ?? foundry.applications.sheets.ItemSheet;

/**
 * V2 base item sheet with custom card design, lock/unlock, minimize/restore.
 * Child sheets should set PARTS and extend the actions map.
 * @extends {ItemSheetV2}
 */
export class CyberpunkItemSheetV2 extends HandlebarsApplicationMixin(ItemSheetV2Base) {

  static DEFAULT_OPTIONS = {
    classes: ["cyberpunk", "sheet", "item"],
    position: { width: 500, height: 400 },
    window: {
      frame: true,
      positioned: true,
      resizable: false,
      minimizable: false,
      controls: []
    },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      lockToggle:    CyberpunkItemSheetV2._onLockToggle,
      closeSheet:    CyberpunkItemSheetV2._onCloseSheet,
      copyUuid:      CyberpunkItemSheetV2._onCopyUuid,
      portraitClick: CyberpunkItemSheetV2._onPortraitClick,
      tabSwitch:     CyberpunkItemSheetV2._onTabSwitch,
      openSkill:     CyberpunkItemSheetV2._onOpenSkill,
      checkboxToggle: CyberpunkItemSheetV2._onCheckboxToggle
    }
  };

  _isLocked = true;
  _isMinimized = false;
  _originalHeight = null;
  _activeTab = "description";
  #dragDrops = [];

  get title() {
    return this.document.name;
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.item = this.document;
    ctx.system = this.document.system;
    ctx.isLocked = this._isLocked;
    ctx.isMinimized = this._isMinimized;
    ctx.flavorLines = (this.document.system.flavor || "").split("\n");
    ctx.activeTab = this._activeTab;
    return ctx;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    const root = this.element;
    if (!root) return;

    root.setAttribute("autocomplete", "off");

    const header = root.querySelector(".sheet-header");
    if (header) {
      header.addEventListener("dblclick", ev => this._onHeaderDoubleClick(ev));
      new foundry.applications.ux.Draggable.implementation(this, root, header, false);
    }

    // Wire drag-drop if the sheet declared any dropSelectors
    this.#dragDrops.forEach(dd => dd.unbind?.());
    this.#dragDrops = (this.options.dragDrop ?? []).map(cfg =>
      new foundry.applications.ux.DragDrop.implementation({
        ...cfg,
        permissions: {
          dragstart: () => this.isEditable && !this._isLocked,
          drop:      () => this.isEditable && !this._isLocked
        },
        callbacks: { drop: ev => this._onDrop(ev) }
      }).bind(this.element)
    );
  }

  /**
   * Override in subclasses to handle dropped items.
   * @param {DragEvent} _event
   */
  async _onDrop(_event) {}

  static async _onLockToggle(event, _target) {
    event?.preventDefault?.();
    commitPendingEdits(this.element);
    this._isLocked = !this._isLocked;
    this.render();
  }

  static _onCloseSheet(event, _target) {
    event?.preventDefault?.();
    this.close();
  }

  static _onCopyUuid(event, _target) {
    event?.preventDefault?.();
    game.clipboard.copyPlainText(this.document.uuid);
    ui.notifications.info(localize("CopiedUUID", { uuid: this.document.uuid }));
  }

  static _onTabSwitch(event, target) {
    event?.preventDefault?.();
    const tab = target?.dataset?.tab;
    if (tab && tab !== this._activeTab) {
      this._activeTab = tab;
      this.render();
    }
  }

  static async _onOpenSkill(event, target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    const item = await fromUuid(uuid);
    if (item) item.sheet.render(true);
  }

  static async _onCheckboxToggle(event, target) {
    event?.preventDefault?.();
    if (this._isLocked) return;
    const field = target?.dataset?.field;
    if (!field) return;
    const current = foundry.utils.getProperty(this.document, field);
    await this.document.update({ [field]: !current });
  }

  static _onPortraitClick(event, _target) {
    event?.preventDefault?.();
    if (this._isLocked) {
      new (getImagePopoutClass())({
        src: this.document.img,
        window: { title: this.document.name },
        uuid: this.document.uuid
      }).render({ force: true });
    } else {
      new (getFilePickerClass())({
        type: "image",
        current: this.document.img,
        callback: path => this.document.update({ img: path })
      }).render({ force: true });
    }
  }

  _onHeaderDoubleClick(ev) {
    if (ev.target.closest("[data-action], .lock-toggle, .header-control")) return;

    const root = this.element;
    const content = root.querySelector(".item-content");
    const card = root.querySelector(".item-card");

    if (this._isMinimized) {
      root.style.transition = "height 200ms ease";
      root.style.height = `${this._originalHeight}px`;
      setTimeout(() => {
        if (content) content.style.display = "";
        root.style.transition = "";
        root.style.minHeight = "";
        if (card) card.style.minHeight = "";
        this.setPosition({ height: this._originalHeight });
      }, 200);
      this._isMinimized = false;
    } else {
      this._originalHeight = root.offsetHeight;
      if (content) content.style.display = "none";
      root.style.minHeight = "0";
      if (card) card.style.minHeight = "0";
      root.style.transition = "height 200ms ease";
      root.style.height = "38px";
      setTimeout(() => {
        root.style.transition = "";
        this.setPosition({ height: 38 });
        root.style.height = "38px";
      }, 200);
      this._isMinimized = true;
    }
  }
}
