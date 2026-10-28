'use strict';
// Integration regression harness: host inline script + PR #3's actual
// app-improvements wrapper. No real media, camera, account, network or storage.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {fixture,html}=require('./assessment-harness.cjs');
const wrapperSource=fs.readFileSync(path.join(__dirname,'../app-improvements.js'),'utf8');
function integrated(options={}){
  const f=fixture(options);
  f.context.__coachUpdates=[];
  f.context.__mounts=0;
  f.context.FaceMovementCoach={mount(){
    f.context.__mounts++;
    return {
      update(input){f.context.__coachUpdates.push(input);return{status:'observing'}},
      select(){},state(){return null},clear(){}
    };
  }};
  f.context.FaceExerciseCloud={save(){throw Error('Unexpected synthetic network request')}};
  f.context.performance={now(){return 1200}};
  vm.runInContext(wrapperSource,f.context,{timeout:1200});
  return f;
}
test('all PR source scripts are present once and run in required order',()=>{
  for(const script of ['assessment-safety.js','camera-readiness.js','movement-coach.js','exercise-cloud.js','app-improvements.js']){
    assert.equal((html.match(new RegExp('src=["\\\'](?:\\./)?'+script.replace('.','\\.')+'["\\\']','g'))||[]).length,1,script);
  }
  assert.ok(html.indexOf('assessment-safety.js')<html.indexOf('@mediapipe/face_mesh'));
  assert.ok(html.lastIndexOf('movement-coach.js')<html.lastIndexOf('app-improvements.js'));
  assert.ok(!html.includes('<<<<<<<'));
});
test('movement coach DOES NOT replace PR5 onResults callback; valid frame advances sequence',async()=>{
  const f=integrated({qa:false});
  f.context.__callbackRegistrations=0;
  f.context.FaceMesh=function(){
    let cb;
    return {setOptions(){},onResults(fn){f.context.__callbackRegistrations++;cb=fn;},
      async initialize(){},
      async send(){cb({multiFaceLandmarks:[[]]});}
    };
  };
  await f.run('loadFM()');
  assert.equal(f.context.__callbackRegistrations,1);
  f.run('cameraActive=true;drawFaceOnBoth=()=>{};analyzeFrame=()=>{};lastVideoTime=-1');
  Object.assign(f.element('video'),{videoWidth:640,videoHeight:480,readyState:4,currentTime:1});
  f.context.requestAnimationFrame=()=>{};
  await f.run('frameLoop()');
  assert.equal(f.run('faceResultSequence'),1);
  assert.equal(f.run('cameraActive'),true);
  assert.equal(f.context.__callbackRegistrations,1);
  assert.equal(f.context.__coachUpdates.length,1);
  assert.equal(f.context.__coachUpdates[0].resultTime,1200);
});
test('missing callback fails closed and invalidates camera + coach reading',async()=>{
  const f=integrated({qa:false});
  f.context.FaceMesh=function(){
    return {setOptions(){},onResults(){},async initialize(){},async send(){}};
  };
  await f.run('loadFM()');
  f.run('cameraActive=true;lastVideoTime=-1');
  Object.assign(f.element('video'),{videoWidth:640,videoHeight:480,readyState:4,currentTime:1});
  f.context.requestAnimationFrame=()=>{};
  await f.run('frameLoop()');
  assert.equal(f.run('cameraActive'),false);
  assert.equal(f.run('assessPhase'),'blocked');
  assert.equal(f.element('aCamBtn').dataset.faceTracked,'false');
  assert.equal(f.element('aCamBtn').dataset.cameraStage,'tracking-lost');
  assert.equal(f.context.__coachUpdates[0].cameraActive,false);
  assert.equal(f.audit.storageWrites,0);
});
test('QA mode sidecar never reads/writes history and blocks overridden save/sync/bootstrap',async()=>{
  const f=integrated();
  const start={...f.audit};
  const history=f.run('FaceHistoryView.read()');
  assert.equal(history.assess.length,0);
  assert.equal(history.exercise.length,0);
  f.run('renderHistory()');
  const save=await f.run('saveExToHistory(90)');
  assert.equal(save.code,'qa_blocked');
  const cloud=await f.run('cloudSaveExercise({})');
  assert.equal(cloud.code,'qa_blocked');
  const bootstrap=await f.run('bootstrapPersonalContext()');
  assert.equal(bootstrap.personId,null);
  await f.run('syncCloudHistory()');
  assert.deepEqual(f.audit,start);
});
test('missing policy module leaves sidecar storage and camera access blocked',async()=>{
  const f=integrated({qa:false,missingPolicy:true});
  f.run('renderHistory()');
  await f.run('saveExToHistory(90)');
  assert.equal(f.audit.storageReads,0);
  assert.equal(f.audit.storageWrites,0);
  assert.equal(f.audit.media,0);
  assert.equal(f.audit.client,0);
});
test('rejected FaceMesh.send stops tracking, clears stream and prevents stale assessment',async()=>{
  const f=integrated({qa:false});
  f.context.FaceMesh=function(){return {setOptions(){},onResults(){},async initialize(){},async send(){throw Error('Synthetic media failure');}}};
  await f.run('loadFM()');
  f.run('cameraActive=true;lastVideoTime=-1');
  Object.assign(f.element('video'),{videoWidth:640,videoHeight:480,readyState:4,currentTime:1});
  f.context.requestAnimationFrame=()=>{};
  await assert.doesNotReject(f.run('frameLoop()'));
  assert.equal(f.run('cameraActive'),false);
  assert.equal(f.run('assessPhase'),'blocked');
  assert.equal(f.element('aCamBtn').dataset.cameraStage,'tracking-lost');
  assert.equal(f.context.__coachUpdates[0].cameraActive,false);
  assert.equal(f.audit.storageWrites,0);
});
test('multiple MediaPipe callbacks in one send fail closed',async()=>{
  const f=integrated({qa:false});
  f.context.FaceMesh=function(){let cb;return {setOptions(){},onResults(fn){cb=fn},async initialize(){},async send(){cb({multiFaceLandmarks:[]});cb({multiFaceLandmarks:[]})}}};
  await f.run('loadFM()');
  f.run('cameraActive=true;lastVideoTime=-1');
  Object.assign(f.element('video'),{videoWidth:640,videoHeight:480,readyState:4,currentTime:1});
  f.context.requestAnimationFrame=()=>{};
  await f.run('frameLoop()');
  assert.equal(f.run('cameraActive'),false);
  assert.equal(f.run('assessPhase'),'blocked');
  assert.equal(f.audit.storageWrites,0);
});
