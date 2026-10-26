'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const functionNames=['assessmentSyntheticQaMode','assessmentClearTimers','assessmentEvery','assessmentAfter','assessmentClearInterval','assessmentValidSample','assessmentValidResult','assessmentHasCompleteResults','assessmentIncomplete','renderAssessGrid','startStaticPhase','startDynamicPhase','runAssessTest','doAssessTest','skipTest','computeAssessMetrics','finishStaticPhase','showStaticResult','finishDynamicPhase','computeZoneScores','buildRecommendedExercises','showAssessResults','genInsight','captureSnapshot','saveSnapshot','saveAssessToHistory','startCamera','cloudSaveAssess'];
function extract(name){
 const m=new RegExp('^(?:async )?function '+name+'\\(','m').exec(src);
 if(!m)throw Error('Missing '+name);
 for(let end=src.indexOf('}',m.index);end>=0;end=src.indexOf('}',end+1)){
  const s=src.slice(m.index,end+1);
  try{new vm.Script('('+s+')');return s;}catch(_){}
 }
 throw Error('Failed parsing '+name);
}
const testsLiteral=src.match(/const ASSESS_TESTS = \[[\s\S]*?\n\];/)[0];
const sample={symScore:90,earL:.3,earR:.3,relSmileL:.01,relSmileR:.01,relBrowL:.01,relBrowR:.01,relJaw:.02,corrugator:0,frontalBrow:0,platysma:0,cornerLY:.3,cornerRY:.3,browLY:.25,browRY:.25,mouthH:.08,mouthW:.10,glabellarD:.14,foreheadY:.16};
function fixture({qa=true,host='localhost',camera=true,baseline=true,samplePolicy=()=>sample}={}){
 const audit={media:0,network:0,writes:0,reads:0,alerts:[],canvas:0};
 const elements=new Map(),timers=new Map();
 let now=0,nextId=1;
 function element(id){
  if(elements.has(id))return elements.get(id);
  let html='';const classes=new Set();
  const e={id,style:{},dataset:{},textContent:'',disabled:false,
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k),toggle(k,v){const on=v===undefined?!classes.has(k):v;on?classes.add(k):classes.delete(k);return on;}},
    get innerHTML(){return html},
    set innerHTML(v){html=String(v);for(const m of html.matchAll(/id="([^"]+)"/g))element(m[1]);}
  };
  elements.set(id,e);return e;
 }
 for(const m of src.matchAll(/\bid="([^"]+)"/g))element(m[1]);
 element('staticResultCard').style.display='none';
 const doc={body:{dataset:{}},getElementById:id=>element(id),querySelectorAll:sel=>sel==='.assess-card'?[...elements.values()].filter(e=>e.id.startsWith('ac_')):[],createElement(){audit.canvas++;throw Error('DENIED media creation');}};
 const denyNetwork=()=>{audit.network++;throw Error('DENIED network')};
 const storage={getItem(){audit.reads++;return null;},setItem(){audit.writes++;throw Error('DENIED storage')},removeItem(){audit.writes++;throw Error('DENIED storage')}};
 const schedule=(fn,delay,repeat)=>{const id=nextId++;const period=Number(delay);timers.set(id,{fn,due:now+period,period:repeat?period:0});return id;};
 const FakeDate=class extends Date{constructor(...args){super(...(args.length?args:[Date.UTC(2000,0,1)+now]));}static now(){return now}};
 const context=vm.createContext({window:{__FACE_FITNESS_SYNTH_QA__:qa},location:{protocol:'http:',hostname:host},document:doc,Date:FakeDate,console:{log(){}},setTimeout:(fn,ms)=>schedule(fn,ms,false),clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>schedule(fn,ms,true),clearInterval:id=>timers.delete(id),localStorage:storage,sessionStorage:storage,navigator:{mediaDevices:{getUserMedia(){audit.media++;throw Error('DENIED camera')}}},fetch:denyNetwork,XMLHttpRequest:denyNetwork,WebSocket:denyNetwork,alert:msg=>audit.alerts.push(String(msg)),iconHTML:(_icon,label='')=>label,updateActiveGuideImage(){},speak(){},playTick(){},playGo(){},playNextTest(){},playDone(){},resetMusclePeaks(){}});
 const state="let cameraActive="+camera+",blDone="+baseline+",assessActive=false,assessPhase='idle',assessIdx2=-1,assessBuf=[],staticSnapshot=null; const BL={},assessResults={},zoneScores={upper:null,mid:null,lower:null,neck:null},priorityZones=[],recommendedEx=[],EXERCISES=[]; let currentUser=null,supabaseClient=null;const HIST_KEY='ff_history',SNAP_KEY='ff_snaps'; const ASSESSMENT_MIN_VALID_FRAMES=20,assessmentIntervals=new Set(),assessmentTimeouts=new Set();";
 vm.runInContext(state+'\n'+testsLiteral+'\n'+functionNames.map(extract).join('\n'),context,{timeout:3000});
 const ev=code=>vm.runInContext(code,context,{timeout:3000});
 function drain(){
  let count=0;
  while(timers.size){
   if(++count>16000)throw Error('Synthetic timer runaway');
   const [id,t]=[...timers].sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
   now=t.due;if(t.period)t.due+=t.period;else timers.delete(id);
   if(ev('assessActive')){
    const item=samplePolicy(ev('assessIdx2'),count);
    if(item){context.__synthetic=item;ev('assessBuf.push({...__synthetic})');}
   }
   t.fn();
  }
 }
 return {ev,drain,timers,audit,element};
}
test('synthetic full assessment renders 6 results with zero IO',()=>{
 const f=fixture();
 assert.equal(f.ev('assessmentSyntheticQaMode()'),true);
 f.ev('startStaticPhase()');f.drain();
 assert.equal(f.ev('assessPhase'),'static-done');
 assert.match(f.element('staticResultContent').innerHTML,/좌우 대칭도/);
 f.ev('startDynamicPhase()');f.drain();
 assert.equal(f.ev('assessPhase'),'done');
 assert.equal(f.ev('Object.keys(assessResults).length'),6);
 assert.equal(f.element('assessOverlay').classList.contains('visible'),true);
 assert.equal((f.element('aoResults').innerHTML.match(/oc-row/g)||[]).length>=4,true);
 assert.deepEqual([f.audit.media,f.audit.canvas,f.audit.writes,f.audit.network],[0,0,0,0]);
});
test('zero-frame baseline cannot complete or show results',()=>{
 const f=fixture({samplePolicy:()=>null});f.ev('startStaticPhase()');f.drain();
 assert.equal(f.ev('assessPhase'),'incomplete');
 assert.equal(f.ev('Object.keys(assessResults).length'),0);
 assert.equal(f.element('staticResultCard').style.display,'none');
 assert.equal(f.audit.writes,0);
});
test('19 frames are insufficient for baseline',()=>{
 let seen=0;const f=fixture({samplePolicy:()=>++seen<=19?sample:null});
 f.ev('startStaticPhase()');f.drain();assert.equal(f.ev('assessPhase'),'incomplete');
});
test('invalid/missing scalar measurements are not silently scored',()=>{
 const f=fixture({samplePolicy:()=>({...sample,relJaw:Infinity})});
 f.ev('startStaticPhase()');f.drain();assert.equal(f.ev('assessPhase'),'incomplete');
});
test('a missing dynamic task blocks final scoring and saving',()=>{
 const f=fixture({samplePolicy:idx=>idx===2?null:sample});
 f.ev('startStaticPhase()');f.drain();assert.equal(f.ev('assessPhase'),'static-done');
 f.ev('startDynamicPhase()');f.drain();assert.equal(f.ev('assessPhase'),'incomplete');
 assert.equal(f.element('assessOverlay').classList.contains('visible'),false);
 assert.equal(f.ev('Object.keys(assessResults).length'),0);
 assert.equal(f.audit.writes,0);
});
test('direct dynamic entry without static completion fails closed',()=>{
 const f=fixture();f.ev('startDynamicPhase()');
 assert.equal(f.ev('assessPhase'),'idle');assert.equal(f.audit.alerts.length,1);
});
test('direct finish functions reject missing results',()=>{
 const f=fixture();
 f.ev('finishStaticPhase()');assert.equal(f.ev('assessPhase'),'incomplete');
 f.ev("assessPhase='dynamic';finishDynamicPhase()");
 assert.equal(f.ev('assessPhase'),'incomplete');assert.equal(f.audit.writes,0);
});
test('skip clears pending timers and subsequent retry succeeds',()=>{
 const f=fixture();f.ev('startStaticPhase()');assert.ok(f.timers.size>0);
 f.ev('skipTest()');assert.equal(f.ev('assessPhase'),'incomplete');assert.equal(f.timers.size,0);
 f.ev('startStaticPhase()');f.drain();assert.equal(f.ev('assessPhase'),'static-done');
});
test('camera and baseline prerequisites gate assessment',()=>{
 for(const o of [{camera:false},{baseline:false}]){
  const f=fixture(o);f.ev('startStaticPhase()');
  assert.equal(f.ev('assessPhase'),'idle');assert.equal(f.audit.alerts.length,1);
 }
});
test('local QA blocks camera, snapshot, storage, cloud',async()=>{
 const f=fixture();
 await f.ev('startCamera()');
 assert.equal(f.ev('captureSnapshot()'),null);
 f.ev("saveSnapshot('qa','data:image/jpeg;base64,placeholder')");
 f.ev('saveAssessToHistory()');
 await f.ev('cloudSaveAssess({})');
 assert.deepEqual([f.audit.media,f.audit.canvas,f.audit.writes,f.audit.reads,f.audit.network],[0,0,0,0,0]);
});
test('public origin or non-explicit opt-in cannot enable synthetic QA',()=>{
 assert.equal(fixture({qa:true,host:'face-fitness.vercel.app'}).ev('assessmentSyntheticQaMode()'),false);
 assert.equal(fixture({qa:false,host:'localhost'}).ev('assessmentSyntheticQaMode()'),false);
});
test('measurement collection waits until countdown ends',()=>{
 const f=fixture();f.ev('startStaticPhase()');
 assert.equal(f.ev('assessActive'),false);
 assert.ok(f.timers.size>0);
});
test('baseline missing raw position inputs fails before normalization',()=>{
  const f=fixture({samplePolicy:()=>{const s={...sample};delete s.cornerLY;return s;}});
  f.ev('startStaticPhase()');f.drain();
  assert.equal(f.ev('assessPhase'),'incomplete');
  assert.equal(f.audit.writes,0);
});
test('non-QA origin still guards direct incomplete record write',()=>{
  const f=fixture({qa:false,host:'face-fitness.vercel.app'});
  f.ev('saveAssessToHistory()');
  assert.equal(f.audit.writes,0);
  assert.equal(f.audit.reads,0);
});
test('repeated clicks while running cannot open duplicate timers',()=>{
  const f=fixture();f.ev('startStaticPhase()');
  const first=f.timers.size;
  f.ev('startStaticPhase()');
  assert.equal(f.timers.size,first);
  f.drain();assert.equal(f.ev('assessPhase'),'static-done');
});
test('repeated incomplete-finish attempts cannot create a scored overlay',()=>{
  const f=fixture({samplePolicy:()=>null});
  f.ev('startStaticPhase()');f.drain();
  f.ev('finishDynamicPhase()');
  assert.equal(f.ev('assessPhase'),'incomplete');
  assert.equal(f.element('assessOverlay').classList.contains('visible'),false);
  assert.equal(f.audit.writes,0);
});
