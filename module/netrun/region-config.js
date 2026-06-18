/**
 * Region Config extension — adds the "NET Room" toggle to Foundry's built-in
 * Region configuration dialog. A region with `flag.cyberpunk.netRoom = true`
 * becomes a piece of NET architecture: the cyan-glow layer paints its
 * polygon when a NET icon is inside it, and (later) it'll be the unit of
 * traversal for Pathfinder room reveal.
 *
 * Foundry's RegionConfig is a FormApplication; any `name="flags.cyberpunk.X"`
 * input it submits gets written straight to the region document's flag store
 * by the form serializer — no save handler of our own needed.
 *
 * Defensive on Foundry V13's mid-migration: works whether the hook delivers
 * jQuery (v1) or an HTMLElement (v2), and probes a few common footer
 * anchors so the field shows up before the dialog buttons.
 */

function $html(htmlOrEl) {
    return htmlOrEl instanceof jQuery ? htmlOrEl : $(htmlOrEl);
}

function getRegionDocument(app) {
    return app.document ?? app.object ?? null;
}

Hooks.on("renderRegionConfig", (app, htmlOrEl) => {
    const html = $html(htmlOrEl);
    const region = getRegionDocument(app);
    if (!region) return;

    // Idempotent: if we already injected a fieldset on a previous render
    // pass for this dialog instance, drop it before adding a fresh one.
    // V13 re-renders the RegionConfig every time a flag is written (our
    // own change handler triggers this!), so without this guard we'd
    // accumulate one new checkbox per click.
    html.find(".cyberpunk-netrun-config").remove();

    const isNetRoom = region.getFlag?.("cyberpunk", "netRoom") === true;

    const labels = {
        legend: game.i18n.localize("CYBERPUNK.NetArchitecture"),
        netRoom: game.i18n.localize("CYBERPUNK.NetRoom"),
        hint: game.i18n.localize("CYBERPUNK.NetRoomHint")
    };

    const section = $(`
        <fieldset class="cyberpunk-netrun-config">
            <legend>${labels.legend}</legend>
            <div class="form-group">
                <label>${labels.netRoom}</label>
                <div class="form-fields">
                    <input type="checkbox" name="flags.cyberpunk.netRoom"${isNetRoom ? " checked" : ""}>
                </div>
                <p class="hint">${labels.hint}</p>
            </div>
        </fieldset>
    `);

    // Insert before the dialog footer / submit button.
    const anchors = [
        html.find("footer.sheet-footer"),
        html.find(".form-footer"),
        html.find('button[type="submit"]'),
    ];
    const anchor = anchors.find(a => a.length);
    if (anchor) anchor.first().before(section);
    else html.find("form").first().append(section);

    // Bypass the form serializer entirely — RegionConfig in V13 has been
    // inconsistent about whether nested-flag checkboxes survive its
    // expandObject step, especially in ApplicationV2 mode. Writing the flag
    // live on change is more reliable. Guard against no-op writes so a
    // re-render with the same state doesn't trigger another write cycle.
    section.find('input[name="flags.cyberpunk.netRoom"]').on("change", async (ev) => {
        const want = ev.target.checked === true;
        const have = region.getFlag("cyberpunk", "netRoom") === true;
        if (want === have) return;
        await region.setFlag("cyberpunk", "netRoom", want);
    });

    if (typeof app.setPosition === "function") {
        app.setPosition({ height: "auto" });
    }
});
