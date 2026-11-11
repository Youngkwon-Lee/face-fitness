/* Pure 2D similarity alignment. Limits below are engineering heuristics, NOT
 * a validated head-pose estimator, full 3D correction, or clinical accuracy
 * guarantee. Reset explicitly by passing null when the capture setup changes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FaceFrameGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RAD = Math.PI / 180;
  const LIMIT = Object.freeze({ margin: .01, minEye: .07, maxEye: 1,
    absoluteRoll: 20 * RAD, relativeRoll: 15 * RAD, minScale: .75,
    maxScale: 1.33, nose: .16, depth: .35, aspect: .02 });
  const ANCHORS = [33, 263, 1, 10, 152, 234, 454];
  const REF_KEYS = ['version', 'aspect', 'eyeX', 'eyeY', 'eyeDistance',
    'roll', 'noseHorizontal', 'noseVertical'];
  const finite = Number.isFinite;
  const angle = value => Math.atan2(Math.sin(value), Math.cos(value));

  function above(value, threshold) {
    return finite(value) && finite(threshold) && threshold > 0 && value > threshold;
  }

  function validReference(ref) {
    return ref && typeof ref === 'object' && !Array.isArray(ref) &&
      REF_KEYS.every(key => finite(ref[key])) && ref.version === 1 &&
      ref.aspect > 0 && ref.eyeDistance >= LIMIT.minEye &&
      ref.eyeDistance <= LIMIT.maxEye && Math.abs(ref.roll) <= LIMIT.absoluteRoll &&
      (ref.eyeDepth === undefined || finite(ref.eyeDepth));
  }

  function project(landmarks, reference = null, dimensions = {}) {
    const reject = code => ({ ok: false, code, reference, landmarks: null });
    if (!dimensions || !finite(dimensions.width) || !finite(dimensions.height) ||
        dimensions.width <= 0 || dimensions.height <= 0) return reject('invalid_dimensions');
    const aspect = dimensions.width / dimensions.height;
    if (!finite(aspect) || aspect <= 0) return reject('invalid_dimensions');
    if (reference !== null && !validReference(reference)) return reject('invalid_reference');
    if (reference && Math.abs(aspect / reference.aspect - 1) > LIMIT.aspect)
      return reject('aspect_ratio');
    if (!Array.isArray(landmarks) || landmarks.length < 455)
      return reject('invalid_landmarks');
    // Check every point, including sparse array holes, before producing output.
    for (let i = 0; i < landmarks.length; i++) {
      const p = landmarks[i];
      if (!p || !finite(p.x) || !finite(p.y) ||
          (p.z !== undefined && !finite(p.z))) return reject('invalid_landmarks');
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return reject('out_of_frame');
    }
    // These cardinal bounds approximate the full face extent; anchor safety
    // margins also prevent accepting geometry clipped at an image boundary.
    if (ANCHORS.some(i => {
      const p = landmarks[i], m = LIMIT.margin;
      return p.x < m || p.x > 1 - m || p.y < m || p.y > 1 - m;
    })) return reject('out_of_frame');

    const left = landmarks[33], right = landmarks[263], nose = landmarks[1];
    const dx = (right.x - left.x) * aspect, dy = right.y - left.y;
    const eyeDistance = Math.hypot(dx, dy);
    if (!finite(eyeDistance) || eyeDistance === 0) return reject('invalid_geometry');
    if (eyeDistance < LIMIT.minEye || eyeDistance > LIMIT.maxEye) return reject('face_size');
    const roll = Math.atan2(dy, dx), c = Math.cos(roll), s = Math.sin(roll);
    if (Math.abs(roll) > LIMIT.absoluteRoll) return reject('roll');
    const eyeX = (left.x + right.x) * aspect / 2;
    const eyeY = (left.y + right.y) / 2;
    const nx = nose.x * aspect - eyeX, ny = nose.y - eyeY;
    const noseHorizontal = (nx * c + ny * s) / eyeDistance;
    const noseVertical = (-nx * s + ny * c) / eyeDistance;
    // MediaPipe z is approximately in normalized image-width units, like x.
    const eyeDepth = finite(left.z) && finite(right.z)
      ? (right.z - left.z) * aspect / eyeDistance : undefined;
    if (![eyeX, eyeY, noseHorizontal, noseVertical].every(finite) ||
        (eyeDepth !== undefined && !finite(eyeDepth))) return reject('invalid_geometry');

    let fixed = reference;
    if (fixed) {
      if (Math.abs(angle(roll - fixed.roll)) > LIMIT.relativeRoll) return reject('roll');
      const relativeScale = eyeDistance / fixed.eyeDistance;
      if (relativeScale < LIMIT.minScale || relativeScale > LIMIT.maxScale)
        return reject('scale_drift');
      if (Math.abs(noseHorizontal - fixed.noseHorizontal) > LIMIT.nose) return reject('yaw_drift');
      if (Math.abs(noseVertical - fixed.noseVertical) > LIMIT.nose) return reject('pitch_drift');
      if (eyeDepth !== undefined && fixed.eyeDepth !== undefined &&
          Math.abs(eyeDepth - fixed.eyeDepth) > LIMIT.depth) return reject('depth_drift');
    } else {
      // Flat, numeric-only, immutable reference. No face images or point arrays.
      fixed = { version: 1, aspect, eyeX, eyeY, eyeDistance, roll,
        noseHorizontal, noseVertical };
      if (eyeDepth !== undefined) fixed.eyeDepth = eyeDepth;
      Object.freeze(fixed);
    }
    // No absolute nose/frontality gate: neutral morphology varies. A first
    // frame already yawed/pitched may become the baseline. Missing z disables
    // the optional depth comparison, never the 2D nose drift gates.
    const scale = fixed.eyeDistance / eyeDistance;
    const rotation = fixed.roll - roll, cr = Math.cos(rotation), sr = Math.sin(rotation);
    const aligned = landmarks.map(p => {
      const x = p.x * aspect - eyeX, y = p.y - eyeY;
      const out = { ...p,
        x: (fixed.eyeX + scale * (x * cr - y * sr)) / fixed.aspect,
        y: fixed.eyeY + scale * (x * sr + y * cr) };
      // Scale only: no attempt to infer a 3D rotation or depth translation.
      if (p.z !== undefined) out.z = p.z * (aspect * scale / fixed.aspect);
      return out;
    });
    if (aligned.some(p => !finite(p.x) || !finite(p.y) ||
        (p.z !== undefined && !finite(p.z)))) return reject('invalid_geometry');
    return { ok: true, code: 'ok', reference: fixed, landmarks: aligned };
  }
  return Object.freeze({ project, above });
});
