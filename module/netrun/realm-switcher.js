import { localize } from "../utils.js";
import { runCyberdeckAction } from "../dialog/cyberdeck-action-dialog.js";
import { performAttackerStrike } from "./net-attack.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Netrunning Realm Switcher — floating command panel for netrunners.
 *
 * Sections top-to-bottom:
 *   - Realm row      : jump between meat token and NET icon.
 *   - Menu           : state-aware cyberdeck actions (Jack In/Scanner when
 *                      not jacked-in; Jack Out + Cloak/Slide/Speed/Control/
 *                      Eye-Dee/Backdoor/Zap when jacked in). Buttons that
 *                      don't apply to the current target dim to disabled.
 *   - Target         : mirrors `game.user.targets` — only NET-side tokens
 *                      count. Empty placeholder when nothing valid targeted.
 *   - Programs       : only shown when a target is set and the netrunner
 *                      has active Attacker programs on the equipped deck
 *                      whose class validly hits the target's kind.
 *
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

    /**
     * Pick the deck to drive Menu / Programs off. Preference: equipped
     * (the one they're jacked in via), else any non-inoperable cyberdeck,
     * else null. The "not jacked in" Menu offers Jack In / Scanner — both
     * only meaningful with SOME deck available.
     */
    _getActiveDeck(actor) {
        if (!actor) return null;
        const decks = actor.items.filter(i =>
            i.type === "netware" && i.system?.netwareType === "cyberdeck"
        );
        return decks.find(d => d.system?.equipped)
            ?? decks.find(d => d.system?.programState !== "inoperable")
            ?? null;
    }

    /**
     * Read Foundry's targeting into a NET-side target descriptor, or null.
     * Off-scene / multi-target / non-NET tokens all resolve to null (the
     * panel treats "no valid target" the same as "no target").
     */
    _getValidTarget() {
        const targets = Array.from(game.user?.targets ?? []);
        if (targets.length !== 1) return null;
        const token = targets[0].document ?? targets[0];
        const actor = token.actor;
        if (!actor) return null;

        const isNetIcon  = token.getFlag?.("cyberpunk", "isNetIcon") === true
                       && actor.type === "character";
        const isNetActor = actor.type === "netware";
        if (!isNetIcon && !isNetActor) return null;

        // Kind = the string the action gate filters on.
        //   netIcon        = another netrunner's NET icon
        //   accessPoint    = AP netware actor
        //   password / file / controlPoint / blackIce = other netware subtypes
        const kind = isNetIcon ? "netIcon" : (actor.system?.subtype || "");
        return {
            id:   token.id,
            name: token.name,
            img:  token.texture?.src ?? actor.img ?? "",
            kind
        };
    }

    /**
     * Build the Menu button list for the current state. Each entry:
     *   { key, label, disabled }
     * `disabled` fires only when a target IS set AND the action's target
     * requirement doesn't match — matches the "click luck on roll dialog
     * for disabled styling" cue.
     */
    _getMenuActions(actor, deck, jackedIn, target) {
        if (!actor || !deck) return [];

        const jackedInList = [
            { key: "cyberdeckJackOut",  label: localize("JackOut"),  needs: null },
            { key: "cyberdeckCloak",    label: localize("Cloak"),    needs: null },
            { key: "cyberdeckSlide",    label: localize("Slide"),    needs: ["blackIce"] },
            { key: "cyberdeckSpeed",    label: localize("Speed"),    needs: ["blackIce"] },
            { key: "cyberdeckControl",  label: localize("Control"),  needs: ["controlPoint"] },
            { key: "cyberdeckEyeDee",   label: localize("EyeDee"),   needs: ["file"] },
            { key: "cyberdeckBackdoor", label: localize("Backdoor"), needs: ["password"] },
            { key: "cyberdeckZap",      label: localize("Zap"),      needs: ["netIcon", "blackIce"] }
        ];
        const notJackedList = [
            { key: "cyberdeckJackIn",   label: localize("JackIn"),   needs: null },
            { key: "cyberdeckScanner",  label: localize("Scanner"),  needs: null }
        ];
        const src = jackedIn ? jackedInList : notJackedList;
        return src.map(a => {
            const disabled = !!(target && a.needs && !a.needs.includes(target.kind));
            return { key: a.key, label: a.label, disabled };
        });
    }

    /**
     * Attackers slotted on the equipped deck whose class validly hits
     * the current target. Sorted by name for stable UI. Empty until a
     * target is set.
     *
     * Attacker programs never toggle to "active" — they're fire-on-
     * demand, staying at the schema default "inactive" until fired.
     * We filter on "not derezzed AND not destroyed" instead, which is
     * the actual usability window (same gate `performAttackerStrike`
     * uses via AttackerProgramOffline).
     *
     * Class-vs-target rules match the shared attacker-target gate in
     * net-attack.js: Anti-Personnel hits netrunner NET icons only;
     * Anti-Program hits netrunner NET icons OR Black ICE.
     */
    _getValidPrograms(actor, deck, target) {
        if (!deck || !target) return [];
        const validClasses = {
            netIcon:  ["antiPersonnel", "antiProgram"],
            blackIce: ["antiProgram"]
        };
        const allowed = validClasses[target.kind];
        if (!allowed) return [];

        return actor.items
            .filter(i =>
                i.type === "netware"
                && i.system?.netwareType === "program"
                && i.system?.programSubtype === "attacker"
                && i.system?.programState !== "derezzed"
                && i.system?.programState !== "destroyed"
                && i.getFlag?.("cyberpunk", "attachedTo") === deck.id
                && allowed.includes(i.system?.attackerClass)
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(p => ({ id: p.id, name: p.name, img: p.img }));
    }

    async _prepareContext(_options) {
        const actor = this._getActor();
        const meat  = this._findMeatToken(actor);
        const net   = this._findNetIcon(actor);
        const jackedIn = actor?.statuses?.has?.("jacked-in") ?? false;
        const deck  = this._getActiveDeck(actor);
        const target = this._getValidTarget();
        const menuActions = this._getMenuActions(actor, deck, jackedIn, target);
        const programs = jackedIn ? this._getValidPrograms(actor, deck, target) : [];
        const controlledIds = new Set((canvas?.tokens?.controlled || []).map(t => t.id));

        return {
            meat: meat ? { id: meat.id, selected: controlledIds.has(meat.id) } : null,
            net:  net  ? { id: net.id,  selected: controlledIds.has(net.id)  } : null,
            menuActions,
            hasMenu:     menuActions.length > 0,
            target,
            hasTarget:   !!target,
            programs,
            hasPrograms: programs.length > 0,
            menuLabel:            localize("Menu"),
            targetLabel:          localize("Target"),
            programsLabel:        localize("Programs"),
            emptyTargetText:      localize("ToolboxTargetPlaceholder")
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
     * Fast path for meat/NET realm-button selection — toggle `.selected`
     * without re-rendering. Menu / Target / Programs sections still need
     * a full render on their reactive events (jack-in state, target,
     * program list) since their contents change wholesale.
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
        this._bindMenuAndProgramClicks();

        if (!this._hooksBound) {
            this._hooksBound = true;
            this._onControlToken    = () => this._syncSelection();
            this._onStructureChange = () => this.render();
            // Target change → re-render for Target + Programs sections
            // and for the Menu disabled-state gate.
            this._onTargetToken     = () => this.render();
            // Jack-in status flips arrive as ActiveEffect events on the actor;
            // updateActor also fires for equip changes on the deck (system.equipped),
            // so a single updateActor listener covers both — plus the ActiveEffect
            // side which is important for the jack-out cascade.
            this._onActorUpdate = (actor) => {
                if (actor.id === this._getActor()?.id) this.render();
            };
            this._onEffectChange = (effect) => {
                if (effect.parent?.documentName !== "Actor") return;
                if (effect.parent.id !== this._getActor()?.id) return;
                if (effect.statuses?.has?.("jacked-in")) this.render();
            };
            this._onItemChange = (item) => {
                if (item.parent?.documentName !== "Actor") return;
                if (item.parent.id !== this._getActor()?.id) return;
                if (item.type !== "netware") return;
                this.render();
            };

            Hooks.on("controlToken",       this._onControlToken);
            Hooks.on("createToken",        this._onStructureChange);
            Hooks.on("deleteToken",        this._onStructureChange);
            Hooks.on("canvasReady",        this._onStructureChange);
            Hooks.on("targetToken",        this._onTargetToken);
            Hooks.on("updateActor",        this._onActorUpdate);
            Hooks.on("createActiveEffect", this._onEffectChange);
            Hooks.on("deleteActiveEffect", this._onEffectChange);
            Hooks.on("createItem",         this._onItemChange);
            Hooks.on("updateItem",         this._onItemChange);
            Hooks.on("deleteItem",         this._onItemChange);
        }
    }

    /**
     * Menu action buttons dispatch through the shared runCyberdeckAction
     * helper so every rule / roll / chat card fires identically to the
     * cyberdeck action dialog. Program buttons run performAttackerStrike
     * against the currently focused program (target validation happens
     * inside the strike helper).
     */
    _bindMenuAndProgramClicks() {
        const root = this.element;
        if (!root) return;

        root.querySelectorAll(".realm-menu-btn").forEach(btn => {
            btn.addEventListener("click", async ev => {
                ev.preventDefault();
                if (btn.classList.contains("disabled") || btn.disabled) return;
                const key = btn.dataset.actionKey;
                const actor = this._getActor();
                const deck  = this._getActiveDeck(actor);
                if (!actor || !deck || !key) return;
                await runCyberdeckAction(actor, deck, key);
            });
        });

        root.querySelectorAll(".realm-program-btn").forEach(btn => {
            btn.addEventListener("click", async ev => {
                ev.preventDefault();
                const id = btn.dataset.itemId;
                const actor = this._getActor();
                const program = id ? actor?.items.get(id) : null;
                if (!actor || !program) return;
                await performAttackerStrike(actor, program);
            });
        });
    }

    async close(options = {}) {
        if (this._hooksBound) {
            Hooks.off("controlToken",       this._onControlToken);
            Hooks.off("createToken",        this._onStructureChange);
            Hooks.off("deleteToken",        this._onStructureChange);
            Hooks.off("canvasReady",        this._onStructureChange);
            Hooks.off("targetToken",        this._onTargetToken);
            Hooks.off("updateActor",        this._onActorUpdate);
            Hooks.off("createActiveEffect", this._onEffectChange);
            Hooks.off("deleteActiveEffect", this._onEffectChange);
            Hooks.off("createItem",         this._onItemChange);
            Hooks.off("updateItem",         this._onItemChange);
            Hooks.off("deleteItem",         this._onItemChange);
            this._hooksBound = false;
        }
        return super.close(options);
    }
}
