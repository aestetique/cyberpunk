import { localize } from "../utils.js";

/**
 * GM Toolbox — a single floating panel for nudging a token's transient stats
 * (Wounds / Stress / Fright / Fatigue / Sleep / Humanity) by ±1 or by typing.
 *
 * The panel binds to the currently-controlled token, not to a targeted one.
 * Selecting a different token re-renders the panel; selecting nothing puts it
 * in the empty "Select a token to start." state. Multi-select is treated as
 * no-selection — we deliberately don't try to bulk-edit.
 *
 * Humanity is stored inversely: `system.stats.emp.humanityDamage` is the
 * permanent loss, and current humanity = `EMP × 10 − humanityDamage`. The
 * panel hides that inversion behind the same +/- UI as the other stats.
 *
 * Bounds applied per-stat in `_buildStats()`; the input is clamped on change
 * regardless of what the browser allows the user to type.
 */
export class ToolboxDialog extends Application {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "toolbox-dialog",
      classes: ["cyberpunk", "toolbox-dialog"],
      template: "systems/cyberpunk/templates/dialog/toolbox.hbs",
      width: 300,
      height: "auto",
      popOut: true,
      minimizable: true,
      resizable: false
    });
  }

  /** @override */
  get title() {
    return localize("Toolbox");
  }

  /**
   * The actor currently bound to the panel — tracked via the `controlToken`
   * hook rather than re-reading `canvas.tokens.controlled` because Foundry
   * does not always fire a release event for the previous token before
   * firing the new selection's. Switching from A directly to B was missing
   * the rebind because the canvas read returned [A, B] for one tick.
   */
  _getActor() {
    return this._trackedActor || null;
  }

  /**
   * Per-stat config: where the value lives, what its ceiling is, and any
   * inversion glue (Humanity). `read(sys)` and `write(value)` are the only
   * places that need to know about the storage shape.
   */
  _buildStats(actor) {
    const sys = actor.system || {};
    const cool = (sys.stats?.cool?.base || 0) + (sys.stats?.cool?.tempMod || 0);
    const body = (sys.stats?.bt?.base   || 0) + (sys.stats?.bt?.tempMod   || 0);
    const empBase = sys.stats?.emp?.base || 0;
    const humanityMax = Math.max(0, empBase * 10);
    const humanityDamage = Math.max(0, Number(sys.stats?.emp?.humanityDamage) || 0);
    const humanityCurrent = Math.max(0, humanityMax - humanityDamage);

    // `step` is the granularity used for typed-value snap-to-nearest. +/-
    // always nudge by 1; wounds and humanity also accept .5 typed values.
    return [
      { key: "wounds",   label: localize("Wounds"),
        value: Math.max(0, Number(sys.damage)  || 0), max: 40,
        path: "system.damage", step: 0.5 },
      { key: "stress",   label: localize("Stress"),
        value: Math.max(0, Number(sys.stress)  || 0), max: Math.max(0, cool * 4),
        path: "system.stress", step: 1 },
      { key: "fright",   label: localize("Fright"),
        value: Math.max(0, Number(sys.fright)  || 0), max: 18,
        path: "system.fright", step: 1 },
      { key: "fatigue",  label: localize("Fatigue"),
        value: Math.max(0, Number(sys.fatigue) || 0), max: Math.max(0, body * 4),
        path: "system.fatigue", step: 1 },
      { key: "sleep",    label: localize("SleepDeprivation"),
        value: Math.max(0, Number(sys.sleep)   || 0), max: 6,
        path: "system.sleep", step: 1 },
      // Humanity is shown as a normal "current value" but written through
      // humanityDamage. New value V → damage = max − V; clamped before write.
      { key: "humanity", label: localize("Humanity"),
        value: humanityCurrent, max: humanityMax,
        invertedAgainst: humanityMax,
        path: "system.stats.emp.humanityDamage", step: 0.5 }
    ].map(s => ({
      ...s,
      canDecrease: s.value > 0,
      canIncrease: s.value < s.max
    }));
  }

  /** @override */
  getData() {
    const actor = this._getActor();
    if (!actor) {
      return {
        hasActor: false,
        emptyText: localize("ToolboxSelectActor"),
        stats: []
      };
    }
    return {
      hasActor: true,
      actorImg: actor.img,
      actorName: actor.name,
      stats: this._buildStats(actor)
    };
  }

  /**
   * Write a new raw value for `stat` to the actor, applying inversion and
   * step-aware snap. Integer-step stats floor; 0.5-step stats round to the
   * nearest half (so a typed 1.7 becomes 1.5 and 1.8 becomes 2).
   */
  async _writeStat(stat, newRaw) {
    const actor = this._getActor();
    if (!actor) return;
    const step = stat.step || 1;
    const raw = Number(newRaw);
    if (!Number.isFinite(raw)) return;
    const snapped = step === 1
      ? Math.floor(raw)
      : Math.round(raw / step) * step;
    const clamped = Math.max(0, Math.min(stat.max, snapped));
    const stored = stat.invertedAgainst != null
      ? stat.invertedAgainst - clamped
      : clamped;
    await actor.update({ [stat.path]: stored });
    this.render(false);
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Draggable header (shared dialog pattern)
    const header = html.find('.reload-header')[0];
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, html, header, false);
    }
    html.find('.header-control.close').click(() => this.close());

    const lookup = (key) => this._buildStats(this._getActor()).find(s => s.key === key);

    html.find('.stat-plus-btn').click(ev => {
      const stat = lookup(ev.currentTarget.dataset.stat);
      if (!stat) return;
      this._writeStat(stat, stat.value + 1);
    });
    html.find('.stat-minus-btn').click(ev => {
      const stat = lookup(ev.currentTarget.dataset.stat);
      if (!stat) return;
      this._writeStat(stat, stat.value - 1);
    });
    html.find('.stat-input').click(ev => ev.target.select()).on('change blur', ev => {
      const stat = lookup(ev.currentTarget.dataset.stat);
      if (!stat) return;
      this._writeStat(stat, ev.currentTarget.value);
    });

    // Live updates: track the selected actor directly off the controlToken
    // hook (canvas.tokens.controlled has stale ordering when the user clicks
    // straight from one token to another). `updateActor` re-renders when the
    // bound actor changes outside the panel.
    if (!this._hooksBound) {
      this._hooksBound = true;

      // Seed from current canvas state so opening the panel with a token
      // already selected binds immediately, before any hooks fire.
      if (!this._trackedActor) {
        const controlled = canvas?.tokens?.controlled || [];
        if (controlled.length >= 1) this._trackedActor = controlled[0].actor || null;
      }

      this._onControlToken = (token, controlled) => {
        if (controlled && token.actor) {
          this._trackedActor = token.actor;
        } else if (!controlled && token.actor?.id === this._trackedActor?.id) {
          this._trackedActor = null;
        }
        this.render(false);
      };
      this._onActorUpdate = (actor) => {
        if (actor.id === this._trackedActor?.id) this.render(false);
      };
      Hooks.on("controlToken", this._onControlToken);
      Hooks.on("updateActor",  this._onActorUpdate);
    }
  }

  /** @override */
  async close(options = {}) {
    if (this._hooksBound) {
      Hooks.off("controlToken", this._onControlToken);
      Hooks.off("updateActor",  this._onActorUpdate);
      this._hooksBound = false;
    }
    this._trackedActor = null;
    return super.close(options);
  }
}
