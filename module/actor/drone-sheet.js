import { localize, toTitleCase, bindHoverTooltips } from "../utils.js";
import { SkillRollDialog } from "../dialog/skill-roll-dialog.js";
import { buildWeaponsList, buildOrdnanceList, buildAmmoList, buildDroneSkillsList, buildCoverToggles } from "./gear-data.js";
import { bindWeaponAndOrdnanceHandlers } from "./gear-handlers.js";
import { DRONE_CONDITION_TOGGLE_ROW } from "../conditions.js";
import { CreateItemDialog } from "../dialog/create-item-dialog.js";

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

/**
 * Drone Actor Sheet — slim layout with 5 attributes (INT/REF/TECH/MA/LUCK)
 * and 5 info fields (WALK/RUN/LEAP/WEIGHT/PRICE). Reuses the character-sheet
 * CSS classes so the visual style matches; no tabs, no inventory surfaces yet.
 *
 * @extends {ActorSheet}
 */
export class CyberpunkDroneSheet extends ActorSheet {

  /** @type {boolean} */
  _isLocked = true;

  /** Per-actor remembered sheet heights so a re-render restores the user's resized height. */
  static _sheetHeights = new Map();

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["cyberpunk", "sheet", "actor", "drone-sheet"],
      template: "systems/cyberpunk/templates/actor/drone-sheet.hbs",
      width: 600,
      height: 360,
      resizable: true,
      dragDrop: [{ dragSelector: ".gear-row[data-item-id]", dropSelector: null }]
    });
  }

  /** Toggle the lock state and re-render */
  toggleLock() {
    this._isLocked = !this._isLocked;
    this.render(false);
  }

  /** @override — remember user-resized height for next open */
  setPosition(position = {}) {
    if (position.height) {
      CyberpunkDroneSheet._sheetHeights.set(this.actor.id, position.height);
    }
    return super.setPosition(position);
  }

  /** @override — restore remembered height on first render; reapply minimized state on re-render */
  async _render(force = false, options = {}) {
    // Save scroll position before re-render so toggle/reload/charge clicks don't snap to top.
    if (this.rendered && this.element?.length) {
      const gearContainer = this.element[0].querySelector(".gear-container");
      if (gearContainer) this._gearScrollTop = gearContainer.scrollTop;
    }

    if (!this.rendered) {
      const rememberedHeight = CyberpunkDroneSheet._sheetHeights.get(this.actor.id);
      if (rememberedHeight) options.height = rememberedHeight;
      else options.height = this.constructor.defaultOptions.height;
    }

    const result = await super._render(force, options);

    // Restore scroll position after the fresh DOM is in place.
    if (this.element?.length && this._gearScrollTop) {
      const gearContainer = this.element[0].querySelector(".gear-container");
      if (gearContainer) gearContainer.scrollTop = this._gearScrollTop;
    }

    // Foundry's chrome rebuild can leave behind multiple `.window-resizable-handle`
    // elements across re-renders. We hide them via SCSS, but keep the DOM clean by
    // collapsing to a single handle (the most recently added) after each render.
    if (this.element?.length) {
      const handles = this.element[0].querySelectorAll(":scope > .window-resizable-handle");
      for (let i = 0; i < handles.length - 1; i++) handles[i].remove();
    }

    // Re-apply minimized styling to the freshly-rendered DOM if we're currently minimized.
    if (this._isMinimized && this.element?.length) {
      const sheetContent = this.element.find(".sheet-content")[0];
      const sheetSections = this.element.find(".sheet-sections")[0];
      const sheetResize = this.element.find(".sheet-resize")[0];
      const addItemFab = this.element.find(".add-item-fab")[0];
      const sheetFrame = this.element.find(".sheet-frame")[0];
      const characterSheet = this.element.find(".character-sheet")[0];
      if (sheetContent) sheetContent.style.display = "none";
      if (sheetSections) sheetSections.style.display = "none";
      if (sheetResize) sheetResize.style.display = "none";
      if (addItemFab) addItemFab.style.display = "none";
      if (sheetFrame) {
        sheetFrame.style.minHeight = "0";
        sheetFrame.style.width = "400px";
        sheetFrame.style.height = "46px";
      }
      if (characterSheet) {
        characterSheet.style.width = "400px";
        characterSheet.style.minHeight = "46px";
      }
    }

    return result;
  }

  /** @override */
  async getData(options) {
    const sheetData = super.getData(options);
    const actor = this.actor;
    const system = actor.system;

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

    // ----- Stat buttons (5) -----

    const statLabel = (key) => {
      const overrides = { ma: "move" };
      return overrides[key] || game.i18n.localize(`CYBERPUNK.${toTitleCase(key)}`);
    };
    const statFullName = (key) => game.i18n.localize(`CYBERPUNK.${toTitleCase(key)}Full`);

    const statFlavors = {
      int:  "Sensor processing, awareness, pattern recognition.",
      ref:  "Servo response speed and combat initiative.",
      tech: "Aptitude with tools and machinery.",
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
      return calc;
    };

    const statTokenPaths = {
      int:  "@stats.int.total",
      ref:  "@stats.ref.total",
      tech: "@stats.tech.total",
      ma:   "@stats.ma.total",
      luck: "@stats.luck.effective"
    };

    sheetData.statButtons = ["int", "ref", "tech", "ma", "luck"].map(key => {
      const s = stats[key] || {};
      const total = key === "luck"
        ? (s.effective ?? s.total ?? s.base ?? 0)
        : (s.total ?? s.base ?? 0);
      return {
        key,
        label: statLabel(key),
        tooltipName: statFullName(key),
        total,
        base: s.base ?? 0,
        path: `system.stats.${key}.base`,
        flavor: statFlavors[key] || "",
        calc: buildStatCalc(key),
        tokenPath: statTokenPaths[key] || ""
      };
    });

    // ----- Info blocks (5) -----

    const walk = ma.total ?? 0;
    const run = ma.run ?? 0;
    const leap = ma.leap ?? 0;
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
  activateListeners(html) {
    super.activateListeners(html);

    // Shared weapons/ordnance gear-row handlers
    bindWeaponAndOrdnanceHandlers(html, this);

    // Hover tooltips (follow cursor)
    bindHoverTooltips(html, '.shape-display[data-flavor], .stat-btn, .info-block[data-flavor], .cover-toggle[data-flavor], .cond-toggle[data-flavor], .drone-skill-row[data-flavor]');

    // Add Item FAB — restricted to weapon / ordnance / ammo / skill on drones.
    html.find('.add-item-fab').click(ev => {
      ev.preventDefault();
      new CreateItemDialog(this.actor, {
        allowedTypes: ["weapon", "ordnance", "ammo", "skill"]
      }).render(true);
    });

    // Portrait click — locked: full-screen popup; unlocked: FilePicker to change image.
    html.find(".portrait-frame").click(ev => {
      ev.preventDefault();
      if (this._isLocked) {
        new ImagePopout(this.actor.img, {
          title: this.actor.name,
          uuid: this.actor.uuid
        }).render(true);
      } else {
        const fp = new FilePicker({
          type: "image",
          current: this.actor.img,
          callback: (path) => this.actor.update({ img: path }),
          top: this.position.top + 40,
          left: this.position.left + 10
        });
        fp.render(true);
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
      new Dialog({
        title: localize("ItemDeleteConfirmTitle"),
        content: `<p>${localize("ItemDeleteConfirmText", { itemName: skill.name })}</p>`,
        buttons: {
          yes: { label: localize("Yes"), callback: () => skill.delete() },
          no:  { label: localize("No") }
        },
        default: "no"
      }).render(true);
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

    // Lock / Unlock toggle
    html.find(".lock-toggle").click(ev => {
      ev.preventDefault();
      this.toggleLock();
    });

    // Header controls
    html.find('[data-action="copyUuid"]').click(ev => {
      ev.preventDefault();
      const uuid = this.actor.uuid;
      game.clipboard.copyPlainText(uuid);
      ui.notifications.info(`Copied UUID: ${uuid}`);
    });
    html.find('[data-action="configureSheet"]').click(ev => {
      ev.preventDefault();
      this._onConfigureSheet(ev);
    });
    html.find('[data-action="configureToken"]').click(ev => {
      ev.preventDefault();
      this._onConfigureToken(ev);
    });
    html.find('[data-action="closeSheet"]').click(ev => {
      ev.preventDefault();
      this.close();
    });

    // ----- Custom Window Dragging / Resize / Minimize -----
    // Mirrors the character sheet — Foundry's default chrome is hidden, so we wire
    // dragging on .sheet-header, resizing on .sheet-resize, and minimize on header dblclick.
    const sheetHeader = html[0].querySelector(".sheet-header");
    if (sheetHeader) {
      const appElement = html.closest(".app");
      if (appElement.length) {
        this._customDraggable = new foundry.applications.ux.Draggable.implementation(
          this, appElement, sheetHeader, this.options.resizable
        );

        const resizeHandle = html[0].querySelector(".sheet-resize");
        if (resizeHandle) {
          resizeHandle.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            this._customDraggable._onResizeMouseDown(ev);
          });
        }
      }

      // Double-click header to minimize / maximize
      sheetHeader.addEventListener("dblclick", (ev) => {
        if (ev.target.closest(".lock-toggle, .header-control")) return;

        const sheetFrame = html[0].querySelector(".sheet-frame");
        const characterSheet = html[0].querySelector(".character-sheet");
        const appEl = html.closest(".app")[0];
        const sheetContent = html[0].querySelector(".sheet-content");
        const sheetSections = html[0].querySelector(".sheet-sections");
        const sheetResize = html[0].querySelector(".sheet-resize");
        const addItemFab = html[0].querySelector(".add-item-fab");

        if (this._isMinimized) {
          // Maximize
          sheetFrame.style.transition = "width 250ms ease, height 250ms ease";
          appEl.style.transition = "width 250ms ease, height 250ms ease";

          sheetFrame.style.width = this._originalWidth + "px";
          sheetFrame.style.height = this._originalHeight + "px";
          appEl.style.width = this._originalFoundryWidth + "px";
          appEl.style.height = this._originalFoundryHeight + "px";

          characterSheet.style.width = "";
          characterSheet.style.minHeight = "";

          setTimeout(() => {
            sheetFrame.style.transition = "";
            sheetFrame.style.width = "";
            sheetFrame.style.height = "";
            sheetFrame.style.minHeight = "";
            appEl.style.transition = "";
            appEl.style.width = "";
            appEl.style.height = "";
            appEl.style.minHeight = "";
            if (sheetContent) sheetContent.style.display = "";
            if (sheetSections) sheetSections.style.display = "";
            if (sheetResize) sheetResize.style.display = "";
            if (addItemFab) addItemFab.style.display = "";
            this.setPosition({
              width: this._originalFoundryWidth,
              height: this._originalFoundryHeight
            });
          }, 250);

          this._isMinimized = false;
        } else {
          // Minimize
          this._originalWidth = sheetFrame.offsetWidth;
          this._originalHeight = sheetFrame.offsetHeight;
          this._originalFoundryWidth = this.position.width;
          this._originalFoundryHeight = this.position.height;

          if (sheetContent) sheetContent.style.display = "none";
          if (sheetSections) sheetSections.style.display = "none";
          if (sheetResize) sheetResize.style.display = "none";
          if (addItemFab) addItemFab.style.display = "none";

          sheetFrame.style.minHeight = "0";
          characterSheet.style.minHeight = "0";
          appEl.style.minHeight = "0";

          const minWidth = 400;
          sheetFrame.style.transition = "width 250ms ease, height 250ms ease";
          appEl.style.transition = "width 250ms ease, height 250ms ease";

          sheetFrame.style.width = minWidth + "px";
          sheetFrame.style.height = "46px";
          appEl.style.width = minWidth + "px";
          appEl.style.height = "46px";

          setTimeout(() => {
            characterSheet.style.width = minWidth + "px";
            characterSheet.style.minHeight = "46px";
            this.setPosition({ width: minWidth, height: 46 });
            sheetFrame.style.transition = "";
            appEl.style.transition = "";
          }, 250);

          this._isMinimized = true;
        }
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

    if (!this.options.editable) return;

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
}
