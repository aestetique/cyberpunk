import { localize, getHiddenLocationsForTargets, resolveTargetActor } from "../utils.js";
import { getSkillsForCategory, meleeDamageBonus, ramBaseDamage } from "../lookups.js";
import { buildD10Roll, RollBundle } from "../dice.js";
import { rollLocation } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Punch Dialog — attack configuration for unarmed Punch.
 * @extends {ApplicationV2}
 */
export class PunchDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {Actor} actor  The attacking actor
   */
  constructor(actor, { actionKey = "Punch", targetTokens = null } = {}) {
    super({});
    this.actor = actor;
    this.targetTokens = targetTokens || (game.user?.targets ? Array.from(game.user.targets) : []);
    this._actionKey = actionKey;
    const martialKeys = { Kick: "kick", Disarm: "disarm", Sweep: "sweep", Grapple: "grapple", Hold: "hold", Break: "hold", Choke: "choke", Crush: "choke", Throw: "throw", Ram: "ram" };
    this._martialKey = martialKeys[actionKey] || "strike";
    const noDamageActions = ["Disarm", "Sweep", "Grapple", "Hold"];
    // Break, Choke, and Crush use same base damage as Punch, but Crush multiplies by 2
    const baseDmg = noDamageActions.includes(actionKey) ? null
      : actionKey === "Kick" ? actor.system.kickBaseDamage
      : actionKey === "Ram" ? ramBaseDamage(actor.system.stats.bt.total)
      : actor.system.unarmedBaseDamage;

    // Crush doubles the base damage
    this._baseDamage = actionKey === "Crush"
      ? this._multiplyDiceFormula(baseDmg, 2)
      : baseDmg;

    const effectMap = { Sweep: "prone", Grapple: "grapple", Hold: "hold", Throw: "throw" };
    this._weaponEffect = effectMap[actionKey] || "";

    // Skill selector
    this._dropdownOpen = false;
    this._selectedSkill = null;
    this._skillOptions = this._buildSkillOptions();
    if (this._skillOptions.length > 0) {
      this._selectedSkill = this._skillOptions[0];
    }

    // Condition toggles
    this._conditions = {
      prepared: false,
      ambush: false,
      distracted: false,
      indirect: false
    };

    // Location targeting
    this._selectedLocation = null;

    // Choke always targets Head
    if (actionKey === "Choke") {
      this._selectedLocation = "Head";
    }

    // Crush always targets Torso
    if (actionKey === "Crush") {
      this._selectedLocation = "Torso";
    }

    // Luck spending
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ?? actor.system.stats.luck?.total ?? 0;
  }

  /**
   * Helper method to multiply dice formula
   * @param {string} formula - Dice formula like "1d3" or "2d6"
   * @param {number} multiplier - Multiplier for dice count
   * @returns {string} - Multiplied formula like "2d3" or "4d6"
   */
  _multiplyDiceFormula(formula, multiplier) {
    if (!formula) return null;
    const match = formula.match(/^(\d+)d(\d+)$/);
    if (match) {
      const count = Number(match[1]);
      const size = match[2];
      return `${count * multiplier}d${size}`;
    }
    return formula; // Fallback if format doesn't match
  }

  static DEFAULT_OPTIONS = {
    id: "punch-dialog",
    classes: ["cyberpunk", "melee-attack-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
    actions: {
      closeDialog:     PunchDialog._onCloseDialog,
      toggleDropdown:  PunchDialog._onToggleDropdown,
      pickSkill:       PunchDialog._onPickSkill,
      toggleCondition: PunchDialog._onToggleCondition,
      pickLocation:    PunchDialog._onPickLocation,
      luckPlus:        PunchDialog._onLuckPlus,
      luckMinus:       PunchDialog._onLuckMinus,
      roll:            PunchDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/punch-attack.hbs" }
  };

  static _onCloseDialog(event, _target) { event?.preventDefault?.(); this.close({ animate: false }); }

  static _onToggleDropdown(event, _target) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this._dropdownOpen = !this._dropdownOpen;
    this.element.querySelector('.range-dropdown-list')?.classList.toggle('open', this._dropdownOpen);
    this.element.querySelector('.range-dropdown-btn')?.classList.toggle('open', this._dropdownOpen);
  }

  static _onPickSkill(event, target) {
    event?.preventDefault?.();
    const skillId = target.dataset.skillId;
    const selected = this._skillOptions.find(s => s.id === skillId);
    if (!selected) return;
    this._selectedSkill = selected;
    this._dropdownOpen = false;
    const labelEl = this.element.querySelector('.range-dropdown-btn .range-label');
    if (labelEl) labelEl.textContent = selected.label;
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
    if (target.disabled || target.classList.contains('disabled') || target.classList.contains('no-zone')) return;
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

  /**
   * Build skill options from the unarmedAttacks skill mapping.
   * Martial bonus uses the key stored in this._martialKey.
   */
  _buildSkillOptions() {
    const mappedNames = new Set();
    for (const name of getSkillsForCategory("unarmedAttacks")) {
      mappedNames.add(name);
    }

    const options = [];
    for (const skillName of mappedNames) {
      const skill = this.actor.itemTypes.skill.find(s => s.name === skillName);
      if (!skill) continue;

      const skillValue = this.actor.resolveSkillTotal(skillName);
      if (skillValue <= 0) continue;

      let martialBonus = 0;
      if (skill.system.isMartial && skill.system.martial) {
        martialBonus = Number(skill.system.martial[this._martialKey]) || 0;
      }

      const totalDisplay = skillValue + martialBonus;

      options.push({
        id: skill.id,
        name: skill.name,
        stat: skill.system.stat,
        isMartial: skill.system.isMartial,
        value: skillValue,
        martialBonus,
        label: `${skill.name} +${totalDisplay}`
      });
    }

    return options;
  }

  async _prepareContext(_options) {
    const hasSkills = this._skillOptions.length > 0;
    const noDamageActions = ["Disarm", "Sweep", "Grapple", "Hold"];
    // Choke and Crush hide location selector (target Head/Torso automatically)
    const showLocation = !noDamageActions.includes(this._actionKey)
                      && this._actionKey !== "Choke"
                      && this._actionKey !== "Crush"
                      && this._actionKey !== "Throw"
                      && this._actionKey !== "Ram";

    // Break: show location with Head/Torso disabled, location required
    const isBreak = this._actionKey === "Break";
    const locationRequired = isBreak;
    const disabledLocations = isBreak ? ["Head", "Torso"] : [];

    return {
      actionLabel: localize(this._actionKey),
      skills: this._skillOptions,
      hasSkills,
      selectedSkillLabel: this._selectedSkill?.label || localize("NoSkillsBonus"),
      noSkillsLabel: localize("NoSkillsBonus"),
      showLocation,
      locationRequired,
      disabledLocations,
      hiddenLocations: getHiddenLocationsForTargets(this.targetTokens),
      // Luck data
      luckToSpend: this._luckToSpend,
      availableLuck: this._availableLuck,
      canIncreaseLuck: this._luckToSpend < this._availableLuck,
      canDecreaseLuck: this._luckToSpend > 0,
      hasAnyLuck: this._availableLuck > 0,
      luckDisabled: this._availableLuck <= 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    $(document).off('click.punchDialogDropdown');
    $(document).on('click.punchDialogDropdown', (ev) => {
      if (!$(ev.target).closest('.range-dropdown').length) {
        this._dropdownOpen = false;
        this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
        this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
      }
    });
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
    minusBtn?.querySelector('img')?.setAttribute('src',
      `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    plusBtn?.querySelector('img')?.setAttribute('src',
      `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  /**
   * Execute the punch attack — roll attack, damage, location, post chat message.
   */
  async _executeRoll() {
    // Special handling for Ram attack (movement-based)
    if (this._actionKey === "Ram") {
      return this._executeRamRoll();
    }

    // Validate: Break requires location selection
    if (this._actionKey === "Break" && !this._selectedLocation) {
      ui.notifications.warn(localize("MustSelectLimbForBreak"));
      return;
    }

    const system = this.actor.system;

    // Spend luck if any was used
    if (this._luckToSpend > 0) {
      const currentSpent = system.stats.luck.spent || 0;
      const currentSpentAt = system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    this.close({ animate: false });

    // === ATTACK ROLL ===
    const isBlinded = this.actor.statuses.has("blinded");
    const attackStat = isBlinded ? "luck" : "ref";

    const extraMod = (this._conditions.prepared ? 2 : 0)
                   + (this._conditions.ambush ? 5 : 0)
                   + (this._conditions.distracted ? -2 : 0)
                   + (this._conditions.indirect ? -5 : 0)
                   + (this._selectedLocation && this._actionKey !== "Break" && this._actionKey !== "Choke" && this._actionKey !== "Crush" ? -4 : 0)
                   + this._luckToSpend;

    const attackTerms = [`@stats.${attackStat}.total`];

    // Add skill value
    let skillValue = 0;
    if (this._selectedSkill) {
      skillValue = this._selectedSkill.value;
      if (skillValue) attackTerms.push(skillValue);

      // Martial bonus
      if (this._selectedSkill.martialBonus) {
        attackTerms.push(this._selectedSkill.martialBonus);
      }
    }

    if (extraMod) attackTerms.push(extraMod);

    // Status penalties
    if (this.actor.statuses.has("fast-draw")) attackTerms.push(-3);
    if (this.actor.statuses.has("action-surge")) attackTerms.push(-3);
    if ((this.actor.system.humanityLoss?.obsession ?? 0) >= 51) attackTerms.push(-4);

    // Grappling/Restrained penalties don't apply to grappling actions
    const grapplingActions = ["Hold", "Break", "Choke", "Crush", "Throw"];
    const isGrapplingAction = grapplingActions.includes(this._actionKey);

    if (this.actor.statuses.has("restrained") && !isGrapplingAction) attackTerms.push(-2);
    if (this.actor.statuses.has("grappling") && !isGrapplingAction) attackTerms.push(-2);
    if (this.actor.statuses.has("prone")) attackTerms.push(-2);

    const attackRoll = await buildD10Roll(attackTerms, system).evaluate();

    // Trigger Dice So Nice for attack roll
    if (game.dice3d) {
      await game.dice3d.showForRoll(attackRoll, game.user, true);
    }

    // Check for fumble (natural 1)
    const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
    if (isNatural1) {
      await this.actor.rollFumble();
    }

    // Grant IP on non-fumble (unarmed is contested, no DC)
    let ipGained = 0;
    if (!isNatural1 && this._selectedSkill) {
      ipGained = await this.actor.grantCombatIP(attackRoll, this._selectedSkill.name);
    }

    // === DAMAGE & LOCATION ROLLS (skip for damageless actions like Disarm) ===
    let areaDamages = {};
    let hitLocation = "";

    if (this._baseDamage) {
      let baseDamageFormula = this._baseDamage;
      const mult = system.unarmedDamageMultiplier;
      if (mult > 1) {
        // Parse formula and multiply dice count
        const diceMatch = baseDamageFormula.match(/^(\d+)d(\d+)$/);
        if (diceMatch) {
          const diceCount = Number(diceMatch[1]);
          const diceSize = diceMatch[2];
          baseDamageFormula = `${diceCount * mult}d${diceSize}`;
        } else {
          // Fallback for complex formulas (shouldn't happen with new system)
          baseDamageFormula = `(${baseDamageFormula})*${mult}`;
        }
      }

      const baseDamageRoll = await new Roll(baseDamageFormula).evaluate();

      if (game.dice3d && baseDamageRoll.dice.length > 0) {
        await game.dice3d.showForRoll(baseDamageRoll, game.user, true);
      }

      const strengthBonus = meleeDamageBonus(system.stats.bt.total);
      const martialDamageBonus = this._selectedSkill?.isMartial ? this._selectedSkill.value : 0;
      const totalDamage = Math.floor(baseDamageRoll.total) + strengthBonus + martialDamageBonus;

      // Build clean display formula (no floor wrapper, omit zero bonuses)
      const displayParts = [baseDamageFormula];
      if (strengthBonus) displayParts.push(String(strengthBonus));
      if (martialDamageBonus) displayParts.push(String(martialDamageBonus));
      const displayFormula = displayParts.join(' + ');

      // Location roll
      const targetActor = resolveTargetActor(this.targetTokens?.[0]);
      const locationRoll = await rollLocation(targetActor, this._selectedLocation);
      hitLocation = locationRoll.areaHit;

      // Build areaDamages
      areaDamages = {};
      areaDamages[hitLocation] = [{
        damage: totalDamage,
        formula: displayFormula,
        dice: baseDamageRoll.dice.map(term => ({
          faces: term.faces,
          results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
        })),
        ignoreArmor: this._actionKey === "Break" || this._actionKey === "Choke" || this._actionKey === "Crush" || this._actionKey === "Throw",
        rollD10: this._selectedLocation ? 0 : (locationRoll.roll?.total ?? 0),
        pickedZone: this._selectedLocation ? hitLocation : null
      }];
    }

    // === CHAT MESSAGE ===
    const templateData = {
      actionIcon: "ref",
      fireModeLabel: localize(this._actionKey),
      attackRoll: attackRoll,
      hasDamage: !!this._baseDamage,
      hasApply: !!this._baseDamage || !!this._weaponEffect,
      areaDamages: areaDamages,
      weaponName: localize("UnarmedAttack"),
      weaponImage: "systems/cyberpunk/img/ui/unarmed.svg",
      weaponType: "Melee · 1 m",
      loadedAmmoType: "standard",
      damageType: "blunt",
      weaponEffect: this._weaponEffect,
      hasEffect: !!this._weaponEffect,
      effectIcon: { prone: "prone", grapple: "restrained", hold: "immobilized", throw: "prone" }[this._weaponEffect] || null,
      effectLabel: { prone: localize("Conditions.Prone"), grapple: localize("Conditions.Restrained"), hold: localize("Conditions.Immobilized"), throw: localize("Conditions.Prone") }[this._weaponEffect] || null,
      hitLocation: hitLocation,
      ipGained: ipGained
    };

    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    new RollBundle(localize(this._actionKey))
      .execute(speaker, "systems/cyberpunk/templates/chat/melee-hit.hbs", templateData);

    // Register action for unarmed attacks AFTER executing
    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, `unarmed: ${this._actionLabel}`);
  }

  /**
   * Execute Ram attack with movement-based mechanics
   */
  async _executeRamRoll() {
    const system = this.actor.system;

    // Spend luck if any was used
    if (this._luckToSpend > 0) {
      const currentSpent = system.stats.luck.spent || 0;
      const currentSpentAt = system.stats.luck.spentAt;
      await this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    // Close dialog
    this.close({ animate: false });

    // Minimize all open windows
    Object.values(ui.windows).forEach(w => w.minimize());

    // Get starting position
    const actorToken = this.actor.getActiveTokens()?.[0];
    if (!actorToken) {
      ui.notifications.error(localize("NoTokenForRam"));
      return;
    }

    const startPos = { x: actorToken.center.x, y: actorToken.center.y };

    // Show movement ruler and get destination
    let destination;
    try {
      destination = await this._placeRamDestination(actorToken);
    } catch (e) {
      return; // User cancelled
    }

    // Move token to destination (convert center position to top-left corner)
    await actorToken.document.update({
      x: destination.x - (actorToken.document.width * canvas.grid.size) / 2,
      y: destination.y - (actorToken.document.height * canvas.grid.size) / 2
    });

    // Calculate distance moved (in meters).
    // V14 removed canvas.grid.measureDistance; use measurePath().distance.
    const distanceMoved = canvas.grid.measurePath([startPos, destination]).distance;

    // Calculate distance-based modifiers
    const runDistance = system.stats.ma.run;
    const walkDistance = system.stats.ma.total;

    const quarterRun = runDistance / 4;
    const thirdRun = runDistance / 3;
    const halfRun = runDistance / 2;

    let distancePenalty = 0;
    let distanceBonus = 0;

    if (distanceMoved >= halfRun) {
      distancePenalty = -6;
      distanceBonus = Math.floor(walkDistance / 2);
    } else if (distanceMoved >= thirdRun) {
      distancePenalty = -4;
      distanceBonus = Math.floor(walkDistance / 3);
    } else if (distanceMoved >= quarterRun) {
      distancePenalty = -2;
      distanceBonus = Math.floor(walkDistance / 4);
    }
    // else: no penalty, no bonus

    // === ATTACK ROLL ===
    const isBlinded = this.actor.statuses.has("blinded");
    const attackStat = isBlinded ? "luck" : "ref";

    const extraMod = (this._conditions.prepared ? 2 : 0)
                   + (this._conditions.ambush ? 5 : 0)
                   + (this._conditions.distracted ? -2 : 0)
                   + (this._conditions.indirect ? -5 : 0)
                   + distancePenalty  // Ram distance penalty
                   + this._luckToSpend;

    const attackTerms = [`@stats.${attackStat}.total`];

    // Add skill value and martial bonus
    let skillValue = 0;
    let martialBonus = 0;
    if (this._selectedSkill) {
      skillValue = this._selectedSkill.value;
      if (skillValue) attackTerms.push(skillValue);

      // Martial bonus (only if Ram aspect > 0)
      if (this._selectedSkill.martialBonus) {
        martialBonus = this._selectedSkill.martialBonus;
        attackTerms.push(martialBonus);
      }
    }

    if (extraMod) attackTerms.push(extraMod);

    // Status penalties (no grappling exception for Ram)
    if (this.actor.statuses.has("fast-draw")) attackTerms.push(-3);
    if (this.actor.statuses.has("action-surge")) attackTerms.push(-3);
    if (this.actor.statuses.has("restrained")) attackTerms.push(-2);
    if (this.actor.statuses.has("grappling")) attackTerms.push(-2);
    if (this.actor.statuses.has("prone")) attackTerms.push(-2);
    if ((this.actor.system.humanityLoss?.obsession ?? 0) >= 51) attackTerms.push(-4);

    const attackRoll = await buildD10Roll(attackTerms, system).evaluate();

    // Trigger Dice So Nice
    if (game.dice3d) {
      await game.dice3d.showForRoll(attackRoll, game.user, true);
    }

    // Check for fumble
    const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
    if (isNatural1) {
      await this.actor.rollFumble();
    }

    // Grant IP on non-fumble (Ram is contested, no DC)
    let ipGained = 0;
    if (!isNatural1 && this._selectedSkill) {
      ipGained = await this.actor.grantCombatIP(attackRoll, this._selectedSkill.name);
    }

    // === DAMAGE ROLL ===
    const baseDamageFormula = this._baseDamage;  // Already set to ramBaseDamage in constructor
    const baseDamageRoll = await new Roll(baseDamageFormula).evaluate();

    if (game.dice3d && baseDamageRoll.dice.length > 0) {
      await game.dice3d.showForRoll(baseDamageRoll, game.user, true);
    }

    // Total damage: base + martial skill (if Ram aspect > 0) + distance bonus
    const martialDamageBonus = (martialBonus > 0) ? skillValue : 0;
    const totalDamage = Math.floor(baseDamageRoll.total) + martialDamageBonus + distanceBonus;

    // Build clean display formula
    const displayParts = [baseDamageFormula];
    if (martialDamageBonus) displayParts.push(String(martialDamageBonus));
    if (distanceBonus) displayParts.push(String(distanceBonus));
    const displayFormula = displayParts.join(' + ');

    // Random location roll
    const targetActor = this.targetTokens?.[0]?.actor || null;
    const locationRoll = await rollLocation(targetActor, null);
    const hitLocation = locationRoll.areaHit;

    // Build areaDamages
    const areaDamages = {};
    areaDamages[hitLocation] = [{
      damage: totalDamage,
      formula: displayFormula,
      dice: baseDamageRoll.dice.map(term => ({
        faces: term.faces,
        results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
      })),
      ignoreArmor: false,  // Ram does NOT ignore armor
      rollD10: locationRoll.roll?.total ?? 0,
      pickedZone: null
    }];

    // === CHAT MESSAGE ===
    const templateData = {
      actionIcon: "ref",
      fireModeLabel: localize("Ram"),
      attackRoll: attackRoll,
      hasDamage: true,
      hasApply: true,
      areaDamages: areaDamages,
      weaponName: localize("UnarmedAttack"),
      weaponImage: "systems/cyberpunk/img/ui/unarmed.svg",
      weaponType: "Melee · 1 m",
      loadedAmmoType: "standard",
      damageType: "blunt",
      weaponEffect: "",
      hasEffect: false,
      effectIcon: null,
      effectLabel: null,
      hitLocation: hitLocation,
      ipGained: ipGained
    };

    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    new RollBundle(localize("Ram"))
      .execute(speaker, "systems/cyberpunk/templates/chat/melee-hit.hbs", templateData);

    // Register action for Ram attack AFTER executing
    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, `unarmed: Ram`);
  }

  /**
   * Place destination for Ram attack using movement ruler
   * @param {Token} actorToken - The actor's token
   * @returns {Promise<{x: number, y: number}>} Destination position
   */
  async _placeRamDestination(actorToken) {
    return new Promise((resolve, reject) => {
      const handlers = {};
      let hoveredPos = null;
      let ruler = null;

      // Create ruler visualization
      const startPos = actorToken.center;

      // Get movement distances for color coding
      const walkDistance = this.actor.system.stats?.ma?.total ?? 0;
      const runDistance = this.actor.system.stats?.ma?.run ?? (walkDistance * 3);

      // Mouse move - show ruler to cursor.
      // V14 removed getSnappedPosition / measureDistance; use new APIs.
      handlers.mm = (event) => {
        event.stopPropagation();
        const pos = event.getLocalPosition(canvas.tokens);
        const M = CONST.GRID_SNAPPING_MODES;
        const snapped = canvas.grid.getSnappedPoint(
          { x: pos.x, y: pos.y },
          { mode: M.CENTER | M.VERTEX, resolution: 2 }
        );
        hoveredPos = snapped;

        // Calculate distance for color coding
        const distance = canvas.grid.measurePath([startPos, snapped]).distance;

        // Determine color based on distance (same as CyberpunkTokenRuler)
        let color;
        if (distance <= walkDistance) {
          color = 0x1A804D;  // Green - within walk range
        } else if (distance <= runDistance) {
          color = 0xB8A46A;  // Yellow - requires running
        } else {
          color = 0xB60F3C;  // Red - exceeds run distance
        }

        // Update ruler visualization
        if (!ruler) {
          ruler = new PIXI.Graphics();
          canvas.controls.addChild(ruler);
        }

        ruler.clear();
        ruler.lineStyle(5, color, 0.8);
        ruler.moveTo(startPos.x, startPos.y);
        ruler.lineTo(snapped.x, snapped.y);
      };

      // Left click - confirm destination
      handlers.lc = (event) => {
        if (hoveredPos) {
          cleanup();
          resolve(hoveredPos);
        }
      };

      // Right click - cancel
      handlers.rc = (event) => {
        event.preventDefault();
        cleanup();
        reject(new Error("cancelled"));
      };

      // Escape key - cancel
      handlers.esc = (event) => {
        if (event.key === "Escape") {
          cleanup();
          reject(new Error("cancelled"));
        }
      };

      function cleanup() {
        canvas.stage.off("pointermove", handlers.mm);
        canvas.stage.off("pointerdown", handlers.lc);
        canvas.app.view.removeEventListener("contextmenu", handlers.rc);
        document.removeEventListener("keydown", handlers.esc);
        if (ruler) {
          canvas.controls.removeChild(ruler);
          ruler.destroy();
        }
      }

      canvas.stage.on("pointermove", handlers.mm);
      canvas.stage.once("pointerdown", handlers.lc);
      canvas.app.view.addEventListener("contextmenu", handlers.rc);
      document.addEventListener("keydown", handlers.esc);

      ui.notifications.info(localize("ClickRamDestination"));
    });
  }

  /** @override */
  close(options) {
    $(document).off('click.punchDialogDropdown');
    return super.close(options);
  }
}
