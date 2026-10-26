// Run: node --test exercise-cloud.test.mjs
// No network, credentials, browser, real storage, or database access.
import test from 'node:test';
import assert from 'node:assert/strict';
import './exercise-cloud.js';

const { save } = globalThis.FaceExerciseCloud;
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const payload = Object.freeze({
  date: '2026-10-26T09:00:00.000Z', exId: 'smile', exName: 'Smile',
  exZone: 'mid', exType: 'strength', score: 82,
  completedSets: 3, targetSets: 4, completedReps: 12, targetReps: 16,
});
const user = Object.freeze({ id: 'test-user' });
const context = Object.freeze({ personId: 'test-person', orgId: 'test-org' });

function mockClient(config = {}) {
  const calls = [];
  let insertedRow;
  const client = {
    from(table) {
      const call = { table, operation: null, filters: [] };
      calls.push(call);
      const builder = {
        select(fields) { call.fields = fields; call.operation ||= 'select'; return builder; },
        insert(row) { call.operation = 'insert'; call.row = clone(row); insertedRow = clone(row); return builder; },
        eq(column, value) { call.filters.push([column, value]); return builder; },
        async maybeSingle() {
          const phase = table === 'exercises' ? 'lookup' : call.operation === 'insert' ? 'insert' : 'readback';
          if (config.onAwait) await config.onAwait(phase, call);
          if (config.throwAt === phase) throw new Error('PRIVATE_SERVER_TEXT');
          if (config.errorAt === phase) return config.errorResponse ?? {
            data: null, error: { message: 'PRIVATE_SERVER_TEXT' }, status: 400,
          };
          if (phase === 'lookup') return { data: config.missingMapping ? null : { id: config.exerciseId ?? 'test-exercise' }, error: null };
          if (phase === 'insert') {
            if (config.missingInsertResponse) return undefined;
            return { data: config.missingInsertId ? null : { id: config.rowId ?? 'test-row' }, error: null };
          }
          if (config.missingReadback) return { data: null, error: null };
          let row = { id: config.rowId ?? 'test-row', ...clone(insertedRow) };
          if (config.mutateReadback) row = config.mutateReadback(row);
          return { data: row, error: null };
        },
      };
      return builder;
    },
  };
  return { client, calls };
}
async function run(config = {}, overrides = {}) {
  const mock = mockClient(config);
  const outcome = await save({ client: mock.client, user, context, payload, ...overrides });
  assert.ok(!JSON.stringify(outcome).includes('PRIVATE_SERVER_TEXT'));
  return { ...mock, outcome };
}
const insertCalls = calls => calls.filter(call => call.operation === 'insert');

for (const [name, ctx, table, ownerColumn, ownerValue] of [
  ['core', context, 'mobile_exercise_sessions', 'subject_person_id', context.personId],
  ['legacy', null, 'ff_exercise_sessions', 'user_id', user.id],
]) {
  test(`${name}: insert then independent exact-ID user-scoped readback`, async () => {
    const { outcome, calls } = await run({}, { context: ctx });
    assert.equal(outcome.status, 'saved');
    assert.equal(outcome.rowId, 'test-row');
    assert.equal(outcome.table, table);
    assert.deepEqual(outcome.owner, { userId: user.id, personId: ctx?.personId ?? null });
    const insert = insertCalls(calls)[0];
    assert.equal(insert.fields, 'id');
    const read = calls.at(-1);
    assert.notEqual(read, insert);
    assert.equal(read.table, table);
    assert.equal(read.operation, 'select');
    assert.ok(read.filters.some(([key, val]) => key === 'id' && val === outcome.rowId));
    assert.ok(read.filters.some(([key, val]) => key === ownerColumn && val === ownerValue));
    if (ctx) assert.ok(read.filters.some(([key, val]) => key === 'source_app' && val === 'face_fitness'));
  });
  for (const phase of ['insert', 'readback']) {
    test(`${name}: returned ${phase} error is checked, with no retry/fallback`, async () => {
      const { outcome, calls } = await run({ errorAt: phase }, { context: ctx });
      assert.equal(outcome.status, phase === 'insert' ? 'failed' : 'unconfirmed');
      assert.equal(outcome.code, phase + '_error');
      assert.equal(insertCalls(calls).length, 1);
      assert.ok(calls.filter(c => c.table !== 'exercises').every(c => c.table === table));
      if (phase === 'insert') assert.equal(calls.at(-1).operation, 'insert');
    });
    test(`${name}: thrown ${phase} transport is unconfirmed and never retried`, async () => {
      const { outcome, calls } = await run({ throwAt: phase }, { context: ctx });
      assert.equal(outcome.status, 'unconfirmed');
      assert.equal(insertCalls(calls).length, 1);
    });
  }
  test(`${name}: missing readback is unconfirmed`, async () => {
    const { outcome } = await run({ missingReadback: true }, { context: ctx });
    assert.equal(outcome.status, 'unconfirmed');
    assert.equal(outcome.code, 'readback_missing');
  });
}

