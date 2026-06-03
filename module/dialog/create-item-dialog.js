/**
 * Custom "Create Item" dialog with themed buttons for each item type.
 *
 * After the weapon overhaul, weapon/ammo/ordnance are unified under one
 * `weapon` Item type with a `system.weaponType` discriminator. Each "weapon
 * category" button now creates a weapon document with the right discriminator
 * pre-set so the item sheet renders the matching field group.
 *
 * @extends {Application}
 */
export class CreateItemDialog extends Application {

  /**
   * @param {Actor|null} actor - If provided, items are created on this actor
   * @param {object} [options]
   * @param {Array<string|{type:string,weaponType?:string}>} [options.allowedTypes]
   *  Restrict the buttons shown. Each entry is either a bare type string (e.g. "skill")
   *  or an object {type, weaponType} for weapon-discriminator buttons.
   */
  constructor(actor = null, { allowedTypes = null } = {}) {
    super();
    this.actor = actor;
    this.allowedTypes = allowedTypes;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "create-item-dialog",
      classes: ["cyberpunk", "create-item-dialog"],
      template: "systems/cyberpunk/templates/dialog/create-item.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /**
   * Resolve a button entry to a {type, weaponType, label} object.
   */
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

  getData() {
    if (this.allowedTypes) {
      const items = this.allowedTypes.map(e => this._resolveEntry(e));
      const rows = [];
      for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
      return { rows, title: game.i18n.localize("CYBERPUNK.AddItem") };
    }

    // Default layout — single Weapon button covers all 5 weaponType variants
    // (the user picks Martial/Ranged/Exotic/Ordnance/Ammo on the item sheet).
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

  activateListeners(html) {
    super.activateListeners(html);

    const header = html.find('.reload-header')[0];
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, html, header, false);
    }

    html.find('.header-control.close').click(() => this.close());

    html.find('.create-item-btn').click(async ev => {
      const type = ev.currentTarget.dataset.type;
      const weaponType = ev.currentTarget.dataset.weaponType || "";

      // Compose document name and creation payload
      let nameTemplate;
      if (type === "weapon" && weaponType) {
        nameTemplate = game.i18n.localize(`CYBERPUNK.WeaponType${weaponType}`);
      } else {
        nameTemplate = game.i18n.localize(CONFIG.Item.typeLabels[type]);
      }
      const name = game.i18n.format("DOCUMENT.New", { type: nameTemplate });

      const createData = { name, type };
      if (type === "weapon" && weaponType) {
        // Pre-set the discriminator so the new sheet renders the right field group.
        createData.system = { weaponType };
        // Sensible per-class default
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

      this.close();
      if (item?.sheet) {
        item.sheet._isLocked = false;
        item.sheet.render(true);
      }
    });
  }
}
