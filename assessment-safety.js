/* Data-completeness gates, NOT clinically validated thresholds or accuracy. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.FaceAssessmentSafety = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const MIN_SAMPLES = 20;
  const MAX_BASELINE_AGE_MS = 120000; // Engineering expiry, not clinical reliability.
  const MAX_SAMPLE_GAP_MS = 1000;
  const TEST_IDS = Object.freeze(['baseline','smile','browRaise','eyeClose','mouthOpen','lipSeal']);
  const FRAME_KEYS = Object.freeze(['cornerLY','cornerRY','browLY','browRY','earL','earR','mouthH','mouthW','glabellarD','foreheadY','relSmileL','relSmileR','relBrowL','relBrowR','relJaw','corrugator','frontalBrow','platysma','symScore']);
  const RESULT_KEYS = Object.freeze(['smileL','smileR','maxSmileL','maxSmileR','browL','browR','maxBrowL','maxBrowR','earL','earR','jaw','maxJaw','corrugator','frontalComp','platysma','sym']);
  const BASE_KEYS = Object.freeze(['leftCornerY','rightCornerY','leftBrowY','rightBrowY','earL','earR','jawH','mouthW','glabellarD','foreheadY']);
  const finiteKeys = (value, keys) => !!value && keys.every(key => Number.isFinite(value[key]));
  function baselineReady(bl, done) {
    return done === true && Number.isInteger(bl?.n) && bl.n >= 45 && finiteKeys(bl, BASE_KEYS) &&
      bl.earL > 0 && bl.earR > 0 && bl.mouthW > 0 && bl.glabellarD > 0;
  }
  function validateSamples(test, samples, now) {
    if (!TEST_IDS.includes(test?.id) || !Number.isFinite(test.duration) || test.duration <= 0 || !Number.isFinite(now)) return {ok:false,code:'invalid_test'};
    if (!Array.isArray(samples) || samples.length < MIN_SAMPLES) return {ok:false,code:'insufficient_samples'};
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (!finiteKeys(s, FRAME_KEYS) || !Number.isFinite(s._sampleAt) || s.symScore < 0 || s.symScore > 100 || (test.id === 'eyeClose' ? s.earL < 0 || s.earR < 0 : s.earL <= 0 || s.earR <= 0) || s.mouthW <= 0 || s.glabellarD <= 0 || s.mouthH < 0) return {ok:false,code:'invalid_sample'};
      if (i && s._sampleAt <= samples[i-1]._sampleAt) return {ok:false,code:'duplicate_or_reversed_time'};
      if (i && s._sampleAt - samples[i-1]._sampleAt > MAX_SAMPLE_GAP_MS) return {ok:false,code:'interrupted_capture'};
    }
    const first = samples[0]._sampleAt, last = samples[samples.length-1]._sampleAt;
    if (last > now || now-last > 1000) return {ok:false,code:'stale_samples'};
    // Engineering floor: samples must span at least half the scheduled task.
    if (last-first < Math.max(1000, test.duration*500) || now-first > test.duration*1000+1000) return {ok:false,code:'insufficient_time_coverage'};
    return {ok:true,code:'complete',n:samples.length};
  }
  function validResult(result) {
    return finiteKeys(result, RESULT_KEYS) && Number.isInteger(result.n) && result.n >= MIN_SAMPLES && result.earL >= 0 && result.earR >= 0 && result.sym >= 0 && result.sym <= 100;
  }
  function complete(results, validated, bl, done) {
    return baselineReady(bl,done) && results.baseline?.earL > 0 && results.baseline?.earR > 0 && TEST_IDS.every(id => validated.has(id) && validResult(results[id]));
  }
  function baselineSignature(bl) { return JSON.stringify(BASE_KEYS.map(key => bl?.[key]).concat(bl?.n)); }
  return Object.freeze({MIN_SAMPLES,MAX_BASELINE_AGE_MS,MAX_SAMPLE_GAP_MS,baselineSignature,TEST_IDS,FRAME_KEYS,RESULT_KEYS,BASE_KEYS,baselineReady,validateSamples,validResult,complete});
});
