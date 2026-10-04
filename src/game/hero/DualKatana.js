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
        const target=c.position.clone().add(p.guarding?world(index?.28:-.28,index?1.35:1.2,.35):world(index?.32:-.34,index?1.38:1.05,index?.02:.22));
        this.rigs[index]._hand('Right',target,1);
        const blade=index?source:this.left,hand=c.getBone(side+'Hand');
        const rotation=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),(p.guarding?world(index?-.7:.7,.55,.2):world(index?-.1:-.2,index?.9:-.2,index?-.35:.95)).normalize());
        this.rigs[index]._orientHand(blade,hand,rotation,1);
      }
    }
    const config=p.move?.config,phase=p.move?.phase??0;
    const shoulderY=(c.getBone('RightArm').getWorldPosition(new Vector3()).y+c.getBone('LeftArm').getWorldPosition(new Vector3()).y)*.5;
    if(!c.jump?.locked&&!c.hop?.locked&&!config?.airborne)this.stanceHeight=shoulderY-c.position.y;
    const bodyBase=c.position.clone();
    if(config?.airborne)bodyBase.y+=Math.max(0,shoulderY-c.position.y-(this.stanceHeight??1.45));
    const attacking=!held&&p.state==='attack'&&config?.dualPose;
    if(attacking){
      for(const [index,side] of ['Left','Right'].entries()){
        const hitIndex=config.dualHands.indexOf(side);
        const hit=hitIndex>=0?config.hits[hitIndex]:.48;
        const active=hitIndex>=0;
        const t=Math.max(0,Math.min(1,(phase-(hit-.22))/.44));
        const cut=t*t*(3-2*t),sign=index?1:-1;
        const strength=active?Math.sin(Math.PI*t):0;
        const target=bodyBase.clone().add(world((index?.32:-.34)-sign*.48*strength,(index?1.38:1.05)+.18*strength,(index?.02:.22)+.3*strength));
        this.rigs[index]._hand('Right',target,1);
        const direction=active?world(sign*(.85-1.7*cut),.3-.5*Math.sin(Math.PI*cut),.65):world(sign*.2,index?.9:-.2,index?-.35:.95);
        const rest=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),world(index?-.1:-.2,index?.9:-.2,index?-.35:.95).normalize());
        const swing=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),direction.normalize());
        this.rigs[index]._orientHand(index?source:this.left,c.getBone(side+'Hand'),rest.slerp(swing,strength),1);
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
        const at=c.position.clone().add(world(rig.index?.32:-.34,rig.index?1.38:1.05,rig.index?.02:.22));
        const kick=flourish>0&&p.arts.t<.6&&rig.index===0?Math.sin(Math.PI*p.arts.t/.6):0;
        at.add(world(-.2*kick,-.12*kick,.18*kick));
        rig._hand('Right',at,smoothPhase(p.arts.t,0,.18));
        const dir=world(rig.index?-.1:-.2-.7*kick,rig.index?.9:-.2-.5*kick,rig.index?-.35:.95-.4*kick);
        rig._orientHand(rig.source(),c.getBone((rig.index?'Right':'Left')+'Hand'),new Quaternion().setFromUnitVectors(new Vector3(0,0,1),dir.normalize()),smoothPhase(p.arts.t,0,.18));
      }
      rig.arts.mode=drawing&&rig.index===1&&this.clock<.16?'sheathed':waiting?'':p.arts.mode==='flourish'?'sheath':p.arts.mode;
      rig.arts.t=Math.max(0,local);
      rig.update(dt);
    }
    return true;
  }
}
