import { localize, fmtSigned } from "../utils.js";
import {
    METHOD_OPTIONS,
    DETECTION_OPTIONS,
    RESIDUE_OPTIONS,
    ONSET_DURATION_OPTIONS,
    computeCostTotal,
    computeDifficultyTotal,
    costDisplayForTotal,
    difficultyForTotal,
    priceForCostTotal,
    orderEffects,
    lookupEffect,
    buildDrugSystemPayload
} from "../drug-design.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Skill that drives the Drug Design check. Confirmed with the user:
 * Pharmaceuticals(2). Resolution mirrors the canonical pattern from
 * `resolveSkillTotal` / `grantCombatIP` — try the localized display
 * name first, fall back to the raw i18n key, so it matches whether
 * the character was seeded with localized names or raw ones.
 */
const PHARMACY_KEY = "Pharmaceuticals";
function findPharmacySkill(actor) {
    if (!actor?.itemTypes?.skill) return null;
    const nameLoc = localize("Skill" + PHARMACY_KEY);
    const targetName = nameLoc.includes("Skill") ? PHARMACY_KEY : nameLoc;
    let skill = actor.itemTypes.skill.find(s => s.name === targetName);
    if (!skill && targetName !== PHARMACY_KEY) {
        skill = actor.itemTypes.skill.find(s => s.name === PHARMACY_KEY);
    }
    return skill ?? null;
}

/**
 * Resolve the actor the helper should act on. Selected token wins;
 * otherwise fall back to the user's assigned character. Null if
 * neither is available (dialog then refuses to open).
 */
function resolveActor() {
    const controlled = canvas?.tokens?.controlled ?? [];
    const tokenActor = controlled[0]?.actor;
    if (tokenActor?.type === "character") return tokenActor;
    if (game.user?.character?.type === "character") return game.user.character;
    return null;
}

/**
 * Drug Design helper dialog — Pharmaceuticals(2) skill check that
 * spawns a fully-formed Drug item on success. Section chrome mirrors
 * the skill-roll dialog: `.reload-header` + `.fire-mode-section`
 * dividers + the shared Luck / Roll buttons.
 * @extends {ApplicationV2}
 */
