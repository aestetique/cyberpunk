import {
  weaponTypes, sortedAttackTypes, concealability, availability, reliability,
  getAttackSkillsForWeapon, meleeAttackTypes, getStatNames,
  ammoCalibersByWeaponType, weaponToAmmoType
} from "../lookups.js";
import { localize } from "../utils.js";
import { getMartialKeyByName } from "../utils.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ItemSheetV2Base =
  foundry.applications.sheets.ItemSheetV2 ?? foundry.applications.sheets.ItemSheet;

/**
 * Legacy fallback Item sheet — registered as default for any item type that
 * doesn't have a specialized sheet (currently no live types). V2 native frame.
 * @extends {ItemSheetV2}
 */
export class CyberpunkLegacyItemSheet extends HandlebarsApplicationMixin(ItemSheetV2Base) {

  static DEFAULT_OPTIONS = {
    classes: ["cyberpunk", "sheet", "item"],
    position: { width: 520, height: 480 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/item/item-sheet.hbs" }
  };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    ctx.item = this.document;
    ctx.system = this.document.system;
    ctx.owner = this.document.isOwner;

    switch (this.document.type) {
      case "weapon": this._buildWeaponContext(ctx); break;
      case "armor":  this._buildArmorContext(ctx);  break;
      case "skill":  this._buildSkillContext(ctx);  break;
    }
    return ctx;
  }

  _buildSkillContext(ctx) {
    ctx.stats = getStatNames();
  }

  _buildWeaponContext(ctx) {
    ctx.weaponTypes = Object.values(weaponTypes).sort();
    ctx.attackTypes = this.document.system.weaponType === weaponTypes.melee
      ? Object.values(meleeAttackTypes).sort()
      : sortedAttackTypes;
    ctx.concealabilities = Object.values(concealability);
    ctx.availabilities = Object.values(availability);
    ctx.reliabilities = Object.values(reliability);

    ctx.attackSkills = [
      ...getAttackSkillsForWeapon(this.document.system.weaponType).map(x => localize("Skill" + x)),
      ...(this.document.actor?.getLearnedMartialArts()
        .map(name => localize("Skill" + getMartialKeyByName(name))) || [])
    ];

    if (!ctx.attackSkills.length && this.document.actor) {
      ctx.attackSkills = this.document.actor.itemTypes.skill.map(s => s.name).sort();
    }

    const ammoWT = weaponToAmmoType[this.document.system.weaponType];
    if (ammoWT) {
      const calibers = ammoCalibersByWeaponType[ammoWT] || {};
      const calKeys = Object.keys(calibers);
      ctx.showCaliber = calKeys.length > 0;
      ctx.caliberChoices = calKeys.map(key => ({ value: key, localKey: calibers[key] }));
    } else {
      ctx.showCaliber = false;
      ctx.caliberChoices = [];
    }
  }

  _buildArmorContext(ctx) {
    ctx.armorTypeChoices = [
      { value: "soft", localKey: "CYBERPUNK.ArmorTypeSoft" },
      { value: "hard", localKey: "CYBERPUNK.ArmorTypeHard" }
    ];
  }

  async _processSubmitData(event, form, submitData, options) {
    const data = foundry.utils.expandObject(submitData);
    if (this.document.type === "skill") {
      const fixNum = v => {
        const n = parseInt(v ?? 0, 10);
        return isNaN(n) ? 0 : n;
      };
      foundry.utils.setProperty(data, "system.level", fixNum(foundry.utils.getProperty(data, "system.level")));
    }
    return super._processSubmitData(event, form, foundry.utils.flattenObject(data), options);
  }
}
