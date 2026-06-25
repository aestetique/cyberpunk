const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Custom "Create Item" dialog with themed buttons for each item type.
 * @extends {ApplicationV2}
 */
export class CreateItemDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {Actor|null} actor
   * @param {object} [options]
   * @param {Array<string|{type:string,weaponType?:string}>} [options.allowedTypes]
   */
  constructor(actor = null, { allowedTypes = null } = {}) {
    super({});
    this.actor = actor;
    this.allowedTypes = allowedTypes;
  }

  static DEFAULT_OPTIONS = {
    id: "create-item-dialog",
    classes: ["cyberpunk", "create-item-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog: CreateItemDialog._onCloseDialog,
      createItem:  CreateItemDialog._onCreateItem
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/create-item.hbs" }
  };

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static async _onCreateItem(event, target) {
    event?.preventDefault?.();
    const type = target?.dataset?.type;
    if (!type) return;
    const weaponType = target.dataset.weaponType || "";

    let nameTemplate;
    if (type === "weapon" && weaponType) {
      nameTemplate = game.i18n.localize(`CYBERPUNK.WeaponType${weaponType}`);
    } else {
      nameTemplate = game.i18n.localize(CONFIG.Item.typeLabels[type]);
    }
    const name = game.i18n.format("DOCUMENT.New", { type: nameTemplate });

    const createData = { name, type };
    if (type === "weapon" && weaponType) {
      createData.system = { weaponType };
      const defaultClassByType = {
        Martial:  "Melee",
        Ranged:   "Pistol",
        Exotic:   "Exotic",
        Ordnance: "Grenade",
        Ammo:     "Pistol"
      };
      const defClass = defaultClassByType[weaponType];
      if (defClass) createData.system.weaponClass = defClass;
    }

    let item;
    if (this.actor) {
      const [created] = await this.actor.createEmbeddedDocuments("Item", [createData]);
      item = created;
    } else {
      item = await Item.create(createData);
    }

    this.close({ animate: false });
    if (item?.sheet) {
      item.sheet._isLocked = false;
      item.sheet.render(true);
    }
  }

  _resolveEntry(entry) {
    if (typeof entry === "string") {
      return { type: entry, weaponType: "", label: game.i18n.localize(`TYPES.Item.${entry}`) };
    }
    const t = entry.type;
    const wt = entry.weaponType || "";
    let label;
    if (t === "weapon" && wt) {
      label = game.i18n.localize(`CYBERPUNK.WeaponType${wt}`);
    } else {
      label = game.i18n.localize(`TYPES.Item.${t}`);
    }
    return { type: t, weaponType: wt, label };
  }

  async _prepareContext(_options) {
    if (this.allowedTypes) {
      const items = this.allowedTypes.map(e => this._resolveEntry(e));
      const rows = [];
      for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
      return { rows, title: game.i18n.localize("CYBERPUNK.AddItem") };
    }

    const rows = [
      ["weapon",      "armor"].map(e => this._resolveEntry(e)),
      ["cyberware",   "netware"].map(e => this._resolveEntry(e)),
      ["tool",        "drug"].map(e => this._resolveEntry(e))
    ];

    if (this.actor) {
      rows.push(["misc", "skill"].map(e => this._resolveEntry(e)));
    } else {
      rows.push(
        ["misc",  "vehicle"].map(e => this._resolveEntry(e)),
        ["skill", "role"].map(e => this._resolveEntry(e))
      );
    }

    return {
      rows,
      title: this.actor
        ? game.i18n.localize("CYBERPUNK.AddItem")
        : game.i18n.localize("CYBERPUNK.CreateItem")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
  }
}
