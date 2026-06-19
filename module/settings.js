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
      await checkDrugEffectExpiration();
    }
  });
}
