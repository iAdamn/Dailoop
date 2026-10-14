// Platform-independent fallback for tests and platforms without a refraction API.
import React from 'react';
import { View } from 'react-native';
import type { WaterLensProps } from './WaterLens.types';

export function WaterLens({ children, position: _position, width: _width, height: _height, style, ...props }: WaterLensProps) {
  return <View {...props} style={[{ flex: 1, flexDirection: 'row', gap: 2 }, style]}>{children}</View>;
}
