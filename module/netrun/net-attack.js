/**
 * NET attack — fire an Attacker program from a jacked-in cyberdeck at
 * a single targeted NET combatant. Shape mirrors Zap (`_onZap` in the
 * cyberdeck dialog) with three differences:
 *
 *   - Program-driven instead of cyberdeck-built-in: the program's own
 *     `system.atk` is added to the attack roll (no booster lookup); the
 *     program's `system.attackerDamage` is the damage formula; the
 *     program's `system.attackerEffect` may apply a condition on hit.
 *   - Target validation is `attackerClass`-driven: Anti-Personnel hits
 *     other netrunners; Anti-Program hits Black ICE (deferred — blocked
 *     with a notification for now).
 *   - The chat card may include an Effect block (auto-applies on Apply
 *     Damage via `_applyExoticEffect`'s no-save path).
 */

import { localize, renderTemplateCompat } from "../utils.js";
import { spendNetAction } from "../action-tracker.js";
import { RollBundle, EXPLODING_D10, isNaturalOne } from "../dice.js";
import { attackerEffects, attackerClasses } from "../lookups.js";
import { targetHasActiveFlak } from "./defenders.js";

/**
 * Resolve a single targeted token for an attacker class. Returns
 * `{ token, actor }` on success, `null` (with a notification) on miss.
 *
 * Anti-Personnel: target must be a netrunner's NET icon (character actor
 * with `flags.cyberpunk.isNetIcon === true`).
 * Anti-Program: netrunner NET icon OR a Black ICE token (netware actor
 * with `system.subtype === "blackIce"`). Damage routes through the
 * `_applyBlackIceDamage` branch in chat-message — direct REZ damage.
 */
function resolveAttackerTarget(attackerClass) {
    const targets = Array.from(game.user.targets ?? []);
    if (targets.length !== 1) {
        ui.notifications.warn(localize("AttackerNeedsTarget"));
        return null;
    }
    const token = targets[0].document ?? targets[0];
    const actor = token.actor;
    const isNetIcon = token.getFlag?.("cyberpunk", "isNetIcon") === true;
    const isNetrunner = isNetIcon && actor?.type === "character";
    const isBlackIce  = actor?.type === "netware" && actor?.system?.subtype === "blackIce";

    // Anti-Personnel can only hit netrunners — Black ICE is not a body, so
    // there's nothing for body-targeted damage to land on.
    if (attackerClass === "antiPersonnel") {
        if (!isNetrunner) {
            ui.notifications.warn(localize("AttackerTargetMustBeNetrunner"));
            return null;
        }
        return { token, actor };
    }

    // Anti-Program hits netrunner programs OR Black ICE directly. The
    // damage pipeline branches in chat-message: netrunner → random active
    // booster/defender derezz; Black ICE → straight REZ damage on the
    // actor itself, marked dead at 0.
    if (attackerClass === "antiProgram") {
        if (!isNetrunner && !isBlackIce) {
            ui.notifications.warn(localize("AttackerTargetMustBeNetrunnerOrBlackIce"));
            return null;
        }
        return { token, actor };
    }

    ui.notifications.warn(localize("AttackerUnknownClass"));
    return null;
}

/**
 * Roll the program's stored damage formula, return the shape the
 * chat card / Apply path consume. Bucketed under `aoe` so the
 * existing `_expandAoeDamage` path picks it up without thinking
 * about hit locations.
 */
export async function rollAttackerDamage(formula) {
    const f = formula || "1d6";
    const damageRoll = await new Roll(f).evaluate();
    const total = Number(damageRoll.total) || 0;
    return {
        total,
        formula: f,
        roll: damageRoll,
        areaDamages: {
            aoe: [{
                damage: total,
                formula: f,
                dice: damageRoll.dice.map(term => ({
                    faces: term.faces,
                    results: term.results.map(r => ({ result: r.result, exploded: r.exploded }))
                })),
                ignoreArmor: true,            // NET attack — bypasses physical SP
                bypassesLocationMods: true    // ...and head-double / BTM / min-1
            }]
        }
    };
}

/**
 * Localized label for an attacker effect (matches the lookup in
 * `lookups.js`). Effect key `"none"` returns null so callers can
 * cleanly skip the effect block.
 */
export function effectLabelFor(effectKey) {
    if (!effectKey || effectKey === "none") return null;
    const key = attackerEffects[effectKey];
    return key ? localize(key) : effectKey;
}

