import { fireModes, ranges } from "../lookups.js";
import { localize, getHiddenLocationsForTargets, resolveTargetActor } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Range Selection Dialog — select range band before opening attack modifiers.
 * @extends {ApplicationV2}
 */
export class RangeSelectionDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  constructor(actor, weapon, fireMode, targetTokens = []) {
    super({});
    this.actor = actor;
    this.weapon = weapon;
    this.fireMode = fireMode;
    this.targetTokens = targetTokens;
    this._dropdownOpen = false;
    this._conditions = { prepared: false, ambush: false, distracted: false, ricochet: false };
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ?? actor.system.stats.luck?.total ?? 0;
    this._selectedLocation = null;
    this._calculatedDistance = this._calculateDistanceToTarget();
    this._selectedRange = this._getAutoRangeFromDistance() || ranges.close;
  }

  static DEFAULT_OPTIONS = {
    id: "range-selection-dialog",
    classes: ["cyberpunk", "range-selection-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:     RangeSelectionDialog._onCloseDialog,
      toggleDropdown:  RangeSelectionDialog._onToggleDropdown,
      pickRange:       RangeSelectionDialog._onPickRange,
      toggleCondition: RangeSelectionDialog._onToggleCondition,
      pickLocation:    RangeSelectionDialog._onPickLocation,
      luckPlus:        RangeSelectionDialog._onLuckPlus,
      luckMinus:       RangeSelectionDialog._onLuckMinus,
      roll:            RangeSelectionDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/range-selection.hbs" }
  };

  static _onCloseDialog(event, _target) { event?.preventDefault?.(); this.close({ animate: false }); }

  static _onToggleDropdown(event, _target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this._dropdownOpen = !this._dropdownOpen;
    this.element.querySelector('.range-dropdown-list')?.classList.toggle('open', this._dropdownOpen);
    this.element.querySelector('.range-dropdown-btn')?.classList.toggle('open', this._dropdownOpen);
  }

  static _onPickRange(event, target) {
    event?.preventDefault?.();
    const rangeKey = target.dataset.range;
    this._selectedRange = rangeKey;
    this._dropdownOpen = false;
    const label = target.textContent.trim();
    const labelEl = this.element.querySelector('.range-dropdown-btn .range-label');
    if (labelEl) labelEl.textContent = label;
    this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
    this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
    this.element.querySelectorAll('.range-option').forEach(el => el.classList.remove('selected'));
    target.classList.add('selected');
  }

  static _onToggleCondition(event, target) {
    event?.preventDefault?.();
    const condition = target?.dataset?.condition;
    if (!condition) return;
    this._conditions[condition] = !this._conditions[condition];
    target.classList.toggle('selected', this._conditions[condition]);
  }

  static _onPickLocation(event, target) {
    event?.preventDefault?.();
    if (target.classList.contains('no-zone')) return;
    const location = target.dataset.location;
    if (this._selectedLocation === location) {
      this._selectedLocation = null;
      target.classList.remove('selected');
    } else {
      this.element.querySelectorAll('.location-btn').forEach(b => b.classList.remove('selected'));
      this._selectedLocation = location;
      target.classList.add('selected');
    }
  }

  static _onLuckPlus(event, _target) {
    event?.preventDefault?.();
    if (this._luckToSpend < this._availableLuck) { this._luckToSpend++; this._updateLuckDisplay(); }
  }

  static _onLuckMinus(event, _target) {
    event?.preventDefault?.();
    if (this._luckToSpend > 0) { this._luckToSpend--; this._updateLuckDisplay(); }
  }

  static _onRoll(event, _target) { event?.preventDefault?.(); this._executeRoll(); }

  async _prepareContext(_options) {
    const weaponRange = this.weapon.weaponData.range || 50;
    const rangeOptions = [
      { key: ranges.pointBlank, distance: 1, label: localize("RangePointBlankLabel") },
      { key: ranges.close, distance: Math.round(weaponRange / 4), label: localize("RangeCloseLabel", { range: Math.round(weaponRange / 4) }) },
      { key: ranges.medium, distance: Math.round(weaponRange / 2), label: localize("RangeMediumLabel", { range: Math.round(weaponRange / 2) }) },
      { key: ranges.long, distance: weaponRange, label: localize("RangeLongLabel", { range: weaponRange }) },
      { key: ranges.extreme, distance: weaponRange * 2, label: localize("RangeExtremeLabel", { range: weaponRange * 2 }) }
    ];
    rangeOptions.forEach(opt => { opt.selected = opt.key === this._selectedRange; });
    const selectedRangeOption = rangeOptions.find(opt => opt.key === this._selectedRange);
    const selectedRangeLabel = selectedRangeOption?.label || "";
    const fireModeLabel = this._getFireModeLabel();
    const isExotic = this.weapon.weaponData.weaponType === "Exotic";

    return {
      fireModeLabel,
      rangeOptions,
      selectedRangeLabel,
      luckToSpend: this._luckToSpend,
      availableLuck: this._availableLuck,
      canIncreaseLuck: this._luckToSpend < this._availableLuck,
      canDecreaseLuck: this._luckToSpend > 0,
      hasAnyLuck: this._availableLuck > 0,
      isSingleShot: this.fireMode === fireModes.singleShot,
      hiddenLocations: getHiddenLocationsForTargets(this.targetTokens),
      isExotic,
      weaponName: this.weapon.name
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    $(document).off('click.rangeDropdown');
    $(document).on('click.rangeDropdown', (ev) => {
      if (!$(ev.target).closest('.range-dropdown').length) {
        this._dropdownOpen = false;
        this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
        this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
      }
    });
  }

  _getFireModeLabel() {
    switch (this.fireMode) {
      case fireModes.fullAuto: return localize("FullAutoLabel");
      case fireModes.threeRoundBurst: return localize("ThreeRoundBurstLabel");
      case fireModes.singleShot: return localize("SingleShotLabel");
      default: return this.fireMode;
    }
  }

  _calculateDistanceToTarget() {
    const actorToken = this.actor.getActiveTokens()?.[0];
    if (!actorToken) return null;
    if (!this.targetTokens.length) return null;
    const targetId = this.targetTokens[0].id;
    const targetToken = canvas.tokens?.get(targetId);
    if (!targetToken) return null;
    try {
      const gridDistance = canvas.grid.measurePath([
        { x: actorToken.center.x, y: actorToken.center.y },
        { x: targetToken.center.x, y: targetToken.center.y }
      ]).distance;
      return Math.round(gridDistance);
    } catch (e) {
      console.warn("Could not calculate distance to target:", e);
      return null;
    }
  }

  _getAutoRangeFromDistance() {
    if (this._calculatedDistance === null) return null;
    const weaponRange = this.weapon.weaponData.range || 50;
    const dist = this._calculatedDistance;
    if (dist <= 1) return ranges.pointBlank;
    if (dist <= weaponRange / 4) return ranges.close;
    if (dist <= weaponRange / 2) return ranges.medium;
    if (dist <= weaponRange) return ranges.long;
    return ranges.extreme;
  }

  _updateLuckDisplay() {
    const luckVal = this.element.querySelector('.luck-value');
    if (luckVal) luckVal.textContent = this._luckToSpend;
    const minusDisabled = this._luckToSpend <= 0;
    const plusDisabled = this._luckToSpend >= this._availableLuck;
    const minusBtn = this.element.querySelector('.luck-minus-btn');
    const plusBtn = this.element.querySelector('.luck-plus-btn');
    minusBtn?.classList.toggle('disabled', minusDisabled);
    plusBtn?.classList.toggle('disabled', plusDisabled);
    minusBtn?.querySelector('img')?.setAttribute('src', `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    plusBtn?.querySelector('img')?.setAttribute('src', `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  async _executeRoll() {
    const fireOptions = {
      fireMode: this.fireMode,
      range: this._selectedRange,
      ambush: this._conditions.ambush,
      ricochet: this._conditions.ricochet,
      extraMod: (this._conditions.prepared ? 2 : 0)
              + (this._conditions.distracted ? -2 : 0)
              + this._luckToSpend,
      aimRounds: 0, blinded: false, dualWield: false, fastDraw: false,
      hipfire: false, running: false, turningToFace: false,
      targetArea: this._selectedLocation || "",
      targetActor: resolveTargetActor(this.targetTokens?.[0])
    };

    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    this.close({ animate: false });
    this.weapon._resolveAttack(fireOptions, this.targetTokens);
    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, `ranged attack (${this.weapon.name})`);
  }

  async close(options) {
    $(document).off('click.rangeDropdown');
    return super.close(options);
  }
}
