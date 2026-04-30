import { localize } from "../utils.js";
import { fireModes, meleeAttackTypes, weaponToAmmoType, buildMartialModifierGroups } from "../lookups.js";
import { ReloadDialog } from "../dialog/reload-dialog.js";
import { RangedAttackDialog } from "../dialog/ranged-attack-dialog.js";
import { RangeSelectionDialog } from "../dialog/range-selection-dialog.js";
import { MeleeAttackDialog } from "../dialog/melee-attack-dialog.js";
import { OrdnanceAttackDialog } from "../dialog/ordnance-attack-dialog.js";
import { UnarmedAttackDialog } from "../dialog/unarmed-attack-dialog.js";
import { ModifiersDialog } from "../dialog/modifiers.js";

/**
 * Show the standard "out of charges/ammo" mini-dialog matching the
 * ranged-attack dialog visual style.
 */
function showEmptyChargesDialog(item) {
    const dialog = new Dialog({
        title: item.name,
        content: `
            <div class="ranged-attack-wrapper">
              <header class="reload-header">
                <span class="reload-title">${item.name}</span>
                <a class="header-control close"><i class="fas fa-times"></i></a>
              </header>
              <div class="reload-empty">${game.i18n.localize("CYBERPUNK.OutOfCharges")}</div>
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
 * Wire the six gear-row click handlers shared between the character sheet
 * and the drone sheet:
 *   .gear-view, .gear-delete, .reload-weapon, .charge-weapon,
 *   .gear-fire-weapon, .gear-fire-ordnance
 *
 * @param {jQuery} html  Sheet HTML scope
 * @param {ActorSheet} sheet  The sheet instance (its .actor is read live)
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

    // Reload weapon
    html.find('.reload-weapon').click(async ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        const canReload = ev.currentTarget.dataset.canReload === 'true';
        if (!canReload) return;

        const item = actor.items.get(itemId);
        if (!item) return;

        const ammoWT = weaponToAmmoType[item.weaponData.weaponType];
        if (ammoWT) {
            new ReloadDialog(actor, item).render(true);
            return;
        }

        // Legacy instant reload for weapons without an ammo mapping
        const maxShots = item.weaponData.shots ?? 0;
        await actor.updateEmbeddedDocuments("Item", [{
            _id: itemId,
            [item._weaponUpdatePath("shotsLeft")]: maxShots
        }]);
    });

    // Ammo quantity input
    html.find('.ammo-quantity-input').change(async ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        const newQty = Math.max(0, Number(ev.currentTarget.value) || 0);
        await actor.updateEmbeddedDocuments("Item", [{
            _id: itemId,
            "system.quantity": newQty
        }]);
    });

    // Charge exotic weapon or rechargeable ordnance
    html.find('.charge-weapon').click(async ev => {
        const itemId = ev.currentTarget.dataset.itemId;
        const canCharge = ev.currentTarget.dataset.canCharge === 'true';
        if (!canCharge) return;

        const item = actor.items.get(itemId);
        if (!item) return;

        let chargesMax, updatePath;
        if (item.type === 'ordnance') {
            chargesMax = item.system.chargesMax ?? 0;
            updatePath = "system.charges";
        } else {
            chargesMax = item.weaponData.chargesMax ?? 0;
            updatePath = item._weaponUpdatePath("charges");
        }
        await item.update({ [updatePath]: chargesMax });

        const { registerAction } = await import("../action-tracker.js");
        await registerAction(actor, `charge weapon (${item.name})`);
    });

    // Fire weapon (icon or name click)
    html.find('.gear-fire-weapon').click(ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        if (itemId === "unarmed") {
            new UnarmedAttackDialog(actor).render(true);
            return;
        }
        const item = actor.items.get(itemId);
        if (!item) return;

        const isRanged = item.isRanged();
        const targetTokens = Array.from(game.users.current.targets.values()).map(target => ({
            name: target.document.name,
            id: target.id
        }));

        if (isRanged) {
            // Exotic weapons skip fire-mode selection (always single shot)
            if (item.weaponData.weaponType === "Exotic") {
                const charges = Number(item.weaponData.charges) || 0;
                if (charges <= 0) {
                    showEmptyChargesDialog(item);
                    return;
                }
                new RangeSelectionDialog(actor, item, fireModes.singleShot, targetTokens).render(true);
            } else {
                new RangedAttackDialog(actor, item, targetTokens).render(true);
            }
            return;
        }

        // Melee weapons
        if (item.weaponData.attackType === meleeAttackTypes.martial) {
            const modifierGroups = buildMartialModifierGroups(actor);
            const dialog = new ModifiersDialog(actor, {
                weapon: item,
                targetTokens: targetTokens,
                modifierGroups: modifierGroups,
                onConfirm: (fireOptions) => item._resolveAttack(fireOptions, targetTokens)
            });
            dialog.render(true);
        } else {
            new MeleeAttackDialog(actor, item, targetTokens).render(true);
        }
    });

    // Fire ordnance (icon or name click)
    html.find('.gear-fire-ordnance').click(ev => {
        ev.stopPropagation();
        const itemId = ev.currentTarget.dataset.itemId;
        const item = actor.items.get(itemId);
        if (!item) return;

        const targetTokens = Array.from(game.users.current.targets.values()).map(target => ({
            name: target.document.name,
            id: target.id
        }));

        const charges = Number(item.system.charges) || 0;
        if (charges <= 0) {
            showEmptyChargesDialog(item);
            return;
        }

        new OrdnanceAttackDialog(actor, item, targetTokens).render(true);
    });
}