/**
 * Fire an attacker program. Validates that the program is slotted on a
 * jacked-in deck, the program is not derezzed/destroyed, a valid target
 * is selected for the program's class, and the netrunner has a NET
 * action to spend. Posts a chat card via `zap-hit.hbs`.
 *
 * @param {Actor} actor    The netrunner firing the program.
 * @param {Item}  program  The attacker netware item.
 */
export async function performAttackerStrike(actor, program) {
    if (program?.type !== "netware" || program.system?.programSubtype !== "attacker") return;

    // Lifecycle gates: slotted, deck jacked in, program healthy.
    const parentId = program.getFlag?.("cyberpunk", "attachedTo");
    const deck = parentId ? actor.items.get(parentId) : null;
    if (!deck) {
        ui.notifications.warn(localize("AttackerMustBeSlotted"));
        return;
    }
    if (!deck.system?.equipped) {
        ui.notifications.warn(localize("AttackerDeckNotJackedIn"));
        return;
    }
    const state = program.system?.programState || "inactive";
    if (state === "derezzed" || state === "destroyed") {
        ui.notifications.warn(localize("AttackerProgramOffline"));
        return;
    }

    const target = resolveAttackerTarget(program.system?.attackerClass);
    if (!target) return;

    if (!await spendNetAction(actor, `attacker: ${program.name}`)) return;

    // Attack roll: 1d10x10 + effective Interface + program's ATK. Target's
    // active Flak (non-Black-ICE defender) suppresses the program's ATK
    // bonus — Attacker programs are always non-Black-ICE for now.
    const iface = actor.resolveSkillTotal("Interface");
    const flakActive = targetHasActiveFlak(target.actor);
    const atk   = flakActive ? 0 : (Number(program.system?.atk) || 0);
    const atkParts = [EXPLODING_D10, iface ? String(iface) : null, atk ? String(atk) : null].filter(Boolean);
    const attackRoll = await new Roll(atkParts.join(" + ")).evaluate();
    const fumbled = isNaturalOne(attackRoll);
    const ipGained = fumbled ? 0 : await actor.grantCombatIP(attackRoll, "Interface");
    const attackTotal = Number(attackRoll.total) || 0;

    // Defence roll: 1d10x10 + the target's defence bonus.
    //   - Netrunner: effective Interface (anti-personnel or anti-program
    //     hitting a runner's programs both use the same body roll).
    //   - Black ICE: flat system.def — netware actors have no skills, so
    //     resolveSkillTotal isn't applicable; DEF *is* the bonus.
    const targetIsBlackIce = target.actor?.type === "netware"
                          && target.actor?.system?.subtype === "blackIce";
    const defBonus = targetIsBlackIce
        ? (Number(target.actor.system?.def) || 0)
        : target.actor.resolveSkillTotal("Interface");
    const defParts = [EXPLODING_D10, defBonus ? String(defBonus) : null].filter(Boolean);
    const defenceRoll = await new Roll(defParts.join(" + ")).evaluate();
    const defenceTotal = Number(defenceRoll.total) || 0;

    const success = !fumbled && attackTotal >= defenceTotal;

    // Damage + effect payloads only on hit.
    let damage = null;
    if (success) damage = await rollAttackerDamage(program.system?.attackerDamage);

    const effectKey   = success ? (program.system?.attackerEffect || "none") : "none";
    const hasEffect   = effectKey !== "none";
    const effectLabel = effectLabelFor(effectKey);
    // "crashed" jacks the target out — visualise it with the jacked-in
    // condition icon (the icon stays the same — we use it both for "you
    // are jacked in" and "this program is about to remove that").
    const effectIcon  = !hasEffect ? null : (effectKey === "crashed" ? "jacked-in" : effectKey);

    // Weapon line shows the attacker's class (Anti-Personnel / Anti-Program)
    // — more specific than a generic "NET Attack" label.
    const attackerClass = program.system?.attackerClass;
    const classKey   = attackerClasses[attackerClass];
    const classLabel = classKey ? localize(classKey) : localize("NetAttack");

    // Anti-Program reshapes the damage section: REZ damage to a random
    // active booster/defender on the runner, rendered as "Derezz" not
    // "Damage". The Apply path uses `attackerClass` to branch.
    const isAntiProgram = attackerClass === "antiProgram";
    const damageLabel = localize(isAntiProgram ? "Derezz" : "Damage");
    const damageAndEffectLabel = localize(isAntiProgram ? "DerezzAndEffect" : "DamageAndEffect");
    const damageIcon = isAntiProgram ? "derezz" : "damage";

    const fumble = fumbled ? await actor.rollFumbleData() : null;
    const speaker = ChatMessage.getSpeaker({ actor });

    await new RollBundle(program.name)
        .addRoll(attackRoll)
        .addRoll(defenceRoll)
        .execute(speaker, "systems/cyberpunk/templates/chat/zap-hit.hbs", {
            actionIcon:    "net-action",
            fireModeLabel: program.name,
            attackRoll,
            defenceTotal,
            success,
            hasDamage:   !!damage,
            hasApply:    success,
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
            weaponName:  program.name,
            weaponImage: program.img,
            weaponType:  classLabel,
            damageType:  "burn",
            netAttackerSource: "netrunner",  // Shield + Flak apply on the target side
            attackerClass,                   // Apply path branches on this
            ipGained,
            fumble
        });
}

