import assert from 'node:assert/strict';
import test from 'node:test';
import { compactLastTime, effectiveActivityColumns } from '../src/ui/layout';

test('a normal mobile width permits each requested density without altering its preference', () => {
  for (const preferred of [1, 2, 3, 4] as const) {
    assert.equal(effectiveActivityColumns(preferred, 416, 1), preferred);
  }
});

test('200 percent text and narrow viewports reduce displayed density safely', () => {
  assert.ok(effectiveActivityColumns(4, 390, 2) <= 2);
  assert.equal(effectiveActivityColumns(4, 60, 1), 1);
  assert.equal(effectiveActivityColumns(4, 0, 2), 1);
  assert.equal(effectiveActivityColumns(1, 1200, 1), 1);
  for (const width of [100, 240, 360, 416, 900]) {
    const normal = effectiveActivityColumns(4, width, 1);
    const enlarged = effectiveActivityColumns(4, width, 2);
    assert.ok(enlarged >= 1 && enlarged <= normal && normal <= 4);
  }
});

test('compact last occurrence distinguishes absent, future and exact elapsed unit boundaries', () => {
  const now = Date.parse('2026-10-13T17:00:00.000Z');
  assert.equal(compactLastTime(null, now), 'Sin registros');
  assert.equal(compactLastTime(now + 1, now), 'Revisa hora');
  assert.equal(compactLastTime(now, now), 'Ahora');
  assert.equal(compactLastTime(now - 59_999, now), 'Ahora');
  assert.equal(compactLastTime(now - 60_000, now), 'Hace 1 min');
  assert.equal(compactLastTime(now - 3_600_000, now), 'Hace 1 h');
  assert.equal(compactLastTime(now - 86_400_000, now), 'Hace 1 d');
});
