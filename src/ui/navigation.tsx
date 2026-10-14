import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector, PointerType } from 'react-native-gesture-handler';
import Animated, { runOnJS, type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotionDisabled, useTabAppearance } from './motion';

export const TAB_ORDER = ['home', 'history', 'stats', 'settings'] as const;
const ActiveTabContext = createContext(true);

/** Pointer taps and pans are recognized together by the bar. Each destination
 * also exposes a separate keyboard/screen-reader activation action. */
export function TabButton({ onSelect, style, ...props }: Omit<ViewProps, 'style'> & {
  onSelect(): void;
  style?: ViewProps['style'] | ((state: { pressed: boolean; focused: boolean }) => ViewProps['style']);
}) {
  const [focused, setFocused] = useState(false);
  const keyboard = Platform.OS === 'web' ? {
    focusable: true,
    onFocus: () => setFocused(true), onBlur: () => setFocused(false),
    onClick: (event: { detail: number }) => { if (event.detail === 0) onSelect(); },
    onKeyDown: (event: { key: string; repeat?: boolean; preventDefault(): void }) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (!event.repeat) onSelect();
      }
    },
  } : {};
  return <View {...props} {...keyboard} accessible focusable
    accessibilityActions={[{ name: 'activate', label: 'Cambiar pestaña' }]}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') onSelect(); }}
    onAccessibilityTap={onSelect}
    style={typeof style === 'function' ? style({ pressed: false, focused }) : style} />;
}

export function ActiveTabModal({ children }: { children: React.ReactNode }) {
  return useContext(ActiveTabContext) ? children : null;
}

/** Layout all four native screens once; only the selected screen can receive input
 * or accessibility focus. Web keeps its ordinary display/scroll behaviour. */
export function TabPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  const appearance = useTabAppearance(active);
  return <ActiveTabContext.Provider value={active}><View collapsable={false} pointerEvents={active ? 'auto' : 'none'}
    accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    aria-hidden={!active} style={[{ position: 'absolute', inset: 0 },
      Platform.OS === 'web' ? { display: active ? 'flex' : 'none' } : { opacity: active ? 1 : 0, zIndex: active ? 1 : 0 }]}>
    <Animated.View testID="tab-content-motion" style={[{ flex: 1 }, appearance]}>{children}</Animated.View>
  </View></ActiveTabContext.Provider>;
}

export function useTabPosition(index: number) {
  const reduced = useMotionDisabled();
  const position = useSharedValue(index);
  useEffect(() => { position.set(reduced ? index : withTiming(index, { duration: 130 })); }, [index, position, reduced]);
  return position;
}

/** Horizontal contact belongs only to the bottom capsule. Vertical motion and
 * ordinary taps fail recognition and continue to their original controls. */
export function SwipeTabBar({ index, width, enabled, position, onSelect, children, ...props }: ViewProps & {
  index: number; width: number; enabled: boolean; position: SharedValue<number>; onSelect(index: number): void;
}) {
  const reduced = useMotionDisabled();
  const gesture = useMemo(() => {
    const ready = enabled && width > 12;
    const pan = Gesture.Pan().enabled(ready)
    .maxPointers(1).activeOffsetX([-10, 10]).failOffsetY([-12, 12])
    .onUpdate(event => {
      const cell = (width - 12) / 4;
      position.set(Math.max(0, Math.min(3, (event.x - 6) / cell - 0.5)));
    })
    .onEnd((event, success) => {
      if (!success || event.pointerType === PointerType.KEY) return;
      const target = Math.max(0, Math.min(3, Math.round((event.x - 6) / ((width - 12) / 4) - 0.5)));
      position.set(reduced ? target : withTiming(target, { duration: 100 }));
      if (target !== index) runOnJS(onSelect)(target);
    })
    .onFinalize((event, success) => {
      if (event.pointerType === PointerType.KEY) return;
      if (!success) position.set(reduced ? index : withTiming(index, { duration: 100 }));
    });
    const tap = Gesture.Tap().enabled(ready).maxDistance(10).onEnd((event, success) => {
      // RNGH Web synthesizes key taps with coordinates relative to the focused
      // child, rather than this bar. TabButton handles those keys directly.
      if (!success || event.pointerType === PointerType.KEY) return;
      const target = Math.max(0, Math.min(3, Math.floor((event.x - 6) / ((width - 12) / 4))));
      runOnJS(onSelect)(target);
    });
    return Gesture.Exclusive(pan, tap);
  }, [enabled, width, position, reduced, index, onSelect]);
  return <GestureDetector gesture={gesture} touchAction="pan-y"><View {...props} collapsable={false}>{children}</View></GestureDetector>;
}
