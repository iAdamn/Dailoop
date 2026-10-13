import type { ActivityColumns } from '../infrastructure/preferences';

/** Keep the user's choice; only the displayed grid adapts to available room. */
export function effectiveActivityColumns(preferred: ActivityColumns, width: number, fontScale: number): ActivityColumns {
  const scale = Math.max(1, fontScale);
  const minimum = 76 * scale;
  const fitting = Math.max(1, Math.floor((Math.max(0, width) + 8) / (minimum + 8)));
  return Math.min(preferred, fitting, 4) as ActivityColumns;
}

export function compactLastTime(last: number | null, nowMs: number): string {
  if (last === null) return 'Sin registros';
  const elapsed = nowMs - last;
  if (elapsed < 0) return 'Revisa hora';
  if (elapsed < 60_000) return 'Ahora';
  if (elapsed < 3_600_000) return `Hace ${Math.floor(elapsed / 60_000)} min`;
  if (elapsed < 86_400_000) return `Hace ${Math.floor(elapsed / 3_600_000)} h`;
  return `Hace ${Math.floor(elapsed / 86_400_000)} d`;
}
