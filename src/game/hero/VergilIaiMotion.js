import { Quaternion, Vector3 } from 'three';
import { smoothPhase } from './SheathReference.js';

// Reconstructed single-blade path. Coordinates use the moving shoulder frame:
// outward right, down from shoulder, forward. Hit phase matches the attack data.
const KEYS=[
  [.12,-.28,-.35,.28,  -.15,.1,1],
  [.25, .04,-.28,.43,  -.8,.05,.6],
  [.38, .34,-.18,.28,   1,.08,.24],
  [.55, .04, .25,.16,   .65,.6,.24],
  [.8,  .04, .25,.16,   .65,.6,.24],
  [.94, .04,-.35,.24,   .1,.5,.9]
];
const PATHS={
 k1:[[0,-.24,-.28,.22,-.8,0,.8],[.48,.30,-.23,.3,1,.05,.2],[1,.05,-.38,.18,.1,.3,1]],
 k2:[[0,.25,-.2,.2,1,0,.2],[.48,-.23,-.26,.3,-.8,.1,.7],[1,.05,-.38,.18,.1,.3,1]],
 k3:[[0,.12,-.4,.25,.1,-.5,.8],[.48,.12,.2,.3,.1,1,.25],[1,.05,-.38,.18,.1,.3,1]],
 k4:[[0,-.24,-.28,.22,-.8,0,.8],[.32,.3,-.23,.3,1,0,.2],[.5,.3,-.2,.22,1,0,.2],[.65,-.23,-.26,.3,-.8,.1,.7],[1,.05,-.38,.18,.1,.3,1]],
 k5:[[0,.06,.18,.18,.2,.8,.3],[.48,.24,-.33,.4,.2,-.8,.5],[1,.05,-.38,.18,.1,.3,1]],
 launcher:[[0,.12,-.4,.25,.1,-.5,.8],[.48,.12,.2,.3,.1,1,.25],[1,.05,-.38,.18,.1,.3,1]],
 'dive-katana':[[0,.05,.2,.22,.2,1,.2],[.55,.1,-.32,.4,.1,-1,.3],[1,.05,-.38,.18,.1,.3,1]]
};
PATHS.rising=PATHS.launcher;PATHS.counter=PATHS.k4;PATHS.execute=PATHS.k5;PATHS['jump-katana']=PATHS.k4;
PATHS.branchB=[[0,...PATHS.k1[0].slice(1)],[.3,...PATHS.k1[1].slice(1)],[.48,...PATHS.k2[0].slice(1)],[.62,...PATHS.k2[1].slice(1)],[1,...PATHS.k1[2].slice(1)]];
PATHS.branchC=[[0,...PATHS.k1[0].slice(1)],[.25,...PATHS.k1[1].slice(1)],[.38,...PATHS.k2[0].slice(1)],[.48,...PATHS.k2[1].slice(1)],[.6,...PATHS.k1[0].slice(1)],[.73,...PATHS.k1[1].slice(1)],[1,...PATHS.k1[2].slice(1)]];
export class VergilIaiMotion {
  constructor(presence){this.h=presence;}
  update(){
    const h=this.h,g=h.g,p=g.player,c=p.character;
    if(p.weapon.id!=='katana'||p.state!=='attack'||(!p.move?.config.swordMotion&&p.move!==p.heavy)||p.dead||g.form.active)return;
    const heavy=p.move===p.heavy,keys=heavy?KEYS:(PATHS[p.move.config.id]??PATHS.k1);
    const phase=p.move.phase,w=heavy?smoothPhase(phase,.14,.24)*(1-smoothPhase(phase,.88,.99)):smoothPhase(phase,0,.12)*(1-smoothPhase(phase,.88,1));
    if(w<=0)return;
    let i=keys.findIndex(k=>k[0]>=phase);if(i<1)i=phase>keys.at(-1)[0]?keys.length-1:1;
    const a=keys[i-1],b=keys[i],u=smoothPhase(phase,a[0],b[0]),v=a.slice(1).map((n,j)=>n+(b[j+1]-n)*u);
    const arm=c.getBone('RightArm'),fore=c.getBone('RightForeArm'),hand=c.getBone('RightHand');
    const source=g.weapons.blade();if(!arm||!fore||!hand||!source)return;
    c.root.updateMatrixWorld(true);
    const shoulder=arm.getWorldPosition(new Vector3()),elbow=fore.getWorldPosition(new Vector3()),wrist=hand.getWorldPosition(new Vector3());
    const reach=shoulder.distanceTo(elbow)+elbow.distanceTo(wrist),yaw=c.facing;
    const right=new Vector3(-Math.cos(yaw),0,Math.sin(yaw)),front=new Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const delta=right.clone().multiplyScalar(v[0]).add(new Vector3(0,v[1],0)).addScaledVector(front,v[2]);
    // Never stretch the bones to reach the reference's different body size.
    if(delta.length()>reach*.94)delta.setLength(reach*.94);
    h.katanaSheath._hand('Right',shoulder.clone().add(delta),w);
    const direction=right.clone().multiplyScalar(v[3]).add(new Vector3(0,v[4],0)).addScaledVector(front,v[5]).normalize();
    const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction);
    h.katanaSheath._orientHand(source,hand,rotation,w);
  }
}
