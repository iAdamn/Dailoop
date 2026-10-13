import React, { createContext, memo, useContext, useRef, type RefObject } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, palette } from './tokens';

const BackdropContext = createContext<RefObject<View | null> | undefined>(undefined);

/** Android samples only the decorative backdrop, never its own glass surfaces. */
export function GlassScene({ children }: { children: React.ReactNode }) {
  const target = useRef<View>(null);
  return <BackdropContext.Provider value={target}>{children}</BackdropContext.Provider>;
}

export function GlassBackdrop({ children }: { children: React.ReactNode }) {
  const target = useContext(BackdropContext);
  return <BlurTargetView ref={target} accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden' }]}>{children}</BlurTargetView>;
}

export function glassShadow(dark: boolean) {
  return `0 12px 32px ${alpha(palette.ink, dark ? 0.38 : 0.13)}, 0 2px 5px ${alpha(palette.violet, dark ? 0.1 : 0.06)}`;
}

type GlassStrength = 'regular' | 'strong' | 'control';
type WebGlassStyle = ViewStyle & { backdropFilter: string; WebkitBackdropFilter: string };

/** Only this non-interactive layer is clipped/blurred; text and keyboard focus stay sharp. */
export const GlassLayer = memo(function GlassLayer({ radius = 26, tint, dark = false, strength = 'regular', highContrast = false }: { radius?: number; tint?: string; dark?: boolean; strength?: GlassStrength; highContrast?: boolean }) {
  const target = useContext(BackdropContext);
  const fill = dark ? palette.ink : palette.base;
  // Android samples the scene, so primary actions need ink/base support over that blur.
  const opacity = Platform.OS === 'android' && highContrast ? 0.85 : strength === 'strong' ? (dark ? 0.72 : 0.69) : strength === 'control' ? (dark ? 0.32 : 0.3) : (dark ? 0.38 : 0.36);
  // The native backdrop is already soft and static. Scrolling cards retain the
  // same Expo palette tint without recapturing that backdrop for every frame.
  const sampledFill = Platform.OS === 'android' && strength === 'regular';
  const nativeTintOpacity = Math.floor(255 * 0.42 * (dark ? 0.55 : 0.78)) / 255;
  const fillOpacity = sampledFill ? 1 - (1 - opacity) * (1 - nativeTintOpacity) : opacity;
  const blur = strength === 'strong' ? 24 : strength === 'control' ? 12 : 18;
  const webBlur: WebGlassStyle = { ...StyleSheet.absoluteFill, backdropFilter: `blur(${blur}px) saturate(145%)`, WebkitBackdropFilter: `blur(${blur}px) saturate(145%)` };
  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.layer, { borderRadius: radius - 1 }]}>
    {Platform.OS === 'web'
      ? <View style={webBlur} />
      : strength !== 'control' && !sampledFill && <BlurView intensity={strength === 'strong' ? 65 : 42} tint={dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} {...(Platform.OS === 'android' ? { blurTarget: target, blurMethod: 'dimezisBlurView' as const } : {})} style={StyleSheet.absoluteFill} />}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(fill, fillOpacity) }]} />
    {tint && <LinearGradient colors={[alpha(tint, dark ? 0.13 : 0.18), alpha(tint, 0.025), alpha(tint, dark ? 0.12 : 0.1)]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />}
    <LinearGradient colors={[alpha(palette.base, dark ? 0.2 : 0.55), alpha(palette.base, dark ? 0.025 : 0.12), alpha(palette.base, 0), alpha(palette.sky, dark ? 0.07 : 0.13)]} locations={[0, 0.28, 0.6, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.65, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { borderRadius: radius - 1, borderWidth: 1, borderColor: alpha(palette.base, dark ? 0.2 : 0.55), borderTopColor: alpha(palette.base, dark ? 0.5 : 0.95), borderLeftColor: alpha(palette.base, dark ? 0.35 : 0.85), boxShadow: `inset 0 1px 3px ${alpha(palette.base, dark ? 0.12 : 0.45)}, inset 0 -1px 2px ${alpha(palette.lilac, dark ? 0.22 : 0.12)}` }]} />
    <LinearGradient colors={[alpha(palette.base, 0), alpha(palette.base, dark ? 0.75 : 1), alpha(palette.base, 0)]} locations={[0, 0.35, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topLight} />
    <LinearGradient colors={[alpha(palette.sky, 0), alpha(palette.sky, dark ? 0.65 : 0.9), alpha(palette.base, 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bottomLight} />
  </View>;
});

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, overflow: 'hidden', pointerEvents: 'none' },
  topLight: { position: 'absolute', top: 0, left: '8%', right: '16%', height: 1 },
  bottomLight: { position: 'absolute', bottom: 0, left: '23%', right: '6%', height: 1 },
});
