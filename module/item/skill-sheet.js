import { getStatNames } from "../lookups.js";
import { CyberpunkItemSheet } from "./item-sheet-base.js";

/**
 * Skill Item Sheet with custom card design and tabs
 * @extends {CyberpunkItemSheet}
 */
export class CyberpunkSkillSheet extends CyberpunkItemSheet {

  /** @type {string} */
  _activeTab = "description";

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["cyberpunk", "sheet", "item", "skill-sheet"],
      template: "systems/cyberpunk/templates/item/skill-sheet.hbs"
    });
  }

  /** @override */
  getData() {
    const data = super.getData();

    // Stat dropdown options
    data.statOptions = getStatNames()
      .filter(stat => ["int", "ref", "tech", "cool", "attr", "bt", "emp"].includes(stat))
      .map(stat => ({
        value: stat,
        label: stat === "bt" ? "BODY" : stat.toUpperCase(),
        selected: data.system.stat === stat
      }));

    // Difficulty multiplier options (×1 through ×5)
    data.difficultyOptions = [1, 2, 3, 4, 5].map(v => ({
      value: v,
      label: `×${v}`,
      selected: Number(data.system.diffMod) === v
    }));

    data.selectedStatLabel = data.system.stat === "bt" ? "BODY" : (data.system.stat?.toUpperCase() || "REF");
    data.selectedDifficultyLabel = `×${data.system.diffMod ?? 1}`;

    // Martial tab visibility
    data.isMartial = !!data.system.isMartial;

    // Validate active tab — fall back if martial tab is hidden
    if (this._activeTab === "martial" && !data.isMartial) {
      this._activeTab = "description";
    }
    data.activeTab = this._activeTab;

    return data;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Tab switching
    html.find('.tab-header').click(ev => {
      ev.preventDefault();
      const tab = ev.currentTarget.dataset.tab;
      if (tab && tab !== this._activeTab) {
        this._activeTab = tab;
        this.render(false);
      }
    });

    if (this._isLocked) return;

    // Checkbox toggle (isMartial)
    html.find('.checkbox-toggle').click(async ev => {
      ev.preventDefault();
      const field = ev.currentTarget.dataset.field;
      if (!field) return;
      const current = foundry.utils.getProperty(this.item, field);
      await this.item.update({ [field]: !current });
    });
  }
}
