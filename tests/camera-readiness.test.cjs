const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {waitForMetadata,safeStatusFromError,classifyStartError}=require('../camera-readiness.js');
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

test('safe camera diagnostics expose only enumerated codes, not raw device data',()=>{
  assert.deepEqual(classifyStartError({name:'NotAllowedError'},'get-user-media'),{code:'permission-denied',step:'get-user-media'});
  assert.deepEqual(classifyStartError({name:'NotReadableError',message:'PRIVATE_CAMERA_ID'},'get-user-media'),{code:'device-not-readable',step:'get-user-media'});
  assert.deepEqual(classifyStartError({name:'NotFoundError'},'get-user-media'),{code:'device-not-found',step:'get-user-media'});
  assert.deepEqual(classifyStartError({name:'AbortError'},'get-user-media'),{code:'device-aborted',step:'get-user-media'});
  assert.deepEqual(classifyStartError({name:'OverconstrainedError'},'get-user-media'),{code:'constraints-unavailable',step:'get-user-media'});
  assert.deepEqual(classifyStartError({name:'NotSupportedError'},'video-playback'),{code:'playback-not-supported',step:'video-playback'});
  assert.deepEqual(classifyStartError({name:'Error',message:'Camera video metadata timeout'},'video-metadata'),{code:'metadata-timeout',step:'video-metadata'});
  assert.deepEqual(classifyStartError({name:'Error',message:'Camera video metadata error'},'video-metadata'),{code:'metadata-error',step:'video-metadata'});
  assert.deepEqual(classifyStartError({name:'Error',message:'private SDK details'},'facemesh-init'),{code:'model-init-failed',step:'facemesh-init'});
  assert.deepEqual(classifyStartError({name:'FakeName',message:'SECRET_TOKEN'},'random-stage'),{code:'startup-failed',step:'unknown'});
  assert.doesNotMatch(JSON.stringify(classifyStartError({name:'NotReadableError',message:'SECRET_TOKEN'},'get-user-media')),/SECRET_TOKEN/);
  assert.doesNotMatch(safeStatusFromError({name:'Other',message:'SECRET_TOKEN'}),/SECRET_TOKEN/);
});

const {fixture}=require('./assessment-harness.cjs');
const cameraReadiness=require('../camera-readiness.js');
function err(name,message='private hardware data'){
  const e=new Error(message);
  e.name=name;
  return e;
}
test('real startCamera catch reports getUserMedia failure stage and cleans timer',async()=>{
  const f=fixture({qa:false});
  f.context.FaceCameraReadiness=cameraReadiness;
  f.context.navigator.mediaDevices.getUserMedia=async()=>{throw err('NotReadableError','PRIVATE_SERIAL_123')};
  await f.run('startCamera()');
  const btn=f.element('aCamBtn'), hint=f.element('camStartHint');
  assert.equal(btn.dataset.cameraStage,'error');
  assert.equal(btn.dataset.cameraFailureCode,'device-not-readable');
  assert.equal(btn.dataset.cameraFailureStep,'get-user-media');
  assert.match(hint.textContent,/get-user-media/);
  assert.doesNotMatch(hint.textContent,/PRIVATE_SERIAL/);
  assert.equal(f.run('cameraActive'),false);
  assert.equal(f.timers.size,0);
});
test('metadata timeout stops acquired synthetic tracks and reports exact step',async()=>{
  const f=fixture({qa:false});
  let stopped=0;
  f.context.FaceCameraReadiness={...cameraReadiness,waitForMetadata:async()=>{throw new Error('Camera video metadata timeout')}};
  f.context.navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){stopped++}}]});
  await f.run('startCamera()');
  assert.equal(stopped,1);
  assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'metadata-timeout');
  assert.equal(f.element('aCamBtn').dataset.cameraFailureStep,'video-metadata');
  assert.equal(f.element('video').srcObject,null);
  assert.equal(f.element('video2').srcObject,null);
});
test('video.play rejection is distinct from device permission rejection',async()=>{
  const f=fixture({qa:false});
  let stopped=0;
  f.context.FaceCameraReadiness={...cameraReadiness,waitForMetadata:async()=>{}};
  f.context.navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){stopped++}}]});
  f.element('video').play=async()=>{throw err('NotAllowedError')};
  await f.run('startCamera()');
  assert.equal(stopped,1);
  assert.equal(f.element('aCamBtn').dataset.cameraFailureStep,'video-playback');
  assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'permission-denied');
});
test('failed FaceMesh initialize reports stage, resets model and permits retry',async()=>{
  const f=fixture({qa:false});
  let stopped=0,initializations=0;
  f.context.FaceCameraReadiness={...cameraReadiness,waitForMetadata:async()=>{}};
  f.context.navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){stopped++}}]});
  f.element('video').play=async()=>{};
  f.element('video2').play=async()=>{};
  f.element('video2').closest=()=>f.element('aVideoWrap');
  f.context.FaceMesh=function(){
    return {setOptions(){},onResults(){},async initialize(){initializations++;throw Error('SDK_PRIVATE')}}
  };
  await f.run('startCamera()');
  assert.equal(stopped,1);
  assert.equal(initializations,1);
  assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'model-init-failed');
  assert.equal(f.element('aCamBtn').dataset.cameraFailureStep,'facemesh-init');
  assert.equal(f.run('fmLoading'),false);
  assert.equal(f.run('fmLoaded'),false);
  assert.equal(f.run('faceMesh'),null);
  assert.doesNotMatch(f.element('camStartHint').textContent,/SDK_PRIVATE/);
  f.context.FaceMesh=function(){
    return {setOptions(){},onResults(){},async initialize(){initializations++}}
  };
  await f.run('loadFM()');
  assert.equal(initializations,2);
  assert.equal(f.run('fmLoading'),false);
  assert.equal(f.run('fmLoaded'),true);
});
test('missing camera readiness helper fails before opening the real camera',async()=>{
  const f=fixture({qa:false});
  f.context.FaceCameraReadiness=undefined;
  await f.run('startCamera()');
  assert.equal(f.audit.media,0);
  assert.equal(f.element('aCamBtn').disabled,true);
  assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'readiness-module-missing');
  assert.equal(f.element('aCamBtn').dataset.cameraFailureStep,'get-user-media');
  assert.equal(f.run('cameraActive'),false);
});

