export const EXPLODING_D10 = "1d10x10";
export const CHAT_ROLL_TEMPLATE = "systems/cyberpunk/templates/chat/default-roll.hbs";

/**
 * Get the best available image for an actor in chat cards.
 * Fallback chain: selected token → actor portrait → user avatar → placeholder
 * @param {Object} speaker - The ChatMessage speaker object
 * @returns {string} URL to the actor image
 */
export function getActorImage(speaker) {
    // 1. Try selected token's texture
    if (speaker?.token) {
        const token = canvas.tokens?.get(speaker.token);
        if (token?.document?.texture?.src) {
            return token.document.texture.src;
        }
    }

    // 2. Try actor's portrait
    if (speaker?.actor) {
        const actor = game.actors.get(speaker.actor);
        if (actor?.img && actor.img !== "icons/svg/mystery-man.svg") {
            return actor.img;
        }
    }

    // 3. Try user's avatar
    if (speaker?.actor) {
        const user = game.users.find(u => u.character?.id === speaker.actor);
        if (user?.avatar) {
            return user.avatar;
        }
    }

    // 4. Fallback to placeholder
    return "systems/cyberpunk/img/svg/placeholder-character.svg";
}

/**
 * Get actor name with fallback chain
 * @param {Object} speaker - The ChatMessage speaker object
 * @returns {string} Actor/character name
 */
export function getActorName(speaker) {
    // 1. Try actor name
    if (speaker?.actor) {
        const actor = game.actors.get(speaker.actor);
        if (actor?.name) {
            return actor.name;
        }
    }

    // 2. Try speaker alias
    if (speaker?.alias) {
        return speaker.alias;
    }

    // 3. Try user name
    const user = game.user;
    if (user?.name) {
        return user.name;
    }

    return game.i18n.localize("CYBERPUNK.Unknown");
}

/**
 * Get player/user name for the speaker
 * @param {Object} speaker - The ChatMessage speaker object
 * @returns {string} Player name
 */
export function getPlayerName(speaker) {
    // Try to find user associated with this actor
    if (speaker?.actor) {
        const user = game.users.find(u => u.character?.id === speaker.actor);
        if (user?.name) {
            return user.name;
        }
    }

    // Fall back to current user
    return game.user?.name || game.i18n.localize("CYBERPUNK.Player");
}

// Check whether a formula string contains dice notation
export function containsDice(formula) {
    try {
        return Roll.parse(formula).some(term => term instanceof foundry.dice.terms.Die);
    } catch {
        return false;
    }
}

// Build a Cyberpunk d10 roll from optional modifier terms
export function buildD10Roll(terms, rollData) {
    const formula = [EXPLODING_D10, ...(terms ?? [])].filter(Boolean).join(" + ");
    return new Roll(formula, rollData);
}

// Extract structured dice info from an evaluated roll for chat card rendering
export function extractDiceResults(roll) {
    return roll.dice.map(die => {
        const { faces, flavor, total, expression } = die;
        return {
            formula: expression,
            total,
            faces,
            flavor,
            results: die.results.map(r => {
                const hasOutcome = r.success !== undefined || r.failure !== undefined;
                return {
                    result: die.getResultLabel(r),
                    classes: buildResultClasses(r, faces, hasOutcome),
                };
            })
        };
    });
}

function buildResultClasses(r, faces, hasOutcome) {
    const tags = [];
    if (r.success) tags.push("success");
    if (r.failure) tags.push("failure");
    if (r.rerolled) tags.push("rerolled");
    if (r.exploded) tags.push("exploded");
    if (r.discarded) tags.push("discarded");
    if (!hasOutcome && r.result === 1) tags.push("min");
    if (!hasOutcome && r.result === faces) tags.push("max");
    tags.unshift(`d${faces}`);
    return tags.join(" ");
}

/**
 * Process a Roll into dice groups for the formula-roll template.
 * Groups dice by type (4d6, 2d10, etc.). Numeric modifiers are shown in formula only.
 * @param {Roll} roll - An evaluated Foundry Roll
 * @returns {Object} Template data with diceGroups, formula, and total
 */
export function processFormulaRoll(roll) {
    const diceGroups = [];

    for (const term of roll.terms) {
        if (term instanceof foundry.dice.terms.Die) {
            // Dice term (e.g., 4d6)
            const faces = term.faces;
            const dice = term.results.map(r => {
                const isMax = r.result === faces;
                const isMin = r.result === 1;
                return {
                    result: r.result,
                    faces: faces,
                    classes: [
                        r.exploded ? "exploded" : null,
                        r.discarded ? "discarded" : null,
                        isMin ? "min" : null,
                        isMax ? "max" : null
                    ].filter(c => c).join(" ")
                };
            });

            diceGroups.push({
                label: `${term.number}d${faces}`,
                subtotal: term.total,
                faces: faces,
                dice: dice
            });
        }
        // Skip NumericTerms and OperatorTerms - they're shown in the formula bar
    }

    return {
        formula: roll.formula,
        total: roll.total,
        diceGroups: diceGroups
    };
}

