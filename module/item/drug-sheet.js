import { availability, toolBonusProperties } from "../lookups.js";
import { CyberpunkItemSheet } from "./item-sheet-base.js";

/**
 * Drug Item Sheet with custom card design and tabs
 * Consumable variant of Tool — has quantity, deleted when depleted.
 * Two bonus sets: "bonuses" (Effect tab) and "withdrawal" (Withdrawal tab).
 * @extends {CyberpunkItemSheet}
 */
export class CyberpunkDrugSheet extends CyberpunkItemSheet {

    /** @type {string} */
    _activeTab = "description";

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["cyberpunk", "sheet", "item", "drug-sheet"],
            template: "systems/cyberpunk/templates/item/drug-sheet.hbs",
            dragDrop: [{ dropSelector: "[data-drop-target]" }]
        });
    }

    /**
     * Resolve the bonus-set name from an event target (`"bonuses"` or `"withdrawal"`).
     * Falls back to `"bonuses"` if no ancestor carries the data attribute.
     */
    _bonusSetFor(target) {
        const el = target?.closest?.("[data-bonus-set]");
        const set = el?.dataset?.bonusSet;
        return set === "withdrawal" ? "withdrawal" : "bonuses";
    }

    /**
     * Build a shaped bonus list (with isProperty/isSkill/label) and the property-dropdown
     * options for a given bonus set on this item.
     */
    _buildBonusViewData(rawBonuses) {
        const usedProperties = new Set(
            rawBonuses.filter(b => b.type === "property").map(b => b.property)
        );

        const shaped = rawBonuses.map(bonus => {
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

        const propertyOptions = Object.entries(toolBonusProperties)
            .filter(([key]) => !usedProperties.has(key))
            .map(([value, labelKey]) => ({
                value,
                label: game.i18n.localize(`CYBERPUNK.${labelKey}`)
            }));

        return { shaped, propertyOptions };
    }

    /** @override */
    getData() {
        const data = super.getData();
        data.activeTab = this._activeTab;

        // --- Availability dropdown ---
        data.availabilityOptions = Object.entries(availability).map(([value, labelKey]) => ({
            value,
            label: game.i18n.localize(`CYBERPUNK.${labelKey}`),
            selected: data.system.availability === value
        }));
        const selectedAvail = availability[data.system.availability] || "Common";
        data.selectedAvailabilityLabel = game.i18n.localize(`CYBERPUNK.${selectedAvail}`);

        // --- Bonuses (Effect tab) ---
        const effect = this._buildBonusViewData(this.item.system.bonuses || []);
        data.bonuses = effect.shaped;
        data.propertyOptions = effect.propertyOptions;

        // --- Withdrawal bonuses ---
        const wd = this._buildBonusViewData(this.item.system.withdrawal || []);
        data.withdrawal = wd.shaped;
        data.withdrawalPropertyOptions = wd.propertyOptions;

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

        if (this._isLocked) return;

        // Add property bonus
        html.find('.add-property').click(async ev => {
            ev.preventDefault();
            const set = this._bonusSetFor(ev.currentTarget);
            const bonuses = [...(this.item.system[set] || [])];
            const usedProperties = new Set(
                bonuses.filter(b => b.type === "property").map(b => b.property)
            );
            const firstAvailable = Object.keys(toolBonusProperties).find(k => !usedProperties.has(k));
            if (!firstAvailable) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
                return;
            }
            bonuses.push({ type: "property", property: firstAvailable, value: 0 });
            await this.item.update({ [`system.${set}`]: bonuses });
        });

        // Add skill bonus (empty slot)
        html.find('.add-skill').click(async ev => {
            ev.preventDefault();
            const set = this._bonusSetFor(ev.currentTarget);
            const bonuses = [...(this.item.system[set] || [])];
            bonuses.push({ type: "skill", skillUuid: "", skillName: "", value: 0 });
            await this.item.update({ [`system.${set}`]: bonuses });
        });

        // Remove bonus
        html.find('.remove-bonus').click(async ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const set = this._bonusSetFor(ev.currentTarget);
            const index = parseInt(ev.currentTarget.dataset.index);
            const bonuses = [...(this.item.system[set] || [])];
            bonuses.splice(index, 1);
            await this.item.update({ [`system.${set}`]: bonuses });
        });

        // Property dropdown change
        html.find('.bonus-property-select').change(async ev => {
            const set = this._bonusSetFor(ev.currentTarget);
            const index = parseInt(ev.currentTarget.dataset.index);
            const newProperty = ev.currentTarget.value;
            const bonuses = [...(this.item.system[set] || [])];
            if (bonuses.some((b, i) => i !== index && b.type === "property" && b.property === newProperty)) {
                ui.notifications.warn(game.i18n.localize("CYBERPUNK.DuplicateBonus"));
                this.render(false);
                return;
            }
            bonuses[index] = { ...bonuses[index], property: newProperty };
            await this.item.update({ [`system.${set}`]: bonuses });
        });

        // Bonus value change - save on change or blur
        html.find('.bonus-value-input').on('change blur', async ev => {
            const set = this._bonusSetFor(ev.currentTarget);
            const index = parseInt(ev.currentTarget.dataset.index);
            const value = parseInt(ev.currentTarget.value) || 0;
            const bonuses = [...(this.item.system[set] || [])];
            if (bonuses[index] && bonuses[index].value !== value) {
                bonuses[index] = { ...bonuses[index], value };
                await this.item.update({ [`system.${set}`]: bonuses });
            }
        });
    }

    /** @override */
    async _onDrop(event) {
        event.preventDefault();

        // Only allow drops when unlocked
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

        const set = this._bonusSetFor(event.target);
        const bonuses = [...(this.item.system[set] || [])];

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

        const emptyIndex = bonuses.findIndex(b => b.type === "skill" && !b.skillUuid);
        if (emptyIndex >= 0) {
            bonuses[emptyIndex] = {
                ...bonuses[emptyIndex],
                skillUuid: item.uuid,
                skillName: item.name
            };
        } else {
            bonuses.push({ type: "skill", skillUuid: item.uuid, skillName: item.name, value: 0 });
        }

        await this.item.update({ [`system.${set}`]: bonuses });
    }
}
