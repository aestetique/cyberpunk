import { setByPath, localize } from "../utils.js"
import { defaultTargetLocations } from "../lookups.js"

/**
 * A specialized form used to select the modifiers for shooting with a weapon
 * This could, I guess, also be done with dialog and FormDataExtended
 * @implements {FormApplication}
 */
 export class ModifiersDialog extends FormApplication {

    /** @override */
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
        id: "weapon-modifier",
        classes: ["cyberpunk"],
        title: localize("AttackModifiers"),
        template: "systems/cyberpunk/templates/dialog/modifiers.hbs",
        width: 500,
        height: "auto",
        weapon: null,
        // Use like [[mod1, mod2], [mod3, mod4, mod5]] etc to add groupings,
        modifierGroups: [],
        targetTokens: [], // id and name for each target token
        // Extra mod field for miscellaneous mod
        extraMod: true,
        showAdvDis: false,
        advantage: false,
        disadvantage: false,
        closeOnSubmit: false,

        onConfirm: () => {}
      });
    }
  
    /* -------------------------------------------- */
  
    /**
     * Return a reference to the target attribute
     * @type {String}
     */
    get attribute() {
        return this.options.name;
    }
  
    /* -------------------------------------------- */
  
    /** @override */
    getData() {
      const groups = JSON.parse(JSON.stringify(this.options.modifierGroups || []));

      if (this.options.extraMod) {
        const already = groups.some(g =>
          g.some(m => m.dataPath === "extraMod"));
        if (!already) {
          groups.push([{
            localKey: "ExtraModifiers",
            dataPath: "extraMod",
            defaultValue: 0
          }]);
        }
      }

      const defaultValues = {};
      groups.forEach(group => {
        group.forEach(mod => {
          // path towards modifier's field template
          mod.fieldPath = `fields/${mod.choices ? "select" : typeof mod.defaultValue}`;
          setByPath(defaultValues, mod.dataPath,
            mod.defaultValue !== undefined ? mod.defaultValue : "");
        });
      });

      return {
        modifierGroups: groups,
        targetTokens: this.options.targetTokens,
        defaultValues,
        isRanged: this.options.weapon?.isRanged?.() ?? false,
        shotsLeft: this.options.weapon?.system.shotsLeft ?? 0,
        showAdvDis: this.options.showAdvDis,
        advantage: this.options.advantage,
        disadvantage: this.options.disadvantage
      };
    }

    /** @override */
    activateListeners(html) {
      super.activateListeners(html);

      // RELOAD
      html.find(".reload").on("click", async (ev) => {
        ev.preventDefault();
        const weapon = this.options.weapon;
        if (!weapon) return;

        await weapon.update({ "system.shotsLeft": weapon.system.shots });
        ui.notifications.info(localize("Reloaded"));

        const shots = weapon.system.shots;
        this.options.weapon.system.shotsLeft = shots;

        html.find('input.number[readonly]').val(shots);
      });

      // Advantage/Disadvantage
      html.find('input.adv, input.dis').on("change", ev => {
        const $el = $(ev.currentTarget);
        if ($el.hasClass("adv") && $el.prop("checked")) html.find("input.dis").prop("checked", false);
        if ($el.hasClass("dis") && $el.prop("checked")) html.find("input.adv").prop("checked", false);
      });

    }
  
    /** @override */
    async _updateObject(event, formData) {
      this.object = formData;
      const fired = await this.options.onConfirm(this.object);

      // Register weapon attack action AFTER executing
      if (fired !== false && this.options.weapon) {
        const { registerAction } = await import("../action-tracker.js");
        await registerAction(this.actor, `weapon attack (${this.options.weapon.name})`);
      }

      if (fired !== false) this.close();
    }
 }