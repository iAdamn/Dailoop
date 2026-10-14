import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, type SharedValue, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { GlassLayer } from './material';
import { palette } from './tokens';
import { useInteractionFeedback, type FeedbackKind } from './feedback';

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

/** Transform-only contact feedback; actions never wait for the release pop. */
export function MotionPressable({ wrapperStyle, feedback = 'selection', ...props }: PressableProps & { wrapperStyle?: ViewStyle; feedback?: FeedbackKind | false }) {
  const respond = useInteractionFeedback();
  const reduced = useMotionDisabled();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  useEffect(() => { if (reduced) scale.set(1); }, [reduced, scale]);
  return <Animated.View style={[wrapperStyle, animated]}><Pressable {...props}
    onPress={event => { if (props.disabled) return; if (feedback) respond(feedback); props.onPress?.(event); }}
    onPressIn={event => { if (!reduced && !props.disabled) scale.set(withTiming(0.96, { duration: 55, easing: Easing.out(Easing.cubic) })); props.onPressIn?.(event); }}
    onPressOut={event => { scale.set(reduced || props.disabled ? 1 : withSequence(
      withTiming(1.018, { duration: 85, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 85, easing: Easing.inOut(Easing.quad) }),
    )); props.onPressOut?.(event); }}
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
  // Content remains readable even when native attachment delays onShow. That
  // event restarts the pop after attachment, so its movement is not spent early.
  const opacity = useSharedValue(1);
  const shown = useRef(false);
  const closing = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const pendingCloseAction = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  const finish = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    setIsClosing(false);
    const action = pendingCloseAction.current;
    pendingCloseAction.current = null;
    (action ?? onCloseRef.current)();
  }, []);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(progress); cancelAnimation(opacity);
      progress.set(1); opacity.set(1);
      if (closing.current) finish();
    }
  }, [progress, opacity, reduced, finish]);
  useEffect(() => () => { closing.current = false; pendingCloseAction.current = null; cancelAnimation(progress); cancelAnimation(opacity); }, [progress, opacity]);
  const show = () => {
    if (shown.current || closing.current) return;
    shown.current = true;
    if (!reduced) { progress.set(0); opacity.set(0.5); }
    opacity.set(reduced ? 1 : withTiming(1, { duration: 110 }));
    progress.set(reduced ? 1 : withSequence(
      withTiming(1.1, { duration: 175, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 85, easing: Easing.inOut(Easing.quad) }),
    ));
  };
  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: (1 - progress.get()) * 20 }, { scale: 0.91 + progress.get() * 0.09 }] }));
  const closeWith = (action: () => void) => {
    if (closing.current) return;
    closing.current = true;
    pendingCloseAction.current = action;
    setIsClosing(true);
    if (reduced) finish();
    else {
      progress.set(withTiming(0.2, { duration: 150, easing: Easing.in(Easing.cubic) }));
      opacity.set(withTiming(0, { duration: 150 }, done => { if (done) runOnJS(finish)(); }));
    }
  };
  const close = () => {
    // Dirty forms request a discard confirmation inside this same modal.
    // A successful save or confirmed discard uses closeWith explicitly.
    if (closing.current) return;
    if (!canClose) { onCloseRef.current(); return; }
    closeWith(() => onCloseRef.current());
  };
  return { style, close, closeWith, show, isClosing };
}

/** Animate only activation, never ordinary data/clock updates or retained scroll. */
export function useTabAppearance(active: boolean, dragging?: SharedValue<boolean>) {
  const reduced = useMotionDisabled();
  const progress = useSharedValue(1);
  const previous = useRef(active);
  useLayoutEffect(() => {
    if (reduced || !active || dragging?.get()) progress.set(1);
    else if (!previous.current) {
      progress.set(0);
      progress.set(withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }));
    }
    previous.current = active;
  }, [active, reduced, progress, dragging]);
  return useAnimatedStyle(() => ({ opacity: dragging?.get() ? 1 : 0.82 + progress.get() * 0.18,
    transform: [{ translateY: dragging?.get() ? 0 : (1 - progress.get()) * 8 }] }));
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
