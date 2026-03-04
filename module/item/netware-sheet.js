import {
    availability,
    netwareTypes, programSubtypes,
    boosterBonuses, defenderDefences,
    attackerClasses, attackerEffects
} from "../lookups.js";
import { CyberpunkItemSheet } from "./item-sheet-base.js";

/**
 * Netware Item Sheet with custom card design and conditional fields
 * @extends {CyberpunkItemSheet}
 */
export class CyberpunkNetwareSheet extends CyberpunkItemSheet {

    /** @type {string} */
    _activeTab = "description";

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["cyberpunk", "sheet", "item", "netware-sheet"],
            template: "systems/cyberpunk/templates/item/netware-sheet.hbs"
        });
    }

    /** @override */
    getData() {
        const data = super.getData();
        data.activeTab = this._activeTab;

        const sys = data.system;
        const nType = sys.netwareType || "program";

        // --- Type flags ---
        data.isCyberdeck = nType === "cyberdeck";
        data.isUpgrade = nType === "upgrade";
        data.isProgram = nType === "program";

        // --- Program subtype flags ---
        const subtype = sys.programSubtype || "booster";
        data.isBooster = data.isProgram && subtype === "booster";
        data.isDefender = data.isProgram && subtype === "defender";
        data.isAttacker = data.isProgram && subtype === "attacker";

        // --- Defender sub-flags ---
        data.isArmorDefence = data.isDefender && (sys.defenderDefence || "armor") === "armor";

        // --- Availability dropdown ---
        data.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: sys.availability === value
        }));
        const selectedAvail = availability[sys.availability] || "Common";
        data.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

        // --- Netware Type dropdown ---
        data.netwareTypeOptions = Object.entries(netwareTypes).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: nType === value
        }));
        const selectedTypeKey = netwareTypes[nType] || "NetwareTypeProgram";
        data.selectedNetwareTypeLabel = game.i18n.localize(`CYBERPUNK.${selectedTypeKey}`);

        // --- Program Subtype dropdown ---
        if (data.isProgram) {
            data.programSubtypeOptions = Object.entries(programSubtypes).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: subtype === value
            }));
            const selectedSubKey = programSubtypes[subtype] || "ProgramSubBooster";
            data.selectedProgramSubtypeLabel = game.i18n.localize(`CYBERPUNK.${selectedSubKey}`);
        }

        // --- Booster Bonus dropdown ---
        if (data.isBooster) {
            const bonus = sys.boosterBonus || "scanner";
            data.boosterBonusOptions = Object.entries(boosterBonuses).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: bonus === value
            }));
            const selectedBonusKey = boosterBonuses[bonus] || "BoosterScanner";
            data.selectedBoosterBonusLabel = game.i18n.localize(`CYBERPUNK.${selectedBonusKey}`);
        }

        // --- Defender Defence dropdown ---
        if (data.isDefender) {
            const defence = sys.defenderDefence || "armor";
            data.defenderDefenceOptions = Object.entries(defenderDefences).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: defence === value
            }));
            const selectedDefKey = defenderDefences[defence] || "DefenderArmor";
            data.selectedDefenderDefenceLabel = game.i18n.localize(`CYBERPUNK.${selectedDefKey}`);
        }

        // --- Attacker Class dropdown ---
        if (data.isAttacker) {
            const cls = sys.attackerClass || "antiProgram";
            data.attackerClassOptions = Object.entries(attackerClasses).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: cls === value
            }));
            const selectedClsKey = attackerClasses[cls] || "AttackerAntiProgram";
            data.selectedAttackerClassLabel = game.i18n.localize(`CYBERPUNK.${selectedClsKey}`);

            // --- Attacker Effect dropdown ---
            const effect = sys.attackerEffect || "none";
            data.attackerEffectOptions = Object.entries(attackerEffects).map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
                selected: effect === value
            }));
            const selectedEffKey = attackerEffects[effect] || "EffectNone";
            data.selectedAttackerEffectLabel = game.i18n.localize(`CYBERPUNK.${selectedEffKey}`);
        }

        return data;
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

        if (this._isLocked) return;

        // --- Netware Type change → reset dependent fields ---
        html.find('select[name="system.netwareType"]').change(async ev => {
            const newType = ev.currentTarget.value;
            const updates = { "system.netwareType": newType };
            if (newType !== "program") {
                // Reset program-specific fields to defaults
                updates["system.programSubtype"] = "booster";
            }
            await this.item.update(updates);
        });

        // --- Program Subtype change → reset dependent fields ---
        html.find('select[name="system.programSubtype"]').change(async ev => {
            const newSubtype = ev.currentTarget.value;
            await this.item.update({ "system.programSubtype": newSubtype });
        });
    }
}
