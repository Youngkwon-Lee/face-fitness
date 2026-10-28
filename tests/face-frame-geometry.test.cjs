'use strict';
// All 468-point fixtures are invented geometry; no camera, browser, or face data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const geometry = require('../face-frame-geometry.js');
const DIMS = Object.freeze({ width: 1600, height: 900 });
const ASPECT = DIMS.width / DIMS.height;

function fixture(withDepth = true) {
  const points = Array.from({ length: 468 }, () => ({ x: .5, y: .5 }));
  const positions = {
    33: [.35, .38], 263: [.65, .38], 1: [.5, .53],
    10: [.5, .2], 152: [.5, .8], 234: [.25, .5], 454: [.75, .5],
    70: [.36, .29], 300: [.64, .29], 13: [.5, .64], 14: [.5, .66],
    61: [.42, .65], 291: [.58, .65], 159: [.36, .36], 145: [.36, .40],
    386: [.64, .36], 374: [.64, .40]
  };
  for (const [i, [x, y]] of Object.entries(positions)) points[i] = { x, y };
  if (withDepth) for (const point of points) point.z = -.02;
  return points;
}
function transform(points, { scale = 1, degrees = 0, tx = 0, ty = 0, dimensions = DIMS } = {}) {
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const aspect = dimensions.width / dimensions.height;
  return points.map(p => {
    const x = p.x * ASPECT - .5 * ASPECT, y = p.y - .38;
    const out = { ...p, x: (.5 * ASPECT + tx + scale * (c * x - s * y)) / aspect,
      y: .38 + ty + scale * (s * x + c * y) };
    if (p.z !== undefined) out.z = p.z * scale * ASPECT / aspect;
    return out;
  });
}
const project = (points, reference = null, dimensions = DIMS) => geometry.project(points, reference, dimensions);
const baseline = () => project(fixture()).reference;
function near(actual, expected, tolerance = 1e-11) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}
function pointsNear(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    near(actual[i].x, expected[i].x); near(actual[i].y, expected[i].y);
    if (expected[i].z !== undefined) near(actual[i].z, expected[i].z);
  }
}
function rejected(points, code, reference = baseline(), dimensions = DIMS) {
  const result = project(points, reference, dimensions);
  assert.equal(result.ok, false); assert.equal(result.code, code);
  assert.equal(result.landmarks, null); assert.equal(result.reference, reference);
}

test('neutral frame creates a frozen numeric-only reference and fresh landmark objects', () => {
  const points = fixture(), result = project(points);
  assert.equal(result.ok, true); assert.equal(result.code, 'ok');
  assert.ok(Object.isFrozen(result.reference));
  assert.ok(Object.values(result.reference).every(Number.isFinite));
  assert.notEqual(result.landmarks, points);
  for (let i = 0; i < points.length; i++) assert.notEqual(result.landmarks[i], points[i]);
  pointsNear(result.landmarks, points);
  near(result.reference.eyeDistance, .3 * ASPECT);
});

test('combined translation, scale, and roll align in non-square image coordinates', () => {
  const points = fixture(), reference = baseline();
  const current = transform(points, { scale: 1.12, degrees: 9, tx: .035, ty: -.015 });
  const result = project(current, reference);
  assert.equal(result.ok, true); assert.equal(result.reference, reference);
  pointsNear(result.landmarks, points);
});

test('later accepted frames always align to the ORIGINAL reference, not the preceding frame', () => {
  const points = fixture(), reference = baseline();
  for (const options of [{ degrees: 10, scale: 1.1, tx: .03 },
    { degrees: -10, scale: .85, tx: -.04, ty: .025 }, { scale: 1.2 }]) {
    const result = project(transform(points, options), reference);
    assert.equal(result.ok, true); assert.equal(result.reference, reference);
    pointsNear(result.landmarks, points);
  }
});

test('mouth and brow motion survive normalization in original metric units', () => {
  const moved = fixture(); moved[14].y += .035; moved[70].y -= .025;
  const result = project(transform(moved, { scale: 1.08, degrees: 7, tx: .025 }), baseline());
  assert.equal(result.ok, true); pointsNear(result.landmarks, moved);
  near(result.landmarks[14].y - result.landmarks[13].y, .055);
  near(fixture()[70].y - result.landmarks[70].y, .025);
});

