import { CyberpunkItemSheetV2 } from "./item-sheet-base-v2.js";

/**
 * Role item sheet with tabs and skill drag-drop.
 * @extends {CyberpunkItemSheetV2}
 */
export class CyberpunkRoleSheet extends CyberpunkItemSheetV2 {

  static DEFAULT_OPTIONS = {
    classes: ["role-sheet"],
    dragDrop: [{ dragSelector: null, dropSelector: "[data-drop-target]" }],
    actions: {
      removeCareerSkill: CyberpunkRoleSheet._onRemoveCareerSkill,
      removeSpecialSkill: CyberpunkRoleSheet._onRemoveSpecialSkill
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/role-sheet.hbs" }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);

    const rawSkills = this.document.system.careerSkills || [];
    ctx.careerSkillsList = rawSkills.map(skill => {
      if (typeof skill === "string") return { name: skill, uuid: null };
      return skill;
    });

    ctx.hasSpecialSkill = !!(this.document.system.specialSkill?.uuid
                          || this.document.system.specialSkill?.name);
    return ctx;
  }

  static async _onRemoveCareerSkill(event, target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this._isLocked) return;
    const index = parseInt(target.dataset.index);
    const skills = [...(this.document.system.careerSkills || [])];
    skills.splice(index, 1);
    await this.document.update({ "system.careerSkills": skills });
  }

  static async _onRemoveSpecialSkill(event, _target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this._isLocked) return;
    await this.document.update({ "system.specialSkill": { uuid: "", name: "" } });
  }

  async _onDrop(event) {
    event.preventDefault();
    if (this._isLocked) return;

    let data;
    try { data = JSON.parse(event.dataTransfer.getData("text/plain")); }
    catch { return; }

    if (data.type !== "Item") return;

    const item = await Item.implementation.fromDropData(data);
    if (!item) return;

    if (item.type !== "skill") {
      ui.notifications.warn(game.i18n.localize("CYBERPUNK.OnlySkillsCanBeAdded"));
      return;
    }

    const dropTargetEl = event.target.closest("[data-drop-target]");
    const dropTarget = dropTargetEl?.dataset.dropTarget;

    if (dropTarget === "special-skill") {
      await this.document.update({
        "system.specialSkill": { uuid: item.uuid, name: item.name }
      });
      return;
    }

    const currentSkills = this.document.system.careerSkills || [];
    const isDuplicate = currentSkills.some(skill => {
      if (typeof skill === "string") return skill.toLowerCase() === item.name.toLowerCase();
      return skill.uuid === item.uuid || skill.name.toLowerCase() === item.name.toLowerCase();
    });

    if (isDuplicate) {
      ui.notifications.warn(game.i18n.format("CYBERPUNK.SkillAlreadyInRole", { name: item.name }));
      return;
    }

    const updatedSkills = [...currentSkills, { uuid: item.uuid, name: item.name }];
    await this.document.update({ "system.careerSkills": updatedSkills });
  }
}
