/**
 * Shop trading — buy / sell logic. Mirrors the cross-character transfer flow
 * but layers eurobucks movement on top, and posts a different chat message.
 *
 * Conceptually buying is "shop → buyer" with eddies going "buyer → shop",
 * and selling is the inverse. Both flow through `executeTrade()`.
 */
import { MoveItemsDialog } from "../dialog/move-items-dialog.js";
import { detachAllChildren, isStackable, findMergeTarget } from "./item-transfer.js";
import { renderTemplateCompat } from "../utils.js";

const EUROBUCKS_PATH = "system.gear.eurobucks";

/**
 * Express a tradeable item in "trade unit" terms.
 *   drug   → 1 unit = 1 dose,        perUnitRounds = 1
 *   ammo   → 1 unit = 1 pack,        perUnitRounds = packSize
 *   other  → 1 unit = 1 item,        perUnitRounds = 1
 * The Buy / Sell quantity dialog is bounded by `units`, and the actor's
 * underlying `system.quantity` field is mutated by `tradeQty * perUnitRounds`.
 * `priceMultiplier` (e.g. 0.75 for a 75 % sell shop) scales the per-unit cost
 * — must be applied here, not at the display layer, so the price the buyer
 * sees is exactly the price they're charged.
 */
function tradeUnitInfo(item, priceMultiplier = 1) {
  const baseCost = Number(item.system?.cost) || 0;
  const cost = Math.max(0, Math.round(baseCost * priceMultiplier));
  if (item.type === "drug") {
    return {
      units: Math.max(1, Number(item.system?.quantity) || 1),
      perUnitRounds: 1,
      perUnitCost: cost
    };
  }
  if (item.type === "weapon" && item.system?.weaponType === "Ammo") {
    const packSize = Math.max(1, Number(item.system?.packSize) || 1);
    const total = Math.max(packSize, Number(item.system?.quantity) || packSize);
    return {
      units: Math.max(1, Math.floor(total / packSize)),
      perUnitRounds: packSize,
      perUnitCost: cost
    };
  }
  return { units: 1, perUnitRounds: 1, perUnitCost: cost };
}

/** Read the shop's price multiplier for the given side ("buy" or "sell"). */
function shopPriceMultiplier(shop, side) {
  const key = side === "buy" ? "buyPricePct" : "sellPricePct";
  const raw = shop?.system?.settings?.[key];
  const pct = Math.max(1, Math.min(200, Number(raw) || (side === "buy" ? 100 : 50)));
  return pct / 100;
}

function getEurobucks(actor) {
  return Number(actor.system?.gear?.eurobucks) || 0;
}

/**
 * Sellable means "not currently in active use" — equipped off, drug not in
 * the active phase, and not currently attached to a parent item.
 */
export function isSellable(item) {
  if (item.system?.equipped) return false;
  if (item.type === "drug" && item.system?.phase === "active") return false;
  if (item.getFlag?.("cyberpunk", "attachedTo")) return false;
  return true;
}

/**
 * Same factory-reset rules as a cross-actor transfer, kept local so this
 * module doesn't have to import the cross-actor helpers. Keep in sync.
 */
function resetForTrade(data) {
  if (!data?.system) return;
  const s = data.system;
  data.system.equipped = false;
  switch (data.type) {
    case "weapon": {
      if (s.shots != null) data.system.shotsLeft = s.shots;
      if (s.chargesMax)    data.system.charges   = s.chargesMax;
      if (s.attachedAmmoId) {
        data.system.attachedAmmoId = "";
        data.system.shotsLeft = 0;
      }
      break;
    }
    case "armor": {
      if (s.coverage) {
        for (const loc of Object.keys(s.coverage)) {
          if (data.system.coverage[loc]) data.system.coverage[loc].ablation = 0;
        }
      }
      break;
    }
    case "cyberware": {
      if (s.structure?.max) data.system.structure.current = s.structure.max;
      data.system.humanityLoss = 0;
      data.system.humanityRolled = false;
      if (s.weapon?.shots != null) data.system.weapon.shotsLeft = s.weapon.shots;
      if (s.weapon?.chargesMax)    data.system.weapon.charges   = s.weapon.chargesMax;
      if (s.weapon?.attachedAmmoId) {
        data.system.weapon.attachedAmmoId = "";
        data.system.weapon.shotsLeft = 0;
      }
      break;
    }
  }
  // Strip attachment flag — items in a shop are unattached.
  const flagsCp = foundry.utils.getProperty(data, "flags.cyberpunk");
  if (flagsCp && "attachedTo" in flagsCp) delete flagsCp.attachedTo;
}

/**
 * Move `qty` units of `sourceItem` from its owner to `targetActor`,
 * factory-resetting along the way. Stackable items decrement or delete the
 * source row; non-stackable items detach any attached children (they stay
 * with the seller) and move the parent alone.
 */
