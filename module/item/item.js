import { weaponTypes, rangedAttackTypes, meleeAttackTypes, fireModes, ranges, rangeDCs, rangeResolve, attackSkills, martialActions, meleeDamageBonus, exoticEffects } from "../lookups.js"
import { RollBundle, buildD10Roll }  from "../dice.js"
import { clamp, getByPath, localize, formatLocale, rollLocation } from "../utils.js"
import { CyberpunkActor } from "../actor/actor.js";

/**
 * Item document for the Cyberpunk 2020 system.
 * @extends {Item}
 */
export class CyberpunkItem extends Item {

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Set default placeholder image based on item type
    const placeholders = {
      skill: "systems/cyberpunk/img/svg/placeholder-skill.svg",
      weapon: "systems/cyberpunk/img/svg/placeholder-weapon.svg",
      armor: "systems/cyberpunk/img/svg/placeholder-armor.svg",
      cyberware: "systems/cyberpunk/img/svg/placeholder-cyberware.svg",
      vehicle: "systems/cyberpunk/img/svg/placeholder-vehicle.svg",
      misc: "systems/cyberpunk/img/svg/placeholder-gear.svg",
      ammo: "systems/cyberpunk/img/svg/placeholder-ammo.svg",
      program: "systems/cyberpunk/img/svg/placeholder-program.svg",
      role: "systems/cyberpunk/img/svg/placeholder-role.svg",
      ordnance: "systems/cyberpunk/img/svg/placeholder-ordnance.svg",
      tool: "systems/cyberpunk/img/svg/placeholder-tool.svg",
      drug: "systems/cyberpunk/img/svg/placeholder-drug.svg"
    };

