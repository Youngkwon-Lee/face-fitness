import {readFileSync} from "node:fs";
import test from "node:test";
import assertStrict from "node:assert/strict";
const testHtml=readFileSync(new URL("../index.html", import.meta.url), "utf8");
function exFunctionSource(name) { const start = testHtml.indexOf('function '+name+'('); if(start<0) throw Error(name+' missing'); const tail=testHtml.slice(start); const next=tail.slice(1).search(/\n(?:async )?function /); return next<0?tail:tail.slice(0,next+1); }
function exHarness() { const elements=new Map(); const matches=[...testHtml.matchAll(/data-ex-filter="([^"]+)"[^>]*onclick="filterEx\('([^']+)',this\)"/g)]; const buttons=matches.map(m=>({dataset:{exFilter:m[1]},textContent:'번역된 필터',active:false,classList:{replace(from,to){this.owner.active=to==='btn-primary';}}})); buttons.forEach(b=>b.classList.owner=b); const document={getElementById(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{},disabled:false});return elements.get(id);},querySelector(){return buttons.find(b=>b.active)||null;},querySelectorAll(){return buttons;}}; const exercises=[['forehead','upper','strength'],['eyes','upper','strength'],['brow','upper','endurance'],['cheek','mid','strength'],['relax','mid','stretch'],['mouth','lower','endurance'],['neck','neck','stretch']].map(([id,zone,type],i)=>({id,zone,type,priority:i===0,name:'운동 '+id,compensators:[],sets:3,duration:30,holdSec:5})); const code=["let exIdx=0, exState='idle', cameraActive=false, facePoseReady=true, exScores={}, exTimer=null;", "const MUSCLE_STATUS={}, TYPE_META={strength:{badge:'strength'},stretch:{badge:'stretch'},endurance:{badge:'endurance'}};", "const iconHTML=()=>'', priorityMarkerSVG=()=>'', faceSVG=()=>'', updateActiveGuideImage=()=>{};", "const facePoseFresh=()=>true, lastFaceResults=null, window={}, clearInterval=()=>{}, computeExScore=()=>80;", "const playDone=()=>{}, speak=()=>{}, updateFFI=()=>{}, showExResult=()=>{}, saveExToHistory=()=>{};", ...['getActiveExFilter','renderExList','filterEx','selectEx','finishExercise'].map(exFunctionSource), "return {renderExList,filterEx,selectEx,finishExercise,getActiveExFilter,setState(value){exState=value;},setCamera(value){cameraActive=value;}};"].join('\n'); return {api:new Function('document','EXERCISES',code)(document,exercises),document,buttons,matches,rows(){return (document.getElementById('exList').innerHTML.match(/class="ex-row/g)||[]).length;}}; }
test("nine filter buttons use stable internal keys", ()=>{const h=exHarness();assertStrict.equal(h.matches.length,9);h.matches.forEach(m=>assertStrict.equal(m[1],m[2]));});
test("all: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("all",h.buttons.find(b=>b.dataset.exFilter==="all"));assertStrict.equal(h.rows(),7);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"all");assertStrict.equal(h.rows(),7);h.api.renderExList();assertStrict.equal(h.rows(),7);
});
test("priority: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("priority",h.buttons.find(b=>b.dataset.exFilter==="priority"));assertStrict.equal(h.rows(),1);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"priority");assertStrict.equal(h.rows(),1);h.api.renderExList();assertStrict.equal(h.rows(),1);
});
test("upper: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("upper",h.buttons.find(b=>b.dataset.exFilter==="upper"));assertStrict.equal(h.rows(),3);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"upper");assertStrict.equal(h.rows(),3);h.api.renderExList();assertStrict.equal(h.rows(),3);
});
test("mid: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("mid",h.buttons.find(b=>b.dataset.exFilter==="mid"));assertStrict.equal(h.rows(),2);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"mid");assertStrict.equal(h.rows(),2);h.api.renderExList();assertStrict.equal(h.rows(),2);
});
test("lower: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("lower",h.buttons.find(b=>b.dataset.exFilter==="lower"));assertStrict.equal(h.rows(),1);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"lower");assertStrict.equal(h.rows(),1);h.api.renderExList();assertStrict.equal(h.rows(),1);
});
test("neck: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("neck",h.buttons.find(b=>b.dataset.exFilter==="neck"));assertStrict.equal(h.rows(),1);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"neck");assertStrict.equal(h.rows(),1);h.api.renderExList();assertStrict.equal(h.rows(),1);
});
test("stretch: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("stretch",h.buttons.find(b=>b.dataset.exFilter==="stretch"));assertStrict.equal(h.rows(),2);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"stretch");assertStrict.equal(h.rows(),2);h.api.renderExList();assertStrict.equal(h.rows(),2);
});
test("strength: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("strength",h.buttons.find(b=>b.dataset.exFilter==="strength"));assertStrict.equal(h.rows(),3);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"strength");assertStrict.equal(h.rows(),3);h.api.renderExList();assertStrict.equal(h.rows(),3);
});
test("endurance: selecting preserves rows and filter", function anonymous(
) {
const h=exHarness();h.api.filterEx("endurance",h.buttons.find(b=>b.dataset.exFilter==="endurance"));assertStrict.equal(h.rows(),2);h.api.selectEx(0);assertStrict.equal(h.api.getActiveExFilter(),"endurance");assertStrict.equal(h.rows(),2);h.api.renderExList();assertStrict.equal(h.rows(),2);
});
test("selection label and camera gate", ()=>{const h=exHarness();h.api.selectEx(1);assertStrict.equal(h.document.getElementById('pBadge').textContent,'운동 eyes');assertStrict.equal(h.document.getElementById('pStartBtn').disabled,true);h.api.setCamera(true);h.api.selectEx(2);assertStrict.equal(h.document.getElementById('pBadge').textContent,'운동 brow');assertStrict.equal(h.document.getElementById('pStartBtn').disabled,false);});
test("active countdown label is not overwritten", ()=>{const h=exHarness();h.api.setState('countdown');h.document.getElementById('pBadge').textContent='3...';h.api.selectEx(1);assertStrict.equal(h.document.getElementById('pBadge').textContent,'3...');});
test("completion preserves the filter without real persistence", ()=>{const h=exHarness();h.api.filterEx('upper',h.buttons.find(b=>b.dataset.exFilter==='upper'));h.api.finishExercise();assertStrict.equal(h.rows(),3);assertStrict.equal(h.api.getActiveExFilter(),'upper');});
test("tab rerender and camera startup preserve selection", ()=>{assertStrict.equal(testHtml.includes("renderExList('all');"),false);assertStrict.equal(testHtml.includes("?.textContent||'all'"),false);assertStrict.equal(exFunctionSource('startCamera').includes("document.getElementById('pBadge').textContent = EXERCISES[exIdx].name;"),true);});