test('core: metadata, real sets/reps, timestamp, score and known-column allowlist preserved', async () => {
  const { calls } = await run();
  const row = insertCalls(calls)[0].row;
  assert.equal(row.completed_sets, 3);
  assert.equal(row.target_sets, 4);
  assert.equal(row.completed_reps, 12);
  assert.equal(row.target_reps, 16);
  assert.equal(row.completed_at, payload.date);
  assert.equal(row.pose_accuracy, 0.82);
  assert.equal(row.best_accuracy, 0.82);
  assert.deepEqual(row.feedback, [{
    exId: payload.exId, exName: payload.exName, date: payload.date,
    zone: payload.exZone, type: payload.exType, score: payload.score,
  }]);
  assert.deepEqual(Object.keys(row).sort(), [
    'subject_person_id', 'exercise_id', 'source_app', 'pose_accuracy', 'best_accuracy',
    'completed_sets', 'target_sets', 'completed_reps', 'target_reps', 'status',
    'completed_at', 'feedback',
  ].sort());
});
test('legacy: only known columns, explicit created_at, no invented sets columns', async () => {
  const { calls } = await run({}, { context: null });
  assert.deepEqual(insertCalls(calls)[0].row, {
    user_id: user.id, ex_id: payload.exId, ex_name: payload.exName,
    ex_zone: payload.exZone, ex_type: payload.exType, score: payload.score,
    created_at: payload.date,
  });
});
for (const kind of ['errorAt', 'throwAt']) {
  test(`core: lookup ${kind} stops before insert`, async () => {
    const { outcome, calls } = await run({ [kind]: 'lookup' });
    assert.equal(outcome.status, 'failed');
    assert.equal(insertCalls(calls).length, 0);
  });
}
test('core: missing mapping fails closed without verified nullable-column opt-in', async () => {
  const { outcome, calls } = await run({ missingMapping: true });
  assert.equal(outcome.code, 'mapping_missing');
  assert.equal(insertCalls(calls).length, 0);
});
test('core: explicitly permitted missing mapping keeps null ID and complete metadata', async () => {
  const { outcome, calls } = await run({ missingMapping: true }, {
    context: { ...context, allowUnmappedExercise: true },
  });
  assert.equal(outcome.status, 'saved');
  const row = insertCalls(calls)[0].row;
  assert.equal(row.exercise_id, null);
  assert.equal(row.feedback[0].exId, payload.exId);
  assert.equal(row.feedback[0].exName, payload.exName);
});
for (const key of ['id', 'subject_person_id', 'source_app', 'exercise_id',
  'pose_accuracy', 'best_accuracy', 'completed_sets', 'target_sets',
  'completed_reps', 'target_reps', 'status', 'completed_at']) {
  test(`core: readback mismatch in ${key} is unconfirmed`, async () => {
    const { outcome } = await run({ mutateReadback: row => ({ ...row, [key]: 'wrong' }) });
    assert.equal(outcome.status, 'unconfirmed');
    assert.equal(outcome.code, 'readback_mismatch');
  });
}
for (const key of ['exId', 'exName', 'date', 'zone', 'type', 'score']) {
  test(`core: feedback ${key} mismatch is unconfirmed`, async () => {
    const { outcome } = await run({ mutateReadback: row => {
      row.feedback[0][key] = 'wrong'; return row;
    } });
    assert.equal(outcome.code, 'readback_mismatch');
  });
}
for (const key of ['id', 'user_id', 'ex_id', 'ex_name', 'ex_zone', 'ex_type', 'score', 'created_at']) {
  test(`legacy: readback ${key} mismatch is unconfirmed`, async () => {
    const { outcome } = await run({ mutateReadback: row => ({ ...row, [key]: 'wrong' }) }, { context: null });
    assert.equal(outcome.code, 'readback_mismatch');
  });
}
for (const option of ['missingInsertId', 'missingInsertResponse']) {
  test(`${option}: unconfirmed, no SELECT without exact ID, no retry`, async () => {
    const { outcome, calls } = await run({ [option]: true });
    assert.equal(outcome.status, 'unconfirmed');
    assert.equal(calls.at(-1).operation, 'insert');
    assert.equal(insertCalls(calls).length, 1);
  });
}
test('missing user: local_only without calling client or asserting local storage', async () => {
  const { outcome, calls } = await run({}, { user: null });
  assert.equal(outcome.status, 'local_only');
  assert.equal(calls.length, 0);
  assert.equal(outcome.rowId, null);
});
test('missing client: local_only', async () => {
  const outcome = await save({ user, context, payload });
  assert.equal(outcome.status, 'local_only');
});
for (const patch of [
  { date: 'not-a-date' }, { date: '2026-10-26T09:00:00' },
  { score: NaN }, { score: 101 }, { exId: '' },
  { completedSets: undefined }, { targetSets: 0 }, { completedSets: 1.5 },
]) {
  test(`invalid payload ${Object.keys(patch).join(',')}: no database calls (${String(Object.values(patch)[0])})`, async () => {
    const { outcome, calls } = await run({}, { payload: { ...payload, ...patch } });
    assert.equal(outcome.status, 'failed');
    assert.equal(calls.length, 0);
  });
}
test('invalid person context cannot silently select legacy', async () => {
  const { outcome, calls } = await run({}, { context: { personId: {} } });
  assert.equal(outcome.code, 'invalid_context');
  assert.equal(calls.length, 0);
});
test('equivalent timezone representation in readback is accepted', async () => {
  const { outcome } = await run({ mutateReadback: row => ({
    ...row, completed_at: '2026-10-26T18:00:00+09:00',
  }) });
  assert.equal(outcome.status, 'saved');
});
test('public API frozen; absence of options does not access any storage', async () => {
  assert.ok(Object.isFrozen(globalThis.FaceExerciseCloud));
  assert.equal((await save()).status, 'local_only');
});

