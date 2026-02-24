import { areaLookupTable, hitLocationDefaults } from "./lookups.js"

const I18N_PREFIX = "CYBERPUNK.";

// --- Text helpers ---

export function toTitleCase(text) {
    return text.split(/\s+/)
        .map(word => word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word)
        .join(" ");
}

export function interpolate(template, value) {
    return template.replace("[VAR]", value);
}

// --- Localization ---

export function localize(key, data = {}) {
    return game.i18n.format(I18N_PREFIX + key, data);
}

export function safeLocalize(key, fallback = key) {
    const fullKey = I18N_PREFIX + key;
    return game.i18n.has(fullKey) ? game.i18n.localize(fullKey) : fallback;
}

export function getMartialKeyByName(name) {
    const martials = game.i18n.translations.CYBERPUNK?.martials ?? {};
    return Object.entries(martials).find(([, v]) => v === name)?.[0];
}

export function localizeShort(key) {
    const shortKey = key + "Short";
    return game.i18n.has(I18N_PREFIX + shortKey) ? safeLocalize(shortKey) : safeLocalize(key);
}

// --- UI helpers ---

// Scrollable tab beautifying
let resizeObserver = null;
export function tabBeautifying() {
    const charsheet = document.querySelector('.character-sheet');
    if (!charsheet) return;
    if (!resizeObserver) {
        resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(charsheet);
    }
    update();

    new MutationObserver(update).observe(charsheet, {
    childList: true,
    subtree: true,
    });
}

function update() {
    const tabs = document.querySelectorAll('.character-sheet .tab');
    tabs.forEach(tab => {
        const hasScroll = tab.scrollHeight > tab.clientHeight;
        tab.classList.toggle('scrollable', hasScroll);
    });
}

// --- Hit location rolling ---

const locationKeyMap = {
    'LeftArm': 'lArm', 'RightArm': 'rArm',
    'LeftLeg': 'lLeg', 'RightLeg': 'rLeg',
    'Head': 'Head', 'Torso': 'Torso'
};

export async function rollLocation(targetActor, targetArea) {
    if(targetArea) {
        // Normalize display names (LeftArm, RightArm, etc.) to data keys (lArm, rArm, etc.)
        const normalizedArea = locationKeyMap[targetArea] || targetArea;
        // Area name to number lookup
        const locations = (!!targetActor) ? targetActor.hitLocations : hitLocationDefaults();
        const locationIndex = locations[normalizedArea].location[0];
        let roll = await new Roll(`${locationIndex}`).evaluate();
        return {
            roll: roll,
            areaHit: normalizedArea
        };
    }
    // Number to area name lookup
    let areaLookup = (!!targetActor && !!targetActor.hitLocLookup) ? targetActor.hitLocLookup : areaLookupTable;

    let roll = await new Roll("1d10").evaluate();
    return {
        roll: roll,
        areaHit: areaLookup[roll.total]
    };
}

// --- Object path utilities ---

export function getByPath(obj, path) {
    return path.split(".").reduce((node, part) => node?.[part], obj);
}

export function setByPath(obj, path, value, force = true) {
    const parts = path.split(".");
    const lastKey = parts.pop();
    const target = parts.reduce((node, part) => {
        if (node[part] === undefined) node[part] = {};
        return node[part];
    }, obj);
    if (target[lastKey] === undefined || force) {
        target[lastKey] = value;
    }
    return obj;
}

export function clamp(x, min, max) {
    return x < min ? min : x > max ? max : x;
}

// --- Armor SP stacking ---

// Layered armor modifier table (CP2020 rules)
const LAYER_BONUS = [[27, 0], [21, 2], [15, 3], [9, 3], [5, 4], [0, 5]];

/**
 * Stack two SP values using the CP2020 layered armor rules.
 * @param {number} existingSP - Current SP on the location
 * @param {number} incomingSP - SP of the new armor layer
 * @returns {number} Combined SP value
 */
export function stackArmorSP(existingSP, incomingSP) {
    if (existingSP === 0 || incomingSP === 0) return existingSP + incomingSP;
    const diff = Math.abs(existingSP - incomingSP);
    const bonus = LAYER_BONUS.find(([threshold]) => diff >= threshold)?.[1] ?? 5;
    return Math.max(existingSP, incomingSP) + bonus;
}

// --- Hit location index building ---

/**
 * Build a d10-roll → location-key lookup from the hit locations data.
 * Also resets stoppingPower to 0 on each location.
 * @param {Object} hitLocations - The actor's hitLocations data
 * @returns {Object} Map of roll result → location key
 */
export function buildHitLocationIndex(hitLocations) {
    const lookup = {};
    for (const [key, area] of Object.entries(hitLocations)) {
        area.stoppingPower = 0;
        const [start, end] = area.location;
        if (!end) {
            lookup[start] = key;
        } else {
            for (let i = start; i <= end; i++) {
                lookup[i] = key;
            }
        }
    }
    return lookup;
}
