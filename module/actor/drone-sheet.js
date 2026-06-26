import { localize, toTitleCase, bindHoverTooltips, commitPendingEdits, buildStatButtons } from "../utils.js";
import { SkillRollDialog } from "../dialog/skill-roll-dialog.js";
import { buildWeaponsList, buildOrdnanceList, buildAmmoList, buildDroneSkillsList, buildCoverToggles } from "./gear-data.js";
import { bindWeaponAndOrdnanceHandlers } from "./gear-handlers.js";
import { DRONE_CONDITION_TOGGLE_ROW } from "../conditions.js";
import { CreateItemDialog } from "../dialog/create-item-dialog.js";
import { shouldTransfer, transferItem } from "./item-transfer.js";

/**
 * Static zone metadata: display name, icon, and which shapes show this zone.
 * The visible-order matches the anatomical top-to-bottom layout the user described
 * (Turret → Manipulators → Chassis → Locomotion).
 */
const ZONE_META = {
  head:  { displayName: "Turret",              icon: "drone-head.svg",  visibleIn: ["6zones", "4zones", "2zones"] },
  rArm:  { displayName: "Right Manipulator",   icon: "drone-arm.svg",   visibleIn: ["6zones", "4zones"] },
  lArm:  { displayName: "Left Manipulator",    icon: "drone-arm.svg",   visibleIn: ["6zones", "4zones"] },
  torso: { displayName: "Chassis",             icon: "drone-torso.svg", visibleIn: ["6zones", "4zones", "2zones", "1zone"] },
  rLeg:  { displayName: "Right Locomotion",    icon: "drone-leg.svg",   visibleIn: ["6zones"] },
  lLeg:  { displayName: "Left Locomotion",     icon: "drone-leg.svg",   visibleIn: ["6zones"] }
};

/** Zone-key render order on the sheet: Chassis first, Turret second, then limbs (Left before Right). */
const ZONE_ORDER = ["torso", "head", "lArm", "rArm", "lLeg", "rLeg"];

