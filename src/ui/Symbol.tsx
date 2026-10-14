import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { typefaces } from './typography';

const symbols = { home: '\uE001', bell: '\uE002', folder: '\uE003', flame: '\uE004' } as const;
export function Symbol({ name, size = 25, color, style }: { name: keyof typeof symbols; size?: number; color: string; style?: StyleProp<TextStyle> }) {
  return <Text testID={`symbol-${name}`} accessible={false} importantForAccessibility="no" allowFontScaling={false}
    style={[{ fontFamily: typefaces.symbols, width: size, height: size, fontSize: size, lineHeight: size, color, includeFontPadding: false, textAlign: 'center' }, style]}>{symbols[name]}</Text>;
}
