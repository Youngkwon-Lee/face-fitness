const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {waitForMetadata,safeStatusFromError}=require('../camera-readiness.js');
function fakeVideo(readyState=0){
 const listeners=new Map();
 return {
   readyState,
   listeners,
   addEventListener(e,fn){listeners.set(e,fn)},
   removeEventListener(e){listeners.delete(e)},
   fire(e){listeners.get(e)?.()},
 };
}
test('ready video resolves without waiting for a missed metadata event',async()=>{
 const v=fakeVideo(2);
 await waitForMetadata(v);
 assert.equal(v.listeners.size,0);
});
test('video resolves on late loadedmetadata and removes listeners',async()=>{
 const v=fakeVideo();
 const pending=waitForMetadata(v);
 v.fire('loadedmetadata');
 await pending;
 assert.equal(v.listeners.size,0);
});
test('metadata error and timeout reject without hanging',async()=>{
 const v=fakeVideo();
 const pending=waitForMetadata(v);
 v.fire('error');
 await assert.rejects(pending,/metadata error/);
 const clock={start(fn){this.cb=fn;return 1},stop(){}};
 const second=fakeVideo();
 const rejected=waitForMetadata(second,20,clock);
 clock.cb();
 await assert.rejects(rejected,/timeout/);
});
test('safe camera errors do not expose system details',()=>{
 assert.match(safeStatusFromError({name:'NotAllowedError'}),/권한/);
 assert.match(safeStatusFromError({name:'NotReadableError'}),/다른 앱/);
 assert.doesNotMatch(safeStatusFromError({name:'Other',message:'PRIVATE DATA'}),/PRIVATE/);
});
test('source offers face-tracked status without storing coordinates or frames',()=>{
 const s=fs.readFileSync('index.html','utf8');
 assert.match(s,/camera-readiness\.js/);
 assert.match(s,/dataset\.faceTracked = String\(facePresent\)/);
 assert.match(s,/dataset\.baselineReady = String\(!!blDone\)/);
 assert.match(s,/camBtn\.dataset\.cameraStage = 'ready'/);
});
