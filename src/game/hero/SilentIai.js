import { AnimationClip, Quaternion } from 'three';
import { smoothPhase } from './SheathReference.js';
const IDS=new Set(['k1','k2','k3','k4','k5','quickDraw','heavy','branchB','branchC','counter','execute','launcher']);
export const usesSilentIai=id=>IDS.has(id);
export const silentDrawDistance=phase=>.12*smoothPhase(phase,.20,.32)*(1-smoothPhase(phase,.40,.62));
export function silentIaiConfig(config){return {...config,silentIai:true,swordMotion:false,referenceMotion:null,autoSheath:false,trail:false,maxWarp:Math.min(config.maxWarp??0,1.2),lunge:Math.min(config.lunge??0,.45),passThrough:0,clipFrom:0,clipTo:1,timeScale:1,hits:config.hits.map((_,i)=>.74+i*.035),warpAt:.18,turnAt:.08,cancelAt:.87,recoverAt:.98};}
export function silentIaiClip(idle,crouch,id){
 const seconds=id==='heavy'?.62:id==='execute'?.7:id==='k5'?.5:.42;
 const phases=[0,.18,.62,.82,1],weights=[0,.24,.24,.18,0];
 const tracks=idle.tracks.map(track=>{const copy=track.clone(),rest=Array.from(track.createInterpolant().evaluate(0)),low=crouch?.tracks.find(t=>t.name===track.name),value=low?Array.from(low.createInterpolant().evaluate(crouch.duration*.35)):rest,values=[];
  for(const w of weights){if(track.name.endsWith('.quaternion')){const q=new Quaternion().fromArray(rest);if(/(?:Hips|(?:Left|Right)(?:UpLeg|Leg|Foot))\.quaternion$/.test(track.name))q.slerp(new Quaternion().fromArray(value),w);q.normalize().toArray(values,values.length);}else rest.forEach((v,i)=>values.push(/Hips\.position$/.test(track.name)?v+(value[i]-v)*w:v));}
  copy.times=new Float32Array(phases.map(p=>p*seconds));copy.values=new Float32Array(values);return copy;});
 return new AnimationClip('Quiet draw and sheath '+id,seconds,tracks);
}