for (const date of ['2026-02-30T09:00:00Z', '2026-02-29T09:00:00Z', '2026-04-31T09:00:00Z', '2026-10-26T24:00:00Z', '2026-10-26T09:00:00+25:00']) {
  test(`impossible timestamp rejected: ${date}`, async () => {
    const { outcome, calls } = await run({}, { payload: { ...payload, date } });
    assert.equal(outcome.code, 'invalid_payload');
    assert.equal(calls.length, 0);
  });
}
test('valid leap-day date accepted', async () => {
  const { outcome } = await run({}, { payload: { ...payload, date: '2028-02-29T09:00:00Z' } });
  assert.equal(outcome.status, 'saved');
});
test('numeric row, exercise and person IDs do not assume UUID schema', async () => {
  const { outcome, calls } = await run({ rowId: 7, exerciseId: 11 }, { context: { personId: 0 } });
  assert.equal(outcome.status, 'saved');
  assert.equal(outcome.rowId, 7);
  assert.equal(insertCalls(calls)[0].row.subject_person_id, 0);
  assert.equal(insertCalls(calls)[0].row.exercise_id, 11);
});
test('missing optional reps default to the known PR2 zero values, not sets', async () => {
  const { outcome, calls } = await run({}, { payload: { ...payload, completedReps: undefined, targetReps: undefined } });
  assert.equal(outcome.status, 'saved');
  assert.equal(insertCalls(calls)[0].row.completed_reps, 0);
  assert.equal(insertCalls(calls)[0].row.target_reps, 0);
  assert.equal(insertCalls(calls)[0].row.completed_sets, payload.completedSets);
});
test('missing feedback cannot be mistaken for confirmed exercise identity', async () => {
  const { outcome } = await run({ mutateReadback: row => ({ ...row, feedback: null }) });
  assert.equal(outcome.code, 'readback_mismatch');
});

