import type React from 'react';
import type { ViewProps } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type WaterLensProps = ViewProps & {
  position: SharedValue<number>; width: number; height: number; children: React.ReactNode;
};
