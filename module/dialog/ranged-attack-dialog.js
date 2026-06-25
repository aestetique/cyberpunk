import { fireModes } from "../lookups.js";
import { RangeSelectionDialog } from "./range-selection-dialog.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Ranged Attack Dialog — select fire mode before opening attack modifiers.
 * Shows available fire modes based on weapon ROF and ammo status.
 * @extends {ApplicationV2}
 */
export class RangedAttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {Actor} actor
   * @param {Item}  weapon
   * @param {Array} targetTokens
   */
  constructor(actor, weapon, targetTokens = []) {
    super({});
    this.actor = actor;
    this.weapon = weapon;
    this.targetTokens = targetTokens;
  }

  static DEFAULT_OPTIONS = {
    id: "ranged-attack-dialog",
    classes: ["cyberpunk", "ranged-attack-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog: RangedAttackDialog._onCloseDialog,
      pickFireMode: RangedAttackDialog._onPickFireMode,
      reload: RangedAttackDialog._onReload
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/ranged-attack.hbs" }
  };

  static _onCloseDialog(event, _target) {
    event?.preventDefault?.();
    this.close({ animate: false });
  }

  static _onPickFireMode(event, target) {
    event?.preventDefault?.();
    const mode = target?.dataset?.mode;
    if (!mode) return;
    new RangeSelectionDialog(
      this.actor,
      this.weapon,
      fireModes[mode],
      this.targetTokens
    ).render(true);
    this.close({ animate: false });
  }

  static async _onReload(event, _target) {
    event?.preventDefault?.();
    if (typeof this.weapon._reloadFromAttached === "function") {
      await this.weapon._reloadFromAttached();
    }
    this.close({ animate: false });
  }

  async _prepareContext(_options) {
    const wd = this.weapon.weaponData;
    const rof = Number(wd.rof) || 1;
    const ammoLeft = (typeof this.weapon._getAmmoLeft === "function")
      ? this.weapon._getAmmoLeft()
      : (Number(wd.shotsLeft) || 0);
    const shots = Number(wd.shots) || 0;
    const isRanged = (typeof this.weapon._getWeaponType === "function")
      ? this.weapon._getWeaponType() === "Ranged"
      : true;
    const hasAmmoPile = this._hasCompatibleAmmo();
    const canReload = isRanged && hasAmmoPile && ammoLeft < shots;

    return {
      weaponName: this.weapon.name,
      showFullAuto: rof > 3 && ammoLeft > 3,
      showBurst: rof >= 3 && ammoLeft >= 3,
      showTwoRoundBurst: rof === 2 && ammoLeft >= 2,
      showSingleShot: ammoLeft >= 1,
      outOfAmmo: ammoLeft < 1,
      showReload: canReload
    };
  }

  _hasCompatibleAmmo() {
    if (typeof this.weapon._getAttachedAmmo === "function") {
      const ammo = this.weapon._getAttachedAmmo();
      return !!ammo && (Number(ammo.system?.quantity) || 0) > 0;
    }
    return false;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
  }
}
