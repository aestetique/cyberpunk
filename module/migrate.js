import { sortSkills, SortModes } from "./actor/skill-sort.js";
import { localize, safeLocalize } from "./utils.js";
import {
    CALIBER_DAMAGE,
    getDamageForCaliber,
    getValidAmmoTypesForCaliber
} from "./calibers.js";

const updateFuncs = {
    "Actor": migrateActor,
    "Item": migrateItem
}

let migrationSuccess = true;

export async function migrateWorld(targetVersion) {
    if (!game.user.isGM) {
        ui.notifications.error(localize("MigrateError"));
        return;
    }
    // Reset success state for this run — module-level var would otherwise stay false
    // after a prior failure and prevent the version stamp on a subsequent good run.
    migrationSuccess = true;

    // Convert deprecated "program" items to "netware"
    await _migrateProgramsToNetware();

    // Convert old weapon/ammo/ordnance schema to unified "weapon" type with weaponType discriminator
    await _migrateWeaponSchema();

    // Clean stale ammo/ordnance items from Scene token ActorDeltas. Without this, any
    // item update on a base actor whose scene token has an orphan-typed delta item
    // cascades through _updateDependentTokens → applyDelta and throws validation errors.
    await _migrateSceneTokenDeltas();

    // Normalize Ranged + Ammo damage to the caliber table; rewrite stale calibers (e.g. 30_30_C → 30_06_C)
    await _normalizeCaliberAndDamage();

    // Remap legacy Ranged weaponClass (SMG/Rifle/Heavy) onto the new fine-grained
    // values, and stamp a sensible attackSkill on any weapon that lacks one.
    await _normalizeWeaponSkillAndClass();

    // Rename the "Sub Machinegun" skill (item names + weapon.attackSkill refs)
    // to the canonical "Submachine Gun" spelling adopted in 2.0.7.
    await _renameSubmachineGunSkill();

    // 2.1.1: Unified bonus op pipeline. Stamp op:"+" on legacy bonus rows
    // and rewrite property paths "stats.X.tempMod" → "stats.X".
    await _normalizeBonusOps();

    // 2.1.1: Convert legacy isChipped skill flags into Skillchip cyberware items
    // carrying an op:"=" override bonus. Clears the deprecated fields.
    await _convertLegacyChippedSkills();

    // 2.2.0: Equipped drugs are no longer item-based; convert each one to an
    // ActiveEffect on the owning actor so existing characters don't lose their
    // currently-applied effects on first load after the upgrade.
    await _migrateEquippedDrugsToEffects();

    // 2.3.0: Cyberware type/subtype refactor. Sensor splits into optics/voice/
    // audio types; cyberlimb subtypes collapse to arm/leg + placement; isOption
    // is no longer read.
    await _migrateCyberwareTypeSubtype();

    for (const actor of game.actors.contents) {
        await processDocument(actor);
        for (const item of actor.items) await processDocument(item);
    }
    for (const item of game.items.contents) {
        await processDocument(item);
    }
    // Stamp at least the target version so the same migration doesn't keep firing
    // every reload even if the package version hasn't been bumped yet.
    const stamp = targetVersion && foundry.utils.isNewerVersion(targetVersion, game.system.version)
        ? targetVersion
        : game.system.version;
    if(migrationSuccess) {
        game.settings.set("cyberpunk", "systemMigrationVersion", stamp);
        ui.notifications.info(localize("MigrationComplete", { version: stamp }), { permanent: true });
    }
    else {
        ui.notifications.error(localize("MigrationFailed"));
    }
}

const defaultDataUse = async (document, updateData) => {
    if (!foundry.utils.isEmpty(updateData)) {
        await document.update(updateData);
    }
}
async function processDocument(document, applyUpdate = defaultDataUse) {
    try {
        const migrateDataFunc = updateFuncs[document.documentName];
        if (migrateDataFunc === undefined) {
            console.warn(`No migrate function for document with documentName field "${document.documentName}"`);
            return;
        }
        const updateData = await migrateDataFunc(document);
        await applyUpdate(document, updateData);
    } catch(err) {
        migrationSuccess = false;
        err.message = `Failed cyberpunk system migration for ${document.type} ${document.name}: ${err.message}`;
        console.error(err);
        return;
    }
}

/**
 * Migrate a single Actor document to the current data model.
 * @param {Actor} actor
 * @returns {Object} updateData to apply
 */
export async function migrateActor(actor) {
    let actorUpdates = {}

    if(typeof(actor.system.damage) == "string") {
        actorUpdates[`system.damage`] = 0;
    }
    if (actor.type === "character") {
    const tokenData = actor.prototypeToken;
    if (!tokenData.actorLink) {
        actorUpdates["prototypeToken.actorLink"] = true;
        actorUpdates["prototypeToken.disposition"] = 1;
    }
    if (!tokenData.sight?.enabled) {
        actorUpdates["prototypeToken.sight.enabled"] = true;
        actorUpdates["prototypeToken.sight.dim"] = 30;
    }
    }

    // Trained skills that we keep
    let trainedSkills = [];
    if(actor.system.skills) {
        actorUpdates["system.skills"] = undefined;

        let trained = (skillData) => skillData.value > 0 || skillData.chipValue > 0;
        // Catalogue skills with points in them to keep
        trainedSkills = Object.entries(actor.system.skills)
            .reduce((acc, [name, skill]) => {
                if(trained(skill)) {
                    acc.push([name, skill]);
                }
                // Grouped skills and the pain that comes with them
                else if(skill.group) {
                    let parentName = name;
                    acc.push(...Object.entries(skill)
                        .filter(([name, subskill]) => name !== "group" && trained(subskill))
                        .map(([name, subskill]) => {
                            // Flatten grouped skills into individual skill items
                            let prefix = parentName === "MartialArts" ? "Martial Arts" : parentName;
                            // We'll be having a different name than before, so localize here
                            return [`${prefix}: ${localize("Skill"+name)}`, subskill]
                        }));
                }
                return acc;
            }, []);

        trainedSkills = trainedSkills.map(([name, skillData]) => legacySkillToItem(name, skillData))
    }
    let skills = actor.items.filter(item => item.type === "skill");

    // Migrate from pre-item times
    if(skills.length === 0) {
        // Key core skills by name so they may be overridden
        let skillsToAdd = [].reduce((acc, item) => {
            acc[item.name] = item.toObject();
            return acc;
        }, {});
        // Override core skills with any trained skill by the same name
        for(const trainedSkill of trainedSkills) {
            // Translate legacy localization keys to display names
            let localizedName = safeLocalize("Skill"+trainedSkill.name, trainedSkill.name);
            skillsToAdd[localizedName] = trainedSkill;
        }
        skillsToAdd = sortSkills(Object.values(skillsToAdd), SortModes.Name);
        actorUpdates["system.skillsSortedBy"] = "Name";

        const currentItems = Array.from(actor.items).map(item => item.toObject());
        actorUpdates.items = currentItems.concat(skillsToAdd);
    }

    return actorUpdates;
}