test('closed eyelids do not participate in pose eligibility', () => {
  const points = fixture();
  points[159].y = points[145].y = .38;
  points[386].y = points[374].y = .38;
  points[70].y += .05; points[300].y += .05; points[14].y += .04;
  const result = project(points, baseline());
  assert.equal(result.ok, true); pointsNear(result.landmarks, points);
});

test('no z is required and the first-frame reference remains numeric-only', () => {
  const first = project(fixture(false)); assert.equal(first.ok, true);
  assert.equal(Object.hasOwn(first.reference, 'eyeDepth'), false);
  const result = project(transform(fixture(false), { degrees: 5 }), first.reference);
  assert.equal(result.ok, true); pointsNear(result.landmarks, fixture(false));
});

test('optional depth gate is skipped if either current outer-eye depth is missing', () => {
  const points = fixture(); delete points[263].z;
  assert.equal(project(points, baseline()).ok, true);
});

test('no absolute nose-angle gate rejects reasonable neutral morphology', () => {
  const points = fixture(); points[1].x = .57; points[1].y = .62;
  const result = project(points); assert.equal(result.ok, true);
  assert.equal(project(transform(points, { degrees: 5 }), result.reference).ok, true);
});

test('invalid landmark collections reject with stable categorical codes', () => {
  for (const points of [null, {}, [], fixture().slice(0, 454)]) rejected(points, 'invalid_landmarks');
});

test('missing anchors and sparse slots reject', () => {
  for (const index of [1, 33, 263, 10, 152, 234, 454, 400]) {
    const points = fixture(); delete points[index]; rejected(points, 'invalid_landmarks');
  }
});

test('nonfinite coordinates and present but invalid optional z reject', () => {
  for (const value of [NaN, Infinity, -Infinity, '0.5', null]) {
    for (const key of ['x', 'y', 'z']) {
      const points = fixture(); points[33][key] = value;
      rejected(points, 'invalid_landmarks');
    }
  }
  const points = fixture(); points[400].x = NaN; rejected(points, 'invalid_landmarks');
});

test('coincident eye outer corners reject zero eye distance', () => {
  const points = fixture(); points[263] = { ...points[33] };
  rejected(points, 'invalid_geometry');
});

test('invalid dimensions reject without changing the original reference', () => {
  for (const dimensions of [null, {}, { width: 0, height: 900 }, { width: -1, height: 900 },
    { width: 1600, height: NaN }, { width: Infinity, height: 900 },
    { width: '1600', height: 900 }, { width: 1, height: Number.MIN_VALUE }])
    rejected(fixture(), 'invalid_dimensions', baseline(), dimensions);
  assert.equal(geometry.project(fixture()).code, 'invalid_dimensions');
});

test('invalid references do not trigger an implicit reset', () => {
  for (const reference of [{}, { ...baseline(), aspect: 0 },
    { ...baseline(), eyeDistance: NaN }, { ...baseline(), eyeDepth: Infinity }])
    rejected(fixture(), 'invalid_reference', reference);
});

test('partial out-of-frame face bounds and anchors reject', () => {
  for (const index of [10, 152, 234, 454, 1, 33, 263]) {
    const points = fixture(); points[index].x = .005;
    rejected(points, 'out_of_frame');
  }
});

test('any landmark outside the image rejects', () => {
  const points = fixture(); points[14].y = 1.001;
  rejected(points, 'out_of_frame');
});

test('implausibly small face rejects before creating a reference', () => {
  const points = fixture(); points[33].x = .49; points[263].x = .51;
  rejected(points, 'face_size', null);
});

test('implausibly large eye distance rejects in image-height units', () => {
  rejected(fixture(), 'face_size', null, { width: 3600, height: 900 });
});

test('absolute roll over 20 degrees rejects even on the first frame', () => {
  rejected(transform(fixture(), { degrees: 21 }), 'roll', null);
});

test('relative roll over 15 degrees rejects despite acceptable absolute roll', () => {
  const reference = project(transform(fixture(), { degrees: -10 })).reference;
  rejected(transform(fixture(), { degrees: 10 }), 'roll', reference);
});

test('relative scale drift rejects in both directions without rebasing', () => {
  for (const scale of [.74, 1.34]) rejected(transform(fixture(), { scale }), 'scale_drift');
});

test('nose horizontal drift rejects yaw-like changes in eye-local units', () => {
  const points = fixture(); points[1].x += .17 * .3;
  rejected(points, 'yaw_drift');
});

test('nose vertical drift rejects pitch-like changes in eye-local units', () => {
  const points = fixture(); points[1].y += .17 * .3 * ASPECT;
  rejected(points, 'pitch_drift');
});