    const placeholder = placeholders[data.type];
    // Only set if no custom image provided (Foundry default or empty)
    if (placeholder && (!data.img || data.img === "icons/svg/mystery-man.svg")) {
      this.updateSource({ img: placeholder });
    }
  }

  prepareData() {
    super.prepareData();

    switch(this.type) {
      case "weapon":
        this._prepareWeaponData(this.system);
        break;
      case "armor":
        this._prepareArmorData(this.system);
        break;
    }
  }

  /**
   * Get the weapon data sub-object.
   * For regular weapons, this is `this.system`.
   * For cyberware weapons, this is `this.system.weapon`.
   */
  get weaponData() {
    return (this.type === "cyberware" && this.system.isWeapon) ? this.system.weapon : this.system;
  }

  /**
   * Build the correct Foundry update path for a weapon field.
   * For regular weapons: "system.{field}". For cyberware: "system.weapon.{field}".
   */
  _weaponUpdatePath(field) {
    return (this.type === "cyberware") ? `system.weapon.${field}` : `system.${field}`;
  }

  isRanged() {
    const wd = this.weaponData;
    return !((wd.weaponType === "Melee") || (wd.weaponType === "Exotic" && Object.keys(meleeAttackTypes).includes(wd.attackType)));
  }

  _prepareWeaponData(data) {

  }

  /**
   * Calculate Minimum Body penalty for this weapon.
   * If the wielder's BODY stat is below the weapon's minimumBody,
   * they suffer an accuracy penalty and halved rate of fire.
   * @returns {{ accuracyPenalty: number, rofMultiplier: number }}
   */
  _getMinBodyPenalty() {
    const minBody = this.weaponData.minimumBody || 0;
    if (!minBody || !this.actor) return { accuracyPenalty: 0, rofMultiplier: 1 };
    const body = this.actor.system.stats?.bt?.total || 0;
    const deficit = minBody - body;
    if (deficit <= 0) return { accuracyPenalty: 0, rofMultiplier: 1 };
    return {
      accuracyPenalty: -(2 * deficit),
      rofMultiplier: 0.5
    };
  }

  _prepareArmorData(system) {
    if (!this.actor) return;

    // If new owner and armor covers this many areas or more, delete armor coverage areas the owner does not have
    const COVERAGE_CLEANSE_THRESHOLD = 20;

    let nowOwned = !system.lastOwnerId;
    let changedHands = system.lastOwnerId !== undefined && system.lastOwnerId != this.actor.id;
    if(nowOwned || changedHands) {
      system.lastOwnerId = this.actor.id;
      let ownerLocs = this.actor.system.hitLocations;
      
      // Time to morph the armor to its new owner!
      // I just want this here so people can armor up giant robotic snakes if they want, y'know? or mechs.
      // ...I am fully aware this is overkill effort for most games.
      let areasCovered = Object.keys(system.coverage).length;
      let cleanseAreas = areasCovered > COVERAGE_CLEANSE_THRESHOLD;
      if(cleanseAreas) {
        // Remove any extra areas
        // This is so that armors can't be made bigger indefinitely. No idea why players might do that, but hey.
        for(let armorArea in system.coverage) {
          if(!ownerLocs[armorArea]) {
            console.warn(`ARMOR MORPH: The new owner of this armor (${this.actor.name}) does not have a ${armorArea}. Removing the area from the armor.`)
            delete system.coverage[armorArea];
          }
        }
      }
      
      // TODO: Strict bodytypes option?
      // Add any areas the owner has but the armor doesn't.
      for(let ownerLoc in ownerLocs) {
        if(!system.coverage[ownerLoc]) {
          system.coverage[ownerLoc] = {
            stoppingPower: 0,
            ablation: 0
          }
        }
      }
    }
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    // This is where the item would make a roll in the chat or something like that.
    switch (this.type) {
      case "weapon":
        this._resolveAttack();
        break;
      case "ordnance":
        this._fireOrdnance();
        break;

      default:
        break;
    }
  }

  // TODO: For 0.8.1, we want to also add flavor text to the different modifiers
  // Get the roll modifiers to add when given a certain set of modifiers
  _rangedModifiers({
    aimRounds,
    ambush,
    blinded,
    dualWield,
    fastDraw,
    hipfire,
    ricochet,
    running,
    targetArea,
    turningToFace,
    range,
    fireMode,
    extraMod
  }) {
    let terms = []
    if(!!targetArea) {
      terms.push(-4);
    }
    // Aiming bonus
    if(aimRounds && aimRounds > 0) {
      terms.push(aimRounds);
    }
    if(ambush) {
      terms.push(5);
    }
    if(blinded) {
      terms.push(-3);
    }
    if(dualWield) {
      terms.push(-3);
    }
    if(fastDraw) {
      terms.push(-3);
    }
    if(hipfire) {
      terms.push(-2);
    }
    if(ricochet) {
      terms.push(-5);
    }
    if(running) {
      terms.push(-3);
    }
    if(turningToFace) {
      terms.push(-2);
    }

    // Range on its own doesn't actually apply a modifier - it only affects to-hit rolls. But it does affect certain fire modes.
    // For now assume full auto = all bullets; spray and pray
    // +1/-1 per 10 bullets fired. + if close, - if medium onwards.
    // Friend's copy of the rulebook states penalties/bonus for all except point blank
    if(fireMode === fireModes.fullAuto) {
      let bullets = Math.min(this.system.shotsLeft, this.system.rof);
      // If close range, add, else subtract
      let multiplier = 
          (range === ranges.close) ? 1 
        : (range === ranges.pointBlank) ? 0 
        : -1;
      terms.push(multiplier * Math.floor(bullets/10))
    }

    // +3 mod for 3-round-burst at close or medium range
    if(fireMode === fireModes.threeRoundBurst
      && (range === ranges.close || range === ranges.medium)) {
        terms.push(+3);
    }

    // We always want to push extraMod, making it explicit it's ALWAYS there even with 0
    terms.push(extraMod || 0);

    return terms;
  }

  // Melee mods are a lot...simpler? I could maybe add swept or something, or opponent dodging. That'll be best once choosing targets is done
  _meleeModifiers({extraMod}) {
    return [extraMod];
  }

  // Resolve a weapon attack roll — fire mode dispatch + hit/damage processing
  // See `modifiers.js` for the modifier object structure
  _resolveAttack(attackMods, targetTokens) {
    let owner = this.actor;
    const wd = this.weaponData;

    if (owner === null) {
      throw new Error("This item isn't owned by anyone.");
    }

    // Melee weapons don't consume ammo — dispatch immediately
    let isRanged = this.isRanged();
    if(!isRanged) {
      if (wd.attackType === meleeAttackTypes.martial) {
        return this._executeMartialAction(attackMods);
      }
      else {
        return this._executeMeleeStrike(attackMods);
      }
    }

    // Check ammo/charges for ranged weapons
    const isExotic = wd.weaponType === "Exotic";
    const ammoLeft = isExotic ? (wd.charges || 0) : wd.shotsLeft;
    if (ammoLeft <= 0) {
      const msgKey = isExotic ? "NoCharges" : "NoAmmo";
      ui.notifications.warn(localize(msgKey));
      return false;
    }

    // ---- Firemode-specific rolling. I may roll together some common aspects later ----
    // Full auto
    if(attackMods.fireMode === fireModes.fullAuto) {
      return this._fireFullAuto(attackMods, targetTokens);
    }
    // Three-round burst. Shares... a lot in common with full auto actually
    else if(attackMods.fireMode === fireModes.threeRoundBurst) {
      return this._fireBurst(attackMods);
    }
    else if(attackMods.fireMode === fireModes.singleShot) {
      return this._fireSingle(attackMods);
    }
    else if(attackMods.fireMode === fireModes.suppressive) {
      return this._fireSuppressive(attackMods);
    }
  }

  _availableFireModes() {
    if (this.type !== "weapon" && !(this.type === "cyberware" && this.system.isWeapon)) {
      console.error(`${this.name} is not a weapon, and therefore has no fire modes`)
      return [];
    }
    const wd = this.weaponData;
    if (wd.attackType === rangedAttackTypes.auto || wd.attackType === rangedAttackTypes.autoshotgun){
      return [fireModes.fullAuto, fireModes.suppressive, fireModes.threeRoundBurst, fireModes.singleShot];
    }
    return [fireModes.singleShot];
  }

  /**
   * Get the localized label for a fire mode
   * @param {string} fireMode - The fire mode key (e.g., "FullAuto", "ThreeRoundBurst")
   * @returns {string} The localized label
   */
  static getFireModeLabel(fireMode) {
    const labels = {
      [fireModes.fullAuto]: localize("FullAutoLabel"),
      [fireModes.threeRoundBurst]: localize("ThreeRoundBurstLabel"),
      [fireModes.singleShot]: localize("SingleShotLabel"),
      [fireModes.suppressive]: localize("SuppressiveLabel")
    };
    return labels[fireMode] || fireMode;
  }

  /**
   * Get the localized label for a range bracket
   * @param {string} range - The range key (e.g., "RangePointBlank", "RangeClose")
   * @param {number} actualRange - The actual range value in meters
   * @returns {string} The localized label
   */
  static getRangeLabel(range, actualRange) {
    const labels = {
      [ranges.pointBlank]: localize("RangePointBlankLabel"),
      [ranges.close]: formatLocale("RangeCloseLabel", { range: actualRange }),
      [ranges.medium]: formatLocale("RangeMediumLabel", { range: actualRange }),
      [ranges.long]: formatLocale("RangeLongLabel", { range: actualRange }),
      [ranges.extreme]: formatLocale("RangeExtremeLabel", { range: actualRange })
    };
    return labels[range] || range;
  }

  // Roll just the attack roll of a weapon, return it
  async rollToHit(attackMods) {
    const wd = this.weaponData;
    let isRanged = this.isRanged();

    // Blinded attackers use LUCK instead of REF for all attacks
    const isBlinded = this.actor?.statuses?.has("blinded");
    const attackStat = isBlinded ? "luck" : "ref";

    let attackTerms = [`@stats.${attackStat}.total`];
    // Resolve attack skill: use explicit field, or fall back to first mapped skill for the weapon type
    const resolvedSkill = wd.attackSkill || (attackSkills[wd.weaponType] || [])[0] || "";
    if(resolvedSkill) {
      attackTerms.push(`@attackSkill`);
    }
    if(isRanged) {
      attackTerms.push(...(this._rangedModifiers(attackMods)));
    }
    else {
      attackTerms.push(...(this._meleeModifiers(attackMods)));
    }
    if(wd.accuracy) {
      attackTerms.push(wd.accuracy);
    }

    // Fast Draw: -3 penalty on attack rolls
    if(this.actor.statuses.has("fast-draw")) {
      attackTerms.push(-3);
    }

    // Action Surge: -3 penalty on all weapon rolls
    if(this.actor.statuses.has("action-surge")) {
      attackTerms.push(-3);
    }

    // Restrained: -2 penalty on all checks
    if(this.actor.statuses.has("restrained")) {
      attackTerms.push(-2);
    }

    // Grappling: -2 penalty on all checks
    if(this.actor.statuses.has("grappling")) {
      attackTerms.push(-2);
    }

    // Minimum Body penalty: -2 per point of BODY deficit
    const minBodyPenalty = this._getMinBodyPenalty();
    if (minBodyPenalty.accuracyPenalty) {
      attackTerms.push(minBodyPenalty.accuracyPenalty);
    }

    return await buildD10Roll(attackTerms, {
      stats: this.actor.system.stats,
      attackSkill: this.actor.resolveSkillTotal(resolvedSkill)
    }).evaluate();
  }

  /**
   * Fire an automatic weapon at full auto
   * @param {*} attackMods The modifiers for an attack. fireMode, ambush, etc - look in lookups.js for the specification of these
   * @returns
   */
  async _fireFullAuto(attackMods, targetTokens) {
      const wd = this.weaponData;
      // The kind of distance we're attacking at, so we can display Close: <50m or something like that
      let actualRangeBracket = rangeResolve[attackMods.range](wd.range);
      let DC = rangeDCs[attackMods.range];
      let targetCount = targetTokens.length || attackMods.targetsCount || 1;

      // Minimum Body penalty halves effective ROF
      const minBodyPenalty = this._getMinBodyPenalty();
      const effectiveRof = Math.max(1, Math.floor(wd.rof * minBodyPenalty.rofMultiplier));

      // This is a somewhat flawed multi-target thing - given target tokens, we could calculate distance (& therefore penalty) for each, and apply damage to them
      let rolls = [];
      let fumbleTriggered = false;
      for (let i = 0; i < targetCount; i++) {
          let attackRoll = await this.rollToHit(attackMods);

          // Trigger Dice So Nice for attack roll
          if (game.dice3d) {
              await game.dice3d.showForRoll(attackRoll, game.user, true);
          }

          // Check for fumble (natural 1 on attack roll) - only trigger once per burst
          const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
          if (isNatural1 && this.actor && !fumbleTriggered) {
              await this.actor.rollFumble(wd.reliability);
              fumbleTriggered = true;
          }

          let roundsFired = Math.min(wd.shotsLeft, effectiveRof / targetCount);
          await this.update({[this._weaponUpdatePath("shotsLeft")]: wd.shotsLeft - roundsFired});
          let roundsHit = isNatural1 ? 0 : Math.min(roundsFired, attackRoll.total - DC);
          if (roundsHit < 0) {
              roundsHit = 0;
          }
          let areaDamages = {};
          let allDamageRolls = [];
          // Roll damage for each of the bullets that hit
          for (let j = 0; j < roundsHit; j++) {
              let damageRoll = await new Roll(wd.damage).evaluate();
              allDamageRolls.push(damageRoll);
              let location = (await rollLocation(attackMods.targetActor, attackMods.targetArea)).areaHit;
              if (!areaDamages[location]) {
                  areaDamages[location] = [];
              }
              areaDamages[location].push({
                  damage: damageRoll.total,
                  formula: damageRoll.formula,
                  dice: damageRoll.terms.filter(t => t.results).map(term => ({
                      faces: term.faces,
                      results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
                  }))
              });
          }
          // Show all damage dice at once
          if (game.dice3d && allDamageRolls.length > 0) {
              await Promise.all(allDamageRolls.map(roll =>
                  game.dice3d.showForRoll(roll, game.user, true, null, false)
              ));
          }
          let templateData = {
              target: targetTokens[i] || undefined,
              range: attackMods.range,
              toHit: DC,
              attackRoll: attackRoll,
              fired: roundsFired,
              hits: roundsHit,
              hit: roundsHit > 0,
              areaDamages: areaDamages,
              fireModeLabel: CyberpunkItem.getFireModeLabel(fireModes.fullAuto),
              rangeLabel: CyberpunkItem.getRangeLabel(attackMods.range, actualRangeBracket),
              weaponName: this.name,
              weaponImage: this.img,
              weaponType: this.getWeaponLineType(),
              loadedAmmoType: wd.loadedAmmoType || "standard",
              damageType: wd.damageType || "",
              hasDamage: true
          };
          let roll = new RollBundle(CyberpunkItem.getFireModeLabel(fireModes.fullAuto));
          roll.execute(undefined, "systems/cyberpunk/templates/chat/multi-hit.hbs", templateData);
          rolls.push(roll);
      }
      return rolls;
  }

  async _fireBurst(attackMods) {
      const wd = this.weaponData;
      // The kind of distance we're attacking at, so we can display Close: <50m or something like that
      let actualRangeBracket = rangeResolve[attackMods.range](wd.range);
      let DC = rangeDCs[attackMods.range];
      let attackRoll = await this.rollToHit(attackMods);

      // Trigger Dice So Nice for attack roll
      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      // Check for fumble (natural 1 on attack roll)
      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(wd.reliability);
      }

      // Minimum Body penalty halves effective ROF
      const minBodyPenalty = this._getMinBodyPenalty();
      const effectiveRof = Math.max(1, Math.floor(wd.rof * minBodyPenalty.rofMultiplier));
      let roundsFired = Math.min(wd.shotsLeft, effectiveRof, 3);
      let attackHits = attackRoll.total >= DC && !isNatural1;
      let areaDamages = {};
      let allDamageRolls = [];
      let roundsHit;
      if (attackHits) {
          // In RAW this is 1d6/2, but this is functionally the same
          roundsHit = await new Roll("1d3").evaluate();
          for (let i = 0; i < roundsHit.total; i++) {
              let damageRoll = await new Roll(wd.damage).evaluate();
              allDamageRolls.push(damageRoll);
              let location = (await rollLocation(attackMods.targetActor, attackMods.targetArea)).areaHit;
              if (!areaDamages[location]) {
                  areaDamages[location] = [];
              }
              areaDamages[location].push({
                  damage: damageRoll.total,
                  formula: damageRoll.formula,
                  dice: damageRoll.terms.filter(t => t.results).map(term => ({
                      faces: term.faces,
                      results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
                  }))
              });
          }
          // Show all damage dice at once
          if (game.dice3d && allDamageRolls.length > 0) {
              await Promise.all(allDamageRolls.map(roll =>
                  game.dice3d.showForRoll(roll, game.user, true, null, false)
              ));
          }
      }
      let templateData = {
          range: attackMods.range,
          toHit: DC,
          attackRoll: attackRoll,
          fired: roundsFired,
          hits: attackHits ? roundsHit.total : 0,
          hit: attackHits,
          areaDamages: areaDamages,
          fireModeLabel: CyberpunkItem.getFireModeLabel(fireModes.threeRoundBurst),
          rangeLabel: CyberpunkItem.getRangeLabel(attackMods.range, actualRangeBracket),
          weaponName: this.name,
          weaponImage: this.img,
          weaponType: this.getWeaponLineType(),
          loadedAmmoType: wd.loadedAmmoType || "standard",
          damageType: wd.damageType || "",
          hasDamage: true
      };
      let roll = new RollBundle(CyberpunkItem.getFireModeLabel(fireModes.threeRoundBurst));
      roll.execute(undefined, "systems/cyberpunk/templates/chat/multi-hit.hbs", templateData);
      this.update({[this._weaponUpdatePath("shotsLeft")]: wd.shotsLeft - roundsFired});
      return roll;
  }

  async _fireSuppressive(mods = {}) {
    const sys = this.weaponData;
    // Minimum Body penalty halves effective ROF
    const minBodyPenalty = this._getMinBodyPenalty();
    const effectiveRof = Math.max(1, Math.floor(sys.rof * minBodyPenalty.rofMultiplier));
    const rounds = clamp(Number(mods.roundsFired ?? effectiveRof), 1, sys.shotsLeft);
    const width = Math.max(2,  Number(mods.zoneWidth    ?? 2));
    const targets = Math.max(1,  Number(mods.targetsCount ?? 1));

    await this.update({ [this._weaponUpdatePath("shotsLeft")]: sys.shotsLeft - rounds });

    const saveDC = Math.ceil(rounds / width);
    const dmgFormula = sys.damage || "1d6";
    const rollData = this.actor?.getRollData?.() ?? {};

    const results = [];
    for (let t = 0; t < targets; t++) {
      const hitsRoll = await new Roll("1d6").evaluate();
      const areaDamages = {};

      for (let i = 0; i < hitsRoll.total; i++) {
        const loc = (await rollLocation(mods.targetActor, mods.targetArea)).areaHit;
        const dmg = (await new Roll(dmgFormula, rollData).evaluate()).total;
        if (!areaDamages[loc]) areaDamages[loc] = [];
        areaDamages[loc].push({ dmg });
      }

      results.push({ hitsRoll, areaDamages });
    }

    const html = await renderTemplate(
      "systems/cyberpunk/templates/chat/suppressive.hbs",
      { weaponName: this.name, rounds, width, saveDC, dmgFormula, results, loadedAmmoType: sys.loadedAmmoType || "standard" }
    );

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: html,
      flags  : { cyberpunk: { fireMode: "suppressive" } }
    });
  }

  async _fireSingle(attackMods) {
      const wd = this.weaponData;

      // Determine if this is an exotic weapon with an effect
      const isExotic = wd.weaponType === "Exotic";
      const weaponEffect = isExotic && wd.effect ? wd.effect : null;
      const hasDamage = wd.damage && wd.damage !== "0" && wd.damage !== "";

      // The range we're shooting at
      let DC = rangeDCs[attackMods.range];
      let attackRoll = await this.rollToHit(attackMods);

      // Trigger Dice So Nice for attack roll
      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      // Check for fumble (natural 1 on attack roll)
      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(wd.reliability);
      }

      let actualRangeBracket = rangeResolve[attackMods.range](wd.range);
      let attackHits = attackRoll.total >= DC && !isNatural1;
      // Exotic weapons use charges, regular weapons use shotsLeft
      const ammoLeft = isExotic ? (wd.charges || 0) : wd.shotsLeft;
      const roundsFired = Math.min(ammoLeft, 1);
      let areaDamages = {};
      let hitLocation = null;

      // On hit: roll location (always needed for effects like acid) and damage (if weapon has damage)
      if (attackHits) {
          let locationRoll = await rollLocation(attackMods.targetActor, attackMods.targetArea);
          hitLocation = locationRoll.areaHit;

          // Only roll damage if weapon has a damage formula
          if (hasDamage) {
              let damageRoll = await new Roll(wd.damage).evaluate();

              // Trigger Dice So Nice for damage roll
              if (game.dice3d && damageRoll.dice.length > 0) {
                  await game.dice3d.showForRoll(damageRoll, game.user, true);
              }

              if (!areaDamages[hitLocation]) {
                  areaDamages[hitLocation] = [];
              }
              areaDamages[hitLocation].push({
                  damage: damageRoll.total,
                  formula: damageRoll.formula,
                  dice: damageRoll.terms.filter(t => t.results).map(term => ({
                      faces: term.faces,
                      results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
                  }))
              });
          }
      }

      // Get effect label and icon for template
      const effectLabel = weaponEffect ? this._getEffectLabel(weaponEffect) : null;
      const effectIcon = weaponEffect ? this._getEffectIcon(weaponEffect) : null;

      let templateData = {
          range: attackMods.range,
          toHit: DC,
          attackRoll: attackRoll,
          fired: roundsFired,
          hits: attackHits ? 1 : 0,
          hit: attackHits,
          areaDamages: areaDamages,
          fireModeLabel: CyberpunkItem.getFireModeLabel(fireModes.singleShot),
          rangeLabel: CyberpunkItem.getRangeLabel(attackMods.range, actualRangeBracket),
          weaponName: this.name,
          weaponImage: this.img,
          weaponType: this.getWeaponLineType(),
          loadedAmmoType: wd.loadedAmmoType || "standard",
          damageType: wd.damageType || "",
          // Exotic effect data
          weaponEffect: weaponEffect,
          hasEffect: !!weaponEffect,
          hasDamage: hasDamage,
          effectLabel: effectLabel,
          effectIcon: effectIcon,
          hitLocation: hitLocation
      };

      let roll = new RollBundle(CyberpunkItem.getFireModeLabel(fireModes.singleShot));
      roll.execute(undefined, "systems/cyberpunk/templates/chat/multi-hit.hbs", templateData);

      // Exotic weapons deduct from charges, regular weapons from shotsLeft
      if (isExotic) {
          this.update({[this._weaponUpdatePath("charges")]: (wd.charges || 0) - roundsFired});
      } else {
          this.update({[this._weaponUpdatePath("shotsLeft")]: wd.shotsLeft - roundsFired});
      }

      return roll;
  }

  /**
   * Fire an ordnance item (grenade, rocket, etc.)
   * Similar to _fireSingle() but without location targeting — ordnance is AoE.
   * @param {Object} attackMods - Attack modifiers (range, conditions, luck, etc.)
   * @param {Array} targetTokens - Array of target token data
   */
  async _fireOrdnance(attackMods, targetTokens = []) {
      let system = this.system;

      const weaponEffect = system.effect || null;
      const hasDamage = system.damage && system.damage !== "0" && system.damage !== "";

      // Check charges
      if ((system.charges || 0) <= 0) {
          ui.notifications.warn(localize("NoCharges"));
          return false;
      }

      // Roll attack
      let DC = rangeDCs[attackMods.range];
      let attackRoll = await this.rollToHit(attackMods);

      // Trigger Dice So Nice for attack roll
      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      // Check for fumble (natural 1 on attack roll)
      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(system.reliability);
      }

      let actualRangeBracket = (attackMods.actualDistance != null)
          ? attackMods.actualDistance
          : rangeResolve[attackMods.range](system.range);
      let attackHits = attackRoll.total >= DC && !isNatural1;

      // Scatter logic for circle ordnance on miss
      const isCircle = (system.templateType || "circle") === "circle";
      let scatterDistance = 0;

      if (!attackHits && isCircle && attackMods.templateId) {
          const dirRoll = await new Roll("1d10").evaluate();
          const distRoll = await new Roll("1d10").evaluate();
          if (game.dice3d) {
              await game.dice3d.showForRoll(dirRoll, game.user, true, null, false);
              await game.dice3d.showForRoll(distRoll, game.user, true, null, false);
          }
          scatterDistance = distRoll.total;

          // CP2020 grenade table: d10 → direction angle (screen coords, y-down)
          const dirAngles = {
              1: Math.PI / 2,           // S
              2: (3 * Math.PI) / 4,     // SW
              3: Math.PI / 2,           // S
              4: Math.PI / 4,           // SE (corrected: y-down, so SE is +x, +y)
              5: Math.PI,               // W
              6: 0,                     // E
              7: -(3 * Math.PI) / 4,    // NW
              8: -Math.PI / 2,          // N
              9: -Math.PI / 4,          // NE
              10: -Math.PI / 2           // N
          };
          const angle = dirAngles[dirRoll.total];
          const pxPerMeter = canvas.dimensions.size / canvas.dimensions.distance;
          const dx = Math.cos(angle) * scatterDistance * pxPerMeter;
          const dy = Math.sin(angle) * scatterDistance * pxPerMeter;

          const templateDoc = canvas.scene.templates.get(attackMods.templateId);
          if (templateDoc) {
              await templateDoc.update({ x: templateDoc.x + dx, y: templateDoc.y + dy });
          }
      }

      // Build ordnance damage data (single damage, no location)
      // Circle ordnance always deals damage (grenade explodes regardless of accuracy)
      let ordnanceDamage = null;
      let areaDamages = {};

      if ((attackHits || isCircle) && hasDamage) {
          let damageRoll = await new Roll(system.damage).evaluate();

          if (game.dice3d && damageRoll.dice.length > 0) {
              await game.dice3d.showForRoll(damageRoll, game.user, true);
          }

          ordnanceDamage = {
              damage: damageRoll.total,
              formula: damageRoll.formula,
              dice: damageRoll.terms.filter(t => t.results).map(term => ({
                  faces: term.faces,
                  results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
              }))
          };

          // Store under "aoe" key for target-selector and expansion compatibility
          areaDamages["aoe"] = [ordnanceDamage];
      }

      // Get effect label and icon for template
      const effectLabel = weaponEffect ? this._getEffectLabel(weaponEffect) : null;
      const effectIcon = weaponEffect ? this._getEffectIcon(weaponEffect) : null;

      let templateData = {
          range: attackMods.range,
          toHit: DC,
          attackRoll: attackRoll,
          fired: 1,
          hits: attackHits ? 1 : 0,
          hit: attackHits,
          ordnanceDamage: ordnanceDamage,
          areaDamages: areaDamages,
          rangeLabel: CyberpunkItem.getRangeLabel(attackMods.range, actualRangeBracket),
          weaponName: this.name,
          weaponImage: this.img,
          weaponType: this.getWeaponLineType(),
          damageType: "",
          // Effect data
          weaponEffect: weaponEffect,
          hasEffect: !!weaponEffect,
          hasDamage: hasDamage,
          effectLabel: effectLabel,
          effectIcon: effectIcon,
          // Scatter data for circle ordnance
          isCircle: isCircle,
          scatterDistance: scatterDistance
      };

      let roll = new RollBundle(localize("OrdnanceAction"));
      roll.execute(undefined, "systems/cyberpunk/templates/chat/ordnance-hit.hbs", templateData);

      // Deduct charge
      const newCharges = (system.charges || 0) - 1;
      if (newCharges <= 0 && system.removeOnZero) {
          await this.delete();
      } else {
          await this.update({"system.charges": newCharges});
      }

      return roll;
  }

  /**
   * Get localized label for an exotic effect
   * @param {string} effect - The effect key
   * @returns {string} The localized label
   */
  _getEffectLabel(effect) {
      const labels = {
          confusion: "Confusion",
          poisoned: "Poisoned",
          tearing: "Tearing",
          unconscious: "Unconscious",
          stunAt2: "Stun at –2",
          stunAt4: "Stun at –4",
          burning: "Burning",
          acid: "Acid",
          microwave: "Microwave"
      };
      return labels[effect] || effect;
  }

  /**
   * Get icon name for an exotic effect (maps to condition icon filename)
   * @param {string} effect - The effect key
   * @returns {string} The icon filename (without extension)
   */
  _getEffectIcon(effect) {
      const icons = {
          confusion: "confused",
          poisoned: "poisoned",
          tearing: "tearing",
          unconscious: "unconscious",
          stunAt2: "shocked",
          stunAt4: "shocked",
          burning: "burning",
          acid: "acid",
          microwave: "microwave"
      };
      return icons[effect] || effect;
  }

  /**
   * Get the descriptive weapon/item type string for the weapon-line partial.
   * @returns {string} e.g., "Assault Rifle", "Exotic · Confusion", "Melee · Edged", "Ordnance · Burning"
   */
  getWeaponLineType() {
      // Ordnance items use this.system directly (not a weapon sub-object)
      if (this.type === "ordnance") {
          const effectLabel = this.system.effect ? this._getEffectLabel(this.system.effect) : "";
          return effectLabel ? `${localize("OrdnanceAction")} · ${effectLabel}` : localize("OrdnanceAction");
      }

      const wd = this.weaponData;
      const wType = wd.weaponType;

      // Exotic weapons
      if (wType === "Exotic") {
          const effectLabel = wd.effect ? this._getEffectLabel(wd.effect) : "";
          return effectLabel ? `Exotic · ${effectLabel}` : "Exotic";
      }

      // Melee weapons
      if (wType === "Melee") {
          const dmgTypeKeys = { blunt: "DmgBlunt", edged: "DmgEdged", spike: "DmgSpike", monoblade: "DmgMonoblade" };
          const dmgKey = dmgTypeKeys[wd.damageType];
          const dmgLabel = dmgKey ? localize(dmgKey) : "";
          return dmgLabel ? `Melee · ${dmgLabel}` : "Melee";
      }

      // Ranged weapons: caliber + subtype
      const subtypeKeys = { Pistol: "SubPistol", SMG: "SubSMG", Shotgun: "SubShotgun", Rifle: "SubRifle", Heavy: "SubHeavy", Bow: "SubBow", Crossbow: "SubCrossbow" };
      const caliberKeys = { light: "CaliberLight", medium: "CaliberMedium", heavy: "CaliberHeavy", veryHeavy: "CaliberVeryHeavy", assault: "CaliberAssault", sniper: "CaliberSniper", antiMateriel: "CaliberAntiMateriel" };

      const subtypeKey = subtypeKeys[wType];
      const subtypeLabel = subtypeKey ? localize(subtypeKey) : (wType || "");
      const caliberKey = wd.caliber ? caliberKeys[wd.caliber] : null;
      const caliberLabel = caliberKey ? localize(caliberKey) : "";

      return caliberLabel ? `${caliberLabel} ${subtypeLabel}` : subtypeLabel;
  }

  async _executeMeleeStrike(attackMods) {
      // Just doesn't have a DC - is contested instead
      let attackRoll = await this.rollToHit(attackMods);

      // Trigger Dice So Nice for attack roll
      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      // Check for fumble (natural 1 on attack roll)
      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(this.weaponData.reliability);
      }

      // Martial skill damage bonus (if the weapon's attack skill is a martial art)
      const wd = this.weaponData;
      const resolvedSkill = wd.attackSkill || (attackSkills[wd.weaponType] || [])[0] || "";
      let martialDamageBonus = 0;
      if (resolvedSkill) {
          const skill = this.actor.itemTypes.skill.find(s => s.name === resolvedSkill);
          if (skill?.system.isMartial) {
              martialDamageBonus = this.actor.resolveSkillTotal(resolvedSkill);
          }
      }

      // Monoblade critical: natural 10 doubles base weapon damage
      const isNatural10 = attackRoll.dice[0]?.results?.[0]?.result === 10;
      const baseDamage = (wd.damageType === "monoblade" && isNatural10)
          ? `(${wd.damage})*2`
          : wd.damage;

      // Take into account the CyberTerminus modifier for damage
      let damageFormula = `${baseDamage}+@strengthBonus`;
      if (martialDamageBonus > 0) damageFormula += '+@martialDamageBonus';
      if (attackMods.cyberTerminus) {
          switch (attackMods.cyberTerminus) {
              case "CyberTerminusX2":
                  damageFormula = `(${damageFormula})*2`;
                  break;
              case "CyberTerminusX3":
                  damageFormula = `(${damageFormula})*3`;
                  break;
              case "NoCyberlimb":
              default:
                  break;
          }
      }
      let damageRoll = await new Roll(damageFormula, {
          strengthBonus: meleeDamageBonus(this.actor.system.stats.bt.total),
          martialDamageBonus
      }).evaluate();

      // Trigger Dice So Nice for damage roll
      if (game.dice3d && damageRoll.dice.length > 0) {
          await game.dice3d.showForRoll(damageRoll, game.user, true);
      }

      let locationRoll = await rollLocation(attackMods.targetActor, attackMods.targetArea);
      let hitLocation = locationRoll.areaHit;

      let areaDamages = {};
      areaDamages[hitLocation] = [{
          damage: damageRoll.total,
          formula: damageRoll.formula,
          dice: damageRoll.dice.map(term => ({
              faces: term.faces,
              results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
          }))
      }];

      let templateData = {
          actionIcon: "strike",
          fireModeLabel: localize("Strike"),
          attackRoll: attackRoll,
          areaDamages: areaDamages,
          weaponName: this.name,
          weaponImage: this.img,
          weaponType: this.getWeaponLineType(),
          loadedAmmoType: "standard",
          damageType: this.weaponData.damageType || "",
          hitLocation: hitLocation
      };

      let roll = new RollBundle(localize("Strike"));
      roll.execute(
          ChatMessage.getSpeaker({ actor: this.actor }),
          "systems/cyberpunk/templates/chat/melee-hit.hbs",
          templateData
      );
      return roll;
  }
  async _executeMartialAction(attackMods) {
    let actor = this.actor;
    let system = actor.system;
    // Action being done, eg strike, parry etc
    let action = attackMods.action;
    let martialArt = attackMods.martialArt;

    // Will be something this line once I add the martial arts bonuses. None for brawling, remember
    // let martialBonus = this.actor?.skills.MartialArts[martialArt].bonuses[action];
    let isMartial = martialArt != "Brawling";
    let keyTechniqueBonus = 0;
    let martialSkillLevel = actor.resolveSkillTotal(martialArt);
    let flavor = game.i18n.has(`CYBERPUNK.${action + "Text"}`) ? localize(action + "Text") : "";

    let results = new RollBundle(formatLocale("MartialTitle", {action: localize(action), martialArt: localize("Skill" + martialArt)}), flavor);

    // All martial arts are contested
    let attackRoll = new Roll(`1d10x10+@stats.ref.total+@attackBonus+@keyTechniqueBonus`, {
      stats: system.stats,
      attackBonus: martialSkillLevel,
      keyTechniqueBonus: keyTechniqueBonus,
    });
    results.addRoll(attackRoll, {name: "Attack"});
    let damageFormula = "";

    // Directly damaging things
    if(action == martialActions.strike) {
      damageFormula = "1d3+@strengthBonus+@martialDamageBonus";
    }
    else if([martialActions.kick, martialActions.throw, martialActions.choke].includes(action)) {
      damageFormula = "1d6+@strengthBonus+@martialDamageBonus"; // Seriously, WHY is kicking objectively better?!
    }

    if (damageFormula !== "" && attackMods.cyberTerminus) {
        switch (attackMods.cyberTerminus) {
            case "CyberTerminusX2":
                damageFormula = `(${damageFormula})*2`;
                break;
            case "CyberTerminusX3":
                damageFormula = `(${damageFormula})*3`;
                break;
            case "NoCyberlimb":
            default:
                break;
        }
    }

    if(damageFormula !== "") {
      let loc = await rollLocation(attackMods.targetActor, attackMods.targetArea);
      results.addRoll(loc.roll, {name: localize("Location"), flavor: loc.areaHit});
      results.addRoll(new Roll(damageFormula, {
        strengthBonus: meleeDamageBonus(system.stats.bt.total),
        // Martial arts get a damage bonus.
        martialDamageBonus: isMartial ? martialSkillLevel : 0
      }), {name: localize("Damage")});
    }
    results.defaultExecute({img: this.img}, this.actor);
    return results;
  }

  /**
   * Accelerate a vehicle
   * @param {boolean} decelerate: Are we decelerating instead of accelerating?
   * @returns 
   */
  accel(decelerate = false) {
    if(this.type !== "vehicle")
      return;
    
    let speed = this.system.speed;
    let accelAdd = speed.acceleration * (decelerate ? -1 : 1);
    let newSpeed = clamp(speed.value + accelAdd, 0, speed.max);
    return this.update({
      "system.speed.value": newSpeed
    });
  }
}
