/* Face Fitness — paid AI report endpoint (Vercel Node function).
 *
 * Contract
 *   POST /api/report
 *   { code: "XXXX-XXXX", features: <measurement features>, exercises: [{id,name,zone}] }
 *   -> { ok: true, report: <structured Korean report>, meta: { model, tokens, cost_krw } }
 *
 * Boundaries this file keeps:
 *  - No image, video, landmark or account data ever reaches this endpoint. Only the
 *    numeric summary the page already computes locally (buildMeasurementFeatures()).
 *  - Nothing is stored or logged per buyer. Usage counters are per-instance memory
 *    and hold no payload.
 *  - The OpenAI key and the access codes live only in environment variables.
 *  - Output is a wellness/coaching document. The model is told not to diagnose, not
 *    to read cranial-nerve or paralysis findings, and to send heavy asymmetry to a
 *    professional. Server-side validation rejects reports that drop the disclaimer.
 */
'use strict';

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-6.1-terra';
const CURRENCY_KRW = 1450; // planning assumption for the cost estimate only
const MAX_BODY_CHARS = 48 * 1024;
const MAX_OUTPUT_TOKENS = 4000;
const PER_HOUR = 6;
const PER_DAY = 15;
const GLOBAL_PER_DAY = 300;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ZONES = ['상부', '중부', '하부', '목/턱'];
const SEVERITIES = ['mild', 'moderate', 'notable'];
const DISCLAIMER = '이 리포트는 측정된 얼굴 움직임 수치를 운동 코칭 언어로 풀어 쓴 참고 자료입니다. 의료 진단·검사·치료가 아니며, 정상/비정상 판정이 아닙니다.';

// Model list prices in USD per 1M tokens (developers.openai.com/api/docs/pricing, 2026-11).
const PRICES = {
  'gpt-6.1-terra': { input: 1.0, output: 5.0 },
  'gpt-6.1-sol': { input: 2.0, output: 10.0 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
};

function estimateCostUsd(model, usage) {
  const price = PRICES[model] || PRICES[DEFAULT_MODEL];
  const input = Number(usage && usage.prompt_tokens) || 0;
  const output = Number(usage && usage.completion_tokens) || 0;
  return (input * price.input + output * price.output) / 1e6;
}

function normalizeCode(value) {
  return String(value == null ? '' : value).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseCodes(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map(normalizeCode)
    .filter(Boolean);
}

function safeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  let diff = left.length === right.length ? 0 : 1;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}

function finiteOr(value, fallback = 0, lo = -1e9, hi = 1e9) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function textOr(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/* Keep only the numbers the page already shows. Unknown keys are dropped so a
 * modified client cannot smuggle arbitrary instructions into the prompt. */
function sanitizeFeatures(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const resting = raw.resting_state || {};
  const tests = raw.dynamic_tests || {};
  const zones = raw.zone_scores || {};
  const features = {
    resting: {
      symmetry_score: Math.round(finiteOr(resting.symmetry_score, 0, 0, 100)),
      ear_left: Math.round(finiteOr(resting.ear_left, 0, 0, 10) * 1000) / 1000,
      ear_right: Math.round(finiteOr(resting.ear_right, 0, 0, 10) * 1000) / 1000,
      ear_diff_pct: Math.round(finiteOr(resting.ear_diff_pct, 0, 0, 100) * 10) / 10,
      corrugator_active: resting.corrugator_active === true,
      mouth_corner_active: resting.platysma_active === true,
      sample_frames: Math.round(finiteOr(resting.sample_frames, 0, 0, 100000)),
    },
    smile: {
      max_left: Math.round(finiteOr(tests.smile && tests.smile.max_left, 0, -1, 1) * 10000) / 10000,
      max_right: Math.round(finiteOr(tests.smile && tests.smile.max_right, 0, -1, 1) * 10000) / 10000,
      asymmetry: Math.round(finiteOr(tests.smile && tests.smile.asymmetry, 0, 0, 1) * 10000) / 10000,
      sym_score: Math.round(finiteOr(tests.smile && tests.smile.sym_score, 0, 0, 100)),
      neck_tension: Math.round(finiteOr(tests.smile && tests.smile.synkinesis_platysma, 0, 0, 100) * 10) / 10,
    },
    brow: {
      max_left: Math.round(finiteOr(tests.brow_raise && tests.brow_raise.max_left, 0, -1, 1) * 10000) / 10000,
      max_right: Math.round(finiteOr(tests.brow_raise && tests.brow_raise.max_right, 0, -1, 1) * 10000) / 10000,
      asymmetry: Math.round(finiteOr(tests.brow_raise && tests.brow_raise.asymmetry, 0, 0, 1) * 10000) / 10000,
      glabella_tension: Math.round(finiteOr(tests.brow_raise && tests.brow_raise.synkinesis_corrugator, 0, 0, 100) * 10) / 10,
    },
    eye_close: {
      forehead_recruitment: Math.round(finiteOr(tests.eye_close && tests.eye_close.synkinesis_frontalis, 0, 0, 100) * 10) / 10,
    },
    mouth_open: { max_jaw: Math.round(finiteOr(tests.mouth_open && tests.mouth_open.max_jaw, 0, -1, 1) * 10000) / 10000 },
    zones: {
      upper: Math.round(finiteOr(zones.upper, 0, 0, 100)),
      mid: Math.round(finiteOr(zones.mid, 0, 0, 100)),
      lower: Math.round(finiteOr(zones.lower, 0, 0, 100)),
      neck: Math.round(finiteOr(zones.neck, 0, 0, 100)),
    },
  };
  // A report with no baseline is not worth a paid call.
  if (!features.resting.sample_frames) return null;
  if (!features.zones.upper && !features.zones.mid && !features.zones.lower) return null;
  return features;
}

function sanitizeCatalog(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, 40)) {
    const id = typeof item === 'string' ? item : item && item.id;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]{1,30}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const name = item && typeof item === 'object' ? textOr(item.name, 30) : '';
    const zone = item && typeof item === 'object' && typeof item.zone === 'string' ? item.zone.slice(0, 8) : '';
    out.push({ id, name, zone });
  }
  return out;
}

