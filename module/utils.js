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

// Canonical "grid" casing used by the chat damage grid + downstream lookups.
// Drone hitLocations use lowercase keys; characters use TitleCase Head/Torso
// with camelCase limbs. Normalizing to one form here keeps both targets working.
const GRID_KEY_FORM = {
    head: "Head", torso: "Torso",
    larm: "lArm", rarm: "rArm",
    lleg: "lLeg", rleg: "rLeg"
};
function toGridKey(key) {
    if (!key) return key;
    return GRID_KEY_FORM[String(key).toLowerCase()] || key;
}
// Case-insensitive object key lookup. Returns the actor-side key as it actually
// appears on the object (e.g., "head" for drones, "Head" for characters).
function findActorKey(obj, key) {
    if (!obj || !key) return null;
    if (key in obj) return key;
    const lower = String(key).toLowerCase();
    for (const k of Object.keys(obj)) {
        if (k.toLowerCase() === lower) return k;
    }
    return null;
}

export async function rollLocation(targetActor, targetArea) {
    if(targetArea) {
        // Normalize display names (LeftArm, RightArm, etc.) to data keys (lArm, rArm, etc.)
        const normalizedArea = locationKeyMap[targetArea] || targetArea;
        const targetLocations = targetActor?.system?.hitLocations ?? targetActor?.hitLocations;
        const locations = targetLocations || hitLocationDefaults();
        // Picked area may not exist on this target's shape — fall back to torso (always present).
        let actorKey = findActorKey(locations, normalizedArea)
                    ?? findActorKey(locations, "torso")
                    ?? "Torso";
        const areaEntry = locations[actorKey];
        const locationIndex = areaEntry.location[0];
        let roll = await new Roll(`${locationIndex}`).evaluate();
        return {
            roll: roll,
            areaHit: toGridKey(actorKey)
        };
    }
    // Number to area name lookup
    const targetLookup = targetActor?.system?.hitLocLookup ?? targetActor?.hitLocLookup;
    let areaLookup = targetLookup || areaLookupTable;

    let roll = await new Roll("1d10").evaluate();
    return {
        roll: roll,
        areaHit: toGridKey(areaLookup[roll.total])
    };
}

/**
 * Resolve which zone on a target actor a recorded hit should land on.
 * Picked zones reroute to torso when missing on the target;
 * random rolls re-resolve via the target's own d10→zone lookup.
 * @param {Actor} actor - The target actor receiving damage
 * @param {{rollD10?: number, pickedZone?: string|null}} hit
 * @returns {string} The zone key on the target
 */
export function resolveZoneForTarget(actor, hit) {
    const lookup = actor?.system?.hitLocLookup ?? actor?.hitLocLookup;
    const hitLocations = actor?.system?.hitLocations ?? actor?.hitLocations ?? {};

    if (hit?.pickedZone) {
        const matched = findActorKey(hitLocations, hit.pickedZone);
        if (matched) return matched;
        const torso = findActorKey(hitLocations, "torso");
        return torso || "torso";
    }
    if (lookup && hit?.rollD10 > 0 && lookup[hit.rollD10]) {
        return lookup[hit.rollD10];
    }
    const torso = findActorKey(hitLocations, "torso");
    return torso || "torso";
}

/**
 * Resolve the underlying Actor from a target token entry.
 * Accepts both Token objects (with `.actor`) and lightweight `{id, name}` entries
 * built by some dialog callsites.
 * @param {Object|Token|null|undefined} targetEntry
 * @returns {Actor|null}
 */
export function resolveTargetActor(targetEntry) {
    if (!targetEntry) return null;
    return targetEntry.actor
        ?? canvas?.tokens?.get?.(targetEntry.id)?.actor
        ?? null;
}

/**
 * For a single-target attack against a drone, return the display-name list
 * of body locations that should be hidden in the dialog grid.
 * Returns [] for zero, multiple, or non-drone targets.
 * @param {Array<Token>} targetTokens
 * @returns {string[]} e.g. ["LeftLeg", "RightLeg"]
 */
export function getHiddenLocationsForTargets(targetTokens) {
    if (!targetTokens || targetTokens.length !== 1) return [];
    const actor = resolveTargetActor(targetTokens[0]);
    if (!actor || actor.type !== "drone") return [];
    const zones = actor.system?.hitLocations || {};
    const dataToDisplay = {
        head: "Head",
        torso: "Torso",
        lArm: "LeftArm",
        rArm: "RightArm",
        lLeg: "LeftLeg",
        rLeg: "RightLeg"
    };
    const present = new Set(Object.keys(zones));
    return Object.entries(dataToDisplay)
        .filter(([k]) => !present.has(k))
        .map(([, v]) => v);
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

/**
 * Bind cursor-following hover tooltips to elements matching `selector`.
 * Reads data-flavor / data-tooltip-name / data-calc / data-token-path from the element
 * (with text-content fallbacks for the name) and renders a floating .cyberpunk-tooltip div.
 */
export function bindHoverTooltips(html, selector) {
    document.querySelectorAll('.cyberpunk-tooltip').forEach(t => t.remove());

    html.find(selector).on('mouseenter', ev => {
        const el = ev.currentTarget;
        const flavor = el.dataset.flavor;
        if (!flavor) return;
        const name = el.dataset.tooltipName
            || el.querySelector('.skill-name')?.textContent
            || el.querySelector('.role-label')?.textContent
            || el.querySelector('.stat-name')?.textContent
            || el.querySelector('.action-btn-name')?.textContent
            || el.querySelector('.info-name')?.textContent || "";
        if (!name) return;

        const calc = el.dataset.calc;
        const tokenPath = el.dataset.tokenPath;
        const tip = document.createElement('div');
        tip.className = 'cyberpunk-tooltip';
        tip.innerHTML = `<div class="tooltip-header"><div class="tooltip-name">${name}</div>${tokenPath ? `<span class="tooltip-label">${tokenPath}</span>` : ''}</div><div class="tooltip-desc">${flavor}</div>`
            + (calc ? `<div class="tooltip-calc">${calc}</div>` : '');
        document.body.appendChild(tip);
        el._cpTooltip = tip;

        let top = ev.clientY + 16;
        let left = ev.clientX + 12;
        if (top + tip.offsetHeight > window.innerHeight) top = ev.clientY - tip.offsetHeight - 8;
        if (left + 290 > window.innerWidth) left = ev.clientX - 290 - 12;
        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
    }).on('mousemove', ev => {
        const tip = ev.currentTarget._cpTooltip;
        if (!tip) return;
        let top = ev.clientY + 16;
        let left = ev.clientX + 12;
        if (top + tip.offsetHeight > window.innerHeight) top = ev.clientY - tip.offsetHeight - 8;
        if (left + 290 > window.innerWidth) left = ev.clientX - 290 - 12;
        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
    }).on('mouseleave mousedown', ev => {
        const tip = ev.currentTarget._cpTooltip;
        if (tip) {
            tip.remove();
            ev.currentTarget._cpTooltip = null;
        }
    });
}
