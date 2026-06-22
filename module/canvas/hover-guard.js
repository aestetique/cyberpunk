/**
 * Defensive wrap around `containsCanvasPoint` on V13 Primary canvas objects
 * to catch the crash:
 *
 *   TypeError: can't access property "width", alphaData is undefined
 *       at #getTextureAlpha → #containsLocalPoint → containsCanvasPoint
 *
 * V13 architecture: each placeable's hit-test is delegated to its
 * `PrimarySpriteMesh` (sprite-backed placeables) or `PrimaryGraphics`
 * (vector-backed). Those are the classes that own `containsCanvasPoint`
 * and that call into `#containsLocalPoint → #getTextureAlpha`. Wrapping
 * placeable classes does nothing — they don't define the method.
 *
 * The pixel-alpha path in `#containsLocalPoint`:
 *   if (textureAlphaThreshold > 0) return #getTextureAlpha(x, y) >= threshold;
 * crashes when `alphaData` isn't populated. Fix: catch, log once per mesh,
 * fall back to plain bounds containment (the early bailout `containsCanvasPoint`
 * already does at the top).
 */
const warned = new WeakSet();

function wrap(ClassRef, label) {
    const proto = ClassRef?.prototype;
    if (!proto) return false;
    if (!Object.prototype.hasOwnProperty.call(proto, "containsCanvasPoint")) return false;
    const original = proto.containsCanvasPoint;
    if (original?.__cyberpunkGuarded) return false;

    function guarded(point, ...rest) {
        try {
            return original.call(this, point, ...rest);
        } catch (err) {
            // Known-quiet case: V13 spawns an empty 1×1 "foreground" placeholder
            // mesh on scenes with no foreground image set, and pixel-alpha
            // hit-testing it crashes. We silently fall back to bounds.
            const tex = this._texture ?? this.texture;
            const base = tex?.baseTexture;
            const isEmptyForegroundPlaceholder =
                this.name === "foreground"
                && !base?.resource?.src
                && !base?.resource?.url
                && tex?.width <= 1
                && tex?.height <= 1;
            if (!isEmptyForegroundPlaceholder && !warned.has(this)) {
                warned.add(this);
                console.warn("[cyberpunk] hover hit-test fell back to bounds", {
                    type: label,
                    meshName: this.name,
                    parentName: this.parent?.name ?? this.parent?.constructor?.name,
                    objectName: this.object?.document?.name,
                    objectId: this.object?.id,
                    objectClass: this.object?.constructor?.name,
                    texSrc: base?.resource?.src ?? base?.resource?.url,
                    texSize: tex ? `${tex.width}x${tex.height}` : null,
                    hasAlphaData: !!base?.alphaData,
                    err: err?.message ?? String(err)
                });
            }
            try {
                return this.canvasBounds?.contains?.(point?.x, point?.y) ?? false;
            } catch {
                return false;
            }
        }
    }

    guarded.__cyberpunkGuarded = true;
    proto.containsCanvasPoint = guarded;
    return true;
}

function patchAll() {
    const primary = foundry.canvas?.primary ?? {};
    const patched = [];
    if (wrap(primary.PrimarySpriteMesh, "PrimarySpriteMesh")) patched.push("PrimarySpriteMesh");
    if (wrap(primary.PrimaryGraphics, "PrimaryGraphics")) patched.push("PrimaryGraphics");
    if (patched.length) console.log("[cyberpunk] hover-guard patched:", patched);
}

Hooks.once("init", patchAll);
Hooks.once("setup", patchAll); // idempotent — second pass picks up late class swaps
