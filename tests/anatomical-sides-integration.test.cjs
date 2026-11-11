'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,html}=require('./assessment-harness.cjs');
const model=require('../face-measurement.js');require('../movement-coach.js');
const coach=globalThis.FaceMovementCoach;
const {mesh,moved,transform}=require('./facial-fixture.cjs');
function frame(f,p){f.context.__landmarks=p;return f.run('analyzeFrame(__landmarks,Date.now())');}
function calibrated(){const f=fixture({qa:false});f.run('cameraActive=true;');for(let i=0;i<45;i++)assert.equal(frame(f,mesh()),true);assert.equal(f.run('blDone'),true);return f;}
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,a+' differs from '+b);
for(const side of ['L','R'])for(const kind of ['brow','smile','close'])test('host + both monitors keep '+side+' '+kind+' on its anatomical side',()=>{
 const f=calibrated();frame(f,moved(side,kind,kind==='close'?.5:.015));const other=side==='L'?'R':'L';
 const key=kind==='brow'?'relBrow':kind==='smile'?'relSmile':'ear';
 if(kind==='close'){
  for(const prefix of ['mm_','pmm_']){assert.equal(f.element(prefix+'ey'+side+'_pct').textContent,'50%');assert.equal(f.element(prefix+'ey'+other+'_pct').textContent,'0%');}
 }else{
  near(f.run('metrics.'+key+side),.015);near(f.run('metrics.'+key+other),0);
  for(const prefix of ['mm_','pmm_']){
   assert.notEqual(f.element(prefix+(kind==='brow'?'br':'sm')+side+'_pct').textContent,'0%');
   assert.equal(f.element(prefix+(kind==='brow'?'br':'sm')+other+'_pct').textContent,'0%');
  }
 }
 if(kind==='brow'){
  const d=coach.changes(coach.geometry(moved(side,kind),4/3),coach.geometry(mesh(),4/3));
  assert.ok(d['brow'+side]>0);near(d['brow'+other],0);
  assert.match(f.element('measurementValidationReadout').textContent,side==='L'?/L \+3.75% \/ R \+0.00%/:/L \+0.00% \/ R \+3.75%/);
 }
 assert.equal(f.audit.storageWrites,0);assert.equal(f.audit.network,0);assert.equal(f.audit.images,0);
});
for(const side of ['L','R'])test('five synthetic '+side+' trials repeat after rigid image motion without opposite-side drift',()=>{
 const f=calibrated(),peaks=[];
 for(let trial=0;trial<5;trial++){
  frame(f,transform(mesh(),{dx:.02,dy:.01,scale:1.05,roll:.06}));
  frame(f,transform(moved(side,'brow'),{dx:.02,dy:.01,scale:1.05,roll:.06}));
  const signals=f.run('FaceMovementMeasurement.validationSignals(metrics,BL)');
  peaks.push(signals['brow'+side]);near(signals['brow'+(side==='L'?'R':'L')],0);
 }
 for(const peak of peaks)near(peak,.0375);
 assert.equal(f.audit.storageWrites,0);assert.equal(f.audit.network,0);
});
test('new module missing blocks media, tracking loss clears validation output',async()=>{
 const f=fixture({qa:false});f.context.FaceMovementMeasurement=undefined;await f.run('startCamera()');
 assert.equal(f.audit.media,0);assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'measurement-module-missing');
 const live=calibrated();frame(live,moved('L','brow'));live.run("setFacePoseUnavailable('stale_tracking')");
 assert.match(live.element('measurementValidationReadout').textContent,/준비되면/);
 assert.equal(live.run('Object.keys(metrics).length'),0);
 for(const prefix of ['mm_','pmm_'])for(const key of ['brL','brR','smL','smR','eyL','eyR']){assert.equal(live.element(prefix+key+'_pct').textContent,'—');assert.equal(live.element(prefix+key).style.width,'0%');}
});
test('measurement definition is written only to new payloads, not retrofitted to old records',()=>{
 const f=fixture({qa:false});const features=f.run('buildMeasurementFeatures()');
 assert.equal(features.schema_version,2);assert.equal(features.measurement_definition.version,model.VERSION);
 const legacy={date:'2026-10-01T00:00:00Z',earL:.2,earR:.3,zones:{upper:50},symScore:50};
 const current={date:'2026-11-11T00:00:00Z',earL:.3,earR:.2,zones:{upper:60},symScore:60,measurement_features:features};
 f.context.__history={assess:[legacy,current],exercise:[]};
 f.run('FaceHistoryView={read:()=>__history};renderHistory();');
 assert.match(f.element('histAssess').innerHTML,/이전\/미확인 측정방식/);
 assert.match(f.element('histAssess').innerHTML,/본인 좌우 기준 v2/);
 assert.equal(f.element('compareCard').style.display,'none');
 assert.equal(legacy.earL,.2);assert.equal(legacy.measurement_features,undefined);
 assert.equal(f.audit.storageWrites,0);
});
for(const modern of [false,true])test('cloud '+(modern?'preserves v2 definition':'does not mix v2 into unversioned legacy table'),async()=>{
 const f=fixture({qa:false});f.context.__rows=[];
 f.run("assessPhase='done';assessmentComplete=()=>true;assessmentScoresReady=()=>true;currentUser={id:'fixture-owner'};bootstrapPersonalContext=async()=>({personId:"+(modern?"'fixture-person'":"null")+",orgId:null});supabaseClient={from(table){return{insert(row){__rows.push({table,row});return Promise.resolve({error:null})}}}};globalThis.__payload={earL:.2,earR:.3,zones:{},measurement_features:buildMeasurementFeatures()};assessmentPayloadGeneration.set(__payload,assessGeneration);");
 await f.run('cloudSaveAssess(__payload)');
 assert.equal(f.context.__rows.length,modern?1:0);
 if(modern){assert.equal(f.context.__rows[0].table,'facial_assessment_sessions');assert.equal(f.context.__rows[0].row.measurement_features.measurement_definition.version,model.VERSION);}
 else assert.match(f.element('cloudBadge').textContent,/측정버전 지원 필요/);
});
test('existing experimental scalar score retains original physical side; no silent historical redefinition',()=>{
 const f=fixture({qa:false});f.run("exMeasureBuf.push({relSmileL:0,relSmileR:.01,symScore:90});");
 assert.equal(f.run("computeExScore({measure:'smileRise',compensators:[]})"),64);
});
test('source declares mirror/anatomical convention and does not make monitor validation claims',()=>{
 assert.ok(html.indexOf('face-measurement.js')<html.indexOf('@mediapipe/face_mesh'));
 assert.match(html,/L = 내 왼쪽 · R = 내 오른쪽/);
 assert.match(html,/근활성도·근력·의료적 정확도 점수가 아닙니다/);
 assert.doesNotMatch(html,/진짜 미소|건강인 정상범위/);
});

test('angle proxy drift clears both live monitors instead of updating expression values',()=>{
 const f=calibrated();frame(f,moved('L','brow'));
 const points=mesh();points[1].x+=.3*.07;
 assert.equal(frame(f,points),false);assert.equal(f.run('facePoseCode'),'yaw_drift');
 assert.equal(f.run('Object.keys(metrics).length'),0);
 for(const prefix of ['mm_','pmm_'])assert.equal(f.element(prefix+'brL_pct').textContent,'—');
 assert.equal(f.element('aStartBtn').disabled,true);
 assert.equal(f.audit.storageWrites,0);assert.equal(f.audit.network,0);
});
test('missing live depth prevents a baseline instead of allowing angle-unchecked measurement',()=>{
 const f=fixture({qa:false});f.run('cameraActive=true');const points=mesh();delete points[1].z;
 assert.equal(frame(f,points),false);assert.equal(f.run('facePoseCode'),'pose_depth_missing');assert.equal(f.run('BL.n'),0);
});
