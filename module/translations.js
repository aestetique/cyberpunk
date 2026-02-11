export { localize } from "./utils.js";

export function getMartialKeyByName(name) {
    const martials = game.i18n.translations.CYBERPUNK?.martials ?? {};
    return Object.entries(martials).find(([, v]) => v === name)?.[0];
}
