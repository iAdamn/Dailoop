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
  return <NativeLens {...props} testID="water-lens-native" lensPosition={0} lensEnabled={!reduced}
    animatedProps={animatedProps} style={row}>{children}</NativeLens>;
}
