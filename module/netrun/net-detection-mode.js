/**
 * NetSense detection mode — the perception primitive that lets a NET icon
 * "detect" other NET-flagged tokens regardless of physical walls.
 *
 * Why this exists: with `Token#isVisible` overridden to return true for NET
 * tokens viewed by NET viewers, the tokens DO render — but Foundry V13
 * renders visible-but-undetected tokens as silhouettes (no portrait, just
 * the targeting circle). Detection mode = how a vision source tells the
 * engine "I see that token's portrait." Without one, every other NET
 * runner looks like a black ghost.
 *
 * `walls: false` makes the detector ignore wall LOS — NET space is small,
 * everyone in it sees everyone else, walls don't apply.
 */

import { isNetIcon } from "./realm.js";

const NET_SENSE_ID = "netSense";

Hooks.once("init", () => {
    const DetectionMode = foundry?.canvas?.perception?.DetectionMode
        ?? globalThis.DetectionMode;
    if (!DetectionMode) return;

    class NetSense extends DetectionMode {
        constructor() {
            super({
                id: NET_SENSE_ID,
                label: "CYBERPUNK.NetSense",
                type: 0, // SIGHT
                walls: false,
                angle: false
            });
        }

        /** @override — only NET-flagged targets are detection candidates. */
        _canDetect(_visionSource, target) {
            return isNetIcon(target);
        }

        /**
         * @override — short-circuit ALL the per-point checks for NET targets.
         * The standard `_testPoint` runs `_testRange` and `_testLOS`, and V13's
         * default `_testLOS` consults the wall system even when `walls: false`
         * is set on the mode. Returning true here for NET targets bypasses
         * range, LOS, fog, every gate — NET vision is "everyone in cyberspace
         * sees everyone else, full stop."
         */
        _testPoint(_visionSource, _mode, target, _test) {
            return isNetIcon(target);
        }

        /** @override — unconditionally inside range for NET targets. */
        _testRange(_visionSource, _mode, target, _test) {
            return isNetIcon(target);
        }

        /** @override — walls never block NET sense. */
        _testLOS(_visionSource, _mode, target, _test) {
            return isNetIcon(target);
        }
    }

    CONFIG.Canvas.detectionModes[NET_SENSE_ID] = new NetSense();
});
