import { fireModes, ranges } from "../lookups.js";
import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Ordnance Attack Dialog — select range band, conditions, and luck before firing ordnance.
 * Modeled on RangeSelectionDialog but without location targeting or fire mode selection.
 * @extends {ApplicationV2}
 */
export class OrdnanceAttackDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /**
   * @param {Actor} actor        The owning actor
   * @param {Item}  ordnance     The ordnance item to fire
   * @param {Array} targetTokens Array of target token data
   */
  constructor(actor, ordnance, targetTokens = []) {
    super({});
    this.actor = actor;
    this.ordnance = ordnance;
    this.targetTokens = targetTokens;

    // Condition toggles
    this._conditions = {
      prepared: false,
      ambush: false,
      distracted: false,
      ricochet: false
    };

    // Luck spending
    this._luckToSpend = 0;
    this._availableLuck = actor.system.stats.luck?.effective ?? actor.system.stats.luck?.total ?? 0;

    // Laser damage slider: damage field is per-charge (e.g. "1d6"),
    // slider controls how many charges to spend (1 to current charges)
    this._isLaser = (ordnance.system.effect === "laser");
    if (this._isLaser) {
      const dmgMatch = (ordnance.system.damage || "").match(/^(\d+)d(\d+)/i);
      this._baseDice = dmgMatch ? parseInt(dmgMatch[1]) : 1;
      this._dieSize = dmgMatch ? parseInt(dmgMatch[2]) : 6;
      this._maxCharges = ordnance.system.charges || 1;
      this._chargesToSpend = 1;
    }

    // Determine effective range based on template type
    const templateType = this.ordnance.system.templateType || "circle";

    if (templateType === "beam" || templateType === "cone") {
      // Beam/Cone: fixed trajectory
      this._effectiveRange = this.ordnance.system.range || 50;
    } else {
      // Circle: thrown (range=0) or propelled (range>0)
      const specifiedRange = this.ordnance.system.range || 0;
      const body = actor.system.stats.bt?.total ?? 5;
      const bodyRange = body * 5;
      if (specifiedRange === 0) {
        // Thrown grenade: Long = 5 × BODY
        this._effectiveRange = bodyRange;
      } else {
        // Propelled: Long = max(specified range, 5 × BODY)
        this._effectiveRange = Math.max(specifiedRange, bodyRange);
      }
    }

    // Extreme range in meters (for circle template placement distance limit)
    this._extremeRange = this._effectiveRange * 2;
  }

  static DEFAULT_OPTIONS = {
    id: "ordnance-attack-dialog",
    classes: ["cyberpunk", "range-selection-dialog"],
    position: { width: 300, height: "auto" },
    window: {
      frame: true,
      positioned: true,
      resizable: false,
      minimizable: false,
      controls: []
    },
    actions: {
      closeDialog: OrdnanceAttackDialog._onCloseDialog,
      toggleCondition: OrdnanceAttackDialog._onToggleCondition,
      luckPlus: OrdnanceAttackDialog._onLuckPlus,
      luckMinus: OrdnanceAttackDialog._onLuckMinus,
      dicePlus: OrdnanceAttackDialog._onDicePlus,
      diceMinus: OrdnanceAttackDialog._onDiceMinus,
      roll: OrdnanceAttackDialog._onRoll
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/ordnance-attack.hbs" }
  };

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
      this._updateLuckDisplay($(this.element));
    }
  }

  static _onLuckMinus(event, _target) {
    event?.preventDefault?.();
    if (this._luckToSpend > 0) {
      this._luckToSpend--;
      this._updateLuckDisplay($(this.element));
    }
  }

  static _onDicePlus(event, _target) {
    event?.preventDefault?.();
    if (this._chargesToSpend < this._maxCharges) {
      this._chargesToSpend++;
      this._updateDiceDisplay($(this.element));
    }
  }

  static _onDiceMinus(event, _target) {
    event?.preventDefault?.();
    if (this._chargesToSpend > 1) {
      this._chargesToSpend--;
      this._updateDiceDisplay($(this.element));
    }
  }

  static _onRoll(event, _target) {
    event?.preventDefault?.();
    this._executeRoll();
  }

  async _prepareContext(options) {
    const data = {
      ordnanceName: this.ordnance.name,
      // Luck data
      luckToSpend: this._luckToSpend,
      availableLuck: this._availableLuck,
      canIncreaseLuck: this._luckToSpend < this._availableLuck,
      canDecreaseLuck: this._luckToSpend > 0,
      hasAnyLuck: this._availableLuck > 0,
      // Laser damage dice data
      isLaser: this._isLaser
    };
    if (this._isLaser) {
      const totalDice = this._baseDice * this._chargesToSpend;
      data.damageDice = totalDice;
      data.dieSize = this._dieSize;
      data.chargesToSpend = this._chargesToSpend;
      data.canIncreaseDice = this._chargesToSpend < this._maxCharges;
      data.canDecreaseDice = this._chargesToSpend > 1;
    }
    return data;
  }

  /**
   * Determine range band from a measured distance in meters
   * @param {number} dist Distance in meters
   * @returns {string} Range key
   */
  _getRangeFromDistance(dist) {
    const r = this._effectiveRange;
    if (dist <= 1) return ranges.pointBlank;
    if (dist <= r / 4) return ranges.close;
    if (dist <= r / 2) return ranges.medium;
    if (dist <= r) return ranges.long;
    return ranges.extreme;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Make header draggable. V2 root form IS the app element.
    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }
    // All other interactivity (close / condition toggles / luck / dice / roll)
    // is wired declaratively via DEFAULT_OPTIONS.actions.
  }

  /**
   * Update the luck display and button states
   * @param {jQuery} html - The dialog HTML element
   */
  _updateLuckDisplay(html) {
    html.find('.luck-value').text(this._luckToSpend);

    const minusDisabled = this._luckToSpend <= 0;
    const plusDisabled = this._luckToSpend >= this._availableLuck;

    html.find('.luck-minus-btn').toggleClass('disabled', minusDisabled);
    html.find('.luck-plus-btn').toggleClass('disabled', plusDisabled);

    html.find('.luck-minus-btn img').attr('src', `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    html.find('.luck-plus-btn img').attr('src', `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  /**
   * Update the damage dice display and button states (laser weapons only)
   * @param {jQuery} html - The dialog HTML element
   */
  _updateDiceDisplay(html) {
    const totalDice = this._baseDice * this._chargesToSpend;
    html.find('.dice-value').text(`${totalDice}d${this._dieSize}`);

    const minusDisabled = this._chargesToSpend <= 1;
    const plusDisabled = this._chargesToSpend >= this._maxCharges;

    html.find('.dice-minus-btn').toggleClass('disabled', minusDisabled);
    html.find('.dice-plus-btn').toggleClass('disabled', plusDisabled);

    html.find('.dice-minus-btn img').attr('src', `systems/cyberpunk/img/chat/${minusDisabled ? 'minus-disabled' : 'minus'}.svg`);
    html.find('.dice-plus-btn img').attr('src', `systems/cyberpunk/img/chat/${plusDisabled ? 'plus-disabled' : 'plus'}.svg`);
  }

  /**
   * Execute roll directly with selected options
   */
  async _executeRoll() {
    // Close dialog first
    this.close();

    // Close all open application windows so they don't block the canvas
    // during template placement. V1 apps live in ui.windows; V2 apps (which
    // our character/item sheets are now) live in foundry.applications.instances.
    // animate:false skips V14's 1000ms close-transition wait.
    Object.values(ui.windows).forEach(w => w.close?.());
    for (const app of foundry.applications.instances.values()) {
      if (app.rendered && app.hasFrame) app.close({ animate: false });
    }

    // Place template on the canvas — if cancelled, abort without spending luck
    let placedPos;
    try {
      placedPos = await this._placeTemplate();
    } catch (e) {
      return;
    }

    // Determine range band from placement distance
    const templateType = this.ordnance.system.templateType || "circle";
    let range;
    let actualDistance;
    if (templateType === "beam" || templateType === "cone") {
      // Beam/Cone: fixed trajectory, always Close
      range = ranges.close;
    } else {
      // Circle: measure distance from actor to template center.
      // V14 removed canvas.grid.measureDistance; use measurePath().distance.
      const actorToken = this.actor.getActiveTokens()?.[0];
      if (actorToken) {
        const dist = canvas.grid.measurePath([
          { x: actorToken.center.x, y: actorToken.center.y },
          { x: placedPos.x, y: placedPos.y }
        ]).distance;
        actualDistance = Math.round(dist);
        range = this._getRangeFromDistance(actualDistance);
      } else {
        range = ranges.close;
      }
    }

    const fireOptions = {
      fireMode: fireModes.singleShot,
      range: range,
      actualDistance: actualDistance,
      templateId: placedPos.templateId,
      ambush: this._conditions.ambush,
      ricochet: this._conditions.ricochet,
      damageOverride: this._isLaser ? `${this._baseDice * this._chargesToSpend}d${this._dieSize}` : null,
      chargesUsed: this._isLaser ? this._chargesToSpend : null,
      extraMod: (this._conditions.prepared ? 2 : 0)
              + (this._conditions.distracted ? -2 : 0)
              + this._luckToSpend,
      aimRounds: 0,
      blinded: false,
      dualWield: false,
      fastDraw: false,
      hipfire: false,
      running: false,
      turningToFace: false,
      targetArea: ""
    };

    // Spend luck only after successful template placement
    if (this._luckToSpend > 0) {
      const currentSpent = this.actor.system.stats.luck.spent || 0;
      const currentSpentAt = this.actor.system.stats.luck.spentAt;
      this.actor.update({
        "system.stats.luck.spent": currentSpent + this._luckToSpend,
        "system.stats.luck.spentAt": currentSpentAt || Date.now()
      });
    }

    this.ordnance._fireOrdnance(fireOptions, this.targetTokens);

    // Register ordnance attack action AFTER executing
    const { registerAction } = await import("../action-tracker.js");
    await registerAction(this.actor, `ordnance attack (${this.ordnance.name})`);
  }

  /**
   * Place an area template (Region in V14, MeasuredTemplate in V13) on the
   * canvas for the ordnance's area of effect.
   * @returns {Promise<{x:number,y:number,templateId:string}>} Resolves with the
   *   placed position + region/template id, rejects with Error("cancelled")
   *   if the user dismisses placement.
   */
  async _placeTemplate() {
    // V14: canvas.regions.placeRegion is the public preview+commit helper.
    // V13: fall back to the old MeasuredTemplate flow.
    if (canvas.regions?.placeRegion) {
      return this._placeRegionV14();
    }
    return this._placeTemplateV13();
  }

  /**
   * V14 Region-based placement. Modeled after dnd5e's TemplatePlacement
   * (module/canvas/template-placement.mjs) — uses RegionLayer#placeRegions
   * with `create: false` + `preConfirm` callback to capture placement data,
   * then creates the Region document directly via createEmbeddedDocuments.
   *
   * @returns {Promise<{x:number,y:number,templateId:string}>}
   */
  async _placeRegionV14() {
    const sys = this.ordnance.system;
    const templateType = sys.templateType || "circle";

    // Grid-units → pixels conversion (matches dnd5e's `gridMultiplier`).
    const gridMultiplier = canvas.scene.grid.size / canvas.scene.grid.distance;

    let shape;
    switch (templateType) {
      case "circle":
        shape = {
          type: "circle",
          x: 0, y: 0, rotation: 0,
          radius: (sys.radius || 5) * gridMultiplier
        };
        break;
      case "cone": {
        // Compute the spread half-angle from "radius at range" → full cone angle.
        const w = sys.radius || 5;
        const r = sys.range || 50;
        const angle = 2 * Math.atan2(w / 2, r) * (180 / Math.PI);
        shape = {
          type: "cone",
          x: 0, y: 0, rotation: 0,
          radius: r * gridMultiplier,
          angle
        };
        break;
      }
      case "beam":
        shape = {
          type: "line",
          x: 0, y: 0, rotation: 0,
          length: (sys.range || 50) * gridMultiplier,
          width: (sys.radius || 2) * gridMultiplier
        };
        break;
    }

    // Capture the user-placed shape data via preConfirm; placeRegions itself
    // doesn't auto-commit when `create: false`.
    const placements = [];
    await canvas.regions.placeRegions([{
      name: RegionDocument.implementation.defaultName({ parent: canvas.scene }),
      color: game.user.color.css ?? game.user.color,
      displayMeasurements: true,
      highlightMode: "coverage",
      shapes: [shape]
    }], {
      create: false,
      preConfirm: ({ document }) => {
        const obj = document.toObject();
        placements.push(obj.shapes.at(-1));
      }
    });

    if (!placements.length) throw new Error("cancelled");

    const placedShape = placements[0];

    // Now create the actual Region. Tag with flags.core.MeasuredTemplate so
    // V14's synthetic Scene#templates collection includes it — keeps existing
    // canvas.scene.templates.get(id) lookups in item.js working without a
    // parallel V14 branch.
    const [region] = await canvas.scene.createEmbeddedDocuments("Region", [{
      name: `${this.ordnance.name} [${game.user.name}]`,
      color: game.user.color.css ?? game.user.color,
      shapes: [placedShape],
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      highlightMode: "coverage",
      displayMeasurements: true,
      flags: { core: { MeasuredTemplate: true } }
    }]);

    return {
      x: placedShape.x ?? 0,
      y: placedShape.y ?? 0,
      templateId: region.id
    };
  }

  /**
   * V13 MeasuredTemplate-based placement (legacy path). Identical to the
   * pre-V14 behaviour; kept verbatim while we support both releases.
   * @returns {Promise<{x:number,y:number,templateId:string}>}
   */
  async _placeTemplateV13() {
    const system = this.ordnance.system;
    const templateType = system.templateType || "circle";

    const templateData = {
      user: game.user.id,
      fillColor: game.user.color,
      x: 0,
      y: 0,
      direction: 0
    };

    switch (templateType) {
      case "circle":
        templateData.t = "circle";
        templateData.distance = system.radius || 5;
        break;
      case "beam":
        templateData.t = "ray";
        templateData.distance = system.range || 50;
        templateData.width = system.radius || 2;
        break;
      case "cone":
        templateData.t = "cone";
        templateData.distance = system.range || 50;
        const width = system.radius || 5;
        const range = system.range || 50;
        templateData.angle = 2 * Math.atan2(width / 2, range) * (180 / Math.PI);
        break;
    }

    const cls = CONFIG.MeasuredTemplate.documentClass;
    const doc = new cls(templateData, { parent: canvas.scene });
    const template = new CONFIG.MeasuredTemplate.objectClass(doc);

    const initialLayer = canvas.activeLayer;
    canvas.templates.activate();
    canvas.templates.preview.addChild(template);
    await template.draw();

    const actorToken = this.actor.getActiveTokens()?.[0];

    if (templateType !== "circle" && actorToken) {
      doc.updateSource({ x: actorToken.center.x, y: actorToken.center.y });
      template.refresh();
    }

    return new Promise((resolve, reject) => {
      const handlers = {};
      let moveTime = 0;

      handlers.mm = (event) => {
        event.stopPropagation();
        const now = Date.now();
        if (now - moveTime <= 20) return;
        moveTime = now;

        const pos = event.getLocalPosition(canvas.templates);
        const M = CONST.GRID_SNAPPING_MODES;
        const snapped = canvas.grid.getSnappedPoint(
          { x: pos.x, y: pos.y },
          { mode: M.CENTER | M.VERTEX, resolution: 2 }
        );

        if (templateType === "circle") {
          let x = snapped.x, y = snapped.y;
          if (actorToken) {
            const dx = x - actorToken.center.x;
            const dy = y - actorToken.center.y;
            const pixelsPerUnit = canvas.dimensions.size / canvas.dimensions.distance;
            const maxDist = this._extremeRange * pixelsPerUnit;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxDist) {
              const scale = maxDist / dist;
              x = actorToken.center.x + dx * scale;
              y = actorToken.center.y + dy * scale;
            }
          }
          doc.updateSource({ x, y });
        } else if (actorToken) {
          const dx = pos.x - actorToken.center.x;
          const dy = pos.y - actorToken.center.y;
          doc.updateSource({ direction: Math.toDegrees(Math.atan2(dy, dx)) });
        } else {
          doc.updateSource({ x: snapped.x, y: snapped.y });
        }
        template.refresh();
      };

      handlers.lc = async (event) => {
        cleanup();
        const [created] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [doc.toObject()]);
        initialLayer.activate();
        resolve({ x: doc.x, y: doc.y, templateId: created.id });
      };

      handlers.rc = (event) => {
        event.preventDefault();
        cleanup();
        initialLayer.activate();
        reject(new Error("cancelled"));
      };

      handlers.esc = (event) => {
        if (event.key === "Escape") {
          cleanup();
          initialLayer.activate();
          reject(new Error("cancelled"));
        }
      };

      function cleanup() {
        canvas.stage.off("pointermove", handlers.mm);
        canvas.stage.off("pointerdown", handlers.lc);
        canvas.app.view.removeEventListener("contextmenu", handlers.rc);
        document.removeEventListener("keydown", handlers.esc);
        canvas.templates.preview.removeChild(template);
        template.destroy();
      }

      canvas.stage.on("pointermove", handlers.mm);
      canvas.stage.once("pointerdown", handlers.lc);
      canvas.app.view.addEventListener("contextmenu", handlers.rc);
      document.addEventListener("keydown", handlers.esc);
    });
  }

}
