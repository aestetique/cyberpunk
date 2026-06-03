// Flat caliber enum — every caliber slug maps to a localization key in lang/*.json.
// The display label is what the user sees in dropdowns; the slug is the stored value.
//
// Compatibility is caliber-based: weapon.system.caliber === ammo.system.caliber
// is the only check `isAmmoCompatibleWith` performs.
//
// CALIBER_VALID_AMMO_TYPES restricts which ammoTypes the Ammo sheet's dropdown
// will offer per caliber. CALIBER_DAMAGE locks the damage formula for non-grenade
// modes and pre-fills it for grenade ammo (which the user may then override).

const STANDARD_4         = ["standard", "armorPiercing", "hollowPoint", "rubberSlug"];
const STANDARD_4_GRENADE = [...STANDARD_4, "grenade"];
const STD_AP_HP          = ["standard", "armorPiercing", "hollowPoint"];
const STD_AP             = ["standard", "armorPiercing"];
const STD_ONLY           = ["standard"];
const AP_ONLY            = ["armorPiercing"];
const GRENADE_ONLY       = ["grenade"];

/**
 * Per-caliber valid ammo types. Drives the ammoType dropdown on the Ammo card.
 */
export const CALIBER_VALID_AMMO_TYPES = {
    "300M":         AP_ONLY,
    "357":          STANDARD_4,
    "38":           STANDARD_4,
    "410ga":        AP_ONLY,
    "44":           STANDARD_4,
    "44_ET":        AP_ONLY,
    "45":           STANDARD_4,
    "454":          STANDARD_4,
    "454_ET":       AP_ONLY,
    "50_ET":        AP_ONLY,
    "75":           AP_ONLY,
    "10ga":         STANDARD_4_GRENADE,
    "10mm":         STANDARD_4,
    "10RJ":         AP_ONLY,
    "11mm":         STANDARD_4,
    "12_7":         STD_AP,
    "12ga":         STANDARD_4_GRENADE,
    "12ga_ET":      AP_ONLY,
    "12mm":         STANDARD_4,
    "12mm_R":       AP_ONLY,
    "13mm":         STD_AP_HP,
    "14_5":         STD_AP,
    "14mm":         STD_AP_HP,
    "15_BMG":       STD_AP,
    "18mm":         STD_AP,
    "18mm_G":       AP_ONLY,
    "20ga":         STANDARD_4_GRENADE,
    "20mm_ET":      AP_ONLY,
    "20mm_FF":      AP_ONLY,
    "20x102mm":     STD_AP,
    "20x82mm":      STD_AP,
    "25mm":         STD_AP,
    "25mm_Grenade": GRENADE_ONLY,
    "28ga":         STANDARD_4_GRENADE,
    "3_5_FF":       AP_ONLY,
    "30_06_C":      STANDARD_4,
    "30mm":         STD_AP,
    "30mm_Grenade": GRENADE_ONLY,
    "4_5mm_R":      AP_ONLY,
    "40mm_Grenade": GRENADE_ONLY,
    "5_56":         STD_AP,
    "5_5mm":        AP_ONLY,
    "5mm":          STANDARD_4,
    "5mm_EAP":      AP_ONLY,
    "6_5_ET":       AP_ONLY,
    "6_5_H":        STD_AP,
    "6_5mm":        STD_AP,
    "60mm_Grenade": GRENADE_ONLY,
    "6mm":          STANDARD_4,
    "6mm_R":        AP_ONLY,
    "7_62":         STD_AP,
    "7_62_ET":      AP_ONLY,
    "7_7mm":        STD_AP,
    "7mm":          STANDARD_4,
    "8_5_RJ":       AP_ONLY,
    "9mm":          STANDARD_4,
    "9mm_L":        STD_AP,
    "Flechette":    AP_ONLY,
    "Micromissile": STD_ONLY,
    "Sliver":       AP_ONLY
};

/**
 * Per-caliber damage formula. Locked into ammo damage for every non-grenade ammoType;
 * pre-filled (but editable) for grenade ammo, since grenades carry payload-specific
 * damage that may differ from the caliber's standard round.
 */
export const CALIBER_DAMAGE = {
    "300M":         "7d6+3",
    "357":          "2d6+3",
    "38":           "2d6",
    "410ga":        "6d6",
    "44":           "4d6",
    "44_ET":        "6d6",
    "45":           "2d6+2",
    "454":          "4d6+3",
    "454_ET":       "6d6+3",
    "50_ET":        "8d10+3",
    "75":           "7d10+4",
    "10ga":         "6d6",
    "10mm":         "2d6+3",
    "10RJ":         "7d6+1",
    "11mm":         "3d6",
    "12_7":         "6d10",
    "12ga":         "4d6",
    "12ga_ET":      "6d6",
    "12mm":         "4d6+1",
    "12mm_R":       "6d6",
    "13mm":         "4d6+2",
    "14_5":         "7d10",
    "14mm":         "6d6",
    "15_BMG":       "7d10",
    "18mm":         "3d10",
    "18mm_G":       "7d6",
    "20ga":         "3d6",
    "20mm_ET":      "8d10",
    "20mm_FF":      "4d6*1d3",
    "20x102mm":     "8d10",
    "20x82mm":      "4d10",
    "25mm":         "5d10+10",
    "25mm_Grenade": "3d6",
    "28ga":         "2d6+1",
    "3_5_FF":       "6d6",
    "30_06_C":      "5d6+1",
    "30mm":         "9d10",
    "30mm_Grenade": "6d6",
    "4_5mm_R":      "4d6",
    "40mm_Grenade": "8d6",
    "5_56":         "5d6",
    "5_5mm":        "4d6+2",
    "5mm":          "1d6",
    "5mm_EAP":      "3d10",
    "6_5_ET":       "9d6",
    "6_5_H":        "6d6-1",
    "6_5mm":        "5d6+3",
    "60mm_Grenade": "8d10",
    "6mm":          "1d6+1",
    "6mm_R":        "4d6+1",
    "7_62":         "6d6+2",
    "7_62_ET":      "9d6+3",
    "7_7mm":        "3d6+3",
    "7mm":          "1d6+2",
    "8_5_RJ":       "7d6",
    "9mm":          "2d6+1",
    "9mm_L":        "2d6+4",
    "Flechette":    "1d5*1d2",
    "Micromissile": "4d6",
    "Sliver":       "2d6*1d3"
};