/** Format a hit-location range as "Hit on X" or "Hit on X-Y". */
function formatHitRange(loc) {
  if (!loc) return "";
  const [start, end] = loc.location || [];
  if (start == null) return "";
  if (end == null || end === start) return `Hit on ${start}`;
  return `Hit on ${start}-${end === 10 ? "10" : end}`;
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const ActorSheetV2Base = foundry.applications.sheets.ActorSheetV2;

/**
 * Drone Actor Sheet — slim layout with 5 attributes (INT/REF/TECH/MA/LUCK)
 * and 5 info fields (WALK/RUN/LEAP/WEIGHT/PRICE). Reuses the character-sheet
 * CSS classes so the visual style matches; no tabs, no inventory surfaces yet.
 *
 * @extends {ActorSheetV2}
 */
export class CyberpunkDroneSheet extends HandlebarsApplicationMixin(ActorSheetV2Base) {

  /** @type {boolean} */
  _isLocked = true;
  _isMinimized = false;

  /** Per-actor remembered sheet heights so a re-render restores the user's resized height. */
  static _sheetHeights = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["cyberpunk", "sheet", "actor", "drone-sheet"],
    position: { width: 670, height: 360 },
    window: {
      frame: true,
      positioned: true,
      resizable: true,
      minimizable: true,
      controls: []
    },
    form: { submitOnChange: true, closeOnSubmit: false },
    dragDrop: [{ dragSelector: ".gear-row[data-item-id]", dropSelector: null }],
    actions: {
      lockToggle:     CyberpunkDroneSheet._onLockToggle,
      closeSheet:     CyberpunkDroneSheet._onCloseSheet,
      copyUuid:       CyberpunkDroneSheet._onCopyUuid,
      configureSheet: CyberpunkDroneSheet._onConfigureSheet,
      configureToken: CyberpunkDroneSheet._onConfigureToken
    }
  };

  static PARTS = {
    body: {
      template: "systems/cyberpunk/templates/actor/drone-sheet.hbs",
      scrollable: [".gear-container"]
    }
  };

  /** Convenience getter (V2 stores the document on `document`). */
  get actor() { return this.document; }
  get title() { return this.document.name; }
  get minimized() { return this._isMinimized; }

  /** Override V2's hardcoded ".draggable" selector to our gear rows. */
  get _dragDrop() {
    if (!this.__customDragDrop) {
      this.__customDragDrop = new foundry.applications.ux.DragDrop.implementation({
        dragSelector: ".gear-row[data-item-id]",
        permissions: {
          dragstart: this._canDragStart.bind(this),
          drop:      this._canDragDrop.bind(this)
        },
        callbacks: {
          dragstart: this._onDragStart.bind(this),
          dragover:  this._onDragOver.bind(this),
          drop:      this._onDrop.bind(this)
        }
      });
    }
    return this.__customDragDrop;
  }

  /** Static action handlers */
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
    ui.notifications.info(`Copied UUID: ${this.document.uuid}`);
  }

  static _onConfigureSheet(event, _target) {
    event?.preventDefault?.();
    const SheetConfig = foundry.applications.apps?.DocumentSheetConfig ?? DocumentSheetConfig;
    new SheetConfig({ document: this.document }).render({ force: true });
  }

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

  /** Toggle the lock state and re-render */
  toggleLock() {
    commitPendingEdits(this.element);
    this._isLocked = !this._isLocked;
    this.render();
  }

  /** @override — remember user-resized height for next open */
  setPosition(position = {}) {
    if (position.height) {
      CyberpunkDroneSheet._sheetHeights.set(this.actor.id, position.height);
    }
    return super.setPosition(position);
  }

  /** No-op shim — V14 Draggable.resizeMouseUp still calls this.app._onResize. */
  _onResize(_event) {}

  /** @override — restore remembered height on first render */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (options.isFirstRender) {
      const rememberedHeight = CyberpunkDroneSheet._sheetHeights.get(this.actor.id);
      if (rememberedHeight) {
        options.position = { ...(options.position ?? {}), height: rememberedHeight };
      }
    }
  }

  /** Custom minimize matching character-sheet pattern. */
  async minimize() {
    if (this._isMinimized || !this.rendered) return;
    const root = this.element;
    if (!root) return;
    const sheetFrame = root.querySelector(".sheet-frame");
    const characterSheet = root.querySelector(".character-sheet");
    const sheetContent = root.querySelector(".sheet-content");
    const sheetSections = root.querySelector(".sheet-sections");
    const sheetResize = root.querySelector(".sheet-resize");
    const addItemFab = root.querySelector(".add-item-fab");

    this._originalWidth = sheetFrame?.offsetWidth ?? this.position.width;
    this._originalHeight = sheetFrame?.offsetHeight ?? this.position.height;
    this._originalFoundryWidth = this.position.width;
    this._originalFoundryHeight = this.position.height;

    if (sheetContent) sheetContent.style.display = "none";
    if (sheetSections) sheetSections.style.display = "none";
    if (sheetResize) sheetResize.style.display = "none";
    if (addItemFab) addItemFab.style.display = "none";
    if (sheetFrame) sheetFrame.style.minHeight = "0";
    if (characterSheet) characterSheet.style.minHeight = "0";
    root.style.minHeight = "0";

    const minWidth = 400;
    if (sheetFrame) {
      sheetFrame.style.transition = "width 250ms ease, height 250ms ease";
      sheetFrame.style.width = `${minWidth}px`;
      sheetFrame.style.height = "46px";
    }
    root.style.transition = "width 250ms ease, height 250ms ease";
    root.style.width = `${minWidth}px`;
    root.style.height = "46px";

    await new Promise(resolve => setTimeout(resolve, 250));

    if (characterSheet) {
      characterSheet.style.width = `${minWidth}px`;
      characterSheet.style.minHeight = "46px";
    }
    this.setPosition({ width: minWidth, height: 46 });
    if (sheetFrame) sheetFrame.style.transition = "";
    root.style.transition = "";
    this._isMinimized = true;
  }

  /** Custom maximize matching character-sheet pattern. */
  async maximize() {
    if (!this._isMinimized) return;
    const root = this.element;
    if (!root) return;
    const sheetFrame = root.querySelector(".sheet-frame");
    const characterSheet = root.querySelector(".character-sheet");
    const sheetContent = root.querySelector(".sheet-content");
    const sheetSections = root.querySelector(".sheet-sections");
    const sheetResize = root.querySelector(".sheet-resize");
    const addItemFab = root.querySelector(".add-item-fab");

    if (sheetFrame) {
      sheetFrame.style.transition = "width 250ms ease, height 250ms ease";
      sheetFrame.style.width = `${this._originalWidth}px`;
      sheetFrame.style.height = `${this._originalHeight}px`;
    }
    root.style.transition = "width 250ms ease, height 250ms ease";
    root.style.width = `${this._originalFoundryWidth}px`;
    root.style.height = `${this._originalFoundryHeight}px`;

    if (characterSheet) {
      characterSheet.style.width = "";
      characterSheet.style.minHeight = "";
    }

    await new Promise(resolve => setTimeout(resolve, 250));

    if (sheetFrame) {
      sheetFrame.style.transition = "";
      sheetFrame.style.width = "";
      sheetFrame.style.height = "";
      sheetFrame.style.minHeight = "";
    }
    root.style.transition = "";
    root.style.width = "";
    root.style.height = "";
    root.style.minHeight = "";
    if (sheetContent) sheetContent.style.display = "";
    if (sheetSections) sheetSections.style.display = "";
    if (sheetResize) sheetResize.style.display = "";
    if (addItemFab) addItemFab.style.display = "";
    this.setPosition({
      width: this._originalFoundryWidth,
      height: this._originalFoundryHeight
    });
    this._isMinimized = false;
  }

  /** @override */
  async _prepareContext(options) {
    const sheetData = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;

    sheetData.actor = actor;
    sheetData.editable = this.isEditable;
    sheetData.cssClass = this.isEditable ? "editable" : "locked";
    sheetData.system = system;
    sheetData.isLocked = this._isLocked;

    const stats = system.stats || {};
    const ma = stats.ma || {};
    const info = system.info || {};

    // ----- Shape dropdown -----
    const shapeChoices = [
      { value: "6zones", label: "6 Hit Locations" },
      { value: "4zones", label: "4 Hit Locations" },
      { value: "2zones", label: "2 Hit Locations" },
      { value: "1zone",  label: "1 Hit Location"  }
    ];
    const currentShape = system.shape || "6zones";
    sheetData.shapeOptions = shapeChoices.map(c => ({ ...c, selected: c.value === currentShape }));
    sheetData.shapeLabel = shapeChoices.find(c => c.value === currentShape)?.label || "6 Hit Locations";

    // ----- Stat buttons (6) -----

    const statFlavors = {
      int:  "Sensor processing, awareness, pattern recognition.",
      ref:  "Servo response speed and combat initiative.",
      tech: "Aptitude with tools and machinery.",
      bt:   "Chassis sturdiness. Determines carrying capacity and Body Type Modifier.",
      ma:   "Locomotion speed. Determines walk, run, and leap distances.",
      luck: "How the universe smiles upon this drone. Spend Luck to adjust important die rolls."
    };

    const buildStatCalc = (key) => {
      const s = stats[key];
      if (!s) return "";
      const base = s.base ?? 0;
      const tempMod = s.tempMod || 0;
      const parts = [`Base ${base}`];
      if (tempMod !== 0) parts.push(`Gear ${tempMod > 0 ? "+" : ""}${tempMod}`);
      if (key === "luck" && (s.spent || 0) > 0) parts.push(`Spent −${s.spent}`);
      const total = key === "luck" ? (s.effective ?? s.total ?? base) : (s.total ?? base);
      let calc = parts.length > 1 ? `${parts.join(" ")} = ${total}` : `Base ${base}`;
      if (key === "ma") calc += ` | Run ${s.run ?? 0} | Leap ${s.leap ?? 0}`;
      if (key === "bt") calc += ` | Carry ${s.carry ?? 0}kg | Lift ${s.lift ?? 0}kg | BTM ${s.modifier ?? 0}`;
      return calc;
    };

    const statTokenPaths = {
      int:  "@stats.int.total",
      ref:  "@stats.ref.total",
      tech: "@stats.tech.total",
      bt:   "@stats.bt.total",
      ma:   "@stats.ma.total",
      luck: "@stats.luck.effective"
    };

    sheetData.statButtons = buildStatButtons(stats, ["int", "ref", "tech", "bt", "ma", "luck"]);
    for (const btn of sheetData.statButtons) {
      btn.flavor = statFlavors[btn.key] || "";
      btn.calc = buildStatCalc(btn.key);
      btn.tokenPath = statTokenPaths[btn.key] || "";
    }

    // ----- Info blocks (6) -----

    const walk = ma.total ?? 0;
    const run = ma.run ?? 0;
    const leap = ma.leap ?? 0;
    const bt = stats.bt || {};
    const carry = bt.carry ?? 0;
    const weight = info.weight ?? 50;
    const price = info.price ?? 1000;

    // ----- Structure zones (filtered by shape, in anatomical render order) -----
    const shape = system.shape || "6zones";
    const zones = system.zones || {};
    const hitLocs = system.hitLocations || {};
    sheetData.structureZones = ZONE_ORDER
      .filter(key => ZONE_META[key].visibleIn.includes(shape))
      .map(key => {
        const z = zones[key] || {};
        const meta = ZONE_META[key];
        const autoDisabled = !!z.autoDisabled;
        const manuallyDisabled = !!z.manuallyDisabled;
        const isDisabled = autoDisabled || manuallyDisabled;
        // Manual takes priority over auto in the visual: clicking a broken zone flips
        // it into the "off" badge state. With manual cleared again (clicking off),
        // the underlying SDP either reveals a still-broken state or returns to active.
        let badgeFile;
        if (manuallyDisabled) badgeFile = "badge-off.svg";
        else if (autoDisabled) badgeFile = "badge-off-broken.svg";
        else badgeFile = "badge-on.svg";
        return {
          key,
          displayName: meta.displayName,
          icon: meta.icon,
          hitRangeText: formatHitRange(hitLocs[key]),
          sp: {
            current: z.sp?.current ?? 0,
            max: z.sp?.max ?? 0,
            ablation: z.sp?.ablation ?? 0
          },
          sdp: {
            current: z.sdp?.current ?? 0,
            max: z.sdp?.max ?? 0,
            disablesAt: z.sdp?.disablesAt ?? 0
          },
          autoDisabled,
          manuallyDisabled,
          isDisabled,
          badgeFile
        };
      });

    sheetData.infoBlocks = [
      {
        key: "walk", label: "Walk", displayValue: `${walk} m`, editable: false,
        flavor: "Base walking speed per combat turn.",
        calc: `MA ${walk} × 1 = ${walk} m`,
        tokenPath: "@stats.ma.total"
      },
      {
        key: "run", label: "Run", displayValue: `${run} m`, editable: false,
        flavor: "Maximum running speed per combat turn.",
        calc: `MA ${walk} × 3 = ${run} m`,
        tokenPath: "@stats.ma.run"
      },
      {
        key: "leap", label: "Leap", displayValue: `${leap} m`, editable: false,
        flavor: "Maximum standing leap distance.",
        calc: `Run ${run} ÷ 4 = ${leap} m`,
        tokenPath: "@stats.ma.leap"
      },
      {
        key: "carry", label: "Carry", displayValue: `${carry} kg`, editable: false,
        flavor: "Maximum weight that can be carried without penalty.",
        calc: `BT ${bt.total ?? 0} × 10 = ${carry} kg`,
        tokenPath: "@stats.bt.carry"
      },
      {
        key: "weight", label: "Weight", displayValue: `${weight} kg`,
        rawValue: weight, path: "system.info.weight", editable: true,
        flavor: "Drone's mass.",
        tokenPath: "@info.weight"
      },
      {
        key: "price", label: "Price", displayValue: `${price} eb`,
        rawValue: price, path: "system.info.price", editable: true,
        flavor: "Drone's purchase price in eurodollars.",
        tokenPath: "@info.price"
      }
    ];

    // ----- Weapons, Ordnance & Ammo (shared with character sheet) -----
    sheetData.weapons = buildWeaponsList(actor);
    sheetData.ordnanceItems = buildOrdnanceList(actor);
    sheetData.ammoItems = buildAmmoList(actor);
    sheetData.hasWeaponsOrAmmo = sheetData.weapons.length > 0 || sheetData.ammoItems.length > 0;
    sheetData.isUnlocked = !this._isLocked;

    // ----- Cover -----
    sheetData.coverToggles = buildCoverToggles(actor);

    // ----- Conditions (single-row drone subset) -----
    sheetData.conditionToggleRows = [
      DRONE_CONDITION_TOGGLE_ROW.map(c => ({ ...c, active: actor.statuses.has(c.id) }))
    ];

    // ----- Skills (drone-specific stripped layout) -----
    const droneSkills = buildDroneSkillsList(actor);
    const half = Math.ceil(droneSkills.length / 2);
    sheetData.skillsLeft = droneSkills.slice(0, half);
    sheetData.skillsRight = droneSkills.slice(half);
    sheetData.hasSkills = droneSkills.length > 0;

    return sheetData;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // Shared weapons/ordnance gear-row handlers
    bindWeaponAndOrdnanceHandlers(html, this);

    // Hover tooltips (follow cursor)
    bindHoverTooltips(html, '.shape-display[data-flavor], .stat-btn, .info-block[data-flavor], .cover-toggle[data-flavor], .cond-toggle[data-flavor], .drone-skill-row[data-flavor]');

    // Add Item FAB — restricted to weapon / ordnance / ammo / skill on drones.
    html.find('.add-item-fab').click(ev => {
      ev.preventDefault();
      new CreateItemDialog(this.actor, {
        allowedTypes: ["weapon", "skill"]
      }).render(true);
    });

    // Portrait click — locked: full-screen popup; unlocked: FilePicker to change image.
    html.find(".portrait-frame").click(ev => {
      ev.preventDefault();
      if (this._isLocked) {
        new foundry.applications.apps.ImagePopout({
          src: this.actor.img,
          window: { title: this.actor.name },
          uuid: this.actor.uuid
        }).render({ force: true });
      } else {
        new foundry.applications.apps.FilePicker.implementation({
          type: "image",
          current: this.actor.img,
          callback: (path) => this.actor.update({ img: path }),
          position: { top: this.position.top + 40, left: this.position.left + 10 }
        }).render({ force: true });
      }
    });

    // Cover toggle — mutually-exclusive activeCover; sync via _onUpdate hook.
    html.find(".cover-toggle").click(ev => {
      ev.preventDefault();
      const coverKey = ev.currentTarget.dataset.coverKey;
      const current = this.actor.system.activeCover;
      this.actor.update({ "system.activeCover": current === coverKey ? null : coverKey });
    });

    // Condition toggles — independent on/off via Foundry status effects.
    html.find(".cond-toggle").click(async ev => {
      ev.preventDefault();
      const conditionId = ev.currentTarget.dataset.conditionId;
      const isActive = this.actor.statuses.has(conditionId);
      await this.actor.toggleStatusEffect(conditionId, { active: !isActive });
    });

    // Skill delete (unlocked mode) — confirm dialog before removing.
    html.find(".skill-delete").click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const skillId = ev.currentTarget.dataset.skillId;
      const skill = this.actor.items.get(skillId);
      if (!skill) return;
      foundry.applications.api.DialogV2.confirm({
        window: { title: localize("ItemDeleteConfirmTitle") },
        content: `<p>${localize("ItemDeleteConfirmText", { itemName: skill.name })}</p>`,
        yes: { label: localize("Yes"), callback: () => skill.delete() },
        no:  { label: localize("No"), default: true }
      });
    });

    // Skill base level input (unlocked mode)
    html.find(".skill-level-input").click(ev => ev.target.select()).change(async ev => {
      const skillId = ev.currentTarget.dataset.skillId;
      const newLevel = parseInt(ev.target.value, 10) || 0;
      await this.actor.updateEmbeddedDocuments("Item", [{
        _id: skillId,
        "system.level": Math.max(0, Math.min(10, newLevel))
      }]);
    });

    // Skill row → SkillRollDialog (drones never have legacy askMods)
    html.find(".skill-roll").click(ev => {
      const id = ev.currentTarget.dataset.skillId;
      const skill = this.actor.items.get(id);
      if (!skill) return;
      const existing = Object.values(ui.windows).find(w => w.id === "skill-roll-dialog");
      if (existing) existing.close();
      new SkillRollDialog(this.actor, {
        rollType: "skill",
        skillId: id,
        title: skill.name,
        statIcon: skill.system.stat
      }).render(true);
    });

    // Header chrome / actions wired declaratively via DEFAULT_OPTIONS.actions.

    // ----- Custom Window Dragging / Resize / Minimize -----
    const sheetHeader = this.element.querySelector(".sheet-header");
    if (sheetHeader) {
      this._customDraggable = new foundry.applications.ux.Draggable.implementation(
        this, this.element, sheetHeader, this.options.window?.resizable
      );

      const resizeHandle = this.element.querySelector(".sheet-resize");
      if (resizeHandle) {
        resizeHandle.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          this._customDraggable._onResizeMouseDown(ev);
        });
      }

      // Double-click header to minimize / maximize via our overrides.
      sheetHeader.addEventListener("dblclick", (ev) => {
        if (ev.target.closest(".lock-toggle, .header-control")) return;
        if (this._isMinimized) this.maximize();
        else this.minimize();
      });
    }

    // Zone disable / re-enable toggle. Sets a persistent manualDisabled override —
    // remains in effect until the user clicks again, regardless of SDP changes.
    // Uses a structured update of the entire zones map (instead of a dot-path) so it works
    // reliably even on drones whose source-data zones object pre-dates the template default.
    html.find(".zone-disable-btn").each((i, btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = btn.dataset.zoneKey;
        if (!key) return;
        const sourceZones = foundry.utils.deepClone(this.actor.toObject().system.zones || {});
        const sourceZone = sourceZones[key] || {
          sp: { max: 10, ablation: 0 },
          sdp: { current: 20, max: 20, disablesAt: 10 },
          manuallyDisabled: false
        };
        sourceZone.manuallyDisabled = !sourceZone.manuallyDisabled;
        sourceZones[key] = sourceZone;
        await this.actor.update({ "system.zones": sourceZones });
      });
    });

    if (!this.isEditable) return;

    // Stat roll — open the same dialog the character uses
    html.find(".stat-roll").click(ev => {
      const statName = ev.currentTarget.dataset.statName;
      const fullStatName = localize(toTitleCase(statName) + "Full");
      const existingDialog = Object.values(ui.windows).find(w => w.id === "skill-roll-dialog");
      if (existingDialog) existingDialog.close();
      new SkillRollDialog(this.actor, {
        rollType: "stat",
        statName,
        title: fullStatName,
        statIcon: statName
      }).render(true);
    });
  }

  /**
   * @override Cross-character gear transfers (move-or-merge + chat post)
   * intercept here too so drones can both give and receive gear from
   * characters / other drones. Falls through to the default clone behaviour
   * for skills, role, or same-actor drops.
   */
  async _onDropItem(event, item) {
    if (!item) return;
    if (shouldTransfer(item, this.actor)) {
      event.preventDefault();
      await transferItem(item, this.actor);
      return;
    }
    return super._onDropItem(event, item);
  }
}
