import {
    availability, concealability, reliability,
    weaponTypes, getWeaponClasses,
    meleeDamageTypes, exoticEffects, ammoTypes,
    ordnanceTemplateTypes,
    getAttackSkillsForWeapon,
    toolBonusProperties,
    cyberwareTypes, cyberwareSubtypes, surgeryCodes,
    getCyberwareSubtypes, canHaveOptions, canBeWeapon, canBeArmor
} from "../lookups.js";
import { calibers as CALIBERS, getDamageForCaliber } from "../calibers.js";

// Legacy weaponType strings (pre-overhaul) → new discriminator + class.
// Matches the same table used in weapon-sheet.js so cyberware embedded weapons
// fall through legacy values until the migration writes them through.
const LEGACY_TYPE = {
    Pistol:   { weaponType: "Ranged",   weaponClass: "Pistol" },
    SMG:      { weaponType: "Ranged",   weaponClass: "SMG" },
    Shotgun:  { weaponType: "Ranged",   weaponClass: "Shotgun" },
    Rifle:    { weaponType: "Ranged",   weaponClass: "Rifle" },
    Heavy:    { weaponType: "Ranged",   weaponClass: "Heavy" },
    Bow:      { weaponType: "Martial",  weaponClass: "Bow" },
    Crossbow: { weaponType: "Martial",  weaponClass: "Crossbow" },
    Melee:    { weaponType: "Martial",  weaponClass: "Melee" },
    Exotic:   { weaponType: "Exotic",   weaponClass: "Exotic" }
};

// Default weaponClass when the user switches the discriminator dropdown.
const DEFAULT_CLASS_BY_TYPE = {
    Martial: "Melee",
    Ranged:  "Pistol",
    Exotic:  "Exotic"
};
import { localize } from "../utils.js";
import { CyberpunkItemSheet } from "./item-sheet-base.js";

/**
 * Cyberware Item Sheet with custom card design and conditional tabs
 * @extends {CyberpunkItemSheet}
 */
export class CyberpunkCyberwareSheet extends CyberpunkItemSheet {