function schemaFor(catalog) {
  const ids = catalog.map((e) => e.id);
  const step = {
    type: 'object',
    properties: {
      exercise_id: ids.length ? { type: 'string', enum: ids } : { type: 'string' },
      sets: { type: 'string' },
      dose: { type: 'string' },
      cue: { type: 'string' },
    },
    required: ['exercise_id', 'sets', 'dose', 'cue'],
    additionalProperties: false,
  };
  return {
    type: 'object',
    properties: {
      summary_line: { type: 'string' },
      headline: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, body: { type: 'string' } },
          required: ['title', 'body'],
          additionalProperties: false,
        },
      },
      asymmetries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            zone: { type: 'string', enum: ZONES },
            severity: { type: 'string', enum: SEVERITIES },
            observation: { type: 'string' },
            meaning: { type: 'string' },
          },
          required: ['zone', 'severity', 'observation', 'meaning'],
          additionalProperties: false,
        },
      },
      compensations: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, reading: { type: 'string' } },
          required: ['name', 'reading'],
          additionalProperties: false,
        },
      },
      routine: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            day: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7] },
            focus: { type: 'string' },
            minutes: { type: 'integer' },
            steps: { type: 'array', items: step },
          },
          required: ['day', 'focus', 'minutes', 'steps'],
          additionalProperties: false,
        },
      },
      checkpoints: { type: 'array', items: { type: 'string' } },
      cautions: { type: 'array', items: { type: 'string' } },
      disclaimer: { type: 'string' },
    },
    required: ['summary_line', 'headline', 'sections', 'asymmetries', 'compensations', 'routine', 'checkpoints', 'cautions', 'disclaimer'],
    additionalProperties: false,
  };
}