/**
 * The caliber enum. Keyed by slug (storage value) → localization key.
 * Order matches the user's reference list.
 */
export const calibers = {
    "300M":         "Caliber300M",
    "357":          "Caliber357",
    "38":           "Caliber38",
    "410ga":        "Caliber410ga",
    "44":           "Caliber44",
    "44_ET":        "Caliber44_ET",
    "45":           "Caliber45",
    "454":          "Caliber454",
    "454_ET":       "Caliber454_ET",
    "50_ET":        "Caliber50_ET",
    "75":           "Caliber75",
    "10ga":         "Caliber10ga",
    "10mm":         "Caliber10mm",
    "10RJ":         "Caliber10RJ",
    "11mm":         "Caliber11mm",
    "12_7":         "Caliber12_7",
    "12ga":         "Caliber12ga",
    "12ga_ET":      "Caliber12ga_ET",
    "12mm":         "Caliber12mm",
    "12mm_R":       "Caliber12mm_R",
    "13mm":         "Caliber13mm",
    "14_5":         "Caliber14_5",
    "14mm":         "Caliber14mm",
    "15_BMG":       "Caliber15_BMG",
    "18mm":         "Caliber18mm",
    "18mm_G":       "Caliber18mm_G",
    "20ga":         "Caliber20ga",
    "20mm_ET":      "Caliber20mm_ET",
    "20mm_FF":      "Caliber20mm_FF",
    "20x102mm":     "Caliber20x102mm",
    "20x82mm":      "Caliber20x82mm",
    "25mm":         "Caliber25mm",
    "25mm_Grenade": "Caliber25mm_Grenade",
    "28ga":         "Caliber28ga",
    "3_5_FF":       "Caliber3_5_FF",
    "30_06_C":      "Caliber30_06_C",
    "30mm":         "Caliber30mm",
    "30mm_Grenade": "Caliber30mm_Grenade",
    "4_5mm_R":      "Caliber4_5mm_R",
    "40mm_Grenade": "Caliber40mm_Grenade",
    "5_56":         "Caliber5_56",
    "5_5mm":        "Caliber5_5mm",
    "5mm":          "Caliber5mm",
    "5mm_EAP":      "Caliber5mm_EAP",
    "6_5_ET":       "Caliber6_5_ET",
    "6_5_H":        "Caliber6_5_H",
    "6_5mm":        "Caliber6_5mm",
    "60mm_Grenade": "Caliber60mm_Grenade",
    "6mm":          "Caliber6mm",
    "6mm_R":        "Caliber6mm_R",
    "7_62":         "Caliber7_62",
    "7_62_ET":      "Caliber7_62_ET",
    "7_7mm":        "Caliber7_7mm",
    "7mm":          "Caliber7mm",
    "8_5_RJ":       "Caliber8_5_RJ",
    "9mm":          "Caliber9mm",
    "9mm_L":        "Caliber9mm_L",
    "Flechette":    "CaliberFlechette",
    "Micromissile": "CaliberMicromissile",
    "Sliver":       "CaliberSliver"
};

/**
 * Validate a caliber slug.
 */
export function isCaliberValid(caliber) {
    return Object.prototype.hasOwnProperty.call(calibers, caliber);
}

/**
 * Return the list of ammoType slugs valid for a caliber. Unknown calibers
 * default to STANDARD_4 (permissive — safer for legacy / hand-rolled data).
 */
export function getValidAmmoTypesForCaliber(caliber) {
    return CALIBER_VALID_AMMO_TYPES[caliber] || STANDARD_4;
}

/**
 * Return the canonical damage formula for a caliber (string), or "" if unknown.
 * Used by the Ammo card (locked for non-grenade ammoType, pre-filled for grenade)
 * and by the Ranged weapon card (always locked).
 */
export function getDamageForCaliber(caliber) {
    return CALIBER_DAMAGE[caliber] || "";
}

// Legacy alias retained for back-compat with code that imported the per-class
// whitelist. Now returns the full caliber set per class — kept so existing
// imports don't break. Compatibility is caliber-match, not class-match.
const ALL_CALIBER_SLUGS = Object.keys(calibers);
export const CALIBERS_BY_AMMO_CLASS = {
    Pistol:   ALL_CALIBER_SLUGS,
    Rifle:    ALL_CALIBER_SLUGS,
    Shotgun:  ALL_CALIBER_SLUGS,
    Heavy:    ALL_CALIBER_SLUGS,
    Bow:      ALL_CALIBER_SLUGS,
    Crossbow: ALL_CALIBER_SLUGS
};