export function migrateItem(item) {
  const itemUpdates = {};
  const system = item.system ?? {};

  if (item.type !== "skill" && system.source === undefined) {
    itemUpdates["system.source"] = "";
  }

  // Rename martial.block → martial.parry
  if (item.type === "skill" && system.martial && ("block" in system.martial)) {
    itemUpdates["system.martial.parry"] = system.martial.block;
    itemUpdates["system.martial.-=block"] = null;
  }

  // Skills shipped in the 2.1.0 compendium had stat="body" for Endurance,
  // Swimming, Controlled Hyperventilation and Strength Feat. The actor schema
  // uses "bt", so @stats.body.total resolved to nothing (no BODY bonus on the
  // roll) and the chat icon img/chat/body.svg 404'd. Repoint to "bt".
  if (item.type === "skill" && system.stat === "body") {
    itemUpdates["system.stat"] = "bt";
  }

  // Armor gained the cyberware-style effect/embedded-weapon fields.
  // Backfill them on pre-existing armor items so the new sheet renders and
  // actor.js#_computeDerivedStats can iterate option attachments safely.
  // (Option armors are identified via system.armorType === "option" — no
  // slot/space accounting is done, so hasSlots/takesSpace are not on the
  // armor schema.)
  if (item.type === "armor") {
    if (system.isWeapon === undefined)   itemUpdates["system.isWeapon"]   = false;
    if (!Array.isArray(system.bonuses))  itemUpdates["system.bonuses"]    = [];
    if (!system.shield || typeof system.shield !== "object") {
      itemUpdates["system.shield"] = { stoppingPower: 0, ablation: 0 };
    }
    if (!system.weapon) {
      itemUpdates["system.weapon"] = {
        weaponType: "Martial", weaponClass: "Melee", attackSkill: "Brawling",
        attackType: "", damage: "1d6", damageType: "blunt",
        range: 1, accuracy: 0,
        concealability: "hidden", reliability: "standard",
        minimumBody: 0, shotsLeft: 0, shots: 0, rof: 1,
        attachedAmmoId: "", charges: 0, chargesMax: 0,
        effect: "", templateType: "", radius: 0,
        caliber: "medium", ammoType: "standard"
      };
    }
  }

  return itemUpdates;
}

// Take an old hardcoded skill and translate it into data for a skill item.
// Note: pre-2.0 chip state (skillData.chipped / chipValue) is not carried over —
// chipping is now a cyberware item, and there's no actor-side hook here to
// also spawn the Skillchip. Graceful degradation: the skill becomes a regular
// level-N skill. Affects pre-item-era characters only.
export function legacySkillToItem(name, skillData) {
    return {name: safeLocalize("Skill"+name, name), type: "skill", data: {
        flavor: "",
        notes: "",
        level: skillData.value || 0,
        ip: skillData.ip,
        diffMod: 1,
        isRoleSkill: skillData.isSpecial || false,
        stat: skillData.stat
    }};
}

/**
 * Convert deprecated "program" items to "netware".
 * Type field is immutable, so we delete and recreate.
 */
async function _migrateProgramsToNetware() {
    const netwareDefaults = {
        netwareType: "program",
        slots: 1,
        takesSpace: 1,
        programSubtype: "booster",
        rez: 1,
        atk: 1,
        boosterBonus: "scanner",
        boosterValue: 2,
        defenderDefence: "armor",
        defenderValue: 4,
        attackerClass: "antiProgram",
        attackerDamage: "2d6",
        attackerEffect: "none"
    };

    function buildNetwareData(oldItem) {
        const d = oldItem.toObject();
        d.type = "netware";
        const oldSys = d.system || {};
        d.system = Object.assign({}, netwareDefaults, {
            cost: oldSys.cost ?? 0,
            weight: oldSys.weight ?? 0,
            flavor: oldSys.flavor ?? "",
            source: oldSys.source ?? "",
            availability: oldSys.availability ?? "common"
        });
        return d;
    }

    // World-level items
    const worldPrograms = game.items.filter(i => i.type === "program");
    for (const item of worldPrograms) {
        try {
            const data = buildNetwareData(item);
            await item.delete();
            await Item.create(data);
            console.log(`CYBERPUNK | Migrated world program "${data.name}" to netware`);
        } catch (err) {
            console.error(`CYBERPUNK | Failed to migrate world program "${item.name}":`, err);
            migrationSuccess = false;
        }
    }

    // Actor embedded items
    for (const actor of game.actors) {
        const programs = actor.items.filter(i => i.type === "program");
        if (!programs.length) continue;
        try {
            const ids = programs.map(i => i.id);
            const newData = programs.map(i => buildNetwareData(i));
            await actor.deleteEmbeddedDocuments("Item", ids);
            await actor.createEmbeddedDocuments("Item", newData);
            console.log(`CYBERPUNK | Migrated ${ids.length} program(s) to netware on actor "${actor.name}"`);
        } catch (err) {
            console.error(`CYBERPUNK | Failed to migrate programs on actor "${actor.name}":`, err);
            migrationSuccess = false;
        }
    }
}

// ============================================================================
// Weapon schema migration: unify weapon / ammo / ordnance into one "weapon" type
// with a 5-value weaponType discriminator + weaponClass subfield.
// ============================================================================

const LEGACY_WEAPON_TYPE_TO_NEW = {
    "Pistol": { weaponType: "Ranged",  weaponClass: "Pistol" },
    "SMG":    { weaponType: "Ranged",  weaponClass: "SMG" },
    "Shotgun":{ weaponType: "Ranged",  weaponClass: "Shotgun" },
    "Rifle":  { weaponType: "Ranged",  weaponClass: "Rifle" },
    "Heavy":  { weaponType: "Ranged",  weaponClass: "Heavy" },
    "Bow":    { weaponType: "Martial", weaponClass: "Bow" },
    "Crossbow":{weaponType: "Martial", weaponClass: "Crossbow" },
    "Melee":  { weaponType: "Martial", weaponClass: "Melee" },
    "Exotic": { weaponType: "Exotic",  weaponClass: "Exotic" }
};

const LEGACY_AMMO_WT_TO_CLASS = {
    pistol:   "Pistol",
    rifle:    "Rifle",
    shotgun:  "Shotgun",
    heavy:    "Heavy",
    bow:      "Bow",
    crossbow: "Crossbow"
};

// Best-effort mapping from the old generic-caliber set to the new slug enum.
// Lossy — user adjusts after migration. `null` means "leave the field empty".
const LEGACY_CALIBER_TO_NEW = {
    light:        "9mm",
    medium:       "10mm",
    heavy:        "12mm",
    veryHeavy:    "13mm",
    assault:      "5_56",
    sniper:       "7_62",
    antiMateriel: "20mm_FF",
    autocannon:   "30mm",
    arrow:        null,
    bolt:         null
};
function mapLegacyCaliber(slug) {
    if (!slug) return "9mm";
    return Object.prototype.hasOwnProperty.call(LEGACY_CALIBER_TO_NEW, slug)
        ? (LEGACY_CALIBER_TO_NEW[slug] ?? "9mm")
        : slug;
}

