/* FACE FITNESS preview improvements. Classic script, after the existing app.
 * Deliberately no automatic uploads, retries, migrations or authentication changes.
 * Geometry coach values never enter persistence. Existing numeric scores remain
 * explicitly experimental for compatibility; this is not clinical validation.
 */
(function () {
  'use strict';
  let resultAt = -Infinity;
  let coachState = null;
  let contextOwner = null;
  let saveSequence = 0;
  let authEpoch = 0;
  let workoutGeneration = 0;
  const privateTimers = new Set();
  function invalidateWorkoutTimers() {
    workoutGeneration++;
    for (const id of privateTimers) clearInterval(id);
    privateTimers.clear();
    clearInterval(exTimer);
  }
  function captureWorkoutTimers(action) {
    const factory = window.setInterval, generation = workoutGeneration;
    window.setInterval = function (callback, delay, ...args) {
      const id = factory.call(window, (...values) => {
        if (generation !== workoutGeneration) return;
        callback(...values);
      }, delay, ...args);
      privateTimers.add(id);
      return id;
    };
    try { return action(); } finally { window.setInterval = factory; }
  }
  let lastSpokenCue = '';
  const coach = globalThis.FaceMovementCoach.mount(document.getElementById('movementCoach'));
  const supported = ex => ex && ['eyeSquint', 'browRaise'].includes(ex.phase);
  const current = () => EXERCISES[exIdx];
  const setSaveMessage = (text, state) => {
    const target = document.getElementById('exerciseSaveStatus');
    if (target) { target.textContent = text; target.dataset.state = state; }
  };
  function selectCoach() {
    const ex = current();
    document.getElementById('screen-program').classList.toggle('movement-coach-active', !!supported(ex));
    coach?.select(ex);
  }
  function readHistory() {
    const hist = JSON.parse(localStorage.getItem(HIST_KEY) || '{"assess":[],"exercise":[]}');
    if (!Array.isArray(hist.assess) || !Array.isArray(hist.exercise)) throw new Error('Invalid local history');
    return hist;
  }
  function visibleRecord(record) {
    if (!record._cloudOwner) return !record._cloud;
    return !!currentUser && record._cloudOwner === currentUser.id;
  }
  function updateStoredRecord(localId, patch) {
    const hist = readHistory();
    const record = hist.exercise.find(r => r.localId === localId);
    if (!record) return false;
    Object.assign(record, patch);
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
    return true;
  }
  function refreshHistoryIfVisible() {
    if (document.getElementById('screen-history')?.classList.contains('active')) renderHistory();
  }

  const oldLoadFM = loadFM;
  window.loadFM = async function () {
    await oldLoadFM();
    // The host already uses onResults solely to retain its latest result.
    // Keep that behavior and add a monotonic freshness timestamp, no export.
    if (faceMesh) faceMesh.onResults(r => { lastFaceResults = r; resultAt = performance.now(); });
  };
  const oldFrameLoop = frameLoop;
  window.frameLoop = async function () {
    try { await oldFrameLoop(); }
    finally {
      const video = document.getElementById('video');
      coachState = coach?.update({
        time: performance.now(), resultTime: resultAt, cameraActive,
        landmarks: lastFaceResults?.multiFaceLandmarks?.[0] || null,
        aspect: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1,
        exercise: current(), phase: exState
      });
    }
  };
  const oldSelectEx = selectEx;
  window.selectEx = function (idx) {
    if (['running', 'rest', 'countdown'].includes(exState)) {
      alert('현재 운동을 완료하거나 정지한 다음 다른 운동을 선택해 주세요.');
      return;
    }
    oldSelectEx(idx);
    selectCoach();
  };
  const oldStartExercise = startExercise;
  window.startExercise = function () {
    if (!cameraActive || exState !== 'idle') return;
    const state = coach?.state();
    if (supported(current()) && (!state || state.status !== 'observing' || performance.now() - resultAt > 600)) {
      alert('얼굴을 정면에 맞추고 페이스 코치의 중립 기준을 먼저 설정해 주세요.');
      return;
    }
    lastSpokenCue = '';
    invalidateWorkoutTimers();
    captureWorkoutTimers(() => oldStartExercise());
  };
  const oldStopExercise = stopExercise;
  window.stopExercise = function () { invalidateWorkoutTimers(); oldStopExercise(); };
  const oldOnExSetDone = onExSetDone;
  window.onExSetDone = function () { return captureWorkoutTimers(() => oldOnExSetDone()); };
  const oldBeginExSet = beginExSet;
  window.beginExSet = function () {
    // Old countdown/rest callbacks can outlive Stop. Never restart a stopped set.
    if (!['countdown', 'rest', 'running'].includes(exState)) return;
    oldBeginExSet();
  };
  const oldDrawExerciseOverlay = drawExerciseOverlay;
  window.drawExerciseOverlay = function (...args) {
    if (supported(current())) return; // Do not show legacy "activation" ellipses.
    return oldDrawExerciseOverlay(...args);
  };
  const oldLiveForm = updateLiveForm;
  window.updateLiveForm = function () {
    if (!supported(current())) return oldLiveForm();
    const state = coach?.state();
    const cue = state?.status === 'observing' ? state.description?.cue : null;
    if (exState === 'running' && cue && cue !== lastSpokenCue) {
      lastSpokenCue = cue;
      speak(cue);
    }
  };
  const oldCompensators = updateCompensatorUI;
  window.updateCompensatorUI = function () {
    if (!supported(current())) return oldCompensators();
  };
  const oldRenderExList = renderExList;
  window.renderExList = function (...args) {
    oldRenderExList(...args);
    for (const row of document.querySelectorAll('#exList .ex-row')) {
      const match = /selectEx\((\d+)\)/.exec(row.getAttribute('onclick') || '');
      const ex = match && EXERCISES[Number(match[1])];
      const label = row.querySelector('.er-score');
      if (supported(ex) && label) {
        label.textContent = '완료'; label.style.color = 'var(--dim)';
        label.title = '동작 정확도는 이 숫자로 검증되지 않습니다.';
      }
    }
  };
  const oldShowExResult = showExResult;
  window.showExResult = function (ex, score) {
    if (!supported(ex)) return oldShowExResult(ex, score);
    document.getElementById('ocTitle').textContent = ex.name + ' 완료';
    document.getElementById('ocSub').textContent = ex.sets + '세트 타이머 완료';
    document.getElementById('ocRows').innerHTML = '<div class="oc-row"><span class="oc-key">세션 상태</span><span>완료</span></div><p style="font-size:.78rem;line-height:1.7;color:var(--dim)">타이머 완료가 동작의 정확성이나 근육 활성화를 증명하지는 않습니다. 페이스 코치의 상대 움직임을 참고해 주세요. 기존 점수는 임상 검증되지 않은 실험값이며 여기서는 정확도 점수로 표시하지 않습니다. 저장 상태는 운동 화면의 별도 메시지에서 확인하세요.</p>';
    document.getElementById('ocNext').style.display = seqMode ? '' : 'none';
    document.getElementById('resultOverlay').classList.add('visible');
  };

  // Replace unconditional global warnings with exercise-specific observations.
  // Original timer emits those warnings through speak(). Filter only the two
  // legacy generic claims while upper-face movement coaching is selected.
  const oldSpeak = speak;
  window.speak = function (text) {
    if (supported(current()) && ['미간에 힘 빼세요', '이마 힘 빼세요', '목 힘 빼세요'].includes(text)) return;
    return oldSpeak(text);
  };

  window.bootstrapPersonalContext = async function () {
    if (!supabaseClient || !currentUser) throw new Error('Authentication required');
    const owner = currentUser.id;
    if (_personId && _orgId && contextOwner === owner) return { personId: _personId, orgId: _orgId };
    _personId = null; _orgId = null; contextOwner = null;
    const reply = await supabaseClient.rpc('bootstrap_consumer_app_user', {
      p_first_name: (currentUser.email || '').split('@')[0] || null,
      p_email: currentUser.email || null, p_app_source: 'face_fitness'
    });
    if (reply.error || !reply.data?.person_id || currentUser?.id !== owner) throw new Error('Context could not be verified');
    _personId = reply.data.person_id; _orgId = reply.data.org_id || null; contextOwner = owner;
    return { personId: _personId, orgId: _orgId };
  };
  window.cloudSaveExercise = async function (payload) {
    if (!supabaseClient || !currentUser) return { status: 'local_only', code: 'no_user' };
    const user = { id: currentUser.id };
    const epoch = authEpoch;
    let context;
    try { context = await bootstrapPersonalContext(); }
    catch (_) { return { status: 'failed', code: 'context_unconfirmed' }; }
    if (currentUser?.id !== user.id || authEpoch !== epoch) return { status: 'failed', code: 'account_changed' };
    // No guessed schema, nullable mapping opt-in, retry or cross-table fallback.
    return globalThis.FaceExerciseCloud.save({ client: supabaseClient, user, context, payload, isCurrent: () => currentUser?.id === user.id && authEpoch === epoch });
  };
  window.saveExToHistory = function (score) {
    const ex = current();
    const localId = globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
    const userId = currentUser?.id || null;
    const sequence = ++saveSequence;
    const payload = {
      localId, date: new Date().toISOString(), exId: ex.id, exName: ex.name,
      exZone: ex.zone, exType: ex.type || 'strength', score,
      completedSets: exSetNum, targetSets: ex.sets, completedReps: 0, targetReps: 0,
      scoreKind: 'legacy_experimental', _cloud: false,
      _cloudOwner: userId, _cloudStatus: userId ? 'pending' : 'local_only'
    };
    try {
      const hist = readHistory();
      hist.exercise.push(payload);
      // Preserve existing records across sort orders and account scopes.
      // Quota failure is explicit; no silent mixed-account eviction.
      localStorage.setItem(HIST_KEY, JSON.stringify(hist));
    } catch (_) {
      setSaveMessage('운동은 완료됐지만 기기 저장에 실패했습니다. 서버 저장도 시도하지 않았습니다.', 'failed');
      return Promise.resolve({ status: 'failed', code: 'local_storage_failed' });
    }
    if (!userId) {
      setSaveMessage('기기에 저장됨 · 비로그인 상태라 서버 저장은 시도하지 않았습니다.', 'local_only');
      refreshHistoryIfVisible();
      return Promise.resolve({ status: 'local_only', code: 'no_user' });
    }
    setSaveMessage('기기에 저장됨 · 서버 저장과 별도 재조회를 확인 중입니다.', 'pending');
    let timeout;
    const bounded = Promise.race([
      cloudSaveExercise(payload),
      new Promise(resolve => { timeout = setTimeout(() => resolve({ status: 'unconfirmed', code: 'timeout' }), 15000); })
    ]);
    return bounded.then(result => {
      clearTimeout(timeout);
      let localUpdated = false;
      try {
        localUpdated = updateStoredRecord(localId, {
          _cloudStatus: result.status, _cloud: result.status === 'saved',
          _serverId: result.rowId ?? null, _cloudTable: result.table ?? null
        });
      } catch (_) { /* Server confirmation must not assert a failed local update. */ }
      if (sequence === saveSequence && currentUser?.id === userId) {
        const suffix = localUpdated ? '' : ' 단, 기기 내 상태 갱신은 확인되지 않았습니다.';
        const message = result.status === 'saved' ? '서버 저장과 동일 기록 재조회까지 확인했습니다.' : result.status === 'failed' ? '기기에는 저장됐지만 서버 저장이 완료되지 않았습니다.' : '기기에는 저장됐지만 서버 저장 여부는 미확인입니다. 중복 전송하지 말고 서버 기록을 먼저 확인해 주세요.';
        setSaveMessage(message + suffix, result.status);
      }
      refreshHistoryIfVisible();
      return result;
    }).catch(() => {
      clearTimeout(timeout);
      if (sequence === saveSequence && currentUser?.id === userId) setSaveMessage('기기에 저장됨 · 서버 저장 여부는 미확인입니다. 자동 재전송하지 않습니다.', 'unconfirmed');
      return { status: 'unconfirmed', code: 'unexpected_save_error' };
    });
  };

  window.syncCloudHistory = async function () {
    if (!supabaseClient || !currentUser) return;
    const owner = currentUser.id;
    const badge = document.getElementById('cloudBadge');
    if (badge) { badge.textContent = '서버 기록 확인 중'; badge.className = 'cloud-badge syncing'; }
    try {
      const { personId } = await bootstrapPersonalContext();
      if (!personId || currentUser?.id !== owner) throw new Error('Context changed');
      const [ar, er] = await Promise.all([
        supabaseClient.from('facial_assessment_sessions').select('id,assessed_at,zone_upper,zone_mid,zone_lower,zone_neck,symmetry_score,ear_left,ear_right,synkinesis_eye_brow,synkinesis_smile_platysma,synkinesis_brow_corrugator,measurement_features').eq('person_id',personId).eq('source','face_fitness_app').order('assessed_at',{ascending:false}).limit(30),
        supabaseClient.from('mobile_exercise_sessions').select('id,completed_at,exercise_id,pose_accuracy,feedback').eq('subject_person_id',personId).eq('source_app','face_fitness').order('completed_at',{ascending:false}).limit(100)
      ]);
      if (ar.error || er.error) throw new Error('Server read failed');
      const unknownIds = [...new Set((er.data || []).filter(r => !r.feedback?.[0]?.exId && r.exercise_id).map(r => r.exercise_id))];
      const exerciseMap = new Map();
      if (unknownIds.length) {
        const lookup = await supabaseClient.from('exercises').select('id,exercise_code').in('id',unknownIds);
        if (lookup.error) throw new Error('Exercise identity read failed');
        for (const row of lookup.data || []) exerciseMap.set(row.id,row.exercise_code);
      }
      const cloudAssess = (ar.data || []).map(r => ({
        date:r.assessed_at, zones:{upper:r.zone_upper,mid:r.zone_mid,lower:r.zone_lower,neck:r.zone_neck},
        avgScore:Math.round([r.zone_upper||0,r.zone_mid||0,r.zone_lower||0,r.zone_neck||0].reduce((a,b)=>a+b,0)/4),
        symScore:r.symmetry_score,earL:r.ear_left,earR:r.ear_right,corrFiring:!!r.synkinesis_brow_corrugator,platFiring:!!r.synkinesis_smile_platysma,
        measurement_features:r.measurement_features,_cloud:true,_serverId:r.id,_cloudTable:'facial_assessment_sessions',_cloudOwner:owner
      }));
      const cloudEx = (er.data || []).map(r => {
        const fb=Array.isArray(r.feedback)&&r.feedback[0]?r.feedback[0]:{};
        const code=exerciseMap.get(r.exercise_id);
        const exId=fb.exId || (code?.startsWith('face_')?code.slice(5):null);
        const known=EXERCISES.find(ex=>ex.id===exId);
        return {date:fb.date||r.completed_at,exId:exId||'unknown:'+r.id,exName:fb.exName||known?.name||'운동 종류 확인 필요',exZone:fb.zone||known?.zone||null,exType:fb.type||known?.type||null,score:Number.isFinite(r.pose_accuracy)?Math.round(r.pose_accuracy*100):null,scoreKind:fb.scoreKind||'legacy_experimental',_cloud:true,_cloudStatus:'saved',_serverId:r.id,_cloudTable:'mobile_exercise_sessions',_cloudOwner:owner};
      });
      if (currentUser?.id !== owner) throw new Error('Account changed');
      const hist=readHistory();
      function merge(local, remote) {
        for(const row of remote) {
          const match=local.find(item=>(item._serverId===row._serverId&&item._cloudTable===row._cloudTable&&item._cloudOwner===owner)||(!item._serverId&&(!item._cloudOwner||item._cloudOwner===owner)&&item.date===row.date&&item.exId===row.exId));
          if(match) Object.assign(match,row); else local.push(row);
        }
        local.sort((a,b)=>new Date(b.date)-new Date(a.date));
      }
      merge(hist.assess,cloudAssess);merge(hist.exercise,cloudEx);
      // Do not remove another account's local records during a download.
      localStorage.setItem(HIST_KEY,JSON.stringify(hist));
      if(badge){badge.textContent='서버 기록 조회 확인';badge.className='cloud-badge synced';}
      refreshHistoryIfVisible();
    } catch (_) {
      if(currentUser?.id===owner&&badge){badge.textContent='서버 기록 확인 실패';badge.className='cloud-badge local';}
    }
  };
  const oldAuthUI = _updateAuthUI;
  let lastAuthOwner = null;
  window._updateAuthUI = function () {
    const owner = currentUser?.id || null;
    if(owner!==lastAuthOwner){
      _personId=null;_orgId=null;contextOwner=null;saveSequence++;authEpoch++;lastAuthOwner=owner;
      if (['running','rest','countdown'].includes(exState)) stopExercise();
      coach?.clear();
      setSaveMessage(owner ? '계정이 바뀌었습니다. 현재 계정의 서버 저장은 별도 확인이 필요합니다.' : '로그아웃됨 · 기기 기록과 서버 기록을 구분해 확인하세요.','idle');
    }
    oldAuthUI();
    const badge=document.getElementById('cloudBadge');
    if(badge&&owner){badge.textContent='로그인됨 · 저장 확인은 별도';badge.className='cloud-badge local';}
    refreshHistoryIfVisible();
  };

  globalThis.FaceHistoryView = Object.freeze({
    read() {
      try { const hist = readHistory(); return { assess: hist.assess.filter(visibleRecord), exercise: hist.exercise.filter(visibleRecord) }; }
      catch (_) { return { assess: [], exercise: [] }; }
    }
  });
  const oldRenderHistory = renderHistory;
  window.renderHistory = function () {
    oldRenderHistory();
    const target=document.getElementById('histFFI');
    if(!target)return;
    let records;
    try{records=readHistory().exercise.filter(visibleRecord);}catch(_){target.textContent='기기 기록을 읽지 못했습니다.';return;}
    target.replaceChildren();
    if(!records.length){target.textContent='현재 계정에서 확인할 운동 기록 없음';return;}
    const groups=new Map();
    for(const row of records){const key=row.exId||row.localId||row._serverId||row.date;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    for(const rows of groups.values()){
      rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
      const line=document.createElement('div');line.className='hist-row';line.style.cssText='display:block;padding:12px 0';
      const name=document.createElement('div');name.style.fontWeight='600';name.textContent=rows[0].exName||'운동 종류 확인 필요';
      const meta=document.createElement('div');meta.style.cssText='font-size:.7rem;color:var(--dim);margin-top:4px';
      const verified=rows.filter(r=>r._cloud&&r._serverId&&r._cloudOwner===currentUser?.id).length;
      meta.textContent=rows.length+'회 기록 · 기기에서 조회 · 서버 확인 '+verified+'건';
      const details=document.createElement('details');details.style.cssText='font-size:.67rem;color:var(--dim);margin-top:5px';
      const summary=document.createElement('summary');summary.textContent='기존 실험값 보기 · 동작 정확도 아님';
      const score=document.createElement('div');score.textContent=Number.isFinite(rows[0].score)?'최근 기존 연산값: '+rows[0].score+' (임상 검증되지 않음)':'확인 가능한 기존 연산값 없음';
      details.append(summary,score);line.append(name,meta,details);target.append(line);
    }
  };
  selectCoach();
  setSaveMessage('운동 기록은 기기에 먼저 저장됩니다. 로그인만으로 서버 저장이 확인되지는 않습니다.','idle');
})();
