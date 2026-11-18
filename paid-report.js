/* FACE FITNESS — paid AI report (client module, classic script).
 *
 * What it adds, and what it deliberately does not:
 *  - The free result the page already shows stays exactly as it is. This module only
 *    appends one locked card to the assessment result overlay.
 *  - The paid tier is a written report + 7-day routine generated from the numbers the
 *    page already computes locally. Photos, video, landmarks and account data never
 *    leave the device; only the numeric summary goes to /api/report.
 *  - Nothing is sent until the reader enters a purchase code and presses generate.
 *    In QA / interview-demo mode (assessmentIOBlocked()) the module stays inert.
 *  - Copy stays in coaching language. It is not a diagnosis and does not promise a
 *    cosmetic result; that framing lives in both this file and the server prompt.
 */
(function (global) {
  'use strict';

  // The purchase link and the price shown in the card live in one config spot
  // (window.FF_REPORT_CONFIG in index.html) so publishing the real product page
  // never needs a code change here.
  var CONFIG = (typeof global.FF_REPORT_CONFIG === 'object' && global.FF_REPORT_CONFIG) || {};
  var STORE_URL = typeof CONFIG.productUrl === 'string' && CONFIG.productUrl
    ? CONFIG.productUrl
    : 'https://www.latpeed.com/stores/FdTnv';
  var PRICE_LABEL = typeof CONFIG.priceLabel === 'string' && CONFIG.priceLabel ? CONFIG.priceLabel : '4,900원';
  var ACCESS_KEY = 'ff_report_access_v1';
  var CACHE_KEY = 'ff_report_cache_v1';
  var ACCESS_DAYS = 30;
  var DAY_MS = 24 * 60 * 60 * 1000;
  var PREVIEW = (function () {
    try { return new URLSearchParams(global.location.search).get('reportPreview') === '1'; }
    catch (_) { return false; }
  })();

  var ERROR_COPY = {
    invalid_code: '이용 코드가 맞지 않습니다. 구매 후 받은 안내 파일의 코드를 확인해 주세요.',
    not_configured: '리포트 서버가 아직 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.',
    rate_limited: '잠시 후 다시 시도해 주세요. 짧은 시간에 요청이 많았습니다.',
    insufficient_features: '측정값이 부족합니다. 평가를 처음부터 다시 실행해 주세요.',
    refused: '이번 측정값으로는 리포트를 만들지 못했습니다. 다시 시도해 주세요.',
    unsafe_output: '리포트를 만들지 못했습니다. 다시 시도해 주세요.',
    invalid_output: '리포트를 만들지 못했습니다. 다시 시도해 주세요.',
    upstream_error: '리포트 생성에 실패했습니다. 코드는 그대로이니 다시 시도해 주세요.',
    network: '연결이 끊겼습니다. 네트워크를 확인하고 다시 시도해 주세요.',
    no_assessment: '평가를 먼저 완료해 주세요.'
  };

  var memory = { access: null, cache: null };

  /* ── small helpers ─────────────────────────────────────────── */
  function normalizeCode(value) {
    return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function storageAllowed() {
    try {
      if (typeof assessmentIOBlocked === 'function' && assessmentIOBlocked()) return false;
      return !!global.localStorage;
    } catch (_) { return false; }
  }
  function readStore(key) {
    if (!storageAllowed()) return memory[key === ACCESS_KEY ? 'access' : 'cache'];
    try { return JSON.parse(global.localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function writeStore(key, value) {
    var slot = key === ACCESS_KEY ? 'access' : 'cache';
    memory[slot] = value;
    if (!storageAllowed()) return;
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* quota / private mode */ }
  }
  function fingerprint(payload) {
    var source = JSON.stringify(payload && payload.features ? payload.features : payload);
    var hash = 5381;
    for (var i = 0; i < source.length; i++) hash = ((hash << 5) + hash + source.charCodeAt(i)) & 0x7fffffff;
    return 'r' + hash.toString(36);
  }

  function accessState() {
    var saved = readStore(ACCESS_KEY);
    if (!saved || typeof saved.code !== 'string' || !saved.savedAt) return { code: '', active: false };
    var expired = Date.now() - saved.savedAt > ACCESS_DAYS * DAY_MS;
    return { code: saved.code, savedAt: saved.savedAt, active: !expired };
  }
  function saveAccess(code) {
    writeStore(ACCESS_KEY, { code: normalizeCode(code), savedAt: Date.now() });
  }

  /* ── data ─────────────────────────────────────────────────── */
  function buildPayload() {
    try {
      if (typeof assessmentComplete !== 'function' || !assessmentComplete()) return null;
      if (typeof buildMeasurementFeatures !== 'function') return null;
      var features = buildMeasurementFeatures();
      if (!features || !features.resting_state) return null;
      var list = typeof EXERCISES !== 'undefined' ? EXERCISES : [];
      var exercises = list.map(function (ex) { return { id: ex.id, name: ex.name, zone: ex.zone }; });
      return { features: features, exercises: exercises };
    } catch (_) { return null; }
  }

  /* The free line: one visible, honest fact from data the page already shows. */
  function teaserFacts(features) {
    var zones = (features && features.zone_scores) || {};
    var labels = { upper: '상부(눈·이마)', mid: '중부(볼·팔자)', lower: '하부(입·입꼬리)', neck: '목·턱' };
    var rows = Object.keys(labels)
      .filter(function (key) { return typeof zones[key] === 'number' && isFinite(zones[key]); })
      .map(function (key) { return { key: key, label: labels[key], score: zones[key] }; });
    var ordered = rows.slice();
    rows.sort(function (a, b) { return a.score - b.score; });
    var resting = (features && features.resting_state) || {};
    var smile = (features && features.dynamic_tests && features.dynamic_tests.smile) || {};
    var smileGap = null;
    if (typeof smile.max_left === 'number' && typeof smile.max_right === 'number') {
      smileGap = Math.abs(smile.max_left - smile.max_right) * 100;
    }
    return {
      symmetry: typeof resting.symmetry_score === 'number' ? resting.symmetry_score : null,
      weakest: rows[0] || null,
      rows: rows,
      ordered: ordered,
      smileGapPct: smileGap
    };
  }

  function weakestLine(facts) {
    if (!facts || !facts.weakest) return '이번 측정의 부위별 점수를 리포트에서 자세히 풀어 드립니다.';
    var line = facts.weakest.label + ' 밸런스가 ' + facts.weakest.score + '점으로 가장 낮게 잡혔습니다';
    if (facts.smileGapPct !== null && facts.smileGapPct >= 0.5) {
      line += ' (미소 좌우 차이 ' + facts.smileGapPct.toFixed(1) + ')';
    }
    return line + '.';
  }

  /* ── markup ───────────────────────────────────────────────── */
  function lockSvg() {
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  }

  function teaserHtml(payload) {
    var facts = teaserFacts(payload && payload.features);
    var access = accessState();
    var cached = payload ? getCached(fingerprint(payload)) : null;
    var unlocked = !!(cached || (access.active && access.code));
    var previewTag = PREVIEW ? '<div style="font-size:.6rem;color:var(--accent4);letter-spacing:1px;margin-bottom:6px;">미리보기 · 실제 결제/호출 없음</div>' : '';
    return '' +
      '<div class="ffpr-card" style="margin-top:14px;padding:16px;border-radius:16px;border:1px solid rgba(129,140,248,.28);background:linear-gradient(160deg,rgba(129,140,248,.08),rgba(244,114,182,.06));">' +
        previewTag +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
          '<div style="font-family:\'Outfit\',sans-serif;font-weight:900;font-size:.95rem;letter-spacing:.5px;color:#e2e8f0;">AI 정밀 비대칭 리포트</div>' +
          '<div style="display:flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0;font-size:.62rem;font-weight:700;color:' + (unlocked ? 'var(--accent3)' : 'var(--accent4)') + ';background:' + (unlocked ? 'rgba(52,211,153,.12)' : 'rgba(251,191,36,.12)') + ';border-radius:10px;padding:3px 9px;">' + (unlocked ? '이용권 적용' : lockSvg() + '유료') + '</div>' +
        '</div>' +
        '<div style="font-size:.76rem;color:var(--text);line-height:1.65;margin-top:8px;">' + esc(weakestLine(facts)) + '</div>' +
        '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap;">' +
          '<div style="font-size:.66rem;color:var(--dim);">대칭 점수 <b style="color:var(--text);font-size:.78rem;">' + (facts.symmetry === null ? '—' : facts.symmetry) + '</b></div>' +
          (facts.ordered && facts.ordered.length > 1 ? '<div style="font-size:.66rem;color:var(--dim);">' + esc(facts.ordered.map(function (r) { return r.label.replace(/\(.*\)/, '') + ' ' + r.score; }).join(' · ')) + '</div>' : '') +
        '</div>' +
        '<ul style="list-style:none;padding:0;margin:12px 0 0;display:grid;gap:6px;">' +
          ['근육별로 왜 이 차이가 생겼는지 풀어 쓴 해석', '7일 교정 루틴 (부위별 세트·시간·포인트)', 'PDF 저장 · 30일 동안 다시 열람'].map(function (item) {
            return '<li style="font-size:.72rem;color:' + (unlocked ? 'var(--text)' : 'var(--dim)') + ';display:flex;gap:7px;align-items:flex-start;"><span style="opacity:.8;">' + lockSvg() + '</span><span>' + esc(item) + '</span></li>';
          }).join('') +
        '</ul>' +
        '<button class="btn btn-grad ffpr-open" style="width:100%;margin-top:12px;font-size:.8rem;">' +
          (cached ? '내 리포트 다시 보기' : unlocked ? '리포트 생성하기' : '리포트 열기 · ' + PRICE_LABEL) +
        '</button>' +
        '<div style="font-size:.58rem;color:var(--dim);line-height:1.5;margin-top:8px;">사진·영상은 전송되지 않습니다. 측정 숫자만 쓰고, 저장하지 않습니다. 의료 진단이 아닙니다.</div>' +
        (PREVIEW ? '<button class="btn btn-secondary ffpr-sample" style="width:100%;margin-top:8px;font-size:.7rem;">예시 리포트 보기 (미리보기 전용)</button>' : '') +
      '</div>';
  }

  function reportOverlay() {
    var node = document.getElementById('ffprOverlay');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'ffprOverlay';
    node.className = 'overlay';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.innerHTML = '<div class="overlay-card" id="ffprCard" style="max-width:600px;"></div>';
    document.body.appendChild(node);
    node.addEventListener('click', function (event) { if (event.target === node) closeOverlay(); });
    return node;
  }
  function openOverlay(html) {
    var node = reportOverlay();
    var card = node.querySelector('#ffprCard');
    card.innerHTML = html;
    node.classList.add('visible');
    return card;
  }
  function closeOverlay() {
    var node = document.getElementById('ffprOverlay');
    if (node) node.classList.remove('visible');
  }

  function unlockPanelHtml() {
    var access = accessState();
    return '' +
      '<div class="oc-title" style="font-size:1.15rem;">AI 정밀 비대칭 리포트</div>' +
      '<div class="oc-sub">측정 숫자로 쓰는 해석 + 7일 루틴' + (access.active ? ' · 이 기기 이용권 사용 중' : '') + '</div>' +
      '<div style="font-size:.76rem;color:var(--text);line-height:1.75;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:12px;padding:12px 14px;">' +
        '<div style="color:var(--accent4);font-weight:800;font-size:.7rem;margin-bottom:6px;">이용 방법</div>' +
        '1. 아래 버튼으로 이용권을 구매합니다 (' + PRICE_LABEL + ', 30일 이용).<br>' +
        '2. 구매 후 받은 안내 파일에 적힌 이용 코드를 입력합니다.<br>' +
        '3. 이번 측정값으로 리포트가 만들어지고, 화면에서 바로 PDF로 저장할 수 있습니다.' +
      '</div>' +
      '<button class="btn btn-primary" id="ffprBuy" style="width:100%;margin-top:12px;font-size:.8rem;">이용권 구매 페이지 열기</button>' +
      '<div style="display:flex;align-items:center;gap:8px;margin:16px 0 10px;color:var(--dim);font-size:.65rem;"><span style="flex:1;height:1px;background:var(--border);"></span>이미 구매했다면<span style="flex:1;height:1px;background:var(--border);"></span></div>' +
      '<label for="ffprCode" style="font-size:.68rem;color:var(--dim);display:block;margin-bottom:6px;">이용 코드</label>' +
      '<input id="ffprCode" class="auth-input" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="예: FF-7K2M-2411" value="' + esc(access.code) + '" style="width:100%;" />' +
      '<div id="ffprMsg" style="display:none;font-size:.7rem;line-height:1.55;margin-top:8px;padding:8px 10px;border-radius:8px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;">' +
        '<button class="btn btn-secondary" style="flex:1;" id="ffprCancel">닫기</button>' +
        '<button class="btn btn-grad" style="flex:1.4;" id="ffprSubmit">리포트 생성</button>' +
      '</div>' +
      '<div style="font-size:.58rem;color:var(--dim);line-height:1.5;margin-top:10px;">사진·영상·이름·연락처는 전송하지 않습니다. 측정 숫자만 사용하고 서버에 저장하지 않습니다. 이 리포트는 운동 참고 자료이며 의료 진단이 아닙니다.</div>';
  }

  function message(target, text, kind) {
    if (!target) return;
    target.style.display = '';
    target.textContent = text;
    target.style.color = kind === 'ok' ? 'var(--accent3)' : kind === 'info' ? 'var(--accent4)' : 'var(--danger)';
    target.style.background = kind === 'ok' ? 'rgba(52,211,153,.1)' : kind === 'info' ? 'rgba(251,191,36,.1)' : 'rgba(248,113,113,.1)';
  }

  async function requestReport(payload, code) {
    var response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, features: payload.features, exercises: payload.exercises })
    });
    var data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok || !data || !data.ok) {
      var error = new Error((data && data.code) || 'upstream_error');
      error.code = (data && data.code) || (response.status === 403 ? 'invalid_code' : 'upstream_error');
      throw error;
    }
    return data;
  }

  function getCached(key) {
    var cache = readStore(CACHE_KEY);
    if (!cache || cache.key !== key || !cache.report) return null;
    var expired = Date.now() - cache.savedAt > ACCESS_DAYS * DAY_MS;
    return expired ? null : cache.report;
  }
  function setCached(key, report) {
    writeStore(CACHE_KEY, { key: key, savedAt: Date.now(), report: report });
  }

  /* ── report rendering ─────────────────────────────────────── */
  var SEVERITY_LABEL = { mild: '작음', moderate: '중간', notable: '큼' };
  var SEVERITY_COLOR = { mild: 'var(--accent3)', moderate: 'var(--accent4)', notable: 'var(--danger)' };

  function indexOfExercise(id) {
    if (typeof EXERCISES === 'undefined') return -1;
    for (var i = 0; i < EXERCISES.length; i++) if (EXERCISES[i].id === id) return i;
    return -1;
  }

  function reportHtml(report, meta) {
    var sections = (report.sections || []).map(function (section) {
      return '<div style="margin-top:12px;">' +
        '<div style="font-size:.86rem;font-weight:800;color:var(--accent2);margin-bottom:4px;">' + esc(section.title) + '</div>' +
        '<div style="font-size:.78rem;color:var(--text);line-height:1.8;white-space:pre-line;">' + esc(section.body) + '</div>' +
      '</div>';
    }).join('');

    var asym = (report.asymmetries || []).map(function (item) {
      var color = SEVERITY_COLOR[item.severity] || 'var(--accent4)';
      return '<div style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
          '<span style="font-size:.78rem;font-weight:700;color:var(--text);">' + esc(item.zone) + '</span>' +
          '<span style="font-size:.62rem;font-weight:700;color:' + color + ';background:rgba(255,255,255,.04);border-radius:8px;padding:2px 8px;">차이 ' + esc(SEVERITY_LABEL[item.severity] || '') + '</span>' +
        '</div>' +
        '<div style="font-size:.74rem;color:var(--text);line-height:1.65;margin-top:3px;">' + esc(item.observation) + '</div>' +
        (item.meaning ? '<div style="font-size:.7rem;color:var(--dim);line-height:1.6;margin-top:2px;">' + esc(item.meaning) + '</div>' : '') +
      '</div>';
    }).join('');

    var comps = (report.compensations || []).map(function (item) {
      return '<div style="display:flex;gap:8px;font-size:.73rem;color:var(--text);line-height:1.65;margin-top:6px;">' +
        '<span style="color:var(--accent4);">•</span><span><b>' + esc(item.name) + '</b> — ' + esc(item.reading) + '</span></div>';
    }).join('');

    var routine = (report.routine || []).map(function (day) {
      var steps = (day.steps || []).map(function (step) {
        var index = indexOfExercise(step.exercise_id);
        var canOpen = index >= 0;
        return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:5px 0;">' +
          '<div style="flex:1;">' +
            '<div style="font-size:.76rem;color:var(--text);font-weight:700;">' + esc(step.name || step.exercise_id) + '</div>' +
            '<div style="font-size:.68rem;color:var(--dim);line-height:1.55;margin-top:2px;">' + esc(step.sets) + (step.dose ? ' · ' + esc(step.dose) : '') + '</div>' +
            (step.cue ? '<div style="font-size:.66rem;color:var(--accent2);line-height:1.5;margin-top:2px;">' + esc(step.cue) + '</div>' : '') +
          '</div>' +
          (canOpen ? '<button class="btn btn-secondary ffpr-goto" data-ex="' + index + '" style="font-size:.6rem;padding:4px 8px;flex-shrink:0;">운동 열기</button>' : '') +
        '</div>';
      }).join('');
      return '<div style="margin-top:8px;padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid var(--border);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span style="font-family:\'Outfit\',sans-serif;font-weight:900;font-size:.8rem;color:var(--accent);">DAY ' + esc(day.day) + '</span>' +
          '<span style="font-size:.66rem;color:var(--dim);">' + esc(day.focus) + ' · ' + esc(day.minutes) + '분</span>' +
        '</div>' + steps +
      '</div>';
    }).join('');

    var checkpoints = (report.checkpoints || []).map(function (item) {
      return '<div style="font-size:.72rem;color:var(--text);line-height:1.65;display:flex;gap:6px;margin-top:5px;"><span style="color:var(--accent3);">✓</span><span>' + esc(item) + '</span></div>';
    }).join('');
    var cautions = (report.cautions || []).map(function (item) {
      return '<div style="font-size:.7rem;color:var(--accent4);line-height:1.6;display:flex;gap:6px;margin-top:4px;"><span>!</span><span>' + esc(item) + '</span></div>';
    }).join('');

    var metaLine = '';
    if (meta && meta.model) {
      var tokens = meta.tokens ? (meta.tokens.input + meta.tokens.output) : null;
      metaLine = '생성 모델 ' + esc(meta.model) + (tokens ? ' · ' + tokens + ' 토큰' : '');
    }

    return '' +
      '<div id="ffprReport">' +
      '<div class="oc-title" style="font-size:1.05rem;line-height:1.4;">' + esc(report.headline) + '</div>' +
      '<div style="font-size:.8rem;color:var(--accent4);line-height:1.6;margin-bottom:4px;">' + esc(report.summary_line) + '</div>' +
      (PREVIEW ? '<div style="font-size:.6rem;color:var(--dim);margin-bottom:6px;">미리보기용 예시 리포트 · 실제 측정값 아님</div>' : '') +
      sections +
      (asym ? '<div style="margin-top:16px;"><div style="font-size:.72rem;font-weight:800;color:var(--dim);letter-spacing:1px;margin-bottom:4px;">부위별 차이</div>' + asym + '</div>' : '') +
      (comps ? '<div style="margin-top:14px;"><div style="font-size:.72rem;font-weight:800;color:var(--dim);letter-spacing:1px;margin-bottom:2px;">보상 패턴</div>' + comps + '</div>' : '') +
      '<div style="margin-top:18px;"><div style="font-size:.72rem;font-weight:800;color:var(--dim);letter-spacing:1px;">7일 교정 루틴</div>' + routine + '</div>' +
      (checkpoints ? '<div style="margin-top:16px;"><div style="font-size:.72rem;font-weight:800;color:var(--dim);letter-spacing:1px;">확인 포인트</div>' + checkpoints + '</div>' : '') +
      (cautions ? '<div style="margin-top:14px;padding:10px 12px;border-radius:10px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.18);"><div style="font-size:.68rem;font-weight:800;color:var(--accent4);margin-bottom:2px;">먼저 확인하세요</div>' + cautions + '</div>' : '') +
      '<div style="margin-top:14px;font-size:.62rem;color:var(--dim);line-height:1.6;">' + esc(report.disclaimer) + '</div>' +
      (metaLine ? '<div style="margin-top:6px;font-size:.58rem;color:var(--dim);">' + metaLine + '</div>' : '') +
      '</div>';
  }

  function showReport(report, meta) {
    var card = openOverlay('' +
      reportHtml(report, meta) +
      '<div style="display:flex;gap:8px;margin-top:16px;">' +
        '<button class="btn btn-secondary" style="flex:1;" id="ffprClose">닫기</button>' +
        '<button class="btn btn-grad" style="flex:1;" id="ffprPrint">PDF로 저장</button>' +
      '</div>');
    if (card) bindReport(card, report);
  }

  function bindReport(card) {
    var close = card.querySelector('#ffprClose');
    if (close) close.addEventListener('click', closeOverlay);
    var print = card.querySelector('#ffprPrint');
    if (print) print.addEventListener('click', printReport);
    card.querySelectorAll('.ffpr-goto').forEach(function (button) {
      button.addEventListener('click', function () {
        var index = Number(button.dataset.ex);
        closeOverlay();
        try {
          if (typeof showScreen === 'function') showScreen('program');
          if (typeof selectEx === 'function' && Number.isInteger(index)) selectEx(index);
        } catch (_) { /* the routine still reads without the jump */ }
      });
    });
  }

  /* Print stylesheet: only the print copy is visible, so 브라우저 인쇄 / PDF 저장이
   * gives a clean document instead of the dark app screen. */
  function ensurePrintStyles() {
    if (document.getElementById('ffprPrintStyles')) return;
    var style = document.createElement('style');
    style.id = 'ffprPrintStyles';
    style.textContent = [
      '#ffprPrint{display:none;}',
      '@media print{',
      '  body{background:#fff !important;}',
      '  body > *:not(#ffprPrint){display:none !important;}',
      '  #ffprPrint{display:block !important;color:#111;background:#fff;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;padding:18px 22px;}',
      '  #ffprPrint .pr-title{font-size:20px;font-weight:800;margin-bottom:4px;}',
      '  #ffprPrint .pr-summary{font-size:14px;color:#333;margin-bottom:14px;}',
      '  #ffprPrint h2{font-size:14px;margin:16px 0 6px;color:#111;border-bottom:1px solid #ddd;padding-bottom:3px;}',
      '  #ffprPrint p{font-size:12.5px;line-height:1.7;margin:4px 0;color:#222;}',
      '  #ffprPrint .pr-day{border:1px solid #e5e5e5;border-radius:8px;padding:8px 10px;margin-top:8px;page-break-inside:avoid;}',
      '  #ffprPrint .pr-day-h{font-size:12.5px;font-weight:800;margin-bottom:2px;}',
      '  #ffprPrint .pr-step{font-size:12px;line-height:1.6;color:#222;margin-top:3px;}',
      '  #ffprPrint .pr-note{font-size:11px;color:#666;line-height:1.6;margin-top:12px;}',
      '  #ffprPrint table{width:100%;border-collapse:collapse;font-size:12px;}',
      '  #ffprPrint td{border-bottom:1px solid #eee;padding:4px 0;}',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function printReport() {
    var cache = readStore(CACHE_KEY);
    var report = cache && cache.report;
    if (!report) return;
    ensurePrintStyles();
    var host = document.getElementById('ffprPrint');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ffprPrint';
      document.body.appendChild(host);
    }
    var rows = (report.routine || []).map(function (day) {
      var steps = (day.steps || []).map(function (step) {
        return '<div class="pr-step">· ' + esc(step.name || step.exercise_id) + ' — ' + esc(step.sets) + (step.dose ? ', ' + esc(step.dose) : '') + (step.cue ? '<br><span style="color:#555;">&nbsp;&nbsp;' + esc(step.cue) + '</span>' : '') + '</div>';
      }).join('');
      return '<div class="pr-day"><div class="pr-day-h">DAY ' + esc(day.day) + ' · ' + esc(day.focus) + ' · ' + esc(day.minutes) + '분</div>' + steps + '</div>';
    }).join('');
    var asymRows = (report.asymmetries || []).map(function (item) {
      return '<tr><td style="width:64px;font-weight:700;">' + esc(item.zone) + '</td><td>' + esc(item.observation) + (item.meaning ? ' ' + esc(item.meaning) : '') + '</td></tr>';
    }).join('');
    host.innerHTML = '' +
      '<div class="pr-title">' + esc(report.headline) + '</div>' +
      '<div class="pr-summary">' + esc(report.summary_line) + '</div>' +
      (report.sections || []).map(function (s) { return '<h2>' + esc(s.title) + '</h2><p>' + esc(s.body) + '</p>'; }).join('') +
      (asymRows ? '<h2>부위별 차이</h2><table>' + asymRows + '</table>' : '') +
      ((report.compensations || []).length ? '<h2>보상 패턴</h2>' + report.compensations.map(function (c) { return '<p><b>' + esc(c.name) + '</b> — ' + esc(c.reading) + '</p>'; }).join('') : '') +
      '<h2>7일 교정 루틴</h2>' + rows +
      ((report.checkpoints || []).length ? '<h2>확인 포인트</h2>' + report.checkpoints.map(function (c) { return '<p>· ' + esc(c) + '</p>'; }).join('') : '') +
      '<div class="pr-note">' + esc(report.disclaimer) + '<br>FACE FITNESS · 측정일 ' + new Date().toISOString().slice(0, 10) + '</div>';
    try { global.print(); } catch (_) { /* iOS blocks in some in-app browsers */ }
  }

  /* ── flow ─────────────────────────────────────────────────── */
  async function generate(payload, code, msgTarget, button) {
    var key = fingerprint(payload);
    var cached = getCached(key);
    if (cached) {
      showReport(cached, null);
      return true;
    }
    if (button) { button.disabled = true; button.textContent = '생성 중...'; }
    message(msgTarget, '리포트를 만들고 있습니다. 보통 20~30초 걸립니다. 화면을 닫지 말고 기다려 주세요.', 'info');
    try {
      var data = await requestReport(payload, code);
      setCached(key, data.report);
      showReport(data.report, data.meta);
      return true;
    } catch (error) {
      var codeKey = (error && error.code) || 'upstream_error';
      message(msgTarget, ERROR_COPY[codeKey] || ERROR_COPY.upstream_error, 'error');
      return false;
    } finally {
      if (button) { button.disabled = false; button.textContent = '리포트 생성'; }
    }
  }

  function openFlow(payload) {
    var access = accessState();
    var key = payload ? fingerprint(payload) : '';
    var cached = payload ? getCached(key) : null;
    if (cached) { showReport(cached, null); return; }

    var card = openOverlay(unlockPanelHtml());
    if (!card) return;
    var codeInput = card.querySelector('#ffprCode');
    var msg = card.querySelector('#ffprMsg');
    var submit = card.querySelector('#ffprSubmit');
    var cancel = card.querySelector('#ffprCancel');
    var buy = card.querySelector('#ffprBuy');

    if (cancel) cancel.addEventListener('click', closeOverlay);
    if (buy) {
      buy.addEventListener('click', function () {
        try { global.open(STORE_URL, '_blank', 'noopener'); } catch (_) { global.location.href = STORE_URL; }
        message(msg, '결제 페이지를 새 창으로 열었습니다. 구매 후 안내 파일의 코드를 입력해 주세요.', 'info');
      });
    }
    if (codeInput) {
      codeInput.addEventListener('input', function () {
        var cleaned = codeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
        if (cleaned !== codeInput.value) codeInput.value = cleaned;
      });
      codeInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); submitReport(); }
      });
      if (access.active) codeInput.value = access.code;
    }
    if (submit) submit.addEventListener('click', submitReport);

    async function submitReport() {
      if (!payload) { message(msg, ERROR_COPY.no_assessment, 'error'); return; }
      var code = normalizeCode(codeInput ? codeInput.value : '');
      if (code.length < 4) { message(msg, '이용 코드를 입력해 주세요.', 'error'); return; }
      var ok = await generate(payload, code, msg, submit);
      if (ok) {
        saveAccess(code);
        renderTeaserSoon();
      }
    }
  }

  /* ── mounting ─────────────────────────────────────────────── */
  var currentPayload = null;

  function bindCard(container) {
    var button = container.querySelector('.ffpr-open');
    if (button) button.addEventListener('click', function () { openFlow(currentPayload); });
    var sample = container.querySelector('.ffpr-sample');
    if (sample) sample.addEventListener('click', function () { showReport(PREVIEW_REPORT, { model: 'preview' }); });
  }

  /* A compact entry stays on the assess screen after the result overlay is closed,
   * so closing the overlay does not lose the paid offer for this measurement. */
  function compactHtml(payload) {
    var unlocked = !!(getCached(fingerprint(payload)) || accessState().active);
    return '<button class="btn ' + (unlocked ? 'btn-secondary' : 'btn-grad') + ' ffpr-open" style="font-size:.72rem;padding:8px 14px;">' +
      (unlocked ? '내 리포트 다시 보기' : 'AI 정밀 리포트 · ' + PRICE_LABEL) + '</button>';
  }

  function renderTeaser(target) {
    // Demo/interview mode and the QA harness never offer the paid flow.
    if (!PREVIEW) {
      if (typeof INTERVIEW_DEMO !== 'undefined' && INTERVIEW_DEMO) return;
      if (typeof assessmentIOBlocked === 'function' && assessmentIOBlocked()) return;
    }
    var payload = buildPayload();
    if (!payload) {
      if (!PREVIEW) {
        var empty = document.getElementById('premiumReportSlot');
        if (empty) empty.innerHTML = '';
        var emptyInline = document.getElementById('premiumReportInline');
        if (emptyInline) { emptyInline.style.display = 'none'; emptyInline.innerHTML = ''; }
        return;
      }
      payload = PREVIEW_PAYLOAD;
    }
    currentPayload = payload;
    var slot = target || document.getElementById('premiumReportSlot');
    if (slot) {
      slot.innerHTML = teaserHtml(payload);
      bindCard(slot);
    }
    var inline = document.getElementById('premiumReportInline');
    if (inline) {
      inline.innerHTML = compactHtml(payload);
      inline.style.display = '';
      bindCard(inline);
    }
  }
  function renderTeaserSoon() {
    setTimeout(renderTeaser, 0);
  }

  function mount() {
    if (!document.getElementById('premiumReportSlot')) return false;
    ensurePrintStyles();
    // Append (not wrap) so the existing result rendering keeps working untouched.
    if (typeof global.showAssessResults === 'function' && !global.showAssessResults.__ffpr) {
      var original = global.showAssessResults;
      var wrapped = function () {
        var result = original.apply(this, arguments);
        renderTeaserSoon();
        return result;
      };
      wrapped.__ffpr = true;
      global.showAssessResults = wrapped;
    }
    if (PREVIEW) {
      // Review copy and layout without an assessment or a paid call.
      var host = document.createElement('div');
      host.style.maxWidth = '560px';
      host.style.margin = '0 auto 18px';
      var screen = document.getElementById('screen-assess');
      (screen || document.body).appendChild(host);
      renderTeaser(host);
    }
    return true;
  }

  /* Preview fixtures: reviewable copy and layout, clearly marked as an example. */
  var PREVIEW_PAYLOAD = {
    features: {
      resting_state: { symmetry_score: 78, sample_frames: 120 },
      dynamic_tests: { smile: { max_left: 0.032, max_right: 0.021, asymmetry: 0.011, sym_score: 74 } },
      zone_scores: { upper: 82, mid: 61, lower: 74, neck: 88 }
    },
    exercises: []
  };
  var PREVIEW_REPORT = {
    summary_line: '중부(볼·팔자) 밸런스를 먼저 올리고, 미소 좌우 차이를 3주에 걸쳐 줄이는 순서가 좋습니다.',
    headline: '볼 쪽 힘을 고르게 쓰는 7일',
    sections: [
      { title: '지금 상태', body: '이번 측정에서 상부 82점, 중부 61점, 하부 74점, 목·턱 88점으로 중부가 가장 낮게 잡혔습니다. 미소를 지을 때 왼쪽 입꼬리가 오른쪽보다 조금 더 크게 올라갑니다. 힘이 없는 것이 아니라, 볼 근육을 쓰는 순서가 한쪽으로 쏠려 있을 가능성이 큽니다.' },
      { title: '왜 이렇게 되는가', body: '볼 근육은 평소 웃는 습관과 씹는 쪽의 영향을 많이 받습니다. 한쪽으로만 힘을 주면 반대쪽은 같은 동작을 해도 덜 올라갑니다. 측정에서 눈꺼풀을 감을 때 이마가 함께 움직이는 패턴도 보여서, 표정을 만들 때 필요한 근육만 쓰는 연습이 함께 필요합니다.' },
      { title: '7일 동안 할 일', body: '미소 지구력을 하루 두 번 짧게 넣고, 볼 올리기로 좌우를 번갈아 씁니다. 목에 힘이 들어가는지 매 세트 확인하세요. 강도는 최대의 60% 정도로 유지하고, 마지막 날에는 첫날과 같은 자세로 다시 측정해 비교합니다.' }
    ],
    asymmetries: [
      { zone: '중부', severity: 'moderate', observation: '미소 좌우 차이 1.1', meaning: '볼 근육을 쓰는 순서가 한쪽으로 치우쳐 있습니다.' },
      { zone: '상부', severity: 'mild', observation: '눈 감을 때 이마가 함께 올라감', meaning: '눈 주변만 쓰는 연습이 필요합니다.' }
    ],
    compensations: [
      { name: '전두근', reading: '눈을 감을 때 이마가 같이 움직입니다. 눈 주변 힘을 분리하는 훈련을 넣었습니다.' }
    ],
    routine: [1, 2, 3, 4, 5, 6, 7].map(function (day) {
      return {
        day: day,
        focus: day % 3 === 0 ? '회복·이완' : '미소 밸런스',
        minutes: 10,
        steps: [
          { exercise_id: 'smile_hold', name: '미소 지구력', sets: '2세트', dose: '20초 유지', cue: '목에 힘이 들어가지 않게' },
          { exercise_id: 'eye_v', name: '눈 브이 운동', sets: '2세트', dose: '10회', cue: '이마는 고정' }
        ]
      };
    }),
    checkpoints: ['3일째: 웃을 때 좌우 차이가 줄었는지 거울로 확인', '7일째: 같은 조건에서 다시 측정해 점수 비교'],
    cautions: ['통증이나 저림이 있으면 운동을 미루고 전문가와 상담하세요.'],
    disclaimer: '이 리포트는 측정된 얼굴 움직임 수치를 운동 코칭 언어로 풀어 쓴 참고 자료입니다. 의료 진단·검사·치료가 아니며, 정상/비정상 판정이 아닙니다.'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  global.FacePaidReport = {
    mount: mount,
    renderTeaser: renderTeaser,
    buildPayload: buildPayload,
    teaserFacts: teaserFacts,
    weakestLine: weakestLine,
    normalizeCode: normalizeCode,
    teaserHtml: teaserHtml,
    unlockPanelHtml: unlockPanelHtml,
    reportHtml: reportHtml,
    openFlow: openFlow,
    printReport: printReport,
    fingerprint: fingerprint,
    accessState: accessState,
    previewFixtures: function () { return { payload: PREVIEW_PAYLOAD, report: PREVIEW_REPORT }; },
    priceLabel: PRICE_LABEL,
    storeUrl: STORE_URL
  };
})(typeof window !== 'undefined' ? window : globalThis);
