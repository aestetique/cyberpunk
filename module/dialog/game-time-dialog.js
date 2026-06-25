import { localize } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

export function formatGameTimeShort(timestamp) {
    const d = new Date(timestamp);
    const month = MONTHS[d.getUTCMonth()];
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const h = String(d.getUTCHours()).padStart(2, "0");
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    return `${month} ${day}, ${year}, ${h}:${m}`;
}

export function parseCampaignStartDate(str) {
    const parsed = Date.parse(str.replace(" ", "T") + "Z");
    return isNaN(parsed) ? Date.UTC(2045, 0, 1) : parsed;
}

export function getCurrentGameTime() {
    const startStr = game.settings.get("cyberpunk", "campaignStartDate");
    const offset = game.settings.get("cyberpunk", "gameTimeOffset");
    return parseCampaignStartDate(startStr) + offset;
}

export class GameTimeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor() {
        super({});
        this._selectedIncrement = 6;
        this._dropdownOpen = false;
    }

    static DEFAULT_OPTIONS = {
        id: "game-time-dialog",
        classes: ["cyberpunk", "game-time-dialog"],
        position: { width: 300, height: "auto" },
        window: { frame: true, positioned: true, resizable: false, minimizable: true, controls: [] },
        actions: {
            closeDialog:    GameTimeDialog._onCloseDialog,
            toggleDropdown: GameTimeDialog._onToggleDropdown,
            pickIncrement:  GameTimeDialog._onPickIncrement,
            timePlus:       GameTimeDialog._onTimePlus,
            timeMinus:      GameTimeDialog._onTimeMinus
        }
    };

    static PARTS = {
        body: { template: "systems/cyberpunk/templates/dialog/game-time.hbs" }
    };

    get title() { return localize("GameTime"); }

    static _onCloseDialog(event, _target) {
        event?.preventDefault?.();
        this.close({ animate: false });
    }

    static _onToggleDropdown(event, _target) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        this._dropdownOpen = !this._dropdownOpen;
        this.element.querySelector('.range-dropdown-list')?.classList.toggle('open', this._dropdownOpen);
        this.element.querySelector('.range-dropdown-btn')?.classList.toggle('open', this._dropdownOpen);
    }

    static _onPickIncrement(event, target) {
        event?.preventDefault?.();
        this._selectedIncrement = Number(target.dataset.index);
        this._dropdownOpen = false;
        this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
        this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
        const labelEl = this.element.querySelector('.range-label');
        if (labelEl) labelEl.textContent = INCREMENTS[this._selectedIncrement].label;
        this.element.querySelectorAll('.range-option').forEach(el => el.classList.remove('selected'));
        target.classList.add('selected');
    }

    static async _onTimePlus(event, _target) {
        event?.preventDefault?.();
        const delta = INCREMENTS[this._selectedIncrement].ms;
        const offset = game.settings.get("cyberpunk", "gameTimeOffset");
        await game.settings.set("cyberpunk", "gameTimeOffset", offset + delta);
        this.render();
    }

    static async _onTimeMinus(event, _target) {
        event?.preventDefault?.();
        const delta = INCREMENTS[this._selectedIncrement].ms;
        const offset = game.settings.get("cyberpunk", "gameTimeOffset");
        await game.settings.set("cyberpunk", "gameTimeOffset", offset - delta);
        this.render();
    }

    async _prepareContext(_options) {
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

    _onRender(context, options) {
        super._onRender(context, options);
        const header = this.element.querySelector('.reload-header');
        if (header) {
            new foundry.applications.ux.Draggable.implementation(this, this.element, header, false);
        }
        $(document).off('click.gameTimeDropdown');
        $(document).on('click.gameTimeDropdown', (ev) => {
            if (!$(ev.target).closest('.range-dropdown').length) {
                this._dropdownOpen = false;
                this.element.querySelector('.range-dropdown-list')?.classList.remove('open');
                this.element.querySelector('.range-dropdown-btn')?.classList.remove('open');
            }
        });
    }

    async close(options = {}) {
        $(document).off('click.gameTimeDropdown');
        return super.close(options);
    }
}
