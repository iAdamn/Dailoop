import React from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { useMotionDisabled } from './motion';
import type { WaterLensProps } from './WaterLens.types';

type NativeProps = ViewProps & { lensPosition: number; lensEnabled: boolean };
// Older binaries (or Expo Go) retain readable navigation until a native rebuild.
const NativeLens = Platform.OS === 'android' && Number(Platform.Version) >= 33 && requireOptionalNativeModule('DailoopGlass')
  ? Animated.createAnimatedComponent(requireNativeViewManager<NativeProps>('DailoopGlass')) : null;

export function WaterLens({ children, position, width: _width, height: _height, style, ...props }: WaterLensProps) {
  const reduced = useMotionDisabled();
  const animatedProps = useAnimatedProps(() => ({ lensPosition: position.get() }));
  const row = [{ flex: 1, flexDirection: 'row' as const, gap: 2 }, style];
  if (!NativeLens) return <View {...props} style={row}>{children}</View>;
  // ExpoView's native layout adapter does not lay out sibling React children
  // like RN View. Keep one ordinary Yoga row inside the GPU capture surface.
  return <NativeLens {...props} testID="water-lens-native" lensPosition={0} lensEnabled={!reduced}
    animatedProps={animatedProps} style={{ flex: 1, minHeight: 66 }}><View collapsable={false} style={row}>{children}</View></NativeLens>;
}
