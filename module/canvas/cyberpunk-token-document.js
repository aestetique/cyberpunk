/**
 * Cyberpunk-flavoured TokenDocument subclass. Mirrors the pattern D&D 5e
 * uses in TokenDocument5e (`module/documents/token.mjs` — 6.0.x): override
 * `_prepareDetectionModes` to seed sight fields from the actor's
 * derived senses BEFORE calling super, so the base class's basicSight
 * default (`range = this.sight.range`) picks up our derived range and
 * `sight.visionMode` is set to the granted mode.
 *
 * Bonuses `grantLowLight`, `grantInfrared`, `grantThermo` accumulate on
 * the actor via the standard toolBonusProperties pipeline. This subclass
 * translates whichever is active into the corresponding sight config.
 *
 *   • Low Light — amplifier. Requires ambient light (globalLight or a
 *     placed light source) to work. No sight-cone radius; just tags the
 *     vision mode so its shader applies to whatever the token can
 *     already perceive.
 *   • Infrared / Thermo — see in true darkness. Sight cone extended to
 *     the canvas maxR so the mode's shader paints the whole visible
 *     field, and basicSight range follows so other tokens are detected.
 *
 * Explicit sight config on the token (range > 0, visionMode !== "basic")
 * wins over the actor-derived override — GMs can pin per-token vision
 * without the grant interfering.
 */

const { TokenDocument } = foundry.documents;

export class CyberpunkTokenDocument extends TokenDocument {

    /** @inheritDoc */
    _prepareDetectionModes() {
        this._applyCyberpunkVisionGrants();
        super._prepareDetectionModes();
    }

    /**
     * Read actor-side vision grants and apply them to this token's
     * `sight` fields. Runs before super so basicSight seeds from the
     * derived sight range.
     * @protected
     */
    _applyCyberpunkVisionGrants() {
        const sys = this.actor?.system;
        if (!sys) return;
        const grantMode =
            Number(sys.grantThermo)   > 0 ? "thermo"   :
            Number(sys.grantInfrared) > 0 ? "infrared" :
            Number(sys.grantLowLight) > 0 ? "lowLight" : null;
        if (!grantMode) return;

        // Any explicit vision mode set on the token wins over the grant.
        if (this.sight.visionMode !== "basic") return;

        this.sight.enabled = true;
        this.sight.visionMode = grantMode;

        // Infrared / Thermo see in the dark within a bounded 60-unit
        // cone (rules-standard cyberware darkvision range). Bounded is
        // important — an unbounded cone hits a different render path.
        // Low Light does NOT extend sight; it relies on scene ambient
        // light to reach the token, so a total-darkness scene shows
        // nothing.
        if (grantMode !== "lowLight" && !(this.sight.range > 0)) {
            this.sight.range = 60;
        }
        // The vision cone's BackgroundVisionShader samples the primary
        // texture (colour intact) with `useSampler: true`, and its
        // saturation uniform comes from `data.saturation` — which
        // maps to `sight.saturation` in `_getVisionSourceData`. Setting
        // sight.saturation to -1 here desaturates what the cone paints
        // inside its radius (B&W); Foundry's illumination pipeline
        // still paints the original colour back within placed
        // light-source shapes on top. Thermo uses a custom cone shader
        // (ThermalBackgroundVisionShader) that ignores saturation and
        // replaces the colour path with a heat-palette LUT, so we
        // leave sight.saturation at 0 for it.
        if (grantMode === "infrared") this.sight.saturation = -1;
    }
}

/**
 * Actor-derived data (like our `system.grantThermo` from an equipped
 * item's bonus) doesn't automatically re-prepare dependent token
 * documents on mid-session changes — Foundry only auto-resets tokens
 * when ActiveEffects on the actor change. Register hooks that call
 * `TokenDocument#reset` on the actor's dependent tokens whenever an
 * item or effect changes, so `_prepareDetectionModes` (and our
 * `_applyCyberpunkVisionGrants` inside it) re-runs and picks up the
 * new derived sight config. Reset also triggers vision source re-init
 * through the standard perception refresh path.
 */
export function registerCyberpunkTokenRefreshHooks() {
    const refresh = (actor) => {
        if (actor?.documentName !== "Actor") return;
        for (const tokenDoc of actor.getDependentTokens?.() ?? []) {
            tokenDoc.reset();
        }
    };
    const fromEmbedded = (doc) => refresh(doc?.parent);
    Hooks.on("createItem",         fromEmbedded);
    Hooks.on("updateItem",         fromEmbedded);
    Hooks.on("deleteItem",         fromEmbedded);
    Hooks.on("createActiveEffect", fromEmbedded);
    Hooks.on("updateActiveEffect", fromEmbedded);
    Hooks.on("deleteActiveEffect", fromEmbedded);
}
