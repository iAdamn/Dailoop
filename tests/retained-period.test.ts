import assert from 'node:assert/strict';
import test from 'node:test';
import { makePeriod, periodFor } from '../src/domain';
import { retainedPeriod } from '../src/ui/retainedPeriod';

test('a retained week keeps its dates and follows the selected timezone', () => {
  const now = Date.parse('2026-10-13T17:00:00Z');
  const week = periodFor('week', '2026-10-13', 'America/Bogota', now);
  const updated = retainedPeriod(week, 'Europe/Madrid', now);
  assert.equal(updated.from, '2026-10-12');
  assert.equal(updated.to, '2026-10-18');
  assert.equal(updated.zone, 'Europe/Madrid');
  assert.equal(updated.startMs, Date.parse('2026-10-11T22:00:00Z'));
  assert.equal(updated.endMs, Date.parse('2026-10-18T22:00:00Z'));
});

test('clock rollback clips a custom range instead of crashing a hidden screen', () => {
  const range = makePeriod({ from: '2026-10-09', to: '2026-10-13', zone: 'America/Bogota', nowMs: Date.parse('2026-10-13T17:00:00Z') });
  const updated = retainedPeriod(range, 'America/Bogota', Date.parse('2026-10-11T17:00:00Z'));
  assert.equal(updated.kind, 'range');
  assert.equal(updated.from, '2026-10-09');
  assert.equal(updated.to, '2026-10-11');
  assert.equal(updated.endMs, Date.parse('2026-10-12T05:00:00Z'));
  assert.equal(range.to, '2026-10-13');
});

test('a timezone crossing the previous day safely replaces a future day filter', () => {
  const now = Date.parse('2026-10-13T07:00:00Z');
  const day = periodFor('day', '2026-10-13', 'America/Bogota', now);
  const updated = retainedPeriod(day, 'Pacific/Honolulu', now);
  assert.equal(updated.kind, 'day');
  assert.equal(updated.from, '2026-10-12');
  assert.equal(updated.to, '2026-10-12');
  assert.equal(updated.startMs, Date.parse('2026-10-12T10:00:00Z'));
});
