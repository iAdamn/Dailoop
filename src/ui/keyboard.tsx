import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, type ForwardedRef, type ReactElement, type RefAttributes, type RefObject } from 'react';
import { FlatList, Keyboard, Platform, ScrollView, TextInput, type FlatListProps, type ScrollViewProps } from 'react-native';

const FocusContext = createContext<(input: RefObject<TextInput | null>) => void>(() => undefined);
export const useRevealInput = () => useContext(FocusContext);

type KeyboardSurface = {
  getNativeScrollRef(): unknown;
  scrollTo?(options: { y: number; animated: boolean }): void;
  scrollToOffset?(options: { offset: number; animated: boolean }): void;
};

/** Share the same focus/IME contract between scrolling forms and virtualized lists. */
function useKeyboardSurface(scroll: RefObject<KeyboardSurface | null>) {
  const focused = useRef<RefObject<TextInput | null> | null>(null);
  const position = useRef(0);
  const frame = useRef<number | null>(null);
  const reveal = useCallback(() => {
    if (Platform.OS === 'web' || !focused.current?.current?.isFocused()) return;
    const keyboard = Keyboard.metrics();
    if (!keyboard) return;
    focused.current.current.measureInWindow((_x, y, _width, height) => {
      const native = scroll.current?.getNativeScrollRef();
      if (!native || typeof native !== 'object' || !('measureInWindow' in native) || typeof native.measureInWindow !== 'function') return;
      native.measureInWindow((_sx: number, sy: number, _sw: number, sh: number) => {
        const visibleBottom = Math.min(keyboard.screenY, sy + sh) - 16;
        const bottom = y + height;
        if (bottom > visibleBottom) {
          const offset = Math.max(0, position.current + bottom - visibleBottom);
          if (scroll.current?.scrollToOffset) scroll.current.scrollToOffset({ offset, animated: false });
          else scroll.current?.scrollTo?.({ y: offset, animated: false });
        }
      });
    });
  }, [scroll]);
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
  const onScroll: NonNullable<ScrollViewProps['onScroll']> = useCallback(event => { position.current = event.nativeEvent.contentOffset.y; }, []);
  return { onFocus, onScroll, schedule };
}

/** A scroll surface follows its focused field after the keyboard changes the viewport. */
export const KeyboardScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardScrollView(props, forwardedRef) {
  const scroll = useRef<ScrollView>(null);
  const focus = useKeyboardSurface(scroll);
  useImperativeHandle(forwardedRef, () => scroll.current!, []);
  return <FocusContext.Provider value={focus.onFocus}><ScrollView {...props} ref={scroll}
    keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} scrollEventThrottle={16}
    onScroll={event => { focus.onScroll(event); props.onScroll?.(event); }}
    onLayout={event => { props.onLayout?.(event); focus.schedule(); }}
    onContentSizeChange={(width, height) => { props.onContentSizeChange?.(width, height); focus.schedule(); }}
  /></FocusContext.Provider>;
});

export const KeyboardFlatList = forwardRef(function KeyboardFlatList<Item>(props: FlatListProps<Item>, forwardedRef: ForwardedRef<FlatList<Item>>) {
  const scroll = useRef<FlatList<Item>>(null);
  const focus = useKeyboardSurface(scroll);
  useImperativeHandle(forwardedRef, () => scroll.current!, []);
  return <FocusContext.Provider value={focus.onFocus}><FlatList {...props} ref={scroll}
    keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} scrollEventThrottle={16}
    onScroll={event => { focus.onScroll(event); props.onScroll?.(event); }}
    onLayout={event => { props.onLayout?.(event); focus.schedule(); }}
    onContentSizeChange={(width, height) => { props.onContentSizeChange?.(width, height); focus.schedule(); }}
  /></FocusContext.Provider>;
}) as <Item>(props: FlatListProps<Item> & RefAttributes<FlatList<Item>>) => ReactElement;
