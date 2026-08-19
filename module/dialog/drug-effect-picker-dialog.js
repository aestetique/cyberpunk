import { localize, fmtSigned } from "../utils.js";
import { tierEntriesAlpha } from "../drug-design.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * "Add Effect" sub-dialog for the Drug Design helper.
 *
 * Four tabs (Primary / Secondary / After / Cumulative), each showing
 * that tier's effects alphabetized as buttons. Clicking a button hands
 * the choice back to the caller via the constructor callback and
 * closes.
 * @extends {ApplicationV2}
 */
export class DrugEffectPickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /**
     * @param {(choice: {tier, key}|null) => void} onPick
     *        Fires with the chosen effect on click, or null on cancel.
     */
    constructor(onPick, options = {}) {
        super(options);
        this._onPick = typeof onPick === "function" ? onPick : (() => {});
        this._activeTab = "primary";
    }

    static DEFAULT_OPTIONS = {
        id: "drug-effect-picker",
        classes: ["cyberpunk", "drug-effect-picker"],
        position: { width: 320, height: "auto" },
        window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
        actions: {
            closeDialog: DrugEffectPickerDialog._onCloseDialog,
            switchTab:   DrugEffectPickerDialog._onSwitchTab,
            pickEffect:  DrugEffectPickerDialog._onPickEffect
        }
    };

    static PARTS = {
        body: { template: "systems/cyberpunk/templates/dialog/drug-effect-picker.hbs" }
    };

    get title() { return localize("DrugDesignAddEffect"); }

    static _onCloseDialog(ev)     { ev?.preventDefault?.(); this.close({ animate: false }); }
    static _onSwitchTab(ev, tgt)  { ev?.preventDefault?.(); const tab = tgt?.dataset?.tab; if (!tab) return; this._activeTab = tab; this.render(); }

    static _onPickEffect(ev, tgt) {
        ev?.preventDefault?.();
        const tier = tgt?.dataset?.tier;
        const key  = tgt?.dataset?.effectKey;
        if (!tier || !key) return;
        this._picked = true;
        this._onPick({ tier, key });
        this.close({ animate: false });
    }

    async _prepareContext(_opts) {
        const tabs = [
            { key: "primary",    label: localize("DrugDesignTierShortPrimary") },
            { key: "secondary",  label: localize("DrugDesignTierShortSecondary") },
            { key: "after",      label: localize("DrugDesignTierShortAfter") },
            { key: "cumulative", label: localize("DrugDesignTierShortCumulative") }
        ].map(t => ({ ...t, active: t.key === this._activeTab }));

        const entries = tierEntriesAlpha(this._activeTab).map(e => ({
            tier: this._activeTab,
            key:  e.key,
            labelLine: `${e.label} ${fmtSigned(e.value)}`
        }));

        return {
            title: this.title,
            tabs,
            entries
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const header = this.element.querySelector('.reload-header');
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
        }
    }

    async close(options) {
        // Emit a null choice if the user dismissed via ESC / X / drag
        // away — lets the parent dialog know the picker went home
        // empty-handed without changing state.
        if (!this._picked) this._onPick(null);
        return super.close(options);
    }
}

