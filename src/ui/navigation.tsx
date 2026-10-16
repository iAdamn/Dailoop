import { useI18n } from '../i18n/react';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, View, type ViewProps } from 'react-native';
import { Gesture, GestureDetector, PointerType } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useMotionDisabled, useTabAppearance } from './motion';
import { ModalVisibilityContext } from './modalState';

export const TAB_ORDER = ['home', 'reminders', 'stats', 'settings'] as const;
const ActiveTabContext = createContext(true);

/** Pointer taps and pans are recognized together by the bar. Each destination
 * also exposes a separate keyboard/screen-reader activation action. */
export function TabButton({ onSelect, style, ...props }: Omit<ViewProps, 'style'> & {
  onSelect(): void;
  style?: ViewProps['style'] | ((state: { pressed: boolean; focused: boolean }) => ViewProps['style']);
}) {
  const { t } = useI18n();
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
    accessibilityActions={[{ name: 'activate', label: t("Cambiar pestaña") }]}
    onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'activate') onSelect(); }}
    onAccessibilityTap={onSelect}
    style={typeof style === 'function' ? style({ pressed: false, focused }) : style} />;
}

export const useActiveTab = () => useContext(ActiveTabContext);

export function ActiveTabModal({ children }: { children: React.ReactNode }) {
  const active = useActiveTab();
  const parentVisible = useContext(ModalVisibilityContext);
  useEffect(() => { if (!active) Keyboard.dismiss(); }, [active]);
  return <ModalVisibilityContext.Provider value={active && parentVisible}>{children}</ModalVisibilityContext.Provider>;
}

/** Retained screens follow the bar on the UI thread. Preview neighbours never
 * receive input or accessibility focus before the destination is confirmed. */
export function TabPanel({ active, children, index, position, dragging, width = 0 }: {
  active: boolean; children: React.ReactNode; index?: number; position?: SharedValue<number>;
  dragging?: SharedValue<boolean>; width?: number;
}) {
  const reduced = useMotionDisabled();
  const appearance = useTabAppearance(active, dragging);
  const web = Platform.OS === 'web';
  const viewport = useAnimatedStyle(() => {
    const preview = !!position && !!dragging && index !== undefined && width > 0 && dragging.get();
    const distance = preview ? index! - position!.get() : 0;
    const visible = preview ? Math.abs(distance) <= (reduced ? 0.5 : 1.05) : active;
    return {
      display: web && !visible ? 'none' : 'flex',
      opacity: visible ? 1 : 0,
      zIndex: active ? 2 : 1,
      transform: [{ translateX: preview && !reduced ? distance * width : 0 }],
    };
  });
  return <ActiveTabContext.Provider value={active}><Animated.View testID={index === undefined ? undefined : `tab-panel-${index}`}
    collapsable={false} pointerEvents={active ? 'auto' : 'none'}
    accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    aria-hidden={!active} style={[{ position: 'absolute', inset: 0 }, viewport]}>
    <Animated.View testID="tab-content-motion" style={[{ flex: 1 }, appearance]}>{children}</Animated.View>
  </Animated.View></ActiveTabContext.Provider>;
}

export function useTabDragState() { return useSharedValue(false); }

export function useTabPosition(index: number, dragging?: SharedValue<boolean>) {
  const reduced = useMotionDisabled();
  const position = useSharedValue(index);
  useEffect(() => {
    // A drag already owns the proportional position and its final snap. A route
    // commit must not restart that animation at the previous committed index.
    if (!dragging?.get()) position.set(reduced ? index : withTiming(index, { duration: 130 }));
  }, [index, position, dragging, reduced]);
  return position;
}

/** Horizontal contact belongs only to the bottom capsule. Vertical motion and
 * ordinary taps fail recognition and continue to their original controls. */
export function SwipeTabBar({ index, width, enabled, position, dragging: suppliedDragging, onSelect, onCross, children, ...props }: ViewProps & {
  index: number; width: number; enabled: boolean; position: SharedValue<number>; dragging?: SharedValue<boolean>;
  onSelect(index: number, fromDrag?: boolean): void; onCross?(index: number): void;
}) {
  const reduced = useMotionDisabled();
  const localDragging = useSharedValue(false);
  const dragging = suppliedDragging ?? localDragging;
  const crossed = useSharedValue(index);
  useEffect(() => {
    if (!enabled) { cancelAnimation(position); position.set(index); dragging.set(false); }
  }, [enabled, index, position, dragging]);
  const gesture = useMemo(() => {
    const ready = enabled && width > 12;
    const pan = Gesture.Pan().enabled(ready)
    .maxPointers(1).activeOffsetX([-10, 10]).failOffsetY([-12, 12])
    .onStart(event => {
      if (event.pointerType === PointerType.KEY) return;
      cancelAnimation(position);
      crossed.set(index);
      dragging.set(true);
    })
    .onUpdate(event => {
      if (event.pointerType === PointerType.KEY) return;
      const cell = (width - 12) / 4;
      const next = Math.max(0, Math.min(3, (event.x - 6) / cell - 0.5));
      position.set(next);
      const target = Math.round(next);
      const previous = crossed.get();
      if (target !== previous) {
        // Even a coalesced pointer update reports each boundary just once.
        const step = target > previous ? 1 : -1;
        if (onCross) for (let tab = previous + step; step > 0 ? tab <= target : tab >= target; tab += step) runOnJS(onCross)(tab);
        crossed.set(target);
      }
    })
    .onEnd((event, success) => {
      if (!success || event.pointerType === PointerType.KEY) return;
      const target = Math.max(0, Math.min(3, Math.round((event.x - 6) / ((width - 12) / 4) - 0.5)));
      if (reduced) { position.set(target); dragging.set(false); }
      else position.set(withTiming(target, { duration: 120 }, done => { if (done) dragging.set(false); }));
      if (target !== index) runOnJS(onSelect)(target, true);
    })
    .onFinalize((event, success) => {
      if (event.pointerType === PointerType.KEY) return;
      if (!success) {
        if (reduced) { position.set(index); dragging.set(false); }
        else position.set(withTiming(index, { duration: 120 }, done => { if (done) dragging.set(false); }));
      }
    });
    const tap = Gesture.Tap().enabled(ready).maxDistance(10).onEnd((event, success) => {
      // RNGH Web synthesizes key taps with coordinates relative to the focused
      // child, rather than this bar. TabButton handles those keys directly.
      if (!success || event.pointerType === PointerType.KEY) return;
      const target = Math.max(0, Math.min(3, Math.floor((event.x - 6) / ((width - 12) / 4))));
      cancelAnimation(position);
      dragging.set(false);
      // A tap may interrupt a drag's snap on the already committed tab. In that
      // case the route does not change, so no route effect will finish the lens.
      position.set(reduced ? target : withTiming(target, { duration: 130 }));
      runOnJS(onSelect)(target);
    });
    return Gesture.Exclusive(pan, tap);
  }, [enabled, width, position, dragging, crossed, reduced, index, onSelect, onCross]);
  return <GestureDetector gesture={gesture} touchAction="pan-y"><View {...props} collapsable={false}>{children}</View></GestureDetector>;
}