/** Pick an Ordnance weaponClass from old ordnance attackType / shape hints. */
function inferOrdnanceClass(sys) {
    const at = sys.attackType || "";
    if (at === "RPG" || at === "rpg") return "RPG";
    if (at === "Missile" || at === "missile") return "Missile";
    if (at === "Landmine" || at === "landmine" || at === "Claymore" || at === "claymore") return "Mine";
    if (at === "Explocharge" || at === "explosiveCharge") return "Charge";
    return "Grenade";
}

/** Build update data for an existing weapon-type Item (legacy → new discriminator). */
function _buildWeaponItemUpdate(item) {
    const sys = item.system || {};
    const t = sys.weaponType;
    const map = LEGACY_WEAPON_TYPE_TO_NEW[t];
    if (!map) return null; // already migrated or unrecognised
    const u = {};
    u["system.weaponType"]  = map.weaponType;
    u["system.weaponClass"] = map.weaponClass;
    // Drop dead fields
    u["system.-=loadedAmmoType"]    = null;
    u["system.-=loadedAmmoSources"] = null;
    u["system.-=ap"]                = null;
    u["system.-=rangeDamages"]      = null;
    u["system.attachedAmmoId"]      = sys.attachedAmmoId || "";
    // Legacy caliber → new slug (lossy)
    if (sys.caliber != null) {
        u["system.caliber"] = mapLegacyCaliber(sys.caliber);
    }
    // For Martial: drop shots/shotsLeft/rof (not used)
    if (map.weaponType === "Martial") {
        u["system.shotsLeft"] = 0;
        u["system.shots"]     = 0;
        u["system.rof"]       = 1;
    }
    return u;
}

/**
 * Resolve a "raw item source" from either a live Item instance OR a plain
 * source object (e.g. an entry from actor._source.items). Used so that
 * invalid documents (type=ammo/ordnance after we removed those types) can
 * still be migrated even though Foundry refuses to instantiate them.
 */
function _rawSource(input) {
    if (!input || typeof input !== "object") return {};
    if (input._source) return input._source;
    if (typeof input.toObject === "function") {
        try { return input.toObject(); } catch (e) { /* fall through */ }
    }
    // Plain source object — has system, name, type, etc.
    if (input.system !== undefined || input.type !== undefined) return input;
    return {};
}

/** Convert an old ammo item to a new weapon (type=weapon, weaponType=Ammo). */
function _buildAmmoMigrationData(item) {
    const old = _rawSource(item);
    const oldSys = old.system || {};
    const data = {
        name: old.name || item.name || "Ammo",
        type: "weapon",
        img: old.img || item.img || undefined,
        flags: old.flags || {},
        system: {
            // common
            flavor: oldSys.flavor ?? "",
            notes: oldSys.notes ?? "",
            cost: oldSys.cost ?? 0,
            weight: oldSys.weight ?? 0,
            availability: oldSys.availability ?? "common",
            equipped: oldSys.equipped ?? false,
            source: oldSys.source ?? "",
            // discriminator
            weaponType: "Ammo",
            weaponClass: LEGACY_AMMO_WT_TO_CLASS[oldSys.weaponType] || "Pistol",
            // ammo-specific
            caliber: mapLegacyCaliber(oldSys.caliber),
            ammoType: oldSys.ammoType ?? "standard",
            packSize: oldSys.packSize ?? 20,
            quantity: oldSys.quantity ?? 0,
            sourceUuid: oldSys.sourceUuid ?? "",
            // Damage / effect / template — empty defaults; user sets per pile
            damage: "",
            effect: "",
            templateType: "",
            radius: 0,
            // unused-but-present universal fields
            attackSkill: "",
            attackType: "",
            damageType: "blunt",
            range: 0,
            accuracy: 0,
            concealability: "pocket",
            reliability: "standard",
            minimumBody: 0,
            shotsLeft: 0,
            shots: 0,
            rof: 1,
            attachedAmmoId: "",
            charges: 0,
            chargesMax: 0
        }
    };
    return data;
}

/** Convert an old ordnance item to a new weapon (type=weapon, weaponType=Ordnance or Exotic). */
function _buildOrdnanceMigrationData(item) {
    const old = _rawSource(item);
    const oldSys = old.system || {};
    const chargesMax = Number(oldSys.chargesMax) || 0;
    const removeOnZero = !!oldSys.removeOnZero;
    // Multi-charge rechargeable → Exotic; otherwise 1-shot Ordnance
    const isExotic = (chargesMax > 1) && !removeOnZero;
    const data = {
        name: old.name || item.name || "Ordnance",
        type: "weapon",
        img: old.img || item.img || undefined,
        flags: old.flags || {},
        system: {
            flavor: oldSys.flavor ?? "",
            notes: oldSys.notes ?? "",
            cost: oldSys.cost ?? 0,
            weight: oldSys.weight ?? 0,
            availability: oldSys.availability ?? "common",
            equipped: oldSys.equipped ?? false,
            source: oldSys.source ?? "",
            weaponType: isExotic ? "Exotic" : "Ordnance",
            weaponClass: isExotic ? "Exotic" : inferOrdnanceClass(oldSys),
            attackSkill: oldSys.attackSkill ?? "",
            attackType: oldSys.attackType ?? "",
            damage: oldSys.damage ?? "0",
            damageType: "blunt",
            range: oldSys.range ?? 0,
            accuracy: oldSys.accuracy ?? 0,
            concealability: oldSys.concealability ?? "pocket",
            reliability: oldSys.reliability ?? "standard",
            minimumBody: 0,
            shotsLeft: 0,
            shots: 0,
            rof: 1,
            attachedAmmoId: "",
            charges: isExotic ? (Number(oldSys.charges) || chargesMax) : 0,
            chargesMax: isExotic ? chargesMax : 0,
            effect: oldSys.effect ?? "",
            templateType: oldSys.templateType ?? "circle",
            radius: oldSys.radius ?? 0,
            caliber: "medium",
            ammoType: "standard",
            packSize: 1,
            quantity: 1,
            sourceUuid: ""
        }
    };
    return data;
}

