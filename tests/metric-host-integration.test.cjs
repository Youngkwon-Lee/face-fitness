'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./assessment-harness.cjs'),{mesh,moved}=require('./facial-fixture.cjs'),{metricFace,posedRaw}=require('./metric-fixture.cjs');
function frame(f,raw,geometry){f.context.__raw=raw;f.context.__geometry=geometry;return f.run('analyzeFrame(__raw,Date.now(),__geometry)');}
function calibrated(){const f=fixture({qa:false,metricQA:true});f.run('cameraActive=true');for(let i=0;i<45;i++)assert.equal(frame(f,mesh(),metricFace()),true);assert.equal(f.run('blDone'),true);return f;}
test('experimental geometry can only activate with isolated demo state',()=>{
 const normal=fixture({qa:false,search:'?metricQA=1',demo:false});assert.equal(normal.run('METRIC_GEOMETRY_QA'),false);
 const demoOnly=fixture({qa:false,search:'?demo=1',demo:true});assert.equal(demoOnly.run('METRIC_GEOMETRY_QA'),false);
 const f=fixture({qa:false,metricQA:true});assert.equal(f.run('METRIC_GEOMETRY_QA'),true);assert.equal(f.run('currentMeasurementDefinition().version'),'anatomical-movement-v3-metric-face');
});
test('metric host preserves both-side numbers under accepted pose changes, and clears on larger ones',()=>{
 const f=calibrated();const expression=moved('L','brow');
 assert.equal(frame(f,posedRaw(expression,{yaw:.15}),metricFace(expression,{yaw:.15})),true);
 assert.ok(f.run('metrics.relBrowL')>.01);assert.ok(Math.abs(f.run('metrics.relBrowR'))<1e-9);
 assert.equal(f.element('mm_brR_pct').textContent,'0%');assert.equal(f.element('pmm_brR_pct').textContent,'0%');
 assert.equal(frame(f,posedRaw(mesh(),{yaw:.5}),metricFace(mesh(),{yaw:.5})),false);
 assert.equal(f.run('analysisLandmarks'),null);assert.equal(f.run('Object.keys(metrics).length'),0);assert.equal(f.element('mm_brL_pct').textContent,'—');assert.equal(f.element('pmm_brL_pct').textContent,'—');
 assert.equal(f.audit.network,0);assert.equal(f.audit.storageWrites,0);
});
test('missing metric input blocks baseline instead of using old nose-depth path',()=>{
 const f=fixture({qa:false,metricQA:true});f.run('cameraActive=true');assert.equal(frame(f,mesh(),null),false);assert.equal(f.run('BL.n'),0);assert.equal(f.run('facePoseCode'),'metric_geometry_missing');
});
test('metric mode requests geometry without refined/iris model count ambiguity',async()=>{
 const f=fixture({qa:false,metricQA:true});f.context.FaceMesh=function(){return{setOptions(o){f.context.__options=o},onResults(){},async initialize(){}}};await f.run('loadFM()');
 assert.equal(f.context.__options.enableFaceGeometry,true);assert.equal(f.context.__options.refineLandmarks,false);
});
test('reframing clears head-local points and pose calibration samples',()=>{
 const f=calibrated();f.run('resetFaceFraming()');assert.equal(f.run('analysisLandmarks'),null);assert.equal(f.run('metricPoseSamples.length'),0);assert.equal(f.run('facePoseReference'),null);assert.equal(f.audit.storageWrites,0);
});

test('missing experimental module prevents any camera request',async()=>{
 const f=fixture({qa:false,metricQA:true});f.context.FaceMetricGeometry=undefined;await f.run('startCamera()');
 assert.equal(f.element('aCamBtn').dataset.cameraFailureCode,'metric-module-missing');assert.equal(f.audit.media,0);
});
