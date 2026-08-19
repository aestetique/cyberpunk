/**
 * Netware actor sheet — a single-tab card for NET-architecture objects
 * (Access Point / Password / File / Control Point). Chrome mirrors the role
 * item card; no tab selector.
 *
 * Entry Region stores a RegionDocument UUID (V14+) — the centre of that
 * region is where the netrunner's NET icon spawns on jack-in. When blank,
 * the fallback in jack-in.js spawns at the AP token's own centre. Drone
 * Link stores a TokenDocument UUID (Control Point flow). All slot
 * resolution happens at trigger sites, not here.
 */

import { commitPendingEdits, localize, getFilePickerClass, getImagePopoutClass } from "../utils.js";
import { netwareActorSubtypes, attackerClasses, attackerEffects } from "../lookups.js";
import { performBlackIceStrike, performBlackIceSpeed } from "../netrun/net-attack.js";
import { attachRowMenu } from "../ui/row-context-menu.js";
import { prepareAttackerEffectTabContext, bindAttackerEffectTabListeners } from "../item/embedded-helpers.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2Base = foundry.applications.sheets.ActorSheetV2;


function loc(key) {
    return game.i18n.localize(`CYBERPUNK.${key}`);
}

/**
 * @extends {ActorSheetV2}
 */
export class CyberpunkNetwareActorSheet extends HandlebarsApplicationMixin(ActorSheetV2Base) {

    _isLocked = true;
    _isMinimized = false;
    _originalHeight = null;

    static DEFAULT_OPTIONS = {
        classes: ["cyberpunk", "sheet", "actor", "netware-actor-sheet"],
        position: { width: 500, height: 400 },
        window: {
            frame: true,
            positioned: true,
            resizable: false,
            minimizable: false,
            controls: []
        },
        form: { submitOnChange: true, closeOnSubmit: false },
        actions: {
            lockToggle:             CyberpunkNetwareActorSheet._onLockToggle,
            closeSheet:             CyberpunkNetwareActorSheet._onCloseSheet,
            copyUuid:               CyberpunkNetwareActorSheet._onCopyUuid,
            portraitClick:          CyberpunkNetwareActorSheet._onPortraitClick,
            configureToken:         CyberpunkNetwareActorSheet._onConfigureToken,
            configureSheet:         CyberpunkNetwareActorSheet._onConfigureSheet,
            blackIceAttack:         CyberpunkNetwareActorSheet._onBlackIceAttack,
            blackIceSpeed:          CyberpunkNetwareActorSheet._onBlackIceSpeed,
            toggleBlackIceCondition: CyberpunkNetwareActorSheet._onToggleBlackIceCondition
        }
    };

    static PARTS = {
        body: { template: "systems/cyberpunk/templates/actor/netware-actor-sheet.hbs" }
    };

    get actor() { return this.document; }
    get title() { return this.document.name; }
    get minimized() { return this._isMinimized; }

    async _prepareContext(options) {
        const ctx = await super._prepareContext(options);
        const sys = this.document.system;
        const subtype = sys.subtype || "accessPoint";

        ctx.actor    = this.document;
        ctx.system   = sys;
        ctx.isLocked = this._isLocked;

        ctx.isAccessPoint  = subtype === "accessPoint";
        ctx.isPassword     = subtype === "password";
        ctx.isFile         = subtype === "file";
        ctx.isAccount      = subtype === "account";
        ctx.isControlPoint = subtype === "controlPoint";
        ctx.isBlackIce     = subtype === "blackIce";
        // Per-subtype "Row 2" field flags — each non-Black-ICE subtype gets
        // exactly one. Black ICE bypasses this layer and uses its own multi-
        // row stat block instead (see template).
        ctx.showEntryRegion = ctx.isAccessPoint; // region UUID; NET icon spawns at its centre on jack-in
        ctx.showDoorLink    = ctx.isPassword;    // wall UUID unlocked on Backdoor
        // Row 1 right-column: Radius (AP), DV (other gated subtypes), or REZ
        // (Black ICE). All three share the existing slot in the template.
        ctx.showRadius = ctx.isAccessPoint;
        ctx.showDV     = ctx.isPassword || ctx.isFile || ctx.isAccount || ctx.isControlPoint;
        ctx.showRez    = ctx.isBlackIce;

        ctx.subtypeOptions = Object.entries(netwareActorSubtypes).map(([value, key]) => ({
            value,
            label: loc(key),
            selected: value === subtype
        }));
        ctx.selectedSubtypeLabel = loc(netwareActorSubtypes[subtype] ?? netwareActorSubtypes.accessPoint);

        // Black ICE attack-row options (Class + Effect) — same lookups as
        // netware Attacker programs. Effect dropdown is filtered by class
        // exactly the way the program sheet does it, so 'crashed' only
        // surfaces on anti-personnel and 'destroyed' on anti-program.
        if (ctx.isBlackIce) {
            // Condition-toggle highlight state. Reading from actor.statuses
            // means the sheet stays in sync with the token HUD and any
            // damage-pipeline transitions (REZ→0 → Disabled, Destroyed → Dead).
            ctx.isDisabled = this.document.statuses?.has?.("disabled") ?? false;
            ctx.isDead     = this.document.statuses?.has?.("dead") ?? false;

            const cls = sys.attackerClass || "antiProgram";
            ctx.attackerClassOptions = Object.entries(attackerClasses).map(([value, key]) => ({
                value,
                label: loc(key),
                selected: value === cls
            }));
            ctx.selectedAttackerClassLabel = loc(attackerClasses[cls] ?? "AttackerAntiProgram");

            // Strict filter — Crashed only Anti-Personnel, Destroyed only
            // Anti-Program. No exception for a stale saved value; the
            // change handler in _onRender resets the effect to "none" when
            // the class switch makes the current effect invalid, so we
            // never render the dropdown in a "stored value not in options"
            // half-state.
            const effect = sys.attackerEffect || "none";
            const allowEffect = (key) => {
                if (key === "crashed")   return cls === "antiPersonnel";
                if (key === "derezz")    return cls === "antiPersonnel";
                if (key === "destroyed") return cls === "antiProgram";
                return true;
            };
            ctx.attackerEffectOptions = Object.entries(attackerEffects)
                .filter(([value]) => allowEffect(value))
                .map(([value, key]) => ({
                    value,
                    label: loc(key),
                    selected: value === effect
                }));
            ctx.selectedAttackerEffectLabel = loc(attackerEffects[effect] ?? "EffectNone");

            // Custom effect gates both the Duration input and the
            // inline Effect block below the details. Always populate
            // the attacker-effect context so the render is stable
            // regardless of the current selection.
            ctx.isCustomEffect = effect === "custom";
            prepareAttackerEffectTabContext(ctx, sys.bonuses || []);
        }

        ctx.descriptionLines = (sys.description || "").split("\n");

        return ctx;
    }

