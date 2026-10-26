/* FACE FITNESS exercise persistence. Browser script, no imports or side effects.
 * The caller supplies its already-authenticated, already-schema-configured client
 * and resolved context. This module does not bootstrap, authenticate, store local
 * data, retry, switch accounts, or fall back after a core-path failure.
 *
 * Schema caveats: PR2 comments name physio_app, but its client does not explicitly
 * select that schema. Configure the client outside this module after verification.
 * Null exercise_id is NOT assumed safe. Only set context.allowUnmappedExercise
 * to true after checking the actual schema permits it. Metadata is kept either way.
 *
 * A local_only result does NOT assert a local write happened. The caller owns that.
 * saved means insert acknowledgement AND a separate scoped row SELECT matched.
 * unconfirmed means a write may have happened: NEVER blindly resubmit it.
 * code/stage are fixed diagnostics; message is generic and contains no server text.
 * owner contains IDs for internal correlation only, not for user-visible messaging.
 * Optional isCurrent() is a synchronous auth-epoch/user guard. It defaults to true
 * for compatibility; false, a thrown error, or a non-boolean true fails closed.
 * It detects observed account changes, but does NOT freeze a shared auth client.
 * Correct server RLS remains mandatory.
 */
(function installFaceExerciseCloud(root) {
  'use strict';

  const CORE = 'mobile_exercise_sessions';
  const LEGACY = 'ff_exercise_sessions';
  const MESSAGES = Object.freeze({
    saved: 'Cloud save confirmed.',
    failed: 'Cloud save could not be completed.',
    unconfirmed: 'Cloud save could not be confirmed. Do not submit it again yet.',
    local_only: 'Cloud save was not attempted.',
  });
  const isText = value => typeof value === 'string' && value.trim().length > 0;
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  // PR2 does not establish whether database IDs are UUIDs or integers.
  const isId = value => isText(value) || validCount(value);
  function timestamp(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!match) return null;
    const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
    const leap = +year % 4 === 0 && (+year % 100 !== 0 || +year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (+month < 1 || +month > 12 || +day < 1 || +day > days[+month - 1] ||
        +hour > 23 || +minute > 59 || +second > 59 ||
        (offsetHour !== undefined && (+offsetHour > 23 || +offsetMinute > 59))) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  const sameTime = (left, right) => timestamp(left) !== null && timestamp(left) === timestamp(right);
  const sameScore = (left, right) => typeof left === 'number' &&
    Number.isFinite(left) && Math.abs(left - right) <= 1e-7;

  // Conservative allowlist of known database rejections. Unrecognized codes are
  // ambiguous, not permission to retry. Connection/timeout/5xx always win below.
  const DB_REJECTIONS = new Set([
    '0A000', '21000', '22001', '22003', '22007', '22008', '22023', '22P02',
    '23502', '23503', '23505', '23514', '28000', '28P01', '3D000', '3F000',
    '40001', '40P01', '42501', '42601', '42703', '42804', '42883', '42P01',
    'P0001',
    'PGRST100', 'PGRST101', 'PGRST102', 'PGRST103', 'PGRST105', 'PGRST106',
    'PGRST107', 'PGRST108', 'PGRST109', 'PGRST110', 'PGRST111', 'PGRST112',
    'PGRST114', 'PGRST115', 'PGRST116', 'PGRST117', 'PGRST118', 'PGRST119',
    'PGRST120', 'PGRST121', 'PGRST122', 'PGRST123', 'PGRST124', 'PGRST125',
    'PGRST126', 'PGRST127', 'PGRST128', 'PGRST200', 'PGRST201', 'PGRST202',
    'PGRST203', 'PGRST204', 'PGRST205', 'PGRST300', 'PGRST301', 'PGRST302',
    'PGRST303',
  ]);
  function definiteInsertRejection(response) {
    const status = response.status ?? response.error?.status;
    const code = response.error?.code;
    const transport = /^(?:FETCH_ERROR|NETWORK_ERROR|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ABORT_ERR|UND_ERR_[A-Z_]+)$/.test(code || '') ||
      ['AbortError', 'TimeoutError', 'TypeError'].includes(response.error?.name);
    if (status === 0 || status === 408 || (typeof status === 'number' && status >= 500) ||
        transport || /^(?:08|PGRST0)/.test(code || '') || code === '40003') return false;
    if (Number.isInteger(status) && status >= 400 && status < 500) return true;
    return DB_REJECTIONS.has(code);
  }

  async function save(options = {}) {
    const { client, user, context, payload, isCurrent } = options || {};
    const stillCurrent = () => {
      try {
        return isCurrent === undefined || (typeof isCurrent === 'function' && isCurrent() === true);
      } catch (_) { return false; }
    };
    let table = null;
    let owner = null;
    let rowId = null;
    let stage = 'preflight';
    let insertStarted = false;
    const result = (status, code) => ({
      status, code, stage, rowId, table, owner,
      message: MESSAGES[status],
    });
    const accountChanged = () => result(insertStarted ? 'unconfirmed' : 'failed', 'account_changed');

    if (!user || !isText(user.id)) return result('local_only', 'no_user');
    if (!client || typeof client.from !== 'function') {
      return result('local_only', 'no_client');
    }
    // An invalid non-null person ID must not silently route to legacy storage.
    if (context?.personId != null && !isId(context.personId)) {
      return result('failed', 'invalid_context');
    }
    const personId = context?.personId ?? null;
    const isCore = personId !== null;
    table = isCore ? CORE : LEGACY;
    owner = { userId: user.id, personId };
    if (!stillCurrent()) return accountChanged();
    if (!payload || !isText(payload.exId) || !isText(payload.exName) ||
        !isText(payload.exZone) || !isText(payload.exType) ||
        typeof payload.score !== 'number' || !Number.isFinite(payload.score) ||
        payload.score < 0 || payload.score > 100 ||
        // Reject impossible calendar dates and timestamps without a timezone.
        timestamp(payload.date) === null) {
      return result('failed', 'invalid_payload');
    }
    const date = timestamp(payload.date);
    const completedReps = payload.completedReps ?? 0;
    const targetReps = payload.targetReps ?? 0;
    if (isCore && (!validCount(payload.completedSets) ||
        !validCount(payload.targetSets) || payload.targetSets < 1 ||
        !validCount(completedReps) || !validCount(targetReps))) {
      return result('failed', 'invalid_counts');
    }

    try {
      let row;
      let fields;
      let exerciseId = null;
      if (isCore) {
        stage = 'lookup';
        if (!stillCurrent()) return accountChanged();
        const lookup = await client.from('exercises').select('id')
          .eq('exercise_code', 'face_' + payload.exId).maybeSingle();
        if (!stillCurrent()) return accountChanged();
        if (!lookup || lookup.error) return result('failed', 'lookup_error');
        if (lookup.data != null && !isId(lookup.data.id)) {
          return result('failed', 'invalid_mapping');
        }
        exerciseId = lookup.data?.id ?? null;
        if (exerciseId === null && context?.allowUnmappedExercise !== true) {
          return result('failed', 'mapping_missing');
        }
        row = {
          subject_person_id: personId,
          exercise_id: exerciseId,
          source_app: 'face_fitness',
          pose_accuracy: payload.score / 100,
          best_accuracy: payload.score / 100,
          completed_sets: payload.completedSets,
          target_sets: payload.targetSets,
          completed_reps: completedReps,
          target_reps: targetReps,
          status: 'completed',
          completed_at: date,
          feedback: [{
            exId: payload.exId, exName: payload.exName, date,
            zone: payload.exZone, type: payload.exType, score: payload.score,
            ...(payload.scoreKind ? { scoreKind: payload.scoreKind, scoreValidated: false } : {}),
          }],
        };
        fields = 'id,subject_person_id,exercise_id,source_app,pose_accuracy,best_accuracy,completed_sets,target_sets,completed_reps,target_reps,status,completed_at,feedback';
      } else {
        // Only columns already used by PR2 save/sync. No sets columns are known
        // for legacy; they cannot be persisted here without schema evidence.
        row = {
          user_id: user.id,
          ex_id: payload.exId, ex_name: payload.exName,
          ex_zone: payload.exZone, ex_type: payload.exType,
          score: payload.score, created_at: date,
        };
        fields = 'id,user_id,ex_id,ex_name,ex_zone,ex_type,score,created_at';
      }

      stage = 'insert';
      if (!stillCurrent()) return accountChanged();
      insertStarted = true;
      // A returned ID alone is not proof of readback. No fallback or retry here.
      const inserted = await client.from(table).insert(row).select('id').maybeSingle();
      // Retain a successful acknowledgement ID for later manual reconciliation.
      if (inserted && !inserted.error && isId(inserted.data?.id)) rowId = inserted.data.id;
      if (!stillCurrent()) return accountChanged();
      if (!inserted) return result('unconfirmed', 'insert_response_missing');
      if (inserted.error) {
        return result(definiteInsertRejection(inserted) ? 'failed' : 'unconfirmed', 'insert_error');
      }
      if (rowId === null) return result('unconfirmed', 'insert_id_missing');

      stage = 'readback';
      if (!stillCurrent()) return accountChanged();
      let query = client.from(table).select(fields).eq('id', rowId);
      query = isCore
        ? query.eq('subject_person_id', personId).eq('source_app', 'face_fitness')
        : query.eq('user_id', user.id);
      // This is a new SELECT request under the supplied user's client, not the
      // insert's returned representation. Server RLS must still be configured.
      const readback = await query.maybeSingle();
      if (!stillCurrent()) return accountChanged();
      if (!readback || readback.error) return result('unconfirmed', 'readback_error');
      const actual = readback.data;
      if (!actual) return result('unconfirmed', 'readback_missing');
      let matches = actual.id === rowId;
      if (isCore) {
        const feedback = Array.isArray(actual.feedback) ? actual.feedback[0] : null;
        matches = matches && actual.subject_person_id === personId &&
          actual.source_app === 'face_fitness' && actual.exercise_id === exerciseId &&
          sameScore(actual.pose_accuracy, row.pose_accuracy) &&
          sameScore(actual.best_accuracy, row.best_accuracy) &&
          actual.completed_sets === row.completed_sets &&
          actual.target_sets === row.target_sets &&
          actual.completed_reps === row.completed_reps &&
          actual.target_reps === row.target_reps && actual.status === 'completed' &&
          sameTime(actual.completed_at, date) && !!feedback &&
          feedback.exId === payload.exId && feedback.exName === payload.exName &&
          feedback.zone === payload.exZone && feedback.type === payload.exType &&
          sameScore(feedback.score, payload.score) && sameTime(feedback.date, date) &&
          (!payload.scoreKind || (feedback.scoreKind === payload.scoreKind && feedback.scoreValidated === false));
      } else {
        matches = matches && actual.user_id === user.id &&
          actual.ex_id === payload.exId && actual.ex_name === payload.exName &&
          actual.ex_zone === payload.exZone && actual.ex_type === payload.exType &&
          sameScore(actual.score, payload.score) && sameTime(actual.created_at, date);
      }
      if (!matches) return result('unconfirmed', 'readback_mismatch');
      if (!stillCurrent()) return accountChanged();
      stage = 'confirmed';
      return result('saved', 'confirmed');
    } catch (_) {
      // Never return/log exception objects, server messages, credentials or tokens.
      if (!stillCurrent()) return accountChanged();
      return result(insertStarted ? 'unconfirmed' : 'failed', 'transport_or_client_error');
    }
  }

  root.FaceExerciseCloud = Object.freeze({ save });
})(globalThis);
