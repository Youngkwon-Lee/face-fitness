'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const metric=require('../face-metric-geometry.js'),{mesh,moved}=require('./facial-fixture.cjs'),{metricFace,posedRaw}=require('./metric-fixture.cjs');
const dims={width:640,height:480},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' differs from '+b);
for(const layout of [0,1])test('pose matrix supports verified layout '+layout+' and strips uniform scale',()=>{
 const a=metric.decode(metricFace(mesh(),{yaw:.1,pitch:.05,layout,scale:2}));
 const b=metric.decode(metricFace(mesh(),{yaw:.1,pitch:.05,layout,scale:.5}));assert.ok(a&&b);a.pose.forEach((v,i)=>near(v,b.pose[i]));
});
for(const failure of ['missing','layout','size','nan','reflection','shear','nonuniform','lastrow'])test('malformed pose '+failure+' fails closed',()=>{
 const face=metricFace(),m=face.getPoseTransformMatrix();
 if(failure==='missing')face.getPoseTransformMatrix=()=>null;
 if(failure==='layout')m.getLayout=()=>9;
 if(failure==='size')m.getRows=()=>3;
 if(['nan','reflection','shear','nonuniform','lastrow'].includes(failure)){
  const p=[...m.getPackedDataList()];if(failure==='nan')p[0]=NaN;if(failure==='reflection')p[0]=-1;if(failure==='shear')p[4]=.2;if(failure==='nonuniform')p[0]=2;if(failure==='lastrow')p[3]=1;m.getPackedDataList=()=>p;
 }
 if(failure!=='missing')face.getPoseTransformMatrix=()=>m;assert.equal(metric.decode(face),null);
});
for(const failure of ['type','short','stride','nonfinite','throw'])test('malformed metric mesh '+failure+' fails closed',()=>{
 const face=metricFace(),m=face.getMesh();
 if(failure==='type')m.getVertexType=()=>1;
 if(failure==='short')m.getVertexBufferList=()=>[1,2,3,4,5];
 if(failure==='stride')m.getVertexBufferList=()=>Array(2341).fill(0);
 if(failure==='nonfinite'){const p=[...m.getVertexBufferList()];p[20]=NaN;m.getVertexBufferList=()=>p;}
 if(failure==='throw')m.getVertexBufferList=()=>{throw Error('bad SDK')};face.getMesh=()=>m;assert.equal(metric.decode(face),null);
});
test('pose-removed XYZ is not inverse-transformed a second time',()=>{
 const raw=mesh(),base=metric.project(raw,metricFace(raw),null,dims);assert.equal(base.ok,true);
 for(const yaw of [-.2,-.1,.1,.2]){
  const observed=metric.project(posedRaw(raw,{yaw}),metricFace(raw,{yaw}),base.reference,dims);assert.equal(observed.ok,true);
  for(const i of [33,263,61,291,66,296]){near(observed.landmarks[i].x,base.landmarks[i].x);near(observed.landmarks[i].y,base.landmarks[i].y);}
 }
});
test('relative expression survives accepted head pose changes',()=>{
 const raw=mesh(),base=metric.project(raw,metricFace(raw),null,dims),expression=moved('L','brow');
 const out=metric.project(posedRaw(expression,{pitch:.15}),metricFace(expression,{pitch:.15}),base.reference,dims);
 assert.equal(out.ok,true);near(base.landmarks[296].y-out.landmarks[296].y,.015);near(base.landmarks[66].y-out.landmarks[66].y,0);
});
test('raw single-nose depth jitter does not veto valid metric geometry',()=>{
 const raw=mesh(),base=metric.project(raw,metricFace(raw),null,dims),noisy=mesh();noisy[1].z+=.1;
 const out=metric.project(noisy,metricFace(raw),base.reference,dims);assert.equal(out.ok,true);near(out.landmarks[291].y,base.landmarks[291].y);
});
test('large estimated relative head rotation rejects without changing reference',()=>{
 const raw=mesh(),base=metric.project(raw,metricFace(raw),null,dims);
 const out=metric.project(posedRaw(raw,{yaw:.5}),metricFace(raw,{yaw:.5}),base.reference,dims);
 assert.equal(out.ok,false);assert.equal(out.code,'metric_pose_drift');assert.equal(out.reference,base.reference);assert.equal(out.landmarks,null);
});
test('missing metric input never falls back to raw projected landmarks',()=>{
 const out=metric.project(mesh(),null,null,dims);assert.equal(out.code,'metric_geometry_missing');assert.equal(out.landmarks,null);
});
test('calibration reference averages sign-equivalent rotations and is immutable',()=>{
 const base=metric.project(mesh(),metricFace(),null,dims).reference;
 const ref=metric.withAveragePose(base,[[1,0,0,0],[-1,0,0,0]]);assert.equal(Object.isFrozen(ref),true);assert.equal(Object.isFrozen(ref.pose),true);near(Math.abs(ref.pose[0]),1);
 assert.equal(metric.project(mesh(),metricFace(),{...ref,pose:[0,0,0,0]},dims).code,'invalid_reference');
});
