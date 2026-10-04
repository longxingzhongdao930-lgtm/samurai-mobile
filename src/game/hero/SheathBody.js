import { smoothPhase, SHEATH_REFERENCE } from './SheathReference.js';

// Authored waist/chest/shoulder accompaniment. IK only corrects the last
// centimetres of contact; hips and legs retain the standing animation.
const KEYS = [
  [0,     0,     0,     0,     0,     0],
  [.35,  -.025, -.055, -.09,  -.025,  .025],
  [.75,   .045, -.085, -.13,  -.035,  .035],
  [.95,   .055, -.065, -.10,  -.025,  .025],
  [2.15,  .025,  .035,  .07,   .015, -.015],
  [2.32,  .015,  .025,  .035,  .005, -.005],
  [2.52,  0,     0,     0,     0,     0]
];

export class SheathBody {
  constructor(presence) { this.h=presence; this.pose=[0,0,0,0,0]; }
  update(dt) {
    const h=this.h,p=h.g.player,c=p.character,a=p.arts;
    const eligible=p.weapon.id==='katana'&&h.g.weapons.swords.id!=='dual'&&!p.dead&&!h.g.form.active;
    const active=eligible&&['sheath','flourish','sheathed'].includes(a.mode);
    let target=[0,0,0,0,0];
    if(active){
      const t=a.mode==='sheathed'?SHEATH_REFERENCE.single.end:a.t-(a.mode==='flourish'?SHEATH_REFERENCE.single.flourish:0);
      if(t>=0){
        const end=KEYS.findIndex(k=>k[0]>=t);
        if(end>0){const from=KEYS[end-1],to=KEYS[end],u=smoothPhase(t,from[0],to[0]);target=from.slice(1).map((v,i)=>v+(to[i+1]-v)*u);}
      }
    }
    // Short release on ordinary interruptions. Hurt/death must immediately
    // relinquish the bones to their own animation.
    const release=eligible&&!['hurt','down'].includes(p.state);
    const blend=active?1:release?1-Math.exp(-dt*28):1;
    this.pose=this.pose.map((v,i)=>v+(target[i]-v)*blend);
    const [lean,waist,chest,left,right]=this.pose;
    h.turn(c.getBone('Spine'),lean*.4,waist,0);
    h.turn(c.getBone('Spine1'),lean*.6,chest*.4,0);
    h.turn(c.getBone('Spine2'),0,chest*.6,0);
    h.turn(c.getBone('LeftShoulder'),0,0,left);
    h.turn(c.getBone('RightShoulder'),0,0,right);
    // Follow the working hands modestly without turning the head backwards.
    h.turn(c.getBone('Head'),lean*.25,-(waist+chest)*.35,0);
  }
}
