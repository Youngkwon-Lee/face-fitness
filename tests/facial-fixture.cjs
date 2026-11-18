'use strict';
// Literal, independently labelled topology. Never generate expectations from
// FaceMovementMeasurement.SIDES: that would miss a mirrored implementation.
function mesh(){
 const p=Array.from({length:468},()=>({x:.5,y:.5,z:0}));
 const values={33:[.35,.35],263:[.65,.35],1:[.5,.5],10:[.5,.12],151:[.5,.2],152:[.5,.83],234:[.23,.48],454:[.77,.48],
 133:[.45,.35],160:[.39,.34],144:[.39,.36],158:[.41,.34],153:[.41,.36],362:[.55,.35],387:[.59,.34],373:[.59,.36],385:[.61,.34],380:[.61,.36],
 66:[.38,.28],105:[.42,.28],296:[.58,.28],334:[.62,.28],61:[.42,.65],291:[.58,.65],13:[.5,.64],14:[.5,.66],107:[.46,.29],336:[.54,.29],
 94:[.45,.55],37:[.46,.60],328:[.55,.55],267:[.54,.60],116:[.35,.50],345:[.65,.50]};
 for(const [i,[x,y]] of Object.entries(values))p[i]={x,y,z:0};return p;
}
function moved(side,kind,amount=.015){
 const p=mesh();
 const indices=kind==='brow'?(side==='L'?[296,334]:[66,105]):kind==='smile'?(side==='L'?[291]:[61]):kind==='cheek'?(side==='L'?[345]:[116]):[];
 for(const i of indices)p[i].y-=amount;
 if(kind==='close')for(const [upper,lower] of (side==='L'?[[387,373],[385,380]]:[[160,144],[158,153]])){
  const middle=(p[upper].y+p[lower].y)/2;
  p[upper].y+=(middle-p[upper].y)*amount;p[lower].y+=(middle-p[lower].y)*amount;
 }
 return p;
}
function transform(points,{scale=1,roll=0,dx=0,dy=0,aspect=4/3}={}){
 const c=Math.cos(roll),s=Math.sin(roll);
 return points.map(p=>{const x=(p.x-.5)*aspect*scale,y=(p.y-.5)*scale;return {...p,x:.5+(x*c-y*s)/aspect+dx,y:.5+x*s+y*c+dy};});
}
module.exports={mesh,moved,transform};
