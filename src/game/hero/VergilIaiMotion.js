import { Quaternion, Vector3 } from 'three';
import { smoothPhase } from './SheathReference.js';

// Reconstructed single-blade path. Coordinates use the moving shoulder frame:
// outward right, down from shoulder, forward. Hit phase matches the attack data.
const KEYS=[
  [.16,-.28,-.35,.28,  -.15,.1,1],
  [.35, .04,-.28,.43,  -.8,.05,.6],
  [.66, .34,-.18,.28,   1,.08,.24],
  [.79, .23,-.12,.22,   .6,.7,.22],
  [.94, .04,-.35,.24,   .1,.5,.9]
];
export class VergilIaiMotion {
  constructor(presence){this.h=presence;}
  update(){
    const h=this.h,g=h.g,p=g.player,c=p.character;
    if(p.weapon.id!=='katana'||p.state!=='attack'||p.move!==p.heavy||p.dead||g.form.active)return;
    const phase=p.move.phase,w=smoothPhase(phase,.14,.24)*(1-smoothPhase(phase,.8,.95));
    if(w<=0)return;
    let i=KEYS.findIndex(k=>k[0]>=phase);if(i<1)i=phase>KEYS.at(-1)[0]?KEYS.length-1:1;
    const a=KEYS[i-1],b=KEYS[i],u=smoothPhase(phase,a[0],b[0]),v=a.slice(1).map((n,j)=>n+(b[j+1]-n)*u);
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
