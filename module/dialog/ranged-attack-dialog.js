import { fireModes } from "../lookups.js";
import { RangeSelectionDialog } from "./range-selection-dialog.js";

/**
 * Ranged Attack Dialog — select fire mode before opening attack modifiers.
 * Shows available fire modes based on weapon ROF and ammo status.
 */
export class RangedAttackDialog extends Application {

  /**
   * @param {Actor} actor        The owning actor
   * @param {Item}  weapon       The weapon item to fire
   * @param {Array} targetTokens Array of target token data
   */
  constructor(actor, weapon, targetTokens = []) {
    super();
    this.actor = actor;
    this.weapon = weapon;
    this.targetTokens = targetTokens;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "ranged-attack-dialog",
      classes: ["cyberpunk", "ranged-attack-dialog"],
      template: "systems/cyberpunk/templates/dialog/ranged-attack.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: false,
      resizable: false
    });
  }

  /** @override */
  getData() {
    const wd = this.weapon.weaponData;
    const rof = Number(wd.rof) || 1;
    // Use the resource abstraction so Exotic weapons (charges) work too.
    const ammoLeft = (typeof this.weapon._getAmmoLeft === "function")
      ? this.weapon._getAmmoLeft()
      : (Number(wd.shotsLeft) || 0);
    const shots = Number(wd.shots) || 0;
    // Reload makes sense only when there's an ammo pile AND the magazine
    // isn't already full. Exotic has no pile concept → never reloadable.
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

  /**
   * Whether this weapon has an attached ammo pile with at least one round in it.
   * Used to drive showReload (along with the "not full" check).
   */
  _hasCompatibleAmmo() {
    if (typeof this.weapon._getAttachedAmmo === "function") {
      const ammo = this.weapon._getAttachedAmmo();
      return !!ammo && (Number(ammo.system?.quantity) || 0) > 0;
    }
    return false;
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Make header draggable
    const header = html.find('.reload-header')[0];
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, html, header, false);
    }

    // Close button
    html.find('.header-control.close').click(() => this.close());

    // Fire mode buttons
    html.find('.fire-mode-btn[data-mode]').click(ev => {
      const mode = ev.currentTarget.dataset.mode;
      this._openModifiersWithMode(mode);
    });

    // Reload button — refill from attached ammo pile (no dialog).
    html.find('.reload-btn').click(async () => {
      if (typeof this.weapon._reloadFromAttached === "function") {
        await this.weapon._reloadFromAttached();
      }
      this.close();
    });
  }

  /**
   * Open the RangeSelectionDialog with a pre-selected fire mode
   * @param {string} fireMode - The fire mode key (fullAuto, threeRoundBurst, singleShot)
   */
  _openModifiersWithMode(fireMode) {
    new RangeSelectionDialog(
      this.actor,
      this.weapon,
      fireModes[fireMode],
      this.targetTokens
    ).render(true);
    this.close();
  }
}