// --- RollBundle: bundle multiple rolls into a single chat card ---

function findFirstDie(roll) {
    return roll.terms?.find(t => t instanceof foundry.dice.terms.Die);
}

export class RollBundle {
    constructor(title, flavor = "") {
        this.title = title;
        this.flavor = flavor;
        this.entries = []; // Each entry: { roll, meta }
    }

    addRoll(roll, { name, flavor, critThreshold, fumbleThreshold } = {}, extra = {}) {
        const die = findFirstDie(roll);
        this.entries.push({
            roll,
            meta: {
                name,
                flavor,
                critThreshold: critThreshold ?? (die ? die.number * die.faces : undefined),
                fumbleThreshold: fumbleThreshold ?? (die ? die.number : undefined),
                ...extra,
            }
        });
        return this;
    }

    async execute(speaker, templatePath, extraTemplateData = {}) {
        // Evaluate any unevaluated rolls
        await Promise.all(this.entries.map(({ roll }) =>
            roll._evaluated ? roll : roll.evaluate()
        ));

        speaker ??= ChatMessage.getSpeaker();

        // Build actor info for card header
        const actorInfo = {
            image: getActorImage(speaker),
            name: getActorName(speaker),
            playerName: getPlayerName(speaker),
            timestamp: new Date().toLocaleString(game.i18n.lang, {
                month: 'short', day: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            })
        };

        const templateData = foundry.utils.mergeObject({
            user: game.user.id,
            title: this.title,
            flavor: this.flavor,
            actorInfo,
            rolls: this.entries.map(({ roll, meta }) => {
                const primaryDie = findFirstDie(roll) ?? roll.terms[0];
                return {
                    ...meta,
                    roll,
                    dice: extractDiceResults(roll),
                    isCrit: meta.critThreshold != null && primaryDie.total >= meta.critThreshold,
                    isFumble: meta.fumbleThreshold != null && primaryDie.total <= meta.fumbleThreshold,
                };
            }),
        }, extraTemplateData ?? {});

        await ChatMessage.create({
            rolls: this.entries.map(e => e.roll).filter(r => r.dice.length > 0),
            user: game.user.id,
            speaker,
            sound: "sounds/dice.wav",
            content: await foundry.applications.handlebars.renderTemplate(templatePath, templateData)
        });
        return this;
    }

    async defaultExecute(extraTemplateData = {}, actor = null) {
        const speaker = actor
            ? ChatMessage.getSpeaker({ actor })
            : ChatMessage.getSpeaker();
        return this.execute(speaker, CHAT_ROLL_TEMPLATE, extraTemplateData);
    }

    /**
     * Set the actor context for this roll. Used to ensure proper speaker data.
     * @param {Actor} actor - The actor making this roll
     * @returns {RollBundle} This instance for chaining
     */
    setActor(actor) {
        this._actor = actor;
        return this;
    }

    /**
     * Execute the roll using the stored actor context
     * @param {Object} extraTemplateData - Additional data for the template
     * @returns {Promise<RollBundle>}
     */
    async defaultExecuteForActor(extraTemplateData = {}) {
        return this.defaultExecute(extraTemplateData, this._actor);
    }
}

// Backward-compatible accessors for code that reads .rolls or .rollMeta directly
Object.defineProperties(RollBundle.prototype, {
    rolls: { get() { return this.entries.map(e => e.roll); } },
    rollMeta: { get() { return this.entries.map(e => e.meta); } },
});

// Quick single-roll helper
async function quickD10({ title, speaker, initialTerm = EXPLODING_D10, terms, critical = 10, fumble = 1, flavor, rollData, chatTemplate, chatTemplateData, useRollMessage = false }) {
    const formula = [initialTerm, ...(terms ?? [])].filter(Boolean).join(" + ");
    const roll = await new Roll(formula, rollData).evaluate();

    if (useRollMessage) {
        await roll.toMessage({ speaker, flavor: flavor ?? title });
        return roll;
    }

    return new RollBundle(title, flavor ?? title)
        .addRoll(roll, { critThreshold: critical, fumbleThreshold: fumble })
        .execute(speaker, chatTemplate, chatTemplateData);
}
