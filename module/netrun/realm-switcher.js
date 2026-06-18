import { localize } from "../utils.js";
import { isNetIcon } from "./realm.js";

/**
 * Netrunning Realm Switcher — single-row floating panel that lets the
 * netrunner jump between their meat token and NET icon. Each button
 * SELECTS the corresponding token (releasing whatever else was selected)
 * and pans the canvas to it.
 *
 * Why this exists: with the realm-aware vision filter, NET icons aren't
 * rendered on the meatspace canvas for anyone — including the owner —
 * because cyberspace is a different realm visually. This panel is the
 * "click to jump to my other manifestation" UI that replaces "click on
 * the invisible token in space."
 *
 * Buttons are toggleable (gray default, green when selected), mirroring
 * the gray/green styles we use across the system. State follows the
 * current canvas selection — selecting tokens via Foundry's normal
 * controls updates the panel too.
 */
export class RealmSwitcher extends Application {

    /** @override */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "realm-switcher-dialog",
            classes: ["cyberpunk", "realm-switcher-dialog"],
            template: "systems/cyberpunk/templates/dialog/realm-switcher.hbs",
            width: 300,
            height: "auto",
            popOut: true,
            minimizable: true,
            resizable: false
        });
    }

    /** @override */
    get title() {
        return localize("Netrunning");
    }

    /**
     * Resolve the actor we're switching for. Players: their assigned
     * character. GM: assigned character if set, else first owned actor
     * with a token on the active scene.
     */
    _getActor() {
        const assigned = game.user?.character;
        if (assigned) return assigned;
        if (!canvas?.scene) return null;
        const token = canvas.scene.tokens.find(t => t.actor?.testUserPermission?.(game.user, "OWNER"));
        return token?.actor ?? null;
    }

    /** First non-NET token on the active scene belonging to `actor`. */
    _findMeatToken(actor) {
        if (!actor || !canvas?.scene) return null;
        return canvas.scene.tokens.find(t =>
            t.actorId === actor.id && t.getFlag("cyberpunk", "isNetIcon") !== true
        ) || null;
    }

    /** NET icon for `actor` on the active scene, if any. */
    _findNetIcon(actor) {
        if (!actor || !canvas?.scene) return null;
        return canvas.scene.tokens.find(t =>
            t.actorId === actor.id && t.getFlag("cyberpunk", "isNetIcon") === true
        ) || null;
    }

    /** @override */
    getData() {
        const actor = this._getActor();
        const meat = this._findMeatToken(actor);
        const net  = this._findNetIcon(actor);
        const controlledIds = new Set((canvas?.tokens?.controlled || []).map(t => t.id));

        return {
            meat: meat ? { id: meat.id, selected: controlledIds.has(meat.id) } : null,
            net:  net  ? { id: net.id,  selected: controlledIds.has(net.id)  } : null
        };
    }

    /** Select + center on a token by id. No-op if it's gone. */
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
     * No re-render, so no race with Foundry's async render pipeline, and the
     * "release others → control new" double `controlToken` event handles
     * cleanly because we just read live state each time.
     */
    _syncSelection() {
        if (!this.element?.length) return;
        const controlledIds = new Set((canvas?.tokens?.controlled || []).map(t => t.id));
        this.element.find(".realm-btn").each(function () {
            const tokenId = this.dataset.tokenId;
            if (!tokenId) return;
            this.classList.toggle("selected", controlledIds.has(tokenId));
        });
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Draggable header (shared dialog pattern)
        const header = html.find(".reload-header")[0];
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, html, header, false);
        }
        html.find(".header-control.close").click(() => this.close());

        html.find(".realm-btn").click(ev => {
            if (ev.currentTarget.classList.contains("disabled")) return;
            this._jumpToToken(ev.currentTarget.dataset.tokenId);
            // _jumpToToken's `placeable.control` fires `controlToken` hooks
            // synchronously; our _syncSelection runs from those and the
            // green/gray will already be correct by the time this returns.
        });

        // Initial state sync on render.
        this._syncSelection();

        // Live updates. Selection changes use the fast class-toggle path;
        // token create / delete change the DOM structure (a button enabling
        // or vanishing), so those need a full re-render.
        if (!this._hooksBound) {
            this._hooksBound = true;
            this._onControlToken = () => this._syncSelection();
            this._onStructureChange = () => this.render(false);
            Hooks.on("controlToken", this._onControlToken);
            Hooks.on("createToken",  this._onStructureChange);
            Hooks.on("deleteToken",  this._onStructureChange);
            Hooks.on("canvasReady",  this._onStructureChange);
        }
    }

    /** @override */
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
