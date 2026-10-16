import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

test('both Expo source and Metro build preserve zoned fields while legacy weekly and date triggers stay unchanged', () => {
  for (const relative of ['src/scheduleNotificationAsync.ts', 'build/scheduleNotificationAsync.js']) {
    const source = ts.transpileModule(readFileSync(join(process.cwd(), 'node_modules/expo-notifications', relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
    }).outputText;
    const loaded = { exports: {} as { parseTrigger: (trigger: unknown) => unknown } };
    const triggers = Object.fromEntries(['calendar', 'daily', 'weekly', 'monthly', 'yearly', 'date', 'timeInterval'].map(value => [value.replace(/[A-Z]/g, letter => '_' + letter).toUpperCase(), value]));
    const dependencies: Record<string, unknown> = {
      'expo-modules-core': { Platform: { OS: 'android', select: (value: Record<string, unknown>) => value.android ?? value.default } },
      './NotificationScheduler': {}, './Notifications.types': { SchedulableTriggerInputTypes: triggers },
      './hasValidTriggerObject': { hasValidTriggerObject: () => true },
    };
    new Function('require', 'module', 'exports', source)((name: string) => {
      assert.ok(name in dependencies, 'Unexpected import ' + name);
      return dependencies[name];
    }, loaded, loaded.exports);
    const weekly = { type: 'weekly', weekday: 2, hour: 9, minute: 30, channelId: 'test' };
    assert.deepEqual(loaded.exports.parseTrigger(weekly), weekly, relative);
    const extended = { ...weekly, dailoopZone: 'America/Bogota', dailoopLeadMinutes: 60, dailoopStartAtMs: 1_800_000_000_000, dailoopSkipDates: ['2027-01-11'] };
    assert.deepEqual(loaded.exports.parseTrigger(extended), extended, relative);
    assert.deepEqual(loaded.exports.parseTrigger({ type: 'date', date: 1_800_000_000_000 }), { type: 'date', timestamp: 1_800_000_000_000 }, relative);
  }
});

test('native zoned weekly calculator preserves start, selected days, leads, folds, gaps and skips without JS', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dailoop-weekly-jvm-'));
  const home = process.env.JAVA_HOME ?? 'C:/Program Files/Eclipse Adoptium/jdk-17.0.14.7-hotspot';
  const executable = (name: string) => process.platform === 'win32' ? join(home, 'bin', name + '.exe') : name;
  const source = readFileSync(join(process.cwd(), 'scripts/native/DailoopZonedWeekly.java'), 'utf8');
  assert.doesNotMatch(source, /(?:import\s+java\.time\.|java\.time\.)/, 'Production calculator must support Android API 24 without desugaring');
  const java = `import java.time.Instant;
import java.util.List;
import expo.modules.notifications.notifications.triggers.DailoopZonedWeekly;
public class RecurrenceCheck {
  static long t(String text) { return Instant.parse(text).toEpochMilli(); }
  static void check(String label, String expected, String now, String start, String zone, int day, int hour, int minute, int lead, List<String> skip) {
    long actual = DailoopZonedWeekly.nextFireAt(t(now), t(start), zone, day, hour, minute, lead, skip);
    if (actual != t(expected)) throw new AssertionError(label + ": " + Instant.ofEpochMilli(actual));
  }
  public static void main(String[] args) {
    check("Bogota monday", "2026-10-19T14:00:00Z", "2026-10-14T00:00:00Z", "2026-10-15T14:00:00Z", "America/Bogota", 2, 9, 0, 0, List.of());
    check("future start", "2026-11-02T14:00:00Z", "2026-10-14T00:00:00Z", "2026-11-01T14:00:00Z", "America/Bogota", 2, 9, 0, 0, List.of());
    check("lead crosses sunday", "2026-10-18T14:00:00Z", "2026-10-14T00:00:00Z", "2026-10-15T14:00:00Z", "America/Bogota", 2, 9, 0, 1440, List.of());
    check("already fired skips week", "2026-10-26T13:00:00Z", "2026-10-19T13:00:00Z", "2026-10-15T14:00:00Z", "America/Bogota", 2, 9, 0, 60, List.of());
    check("completed future date", "2026-10-26T14:00:00Z", "2026-10-14T00:00:00Z", "2026-10-15T14:00:00Z", "America/Bogota", 2, 9, 0, 0, List.of("2026-10-19"));
    check("spring gap first valid minute", "2026-03-08T07:00:00Z", "2026-03-07T00:00:00Z", "2026-03-01T07:30:00Z", "America/New_York", 1, 2, 30, 0, List.of());
    check("fold earliest", "2026-11-01T05:30:00Z", "2026-10-31T00:00:00Z", "2026-10-01T05:30:00Z", "America/New_York", 1, 1, 30, 0, List.of());
    check("initial fold selected later", "2026-11-01T06:30:00Z", "2026-10-31T00:00:00Z", "2026-11-01T06:30:00Z", "America/New_York", 1, 1, 30, 0, List.of());
    check("lead uses elapsed minutes across DST", "2026-03-07T07:00:00Z", "2026-03-06T00:00:00Z", "2026-03-01T07:00:00Z", "America/New_York", 1, 3, 0, 1440, List.of());
    check("not a finite horizon", "2036-10-20T14:00:00Z", "2036-10-14T00:00:00Z", "2026-10-15T14:00:00Z", "America/Bogota", 2, 9, 0, 0, List.of());
    check("whole skipped civil date", "2012-01-05T19:00:00Z", "2011-12-29T00:00:00Z", "2011-12-23T19:00:00Z", "Pacific/Apia", 6, 9, 0, 0, List.of());
    boolean rejected = false;
    try { DailoopZonedWeekly.nextFireAt(0, 0, "Bad/Zone", 1, 2, 0, 0, List.of()); } catch (RuntimeException e) { rejected = true; }
    if (!rejected) throw new AssertionError("invalid zone accepted");
    System.out.println("12 native recurrence assertions passed");
  }
}`;
  try {
    const helper = join(directory, 'DailoopZonedWeekly.java');
    const harness = join(directory, 'RecurrenceCheck.java');
    writeFileSync(helper, source, 'utf8'); writeFileSync(harness, java, 'utf8');
    const compile = spawnSync(executable('javac'), ['-d', directory, helper, harness], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr || String(compile.error));
    const run = spawnSync(executable('java'), ['-cp', directory, 'RecurrenceCheck'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || String(run.error));
    assert.match(run.stdout, /12 native recurrence assertions passed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
