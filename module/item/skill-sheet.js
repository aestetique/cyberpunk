import { getStatNames } from "../lookups.js";
import { CyberpunkItemSheetV2 } from "./item-sheet-base-v2.js";

/**
 * Skill Item Sheet with tabs (description/details/martial).
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkSkillSheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["skill-sheet"]
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/skill-sheet.hbs" }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);

    ctx.statOptions = getStatNames()
      .filter(stat => ["int", "ref", "tech", "cool", "attr", "bt", "emp"].includes(stat))
      .map(stat => ({
        value: stat,
        label: stat === "bt" ? "BODY" : stat.toUpperCase(),
        selected: ctx.system.stat === stat
      }));

    ctx.difficultyOptions = [1, 2, 3, 4, 5].map(v => ({
      value: v,
      label: `×${v}`,
      selected: Number(ctx.system.diffMod) === v
    }));

    ctx.selectedStatLabel = ctx.system.stat === "bt" ? "BODY" : (ctx.system.stat?.toUpperCase() || "REF");
    ctx.selectedDifficultyLabel = `×${ctx.system.diffMod ?? 1}`;

    ctx.isMartial = !!ctx.system.isMartial;

    // Bounce off the martial tab when un-checking Is Martial
    if (this._activeTab === "martial" && !ctx.isMartial) {
      this._activeTab = "description";
      ctx.activeTab = "description";
    }

    return ctx;
  }
}
