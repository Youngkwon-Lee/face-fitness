'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../camera-readiness.js'), 'utf8');

// Node timers accept an arbitrary receiver. Model browser global receiver checks
// without a real camera, video, storage, network, or browser/media fixture.
function browserClockFixture() {
  const context = vm.createContext({module: {exports: {}}});
  vm.runInContext(
    '"use strict";' +
    'const pending = new Map(); let next = 0, starts = 0, stops = 0;' +
    'globalThis.setTimeout = function(callback) {' +
      'if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");' +
      'starts++; const id = ++next; pending.set(id, callback); return id;' +
    '};' +
    'globalThis.clearTimeout = function(id) {' +
      'if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");' +
      'stops++; pending.delete(id);' +
    '};' +
    'globalThis.clockAudit = {' +
      'get starts() { return starts; }, get stops() { return stops; },' +
      'get pending() { return pending.size; },' +
      'fire() { const callback = pending.values().next().value; if (callback) callback(); }' +
    '};', context);
  vm.runInContext(source, context, {filename: 'camera-readiness.js'});
  return {api: context.module.exports, clock: context.clockAudit};
}
function fakeVideo() {
  const listeners = new Map();
  return {
    readyState: 0, listeners,
    addEventListener(event, callback) { listeners.set(event, callback); },
    removeEventListener(event) { listeners.delete(event); },
    fire(event) { listeners.get(event)?.(); }
  };
}
function observe(promise) {
  // Consume rejections even when an early regression assertion fails.
  return promise.then(() => ({ok: true}), error => ({ok: false, error}));
}

test('default browser timers preserve receiver on late metadata and cleanup', async () => {
  const f = browserClockFixture(), video = fakeVideo();
  const result = observe(f.api.waitForMetadata(video));
  assert.equal(f.clock.starts, 1);
  assert.equal(f.clock.pending, 1);
  video.fire('loadedmetadata');
  assert.equal((await result).ok, true);
  assert.equal(f.clock.stops, 1);
  assert.equal(f.clock.pending, 0);
  assert.equal(video.listeners.size, 0);
});

test('default browser timers preserve receiver on timeout and cleanup', async () => {
  const f = browserClockFixture(), video = fakeVideo();
  const result = observe(f.api.waitForMetadata(video, 20));
  assert.equal(f.clock.starts, 1);
  f.clock.fire();
  const settled = await result;
  assert.equal(settled.ok, false);
  assert.match(settled.error.message, /Camera video metadata timeout/);
  assert.equal(f.clock.stops, 1);
  assert.equal(f.clock.pending, 0);
  assert.equal(video.listeners.size, 0);
});

test('default browser timers preserve receiver on metadata error and cleanup', async () => {
  const f = browserClockFixture(), video = fakeVideo();
  const result = observe(f.api.waitForMetadata(video));
  assert.equal(f.clock.starts, 1);
  video.fire('error');
  const settled = await result;
  assert.equal(settled.ok, false);
  assert.match(settled.error.message, /Camera video metadata error/);
  assert.equal(f.clock.stops, 1);
  assert.equal(f.clock.pending, 0);
  assert.equal(video.listeners.size, 0);
});
