/** 0750-07, same-scene recording 0.4–5.8s; playback reported as 2x.
 * Recorded event order is observed; world paths and gameplay compression are inferred.
 */
export const END_REFERENCE = Object.freeze({
 file:'20261004-0750-07.8233860.mp4',start:.4,playback:2,
 travel:[.6,1.0,1.4,1.8,2.2],field:2.8,second:3.2,return:4.0,sheath:4.2,burst:5.4
});
export function endSequence(compression=.35){
 const time=t=>(t-END_REFERENCE.start)*END_REFERENCE.playback*compression;
 return Object.freeze({compression,travel:END_REFERENCE.travel.map(time),field:time(END_REFERENCE.field),second:time(END_REFERENCE.second),fieldDuration:(3.8-END_REFERENCE.field)*END_REFERENCE.playback*compression,return:time(END_REFERENCE.return),sheath:time(END_REFERENCE.sheath),burst:time(END_REFERENCE.burst)});
}
export const END_SEQUENCE=endSequence();
/** Local target-relative paths; depth and distances are reconstructed, not measured. */
export function endTravel(index,origin,target){
 const forward=target.clone().sub(origin).setY(0);if(forward.lengthSq()<1e-8)forward.set(0,0,1);forward.normalize();
 const side=forward.clone().set(forward.z,0,-forward.x),center=origin.clone().lerp(target,.45).setY(origin.y),sign=index%2?1:-1;
 return {from:center.clone().addScaledVector(side,sign*1.3).addScaledVector(forward,-.7),to:center.clone().addScaledVector(side,-sign*1.3).addScaledVector(forward,.7),arc:side.multiplyScalar(sign*.4),lift:index%2?.35:.65,clip:index%2?'endTravelRight':'endTravelLeft'};
}

/** A single outward stroke, then a held finish. Seconds remain a gameplay adaptation. */
export function endStroke(phase){
 const t=Math.max(0,Math.min(1,phase)),u=Math.max(0,Math.min(1,(t-.12)/.56)),s=u*u*(3-2*u);
 return {progress:s,drawing:t>.12&&t<.68,angle:-.25+.5*s,reach:.16+.20*s};
}
export function endTravelDuration(index){return (index<4?END_SEQUENCE.travel[index+1]:END_SEQUENCE.field-.1)-END_SEQUENCE.travel[index];}
