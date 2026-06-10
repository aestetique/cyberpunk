import {
    availability,
    cyberwareTypes, surgeryCodes,
    getCyberwareSubtypes, canHaveOptions, canBeWeapon, canBeArmor
} from "../lookups.js";
import { localize } from "../utils.js";
import { CyberpunkItemSheet } from "./item-sheet-base.js";
import {
    prepareEffectTabContext,
    prepareWeaponTabContext,
    bindEffectTabListeners,
    bindWeaponTabListeners,
    handleSkillDropForBonus
} from "./embedded-helpers.js";

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

        // --- Bonuses (Effect Tab) — shared with armor sheet ---
        prepareEffectTabContext(data, sys.bonuses);

        // --- Embedded Weapon Tab — shared with armor sheet ---
        if (data.showWeaponTab) {
            prepareWeaponTabContext(data, sys.weapon);
        }

        // --- Armor Tab Data ---
        if (data.showArmorTab) {
            this._prepareArmorData(data);
        }

        return data;
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

        // --- Armor current SP input ---
        html.find('.sp-current-input').change(async ev => {
            const input = ev.currentTarget;
            const key = input.dataset.key;
            const maxSP = Number(input.dataset.max) || 0;
            const newCurrent = Math.max(0, Math.min(maxSP, Number(input.value) || 0));
            const ablation = maxSP - newCurrent;
            await this.item.update({ [`system.armor.coverage.${key}.ablation`]: ablation });
        });

        // Shared Effect-tab listeners (add property/skill, remove, value/property edits)
        bindEffectTabListeners(html, this.item, { isLocked: this._isLocked });

        // Shared embedded-Weapon-tab listeners (type/class/skill/caliber changes)
        bindWeaponTabListeners(html, this.item, { isLocked: this._isLocked });
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
        await handleSkillDropForBonus(this.item, item);
    }
}
