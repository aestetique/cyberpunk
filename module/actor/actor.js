import { buildD10Roll, RollBundle } from "../dice.js";
import { SortModes } from "./skill-sort.js";
import { bodyTypeModifier, getInterfaceSkillRank, isCyberlimbBase, isCyberlimbOption, isSensorOption } from "../lookups.js";
import { toTitleCase, localize, stackArmorSP, buildHitLocationIndex } from "../utils.js"
import { HealDialog } from "../dialog/heal-dialog.js"
import { WOUND_CONDITION_IDS, WOUND_STATE_TO_CONDITION, FATIGUE_CONDITION_IDS, FATIGUE_LEVEL_TO_CONDITION, FATIGUE_PENALTIES, STRESS_CONDITION_IDS, STRESS_LEVEL_TO_CONDITION, STRESS_COOL_PENALTIES, STRESS_GENERAL_PENALTIES, COVER_TYPES, COVER_CONDITION_IDS, COVER_KEY_TO_CONDITION, SLEEP_CONDITION_IDS, SLEEP_LEVEL_TO_CONDITION, SLEEP_SKILL_PENALTIES } from "../conditions.js"

/**
 * Hit-location ranges for drone shapes. Each shape maps zone-key → `{ location: [start, end?] }`,
 * matching the existing `hitLocations` template shape so `buildHitLocationIndex` consumes it directly.
 * Internal zone keys mirror character keys (head/torso/lArm/rArm/lLeg/rLeg) so a future damage
 * pipeline can be unified across actor types.
 */
export const DRONE_SHAPE_HIT_LOCATIONS = {
  "6zones": {
    head:  { location: [1] },
    torso: { location: [2, 4] },
    rArm:  { location: [5] },
    lArm:  { location: [6] },
    rLeg:  { location: [7, 8] },
    lLeg:  { location: [9, 10] }
  },
  "4zones": {
    head:  { location: [1] },
    torso: { location: [2, 6] },
    lArm:  { location: [7, 8] },
    rArm:  { location: [9, 10] }
  },
  "2zones": {
    head:  { location: [1, 3] },
    torso: { location: [4, 10] }
  },
  "1zone": {
    torso: { location: [1, 10] }
  }
};

/**
 * Actor document for Cyberpunk 2020 characters.
 * @extends {Actor}
 */
