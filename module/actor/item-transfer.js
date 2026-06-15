/**
 * Cross-character item transfer.
 *
 * Detects when the user drags a gear item from one actor onto another and
 * runs a MOVE flow (decrement-or-delete on source, create-or-merge on target)
 * rather than the default Foundry clone. Stackable items pop a quantity
 * dialog; non-stackable items move whole, dragging any attached descendants
 * (ammo in a weapon, options on a cyberlimb / armor, programs in a deck)
 * along with them. A chat message is posted from the source actor.
 */
import { MoveItemsDialog } from "../dialog/move-items-dialog.js";

const TRANSFERRABLE_TYPES = new Set([
  "weapon", "armor", "cyberware", "netware", "drug", "tool", "misc"
]);

/** True for item types whose `quantity` field is meaningful. */
function isStackable(item) {
  if (item.type === "drug") return true;
  if (item.type === "weapon" && item.system?.weaponType === "Ammo") return true;
  return false;
}

/**
 * Should the actor-sheet drop handler delegate to the transfer flow?
 * Only true when the dropped item comes from a different gear-carrying actor
 * and is one of the transferrable types.
 */
export function shouldTransfer(droppedItem, targetActor) {
  if (!droppedItem || !targetActor) return false;
  if (!TRANSFERRABLE_TYPES.has(droppedItem.type)) return false;
  const source = droppedItem.parent;
  if (!source || source.id === targetActor.id) return false;
  if (source.documentName !== "Actor") return false;
  // Both character and drone hold gear inventories.
  if (source.type !== "character" && source.type !== "drone") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Attachment graph
// ---------------------------------------------------------------------------

/**
 * Walk the attachment graph rooted at `root` on `sourceActor`. Returns every
 * descendant (parent included) that should travel with the root in a single
 * batch. Two attachment mechanisms are handled:
 *   - `flags.cyberpunk.attachedTo` on an item points at its parent item ID
 *     (cyberware options, armor options, ammo-after-attach).
 *   - `system.attachedAmmoId` (weapon) or `system.weapon.attachedAmmoId`
 *     (cyberware / armor with embedded weapon) points at the ammo item.
 */
function collectAttachmentGroup(root) {
  const sourceActor = root.parent;
  const out = [];
  const seen = new Set();
  const queue = [root];
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur.id)) continue;
    seen.add(cur.id);
    out.push(cur);
    if (!sourceActor) continue;
    // 1. Flag-attached children
    for (const i of sourceActor.items) {
      if (seen.has(i.id)) continue;
      if (i.getFlag?.("cyberpunk", "attachedTo") === cur.id) queue.push(i);
    }
    // 2. Ammo referenced from this item's weapon block
    const ammoId = cur.system?.attachedAmmoId || cur.system?.weapon?.attachedAmmoId;
    if (ammoId && !seen.has(ammoId)) {
      const ammo = sourceActor.items.get(ammoId);
      if (ammo) queue.push(ammo);
    }
  }
  return out;
}

/**
 * Convert a live item into createEmbeddedDocuments data, applying the same
 * "factory reset" as a sidebar drop (equipped=false, ammo refilled, ablation
 * cleared, etc.). When `idMap` is provided, in-batch attachment refs are
 * REWRITTEN to the new IDs (instead of cleared), so the attachment graph
 * survives the move intact.
 */
