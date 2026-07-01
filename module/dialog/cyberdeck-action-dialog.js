/**
 * Cyberdeck Action Dialog — popup that lists the NET actions available from
 * a cyberdeck. The button set switches on the actor's jacked-in state:
 *   Jacked out:  Jack In  (NET action),  Scanner (meat action)
 *   Jacked in:   Jack Out (NET action),  Cloak   (NET action)
 *
 * Same surface pattern as `UnarmedAttackDialog`.
 */

import { localize } from "../utils.js";
import { spendNetAction, registerAction } from "../action-tracker.js";
import { RollBundle, EXPLODING_D10, isNaturalOne } from "../dice.js";
import { engageDrone } from "../netrun/control-bridge.js";
import { targetHasActiveFlak } from "../netrun/defenders.js";
import { nearestCoveringAccessPoint, tokenDistance } from "../netrun/access-points.js";
import { deckUpgradeValue } from "../netrun/upgrades.js";
import { NetActionRollDialog, commitLuckSpend } from "./net-action-roll-dialog.js";
import { rollAttackerDamage, effectLabelFor } from "../netrun/net-attack.js";
import { attackerClasses } from "../lookups.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const NET_ACTION_TEMPLATE = "systems/cyberpunk/templates/chat/net-action.hbs";

/**
 * Sum the `boosterValue` of every active `bonusKey` booster slotted on
 * `deck`. Null-safe: no deck → 0 (used by Detect responder whose actor
 * might not be jacked in and has no equipped deck to slot Detect boosters
 * onto).
 */
export function activeBoosterValue(actor, deck, bonusKey) {
    if (!deck) return 0;
    return actor.items
        .filter(i =>
            i.type === "netware"
            && i.system?.netwareType === "program"
            && i.system?.programSubtype === "booster"
            && i.system?.boosterBonus === bonusKey
            && i.system?.programState === "active"
            && i.getFlag("cyberpunk", "attachedTo") === deck.id
        )
        .reduce((sum, p) => sum + (Number(p.system?.boosterValue) || 0), 0);
}

/** Find the actor's meat token on the active scene (the non-NET-icon one). */
function findMeatToken(actor) {
    if (!canvas?.scene) return null;
    return canvas.scene.tokens.find(t =>
        t.actorId === actor.id
        && t.getFlag("cyberpunk", "isNetIcon") !== true
    );
}

export class CyberdeckActionDialog extends HandlebarsApplicationMixin(ApplicationV2) {

    /**
     * @param {Actor} actor
     * @param {Item}  deck   The cyberdeck Item the dialog was opened from.
     */
    constructor(actor, deck) {
        super({});
        this.actor = actor;
        this.deck  = deck;
    }

    static DEFAULT_OPTIONS = {
        id: "cyberdeck-action-dialog",
        classes: ["cyberpunk", "ranged-attack-dialog"],
        position: { width: 300, height: "auto" },
        window: { frame: true, positioned: true, resizable: false, minimizable: false, controls: [] },
        actions: {
            closeDialog:       CyberdeckActionDialog._onCloseDialog,
            cyberdeckJackIn:   CyberdeckActionDialog._onJackIn,
            cyberdeckJackOut:  CyberdeckActionDialog._onJackOut,
            cyberdeckScanner:  CyberdeckActionDialog._onScanner,
            cyberdeckCloak:    CyberdeckActionDialog._onCloak,
            cyberdeckSlide:    CyberdeckActionDialog._onSlide,
            cyberdeckSpeed:    CyberdeckActionDialog._onSpeed,
            cyberdeckControl:  CyberdeckActionDialog._onControl,
            cyberdeckEyeDee:   CyberdeckActionDialog._onEyeDee,
            cyberdeckBackdoor: CyberdeckActionDialog._onBackdoor,
            cyberdeckZap:      CyberdeckActionDialog._onZap
        }
    };

    static PARTS = {
        body: { template: "systems/cyberpunk/templates/dialog/cyberdeck-action.hbs" }
    };

    get title() { return this.deck?.name ?? localize("Cyberdeck"); }

