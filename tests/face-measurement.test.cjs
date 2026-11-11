'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../face-measurement.js');
const {mesh,moved,transform}=require('./facial-fixture.cjs');
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,a+' differs from '+b);
for(const side of ['L','R']){
 const other=side==='L'?'R':'L';
 for(const [kind,key] of [['brow','brow'],['smile','corner'],['cheek','cheek']])test('anatomical '+side+' '+kind+' changes only '+side,()=>{
  const base=model.extract(mesh()),value=model.extract(moved(side,kind));
  near(base[key+side+'Y']-value[key+side+'Y'],.015);
  near(base[key+other+'Y'],value[key+other+'Y']);
 });
 test('anatomical '+side+' closure increases with closing, not opening',()=>{
  const base=model.extract(mesh());
  for(const fraction of [0,.25,.5,.75,1]){
   const obs=model.extract(moved(side,'close',fraction));
   near(model.closure(obs['ear'+side],base['ear'+side]),fraction);
   near(model.closure(obs['ear'+other],base['ear'+other]),0);
  }
  near(model.closure(base['ear'+side]*1.4,base['ear'+side]),0);
 });
}
test('normalized displacement is signed and independent of initial image scale',()=>{
 for(const scale of [.8,1,1.2]){
  const base=model.extract(transform(mesh(),{scale}),4/3),obs=model.extract(transform(moved('L','brow'),{scale}),4/3);
  near(model.normalized(base.browLY-obs.browLY,base.interEyeDistance),.015/.4);
 }
 near(model.normalized(-.02,.4),-.05);
});
test('invalid geometry or normalization never becomes a plausible zero',()=>{
 const bad=mesh();bad[296].y=NaN;
 assert.equal(model.extract(bad),null);assert.equal(model.extract([]),null);assert.equal(model.extract(mesh(),0),null);
 for(const baseline of [0,-1,NaN,Infinity,undefined])assert.equal(model.closure(.2,baseline),null);
 for(const value of [-1,NaN,Infinity,undefined])assert.equal(model.closure(value,.3),null);
 assert.equal(model.normalized(.1,0),null);assert.equal(model.normalized(NaN,.4),null);
 assert.equal(model.validationSignals({},{}),null);
});
test('new measurement definitions are explicit and unmarked records stay legacy',()=>{
 assert.equal(model.definition.side_convention,'subject_anatomical');assert.equal(model.definition.clinical_validated,false);
 assert.equal(model.isCurrent({measurement_features:{measurement_definition:{...model.definition}}}),true);
 for(const record of [{},{measurement_features:{schema_version:1}},{measurement_features:{measurement_definition:{version:'future'}}}])assert.equal(model.isCurrent(record),false);
});