function buildTransferData(item, idMap = null) {
  const data = item.toObject();
  if (idMap?.has(item.id)) data._id = idMap.get(item.id);

  if (!data.system) return data;
  data.system.equipped = false;
  const s = data.system;

  switch (data.type) {
    case "weapon": {
      if (s.shots != null)   data.system.shotsLeft = s.shots;
      if (s.chargesMax)      data.system.charges   = s.chargesMax;
      // Ammo attachment: keep when ammo travels with us, otherwise detach.
      const ammoId = s.attachedAmmoId;
      if (ammoId && idMap?.has(ammoId)) {
        data.system.attachedAmmoId = idMap.get(ammoId);
        // preserve current loaded shots — the magazine state IS the attachment state
        data.system.shotsLeft = item.system.shotsLeft ?? s.shotsLeft;
      } else if (ammoId) {
        data.system.attachedAmmoId = "";
        data.system.shotsLeft = 0;
      }
      // Ammo piles refill to pack size when dropped to a sidebar; for transfer
      // we DON'T do that — the moved quantity is whatever the dialog chose.
      break;
    }
    case "armor": {
      if (s.coverage) {
        for (const loc of Object.keys(s.coverage)) {
          if (data.system.coverage[loc]) data.system.coverage[loc].ablation = 0;
        }
      }
      // Armor-embedded weapon (e.g. headwear with a built-in gun): same rules.
      const ammoId = s.weapon?.attachedAmmoId;
      if (ammoId && idMap?.has(ammoId)) {
        data.system.weapon.attachedAmmoId = idMap.get(ammoId);
        data.system.weapon.shotsLeft = item.system.weapon?.shotsLeft ?? s.weapon.shotsLeft;
      } else if (ammoId) {
        data.system.weapon.attachedAmmoId = "";
        data.system.weapon.shotsLeft = 0;
      }
      break;
    }
    case "cyberware": {
      if (s.structure?.max) data.system.structure.current = s.structure.max;
      data.system.humanityLoss = 0;
      data.system.humanityRolled = false;
      if (s.weapon?.shots != null) data.system.weapon.shotsLeft = s.weapon.shots;
      if (s.weapon?.chargesMax)    data.system.weapon.charges   = s.weapon.chargesMax;
      const ammoId = s.weapon?.attachedAmmoId;
      if (ammoId && idMap?.has(ammoId)) {
        data.system.weapon.attachedAmmoId = idMap.get(ammoId);
        data.system.weapon.shotsLeft = item.system.weapon?.shotsLeft ?? s.weapon.shotsLeft;
      } else if (ammoId) {
        data.system.weapon.attachedAmmoId = "";
        data.system.weapon.shotsLeft = 0;
      }
      break;
    }
  }

  // Rewrite flags.cyberpunk.attachedTo when the parent is in the batch;
  // strip it otherwise (we're moving the option without its parent).
  const flaggedParent = foundry.utils.getProperty(data, "flags.cyberpunk.attachedTo");
  if (flaggedParent) {
    if (idMap?.has(flaggedParent)) {
      foundry.utils.setProperty(data, "flags.cyberpunk.attachedTo", idMap.get(flaggedParent));
    } else {
      // Unattached on target — strip the flag cleanly.
      const flagsCp = foundry.utils.getProperty(data, "flags.cyberpunk");
      if (flagsCp && "attachedTo" in flagsCp) delete flagsCp.attachedTo;
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Target-side merge
// ---------------------------------------------------------------------------

/**
 * Find an existing same-shape stack on the target actor that we should merge
 * into. Drugs stack by name; Ammo stacks by sourceUuid (matches the
 * single-actor drop logic in actor-sheet.js).
 */
/**
 * Find an existing same-shape stack on the target. Matches on semantic
 * identity (name + caliber + ammoType for ammo) rather than `uuid` — `uuid`
 * is per-actor and never matches across actors. `sourceUuid` is honoured
 * when both sides carry it (compendium drops) but never falls back to `uuid`.
 */
function findMergeTarget(sourceItem, targetActor) {
  const norm = (s) => (s ?? "").toString().trim().toLowerCase();
  if (sourceItem.type === "drug") {
    const srcName = norm(sourceItem.name);
    return targetActor.items.find(i =>
      i.type === "drug" && norm(i.name) === srcName
    );
  }
  if (sourceItem.type === "weapon" && sourceItem.system?.weaponType === "Ammo") {
    const srcUuid = sourceItem.system?.sourceUuid;
    if (srcUuid) {
      const byUuid = targetActor.items.find(i =>
        i.type === "weapon" &&
        i.system?.weaponType === "Ammo" &&
        i.system?.sourceUuid === srcUuid
      );
      if (byUuid) return byUuid;
    }
    const srcName = norm(sourceItem.name);
    const srcCaliber = sourceItem.system?.caliber || "";
    const srcAmmoType = sourceItem.system?.ammoType || "";
    return targetActor.items.find(i =>
      i.type === "weapon" &&
      i.system?.weaponType === "Ammo" &&
      norm(i.name) === srcName &&
      (i.system?.caliber || "") === srcCaliber &&
      (i.system?.ammoType || "") === srcAmmoType
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

/**
 * Run the transfer. Pops a quantity dialog when the item is stackable AND
 * has more than 1 unit to give. For non-stackable items, the attachment
 * graph (parent + descendants) travels together. Returns true if the drop
 * should be considered handled.
 */
export async function transferItem(sourceItem, targetActor) {
  const stackable = isStackable(sourceItem);
  const sourceQty = stackable ? (Number(sourceItem.system?.quantity) || 1) : 1;

  let moveQty = 1;
  if (stackable && sourceQty > 1) {
    const dialog = new MoveItemsDialog(sourceQty, sourceItem.name);
    moveQty = await dialog.prompt();
    if (moveQty == null) return true; // user dismissed — eat the drop
    moveQty = Math.min(sourceQty, Math.max(1, Math.floor(moveQty)));
  }

  const sourceActor = sourceItem.parent;

  if (stackable) {
    // Stackable items don't carry attachments; quantity slice handles everything.
    if (moveQty < sourceQty) {
      await sourceActor.updateEmbeddedDocuments("Item", [{
        _id: sourceItem.id,
        "system.quantity": sourceQty - moveQty
      }]);
    } else {
      await sourceActor.deleteEmbeddedDocuments("Item", [sourceItem.id]);
    }
    const existing = findMergeTarget(sourceItem, targetActor);
    if (existing) {
      const newQty = (Number(existing.system?.quantity) || 0) + moveQty;
      await targetActor.updateEmbeddedDocuments("Item", [{
        _id: existing.id,
        "system.quantity": newQty
      }]);
    } else {
      const data = buildTransferData(sourceItem);
      data.system.quantity = moveQty;
      delete data._id; // let target generate a fresh id for the standalone stack
      await targetActor.createEmbeddedDocuments("Item", [data]);
    }
  } else {
    // Move the whole attachment group as one batch with rewritten cross-refs.
    const group = collectAttachmentGroup(sourceItem);
    const idMap = new Map();
    for (const it of group) idMap.set(it.id, foundry.utils.randomID(16));
    const batch = group.map(it => buildTransferData(it, idMap));
    await targetActor.createEmbeddedDocuments("Item", batch, { keepId: true });
    await sourceActor.deleteEmbeddedDocuments("Item", group.map(it => it.id));
  }

  await postTransferMessage(sourceActor, targetActor, sourceItem, moveQty);
  return true;
}

// ---------------------------------------------------------------------------
// Detach helper (used by shop sales — attachments stay on the seller)
// ---------------------------------------------------------------------------

/**
 * Detach every child of `parentItem` on its current actor: clears the
 * `flags.cyberpunk.attachedTo` flag on flag-attached items, and blanks the
 * `attachedAmmoId` / nested `weapon.attachedAmmoId` on the parent. The
 * children remain on the actor — they just no longer reference the parent.
 *
 * Use this before transferring a parent item to a shop, so the contents stay
 * with the seller and the moved parent arrives "clean".
 */
export async function detachAllChildren(parentItem) {
  const actor = parentItem.parent;
  if (!actor) return;

  // Flag-attached descendants — just clear the flag on each one.
  const flagChildren = actor.items.filter(i =>
    i.getFlag?.("cyberpunk", "attachedTo") === parentItem.id
  );
  if (flagChildren.length) {
    await actor.updateEmbeddedDocuments("Item", flagChildren.map(i => ({
      _id: i.id,
      "flags.cyberpunk.-=attachedTo": null
    })));
  }

  // Ammo references on the parent — blank both the ref and the shotsLeft.
  const updates = [];
  if (parentItem.system?.attachedAmmoId) {
    updates.push({
      _id: parentItem.id,
      "system.attachedAmmoId": "",
      "system.shotsLeft": 0
    });
  }
  if (parentItem.system?.weapon?.attachedAmmoId) {
    updates.push({
      _id: parentItem.id,
      "system.weapon.attachedAmmoId": "",
      "system.weapon.shotsLeft": 0
    });
  }
  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

/**
 * Post a "Gave / To" chat message from the source actor.
 */
async function postTransferMessage(sourceActor, targetActor, item, count) {
  const content = await renderTemplate(
    "systems/cyberpunk/templates/chat/item-transfer.hbs",
    {
      itemImg:    item.img,
      itemName:   item.name,
      count,
      targetImg:  targetActor.img,
      targetName: targetActor.name
    }
  );
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    content
  });
}
