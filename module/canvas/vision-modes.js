/**
 * Custom vision modes for cyberpunk optic cyberware / drugs / gear.
 *
 *   • lowLight — amplifier. If Global Illumination is enabled and Darkness
 *     Level is set, the canvas renders as if darkness were 0. If the scene
 *     has no ambient light (globalLight disabled), Low Light shows nothing
 *     — there's no light to amplify.
 *   • infrared — Foundry-native heat vision. Mirrors the built-in
 *     `darkvision` mode's config verbatim, only extends the level remap to
 *     include UNLIT (so it sees in true darkness, not just dim light).
 *     Native behaviour: B&W in dark areas, colour inside placed light
 *     sources' radii (via Foundry's illumination effects layer painting
 *     the original primary-texture colour on top of the desaturated
 *     primary sprite output).
 *   • thermo   — sees in the absence of light. Inside the vision cone
 *     a custom `ThermalBackgroundVisionShader` maps primary-texture
 *     luminance through a heat gradient (blue → purple → red → orange
 *     → yellow). Inside placed light-source shapes and under Global
 *     Illumination the native illumination compositing paints the
 *     ordinary tinted primary on top of the thermal, so lit regions
 *     read as ordinary colour vision.
 *
 * All three leave DARKNESS and HALFDARK lighting levels untouched, so
 * lights configured with "Is Darkness Source" still block or dim the
 * mode as expected.
 *
 * Sight/detection-mode wiring is in cyberpunk-token-document.js, which
 * subclasses TokenDocument and overrides `_prepareDetectionModes` (same
 * pattern D&D 5e uses in TokenDocument5e).
 */

const { VisionMode } = foundry.canvas.perception;
const { ColorAdjustmentsSamplerShader, BackgroundVisionShader } =
    foundry.canvas.rendering.shaders;

/**
 * Custom background shader for the thermographic vision cone. Extends
 * Foundry's `BackgroundVisionShader` (which normally samples the
 * primary texture and applies saturation/tint) and replaces the
 * colour path with a thermal-palette LUT: perceived luminance of each
 * source pixel maps into a heat gradient — deep blue (cold) → purple
 * → red → orange → yellow → near-white (hottest). Tokens and tiles
 * with higher brightness read as warm; darker environment pixels
 * read as cool.
 *
 * Zoning is handled by Foundry's native compositing: light sources
 * (including the globalLight source when Global Illumination is
 * enabled) add their background meshes to `background.lighting`,
 * which renders AFTER `background.vision` (where this shader paints),
 * with alpha = 1 and NORMAL blend. So placed-light shapes and the
 * whole scene under globalLight overwrite our thermal palette with
 * the ordinary tinted primary — ordinary colour vision inside those
 * regions. Verified by tracing foundry.mjs:163505-163524 (container
 * add order) and 164540-164556 (mesh routing).
 */
class ThermalBackgroundVisionShader extends BackgroundVisionShader {
    /** @override */
    static _createFragmentShader() {
        return `
        ${this.SHADER_HEADER}
        ${this.PERCEIVED_BRIGHTNESS}

        vec3 thermalPalette(float t) {
            t = clamp(t, 0.0, 1.0);
            if (t < 0.25) return mix(vec3(0.02, 0.05, 0.45), vec3(0.45, 0.05, 0.6),  t / 0.25);
            if (t < 0.5)  return mix(vec3(0.45, 0.05, 0.6),  vec3(0.95, 0.15, 0.15), (t - 0.25) / 0.25);
            if (t < 0.75) return mix(vec3(0.95, 0.15, 0.15), vec3(1.0,  0.75, 0.1),  (t - 0.5) / 0.25);
            return mix(vec3(1.0, 0.75, 0.1), vec3(1.0, 1.0, 0.95), (t - 0.75) / 0.25);
        }

        void main() {
          ${this.FRAGMENT_BEGIN}
          float luma = perceivedBrightness(baseColor.rgb);
          finalColor = thermalPalette(luma);
          gl_FragColor = vec4(finalColor, 1.0) * depth;
        }`;
    }
}

export function registerCyberpunkVisionModes() {
    const LL = VisionMode.LIGHTING_LEVELS;
    const LV = VisionMode.LIGHTING_VISIBILITY;

    // Low Light Amplification.
    // Exposure post-processing on the illumination layer counteracts
    // the scene's darkness modulation, so a scene with globalLight
    // enabled + darknessLevel = 1 renders about as bright as the same
    // scene at darknessLevel = 0 without Low Light. When there's no
    // ambient light at all (globalLight disabled), nothing to expose,
    // and the scene stays dark.
    CONFIG.Canvas.visionModes.lowLight = new VisionMode({
        id: "lowLight",
        label: "CYBERPUNK.VisionModeLowLight",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0, saturation: 0, brightness: 0 }
        },
        lighting: {
            illumination: {
                postProcessingModes: ["EXPOSURE"],
                uniforms: { exposure: 1.5 }
            }
        },
        vision: {
            darkness: { adaptive: true },
            defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 }
        }
    });

    // Infrared — copy of Foundry's built-in `darkvision` config with
    // only two differences:
    //   • id/label (naming for cyberpunk).
    //   • Level remap extended to UNLIT (built-in darkvision only
    //     remaps DIM; infrared IS the heat-vision case that sees in
    //     true darkness).
    // Everything else — canvas shader, uniforms, background REQUIRED,
    // vision.darkness.adaptive: false, defaults — matches darkvision
    // exactly. See Foundry `visionModes.darkvision` at
    // /home/ubuntu/foundry-v14/public/scripts/foundry.mjs:215953.
    CONFIG.Canvas.visionModes.infrared = new VisionMode({
        id: "infrared",
        label: "CYBERPUNK.VisionModeInfrared",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: { contrast: 0, saturation: -1, brightness: 0 }
        },
        lighting: {
            levels: {
                [LL.UNLIT]: LL.BRIGHT,
                [LL.DIM]:   LL.BRIGHT
            },
            background: { visibility: LV.REQUIRED }
        },
        vision: {
            darkness: { adaptive: false },
            defaults: { attenuation: 0, contrast: 0, saturation: -1, brightness: 0 }
        }
    });

    // Thermographic — thermal palette inside the vision cone via
    // ThermalBackgroundVisionShader, with the native infrared-style
    // zoning: light sources render on top and restore original colour
    // in their shape (foundry.mjs:163505-163524 + 164540-164556 — the
    // `background.lighting` container is added AFTER `background.vision`,
    // so light-source meshes overwrite our thermal). When Global
    // Illumination is enabled the globalLight source acts as a full-
    // scene light and the whole cone reads as ordinary colour vision.
    // Canvas shader kept neutral so pixels outside the cone (visible
    // via light perception) also render as ordinary colour.
    CONFIG.Canvas.visionModes.thermo = new VisionMode({
        id: "thermo",
        label: "CYBERPUNK.VisionModeThermo",
        canvas: {
            shader: ColorAdjustmentsSamplerShader,
            uniforms: {
                contrast: 0, saturation: 0, brightness: 0,
                tint: [1, 1, 1]
            }
        },
        lighting: {
            levels: {
                [LL.UNLIT]: LL.BRIGHT,
                [LL.DIM]:   LL.BRIGHT
            },
            background: { visibility: LV.REQUIRED }
        },
        vision: {
            darkness: { adaptive: false },
            defaults: { attenuation: 0, contrast: 0, saturation: 0, brightness: 0 },
            background: { shader: ThermalBackgroundVisionShader }
        }
    });
}
