import { applyEndWaistPose } from './JudgementEndPose.js';
import { sampleEndTraversal } from './JudgementEndTraversal.js';
import { END_SEQUENCE } from './JudgementEndSequence.js';
import { Quaternion, Vector3 } from 'three';
import { smoothPhase } from './SheathReference.js';
import { COMBO_REFERENCE_PATHS, sampleSwordPath } from './SwordComboReference.js';

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
 'aerial-b':[[0,-.20,-.23,.30,-.8,0,.7],[.32,.3,-.2,.35,1,.1,.2],[.52,.12,.23,.3,.1,1,.25],[.75,.20,-.3,.4,.2,-1,.2],[1,.05,-.38,.18,.1,.3,1]],
 'dive-katana':[[0,.05,.2,.22,.2,1,.2],[.55,.1,-.32,.4,.1,-1,.3],[1,.05,-.38,.18,.1,.3,1]]
};
PATHS.launcher.splice(2,0,[.82,...PATHS.launcher[1].slice(1)]);PATHS.k3.splice(2,0,[.8,...PATHS.k3[1].slice(1)]);
PATHS.rising=PATHS.launcher;PATHS.counter=PATHS.k4;PATHS.execute=PATHS.k5;PATHS['jump-katana']=PATHS.k4;
PATHS.branchB=[[0,...PATHS.k1[0].slice(1)],[.3,...PATHS.k1[1].slice(1)],[.44,-.20,-.34,.3,-.8,.05,.6],[.64,-.20,-.34,.3,-.8,.05,.6],[.8,.28,-.23,.34,1,.05,.2],[1,...PATHS.k1[2].slice(1)]];
PATHS.branchC=[[0,...PATHS.k1[0].slice(1)],[.25,...PATHS.k1[1].slice(1)],[.38,...PATHS.k2[0].slice(1)],[.48,...PATHS.k2[1].slice(1)],[.6,...PATHS.k1[0].slice(1)],[.73,...PATHS.k1[1].slice(1)],[1,...PATHS.k1[2].slice(1)]];
export class VergilIaiMotion {
  constructor(presence){this.h=presence;}
  update(){
    const h=this.h,g=h.g,p=g.player,c=p.character;
    const taunt=p.techniques.taunt;
    if(taunt){const arm=c.getBone('RightArm'),fore=c.getBone('RightForeArm'),hand=c.getBone('RightHand'),left=c.getBone('LeftHand'),hips=c.getBone('Hips'),source=g.weapons.blade();if(arm&&fore&&hand&&left&&hips&&source){c.root.updateMatrixWorld(true);const shoulder=arm.getWorldPosition(new Vector3()),reach=shoulder.distanceTo(fore.getWorldPosition(new Vector3()))+fore.getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3())),yaw=c.facing,w=smoothPhase(taunt.t,0,.32),front=new Vector3(Math.sin(yaw),0,Math.cos(yaw));const mouth=hips.getWorldPosition(new Vector3()).add(new Vector3(Math.cos(yaw)*.08,.22,-Math.sin(yaw)*.08)).addScaledVector(front,.25);h.katanaSheath._hand('Left',mouth,w);h.katanaSheath._hand('Right',shoulder.add(new Vector3(-Math.cos(yaw)*reach*.25,reach*.8,Math.sin(yaw)*reach*.25)).addScaledVector(front,reach*.25),w);c.root.updateMatrixWorld(true);const direction=left.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3())).normalize();h.katanaSheath._orientHand(source,hand,new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction),w);}return;}
    const ritual=p.techniques.ritual;
    if(ritual?.end&&ritual.chargeRemaining>0){applyEndWaistPose(c,g.weapons.blade(),0,b=>h.turn(b));return;}
    if(ritual?.end&&ritual.t>=END_SEQUENCE.travel[0]&&ritual.t<END_SEQUENCE.return){const phase=sampleEndTraversal(ritual.t,ritual.origin,ritual.point,ritual.yaw).phase/.85;applyEndWaistPose(c,g.weapons.blade(),phase,b=>h.turn(b));return;}
    if(ritual?.end&&(ritual.t<END_SEQUENCE.travel[0]||ritual.t>=END_SEQUENCE.return)){const arm=c.getBone('RightArm'),fore=c.getBone('RightForeArm'),hand=c.getBone('RightHand'),source=g.weapons.blade();if(arm&&fore&&hand&&source){c.root.updateMatrixWorld(true);const at=arm.getWorldPosition(new Vector3()),reach=at.distanceTo(fore.getWorldPosition(new Vector3()))+fore.getWorldPosition(new Vector3()).distanceTo(hand.getWorldPosition(new Vector3())),yaw=c.facing,w=smoothPhase(ritual.t,ritual.t>=END_SEQUENCE.return?END_SEQUENCE.return:0,(ritual.t>=END_SEQUENCE.return?END_SEQUENCE.return:0)+.12);const high=at.clone().add(new Vector3(-Math.cos(yaw)*reach*.25,reach*.75,Math.sin(yaw)*reach*.25)),returning=ritual.t>=END_SEQUENCE.return,cross=returning?smoothPhase(ritual.t,END_SEQUENCE.return+.025,END_SEQUENCE.sheath):0,hips=c.getBone('Hips'),front=new Vector3(Math.sin(yaw),0,Math.cos(yaw)),right=new Vector3(-Math.cos(yaw),0,Math.sin(yaw)),mouth=hips.getWorldPosition(new Vector3()).addScaledVector(front,.31).addScaledVector(right,-.12).add(new Vector3(0,.22,0)),waist=mouth.clone().addScaledVector(right,.28);
      h.katanaSheath._hand('Left',mouth,w);h.katanaSheath._hand('Right',high.lerp(waist,cross),w);const direction=new Vector3(-Math.cos(yaw)*.2,1,Math.sin(yaw)*.2).normalize().lerp(right,cross).normalize();h.katanaSheath._orientHand(source,hand,new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction),w);}return;}
    if(p.weapon.id!=='katana'||p.state!=='attack'||(!p.move?.config.swordMotion&&p.move!==p.heavy)||p.dead||g.form.active)return;
    if(p.move.config.referenceMotion){
      const data=c.clips.get(p.move.config.referenceMotion)?.userData,hand=c.getBone('RightHand'),source=g.weapons.blade();
      if(data&&hand&&source){
        const end=data.holdStart/p.move.action.getClip().duration,w=smoothPhase(p.move.phase,end*.8,end),yaw=c.facing;
        if(w>0){c.root.updateMatrixWorld(true);const hips=c.getBone('Hips'),left=c.getBone('LeftHand'),front=new Vector3(Math.sin(yaw),0,Math.cos(yaw)),mouth=hips.getWorldPosition(new Vector3()).add(new Vector3(Math.cos(yaw)*.08,.22,-Math.sin(yaw)*.08)).addScaledVector(front,.25);h.katanaSheath._hand('Left',mouth,w);c.root.updateMatrixWorld(true);const direction=left.getWorldPosition(new Vector3()).sub(hand.getWorldPosition(new Vector3())).normalize();h.katanaSheath._orientHand(source,hand,new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction),w);}
      }
      return;
    }
    const heavy=p.move===p.heavy,opening=COMBO_REFERENCE_PATHS[p.move.config.id],keys=heavy?KEYS:(opening??PATHS[p.move.config.id]??PATHS.k1);
    const phase=p.move.phase,link=p.swordOpeningLink?.move===p.move?p.swordOpeningLink:null;
    const w=heavy?smoothPhase(phase,.14,.24)*(1-smoothPhase(phase,.88,.99)):(link?1:smoothPhase(phase,0,.12))*(1-smoothPhase(phase,.88,1));
    if(w<=0)return;
    const v=sampleSwordPath(keys,phase);
    const arm=c.getBone('RightArm'),fore=c.getBone('RightForeArm'),hand=c.getBone('RightHand');
    const source=g.weapons.blade();if(!arm||!fore||!hand||!source)return;
    c.root.updateMatrixWorld(true);
    const shoulder=arm.getWorldPosition(new Vector3()),elbow=fore.getWorldPosition(new Vector3()),wrist=hand.getWorldPosition(new Vector3());
    const reach=shoulder.distanceTo(elbow)+elbow.distanceTo(wrist),yaw=c.facing;
    const right=new Vector3(-Math.cos(yaw),0,Math.sin(yaw)),front=new Vector3(Math.sin(yaw),0,Math.cos(yaw));
    const delta=right.clone().multiplyScalar(v[0]).add(new Vector3(0,v[1],0)).addScaledVector(front,v[2]);
    // Never stretch the bones to reach the reference's different body size.
    if(delta.length()>reach*.94)delta.setLength(reach*.94);
    const target=shoulder.clone().add(delta);
    if(link)target.copy(link.position).lerp(shoulder.clone().add(delta),smoothPhase(phase,0,.18));
    h.katanaSheath._hand('Right',target,w);
    const direction=right.clone().multiplyScalar(v[3]).add(new Vector3(0,v[4],0)).addScaledVector(front,v[5]).normalize();
    const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction);
    if(link)rotation.copy(link.rotation).slerp(new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction),smoothPhase(phase,0,.18));
    h.katanaSheath._orientHand(source,hand,rotation,w);
  }
}
