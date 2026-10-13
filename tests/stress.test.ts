import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { addCalendarDays, buildReport, canonicalize, effectiveEntries, execute, exportBackup, localDate, selectActivities, validateState, type ReportOptions } from '../src/domain';
import { createStressState, STRESS_EXPECTED, STRESS_NOW, stressId } from './fixtures/stress';

const rounded = (value: number): number => Math.round(value * 100) / 100;
function measured<T>(run: () => T): { value: T; ms: number } { const start = performance.now(); const value = run(); return { value, ms: rounded(performance.now() - start) }; }
function samples(run: () => unknown, count: number): { samplesMs: number[]; medianMs: number; p95Ms: number } {
  const samplesMs = Array.from({ length: count }, () => measured(run).ms); const sorted = [...samplesMs].sort((a, b) => a - b); return { samplesMs, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
}

test('synthetic 50-activity / 10,000-occurrence fixture validates and stays deterministic', async () => {
  const initialHeap = process.memoryUsage().heapUsed; const constructed = measured(() => createStressState(STRESS_NOW)); const state = constructed.value;
  assert.equal(state.activities.length, STRESS_EXPECTED.activities); assert.equal(state.entries.length, STRESS_EXPECTED.entries); assert.equal(state.entryRevisions.length, STRESS_EXPECTED.entryRevisions); assert.equal(state.operations.length, STRESS_EXPECTED.operations);
  assert.equal(selectActivities(state).filter(activity => activity.isPrivate).length, STRESS_EXPECTED.privateActivities);
  assert.equal(state.entryRevisions.filter(revision => revision.kind === 'correct').length, STRESS_EXPECTED.corrected); assert.equal(state.entryRevisions.filter(revision => revision.kind === 'void').length, STRESS_EXPECTED.voided); assert.equal(state.entryRevisions.filter(revision => revision.kind === 'restore').length, STRESS_EXPECTED.restored);
  assert.equal(effectiveEntries(state).length, STRESS_EXPECTED.activeEntries);
  const validation = samples(() => { assert.equal(validateState(state), state); }, 3);
  const options: ReportOptions = { from: addCalendarDays(localDate(STRESS_NOW, state.settings.zone), -365), to: localDate(STRESS_NOW, state.settings.zone), zone: state.settings.zone, generatedAtMs: STRESS_NOW, selectedActivityIds: state.activities.map(activity => activity.id) };
  const report = measured(() => buildReport(state, options)); assert.equal(report.value.total, STRESS_EXPECTED.activePublicEntries); assert.equal(report.value.selection.length, 42); assert.ok(!report.value.markdown.includes('PRIVADA')); assert.ok(!report.value.markdown.includes('DATO_PRIVADO'));
  const reports = samples(() => buildReport(state, options), 3);
  const auditReport = measured(() => buildReport(state, { ...options, includeAudit: true, includeNotes: true, includeVoidedAudit: true })); assert.equal(auditReport.value.total, STRESS_EXPECTED.activePublicEntries); assert.ok(!auditReport.value.markdown.includes('DATO_PRIVADO')); assert.equal(auditReport.value.audit.length, 8400);
  const registration = samples(() => {
    let serial = 1_000_001;
    const result = execute(state, { type: 'createEntry', activityId: state.activities[1].id, note: 'Medición sintética' }, { nowMs: STRESS_NOW, operationId: stressId(1_000_000), nextId: () => stressId(serial++) }); assert.equal(result.state.entries.length, 10_001);
  }, 10);
  const canonical = measured(() => canonicalize(state)); const duplicateDigest = createHash('sha256').update(canonicalize(createStressState(STRESS_NOW))).digest('hex'); const digest = createHash('sha256').update(canonical.value).digest('hex'); assert.equal(digest, duplicateDigest);
  const exportedAt = performance.now(); const backup = await exportBackup(state, { backupId: stressId(2_000_000), exportedAtMs: STRESS_NOW, appVersion: 'stress-fixture/1' }, async text => createHash('sha256').update(text).digest('hex'));
  console.log(JSON.stringify({ benchmark: 'dailoop-stress/1', runtime: process.version, platform: `${platform()} ${release()}`, cpu: cpus()[0]?.model, fixture: STRESS_EXPECTED, fixtureBuildMs: constructed.ms, validateState: validation, buildReport: reports, firstReportMs: report.ms, reportWithAuditMs: auditReport.ms, executeRegistrationOnly: registration, canonicalizeMs: canonical.ms, exportBackupMs: rounded(performance.now() - exportedAt), backupBytes: Buffer.byteLength(backup, 'utf8'), reportBytes: Buffer.byteLength(report.value.markdown, 'utf8'), auditReportBytes: Buffer.byteLength(auditReport.value.markdown, 'utf8'), heapDeltaMiB: rounded((process.memoryUsage().heapUsed - initialHeap) / 1024 / 1024), rssMiB: rounded(process.memoryUsage().rss / 1024 / 1024), deterministicDigest: digest, limitations: 'Node/domain only; execute excludes SQLite commit, React render and Android. Small sample p95 is descriptive; device target <500 ms remains unverified.' }, null, 2));
});
