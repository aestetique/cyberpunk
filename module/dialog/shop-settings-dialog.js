import { localize } from "../utils.js";

/**
 * Shop Settings dialog — Buy / Sell price multipliers and category toggles.
 * All edits persist immediately to the shop actor (no apply button); the parent
 * shop sheet re-renders via Foundry's update hook so the new prices / filter
 * show up right away.
 *
 * Prices are stored as a percentage from 1..200; the shop sheet multiplies the
 * displayed price by `pct / 100`. The +/- buttons step by 5, the centre input
 * accepts any value 1..200 — values over 100 represent a markup (shop sells
 * above cost, or pays above cost when buying from players).
 *
 * Category toggles map to `system.settings.categories.<key>`. An unchecked key
 * hides every item in that category from both tabs. The `weapons` toggle covers
 * the Ammo category too — a shop that doesn't sell guns doesn't sell ammo.
 */
export class ShopSettingsDialog extends Application {

  constructor(shop) {
    super();
    this.shop = shop;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "shop-settings-dialog",
      classes: ["cyberpunk", "shop-settings-dialog"],
      template: "systems/cyberpunk/templates/dialog/shop-settings.hbs",
      width: 320,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return localize("ShopSettings");
  }

  /** Clamp a percent into the editable 1..200 range. */
  _clampPct(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return 1;
    return Math.min(200, Math.max(1, v));
  }

  /** Snap a percent to the nearest multiple of 5 within 1..200. */
  _snapPct(n) {
    const v = this._clampPct(n);
    return Math.min(200, Math.max(5, Math.round(v / 5) * 5));
  }

  /** @override */
  getData() {
    const s = this.shop.system?.settings || {};
    const buyPct  = this._clampPct(s.buyPricePct  ?? 100);
    const sellPct = this._clampPct(s.sellPricePct ??  50);
    const cats = s.categories || {};
    const tabs = s.tabs || {};
    const on  = (key) => cats[key] !== false;
    const tab = (key) => tabs[key] !== false;

    return {
      buyPct,
      sellPct,
      buyCanIncrease:  buyPct  < 200,
      buyCanDecrease:  buyPct  > 1,
      sellCanIncrease: sellPct < 200,
      sellCanDecrease: sellPct > 1,
      tabs: [
        { key: "buy",  label: localize("BuyTab"),  on: tab("buy") },
        { key: "sell", label: localize("SellTab"), on: tab("sell") }
      ],
      // 4 rows × 2 toggle buttons each
      catRows: [
        [
          { key: "weapons",     label: localize("Weapons"),     on: on("weapons") },
          { key: "outfit",      label: localize("Outfits"),     on: on("outfit") }
        ],
        [
          { key: "cyberware",   label: localize("Cyberware"),   on: on("cyberware") },
          { key: "netware",     label: localize("NetwareLabel"),on: on("netware") }
        ],
        [
          { key: "tools",       label: localize("Tools"),       on: on("tools") },
          { key: "drugs",       label: localize("Drugs"),       on: on("drugs") }
        ],
        [
          { key: "commodities", label: localize("Commodities"), on: on("commodities") },
          { key: "vehicles",    label: localize("Vehicles"),    on: on("vehicles") }
        ]
      ]
    };
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

    // Helper — push a settings field to the shop and re-render this dialog
    // (the shop sheet re-renders itself via Foundry's update hook).
    const update = async (path, value) => {
      await this.shop.update({ [path]: value });
      this.render(false);
    };

    // Stepper buttons — step by 5, snapped to the 5-grid first so e.g. 37 → 40.
    html.find('.pct-plus-btn').click(ev => {
      const target = ev.currentTarget.dataset.target;
      const cur = Number(this.shop.system?.settings?.[`${target}PricePct`]) || 0;
      update(`system.settings.${target}PricePct`, this._snapPct(cur + 5));
    });
    html.find('.pct-minus-btn').click(ev => {
      const target = ev.currentTarget.dataset.target;
      const cur = Number(this.shop.system?.settings?.[`${target}PricePct`]) || 0;
      update(`system.settings.${target}PricePct`, this._snapPct(cur - 5));
    });

    // Direct edit — any 1..200 value, not snapped (user typed it explicitly).
    html.find('.pct-input').on('change blur', ev => {
      const target = ev.currentTarget.dataset.target;
      update(`system.settings.${target}PricePct`, this._clampPct(ev.currentTarget.value));
    });

    // Category toggles — flip on click.
    html.find('.category-toggle').click(ev => {
      const key = ev.currentTarget.dataset.key;
      const cur = this.shop.system?.settings?.categories?.[key] !== false;
      update(`system.settings.categories.${key}`, !cur);
    });

    // Open-For tab toggles — flip on click. The shop sheet handles defaulting
    // to whichever tab is on next time it renders (and shows a notice in the
    // gear pane if the user navigates to a disabled tab).
    html.find('.tab-toggle').click(ev => {
      const key = ev.currentTarget.dataset.key;
      const cur = this.shop.system?.settings?.tabs?.[key] !== false;
      update(`system.settings.tabs.${key}`, !cur);
    });
  }
}
