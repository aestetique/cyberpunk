export function registerSystemSettings() {
  /** Last system version that ran migrations */
  game.settings.register("cyberpunk", "systemMigrationVersion", {
    name: "SETTINGS.SysMigration",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  /**
   * Campaign start date (text input, parsed as UTC date)
   */
  game.settings.register("cyberpunk", "campaignStartDate", {
    name: "SETTINGS.CampaignStartDate",
    hint: "SETTINGS.CampaignStartDateHint",
    scope: "world",
    config: true,
    type: String,
    default: "2045-01-01 00:00:00"
  });

  /**
   * Game time offset from campaign start (ms). Hidden setting.
   * onChange: drug effects key their phase-expiration to this clock, so any
   * advancement (combat round, calendar dialog) re-checks every active drug
   * effect for wear-off / phase swap. Runs on the active GM only.
   */
  game.settings.register("cyberpunk", "gameTimeOffset", {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: async () => {
      const { checkDrugEffectExpiration } = await import("./drug-effects.js");
      const { checkNetwareEffectExpiration } = await import("./netrun/netware-effects.js");
      await Promise.all([checkDrugEffectExpiration(), checkNetwareEffectExpiration()]);
      // Refresh any open actor sheet with a live drug row so the
      // remaining-time chip in the State tab ticks with the clock,
      // not only when a phase actually swaps. Fires on every client
      // (the setting is world-scoped, so onChange runs everywhere) so
      // each player's open sheet reflects the new time.
      for (const app of Object.values(ui.windows)) {
        if (app?.actor?.effects?.some?.(e => (e.getFlag?.("cyberpunk", "isDrugEffect") === true || e.getFlag?.("cyberpunk", "isNetwareEffect") === true))) {
          app.render(false);
        }
      }
      const v2Registry = foundry.applications?.instances;
      if (v2Registry) {
        for (const app of v2Registry.values()) {
          const actor = app?.document?.documentName === "Actor" ? app.document : null;
          if (actor?.effects?.some?.(e => (e.getFlag?.("cyberpunk", "isDrugEffect") === true || e.getFlag?.("cyberpunk", "isNetwareEffect") === true))) {
            app.render(false);
          }
        }
      }
    }
  });

  /** Drug Mixing automation — a reaction roll whenever a drug meets another one in the system. */
  game.settings.register("cyberpunk", "drugMixing", {
    name: "SETTINGS.DrugMixing",
    hint: "SETTINGS.DrugMixingHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  /** Overdose automation — a roll on the Overdose table at 30 / Strength doses. */
  game.settings.register("cyberpunk", "drugOverdose", {
    name: "SETTINGS.DrugOverdose",
    hint: "SETTINGS.DrugOverdoseHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  /**
   * Remembered drug reactions — the rules repeat a pair's mixing result and
   * a drug's overdose result for everyone. Hidden; written by the active
   * GM's client (see persistReactionMemory in drug-effects.js).
   * Shape: { pairs: { "black lace|boost": { band, winner } }, overdoses: { "boost": band } }
   */
  game.settings.register("cyberpunk", "drugReactions", {
    scope: "world",
    config: false,
    type: Object,
    default: { pairs: {}, overdoses: {} },
    onChange: async (value) => {
      const { syncPendingDrugMemory } = await import("./drug-effects.js");
      syncPendingDrugMemory(value);
    }
  });
}
