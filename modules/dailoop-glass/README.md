# Dailoop water lens

Local Expo view for the four bottom-navigation labels/icons. Android 13+ applies
an AGSL `RuntimeShader` through `RenderEffect` to that view's real child content.
A rounded meniscus bends sampling coordinates nonlinearly and separates RGB
slightly near its rim. No glyph scaling, captured screen bitmaps, frame polling,
graphics package, network asset or additional Android permission is involved.

`WaterLens.native.tsx` updates `lensPosition` with Reanimated animated props.
The GPU effect is confined to the small navigation row. Each position update
snapshots new uniforms in a RenderEffect while retaining the compiled shader.
System reduced motion disables the optical effect. Android before API 33,
iOS, Expo Go and older installed binaries retain the ordinary glass navigation;
they do not claim GPU refraction support. Build a new native binary to include
the local module. This does not authorize packaging a new APK automatically.

Web uses a small local PNG vector field as an SVG `feDisplacementMap`, moving
its `feImage` attribute from the same shared position. Its pixel displacement
represents the same meniscus shape; it is not a transform-scale substitute.

Expo discovers this folder automatically as a local module. Verify discovery
with `npx expo-modules-autolinking resolve --platform android` and compile the
module with `:dailoop-glass:compileReleaseKotlin`. Compilation checks Kotlin,
not runtime AGSL compilation, perceived refraction or frame pacing on a phone.
These require Android execution and physical acceptance.

Reference APIs:

- [Android AGSL with RenderEffect](https://developer.android.com/develop/ui/views/graphics/agsl/using-agsl#using_runtimeshader_with_rendereffect)
- [Expo local modules](https://docs.expo.dev/modules/get-started/#create-a-local-module)
- [Expo native views](https://docs.expo.dev/modules/native-view-tutorial/)
