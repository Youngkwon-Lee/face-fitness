// The same five assertions fail against pinned original main and pass with this fix.
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./assessment-harness.cjs');
test('REGRESSION 1: QA static completion never calls captureSnapshot',()=>{const f=fixture();f.run('globalThis.captureCalls=0;captureSnapshot=()=>{captureCalls++;return null}');f.staticDone();assert.equal(f.run('assessPhase'),'static-done');assert.equal(f.run('captureCalls'),0);});
test('REGRESSION 2: QA dynamic completion never calls saveAssessToHistory',()=>{const f=fixture();f.run('globalThis.saveCalls=0;saveAssessToHistory=()=>{saveCalls++}');f.staticDone();f.run('startDynamicPhase()');f.drain();assert.equal(f.run('assessPhase'),'done');assert.equal(f.run('saveCalls'),0);});
test('REGRESSION 3: zero-sample static is blocked, not static-done',()=>{const f=fixture({samples:false});f.setReady();f.run('startStaticPhase()');f.drain();assert.equal(f.run('assessPhase'),'blocked');});
test('REGRESSION 4: missing dynamic measurements do not render or save scores',()=>{const f=fixture();f.staticDone();f.setSamples(false);f.run('startDynamicPhase()');f.drain();assert.equal(f.run('assessPhase'),'blocked');assert.equal(f.element('assessOverlay').classList.contains('visible'),false);assert.equal(f.audit.storageWrites,0);});
test('REGRESSION 5: Phase 2 cannot start before completed static baseline',()=>{const f=fixture();f.setReady();f.run('startDynamicPhase()');assert.equal(f.run('assessPhase'),'blocked');assert.equal(f.timers.size,0);});
