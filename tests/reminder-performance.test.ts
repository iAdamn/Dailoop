import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { canonicalize, deriveReminders, validateState, type DomainState, type PlanningEvent } from '../src/domain';
import { createStressState, STRESS_NOW, stressId } from './fixtures/stress';

function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function fixture(count: number, recurring: boolean): DomainState {
  const state = createStressState(STRESS_NOW);
  const recordedAtMs = STRESS_NOW - 398 * 86_400_000;
  state.planning = { events: Array.from({ length: count }, (_, index): PlanningEvent => ({ id: stressId(2_000_000 + index * 3), sequence: index + 1, recordedAtMs,
    command: { type: 'createReminder', id: stressId(2_000_001 + index * 3), completionEntryId: stressId(2_000_002 + index * 3), activityId: state.activities[index % 50].id,
      dueAtMs: STRESS_NOW - 365 * 86_400_000, leadMinutes: [0], notifications: true,
      ...(recurring ? { recurrence: { weekdays: [1,2,3,4,5,6,7], hour: 12, minute: 0, zone: 'America/Bogota' } } : {}) } })) };
  return state;
}

test('50 series / 10000 entries preserve deterministic matching and reuse only frozen snapshots', () => {
  const state = fixture(50, true); validateState(state); freeze(state);
  const start = performance.now(); const rows = deriveReminders(state, STRESS_NOW);
  const firstMs = performance.now() - start;
  const hash = createHash('sha256').update(canonicalize(rows)).digest('hex');
  console.log(JSON.stringify({ benchmark: 'reminder-derivation', rows: rows.length, hash, firstMs }));
  assert.equal(rows.filter(row => row.status === 'done').length, 3650);
  assert.equal(hash, '8c0db7cc0c0ecc7f535b02f33423d747c48635011038ebae3085feaf2e8e3250');
  const stableRows = deriveReminders(state, STRESS_NOW + 1_000);
  const original = Intl.DateTimeFormat.prototype.formatToParts; let calls = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function(...args) { calls++; return original.apply(this, args); };
  try {
    const tickStarted = performance.now();
    const tick = deriveReminders(state, STRESS_NOW + 15_000);
    console.log(JSON.stringify({ benchmark: 'reminder-stable-tick', ms: performance.now() - tickStarted, conversions: calls }));
    assert.deepEqual(tick, stableRows);
    assert.ok(calls < 100, `A stable frozen snapshot converted dates ${calls} times`);
    tick[0].leadMinutes.push(123); tick[0].status = 'archived';
    assert.deepEqual(deriveReminders(state, STRESS_NOW + 30_000), stableRows, 'consumer mutation cannot poison cached rows');
  } finally { Intl.DateTimeFormat.prototype.formatToParts = original; }
});

test('10000 one-off reminders / 10000 entries avoid multiplicative date conversions', () => {
  const state = fixture(10_000, false); validateState(state);
  const original = Intl.DateTimeFormat.prototype.formatToParts; let calls = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function(...args) { calls++; return original.apply(this, args); };
  try {
    const started = performance.now(); const rows = deriveReminders(state, STRESS_NOW);
    console.log(JSON.stringify({ benchmark: '10000-oneoff-reminders', rows: rows.length, conversions: calls, ms: performance.now() - started }));
    assert.equal(rows.length, 10_000);
    assert.ok(calls <= 21_000, `Date conversions grew to ${calls}`);
    assert.equal(new Set(rows.flatMap(row => row.completedEntryId ? [row.completedEntryId] : [])).size, rows.filter(row => row.status === 'done').length);
  } finally { Intl.DateTimeFormat.prototype.formatToParts = original; }
});

test('10000 competing series consume indexed dates once without rescanning the calendar', () => {
  const state = fixture(10_000, true); validateState(state);
  const original = Intl.DateTimeFormat.prototype.formatToParts; let calls = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function(...args) { calls++; return original.apply(this, args); };
  try {
    const started = performance.now(); const rows = deriveReminders(state, STRESS_NOW);
    console.log(JSON.stringify({ benchmark: '10000-competing-series', rows: rows.length, conversions: calls, ms: performance.now() - started }));
    assert.ok(rows.length <= state.entries.length + 10_000);
    assert.ok(calls < 100_000, `Date conversions grew to ${calls}`);
    assert.equal(new Set(rows.flatMap(row => row.completedEntryId ? [row.completedEntryId] : [])).size, rows.filter(row => row.status === 'done').length);
  } finally { Intl.DateTimeFormat.prototype.formatToParts = original; }
});

test('equivalent timezone spellings share their index and frozen cache boundaries',()=>{
  const state=fixture(64,true);
  const zone='America/Argentina/Buenos_Aires';
  const firstActivity=state.activities[0].id;
  for(const entry of state.entries)entry.activityId=firstActivity;
  for(const revision of state.entryRevisions)revision.activityRevisionId=state.activityRevisions[0].id;
  for(const operation of state.operations){
    if(operation.kind!=='createEntry')continue;
    const command=JSON.parse(operation.intent);command.activityId=firstActivity;operation.intent=canonicalize(command);
  }
  state.planning!.events.forEach((event,index)=>{
    if(event.command.type!=='createReminder')throw new Error('Expected fixture reminder');
    event.recordedAtMs=STRESS_NOW;
    event.command.activityId=firstActivity;
    event.command.dueAtMs=STRESS_NOW+86_400_000;
    let bit=0;
    event.command.recurrence!.zone=zone.replace(/[A-Za-z]/g,letter=>(index & (1<<bit++)) ? letter.toUpperCase() : letter.toLowerCase());
  });
  validateState(state);freeze(state);
  const original=Intl.DateTimeFormat.prototype.formatToParts;let calls=0;
  Intl.DateTimeFormat.prototype.formatToParts=function(...args){calls++;return original.apply(this,args);};
  try{
    const rows=deriveReminders(state,STRESS_NOW);
    assert.equal(rows.length,64);
    // Includes bounded recurrence candidate checks; 64 independent indexes would
    // instead convert more than 600,000 entry dates for this valid fixture.
    assert.ok(calls<state.entries.length*2,`Equivalent zones repeated ${calls} date conversions`);
    calls=0;
    assert.deepEqual(deriveReminders(state,STRESS_NOW+1_000),rows);
    assert.ok(calls<=2,`Equivalent zones repeated ${calls} cache date conversions`);
  }finally{Intl.DateTimeFormat.prototype.formatToParts=original;}
});