    async _prepareContext(_options) {
        const jackedIn = this.actor.statuses.has("jacked-in");
        const actions = jackedIn
            ? [
                { key: "cyberdeckJackOut",  label: localize("JackOut") },
                { key: "cyberdeckCloak",    label: localize("Cloak") },
                { key: "cyberdeckSlide",    label: localize("Slide") },
                { key: "cyberdeckSpeed",    label: localize("Speed") },
                { key: "cyberdeckControl",  label: localize("Control") },
                { key: "cyberdeckEyeDee",   label: localize("EyeDee") },
                { key: "cyberdeckBackdoor", label: localize("Backdoor") },
                { key: "cyberdeckZap",      label: localize("Zap") }
              ]
            : [
                { key: "cyberdeckJackIn",   label: localize("JackIn") },
                { key: "cyberdeckScanner",  label: localize("Scanner") }
              ];
        return { title: this.title, actions };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const header = this.element.querySelector(".reload-header");
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
        }
    }

    static _onCloseDialog(event, _target) {
        event?.preventDefault?.();
        this.close({ animate: false });
    }

    /* ----------------------------------- */
    /*  Jack In / Jack Out                 */
    /* ----------------------------------- */

    static async _onJackIn(event, _target) {
        event?.preventDefault?.();
        // Validate: no other deck already active.
        const activeDeck = this.actor.items.find(i =>
            i.type === "netware"
            && i.system?.netwareType === "cyberdeck"
            && i.id !== this.deck.id
            && i.system?.equipped
        );
        if (activeDeck) {
            ui.notifications.error(game.i18n.format("CYBERPUNK.CannotJackInDeckActive", { name: activeDeck.name }));
            return;
        }
        // Pre-gate: must be inside the (Range-upgrade-extended) radius of at
        // least one Access Point. Pass `this.deck` so Range upgrades on the
        // deck the runner's about to jack in WITH push every AP's effective
        // radius outward. Refuses client-side before spending the NET action
        // / equipping the deck, so the player sees the warning directly.
        const meat = findMeatToken(this.actor);
        if (!meat || !nearestCoveringAccessPoint(meat, canvas.scene, this.deck)) {
            ui.notifications.warn(game.i18n.localize("CYBERPUNK.JackInNoAccessPoint"));
            return;
        }
        if (!await spendNetAction(this.actor, "jack in")) return;
        await this.deck.update({ "system.equipped": true });
        await this.actor.toggleStatusEffect("jacked-in", { active: true });
        this.close({ animate: false });
    }

    static async _onJackOut(event, _target) {
        event?.preventDefault?.();
        if (!await spendNetAction(this.actor, "jack out")) return;
        // Deactivate every booster/defender attached to this deck.
        const programs = this.actor.items.filter(i =>
            i.type === "netware"
            && i.system?.netwareType === "program"
            && (i.system?.programSubtype === "booster" || i.system?.programSubtype === "defender")
            && i.getFlag("cyberpunk", "attachedTo") === this.deck.id
            && i.system?.programState === "active"
        );
        if (programs.length) {
            const updates = programs.map(p => ({ _id: p.id, "system.programState": "inactive" }));
            await this.actor.updateEmbeddedDocuments("Item", updates);
        }
        await this.deck.update({ "system.equipped": false });
        await this.actor.toggleStatusEffect("jacked-in", { active: false });
        this.close({ animate: false });
    }

    /* ----------------------------------- */
    /*  Scanner (meat action)              */
    /* ----------------------------------- */

    static async _onScanner(event, _target) {
        event?.preventDefault?.();
        // Roll-modifier dialog (Conditions + Luck). Cancel → abort, no
        // action register, no luck commit.
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("Scanner") });
        if (!mods) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);
        const iface  = this.actor.resolveSkillTotal("Interface");
        const bonus  = activeBoosterValue(this.actor, this.deck, "scanner");
        const parts  = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const roll   = await new Roll(parts.join(" + ")).evaluate();
        const range  = (Number(roll.total) || 0) * 2;
        const fumbled = isNaturalOne(roll);
        // Combat-style IP grant: skip on nat-1 fumble (matches punch /
        // melee-attack / performAttackerStrike pattern below).
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(roll, "Interface");

        // A fumble doesn't reveal anything. Skip detection / pings / region
        // refresh entirely — the chat card falls through to the empty-state
        // placeholder so the netrunner sees "no APs" and rolls fumble.
        const meat = fumbled ? null : findMeatToken(this.actor);
        const aps  = !fumbled && canvas?.scene?.tokens
            ? canvas.scene.tokens.filter(t =>
                t.actor?.type === "netware"
                && t.actor?.system?.subtype === "accessPoint"
              )
            : [];
        // Pair each AP with its distance once; we need it for both the
        // in-range filter and the chat card row.
        const apsWithDistance = meat
            ? aps.map(ap => ({ ap, distance: tokenDistance(meat, ap) }))
            : [];
        const detected = apsWithDistance
            .filter(entry => entry.distance <= range)
            .sort((a, b) => a.distance - b.distance);

        if (!fumbled) {
            // Visual feedback — ping each detected AP on canvas (V13+V14).
            for (const { ap } of detected) {
                const center = ap.object?.center ?? { x: ap.x, y: ap.y };
                try { canvas.ping?.(center); } catch { /* no-op */ }
            }

            // V14: replace this netrunner's existing scanner regions with new ones.
            if (canvas.scene?.regions) {
                await this._refreshScannerRegions(detected.map(d => d.ap));
            }
        }

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        const bundle  = new RollBundle(localize("Scanner")).addRoll(roll);
        await bundle.execute(speaker, NET_ACTION_TEMPLATE, {
            title: localize("Scanner"),
            actionIcon: "net-action",
            range,
            hasResultSection: true,
            hasDetectedAPs: detected.length > 0,
            detectedAPs: detected.map(({ ap, distance }) => ({
                name: ap.name,
                img: ap.texture?.src ?? ap.actor?.img ?? "",
                distance: Math.round(distance)
            })),
            hasResponse: false,
            ipGained,
            fumble
        });

        await registerAction(this.actor, "scanner");
        this.close({ animate: false });
    }

    /**
     * Clear regions tagged for this netrunner (`cyberpunk.scannerActorId === actor.id`)
     * and recreate one per detected Access Point, sized to that AP's radius.
     * V14 only — V13 has no Region document; callers must skip this branch.
     */
    async _refreshScannerRegions(detected) {
        const scene = canvas.scene;
        if (!scene?.regions) return;
        const existing = scene.regions
            .filter(r => r.getFlag?.("cyberpunk", "scannerActorId") === this.actor.id)
            .map(r => r.id);
        if (existing.length) {
            await scene.deleteEmbeddedDocuments("Region", existing);
        }
        if (!detected.length) return;

        const gridSize = scene.grid.size || 100;
        const unit     = scene.grid.distance || 1; // metres per grid cell
        // Range upgrade on the scanning deck widens every AP's effective
        // radius for this runner. Draw the EXTENDED radius so the visual
        // matches the actual jack-in / auto-jack-out boundary the runner
        // operates on. Decks without Range upgrades just get bonus = 0.
        const rangeBonusM = deckUpgradeValue(this.deck, "range");
        // ALWAYS = visible on canvas without opening the Regions tool. Default
        // is LAYER (0), which is why our regions painted nothing on the map.
        const visibility = CONST?.REGION_VISIBILITY?.ALWAYS ?? 2;
        const docs = detected.map(ap => {
            const center = ap.object?.center ?? { x: ap.x + gridSize / 2, y: ap.y + gridSize / 2 };
            const baseM = Number(ap.actor?.system?.radius) || 0;
            // Match accessPointsCovering: a 0-radius AP is disabled and
            // Range can't revive it. Anything positive gets the bonus.
            const radiusM = baseM > 0 ? baseM + rangeBonusM : 0;
            const radiusPx = (radiusM / unit) * gridSize;
            return {
                name: `Scanner: ${ap.name}`,
                color: "#66DDFF",
                visibility,
                shapes: [{
                    type: "ellipse",
                    x: center.x,
                    y: center.y,
                    radiusX: radiusPx,
                    radiusY: radiusPx,
                    rotation: 0,
                    hole: false
                }],
                flags: { cyberpunk: { scannerActorId: this.actor.id, scannedAP: ap.id } }
            };
        });
        await scene.createEmbeddedDocuments("Region", docs);
    }

    /* ----------------------------------- */
    /*  Cloak (NET action)                 */
    /* ----------------------------------- */

    static async _onCloak(event, _target) {
        event?.preventDefault?.();
        // Dialog first, then NET-action gate — that way cancel doesn't burn
        // a slot and a failed gate (no slots left) doesn't burn Luck.
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("Cloak") });
        if (!mods) return;
        if (!await spendNetAction(this.actor, "cloak")) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);

        const iface = this.actor.resolveSkillTotal("Interface");
        const bonus = activeBoosterValue(this.actor, this.deck, "cloak");
        const parts = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const roll  = await new Roll(parts.join(" + ")).evaluate();
        const fumbled = isNaturalOne(roll);
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(roll, "Interface");

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        const bundle  = new RollBundle(localize("Cloak")).addRoll(roll);
        await bundle.execute(speaker, NET_ACTION_TEMPLATE, {
            title: localize("Cloak"),
            actionIcon: "net-action",
            hasDetectedAPs: false,
            hasResponse: true,
            responseLabel: localize("Detect"),
            responseType:  "detect",
            sourceTotal:   Number(roll.total) || 0,
            ipGained,
            fumble
        });

        this.close({ animate: false });
    }

    /* ----------------------------------- */
    /*  Slide / Speed (NET actions vs ICE) */
    /* ----------------------------------- */

    /**
     * Resolve a single targeted Black ICE token. Both Slide and Speed
     * require the target to be a netware actor with subtype "blackIce".
     */
    _resolveBlackIceTarget() {
        const targets = Array.from(game.user.targets ?? []);
        if (targets.length !== 1) {
            ui.notifications.warn(localize("BlackIceTargetNeeded"));
            return null;
        }
        const token = targets[0].document ?? targets[0];
        const actor = token.actor;
        const isBlackIce = actor?.type === "netware" && actor?.system?.subtype === "blackIce";
        if (!isBlackIce) {
            ui.notifications.warn(localize("BlackIceTargetMustBeBlackIce"));
            return null;
        }
        return { token, actor };
    }

    /**
     * Slide — opposed roll against the Black ICE's PER. Pure pass/fail,
     * no damage. Netrunner-side gets the usual Conditions / Luck dialog
     * and fumble cascade on a natural 1.
     */
    static async _onSlide(event, _target) {
        event?.preventDefault?.();
        const target = this._resolveBlackIceTarget();
        if (!target) return;
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("Slide") });
        if (!mods) return;
        if (!await spendNetAction(this.actor, "slide")) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);

        // Netrunner attack: 1d10x10 + effective Interface + Σ active Slide
        // boosters + Conditions/Luck. Same shape as Cloak / Backdoor.
        const iface = this.actor.resolveSkillTotal("Interface");
        const bonus = activeBoosterValue(this.actor, this.deck, "slide");
        const parts = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const attackRoll = await new Roll(parts.join(" + ")).evaluate();
        const fumbled = isNaturalOne(attackRoll);
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(attackRoll, "Interface");
        const attackTotal = Number(attackRoll.total) || 0;

        // Black ICE defence: 1d10x10 + PER. Rolled silently (no separate
        // chat message) — the total renders as the DV badge on the card.
        const per = Number(target.actor.system?.per) || 0;
        const defParts = [EXPLODING_D10, per ? String(per) : null].filter(Boolean);
        const defenceRoll = await new Roll(defParts.join(" + ")).evaluate();
        const defenceTotal = Number(defenceRoll.total) || 0;

        const success = !fumbled && attackTotal >= defenceTotal;

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await new RollBundle(localize("Slide"))
            .addRoll(attackRoll)
            .execute(speaker, NET_ACTION_TEMPLATE, {
                title:        localize("Slide"),
                actionIcon:   "net-action",
                hasDifficulty: true,
                difficulty:   defenceTotal,
                success,
                ipGained,
                fumble
            });

        this.close({ animate: false });
    }

    /**
     * Speed — opposed roll against the Black ICE's SPD. On success: pure
     * pass card. On failure: the Black ICE's stored attackerDamage +
     * attackerEffect are bundled onto the same chat card with an Apply
     * button so the GM can land the "free hit" the failure costs.
     *
     * The damage routes through the standard zap-hit Apply pipeline with
     * `netAttackerSource: "blackIce"` and the Black ICE's own
     * attackerClass — same path as a Black ICE Attack action would use.
     */
    static async _onSpeed(event, _target) {
        event?.preventDefault?.();
        const target = this._resolveBlackIceTarget();
        if (!target) return;
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("Speed") });
        if (!mods) return;
        if (!await spendNetAction(this.actor, "speed")) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);

        // Netrunner attack: 1d10x10 + Interface + Σ active Speed boosters + mods.
        const iface = this.actor.resolveSkillTotal("Interface");
        const bonus = activeBoosterValue(this.actor, this.deck, "speed");
        const parts = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const attackRoll = await new Roll(parts.join(" + ")).evaluate();
        const fumbled = isNaturalOne(attackRoll);
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(attackRoll, "Interface");
        const attackTotal = Number(attackRoll.total) || 0;

        // Black ICE defence: 1d10x10 + SPD.
        const spd = Number(target.actor.system?.spd) || 0;
        const defParts = [EXPLODING_D10, spd ? String(spd) : null].filter(Boolean);
        const defenceRoll = await new Roll(defParts.join(" + ")).evaluate();
        const defenceTotal = Number(defenceRoll.total) || 0;

        const success = !fumbled && attackTotal >= defenceTotal;

        // Failure → roll Black ICE's stored damage + effect, bundle them
        // onto the chat card with an Apply button. The Black ICE never
        // gets a defence roll here (it just lands the free hit), but its
        // damage and effect feed the standard apply pipeline as if it
        // had used its own Attack action.
        let damage = null;
        let effectKey = "none";
        if (!success) {
            damage = await rollAttackerDamage(target.actor.system?.attackerDamage);
            effectKey = target.actor.system?.attackerEffect || "none";
        }
        const hasEffect = effectKey !== "none";
        const effectLabel = effectLabelFor(effectKey);
        const effectIcon  = !hasEffect ? null : (effectKey === "crashed" ? "jacked-in" : effectKey);

        const attackerClass = target.actor.system?.attackerClass || "antiPersonnel";
        const classKey   = attackerClasses[attackerClass];
        const classLabel = classKey ? localize(classKey) : localize("NetAttack");

        const isAntiProgram = attackerClass === "antiProgram";
        const damageLabel = localize(isAntiProgram ? "Derezz" : "Damage");
        const damageAndEffectLabel = localize(isAntiProgram ? "DerezzAndEffect" : "DamageAndEffect");
        const damageIcon = isAntiProgram ? "derezz" : "damage";

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await new RollBundle(localize("Speed"))
            .addRoll(attackRoll)
            .execute(speaker, "systems/cyberpunk/templates/chat/zap-hit.hbs", {
                actionIcon:    "net-action",
                fireModeLabel: localize("Speed"),
                attackRoll,
                defenceTotal,
                success,
                hasDamage:   !!damage,
                hasApply:    !!damage,
                areaDamages: damage?.areaDamages ?? {},
                damageTotal: damage?.total ?? 0,
                damageLabel,
                damageAndEffectLabel,
                damageIcon,
                hasEffect,
                effectIcon,
                effectLabel,
                weaponEffect: hasEffect ? effectKey : "",
                effectSaveCount: 1,
                // Weapon line carries the Black ICE identity ONLY on
                // failure — on success there's nothing to attribute, the
                // header section bar already labels the card "Speed".
                weaponName:  success ? "" : target.actor.name,
                weaponImage: success ? "" : target.actor.img,
                weaponType:  success ? "" : classLabel,
                damageType:  "burn",
                netAttackerSource: "blackIce",
                attackerClass,
                ipGained,
                fumble
            });

        this.close({ animate: false });
    }

    /* ----------------------------------- */
    /*  Control (NET action, targeted)     */
    /* ----------------------------------- */

    /**
     * Resolve a single targeted Control Point token, or return null with a
     * notification. Drives the early-exit on Control before any roll is made.
     */
    _resolveControlTarget() {
        const targets = Array.from(game.user.targets ?? []);
        if (targets.length !== 1) {
            ui.notifications.warn(localize("ControlNeedsTarget"));
            return null;
        }
        const token = targets[0].document ?? targets[0];
        const actor = token.actor;
        if (actor?.type !== "netware" || actor.system?.subtype !== "controlPoint") {
            ui.notifications.warn(localize("ControlTargetMustBeControlPoint"));
            return null;
        }
        return { token, actor };
    }

    static async _onControl(event, _target) {
        event?.preventDefault?.();
        const target = this._resolveControlTarget();
        if (!target) return;

        // Silent re-engage path — same character cracking the same Control
        // Point. No roll, no dialog, just hand them the drone again. Still
        // spends a NET action (matches the "you did the thing" cost).
        const alreadyControls = target.actor.system?.controllingActorId === this.actor.id;
        if (alreadyControls) {
            if (!await spendNetAction(this.actor, "control")) return;
            const droneUuid = target.actor.system?.droneLink;
            if (droneUuid) await engageDrone(this.actor, droneUuid);
            else ui.notifications.warn(localize("ControlUseDroneMissing"));
            this.close({ animate: false });
            return;
        }

        // Fresh attempt — Conditions + Luck dialog, then gate, then commit.
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("Control") });
        if (!mods) return;
        if (!await spendNetAction(this.actor, "control")) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);

        const iface = this.actor.resolveSkillTotal("Interface");
        const bonus = activeBoosterValue(this.actor, this.deck, "control");
        const parts = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const roll  = await new Roll(parts.join(" + ")).evaluate();
        const total = Number(roll.total) || 0;
        const fumbled = isNaturalOne(roll);
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(roll, "Interface");
        const difficulty = Number(target.actor.system?.dv) || 0;
        const success = !fumbled && total >= difficulty;

        // Drone Link preview for the Target row on the chat card.
        let droneInfo = null;
        if (success) {
            const droneUuid = target.actor.system?.droneLink;
            if (droneUuid) {
                try {
                    const doc = await fromUuid(droneUuid);
                    const droneActor = doc?.actor ?? (doc?.documentName === "Actor" ? doc : null);
                    if (droneActor) {
                        droneInfo = {
                            name: doc.name ?? droneActor.name,
                            img:  doc.texture?.src ?? droneActor.img,
                            droneTokenUuid: droneUuid
                        };
                    }
                } catch { /* stale or missing — skip the Target section */ }
            }
        }

        // Apply payload — the GM-only button on the chat card commits the
        // DV update, the ownership grant, and the pending-drone flag in
        // one click. Player has no privileged writes here.
        const applyData = success && droneInfo ? {
            controlPointUuid: target.actor.uuid,
            droneTokenUuid:   droneInfo.droneTokenUuid,
            netrunnerActorId: this.actor.id,
            rollTotal:        total
        } : null;

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await new RollBundle(localize("Control")).addRoll(roll)
            .execute(speaker, NET_ACTION_TEMPLATE, {
                title: localize("Control"),
                actionIcon: "net-action",
                hasDifficulty: true,
                difficulty,
                success,
                hasTargetSection: success && !!droneInfo,
                targetActor:     droneInfo,
                hasApplyButton:  !!applyData,
                applyData,
                fumble
            });

        this.close({ animate: false });
    }

    /* ----------------------------------- */
    /*  Backdoor (NET action, targeted)     */
    /* ----------------------------------- */

    /**
     * Resolve a single targeted Password NET object. Backdoor's GM-Apply
     * flips a linked wall's door state from LOCKED to CLOSED — the wall
     * UUID lives on the Password's `system.doorLink`. No persistent state
     * tracked on the Password itself (unlike Control); each Backdoor is
     * a one-shot unlock attempt.
     */
    _resolveBackdoorTarget() {
        const targets = Array.from(game.user.targets ?? []);
        if (targets.length !== 1) {
            ui.notifications.warn(localize("BackdoorNeedsTarget"));
            return null;
        }
        const token = targets[0].document ?? targets[0];
        const actor = token.actor;
        if (actor?.type !== "netware" || actor.system?.subtype !== "password") {
            ui.notifications.warn(localize("BackdoorTargetMustBePassword"));
            return null;
        }
        return { token, actor };
    }

    static async _onBackdoor(event, _target) {
        event?.preventDefault?.();
        const target = this._resolveBackdoorTarget();
        if (!target) return;
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("Backdoor") });
        if (!mods) return;
        if (!await spendNetAction(this.actor, "backdoor")) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);

        const iface = this.actor.resolveSkillTotal("Interface");
        const bonus = activeBoosterValue(this.actor, this.deck, "backdoor");
        const parts = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const roll  = await new Roll(parts.join(" + ")).evaluate();
        const total = Number(roll.total) || 0;
        const fumbled = isNaturalOne(roll);
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(roll, "Interface");
        const difficulty = Number(target.actor.system?.dv) || 0;
        const success = !fumbled && total >= difficulty;

        // GM-only Unlock button payload — only meaningful when there's a
        // door linked. Without a door, the success just shows on the card
        // and the GM (or a separate macro) unlocks manually.
        const doorUuid = target.actor.system?.doorLink;
        const unlockData = (success && doorUuid) ? { doorUuid } : null;

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await new RollBundle(localize("Backdoor")).addRoll(roll)
            .execute(speaker, NET_ACTION_TEMPLATE, {
                title: localize("Backdoor"),
                actionIcon: "net-action",
                hasDifficulty: true,
                difficulty,
                success,
                hasUnlockButton: !!unlockData,
                unlockData,
                ipGained,
                fumble
            });

        this.close({ animate: false });
    }

    /* ----------------------------------- */
    /*  Eye-Dee (NET action, targeted)      */
    /* ----------------------------------- */

    /**
     * Resolve a single targeted File NET object — the only valid Eye-Dee
     * target. Unlike Control there's no persistent state to track; each
     * Eye-Dee is a fresh read attempt against the same DV.
     */
    _resolveEyeDeeTarget() {
        const targets = Array.from(game.user.targets ?? []);
        if (targets.length !== 1) {
            ui.notifications.warn(localize("EyeDeeNeedsTarget"));
            return null;
        }
        const token = targets[0].document ?? targets[0];
        const actor = token.actor;
        if (actor?.type !== "netware" || actor.system?.subtype !== "file") {
            ui.notifications.warn(localize("EyeDeeTargetMustBeFile"));
            return null;
        }
        return { token, actor };
    }

    static async _onEyeDee(event, _target) {
        event?.preventDefault?.();
        const target = this._resolveEyeDeeTarget();
        if (!target) return;
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("EyeDee") });
        if (!mods) return;
        if (!await spendNetAction(this.actor, "eyedee")) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);

        const iface = this.actor.resolveSkillTotal("Interface");
        const bonus = activeBoosterValue(this.actor, this.deck, "eyedee");
        const parts = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const roll  = await new Roll(parts.join(" + ")).evaluate();
        const total = Number(roll.total) || 0;
        const fumbled = isNaturalOne(roll);
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(roll, "Interface");
        const difficulty = Number(target.actor.system?.dv) || 0;
        const success = !fumbled && total >= difficulty;

        // File contents are revealed only on success — no state persists,
        // no field is rewritten. Each Eye-Dee is an independent read.
        const fileContent = success ? (target.actor.system?.description || "") : "";
        const fileContentLines = fileContent.split("\n");

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await new RollBundle(localize("EyeDee")).addRoll(roll)
            .execute(speaker, NET_ACTION_TEMPLATE, {
                title: localize("EyeDee"),
                actionIcon: "net-action",
                hasDifficulty: true,
                difficulty,
                success,
                hasFileContents: success && !!fileContent,
                fileContentLines,
                ipGained,
                fumble
            });

        this.close({ animate: false });
    }

    /* ----------------------------------- */
    /*  Zap (NET action, targeted)          */
    /* ----------------------------------- */

    /**
     * Resolve a single targeted NET combatant — for now a netrunner's
     * NET icon (character actor + `flags.cyberpunk.isNetIcon`). Black
     * ICE will plug in here later as another netware-actor subtype.
     */
    _resolveZapTarget() {
        const targets = Array.from(game.user.targets ?? []);
        if (targets.length !== 1) {
            ui.notifications.warn(localize("ZapNeedsTarget"));
            return null;
        }
        const token = targets[0].document ?? targets[0];
        const actor = token.actor;
        // Valid Zap targets in the NET:
        //   - Another netrunner's NET icon (character + isNetIcon flag).
        //   - A Black ICE token (netware actor, subtype blackIce).
        const isNetIcon = token.getFlag?.("cyberpunk", "isNetIcon") === true;
        const isBlackIce = actor?.type === "netware" && actor?.system?.subtype === "blackIce";
        const isNetCombatant = (isNetIcon && actor?.type === "character") || isBlackIce;
        if (!isNetCombatant) {
            ui.notifications.warn(localize("ZapTargetMustBeNetCombatant"));
            return null;
        }
        return { token, actor };
    }

    static async _onZap(event, _target) {
        event?.preventDefault?.();
        const target = this._resolveZapTarget();
        if (!target) return;
        const mods = await NetActionRollDialog.prompt(this.actor, { title: localize("Zap") });
        if (!mods) return;
        if (!await spendNetAction(this.actor, "zap")) return;
        await commitLuckSpend(this.actor, mods.luckToSpend);

        // Attack roll: 1d10x10 + effective Interface + Σ active Zap bonuses
        // + mods (Conditions + Luck — defender's modifier dialog handles
        // their own side). Target's active Flak (non-Black-ICE defender)
        // suppresses the Zap booster bonus — Zap itself is not Black ICE.
        const atkIface = this.actor.resolveSkillTotal("Interface");
        const flakActive = targetHasActiveFlak(target.actor);
        const atkBonus = flakActive ? 0 : activeBoosterValue(this.actor, this.deck, "zap");
        const atkParts = [EXPLODING_D10, atkIface ? String(atkIface) : null, atkBonus ? String(atkBonus) : null, mods.extraMod ? String(mods.extraMod) : null].filter(Boolean);
        const attackRoll = await new Roll(atkParts.join(" + ")).evaluate();
        const fumbled = isNaturalOne(attackRoll);
        const ipGained = fumbled ? 0 : await this.actor.grantCombatIP(attackRoll, "Interface");
        const attackTotal = Number(attackRoll.total) || 0;

        // Defence roll: 1d10x10 + the target's defence bonus.
        //   - Netrunner: effective Interface.
        //   - Black ICE: flat system.def (no skill resolution — netware
        //     actors have no skills, the DEF stat IS the bonus).
        // No fumble check — defenders don't trigger the fumble cascade.
        const targetIsBlackIce = target.actor?.type === "netware"
                              && target.actor?.system?.subtype === "blackIce";
        const defBonus = targetIsBlackIce
            ? (Number(target.actor.system?.def) || 0)
            : target.actor.resolveSkillTotal("Interface");
        const defParts = [EXPLODING_D10, defBonus ? String(defBonus) : null].filter(Boolean);
        const defenceRoll = await new Roll(defParts.join(" + ")).evaluate();
        const defenceTotal = Number(defenceRoll.total) || 0;

        // Hit if attack >= defence and we didn't natural-1.
        const success = !fumbled && attackTotal >= defenceTotal;

        // Damage roll — flat 1d6, only on a hit. Bucketed under "aoe" so
        // the existing apply-damage / _expandAoeDamage path picks it up
        // without thinking about hit locations.
        let areaDamages = {};
        let damageTotal = 0;
        if (success) {
            const damageRoll = await new Roll("1d6").evaluate();
            damageTotal = Number(damageRoll.total) || 0;
            areaDamages = {
                aoe: [{
                    damage: damageTotal,
                    formula: "1d6",
                    dice: damageRoll.dice.map(term => ({
                        faces: term.faces,
                        results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
                    })),
                    ignoreArmor: true,            // NET attack — bypasses physical SP
                    bypassesLocationMods: true    // ...and head-double / BTM / min-1
                }]
            };
        }

        const fumble = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await new RollBundle(localize("Zap"))
            .addRoll(attackRoll)
            .addRoll(defenceRoll)
            .execute(speaker, "systems/cyberpunk/templates/chat/zap-hit.hbs", {
                actionIcon:    "net-action",
                fireModeLabel: localize("Zap"),
                attackRoll,
                defenceTotal,
                success,
                hasDamage: success,
                hasApply:  success,
                areaDamages,
                damageTotal,
                damageLabel: localize("Damage"),
                damageAndEffectLabel: localize("DamageAndEffect"),
                damageIcon: "damage",
                weaponName:  this.deck.name,
                weaponImage: this.deck.img,
                weaponType:  localize("NetAttack"),
                damageType:  "burn",
                netAttackerSource: "netrunner",  // Shield + Flak apply on the target side
                attackerClass: "antiPersonnel",  // Zap behaves like an Anti-Personnel attacker
                ipGained,
                fumble
            });

        this.close({ animate: false });
    }

    /* ------------------------------------- */
    /*  Placeholders: Eye-Dee, Backdoor      */
    /* ------------------------------------- */


    /**
     * Common roll-only path for the placeholder NET actions. Each spends a
     * NET Action, rolls 1d10x10 + Interface + matching booster bonus, and
     * posts a flat net-action chat card. No targeting / no side effects —
     * mechanics land later.
     */
    async _stubAction(bonusKey, labelKey) {
        if (!await spendNetAction(this.actor, bonusKey)) return;
        const iface = this.actor.resolveSkillTotal("Interface");
        const bonus = activeBoosterValue(this.actor, this.deck, bonusKey);
        const parts = [EXPLODING_D10, iface ? String(iface) : null, bonus ? String(bonus) : null].filter(Boolean);
        const roll  = await new Roll(parts.join(" + ")).evaluate();
        const fumbled = isNaturalOne(roll);
        const fumble  = fumbled ? await this.actor.rollFumbleData() : null;
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await new RollBundle(localize(labelKey)).addRoll(roll)
            .execute(speaker, NET_ACTION_TEMPLATE, {
                title: localize(labelKey),
                actionIcon: "net-action",
                fumble
            });
        this.close({ animate: false });
    }
}

