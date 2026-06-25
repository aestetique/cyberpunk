import { localize } from "../utils.js";
import { isNetIcon } from "./realm.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Netrunning Realm Switcher — single-row floating panel that lets the
 * netrunner jump between their meat token and NET icon.
 * @extends {ApplicationV2}
 */
export class RealmSwitcher extends HandlebarsApplicationMixin(ApplicationV2) {

    static DEFAULT_OPTIONS = {
        id: "realm-switcher-dialog",
        classes: ["cyberpunk", "realm-switcher-dialog"],
        position: { width: 300, height: "auto" },
        window: { frame: true, positioned: true, resizable: false, minimizable: true, controls: [] },
        actions: {
            closeDialog: RealmSwitcher._onCloseDialog,
            jumpToToken: RealmSwitcher._onJumpToToken
        }
    };

    static PARTS = {
        body: { template: "systems/cyberpunk/templates/dialog/realm-switcher.hbs" }
    };

    get title() { return localize("Netrunning"); }

    static _onCloseDialog(event, _target) {
        event?.preventDefault?.();
        this.close({ animate: false });
    }

    static _onJumpToToken(event, target) {
        event?.preventDefault?.();
        if (target.classList.contains("disabled")) return;
        this._jumpToToken(target.dataset.tokenId);
        // _jumpToToken's `placeable.control` fires `controlToken` hooks
        // synchronously; our _syncSelection runs from those.
    }

    _getActor() {
        const assigned = game.user?.character;
        if (assigned) return assigned;
        if (!canvas?.scene) return null;
        const token = canvas.scene.tokens.find(t => t.actor?.testUserPermission?.(game.user, "OWNER"));
        return token?.actor ?? null;
    }

    _findMeatToken(actor) {
        if (!actor || !canvas?.scene) return null;
        return canvas.scene.tokens.find(t =>
            t.actorId === actor.id && t.getFlag("cyberpunk", "isNetIcon") !== true
        ) || null;
    }

    _findNetIcon(actor) {
        if (!actor || !canvas?.scene) return null;
        return canvas.scene.tokens.find(t =>
            t.actorId === actor.id && t.getFlag("cyberpunk", "isNetIcon") === true
        ) || null;
    }

    async _prepareContext(_options) {
        const actor = this._getActor();
        const meat = this._findMeatToken(actor);
        const net  = this._findNetIcon(actor);
        const controlledIds = new Set((canvas?.tokens?.controlled || []).map(t => t.id));

        return {
            meat: meat ? { id: meat.id, selected: controlledIds.has(meat.id) } : null,
            net:  net  ? { id: net.id,  selected: controlledIds.has(net.id)  } : null
        };
    }

    _jumpToToken(tokenId) {
        const placeable = canvas?.tokens?.get?.(tokenId);
        if (!placeable) return;
        placeable.control({ releaseOthers: true });
        const c = placeable.center;
        if (c) canvas.pan({ x: c.x, y: c.y });
    }

    /**
     * Fast path for selection changes — toggle the `.selected` class on the
     * existing buttons based on the current `canvas.tokens.controlled` set.
     * No re-render, so no race with the async render pipeline.
     */
    _syncSelection() {
        const root = this.element;
        if (!root) return;
        const controlledIds = new Set((canvas?.tokens?.controlled || []).map(t => t.id));
        root.querySelectorAll(".realm-btn").forEach(btn => {
            const tokenId = btn.dataset.tokenId;
            if (!tokenId) return;
            btn.classList.toggle("selected", controlledIds.has(tokenId));
        });
    }

    _onRender(context, options) {
        super._onRender(context, options);

        const header = this.element.querySelector(".reload-header");
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
        }

        this._syncSelection();

        if (!this._hooksBound) {
            this._hooksBound = true;
            this._onControlToken = () => this._syncSelection();
            this._onStructureChange = () => this.render();
            Hooks.on("controlToken", this._onControlToken);
            Hooks.on("createToken",  this._onStructureChange);
            Hooks.on("deleteToken",  this._onStructureChange);
            Hooks.on("canvasReady",  this._onStructureChange);
        }
    }

    async close(options = {}) {
        if (this._hooksBound) {
            Hooks.off("controlToken", this._onControlToken);
            Hooks.off("createToken",  this._onStructureChange);
            Hooks.off("deleteToken",  this._onStructureChange);
            Hooks.off("canvasReady",  this._onStructureChange);
            this._hooksBound = false;
        }
        return super.close(options);
    }
}