function systemPrompt(catalog) {
  const list = catalog.length
    ? catalog.map((e) => `- ${e.id} (${e.name || '이름 미상'}${e.zone ? ', ' + e.zone : ''})`).join('\n')
    : '- (운동 목록 없음)';
  return [
    '너는 얼굴 근육 밸런스 운동 코치다. 사용자가 자기 카메라로 잰 "표정 움직임 수치"를 읽고, 7일 동안 혼자 할 수 있는 교정 루틴을 정리해 준다.',
    '',
    '지켜야 할 선:',
    '1. 진단하지 않는다. "마비", "안면신경", "뇌신경", "질환", "증상", "치료", "처방", "정상/비정상 판정" 같은 의료 판정 표현을 쓰지 않는다.',
    '2. 수치가 크게 치우쳤더라도 원인을 추정하지 않는다. "왼쪽이 덜 올라간다" 같은 관찰과 "그래서 이 훈련을 한다"만 쓴다.',
    '3. 통증, 최근 보톡스·필러·수술, 저림이 있으면 운동보다 전문가 상담이 먼저라고 cautions에 적는다.',
    '4. 운동은 아래 목록의 id만 쓴다. 목록에 없는 운동을 만들지 않는다.',
    '5. 한국어 존댓말. 문장은 짧게. 수치는 반올림해 인용한다. 이모지·마크다운 기호·영문 약어 남발 금지.',
    '6. 겁을 주지 않는다. "교정", "밸런스", "지구력", "이완" 같은 생활 언어를 쓴다. 미용 효과를 보장하지 않는다.',
    '',
    '운동 목록(이 id만 사용):',
    list,
    '',
    '분량: sections 3개(각 250자 이내), asymmetries 1~4개, compensations 0~3개, routine 정확히 7일(하루 2~3단계, 총 8~14분), checkpoints 2~3개, cautions 1~3개, summary_line 60자 이내, headline 30자 이내.',
    'disclaimer는 다음 문장을 그대로 쓴다: "' + DISCLAIMER + '"',
  ].join('\n');
}

function userPrompt(features, catalog) {
  const zoneLines = Object.entries(features.zones)
    .map(([k, v]) => `${({ upper: '상부(눈/이마)', mid: '중부(볼/팔자)', lower: '하부(입/입꼬리)', neck: '목/턱' })[k]}: ${v}점`)
    .join(', ');
  return [
    '아래는 이번 측정의 요약 수치다. 단위는 앱 내부 상대값이고, 1.0 = 눈 사이 거리 기준 1배다.',
    JSON.stringify({ features, zone_scores_text: zoneLines, allowed_exercise_ids: catalog.map((e) => e.id) }, null, 1),
    '',
    '이 사람이 오늘 바로 시작할 수 있는 7일 루틴을 만들어라. 좌우 차이가 큰 부위부터 1~2일에 배치하고, 지구력이 낮은 부위는 주 2회 이상 반복한다.',
  ].join('\n');
}

/* Final gate. Structured outputs already match the schema; this rejects reports
 * whose content would be unsafe or unusable for a paying reader. */
