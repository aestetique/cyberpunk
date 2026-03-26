import { localize } from "../utils.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const INCREMENTS = [
    { label: "YEAR",    ms: 31536000000 },
    { label: "MONTH",   ms: 2592000000 },
    { label: "WEEK",    ms: 604800000 },
    { label: "DAY",     ms: 86400000 },
    { label: "HOUR",    ms: 3600000 },
    { label: "MINUTE",  ms: 60000 },
    { label: "SECOND",  ms: 1000 }
];

/**
 * Format a ms-epoch timestamp into the full dialog display.
 * e.g. "Feb 7, 2045, Wednesday, 18:38:42"
 */
export function formatGameTimeFull(timestamp) {
    const d = new Date(timestamp);
    const month = MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const weekday = DAYS[d.getUTCDay()];
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const s = String(d.getUTCSeconds()).padStart(2, "0");
    return `${month} ${day}, ${year}, ${weekday}, ${h}:${m}:${s}`;
}

/**
 * Format a ms-epoch timestamp for chat display.
 * e.g. "Feb 7, 2045, 18:38"
 */
export function formatGameTimeShort(timestamp) {
    const d = new Date(timestamp);
    const month = MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${month} ${day}, ${year}, ${h}:${m}`;
}

/**
 * Parse the campaignStartDate setting string into a ms-epoch number.
 */
export function parseCampaignStartDate(str) {
    // Expected format: "2045-01-01 00:00:00"
    const parsed = Date.parse(str.replace(" ", "T") + "Z");
    return isNaN(parsed) ? Date.UTC(2045, 0, 1) : parsed;
}

/**
 * Get the current in-game timestamp (ms epoch).
 */
export function getCurrentGameTime() {
    const startStr = game.settings.get("cyberpunk", "campaignStartDate");
    const offset = game.settings.get("cyberpunk", "gameTimeOffset");
    return parseCampaignStartDate(startStr) + offset;
}

export class GameTimeDialog extends Application {
    constructor() {
        super();
        this._selectedIncrement = 6; // Default: 6 Hours
        this._dropdownOpen = false;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "game-time-dialog",
            classes: ["cyberpunk", "game-time-dialog"],
            template: "systems/cyberpunk/templates/dialog/game-time.hbs",
            width: 300,
            height: "auto",
            popOut: true,
            minimizable: true,
            resizable: false
        });
    }

    get title() {
        return localize("GameTime");
    }

    getData() {
        const currentTime = getCurrentGameTime();
        return {
            displayTime: formatGameTimeFull(currentTime),
            increments: INCREMENTS.map((inc, i) => ({
                index: i,
                label: inc.label,
                selected: i === this._selectedIncrement
            })),
            selectedLabel: INCREMENTS[this._selectedIncrement].label
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Draggable header (standard pattern)
        const header = html.find('.reload-header')[0];
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, html, header, false);
        }

        // Close button
        html.find('.header-control.close').click(() => this.close());

        // Dropdown toggle
        html.find('.range-dropdown-btn').click(ev => {
            ev.stopPropagation();
            this._dropdownOpen = !this._dropdownOpen;
            html.find('.range-dropdown-list').toggleClass('open', this._dropdownOpen);
            html.find('.range-dropdown-btn').toggleClass('open', this._dropdownOpen);
        });

        // Dropdown option selection
        html.find('.range-option').click(ev => {
            this._selectedIncrement = Number(ev.currentTarget.dataset.index);
            this._dropdownOpen = false;
            html.find('.range-dropdown-list').removeClass('open');
            html.find('.range-dropdown-btn').removeClass('open');
            html.find('.range-label').text(INCREMENTS[this._selectedIncrement].label);
            html.find('.range-option').removeClass('selected');
            ev.currentTarget.classList.add('selected');
        });

        // Close dropdown on outside click
        $(document).on('click.gameTimeDropdown', (ev) => {
            if (!$(ev.target).closest('.range-dropdown').length) {
                this._dropdownOpen = false;
                html.find('.range-dropdown-list').removeClass('open');
                html.find('.range-dropdown-btn').removeClass('open');
            }
        });

        // Plus / minus buttons
        html.find('.game-time-minus').click(async () => {
            const delta = INCREMENTS[this._selectedIncrement].ms;
            const offset = game.settings.get("cyberpunk", "gameTimeOffset");
            await game.settings.set("cyberpunk", "gameTimeOffset", offset - delta);
            this.render(false);
        });

        html.find('.game-time-plus').click(async () => {
            const delta = INCREMENTS[this._selectedIncrement].ms;
            const offset = game.settings.get("cyberpunk", "gameTimeOffset");
            await game.settings.set("cyberpunk", "gameTimeOffset", offset + delta);
            this.render(false);
        });
    }

    close(options = {}) {
        $(document).off('click.gameTimeDropdown');
        return super.close(options);
    }
}
