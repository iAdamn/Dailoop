import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, type ScrollViewProps } from 'react-native';

const FocusContext = createContext<(input: RefObject<TextInput | null>) => void>(() => undefined);
export const useRevealInput = () => useContext(FocusContext);

/** A scroll surface follows its focused field after the keyboard changes the viewport. */
export const KeyboardScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScrollView(props, forwardedRef) {
  const scroll = useRef<ScrollView>(null);
  const focused = useRef<RefObject<TextInput | null> | null>(null);
  const position = useRef(0);
  const frame = useRef<number | null>(null);
  useImperativeHandle(forwardedRef, () => scroll.current!, []);
  const reveal = useCallback(() => {
    if (Platform.OS === 'web' || !focused.current?.current?.isFocused()) return;
    const keyboard = Keyboard.metrics();
    if (!keyboard) return;
    focused.current.current.measureInWindow((_x, y, _width, height) => {
      scroll.current?.getNativeScrollRef()?.measureInWindow((_sx, sy, _sw, sh) => {
        const visibleBottom = Math.min(keyboard.screenY, sy + sh) - 16;
        const bottom = y + height;
        if (bottom > visibleBottom) scroll.current?.scrollTo({ y: Math.max(0, position.current + bottom - visibleBottom), animated: false });
      });
    });
  }, []);
  const schedule = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => { frame.current = null; reveal(); });
  }, [reveal]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', schedule);
    const changed = Keyboard.addListener('keyboardDidChangeFrame', schedule);
    return () => { shown.remove(); changed.remove(); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [schedule]);
  const onFocus = useCallback((input: RefObject<TextInput | null>) => { focused.current = input; schedule(); }, [schedule]);
  return <FocusContext.Provider value={onFocus}><ScrollView {...props} ref={scroll}
    keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} scrollEventThrottle={16}
    onScroll={event => { position.current = event.nativeEvent.contentOffset.y; props.onScroll?.(event); }}
    onLayout={event => { props.onLayout?.(event); schedule(); }}
    onContentSizeChange={(width, height) => { props.onContentSizeChange?.(width, height); schedule(); }}
  /></FocusContext.Provider>;
});
