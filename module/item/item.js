import { weaponTypes, rangedAttackTypes, meleeAttackTypes, fireModes, ranges, rangeDCs, rangeResolve, getAttackSkillsForWeapon, getWeaponClasses, martialActions, meleeDamageBonus, exoticEffects } from "../lookups.js"
import { RollBundle, buildD10Roll }  from "../dice.js"
import { clamp, getByPath, localize, rollLocation } from "../utils.js"
import { CyberpunkActor } from "../actor/actor.js";

// Old (pre-unification) → new weaponType discriminator. Used to keep
// un-migrated weapon documents readable until the migration runs.
const LEGACY_TYPE_TO_NEW = {
    "Pistol": "Ranged",   "SMG": "Ranged", "Shotgun": "Ranged",
    "Rifle":  "Ranged",   "Heavy": "Ranged",
    "Bow":    "Martial",  "Crossbow": "Martial", "Melee": "Martial",
    "Exotic": "Exotic"
};
// Old top-level weaponType → its new weaponClass slot
const LEGACY_TYPE_TO_CLASS = {
    "Pistol": "Pistol", "SMG": "SMG", "Shotgun": "Shotgun",
    "Rifle":  "Rifle",  "Heavy": "Heavy",
    "Bow":    "Bow",    "Crossbow": "Crossbow",
    "Melee":  "Melee",  "Exotic":   "Exotic"
};

/**
 * Item document for the Cyberpunk 2020 system.
 * @extends {Item}
 */
export class CyberpunkItem extends Item {

  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Default placeholder image. For unified weapons, the weaponType
    // discriminator selects between weapon/ammo/ordnance icons.
    const placeholders = {
      skill: "systems/cyberpunk/img/svg/placeholder-skill.svg",
      weapon: "systems/cyberpunk/img/svg/placeholder-weapon.svg",
      armor: "systems/cyberpunk/img/svg/placeholder-armor.svg",
      cyberware: "systems/cyberpunk/img/svg/placeholder-cyberware.svg",
      vehicle: "systems/cyberpunk/img/svg/placeholder-vehicle.svg",
      misc: "systems/cyberpunk/img/svg/placeholder-gear.svg",
      netware: "systems/cyberpunk/img/svg/placeholder-netware.svg",
      role: "systems/cyberpunk/img/svg/placeholder-role.svg",
      tool: "systems/cyberpunk/img/svg/placeholder-tool.svg",
      drug: "systems/cyberpunk/img/svg/placeholder-drug.svg"
    };

    let placeholder = placeholders[data.type];
    if (data.type === "weapon") {
      const wType = data.system?.weaponType;
      if (wType === "Ammo") placeholder = "systems/cyberpunk/img/svg/placeholder-ammo.svg";
      else if (wType === "Ordnance") placeholder = "systems/cyberpunk/img/svg/placeholder-ordnance.svg";
    }
    if (placeholder && (!data.img || data.img === "icons/svg/mystery-man.svg")) {
      this.updateSource({ img: placeholder });
    }

