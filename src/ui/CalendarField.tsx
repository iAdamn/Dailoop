import { useI18n } from '../i18n/react';
import { languageLocales, translate, type AppLanguage } from '../i18n/core';
import React, { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { parseDate } from '../domain';
import { Button, GlassLayer, Label, ModalFrame, s, useColors, webFocusRing } from './components';
import { MotionPressable } from './motion';
import { alpha, palette } from './tokens';
import { typefaces } from './typography';

export interface CalendarFieldProps {
  label: string;
  /** A calendar date in the form YYYY-MM-DD, without conversion to an instant. */
  value: string;
  onChange(value: string): void;
  minDate?: string;
  maxDate?: string;
  hint?: string;
  disabled?: boolean;
}

const monthCache: Partial<Record<AppLanguage, string[]>> = {};
const readableCache: Partial<Record<AppLanguage, Intl.DateTimeFormat>> = {};
function monthNames(language: AppLanguage) {
  if (!monthCache[language]) {
    const formatter = new Intl.DateTimeFormat(languageLocales[language], { month: 'long', timeZone: 'UTC' });
    monthCache[language] = Array.from({ length: 12 }, (_, month) => formatter.format(utcDate(2026, month + 1, 1)));
  }
  return monthCache[language]!;
}
const weekdayNames: Record<AppLanguage, string[]> = { es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], pt: ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] };
const pad = (value: number, size = 2) => String(value).padStart(size, '0');
const iso = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
function validDate(value?: string): value is string { try { if (!value) return false; parseDate(value); return true; } catch { return false; } }
function utcDate(year: number, month: number, day: number) {
  // Date.UTC treats years 0–99 as 1900–1999. Set the full year explicitly.
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(12, 0, 0, 0); return date;
}
function daysInMonth(year: number, month: number) { return utcDate(year, month + 1, 0).getUTCDate(); }
function readable(value: string, language: AppLanguage) {
  if (!validDate(value)) return translate(language, 'Elegir fecha');
  const { year, month, day } = parseDate(value);
  readableCache[language] ??= new Intl.DateTimeFormat(languageLocales[language], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return readableCache[language]!.format(utcDate(year, month, day));
}

/** Shared calendar for reminders, entry corrections, history and reports. */
export function CalendarField({ label, value, onChange, minDate, maxDate, hint, disabled = false }: CalendarFieldProps) {
  const { t, language } = useI18n();
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const minimum = validDate(minDate) ? minDate : '0001-01-01';
  const maximum = validDate(maxDate) ? maxDate : '9999-12-31';
  return <View style={s.field}>
    <Text style={[s.fieldLabel, { color: colors.text }]}>{label}</Text>
    <MotionPressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={t("Abre un calendario para elegir la fecha")} accessibilityValue={{ text: readable(value, language) }}
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }}
      style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.field, { opacity: disabled ? 0.5 : 1 }, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]}>
      <GlassLayer radius={17} dark={colors.dark} strength="control" />
      <Text style={[styles.value, { color: colors.text }]}>{readable(value, language)}</Text>
      <Text accessible={false} style={{ color: colors.text, fontSize: 20 }}>▦</Text>
    </MotionPressable>
    {!!hint && <Label small>{hint}</Label>}
    {open && <CalendarPopup value={value} minimum={minimum} maximum={maximum} onClose={() => setOpen(false)} onChange={onChange} />}
  </View>;
}

