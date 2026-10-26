/* Face movement coach: local, relative geometry, not EMG or clinical scoring.
 * No images/landmarks are persisted, logged or transmitted by this module.
 * Thresholds are engineering noise/pose guards, NOT validated clinical bounds.
 */
(function (global) {
  'use strict';
  const KEYS = ['browL', 'browR', 'lowerL', 'lowerR', 'upperL', 'upperR', 'gapL', 'gapR', 'glabella'];
  const REQUIRED = [10, 33, 133, 263, 362, 66, 105, 296, 334, 144, 153, 160, 158, 373, 380, 387, 385, 107, 336];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const average = (...points) => ({ x: points.reduce((a, p) => a + p.x, 0) / points.length, y: points.reduce((a, p) => a + p.y, 0) / points.length });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function geometry(landmarks, aspect = 1) {
    if (!landmarks || REQUIRED.some(i => !landmarks[i] || !Number.isFinite(landmarks[i].x) || !Number.isFinite(landmarks[i].y))) return null;
    if (!Number.isFinite(aspect) || aspect < 0.2 || aspect > 5) return null;
    const lm = {};
    for (const i of REQUIRED) lm[i] = { x: landmarks[i].x * aspect, y: landmarks[i].y };
    const eyeL = average(lm[33], lm[133]);
    const eyeR = average(lm[263], lm[362]);
    const scale = distance(eyeL, eyeR);
    if (scale < 0.025) return null;
    const ux = (eyeR.x - eyeL.x) / scale, uy = (eyeR.y - eyeL.y) / scale;
    // Head-local vertical axis removes 2-D image translation, roll and size.
    // This is not full 3-D pose compensation and does not isolate muscle force.
    const vertical = (point, origin) => ((point.x - origin.x) * -uy + (point.y - origin.y) * ux) / scale;
    const lowerL = vertical(average(lm[144], lm[153]), eyeL);
    const lowerR = vertical(average(lm[373], lm[380]), eyeR);
    const upperL = vertical(average(lm[160], lm[158]), eyeL);
    const upperR = vertical(average(lm[387], lm[385]), eyeR);
    const widthL = distance(lm[33], lm[133]), widthR = distance(lm[263], lm[362]);
    return {
      browL: -vertical(average(lm[66], lm[105]), eyeL),
      browR: -vertical(average(lm[296], lm[334]), eyeR),
      lowerL, lowerR, upperL, upperR,
      gapL: lowerL - upperL, gapR: lowerR - upperR,
      glabella: distance(lm[107], lm[336]) / scale,
      scale, roll: Math.atan2(uy, ux) * 180 / Math.PI,
      asymmetry: Math.max(widthL, widthR) / Math.max(0.0001, Math.min(widthL, widthR)),
      cropped: REQUIRED.some(i => landmarks[i].x < 0.015 || landmarks[i].x > 0.985 || landmarks[i].y < 0.015 || landmarks[i].y > 0.985)
    };
  }

  function poseUsable(g, baseline) {
    if (!g) return false;
    if (Math.abs(g.roll) > 20 || g.asymmetry > 1.85 || g.cropped) return false;
    return !baseline || (g.scale / baseline.scale >= 0.75 && g.scale / baseline.scale <= 1.3);
  }

  function baselineOf(samples) {
    const result = { noise: {} };
    for (const key of [...KEYS, 'scale']) {
      const mean = samples.reduce((sum, s) => sum + s[key], 0) / samples.length;
      result[key] = mean;
      const variance = samples.reduce((sum, s) => sum + (s[key] - mean) ** 2, 0) / samples.length;
      result.noise[key] = Math.max(0.006, Math.sqrt(variance) * 3);
    }
    return result;
  }

  function changes(g, baseline) {
    return {
      browL: g.browL - baseline.browL, browR: g.browR - baseline.browR,
      lowerL: baseline.lowerL - g.lowerL, lowerR: baseline.lowerR - g.lowerR,
      upperL: g.upperL - baseline.upperL, upperR: g.upperR - baseline.upperR,
      gapL: g.gapL - baseline.gapL, gapR: g.gapR - baseline.gapR,
      glabella: baseline.glabella - g.glabella
    };
  }

  function describe(exercise, delta, noise) {
    const ex = exercise || {};
    const eye = ex.phase === 'eyeSquint';
    const brow = ex.phase === 'browRaise';
    if (!eye && !brow) return { supported: false, target: '눈·눈썹 운동을 선택하세요', companion: '현재 코치는 눈 주변과 이마 운동을 지원합니다', cue: '근육 활성화가 아닌 상대 위치 변화를 보여줍니다.' };
    const eyebrowMoves = delta.browL > noise.browL || delta.browR > noise.browR;
    const eyebrowDown = delta.browL < -noise.browL || delta.browR < -noise.browR;
    const upperMoves = delta.upperL > noise.upperL || delta.upperR > noise.upperR;
    const lowerMoves = delta.lowerL > noise.lowerL || delta.lowerR > noise.lowerR;
    const narrow = delta.glabella > noise.glabella;
    if (eye) return {
      supported: true, target: lowerMoves ? '아래 눈꺼풀 위치 변화가 보여요' : '아래 눈꺼풀 움직임을 살펴보세요',
      companion: eyebrowMoves ? '눈썹도 함께 올라가는 움직임' : eyebrowDown ? '눈썹도 함께 내려가는 움직임' : upperMoves ? '윗눈꺼풀도 함께 내려가는 움직임' : '눈썹은 중립 기준선 부근',
      cue: (eyebrowMoves || eyebrowDown) ? '힘을 조금 줄이고 눈썹을 기준선 가까이 유지해 보세요.' : upperMoves ? '눈을 꽉 감기보다 아래 눈꺼풀 쪽 움직임을 작게 시도해 보세요.' : '서두르지 말고 부드럽게 반복하며 선의 변화를 살펴보세요.'
    };
    const resistance = ex.id === 'brow_press';
    return {
      supported: true,
      target: resistance ? '눈썹을 올리는 방향으로 가볍게 저항' : '눈썹 높이 변화를 살펴보세요',
      companion: narrow ? '미간 사이가 좁아지는 움직임' : '전두근은 이 운동의 목표입니다',
      cue: narrow ? '미간을 모으는지 살펴보고 강도를 줄여 보세요.' : resistance ? '이동이 작아도 힘이 약하다고 판정하지 않습니다. 저항감은 직접 확인하세요.' : '눈썹을 무리 없이 움직이며 좌우 기준선을 비교해 보세요.'
    };
  }

  function createTracker() {
    let baseline = null, calibration = null, lastAt = -Infinity, lastState = null;
    function update(input) {
      const now = input.time;
      if (calibration && now - lastAt > 350) calibration = { started: null, samples: [], lastResultTime: -Infinity };
      lastAt = now;
      const g = input.cameraActive && now - input.resultTime <= 600 ? geometry(input.landmarks, input.aspect ?? 1) : null;
      const status = !input.cameraActive ? 'camera_off' : !g ? 'tracking_lost' : !poseUsable(g, calibration ? null : baseline) ? 'pose_check' : null;
      if (status) {
        if (calibration) calibration = { started: null, samples: [] };
        return (lastState = { status, delta: null, baselineReady: !!baseline });
      }
      if (calibration) {
        if (input.resultTime - calibration.lastResultTime > 350) calibration = { started: null, samples: [], lastResultTime: -Infinity };
        if (calibration.started === null) calibration.started = now;
        if (input.resultTime !== calibration.lastResultTime) { calibration.samples.push(g); calibration.lastResultTime = input.resultTime; }
        const elapsed = now - calibration.started;
        if (elapsed >= 1500 && calibration.samples.length >= 12) {
          const candidate = baselineOf(calibration.samples);
          // Large facial movement during neutral capture invalidates the sample.
          if (KEYS.some(key => candidate.noise[key] > 0.035)) {
            calibration = { started: null, samples: [] };
            return (lastState = { status: 'calibration_retry', delta: null, baselineReady: !!baseline });
          }
          baseline = candidate;
          calibration = null;
        } else return (lastState = { status: 'calibrating', progress: Math.min(99, Math.round(elapsed / 15)), delta: null, baselineReady: !!baseline });
      }
      if (!baseline) return (lastState = { status: 'needs_baseline', delta: null, baselineReady: false });
      const delta = changes(g, baseline);
      return (lastState = { status: 'observing', delta, baselineReady: true, noise: baseline.noise, description: describe(input.exercise, delta, baseline.noise) });
    }
    return {
      update,
      calibrate() { calibration = { started: null, samples: [] }; },
      clear() { baseline = null; calibration = null; lastState = null; },
      stale(now) {
        if (now - lastAt <= 600) return null;
        if (calibration) calibration = { started: null, samples: [] };
        return (lastState = { status: 'tracking_lost', delta: null, baselineReady: !!baseline });
      },
      state() { return lastState; }
    };
  }

  function movementLabels(exercise, delta) {
    const signed = value => (value >= 0 ? '+' : '') + (value * 100).toFixed(1) + '%';
    if (exercise?.phase === 'browRaise') return {
      target: '눈썹 높이 변화 · 화면 왼쪽 ' + signed(delta.browR) + ' / 오른쪽 ' + signed(delta.browL),
      companion: '미간 간격 변화 · 중립 대비 ' + signed(-delta.glabella)
    };
    return {
      target: '아래 눈꺼풀 변위 · 화면 왼쪽 ' + signed(delta.lowerR) + ' / 오른쪽 ' + signed(delta.lowerL),
      companion: '눈썹 높이 변화 · 화면 왼쪽 ' + signed(delta.browR) + ' / 오른쪽 ' + signed(delta.browL)
    };
  }

  function demoExample(exercise, index) {
    const neutral = { browL:0,browR:0,lowerL:0,lowerR:0,upperL:0,upperR:0,glabella:0 };
    if (index === 2) return {label:'얼굴 놓침',lost:true};
    if (exercise?.phase === 'browRaise') {
      if (index === 0) return {label:exercise.id === 'brow_press'?'저항 중 위치 유지':'눈썹 위치 변화',delta:{...neutral,browL:exercise.id === 'brow_press'?0:.035,browR:exercise.id === 'brow_press'?0:.035}};
      return {label:'미간 동반 움직임',delta:{...neutral,browL:.02,browR:.02,glabella:.05}};
    }
    return index === 0 ? {label:'아래 눈꺼풀 움직임',delta:{...neutral,lowerL:.035,lowerR:.035}} : {label:'눈썹 동반 움직임',delta:{...neutral,browL:.065,browR:.055,lowerL:.035,lowerR:.035}};
  }

  const STYLE = `
.mc-card{--mc-blue:var(--accent2,#818cf8);--mc-mint:var(--accent3,#34d399);--mc-amber:var(--accent4,#fbbf24);padding:16px!important}
.mc-heading{display:flex;justify-content:space-between;gap:12px;align-items:start}.mc-heading h3{font-size:1rem;margin:0;letter-spacing:-.025em}.mc-heading p{font-size:.7rem;color:var(--dim);margin:4px 0 0}.mc-state{font-size:.65rem;color:var(--mc-blue);text-align:right;max-width:150px}
.mc-layout{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:12px}.mc-portrait{background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:6px}.mc-portrait svg{width:100%;height:230px;display:block}.mc-caption{font-size:.6rem;color:var(--dim);padding:0 8px 8px;line-height:1.6}.mc-copy{display:flex;flex-direction:column;gap:10px}.mc-item{border-bottom:1px solid var(--border);padding-bottom:9px}.mc-label{font-size:.62rem;color:var(--dim);margin-bottom:3px}.mc-value{font-size:.78rem;line-height:1.5}.mc-number{font:600 .7rem system-ui;color:var(--mc-blue);font-variant-numeric:tabular-nums;margin-top:4px}.mc-cue{border-left:2px solid var(--mc-blue);padding-left:9px;font-size:.74rem;min-height:3em}.mc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px}.mc-actions button{font-size:.69rem}.mc-note{font-size:.62rem;color:var(--dim);line-height:1.7;margin-top:10px}.mc-baseline{stroke:var(--dim);stroke-dasharray:3 4;opacity:.65}.mc-brow{stroke:var(--mc-amber)}.mc-lid{stroke:var(--mc-mint)}.mc-move{transition:transform .12s linear,opacity .15s}.mc-quiet{opacity:.3}.mc-live{color:var(--mc-mint)}.mc-demo{border:1px dashed var(--mc-amber);border-radius:6px;color:var(--mc-amber);padding:5px 8px;font-size:.65rem;margin-top:10px}.mc-demo[hidden]{display:none!important}.mc-help{padding:7px 0;color:var(--dim);font-size:.65rem}.mc-help summary{cursor:pointer}.mc-help div{padding-top:6px}
@media(prefers-reduced-motion:reduce){.mc-move{transition:none}}
`;

  function mount(root) {
    if (!root) return null;
    const tracker = createTracker();
    root.classList.add('mc-card');
    const suffix = 'mc-' + Math.random().toString(36).slice(2, 8);
    root.innerHTML = `<style>${STYLE}</style>
<div class="mc-heading"><div><h3>페이스 코치</h3><p>점수보다, 어디가 함께 움직였는지</p></div><div class="mc-state" data-mc="status" role="status" aria-live="polite">카메라 준비</div></div>
<div class="mc-demo" data-mc="demoNotice" hidden>도식 체험 · 실제 측정이나 저장이 아닙니다</div>
<div class="mc-layout"><div class="mc-portrait"><svg viewBox="0 0 300 260" role="img" aria-label="중립 기준선과 눈썹·눈꺼풀 상대 움직임을 보여주는 얼굴 코치">
<defs><clipPath id="${suffix}-eyes"><path data-mc="eyeClipL" d="M80 119 Q104 102 127 119 Q104 139 80 119Z"/><path data-mc="eyeClipR" d="M173 119 Q196 102 220 119 Q196 139 173 119Z"/></clipPath></defs>
<g data-mc="character" class="mc-move mc-quiet">
<path d="M65 109 C45 99 40 137 61 145 M235 109 C255 99 260 137 239 145" fill="var(--panel2)" stroke="var(--border)" stroke-width="2"/>
<path d="M150 17 C85 17 55 57 61 130 C65 199 105 238 150 243 C195 238 235 199 239 130 C245 57 215 17 150 17Z" fill="var(--panel2)" stroke="var(--border)" stroke-width="2"/>
<path d="M75 75 Q82 35 118 31 Q151 12 187 32 Q218 38 227 74" fill="none" stroke="var(--mc-blue)" stroke-width="3" opacity=".55" stroke-linecap="round"/>
<path data-mc="forehead" d="M103 57 Q150 43 197 57 L195 76 Q151 63 105 76Z" fill="var(--mc-blue)" opacity=".07"/>
<path class="mc-baseline" d="M78 93 Q103 82 129 91 M171 91 Q197 82 222 93" fill="none" stroke-width="2"/>
<g data-mc="browLeft" class="mc-move"><path class="mc-brow" d="M78 93 Q103 82 129 91" fill="none" stroke-width="4" stroke-linecap="round"/></g>
<g data-mc="browRight" class="mc-move"><path class="mc-brow" d="M171 91 Q197 82 222 93" fill="none" stroke-width="4" stroke-linecap="round"/></g>
<path data-mc="eyeFillL" d="M80 119 Q104 102 127 119 Q104 139 80 119Z" fill="var(--text)" opacity=".82"/>
<path data-mc="eyeFillR" d="M173 119 Q196 102 220 119 Q196 139 173 119Z" fill="var(--text)" opacity=".82"/>
<g clip-path="url(#${suffix}-eyes)"><circle cx="105" cy="119" r="8" fill="var(--bg)"/><circle cx="195" cy="119" r="8" fill="var(--bg)"/><circle cx="107" cy="116" r="2" fill="var(--text)"/><circle cx="197" cy="116" r="2" fill="var(--text)"/></g>
<path class="mc-baseline" d="M80 119 Q104 139 127 119 M173 119 Q196 139 220 119" fill="none" stroke-width="1.5"/>
<path data-mc="upperLeft" d="M80 119 Q104 102 127 119" fill="none" stroke="var(--dim)" stroke-width="2"/>
<path data-mc="upperRight" d="M173 119 Q196 102 220 119" fill="none" stroke="var(--dim)" stroke-width="2"/>
<path data-mc="lowerLeft" class="mc-lid" d="M80 119 Q104 139 127 119" fill="none" stroke-width="3" stroke-linecap="round"/>
<path data-mc="lowerRight" class="mc-lid" d="M173 119 Q196 139 220 119" fill="none" stroke-width="3" stroke-linecap="round"/>
<path d="M149 128 Q140 152 146 156 Q152 159 158 155" fill="none" stroke="var(--dim)" stroke-width="2" opacity=".6" stroke-linecap="round"/>
<path d="M128 183 Q150 192 172 183" fill="none" stroke="var(--dim)" stroke-width="2.5" stroke-linecap="round"/>
<path d="M81 160 Q92 154 103 158 M197 158 Q208 154 219 160" fill="none" stroke="var(--mc-amber)" stroke-width="2" opacity=".15" stroke-linecap="round"/>
<path data-mc="glabella" d="M143 81 Q150 76 157 81" fill="none" stroke="var(--mc-amber)" stroke-width="2" opacity="0"/>
</g></svg><div class="mc-caption">점선: 중립 기준 · 색 선: 현재 위치<br>거울 보기 기준 · 변화가 잘 보이도록 확대한 도식</div></div>
<div class="mc-copy"><div class="mc-item"><div class="mc-label">목표로 살펴볼 움직임</div><div class="mc-value" data-mc="target">눈·눈썹 운동을 선택하세요</div><div class="mc-number" data-mc="lowerNumber">측정값 없음</div></div><div class="mc-item"><div class="mc-label">함께 움직이는지 확인</div><div class="mc-value" data-mc="companion">눈썹의 기준선과 현재 위치를 비교합니다</div><div class="mc-number" data-mc="browNumber">측정값 없음</div></div><div class="mc-cue" data-mc="cue" role="status" aria-live="polite">카메라를 켠 다음 중립 기준을 설정해 주세요.</div></div></div>
<div class="mc-actions"><button type="button" class="btn btn-secondary" data-mc="calibrate">중립 기준 설정 · 1.5초</button><button type="button" class="btn btn-secondary" data-mc="demo">도식 체험</button></div>
<details class="mc-help"><summary>무엇을 볼 수 있고, 무엇은 모를까요?</summary><div>눈썹·눈꺼풀의 상대 위치와 미간 간격을 봅니다. 이마 주름, 근육 수축률, 힘은 직접 측정하지 않습니다. 화면 안 이동·크기·기울기는 2차원 기준으로 정규화하지만 3차원 고개 회전을 완전히 보정하지는 못합니다. 중립 기준과 관찰값은 메모리에서만 쓰며 이 코치는 이미지·좌표를 저장하거나 전송하지 않습니다.</div></details>
<div class="mc-note">변위는 눈 사이 거리 대비 비율입니다. 근육 활성화 % 또는 운동 정확도 점수가 아닙니다. 얼굴을 놓치면 수치와 피드백을 약 1초 안에 비웁니다.</div>`;
    const get = key => root.querySelector('[data-mc="' + key + '"]');
    let lastExercise = null, demoIndex = -1, currentCamera = false, currentPhase = 'idle';
    const statusText = { camera_off: '카메라를 시작하세요', tracking_lost: '얼굴을 다시 맞춰 주세요', pose_check: '정면·거리·기울기를 확인하세요', needs_baseline: '중립 기준이 필요해요', calibrating: '중립 표정 유지', calibration_retry: '움직임을 멈추고 다시 기준 측정', observing: '상대 움직임 관찰 중' };
    function draw(delta) {
      const d = delta || { browL: 0, browR: 0, lowerL: 0, lowerR: 0, upperL: 0, upperR: 0, glabella: 0 };
      // Mirror presentation, explicitly not anatomical left/right labels.
      get('browLeft').style.transform = 'translateY(' + clamp(-d.browR * 240, -19, 15) + 'px)';
      get('browRight').style.transform = 'translateY(' + clamp(-d.browL * 240, -19, 15) + 'px)';
      for (const [side, key, x1, xm, x2] of [['Left', 'R', 80, 104, 127], ['Right', 'L', 173, 196, 220]]) {
        const upper = 102 + clamp(d['upper' + key] * 250, -9, 18);
        const lower = 139 - clamp(d['lower' + key] * 250, -9, 18);
        const u = Math.min(upper, lower - 2);
        const l = Math.max(lower, u + 2);
        const upperPath = 'M' + x1 + ' 119 Q' + xm + ' ' + u + ' ' + x2 + ' 119';
        const lowerPath = 'M' + x1 + ' 119 Q' + xm + ' ' + l + ' ' + x2 + ' 119';
        const fill = upperPath + ' Q' + xm + ' ' + l + ' ' + x1 + ' 119Z';
        get('upper' + side).setAttribute('d', upperPath);
        get('lower' + side).setAttribute('d', lowerPath);
        get('eyeFill' + (side === 'Left' ? 'L' : 'R')).setAttribute('d', fill);
        get('eyeClip' + (side === 'Left' ? 'L' : 'R')).setAttribute('d', fill);
      }
      get('glabella').style.opacity = String(clamp(d.glabella * 14, 0, 0.8));
    }
    const signed = value => (value >= 0 ? '+' : '') + (value * 100).toFixed(1) + '%';
    function render(state, demo) {
      const usable = state.status === 'observing' && !!state.delta;
      get('character').classList.toggle('mc-quiet', !usable);
      get('demoNotice').hidden = !demo;
      get('status').textContent = demo ? '도식 체험 · 실측 아님' : statusText[state.status] || '측정 준비';
      get('status').classList.toggle('mc-live', usable && !demo);
      get('calibrate').disabled = !currentCamera || !!demo || ['running','rest','countdown'].includes(currentPhase);
      if (!usable) {
        draw(null);
        get('lowerNumber').textContent = '측정값 없음';
        get('browNumber').textContent = '측정값 없음';
        get('target').textContent = state.status === 'calibrating' ? '힘을 빼고 중립 표정으로 1.5초 유지' : '측정 준비';
        get('companion').textContent = state.status === 'calibrating' ? '진행 ' + (state.progress || 0) + '%' : '추적과 기준이 준비되면 상대 위치를 표시합니다';
        get('cue').textContent = state.status === 'camera_off' ? '평가 탭에서 카메라를 켜거나 도식 체험으로 먼저 살펴보세요.' : state.status === 'needs_baseline' ? '힘을 뺀 표정에서 중립 기준 설정을 눌러 주세요.' : state.status === 'calibration_retry' ? '기준 측정 중 움직임이 컸어요. 힘을 빼고 잠시 기다려 주세요.' : state.status === 'calibrating' ? '지금은 움직이지 말고 힘을 빼 주세요.' : '얼굴과 자세를 다시 맞춘 뒤 관찰을 이어가세요.';
        return;
      }
      draw(state.delta);
      const description = state.description || describe(lastExercise, state.delta, Object.fromEntries(KEYS.map(k => [k, 0.006])));
      get('target').textContent = description.target;
      get('companion').textContent = description.companion;
      get('cue').textContent = description.cue;
      get('forehead').style.opacity = lastExercise && lastExercise.phase === 'browRaise' ? '.18' : '.07';
      const labels = movementLabels(lastExercise, state.delta);
      get('lowerNumber').textContent = labels.target;
      get('browNumber').textContent = labels.companion;
    }
    get('calibrate').addEventListener('click', () => { demoIndex = -1; tracker.calibrate(); render({ status: 'calibrating', progress: 0 }, false); });
    const demoCount = 3;
    get('demo').addEventListener('click', () => {
      demoIndex = (demoIndex + 1) % (demoCount + 1);
      if (demoIndex === demoCount) { demoIndex = -1; get('demo').textContent = '도식 체험'; render(tracker.state() || { status: 'camera_off' }, false); return; }
      const item = demoExample(lastExercise, demoIndex);
      get('demo').textContent = '체험: ' + item.label + ' · 다음';
      const state = item.lost ? { status: 'tracking_lost', delta: null } : { status: 'observing', delta: item.delta, description: describe(lastExercise || { phase: 'eyeSquint' }, item.delta, Object.fromEntries(KEYS.map(k => [k, 0.006]))) };
      render(state, true);
    });
    const timer = global.setInterval(() => {
      if (demoIndex >= 0 || !currentCamera) return;
      const stale = tracker.stale(global.performance.now());
      if (stale) render(stale, false);
    }, 250);
    render({ status: 'camera_off' }, false);
    return {
      update(input) {
        currentCamera = input.cameraActive; currentPhase = input.phase || 'idle'; lastExercise = input.exercise;
        get('demo').disabled = currentCamera;
        if (currentCamera && demoIndex >= 0) { demoIndex = -1; get('demo').textContent = '도식 체험'; }
        const state = tracker.update(input); if (demoIndex < 0) render(state, false); return state;
      },
      select(exercise) {
        lastExercise = exercise; const state = tracker.state();
        if (state?.delta) state.description = describe(exercise, state.delta, state.noise);
        if (demoIndex >= 0) {
          const item = demoExample(exercise, demoIndex);
          get('demo').textContent = '체험: ' + item.label + ' · 다음';
          render(item.lost ? {status:'tracking_lost',delta:null} : {status:'observing',delta:item.delta,description:describe(exercise,item.delta,Object.fromEntries(KEYS.map(k=>[k,.006])))}, true);
        } else render(state || { status: 'camera_off' }, false);
      },
      state() { return tracker.state(); },
      clear() { tracker.clear(); render({ status: 'needs_baseline' }, false); },
      destroy() { global.clearInterval(timer); root.replaceChildren(); }
    };
  }
  global.FaceMovementCoach = { movementLabels, demoExample, geometry, poseUsable, changes, describe, baselineOf, createTracker, mount };
})(globalThis);
