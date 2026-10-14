import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, palette } from './tokens';
import { typefaces } from './typography';
import { Symbol } from './Symbol';

/** Decorative in pointer handling, but the complete count remains accessible. */
export function StreakBadge({ days, compact = false, style }: { days: number; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  if (!Number.isSafeInteger(days) || days < 2) return null;
  const count = days > 999 ? '999+' : String(days);
  const fontSize = (count.length < 3 ? 12 : count.length === 3 ? 9 : 7.5) * (compact ? 0.86 : 1);
  return <View accessible accessibilityRole="text" accessibilityLabel={`Racha de ${days} días`} pointerEvents="none" style={[styles.badge, compact && { width: 24, height: 28 }, style]}>
    <Symbol name="flame" size={compact ? 26 : 30} color={palette.lavender} style={styles.flame} />
    <Text accessible={false} importantForAccessibility="no" allowFontScaling={false} style={[styles.count, { fontSize, top: compact ? 12 : 14 }]}>{count}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  flame: { position: 'absolute', top: 0, textShadowColor: alpha(palette.base, 0.7), textShadowOffset: { width: -0.4, height: -0.5 }, textShadowRadius: 1 },
  count: { position: 'absolute', left: 0, right: 0, lineHeight: 14, textAlign: 'center', color: palette.ink, fontFamily: typefaces.displayBold, includeFontPadding: false },
});