    _onRender(context, options) {
        super._onRender?.(context, options);

        const root = this.element;
        if (!root) return;
        root.setAttribute("autocomplete", "off");

        const header = root.querySelector(".sheet-header");
        if (header) {
            header.addEventListener("dblclick", ev => this._onHeaderDoubleClick(ev));
            new foundry.applications.ux.Draggable.implementation(this, root, header, false);
        }

        // Black ICE: when the attacker class flips, drop the effect back
        // to "none" if it no longer fits the new class (Crashed on
        // Anti-Program, Destroyed on Anti-Personnel). Runs alongside
        // Foundry's submitOnChange class update; the two writes merge.
        const classSelect = root.querySelector('select[name="system.attackerClass"]');
        if (classSelect) {
            classSelect.addEventListener("change", async ev => {
                const newClass = ev.currentTarget.value;
                const currentEffect = this.document.system?.attackerEffect;
                const stale = (currentEffect === "crashed"   && newClass !== "antiPersonnel")
                           || (currentEffect === "destroyed" && newClass !== "antiProgram");
                if (stale) await this.document.update({ "system.attackerEffect": "none" });
            });
        }

        // Attacker-effect bonus row handlers (Custom mode). Selectors
        // scoped under the inline `.black-ice-effect-block`; when
        // Custom isn't selected the block isn't rendered and the
        // find() calls no-op.
        bindAttackerEffectTabListeners($(root), this.document, { isLocked: this._isLocked });

        // Right-click on the card body opens a context menu with the
        // netware actor's primary actions. Delegates to the same
        // data-action buttons the header/body already expose so both
        // entry paths converge on one handler set.
        this._attachCardContextMenu(root);
    }

    _attachCardContextMenu(root) {
        const actor = this.document;
        const isBlackIce = actor?.system?.subtype === "blackIce";
        const clickAction = (name) => root.querySelector(`[data-action="${name}"]`)?.click();
        const entries = [
            {
                label: localize("Attack"),
                icon:  '<i class="fas fa-crosshairs"></i>',
                visible: () => isBlackIce,
                callback: () => performBlackIceStrike(actor)
            },
            {
                label: localize("Speed"),
                icon:  '<i class="fas fa-tachometer-alt"></i>',
                visible: () => isBlackIce,
                callback: () => performBlackIceSpeed(actor)
            },
            {
                label: localize("Conditions.Disabled"),
                icon:  '<i class="fas fa-power-off"></i>',
                visible: () => isBlackIce,
                callback: () => root.querySelector('[data-condition="disabled"]')?.click()
            },
            {
                label: localize("Conditions.Dead"),
                icon:  '<i class="fas fa-skull"></i>',
                visible: () => isBlackIce,
                callback: () => root.querySelector('[data-condition="dead"]')?.click()
            },
            {
                label: localize("ConfigureToken"),
                icon:  '<i class="fas fa-user-circle"></i>',
                callback: () => clickAction("configureToken")
            },
            {
                label: localize("ConfigureSheet"),
                icon:  '<i class="fas fa-cog"></i>',
                callback: () => clickAction("configureSheet")
            },
            {
                label: localize("CopyUUID"),
                icon:  '<i class="fas fa-passport"></i>',
                callback: () => clickAction("copyUuid")
            }
        ];
        attachRowMenu(root, ".netware-actor-card", () => entries);
    }

