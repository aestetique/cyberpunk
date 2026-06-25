import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM Toolbox — floating panel for nudging the controlled token's transient stats.
 * @extends {ApplicationV2}
 */
export class ToolboxDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "toolbox-dialog",
    classes: ["cyberpunk", "toolbox-dialog"],
    position: { width: 300, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, minimizable: true, controls: [] },
    actions: {
      closeDialog: ToolboxDialog._onCloseDialog,
      statPlus:    ToolboxDialog._onStatPlus,
      statMinus:   ToolboxDialog._onStatMinus
    }
  };

  static PARTS = {
    body: { template: "systems/cyberpunk/templates/dialog/toolbox.hbs" }
  };

  get title() { return localize("Toolbox"); }

  static _onCloseDialog(event, _target) { event?.preventDefault?.(); this.close({ animate: false }); }

  static _onStatPlus(event, target) {
    event?.preventDefault?.();
    const stat = this._lookup(target.dataset.stat);
    if (!stat) return;
    this._writeStat(stat, stat.value + 1);
  }

  static _onStatMinus(event, target) {
    event?.preventDefault?.();
    const stat = this._lookup(target.dataset.stat);
    if (!stat) return;
    this._writeStat(stat, stat.value - 1);
  }

  _getActor() { return this._trackedActor || null; }

  _lookup(key) {
    return this._buildStats(this._getActor()).find(s => s.key === key);
  }

  _buildStats(actor) {
    if (!actor) return [];
    const sys = actor.system || {};
    const cool = (sys.stats?.cool?.base || 0) + (sys.stats?.cool?.tempMod || 0);
    const body = (sys.stats?.bt?.base   || 0) + (sys.stats?.bt?.tempMod   || 0);
    const empBase = sys.stats?.emp?.base || 0;
    const humanityMax = Math.max(0, empBase * 10);
    const humanityDamage = Math.max(0, Number(sys.stats?.emp?.humanityDamage) || 0);
    const humanityCurrent = Math.max(0, humanityMax - humanityDamage);

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
      { key: "humanity", label: localize("Humanity"),
        value: humanityCurrent, max: humanityMax,
        invertedAgainst: humanityMax,
        path: "system.stats.emp.humanityDamage", step: 0.5 }
    ].map(s => ({ ...s, canDecrease: s.value > 0, canIncrease: s.value < s.max }));
  }

  async _prepareContext(_options) {
    const actor = this._getActor();
    if (!actor) {
      return { hasActor: false, emptyText: localize("ToolboxSelectActor"), stats: [] };
    }
    return {
      hasActor: true,
      actorImg: actor.img,
      actorName: actor.name,
      stats: this._buildStats(actor)
    };
  }

  async _writeStat(stat, newRaw) {
    const actor = this._getActor();
    if (!actor) return;
    const step = stat.step || 1;
    const raw = Number(newRaw);
    if (!Number.isFinite(raw)) return;
    const snapped = step === 1 ? Math.floor(raw) : Math.round(raw / step) * step;
    const clamped = Math.max(0, Math.min(stat.max, snapped));
    const stored = stat.invertedAgainst != null ? stat.invertedAgainst - clamped : clamped;
    await actor.update({ [stat.path]: stored });
    this.render();
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const header = this.element.querySelector('.reload-header');
    if (header) {
      new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
    }

    // Direct typing on stat inputs
    this.element.querySelectorAll('.stat-input').forEach(input => {
      input.addEventListener('click', ev => ev.target.select());
      const onChange = ev => {
        const stat = this._lookup(ev.currentTarget.dataset.stat);
        if (!stat) return;
        this._writeStat(stat, ev.currentTarget.value);
      };
      input.addEventListener('change', onChange);
      input.addEventListener('blur', onChange);
    });

    // Live tracking of controlled token
    if (!this._hooksBound) {
      this._hooksBound = true;

      if (!this._trackedActor) {
        const controlled = canvas?.tokens?.controlled || [];
        if (controlled.length >= 1) this._trackedActor = controlled[0].actor || null;
      }

      this._onControlToken = (token, controlled) => {
        if (controlled && token.actor) this._trackedActor = token.actor;
        else if (!controlled && token.actor?.id === this._trackedActor?.id) this._trackedActor = null;
        this.render();
      };
      this._onActorUpdate = (actor) => {
        if (actor.id === this._trackedActor?.id) this.render();
      };
      Hooks.on("controlToken", this._onControlToken);
      Hooks.on("updateActor",  this._onActorUpdate);
    }
  }

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
