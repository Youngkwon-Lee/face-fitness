// Run: node --test movement-coach.test.mjs
// Synthetic landmarks only. No camera, storage, network or personal data.
import test from 'node:test';
import assert from 'node:assert/strict';
import './movement-coach.js';
const coach = globalThis.FaceMovementCoach;
const eyeExercise = { id: 'eye_v', phase: 'eyeSquint' };
const resistanceExercise = { id: 'brow_press', phase: 'browRaise' };
function face() {
  const points = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  const values = {
    10:[0.5,0.2],33:[0.30,0.45],133:[0.42,0.45],263:[0.70,0.45],362:[0.58,0.45],
    66:[0.33,0.36],105:[0.39,0.36],296:[0.67,0.36],334:[0.61,0.36],
    144:[0.34,0.47],153:[0.38,0.47],373:[0.66,0.47],380:[0.62,0.47],
    160:[0.34,0.43],158:[0.38,0.43],387:[0.66,0.43],385:[0.62,0.43],
    107:[0.46,0.36],336:[0.54,0.36]
  };
  for (const [index, pair] of Object.entries(values)) points[index] = { x: pair[0], y: pair[1] };
  return points;
}
function transform(points, { scale = 1, roll = 0, dx = 0, dy = 0 } = {}) {
  const c = Math.cos(roll), s = Math.sin(roll);
  return points.map(p => {
    const x = (p.x - 0.5) * scale, y = (p.y - 0.5) * scale;
    return { x: 0.5 + x*c - y*s + dx, y: 0.5 + x*s + y*c + dy };
  });
}
function near(a, b) { assert.ok(Math.abs(a-b) < 1e-10, `${a} differs from ${b}`); }
function readyTracker() {
  const tracker = coach.createTracker();
  tracker.calibrate();
  for (let time = 0; time <= 1500; time += 100) tracker.update({ time, resultTime:time, cameraActive:true, landmarks:face(), exercise:eyeExercise });
  assert.equal(tracker.state().status, 'observing');
  return tracker;
}

test('missing or non-finite landmarks do not produce numbers', () => {
  assert.equal(coach.geometry(null), null);
  const lm = face(); lm[66].x = NaN;
  assert.equal(coach.geometry(lm), null);
});
for (const [name, motion] of [
  ['translation',{dx:0.04,dy:-0.03}],['uniform scale',{scale:1.15}],
  ['roll',{roll:0.12}],['combined rigid image motion',{scale:1.1,roll:0.14,dx:0.02,dy:0.02}]
]) {
  test(name + ' does not become eyebrow or eyelid movement', () => {
    const base = coach.geometry(face());
    const changed = coach.geometry(transform(face(), motion));
    const delta = coach.changes(changed, base);
    for (const value of Object.values(delta)) near(value, 0);
  });
}
test('eyebrow movement is separate from lower and upper eyelid movement', () => {
  const lm = face(); lm[66].y -= 0.01; lm[105].y -= 0.01;
  const d = coach.changes(coach.geometry(lm), coach.geometry(face()));
  assert.ok(d.browL > 0); near(d.browR, 0); near(d.lowerL, 0); near(d.upperL, 0);
});
test('lower eyelid rise does not become upper eyelid descent', () => {
  const lm = face(); lm[144].y -= 0.006; lm[153].y -= 0.006;
  const d = coach.changes(coach.geometry(lm), coach.geometry(face()));
  assert.ok(d.lowerL > 0); near(d.upperL, 0); near(d.browL, 0);
});
test('upper eyelid descent is independently represented', () => {
  const lm = face(); lm[160].y += 0.006; lm[158].y += 0.006;
  const d = coach.changes(coach.geometry(lm), coach.geometry(face()));
  assert.ok(d.upperL > 0); near(d.lowerL, 0);
});
test('neutral calibration must be deliberate', () => {
  const tracker = coach.createTracker();
  const state = tracker.update({time:0,resultTime:0,cameraActive:true,landmarks:face(),exercise:eyeExercise});
  assert.equal(state.status, 'needs_baseline'); assert.equal(state.delta, null);
});
test('face loss clears measurements instead of freezing old values', () => {
  const tracker = readyTracker();
  const state = tracker.update({time:1600,resultTime:1600,cameraActive:true,landmarks:null,exercise:eyeExercise});
  assert.equal(state.status, 'tracking_lost'); assert.equal(state.delta, null);
});
test('stale model output and stalled callbacks cannot look live', () => {
  const tracker = readyTracker();
  const state = tracker.update({time:2400,resultTime:1500,cameraActive:true,landmarks:face(),exercise:eyeExercise});
  assert.equal(state.status, 'tracking_lost'); assert.equal(state.delta, null);
  assert.equal(tracker.stale(3300).status, 'tracking_lost');
});
test('large head roll or distance change asks for pose checking', () => {
  const tracker = readyTracker();
  const state = tracker.update({time:1600,resultTime:1600,cameraActive:true,landmarks:transform(face(),{roll:0.5}),exercise:eyeExercise});
  assert.equal(state.status, 'pose_check'); assert.equal(state.delta, null);
});
test('fresh calibration can acquire a new distance', () => {
  const tracker = readyTracker(); tracker.calibrate();
  const lm = transform(face(), {scale:1.35});
  for (let time=1700;time<=3200;time+=100) tracker.update({time,resultTime:time,cameraActive:true,landmarks:lm,exercise:eyeExercise});
  assert.equal(tracker.state().status, 'observing');
});
test('resistance exercise does not call its target muscle a compensation', () => {
  const zero = Object.fromEntries(['browL','browR','lowerL','lowerR','upperL','upperR','glabella'].map(k=>[k,0]));
  const noise = Object.fromEntries(Object.keys(zero).map(k=>[k,0.006]));
  const info = coach.describe(resistanceExercise, zero, noise);
  assert.ok(info.companion.includes('목표'));
  assert.ok(info.cue.includes('힘이 약하다고 판정하지 않습니다'));
  assert.equal(info.cue.includes('더 힘'), false);
});
test('V eye feedback identifies eyebrow co-movement without claiming EMG', () => {
  const d={browL:0.04,browR:0.03,lowerL:0.02,lowerR:0.02,upperL:0,upperR:0,glabella:0};
  const noise=Object.fromEntries(Object.keys(d).map(k=>[k,0.006]));
  const info=coach.describe(eyeExercise,d,noise);
  assert.ok(info.companion.includes('눈썹도 함께'));
  assert.equal(info.cue.includes('활성화'),false);
});

