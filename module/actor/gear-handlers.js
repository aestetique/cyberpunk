import { localize } from "../utils.js";
import { fireModes, meleeAttackTypes, buildMartialModifierGroups, resolveWeaponDiscriminator } from "../lookups.js";
import { RangedAttackDialog } from "../dialog/ranged-attack-dialog.js";
import { RangeSelectionDialog } from "../dialog/range-selection-dialog.js";
import { MeleeAttackDialog } from "../dialog/melee-attack-dialog.js";
import { OrdnanceAttackDialog } from "../dialog/ordnance-attack-dialog.js";
import { UnarmedAttackDialog } from "../dialog/unarmed-attack-dialog.js";
import { ModifiersDialog } from "../dialog/modifiers.js";

function weaponTypeOf(item) {
    const sys = item?.weaponData || item?.system || {};
    return resolveWeaponDiscriminator(sys).weaponType || "";
}

/**
 * Show the standard "out of charges/ammo" mini-dialog.
 */
function showEmptyChargesDialog(item, messageKey = "OutOfCharges") {
    const dialog = new Dialog({
        title: item.name,
        content: `
            <div class="ranged-attack-wrapper">
              <header class="reload-header">
                <span class="reload-title">${item.name}</span>
                <a class="header-control close"><i class="fas fa-times"></i></a>
              </header>
              <div class="reload-empty">${game.i18n.localize("CYBERPUNK." + messageKey)}</div>
            </div>
        `,
        buttons: {},
        render: html => {
            html.find('.header-control.close').click(() => dialog.close());
            const header = html.find('.reload-header')[0];
            if (header) new foundry.applications.ux.Draggable.implementation(dialog, html, header, false);
        }
    }, {
        width: 300,
        classes: ["cyberpunk", "ranged-attack-dialog"]
    });
    dialog.render(true);
}

/**
 * Wire gear-row click handlers shared between the character sheet and the drone sheet.
 */
