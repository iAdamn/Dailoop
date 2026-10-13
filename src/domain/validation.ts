import { COLORS, LIMITS, type ActivityFields, type Settings } from './types';

const validZones = new Set<string>();
const MAX_CACHED_ZONES = 128;
let graphemeSegmenter: Intl.Segmenter | undefined;

export class DomainError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'DomainError'; }
}
export function invariant(value: unknown, code: string, message: string): asserts value { if (!value) throw new DomainError(code, message); }
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  invariant(Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key)), 'invalid_fields', `Campos no válidos en ${label}.`);
}
export function assertId(value: unknown): asserts value is string { invariant(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 'invalid_id', 'Identificador UUID no válido.'); }
export function assertTime(value: unknown): asserts value is number { invariant(Number.isSafeInteger(value) && (value as number) >= -62_135_596_800_000 && (value as number) <= 253_402_300_799_999, 'invalid_time', 'Fecha no válida.'); }
export function assertZone(value: unknown): asserts value is string {
  invariant(typeof value === 'string' && value.length <= 100, 'invalid_zone', 'Zona horaria no válida.');
  if (validZones.has(value)) return;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); } catch { throw new DomainError('invalid_zone', 'Zona horaria IANA no válida.'); }
  if (validZones.size === MAX_CACHED_ZONES) { const oldest = validZones.values().next().value; if (oldest !== undefined) validZones.delete(oldest); }
  validZones.add(value);
}
export function utf8Length(value: string): number { return new TextEncoder().encode(value).length; }
export function graphemeLength(value: string): number {
  invariant(typeof Intl.Segmenter === 'function', 'missing_unicode_support', 'Este entorno necesita soporte de segmentación Unicode.');
  graphemeSegmenter ??= new Intl.Segmenter('es', { granularity: 'grapheme' });
  let count = 0; const iterator = graphemeSegmenter.segment(value)[Symbol.iterator](); while (!iterator.next().done) count++; return count;
}
export function textLimit(value: unknown, label: string, maxGraphemes: number, maxBytes: number, nonEmpty = false): asserts value is string {
  invariant(typeof value === 'string', 'invalid_text', `${label} debe ser texto.`);
  invariant(!nonEmpty || value.trim().length > 0, 'empty_text', `${label} no puede estar vacío.`);
  invariant(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value), 'invalid_unicode', `${label} contiene Unicode no válido.`);
  invariant(utf8Length(value) <= maxBytes && graphemeLength(value) <= maxGraphemes, 'text_too_long', `${label} supera el límite permitido.`);
}
export function validateActivity(fields: ActivityFields): void {
  textLimit(fields.name, 'El nombre', LIMITS.nameGraphemes, LIMITS.nameBytes, true);
  textLimit(fields.emoji, 'El emoji', 8, 256, true);
  invariant(COLORS.includes(fields.color), 'invalid_color', 'El color debe pertenecer a la paleta Dailoop.');
  invariant(typeof fields.isPrivate === 'boolean' && typeof fields.isArchived === 'boolean', 'invalid_boolean', 'Privacidad o archivo no válidos.');
  invariant(Number.isSafeInteger(fields.sortOrder) && fields.sortOrder >= 0, 'invalid_order', 'Orden no válido.');
  if (fields.category !== null) textLimit(fields.category, 'La categoría', 80, 8192, true);
}
export function validateSettings(settings: Settings): void {
  assertZone(settings.zone);
  invariant(settings.hourFormat === '24h' || settings.hourFormat === '12h', 'invalid_settings', 'Formato horario no válido.');
  invariant(settings.weekStartsOn === 1, 'invalid_settings', 'La semana comienza el lunes.');
  invariant(['system', 'light', 'dark'].includes(settings.theme), 'invalid_settings', 'Tema no válido.');
}
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') { invariant(Number.isSafeInteger(value), 'invalid_number', 'El backup solo admite números enteros seguros.'); return JSON.stringify(value); }
  if (Array.isArray(value)) {
    const ordered = value.length && value.every(item => isRecord(item) && typeof item.id === 'string') ? [...value].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : value;
    return `[${ordered.map(canonicalize).join(',')}]`;
  }
  invariant(isRecord(value), 'invalid_json', 'Valor no admitido en JSON canónico.');
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}
