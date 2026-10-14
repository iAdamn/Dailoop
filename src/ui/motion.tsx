import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { GlassLayer } from './material';
import { palette } from './tokens';

const ReducedMotionContext = createContext(true);
export const useMotionDisabled = () => useContext(ReducedMotionContext);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { live = false; subscription.remove(); };
  }, []);
  return <ReducedMotionContext.Provider value={reduced}>{children}</ReducedMotionContext.Provider>;
}

/** The hit target stays fixed while its visual content responds to contact. */
export function MotionPressable({ wrapperStyle, ...props }: PressableProps & { wrapperStyle?: ViewStyle }) {
  const reduced = useMotionDisabled();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  useEffect(() => { if (reduced) scale.set(1); }, [reduced, scale]);
  return <Animated.View style={[wrapperStyle, animated]}><Pressable {...props}
    onPressIn={event => { if (!reduced && !props.disabled) scale.set(withTiming(0.975, { duration: 90 })); props.onPressIn?.(event); }}
    onPressOut={event => { scale.set(reduced ? 1 : withSpring(1, { damping: 18, stiffness: 260 })); props.onPressOut?.(event); }}
  /></Animated.View>;
}

export function MovingTabIndicator({ index, width, height, dark, position }: { index: number; width: number; height: number; dark: boolean; position?: SharedValue<number> }) {
  const reduced = useMotionDisabled();
  const x = useSharedValue(0);
  const ready = useRef(false);
  const cell = Math.max(0, (width - 12) / 4);
  useEffect(() => {
    if (position) return;
    const next = index * cell;
    x.set(reduced || !ready.current ? next : withSpring(next, { damping: 24, stiffness: 260, mass: 0.8 }));
    if (width > 0) ready.current = true;
  }, [index, cell, reduced, width, x, position]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: position ? position.get() * cell : x.get() }] }));
  if (width === 0) return null;
  return <Animated.View pointerEvents="none" accessible={false} style={[{ position: 'absolute', left: 6, top: 8, width: cell - 2, height: Math.max(0, height - 18), borderRadius: 21 }, animated]}><GlassLayer radius={21} dark={dark} tint={palette.lavender} strength="control" /></Animated.View>;
}

export function useModalMotion(onClose: () => void, canClose = true) {
  const reduced = useMotionDisabled();
  const progress = useSharedValue(reduced ? 1 : 0);
  // A native dialog can attach after the React mount effect. Its content must
  // already be visible even if an entry animation/event has not run yet.
  const opacity = useSharedValue(1);
  const shown = useRef(false);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (reduced && closing.current) { onCloseRef.current(); closing.current = false; }
    if (reduced) progress.set(1);
  }, [progress, reduced]);
  const show = () => {
    if (shown.current || closing.current) return;
    shown.current = true;
    progress.set(reduced ? 1 : withTiming(1, { duration: 180 }));
  };
  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: (1 - progress.get()) * 12 }, { scale: 0.985 + progress.get() * 0.015 }] }));
  const finish = () => onCloseRef.current();
  const close = () => {
    // Dirty forms request a discard confirmation inside this same modal.
    // Never fade that confirmation away or leave its close action latched.
    if (!canClose) { onCloseRef.current(); return; }
    if (closing.current) return;
    closing.current = true;
    if (reduced) finish();
    else opacity.set(withTiming(0, { duration: 120 }, done => { if (done) runOnJS(finish)(); }));
  };
  return { style, close, show };
}

export function DensityTransition({ columns, children }: { columns: number; children: React.ReactNode }) {
  const reduced = useMotionDisabled();
  const opacity = useSharedValue(1);
  const previous = useRef(columns);
  useEffect(() => {
    if (previous.current !== columns && !reduced) { opacity.set(0.75); opacity.set(withTiming(1, { duration: 160 })); }
    else if (reduced) opacity.set(1);
    previous.current = columns;
  }, [columns, reduced, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}