test('outer-eye depth asymmetry drift rejects in eye-distance units', () => {
  const points = fixture(); points[263].z += .36 * .3;
  rejected(points, 'depth_drift');
});

test('eye-local nose drift remains stable under accepted roll and scale', () => {
  const points = fixture(); points[1].x += .10 * .3; points[1].y += .10 * .3 * ASPECT;
  const result = project(transform(points, { scale: 1.1, degrees: 12 }), baseline());
  assert.equal(result.ok, true); pointsNear(result.landmarks, points);
});

test('aspect-ratio change greater than two percent rejects until explicit reset', () => {
  const dimensions = { width: 1640, height: 900 };
  const points = transform(fixture(), { dimensions });
  rejected(points, 'aspect_ratio', baseline(), dimensions);
  assert.equal(project(points, null, dimensions).ok, true);
});

test('small aspect drift still maps back to ORIGINAL normalized image units', () => {
  const dimensions = { width: 1616, height: 900 };
  const points = transform(fixture(), { dimensions, degrees: 6, scale: 1.1 });
  const result = project(points, baseline(), dimensions);
  assert.equal(result.ok, true); pointsNear(result.landmarks, fixture());
});

test('same aspect at a different resolution preserves the original units', () => {
  const result = project(fixture(), baseline(), { width: 3200, height: 1800 });
  assert.equal(result.ok, true); pointsNear(result.landmarks, fixture());
});

test('frozen input and reference are never mutated on acceptance or rejection', () => {
  const reference = baseline(), referenceJSON = JSON.stringify(reference);
  const points = transform(fixture(), { degrees: 6, scale: 1.1 });
  for (const point of points) Object.freeze(point); Object.freeze(points);
  const pointsJSON = JSON.stringify(points);
  assert.equal(project(points, reference).ok, true);
  rejected(points, 'aspect_ratio', reference, { width: 1800, height: 900 });
  assert.equal(JSON.stringify(points), pointsJSON);
  assert.equal(JSON.stringify(reference), referenceJSON);
  const externalReference = { ...reference };
  assert.equal(project(points, externalReference).ok, true);
  assert.equal(Object.isFrozen(externalReference), false);
});

test('rejected first frame keeps a null reference; later failure keeps original identity', () => {
  rejected(null, 'invalid_landmarks', null);
  const reference = baseline(), bad = fixture(); bad[1].x += .1;
  rejected(bad, 'yaw_drift', reference);
  assert.equal(project(fixture(), reference).reference, reference);
});

test('above requires finite positive threshold and signed positive exceedance', () => {
  for (const value of [NaN, Infinity, -Infinity, null, undefined, '2', 0, -1, -Infinity])
    assert.equal(geometry.above(value, .1), false);
  for (const threshold of [NaN, Infinity, -Infinity, null, undefined, '.1', 0, -.1])
    assert.equal(geometry.above(1, threshold), false);
  assert.equal(geometry.above(-2, -1), false);
  assert.equal(geometry.above(.1, .1), false);
  assert.equal(geometry.above(.10001, .1), true);
});

test('UMD attaches the same API to browser-like and standalone globalThis contexts', () => {
  const source = fs.readFileSync(require.resolve('../face-frame-geometry.js'), 'utf8');
  const browserLike = {}; browserLike.window = browserLike;
  vm.runInNewContext(source, browserLike);
  assert.equal(typeof browserLike.FaceFrameGeometry.project, 'function');
  assert.equal(browserLike.window.FaceFrameGeometry, browserLike.FaceFrameGeometry);
  const commonJS = { module: { exports: {} } };
  vm.runInNewContext(source, commonJS);
  assert.equal(commonJS.module.exports, commonJS.FaceFrameGeometry);
  assert.equal(globalThis.FaceFrameGeometry, geometry);
});


test('finite depth input cannot produce nonfinite aligned output', () => {
  const points = transform(fixture(), { scale: .8 });
  points[400].z = Number.MAX_VALUE;
  rejected(points, 'invalid_geometry');
});

test('a tilted original reference retains its original roll and image coordinates', () => {
  const original = transform(fixture(), { degrees: -8, scale: .95, tx: -.02 });
  const reference = project(original).reference;
  const current = transform(fixture(), { degrees: 6, scale: 1.1, tx: .03, ty: -.01 });
  const result = project(current, reference);
  assert.equal(result.ok, true); pointsNear(result.landmarks, original);
});
