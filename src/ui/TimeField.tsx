import { useI18n } from '../i18n/react';
import React, { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { Button, GlassLayer, ModalFrame, s, useColors, webFocusRing } from './components';
import { MotionPressable } from './motion';
import { alpha, palette } from './tokens';
import { typefaces } from './typography';

export interface TimeFieldProps {
  label: string;
  /** Local wall-clock time, without changing the date or resolving a time zone. */
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Exact-minute graphical selection; the caller still validates time-zone/DST rules. */
export function TimeField({ label, value, onChange, disabled = false }: TimeFieldProps) {
  const { t } = useI18n();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return <View style={s.field}>
    <Text style={[s.fieldLabel, { color: colors.text }]}>{label}</Text>
    <MotionPressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={t("Abre el selector de horas y minutos")} accessibilityValue={{ text: validTime(value) ? value : t('Elegir hora') }}
      disabled={disabled} accessibilityState={{ disabled }} onPress={() => { Keyboard.dismiss(); setOpen(true); }}
      style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.field, { opacity: disabled ? 0.5 : 1 }, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]}>
      <GlassLayer radius={17} dark={colors.dark} strength="control" />
      <Text style={[styles.value, { color: colors.text }]}>{validTime(value) ? value : t('Elegir hora')}</Text>
      <Text accessible={false} style={{ color: colors.text, fontSize: 22 }}>◷</Text>
    </MotionPressable>
    {open && <TimePopup value={value} onChange={onChange} onClose={() => setOpen(false)} />}
  </View>;
}

function TimePopup({ value, onChange, onClose }: { value: string; onChange(value: string): void; onClose(): void }) {
  const { t } = useI18n();
  const colors = useColors();
  const initial = validTime(value) ? value : '12:00';
  const [hour, setHour] = useState(Number(initial.slice(0, 2)));
  const [minute, setMinute] = useState(Number(initial.slice(3, 5)));
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const draft = `${pad(hour)}:${pad(minute)}`;
  return <ModalFrame surfaceColor={colors.panel} title={t("Elegir hora")} subtitle={t("Formato de 24 horas")} onClose={onClose}>
    {({ closeWith }) => <View style={[s.stack, styles.popup, { backgroundColor: alpha(colors.panel, 0.92) }]}>
      <View style={styles.clock}>
        {(['hour', 'minute'] as const).map(part => <MotionPressable key={part} accessibilityRole="button" accessibilityLabel={t(part === 'hour' ? 'Elegir horas, {value}' : 'Elegir minutos, {value}', { value: pad(part === 'hour' ? hour : minute) })}
          accessibilityState={{ selected: mode === part }} onPress={() => setMode(part)} wrapperStyle={styles.clockPart}
          style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.clockButton, { borderColor: mode === part ? colors.surfaceEdge : 'transparent' }, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]}>
          <GlassLayer radius={18} dark={colors.dark} tint={mode === part ? palette.lavender : undefined} strength="control" />
          <Text style={[styles.clockValue, { color: colors.text }]}>{pad(part === 'hour' ? hour : minute)}</Text>
          <Text style={[s.small, { color: colors.text }]}>{t(part === 'hour' ? 'Horas' : 'Minutos')}</Text>
        </MotionPressable>)}
      </View>
      <View style={styles.grid} accessibilityLabel={t(mode === 'hour' ? 'Horas del día' : 'Minutos de la hora')}>
        {Array.from({ length: mode === 'hour' ? 24 : 60 }, (_, choice) => {
          const chosen = choice === (mode === 'hour' ? hour : minute);
          return <MotionPressable key={`${mode}-${choice}`} wrapperStyle={styles.cell} accessibilityRole="button" accessibilityLabel={t(mode === 'hour' ? 'Hora {value}' : 'Minuto {value}', { value: pad(choice) })}
            accessibilityState={{ selected: chosen }} onPress={() => { if (mode === 'hour') { setHour(choice); setMode('minute'); } else setMinute(choice); }}
            style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.choice, { borderColor: chosen ? colors.surfaceEdge : 'transparent' }, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]}>
            {chosen && <GlassLayer radius={13} dark={colors.dark} tint={palette.lavender} strength="strong" />}
            <Text style={[styles.number, { color: colors.text, fontFamily: chosen ? typefaces.bold : typefaces.body }]}>{pad(choice)}</Text>
          </MotionPressable>;
        })}
      </View>
      <View style={styles.actions}>
        <View style={styles.action}><Button secondary onPress={() => closeWith(onClose)}>{t("Cancelar")}</Button></View>
        <View style={styles.action}><Button label={t("Elegir esta hora")} onPress={() => closeWith(() => { onChange(draft); onClose(); })}>{t("Elegir hora")}</Button></View>
      </View>
    </View>}
  </ModalFrame>;
}

const styles = StyleSheet.create({
  field: { minHeight: 54, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { flex: 1, fontFamily: typefaces.body, fontSize: 16, lineHeight: 25 },
  popup: { gap: 14, padding: 6, borderRadius: 20 },
  clock: { flexDirection: 'row', gap: 12 }, clockPart: { flex: 1 },
  clockButton: { minHeight: 88, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingVertical: 8, borderWidth: 1 },
  clockValue: { fontFamily: typefaces.display, fontSize: 32, lineHeight: 44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '16.666666%', padding: 1 },
  choice: { width: '100%', minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  number: { fontSize: 15, lineHeight: 23 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { flex: 1, minWidth: 110 },
});
