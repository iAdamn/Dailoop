import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, palette } from './tokens';

const rampSteps = 60;

function GlowRamp({ color, peakOpacity, maxInset }: { color: string; peakOpacity: number; maxInset: number }) {
  const opacity = 1 - Math.pow(1 - peakOpacity, 1 / rampSteps);
  return <>{Array.from({ length: rampSteps }, (_, i) => <View key={i} style={[styles.band, { inset: i * maxInset / (rampSteps - 1), borderRadius: 400, backgroundColor: color, opacity }]} />)}</>;
}

/** Soft color fields behind the transparent UI, shared by web and native renderers. */
export function AmbientBackground({ dark }: { dark: boolean }) {
  return <View pointerEvents="none" accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.scene}>
    <LinearGradient colors={dark ? [palette.ink, palette.ink, palette.ink] : [palette.base, alpha(palette.lavender, 0.46), palette.base]} locations={[0, 0.56, 1]} style={StyleSheet.absoluteFill} />
    <View style={styles.fields}>
      {/* Preserve the calibrated peak density; new samples keep floating-point opacity. */}
      <View style={[styles.orb, styles.violet]}><GlowRamp color={palette.violet} peakOpacity={1 - Math.pow(1 - (dark ? 9 : 6) / 255, 18)} maxInset={153} /></View>
      <View style={[styles.orb, styles.sky]}><GlowRamp color={palette.sky} peakOpacity={1 - Math.pow(1 - (dark ? 9 : 14) / 255, 18)} maxInset={136} /></View>
      <View style={[styles.orb, styles.lilac]}><GlowRamp color={palette.lilac} peakOpacity={1 - Math.pow(1 - (dark ? 7 : 10) / 255, 16)} maxInset={135} /></View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  scene: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  fields: { height: '100%', width: '100%', maxWidth: 820, alignSelf: 'center' },
  orb: { position: 'absolute' },
  band: { position: 'absolute' },
  violet: { width: 590, height: 690, top: '-20%', left: '-30%', transform: [{ rotate: '-26deg' }] },
  sky: { width: 530, height: 620, top: '28%', right: '-37%', transform: [{ rotate: '25deg' }] },
  lilac: { width: 610, height: 500, bottom: '-25%', left: '-29%', transform: [{ rotate: '-18deg' }] },
});
