'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,html}=require('./assessment-harness.cjs');
const readiness=require('../camera-readiness.js');

function mesh(){
 const p=Array.from({length:468},()=>({x:.5,y:.5,z:0}));
 const put=(i,x,y)=>p[i]={x,y,z:0};
 put(33,.35,.35);put(263,.65,.35);put(1,.5,.5);
 put(10,.5,.12);put(151,.5,.2);put(152,.5,.83);put(234,.23,.48);put(454,.77,.48);
 put(133,.45,.35);put(160,.39,.34);put(144,.39,.36);put(158,.41,.34);put(153,.41,.36);
 put(362,.55,.35);put(387,.59,.34);put(373,.59,.36);put(385,.61,.34);put(380,.61,.36);
 put(66,.38,.28);put(105,.42,.28);put(296,.58,.28);put(334,.62,.28);
 put(61,.42,.65);put(291,.58,.65);put(13,.5,.64);put(14,.5,.66);put(107,.46,.29);put(336,.54,.29);
 return p;
}

test('zero and negative live signals do not produce false warnings',()=>{
 const f=fixture({qa:false});
 f.run('Object.assign(metrics,{relSmileL:0,relBrowL:0,frontalBrow:0,corrugator:0});updateLiveUI();');
 for(const id of ['fbCorner','fbBrow','fbFront','fbMigang'])assert.match(f.element(id).className,/good/);
 f.run('Object.assign(metrics,{relSmileL:-.1,relBrowL:-.1,frontalBrow:-.1,corrugator:-.1});updateLiveUI();');
 for(const id of ['fbCorner','fbBrow','fbFront','fbMigang'])assert.match(f.element(id).className,/good/);
 f.run('metrics.relSmileL=.003;updateLiveUI();');
 assert.match(f.element('fbCorner').className,/bad/);
});

test('missing framing module fails before any media request',async()=>{
 const f=fixture({qa:false});f.context.FaceCameraReadiness=readiness;f.context.FaceFrameGeometry=undefined;
 await f.run('startCamera()');
 assert.equal(f.audit.media,0);
 assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'geometry-module-missing');
 assert.equal(f.element('aCamBtn').disabled,true);
});

test('translated frames are analyzed in fixed baseline coordinates without storing landmarks',()=>{
 const f=fixture({qa:false});f.context.__mesh=mesh();
 f.run('cameraActive=true;analyzeFrame(__mesh,Date.now());');
 const first=f.run('JSON.stringify({brow:metrics.browLY,corner:metrics.cornerLY,forehead:metrics.foreheadY})');
 f.context.__mesh=mesh().map(p=>({...p,x:p.x+.04,y:p.y+.04}));
 f.run('analyzeFrame(__mesh,Date.now());');
 const second=JSON.parse(f.run('JSON.stringify({brow:metrics.browLY,corner:metrics.cornerLY,forehead:metrics.foreheadY})'));
 const before=JSON.parse(first);
 for(const k of Object.keys(before))assert.ok(Math.abs(before[k]-second[k])<1e-10,k);
 assert.equal(f.run('facePoseReady'),true);
 assert.equal(f.audit.storageWrites,0);assert.equal(f.audit.network,0);assert.equal(f.audit.images,0);
});

test('pose loss blocks an active assessment, clears live signals and prevents a result/save',()=>{
 const f=fixture({qa:false});f.setReady();
 f.run("assessPhase='dynamic';assessActive=true;Object.assign(metrics,{relSmileL:.1});setFacePoseUnavailable('yaw_drift');");
 assert.equal(f.run('assessPhase'),'blocked');assert.equal(f.run('assessActive'),false);
 assert.equal(f.run('facePoseReady'),false);assert.equal(f.run('Object.keys(metrics).length'),0);
 assert.equal(f.element('aCamBtn').dataset.poseQuality,'align');
 assert.equal(f.element('poseGuide').hidden,false);assert.equal(f.element('aStartBtn').disabled,true);
 assert.match(f.element('fbCorner').className,/neutral/);
 f.run('finishDynamicPhase();saveAssessToHistory();');
 assert.equal(f.audit.storageWrites,0);assert.equal(f.audit.images,0);assert.equal(f.audit.network,0);
});

