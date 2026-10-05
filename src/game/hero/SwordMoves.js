import { AnimationClip, Quaternion, Vector3 } from 'three';
export const SWORD_TIMINGS={k1:.32,k2:.36,k3:.41,k4:.46,k5:.56,counter:.41,execute:.63,branchB:.53,branchC:.7,launcher:.48,rising:.51,'jump-katana':.51,'dive-katana':.48,'aerial-b':.62};
// phase, preparatory crouch, gait step, chest turn, lean. Each technique has
// its own pelvis/legs/torso accompaniment, based on the supplied video order.
export const SWORD_BODY={
 k1:[[0,0,0,-.24,0],[.18,.16,.22,-.34,.03],[.48,.22,.55,.42,.06],[.82,.18,.38,.34,.04],[1,0,0,0,0]],
 k2:[[0,.18,.38,.34,.04],[.18,.22,.38,.34,.04],[.48,.24,.55,-.42,.06],[.82,.16,.35,-.30,.04],[1,0,0,0,0]],
 k3:[[0,.16,.35,-.30,.04],[.24,.30,.25,-.24,.06],[.48,.06,.40,.20,-.03],[.82,.08,.30,.18,-.02],[1,0,0,0,0]],
 k4:[[0,.08,.30,.18,-.02],[.15,.22,.40,-.28,.03],[.32,.18,.55,.42,.06],[.45,.20,.35,.32,.04],[.65,.24,.55,-.40,.06],[.82,.18,.35,-.30,.04],[1,0,0,0,0]],
 k5:[[0,.18,.35,-.30,.04],[.22,.28,.35,-.32,-.02],[.48,.26,.65,.44,.09],[.82,.20,.40,.34,.06],[1,0,0,0,0]],
 launcher:[[0,0,0,0,0],[.25,.35,.1,-.12,.04],[.48,.05,.18,.16,-.04],[.72,0,.1,.06,0],[1,0,0,0,0]],
 'aerial-b':[[0,.12,.05,-.12,.04],[.2,.28,.1,-.24,.06],[.32,.18,.15,.28,.02],[.52,.28,.08,.16,-.04],[.75,.18,.18,-.26,.10],[1,0,0,0,0]],
 branchB:[[0,0,0,0,0],[.15,.18,.2,-.22,.04],[.3,.08,.35,.22,.04],[.44,.48,.14,-.16,.1],[.64,.48,.14,-.16,.1],[.8,.24,.35,.26,.06],[1,0,0,0,0]],
 branchC:[[0,0,0,0,0],[.12,.18,.2,-.22,.06],[.25,.24,.3,.30,.08],[.38,.38,.2,-.30,.1],[.48,.44,.3,.32,.12],[.6,.50,.2,-.28,.12],[.73,.44,.35,.32,.1],[.86,.28,.15,.12,.06],[1,0,0,0,0]]
};
export function swordBodyClip(idle,id,seconds=SWORD_TIMINGS[id]??.6,crouch=null,walk=null){
 if(!idle)return null;const keys=SWORD_BODY[id]??SWORD_BODY[id==='rising'?'launcher':'k4'];
 const tracks=idle.tracks.map(t=>{const r=t.clone(),v=Array.from(((/Spine\d*|Neck|Head/.test(t.name)&&walk?.tracks.find(x=>x.name===t.name))||t).createInterpolant().evaluate(0)),low=crouch?.tracks.find(x=>x.name===t.name),gait=walk?.tracks.find(x=>x.name===t.name),values=[],times=keys.map(k=>k[0]*seconds);
  for(const k of keys){
   // Alternate the supporting leg through successive cuts. Sampling one
   // fixed gait frame made every stage lean on the same stationary stance.
   const stage=/^k[1-5]$/.test(id)?Number(id[1])-1:null;
   const gaitPhase=stage===null?.25:((stage%2)*.5+Math.min(1,k[0]/.73)*.5)%1;
   const cv=low?Array.from(low.createInterpolant().evaluate(crouch.duration*.35)):v,wv=gait?Array.from(gait.createInterpolant().evaluate(walk.duration*gaitPhase)):v;
   if(t.name.endsWith('.quaternion')&&v.length===4){const q=new Quaternion().fromArray(v);
    if(/(?:Hips|(?:Left|Right)(?:UpLeg|Leg|Foot))\.quaternion$/.test(t.name)){q.slerp(new Quaternion().fromArray(cv),k[1]);q.slerp(new Quaternion().fromArray(wv),k[2]);}
    if(/Spine\d*\.quaternion$/.test(t.name)){q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),k[3]/3));q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),k[4]/3));}
    q.normalize().toArray(values,values.length);
   }else for(let j=0;j<v.length;j++)values.push(/Hips\.position$/.test(t.name)?v[j]+(cv[j]-v[j])*k[1]:v[j]);
  }r.times=new Float32Array(times);r.values=new Float32Array(values);return r;});return new AnimationClip('Video-based reconstructed sword '+id,seconds,tracks);
}
export function swordConfig(base,id,extras={}){return {...base,id,clip:'slashHit',clipFrom:0,clipTo:1,timeScale:1,swordMotion:true,slices:true,trail:true,sfx:'slash',launch:false,ring:false,airLauncher:false,...extras};}
