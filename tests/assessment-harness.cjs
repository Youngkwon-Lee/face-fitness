// Full host inline script in a Node VM. Fake DOM/timers/SDK/storage only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const policy=require('../assessment-safety.js');
const geometry=require('../face-frame-geometry.js');
const html=fs.readFileSync(process.env.FACE_ASSESSMENT_HOST_SOURCE || path.join(__dirname,'../index.html'),'utf8');
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('const SUPABASE_URL'));
const readyBL={n:45,leftCornerY:0.5,rightCornerY:0.5,leftBrowY:0.4,rightBrowY:0.4,earL:0.3,earR:0.3,jawH:0,mouthW:0.2,glabellarD:0.1,foreheadY:0.2};
const scalarSample={cornerLY:0.5,cornerRY:0.5,browLY:0.4,browRY:0.4,earL:0.3,earR:0.3,mouthH:0,mouthW:0.2,glabellarD:0.1,foreheadY:0.2,relSmileL:0.01,relSmileR:0.01,relBrowL:0.01,relBrowR:0.01,relJaw:0.02,corrugator:0,frontalBrow:0,platysma:0,symScore:90};
function fixture({qa=true,missingPolicy=false,policyOverride=undefined,samples=true,silence=true}={}){
 const audit={media:0,images:0,storageReads:0,storageWrites:0,network:0,client:0},elements=new Map(),storage=new Map(),timers=new Map();let now=0,nextId=1,sampling=samples;
 function element(id){if(!elements.has(id)){const classes=new Set();let inner='';elements.set(id,{id,hidden:false,style:{},dataset:{},textContent:'',disabled:false,videoWidth:0,videoHeight:0,srcObject:null,
 classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);}},
 get innerHTML(){return inner},set innerHTML(s){inner=String(s);for(const m of inner.matchAll(/\bid="([^"]+)"/g))element(m[1]);},addEventListener(){},focus(){}});}return elements.get(id);}
 for(const m of html.matchAll(/\bid="([^"]+)"/g))element(m[1]);element('staticResultCard').style.display='none';
 const document={getElementById:id=>elements.get(id)||null,addEventListener(){},querySelectorAll:selector=>selector==='.assess-card'?[...elements.values()].filter(e=>e.id.startsWith('ac_')):[],querySelector:()=>null,createElement(){audit.images++;throw Error('DENIED media element creation');}};
 const clockDate=class extends Date{constructor(...args){super(...(args.length?args:[946684800000+now]));}static now(){return now;}};
 const add=(fn,delay,repeat)=>{const id=nextId++;timers.set(id,{fn,due:now+delay,repeat:repeat?delay:0});return id;};
 const context=vm.createContext({document,Date:clockDate,URLSearchParams,FaceFrameGeometry:geometry,FaceAssessmentSafety:missingPolicy?undefined:(policyOverride===undefined?policy:policyOverride),location:{search:qa?'?assessmentQA=1':''},addEventListener(){},console:{log(){},warn(){}},
 navigator:{mediaDevices:{getUserMedia(){audit.media++;throw Error('DENIED camera');}}},FaceMesh:function(){audit.media++;throw Error('DENIED model');},supabase:{createClient(){audit.client++;throw Error('DENIED SDK');}},fetch(){audit.network++;throw Error('DENIED network');},
 localStorage:{getItem(k){audit.storageReads++;return storage.get(k)||null},setItem(k,v){audit.storageWrites++;storage.set(k,v)}},
 setTimeout:(fn,d)=>add(fn,d,false),clearTimeout:id=>timers.delete(id),setInterval:(fn,d)=>add(fn,d,true),clearInterval:id=>timers.delete(id),requestAnimationFrame(){throw Error('DENIED animation/media loop');},alert(){}});
 context.window=context;
 vm.runInContext(inline,context,{timeout:1500});
 if(silence) vm.runInContext('speak=()=>{};playTick=()=>{};playGo=()=>{};playDone=()=>{};playNextTest=()=>{};',context);
 const run=code=>vm.runInContext(code,context,{timeout:1000});
 function setReady(){context.__bl=readyBL;run('Object.assign(BL,__bl);blDone=true;cameraActive=true;facePoseReady=true;facePoseAt=Date.now();');}
 function step(){const next=[...timers].sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];if(!next)return false;const[id,t]=next;now=Math.max(now,t.due);if(t.repeat)t.due+=t.repeat;else timers.delete(id);if(sampling&&run('cameraActive'))run('facePoseReady=true;facePoseAt=Date.now()');if(sampling&&run('assessActive')){context.__sample={...scalarSample,_sampleAt:now};run('assessBuf.push(__sample)');}t.fn();return true;}
 function drain(){let n=0;while(step())if(++n>30000)throw Error('Timer runaway');}
 function staticDone(){setReady();run('startStaticPhase()');drain();}
 function armIO({forceComplete=false}={}) {
   context.__audit=audit;
   run(`supabaseClient={from(){__audit.network++;throw Error('mock cloud reached')},rpc(){__audit.network++;throw Error('mock RPC reached')},auth:{signInWithPassword(){__audit.network++;throw Error('mock auth reached')},signUp(){__audit.network++;throw Error('mock auth reached')},signInWithOAuth(){__audit.network++;throw Error('mock auth reached')},signOut(){__audit.network++;throw Error('mock auth reached')}}};currentUser={id:'synthetic-owner'};globalThis.syntheticPayload={};assessmentPayloadGeneration.set(syntheticPayload,assessGeneration);cameraActive=true;fmLoaded=true;lastVideoTime=-1;faceMesh={send(){__audit.media++;return Promise.resolve()}}`);
   Object.assign(element('video'),{videoWidth:640,videoHeight:480,readyState:4,currentTime:1});
   element('authEmail').value='synthetic@example.invalid';element('authPw').value='synthetic-fixture-only';
   if(forceComplete)run('assessmentComplete=()=>true;assessmentScoresReady=()=>true');
 }

 return {run,context,element,audit,timers,storage,setReady,step,drain,staticDone,armIO,setSamples:x=>sampling=x,now:()=>now,advance:ms=>{now+=ms}};
}
module.exports={fixture,html,inline,readyBL,scalarSample,policy};
