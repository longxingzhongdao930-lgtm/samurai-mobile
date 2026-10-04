import { Group, Vector3, Quaternion } from 'three';
import { KatanaSheath } from './KatanaSheath.js';

/** A procedural two-sword stance; the combat clips and damage remain unchanged. */
export class DualKatana {
  constructor(presence){this.h=presence;this.clock=1;this.previous='';}
  invalidate(){
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
        const rig=new KatanaSheath(proxy,{side,support:false,staged:true,source:()=>index?g.weapons.blade():this.left,offset:()=>index?new Vector3():new Vector3(-Math.sin(c.facing)*.07,-.105,-Math.cos(c.facing)*.07)});
        return Object.assign(rig,{arts,index});
      });
    }
    this.mount.scale.setScalar(1/(c.getBone('LeftHand').getWorldScale(new Vector3()).x||1));
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
    if(!held&&p.state==='attack'){
      const phase=p.move?.phase??0;
      const swing=Math.sin(Math.PI*Math.max(0,Math.min(1,phase)));
      this.rigs[0]._hand('Right',c.position.clone().add(world(-.34+.55*swing,1.05+.2*swing,.22+.28*swing)),1);
    }
    for(const rig of this.rigs){
      const drawing=!held&&p.state==='attack'&&p.move===p.heavy;
      rig.arts.mode=drawing&&rig.index===1&&this.clock<.16?'sheathed':p.arts.mode;
      rig.arts.t=Math.max(0,p.arts.t-(rig.index===1?.4:0));
      rig.update(dt);
    }
    return true;
  }
}
