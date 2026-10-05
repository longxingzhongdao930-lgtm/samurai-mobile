/** Metre-based travel stays outside bone tracks and is independent of rig scale. */
export function sampleRootTravel(movement,time){
 const samples=movement?.samples;if(!samples?.length)return {position:[0,0,0],yaw:0};
 let i=samples.findIndex(s=>s.t>=time);if(i<0)i=samples.length-1;
 const b=samples[i],a=samples[Math.max(0,i-1)],u=b.t>a.t?Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t))):0;
 return {position:a.position.map((v,n)=>v+(b.position[n]-v)*u),yaw:a.yaw+Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))*u};
}
export function applyRootTravel(wrapper,movement,time){
 const sample=sampleRootTravel(movement,time);wrapper.position.fromArray(sample.position);wrapper.rotation.y=sample.yaw;
}
