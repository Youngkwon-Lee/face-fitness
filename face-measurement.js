/* Relative facial movement, NOT EMG, force, diagnosis or validated accuracy.
 * Anatomical sides follow the subject, regardless of mirrored presentation.
 * Official topology: mediapipe/python/solutions/face_mesh_connections.py.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.FaceMovementMeasurement=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='anatomical-movement-v2';
  const SIDES=Object.freeze({
    L:Object.freeze({eye:Object.freeze([263,362]),upper:Object.freeze([387,385]),lower:Object.freeze([373,380]),brow:Object.freeze([296,334]),corner:291,alar:328,lip:267,cheek:345}),
    R:Object.freeze({eye:Object.freeze([33,133]),upper:Object.freeze([160,158]),lower:Object.freeze([144,153]),brow:Object.freeze([66,105]),corner:61,alar:94,lip:37,cheek:116})
  });
  const REQUIRED=[...new Set([10,151,152,13,14,107,336,...Object.values(SIDES).flatMap(s=>[...s.eye,...s.upper,...s.lower,...s.brow,s.corner,s.alar,s.lip,s.cheek])])];
  const finite=Number.isFinite;
  function extract(lm,aspect=1){
    if(!Array.isArray(lm)||!finite(aspect)||aspect<=0||REQUIRED.some(i=>!lm[i]||!finite(lm[i].x)||!finite(lm[i].y)))return null;
    // Keep existing EAR/image-coordinate units; normalized QA displacement
    // below uses the aspect-correct inter-outer-eye distance in image heights.
    const d=(a,b)=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y);
    const result={};
    for(const [key,s] of Object.entries(SIDES)){
      const width=d(...s.eye);if(width<=0)return null;
      result['ear'+key]=(d(s.upper[0],s.lower[0])+d(s.upper[1],s.lower[1]))/(2*width+1e-5);
      result['brow'+key+'Y']=(lm[s.brow[0]].y+lm[s.brow[1]].y)/2;
      result['corner'+key+'Y']=lm[s.corner].y;
      result['llsDist'+key]=d(s.alar,s.lip);
      result['cheek'+key+'Y']=lm[s.cheek].y;
    }
    Object.assign(result,{mouthH:d(13,14),mouthW:d(61,291),glabellarD:d(107,336),foreheadY:(lm[10].y+lm[151].y)/2,chinY:lm[152].y,
      interEyeDistance:Math.hypot((lm[263].x-lm[33].x)*aspect,lm[263].y-lm[33].y)});
    return result.interEyeDistance>0?result:null;
  }
  function closure(ear,baseline){
    if(!finite(ear)||ear<0||!finite(baseline)||baseline<=0)return null;
    return Math.max(0,Math.min(1,(baseline-ear)/baseline));
  }
  function normalized(displacement,eyeDistance){
    return finite(displacement)&&finite(eyeDistance)&&eyeDistance>0?displacement/eyeDistance:null;
  }
  function validationSignals(metrics,baseline){
    const out={};
    for(const side of ['L','R']){
      out['smile'+side]=normalized(metrics['relSmile'+side],baseline.eyeDistance);
      out['brow'+side]=normalized(metrics['relBrow'+side],baseline.eyeDistance);
      out['closure'+side]=closure(metrics['ear'+side],baseline['ear'+side]);
    }
    return Object.values(out).every(finite)?out:null;
  }
  const definition=Object.freeze({version:VERSION,side_convention:'subject_anatomical',eye_closure:'clamped_baseline_EAR_reduction',validation_displacement_unit:'inter_outer_eye_distance',clinical_validated:false});
  function isCurrent(record){return record?.measurement_features?.measurement_definition?.version===VERSION;}
  return Object.freeze({VERSION,SIDES,extract,closure,normalized,validationSignals,definition,isCurrent});
});