async function _migrateWeaponSchema() {
    const scopeName = (p) => p === "world" ? "world" : `actor "${p.name}"`;

    // -----------------------------------------------------------------------
    // 1) Existing weapon-type items: update discriminator in place.
    // -----------------------------------------------------------------------
    async function _migrateWeaponItems(parent, items) {
        const candidates = items.filter(i => i.type === "weapon");
        if (!candidates.length) return;
        let migrated = 0;
        for (const item of candidates) {
            try {
                const u = _buildWeaponItemUpdate(item);
                if (!u) continue;
                if (parent === "world") {
                    await item.update(u);
                } else {
                    await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...u }]);
                }
                migrated++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to migrate weapon item "${item.name}" on ${scopeName(parent)}:`, err);
                migrationSuccess = false;
            }
        }
        if (migrated) console.log(`CYBERPUNK | Migrated ${migrated} weapon item(s) on ${scopeName(parent)}`);
    }

    // -----------------------------------------------------------------------
    // 2) Old ammo / ordnance items: create new (type=weapon) then delete old.
    //    Reads from RAW SOURCE (actor._source.items / item._source) so that
    //    documents Foundry refuses to instantiate (because their type was
    //    removed from template.json) are still visible to the migrator.
    // -----------------------------------------------------------------------
    async function _replaceAmmoOrdnance(parent, rawSources) {
        const oldPairs = [];
        for (const src of rawSources) {
            const t = src?.type;
            if (t === "ammo") {
                try { oldPairs.push({ src, fresh: _buildAmmoMigrationData(src), kind: "ammo" }); }
                catch (err) { console.error(`CYBERPUNK | Could not build replacement for ammo "${src?.name}":`, err); migrationSuccess = false; }
            } else if (t === "ordnance") {
                try { oldPairs.push({ src, fresh: _buildOrdnanceMigrationData(src), kind: "ordnance" }); }
                catch (err) { console.error(`CYBERPUNK | Could not build replacement for ordnance "${src?.name}":`, err); migrationSuccess = false; }
            }
        }
        if (!oldPairs.length) return;
        let replaced = 0;
        for (const { src, fresh, kind } of oldPairs) {
            try {
                if (parent === "world") {
                    await Item.create(fresh);
                    // Delete the old by ID — works even when the document is invalid.
                    const oldItem = game.items.get(src._id) || game.items.get(src._id, { invalid: true });
                    if (oldItem) await oldItem.delete();
                } else {
                    await parent.createEmbeddedDocuments("Item", [fresh]);
                    await parent.deleteEmbeddedDocuments("Item", [src._id]);
                }
                replaced++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to migrate ${kind} "${src?.name}" on ${scopeName(parent)}:`, err);
                migrationSuccess = false;
            }
        }
        if (replaced) console.log(`CYBERPUNK | Migrated ${replaced} ammo/ordnance item(s) on ${scopeName(parent)}`);
    }

    // -----------------------------------------------------------------------
    // 3) Cyberware embedded weapons: update their .system.weapon discriminator.
    // -----------------------------------------------------------------------
    async function _migrateCyberwareEmbeddedWeapons(parent, items) {
        const candidates = items.filter(i => i.type === "cyberware" && i.system?.weapon);
        if (!candidates.length) return;
        let migrated = 0;
        for (const item of candidates) {
            try {
                const w = item.system.weapon;
                const t = w.weaponType;
                const map = LEGACY_WEAPON_TYPE_TO_NEW[t];
                if (!map) continue;
                const u = {
                    "system.weapon.weaponType":  map.weaponType,
                    "system.weapon.weaponClass": map.weaponClass,
                    "system.weapon.attachedAmmoId": w.attachedAmmoId || "",
                    // Drop dead legacy fields (parity with _buildWeaponItemUpdate)
                    "system.weapon.-=loadedAmmoType": null,
                    "system.weapon.-=loadedAmmoSources": null,
                    "system.weapon.-=ap": null,
                    "system.weapon.-=rangeDamages": null
                };
                // Map legacy caliber slug → new slug (instead of deleting it).
                // Ranged cyberweapons need a caliber so attached ammo can be matched.
                if (w.caliber != null) {
                    u["system.weapon.caliber"] = mapLegacyCaliber(w.caliber);
                }
                // Martial cyberweapons (claws, blades) don't fire — reset shots/rof.
                if (map.weaponType === "Martial") {
                    u["system.weapon.shotsLeft"] = 0;
                    u["system.weapon.shots"]     = 0;
                    u["system.weapon.rof"]       = 1;
                }
                if (parent === "world") {
                    await item.update(u);
                } else {
                    await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...u }]);
                }
                migrated++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to migrate cyberweapon "${item.name}" on ${scopeName(parent)}:`, err);
                migrationSuccess = false;
            }
        }
        if (migrated) console.log(`CYBERPUNK | Migrated ${migrated} cyberweapon(s) on ${scopeName(parent)}`);
    }

    // ----- World scope -----
    const worldItems = Array.from(game.items.contents);
    // Gather raw sources for ammo/ordnance, including invalid documents that
    // didn't load. Foundry exposes them via game.items.invalidDocumentIds.
    const worldRawSources = worldItems.map(i => i._source || i.toObject?.()).filter(Boolean);
    try {
        const invalidIds = game.items.invalidDocumentIds;
        if (invalidIds && typeof invalidIds[Symbol.iterator] === "function") {
            for (const id of invalidIds) {
                if (worldRawSources.some(s => s?._id === id)) continue;
                const ghost = game.items.get(id, { invalid: true });
                const src = ghost?._source;
                if (src) worldRawSources.push(src);
            }
        }
    } catch (e) { /* method may not exist on this Foundry build */ }

    await _migrateWeaponItems("world", worldItems);
    await _replaceAmmoOrdnance("world", worldRawSources);
    await _migrateCyberwareEmbeddedWeapons("world", worldItems);

    // ----- Actor scope -----
    for (const actor of game.actors.contents) {
        const items = Array.from(actor.items);
        // RAW source items include documents Foundry refused to instantiate.
        const rawSources = actor._source?.items || actor.toObject?.()?.items || [];
        await _migrateWeaponItems(actor, items);
        await _replaceAmmoOrdnance(actor, rawSources);
        await _migrateCyberwareEmbeddedWeapons(actor, items);
    }
}

// ============================================================================
// Scene token ActorDelta cleanup.
// Unlinked tokens in scenes carry their own item overrides in the ActorDelta.
// Linked tokens can ALSO carry residual delta from a prior unlinked state —
// Foundry does not auto-clear delta on flip. Either way, the 2.0.4 weapon
// migration never reached deltas, leaving orphan "ammo" / "ordnance" items
// behind. Once template.json no longer recognises those types, Foundry refuses
// to instantiate the items — and ANY update on the base actor cascades through
// _updateDependentTokens → applyDelta → CyberpunkActor constructor → throws.
//
// Strategy: use the EmbeddedCollectionDelta invalid-document API
// (delta.items.invalidDocumentIds / getInvalid) to surgically delete the orphan
// items and recreate them with the migrated weapon shape, preserving _id so any
// attachedAmmoId references in the delta still resolve.
//
// Using per-document delete+create instead of a bulk `delta.items` array
// overwrite — the array form re-validates every entry in the collection, which
// can re-trip on any OTHER stale-typed sibling. Per-doc CRUD only touches the
// invalid IDs we know about.
// ============================================================================
async function _migrateSceneTokenDeltas() {
    for (const scene of game.scenes.contents) {
        for (const token of scene.tokens.contents) {
            try {
                const delta = token.delta;
                if (!delta?.items) continue;

                // Invalid documents — items whose `type` template.json no longer accepts.
                const invalidIds = Array.from(delta.items.invalidDocumentIds || []);
                if (!invalidIds.length) continue;

                const toDelete = [];
                const toCreate = [];
                for (const id of invalidIds) {
                    let src = null;
                    try {
                        const inv = delta.items.getInvalid(id);
                        src = inv?._source || (inv && typeof inv.toObject === "function" ? inv.toObject() : inv);
                    } catch (e) {
                        // Fallback to raw delta source if getInvalid throws.
                        src = (delta._source?.items || []).find(i => i?._id === id) || null;
                    }
                    let fresh = null;
                    if (src?.type === "ammo")     fresh = _buildAmmoMigrationData(src);
                    else if (src?.type === "ordnance") fresh = _buildOrdnanceMigrationData(src);
                    // Unknown invalid type: drop only (no replacement).
                    toDelete.push(id);
                    if (fresh) toCreate.push({ ...fresh, _id: id });
                }

                if (toDelete.length) {
                    await delta.deleteEmbeddedDocuments("Item", toDelete);
                }
                if (toCreate.length) {
                    await delta.createEmbeddedDocuments("Item", toCreate, { keepId: true });
                }
                console.log(`CYBERPUNK | Cleaned ${toDelete.length} orphan delta item(s) (recreated ${toCreate.length}) on token "${token.name}" in scene "${scene.name}"`);
            } catch (err) {
                console.error(`CYBERPUNK | Failed to migrate delta on token "${token?.name}" (scene "${scene?.name}"):`, err);
                migrationSuccess = false;
            }
        }
    }
}

// ============================================================================
// Caliber / damage normalization pass.
// - Rewrite stale caliber slugs (e.g. 30_30_C → 30_06_C).
// - Stamp Ranged weapon damage from the caliber table.
// - Stamp non-grenade Ammo damage from the caliber table.
// - Pre-fill grenade Ammo damage only when blank — preserves user overrides.
// - Coerce Ammo whose stored ammoType is no longer valid for the new caliber
//   set to the first valid type (standard if available, else first listed).
// Touches standalone weapon items AND embedded cyberware weapons.
// ============================================================================

const CALIBER_REMAPS = {
    "30_30_C": "30_06_C"   // removed from the enum, fall through to nearest cousin
};

function _remapCaliber(slug) {
    if (!slug) return slug;
    return CALIBER_REMAPS[slug] || slug;
}

/** Produce { caliber, ammoType, damage } updates for a Ranged / Ammo system. */
function _calcCaliberDamageUpdates(sys, { fieldPrefix }) {
    const updates = {};
    const wt = sys.weaponType;
    if (wt !== "Ranged" && wt !== "Ammo") return updates;

    // 1) Remap stale caliber slugs.
    const remapped = _remapCaliber(sys.caliber);
    const finalCaliber = remapped || sys.caliber;
    if (remapped && remapped !== sys.caliber) {
        updates[`${fieldPrefix}caliber`] = remapped;
    }

    const dmg = getDamageForCaliber(finalCaliber);

    if (wt === "Ranged") {
        // Ranged: always lock damage to the caliber's damage when we know one.
        if (dmg && sys.damage !== dmg) {
            updates[`${fieldPrefix}damage`] = dmg;
        }
        return updates;
    }

    // wt === "Ammo"
    // 2) Validate ammoType against the (possibly new) caliber's allow-list.
    const valid = new Set(getValidAmmoTypesForCaliber(finalCaliber));
    let ammoType = sys.ammoType;
    if (!ammoType || !valid.has(ammoType)) {
        ammoType = valid.has("standard") ? "standard" : ([...valid][0] || "armorPiercing");
        updates[`${fieldPrefix}ammoType`] = ammoType;
    }

    // 3) Damage. Non-grenade locks; grenade pre-fills only if blank.
    if (dmg) {
        if (ammoType !== "grenade") {
            if (sys.damage !== dmg) updates[`${fieldPrefix}damage`] = dmg;
        } else {
            const cur = (sys.damage ?? "").toString().trim();
            if (!cur || cur === "0") updates[`${fieldPrefix}damage`] = dmg;
        }
    }

    return updates;
}

async function _normalizeCaliberAndDamage() {
    const scopeName = (p) => p === "world" ? "world" : `actor "${p.name}"`;

    async function _processWeaponItems(parent, items) {
        const candidates = items.filter(i => i.type === "weapon");
        let touched = 0;
        let aborted = false;
        for (const item of candidates) {
            if (aborted) break;
            try {
                const u = _calcCaliberDamageUpdates(item.system || {}, { fieldPrefix: "system." });
                if (foundry.utils.isEmpty(u)) continue;
                if (parent === "world") await item.update(u);
                else await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...u }]);
                touched++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to normalize caliber/damage on "${item.name}" (${scopeName(parent)}):`, err);
                migrationSuccess = false;
                // If this is a synthetic-actor cascade error, every subsequent
                // sibling on the same actor will fail the same way. Skip the rest
                // of this scope so we don't spam N copies of the same trace.
                if (parent !== "world" && /is not a valid type/i.test(err?.message || "")) {
                    console.warn(`CYBERPUNK | Skipping remaining weapon items on ${scopeName(parent)}: stale token delta is poisoning validation; user must clean the affected token.`);
                    aborted = true;
                }
            }
        }
        if (touched) console.log(`CYBERPUNK | Normalized caliber/damage on ${touched} weapon item(s) on ${scopeName(parent)}`);
    }

    async function _processCyberweapons(parent, items) {
        const candidates = items.filter(i => i.type === "cyberware" && i.system?.weapon);
        let touched = 0;
        let aborted = false;
        for (const item of candidates) {
            if (aborted) break;
            try {
                const u = _calcCaliberDamageUpdates(item.system.weapon, { fieldPrefix: "system.weapon." });
                if (foundry.utils.isEmpty(u)) continue;
                if (parent === "world") await item.update(u);
                else await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...u }]);
                touched++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to normalize cyberweapon caliber/damage on "${item.name}" (${scopeName(parent)}):`, err);
                migrationSuccess = false;
                if (parent !== "world" && /is not a valid type/i.test(err?.message || "")) {
                    console.warn(`CYBERPUNK | Skipping remaining cyberweapons on ${scopeName(parent)}: stale token delta is poisoning validation.`);
                    aborted = true;
                }
            }
        }
        if (touched) console.log(`CYBERPUNK | Normalized caliber/damage on ${touched} cyberweapon(s) on ${scopeName(parent)}`);
    }

    // ----- World scope -----
    const worldItems = Array.from(game.items.contents);
    await _processWeaponItems("world", worldItems);
    await _processCyberweapons("world", worldItems);

    // ----- Actor scope -----
    for (const actor of game.actors.contents) {
        try {
            const items = Array.from(actor.items);
            await _processWeaponItems(actor, items);
            await _processCyberweapons(actor, items);
        } catch (err) {
            console.error(`CYBERPUNK | Skipping actor "${actor?.name}" during normalization:`, err);
            migrationSuccess = false;
        }
    }
}

// ============================================================================
// Weapon attack-skill + weaponClass normalization (2.0.6).
// Skill became the primary driver: it narrows the Ranged Subtype dropdown and
// supplies the gear-tab label for Martial / Ordnance. To keep legacy data
// working with the new sheets:
//   - Ranged: map legacy weaponClass keys (SMG/Rifle/Heavy) onto the new
//     fine-grained enum (SubMachinegun, AssaultRifle, Machinegun).
//   - Any weapon missing an attackSkill gets a sensible default from its
//     (weaponType, weaponClass) — so the new sheet renders a populated dropdown.
// Touches standalone weapons + cyberware-embedded weapons.
// ============================================================================

// Legacy Ranged class → new class slug.
const RANGED_CLASS_REMAP = {
    SMG:    "SubMachinegun",
    Rifle:  "AssaultRifle",
    Heavy:  "Machinegun"
};

// Best-effort: (weaponType, weaponClass) → canonical attack skill name.
// Used only when system.attackSkill is empty.
const DEFAULT_SKILL_BY_CLASS = {
    // Ranged — new keys
    "Ranged/Pistol":           "Handgun",
    "Ranged/SubMachinegun":    "Submachine Gun",
    "Ranged/AssaultRifle":     "Rifle",
    "Ranged/SniperRifle":      "Rifle",
    "Ranged/Shotgun":          "Rifle",
    "Ranged/AntiMateriel":     "Heavy Weapons",
    "Ranged/Autocannon":       "Heavy Weapons",
    "Ranged/GrenadeLauncher":  "Heavy Weapons",
    "Ranged/Machinegun":       "Heavy Weapons",
    "Ranged/Minigun":          "Heavy Weapons",
    // Ranged — legacy keys (in case remap hasn't run yet)
    "Ranged/SMG":              "Submachine Gun",
    "Ranged/Rifle":            "Rifle",
    "Ranged/Heavy":            "Heavy Weapons",
    // Martial
    "Martial/Unarmed":         "Brawling",
    "Martial/Melee":           "Melee",
    "Martial/Bow":             "Archery",
    "Martial/Crossbow":        "Archery",
    "Martial/Sling":           "Athletics",
    // Ordnance
    "Ordnance/Grenade":        "Athletics",
    "Ordnance/Mine":           "Demolitions",
    "Ordnance/Charge":         "Demolitions",
    "Ordnance/Missile":        "Heavy Weapons",
    "Ordnance/RPG":            "Heavy Weapons"
};

function _calcSkillClassUpdates(sys, { fieldPrefix }) {
    const updates = {};
    const wt = sys.weaponType;
    if (!wt || wt === "Ammo") return updates;

    // 1) Remap legacy Ranged weaponClass keys.
    let wc = sys.weaponClass;
    if (wt === "Ranged" && wc && RANGED_CLASS_REMAP[wc]) {
        wc = RANGED_CLASS_REMAP[wc];
        updates[`${fieldPrefix}weaponClass`] = wc;
    }

    // 2) Stamp attackSkill if missing.
    if (!sys.attackSkill) {
        const skill = DEFAULT_SKILL_BY_CLASS[`${wt}/${wc}`];
        if (skill) updates[`${fieldPrefix}attackSkill`] = skill;
    }
    return updates;
}

async function _normalizeWeaponSkillAndClass() {
    const scopeName = (p) => p === "world" ? "world" : `actor "${p.name}"`;

    async function _processWeaponItems(parent, items) {
        const candidates = items.filter(i => i.type === "weapon");
        let touched = 0;
        let aborted = false;
        for (const item of candidates) {
            if (aborted) break;
            try {
                const u = _calcSkillClassUpdates(item.system || {}, { fieldPrefix: "system." });
                if (foundry.utils.isEmpty(u)) continue;
                if (parent === "world") await item.update(u);
                else await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...u }]);
                touched++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to normalize skill/class on "${item.name}" (${scopeName(parent)}):`, err);
                migrationSuccess = false;
                if (parent !== "world" && /is not a valid type/i.test(err?.message || "")) {
                    aborted = true;
                }
            }
        }
        if (touched) console.log(`CYBERPUNK | Normalized skill/class on ${touched} weapon item(s) on ${scopeName(parent)}`);
    }

    async function _processCyberweapons(parent, items) {
        const candidates = items.filter(i => i.type === "cyberware" && i.system?.weapon);
        let touched = 0;
        let aborted = false;
        for (const item of candidates) {
            if (aborted) break;
            try {
                const u = _calcSkillClassUpdates(item.system.weapon, { fieldPrefix: "system.weapon." });
                if (foundry.utils.isEmpty(u)) continue;
                if (parent === "world") await item.update(u);
                else await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...u }]);
                touched++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to normalize skill/class on cyberweapon "${item.name}" (${scopeName(parent)}):`, err);
                migrationSuccess = false;
                if (parent !== "world" && /is not a valid type/i.test(err?.message || "")) {
                    aborted = true;
                }
            }
        }
        if (touched) console.log(`CYBERPUNK | Normalized skill/class on ${touched} cyberweapon(s) on ${scopeName(parent)}`);
    }

    // ----- World scope -----
    const worldItems = Array.from(game.items.contents);
    await _processWeaponItems("world", worldItems);
    await _processCyberweapons("world", worldItems);

    // ----- Actor scope -----
    for (const actor of game.actors.contents) {
        try {
            const items = Array.from(actor.items);
            await _processWeaponItems(actor, items);
            await _processCyberweapons(actor, items);
        } catch (err) {
            console.error(`CYBERPUNK | Skipping actor "${actor?.name}" during skill/class normalization:`, err);
            migrationSuccess = false;
        }
    }
}

// ============================================================================
// 2.0.7: rename "Sub Machinegun" → "Submachine Gun" across the data layer.
// Touches skill-type items (rename) and weapon-type items' attackSkill string,
// at world scope and on every actor (standalone + cyberware-embedded).
// ============================================================================
const SUBMACHINEGUN_OLD = "Sub Machinegun";
const SUBMACHINEGUN_NEW = "Submachine Gun";

async function _renameSubmachineGunSkill() {
    const scopeName = (p) => p === "world" ? "world" : `actor "${p.name}"`;

    async function _renameOnItems(parent, items) {
        let touched = 0;
        for (const item of items) {
            try {
                const updates = {};
                if (item.type === "skill" && item.name === SUBMACHINEGUN_OLD) {
                    updates.name = SUBMACHINEGUN_NEW;
                }
                if (item.type === "weapon" && item.system?.attackSkill === SUBMACHINEGUN_OLD) {
                    updates["system.attackSkill"] = SUBMACHINEGUN_NEW;
                }
                if (item.type === "cyberware" && item.system?.weapon?.attackSkill === SUBMACHINEGUN_OLD) {
                    updates["system.weapon.attackSkill"] = SUBMACHINEGUN_NEW;
                }
                if (foundry.utils.isEmpty(updates)) continue;
                if (parent === "world") await item.update(updates);
                else await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...updates }]);
                touched++;
            } catch (err) {
                console.error(`CYBERPUNK | Failed to rename Sub Machinegun → Submachine Gun on "${item.name}" (${scopeName(parent)}):`, err);
                migrationSuccess = false;
            }
        }
        if (touched) console.log(`CYBERPUNK | Renamed "Sub Machinegun" → "Submachine Gun" on ${touched} item(s) on ${scopeName(parent)}`);
    }

    await _renameOnItems("world", Array.from(game.items.contents));
    for (const actor of game.actors.contents) {
        try { await _renameOnItems(actor, Array.from(actor.items)); }
        catch (err) {
            console.error(`CYBERPUNK | Skipping actor "${actor?.name}" during Submachine Gun rename:`, err);
            migrationSuccess = false;
        }
    }
}

// ============================================================================
// 2.1.1: Unified bonus op pipeline.
// Stamp op:"+" on every existing bonus row (legacy rows were implicitly additive),
// and rewrite legacy stat targets "stats.X.tempMod" → "stats.X" so the resolver
// can apply the op in one place. Covers item types that carry a `bonuses[]`
// array — cyberware, armor, tool, drug (plus drug `withdrawal[]`).
// ============================================================================
const _STAT_TEMPMOD_RX = /^stats\.([^.]+)\.tempMod$/;

function _normalizeBonusList(list) {
    if (!Array.isArray(list)) return null;
    let changed = false;
    const next = list.map(b => {
        const nb = { ...b };
        if (!nb.op) { nb.op = "+"; changed = true; }
        if (nb.type === "property" && nb.property) {
            const m = _STAT_TEMPMOD_RX.exec(nb.property);
            if (m) { nb.property = `stats.${m[1]}`; changed = true; }
        }
        return nb;
    });
    return changed ? next : null;
}

async function _normalizeBonusOps() {
    const scopeName = (p) => p === "world" ? "world" : `actor "${p.name}"`;

    async function _updateOne(item, parent) {
        const sys = item.system || {};
        const updates = {};
        const newBonuses = _normalizeBonusList(sys.bonuses);
        if (newBonuses) updates["system.bonuses"] = newBonuses;
        if (item.type === "drug") {
            const newWd = _normalizeBonusList(sys.withdrawal);
            if (newWd) updates["system.withdrawal"] = newWd;
        }
        if (foundry.utils.isEmpty(updates)) return false;
        try {
            if (parent === "world") await item.update(updates);
            else await parent.updateEmbeddedDocuments("Item", [{ _id: item.id, ...updates }]);
            return true;
        } catch (err) {
            console.error(`CYBERPUNK | Failed to normalize bonus ops on "${item.name}" (${scopeName(parent)}):`, err);
            migrationSuccess = false;
            return false;
        }
    }

    let touched = 0;
    for (const item of game.items.contents) {
        if (await _updateOne(item, "world")) touched++;
    }
    for (const actor of game.actors.contents) {
        for (const item of actor.items) {
            if (await _updateOne(item, actor)) touched++;
        }
    }
    if (touched) console.log(`CYBERPUNK | Normalized bonus ops on ${touched} item(s)`);
}

// ============================================================================
// 2.1.1: Convert legacy isChipped skill flags into Skillchip cyberware items
// carrying an op:"=" override bonus. Chipping is now a cyberware mechanic —
// unequipping the chip restores the natural skill, equipping a different chip
// last-wins. Reads from actor._source so we still see the legacy fields after
// they get stripped from the schema by template.json cleanup.
// ============================================================================
async function _convertLegacyChippedSkills() {
    let convertedActors = 0;
    let convertedSkills = 0;
    for (const actor of game.actors.contents) {
        if (actor.type !== "character" && actor.type !== "drone") continue;
        const sourceItems = actor._source?.items || [];
        const candidates = sourceItems.filter(src =>
            src?.type === "skill" && src?.system?.isChipped
        );
        if (!candidates.length) continue;

        const chipItemsToCreate = [];
        const skillUpdates = [];
        for (const src of candidates) {
            const skillName = src.name;
            const chipValue = Number(src.system.chipLevel) || 0;
            const skillStat = src.system.stat || "ref";
            // Embedded skill UUID — used to match the bonus to the skill at roll time.
            const skillUuid = `Actor.${actor.id}.Item.${src._id}`;

            // Always scrub legacy fields, whether or not there's a chip value to migrate.
            skillUpdates.push({
                _id: src._id,
                "system.-=isChipped": null,
                "system.-=chipLevel": null,
                "system.-=chipName": null
            });

            if (chipValue > 0) {
                const chipName = (src.system.chipName && src.system.chipName.trim()) || skillName;
                chipItemsToCreate.push({
                    name: `Skillchip: ${chipName}`,
                    type: "cyberware",
                    system: {
                        cyberwareType: "chipware",
                        equipped: true,
                        chippedSkill: { uuid: skillUuid, name: skillName },
                        chipValue: chipValue,
                        bonuses: [{
                            type: "skill",
                            skillUuid: skillUuid,
                            skillName: skillName,
                            skillStat: skillStat,
                            op: "=",
                            value: chipValue
                        }]
                    }
                });
                convertedSkills++;
            }
        }

        try {
            if (chipItemsToCreate.length) {
                await actor.createEmbeddedDocuments("Item", chipItemsToCreate);
            }
            if (skillUpdates.length) {
                await actor.updateEmbeddedDocuments("Item", skillUpdates);
            }
            if (chipItemsToCreate.length) convertedActors++;
        } catch (err) {
            console.error(`CYBERPUNK | Failed to convert chipped skills on actor "${actor.name}":`, err);
            migrationSuccess = false;
        }
    }
    if (convertedSkills) {
        console.log(`CYBERPUNK | Converted ${convertedSkills} chipped skill(s) to Skillchip cyberware on ${convertedActors} actor(s)`);
    }
}

// 2.2.0: Drug items no longer carry their applied state on `system.equipped`
// — instead, applied doses live as ActiveEffects on the owning actor (this
// is what enables token icons, native duration, and the State-tab "Active
// Drugs" section). Migrate each equipped drug into one ActiveEffect mirroring
// its current phase, and clear the legacy flag on the source item. Best-effort:
// duration is not recoverable (the old model had no timer), so migrated
// effects come up with no duration — the GM tracks them by hand until they
// click Wear Off, same as before.
async function _migrateEquippedDrugsToEffects() {
    const { buildDrugEffectData } = await import("./drug-effects.js");
    let converted = 0;
    let affectedActors = 0;
    for (const actor of game.actors.contents) {
        const equippedDrugs = actor.items.contents.filter(i =>
            i.type === "drug" && i.system?.equipped === true
        );
        if (equippedDrugs.length === 0) continue;
        try {
            const newEffects = [];
            for (const drug of equippedDrugs) {
                const data = buildDrugEffectData(drug);
                // Drop the duration — the legacy item had no timer, so we
                // can't reconstruct one. GM clicks Wear Off when ready.
                data.duration = {};
                // Preserve whatever phase the supply was in at migration time.
                const phase = drug.system?.phase === "withdrawal" ? "withdrawal" : "active";
                if (phase === "withdrawal") {
                    data.changes = (await import("./drug-effects.js"))
                        .bonusesToChanges(drug.system.withdrawal || []);
                    data.statuses = ["drug-withdrawal"];
                    data.flags.cyberpunk.phase = "withdrawal";
                }
                newEffects.push(data);
            }
            await actor.createEmbeddedDocuments("ActiveEffect", newEffects);
            await actor.updateEmbeddedDocuments("Item", equippedDrugs.map(d => ({
                _id: d.id,
                "system.equipped": false,
                "system.phase": "active"
            })));
            converted += equippedDrugs.length;
            affectedActors++;
        } catch (err) {
            console.error(`CYBERPUNK | Failed to migrate equipped drugs on actor "${actor.name}":`, err);
            migrationSuccess = false;
        }
    }
    if (converted) {
        console.log(`CYBERPUNK | Migrated ${converted} equipped drug(s) to ActiveEffects across ${affectedActors} actor(s)`);
    }
}

// ============================================================================
// 2.3.0: Cyberware type/subtype refactor.
//   - `sensor` type → split into `optics` / `voice` / `audio`. Old subtype
//     names (voice/audio/optics) become types; `isOption` becomes a Base /
//     Option subtype.
//   - Cyberlimb subtypes collapse:
//       leftArm  → subtype=arm, placement=left
//       rightArm → subtype=arm, placement=right
//       leftLeg  → subtype=leg, placement=left
//       rightLeg → subtype=leg, placement=right
//       extraArm → subtype=arm, placement=extra
//       meatLimbs → subtype=arm, placement=left, structure.max=0
//                   (skipped if the actor already has an Arm-Left)
//       builtIn / finger / hand / feet stay as-is (subtype names unchanged)
//   - `isOption` is cleared on every cyberware item (no longer read).
// Idempotent: items already migrated (recognisable by the new subtype names)
// pass through untouched.
// ============================================================================
const _OLD_LIMB_TO_NEW = {
    leftArm:  { subtype: "arm", placement: "left" },
    rightArm: { subtype: "arm", placement: "right" },
    leftLeg:  { subtype: "leg", placement: "left" },
    rightLeg: { subtype: "leg", placement: "right" },
    extraArm: { subtype: "arm", placement: "extra" }
    // meatLimbs handled specially (collision check)
};
const _OLD_SENSOR_SUBS = new Set(["voice", "audio", "optics"]);

function _migrateOneCyberware(item, opts = {}) {
    const sys = item.system || {};
    if (sys.cyberwareType === "sensor" && _OLD_SENSOR_SUBS.has(sys.cyberwareSubtype)) {
        return {
            "system.cyberwareType":    sys.cyberwareSubtype,           // voice/audio/optics → type
            "system.cyberwareSubtype": sys.isOption ? "option" : "base",
            "system.isOption":         false
        };
    }
    if (sys.cyberwareType === "cyberlimb") {
        const map = _OLD_LIMB_TO_NEW[sys.cyberwareSubtype];
        if (map) {
            return {
                "system.cyberwareSubtype": map.subtype,
                "system.placement":        map.placement,
                "system.isOption":         false
            };
        }
        if (sys.cyberwareSubtype === "meatLimbs") {
            // Caller decides whether to delete (collision) or convert.
            return opts.meatLimbsConflict
                ? { _delete: true }
                : {
                    "system.cyberwareSubtype": "arm",
                    "system.placement":        "left",
                    "system.structure.max":    0,
                    "system.isOption":         false
                };
        }
        // hand / feet / finger / builtIn: subtype name already matches; just
        // clear the legacy isOption flag (was true; the new model infers it).
        if (["hand", "feet", "finger", "builtIn"].includes(sys.cyberwareSubtype) && sys.isOption !== false) {
            return { "system.isOption": false };
        }
    }
    // Clear stale isOption everywhere else (defensive — only if set).
    if (sys.isOption !== false && sys.isOption !== undefined) {
        return { "system.isOption": false };
    }
    return null;
}

async function _migrateCyberwareTypeSubtype() {
    let actorsTouched = 0;
    let itemsTouched  = 0;
    let meatLimbsDeleted = 0;

    for (const actor of game.actors.contents) {
        const cyber = actor.items.contents.filter(i => i.type === "cyberware");
        if (cyber.length === 0) continue;

        // First pass: detect meatLimbs items whose target slot (Arm-Left, with
        // either old leftArm or new arm+left already on this actor) is taken.
        const armLeftTaken = cyber.some(i => {
            const s = i.system || {};
            if (s.cyberwareType !== "cyberlimb") return false;
            if (s.cyberwareSubtype === "leftArm") return true;                                  // pre-migration
            if (s.cyberwareSubtype === "arm" && s.placement === "left") return true;           // post-migration
            return false;
        });

        const updates = [];
        const deletes = [];
        for (const item of cyber) {
            const meatConflict = (item.system?.cyberwareSubtype === "meatLimbs") && armLeftTaken;
            const change = _migrateOneCyberware(item, { meatLimbsConflict: meatConflict });
            if (!change) continue;
            if (change._delete) {
                deletes.push(item.id);
                meatLimbsDeleted++;
            } else {
                updates.push({ _id: item.id, ...change });
                itemsTouched++;
            }
        }

        try {
            if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
            if (deletes.length) await actor.deleteEmbeddedDocuments("Item", deletes);
            if (updates.length || deletes.length) actorsTouched++;
        } catch (err) {
            console.error(`CYBERPUNK | Failed to migrate cyberware on actor "${actor.name}":`, err);
            migrationSuccess = false;
        }
    }

    // World-level items (sidebar items folder).
    for (const item of game.items.contents) {
        if (item.type !== "cyberware") continue;
        // World items can't collide with an actor's arm-left, so meatLimbs
        // always converts to Arm-Left Structure 0.
        const change = _migrateOneCyberware(item, { meatLimbsConflict: false });
        if (!change || change._delete) continue;
        try {
            await item.update(change);
            itemsTouched++;
        } catch (err) {
            console.error(`CYBERPUNK | Failed to migrate world cyberware item "${item.name}":`, err);
            migrationSuccess = false;
        }
    }

    if (itemsTouched || meatLimbsDeleted) {
        console.log(`CYBERPUNK | Migrated ${itemsTouched} cyberware item(s) across ${actorsTouched} actor(s); deleted ${meatLimbsDeleted} redundant meatLimb item(s).`);
    }
}

