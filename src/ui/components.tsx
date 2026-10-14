import React, { createContext, useContext, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, palette, themeColors, type UIColors } from './tokens';
import { typefaces } from './typography';
import { GlassLayer, glassShadow } from './material';
import { KeyboardScrollView, useRevealInput } from './keyboard';
import Animated from 'react-native-reanimated';
import { MotionPressable, useModalMotion } from './motion';
import { useInteractionFeedback, type FeedbackKind } from './feedback';
export { GlassLayer } from './material';

export const ColorContext = createContext<UIColors>(themeColors('light', false));
export const useColors = () => useContext(ColorContext);
export function quantity(count: number, singular: string, plural: string) { return `${count} ${count === 1 ? singular : plural}`; }
export function titleReflection(dark = false) {
  return { textShadowColor: alpha(dark ? palette.lavender : palette.lilac, dark ? 0.28 : 0.2), textShadowOffset: { width: 0, height: dark ? -1 : 1 }, textShadowRadius: dark ? 6 : 1 };
}
/** Replace the browser's black/white auto outline with a palette-only keyboard indicator. */
export function webFocusRing(focused: boolean | undefined, color: string = palette.violet): ViewStyle {
  return Platform.OS === 'web' ? { outlineStyle: 'solid', outlineWidth: focused ? 2 : 0, outlineOffset: 2, outlineColor: color } : {};
}
/** RN Web handles Enter for all pressables, but Space only for button roles. */
export function webSpaceKey(onPress: () => void, disabled = false) {
  return Platform.OS === 'web' ? { onKeyDown: (event: { key: string; repeat?: boolean; preventDefault(): void }) => {
    if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); if (!disabled && !event.repeat) onPress(); }
  } } : {};
}
export function Label({ children, small = false, strong = false, style }: { children: React.ReactNode; small?: boolean; strong?: boolean; style?: object }) {
  const c = useColors();
  return <Text selectable style={[small ? s.small : s.body, { color: c.text }, strong && s.strong, style]}>{children}</Text>;
}
export function Heading({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  const c = useColors();
  return <View style={s.heading}><Text accessibilityRole="header" style={[s.title, { color: c.text }, titleReflection(c.dark)]}>{children}</Text>{subtitle && <Label style={s.subtitle}>{subtitle}</Label>}<LinearGradient accessible={false} colors={[palette.violet, alpha(palette.lilac, 0.24), alpha(palette.sky, 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.headingGlint} /></View>;
}
export function Button({ children, onPress, secondary = false, subtle = false, busy = false, disabled = false, label, testID, compact = false, feedback }: { children: React.ReactNode; onPress(): void; secondary?: boolean; subtle?: boolean; busy?: boolean; disabled?: boolean; label?: string; testID?: string; compact?: boolean; feedback?: FeedbackKind }) {
  const c = useColors();
  const color = secondary || subtle ? c.text : c.buttonText;
  const bg = secondary || subtle ? 'transparent' : c.button;
  return <MotionPressable feedback={feedback ?? (secondary || subtle ? 'selection' : 'action')} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} aria-disabled={disabled || busy} aria-busy={busy} disabled={disabled || busy} testID={testID} onPress={onPress} style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [s.button, compact && s.compactButton, { backgroundColor: bg, borderColor: secondary || subtle ? 'transparent' : bg, opacity: disabled ? 0.5 : 1 }, pressed && { opacity: 0.75 }, focused && { borderColor: palette.violet, borderWidth: 3 }, webFocusRing(focused, c.dark ? palette.lavender : palette.violet)]}>
    {!subtle && <GlassLayer radius={18} dark={secondary ? c.dark : !c.dark} tint={secondary ? palette.lavender : undefined} strength="control" highContrast={!secondary && !subtle} />}{busy && <ActivityIndicator color={color} size="small" />}<Text style={[s.buttonText, { color }]}>{busy ? 'Guardando…' : children}</Text>
  </MotionPressable>;
}
export function Chip({ children, selected, onPress, label, disabled = false }: { children: React.ReactNode; selected?: boolean; onPress(): void; label?: string; disabled?: boolean }) {
  const c = useColors();
  const respond = useInteractionFeedback();
  const activate = () => { if (disabled) return; respond('selection'); onPress(); };
  return <MotionPressable feedback={false} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: !!selected, disabled }} aria-checked={!!selected} aria-disabled={disabled} disabled={disabled} onPress={activate} {...webSpaceKey(activate, disabled)} style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [s.chip, { backgroundColor: 'transparent', borderColor: focused ? palette.violet : selected ? palette.lilac : c.border, borderWidth: focused ? 3 : 1, opacity: pressed || disabled ? 0.65 : 1 }, webFocusRing(focused, c.dark ? palette.lavender : palette.violet)]}><GlassLayer radius={18} dark={c.dark} tint={selected ? palette.lavender : undefined} strength="control" /><Text style={[s.chipText, { color: c.text }]}>{selected ? '✓ ' : ''}{children}</Text></MotionPressable>;
}
export function Field({ label, hint, error, containerStyle, ...props }: TextInputProps & { label: string; hint?: string; error?: string; containerStyle?: ViewStyle }) {
  const c = useColors();
  const ref = useRef<TextInput>(null);
  const reveal = useRevealInput();
  const [focused, setFocused] = useState(false);
  return <View style={[s.field, containerStyle]}><Text onPress={() => ref.current?.focus()} style={[s.fieldLabel, { color: c.text }]}>{label}</Text><View style={s.inputSurface}><GlassLayer radius={17} dark={c.dark} strength="control" /><TextInput ref={ref} accessibilityLabel={label} placeholderTextColor={c.muted} {...props} onFocus={event => { setFocused(true); reveal(ref); props.onFocus?.(event); }} onSelectionChange={event => { if (focused) reveal(ref); props.onSelectionChange?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }} style={[s.input, { backgroundColor: 'transparent', borderColor: error ? c.text : 'transparent', color: c.text }, props.multiline && s.multiline, props.style, webFocusRing(focused, c.dark ? palette.lavender : palette.violet)]} /></View>{hint && <Label small>{hint}</Label>}{error && <Label small strong>! {error}</Label>}</View>;
}
export function Toggle({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange(value: boolean): void }) {
  const c = useColors();
  const respond = useInteractionFeedback();
  const toggle = () => { respond('selection'); onChange(!value); };
  return <MotionPressable feedback={false} accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={detail} accessibilityState={{ checked: value }} aria-checked={value} onPress={toggle} {...webSpaceKey(toggle)} style={({ focused }: { pressed: boolean; focused?: boolean }) => [s.toggle, { borderColor: focused ? palette.violet : c.border, borderWidth: focused ? 3 : 0, borderBottomWidth: focused ? 3 : 1 }, webFocusRing(focused, c.dark ? palette.lavender : palette.violet)]}><View style={s.flex}><Label strong>{label}</Label>{detail && <Label small style={s.toggleDetail}>{detail}</Label>}</View><View accessible={false} style={[s.switchTrack, { backgroundColor: value ? palette.lilac : palette.lavender }]}><View style={[s.switchThumb, value ? { right: 3 } : { left: 3 }]} /></View></MotionPressable>;
}
export function Panel({ children, style, tint }: { children: React.ReactNode; style?: ViewStyle; tint?: string }) {
  const c = useColors();
  return <View style={[s.panel, { backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: glassShadow(c.dark) }, style]}><GlassLayer radius={26} tint={tint} dark={c.dark} strength="strong" />{children}</View>;
}
export function ModalFrame({ title, subtitle, children, onClose, canClose = true, scrollable = true }: { title: string; subtitle?: string; children: React.ReactNode; onClose(): void; canClose?: boolean; scrollable?: boolean }) {
  const c = useColors();
  const motion = useModalMotion(onClose, canClose);
  const respond = useInteractionFeedback();
  return <Modal transparent animationType="none" visible onShow={motion.show} onRequestClose={motion.close}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.backdrop}><Animated.View testID="dialog-motion" accessibilityViewIsModal style={[motion.style, s.modal, { backgroundColor: 'transparent', borderColor: 'transparent' }]}><GlassLayer radius={30} dark={c.dark} strength="strong" /><View style={[s.modalHeader, { borderColor: c.surfaceEdge }]}><View style={s.flex}><Text accessibilityRole="header" style={[s.modalTitle, { color: c.text }, titleReflection(c.dark)]}>{title}</Text>{subtitle && <Label small>{subtitle}</Label>}</View><MotionPressable feedback={false} accessibilityRole="button" accessibilityLabel="Cerrar diálogo" onPress={() => { respond('selection'); motion.close(); }} style={({ focused }: { pressed: boolean; focused?: boolean }) => [s.close, { backgroundColor: alpha(palette.lavender, c.dark ? 0.035 : 0.35) }, webFocusRing(focused, c.dark ? palette.lavender : palette.violet)]}><Text style={[s.closeText, { color: c.text }]}>×</Text></MotionPressable></View>{scrollable ? <KeyboardScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.modalContent}>{children}</KeyboardScrollView> : <View style={[s.modalContent, { flexShrink: 1, minHeight: 0 }]}>{children}</View>}</Animated.View></KeyboardAvoidingView></Modal>;
}
export function Empty({ symbol = '◷', title, text, children }: { symbol?: string; title: string; text: string; children?: React.ReactNode }) {
  const c = useColors();
  return <View style={s.empty}><View style={s.emptyMark}><Text style={s.emptySymbol}>{symbol}</Text></View><Text accessibilityRole="header" style={[s.emptyTitle, { color: c.text }]}>{title}</Text><Label style={s.center}>{text}</Label>{children}</View>;
}
export const s = StyleSheet.create({
  body: { fontFamily: typefaces.body, fontSize: 15, lineHeight: 24 }, small: { fontFamily: typefaces.body, fontSize: 13, lineHeight: 20 }, strong: { fontFamily: typefaces.semibold },
  title: { fontFamily: typefaces.displayBold, fontSize: 31, lineHeight: 38, letterSpacing: -0.75 }, heading: { gap: 8, marginBottom: 3 }, subtitle: { opacity: 0.9 }, headingGlint: { height: 3, width: 60, borderRadius: 2, marginTop: 4 },
  button: { minWidth: 48, minHeight: 54, borderRadius: 18, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  compactButton: { paddingHorizontal: 15, minHeight: 48 }, buttonText: { fontFamily: typefaces.bold, fontSize: 14, lineHeight: 23, textAlign: 'center' },
  chip: { minHeight: 48, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11, borderWidth: 1, justifyContent: 'center' }, chipText: { fontFamily: typefaces.semibold, fontSize: 13, lineHeight: 22 },
  field: { gap: 8 }, inputSurface: { borderRadius: 17 }, fieldLabel: { fontFamily: typefaces.semibold, fontSize: 13, lineHeight: 21 }, input: { position: 'relative', zIndex: 1, fontFamily: typefaces.body, minHeight: 54, borderRadius: 17, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, lineHeight: 25 }, multiline: { minHeight: 110, maxHeight: 180, textAlignVertical: 'top' },
  toggle: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 15, borderBottomWidth: 1, borderRadius: 10 }, toggleDetail: { marginTop: 4 }, switchTrack: { width: 48, height: 28, borderRadius: 14, borderWidth: 1, borderColor: alpha(palette.base, 0.5) }, switchThumb: { position: 'absolute', top: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: palette.ink }, flex: { flex: 1 },
  panel: { padding: 21, borderRadius: 26, borderWidth: 1, gap: 15 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stack: { gap: 18 }, spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  backdrop: { flex: 1, backgroundColor: alpha(palette.ink, 0.6), alignItems: 'center', justifyContent: 'center', padding: 16 }, modal: { width: '100%', maxWidth: 540, maxHeight: '94%', borderRadius: 30, borderWidth: 1, overflow: 'hidden', boxShadow: '0 18px 56px ' + alpha(palette.ink, 0.3) },
  modalHeader: { flexDirection: 'row', paddingHorizontal: 22, paddingVertical: 21, alignItems: 'center', borderBottomWidth: 1, gap: 10 }, modalTitle: { fontFamily: typefaces.display, fontSize: 25, lineHeight: 32, letterSpacing: -0.45 }, modalContent: { padding: 22, gap: 19 }, close: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, closeText: { fontFamily: typefaces.body, fontSize: 29, lineHeight: 38 },
  empty: { paddingVertical: 36, gap: 17, alignItems: 'center' }, emptyMark: { width: 80, height: 80, borderRadius: 27, backgroundColor: palette.lavender, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: alpha(palette.base, 0.8), boxShadow: '0 10px 25px ' + alpha(palette.lilac, 0.15) }, emptySymbol: { color: palette.ink, fontSize: 36 }, emptyTitle: { fontFamily: typefaces.display, fontSize: 24, lineHeight: 31, textAlign: 'center' }, center: { textAlign: 'center' },
});
