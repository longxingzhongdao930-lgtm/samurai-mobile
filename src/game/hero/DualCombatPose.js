import { smoothPhase } from './SheathReference.js';

// Character-local +X is the left shoulder on this Mixamo rig.
export function dualStance(index,guard=false){
  const sign=index?-1:1;
  return {hand:[sign*(guard?.28:index?.32:.34),guard?(index?1.35:1.2):(index?1.38:1.05),guard?.35:index?.02:.22],direction:guard?[-sign*.7,.55,.2]:[index?.1:-.2,index?.9:-.2,index?-.35:.95]};
}
export function dualCut(index,phase,hit){
  const sign=index?-1:1,rest=dualStance(index);
  const y=index?1.28:1.12;
  const keys=[
    [0,rest.hand,rest.direction],
    [Math.max(.02,hit-.22),[sign*.40,index?1.45:1.32,.12],[sign*.65,.6,.4]],
    [hit,[sign*.10,y,.48],[-sign*.85,-.12,.9]],
    [Math.min(.94,hit+.15),[-sign*.12,y-.10,.42],[-sign*.9,-.45,.1]],
    [1,rest.hand,rest.direction]
  ];
  const end=keys.findIndex(k=>k[0]>=phase);
  if(end<=0)return {hand:keys[0][1],direction:keys[0][2]};
  const from=keys[end-1],to=keys[end],u=smoothPhase(phase,from[0],to[0]);
  const lerp=(a,b)=>a.map((v,i)=>v+(b[i]-v)*u);
  return {hand:lerp(from[1],to[1]),direction:lerp(from[2],to[2])};
}
