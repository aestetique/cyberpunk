/**
 * Shop sheet — read-only-feeling actor that any player can buy from / sell
 * to. Visually mirrors the drone sheet (portrait + name top-left, content
 * area to the right) and the character gear tab (categorised section-block /
 * gear-row layout). Action buttons are buy / sell badges instead of the
 * character's equip / use / quantity widgets.
 */
import { localize, commitPendingEdits } from "../utils.js";
import { resolveWeaponDiscriminator } from "../lookups.js";
import {
  buildWeaponContextString,
  buildAmmoContext,
  buildArmorContext,
  buildCyberwareContext,
  buildNetwareContext,
  buildToolContext,
  buildDrugContext,
  buildCommodityContext
} from "./gear-data.js";
import { buyItem, sellItem, isSellable } from "./shop-trade.js";
import { ShopSettingsDialog } from "../dialog/shop-settings-dialog.js";

/** Item type → which section-block category it lands in, with badge + label. */
function categorise(item) {
  const t = item.type;
  if (t === "weapon" && item.system?.weaponType === "Ammo") {
    return { key: "ammo", title: "AMMO", badge: "badge-ammo" };
  }
  if (t === "weapon") {
    return { key: "weapons", title: "WEAPONS", badge: "badge-weapons" };
  }
  if (t === "armor") {
    return { key: "outfit", title: "OUTFIT", badge: "badge-outfit" };
  }
  if (t === "cyberware") {
    return { key: "cyberware", title: "CYBERWARE", badge: "badge-cyberware" };
  }
  if (t === "netware") {
    return { key: "netware", title: "NETWARE", badge: "badge-netware" };
  }
  if (t === "tool") {
    return { key: "tools", title: "TOOLS", badge: "badge-tool" };
  }
  if (t === "drug") {
    return { key: "drugs", title: "DRUGS", badge: "badge-drug" };
  }
  if (t === "misc") {
    return { key: "commodities", title: "COMMODITIES", badge: "badge-commodity" };
  }
  if (t === "vehicle") {
    return { key: "vehicles", title: "VEHICLES", badge: "badge-gear" };
  }
  return null;
}

const CATEGORY_ORDER = [
  "weapons", "ammo", "outfit", "cyberware", "netware", "tools", "drugs", "commodities", "vehicles"
];

/**
 * Map a category key to its category-toggle key in shop settings. Both the
 * `weapons` and `ammo` categories hang off the same `weapons` toggle — a shop
 * that doesn't sell guns shouldn't sell ammo either.
 */
const CATEGORY_TO_TOGGLE = {
  weapons: "weapons",
  ammo: "weapons",
  outfit: "outfit",
  cyberware: "cyberware",
  netware: "netware",
  tools: "tools",
  drugs: "drugs",
  commodities: "commodities",
  vehicles: "vehicles"
};

function isOption(item) {
  if (item.type === "cyberware") return !!item.system?.isOption;
  if (item.type === "armor") return item.system?.armorType === "option";
  return false;
}

/** Total SP across all hit-location coverage for an armor item. */
function armorTotalSP(armor) {
  const cov = armor.system?.coverage || {};
  let max = 0;
  for (const loc of Object.values(cov)) {
    const sp = Number(loc?.stoppingPower) || 0;
    if (sp > max) max = sp;
  }
  // Shields store SP under system.shield; use that when present.
  if (armor.system?.armorType === "shield") {
    return Number(armor.system?.shield?.stoppingPower) || 0;
  }
  return max;
}

/**
 * Build the gear-row subtext. Delegates to the same context builders used by
 * the character sheet's Gear / Cyberware / Netware tabs so the shop reads
 * identically — no per-type ad-hoc formatting here.
 */
function buildSubtext(item) {
  const sys = item.system || {};
  if (item.type === "weapon" && sys.weaponType === "Ammo") return buildAmmoContext(sys);
  if (item.type === "weapon") {
    const d = resolveWeaponDiscriminator(sys);
    return buildWeaponContextString({ sys, wType: d.weaponType, wClass: d.weaponClass });
  }
  if (item.type === "armor")     return buildArmorContext(item);
  if (item.type === "cyberware") return buildCyberwareContext(item);
  if (item.type === "netware")   return buildNetwareContext(item);
  if (item.type === "tool")      return buildToolContext(item);
  if (item.type === "drug")      return buildDrugContext(item);
  if (item.type === "misc")      return buildCommodityContext(item);
  if (item.type === "vehicle")   return "Vehicle";
  return "";
}