    // When an item is created as a world item (not embedded in an actor),
    // reset it to pristine state if it came from an actor (drag to sidebar)
    if (!this.parent && data.system) {
      this._resetToFactory(data);
    }
  }

  /**
   * Reset an item to factory/pristine state — unequip, restore ammo/charges/SDP,
   * clear ablation, reset humanity. Called when dragging items out of an actor.
   * @param {Object} data - The source creation data
   * @private
   */
  _resetToFactory(data) {
    const updates = { "system.equipped": false };
    const s = data.system;

    switch (data.type) {
      case "weapon": {
        const wType = s.weaponType;
        // Ranged / Exotic ranged: top up magazine, drop any attachment
        if (s.shots != null) updates["system.shotsLeft"] = s.shots;
        if (s.chargesMax) updates["system.charges"] = s.chargesMax;
        if (s.attachedAmmoId) {
          updates["system.attachedAmmoId"] = "";
          updates["system.shotsLeft"] = 0;
        }
        // Ammo pile: refill to pack size
        if (wType === "Ammo" && s.packSize != null) {
          updates["system.quantity"] = s.packSize;
        }
        break;
      }

      case "armor":
        // Clear all ablation
        if (s.coverage) {
          for (const loc of Object.keys(s.coverage)) {
            updates[`system.coverage.${loc}.ablation`] = 0;
          }
        }
        break;

      case "cyberware":
        // Restore SDP to max
        if (s.structure?.max) updates["system.structure.current"] = s.structure.max;
        // Reset humanity tracking (not installed yet)
        updates["system.humanityLoss"] = 0;
        updates["system.humanityRolled"] = false;
        updates["system.repaired"] = false;
        // Restore embedded weapon ammo/charges and detach any owner-linked ammo
        if (s.weapon?.shots != null) updates["system.weapon.shotsLeft"] = s.weapon.shots;
        if (s.weapon?.chargesMax) updates["system.weapon.charges"] = s.weapon.chargesMax;
        if (s.weapon?.attachedAmmoId) {
          updates["system.weapon.attachedAmmoId"] = "";
          updates["system.weapon.shotsLeft"] = 0;
        }
        break;
    }

    this.updateSource(updates);
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

  /**
   * Resolve effective weaponType (new 5-category discriminator).
   * Falls through to legacy mapping for un-migrated documents.
   */
  _getWeaponType() {
    const t = this.weaponData?.weaponType;
    if (!t) return "Martial";
    if (LEGACY_TYPE_TO_NEW[t]) return LEGACY_TYPE_TO_NEW[t];
    return t;
  }

  /**
   * Resolve effective weaponClass. Falls through to legacy mapping.
   */
  _getWeaponClass() {
    const wd = this.weaponData;
    if (wd?.weaponClass) return wd.weaponClass;
    return LEGACY_TYPE_TO_CLASS[wd?.weaponType] || wd?.weaponType || "";
  }

  /**
   * The Ammo item currently attached to this Ranged weapon, or null.
   */
  _getAttachedAmmo() {
    const id = this.weaponData?.attachedAmmoId;
    if (!id || !this.actor) return null;
    const ammo = this.actor.items.get(id);
    if (!ammo) return null;
    if (ammo.system?.weaponType !== "Ammo") return null;
    return ammo;
  }

  /**
   * Effective damage formula. For Ranged with attached ammo, comes from ammo;
   * otherwise from the weapon itself.
   */
  _getEffectiveDamage() {
    if (this._getWeaponType() === "Ranged") {
      const ammo = this._getAttachedAmmo();
      if (ammo?.system?.damage) return ammo.system.damage;
    }
    return this.weaponData?.damage || "0";
  }

  /**
   * Effective effect key (e.g., "burning"). For Ranged with attached grenade ammo
   * the effect comes from the ammo; otherwise from the weapon.
   */
  _getEffectiveEffect() {
    if (this._getWeaponType() === "Ranged") {
      const ammo = this._getAttachedAmmo();
      if (ammo?.system?.effect) return ammo.system.effect;
    }
    return this.weaponData?.effect || "";
  }

  /**
   * Effective AoE template (type + radius). Provides sensible defaults so the
   * AoE fire path doesn't have to second-guess missing data:
   *   - Ranged + attached ammo with explicit templateType → that shape
   *   - Ranged + grenade-class ammo with no shape         → circle (canonical)
   *   - Ordnance with no stored templateType              → circle
   *   - Exotic / Ranged-without-grenade with empty value  → "" (no AoE)
   */
  _getEffectiveTemplate() {
    const t = this._getWeaponType();
    const wd = this.weaponData;
    if (t === "Ranged") {
      const ammo = this._getAttachedAmmo();
      if (ammo?.system?.templateType) {
        return { type: ammo.system.templateType, radius: ammo.system.radius || 0 };
      }
      if (ammo?.system?.ammoType === "grenade") {
        return { type: "circle", radius: ammo.system.radius || 0 };
      }
      return { type: "", radius: 0 };
    }
    const stored = wd?.templateType;
    if (stored) return { type: stored, radius: wd?.radius || 0 };
    if (t === "Ordnance") return { type: "circle", radius: wd?.radius || 0 };
    return { type: "", radius: wd?.radius || 0 };
  }

  /**
   * Effective ammoType label key (e.g., "standard", "armorPiercing").
   */
  _getEffectiveAmmoType() {
    if (this._getWeaponType() === "Ranged") {
      const ammo = this._getAttachedAmmo();
      if (ammo?.system?.ammoType) return ammo.system.ammoType;
    }
    return this.weaponData?.loadedAmmoType || "standard";
  }

  /**
   * Should this weapon be fired via the area-weapon flow (scatter + AoE damage)?
   * True for Ordnance (always) and Exotic when it has a template configured.
   * True for Ranged when the attached ammo is a grenade-type with a template.
   */
  _isAreaWeapon() {
    const t = this._getWeaponType();
    if (t === "Ordnance") return true;
    const tmpl = this._getEffectiveTemplate();
    if (!tmpl?.type) return false;
    // For Ranged: only grenade-class ammo triggers AoE dispatch
    if (t === "Ranged") {
      const ammo = this._getAttachedAmmo();
      return ammo?.system?.ammoType === "grenade";
    }
    if (t === "Exotic") return true;
    return false;
  }

  /**
   * Attach an Ammo item to this Ranged weapon. Full reload cycle:
   * unload current to its source pile → set new attachment → load from new pile.
   * @param {Item} ammoItem
   */
  async _attachAmmo(ammoItem) {
    if (!this.actor || !ammoItem) return;
    if (this._getWeaponType() !== "Ranged") return;
    // Caliber check — weapon and ammo must share the same caliber slug
    const wCal = this.weaponData?.caliber;
    const aCal = ammoItem.system?.caliber;
    if (wCal && aCal && wCal !== aCal) {
      ui.notifications?.warn(localize("AmmoIncompatibleCaliber"));
      return;
    }
    // Detach any currently-attached ammo first (returns loaded rounds to that pile)
    await this._detachAmmo();
    // Set new attachment
    await this.update({ [this._weaponUpdatePath("attachedAmmoId")]: ammoItem.id });
    try { await ammoItem.setFlag("cyberpunk", "attachedTo", this.id); } catch (e) {}
    // Refill from new pile
    await this._reloadFromAttached();
  }

  /**
   * Detach the currently-attached ammo. Returns any loaded rounds back to its
   * source pile before clearing the attachment.
   */
  async _detachAmmo() {
    const wd = this.weaponData;
    const ammo = this._getAttachedAmmo();
    if (!ammo) {
      // Just clear the field if it points nowhere
      if (wd?.attachedAmmoId) {
        await this.update({
          [this._weaponUpdatePath("attachedAmmoId")]: "",
          [this._weaponUpdatePath("shotsLeft")]: 0
        });
      }
      return;
    }
    const loaded = Number(wd?.shotsLeft) || 0;
    if (loaded > 0) {
      await ammo.update({ "system.quantity": (Number(ammo.system.quantity) || 0) + loaded });
    }
    try { await ammo.unsetFlag("cyberpunk", "attachedTo"); } catch (e) {}
    await this.update({
      [this._weaponUpdatePath("attachedAmmoId")]: "",
      [this._weaponUpdatePath("shotsLeft")]: 0
    });
  }

  /**
   * Top up the magazine from the attached ammo pile (no swap).
   */
  async _reloadFromAttached() {
    const wd = this.weaponData;
    const ammo = this._getAttachedAmmo();
    if (!ammo) return false;
    const maxShots = Number(wd?.shots) || 0;
    const currentlyLoaded = Number(wd?.shotsLeft) || 0;
    const pile = Number(ammo.system.quantity) || 0;
    const need = Math.max(0, maxShots - currentlyLoaded);
    const take = Math.min(need, pile);
    if (take === 0) return false;
    await this.update({ [this._weaponUpdatePath("shotsLeft")]: currentlyLoaded + take });
    await ammo.update({ "system.quantity": pile - take });
    return true;
  }

  isRanged() {
    const wd = this.weaponData;
    const t = this._getWeaponType();
    if (t === "Martial") return false;
    if (t === "Exotic" && Object.keys(meleeAttackTypes).includes(wd?.attackType)) return false;
    return true;
  }

  /**
   * The field on weaponData that holds the per-shot resource: 'charges' for
   * Exotic, 'shotsLeft' for everything else. Used by burst/auto/suppressive
   * fire so Exotic weapons spend their charges instead of a magazine.
   */
  _getAmmoField() {
    return this._getWeaponType() === "Exotic" ? "charges" : "shotsLeft";
  }

  /** Current value of the per-shot resource (charges or shotsLeft). */
  _getAmmoLeft() {
    return Number(this.weaponData?.[this._getAmmoField()]) || 0;
  }

  _prepareWeaponData(data) {

  }

  /**
   * Calculate Minimum Body penalty for this weapon.
   */
  _getMinBodyPenalty() {
    const minBody = this.weaponData.minimumBody || 0;
    if (!minBody || !this.actor) return { accuracyPenalty: 0, rofMultiplier: 1 };
    // Drones have no BODY stat — they're mechanical weapon mounts with no recoil mismatch.
    if (this.actor.type === "drone") return { accuracyPenalty: 0, rofMultiplier: 1 };
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

      let areasCovered = Object.keys(system.coverage).length;
      let cleanseAreas = areasCovered > COVERAGE_CLEANSE_THRESHOLD;
      if(cleanseAreas) {
        for(let armorArea in system.coverage) {
          if(!ownerLocs[armorArea]) {
            console.warn(`ARMOR MORPH: The new owner of this armor (${this.actor.name}) does not have a ${armorArea}. Removing the area from the armor.`)
            delete system.coverage[armorArea];
          }
        }
      }

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
   * Resolve the canonical attack skill name for this weapon. Falls back to the
   * first mapped skill for the weaponType when system.attackSkill is empty.
   */
  _resolveAttackSkill() {
    const wd = this.weaponData;
    if (wd?.attackSkill) return wd.attackSkill;
    const skills = getAttackSkillsForWeapon(this._getWeaponType());
    return skills[0] || "";
  }

  /**
   * Handle clickable rolls.
   */
  async roll() {
    if (this.type !== "weapon" && !(this.type === "cyberware" && this.system.isWeapon)) return;
    return this._resolveAttack();
  }

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
    if(aimRounds && aimRounds > 0) {
      terms.push(aimRounds);
    }
    if(ambush) terms.push(5);
    if(blinded) terms.push(-3);
    if(dualWield) terms.push(-3);
    if(fastDraw) terms.push(-3);
    if(hipfire) terms.push(-2);
    if(ricochet) terms.push(-5);
    if(running) terms.push(-3);
    if(turningToFace) terms.push(-2);

    if(fireMode === fireModes.fullAuto) {
      const ammoLeft = Number(this.weaponData[this._getAmmoField()]) || 0;
      let bullets = Math.min(ammoLeft, this.weaponData.rof);
      let multiplier =
          (range === ranges.close) ? 1
        : (range === ranges.pointBlank) ? 0
        : -1;
      terms.push(multiplier * Math.floor(bullets/10))
    }

    if((fireMode === fireModes.threeRoundBurst || fireMode === fireModes.twoRoundBurst)
      && (range === ranges.close || range === ranges.medium)) {
        terms.push(+3);
    }

    terms.push(extraMod || 0);

    return terms;
  }

  _meleeModifiers({extraMod}) {
    return [extraMod];
  }

  // Resolve a weapon attack roll — top-level dispatch
  _resolveAttack(attackMods, targetTokens) {
    let owner = this.actor;
    const wd = this.weaponData;

    if (owner === null) {
      throw new Error("This item isn't owned by anyone.");
    }

    const t = this._getWeaponType();

    // Martial: melee strike or martial action
    if (t === "Martial") {
      if (wd.attackType === meleeAttackTypes.martial) {
        return this._executeMartialAction(attackMods);
      }
      return this._executeMeleeStrike(attackMods);
    }

    // Exotic with melee attack type (e.g., monoblade-style exotic) dispatches as melee
    if (t === "Exotic" && Object.keys(meleeAttackTypes).includes(wd.attackType)) {
      return this._executeMeleeStrike(attackMods);
    }

    // Any AoE weapon — Ordnance, Exotic w/ template, Ranged w/ grenade-loaded ammo.
    if (this._isAreaWeapon()) {
      return this._fireAreaWeapon(attackMods, targetTokens);
    }

    // Ranged / Exotic standard fire-mode dispatch
    const ammoLeft = this._getAmmoLeft();
    if (ammoLeft <= 0) {
      const msgKey = t === "Exotic" ? "NoCharges" : "NoAmmo";
      ui.notifications.warn(localize(msgKey));
      return false;
    }

    if(attackMods.fireMode === fireModes.fullAuto) {
      return this._fireFullAuto(attackMods, targetTokens);
    }
    else if(attackMods.fireMode === fireModes.threeRoundBurst) {
      return this._fireBurst(attackMods, 3);
    }
    else if(attackMods.fireMode === fireModes.twoRoundBurst) {
      return this._fireBurst(attackMods, 2);
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
    const wType = this._getWeaponType();
    // Martial / Ordnance / Ammo: single only
    if (wType !== "Ranged" && wType !== "Exotic") return [fireModes.singleShot];

    const fromRof = () => {
      const modes = [fireModes.singleShot];
      if (wd.rof === 2) modes.unshift(fireModes.twoRoundBurst);
      if (wd.rof >= 3) modes.unshift(fireModes.threeRoundBurst);
      if (wd.rof > 3) modes.unshift(fireModes.suppressive, fireModes.fullAuto);
      return modes;
    };

    // Exotic with RoF > 1 gets burst/auto options just like Ranged.
    // Exotic doesn't gate on attackType — its UI doesn't expose one.
    if (wType === "Exotic") return fromRof();

    // Ranged: requires auto/autoshotgun attackType to unlock burst/auto
    if (wd.attackType === rangedAttackTypes.auto || wd.attackType === rangedAttackTypes.autoshotgun) {
      return fromRof();
    }
    return [fireModes.singleShot];
  }

  /**
   * Get the localized label for a fire mode
   */
  static getFireModeLabel(fireMode) {
    const labels = {
      [fireModes.fullAuto]: localize("FullAutoLabel"),
      [fireModes.threeRoundBurst]: localize("ThreeRoundBurstLabel"),
      [fireModes.twoRoundBurst]: localize("TwoRoundBurstLabel"),
      [fireModes.singleShot]: localize("SingleShotLabel"),
      [fireModes.suppressive]: localize("SuppressiveLabel")
    };
    return labels[fireMode] || fireMode;
  }

  /**
   * Get the localized label for a range bracket
   */
  static getRangeLabel(range, actualRange) {
    const labels = {
      [ranges.pointBlank]: localize("RangePointBlankLabel"),
      [ranges.close]: localize("RangeCloseLabel", { range: actualRange }),
      [ranges.medium]: localize("RangeMediumLabel", { range: actualRange }),
      [ranges.long]: localize("RangeLongLabel", { range: actualRange }),
      [ranges.extreme]: localize("RangeExtremeLabel", { range: actualRange })
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
    const resolvedSkill = this._resolveAttackSkill();
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

    if(this.actor.statuses.has("fast-draw")) attackTerms.push(-3);
    if(this.actor.statuses.has("action-surge")) attackTerms.push(-3);
    if(this.actor.statuses.has("restrained")) attackTerms.push(-2);
    if(this.actor.statuses.has("grappling")) attackTerms.push(-2);
    if(!isRanged && this.actor.statuses.has("prone")) attackTerms.push(-2);

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
   */
  async _fireFullAuto(attackMods, targetTokens) {
      const wd = this.weaponData;
      const resolvedSkill = this._resolveAttackSkill();
      const damageFormula = this._getEffectiveDamage();
      const ammoTypeKey = this._getEffectiveAmmoType();
      let actualRangeBracket = rangeResolve[attackMods.range](wd.range);
      let DC = rangeDCs[attackMods.range];
      let targetCount = targetTokens.length || attackMods.targetsCount || 1;

      const minBodyPenalty = this._getMinBodyPenalty();
      const effectiveRof = Math.max(1, Math.floor(wd.rof * minBodyPenalty.rofMultiplier));
      const ammoField = this._getAmmoField();
      let ammoLeft = Number(wd[ammoField]) || 0;

      let rolls = [];
      let fumbleTriggered = false;
      let ipGranted = false;
      for (let i = 0; i < targetCount; i++) {
          let attackRoll = await this.rollToHit(attackMods);

          if (game.dice3d) {
              await game.dice3d.showForRoll(attackRoll, game.user, true);
          }

          const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
          if (isNatural1 && this.actor && !fumbleTriggered) {
              await this.actor.rollFumble(wd.reliability);
              fumbleTriggered = true;
          }

          let roundsFired = Math.min(ammoLeft, effectiveRof / targetCount);
          ammoLeft -= roundsFired;
          await this.update({[this._weaponUpdatePath(ammoField)]: ammoLeft});
          let roundsHit = isNatural1 ? 0 : Math.min(roundsFired, attackRoll.total - DC);
          if (roundsHit < 0) {
              roundsHit = 0;
          }

          let ipGained = 0;
          if (roundsHit > 0 && !ipGranted && this.actor) {
              ipGained = await this.actor.grantCombatIP(attackRoll, resolvedSkill);
              ipGranted = true;
          }

          let areaDamages = {};
          let allDamageRolls = [];
          for (let j = 0; j < roundsHit; j++) {
              let damageRoll = await new Roll(damageFormula).evaluate();
              allDamageRolls.push(damageRoll);
              let locationRoll = await rollLocation(attackMods.targetActor, attackMods.targetArea);
              let location = locationRoll.areaHit;
              if (!areaDamages[location]) {
                  areaDamages[location] = [];
              }
              areaDamages[location].push({
                  damage: damageRoll.total,
                  formula: damageRoll.formula,
                  dice: damageRoll.terms.filter(t => t.results).map(term => ({
                      faces: term.faces,
                      results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
                  })),
                  rollD10: attackMods.targetArea ? 0 : (locationRoll.roll?.total ?? 0),
                  pickedZone: attackMods.targetArea ? location : null
              });
          }
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
              loadedAmmoType: ammoTypeKey,
              damageType: wd.damageType || "",
              hasDamage: true,
              ipGained: ipGained
          };
          let roll = new RollBundle(CyberpunkItem.getFireModeLabel(fireModes.fullAuto));
          roll.execute(undefined, "systems/cyberpunk/templates/chat/multi-hit.hbs", templateData);
          rolls.push(roll);
      }
      return rolls;
  }

  async _fireBurst(attackMods, maxRounds = 3) {
      const wd = this.weaponData;
      const resolvedSkill = this._resolveAttackSkill();
      const damageFormula = this._getEffectiveDamage();
      const ammoTypeKey = this._getEffectiveAmmoType();
      let actualRangeBracket = rangeResolve[attackMods.range](wd.range);
      let DC = rangeDCs[attackMods.range];
      let attackRoll = await this.rollToHit(attackMods);

      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(wd.reliability);
      }

      const minBodyPenalty = this._getMinBodyPenalty();
      const effectiveRof = Math.max(1, Math.floor(wd.rof * minBodyPenalty.rofMultiplier));
      const ammoField = this._getAmmoField();
      const ammoLeft = Number(wd[ammoField]) || 0;
      let roundsFired = Math.min(ammoLeft, effectiveRof, maxRounds);
      let attackHits = attackRoll.total >= DC && !isNatural1;

      let ipGained = 0;
      if (attackHits && this.actor) {
          ipGained = await this.actor.grantCombatIP(attackRoll, resolvedSkill);
      }

      let areaDamages = {};
      let allDamageRolls = [];
      let roundsHit;
      if (attackHits) {
          const hitDie = maxRounds === 2 ? "1d2" : "1d3";
          roundsHit = await new Roll(hitDie).evaluate();
          for (let i = 0; i < roundsHit.total; i++) {
              let damageRoll = await new Roll(damageFormula).evaluate();
              allDamageRolls.push(damageRoll);
              let locationRoll = await rollLocation(attackMods.targetActor, attackMods.targetArea);
              let location = locationRoll.areaHit;
              if (!areaDamages[location]) {
                  areaDamages[location] = [];
              }
              areaDamages[location].push({
                  damage: damageRoll.total,
                  formula: damageRoll.formula,
                  dice: damageRoll.terms.filter(t => t.results).map(term => ({
                      faces: term.faces,
                      results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
                  })),
                  rollD10: attackMods.targetArea ? 0 : (locationRoll.roll?.total ?? 0),
                  pickedZone: attackMods.targetArea ? location : null
              });
          }
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
          fireModeLabel: CyberpunkItem.getFireModeLabel(maxRounds === 2 ? fireModes.twoRoundBurst : fireModes.threeRoundBurst),
          rangeLabel: CyberpunkItem.getRangeLabel(attackMods.range, actualRangeBracket),
          weaponName: this.name,
          weaponImage: this.img,
          weaponType: this.getWeaponLineType(),
          loadedAmmoType: ammoTypeKey,
          damageType: wd.damageType || "",
          hasDamage: true,
          ipGained: ipGained
      };
      let roll = new RollBundle(CyberpunkItem.getFireModeLabel(maxRounds === 2 ? fireModes.twoRoundBurst : fireModes.threeRoundBurst));
      roll.execute(undefined, "systems/cyberpunk/templates/chat/multi-hit.hbs", templateData);
      this.update({[this._weaponUpdatePath(ammoField)]: ammoLeft - roundsFired});
      return roll;
  }

  async _fireSuppressive(mods = {}) {
    const sys = this.weaponData;
    const damageFormula = this._getEffectiveDamage() || "1d6";
    const ammoTypeKey = this._getEffectiveAmmoType();
    const minBodyPenalty = this._getMinBodyPenalty();
    const effectiveRof = Math.max(1, Math.floor(sys.rof * minBodyPenalty.rofMultiplier));
    const ammoField = this._getAmmoField();
    const ammoLeft = Number(sys[ammoField]) || 0;
    const rounds = clamp(Number(mods.roundsFired ?? effectiveRof), 1, ammoLeft);
    const width = Math.max(2,  Number(mods.zoneWidth    ?? 2));
    const targets = Math.max(1,  Number(mods.targetsCount ?? 1));

    await this.update({ [this._weaponUpdatePath(ammoField)]: ammoLeft - rounds });

    const saveDC = Math.ceil(rounds / width);
    const dmgFormula = damageFormula;
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

    const html = await foundry.applications.handlebars.renderTemplate(
      "systems/cyberpunk/templates/chat/suppressive.hbs",
      { weaponName: this.name, rounds, width, saveDC, dmgFormula, results, loadedAmmoType: ammoTypeKey }
    );

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: html,
      flags  : { cyberpunk: { fireMode: "suppressive" } }
    });
  }

  async _fireSingle(attackMods) {
      const wd = this.weaponData;
      const resolvedSkill = this._resolveAttackSkill();
      const damageFormula = this._getEffectiveDamage();
      const effectiveEffect = this._getEffectiveEffect();
      const ammoTypeKey = this._getEffectiveAmmoType();

      const t = this._getWeaponType();
      const isExotic = t === "Exotic";
      const weaponEffect = effectiveEffect && effectiveEffect !== "none" ? effectiveEffect : null;
      const hasDamage = damageFormula && damageFormula !== "0" && damageFormula !== "";

      let DC = rangeDCs[attackMods.range];
      let attackRoll = await this.rollToHit(attackMods);

      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(wd.reliability);
      }

      let actualRangeBracket = rangeResolve[attackMods.range](wd.range);
      let attackHits = attackRoll.total >= DC && !isNatural1;

      let ipGained = 0;
      if (attackHits && this.actor) {
          ipGained = await this.actor.grantCombatIP(attackRoll, resolvedSkill);
      }

      // Exotic uses charges, Ranged uses shotsLeft
      const ammoLeft = isExotic ? (wd.charges || 0) : wd.shotsLeft;
      const roundsFired = Math.min(ammoLeft, 1);
      let areaDamages = {};
      let hitLocation = null;

      if (attackHits) {
          let locationRoll = await rollLocation(attackMods.targetActor, attackMods.targetArea);
          hitLocation = locationRoll.areaHit;

          if (hasDamage) {
              let damageRoll = await new Roll(damageFormula).evaluate();

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
                  })),
                  rollD10: attackMods.targetArea ? 0 : (locationRoll.roll?.total ?? 0),
                  pickedZone: attackMods.targetArea ? hitLocation : null
              });
          }
      }

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
          loadedAmmoType: ammoTypeKey,
          damageType: wd.damageType || "",
          weaponEffect: weaponEffect,
          hasEffect: !!weaponEffect,
          hasDamage: hasDamage,
          effectLabel: effectLabel,
          effectIcon: effectIcon,
          hitLocation: hitLocation,
          ipGained: ipGained
      };

      let roll = new RollBundle(CyberpunkItem.getFireModeLabel(fireModes.singleShot));
      roll.execute(undefined, "systems/cyberpunk/templates/chat/multi-hit.hbs", templateData);

      if (isExotic) {
          this.update({[this._weaponUpdatePath("charges")]: (wd.charges || 0) - roundsFired});
      } else {
          this.update({[this._weaponUpdatePath("shotsLeft")]: wd.shotsLeft - roundsFired});
      }

      return roll;
  }

  /**
   * Fire an area weapon (Ordnance or Exotic with template).
   * Scatter on miss for circle templates; damage applies regardless of accuracy
   * for circle templates (grenades explode somewhere).
   * Ordnance items are deleted after firing (1-shot disposable); Exotic items
   * deduct charges instead.
   */
  async _fireAreaWeapon(attackMods, targetTokens = []) {
      const wd = this.weaponData;
      const t = this._getWeaponType();

      const effectiveEffect = this._getEffectiveEffect();
      const damageFormula = this._getEffectiveDamage();
      const tmpl = this._getEffectiveTemplate();

      const weaponEffect = (effectiveEffect && effectiveEffect !== "none") ? effectiveEffect : null;
      const hasDamage = damageFormula && damageFormula !== "0" && damageFormula !== "";

      // Ordnance is always usable as long as it exists; Exotic needs charges
      if (t === "Exotic") {
          if ((wd.charges || 0) <= 0) {
              ui.notifications.warn(localize("NoCharges"));
              return false;
          }
      }

      let DC = rangeDCs[attackMods.range];
      let attackRoll = await this.rollToHit(attackMods);

      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(wd.reliability);
      }

      let actualRangeBracket = (attackMods.actualDistance != null)
          ? attackMods.actualDistance
          : rangeResolve[attackMods.range](wd.range);
      let attackHits = attackRoll.total >= DC && !isNatural1;

      let ipGained = 0;
      if (attackHits && this.actor) {
          ipGained = await this.actor.grantCombatIP(attackRoll, this._resolveAttackSkill());
      }

      // _getEffectiveTemplate guarantees a non-empty type for any path that
      // reaches here (Ordnance defaults to circle; grenade ammo defaults to
      // circle). Strict comparison: non-circle templates (cone/beam) skip
      // scatter and only damage on hit.
      const isCircle = tmpl.type === "circle";
      let scatterDistance = 0;

      if (!attackHits && isCircle && attackMods.templateId) {
          const dirRoll = await new Roll("1d10").evaluate();
          const distRoll = await new Roll("1d10").evaluate();
          if (game.dice3d) {
              await game.dice3d.showForRoll(dirRoll, game.user, true, null, false);
              await game.dice3d.showForRoll(distRoll, game.user, true, null, false);
          }
          scatterDistance = distRoll.total;

          const dirAngles = {
              1: Math.PI / 2,
              2: (3 * Math.PI) / 4,
              3: Math.PI / 2,
              4: Math.PI / 4,
              5: Math.PI,
              6: 0,
              7: -(3 * Math.PI) / 4,
              8: -Math.PI / 2,
              9: -Math.PI / 4,
              10: -Math.PI / 2
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

      let ordnanceDamage = null;
      let areaDamages = {};

      if ((attackHits || isCircle) && hasDamage) {
          const dmgFormula = attackMods.damageOverride || damageFormula;
          let damageRoll = await new Roll(dmgFormula).evaluate();

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

          areaDamages["aoe"] = [ordnanceDamage];
      }

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
          weaponEffect: weaponEffect,
          hasEffect: !!weaponEffect,
          hasDamage: hasDamage,
          effectLabel: effectLabel,
          effectIcon: effectIcon,
          isCircle: isCircle,
          scatterDistance: scatterDistance,
          ipGained: ipGained
      };

      let roll = new RollBundle(localize("OrdnanceAction"));
      roll.execute(undefined, "systems/cyberpunk/templates/chat/ordnance-hit.hbs", templateData);

      // Resource cost: Ordnance destroys; Exotic deducts charges; Ranged consumes shotsLeft.
      if (t === "Ordnance") {
          await this.delete();
      } else if (t === "Exotic") {
          const chargesUsed = attackMods.chargesUsed || 1;
          await this.update({[this._weaponUpdatePath("charges")]: (wd.charges || 0) - chargesUsed});
      } else if (t === "Ranged") {
          // Ranged with attached grenade ammo — consume one round
          await this.update({[this._weaponUpdatePath("shotsLeft")]: Math.max(0, (wd.shotsLeft || 0) - 1)});
      }

      return roll;
  }

  // Back-compat alias — TAH and dialogs may still call _fireOrdnance directly.
  async _fireOrdnance(attackMods, targetTokens = []) {
      return this._fireAreaWeapon(attackMods, targetTokens);
  }

  /**
   * Get localized label for an exotic effect.
   * Uses the exoticEffects map (loc keys) — falls back to the raw key.
   */
  _getEffectLabel(effect) {
      const key = exoticEffects[effect];
      if (key) return localize(key);
      return effect;
  }

  /**
   * Get icon name for an exotic effect (maps to condition icon filename).
   * Icons are filenames, not localized strings.
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
          microwave: "microwave",
          blindness: "blinded",
          laser: "burning",
          immobilized: "immobilized"
      };
      return icons[effect] || effect;
  }

  /**
   * Get the descriptive weapon/item type string for the weapon-line partial.
   * @returns {string} e.g., "Assault Rifle", "Exotic · Confusion", "Melee · Edged", "Ordnance · Burning"
   */
  getWeaponLineType() {
      const wd = this.weaponData;
      const t = this._getWeaponType();
      const c = this._getWeaponClass();

      // Ordnance
      if (t === "Ordnance") {
          const eff = wd.effect;
          const effectLabel = (eff && eff !== "none") ? this._getEffectLabel(eff) : "";
          const base = localize("OrdnanceAction");
          return effectLabel ? `${base} · ${effectLabel}` : base;
      }

      // Exotic
      if (t === "Exotic") {
          const effectLabel = (wd.effect && wd.effect !== "none") ? this._getEffectLabel(wd.effect) : "";
          const label = localize("WeaponTypeExotic");
          return effectLabel ? `${label} · ${effectLabel}` : label;
      }

      // Martial (includes Melee + Bow + Crossbow + Sling)
      if (t === "Martial") {
          // Melee gets a damage-type suffix
          if (c === "Melee") {
              const dmgTypeKeys = { blunt: "DmgBlunt", edged: "DmgEdged", spike: "DmgSpike", monoblade: "DmgMonoblade" };
              const dmgKey = dmgTypeKeys[wd.damageType];
              const dmgLabel = dmgKey ? localize(dmgKey) : "";
              const base = localize("MartialMelee");
              return dmgLabel ? `${base} · ${dmgLabel}` : base;
          }
          // Bow/Crossbow/Sling/Unarmed — just the class label
          const classKey = getWeaponClasses("Martial")[c];
          return classKey ? localize(classKey) : localize("WeaponTypeMartial");
      }

      // Ammo
      if (t === "Ammo") {
          const classKey = getWeaponClasses("Ammo")[c];
          return classKey ? localize(classKey) : localize("WeaponTypeAmmo");
      }

      // Ranged: caliber + class label (e.g., "Heavy Assault Rifle")
      const caliberKeys = {
          light: "CaliberLight", medium: "CaliberMedium", heavy: "CaliberHeavy",
          veryHeavy: "CaliberVeryHeavy", assault: "CaliberAssault", sniper: "CaliberSniper",
          antiMateriel: "CaliberAntiMateriel", autocannon: "CaliberAutocannon",
          arrow: "CaliberArrow", bolt: "CaliberBolt"
      };
      const classKey = getWeaponClasses("Ranged")[c];
      const classLabel = classKey ? localize(classKey) : (c || "");
      // For Ranged, caliber comes from attached ammo; without ammo, fall back to weapon's own caliber for display.
      const ammo = this._getAttachedAmmo();
      const caliberSlug = ammo?.system?.caliber || wd.caliber;
      const caliberKey = caliberSlug ? caliberKeys[caliberSlug] : null;
      const caliberLabel = caliberKey ? localize(caliberKey) : "";

      return caliberLabel ? `${caliberLabel} ${classLabel}` : classLabel;
  }

  async _executeMeleeStrike(attackMods) {
      let attackRoll = await this.rollToHit(attackMods);

      if (game.dice3d) {
          await game.dice3d.showForRoll(attackRoll, game.user, true);
      }

      const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
      if (isNatural1 && this.actor) {
          await this.actor.rollFumble(this.weaponData.reliability);
      }

      const wd = this.weaponData;
      const resolvedSkill = this._resolveAttackSkill();
      let ipGained = 0;
      if (!isNatural1 && this.actor) {
          ipGained = await this.actor.grantCombatIP(attackRoll, resolvedSkill);
      }

      // Martial skill damage bonus
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
          })),
          rollD10: attackMods.targetArea ? 0 : (locationRoll.roll?.total ?? 0),
          pickedZone: attackMods.targetArea ? hitLocation : null
      }];

      let templateData = {
          actionIcon: "strike",
          fireModeLabel: localize("Strike"),
          attackRoll: attackRoll,
          hasDamage: true,
          hasApply: true,
          areaDamages: areaDamages,
          weaponName: this.name,
          weaponImage: this.img,
          weaponType: this.getWeaponLineType(),
          loadedAmmoType: "standard",
          damageType: this.weaponData.damageType || "",
          hitLocation: hitLocation,
          ipGained: ipGained
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
    let action = attackMods.action;
    let martialArt = attackMods.martialArt;

    let isMartial = martialArt != "Brawling";
    let keyTechniqueBonus = 0;
    let martialSkillLevel = actor.resolveSkillTotal(martialArt);
    let flavor = game.i18n.has(`CYBERPUNK.${action + "Text"}`) ? localize(action + "Text") : "";

    let results = new RollBundle(localize("MartialTitle", {action: localize(action), martialArt: localize("Skill" + martialArt)}), flavor);

    let attackRoll = new Roll(`1d10x10+@stats.ref.total+@attackBonus+@keyTechniqueBonus`, {
      stats: system.stats,
      attackBonus: martialSkillLevel,
      keyTechniqueBonus: keyTechniqueBonus,
    });
    await attackRoll.evaluate();
    results.addRoll(attackRoll, {name: "Attack"});

    const isNatural1 = attackRoll.dice[0]?.results?.[0]?.result === 1;
    let ipGained = 0;
    if (!isNatural1) {
      ipGained = await actor.grantCombatIP(attackRoll, martialArt);
    }

    let damageFormula = "";

    if(action == martialActions.strike) {
      damageFormula = "1d3+@strengthBonus+@martialDamageBonus";
    }
    else if([martialActions.kick, martialActions.throw, martialActions.choke].includes(action)) {
      damageFormula = "1d6+@strengthBonus+@martialDamageBonus";
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
        martialDamageBonus: isMartial ? martialSkillLevel : 0
      }), {name: localize("Damage")});
    }
    results.defaultExecute({img: this.img, ipGained: ipGained}, this.actor);
    return results;
  }

  /**
   * Accelerate a vehicle
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