function CalendarPopup({ value, minimum, maximum, onClose, onChange }: { value: string; minimum: string; maximum: string; onClose(): void; onChange(value: string): void }) {
  const { t, language } = useI18n();
  const colors = useColors();
  const months = monthNames(language), weekdays = weekdayNames[language];
  const fallback = new Date().toISOString().slice(0, 10);
  const initial = validDate(value) ? value : fallback;
  const bounded = initial < minimum ? minimum : initial > maximum ? maximum : initial;
  const [selected, setSelected] = useState(bounded);
  const [visible, setVisible] = useState(() => { const date = parseDate(bounded); return { year: date.year, month: date.month }; });
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [yearStart, setYearStart] = useState(() => Math.max(1, Math.min(9988, visible.year - 5)));
  const { year, month } = visible;
  const firstWeekday = (utcDate(year, month, 1).getUTCDay() + 6) % 7;
  const totalDays = daysInMonth(year, month);
  const rows = Math.ceil((firstWeekday + totalDays) / 7);
  const minimumYear = parseDate(minimum).year, maximumYear = parseDate(maximum).year;
  const monthAllowed = (candidateYear: number, candidateMonth: number) => candidateYear >= 1 && candidateYear <= 9999 && iso(candidateYear, candidateMonth, 1) <= maximum && iso(candidateYear, candidateMonth, daysInMonth(candidateYear, candidateMonth)) >= minimum;
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return <ModalFrame title={t("Elegir fecha")} subtitle={readable(selected, language)} onClose={onClose}>
    {({ closeWith }) => <View style={[s.stack, { gap: 12, padding: 8, borderRadius: 20, backgroundColor: alpha(colors.panel, 0.92) }]}>
      <View style={[s.spread, { gap: 6 }]}>
        <Button subtle compact label={t(mode === 'years' ? '12 años anteriores' : 'Mes anterior')} disabled={mode === 'years' ? yearStart <= minimumYear : !monthAllowed(previous.year, previous.month)}
          onPress={() => mode === 'years' ? setYearStart(Math.max(minimumYear, yearStart - 12)) : (setVisible(previous), setMode('days'))}>‹</Button>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
          <Button subtle compact label={t("Elegir mes")} onPress={() => setMode(mode === 'months' ? 'days' : 'months')}>{months[month - 1]}</Button>
          <Button subtle compact label={t("Elegir año")} onPress={() => { setYearStart(Math.max(minimumYear, Math.min(maximumYear - 11, year - 5))); setMode(mode === 'years' ? 'days' : 'years'); }}>{year}</Button>
        </View>
        <Button subtle compact label={t(mode === 'years' ? '12 años siguientes' : 'Mes siguiente')} disabled={mode === 'years' ? yearStart + 11 >= maximumYear : !monthAllowed(next.year, next.month)}
          onPress={() => mode === 'years' ? setYearStart(Math.min(maximumYear - 11, yearStart + 12)) : (setVisible(next), setMode('days'))}>›</Button>
      </View>
      {mode === 'days' && <View accessibilityLabel={new Intl.DateTimeFormat(languageLocales[language], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(year, month, 1))}>
        <View style={{ flexDirection: 'row' }}>{weekdays.map((day, index) => <View key={index} style={styles.cell}><Label small strong>{day}</Label></View>)}</View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: rows * 7 }, (_, index) => {
            const day = index - firstWeekday + 1;
            if (day < 1 || day > totalDays) return <View key={index} style={styles.cell} />;
            const date = iso(year, month, day), chosen = selected === date, blocked = date < minimum || date > maximum;
            return <MotionPressable key={date} wrapperStyle={styles.cell} testID={`calendar-day-${date}`} accessibilityRole="button" accessibilityLabel={readable(date, language)} accessibilityState={{ selected: chosen, disabled: blocked }}
              disabled={blocked} onPress={() => setSelected(date)} style={({ focused }: { pressed: boolean; focused?: boolean }) => [styles.dayButton, { opacity: blocked ? 0.25 : 1 }, webFocusRing(focused, colors.dark ? palette.lavender : palette.violet)]}>
              <View style={[styles.day, { borderWidth: chosen ? 1 : 0, borderColor: colors.surfaceEdge }]}>
                {chosen && <GlassLayer radius={13} dark={colors.dark} tint={palette.lavender} strength="strong" />}
                <Text style={{ fontFamily: chosen ? typefaces.bold : typefaces.body, fontSize: 15, color: colors.text }}>{day}</Text>
              </View>
            </MotionPressable>;
          })}
        </View>
      </View>}
      {mode === 'months' && <View style={styles.choices}>{months.map((name, index) => <View key={name} style={styles.choice}><Button secondary compact disabled={!monthAllowed(year, index + 1)} label={name} onPress={() => { setVisible({ year, month: index + 1 }); setMode('days'); }}>{name}</Button></View>)}</View>}
      {mode === 'years' && <>
        <Label small style={s.center}>{yearStart} — {Math.min(maximumYear, yearStart + 11)}</Label>
        <View style={styles.choices}>{Array.from({ length: Math.min(12, maximumYear - yearStart + 1) }, (_, index) => yearStart + index).map(candidate => <View key={candidate} style={styles.choice}><Button secondary compact label={t('Año {year}', { year: candidate })} onPress={() => {
          const validMonth = monthAllowed(candidate, month) ? month : candidate === minimumYear ? parseDate(minimum).month : parseDate(maximum).month;
          setVisible({ year: candidate, month: validMonth }); setMode('days');
        }}>{candidate}</Button></View>)}</View>
      </>}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 100 }}><Button secondary onPress={() => closeWith(onClose)}>{t("Cancelar")}</Button></View>
        <View style={{ flex: 1, minWidth: 135 }}><Button label={t("Elegir esta fecha")} disabled={selected < minimum || selected > maximum} onPress={() => closeWith(() => { onChange(selected); onClose(); })}>{t("Elegir fecha")}</Button></View>
      </View>
    </View>}
  </ModalFrame>;
}

const styles = StyleSheet.create({
  field: { minHeight: 54, borderRadius: 17, paddingHorizontal: 16, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  value: { flex: 1, fontFamily: typefaces.body, fontSize: 16, lineHeight: 25 },
  cell: { width: '14.285714%', minHeight: 40, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 13 },
  dayButton: { width: '100%', height: '100%', minHeight: 40, justifyContent: 'center', alignItems: 'center', borderRadius: 13 },
  day: { width: '88%', height: '88%', alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { width: '30%', flexGrow: 1 },
});