/**
 * Per-type display fields rendered in the two middle slots of a gear row.
 * Returns `{ field1: { value, label }, field2: { value, label } | null }`.
 * Each field renders as a 60–80px column (.gear-field with .field-top /
 * .field-bottom). Returning null hides that field — the empty `.gear-field`
 * placeholder fills the space so the row layout doesn't jump.
 */
function buildFields(item) {
  const sys = item.system || {};
  if (item.type === "weapon" && sys.weaponType === "Ammo") {
    const packSize = Math.max(1, Number(sys.packSize) || 1);
    const total = Math.max(packSize, Number(sys.quantity) || packSize);
    const packsAvail = Math.floor(total / packSize);
    return {
      field1: { value: packSize, label: "Pack" },
      field2: { value: packsAvail, label: "Quantity" }
    };
  }
  if (item.type === "weapon") {
    const damage = sys.damage || "—";
    const d = resolveWeaponDiscriminator(sys);
    const wt = d.weaponType;
    let mag;
    if (wt === "Ranged") mag = { value: sys.shots ?? 0, label: "Magazine" };
    else if (wt === "Exotic") mag = { value: sys.chargesMax ?? 0, label: "Charges" };
    else mag = null;
    return { field1: { value: damage, label: "Damage" }, field2: mag };
  }
  if (item.type === "armor") {
    const sp = armorTotalSP(item);
    const ev = sys.encumbrance ?? 0;
    return {
      field1: { value: sp, label: "SP" },
      field2: { value: ev, label: "EV" }
    };
  }
  if (item.type === "cyberware") {
    const hum = String(sys.humanityCost ?? "0").trim() || "0";
    const slots = Number(sys.hasSlots) || 0;
    const spaces = Number(sys.takesSpace) || 0;
    const slotsLabel = slots > 0 ? `${slots} / ${spaces}` : `${spaces}`;
    const slotsName  = slots > 0 ? "Options" : "Spaces";
    return {
      field1: { value: hum, label: "Humanity" },
      field2: { value: slotsLabel, label: slotsName }
    };
  }
  if (item.type === "netware") {
    const slots = Number(sys.slots) || 0;
    const space = Number(sys.takesSpace) || 0;
    return {
      field1: { value: slots > 0 ? slots : space, label: slots > 0 ? "Program Slots" : "Slots" },
      field2: null
    };
  }
  if (item.type === "drug") {
    return {
      field1: { value: Number(sys.quantity) || 1, label: "Quantity" },
      field2: null
    };
  }
  if (item.type === "vehicle") {
    const sp = Number(sys.sp) || 0;
    const sdp = Number(sys.sdp?.max) || 0;
    return {
      field1: { value: sp,  label: "SP" },
      field2: { value: sdp, label: "SDP" }
    };
  }
  return { field1: null, field2: null };
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2Base = foundry.applications.sheets.ActorSheetV2;

/**
 * @extends {ActorSheetV2}
 */
export class CyberpunkShopSheet extends HandlebarsApplicationMixin(ActorSheetV2Base) {

  /** @type {"buy"|"sell"} */
  _activeTab = "buy";

  /**
   * Sheet lock state. Defaults locked; GM toggles via the header lock button.
   * Unlocked mode (only meaningful for GMs — the toggle is GM-gated in the
   * template) makes the actor name + portrait + stackable quantities editable.
   */
  _isLocked = true;
  _isMinimized = false;

  /** Per-actor remembered sheet heights so a re-render restores the user's resized height. */
  static _sheetHeights = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["cyberpunk", "sheet", "actor", "shop-sheet"],
    position: { width: 670, height: 540 },
    window: {
      frame: true,
      positioned: true,
      resizable: true,
      minimizable: true,
      controls: []
    },
    form: { submitOnChange: true, closeOnSubmit: false },
    dragDrop: [{ dropSelector: null }],
    actions: {
      lockToggle:     CyberpunkShopSheet._onLockToggle,
      closeSheet:     CyberpunkShopSheet._onCloseSheet,
      copyUuid:       CyberpunkShopSheet._onCopyUuid,
      configureSheet: CyberpunkShopSheet._onConfigureSheet,
      configureToken: CyberpunkShopSheet._onConfigureToken
    }
  };

  static PARTS = {
    body: {
      template: "systems/cyberpunk/templates/actor/shop-sheet.hbs",
      scrollable: [".gear-container"]
    }
  };

  /** Convenience getter (V2 stores the document on `document`). */
  get actor() { return this.document; }
  get title() { return this.document.name; }
  get minimized() { return this._isMinimized; }

  /** Static action handlers */
  static async _onLockToggle(event, _target) {
    event?.preventDefault?.();
    commitPendingEdits(this.element);
    this._isLocked = !this._isLocked;
    this.render();
  }

  static _onCloseSheet(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onCopyUuid(event, _target) {
    event?.preventDefault?.();
    game.clipboard.copyPlainText(this.document.uuid);
    ui.notifications.info(`Copied UUID: ${this.document.uuid}`);
  }

  static _onConfigureSheet(event, _target) {
    event?.preventDefault?.();
    const SheetConfig = foundry.applications.apps?.DocumentSheetConfig ?? DocumentSheetConfig;
    new SheetConfig({ document: this.document }).render({ force: true });
  }

  static _onConfigureToken(event, _target) {
    event?.preventDefault?.();
    if (this.document.token?.sheet) {
      this.document.token.sheet.render({ force: true });
      return;
    }
    new CONFIG.Token.prototypeSheetClass({
      prototype: this.document.prototypeToken,
      position: {
        left: Math.max(this.position.left - 560 - 10, 10),
        top: this.position.top
      }
    }).render({ force: true });
  }

  /** @override — remember user-resized height for next open */
  setPosition(position = {}) {
    if (position.height) {
      CyberpunkShopSheet._sheetHeights.set(this.actor.id, position.height);
    }
    return super.setPosition(position);
  }

  /** No-op shim — V14 Draggable.resizeMouseUp still calls this.app._onResize. */
  _onResize(_event) {}

  /** @override — restore remembered height on first render; consolidate stackables once */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (options.isFirstRender) {
      const rememberedHeight = CyberpunkShopSheet._sheetHeights.get(this.actor.id);
      if (rememberedHeight) {
        options.position = { ...(options.position ?? {}), height: rememberedHeight };
      }
    }
  }

  /** Custom minimize matching drone/character-sheet pattern. */
  async minimize() {
    if (this._isMinimized || !this.rendered) return;
    const root = this.element;
    if (!root) return;
    const sheetFrame = root.querySelector(".sheet-frame");
    const characterSheet = root.querySelector(".character-sheet");
    const sheetContent = root.querySelector(".sheet-content");
    const sheetSections = root.querySelector(".sheet-sections");
    const sheetResize = root.querySelector(".sheet-resize");

    this._originalWidth = sheetFrame?.offsetWidth ?? this.position.width;
    this._originalHeight = sheetFrame?.offsetHeight ?? this.position.height;
    this._originalFoundryWidth = this.position.width;
    this._originalFoundryHeight = this.position.height;

    if (sheetContent) sheetContent.style.display = "none";
    if (sheetSections) sheetSections.style.display = "none";
    if (sheetResize) sheetResize.style.display = "none";
    if (sheetFrame) sheetFrame.style.minHeight = "0";
    if (characterSheet) characterSheet.style.minHeight = "0";
    root.style.minHeight = "0";

    const minWidth = 400;
    if (sheetFrame) {
      sheetFrame.style.transition = "width 250ms ease, height 250ms ease";
      sheetFrame.style.width = `${minWidth}px`;
      sheetFrame.style.height = "46px";
    }
    root.style.transition = "width 250ms ease, height 250ms ease";
    root.style.width = `${minWidth}px`;
    root.style.height = "46px";

    await new Promise(resolve => setTimeout(resolve, 250));

    if (characterSheet) {
      characterSheet.style.width = `${minWidth}px`;
      characterSheet.style.minHeight = "46px";
    }
    this.setPosition({ width: minWidth, height: 46 });
    if (sheetFrame) sheetFrame.style.transition = "";
    root.style.transition = "";
    this._isMinimized = true;
  }

  /** Custom maximize matching drone/character-sheet pattern. */
  async maximize() {
    if (!this._isMinimized) return;
    const root = this.element;
    if (!root) return;
    const sheetFrame = root.querySelector(".sheet-frame");
    const characterSheet = root.querySelector(".character-sheet");
    const sheetContent = root.querySelector(".sheet-content");
    const sheetSections = root.querySelector(".sheet-sections");
    const sheetResize = root.querySelector(".sheet-resize");

    if (sheetFrame) {
      sheetFrame.style.transition = "width 250ms ease, height 250ms ease";
      sheetFrame.style.width = `${this._originalWidth}px`;
      sheetFrame.style.height = `${this._originalHeight}px`;
    }
    root.style.transition = "width 250ms ease, height 250ms ease";
    root.style.width = `${this._originalFoundryWidth}px`;
    root.style.height = `${this._originalFoundryHeight}px`;

    if (characterSheet) {
      characterSheet.style.width = "";
      characterSheet.style.minHeight = "";
    }

    await new Promise(resolve => setTimeout(resolve, 250));

    if (sheetFrame) {
      sheetFrame.style.transition = "";
      sheetFrame.style.width = "";
      sheetFrame.style.height = "";
      sheetFrame.style.minHeight = "";
    }
    root.style.transition = "";
    root.style.width = "";
    root.style.height = "";
    root.style.minHeight = "";
    if (sheetContent) sheetContent.style.display = "";
    if (sheetSections) sheetSections.style.display = "";
    if (sheetResize) sheetResize.style.display = "";
    this.setPosition({
      width: this._originalFoundryWidth,
      height: this._originalFoundryHeight
    });
    this._isMinimized = false;
  }

  /**
   * One-shot pass when the sheet first opens: merge any duplicate same-name
   * drugs and same-(name, caliber, ammoType) ammo stacks into single rows.
   * After this runs once per session, the `_onDropItem` override below keeps
   * future drops from creating new duplicates.
   */
  async _consolidateStackables() {
    const norm = (s) => (s ?? "").toString().trim().toLowerCase();
    const groups = new Map();
    for (const item of this.actor.items.contents) {
      let key = null;
      if (item.type === "drug") {
        key = `drug:${norm(item.name)}`;
      } else if (item.type === "weapon" && item.system?.weaponType === "Ammo") {
        const cal = item.system?.caliber || "";
        const at  = item.system?.ammoType || "";
        key = `ammo:${norm(item.name)}:${cal}:${at}`;
      }
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const updates = [];
    const deletes = [];
    for (const items of groups.values()) {
      if (items.length <= 1) continue;
      const [keeper, ...extras] = items;
      const total = items.reduce((sum, i) => sum + (Number(i.system?.quantity) || 1), 0);
      updates.push({ _id: keeper.id, "system.quantity": total });
      deletes.push(...extras.map(i => i.id));
    }
    if (deletes.length) await this.actor.deleteEmbeddedDocuments("Item", deletes);
    if (updates.length) await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * Capture gear-container scroll on every render so the V2 PARTS.scrollable
   * pipeline restores it after the fresh DOM lands. We also kick off the
   * one-shot stackables consolidation here on the first render.
   */
  _preRender(context, options) {
    if (!this._consolidatedOnOpen) {
      this._consolidatedOnOpen = true;
      this._consolidateStackables();
    }
    return super._preRender?.(context, options);
  }

  /**
   * @override Stackables (drug, Ammo) merge with existing same-shape stacks
   * on the shop instead of creating duplicate rows. Ammo also initialises to
   * one pack's worth of quantity, mirroring the character sheet's drop logic
   * — the shop sells per pack, so each compendium drop = one pack of ammo.
   * Everything else falls through to Foundry's default handler.
   */
  async _onDropItem(event, item) {
    if (!item) return;
    event.preventDefault();

    const norm = (s) => (s ?? "").toString().trim().toLowerCase();

    if (item.type === "drug") {
      const dropQty = Number(item.system?.quantity) || 1;
      const existing = this.actor.items.find(i =>
        i.type === "drug" && norm(i.name) === norm(item.name)
      );
      if (existing) {
        const newQty = (Number(existing.system?.quantity) || 0) + dropQty;
        return this.actor.updateEmbeddedDocuments("Item", [{
          _id: existing.id, "system.quantity": newQty
        }]);
      }
      const newData = item.toObject();
      newData.system.quantity = dropQty;
      newData.system.equipped = false;
      return this.actor.createEmbeddedDocuments("Item", [newData]);
    }

    if (item.type === "weapon" && item.system?.weaponType === "Ammo") {
      const packQty = Number(item.system?.packSize) || 20;
      const cal = item.system?.caliber || "";
      const at  = item.system?.ammoType || "";
      const existing = this.actor.items.find(i =>
        i.type === "weapon" &&
        i.system?.weaponType === "Ammo" &&
        norm(i.name) === norm(item.name) &&
        (i.system?.caliber || "") === cal &&
        (i.system?.ammoType || "") === at
      );
      if (existing) {
        const newQty = (Number(existing.system?.quantity) || 0) + packQty;
        return this.actor.updateEmbeddedDocuments("Item", [{
          _id: existing.id, "system.quantity": newQty
        }]);
      }
      const newData = item.toObject();
      newData.system.quantity = packQty;
      if (!newData.system.sourceUuid) newData.system.sourceUuid = item.uuid;
      newData.system.equipped = false;
      return this.actor.createEmbeddedDocuments("Item", [newData]);
    }

    return super._onDropItem(event, item);
  }

  /** @override */
  async _prepareContext(options) {
    const data = await super._prepareContext(options);
    data.actor = this.document;
    data.editable = this.isEditable;
    data.cssClass = this.isEditable ? "editable" : "locked";
    data.system = this.document.system;
    data.isGM = game.user.isGM;
    data.isLocked = this._isLocked;
    // Only GMs can ever see / use the lock toggle, so players are effectively
    // always locked. Guarding here too keeps any drifted state honest.
    data.isUnlocked = !this._isLocked && game.user.isGM;

    const settings = this.actor.system?.settings || {};
    const tabSettings = settings.tabs || {};
    const buyEnabled  = tabSettings.buy  !== false;
    const sellEnabled = tabSettings.sell !== false;
    const shopClosed = !buyEnabled && !sellEnabled;

    // With only one tab enabled the tab bar + divider are hidden and the
    // active tab is forced to whichever one is on. With neither enabled
    // (`shopClosed`) the gear pane shows a single notice and `_activeTab`
    // is left as-is — there's nothing to navigate to.
    if (!shopClosed) {
      if (this._activeTab === "buy"  && !buyEnabled)  this._activeTab = "sell";
      if (this._activeTab === "sell" && !sellEnabled) this._activeTab = "buy";
    }

    data.activeTab = this._activeTab;
    data.buyActive = this._activeTab === "buy";
    data.sellActive = this._activeTab === "sell";
    data.buyEnabled = buyEnabled;
    data.sellEnabled = sellEnabled;
    // Tab row is rendered only when both tabs are on. With one tab we drop
    // straight into its gear list; with neither, the shop-closed notice fills
    // the gear pane.
    data.hideTabs = !buyEnabled || !sellEnabled;
    data.shopClosed = shopClosed;

    const character = game.user.character;
    data.hasCharacter = !!character;
    data.characterName = character?.name || "";
    data.buyerBalance = Number(character?.system?.gear?.eurobucks) || 0;
    data.shopBalance = Number(this.actor.system?.gear?.eurobucks) || 0;

    const buyPct  = Math.max(1, Math.min(200, Number(settings.buyPricePct)  ?? 100));
    const sellPct = Math.max(1, Math.min(200, Number(settings.sellPricePct) ??  50));

    // Shop description — free-form flavour text under the identity row.
    // Locked / non-GM view renders each line as a <p> paragraph; GM + unlocked
    // gets a <textarea> for inline editing.
    const description = this.document.system.description || "";
    data.description = description;
    data.descriptionLines = description ? description.split("\n") : [];

    if (data.shopClosed) {
      // Both tabs off — the gear pane renders just the "shop is closed" notice.
      data.categories = [];
    } else if (this._activeTab === "buy") {
      data.categories = this._buildCategories(
        this.actor.items.contents, "buy", character, data.shopBalance, buyPct / 100, data.isUnlocked
      );
    } else if (this._activeTab === "sell" && character) {
      const sellable = character.items.contents.filter(isSellable);
      data.categories = this._buildCategories(
        sellable, "sell", character, data.shopBalance, sellPct / 100, data.isUnlocked
      );
    } else {
      data.categories = [];
    }
    return data;
  }

  /**
   * Bucket items into the display categories, in fixed order, with main
   * items first and options last inside each. `shopBalance` is the shop's
   * eurobucks — used on the Sell tab to gray out sells the shop can't pay.
   * `priceMultiplier` is the tab's price % (e.g. 0.75 = 75 %); applied to the
   * row price AND to the affordability checks so the displayed price is what
   * actually gets charged. Categories disabled in shop settings are dropped
   * before bucketing.
   */
  _buildCategories(items, mode, buyer, shopBalance, priceMultiplier = 1, isUnlocked = false) {
    const cats = this.actor.system?.settings?.categories || {};
    const buckets = new Map();
    for (const item of items) {
      const cat = categorise(item);
      if (!cat) continue;
      const toggle = CATEGORY_TO_TOGGLE[cat.key];
      if (toggle && cats[toggle] === false) continue;
      if (!buckets.has(cat.key)) buckets.set(cat.key, { ...cat, items: [] });
      buckets.get(cat.key).items.push(item);
    }

    const buyerBalance = Number(buyer?.system?.gear?.eurobucks) || 0;

    const result = [];
    for (const key of CATEGORY_ORDER) {
      const bucket = buckets.get(key);
      if (!bucket?.items?.length) continue;
      bucket.items.sort((a, b) => {
        const ao = isOption(a) ? 1 : 0;
        const bo = isOption(b) ? 1 : 0;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });

      const rows = bucket.items.map(i => {
        const baseCost = Number(i.system?.cost) || 0;
        const cost = Math.max(0, Math.round(baseCost * priceMultiplier));
        const stackable = i.type === "drug" || (i.type === "weapon" && i.system?.weaponType === "Ammo");
        const qty = stackable ? (Number(i.system?.quantity) || 1) : 1;
        const fields = buildFields(i);
        // In unlocked mode the GM can edit a stackable row's quantity inline.
        // Drug edits field1 (Quantity, 1 dose per step); ammo edits field2
        // (Quantity in *packs*, multiplied by packSize on commit).
        if (isUnlocked && stackable) {
          if (i.type === "drug" && fields.field1) {
            fields.field1.editable = true;
            fields.field1.editAs   = "qty";
          } else if (i.type === "weapon" && i.system?.weaponType === "Ammo" && fields.field2) {
            fields.field2.editable = true;
            fields.field2.editAs   = "packs";
            fields.field2.packSize = Math.max(1, Number(i.system?.packSize) || 1);
          }
        }
        return {
          id: i.id,
          name: i.name,
          img: i.img,
          context: buildSubtext(i),
          flavor: i.system?.flavor || "",
          price: cost,
          weight: i.system?.weight || 0,
          quantity: qty,
          stackable,
          isOption: isOption(i),
          field1: fields.field1,
          field2: fields.field2,
          canAfford: mode !== "buy" || buyerBalance >= cost,
          // Sell is gated on the SHOP being able to pay the asking price.
          shopCanPay: mode !== "sell" || shopBalance >= cost
        };
      });
      result.push({ title: bucket.title, badge: bucket.badge, mode, rows });
    }
    return result;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // Portrait click — locked / non-GM: full-screen popup. Unlocked GM:
    // FilePicker to change the shop's image. Mirrors drone sheet logic.
    html.find('.portrait-frame').click(ev => {
      ev.preventDefault();
      if (this._isLocked || !game.user.isGM) {
        new foundry.applications.apps.ImagePopout({
          src: this.actor.img,
          window: { title: this.actor.name },
          uuid: this.actor.uuid
        }).render({ force: true });
      } else {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.actor.img,
          callback: (path) => this.actor.update({ img: path }),
          position: { top: this.position.top + 40, left: this.position.left + 10 }
        }).render({ force: true });
      }
    });

    // Stackable quantity input (unlocked mode). `data-edit-as` switches between
    // raw dose count (drugs) and pack count (ammo); for packs we multiply by
    // packSize on commit so the stored quantity stays in rounds.
    html.find('.gear-quantity-input').click(ev => ev.target.select()).change(async ev => {
      const itemId = ev.currentTarget.dataset.itemId;
      const editAs = ev.currentTarget.dataset.editAs;
      const packSize = Math.max(1, Number(ev.currentTarget.dataset.packSize) || 1);
      const newVal = Math.max(0, Math.floor(Number(ev.currentTarget.value) || 0));
      const newQty = editAs === "packs" ? newVal * packSize : newVal;
      const source = this._activeTab === "sell" ? game.user.character : this.actor;
      if (!source) return;
      await source.updateEmbeddedDocuments("Item", [{
        _id: itemId,
        "system.quantity": newQty
      }]);
    });

    // Header chrome / actions wired declaratively via DEFAULT_OPTIONS.actions.

    // ----- Custom Window Dragging / Resize / Minimize -----
    const sheetHeader = this.element.querySelector(".sheet-header");
    if (sheetHeader) {
      this._customDraggable = new foundry.applications.ux.Draggable.implementation(
        this, this.element, sheetHeader, this.options.window?.resizable
      );

      const resizeHandle = this.element.querySelector(".sheet-resize");
      if (resizeHandle) {
        resizeHandle.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          this._customDraggable._onResizeMouseDown(ev);
        });
      }

      // Double-click header to minimize / maximize via our overrides.
      sheetHeader.addEventListener("dblclick", (ev) => {
        if (ev.target.closest(".lock-toggle, .header-control")) return;
        if (this._isMinimized) this.maximize();
        else this.minimize();
      });
    }

    // Tab switching
    html.find('.tabs-line .tab-header').click(ev => {
      const tab = ev.currentTarget.dataset.tab;
      if (tab && tab !== this._activeTab) {
        this._activeTab = tab;
        this.render(false);
      }
    });

    // Shop till — GM-editable (clamps to >= 0); the input is readonly for
    // players in the template, this check is defense in depth since players
    // are OWNER on the shop and could otherwise push an update via devtools.
    html.find('.shop-eurobucks-input').on('change blur', async ev => {
      if (!game.user.isGM) return;
      const next = Math.max(0, Math.floor(Number(ev.currentTarget.value) || 0));
      const current = Number(this.actor.system?.gear?.eurobucks) || 0;
      if (next !== current) await this.actor.update({ "system.gear.eurobucks": next });
      else this.render(false);
    });

    // Shop description — GM + unlocked only.
    html.find('.shop-description-input').on('change blur', async ev => {
      if (!game.user.isGM) return;
      const next = ev.currentTarget.value;
      const current = this.actor.system?.description || "";
      if (next !== current) await this.actor.update({ "system.description": next });
    });

    // Buy — only fires when affordable (button has .disabled when not).
    html.find('.buy-btn:not(.disabled)').click(async ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const item = this.actor.items.get(itemId);
      const buyer = game.user.character;
      if (!item || !buyer) return;
      await buyItem(buyer, this.actor, item);
      this.render(false);
    });

    // Sell — only fires when the shop can pay.
    html.find('.sell-btn:not(.disabled)').click(async ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const seller = game.user.character;
      if (!seller) return;
      const item = seller.items.get(itemId);
      if (!item) return;
      await sellItem(seller, this.actor, item);
      this.render(false);
    });

    // View — open the item sheet. Source actor depends on tab.
    html.find('.gear-view').click(ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const source = this._activeTab === "sell" ? game.user.character : this.actor;
      const item = source?.items?.get(itemId);
      item?.sheet?.render(true);
    });

    // Delete — same source-actor lookup; native confirm dialog.
    html.find('.gear-delete').click(ev => {
      ev.preventDefault();
      const itemId = ev.currentTarget.dataset.itemId;
      const source = this._activeTab === "sell" ? game.user.character : this.actor;
      const item = source?.items?.get(itemId);
      if (!item) return;
      foundry.applications.api.DialogV2.confirm({
        window: { title: localize("DeleteItem") },
        content: `<p>Delete <strong>${item.name}</strong>?</p>`,
        yes: { label: localize("Yes"), callback: () => source.deleteEmbeddedDocuments("Item", [item.id]) },
        no:  { label: localize("No"), default: true }
      });
    });

    // Settings button — opens the Shop Settings dialog (price % and category
    // toggles). Live-updates the shop actor; Foundry re-renders this sheet on
    // each update so prices and category filters refresh as the user edits.
    html.find('.shop-settings-btn').click(ev => {
      ev.preventDefault();
      new ShopSettingsDialog(this.actor).render(true);
    });
  }
}
