import { MathUtils, Vector3 } from 'three';
import { SHEATH_SECONDS } from './KatanaSheath.js';
import { PoseLayer } from '../combat/PoseLayer.js';

export function attackDirection(heading, facing) {
  if (heading == null) return 'neutral';
  const d = MathUtils.euclideanModulo(heading - facing + Math.PI, Math.PI * 2) - Math.PI;
  return Math.abs(d) > 2.25 ? 'back' : Math.abs(d) > .7 ? (d > 0 ? 'right' : 'left') : 'front';
}
export function tipContact(distance, reach) { return reach > 0 && distance / reach >= .72 && distance / reach <= 1; }
export function behind(enemy, position) {
  return (position.x-enemy.position.x)*Math.sin(enemy.facing)+(position.z-enemy.position.z)*Math.cos(enemy.facing)<-.2;
}

/** Interruptible sword discipline, using the authored draw pose and existing hit pipeline. */
export class HeroArts {
  constructor(player) {
    this.p=player;this.g=player.game;
    this.pose=new PoseLayer(player.character.mixer,player.character.clips.get('crouchSlash'),{blendIn:.12,blendOut:.1});
    player.poses.push(this.pose);player.character.locomotion.overrides.push(this.pose);
    this.reset();
  }
  reset(){this.mode='';this.t=0;this.ready=0;this.link=0;this.returnGuard=0;this.evadeWindow=0;this.kickCd=0;this.rewardAvailable=false;this.transform=0;this.dirt=0;this.flourishQueued=false;this.pose?.cancel();}
  cancel(){this.mode='';this.t=0;this.pose.stop();}
  startSheath(flourish=false){
    const p=this.p;if(p.dead||!p._canCancel(.65))return false;
    for(const m of p.moves)m.release();p._toFree();p.guarding=false;p._guardLatched=false;p.guardPose.stop();
    this.mode=flourish?'flourish':'sheath';this.t=0;this.pose.play(.02,.14,{seconds:.55});return true;
  }
  charge(){for(const m of this.p.moves)m.release();this.p._toFree();this.mode='charge';this.t=0;this.pose.hold(.06);this.p.input.consume('attack');}
  stepToward(target, distance, side=0){
    if(!target?.alive)return;
    const at=this.p.character.position,delta=target.position.clone().sub(at).setY(0),d=delta.length();if(d<.01)return;
    delta.multiplyScalar(Math.min(distance,Math.max(0,d-1.5))/d);
    if(side){delta.set(-delta.z,0,delta.x).multiplyScalar(side);}
    const from=at.clone();at.add(delta);this.g.stage.moveSafely(at,from,.38);
  }
  control(dt,input){
    const p=this.p,g=this.g;
    for(const key of ['ready','link','returnGuard','evadeWindow','kickCd','transform'])this[key]=Math.max(0,this[key]-dt);
    if(p.dead||['hurt','down'].includes(p.state)){this.cancel();return undefined;}
    if(input.pending('sheath')&&g.form.active){input.consume('sheath');g.form.end(true);this.startSheath();return null;}
    if(g.form.active)return undefined;
    if(this.flourishQueued&&p.state==='free'){this.flourishQueued=false;if(!input.moving&&!input.pending('attack'))this.startSheath(true);}
    if(input.pending('sheath')&&p._canCancel(.65)){
      input.consume('sheath');if(this.mode)this.cancel();else this.startSheath();return null;
    }
    if(input.pending('kick')&&p._canCancel(.45)&&this.kickCd===0){
      input.consume('kick');this.cancel();this.kickCd=.8;p._startMove(p.kickMove,p._autoTarget({reach:1.7,arc:75},2));return p._held;
    }
    const fist=g.weapons.fist;
    if(input.pending('guard')&&fist?.flight&&!fist.flight.returning){fist.recall(true);this.cancel();}
    if(!this.mode&&fist?.flight&&input.pending('attack')&&p.state==='free'&&!p.air.active){
      input.consume('attack');p._startMove(p.kickMove,p._autoTarget({reach:1.7,arc:80},2));return p._held;
    }
    if(!this.mode)return undefined;
    this.t+=dt;
    if(input.pending('dodge')||input.pending('guard')||input.pending('magic')||input.pending('weapon')){this.cancel();return undefined;}
    if(this.mode==='charge'){
      if(!input.held.attack){
        if(p.weapon.id==='gauntlet'&&fist?.flight)return null;
        const charged=this.t>=.32,linked=p.weapon.id==='gauntlet'&&this.link>0;this.cancel();
        if(linked)p.setWeapon('katana');
        p._startMove(charged?p.heavy:p.combo[0],p.lockTarget??p._autoTarget(p.heavy.config,8));return p._held;
      }
      if(this.t>=.32&&!this._chargeCue){this._chargeCue=true;g.hud.notice('居合準備 — 離して抜刀 · 守で解除',1.6);}
      return null;
    }
    if(input.pending('attack')){input.consume('attack');this.charge();this._chargeCue=false;return null;}
    if(input.moving){this.cancel();return undefined;}
    if(this.mode!=='sheathed'&&this.t>=SHEATH_SECONDS){
      this.mode='sheathed';this.pose.hold(.06);
      if(this.rewardAvailable){this.rewardAvailable=false;this.ready=6;p.spirit.calm=Math.min(100,p.spirit.calm+(g._nearest(5)?24:12));g.heroStudio?.record('sheath');g.hud.notice('納刀成功 — 次の居合を強化',1.5);}
    }
    return null;
  }
  configure(config,move,target){
    const p=this.p,g=this.g,c={...config};this.elementCd=null;
    if(move===p.cast)return c;
    const gap=target?target.position.distanceTo(p.character.position):99;
    if(move===p.execute){
      const crowded=g.director.agents.filter(a=>a.alive&&a.position.distanceTo(p.character.position)<5).length>1;
      c.timeScale*=crowded?1.5:1.15;c.heroFinish=target?.agent.type.elite?'low':target&&behind(target,p.character.position)?'rear':'thrust';
      c.maxWarp=Math.min(c.maxWarp,2);return c;
    }
    if(move===p.kickMove)return c;
    c.heroDirection=attackDirection(g.stickHeading(),p.character.facing);
    if(c.heroDirection==='front')c.maxWarp+=.5;
    if(['left','right'].includes(c.heroDirection)){c.arc=Math.min(180,c.arc+25);this.stepToward(target,.45,c.heroDirection==='left'?-1:1);}
    if(c.heroDirection==='back'){c.maxWarp=0;c.lunge=0;}
    if(gap<1.25&&!['gauntlet','shuriken'].includes(p.weapon.id)){c.heroClose=true;c.reach=Math.min(c.reach,1.8);c.standoff=.5;c.maxWarp=.4;c.timeScale*=1.12;}
    if(move===p.counter){c.heroCounter=this.counterSide??0;if(this.evadeWindow>0)c.timeScale*=1.2;}
    if(move===p.heavy){
      if(this.ready>0){c.posture*=1.25;c.maxWarp+=g.heroStudio?.build==='draw'?1:0;this.ready=0;}
      if(this.link>0){c.damage*=1.15;c.posture+=12;c.heroLink=true;this.link=0;}
    }
    if(this.switchFrom){c.heroSwitch=this.switchFrom;c.posture+=3;this.switchFrom=null;}
    if(target&&!behind(target,p.character.position))this.backCd=null;
    if(target&&behind(target,p.character.position)&&this.backCd!==target){c.heroBack=true;c.posture+=6;c.timeScale*=1.1;this.backCd=target;}
    return c;
  }
  postureBonus(distance,reach){
    return (tipContact(distance,reach)&&['katana','spear'].includes(this.p.weapon.id)?3:0)+(this.p.mp>=3&&this.p.element==='thunder'?4:0);
  }
  landed(enemy,config,distance,reach){
    this.rewardAvailable=true;this.g.heroStudio?.record('hits');
    if(tipContact(distance,reach)&&['katana','spear'].includes(this.p.weapon.id)){
      this.g.audio.play('parry',{volume:.25,pitch:1.5});this.g.heroStudio?.record('tip');
    }
    const a=enemy.agent;
    if(this.p.mp>=3&&this.p.unlocked[this.p.elementIndex]&&this.elementCd!==enemy){
      this.p.mp-=3;this.elementCd=enemy;
      if(this.p.element==='fire')a.applyStatus('burn',2,.7);
      else if(this.p.element==='ice')a.applyStatus('slow',.2,.7);
      else this.g.fx.glow.spawn(enemy.position,'#b0d7ff',.2,.12);
    }
    if(config.heroDirection==='back'){
      const at=this.p.character.position,from=at.clone(),yaw=this.p.character.facing;
      at.x-=Math.sin(yaw)*.6;at.z-=Math.cos(yaw)*.6;this.g.stage.moveSafely(at,from,.38);
    }
  }
  parry(hit){
    const at=this.p.character.position,yaw=this.p.character.facing;
    this.counterSide=Math.sign((hit.from.x-at.x)*Math.cos(yaw)-(hit.from.z-at.z)*Math.sin(yaw));
    this.g.heroStudio?.record('parry');
    if(this.g.heroStudio?.build==='spell')this.p.mp=Math.min(this.p.maxMp,this.p.mp+5);
  }
  perfect(hit){
    this.g.heroStudio?.record('dodge');const direction=this.g.stickHeading();
    if(direction!=null&&hit.attacker?.alive){
      const enemy=hit.attacker,at=this.p.character.position,from=at.clone();
      const side=attackDirection(direction,this.p.character.facing)==='left'?-1:1;
      const yaw=enemy.facing+Math.PI+side*.55;
      const to=enemy.position.clone().add(new Vector3(Math.sin(yaw)*1.8,0,Math.cos(yaw)*1.8));
      const delta=to.sub(at);if(delta.length()>2.5)delta.setLength(2.5);at.add(delta);this.g.stage.moveSafely(at,from,.38);
      this.g.fx.dust(from,.5);
    }
  }
  nearMiss(agent,spec,distance){
    const p=this.p;if(p.state!=='free'||p.invulnerable>0||distance>spec.reach+.8||distance<=spec.reach+.35)return;
    const dx=this.p.character.position.x-agent.enemy.position.x,dz=this.p.character.position.z-agent.enemy.position.z;
    if(spec.arc<360&&(dx*Math.sin(agent.enemy.facing)+dz*Math.cos(agent.enemy.facing))/distance<Math.cos(spec.arc*Math.PI/360))return;
    const dir=this.g.stickHeading();if(dir==null||attackDirection(dir,p.character.facing)!=='back')return;
    this.evadeWindow=1;p.counterWindow=1;p.counterTarget=agent.enemy;this.g.heroStudio?.record('spacing');
    this.g.hud.notice('身かわし — 攻撃で返す',1);
  }
  cutProjectile(hit){
    const p=this.p,m=p.move;
    if(hit.unparryable||!['arrow','projectile'].includes(hit.kind)||p.weapon.id==='gauntlet'||p.state!=='attack'||!m)return false;
    const first=m.config.hits?.[0]??.5;
    if(Math.abs(m.phase-first)>.1)return false;
    this.g.audio.play('parry');this.g.fx.parry(hit.from,0,1);this.g.heroStudio?.record('cut');return true;
  }
}
