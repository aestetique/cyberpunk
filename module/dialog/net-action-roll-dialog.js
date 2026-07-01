import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Roll-modifier dialog for NET Actions and Repair Requests.
 *
 * Mirrors `SkillRollDialog` (chrome, conditions, luck) but drops the
 * Difficulty input — NET actions are either opposed (Cloak vs Detect),
 * fixed-DV (Backdoor / Control / Eye-Dee read DV off the target NET object),
 * un-rolled (Scanner — distance, not pass/fail), or DV-fixed (Repair = 15).
 * In every case the DV is already determined at call time; the dialog only
 * collects the player-chosen modifiers that layer on top.
 *
 * Promise-style usage:
 *
 *   const result = await NetActionRollDialog.prompt(actor, { title: "Scanner" });
 *   if (!result) return;                            // user closed without rolling
 *   if (!await spendNetAction(actor, "scanner")) return;
 *   await commitLuckSpend(actor, result.luckToSpend);
 *   // ...continue with the existing roll, adding result.extraMod into parts
 *
 * The dialog deliberately does NOT commit Luck itself — callers gate on
 * action availability (spendNetAction) AFTER the dialog returns; committing
 * Luck inside would burn it when the action is then rejected for no slots.
 * `commitLuckSpend()` is the one-liner the caller uses after all gates pass.
 */
export class NetActionRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /**
     * One-shot prompt — opens the dialog and resolves to `{ extraMod, luckToSpend, conditions }`
     * on Roll, or `null` if the user closed without rolling.
     */
    static prompt(actor, options = {}) {
        return new Promise(resolve => {
            const dlg = new this(actor, options, resolve);
            dlg.render({ force: true });
        });
    }

    constructor(actor, options, resolve) {
        super({});
        this.actor = actor;
        this._dialogTitle = options.title || localize("Roll");
        this._resolve = resolve;
        this._resolved = false;
        this._conditions = { prepared: false, distracted: false };
        this._luckToSpend = 0;
        this._availableLuck = actor.system.stats.luck?.effective
                            ?? actor.system.stats.luck?.total
                            ?? 0;
    }

    static DEFAULT_OPTIONS = {
        id: "net-action-roll-dialog",
        classes: ["cyberpunk", "skill-roll-dialog"],   // reuse skill-roll chrome
        position: { width: 300, height: "auto" },
        window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
        actions: {
            closeDialog:     NetActionRollDialog._onCloseDialog,
            toggleCondition: NetActionRollDialog._onToggleCondition,
            luckPlus:        NetActionRollDialog._onLuckPlus,
            luckMinus:       NetActionRollDialog._onLuckMinus,
            roll:            NetActionRollDialog._onRoll
        }
    };

    static PARTS = {
        body: { template: "systems/cyberpunk/templates/dialog/net-action-roll.hbs" }
    };

    get title() { return this._dialogTitle; }

    static _onCloseDialog(event, _target) {
        event?.preventDefault?.();
        this.close({ animate: false });
    }

    static _onToggleCondition(event, target) {
        event?.preventDefault?.();
        const condition = target?.dataset?.condition;
        if (!condition) return;
        this._conditions[condition] = !this._conditions[condition];
        target.classList.toggle("selected", this._conditions[condition]);
    }

    static _onLuckPlus(event, _target) {
        event?.preventDefault?.();
        if (this._luckToSpend < this._availableLuck) {
            this._luckToSpend++;
            this._updateLuckDisplay();
        }
    }

    static _onLuckMinus(event, _target) {
        event?.preventDefault?.();
        if (this._luckToSpend > 0) {
            this._luckToSpend--;
            this._updateLuckDisplay();
        }
    }

    static _onRoll(event, _target) {
        event?.preventDefault?.();
        this._resolveWith(this._buildResult());
        this.close({ animate: false });
    }

    /**
     * Foundry calls close() on the X button AND after a successful roll.
     * Either way, if we haven't resolved yet, treat it as a cancel.
     */
    async close(...args) {
        if (!this._resolved) this._resolveWith(null);
        return super.close(...args);
    }

    _resolveWith(value) {
        if (this._resolved) return;
        this._resolved = true;
        this._resolve(value);
    }

    _buildResult() {
        const conditionMod = (this._conditions.prepared   ?  2 : 0)
                           + (this._conditions.distracted ? -2 : 0);
        return {
            conditions: { ...this._conditions },
            luckToSpend: this._luckToSpend,
            extraMod: conditionMod + this._luckToSpend
        };
    }

    async _prepareContext(_options) {
        return {
            title: this._dialogTitle,
            conditions: this._conditions,
            luckToSpend: this._luckToSpend,
            availableLuck: this._availableLuck,
            canIncreaseLuck: this._luckToSpend < this._availableLuck,
            canDecreaseLuck: this._luckToSpend > 0,
            hasAnyLuck: this._availableLuck > 0
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const header = this.element.querySelector(".reload-header");
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
        }
    }

    _updateLuckDisplay() {
        const luckVal = this.element.querySelector(".luck-value");
        if (luckVal) luckVal.textContent = this._luckToSpend;
        const minusDisabled = this._luckToSpend <= 0;
        const plusDisabled  = this._luckToSpend >= this._availableLuck;
        const minusBtn = this.element.querySelector(".luck-minus-btn");
        const plusBtn  = this.element.querySelector(".luck-plus-btn");
        minusBtn?.classList.toggle("disabled", minusDisabled);
        plusBtn?.classList.toggle("disabled", plusDisabled);
        minusBtn?.querySelector("img")?.setAttribute("src",
            `systems/cyberpunk/img/chat/${minusDisabled ? "minus-disabled" : "minus"}.svg`);
        plusBtn?.querySelector("img")?.setAttribute("src",
            `systems/cyberpunk/img/chat/${plusDisabled ? "plus-disabled" : "plus"}.svg`);
    }
}

/**
 * Commit a Luck spend on `actor`. Stamps `system.stats.luck.spent` upward
 * and (re)starts the recovery clock via `spentAt`. No-op for amount <= 0.
 *
 * Pulled out as a free function so NET-action callers commit Luck after
 * their own action / target / availability gates pass — burning Luck on a
 * roll that's then refused (e.g. no NET actions left) would be a bug.
 */
export async function commitLuckSpend(actor, amount) {
    if (!actor || !amount || amount <= 0) return;
    const luck = actor.system?.stats?.luck;
    if (!luck) return;
    const currentSpent = Number(luck.spent) || 0;
    const currentSpentAt = luck.spentAt;
    await actor.update({
        "system.stats.luck.spent": currentSpent + amount,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
    });
}