    static async _onLockToggle(event, _target) {
        event?.preventDefault?.();
        commitPendingEdits(this.element);
        this._isLocked = !this._isLocked;
        this.render();
    }

    static _onCloseSheet(event, _target) {
        event?.preventDefault?.();
        this.close({ animate: false });
    }

    static _onCopyUuid(event, _target) {
        event?.preventDefault?.();
        game.clipboard.copyPlainText(this.document.uuid);
        ui.notifications.info(localize("CopiedUUID", { uuid: this.document.uuid }));
    }

    /**
     * Token-config button. Opens the placed token's sheet when one was
     * dropped, otherwise the actor's Prototype Token. Same path as the
     * character sheet — V14 ActorSheetV2 pattern at foundry.mjs:124011/27.
     */
    static _onConfigureToken(event, _target) {
        event?.preventDefault?.();
        if (this.document.token?.sheet) {
            this.document.token.sheet.render({ force: true });
            return;
        }
        new CONFIG.Token.prototypeSheetClass({
            prototype: this.document.prototypeToken,
            position: {
                left: Math.max(this.position.left - 560 - 10, 10),
                top: this.position.top
            }
        }).render({ force: true });
    }

    /** Sheet-config button. Lets the GM swap to a different sheet class. */
    static _onConfigureSheet(event, _target) {
        event?.preventDefault?.();
        const SheetConfig = foundry.applications.apps?.DocumentSheetConfig
                         ?? DocumentSheetConfig;
        new SheetConfig({ document: this.document }).render({ force: true });
    }

    /**
     * Black ICE Attack button. Fires the Black ICE's stored attack at the
     * currently targeted token — same target/defence/damage pipeline an
     * Attacker program uses, minus the netrunner-side concepts (NET
     * action, Interface skill, deck slot). All gating + chat-card render
     * lives in `performBlackIceStrike`.
     */
    static _onBlackIceAttack(event, _target) {
        event?.preventDefault?.();
        performBlackIceStrike(this.document);
    }

    /**
     * Black ICE Speed button. Opposed roll against a targeted netrunner
     * NET icon — Black ICE rolls SPD, netrunner defends with Interface.
     * On success the ICE's stored damage + effect land as a free hit
     * (same zap-hit Apply pipeline the Attack button uses). No NET
     * action is spent on the netrunner side.
     */
    static _onBlackIceSpeed(event, _target) {
        event?.preventDefault?.();
        performBlackIceSpeed(this.document);
    }

    /**
     * Toggle Disabled / Dead on a Black ICE actor. Plain status-effect
     * toggle (no REZ rewrite — the GM uses these for manual override
     * outside the damage pipeline). The black-ice.js updateActor watcher
     * still does its REZ-recovery thing if the GM later edits REZ; this
     * toggle is for the "I want to revive / kill the actor manually"
     * case where REZ stays put.
     */
    static async _onToggleBlackIceCondition(event, target) {
        event?.preventDefault?.();
        const condition = target?.dataset?.condition;
        if (condition !== "disabled" && condition !== "dead") return;
        const active = this.document.statuses?.has?.(condition) ?? false;
        await this.document.toggleStatusEffect(condition, { active: !active });
        this.render();
    }

    static _onPortraitClick(event, _target) {
        event?.preventDefault?.();
        if (this._isLocked) {
            new (getImagePopoutClass())({
                src: this.document.img,
                window: { title: this.document.name },
                uuid: this.document.uuid
            }).render({ force: true });
        } else {
            new (getFilePickerClass())({
                type: "image",
                current: this.document.img,
                callback: path => this.document.update({ img: path })
            }).render({ force: true });
        }
    }

    _onHeaderDoubleClick(ev) {
        if (ev.target.closest("[data-action], .lock-toggle, .header-control")) return;
        const root = this.element;
        const content = root.querySelector(".item-content");
        const card = root.querySelector(".item-card");

        if (this._isMinimized) {
            root.style.transition = "height 200ms ease";
            root.style.height = `${this._originalHeight}px`;
            setTimeout(() => {
                if (content) content.style.display = "";
                root.style.transition = "";
                root.style.minHeight = "";
                if (card) card.style.minHeight = "";
                this.setPosition({ height: this._originalHeight });
            }, 200);
            this._isMinimized = false;
        } else {
            this._originalHeight = root.offsetHeight;
            if (content) content.style.display = "none";
            root.style.minHeight = "0";
            if (card) card.style.minHeight = "0";
            root.style.transition = "height 200ms ease";
            root.style.height = "38px";
            setTimeout(() => {
                root.style.transition = "";
                this.setPosition({ height: 38 });
                root.style.height = "38px";
            }, 200);
            this._isMinimized = true;
        }
    }
}