export function bindWeaponAndOrdnanceHandlers(html, sheet) {
    const actor = sheet.actor;

    // View item
    html.find('.gear-view').click(ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const item = actor.items.get(itemId);
        if (item) item.sheet.render(true);
    });

    // Delete item
    html.find('.gear-delete').click(ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const item = actor.items.get(itemId);
        if (!item) return;

        new Dialog({
            title: localize("ItemDeleteConfirmTitle"),
            content: `<p>${localize("ItemDeleteConfirmText", { itemName: item.name })}</p>`,
            buttons: {
                yes: {
                    label: localize("Yes"),
                    callback: () => item.delete()
                },
                no: { label: localize("No") }
            },
            default: "no"
        }).render(true);
    });

    // Reload — refill from attached ammo pile (no dialog).
    // For drone/Foundry-loop reasons, the reload button is hidden when no ammo attached.
    html.find('.reload-weapon').click(async ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const canReload = ev.currentTarget.dataset.canReload === 'true';
        if (!canReload) return;
        const item = actor.items.get(itemId);
        if (!item) return;

        // New model: reload from currently-attached ammo pile.
        if (typeof item._reloadFromAttached === "function") {
            const did = await item._reloadFromAttached();
            if (!did) {
                ui.notifications.warn(localize("NoAmmoAttached"));
                return;
            }
            const { registerAction } = await import("../action-tracker.js");
            await registerAction(actor, `reload (${item.name})`);
            return;
        }
        // Fallback: top up to max (cyberweapon / legacy data without _reloadFromAttached available)
        const maxShots = item.weaponData?.shots ?? 0;
        await actor.updateEmbeddedDocuments("Item", [{
            _id: itemId,
            [item._weaponUpdatePath("shotsLeft")]: maxShots
        }]);
    });

    // Detach attached ammo
    html.find('.gear-detach-ammo').click(async ev => {
        ev.stopPropagation();
        const weaponId = ev.currentTarget.dataset.itemId;
        const weapon = actor.items.get(weaponId);
        if (!weapon || typeof weapon._detachAmmo !== "function") return;
        await weapon._detachAmmo();
    });

    // Quantity input — shared by ammo and drug.
    html.find('.gear-quantity-input').click(ev => ev.target.select()).change(async ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        const newQty = Math.max(0, Number(ev.currentTarget.value) || 0);
        await actor.updateEmbeddedDocuments("Item", [{
            _id: itemId,
            "system.quantity": newQty
        }]);
    });

    // Charge: Exotic only. Ordnance no longer rechargeable (1-shot).
    html.find('.charge-weapon').click(async ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const canCharge = ev.currentTarget.dataset.canCharge === 'true';
        if (!canCharge) return;

        const item = actor.items.get(itemId);
        if (!item) return;

        const wType = weaponTypeOf(item);
        // Ordnance: not rechargeable
        if (wType === "Ordnance") return;

        const chargesMax = item.weaponData?.chargesMax ?? item.system?.chargesMax ?? 0;
        const updatePath = item._weaponUpdatePath ? item._weaponUpdatePath("charges") : "system.charges";
        await item.update({ [updatePath]: chargesMax });

        const { registerAction } = await import("../action-tracker.js");
        await registerAction(actor, `charge weapon (${item.name})`);
    });

    // Fire weapon — dispatches on the unified weaponType discriminator
    html.find('.gear-fire-weapon').click(ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId === "unarmed") {
            new UnarmedAttackDialog(actor).render(true);
            return;
        }
        const item = actor.items.get(itemId);
        if (!item) return;

        const targetTokens = Array.from(game.users.current.targets.values()).map(target => ({
            name: target.document.name,
            id: target.id
        }));

        const wType = weaponTypeOf(item);

        // Any AoE weapon — Ordnance, Exotic w/ template, Ranged w/ grenade ammo.
        if (typeof item._isAreaWeapon === "function" && item._isAreaWeapon()) {
            // Exotic still needs the charges check before opening the dialog
            if (wType === "Exotic") {
                const charges = Number(item.weaponData?.charges) || 0;
                if (charges <= 0) { showEmptyChargesDialog(item); return; }
            }
            new OrdnanceAttackDialog(actor, item, targetTokens).render(true);
            return;
        }

        // Exotic without template — charges check, then fire-mode picker (RoF-aware).
        if (wType === "Exotic") {
            const charges = Number(item.weaponData?.charges) || 0;
            if (charges <= 0) { showEmptyChargesDialog(item); return; }
            // RoF > 1 → mode picker (RangedAttackDialog), else single via RangeSelectionDialog
            const rof = Number(item.weaponData?.rof) || 1;
            if (rof > 1) {
                new RangedAttackDialog(actor, item, targetTokens).render(true);
            } else {
                new RangeSelectionDialog(actor, item, fireModes.singleShot, targetTokens).render(true);
            }
            return;
        }

        // Ranged (non-grenade ammo)
        if (wType === "Ranged") {
            new RangedAttackDialog(actor, item, targetTokens).render(true);
            return;
        }

        // Martial (Melee / Bow / Crossbow / Sling)
        if (wType === "Martial") {
            if (item.weaponData?.attackType === meleeAttackTypes.martial) {
                const modifierGroups = buildMartialModifierGroups(actor);
                const dialog = new ModifiersDialog(actor, {
                    weapon: item,
                    targetTokens: targetTokens,
                    modifierGroups: modifierGroups,
                    onConfirm: (fireOptions) => item._resolveAttack(fireOptions, targetTokens)
                });
                dialog.render(true);
                return;
            }
            new MeleeAttackDialog(actor, item, targetTokens).render(true);
            return;
        }
    });

    // Back-compat: ordnance partials still emit .gear-fire-ordnance; route to same dialog.
    html.find('.gear-fire-ordnance').click(ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const item = actor.items.get(itemId);
        if (!item) return;

        const targetTokens = Array.from(game.users.current.targets.values()).map(target => ({
            name: target.document.name,
            id: target.id
        }));

        new OrdnanceAttackDialog(actor, item, targetTokens).render(true);
    });
}
