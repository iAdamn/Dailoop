import type { ActivityColumns } from '../infrastructure/preferences';
import { elapsedSince } from '../domain';
import { translate, type AppLanguage } from '../i18n/core';

/** Keep the user's choice; only the displayed grid adapts to available room. */
export function effectiveActivityColumns(preferred: ActivityColumns, width: number, fontScale: number): ActivityColumns {
  const scale = Math.max(1, fontScale);
  const minimum = 76 * scale;
  const fitting = Math.max(1, Math.floor((Math.max(0, width) + 8) / (minimum + 8)));
  return Math.min(preferred, fitting, 4) as ActivityColumns;
}

export function compactLastTime(last: number | null, nowMs: number, language: AppLanguage = 'es'): string {
  const t = (source: string, count?: number) => translate(language, source, { count: count ?? 0 });
  if (last === null) return t('Sin registros');
  const elapsed = nowMs - last;
  if (elapsed < 0) return t('Revisa hora');
  if (elapsed < 60_000) return t('Ahora');
  if (elapsed < 3_600_000) return t('Hace {count} min', Math.floor(elapsed / 60_000));
  if (elapsed < 86_400_000) return t('Hace {count} h', Math.floor(elapsed / 3_600_000));
  return t('Hace {count} d', Math.floor(elapsed / 86_400_000));
}

/** Presentation only: elapsed-time validation and timestamps stay in the domain. */
export function elapsedText(last: number | null, nowMs: number, language: AppLanguage = 'es'): string {
  const elapsed = elapsedSince(last, nowMs);
  if (elapsed.status === 'never') return translate(language, 'Nunca');
  if (elapsed.status === 'clockChanged') return translate(language, 'Revisa la hora del dispositivo');
  const minutes = Math.floor(elapsed.milliseconds! / 60_000);
  const hours = Math.floor(elapsed.milliseconds! / 3_600_000);
  const days = Math.floor(elapsed.milliseconds! / 86_400_000);
  if (!minutes) return translate(language, 'Ahora');
  if (!hours) return translate(language, 'Hace {count} min', { count: minutes });
  if (!days) return translate(language, 'Hace {count} h', { count: hours });
  return translate(language, days === 1 ? 'Hace {count} día' : 'Hace {count} días', { count: days });
}