for (const [name, ctx] of [['core', context], ['legacy', null]]) {
  for (const [label, response, expected] of [
    ['status zero', { status: 0, error: {} }, 'unconfirmed'],
    ['server 500', { status: 500, error: {} }, 'unconfirmed'],
    ['gateway 502', { status: 502, error: {} }, 'unconfirmed'],
    ['unavailable 503 with DB code', { status: 503, error: { code: '23505' } }, 'unconfirmed'],
    ['timeout 408', { status: 408, error: {} }, 'unconfirmed'],
    ['unclassified without status', { error: { message: 'PRIVATE_SERVER_TEXT' } }, 'unconfirmed'],
    ['unknown code', { error: { code: 'UNKNOWN' } }, 'unconfirmed'],
    ['fetch transport', { error: { code: 'FETCH_ERROR' } }, 'unconfirmed'],
    ['transport overrides apparent 4xx', { status: 400, error: { code: 'ECONNRESET' } }, 'unconfirmed'],
    ['abort transport overrides DB code', { error: { name: 'AbortError', code: '23505' } }, 'unconfirmed'],
    ['nested timeout status', { error: { status: 408 } }, 'unconfirmed'],
    ['nested forbidden status', { error: { status: 403 } }, 'failed'],
    ['connection SQLSTATE', { error: { code: '08006' } }, 'unconfirmed'],
    ['unknown completion SQLSTATE', { error: { code: '40003' } }, 'unconfirmed'],
    ['PostgREST connection', { error: { code: 'PGRST000' } }, 'unconfirmed'],
    ['permission rejection', { status: 403, error: {} }, 'failed'],
    ['conflict rejection', { status: 409, error: {} }, 'failed'],
    ['known SQLSTATE', { error: { code: '23505' } }, 'failed'],
    ['known RLS SQLSTATE', { error: { code: '42501' } }, 'failed'],
    ['known PGRST rejection', { error: { code: 'PGRST204' } }, 'failed'],
  ]) {
    test(`${name}: returned insert ${label} => ${expected}, no retry/readback`, async () => {
      const { outcome, calls } = await run({ errorAt: 'insert', errorResponse: response }, { context: ctx });
      assert.equal(outcome.status, expected);
      assert.equal(outcome.code, 'insert_error');
      assert.equal(insertCalls(calls).length, 1);
      assert.equal(calls.at(-1).operation, 'insert');
    });
  }
  test(`${name}: account already changed prevents all requests`, async () => {
    const { outcome, calls } = await run({}, { context: ctx, isCurrent: () => false });
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.code, 'account_changed');
    assert.equal(calls.length, 0);
  });
  for (const phase of ['insert', 'readback']) {
    test(`${name}: account changes during ${phase} => unconfirmed, no further request`, async () => {
      let current = true;
      const { outcome, calls } = await run({ onAwait: async name => {
        if (name === phase) current = false;
      } }, { context: ctx, isCurrent: () => current });
      assert.equal(outcome.status, 'unconfirmed');
      assert.equal(outcome.code, 'account_changed');
      assert.equal(outcome.rowId, 'test-row');
      assert.equal(insertCalls(calls).length, 1);
      assert.equal(calls.filter(c => c.table !== 'exercises' && c.operation === 'select').length, phase === 'insert' ? 0 : 1);
    });
  }
  test(`${name}: auth guard checked again before confirmed return`, async () => {
    let phase;
    let readbackChecks = 0;
    const { outcome } = await run({ onAwait: name => { phase = name; } }, {
      context: ctx, isCurrent: () => phase !== 'readback' || ++readbackChecks < 2,
    });
    assert.equal(outcome.status, 'unconfirmed');
    assert.equal(outcome.code, 'account_changed');
    assert.equal(readbackChecks, 2);
  });
  test(`${name}: auth change with thrown insert retains account_changed ambiguity`, async () => {
    let current = true;
    const { outcome, calls } = await run({ throwAt: 'insert', onAwait: name => {
      if (name === 'insert') current = false;
    } }, { context: ctx, isCurrent: () => current });
    assert.equal(outcome.status, 'unconfirmed');
    assert.equal(outcome.code, 'account_changed');
    assert.equal(insertCalls(calls).length, 1);
  });
}
test('core: auth change during lookup prevents insert', async () => {
  let current = true;
  const { outcome, calls } = await run({ onAwait: name => {
    if (name === 'lookup') current = false;
  } }, { isCurrent: () => current });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.code, 'account_changed');
  assert.equal(calls.length, 1);
  assert.equal(insertCalls(calls).length, 0);
});
test('core: guard before lookup prevents lookup after preflight passed', async () => {
  let checks = 0;
  const { outcome, calls } = await run({}, { isCurrent: () => ++checks < 2 });
  assert.equal(outcome.code, 'account_changed');
  assert.equal(calls.length, 0);
});
test('core: guard before insert catches change after post-lookup check', async () => {
  let phase;
  let lookupChecks = 0;
  const { outcome, calls } = await run({ onAwait: name => { phase = name; } }, {
    isCurrent: () => phase !== 'lookup' || ++lookupChecks < 2,
  });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.code, 'account_changed');
  assert.equal(insertCalls(calls).length, 0);
});
for (const isCurrent of [null, () => undefined, () => Promise.resolve(true), () => { throw new Error('PRIVATE_SERVER_TEXT'); }]) {
  test('invalid, non-synchronous or throwing auth guard fails closed without requests', async () => {
    const { outcome, calls } = await run({}, { isCurrent });
    assert.equal(outcome.code, 'account_changed');
    assert.equal(outcome.status, 'failed');
    assert.equal(calls.length, 0);
  });
}
test('core: optional scoreKind and unvalidated flag preserved and confirmed', async () => {
  const { outcome, calls } = await run({}, { payload: { ...payload, scoreKind: 'motion_proxy' } });
  assert.equal(outcome.status, 'saved');
  const feedback = insertCalls(calls)[0].row.feedback[0];
  assert.equal(feedback.scoreKind, 'motion_proxy');
  assert.equal(feedback.scoreValidated, false);
});
for (const [key, value] of [['scoreKind', 'wrong_kind'], ['scoreValidated', true], ['scoreValidated', undefined]]) {
  test(`core: score metadata mismatch ${key}=${value} is unconfirmed`, async () => {
    const { outcome } = await run({ mutateReadback: row => {
      row.feedback[0][key] = value; return row;
    } }, { payload: { ...payload, scoreKind: 'motion_proxy' } });
    assert.equal(outcome.status, 'unconfirmed');
    assert.equal(outcome.code, 'readback_mismatch');
  });
}
