/**
 * Custom "Create Item" dialog with themed buttons for each item type.
 * Used in two modes:
 * - Sidebar mode (no actor): replaces Foundry's default Create Item dialog, 12 types
 * - Actor mode (with actor): creates embedded items on the character, 10 types
 * @extends {Application}
 */
export class CreateItemDialog extends Application {

  /**
   * @param {Actor|null} actor - If provided, items are created on this actor
   * @param {object} [options]
   * @param {string[]} [options.allowedTypes] - If set, only show buttons for these types
   *                                            (in the given order, paired into rows of 2).
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

  getData() {
    // Restricted mode — pair allowed types into rows of 2 in caller's order.
    if (this.allowedTypes) {
      const items = this.allowedTypes.map(type => ({
        type,
        label: game.i18n.localize(`TYPES.Item.${type}`)
      }));
      const rows = [];
      for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
      return { rows, title: game.i18n.localize("CYBERPUNK.AddItem") };
    }

    const rows = [
      [
        { type: "weapon",    label: game.i18n.localize("TYPES.Item.weapon") },
        { type: "ammo",      label: game.i18n.localize("TYPES.Item.ammo") }
      ],
      [
        { type: "ordnance",  label: game.i18n.localize("TYPES.Item.ordnance") },
        { type: "armor",     label: game.i18n.localize("TYPES.Item.armor") }
      ],
      [
        { type: "cyberware", label: game.i18n.localize("TYPES.Item.cyberware") },
        { type: "netware",   label: game.i18n.localize("TYPES.Item.netware") }
      ],
      [
        { type: "tool",      label: game.i18n.localize("TYPES.Item.tool") },
        { type: "drug",      label: game.i18n.localize("TYPES.Item.drug") }
      ]
    ];

    if (this.actor) {
      // Actor mode: 10 types — add Commodity + Skill
      rows.push([
        { type: "misc",  label: game.i18n.localize("TYPES.Item.misc") },
        { type: "skill", label: game.i18n.localize("TYPES.Item.skill") }
      ]);
    } else {
      // Sidebar mode: 12 types — add Commodity + Vehicle, Skill + Role
      rows.push(
        [
          { type: "misc",    label: game.i18n.localize("TYPES.Item.misc") },
          { type: "vehicle", label: game.i18n.localize("TYPES.Item.vehicle") }
        ],
        [
          { type: "skill",   label: game.i18n.localize("TYPES.Item.skill") },
          { type: "role",    label: game.i18n.localize("TYPES.Item.role") }
        ]
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

    // Draggable header
    const header = html.find('.reload-header')[0];
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, html, header, false);
    }

    // Close button
    html.find('.header-control.close').click(() => this.close());

    // Item type buttons — create item, open its sheet unlocked, and close dialog
    html.find('.create-item-btn').click(async ev => {
      const type = ev.currentTarget.dataset.type;
      const name = game.i18n.format("DOCUMENT.New", {
        type: game.i18n.localize(CONFIG.Item.typeLabels[type])
      });

      let item;
      if (this.actor) {
        const [created] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
        item = created;
      } else {
        item = await Item.create({ name, type });
      }

      this.close();
      if (item?.sheet) {
        item.sheet._isLocked = false;
        item.sheet.render(true);
      }
    });
  }
}