/**
 * Fire a cyberdeck action WITHOUT rendering the dialog. Used by the
 * Realm Switcher toolbox to invoke actions directly.
 *
 * Each `_onX` handler on CyberdeckActionDialog is written against
 * `this.actor`, `this.deck`, and prototype helper methods
 * (`_refreshScannerRegions`, `_resolveControlTarget`, etc.) — none
 * touch `this.element` or `this.render()`. That lets us construct a
 * phantom instance via `Object.create(prototype)`, wire up just the
 * fields the handlers need, stub `close`/`render` to no-ops, and
 * dispatch — no dialog ever renders, no chrome ever mounts, the
 * subsequent roll dialogs / chat cards fire normally.
 *
 * @param {Actor}  actor      Netrunner firing the action.
 * @param {Item}   deck       Cyberdeck the action runs from.
 * @param {string} actionKey  Key from DEFAULT_OPTIONS.actions
 *                            (e.g. "cyberdeckZap", "cyberdeckSlide").
 */
export async function runCyberdeckAction(actor, deck, actionKey) {
    const handler = CyberdeckActionDialog.DEFAULT_OPTIONS.actions?.[actionKey];
    if (!handler || !actor || !deck) return;
    const shim = Object.create(CyberdeckActionDialog.prototype);
    shim.actor = actor;
    shim.deck  = deck;
    shim.close  = () => Promise.resolve();
    shim.render = () => {};
    await handler.call(shim, null, null);
}
