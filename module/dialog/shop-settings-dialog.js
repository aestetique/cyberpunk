import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Shop Settings dialog — Buy / Sell price multipliers and category toggles.
 * All edits persist immediately to the shop actor.
 * @extends {ApplicationV2}
 */
export class ShopSettingsDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(shop) {
    super({});
    this.shop = shop;
  }

  static DEFAULT_OPTIONS = {
    id: "shop-settings-dialog",
    classes: ["cyberpunk", "shop-settings-dialog"],
    position: { width: 320, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog: ShopSettingsDialog._onCloseDialog,
      pctPlus:     ShopSettingsDialog._onPctPlus,
      pctMinus:    ShopSettingsDialog._onPctMinus,
      toggleCategory: ShopSettingsDialog._onToggleCategory,
      toggleTab:   ShopSettingsDialog._onToggleTab
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/shop-settings.hbs" }
  };

  get title() { return localize("ShopSettings"); }

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static async _onPctPlus(event, target) {
    event?.preventDefault?.();
    const t = target?.dataset?.target;
    if (!t) return;
    const cur = Number(this.shop.system?.settings?.[`${t}PricePct`]) || 0;
    await this._update(`system.settings.${t}PricePct`, this._snapPct(cur + 5));
  }

  static async _onPctMinus(event, target) {
    event?.preventDefault?.();
    const t = target?.dataset?.target;
    if (!t) return;
    const cur = Number(this.shop.system?.settings?.[`${t}PricePct`]) || 0;
    await this._update(`system.settings.${t}PricePct`, this._snapPct(cur - 5));
  }

  static async _onToggleCategory(event, target) {
    event?.preventDefault?.();
    const key = target?.dataset?.key;
    if (!key) return;
    const cur = this.shop.system?.settings?.categories?.[key] !== false;
    await this._update(`system.settings.categories.${key}`, !cur);
  }

  static async _onToggleTab(event, target) {
    event?.preventDefault?.();
    const key = target?.dataset?.key;
    if (!key) return;
    const cur = this.shop.system?.settings?.tabs?.[key] !== false;
    await this._update(`system.settings.tabs.${key}`, !cur);
  }

  _clampPct(n) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return 1;
    return Math.min(200, Math.max(1, v));
  }

  _snapPct(n) {
    const v = this._clampPct(n);
    return Math.min(200, Math.max(5, Math.round(v / 5) * 5));
  }

  async _update(path, value) {
    await this.shop.update({ [path]: value });
    this.render();
  }

  async _prepareContext(_options) {
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

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    // Direct edits on the pct inputs (not button clicks)
    this.element.querySelectorAll('.pct-input').forEach(input => {
      const onChange = ev => {
        const t = ev.currentTarget.dataset.target;
        this._update(`system.settings.${t}PricePct`, this._clampPct(ev.currentTarget.value));
      };
      input.addEventListener('change', onChange);
      input.addEventListener('blur', onChange);
    });
  }
}