/**
 * Activate a Black ICE program. Same lifecycle gates as an Attacker
 * program (slotted on a jacked-in deck, program healthy), but instead
 * of rolling an attack, this:
 *   1. Validates the linked Black ICE actor exists.
 *   2. Spends a NET action.
 *   3. Marks the program state as "active".
 *   4. Posts a chat card with a GM-only Activate button — clicking that
 *      button spawns a token of the linked actor next to the netrunner's
 *      NET icon. Token spawn lives in chat-message.js since it's a
 *      privileged scene write.
 *
 * @param {Actor} actor    The netrunner activating the program.
 * @param {Item}  program  The Black ICE program netware item.
 */
export async function performBlackIceProgramActivate(actor, program) {
    if (program?.type !== "netware" || program.system?.programSubtype !== "blackIce") return;

    // Lifecycle gates mirror performAttackerStrike: slotted on a deck,
    // deck currently jacked in, program healthy.
    const parentId = program.getFlag?.("cyberpunk", "attachedTo");
    const deck = parentId ? actor.items.get(parentId) : null;
    if (!deck) {
        ui.notifications.warn(localize("AttackerMustBeSlotted"));
        return;
    }
    if (!deck.system?.equipped) {
        ui.notifications.warn(localize("AttackerDeckNotJackedIn"));
        return;
    }
    const state = program.system?.programState || "inactive";
    if (state === "active") {
        ui.notifications.warn(localize("BlackIceProgramAlreadyActive"));
        return;
    }
    if (state === "derezzed" || state === "destroyed") {
        ui.notifications.warn(localize("AttackerProgramOffline"));
        return;
    }

    // Resolve the linked Black ICE actor. Item carries the UUID; the
    // GM-only Activate button on the chat card spawns a token from it.
    const link = program.system?.actorLink;
    if (!link) {
        ui.notifications.warn(localize("BlackIceProgramNoActorLink"));
        return;
    }
    const linked = await fromUuid(link);
    const isBlackIceActor = linked?.type === "netware" && linked?.system?.subtype === "blackIce";
    if (!isBlackIceActor) {
        ui.notifications.warn(localize("BlackIceProgramActorMissing"));
        return;
    }

    if (!await spendNetAction(actor, `black ICE: ${program.name}`)) return;

    await program.update({ "system.programState": "active" });

    // Post the deployment card. GM clicks Activate → token spawns on the
    // canvas via the chat-message handler.
    const speaker = ChatMessage.getSpeaker({ actor });
    const content = await renderTemplateCompat(
        "systems/cyberpunk/templates/chat/black-ice-activate.hbs",
        {
            actorName:  linked.name,
            actorImg:   linked.img,
            actorUuid:  linked.uuid,
            programUuid: program.uuid,
            netrunnerId: actor.id
        }
    );
    await ChatMessage.create({ user: game.user.id, speaker, content });
}

/**
 * Fire a Black ICE attack from its own actor sheet. Same shape as the
 * attacker-program flow but every netrunner-side concept is dropped:
 *
 *   - No NET-action budget (Black ICE has no action economy).
 *   - No Interface skill (formula is 1d10x10 + ATK; the actor has no
 *     skill items to resolve).
 *   - No deck / slot lifecycle (the actor itself IS the program).
 *   - No Flak/Shield suppression on the attacker's ATK — Flak is "applies
 *     to NET hits *including* Black ICE" defender-side; the Apply path
 *     handles it via `netAttackerSource: "blackIce"`.
 *
 * Required state: the Black ICE actor isn't destroyed (REZ > 0, no dead
 * status). Target validation reuses the attacker-class gate.
 *
 * @param {Actor} blackIce  The netware actor (subtype "blackIce") firing.
 */