export class DrugDesignDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;

        // Dialog state — mutations bubble through _updateDynamicBits so
        // Cost / Difficulty read live. Effects list is the source of
        // truth for the picker sub-dialog when it closes.
        this._state = {
            strength: 3,
            effects: [],                              // [{tier, key}]
            method:    METHOD_OPTIONS[1].key,         // Injected
            detection: DETECTION_OPTIONS[1].key,      // Noticeable
            residue:   RESIDUE_OPTIONS[1].key,        // Normal
            onset:     ONSET_DURATION_OPTIONS[6].key  // 1m / 30m (neutral 0)
        };

        this._availableLuck = actor.system.stats.luck?.effective
                           ?? actor.system.stats.luck?.total
                           ?? 0;
        this._luckToSpend = 0;
    }

    static DEFAULT_OPTIONS = {
        id: "drug-design-dialog",
        classes: ["cyberpunk", "drug-design-dialog"],
        position: { width: 320, height: "auto" },
        window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
        actions: {
            closeDialog:      DrugDesignDialog._onCloseDialog,
            strengthPlus:     DrugDesignDialog._onStrengthPlus,
            strengthMinus:    DrugDesignDialog._onStrengthMinus,
            addEffect:        DrugDesignDialog._onAddEffect,
            removeEffect:     DrugDesignDialog._onRemoveEffect,
            luckPlus:         DrugDesignDialog._onLuckPlus,
            luckMinus:        DrugDesignDialog._onLuckMinus,
            roll:             DrugDesignDialog._onRoll
        }
    };

    static PARTS = {
        body: { template: "systems/cyberpunk/templates/dialog/drug-design.hbs" }
    };

    get title() { return localize("DrugDesignTitle"); }

    // --- action handlers ---
    static _onCloseDialog(ev) { ev?.preventDefault?.(); this.close({ animate: false }); }

    static _onStrengthPlus(ev)  { ev?.preventDefault?.(); this._adjustStrength(+1); }
    static _onStrengthMinus(ev) { ev?.preventDefault?.(); this._adjustStrength(-1); }

    static async _onAddEffect(ev) {
        ev?.preventDefault?.();
        const { DrugEffectPickerDialog } = await import("./drug-effect-picker-dialog.js");
        const picker = new DrugEffectPickerDialog((choice) => {
            if (!choice) return;
            // De-dupe — an effect can only be added once per drug.
            const dup = this._state.effects.some(e => e.tier === choice.tier && e.key === choice.key);
            if (dup) { ui.notifications.warn(localize("DrugDesignDuplicateEffect")); return; }
            this._state.effects.push(choice);
            this.render();
        });
        // Anchor the picker 50px to the right of the design dialog so
        // both windows sit side-by-side instead of overlapping.
        const parentRect = this.element.getBoundingClientRect();
        picker.render(true, {
            position: {
                left: parentRect.right + 50,
                top:  parentRect.top
            }
        });
    }

    static _onRemoveEffect(ev, target) {
        ev?.preventDefault?.();
        const tier = target?.dataset?.tier;
        const key  = target?.dataset?.effectKey;
        if (!tier || !key) return;
        this._state.effects = this._state.effects.filter(e => !(e.tier === tier && e.key === key));
        this.render();
    }

    // Full re-render on luck change — `_updateLuckDisplay` targeted
    // `.luck-value` unscoped and wrote to the Strength readout (first
    // match in DOM order). Rendering keeps both readouts in sync
    // without duplicating scoping logic per section.
    static _onLuckPlus(ev)  { ev?.preventDefault?.(); if (this._luckToSpend < this._availableLuck) { this._luckToSpend++; this.render(); } }
    static _onLuckMinus(ev) { ev?.preventDefault?.(); if (this._luckToSpend > 0)                    { this._luckToSpend--; this.render(); } }

    static _onRoll(ev) { ev?.preventDefault?.(); this._executeRoll(); }

    _adjustStrength(delta) {
        // Strength floor is 1 — a strength-0 drug has no meaningful
        // pharmacology (multiplier lookup starts at 1) and the design
        // math would zero out every effect contribution.
        const next = Math.max(1, Math.min(6, this._state.strength + delta));
        if (next === this._state.strength) return;
        this._state.strength = next;
        this.render();
    }

    async _prepareContext(_opts) {
        // Pharmaceuticals(2) discovery. When missing the dialog renders
        // the "no skill" state and hides everything else — the check
        // can't happen without it.
        const skill = findPharmacySkill(this.actor);
        this._skill = skill;

        // Each effect row gets a single-letter tier chip (P/S/A/C) and
        // a "Name +Value" label combining registry label + signed value
        // so the middle bar reads as one line. Casing preserved as-is;
        // the SCSS controls whether it uppercases at render time.
        const orderedEffects = orderEffects(this._state.effects).map(e => {
            const meta = lookupEffect(e.tier, e.key);
            const value = meta?.value ?? 0;
            return {
                tier: e.tier,
                key:  e.key,
                tierChip: tierChipFor(e.tier),
                labelLine: `${meta?.label ?? e.key} ${fmtSigned(value)}`
            };
        });

        const costTotal = computeCostTotal(this._state);
        const diffTotal = computeDifficultyTotal(this._state);
        const diff      = difficultyForTotal(diffTotal);

        return {
            title: this.title,
            hasSkill: !!skill,
            strength: this._state.strength,
            canStrengthPlus:  this._state.strength < 6,
            canStrengthMinus: this._state.strength > 1,
            effects: orderedEffects,
            // Each dropdown row renders as a native <select> with the
            // "LABEL ±VALUE" formatting in the display. `selected` drives
            // the current option's marked state; option `label` is the
            // uppercased combined string.
            methodOptions:    METHOD_OPTIONS.map(o => ({ key: o.key, label: `${o.label} ${fmtSigned(o.value)}`, selected: o.key === this._state.method })),
            detectionOptions: DETECTION_OPTIONS.map(o => ({ key: o.key, label: `${o.label} ${fmtSigned(o.value)}`, selected: o.key === this._state.detection })),
            residueOptions:   RESIDUE_OPTIONS.map(o => ({ key: o.key, label: `${o.label} ${fmtSigned(o.value)}`, selected: o.key === this._state.residue })),
            onsetOptions:     ONSET_DURATION_OPTIONS.map(o => ({ key: o.key, label: `${o.label} ${fmtSigned(o.value)}`, selected: o.key === this._state.onset })),
            costDisplay:   costDisplayForTotal(costTotal),
            difficultyLine: `${labelForDifficulty(diff.dv)} / ${diff.dv}`,
            luckToSpend: this._luckToSpend,
            availableLuck: this._availableLuck,
            canIncreaseLuck: this._luckToSpend < this._availableLuck,
            canDecreaseLuck: this._luckToSpend > 0,
            hasAnyLuck: this._availableLuck > 0
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const header = this.element.querySelector('.reload-header');
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
        }

        // Feature dropdowns write straight back into state and re-render
        // so Cost / Difficulty reflect the new values immediately.
        for (const [selector, field] of [
            ['.dd-method',    'method'],
            ['.dd-detection', 'detection'],
            ['.dd-residue',   'residue'],
            ['.dd-onset',     'onset']
        ]) {
            const el = this.element.querySelector(selector);
            if (!el) continue;
            el.addEventListener('change', (ev) => {
                this._state[field] = ev.currentTarget.value;
                this.render();
            });
        }
    }

    async _executeRoll() {
        if (!this._skill) {
            ui.notifications.warn(localize("DrugDesignNoSkill"));
            return;
        }

        // One actor.update batches both the luck spend and the
        // material cost — same broadcast, one round-trip. Materials
        // are debited regardless of roll outcome (a failed synthesis
        // still burns the reagents).
        const cost = priceForCostTotal(computeCostTotal(this._state));
        const eb = Number(this.actor.system?.gear?.eurobucks) || 0;
        const spendUpdate = { "system.gear.eurobucks": eb - cost };
        if (this._luckToSpend > 0) {
            const cur = this.actor.system.stats.luck.spent || 0;
            const curAt = this.actor.system.stats.luck.spentAt;
            spendUpdate["system.stats.luck.spent"] = cur + this._luckToSpend;
            spendUpdate["system.stats.luck.spentAt"] = curAt || Date.now();
        }
        await this.actor.update(spendUpdate);

        const diff = difficultyForTotal(computeDifficultyTotal(this._state));
        this.close({ animate: false });

        const outcome = await this.actor.rollSkillCheck(
            this._skill.id,
            diff.dv,
            this._luckToSpend
        );

        if (outcome?.success) {
            const payload = buildDrugSystemPayload(this._state, this.actor.name);
            const name = generateDrugName();
            await Item.create({
                name,
                type: "drug",
                img: "systems/cyberpunk/img/svg/placeholder-drug.svg",
                system: payload
            }, { parent: this.actor });
            ui.notifications.info(localize("DrugDesignSuccess", { name }));
        }
    }
}