function validateReport(raw, catalog) {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'invalid_output' };
  const text = (v, max) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '';
  const report = {
    summary_line: text(raw.summary_line, 90),
    headline: text(raw.headline, 40),
    sections: [],
    asymmetries: [],
    compensations: [],
    routine: [],
    checkpoints: [],
    cautions: [],
    disclaimer: text(raw.disclaimer, 200),
  };
  if (!report.summary_line || !report.headline) return { ok: false, code: 'invalid_output' };

  for (const s of Array.isArray(raw.sections) ? raw.sections.slice(0, 4) : []) {
    const title = text(s && s.title, 24);
    const body = text(s && s.body, 600);
    if (title && body) report.sections.push({ title, body });
  }
  if (report.sections.length < 2) return { ok: false, code: 'invalid_output' };

  for (const a of Array.isArray(raw.asymmetries) ? raw.asymmetries.slice(0, 4) : []) {
    const zone = ZONES.includes(a && a.zone) ? a.zone : null;
    const severity = SEVERITIES.includes(a && a.severity) ? a.severity : 'mild';
    const observation = text(a && a.observation, 160);
    const meaning = text(a && a.meaning, 160);
    if (zone && observation) report.asymmetries.push({ zone, severity, observation, meaning });
  }

  for (const c of Array.isArray(raw.compensations) ? raw.compensations.slice(0, 3) : []) {
    const name = text(c && c.name, 24);
    const reading = text(c && c.reading, 160);
    if (name && reading) report.compensations.push({ name, reading });
  }

  const allowed = new Set(catalog.map((e) => e.id));
  const nameById = new Map(catalog.map((e) => [e.id, e.name]));
  for (const day of Array.isArray(raw.routine) ? raw.routine : []) {
    const dayNo = Number(day && day.day);
    if (!Number.isInteger(dayNo) || dayNo < 1 || dayNo > 7) continue;
    const steps = [];
    for (const step of Array.isArray(day && day.steps) ? day.steps.slice(0, 3) : []) {
      const id = step && typeof step.exercise_id === 'string' ? step.exercise_id : '';
      if (allowed.size && !allowed.has(id)) continue;
      steps.push({
        exercise_id: id,
        name: nameById.get(id) || '',
        sets: text(step && step.sets, 20),
        dose: text(step && step.dose, 40),
        cue: text(step && step.cue, 120),
      });
    }
    if (!steps.length) continue;
    report.routine.push({
      day: dayNo,
      focus: text(day && day.focus, 40),
      minutes: Math.round(finiteOr(day && day.minutes, 10, 3, 30)),
      steps,
    });
  }
  report.routine.sort((a, b) => a.day - b.day);
  if (report.routine.length < 5) return { ok: false, code: 'invalid_output' };

  for (const c of Array.isArray(raw.checkpoints) ? raw.checkpoints.slice(0, 3) : []) {
    const item = text(c, 160);
    if (item) report.checkpoints.push(item);
  }
  for (const c of Array.isArray(raw.cautions) ? raw.cautions.slice(0, 3) : []) {
    const item = text(c, 200);
    if (item) report.cautions.push(item);
  }
  if (!report.checkpoints.length) return { ok: false, code: 'invalid_output' };

  // The same words appear in legitimate self-negating copy ("의료 진단이 아닙니다"),
  // so strip those phrases before scanning for an actual claim.
  const NEGATED = [
    /(?:의료\s*)?진단(?:이|은|을)?\s*(?:아니|아님|아닙니다|목적이 아님)/g,
    /진단\s*[·\/]\s*검사/g,
    /진단하지 않/g,
  ];
  function stripSelfNegation(text) {
    let out = String(text);
    for (const pattern of NEGATED) out = out.replace(pattern, ' ');
    return out;
  }
  const banned = /(진단|마비|안면신경|뇌신경|질환|처방|치료법)/;
  const visible = [report.headline, report.summary_line, ...report.sections.map((s) => s.body), ...report.asymmetries.map((a) => a.observation + a.meaning)].join(' ');
  if (banned.test(stripSelfNegation(visible))) return { ok: false, code: 'unsafe_output' };

  // The disclaimer is fixed copy: never let the model rewrite it away.
  report.disclaimer = DISCLAIMER;
  if (!report.cautions.length) report.cautions.push('통증·저림·최근 시술이나 수술이 있다면 운동을 미루고 전문가와 상담하세요.');
  return { ok: true, report };
}

function sendJson(res, status, body) {
  res.statusCode = status;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(body));
}