export async function performBlackIceStrike(blackIce) {
    if (blackIce?.type !== "netware" || blackIce.system?.subtype !== "blackIce") return;

    // Lifecycle gate: not destroyed. REZ 0 / dead status both block.
    if ((Number(blackIce.system?.rez) || 0) <= 0 || blackIce.statuses?.has?.("dead")) {
        ui.notifications.warn(localize("BlackIceAttackDestroyed"));
        return;
    }

    const target = resolveAttackerTarget(blackIce.system?.attackerClass);
    if (!target) return;

    // Attack roll: 1d10x10 + ATK. No Interface (no skill on netware actor).
    // Flak on netrunner targets doesn't gate Black ICE's ATK — Flak only
    // suppresses *netrunner* ATK bonuses; the Black ICE attack lands at
    // full ATK regardless.
    const atk = Number(blackIce.system?.atk) || 0;
    const atkParts = [EXPLODING_D10, atk ? String(atk) : null].filter(Boolean);
    const attackRoll = await new Roll(atkParts.join(" + ")).evaluate();
    const fumbled = isNaturalOne(attackRoll);
    const attackTotal = Number(attackRoll.total) || 0;

    // Defence roll: same branching as program defence — netrunner uses
    // Interface, Black ICE uses DEF.
    const targetIsBlackIce = target.actor?.type === "netware"
                          && target.actor?.system?.subtype === "blackIce";
    const defBonus = targetIsBlackIce
        ? (Number(target.actor.system?.def) || 0)
        : target.actor.resolveSkillTotal("Interface");
    const defParts = [EXPLODING_D10, defBonus ? String(defBonus) : null].filter(Boolean);
    const defenceRoll = await new Roll(defParts.join(" + ")).evaluate();
    const defenceTotal = Number(defenceRoll.total) || 0;

    const success = !fumbled && attackTotal >= defenceTotal;

    let damage = null;
    if (success) damage = await rollAttackerDamage(blackIce.system?.attackerDamage);

    const effectKey   = success ? (blackIce.system?.attackerEffect || "none") : "none";
    const hasEffect   = effectKey !== "none";
    const effectLabel = effectLabelFor(effectKey);
    const effectIcon  = !hasEffect ? null : (effectKey === "crashed" ? "jacked-in" : effectKey);

    const attackerClass = blackIce.system?.attackerClass;
    const classKey   = attackerClasses[attackerClass];
    const classLabel = classKey ? localize(classKey) : localize("NetAttack");

    const isAntiProgram = attackerClass === "antiProgram";
    const damageLabel = localize(isAntiProgram ? "Derezz" : "Damage");
    const damageAndEffectLabel = localize(isAntiProgram ? "DerezzAndEffect" : "DamageAndEffect");
    const damageIcon = isAntiProgram ? "derezz" : "damage";

    // Black ICE never triggers the fumble cascade — no Luck pool, no
    // body conditions, the nat-1 just means "miss" for this card.
    const speaker = ChatMessage.getSpeaker({ actor: blackIce });

    // Section-bar label carries the class (Anti-Program / Anti-Personnel)
    // — the ChatMessage speaker header already shows the Black ICE's
    // portrait + name, so a weapon-line block with the same identity
    // was pure duplication. Suppress weaponName / weaponImage / weaponType
    // to skip the weapon-line partial entirely.
    await new RollBundle(blackIce.name)
        .addRoll(attackRoll)
        .addRoll(defenceRoll)
        .execute(speaker, "systems/cyberpunk/templates/chat/zap-hit.hbs", {
            actionIcon:    "net-action",
            fireModeLabel: classLabel,
            attackRoll,
            defenceTotal,
            success,
            hasDamage:   !!damage,
            hasApply:    success,
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
            weaponName:  "",
            weaponImage: "",
            weaponType:  "",
            damageType:  "burn",
            // Flak applies to ALL NET hits per the defenders.js contract
            // ("to every NET hit including Black ICE"). The Apply path
            // doesn't currently gate Flak on attackerSource, so passing
            // "blackIce" here is informational; same defenders pipeline runs.
            netAttackerSource: "blackIce",
            attackerClass,
            fumble: null
        });
}
