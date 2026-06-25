import { availability } from "../lookups.js";
import { CyberpunkItemSheetV2 } from "./item-sheet-base-v2.js";

/**
 * Commodity Item Sheet with custom card design.
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkCommoditySheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["commodity-sheet"]
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/commodity-sheet.hbs" }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);

    ctx.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
      value,
      label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
      selected: ctx.system.availability === value
    }));

    const selectedAvail = availability[ctx.system.availability] || "Common";
    ctx.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

    return ctx;
  }
}
