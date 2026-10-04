import { AnimationClip, Quaternion, Vector3 } from 'three';
export const SWORD_TIMINGS={k1:.32,k2:.36,k3:.41,k4:.46,k5:.56,counter:.41,execute:.63,branchB:.53,branchC:.7,launcher:.48,rising:.51,'jump-katana':.51,'dive-katana':.48};
// phase, preparatory crouch, gait step, chest turn, lean. Each technique has
// its own pelvis/legs/torso accompaniment, based on the supplied video order.
export const SWORD_BODY={
 k1:[[0,0,0,0,0],[.2,.10,.18,-.16,.02],[.48,.08,.35,.20,.04],[.74,.02,.12,.08,.01],[1,0,0,0,0]],
 k2:[[0,0,0,0,0],[.22,.08,.15,.18,.02],[.48,.12,.3,-.20,.04],[.75,.04,.15,-.08,.02],[1,0,0,0,0]],
 k3:[[0,0,0,0,0],[.24,.18,.1,-.1,.04],[.48,.02,.2,.14,-.02],[.75,.02,.1,.06,0],[1,0,0,0,0]],
 k4:[[0,0,0,0,0],[.15,.12,.2,-.16,.02],[.32,.08,.32,.16,.04],[.5,.1,.2,-.14,.03],[.65,.04,.35,.18,.02],[1,0,0,0,0]],
 k5:[[0,0,0,0,0],[.24,.2,.2,-.18,.04],[.48,.12,.4,.24,.06],[.75,.04,.2,.1,.02],[1,0,0,0,0]],
 launcher:[[0,0,0,0,0],[.25,.35,.1,-.12,.04],[.48,.05,.18,.16,-.04],[.72,0,.1,.06,0],[1,0,0,0,0]],
 branchB:[[0,0,0,0,0],[.15,.12,.2,-.16,.02],[.3,.06,.35,.18,.03],[.48,.1,.2,-.12,.02],[.62,.06,.35,.20,.04],[1,0,0,0,0]],
 branchC:[[0,0,0,0,0],[.12,.15,.2,-.18,.03],[.25,.1,.3,.20,.05],[.38,.1,.2,-.16,.03],[.48,.08,.3,.18,.04],[.6,.12,.2,-.15,.03],[.73,.06,.35,.22,.04],[1,0,0,0,0]]
};
export function swordBodyClip(idle,id,seconds=SWORD_TIMINGS[id]??.6,crouch=null,walk=null){
 if(!idle)return null;const keys=SWORD_BODY[id]??SWORD_BODY[id==='rising'?'launcher':'k4'];
 const tracks=idle.tracks.map(t=>{const r=t.clone(),v=Array.from(t.createInterpolant().evaluate(0)),low=crouch?.tracks.find(x=>x.name===t.name),gait=walk?.tracks.find(x=>x.name===t.name),values=[],times=keys.map(k=>k[0]*seconds);
  for(const k of keys){const cv=low?Array.from(low.createInterpolant().evaluate(crouch.duration*.35)):v,wv=gait?Array.from(gait.createInterpolant().evaluate(walk.duration*.25)):v;
   if(t.name.endsWith('.quaternion')&&v.length===4){const q=new Quaternion().fromArray(v);
    if(/(?:Hips|(?:Left|Right)(?:UpLeg|Leg|Foot))\.quaternion$/.test(t.name)){q.slerp(new Quaternion().fromArray(cv),k[1]);q.slerp(new Quaternion().fromArray(wv),k[2]);}
    if(/Spine\d*\.quaternion$/.test(t.name)){q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),k[3]/3));q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),k[4]/3));}
    q.normalize().toArray(values,values.length);
   }else for(let j=0;j<v.length;j++)values.push(/Hips\.position$/.test(t.name)?v[j]+(cv[j]-v[j])*k[1]:v[j]);
  }r.times=new Float32Array(times);r.values=new Float32Array(values);return r;});return new AnimationClip('Video-based reconstructed sword '+id,seconds,tracks);
}
export function swordConfig(base,id,extras={}){return {...base,id,clip:'slashHit',clipFrom:0,clipTo:1,timeScale:1,swordMotion:true,slices:true,trail:true,sfx:'slash',launch:false,ring:false,airLauncher:false,...extras};}