/** Localized difficulty label ("Easy", "Average", …) from the DV. */
function labelForDifficulty(dv) {
    if (dv <= 10) return localize("DifficultyEasy");
    if (dv <= 15) return localize("DifficultyAverage");
    if (dv <= 20) return localize("DifficultyDifficult");
    if (dv <= 25) return localize("DifficultyVeryDifficult");
    if (dv <= 30) return localize("DifficultyNearImpossible");
    return localize("DifficultyImpossible");
}

/** Single-letter chip shown at the start of each Effects row. */
function tierChipFor(tier) {
    return { primary: "P", secondary: "S", after: "A", cumulative: "C" }[tier] ?? "?";
}

/** Fun placeholder name so the created drug reads as a real batch. */
function generateDrugName() {
    const prefix = ["Neo", "Bio", "Chrom", "Syn", "Zyx", "Hyper", "Rip", "Static"];
    const suffix = ["dust", "juice", "bloom", "surge", "haze", "spike", "wash", "burn"];
    const p = prefix[Math.floor(Math.random() * prefix.length)];
    const s = suffix[Math.floor(Math.random() * suffix.length)];
    return `${p}${s}`;
}

/**
 * Entry point for the scene-controls tool. Resolves the target actor
 * per selection rules; toasts and bails if nothing usable is found.
 */
export function openDrugDesignDialog() {
    const actor = resolveActor();
    if (!actor) {
        ui.notifications.warn(localize("DrugDesignNoActor"));
        return;
    }
    new DrugDesignDialog(actor).render(true);
}
