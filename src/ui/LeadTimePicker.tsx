import { useI18n } from '../i18n/react';
import { translate, type AppLanguage } from '../i18n/core';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Chip, GlassLayer, Label, ModalFrame, s, useColors } from './components';
import { alpha } from './tokens';
import { typefaces } from './typography';

export interface LeadTimePickerProps {
  visible: boolean;
  onClose(): void;
  onSelect(minutes: number): void;
  selectedMinutes?: number[];
}

const MAX_MINUTES = 525600;
const presets = [0, 5, 15, 30, 60, 180, 1440, MAX_MINUTES];
export function durationLabel(minutes: number, language: AppLanguage = 'es') {
  const t = (source: string, params?: Record<string, string | number>) => translate(language, source, params);
  if (minutes === MAX_MINUTES) return t('365 días');
  if (minutes === 1440) return t('1 día');
  if (minutes >= 60 && minutes % 60 === 0) return t(minutes === 60 ? '{count} hora' : '{count} horas', { count: minutes / 60 });
  return t('{count} minutos', { count: minutes });
}

/** Separate draft component ensures cancel/reopening never retains an unconfirmed value. */
export function LeadTimePicker(props: LeadTimePickerProps) {
  return props.visible ? <LeadTimePopup {...props} /> : null;
}

function LeadTimePopup({ onClose, onSelect, selectedMinutes = [] }: LeadTimePickerProps) {
  const { t, language } = useI18n();
  const colors = useColors();
  const [total, setTotal] = useState(15);
  const change = (step: number) => setTotal(current => Math.max(0, Math.min(MAX_MINUTES, current + step)));
  const duplicate = selectedMinutes.includes(total);
  const full = new Set(selectedMinutes).size >= 16;
  const parts = [
    { label: 'Días', name: 'días', value: Math.floor(total / 1440), step: 1440 },
    { label: 'Horas', name: 'horas', value: Math.floor(total / 60) % 24, step: 60 },
    { label: 'Minutos', name: 'minutos', value: total % 60, step: 1 },
  ];
  return <ModalFrame surfaceColor={colors.panel} title={t("Aviso personalizado")} subtitle={t("Elige cuánto tiempo antes quieres recibirlo.")} onClose={onClose}>
    {({ closeWith }) => <View style={[s.stack, styles.popup, { backgroundColor: alpha(colors.panel, 0.92) }]}>
      {parts.map(part => <View key={part.name} style={styles.unit}>
        <Label strong>{t(part.label)}</Label>
        <View style={styles.stepper}>
          <Button secondary compact label={t('Disminuir {unit}', { unit: t(part.name) })} disabled={total === 0} onPress={() => change(-part.step)}>−</Button>
          <View style={styles.valueBox}>
            <GlassLayer radius={17} dark={colors.dark} strength="control" />
            <Text accessibilityLabel={`${t(part.label)}: ${part.value}`} style={[styles.value, { color: colors.text }]}>{String(part.value).padStart(2, '0')}</Text>
          </View>
          <Button secondary compact label={t('Aumentar {unit}', { unit: t(part.name) })} disabled={total === MAX_MINUTES} onPress={() => change(part.step)}>+</Button>
        </View>
        {part.name === 'días' && <View style={styles.shortcuts}>
          <Button secondary compact label={t("Disminuir siete días")} disabled={total === 0} onPress={() => change(-10080)}>{t("−7 días")}</Button>
          <Button secondary compact label={t("Aumentar siete días")} disabled={total === MAX_MINUTES} onPress={() => change(10080)}>{t("+7 días")}</Button>
        </View>}
      </View>)}
      <View style={s.wrap}>{presets.map(minutes => <Chip key={minutes} selected={total === minutes} label={t('Anticipación de {duration}', { duration: durationLabel(minutes, language) })} onPress={() => setTotal(minutes)}>{minutes === 0 ? t('Al momento') : durationLabel(minutes, language)}</Chip>)}</View>
      <Label small style={s.center}>{total === 0 ? t('Avisar al momento del recordatorio.') : t('{days} días, {hours} horas y {minutes} minutos antes.', { days: parts[0].value, hours: parts[1].value, minutes: parts[2].value })}</Label>
      {(full || duplicate) && <Label small strong>{t(full ? 'Puedes añadir hasta 16 avisos.' : 'Este aviso ya está añadido.')}</Label>}
      <View style={styles.actions}>
        <View style={styles.action}><Button secondary onPress={() => closeWith(onClose)}>{t("Cancelar")}</Button></View>
        <View style={styles.action}><Button label={t("Añadir aviso personalizado")} disabled={duplicate || full} onPress={() => closeWith(() => { onSelect(total); onClose(); })}>{t("Añadir aviso")}</Button></View>
      </View>
    </View>}
  </ModalFrame>;
}

const styles = StyleSheet.create({
  popup: { gap: 15, padding: 8, borderRadius: 20 },
  unit: { gap: 7 }, stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valueBox: { flex: 1, minWidth: 65, minHeight: 54, justifyContent: 'center', alignItems: 'center', borderRadius: 17 },
  value: { fontFamily: typefaces.display, fontSize: 25, lineHeight: 36 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, action: { flex: 1, minWidth: 110 },
});
