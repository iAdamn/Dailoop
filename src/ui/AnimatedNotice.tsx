import React, { useLayoutEffect, useRef, useState } from 'react';
import { type ViewProps } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useMotionDisabled } from './motion';

/** Keeps the last notice mounted until its exit finishes. A newer notice owns
 * the animation immediately, so a stale exit cannot dismiss its replacement. */
export function AnimatedNotice({ visible, token, children, onExited, style, ...props }: ViewProps & {
  visible: boolean; token: string | number; onExited?(): void;
}) {
  const reduced = useMotionDisabled();
  const [retained, setRetained] = useState({ present: visible, children });
  const progress = useSharedValue(reduced ? 1 : 0);
  const opacity = useSharedValue(reduced ? 1 : 0);
  const generation = useRef(0);
  const shown = useRef(visible);
  const exitCallback = useRef(onExited);
  useLayoutEffect(() => { exitCallback.current = onExited; }, [onExited]);
  // Prop-derived state keeps the exiting React tree without reading a ref in
  // render. This bounded adjustment also mounts a new notice before painting.
  if (visible && (!retained.present || retained.children !== children)) setRetained({ present: true, children });

  useLayoutEffect(() => {
    const current = ++generation.current;
    cancelAnimation(progress); cancelAnimation(opacity);
    if (visible) {
      shown.current = true;
      progress.set(reduced ? 1 : 0);
      opacity.set(reduced ? 1 : withTiming(1, { duration: 110 }));
      if (!reduced) progress.set(withSequence(
        withTiming(1.08, { duration: 170, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 80, easing: Easing.inOut(Easing.quad) }),
      ));
    } else {
      if (!shown.current) return;
      const finish = () => {
        if (generation.current !== current) return;
        shown.current = false;
        setRetained(previous => ({ ...previous, present: false }));
        exitCallback.current?.();
      };
      if (reduced) { progress.set(0); opacity.set(0); finish(); }
      else {
        progress.set(withTiming(0, { duration: 150, easing: Easing.in(Easing.cubic) }));
        opacity.set(withTiming(0, { duration: 150 }, done => { if (done) runOnJS(finish)(); }));
      }
    }
    return () => { generation.current = current + 1; cancelAnimation(progress); cancelAnimation(opacity); };
  }, [visible, token, reduced, progress, opacity]);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: (1 - progress.get()) * 12 }, { scale: 0.94 + progress.get() * 0.06 }],
  }));
  if (!visible && (!retained.present || reduced)) return null;
  return <Animated.View {...props} testID={props.testID ?? 'notice-motion'}
    pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible}
    importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} aria-hidden={!visible}
    style={[style, animated]}>{visible ? children : retained.children}</Animated.View>;
}