export class CyberpunkActor extends Actor {


  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    if (data.type === "character") {
      this.updateSource({
        img: "systems/cyberpunk/img/svg/placeholder-character.svg",
        "prototypeToken.texture.src": "systems/cyberpunk/img/svg/placeholder-character.svg",
        "prototypeToken.actorLink": true,
        "prototypeToken.sight.enabled": true,
        "system.icon": "systems/cyberpunk/img/svg/placeholder-character.svg",
        "system.skillsSortedBy": "Name"
      });
    }
  }

  /**
   * Augment the basic actor data with additional dynamic data - the stuff that's calculated from other data
   */
  prepareData() {
    super.prepareData();
    switch ( this.type ) {
      case "character":
        this._computeDerivedStats(this.system);
        break;
      case "drone":
        this._computeDroneStats(this.system);
        break;
    }
  }

  /**
   * Suppress Foundry's auto-apply for drug-flagged ActiveEffects — we read
   * them manually inside `_computeDerivedStats` so they merge with item
   * bonuses through the single × → + → = pipeline (and contribute named
   * entries to `stat.appliedBonuses` for the attribute-tooltip breakdown).
   * Letting Foundry apply them too would either double-count or apply them
   * in the wrong order relative to item bonuses. All other effects (status
   * markers like jacked-in/scrambled which don't use `changes[]`, and any
   * third-party module effects) pass through untouched.
   */
  applyActiveEffects() {
    const stash = [];
    for (const e of this.effects) {
      if (e.getFlag("cyberpunk", "isDrugEffect")) {
        stash.push([e, e.disabled]);
        e.disabled = true;
      }
    }
    super.applyActiveEffects();
    for (const [e, prev] of stash) e.disabled = prev;
  }

  /**
   * Minimal derived-stat pass for drones. No wounds, no saves, no carry weight,
   * no humanity/empathy logic — just stat totals, MA-derived movement, and Luck.effective.
   * Notably, Luck does NOT auto-regen on the 8-hour timer for drones.
   */
  _computeDroneStats(system) {
    const stats = system.stats;
    for (const stat of Object.values(stats)) {
      stat.total = (stat.base ?? 0) + (stat.tempMod ?? 0);
    }
    const ma = stats.ma;
    if (ma) {
      ma.run = ma.total * 3;
      ma.leap = Math.floor(ma.run / 4);
    }
    const luck = stats.luck;
    if (luck) {
      luck.effective = Math.max(0, (luck.total ?? 0) - (luck.spent ?? 0));
    }

    // Zone derived state — sp.current from max+ablation, isDisabled from SDP threshold + manual override.
    const zones = system.zones;
    const activeCover = system.activeCover;
    const coverSP = (activeCover && COVER_TYPES[activeCover]) ? COVER_TYPES[activeCover].sp : 0;
    if (zones) {
      for (const zone of Object.values(zones)) {
        const spMax = zone.sp?.max ?? 0;
        const spAblation = zone.sp?.ablation ?? 0;
        zone.sp = zone.sp || {};
        const armorCurrent = Math.max(0, spMax - spAblation);
        // Cover stacks onto every zone via the same layered-armor rules as the character path.
        zone.sp.current = coverSP > 0 ? stackArmorSP(armorCurrent, coverSP) : armorCurrent;

        const sdpCurrent = zone.sdp?.current ?? 0;
        const disablesAt = zone.sdp?.disablesAt ?? 0;
        const sdpMax = zone.sdp?.max ?? 0;
        // Configured-zone guard via maxSdp > 0 (avoids disabling un-configured zones).
        // SDP at 0 is a hard floor — always disabled, even if disablesAt is negative.
        zone.autoDisabled = sdpMax > 0 && sdpCurrent <= Math.max(disablesAt, 0);
        zone.isDisabled = zone.autoDisabled || !!zone.manuallyDisabled;
      }
    }

    // Shape → hitLocations map. Shared by hit-roll lookup and the sheet's row subtext.
    system.hitLocations = DRONE_SHAPE_HIT_LOCATIONS[system.shape] || DRONE_SHAPE_HIT_LOCATIONS["6zones"];
    system.hitLocLookup = buildHitLocationIndex(system.hitLocations);
  }

  /**
   * Prepare Character type specific data
   */
  _computeDerivedStats(system) {
    const stats = system.stats;
    // Initial stat total: natural base + user's manual temp mod.
    // Bonuses no longer write to tempMod — they apply directly to .total via
    // the op pipeline below, so tempMod stays a clean "manual temp" field.
    for(const stat of Object.values(stats)) {
      stat.total = stat.base + stat.tempMod;
      stat.overridden = false;
      // Reset the per-derive breakdown so the propertyOps pipeline below
      // starts from a clean list every run (prepareDerivedData fires more
      // than once per actor lifetime — accumulating would stale-grow it).
      stat.appliedBonuses = [];
    }
    system.hitLocLookup = buildHitLocationIndex(system.hitLocations);

    // Sort through this now so we don't have to later
    let equippedItems = this.items.contents.filter(item => {
      return item.system.equipped;
    });

    // Initialize unarmed combat properties BEFORE applying bonuses
    system.unarmedBaseDamage = "1d3";
    system.unarmedDamageMultiplier = 1;

    // Apply bonuses from equipped tools, drugs, cyberware, and armor.
    // Cyberware and armor options apply when their PARENT (the cyberware/armor
    // they are attached to) is equipped; the option's own equipped flag is
    // ignored, because options aren't worn standalone.
    const equippedWithBonuses = this.items.contents.filter(i => {
      if (i.type === "tool") return i.system.equipped;
      // Drugs no longer flow through the equipped-items pipeline — applied
      // doses live as ActiveEffects on the actor and are ingested in their
      // own loop below.
      if (i.type === "drug") return false;
      if (i.type === "cyberware") {
        // Options inherit equipped state from their base (the gear-tab
        // "attached" lane has no individual toggle). Bases use their own
        // `system.equipped`.
        if (isCyberlimbOption(i) || isSensorOption(i)) {
          const baseId = i.getFlag('cyberpunk', 'attachedTo');
          if (baseId) {
            const base = this.items.get(baseId);
            return base && base.system.equipped;
          }
          return false;
        }
        return i.system.equipped;
      }
      if (i.type === "armor") {
        if (i.system.armorType === "option") {
          const baseId = i.getFlag('cyberpunk', 'attachedTo');
          if (baseId) {
            const base = this.items.get(baseId);
            return base && base.type === "armor" && base.system.equipped;
          }
          return false;
        }
        return i.system.equipped;
      }
      return false;
    });
    // Group property bonuses by target so we can apply × → + → = per target.
    // Targets supported:
    //   "stats.<key>"           — new shape, applies to stats[key].total
    //   "stats.<key>.tempMod"   — legacy shape, treated identically (pre-migration)
    //   "<propName>"            — direct system property (e.g. "initiativeMod")
    // Each bucket entry is `{ value, source }` so we can show WHICH item
    // contributed each part in the attribute-tooltip breakdown. The op stays
    // implicit in which sub-bucket (mul/add/set) the entry lives in.
    const propertyOps = {};
    const bucketFor = (target) => (propertyOps[target] ??= { mul: [], div: [], add: [], sub: [], set: [] });
    const pushOp = (bucket, op, entry) => {
      if      (op === "×") bucket.mul.push(entry);
      else if (op === "÷") bucket.div.push(entry);
      else if (op === "−") bucket.sub.push(entry);
      else if (op === "=") bucket.set.push(entry);
      else                 bucket.add.push(entry); // "+" and unknown
    };
    equippedWithBonuses.forEach(item => {
      const bonuses = item.system.bonuses || [];
      bonuses.forEach(bonus => {
        if (bonus.type !== "property" || !bonus.property) return;
        const op = bonus.op || "+";
        const value = Number(bonus.value) || 0;
        pushOp(bucketFor(bonus.property), op, { value, source: item.name });
      });
    });

    // Drug ActiveEffects on this actor — same pipeline, source attribution
    // by effect name. The effect carries BOTH active and withdrawal bonus
    // lists in flags; pick the one matching its current phase.
    for (const effect of this.effects) {
      if (effect.disabled) continue;
      if (effect.getFlag("cyberpunk", "isDrugEffect") !== true) continue;
      const phase = effect.getFlag("cyberpunk", "phase") || "active";
      const bonuses = (phase === "withdrawal"
        ? effect.getFlag("cyberpunk", "withdrawalChanges")
        : effect.getFlag("cyberpunk", "activeChanges")) || [];
      for (const bonus of bonuses) {
        if (bonus.type !== "property" || !bonus.property) continue;
        const op = bonus.op || "+";
        const value = Number(bonus.value) || 0;
        pushOp(bucketFor(bonus.property), op, { value, source: effect.name });
      }
    }

    // Apply collected ops to each target. Universal order:
    //   start → × multipliers → ÷ dividers → + additives → − subtractives → = last-wins.
    // Multiplicative first, additive second, override last — keeps the math
    // invariant when the user mixes ops on the same target. Division by 0
    // is a no-op (skip the divisor) so a typo doesn't NaN the sheet.
    for (const [path, ops] of Object.entries(propertyOps)) {
      const parts = path.split('.');
      let current;
      let writeBack;
      let statKey = null;

      if (parts[0] === "stats" && (parts.length === 2 || (parts.length === 3 && parts[2] === "tempMod"))) {
        statKey = parts[1];
        if (!stats[statKey]) continue;
        current = stats[statKey].total;
        writeBack = (v) => { stats[statKey].total = v; };
      } else if (parts.length === 1) {
        current = system[path] || 0;
        writeBack = (v) => { system[path] = v; };
      } else {
        continue;
      }

      for (const m of ops.mul) current *= m.value;
      for (const d of ops.div) if (d.value !== 0) current /= d.value;
      for (const a of ops.add) current += a.value;
      for (const s of ops.sub) current -= s.value;
      if (ops.set.length) {
        if (ops.set.length > 1) {
          console.warn(`CYBERPUNK | multiple "=" bonuses on ${path}; using last (${ops.set[ops.set.length - 1].value})`);
        }
        current = ops.set[ops.set.length - 1].value;
        if (statKey) stats[statKey].overridden = true;
      }

      writeBack(current);

      // Publish the breakdown to the stat so buildStatCalc on the sheet can
      // render `Speed +2`, `Glands ×2`, etc. alongside Base / Gear / Humanity.
      // Accumulates across paths so a target hit via both `stats.<k>` (new)
      // and legacy `stats.<k>.tempMod` shapes both surface in the same hint.
      if (statKey) {
        const out = stats[statKey].appliedBonuses;
        for (const e of ops.mul) out.push({ ...e, op: "×" });
        for (const e of ops.div) out.push({ ...e, op: "÷" });
        for (const e of ops.add) out.push({ ...e, op: "+" });
        for (const e of ops.sub) out.push({ ...e, op: "−" });
        for (const e of ops.set) out.push({ ...e, op: "=" });
      }
    }

    // Check luck recovery (8 hours = 28,800,000 ms)
    const LUCK_RECOVERY_MS = 8 * 60 * 60 * 1000;
    if (stats.luck.spentAt && Date.now() - stats.luck.spentAt >= LUCK_RECOVERY_MS) {
      // Reset spent luck (will be persisted on next update)
      this.update({
        "system.stats.luck.spent": 0,
        "system.stats.luck.spentAt": null
      });
      stats.luck.spent = 0;
      stats.luck.spentAt = null;
    }

    // Calculate effective luck (what's actually available to spend)
    stats.luck.effective = Math.max(0, stats.luck.total - (stats.luck.spent || 0));

    // Reflex is affected by encumbrance values too.
    // Option-type armors are not equipped standalone; their SP and EV layer
    // through their parent armor when that parent is equipped.
    stats.ref.armorMod = 0;
    const layerArmor = (armorSys) => {
      if (armorSys.encumbrance != null) {
        stats.ref.armorMod -= armorSys.encumbrance;
      }
      for (const armorArea in (armorSys.coverage || {})) {
        const location = system.hitLocations[armorArea];
        if (location !== undefined) {
          const cov = armorSys.coverage[armorArea];
          const layerSP = Math.max(0, (Number(cov.stoppingPower) || 0) - (Number(cov.ablation) || 0));
          location.stoppingPower = stackArmorSP(Number(location.stoppingPower), layerSP);
        }
      }
    };
    equippedItems
      .filter(i => i.type === "armor"
                && i.system.armorType !== "option"
                && i.system.armorType !== "shield")
      .forEach(armor => {
        layerArmor(armor.system);

        // Fold in any attached option armors. Options extend the parent's
        // coverage: they layer SP on every zone they cover (including zones
        // the parent doesn't cover), and their EV adds to encumbrance.
        const attachedOptions = this.items.filter(opt =>
          opt.type === "armor" &&
          opt.system.armorType === "option" &&
          opt.getFlag?.('cyberpunk', 'attachedTo') === armor.id
        );
        attachedOptions.forEach(opt => layerArmor(opt.system));
      });

    // Add cyberarmor SP to hit locations (same stacking rules)
    equippedItems.filter(i => i.type === "cyberware" && i.system.isArmor).forEach(cyber => {
      const coverage = (cyber.system.armor || {}).coverage || {};
      for (const armorArea in coverage) {
        const location = system.hitLocations[armorArea];
        if (location !== undefined) {
          const cov = coverage[armorArea];
          const layerSP = Math.max(0, (Number(cov.stoppingPower) || 0) - (Number(cov.ablation) || 0));
          location.stoppingPower = stackArmorSP(Number(location.stoppingPower), layerSP);
        }
      }
    });

    // Add equipped shield SP to ALL hit locations. Layers after body armor
    // and cyberarmor but BEFORE active cover, so the order is:
    //   body / cyberarmor → shield → cover.
    // Each shield contributes its own SP (max - ablation); EV is folded into
    // ref.armorMod by layerArmor() so we just iterate the SP here. The user
    // handles directional logic manually (unequip the shield if hit from
    // behind).
    equippedItems
      .filter(i => i.type === "armor" && i.system.armorType === "shield")
      .forEach(shield => {
        const sh = shield.system.shield || {};
        if (shield.system.encumbrance != null) {
          stats.ref.armorMod -= shield.system.encumbrance;
        }
        const layerSP = Math.max(0, (Number(sh.stoppingPower) || 0) - (Number(sh.ablation) || 0));
        if (layerSP <= 0) return;
        for (const loc of Object.keys(system.hitLocations)) {
          const location = system.hitLocations[loc];
          if (location !== undefined) {
            location.stoppingPower = stackArmorSP(Number(location.stoppingPower), layerSP);
          }
        }
      });

    // Add cover SP to ALL hit locations (cover is hard armor)
    const activeCover = system.activeCover;
    if (activeCover && COVER_TYPES[activeCover]) {
      const coverSP = COVER_TYPES[activeCover].sp;
      for (const loc of Object.keys(system.hitLocations)) {
        const location = system.hitLocations[loc];
        if (location !== undefined) {
          location.stoppingPower = stackArmorSP(Number(location.stoppingPower), coverSP);
        }
      }
    }

    // Armor encumbrance pulls REF down — unless an override stamped REF
    // (e.g. linear frame whose actuators carry the load regardless of EV).
    if (!stats.ref.overridden) stats.ref.total += stats.ref.armorMod;

    const move = stats.ma;
    // Immobilized and prone conditions reduce movement to 0
    if (this.statuses.has("immobilized") || this.statuses.has("prone")) {
      move.total = 0;
    }
    // Desynced: MOVE -1 (min 2)
    if (this.statuses.has("desynced")) {
      move.total = Math.max(2, move.total - 1);
    }
    move.run = move.total * 3;
    move.leap = Math.floor(move.run / 4); 

    const body = stats.bt;
    body.carry = body.total * 10;
    body.lift = body.total * 40;
    body.modifier = bodyTypeModifier(body.total);
    // Total carried-gear weight: every owned item except cyberware (installed in body)
    // and vehicles (not carried). Includes equipped + unequipped — anything in inventory
    // counts toward what the character is hauling around.
    system.carryWeight = 0;
    for (const item of this.items) {
      if (item.type === "cyberware" || item.type === "vehicle") continue;
      system.carryWeight += parseFloat(item.system?.weight) || 0;
    }

    // Apply wound penalties to stats, tracking the delta in stat.woundMod.
    // `ignoreWounds` (from drugs / cyberware / etc., applied through the
    // bonus pipeline above) zeroes out BOTH the stat penalty AND the save-
    // threshold shift below — the actor takes wounds and tracks damage, but
    // operates as if they had none until the effect wears off.
    let woundState = this.getWoundLevel();
    const ignoringWounds = (system.ignoreWounds || 0) > 0;
    const effectiveWoundState = ignoringWounds ? 0 : woundState;
    let woundStat = function(stat, totalChange) {
        let newTotal = totalChange(stat.total)
        stat.woundMod = -(stat.total - newTotal);
        stat.total = newTotal;
    }
    if(effectiveWoundState >= 4) {
      [stats.ref, stats.int, stats.cool].forEach(stat => woundStat(stat, total => Math.ceil(total/3)));
    }
    else if(effectiveWoundState == 3) {
      [stats.ref, stats.int, stats.cool].forEach(stat => woundStat(stat, total => Math.ceil(total/2)));
    }
    else if(effectiveWoundState == 2) {
      woundStat(stats.ref, total => total - 2);
    }

    // Scrambled: reduce INT and REF by stored penalty (min 2)
    if (this.statuses.has("scrambled")) {
      const scramblePenalty = this.getFlag("cyberpunk", "scrambledPenalty") || 0;
      if (scramblePenalty > 0) {
        stats.int.scrambledMod = -scramblePenalty;
        stats.ref.scrambledMod = -scramblePenalty;
        stats.int.total = Math.max(2, stats.int.total - scramblePenalty);
        stats.ref.total = Math.max(2, stats.ref.total - scramblePenalty);
      }
    }

    // Save thresholds (stored for Monk's Token Bar accessibility). Uses the
    // same `effectiveWoundState` as the stat-penalty block above so the
    // ignoreWounds effect blanks both at once.
    const stunBase = body.total - effectiveWoundState + 1;
    system.stunSave = stunBase + (system.stunSaveMod || 0);
    system.poisonSave = stunBase + (system.poisonSaveMod || 0);
    system.deathSave = stunBase + 3 + (system.deathSaveMod || 0);

    // Calculate and configure humanity
    // Humanity damage is PERMANENT (only restored through therapy)
    const emp = stats.emp;
    const humanityDamage = emp.humanityDamage || 0;

    emp.humanity = {
      base: emp.base * 10,           // Max humanity = EMP × 10
      damage: humanityDamage,        // Permanent damage (from cyberware + other sources)
      total: (emp.base * 10) - humanityDamage  // Current humanity
    };

    // EMP reduction: -1 per 10 humanity lost. Apply the delta to the RUNNING
    // total — the bonus pipeline above may have already nudged emp.total with
    // drug / cyberware / tool effects, and recomputing from `base + tempMod`
    // would silently wipe those out (was a real bug for EMP-boosting drugs).
    emp.total -= Math.floor(humanityDamage / 10);

    // Sleep deprivation: escalating stat penalties (min 2 for REF/INT/COOL, min 0 for EMP)
    const sleepLevel = this.getSleepDeprivationLevel();
    if (sleepLevel >= 2) {
      const refPen  = [0, 0, -1, -2, -3, -4, -5];
      const intPen  = [0, 0,  0, -1, -1, -2, -3];
      const coolPen = [0, 0,  0, -1, -2, -3, -4];
      const empPen  = [0, 0,  0,  0, -1, -2, -3];
      stats.ref.sleepMod = refPen[sleepLevel];
      stats.int.sleepMod = intPen[sleepLevel];
      stats.cool.sleepMod = coolPen[sleepLevel];
      stats.emp.sleepMod = empPen[sleepLevel];
      stats.ref.total = Math.max(2, stats.ref.total + refPen[sleepLevel]);
      stats.int.total = Math.max(2, stats.int.total + intPen[sleepLevel]);
      stats.cool.total = Math.max(2, stats.cool.total + coolPen[sleepLevel]);
      if (empPen[sleepLevel]) {
        stats.emp.total = Math.max(0, stats.emp.total + empPen[sleepLevel]);
      }
    }

    // Cyberlimb derive: route equipped Arm/Leg bases into the 4-slot
    //   { lArm | rArm | lLeg | rLeg } map via (subtype, placement).
    // Skips:
    //   - placement = "extra" (item exists on the actor but doesn't claim a
    //     body zone — never hit, no armor slot, no cyber overlay).
    //   - Structure.max = 0 (the "meat limb" rule — no cyber rendering, no
    //     unarmed-damage bonus, no broken status). The item itself stays
    //     listed under the Cyberware tab so the GM can still edit it.
    const placementKeyForSubtype = {
      arm: { left: "lArm", right: "rArm" },
      leg: { left: "lLeg", right: "rLeg" }
    };
    const limbKeyFor = (item) => {
      const s = item.system || {};
      return placementKeyForSubtype[s.cyberwareSubtype]?.[s.placement] || null;
    };

    // Initialize cyberlimbs data
    system.cyberlimbs = {
      lArm: { hasCyberlimb: false, sdp: 0, maxSdp: 0, disablesAt: 0, isBroken: false, itemId: null },
      rArm: { hasCyberlimb: false, sdp: 0, maxSdp: 0, disablesAt: 0, isBroken: false, itemId: null },
      lLeg: { hasCyberlimb: false, sdp: 0, maxSdp: 0, disablesAt: 0, isBroken: false, itemId: null },
      rLeg: { hasCyberlimb: false, sdp: 0, maxSdp: 0, disablesAt: 0, isBroken: false, itemId: null }
    };

    // Sum SDP bonuses from cyberlimb-option items attached to a given base.
    const sumAttachedSdp = (baseId) => this.items
      .filter(i => isCyberlimbOption(i) && i.getFlag("cyberpunk", "attachedTo") === baseId)
      .reduce((sum, opt) => sum + (opt.system.sdpBonus || 0), 0);

    for (const limb of equippedItems.filter(isCyberlimbBase)) {
      const loc = limbKeyFor(limb);
      if (!loc) continue;                                 // extra placement → skip
      if ((limb.system.structure?.max ?? 0) === 0) continue; // meat-limb rule
      if (system.cyberlimbs[loc].hasCyberlimb) continue;  // already claimed (1st wins)

      const current        = limb.system.structure?.current ?? 0;
      const baseMax        = limb.system.structure?.max ?? 0;
      const baseDisablesAt = limb.system.disablesAt ?? 0;
      const sdpBonusTotal  = sumAttachedSdp(limb.id);
      const max            = baseMax + sdpBonusTotal;
      const disablesAt     = baseDisablesAt + sdpBonusTotal;
      const isBroken       = current > 0 && current <= disablesAt;

      system.cyberlimbs[loc] = {
        hasCyberlimb: true,
        sdp: current,
        maxSdp: max,
        disablesAt: disablesAt,
        isBroken: isBroken,
        itemId: limb.id
      };
    }

    // Helper: is this Arm/Leg base structurally broken?
    const isCyberlimbBroken = (limb) => {
      const current        = limb.system.structure?.current ?? 0;
      const baseDisablesAt = limb.system.disablesAt ?? 0;
      const disablesAt     = baseDisablesAt + sumAttachedSdp(limb.id);
      return current > 0 && current <= disablesAt;
    };

    // Cyberarm/cyberleg upgrade unarmed damage — only counts when the limb
    // has real Structure (meat-limb rule: max=0 is treated as a flesh limb)
    // and isn't broken. Extra-placement limbs DO count for unarmed damage
    // (you can punch with a third arm even though it has no zone), matching
    // the old `extraArm` behaviour.
    const isUsableCyberArm = (i) => isCyberlimbBase(i)
      && i.system.cyberwareSubtype === "arm"
      && (i.system.structure?.max ?? 0) > 0
      && !isCyberlimbBroken(i);
    const isUsableCyberLeg = (i) => isCyberlimbBase(i)
      && i.system.cyberwareSubtype === "leg"
      && (i.system.structure?.max ?? 0) > 0
      && !isCyberlimbBroken(i);
    const hasCyberarm = equippedItems.some(isUsableCyberArm);
    const hasCyberleg = equippedItems.some(isUsableCyberLeg);
    if (hasCyberarm) system.unarmedBaseDamage = "1d6";
    system.kickBaseDamage = hasCyberleg ? "2d6" : "1d6";

    // Determine armor state per location (for visual display)
    const armorState = {};
    const locations = ['Head', 'Torso', 'lArm', 'rArm', 'lLeg', 'rLeg'];
    const limbConditionMap = {
      lArm: 'lost-left-arm',
      rArm: 'lost-right-arm',
      lLeg: 'lost-left-leg',
      rLeg: 'lost-right-leg'
    };

    for (const loc of locations) {
      const hitLoc = system.hitLocations[loc];
      const sp = hitLoc?.stoppingPower || 0;
      const isLimb = ['lArm', 'rArm', 'lLeg', 'rLeg'].includes(loc);

      // Check for limb loss condition
      const isLost = isLimb && this.statuses?.has(limbConditionMap[loc]);

      // Check for cyberlimb (only for limbs)
      const cyberlimb = system.cyberlimbs?.[loc];
      const hasCyber = isLimb && cyberlimb?.hasCyberlimb;

      // Determine highest armor type covering this location
      let hasHardArmor = false;
      equippedItems.filter(i => i.type === "armor").forEach(armor => {
        const coverage = armor.system.coverage?.[loc];
        if (coverage?.stoppingPower > 0 && armor.system.armorType === "hard") {
          hasHardArmor = true;
        }
      });

      // Also check cyberarmor type
      equippedItems.filter(i => i.type === "cyberware" && i.system.isArmor).forEach(cyber => {
        const coverage = cyber.system.armor?.coverage?.[loc];
        if (coverage?.stoppingPower > 0 && cyber.system.armor?.armorType === "hard") {
          hasHardArmor = true;
        }
      });

      // Cover is always hard armor
      if (activeCover && COVER_TYPES[activeCover]) {
        hasHardArmor = true;
      }

      // Determine state for background image
      let state;
      if (isLost) {
        state = 'lost';
      } else if (hasCyber) {
        const isBroken = cyberlimb?.isBroken || false;
        if (sp === 0) {
          // Exposed: use broken variant when cyberlimb is broken
          state = isBroken ? 'cyber-exposed-broken' : 'cyber-exposed';
        } else if (hasHardArmor) {
          state = isBroken ? 'cyber-hard-broken' : 'cyber-hard';
        } else {
          state = isBroken ? 'cyber-soft-broken' : 'cyber-soft';
        }
      } else {
        state = sp === 0 ? 'exposed' : (hasHardArmor ? 'hard' : 'soft');
      }

      armorState[loc] = {
        sp,
        state,
        hasCyber,
        isBroken: cyberlimb?.isBroken || false,
        cyberSdp: cyberlimb?.sdp || 0,
        cyberMaxSdp: cyberlimb?.maxSdp || 0,
        cyberItemId: cyberlimb?.itemId || null
      };
    }

    system.armorState = armorState;

    // NET Actions: derived from Interface skill rank.
    // Hidden entirely if no Interface mapping or rank 0.
    const ifaceRank = getInterfaceSkillRank(this);
    if (ifaceRank <= 0) {
      system.netActions = null;
    } else {
      const baseTotal =
        ifaceRank >= 10 ? 5 :
        ifaceRank >= 7  ? 4 :
        ifaceRank >= 4  ? 3 : 2;
      const lagging = this.statuses.has("lagging");
      const disabled = lagging ? Math.min(1, Math.max(0, baseTotal - 2)) : 0;
      const used = this.getFlag("cyberpunk", "netActionsUsed") ?? 0;
      const usedClamped = Math.min(used, baseTotal - disabled);
      system.netActions = {
        total: baseTotal,
        disabled,
        used: usedClamped,
        available: Math.max(0, baseTotal - disabled - usedClamped)
      };
    }
  }

  /**
   * Override getRollData to add condition-based modifiers
   * @override
   */
  getRollData() {
    const data = super.getRollData();
    // Fast Draw: +3 to initiative
    data.fastDrawMod = this.statuses.has("fast-draw") ? 3 : 0;
    // Surprised: -5 to initiative
    data.surprisedMod = this.statuses.has("surprised") ? -5 : 0;
    // Combat Sense mod: stored on the character; surfaced into roll data so the
    // initiative formula (system.json) can reference it the same way as the
    // others without resorting to system.* deep lookups.
    data.CombatSenseMod = Number(this.system?.CombatSenseMod) || 0;
    return data;
  }

  /**
   *
   * @param {string} sortOrder The order to sort skills by. Options are in skill-sort.js's SortModes. "Name" or "Stat". Default "Name".
   */
  reorderSkills(sortOrder = "Name") {
    // We only need to persist the user's preferred sort mode; the actual sort
    // is performed at render time by sortSkills() against the live item list.
    return this.update({ "system.skillsSortedBy": sortOrder || Object.keys(SortModes)[0] });
  }

  /**
   * Get a body type modifier from the body type stat (body)
   * @param {number} body - Body stat value
   * @returns {number} Body Type Modifier
   */
  static btm(body) {
    return bodyTypeModifier(body);
  }

  /**
   * Maximum health points (40 = 10 wound states × 4 boxes)
   * @type {number}
   */
  get maxHealth() {
    return 40;
  }

  /**
   * Current health points (maxHealth - damage)
   * @type {number}
   */
  get currentHealth() {
    return Math.max(0, this.maxHealth - (this.system.damage || 0));
  }

  /**
   * Current wound state. 0 for uninjured, going up by 1 for each new wound level.
   * 1 = Light, 2 = Serious, 3 = Critical, 4-10 = Mortal 0-6
   * @returns {number} Wound state from 0 (uninjured) to 10 (Mortal 6)
   */
  getWoundLevel() {
    if (this.type !== "character") return 0;
    const damage = this.system.damage;
    if (damage === 0) return 0;
    // Wound slots are 4 wide, so divide by 4, ceil the result, cap at 10
    return Math.min(Math.ceil(damage / 4), 10);
  }


  getStunThreshold() {
    const body = this.system.stats.bt.total;
    // +1 as Light has no penalty, but is 1 from getWoundLevel()
    return body - this.getWoundLevel() + 1;
  }

  getDeathThreshold() {
    // The first wound state to penalise is Mortal 1 instead of Serious.
    return this.getStunThreshold() + 3;
  }

  /**
   * Current fatigue level. 0 = no condition, 1-5 maps to Tired through Collapse.
   * Thresholds are based on effective BODY stat.
   * @returns {number} Fatigue level from 0 (fresh) to 5 (collapse)
   */
  getFatigueLevel() {
    if (this.type !== "character") return 0;
    const fatigue = this.system.fatigue || 0;
    if (fatigue <= 0) return 0;
    const body = this.system.stats.bt.total;
    const half = Math.ceil(body / 2);
    if (fatigue < half) return 0;
    if (fatigue < body) return 1;
    if (fatigue < body * 2) return 2;
    if (fatigue < body * 3) return 3;
    if (fatigue < body * 4) return 4;
    return 5;
  }

  /**
   * Get the roll penalty for the current fatigue level.
   * @returns {number} Negative penalty (e.g. -1, -2, -3, -5, -8) or 0
   */
  getFatiguePenalty() {
    if ((this.system.ignoreFatigue || 0) > 0) return 0;
    const level = this.getFatigueLevel();
    if (level === 0) return 0;
    const conditionId = FATIGUE_LEVEL_TO_CONDITION[level];
    return FATIGUE_PENALTIES[conditionId] || 0;
  }

  /**
   * Current stress level. -1 = Fresh (bonus), 0 = no condition, 1-4 maps to Anxious through Cracked.
   * Thresholds are based on effective COOL stat.
   * @returns {number} Stress level from -1 (fresh) to 4 (cracked)
   */
  getStressLevel() {
    if (this.type !== "character") return 0;
    const stress = (this.system.stress || 0) + (this.system.fright || 0);
    if (stress < 0) return 0;
    const cool = this.system.stats.cool.total;
    const half = Math.ceil(cool / 2);
    if (stress < half) return -1;        // (0, COOL/2) → Fresh
    if (stress < cool) return 0;         // [COOL/2, COOL) → no condition
    if (stress < cool * 2) return 1;     // [COOL, COOLx2) → Anxious
    if (stress < cool * 3) return 2;     // [COOLx2, COOLx3) → Tense
    if (stress < cool * 4) return 3;     // [COOLx3, COOLx4) → Stressed
    return 4;                            // [COOLx4, ...) → Cracked
  }

  /**
   * Current fright level based on raw fright points.
   * 0 = Normal, 1 = Stunned, 2 = Surprised, 3 = Shocked, 4 = Overwhelmed, 5 = Blown Away.
   * @returns {number} Fright level from 0 to 5
   */
  getFrightLevel() {
    if (this.type !== "character") return 0;
    const fright = this.system.fright || 0;
    if (fright === 0) return 0;
    if (fright <= 2) return 1;
    if (fright <= 5) return 2;
    if (fright <= 12) return 3;
    if (fright <= 18) return 4;
    return 5;
  }

  /**
   * Current sleep deprivation level (0 = well rested, 1–6 = escalating deprivation).
   * @returns {number} Sleep deprivation level from 0 to 6
   */
  getSleepDeprivationLevel() {
    if (this.type !== "character") return 0;
    const sleep = this.system.sleep || 0;
    if (sleep <= 0) return 0;
    return Math.min(sleep, 6);
  }

  /**
   * Get the skill roll penalty for the current sleep deprivation level.
   * Level 1 only penalizes Awareness; levels 2+ penalize all skill rolls.
   * @param {boolean} isAwareness - Whether this is an Awareness/Notice roll
   * @returns {number} Penalty (e.g. -1 to -5) or 0
   */
  getSleepDeprivationPenalty(isAwareness = false) {
    const level = this.getSleepDeprivationLevel();
    if (level === 0) return 0;
    if (level === 1) return isAwareness ? -1 : 0;
    const conditionId = SLEEP_LEVEL_TO_CONDITION[level];
    return SLEEP_SKILL_PENALTIES[conditionId] || 0;
  }

  /**
   * Get the roll penalty (or bonus) for the current stress level.
   * @param {boolean} isCoolRoll - Whether this is a COOL-based roll
   * @returns {number} Penalty/bonus (e.g. +1 for Fresh on COOL, -1 to -5 for negative conditions)
   */
  getStressPenalty(isCoolRoll = false) {
    if ((this.system.ignoreStressFright || 0) > 0) return 0;
    const level = this.getStressLevel();
    if (level === 0) return 0;
    const conditionId = STRESS_LEVEL_TO_CONDITION[level];
    if (!conditionId) return 0;
    return isCoolRoll
      ? (STRESS_COOL_PENALTIES[conditionId] || 0)
      : (STRESS_GENERAL_PENALTIES[conditionId] || 0);
  }

  /**
   * Generic helper: ensure exactly one (or zero) condition from `allIds` is
   * active on this actor, matching `targetId`. If `targetId` is null/empty,
   * the actor ends with none of the listed conditions active. Idempotent —
   * returns early when no change is needed.
   */
  async _syncSingleCondition(allIds, targetId) {
    let current = null;
    for (const id of allIds) {
      if (this.statuses.has(id)) { current = id; break; }
    }
    if (current === targetId) return;
    if (current) {
      await this.toggleStatusEffect(current, { active: false });
    }
    if (targetId) {
      await this.toggleStatusEffect(targetId, { active: true });
    }
  }

  /**
   * Synchronize the stress condition on this actor's token(s) based on current stress points.
   * Called automatically when stress or COOL changes.
   */
  async updateStressStatus() {
    const level = this.getStressLevel();
    await this._syncSingleCondition(STRESS_CONDITION_IDS, STRESS_LEVEL_TO_CONDITION[level] || null);
  }

  /**
   * Auto-apply or remove conditions derived from stress level changes.
   * Insomnia at Anxious+, Insane at Cracked.
   * @param {number} oldStress - Stress value before the update
   * @param {number} oldFright - Fright value before the update
   */
  async updateStressDerivedConditions(oldStress, oldFright) {
    const oldCombined = (oldStress || 0) + (oldFright || 0);
    const newCombined = (this.system.stress || 0) + (this.system.fright || 0);
    const increased = newCombined > oldCombined;
    const level = this.getStressLevel();

    // Anxious+ → Insomnia (auto-remove when below Anxious)
    if (increased && level >= 1 && !this.statuses.has("insomnia")) {
      await this.toggleStatusEffect("insomnia", { active: true });
    } else if (level < 1 && this.statuses.has("insomnia")) {
      await this.toggleStatusEffect("insomnia", { active: false });
    }

    // Cracked → Insane (auto-remove only when below Cracked AND fright below Blown Away)
    if (increased && level >= 4 && !this.statuses.has("insane")) {
      await this.toggleStatusEffect("insane", { active: true });
    } else if (level < 4 && this.getFrightLevel() < 5 && this.statuses.has("insane")) {
      await this.toggleStatusEffect("insane", { active: false });
    }
  }

  /**
   * Auto-apply or remove conditions derived from fright level changes.
   * Surprised at any fright, Frightened/Fleeing at Shocked/Overwhelmed, Insane at Blown Away.
   * @param {number} oldFright - Fright value before the update
   */
  async updateFrightConditions(oldFright) {
    const newFright = this.system.fright || 0;
    const increased = newFright > oldFright;
    const level = this.getFrightLevel();

    // Any fright → Surprised (auto-remove when fright drops to 0)
    if (increased && newFright > 0 && !this.statuses.has("surprised")) {
      await this.toggleStatusEffect("surprised", { active: true });
    } else if (newFright === 0 && this.statuses.has("surprised")) {
      await this.toggleStatusEffect("surprised", { active: false });
    }

    // Shocked/Overwhelmed → Frightened or Fleeing via 1d6 roll
    if (increased && (level === 3 || level === 4)
        && !this.statuses.has("frightened") && !this.statuses.has("fleeing")) {
      const frightenedThreshold = level === 3 ? 3 : 4;
      await this._rollFrightReaction(frightenedThreshold);
    } else if (level < 3) {
      // Auto-remove when dropping below Shocked
      if (this.statuses.has("frightened")) await this.toggleStatusEffect("frightened", { active: false });
      if (this.statuses.has("fleeing")) await this.toggleStatusEffect("fleeing", { active: false });
    }

    // Blown Away → Insane (auto-remove only when stress also below Cracked)
    if (increased && level === 5 && !this.statuses.has("insane")) {
      await this.toggleStatusEffect("insane", { active: true });
    } else if (level < 5 && this.getStressLevel() < 4 && this.statuses.has("insane")) {
      await this.toggleStatusEffect("insane", { active: false });
    }
  }

  /**
   * Roll 1d6 to determine Frightened vs Fleeing reaction.
   * @param {number} frightenedThreshold - Roll at or below = Frightened, above = Fleeing
   */
  async _rollFrightReaction(frightenedThreshold) {
    const roll = new Roll("1d6");
    await roll.evaluate();
    const conditionId = roll.total <= frightenedThreshold ? "frightened" : "fleeing";
    await this.toggleStatusEffect(conditionId, { active: true });
  }

  /**
   * Synchronize the fatigue condition on this actor's token(s) based on current fatigue points.
   * Removes any existing fatigue condition and applies the appropriate one.
   * Called automatically when fatigue or BODY changes.
   */
  async updateFatigueStatus() {
    const level = this.getFatigueLevel();
    await this._syncSingleCondition(FATIGUE_CONDITION_IDS, FATIGUE_LEVEL_TO_CONDITION[level] || null);
  }

  /**
   * Synchronize the sleep deprivation condition based on days awake.
   * Removes any existing sleep deprivation condition and applies the appropriate one.
   * Called automatically when system.sleep changes.
   */
  async updateSleepDeprivationStatus() {
    const level = this.getSleepDeprivationLevel();
    const newConditionId = SLEEP_LEVEL_TO_CONDITION[level] || null;

    let currentCondition = null;
    for (const id of SLEEP_CONDITION_IDS) {
      if (this.statuses.has(id)) {
        currentCondition = id;
        break;
      }
    }

    if (currentCondition === newConditionId) return;

    if (currentCondition) {
      await this.toggleStatusEffect(currentCondition, { active: false });
    }
    if (newConditionId) {
      await this.toggleStatusEffect(newConditionId, { active: true });
    }
  }

  /**
   * Synchronize the wound condition on this actor's token(s) based on current damage.
   * Removes any existing wound condition and applies the appropriate one.
   * Called automatically when damage changes.
   */
  async updateWoundStatus() {
    const state = this.getWoundLevel();
    await this._syncSingleCondition(WOUND_CONDITION_IDS, WOUND_STATE_TO_CONDITION[state] || null);
  }

  /**
   * Synchronize the cover condition on this actor's token(s) based on activeCover.
   * Removes any existing cover condition and applies the appropriate one.
   * Called automatically when activeCover changes.
   */
  async updateCoverStatus() {
    const coverKey = this.system.activeCover;
    const newConditionId = coverKey ? (COVER_KEY_TO_CONDITION[coverKey] || null) : null;
    await this._syncSingleCondition(COVER_CONDITION_IDS, newConditionId);
  }

  /**
   * Sync the drone's chassis condition (Disabled / Dead) from torso SDP.
   *   chassis SDP <= 0           → Dead (and clears Disabled)
   *   chassis SDP <= disablesAt  → Disabled
   *   chassis SDP healthy        → neither
   */
  async updateChassisStatus() {
    if (this.type !== "drone") return;
    const torso = this.system.zones?.torso;
    if (!torso) return;

    const sdpCurrent = torso.sdp?.current ?? 0;
    const disablesAt = torso.sdp?.disablesAt ?? 0;
    const sdpMax = torso.sdp?.max ?? 0;

    let target = null;
    if (sdpMax > 0) {
      if (sdpCurrent <= 0) target = "dead";
      else if (sdpCurrent <= disablesAt) target = "disabled";
    }

    const isDead = this.statuses.has("dead");
    const isDisabled = this.statuses.has("disabled");
    const current = isDead ? "dead" : (isDisabled ? "disabled" : null);
    if (current === target) return;

    if (current && current !== target) {
      await this.toggleStatusEffect(current, { active: false });
    }
    if (target) {
      await this.toggleStatusEffect(target, { active: true });
    }
  }

  /**
   * Apply / remove the Immobilized condition based on whether total carried gear weight
   * exceeds carry capacity (BT × 10). Uses a flag to track ownership, so we only auto-remove
   * Immobilized that we ourselves applied — leaving grapple-applied Immobilized alone.
   */
  async updateEncumbranceStatus() {
    const overweight = (this.system.carryWeight || 0) > (this.system.stats?.bt?.carry || 0);
    const isImmobilized = this.statuses.has("immobilized");
    const ownedByOverload = !!this.getFlag("cyberpunk", "overloaded");

    if (overweight) {
      // Need Immobilized on. If we're not the source, only act when nobody else has it on.
      if (!isImmobilized) {
        await this.toggleStatusEffect("immobilized", { active: true });
        await this.setFlag("cyberpunk", "overloaded", true);
      }
      // If immobilized was already on for some other reason (grapple), leave the flag
      // untouched so we don't auto-remove their state when they un-overload.
    } else if (ownedByOverload) {
      // We applied it; safe to remove.
      if (isImmobilized) {
        await this.toggleStatusEffect("immobilized", { active: false });
      }
      await this.unsetFlag("cyberpunk", "overloaded");
    }
  }

  /** @override */
  _preUpdate(changed, options, user) {
    super._preUpdate(changed, options, user);
    // Snapshot current stress/fright before the update so _onUpdate can detect increases
    if (changed.system?.stress !== undefined || changed.system?.fright !== undefined) {
      options._oldStress = this.system.stress || 0;
      options._oldFright = this.system.fright || 0;
    }
  }

  /** @override */
  async _onUpdate(changed, options, userId) {
    await super._onUpdate(changed, options, userId);

    // Only sync conditions on the client that triggered the update
    // Prevents permission errors on player clients and race conditions
    // when multiple clients try to toggle the same ActiveEffect
    if (userId !== game.user.id) return;

    // Cover sync runs for any actor type — drones can hide behind cover too.
    if (changed.system?.activeCover !== undefined) {
      await this.updateCoverStatus();
    }

    // Drone chassis (torso) SDP drives Disabled / Dead conditions.
    if (this.type === "drone" && changed.system?.zones?.torso !== undefined) {
      await this.updateChassisStatus();
    }

    // Drones don't have wounds / fatigue / stress / fright / sleep state machines.
    // Skip every organic-state sync below.
    if (this.type !== "character") return;

    // Sync wound condition when damage changes
    if (changed.system?.damage !== undefined) {
      await this.updateWoundStatus();
    }

    // Sync fatigue condition when fatigue points or BODY stat changes
    if (changed.system?.fatigue !== undefined || changed.system?.stats?.bt) {
      await this.updateFatigueStatus();
    }

    // Re-evaluate encumbrance when BT changes (carry capacity = BT × 10).
    // Item-driven changes are handled by createItem/updateItem/deleteItem hooks.
    if (changed.system?.stats?.bt) {
      await this.updateEncumbranceStatus();
    }

    // Sync stress condition when stress points or COOL stat changes
    if (changed.system?.stress !== undefined || changed.system?.fright !== undefined || changed.system?.stats?.cool) {
      await this.updateStressStatus();
    }

    // Auto-apply/remove derived conditions from stress/fright changes
    if (changed.system?.stress !== undefined || changed.system?.fright !== undefined) {
      const oldStress = options._oldStress ?? (this.system.stress || 0);
      const oldFright = options._oldFright ?? (this.system.fright || 0);
      await this.updateStressDerivedConditions(oldStress, oldFright);
      await this.updateFrightConditions(oldFright);
    }

    // Sync sleep deprivation condition when days awake changes
    if (changed.system?.sleep !== undefined) {
      await this.updateSleepDeprivationStatus();
    }
  }

  getLearnedMartialArts() {
    return this.itemTypes.skill
      .filter(skill => skill.name.startsWith(localize("Martial")))
      .filter(martial => this._resolveSkillValue(martial).value > 0)
      .map(martial => martial.name);
  }

  static effectiveSkillLevel(skill) {
    // Raw baseline: natural level + IP-earned level. Override semantics
    // (chips, etc.) live on equipped items and are applied via the actor's
    // _resolveSkillValue pipeline, not here — this static helper has no
    // actor context (used for sort + raw-data callers).
    if (!skill) return 0;
    const data = skill.system ?? skill;
    return (Number(data.level) || 0) + (Number(data.ipLevel) || 0);
  }

  /**
   * Resolve a skill's effective rolled value via the universal op pipeline:
   *   baseline → ×(all) → +(all) → =(last-wins).
   * Equipped tools / drugs / cyberware contribute through their `bonuses[]`
   * matched by uuid or by case-insensitive skill name. Used by every skill
   * roll path and by resolveSkillTotal — single source of truth.
   *
   * @param {Item|null} skillItem  Owned skill item, or null for a virtual skill.
   * @param {string|null} skillName Fallback name when skillItem is null.
   * @returns {{value: number, overridden: boolean, baseline: number}}
   */
  _resolveSkillValue(skillItem, skillName = null) {
    const name = (skillItem?.name || skillName || "").toLowerCase();
    const uuid = skillItem?.uuid || null;

    const baseline = skillItem
      ? (Number(skillItem.system.level) || 0) + (Number(skillItem.system.ipLevel) || 0)
      : 0;

    const muls = [], divs = [], adds = [], subs = [], sets = [];
    const equipped = this.items.contents.filter(i =>
      (i.type === "tool" || i.type === "cyberware") && i.system.equipped
    );
    const pushBonus = (bonus) => {
      if (bonus.type !== "skill") return;
      const matchByUuid = uuid && bonus.skillUuid === uuid;
      const matchByName = name && bonus.skillName?.toLowerCase() === name;
      if (!matchByUuid && !matchByName) return;
      const op = bonus.op || "+";
      const value = Number(bonus.value) || 0;
      if      (op === "×") muls.push(value);
      else if (op === "÷") divs.push(value);
      else if (op === "−") subs.push(value);
      else if (op === "=") sets.push(value);
      else                 adds.push(value); // "+" and unknown
    };
    for (const item of equipped) {
      for (const bonus of (item.system.bonuses || [])) pushBonus(bonus);
    }
    // Drug ActiveEffects contribute skill bonuses via their phase-tagged
    // flag payload (skill bonuses don't have a clean ActiveEffect change
    // mapping, so we read them from `activeChanges` / `withdrawalChanges`).
    for (const effect of this.effects) {
      if (effect.disabled) continue;
      if (effect.getFlag("cyberpunk", "isDrugEffect") !== true) continue;
      const phase = effect.getFlag("cyberpunk", "phase") || "active";
      const bonuses = (phase === "withdrawal"
        ? effect.getFlag("cyberpunk", "withdrawalChanges")
        : effect.getFlag("cyberpunk", "activeChanges")) || [];
      for (const bonus of bonuses) pushBonus(bonus);
    }

    let current = baseline;
    for (const m of muls) current *= m;
    for (const d of divs) if (d !== 0) current /= d;
    for (const a of adds) current += a;
    for (const s of subs) current -= s;
    let overridden = false;
    if (sets.length) {
      if (sets.length > 1) {
        console.warn(`CYBERPUNK | multiple "=" bonuses on skill "${name}"; using last (${sets[sets.length - 1]})`);
      }
      current = sets[sets.length - 1];
      overridden = true;
    }
    return { value: current, overridden, baseline };
  }

  resolveSkillTotal(skillName) {
    const nameLoc = localize("Skill" + skillName);
    // Localization may return the original key, so we check both options
    const targetName = nameLoc.includes("Skill") ? skillName : nameLoc;

    let skillItem = this.itemTypes.skill.find(s => s.name === targetName);
    // Fallback: try original name if localized name didn't match (e.g. martial art sub-types)
    if (!skillItem && targetName !== skillName) {
      skillItem = this.itemTypes.skill.find(s => s.name === skillName);
    }
    if (!skillItem) return 0;
    return this._resolveSkillValue(skillItem).value;
  }

  /**
   * Skill check with Advantage / Disadvantage taken into account
   * @param {string}  skillId
   * @param {number}  extraMod
   * @param {boolean} advantage
   * @param {boolean} disadvantage
   */
  async performSkillRoll(skillId, extraMod = 0, advantage = false, disadvantage = false) {
    // Handle virtual skills (from equipped chipware)
    if (skillId.startsWith('virtual-')) {
      return this._rollVirtualSkill(skillId, extraMod, advantage, disadvantage);
    }

    const skill = this.items.get(skillId);
    if (!skill) return;

    // Action Surge: -3 penalty on all skill rolls
    const actionSurgePenalty = this.statuses.has("action-surge") ? -3 : 0;

    // Fast Draw: -3 penalty on all rolls
    const fastDrawPenalty = this.statuses.has("fast-draw") ? -3 : 0;

    // Restrained: -2 penalty on all checks
    const restrainedPenalty = this.statuses.has("restrained") ? -2 : 0;
    // Grappling: -2 penalty on all checks
    const grapplingPenalty = this.statuses.has("grappling") ? -2 : 0;
    // Fatigue penalty (varies by fatigue level)
    const fatiguePenalty = this.getFatiguePenalty();
    // Stress penalty (varies by stress level and whether this is a COOL roll)
    const stressPenalty = this.getStressPenalty(skill.system.stat === "cool");

    // Awareness/Notice condition penalties (Unconscious -8, Blinded -4, Deafened -2)
    let awarenessConditionPenalty = 0;
    const awarenessSkillName = localize("SkillAwarenessNotice");
    if (skill.name === awarenessSkillName) {
      if (this.statuses.has("unconscious")) awarenessConditionPenalty -= 8;
      if (this.statuses.has("blinded")) awarenessConditionPenalty -= 4;
      if (this.statuses.has("deafened")) awarenessConditionPenalty -= 2;
    }

    // Sleep deprivation penalty (level 1 = awareness only, levels 2+ = all skills)
    const sleepPenalty = this.getSleepDeprivationPenalty(skill.name === awarenessSkillName);

    // Unified resolver: baseline + IP, then × → + → = from equipped items.
    // Override (chips / sets) shows up as overridden=true so we can gate IP gain.
    const { value: skillValue } = this._resolveSkillValue(skill);

    // generate the list of modifiers
    const parts = [
      skillValue,
      skill.system.stat ? `@stats.${skill.system.stat}.total` : null,
      skill.name === localize("SkillAwarenessNotice") ? "@CombatSenseMod" : null,
      extraMod || null,
      actionSurgePenalty || null,
      fastDrawPenalty || null,
      restrainedPenalty || null,
      grapplingPenalty || null,
      fatiguePenalty || null,
      stressPenalty || null,
      awarenessConditionPenalty || null,
      sleepPenalty || null
    ].filter(Boolean);

    const makeRoll = () => buildD10Roll(parts, this.system);   // d10 + parts

    // if both are accidentally marked — ignore
    if (advantage && disadvantage) { advantage = disadvantage = false; }

    // Advantage / Disadvantage
    if (advantage || disadvantage) {
      const r1 = makeRoll();
      const r2 = makeRoll();

      try {
        await Promise.all([r1.evaluate(), r2.evaluate()]);
        const chosen = advantage
          ? (r1.total >= r2.total ? r1 : r2)   // best
          : (r1.total <= r2.total ? r1 : r2);  // worst

        new RollBundle(skill.name)
          .addRoll(chosen)
          .defaultExecute({ statIcon: skill.system.stat }, this);
      } catch (e) {
        console.error("CyberpunkActor: Failed to evaluate advantage/disadvantage rolls", e);
      }
      return;
    }

    // normal roll
    new RollBundle(skill.name)
      .addRoll(makeRoll())
      .defaultExecute({ statIcon: skill.system.stat }, this);
  }

  /**
   * Roll a virtual skill from equipped chipware
   * Virtual skills are skills the character doesn't own but can use via chipware
   * @param {string}  virtualId - Format: "virtual-{chipwareId}-{skillName}"
   * @param {number}  extraMod
   * @param {boolean} advantage
   * @param {boolean} disadvantage
   */
  async _rollVirtualSkill(virtualId, extraMod = 0, advantage = false, disadvantage = false) {
    // Parse virtualId: "virtual-{chipwareId}-{skillName}"
    const parts = virtualId.split('-');
    const chipwareId = parts[1];
    const skillName = parts.slice(2).join('-');

    const chipware = this.items.get(chipwareId);
    if (!chipware) {
      console.warn(`CyberpunkActor: Chipware ${chipwareId} not found for virtual skill`);
      return;
    }

    // Find the skill bonus in chipware
    const bonus = chipware.system.bonuses?.find(b =>
      b.type === "skill" && b.skillName === skillName
    );
    if (!bonus) {
      console.warn(`CyberpunkActor: Skill bonus for ${skillName} not found in chipware`);
      return;
    }

    // Use stored stat or default to ref
    const stat = bonus.skillStat || 'ref';

    // Action Surge: -3 penalty on all skill rolls
    const actionSurgePenalty = this.statuses.has("action-surge") ? -3 : 0;

    // Fast Draw: -3 penalty on all rolls
    const fastDrawPenalty = this.statuses.has("fast-draw") ? -3 : 0;

    // Restrained: -2 penalty on all checks
    const restrainedPenalty = this.statuses.has("restrained") ? -2 : 0;
    // Grappling: -2 penalty on all checks
    const grapplingPenalty = this.statuses.has("grappling") ? -2 : 0;
    // Fatigue penalty (varies by fatigue level)
    const fatiguePenalty = this.getFatiguePenalty();
    // Stress penalty (varies by stress level and whether this is a COOL roll)
    const stressPenalty = this.getStressPenalty(stat === "cool");
    // Sleep deprivation penalty (virtual skills are general skill rolls)
    const sleepPenalty = this.getSleepDeprivationPenalty(false);

    // Virtual-skill value: run the unified pipeline against the skill name,
    // so any additive boosters elsewhere can layer on the chip's "=" stamp.
    const { value: skillValue } = this._resolveSkillValue(null, skillName);

    // Build roll parts
    const rollParts = [
      skillValue,
      `@stats.${stat}.total`,
      extraMod || null,
      actionSurgePenalty || null,
      fastDrawPenalty || null,
      restrainedPenalty || null,
      grapplingPenalty || null,
      fatiguePenalty || null,
      stressPenalty || null,
      sleepPenalty || null
    ].filter(Boolean);

    const makeRoll = () => buildD10Roll(rollParts, this.system);

    // if both are accidentally marked — ignore
    if (advantage && disadvantage) { advantage = disadvantage = false; }

    // Advantage / Disadvantage
    if (advantage || disadvantage) {
      const r1 = makeRoll();
      const r2 = makeRoll();

      try {
        await Promise.all([r1.evaluate(), r2.evaluate()]);
        const chosen = advantage
          ? (r1.total >= r2.total ? r1 : r2)
          : (r1.total <= r2.total ? r1 : r2);

        new RollBundle(skillName)
          .addRoll(chosen)
          .defaultExecute({ statIcon: stat }, this);
      } catch (e) {
        console.error("CyberpunkActor: Failed to evaluate advantage/disadvantage rolls", e);
      }
      return;
    }

    // normal roll
    new RollBundle(skillName)
      .addRoll(makeRoll())
      .defaultExecute({ statIcon: stat }, this);
  }

  performStatRoll(statName) {
    let fullStatName = localize(toTitleCase(statName) + "Full");

    // Action Surge: -3 penalty on all stat rolls
    const actionSurgePenalty = this.statuses.has("action-surge") ? -3 : 0;

    // Fast Draw: -3 penalty on all rolls
    const fastDrawPenalty = this.statuses.has("fast-draw") ? -3 : 0;

    // Restrained: -2 penalty on all checks
    const restrainedPenalty = this.statuses.has("restrained") ? -2 : 0;
    // Grappling: -2 penalty on all checks
    const grapplingPenalty = this.statuses.has("grappling") ? -2 : 0;
    // Fatigue penalty (varies by fatigue level)
    const fatiguePenalty = this.getFatiguePenalty();
    // Stress penalty (varies by stress level and whether this is a COOL roll)
    const stressPenalty = this.getStressPenalty(statName === "cool");

    const parts = [`@stats.${statName}.total`];
    if (actionSurgePenalty) parts.push(actionSurgePenalty);
    if (fastDrawPenalty) parts.push(fastDrawPenalty);
    if (restrainedPenalty) parts.push(restrainedPenalty);
    if (grapplingPenalty) parts.push(grapplingPenalty);
    if (fatiguePenalty) parts.push(fatiguePenalty);
    if (stressPenalty) parts.push(stressPenalty);

    let roll = new RollBundle(fullStatName);
    roll.addRoll(buildD10Roll(parts, this.system));
    roll.defaultExecute({ statIcon: statName }, this);
  }

  /**
   * Roll a skill check against a difficulty target
   * @param {string} skillId - The skill item ID
   * @param {number} difficulty - Target number (10, 15, 20, 25, 30)
   * @param {number} extraMod - Additional modifier (conditions + luck)
   */
  async rollSkillCheck(skillId, difficulty, extraMod = 0) {
    // Handle virtual skills from chipware
    if (skillId.startsWith('virtual-')) {
      return this._rollVirtualSkillCheck(skillId, difficulty, extraMod);
    }

    const skill = this.items.get(skillId);
    if (!skill) return;

    // Action Surge: -3 penalty on all skill rolls
    const actionSurgePenalty = this.statuses.has("action-surge") ? -3 : 0;

    // Fast Draw: -3 penalty on all rolls
    const fastDrawPenalty = this.statuses.has("fast-draw") ? -3 : 0;

    // Restrained: -2 penalty on all checks
    const restrainedPenalty = this.statuses.has("restrained") ? -2 : 0;
    // Grappling: -2 penalty on all checks
    const grapplingPenalty = this.statuses.has("grappling") ? -2 : 0;
    // Fatigue penalty (varies by fatigue level)
    const fatiguePenalty = this.getFatiguePenalty();
    // Stress penalty (varies by stress level and whether this is a COOL roll)
    const stressPenalty = this.getStressPenalty(skill.system.stat === "cool");

    // Awareness/Notice condition penalties (Unconscious -8, Blinded -4, Deafened -2)
    let awarenessConditionPenalty = 0;
    const awarenessSkillName = localize("SkillAwarenessNotice");
    if (skill.name === awarenessSkillName) {
      if (this.statuses.has("unconscious")) awarenessConditionPenalty -= 8;
      if (this.statuses.has("blinded")) awarenessConditionPenalty -= 4;
      if (this.statuses.has("deafened")) awarenessConditionPenalty -= 2;
    }

    // Sleep deprivation penalty (level 1 = awareness only, levels 2+ = all skills)
    const sleepPenalty = this.getSleepDeprivationPenalty(skill.name === awarenessSkillName);

    // Unified resolver: baseline + IP, then × → + → = from equipped items.
    // overridden = an "=" bonus stamped the value (chip / set). Used below to
    // gate IP gain — overridden skills don't grant IP (the chip rolled, not you).
    const { value: skillValue, overridden: isOverridden } = this._resolveSkillValue(skill);

    // Build roll formula parts
    const parts = [
      skillValue,
      skill.system.stat ? `@stats.${skill.system.stat}.total` : null,
      skill.name === localize("SkillAwarenessNotice") ? "@CombatSenseMod" : null,
      extraMod || null,
      actionSurgePenalty || null,
      fastDrawPenalty || null,
      restrainedPenalty || null,
      grapplingPenalty || null,
      fatiguePenalty || null,
      stressPenalty || null,
      awarenessConditionPenalty || null,
      sleepPenalty || null
    ].filter(Boolean);

    const roll = buildD10Roll(parts, this.system);
    await roll.evaluate();

    // Check for natural 1 on the d10
    const d10Result = roll.dice[0]?.results[0]?.result;
    const isNatural1 = d10Result === 1;

    // Determine success: natural 1 always fails, otherwise compare to difficulty
    const success = !isNatural1 && roll.total >= difficulty;

    // Auto IP gain on success (not when an override was used — chip/set rolls
    // don't count as practice).
    let ipGained = 0;
    if (success && !isOverridden) {
      const firstDigit = parseInt(String(roll.total)[0]);
      const isCrit = d10Result === 10;
      ipGained = firstDigit + (isCrit ? 1 : 0);
      const currentIp = skill.system.ip || 0;
      await this.updateEmbeddedDocuments("Item", [{
        _id: skillId,
        "system.ip": currentIp + ipGained
      }]);
    }

    // Create chat message
    const speaker = ChatMessage.getSpeaker({ actor: this });
    new RollBundle(skill.name)
      .addRoll(roll)
      .execute(speaker, "systems/cyberpunk/templates/chat/skill-check.hbs", {
        statIcon: skill.system.stat,
        difficulty: difficulty,
        success: success,
        ipGained: ipGained
      });

    // Roll fumble on natural 1
    if (isNatural1) {
      await this.rollFumble();
    }
  }

  /**
   * Grant IP to a combat skill based on an attack roll.
   * Same formula as skill checks: first digit of total + 1 if crit (nat 10).
   * @param {Roll} attackRoll - The evaluated attack roll
   * @param {string} skillName - The skill name (internal key or localized)
   * @returns {number} IP gained (0 if skill not found or chipped)
   */
  async grantCombatIP(attackRoll, skillName) {
    if (!skillName) return 0;
    const nameLoc = localize("Skill" + skillName);
    const targetName = nameLoc.includes("Skill") ? skillName : nameLoc;
    let skill = this.itemTypes.skill.find(s => s.name === targetName);
    if (!skill && targetName !== skillName) {
      skill = this.itemTypes.skill.find(s => s.name === skillName);
    }
    if (!skill) return 0;
    // No IP gain when an equipped override (chip / set) stamped the value —
    // the chip rolled, not the character's natural skill.
    if (this._resolveSkillValue(skill).overridden) return 0;

    const firstDigit = parseInt(String(attackRoll.total)[0]);
    const isCrit = attackRoll.dice[0]?.results?.[0]?.result === 10;
    const ipGained = firstDigit + (isCrit ? 1 : 0);
    const currentIp = skill.system.ip || 0;
    await this.updateEmbeddedDocuments("Item", [{
      _id: skill.id,
      "system.ip": currentIp + ipGained
    }]);
    return ipGained;
  }

  /**
   * Roll a virtual skill check (from chipware) against a difficulty
   * @param {string} virtualId - Format: "virtual-{chipwareId}-{skillName}"
   * @param {number} difficulty - Target number
   * @param {number} extraMod - Additional modifier
   */
  async _rollVirtualSkillCheck(virtualId, difficulty, extraMod = 0) {
    const parts = virtualId.split('-');
    const chipwareId = parts[1];
    const skillName = parts.slice(2).join('-');

    const chipware = this.items.get(chipwareId);
    if (!chipware) return;

    const bonus = chipware.system.bonuses?.find(b =>
      b.type === "skill" && b.skillName === skillName
    );
    if (!bonus) return;

    const stat = bonus.skillStat || 'ref';
    const actionSurgePenalty = this.statuses.has("action-surge") ? -3 : 0;
    const fastDrawPenalty = this.statuses.has("fast-draw") ? -3 : 0;
    const restrainedPenalty = this.statuses.has("restrained") ? -2 : 0;
    const grapplingPenalty = this.statuses.has("grappling") ? -2 : 0;
    const fatiguePenalty = this.getFatiguePenalty();
    const stressPenalty = this.getStressPenalty(stat === "cool");

    // Virtual-skill value: unified pipeline (chip "=" stamp + any additive boosters).
    const { value: skillValue } = this._resolveSkillValue(null, skillName);

    const rollParts = [
      skillValue,
      `@stats.${stat}.total`,
      extraMod || null,
      actionSurgePenalty || null,
      fastDrawPenalty || null,
      restrainedPenalty || null,
      grapplingPenalty || null,
      fatiguePenalty || null,
      stressPenalty || null
    ].filter(Boolean);

    const roll = buildD10Roll(rollParts, this.system);
    await roll.evaluate();

    const d10Result = roll.dice[0]?.results[0]?.result;
    const isNatural1 = d10Result === 1;
    const success = !isNatural1 && roll.total >= difficulty;

    const speaker = ChatMessage.getSpeaker({ actor: this });
    new RollBundle(skillName)
      .addRoll(roll)
      .execute(speaker, "systems/cyberpunk/templates/chat/skill-check.hbs", {
        statIcon: stat,
        difficulty: difficulty,
        success: success
      });

    // Roll fumble on natural 1
    if (isNatural1) {
      await this.rollFumble();
    }
  }

  /**
   * Roll a stat check against a difficulty target
   * @param {string} statName - The stat key (int, ref, tech, etc.)
   * @param {number} difficulty - Target number (10, 15, 20, 25, 30)
   * @param {number} extraMod - Additional modifier (conditions + luck)
   */
  async rollStatCheck(statName, difficulty, extraMod = 0) {
    const fullStatName = localize(toTitleCase(statName) + "Full");
    const actionSurgePenalty = this.statuses.has("action-surge") ? -3 : 0;
    const fastDrawPenalty = this.statuses.has("fast-draw") ? -3 : 0;
    const restrainedPenalty = this.statuses.has("restrained") ? -2 : 0;
    const grapplingPenalty = this.statuses.has("grappling") ? -2 : 0;
    const fatiguePenalty = this.getFatiguePenalty();
    const stressPenalty = this.getStressPenalty(statName === "cool");

    const parts = [`@stats.${statName}.total`];
    if (actionSurgePenalty) parts.push(actionSurgePenalty);
    if (fastDrawPenalty) parts.push(fastDrawPenalty);
    if (restrainedPenalty) parts.push(restrainedPenalty);
    if (grapplingPenalty) parts.push(grapplingPenalty);
    if (fatiguePenalty) parts.push(fatiguePenalty);
    if (stressPenalty) parts.push(stressPenalty);
    if (extraMod) parts.push(extraMod);

    const roll = buildD10Roll(parts, this.system);
    await roll.evaluate();

    const d10Result = roll.dice[0]?.results[0]?.result;
    const isNatural1 = d10Result === 1;
    const success = !isNatural1 && roll.total >= difficulty;

    const speaker = ChatMessage.getSpeaker({ actor: this });
    new RollBundle(fullStatName)
      .addRoll(roll)
      .execute(speaker, "systems/cyberpunk/templates/chat/skill-check.hbs", {
        statIcon: statName,
        difficulty: difficulty,
        success: success
      });

    // Roll fumble on natural 1
    if (isNatural1) {
      await this.rollFumble();
    }
  }

  /**
   * Roll a sleep check (Stay Awake or Fall Asleep).
   * Uses 1d10 + INT vs INT as DV. No fumble on natural 1.
   * @param {string} mode - "stayAwake" or "fallAsleep"
   * @param {number} extraMod - Combined modifier (conditions + luck + fatigue/stress penalty)
   */
  async rollSleepCheck(mode, extraMod = 0) {
    const isStayAwake = mode === "stayAwake";
    const title = isStayAwake ? localize("StayAwake") : localize("FallAsleep");
    const chatIcon = isStayAwake ? "awake" : "sleep";
    const dv = this.system.stats.int.total;

    const parts = ["@stats.int.total"];
    const itemBonus = this.system[isStayAwake ? "stayAwakeBonus" : "fallAsleepBonus"] || 0;
    if (itemBonus) parts.push(itemBonus);
    if (extraMod) parts.push(extraMod);

    const roll = buildD10Roll(parts, this.system);
    await roll.evaluate();

    const success = roll.total >= dv;

    // Update sleep based on result
    const currentSleep = this.system.sleep || 0;
    if (isStayAwake) {
      // Success = stayed awake (+1), failure = fell asleep (-1)
      const newSleep = success ? currentSleep + 1 : Math.max(0, currentSleep - 1);
      await this.update({ "system.sleep": newSleep });
    } else {
      // Success = fell asleep (-1), failure = couldn't sleep (+1)
      const newSleep = success ? Math.max(0, currentSleep - 1) : currentSleep + 1;
      await this.update({ "system.sleep": newSleep });
    }

    // Create chat message
    const speaker = ChatMessage.getSpeaker({ actor: this });
    new RollBundle(title)
      .addRoll(roll)
      .execute(speaker, "systems/cyberpunk/templates/chat/skill-check.hbs", {
        statIcon: chatIcon,
        difficulty: dv,
        success: success
      });

    // A day has passed — open the healing dialog (only if wounded)
    if (this.system.damage > 0) {
      new HealDialog(this).render(true);
    }
  }

  /**
   * Roll a COOL-based fright check against a difficulty target.
   * On failure, (difficulty − result) is added as fright points.
   * @param {number} difficulty - Target number
   * @param {number} extraMod - Additional modifier (familiarity + luck)
   */
  async rollFrightCheck(difficulty, extraMod = 0) {
    const actionSurgePenalty = this.statuses.has("action-surge") ? -3 : 0;
    const fastDrawPenalty = this.statuses.has("fast-draw") ? -3 : 0;
    const restrainedPenalty = this.statuses.has("restrained") ? -2 : 0;
    const grapplingPenalty = this.statuses.has("grappling") ? -2 : 0;
    const fatiguePenalty = this.getFatiguePenalty();
    const stressPenalty = this.getStressPenalty(true); // COOL-based roll

    const parts = ["@stats.cool.total"];
    if (actionSurgePenalty) parts.push(actionSurgePenalty);
    if (fastDrawPenalty) parts.push(fastDrawPenalty);
    if (restrainedPenalty) parts.push(restrainedPenalty);
    if (grapplingPenalty) parts.push(grapplingPenalty);
    if (fatiguePenalty) parts.push(fatiguePenalty);
    if (stressPenalty) parts.push(stressPenalty);
    if (extraMod) parts.push(extraMod);

    const roll = buildD10Roll(parts, this.system);
    await roll.evaluate();

    const d10Result = roll.dice[0]?.results[0]?.result;
    const isNatural1 = d10Result === 1;
    const success = !isNatural1 && roll.total >= difficulty;

    const speaker = ChatMessage.getSpeaker({ actor: this });
    new RollBundle(localize("FrightRoll"))
      .addRoll(roll)
      .execute(speaker, "systems/cyberpunk/templates/chat/skill-check.hbs", {
        statIcon: "stress",
        difficulty: difficulty,
        success: success
      });

    // On failure, add fright points equal to the difference
    if (!success) {
      const frightPoints = difficulty - roll.total;
      const currentFright = this.system.fright || 0;
      await this.update({ "system.fright": currentFright + frightPoints });
    }

    // Roll fumble on natural 1
    if (isNatural1) {
      await this.rollFumble();
    }
  }

  /*
   * Adds this actor to the current encounter - if there isn't one, this just shows an error - and rolls their initiative
   */
  async enterCombatWithInitiative(modifier, options = {createCombatants: true}) {
    if(!game.combat) {
      ui.notifications.error(localize("NoCombatError"));
      return;
    }
  
    const combat = game.combat;
    let combatant = combat.combatants.find(c => c.actorId === this.id);
  
    // If no combatant found and creation is allowed, add the actor to the combat
    if (!combatant && options.createCombatants) {
      await combat.createEmbeddedDocuments("Combatant", [{ actorId: this.id }]);
      combatant = combat.combatants.find(c => c.actorId === this.id);
    }    
  
    if (!combatant) {
      ui.notifications.error(localize("NoCombatantForActor"));
      return;
    }
  
    // Roll initiative for the combatant
    return combat.rollInitiative([combatant.id]);
  }  

  /**
   * Roll a Stun Save (Shock Save)
   * Must roll UNDER the threshold to succeed
   * On failure, applies the Shocked condition
   * On success, removes the Shocked condition if present
   * @param {number} modifier - Optional modifier to the roll
   */
  async rollStunSave(modifier = 0) {
    // Drones use a flat threshold of 10 − stun strength; no BODY math.
    // Fail → Disabled for 1 round. Modifier is passed as a negative (-2 / -4),
    // so stun strength = -modifier.
    if (this.type === "drone") {
      return this._rollDroneStunSave(-modifier);
    }
    const threshold = this.getStunThreshold();
    const roll = await new Roll(modifier ? `1d10 + ${-modifier}` : "1d10").evaluate();
    const success = roll.total < threshold;

    const speaker = ChatMessage.getSpeaker({ actor: this });

    new RollBundle(localize("ShockSave"))
      .addRoll(roll, { name: localize("Save") })
      .execute(speaker, "systems/cyberpunk/templates/chat/save-roll.hbs", {
        saveType: "shock",
        saveLabel: localize("ShockSave"),
        threshold: threshold,
        success: success,
        hint: localize("UnderThresholdMessage")
      });

    // Apply or remove Shocked condition based on result
    if (success) {
      // Remove Shocked condition on success
      if (this.statuses.has("shocked")) {
        await this.toggleStatusEffect("shocked", { active: false });
      }
    } else {
      // Apply Shocked condition on failure
      await this.toggleStatusEffect("shocked", { active: true });
    }
    return success;
  }

  /**
   * Stun save for drones. Roll 1d10 against a flat threshold of (10 − stunStrength).
   * Fail → Disabled status for 1 round (auto-clears at start of next turn).
   * @param {number} stunStrength - Stun severity (2 or 4).
   * @private
   */
  async _rollDroneStunSave(stunStrength) {
    const threshold = 10 - stunStrength;
    const roll = await new Roll("1d10").evaluate();
    const success = roll.total < threshold;

    const speaker = ChatMessage.getSpeaker({ actor: this });
    new RollBundle(localize("ShockSave"))
      .addRoll(roll, { name: localize("Save") })
      .execute(speaker, "systems/cyberpunk/templates/chat/save-roll.hbs", {
        saveType: "shock",
        saveLabel: localize("ShockSave"),
        threshold,
        success,
        hint: localize("UnderThresholdMessage")
      });

    if (!success) {
      await this.toggleStatusEffect("disabled", { active: true });
      await this.setFlag("cyberpunk", "disabledDuration", 1);
    }
    return success;
  }

  /**
   * Roll a Poison Save
   * Must roll UNDER the threshold to succeed
   * On failure, applies the Poisoned condition (-4 REF)
   * @param {number} modifier - Optional modifier to the roll
   */
  async rollPoisonSave(modifier = 0) {
    const threshold = this.getStunThreshold(); // Same threshold as Stun (BT-based)
    const roll = await new Roll(modifier ? `1d10 + ${modifier}` : "1d10").evaluate();
    const success = roll.total < threshold;

    const speaker = ChatMessage.getSpeaker({ actor: this });

    new RollBundle(localize("PoisonSave"))
      .addRoll(roll, { name: localize("Save") })
      .execute(speaker, "systems/cyberpunk/templates/chat/save-roll.hbs", {
        saveType: "poison",
        saveLabel: localize("PoisonSave"),
        threshold: threshold,
        success: success,
        hint: localize("UnderThresholdMessage")
      });

    // Apply or remove Poisoned condition based on result
    if (success) {
      // Remove Poisoned condition on success
      if (this.statuses.has("poisoned")) {
        await this.toggleStatusEffect("poisoned", { active: false });
      }
    } else {
      // Apply Poisoned condition on failure
      await this.toggleStatusEffect("poisoned", { active: true });
    }
    return success;
  }

  /**
   * Roll a Death Save
   * Must roll UNDER the threshold to succeed
   * On failure, applies the Dead condition
   * @param {number} modifier - Optional modifier to the roll
   */
  async rollDeathSave(modifier = 0) {
    const threshold = this.getDeathThreshold();
    const roll = await new Roll(modifier ? `1d10 + ${modifier}` : "1d10").evaluate();
    const success = roll.total < threshold;

    const speaker = ChatMessage.getSpeaker({ actor: this });

    new RollBundle(localize("DeathSave"))
      .addRoll(roll, { name: localize("Save") })
      .execute(speaker, "systems/cyberpunk/templates/chat/save-roll.hbs", {
        saveType: "death",
        saveLabel: localize("DeathSave"),
        threshold: threshold,
        success: success,
        hint: localize("UnderThresholdMessage")
      });

    // Apply Dead condition on failure
    if (!success) {
      await this.toggleStatusEffect("dead", { active: true });
    }
    return success;
  }

  /**
   * Roll a fumble (1d10) and display the result with narrative hint.
   * Called when a natural 1 is rolled on a skill or stat check.
   * @param {string} reliability - Optional weapon reliability: "very", "standard", or "unreliable"
   */
  async rollFumble(reliability = null) {
    const roll = await new Roll("1d10").evaluate();
    const result = roll.total;

    // Severity levels: 0=stumble, 1=loss, 2=mark, 3=turningPoint
    // Determine severity based on result and weapon reliability
    // Standard: 1-4 Stumble, 5-7 Loss, 8-9 Mark, 10 Turning Point
    // Very Reliable: 1-7 Stumble, 8-9 Loss, 10 Mark (reduced severity)
    // Unreliable: 1-4 Loss, 5-7 Mark, 8-10 Turning Point (increased severity)
    let severity;

    if (reliability === "very") {
      // Very Reliable: reduced severity (no Turning Point possible)
      if (result <= 7) {
        severity = 0; // Stumble
      } else if (result <= 9) {
        severity = 1; // Loss
      } else {
        severity = 2; // Mark
      }
    } else if (reliability === "unreliable") {
      // Unreliable: increased severity (no Stumble possible)
      if (result <= 4) {
        severity = 1; // Loss
      } else if (result <= 7) {
        severity = 2; // Mark
      } else {
        severity = 3; // Turning Point
      }
    } else {
      // Standard/default fumble table
      if (result <= 4) {
        severity = 0; // Stumble
      } else if (result <= 7) {
        severity = 1; // Loss
      } else if (result <= 9) {
        severity = 2; // Mark
      } else {
        severity = 3; // Turning Point
      }
    }

    // Map severity to hint localization key
    const severityHints = [
      localize("FumbleHint1to4"),  // 0: Stumble
      localize("FumbleHint5to7"),  // 1: Loss
      localize("FumbleHint8to9"),  // 2: Mark
      localize("FumbleHint10")     // 3: Turning Point
    ];
    const fumbleHint = severityHints[severity];

    // Get effective luck for the Roll Luck button
    const effectiveLuck = this.system.stats.luck?.effective ?? this.system.stats.luck?.total ?? 0;

    const speaker = ChatMessage.getSpeaker({ actor: this });
    new RollBundle(localize("Fumble"))
      .addRoll(roll, { name: "1d10" })
      .execute(speaker, "systems/cyberpunk/templates/chat/fumble.hbs", {
        fumbleHint: fumbleHint,
        actorId: this.id,
        severity: severity,
        effectiveLuck: effectiveLuck,
        canRollLuck: effectiveLuck > 0 && severity > 0  // Can't reduce below stumble
      });
  }

  /**
   * Roll Initiative and display in chat
   * Uses REF stat + 1d10
   */
  async performInitiativeRoll() {
    const ref = this.system.stats.ref.total;
    const roll = await new Roll(`1d10 + ${ref}`).evaluate();

    const speaker = ChatMessage.getSpeaker({ actor: this });

    new RollBundle(localize("InitiativeRoll"))
      .addRoll(roll, { name: "1d10" })
      .execute(speaker, "systems/cyberpunk/templates/chat/initiative.hbs", {
        refValue: ref
      });

    return roll.total;
  }
}