test('pose loss cancels exercise state and a late set cannot restart or save',()=>{
 const f=fixture({qa:false});f.setReady();
 f.run("exState='countdown';seqMode=true;exMeasureBuf.push({sample:1});setFacePoseUnavailable('scale_drift');beginExSet();finishExercise();");
 assert.equal(f.run('exState'),'idle');assert.equal(f.run('seqMode'),false);
 assert.equal(f.run('exMeasureBuf.length'),0);assert.equal(f.element('pStartBtn').disabled,true);
 assert.equal(f.audit.storageWrites,0);assert.equal(f.audit.network,0);
});

test('explicit reframing clears only in-memory measurement state and requires a new baseline',()=>{
 const f=fixture({qa:false});f.setReady();
 f.run("assessPhase='static-done';staticSnapshot='synthetic-not-an-image';resetFaceFraming();");
 assert.equal(f.run('BL.n'),0);assert.equal(f.run('blDone'),false);assert.equal(f.run('facePoseReference'),null);
 assert.equal(f.run('assessPhase'),'idle');assert.equal(f.run('staticSnapshot'),null);
 assert.equal(f.element('aStartBtn').disabled,true);assert.equal(f.audit.storageWrites,0);
});

test('assessment cannot start while framing is not ready',()=>{
 const f=fixture({qa:false});f.setReady();f.run('facePoseReady=false;startStaticPhase();');
 assert.equal(f.run('assessPhase'),'blocked');assert.equal(f.audit.images,0);assert.equal(f.audit.storageWrites,0);
});

test('live guide image is suppressed while offline illustration stays available',()=>{
 assert.match(html,/\.video-wrap\.active-cam \.camera-active-guide\s*\{display:none !important;/);
 assert.match(html,/id="offlineGuide"/);
 assert.match(html,/id="aReframeBtn"/);
});

for(const mode of ['frozen_time','not_ready','hung_inference'])test('independent framing expiry clears measurements on '+mode,async()=>{
 const f=fixture({qa:false});f.setReady();f.setSamples(false);f.context.requestAnimationFrame=()=>{};
 Object.assign(f.element('video'),{videoWidth:640,videoHeight:480,readyState:mode==='not_ready'?0:4,currentTime:1});
 f.run("fmLoaded=true;lastVideoTime="+(mode==='frozen_time'?'1':'-1')+";faceMesh={send:()=>new Promise(()=>{})};metrics.relSmileL=.1;exState='running';startFacePoseWatchdog();");
 const pending=f.run('frameLoop()');pending.catch(()=>{});
 if(mode!=='hung_inference')await pending;
 for(let i=0;i<5;i++)f.step();
 assert.equal(f.run('facePoseReady'),false);assert.equal(f.run('exState'),'idle');
 assert.equal(f.run('Object.keys(metrics).length'),0);assert.equal(f.audit.storageWrites,0);
 f.run('cameraActive=false');f.step();assert.equal(f.timers.size,0);
});

test('completion rechecks framing freshness before a watchdog tick',()=>{
 const f=fixture({qa:false});f.setReady();f.setSamples(false);
 f.run("exState='running';exMeasureBuf.push({synthetic:1});");f.advance(701);
 f.run('finishExercise();');
 assert.equal(f.run('exState'),'idle');assert.equal(f.run('Object.keys(exScores).length'),0);
 assert.equal(f.audit.storageWrites,0);assert.equal(f.audit.network,0);
});

test('sequence idle-gap timeout is cancelled on pose loss and recovery alone does not restart',()=>{
 const f=fixture({qa:false});f.setReady();f.setSamples(false);
 f.run('startFullProgram();');assert.equal(f.run('seqMode'),true);
 const oldId=f.run('seqStartTimer'),oldCallback=f.timers.get(oldId).fn;
 f.run("setFacePoseUnavailable('yaw_drift');facePoseReady=true;facePoseAt=Date.now();");
 assert.equal(f.run('seqMode'),false);assert.equal(f.run('seqStartTimer'),null);
 oldCallback();assert.equal(f.run('exState'),'idle');assert.equal(f.audit.storageWrites,0);
});

test('a queued old sequence callback cannot affect an explicitly restarted sequence',()=>{
 const f=fixture({qa:false});f.setReady();f.setSamples(false);f.run('startFullProgram();');
 const oldId=f.run('seqStartTimer'),oldCallback=f.timers.get(oldId).fn;
 f.run("setFacePoseUnavailable('scale_drift');facePoseReady=true;facePoseAt=Date.now();startFullProgram();");
 const newId=f.run('seqStartTimer');assert.notEqual(oldId,newId);
 oldCallback();assert.equal(f.run('seqStartTimer'),newId);assert.equal(f.run('exState'),'idle');
 assert.equal(f.audit.storageWrites,0);
});
