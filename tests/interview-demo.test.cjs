'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const demo = require('../interview-demo.js');

function fakeStorageClass() {
  const persisted = new Map();
  class Storage {}
  Storage.prototype.getItem = (k) => (persisted.has(k) ? persisted.get(k) : null);
  Storage.prototype.setItem = (k, v) => persisted.set(k, String(v));
  return { Storage, persisted };
}

test('demo flag is only ?demo=1', () => {
  assert.equal(demo.isDemo('?demo=1'), true);
  assert.equal(demo.isDemo('?assessmentQA=1&demo=1'), true);
  assert.equal(demo.isDemo(''), false);
  assert.equal(demo.isDemo('?demo=true'), false);
});

test('normal mode leaves storage untouched', () => {
  const { Storage, persisted } = fakeStorageClass();
  persisted.set('ff_history', 'old');
  const root = { location: { search: '' }, Storage };
  assert.equal(demo.install(root), false);
  assert.equal(new Storage().getItem('ff_history'), 'old');
});

test('demo mode hides existing data and never persists writes', () => {
  const { Storage, persisted } = fakeStorageClass();
  persisted.set('ff_history', 'previous user data');
  const root = { location: { search: '?demo=1' }, Storage };
  assert.equal(demo.install(root), true);
  assert.equal(root.FACE_INTERVIEW_DEMO_STORAGE_ISOLATED, true);

  const local = new Storage();
  const session = new Storage();
  assert.equal(local.getItem('ff_history'), null, 'existing device data is not shown');
  local.setItem('ff_history', '{"assess":[1]}');
  assert.equal(local.getItem('ff_history'), '{"assess":[1]}', 'works within the page');
  assert.equal(local.length, 1);
  assert.equal(local.key(0), 'ff_history');
  assert.equal(session.getItem('ff_history'), null, 'stores are separate per Storage object');
  assert.equal(persisted.get('ff_history'), 'previous user data', 'nothing reached real storage');
  local.removeItem('ff_history');
  assert.equal(local.length, 0);
});

test('index.html loads the demo module before any other script and gates cloud IO', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const firstScript = html.match(/<script[^>]*src="([^"]+)"/);
  assert.equal(firstScript[1], './interview-demo.js');
  const initBody = html.slice(html.indexOf('function initSupabase()'), html.indexOf('function initSupabase()') + 200);
  assert.match(initBody, /if \(INTERVIEW_DEMO\) return;/);
});