    /** @type {string} */
    _activeTab = "description";

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["cyberpunk", "sheet", "item", "cyberware-sheet"],
            template: "systems/cyberpunk/templates/item/cyberware-sheet.hbs",
            width: 500,
            height: 400,
            dragDrop: [{ dropSelector: "[data-drop-target]" }]
        });
    }

    /** @override */
    getData() {
        const data = super.getData();
        data.activeTab = this._activeTab;

        const sys = data.system;
        const cyberType = sys.cyberwareType || "implant";

        // --- Type/Category Flags ---
        data.cyberwareType = cyberType;
        data.isSensor = cyberType === "sensor";
        data.isCyberlimb = cyberType === "cyberlimb";
        data.isImplant = cyberType === "implant";
        data.isChipware = cyberType === "chipware";
        data.isSkillChip = cyberType === "chipware" && sys.cyberwareSubtype === "skill";

        // --- Option/Slot Logic ---
        data.canHaveOptions = canHaveOptions(cyberType);
        data.isOption = sys.isOption || false;
        data.showStructure = cyberType === "cyberlimb" && !sys.isOption;
        data.showSdpBonus = cyberType === "cyberlimb" && sys.isOption;

        // --- Calculate effective structure values (base + SDP bonuses from attached options) ---
        if (data.showStructure && this.item.actor) {
            const baseMax = sys.structure?.max ?? 0;
            const baseDisablesAt = sys.disablesAt ?? 0;

            // Find attached options and sum their SDP bonuses
            const attachedOptions = this.item.actor.items.filter(i =>
                i.type === 'cyberware' &&
                i.system.isOption &&
                i.getFlag('cyberpunk', 'attachedTo') === this.item.id
            );

            const sdpBonusTotal = attachedOptions.reduce((sum, opt) => {
                return sum + (opt.system.sdpBonus || 0);
            }, 0);

            data.sdpBonusTotal = sdpBonusTotal;
            data.effectiveMaxStructure = baseMax + sdpBonusTotal;
            data.effectiveDisablesAt = baseDisablesAt + sdpBonusTotal;
            data.hasBonus = sdpBonusTotal > 0;
        } else {
            data.sdpBonusTotal = 0;
            data.effectiveMaxStructure = sys.structure?.max ?? 0;
            data.effectiveDisablesAt = sys.disablesAt ?? 0;
            data.hasBonus = false;
        }

        // --- Weapon/Armor Capability ---
        data.canBeWeapon = canBeWeapon(cyberType, sys.isOption);
        data.canBeArmor = canBeArmor(cyberType);
        data.isWeapon = sys.isWeapon && data.canBeWeapon;
        data.isArmor = sys.isArmor && data.canBeArmor;

        // --- Tab Configuration ---
        data.showWeaponTab = data.isWeapon;
        data.showArmorTab = data.isArmor;

        // Validate active tab - if current tab is hidden, switch to description
        if (this._activeTab === "weapon" && !data.showWeaponTab) {
            this._activeTab = "description";
            data.activeTab = "description";
        }
        if (this._activeTab === "armor" && !data.showArmorTab) {
            this._activeTab = "description";
            data.activeTab = "description";
        }

        // --- Humanity Roll State ---
        data.humanityRolled = sys.humanityRolled || false;
        data.canRollHumanity = !data.humanityRolled && sys.humanityCost;

        // --- Cyberware Type Dropdown ---
        data.cyberwareTypeOptions = Object.entries(cyberwareTypes).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: cyberType === value
        }));
        const selectedTypeKey = cyberwareTypes[cyberType] || "CyberTypeImplant";
        data.selectedTypeLabel = game.i18n.localize(`CYBERPUNK.${selectedTypeKey}`);

        // --- Cyberware Subtype Dropdown ---
        const subtypes = getCyberwareSubtypes(cyberType);
        data.cyberwareSubtypeOptions = Object.entries(subtypes).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: sys.cyberwareSubtype === value
        }));
        const selectedSubKey = subtypes[sys.cyberwareSubtype];
        data.selectedSubtypeLabel = selectedSubKey
            ? game.i18n.localize(`CYBERPUNK.${selectedSubKey}`)
            : "";

        // --- Surgery Code Dropdown ---
        data.surgeryCodeOptions = Object.entries(surgeryCodes).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: sys.surgeryCode === value
        }));
        const selectedSurgKey = surgeryCodes[sys.surgeryCode] || "SurgHarmless";
        data.selectedSurgeryLabel = game.i18n.localize(`CYBERPUNK.${selectedSurgKey}`);

        // --- Availability Dropdown ---
        data.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: sys.availability === value
        }));
        const selectedAvail = availability[sys.availability] || "Common";
        data.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

        // --- Bonuses (Effect Tab) ---
        data.bonuses = this._prepareBonuses(sys.bonuses || []);
        data.propertyOptions = this._getAvailablePropertyOptions(sys.bonuses || []);

        // --- Weapon Tab Data ---
        if (data.showWeaponTab) {
            this._prepareWeaponData(data);
        }

        // --- Armor Tab Data ---
        if (data.showArmorTab) {
            this._prepareArmorData(data);
        }

        return data;
    }

    /**
     * Prepare bonuses array for display
     */
    _prepareBonuses(rawBonuses) {
        return rawBonuses.map(bonus => {
            if (bonus.type === "property") {
                const labelKey = toolBonusProperties[bonus.property];
                return {
                    ...bonus,
                    isProperty: true,
                    label: labelKey ? game.i18n.localize(`CYBERPUNK.${labelKey}`) : bonus.property
                };
            }
            return {
                ...bonus,
                isSkill: true,
                hasFilled: !!(bonus.skillUuid),
                label: bonus.skillName || ""
            };
        });
    }

    /**
     * Get available property options (excluding already used ones)
     */
    _getAvailablePropertyOptions(bonuses) {
        const usedProperties = new Set(
            bonuses.filter(b => b.type === "property").map(b => b.property)
        );
        return Object.entries(toolBonusProperties)
            .filter(([key]) => !usedProperties.has(key))
            .map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`)
            }));
    }

    /**
     * Resolve effective weaponType + weaponClass for the embedded weapon,
     * mirroring weapon-sheet.js: falls through legacy values for un-migrated data.
     */
    _resolveWeaponDiscriminator(weapon) {
        const raw = weapon.weaponType || "Martial";
        if (LEGACY_TYPE[raw]) {
            return {
                weaponType: LEGACY_TYPE[raw].weaponType,
                weaponClass: weapon.weaponClass || LEGACY_TYPE[raw].weaponClass
            };
        }
        return { weaponType: raw, weaponClass: weapon.weaponClass || DEFAULT_CLASS_BY_TYPE[raw] || "" };
    }

    /**
     * Prepare weapon tab data. Cyberware can only embed Martial / Ranged / Exotic
     * weapons (never Ordnance or Ammo). Field-name conventions match the unified
     * weapon-sheet so the row markup in tab-weapon.hbs can mirror weapon-sheet.hbs.
     */
    _prepareWeaponData(data) {
        const weapon = data.system.weapon || {};
        const d = this._resolveWeaponDiscriminator(weapon);
        const wt = d.weaponType;
        const wc = d.weaponClass;

        data.weaponType  = wt;
        data.weaponClass = wc;
        data.weaponIsMartial = wt === "Martial";
        data.weaponIsRanged  = wt === "Ranged";
        data.weaponIsExotic  = wt === "Exotic";

        // ----- WeaponType (discriminator) — only Martial/Ranged/Exotic on cyberware -----
        const allowedTypes = ["Martial", "Ranged", "Exotic"];
        data.weaponTypeOptions = allowedTypes.map(value => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${weaponTypes[value]}`),
            selected: wt === value
        }));
        data.selectedWeaponTypeLabel = game.i18n.localize(`CYBERPUNK.${weaponTypes[wt] || "WeaponTypeMartial"}`);

        // ----- WeaponClass (Subtype) — varies per weaponType -----
        const classEnum = getWeaponClasses(wt) || {};
        data.weaponClassOptions = Object.entries(classEnum).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: wc === value
        }));
        data.selectedWeaponClassLabel = classEnum[wc]
            ? game.i18n.localize(`CYBERPUNK.${classEnum[wc]}`)
            : wc;

        // ----- Concealability -----
        data.weaponConcealabilityOptions = Object.entries(concealability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: weapon.concealability === value
        }));
        data.selectedWeaponConcealabilityLabel = game.i18n.localize(`CYBERPUNK.${concealability[weapon.concealability] || "ConcealHidden"}`);

        // ----- Reliability -----
        data.weaponReliabilityOptions = Object.entries(reliability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: weapon.reliability === value
        }));
        data.selectedWeaponReliabilityLabel = game.i18n.localize(`CYBERPUNK.${reliability[weapon.reliability] || "Standard"}`);

        // ----- Attack Skill -----
        const skillsList = getAttackSkillsForWeapon(wt, wc);
        const currentSkill = weapon.attackSkill || skillsList[0] || "";
        data.weaponAttackSkillOptions = skillsList.map(name => ({
            value: name,
            label: game.i18n.has(`CYBERPUNK.Skill${name}`)
                ? game.i18n.localize(`CYBERPUNK.Skill${name}`)
                : name,
            selected: currentSkill === name
        }));
        data.selectedWeaponAttackSkillLabel = currentSkill
            ? (game.i18n.has(`CYBERPUNK.Skill${currentSkill}`)
                ? game.i18n.localize(`CYBERPUNK.Skill${currentSkill}`)
                : currentSkill)
            : "";

        // ----- Damage Type (Martial only) -----
        if (data.weaponIsMartial) {
            data.weaponDamageTypeOptions = Object.entries(meleeDamageTypes).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: weapon.damageType === value
            }));
            data.selectedWeaponDamageTypeLabel = game.i18n.localize(`CYBERPUNK.${meleeDamageTypes[weapon.damageType] || "DmgEdged"}`);
        }

        // ----- Effect (Martial / Exotic) -----
        if (data.weaponIsMartial || data.weaponIsExotic) {
            const effectKeys = Object.keys(exoticEffects);
            const currentEffect = weapon.effect || effectKeys[0];
            data.weaponEffectOptions = Object.entries(exoticEffects).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: currentEffect === value
            }));
            data.selectedWeaponEffectLabel = game.i18n.localize(`CYBERPUNK.${exoticEffects[currentEffect] || exoticEffects[effectKeys[0]]}`);
        }

        // ----- Template (Exotic) — supports "None" to opt out of AoE -----
        if (data.weaponIsExotic) {
            const fallbackToCircle = false; // Exotic supports None — never auto-fallback
            const baseOptions = Object.entries(ordnanceTemplateTypes).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: weapon.templateType === value
            }));
            data.weaponTemplateOptions = [
                {
                    value: "",
                    label: game.i18n.localize("CYBERPUNK.TemplateNone"),
                    selected: !weapon.templateType
                },
                ...baseOptions
            ];
            const selKey = ordnanceTemplateTypes[weapon.templateType];
            data.selectedWeaponTemplateLabel = selKey
                ? game.i18n.localize(`CYBERPUNK.${selKey}`)
                : game.i18n.localize("CYBERPUNK.TemplateNone");
            const tplKind = weapon.templateType || "circle";
            data.weaponRadiusLabel = (tplKind === "circle")
                ? game.i18n.localize("CYBERPUNK.RadiusM")
                : game.i18n.localize("CYBERPUNK.WidthM");
        }

        // ----- Caliber (Ranged) -----
        if (data.weaponIsRanged) {
            data.weaponCaliberOptions = Object.entries(CALIBERS).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: weapon.caliber === value
            }));
            const selCal = CALIBERS[weapon.caliber];
            data.selectedWeaponCaliberLabel = selCal ? game.i18n.localize(`CYBERPUNK.${selCal}`) : "";
        }
    }

    /**
     * Prepare armor tab data
     */
    _prepareArmorData(data) {
        const armor = data.system.armor || {};

        data.armorTypeOptions = [
            { value: "soft", label: game.i18n.localize("CYBERPUNK.SoftArmor"), selected: armor.armorType === "soft" },
            { value: "hard", label: game.i18n.localize("CYBERPUNK.HardArmor"), selected: armor.armorType === "hard" }
        ];
        data.selectedArmorTypeLabel = armor.armorType === "hard"
            ? game.i18n.localize("CYBERPUNK.HardArmor")
            : game.i18n.localize("CYBERPUNK.SoftArmor");

        // Coverage grid (same pattern as outfit-sheet)
        const locationOrder = [
            { key: "lArm", label: localize("lArm") },
            { key: "Head", label: localize("Head") },
            { key: "rArm", label: localize("rArm") },
            { key: "lLeg", label: localize("lLeg") },
            { key: "Torso", label: localize("Torso") },
            { key: "rLeg", label: localize("rLeg") }
        ];

        const coverage = armor.coverage || {};
        data.coverageRows = [
            locationOrder.slice(0, 3),
            locationOrder.slice(3, 6)
        ].map(row => row.map(loc => {
            const cov = coverage[loc.key] || { stoppingPower: 0, ablation: 0 };
            const maxSP = Number(cov.stoppingPower) || 0;
            const ablation = Number(cov.ablation) || 0;
            const currentSP = Math.max(0, maxSP - ablation);
            return {
                key: loc.key,
                label: loc.label,
                currentSP,
                maxSP,
                isDamaged: currentSP < maxSP
            };
        }));
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Tab switching
        html.find('.tab-header').click(ev => {
            ev.preventDefault();
            const tab = ev.currentTarget.dataset.tab;
            if (tab && tab !== this._activeTab) {
                this._activeTab = tab;
                this.render(false);
            }
        });

        // Click skill name to open its sheet
        html.find('.skill-name[data-uuid]').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const uuid = ev.currentTarget.dataset.uuid;
            if (uuid) {
                const item = await fromUuid(uuid);
                if (item) item.sheet.render(true);
            }
        });

        // Roll humanity loss (works in locked mode)
        html.find('.humanity-roll-btn').click(async ev => {
            ev.preventDefault();
            const formula = this.item.system.humanityCost;
            if (!formula || this.item.system.humanityRolled) return;

            const roll = new Roll(formula);
            await roll.evaluate();

            const { processFormulaRoll } = await import("../dice.js");
            const templateData = processFormulaRoll(roll);
            const content = await foundry.applications.handlebars.renderTemplate(
                "systems/cyberpunk/templates/chat/humanity-roll.hbs",
                templateData
            );
            const speaker = this.item.actor
                ? ChatMessage.getSpeaker({ actor: this.item.actor })
                : ChatMessage.getSpeaker();
            await ChatMessage.create({
                speaker,
                content,
                rolls: [roll],
                sound: CONFIG.sounds.dice
            });

            await this.item.update({
                "system.humanityLoss": roll.total,
                "system.humanityRolled": true
            });

            if (this.item.actor) {
                const currentDamage = this.item.actor.system.stats.emp.humanityDamage || 0;
                await this.item.actor.update({
                    "system.stats.emp.humanityDamage": currentDamage + roll.total
                });
            }
        });

        // Reset humanity roll (unlocked mode only)
        html.find('.humanity-reset-btn').click(async ev => {
            ev.preventDefault();
            await this.item.update({
                "system.humanityLoss": 0,
                "system.humanityRolled": false
            });
        });

        if (this._isLocked) return;

        // --- Checkbox toggle (standard pattern from ordnance-sheet) ---
        html.find('.checkbox-toggle').click(async ev => {
            ev.preventDefault();
            const field = ev.currentTarget.dataset.field;
            if (!field) return;
            const current = foundry.utils.getProperty(this.item, field);
            await this.item.update({ [field]: !current });
        });

        // --- Cyberware Type change → reset subtype and flags ---
        html.find('select[name="system.cyberwareType"]').change(async ev => {
            const newType = ev.currentTarget.value;
            const subtypes = getCyberwareSubtypes(newType);
            const firstSubtype = Object.keys(subtypes)[0] || "";
            await this.item.update({
                "system.cyberwareType": newType,
                "system.cyberwareSubtype": firstSubtype,
                "system.isOption": false,
                "system.isWeapon": false,
                "system.isArmor": false
            });
        });

        // --- Embedded Weapon Type (discriminator) change ---
        html.find('select[name="system.weapon.weaponType"]').change(async ev => {
            const newType = ev.currentTarget.value;
            const updates = {
                "system.weapon.weaponType":  newType,
                "system.weapon.weaponClass": DEFAULT_CLASS_BY_TYPE[newType] || "",
                // Reset attackSkill so the next render picks the new canonical default
                "system.weapon.attackSkill": ""
            };
            // Switching INTO Ranged stamps the caliber's damage (if any).
            if (newType === "Ranged") {
                const dmg = getDamageForCaliber(this.item.system.weapon?.caliber);
                if (dmg) updates["system.weapon.damage"] = dmg;
            }
            await this.item.update(updates);
        });

        // --- Embedded WeaponClass (Subtype) change ---
        html.find('select[name="system.weapon.weaponClass"]').change(async ev => {
            const newClass = ev.currentTarget.value;
            await this.item.update({
                "system.weapon.weaponClass": newClass,
                "system.weapon.attackSkill": ""
            });
        });

        // --- Embedded Caliber change → re-stamp damage for the new caliber ---
        html.find('select[name="system.weapon.caliber"]').change(async ev => {
            const newCal = ev.currentTarget.value;
            const updates = { "system.weapon.caliber": newCal };
            const dmg = getDamageForCaliber(newCal);
            if (dmg) updates["system.weapon.damage"] = dmg;
            await this.item.update(updates);
        });

        // --- Armor current SP input ---
        html.find('.sp-current-input').change(async ev => {
            const input = ev.currentTarget;
            const key = input.dataset.key;
            const maxSP = Number(input.dataset.max) || 0;
            const newCurrent = Math.max(0, Math.min(maxSP, Number(input.value) || 0));
            const ablation = maxSP - newCurrent;
            await this.item.update({ [`system.armor.coverage.${key}.ablation`]: ablation });
        });

        // --- Bonuses management (same as tool-sheet) ---
        html.find('.add-property').click(async ev => {
            ev.preventDefault();
            const bonuses = [...(this.item.system.bonuses || [])];
            const usedProperties = new Set(
                bonuses.filter(b => b.type === "property").map(b => b.property)
            );
            const firstAvailable = Object.keys(toolBonusProperties).find(k => !usedProperties.has(k));
            if (!firstAvailable) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
                return;
            }
            bonuses.push({ type: "property", property: firstAvailable, value: 0 });
            await this.item.update({ "system.bonuses": bonuses });
        });

        html.find('.add-skill').click(async ev => {
            ev.preventDefault();
            const bonuses = [...(this.item.system.bonuses || [])];
            bonuses.push({ type: "skill", skillUuid: "", skillName: "", value: 0 });
            await this.item.update({ "system.bonuses": bonuses });
        });

        html.find('.remove-bonus').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const index = parseInt(ev.currentTarget.dataset.index);
            const bonuses = [...(this.item.system.bonuses || [])];
            bonuses.splice(index, 1);
            await this.item.update({ "system.bonuses": bonuses });
        });

        html.find('.bonus-property-select').change(async ev => {
            const index = parseInt(ev.currentTarget.dataset.index);
            const newProperty = ev.currentTarget.value;
            const bonuses = [...(this.item.system.bonuses || [])];
            if (bonuses.some((b, i) => i !== index && b.type === "property" && b.property === newProperty)) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
                this.render(false);
                return;
            }
            bonuses[index] = { ...bonuses[index], property: newProperty };
            await this.item.update({ "system.bonuses": bonuses });
        });

        html.find('.bonus-value-input').on('change blur', async ev => {
            const index = parseInt(ev.currentTarget.dataset.index);
            const value = parseInt(ev.currentTarget.value) || 0;
            const bonuses = [...(this.item.system.bonuses || [])];
            if (bonuses[index] && bonuses[index].value !== value) {
                bonuses[index] = { ...bonuses[index], value };
                await this.item.update({ "system.bonuses": bonuses });
            }
        });
    }

    /** @override */
    async _onDrop(event) {
        event.preventDefault();
        if (this._isLocked) return;

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch (err) {
            return;
        }

        if (data.type !== "Item") return;

        const item = await Item.implementation.fromDropData(data);
        if (!item) return;

        if (item.type !== "skill") {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.OnlySkillsCanBeAdded"));
            return;
        }

        // Effect bonus skill - store UUID, name, stat, and default value
        const bonuses = [...(this.item.system.bonuses || [])];
        const isDuplicate = bonuses.some(b =>
            b.type === "skill" && b.skillUuid && (
                b.skillUuid === item.uuid ||
                b.skillName.toLowerCase() === item.name.toLowerCase()
            )
        );
        if (isDuplicate) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
            return;
        }

        // Store the skill's stat for virtual skill rolls
        const skillStat = item.system?.stat || "ref";

        const emptyIndex = bonuses.findIndex(b => b.type === "skill" && !b.skillUuid);
        if (emptyIndex >= 0) {
            bonuses[emptyIndex] = {
                ...bonuses[emptyIndex],
                skillUuid: item.uuid,
                skillName: item.name,
                skillStat: skillStat
            };
        } else {
            bonuses.push({
                type: "skill",
                skillUuid: item.uuid,
                skillName: item.name,
                skillStat: skillStat,
                value: 0
            });
        }

        await this.item.update({ "system.bonuses": bonuses });
    }
}