function createHandler(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const now = options.now || Date.now;
  const hits = new Map(); // ip -> { hourly: [t], daily: [t] }
  let globalDay = { start: 0, count: 0 };

  function limitedByIp(ip) {
    const t = now();
    const entry = hits.get(ip) || { hourly: [], daily: [] };
    entry.hourly = entry.hourly.filter((at) => t - at < HOUR_MS);
    entry.daily = entry.daily.filter((at) => t - at < DAY_MS);
    const blocked = entry.hourly.length >= PER_HOUR || entry.daily.length >= PER_DAY;
    if (!blocked) {
      entry.hourly.push(t);
      entry.daily.push(t);
    }
    hits.set(ip, entry);
    if (hits.size > 5000) hits.clear();
    return blocked;
  }

  function limitedGlobally() {
    const t = now();
    if (t - globalDay.start > DAY_MS) globalDay = { start: t, count: 0 };
    if (globalDay.count >= GLOBAL_PER_DAY) return true;
    globalDay.count += 1;
    return false;
  }

  return async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, code: 'method_not_allowed' });
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) return sendJson(res, 503, { ok: false, code: 'not_configured' });
    if (!fetchImpl) return sendJson(res, 503, { ok: false, code: 'not_configured' });

    let body = req.body;
    if (typeof body === 'string') {
      if (body.length > MAX_BODY_CHARS) return sendJson(res, 413, { ok: false, code: 'body_too_large' });
      try { body = JSON.parse(body); } catch (_) { return sendJson(res, 400, { ok: false, code: 'bad_request' }); }
    }
    if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, code: 'bad_request' });
    if (JSON.stringify(body).length > MAX_BODY_CHARS) return sendJson(res, 413, { ok: false, code: 'body_too_large' });

    const codes = parseCodes(env.FF_REPORT_ACCESS_CODES);
    const given = normalizeCode(body.code);
    if (!codes.length || !given || !codes.some((code) => safeEqual(code, given))) {
      return sendJson(res, 403, { ok: false, code: 'invalid_code' });
    }

    const features = sanitizeFeatures(body.features);
    if (!features) return sendJson(res, 400, { ok: false, code: 'insufficient_features' });
    const catalog = sanitizeCatalog(body.exercises);

    const ip = String(
      (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || 'unknown'
    ).split(',')[0].trim();
    if (limitedGlobally() || limitedByIp(ip)) return sendJson(res, 429, { ok: false, code: 'rate_limited' });

    const model = env.FF_REPORT_MODEL || DEFAULT_MODEL;
    const payload = {
      model,
      messages: [
        { role: 'system', content: systemPrompt(catalog) },
        { role: 'user', content: userPrompt(features, catalog) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'face_fitness_report', strict: true, schema: schemaFor(catalog) },
      },
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    };

    let upstream;
    try {
      upstream = await fetchImpl(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      return sendJson(res, 502, { ok: false, code: 'upstream_error' });
    }

    let data = null;
    try { data = await upstream.json(); } catch (_) { data = null; }
    if (!upstream.ok || !data) {
      const status = upstream.status === 429 ? 429 : upstream.status === 401 ? 503 : 502;
      return sendJson(res, status, {
        ok: false,
        code: status === 429 ? 'rate_limited' : status === 503 ? 'not_configured' : 'upstream_error',
      });
    }

    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.refusal) {
      return sendJson(res, 502, { ok: false, code: 'refused' });
    }
    let parsed;
    try { parsed = typeof content === 'string' ? JSON.parse(content) : content; } catch (_) { parsed = null; }
    const checked = validateReport(parsed, catalog);
    if (!checked.ok) return sendJson(res, 502, { ok: false, code: checked.code });

    const usage = data.usage || {};
    const costUsd = estimateCostUsd(model, usage);
    return sendJson(res, 200, {
      ok: true,
      report: checked.report,
      meta: {
        model,
        tokens: { input: usage.prompt_tokens || 0, output: usage.completion_tokens || 0 },
        cost_usd: Math.round(costUsd * 1e6) / 1e6,
        cost_krw: Math.round(costUsd * CURRENCY_KRW),
      },
    });
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.validateReport = validateReport;
module.exports.sanitizeFeatures = sanitizeFeatures;
module.exports.normalizeCode = normalizeCode;
module.exports.schemaFor = schemaFor;
module.exports.DISCLAIMER = DISCLAIMER;
