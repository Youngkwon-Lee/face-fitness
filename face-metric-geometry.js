/* Experimental MediaPipe FaceGeometry adapter. No clinical accuracy claim.
 * Mesh XYZ is already pose-removed by MediaPipe: NEVER inverse-transform it
 * again. Pose matrix is used only for a separate relative orientation guard.
 * No images, vertices or matrices are persisted or sent by this module.
 */
(function(root,factory){
 const raw=typeof module==='object'&&module.exports?require('./face-frame-geometry.js'):root.FaceFrameGeometry;
 const api=factory(raw);if(typeof module==='object'&&module.exports)module.exports=api;root.FaceMetricGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(rawGeometry){
 'use strict';
 const finite=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 const norm=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 function quaternion(r){
  const m=r,t=m[0]+m[4]+m[8];let q;
  if(t>0){const s=Math.sqrt(t+1)*2;q=[s/4,(m[7]-m[5])/s,(m[2]-m[6])/s,(m[3]-m[1])/s];}
  else if(m[0]>m[4]&&m[0]>m[8]){const s=Math.sqrt(1+m[0]-m[4]-m[8])*2;q=[(m[7]-m[5])/s,s/4,(m[1]+m[3])/s,(m[2]+m[6])/s];}
  else if(m[4]>m[8]){const s=Math.sqrt(1+m[4]-m[0]-m[8])*2;q=[(m[2]-m[6])/s,(m[1]+m[3])/s,s/4,(m[5]+m[7])/s];}
  else{const s=Math.sqrt(1+m[8]-m[0]-m[4])*2;q=[(m[3]-m[1])/s,(m[2]+m[6])/s,(m[5]+m[7])/s,s/4];}
  const n=norm(q);return n>0&&q.every(finite)?q.map(v=>v/n):null;
 }
 function readPose(matrix){
  if(!matrix||matrix.getRows?.()!==4||matrix.getCols?.()!==4)return null;
  const layout=matrix.getLayout?.(),p=matrix.getPackedDataList?.();
  if(![0,1].includes(layout)||!p||p.length!==16||!Array.from(p).every(finite))return null;
  const m=Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>p[layout===0?c*4+r:r*4+c]));
  if(m[3].some((v,i)=>Math.abs(v-(i===3?1:0))>1e-5))return null;
  const columns=[0,1,2].map(c=>[m[0][c],m[1][c],m[2][c]]),scales=columns.map(norm),scale=scales.reduce((a,b)=>a+b,0)/3;
  if(!finite(scale)||scale<1e-8||scale>1e8||scales.some(s=>Math.abs(s/scale-1)>.02))return null;
  const c=columns.map(col=>col.map(v=>v/scale));
  if(Math.abs(dot(c[0],c[1]))>.02||Math.abs(dot(c[0],c[2]))>.02||Math.abs(dot(c[1],c[2]))>.02)return null;
  const determinant=c[0][0]*(c[1][1]*c[2][2]-c[1][2]*c[2][1])-c[1][0]*(c[0][1]*c[2][2]-c[0][2]*c[2][1])+c[2][0]*(c[0][1]*c[1][2]-c[0][2]*c[1][1]);
  if(Math.abs(determinant-1)>.04)return null;
  const rotation=[c[0][0],c[1][0],c[2][0],c[0][1],c[1][1],c[2][1],c[0][2],c[1][2],c[2][2]];
  return quaternion(rotation);
 }
 function decode(face){
  try{
   const mesh=face?.getMesh?.(),buffer=mesh?.getVertexBufferList?.();
   if(mesh?.getVertexType?.()!==0||!buffer||buffer.length%5!==0||buffer.length/5<468||buffer.length/5>478)return null;
   if(!Array.from(buffer).every(finite))return null;
   const pose=readPose(face.getPoseTransformMatrix?.());if(!pose)return null;
   return{pose,points:Array.from({length:468},(_,i)=>({x:buffer[i*5],y:buffer[i*5+1],z:buffer[i*5+2]}))};
  }catch{return null;}
 }
 function validReference(ref){
  return ref&&ref.version===3&&['aspect','eyeX','eyeY','eyeDistance','roll'].every(k=>finite(ref[k]))&&ref.aspect>0&&ref.eyeDistance>0&&Array.isArray(ref.pose)&&ref.pose.length===4&&ref.pose.every(finite)&&Math.abs(norm(ref.pose)-1)<.02;
 }
 function withAveragePose(ref,poses){
  if(!validReference(ref)||!Array.isArray(poses)||!poses.length)return ref;
  const sum=[0,0,0,0];for(const q of poses){if(!Array.isArray(q)||q.length!==4||!q.every(finite)||Math.abs(norm(q)-1)>.02)return ref;const sign=dot(q,poses[0])<0?-1:1;for(let i=0;i<4;i++)sum[i]+=q[i]*sign;}
  const n=norm(sum);return n>0?Object.freeze({...ref,pose:Object.freeze(sum.map(v=>v/n))}):ref;
 }
 function project(raw,face,reference=null,dimensions={}){
  const reject=code=>({ok:false,code,reference,landmarks:null});
  if(!rawGeometry?.project)return reject('metric_module_missing');
  if(reference!==null&&!validReference(reference))return reject('invalid_reference');
  // Bounds, face size and in-plane roll still use the original image. Do NOT
  // apply the old nose-depth delta guards to pose-removed measurements.
  const bounds=rawGeometry.project(raw,null,dimensions);if(!bounds.ok)return reject(bounds.code);
  const decoded=decode(face);if(!decoded)return reject('metric_geometry_missing');
  const points=decoded.points,a=points[33],b=points[263];
  const eyeDistance=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  if(!finite(eyeDistance)||eyeDistance<1e-8)return reject('invalid_metric_geometry');
  let fixed=reference;
  if(!fixed){const first=bounds.reference;fixed=Object.freeze({version:3,aspect:first.aspect,eyeX:first.eyeX,eyeY:first.eyeY,eyeDistance:first.eyeDistance,roll:first.roll,pose:Object.freeze([...decoded.pose])});}
  if(Math.abs(dimensions.width/dimensions.height/fixed.aspect-1)>.02)return reject('aspect_ratio');
  const poseAngle=2*Math.acos(clamp(Math.abs(dot(fixed.pose,decoded.pose)),-1,1))*180/Math.PI;
  // An estimated, engineering-only relative rotation guard, NOT a verified
  // real-world 20-degree cutoff. Mild accepted rotations use head-local XYZ.
  if(poseAngle>20)return reject('metric_pose_drift');
  const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,cz=(a.z+b.z)/2;
  const c=Math.cos(fixed.roll),s=Math.sin(fixed.roll);
  const landmarks=points.map(p=>{const x=(p.x-cx)/eyeDistance,y=-(p.y-cy)/eyeDistance;return{x:(fixed.eyeX+fixed.eyeDistance*(x*c-y*s))/fixed.aspect,y:fixed.eyeY+fixed.eyeDistance*(x*s+y*c),z:-(p.z-cz)/eyeDistance*fixed.eyeDistance/fixed.aspect};});
  if(landmarks.some(p=>![p.x,p.y,p.z].every(finite)))return reject('invalid_metric_geometry');
  return{ok:true,code:'ready',reference:fixed,landmarks,pose:decoded.pose,poseAngle};
 }
 return Object.freeze({decode,readPose,project,withAveragePose});
});
