'use strict';
const {mesh}=require('./facial-fixture.cjs');
function metricFace(raw=mesh(),{yaw=0,pitch=0,scale=1,layout=0}={}){
 const a=4/3,cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
 const rows=[[cy*scale,sy*sx*scale,sy*cx*scale,1],[0,cx*scale,-sx*scale,2],[-sy*scale,cy*sx*scale,cy*cx*scale,-50],[0,0,0,1]];
 const packed=Array.from({length:16},(_,i)=>layout===0?rows[i%4][Math.floor(i/4)]:rows[Math.floor(i/4)][i%4]);
 const buffer=raw.flatMap(p=>[(p.x-.5)*a,-(p.y-.35),p.z*a,0,0]);
 return{getMesh:()=>({getVertexType:()=>0,getVertexBufferList:()=>buffer}),getPoseTransformMatrix:()=>({getRows:()=>4,getCols:()=>4,getLayout:()=>layout,getPackedDataList:()=>packed})};
}
function posedRaw(raw,{yaw=0,pitch=0}={}){
 const a=4/3,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 return raw.map(p=>{const x=(p.x-.5)*a,y=p.y-.35,z=p.z*a,x1=x*cy+z*sy,z1=-x*sy+z*cy;return{...p,x:.5+x1/a,y:.35+y*cp-z1*sp,z:(y*sp+z1*cp)/a};});
}
module.exports={metricFace,posedRaw};