test('nonsquare video aspect preserves rigid-roll invariance', () => {
  const aspect=4/3, angle=0.14, c=Math.cos(angle), s=Math.sin(angle);
  const changed=face().map(p=>{const x=(p.x-.5)*aspect,y=p.y-.5;return {x:.5+(x*c-y*s)/aspect,y:.5+x*s+y*c};});
  const delta=coach.changes(coach.geometry(changed,aspect),coach.geometry(face(),aspect));
  for(const value of Object.values(delta)) near(value,0);
});
test('callback outage cannot count toward neutral calibration duration', () => {
  const tracker=coach.createTracker();tracker.calibrate();
  for(let time=0;time<=550;time+=50) tracker.update({time,resultTime:time,cameraActive:true,landmarks:face(),exercise:eyeExercise});
  tracker.stale(5000);
  const state=tracker.update({time:5100,resultTime:5100,cameraActive:true,landmarks:face(),exercise:eyeExercise});
  assert.equal(state.status,'calibrating');assert.equal(state.progress,0);
});
test('watchdog clears stored state, not just the currently visible panel', () => {
  const tracker=readyTracker();tracker.stale(2500);
  assert.equal(tracker.state().status,'tracking_lost');assert.equal(tracker.state().delta,null);
});
test('lowered eyebrows are not called near neutral', () => {
  const d={browL:-.1,browR:-.1,lowerL:.02,lowerR:.02,upperL:0,upperR:0,glabella:0};
  const noise=Object.fromEntries(Object.keys(d).map(k=>[k,.006]));
  assert.ok(coach.describe(eyeExercise,d,noise).companion.includes('내려가는'));
});
test('each side uses its own calibration noise', () => {
  const d={browL:.02,browR:0,lowerL:.02,lowerR:.02,upperL:0,upperR:0,glabella:0};
  const noise={browL:.006,browR:.03,lowerL:.006,lowerR:.006,upperL:.006,upperR:.006,glabella:.006};
  assert.ok(coach.describe(eyeExercise,d,noise).companion.includes('올라가는'));
});

test('resistance demo does not demand visible lift or eyelid movement',()=>{const item=coach.demoExample(resistanceExercise,0);assert.equal(item.delta.browL,0);assert.equal(item.delta.lowerL,0);});
test('brow exercise demo shows glabellar co-movement instead of eye exercise cues',()=>{const item=coach.demoExample(resistanceExercise,1);assert.ok(item.delta.glabella>0);assert.equal(item.delta.lowerL,0);});
test('all exercise demos have an explicit tracking-lost state',()=>{assert.equal(coach.demoExample(eyeExercise,2).lost,true);assert.equal(coach.demoExample(resistanceExercise,2).lost,true);});

test('brow exercise target numbers describe brows, not eyelids',()=>{const d={browL:.02,browR:.03,lowerL:.01,lowerR:.01,glabella:.01};const labels=coach.movementLabels(resistanceExercise,d);assert.ok(labels.target.startsWith('눈썹 높이'));assert.ok(labels.companion.includes('미간 간격'));});
test('eye exercise target numbers describe lower eyelids',()=>{const d={browL:0,browR:0,lowerL:.01,lowerR:.02,glabella:0};const labels=coach.movementLabels(eyeExercise,d);assert.ok(labels.target.includes('아래 눈꺼풀'));assert.ok(labels.target.includes('+2.0%'));});