async function moveItemForTrade(sourceItem, targetActor, qty) {
  const sourceActor = sourceItem.parent;
  const stackable = isStackable(sourceItem);
  const sourceQty = stackable ? (Number(sourceItem.system?.quantity) || 1) : 1;

  if (stackable) {
    if (qty < sourceQty) {
      await sourceActor.updateEmbeddedDocuments("Item", [{
        _id: sourceItem.id,
        "system.quantity": sourceQty - qty
      }]);
    } else {
      await sourceActor.deleteEmbeddedDocuments("Item", [sourceItem.id]);
    }
    const existing = findMergeTarget(sourceItem, targetActor);
    if (existing) {
      const newQty = (Number(existing.system?.quantity) || 0) + qty;
      await targetActor.updateEmbeddedDocuments("Item", [{
        _id: existing.id,
        "system.quantity": newQty
      }]);
    } else {
      const data = sourceItem.toObject();
      resetForTrade(data);
      data.system.quantity = qty;
      delete data._id;
      await targetActor.createEmbeddedDocuments("Item", [data]);
    }
  } else {
    // Detach attachments — they remain on the source actor — then move only
    // the parent. Mirrors "weapons are sold unloaded" / "options stay with
    // the seller" from the spec.
    await detachAllChildren(sourceItem);
    const data = sourceItem.toObject();
    delete data._id;
    resetForTrade(data);
    await sourceActor.deleteEmbeddedDocuments("Item", [sourceItem.id]);
    await targetActor.createEmbeddedDocuments("Item", [data]);
  }
}

/**
 * Adjust both actor tills by the trade total. Buying: buyer pays, shop
 * receives. Selling: shop pays, seller receives.
 */
async function transferEurobucks(payer, payee, amount) {
  const payerBalance = getEurobucks(payer);
  const payeeBalance = getEurobucks(payee);
  await payer.update({ [EUROBUCKS_PATH]: Math.max(0, payerBalance - amount) });
  await payee.update({ [EUROBUCKS_PATH]: payeeBalance + amount });
}

/**
 * Post a Bought/Sold chat message from the buying/selling CHARACTER (not the
 * shop). Sections reuse the existing section-bar partial and target-info
 * styling so the look matches Gave / To from the cross-character transfer.
 *
 * @param {"buy"|"sell"} mode
 */
async function postTradeMessage(mode, character, shop, item, count) {
  const content = await renderTemplateCompat(
    "systems/cyberpunk/templates/chat/item-trade.hbs",
    {
      // Resolved labels (template can't do inline if/ternary, so we pick here)
      actionLabel: game.i18n.localize(mode === "buy" ? "CYBERPUNK.Bought" : "CYBERPUNK.Sold"),
      partyLabel:  game.i18n.localize(mode === "buy" ? "CYBERPUNK.From"   : "CYBERPUNK.To"),
      itemImg:    item.img,
      itemName:   item.name,
      count,
      shopImg:    shop.img,
      shopName:   shop.name
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: character }),
    content
  });
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Buy `item` from `shop` on behalf of `buyer`. Pops the Buy Items dialog
 * for stackables with more than one trade unit. Cost is `perUnitCost × tradeQty`;
 * underlying quantity moved is `tradeQty × perUnitRounds` (so an ammo pack of
 * 20 transfers 20 rounds per pack). Returns true on success, false if
 * cancelled or unaffordable.
 */
export async function buyItem(buyer, shop, item) {
  if (!buyer || !shop || !item) return false;
  const { units, perUnitRounds, perUnitCost } = tradeUnitInfo(item, shopPriceMultiplier(shop, "buy"));

  let tradeQty = 1;
  if (units > 1) {
    const dlg = new MoveItemsDialog(units, item.name, {
      titleKey: "BuyItemsTitle",
      buttonKey: "Buy"
    });
    tradeQty = await dlg.prompt();
    if (tradeQty == null) return false;
    tradeQty = Math.min(units, Math.max(1, Math.floor(tradeQty)));
  }

  const total = perUnitCost * tradeQty;
  if (getEurobucks(buyer) < total) {
    ui.notifications.warn(game.i18n.localize("CYBERPUNK.NotEnoughEurobucks"));
    return false;
  }

  await transferEurobucks(buyer, shop, total);
  await moveItemForTrade(item, buyer, tradeQty * perUnitRounds);
  await postTradeMessage("buy", buyer, shop, item, tradeQty);
  return true;
}

/**
 * Sell `item` from `seller` to `shop`. Same trade-unit logic as `buyItem`;
 * weapons / armor / cyberware get their attachments detached (children stay
 * with the seller), then the clean parent moves to the shop.
 */
export async function sellItem(seller, shop, item) {
  if (!seller || !shop || !item) return false;
  const { units, perUnitRounds, perUnitCost } = tradeUnitInfo(item, shopPriceMultiplier(shop, "sell"));

  let tradeQty = 1;
  if (units > 1) {
    const dlg = new MoveItemsDialog(units, item.name, {
      titleKey: "SellItemsTitle",
      buttonKey: "Sell"
    });
    tradeQty = await dlg.prompt();
    if (tradeQty == null) return false;
    tradeQty = Math.min(units, Math.max(1, Math.floor(tradeQty)));
  }

  const total = perUnitCost * tradeQty;
  if (getEurobucks(shop) < total) {
    ui.notifications.warn(game.i18n.localize("CYBERPUNK.ShopCantAfford"));
    return false;
  }

  await transferEurobucks(shop, seller, total);
  await moveItemForTrade(item, shop, tradeQty * perUnitRounds);
  await postTradeMessage("sell", seller, shop, item, tradeQty);
  return true;
}