test('metadata exceptions use categorical codes without leaking raw exception details',()=>{
  assert.deepEqual(classifyStartError({name:'TypeError',message:'PRIVATE_METADATA'},'video-metadata'),
    {code:'metadata-type-error',step:'video-metadata'});
  assert.deepEqual(classifyStartError({name:'InvalidStateError',message:'PRIVATE_METADATA'},'video-metadata'),
    {code:'metadata-invalid-state',step:'video-metadata'});
  assert.deepEqual(classifyStartError({name:'Error',message:'PRIVATE_METADATA'},'video-metadata'),
    {code:'metadata-unclassified',step:'video-metadata'});
  assert.deepEqual(classifyStartError({name:'Other',message:'PRIVATE_METADATA'},'video-metadata'),
    {code:'metadata-unclassified',step:'video-metadata'});
  assert.deepEqual(classifyStartError({name:'Error',message:'Camera video metadata error'},'video-metadata'),
    {code:'metadata-error',step:'video-metadata'});
  assert.doesNotMatch(JSON.stringify(classifyStartError({name:'Error',message:'PRIVATE_METADATA'},'video-metadata')),/PRIVATE/);
});

test('stream inspection publishes only bounded non-identifying state',()=>{
  const live={readyState:'live',label:'PRIVATE_CAMERA_NAME',id:'PRIVATE_CAMERA_ID'};
  assert.deepEqual(cameraReadiness.inspectCameraState({readyState:0,srcObject:'PRIVATE_FRAME'},
    {getVideoTracks:()=>[live]}),
    {stream:'acquired',track:'live',videoReadyState:'0'});
  assert.deepEqual(cameraReadiness.inspectCameraState({readyState:1},
    {getVideoTracks:()=>[{readyState:'ended'}]}),
    {stream:'acquired',track:'ended',videoReadyState:'1'});
  assert.deepEqual(cameraReadiness.inspectCameraState({readyState:88},
    {getVideoTracks:()=>{throw new Error('PRIVATE_DRIVER')}}),
    {stream:'acquired',track:'unknown',videoReadyState:'unknown'});
  assert.deepEqual(cameraReadiness.inspectCameraState({readyState:0},null),
    {stream:'none',track:'none',videoReadyState:'0'});
  assert.doesNotMatch(JSON.stringify(cameraReadiness.inspectCameraState({readyState:0},
    {getVideoTracks:()=>[live]})),/PRIVATE_/);
});

test('metadata stage preserves pre-cleanup state and blocks repeated camera requests',async()=>{
  const f=fixture({qa:false});
  f.context.FaceCameraReadiness={...cameraReadiness,waitForMetadata:async()=>{
    const e=new TypeError('PRIVATE_DRIVER_MESSAGE');
    throw e;
  }};
  let calls=0,stopped=0;
  f.context.navigator.mediaDevices.getUserMedia=async()=>{
    calls++;
    return {getVideoTracks:()=>[{readyState:'live',label:'PRIVATE_CAMERA_LABEL'}],
      getTracks:()=>[{stop(){stopped++;}}]};
  };
  f.element('video').readyState=0;
  await f.run('startCamera()');
  const btn=f.element('aCamBtn');
  assert.equal(calls,1);
  assert.equal(stopped,1);
  assert.equal(btn.dataset.cameraStage,'error');
  assert.equal(btn.dataset.cameraAttemptCount,'1');
  assert.equal(btn.dataset.cameraStreamState,'acquired');
  assert.equal(btn.dataset.cameraTrackAtMetadata,'live');
  assert.equal(btn.dataset.cameraVideoReadyAtMetadata,'0');
  assert.equal(btn.dataset.cameraFailureStep,'video-metadata');
  assert.equal(btn.dataset.cameraFailureCode,'metadata-type-error');
  assert.equal(btn.disabled,true);
  assert.doesNotMatch(f.element('camStartHint').textContent,/PRIVATE_/);
  await f.run('startCamera()');
  assert.equal(calls,1);
  assert.equal(btn.dataset.cameraRetryBlocked,'true');
});

test('preexisting camera error is not mistaken for a fresh first attempt',async()=>{
  const f=fixture({qa:false});
  f.context.FaceCameraReadiness=cameraReadiness;
  f.element('aCamBtn').dataset.cameraStage='error';
  f.element('aCamBtn').dataset.cameraFailureCode='startup-failed';
  let calls=0;
  f.context.navigator.mediaDevices.getUserMedia=async()=>{calls++;throw Error('should not run');};
  await f.run('startCamera()');
  assert.equal(calls,0);
  assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'startup-failed');
  assert.equal(f.element('aCamBtn').dataset.cameraRetryBlocked,'true');
  assert.equal(f.element('aCamBtn').disabled,true);
});
