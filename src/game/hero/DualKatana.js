import { dualStance, dualCut } from './DualCombatPose.js';
import { Group, Vector3, Quaternion } from 'three';
import { SHEATH_REFERENCE, smoothPhase } from './SheathReference.js';
import { KatanaSheath } from './KatanaSheath.js';

/** Two-sword draw/sheath and independent upper-body combat poses. */
export class DualKatana {
  constructor(presence){this.h=presence;this.clock=1;this.previous='';}
  invalidate(){
    this.h.g.fx?.leftTrail.end();
    this.mount?.removeFromParent();this.mount=null;this.left?.removeFromParent();this.cover?.removeFromParent();
    for(const rig of this.rigs??[])rig.invalidate();
    this.rigs=null;this.left=null;this.cover=null;this.previous='';this.clock=1;
  }
  update(dt){
    const h=this.h,g=h.g,p=g.player,c=p.character;
    if(g.weapons.swords.id!=='dual'||p.weapon.id!=='katana'){this.invalidate();return false;}
    const source=g.weapons.blade();if(!source)return true;
    if(!this.rigs){
      this.left=source.clone(true);this.left.name='Dual left sword';
      this.mount=new Group();this.mount.name='Dual left scale-cancelling mount';
      c.getBone('LeftHand').add(this.mount);this.mount.add(this.left);
      this.cover=new Group();this.cover.name='Dual left scabbard';
      this.cover.add(g.weapons.swords.templates.get('dual-katana-scabbard').clone(true));h.root.add(this.cover);
      this.rigs=['Left','Right'].map((side,index)=>{
        const arts=Object.create(p.arts),player=Object.create(p),game=Object.create(g);
        Object.defineProperty(player,'arts',{value:arts});Object.defineProperty(game,'player',{value:player});
        const proxy={g:game,root:h.root,sheath:index?h.sheath:this.cover,turn:h.turn.bind(h)};
        const rig=new KatanaSheath(proxy,{side,support:false,staged:true,reference:index?SHEATH_REFERENCE.dualRight:SHEATH_REFERENCE.dualLeft,source:()=>index?g.weapons.blade():this.left,offset:()=>index?new Vector3():new Vector3(-Math.sin(c.facing)*.07,-.105,-Math.cos(c.facing)*.07)});
        return Object.assign(rig,{arts,index});
      });
    }
    this.mount.scale.setScalar(1/(c.getBone('LeftHand').getWorldScale(new Vector3()).x||1));
    if(g.fx.leftTrail._blade?.object!==this.left)g.fx.leftTrail.bind(this.left,c.getBone('LeftHand').getWorldPosition(new Vector3()));
    const held=['sheath','flourish','sheathed','charge'].includes(p.arts.mode);
    const wasHeld=['sheath','flourish','sheathed','charge'].includes(this.previous);
    if(wasHeld&&!held)this.clock=0;
    else this.clock+=dt;
    this.previous=p.arts.mode;
    const yaw=c.facing,world=(x,y,z)=>new Vector3(x*Math.cos(yaw)+z*Math.sin(yaw),y,-x*Math.sin(yaw)+z*Math.cos(yaw));
    if(!held && (this.clock>.28||p.guarding) && p.state==='free'){
      for(const [index,side] of ['Left','Right'].entries()){
        const pose=dualStance(index,p.guarding);
        this.rigs[index]._hand('Right',c.position.clone().add(world(...pose.hand)),1);
        const blade=index?source:this.left,hand=c.getBone(side+'Hand');
        const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),world(...pose.direction).normalize());
        this.rigs[index]._orientHand(blade,hand,rotation,1);
      }
    }
    const config=p.move?.config,phase=p.move?.phase??0;
    const shoulderY=(c.getBone('RightArm').getWorldPosition(new Vector3()).y+c.getBone('LeftArm').getWorldPosition(new Vector3()).y)*.5;
    if(p.state==='free'&&!held&&!c.jump?.locked&&!c.hop?.locked)this.stanceHeight=shoulderY-c.position.y;
    const bodyBase=c.position.clone();
    if(config?.dualPose)bodyBase.y+=Math.max(-.65,Math.min(1.5,shoulderY-c.position.y-(this.stanceHeight??1.3)));
    const attacking=!held&&p.state==='attack'&&config?.dualPose;
    if(attacking){
      for(const [index,side] of ['Left','Right'].entries()){
        const hitIndex=config.dualHands.indexOf(side);
        const hit=hitIndex>=0?config.hits[hitIndex]:.48;
        const active=hitIndex>=0;
        const pose=active?dualCut(index,phase,hit):dualStance(index);
        this.rigs[index]._hand('Right',bodyBase.clone().add(world(...pose.hand)),1);
        const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),world(...pose.direction).normalize());
        this.rigs[index]._orientHand(index?source:this.left,c.getBone(side+'Hand'),rotation,1);
      }
    }
    for(const [index,trail] of [g.fx.leftTrail,g.fx.trail].entries()){
      const side=index?'Right':'Left',hitIndex=config?.dualHands?.indexOf(side)??-1;
      const live=attacking&&hitIndex>=0&&Math.abs(phase-config.hits[hitIndex])<.17;
      if(live&&!trail.active)trail.begin(p.move===p.heavy?1.3:1);
      else if(!live)trail.end();
    }
    const flourish=p.arts.mode==='flourish'?SHEATH_REFERENCE.flourish:0;
    for(const rig of this.rigs){
      const drawing=!held&&p.state==='attack'&&p.move===p.heavy;
      const sequential=['sheath','flourish'].includes(p.arts.mode);
      const local=p.arts.t-flourish-(sequential&&rig.index===1?SHEATH_REFERENCE.dualDelay:0);
      const waiting=['sheath','flourish'].includes(p.arts.mode)&&local<0;
      if(waiting){
        // Keep the right blade above the shoulder while the left is put away.
        const pose=dualStance(rig.index);
        const at=c.position.clone().add(world(...pose.hand));
        const kick=flourish>0&&p.arts.t<.6&&rig.index===0?Math.sin(Math.PI*p.arts.t/.6):0;
        at.add(world(.2*kick,-.12*kick,.18*kick));
        rig._hand('Right',at,smoothPhase(p.arts.t,0,.18));
        const dir=world(pose.direction[0]+.7*kick,pose.direction[1]-.5*kick,pose.direction[2]-.4*kick);
        rig._orientHand(rig.source(),c.getBone((rig.index?'Right':'Left')+'Hand'),new Quaternion().setFromUnitVectors(new Vector3(0,0,1),dir.normalize()),smoothPhase(p.arts.t,0,.18));
      }
      const delayedDraw=drawing&&rig.index===1&&this.clock<.16;
      rig.arts.mode=delayedDraw?'charge':waiting?'':p.arts.mode==='flourish'?'sheath':p.arts.mode;
      rig.arts.t=delayedDraw?.12:Math.max(0,local);
      rig.update(dt);
    }
    return true;
  }
}
