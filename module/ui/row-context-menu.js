/**
 * Right-click ContextMenu wiring for sheet rows.
 *
 * Every sheet with per-item rows (character / drone / netware-actor /
 * shop) calls `attachRowMenu` for each row selector during _onRender.
 * The menu is redundant with the existing per-row action icons — same
 * actions, discoverable in one place. We deliberately delegate to the
 * existing DOM icons via `.click()` so both entry paths share one
 * implementation (no duplicated handlers to drift apart).
 *
 * Foundry V14 ContextMenu API — `foundry.applications.ux.ContextMenu`
 * uses the new `label` / `visible` keys (not V13's `name` / `condition`;
 * the compat shim in cyberpunk.js#init still upgrades any legacy shape
 * from third-party modules, so entries can safely use the new keys
 * directly here).
 *
 * Common entry shape:
 *   {
 *     label:    localize("View"),
 *     icon:     "<i class='fas fa-eye'></i>",
 *     visible:  (li) => !!li.querySelector(".gear-view"),
 *     callback: (li) => li.querySelector(".gear-view")?.click()
 *   }
 *
 * `callback` receives the row element (HTMLElement) because we always
 * construct with `jQuery: false`.
 */

/**
 * Attach a right-click ContextMenu to every element matching `selector`
 * inside `root`. `buildEntries(rowEl)` returns the raw entry array;
 * each call gets the specific row element so entries can inspect
 * row-level markup (data attributes, child button presence) when
 * computing `visible`.
 *
 * @param {HTMLElement|jQuery} root
 * @param {string} selector
 * @param {(rowEl: HTMLElement) => Array<object>} buildEntries
 */
export function attachRowMenu(root, selector, buildEntries) {
    const el = root?.jquery ? root[0] : root;
    if (!el) return null;
    if (!el.querySelector?.(selector)) return null;
    // Foundry V14 wants an array up-front but re-reads on each open when
    // we pass a function, so per-row visibility is naturally per-open.
    // Older overloads insist on an array; we pass an array of entries
    // and let each `visible` callback decide.
    const entries = buildEntries(null) || [];
    return new foundry.applications.ux.ContextMenu.implementation(el, selector, entries, {
        eventName: "contextmenu",
        jQuery:    false,
        fixed:     true
    });
}

/**
 * Shortcut: an entry that delegates to a per-row action icon by CSS
 * selector inside the row. Visible only if that icon is present in
 * the row's DOM (which encodes the "is this action available?" check
 * — the sheet template already omits icons when the action doesn't
 * apply, so the menu inherits the same rules for free).
 *
 * @param {string} label
 * @param {string} iconHTML   Inner HTML for the menu's leading icon
 * @param {string} iconSelector  CSS selector inside the row
 * @returns {object} menu entry
 */
export function delegateEntry(label, iconHTML, iconSelector) {
    return {
        label,
        icon:     iconHTML,
        visible:  (li) => !!li.querySelector(iconSelector),
        callback: (li) => li.querySelector(iconSelector)?.click()
    };
}
