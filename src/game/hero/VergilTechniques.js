import { JudgementEndTraversal } from './JudgementEndTraversal.js';
import { END_CHARGE, END_SEQUENCE, endTravel } from './JudgementEndSequence.js';
import { KatanaAfterimages } from '../fx/KatanaAfterimages.js';
import { SpectralAssets } from '../fx/SpectralAssets.js';
import { Group, Mesh, MeshBasicMaterial, ConeGeometry, BoxGeometry, DoubleSide, Vector3 } from 'three';

export const SWORD_SKILLS={judgement:{cost:12,range:18,damage:24,radius:1.6},summon:{cost:8,range:20,damage:9},end:{range:9,damage:72}};
export const JUDGEMENT_CHAIN={hit:.38,open:.42,close:.70,restart:.58,max:3,cost:12};
export function canChainJudgement(ritual,time,mp){return !!ritual&&!ritual.end&&!ritual.queued&&(ritual.chain??1)<JUDGEMENT_CHAIN.max&&time>=JUDGEMENT_CHAIN.open&&time<=JUDGEMENT_CHAIN.close&&mp>=JUDGEMENT_CHAIN.cost;}
export function withinSwordRange(origin,point,range){return origin.distanceTo(point)<=range;}
export function segmentDistance(point,a,b){const d=b.clone().sub(a),u=Math.max(0,Math.min(1,point.clone().sub(a).dot(d)/(d.lengthSq()||1)));return point.distanceTo(a.clone().addScaledVector(d,u));}

/** Reference-inspired techniques with original 3D effects and an attributed sword asset. */
export class VergilTechniques {
 constructor(p){this.p=p;this.g=p.game;this.traversal=new JudgementEndTraversal(p);this.projectiles=[];this.mode=0;this.cooldown=0;this.group=new Group();this.group.name='Katana spectral techniques';this.g.app.scene.add(this.group);this.assets=new SpectralAssets(this.group,{cloudSteps:this.g.quality.name==='low'?8:12});this.afterimages=new KatanaAfterimages(this.group,this.g.quality.name==='low'?2:3);
  this.guardGeometry=new BoxGeometry(.16,.025,.035);this.handleGeometry=new BoxGeometry(.025,.14,.025);
  this.bladeGeometry=new ConeGeometry(.035,.65,4);this.bladeMaterial=new MeshBasicMaterial({color:'#9ed9ff',transparent:true,opacity:.62,depthWrite:false,side:DoubleSide});
 }
 loadAssets(){return this.assets.load();}
 reset(){this.restoreVisibility();this.traversal.cancel();this.assets.reset();this.afterimages.reset();this.ritual=null;this.endBurst=null;this.endTargets=null;this.taunt=null;this.mode=0;this.burstPending=false;for(const shot of this.projectiles)shot.mesh.removeFromParent();this.projectiles=[];this.cooldown=0;this.p.arts?.cancel();}
 target(range=18){const p=this.p,t=p.lockTarget?.alive?p.lockTarget:p._autoTarget({reach:range,arc:120},range);return t&&withinSwordRange(p.character.position,t.position,range)&&this.g.targetVisible(t)!==false?t:null;}
 point(t){const c=this.p.character;return t?t.position.clone().add(new Vector3(0,1,0)):c.position.clone().add(new Vector3(Math.sin(c.facing)*6,1,Math.cos(c.facing)*6));}
 stroke(at,wide=false){this.assets.rift(at,wide);this.g.fx.glow.spawn(at,'#ddf4ff',.25,.10,{star:true,grow:.4,intensity:.7});}
 damage(at,radius,damage,source='spell',launch=false,only=null){let hits=0;for(const e of this.g.enemies.enemies){if(only&&e!==only)continue;if(!e.alive||!e.agent||this.g.targetVisible(e)===false||!withinSwordRange(this.p.character.position,e.position,source==='special'?9:20))continue;if(e.position.clone().add(new Vector3(0,1,0)).distanceTo(at)>radius+(e.agent.radius??.4))continue;const d=e.position.clone().sub(this.p.character.position).setY(0).normalize();const r=this.g.damageEnemy(e,{damage:damage*(this.p.arts.transform>0?1.25:1),posture:damage*.6,knockback:.3,launch,dirX:d.x,dirZ:d.z,source,heavy:source==='special',force:{impulse:2,lift:launch?3:.1,spin:0,slices:true}});if(r?.damage>0)hits++;}return hits;}
 summon(kind){const p=this.p,t=this.target(20),point=this.point(t),n=kind==='burst'?5:kind==='storm'?4:kind===2?6:kind===1?5:1;
  for(let i=0;i<n;i++){const angle=i*Math.PI*2/n,home=p.character.position.clone().add(new Vector3(Math.cos(angle)*.65,1.4,Math.sin(angle)*.65));const from=kind===2?point.clone().add(new Vector3(Math.cos(angle)*.65,3,Math.sin(angle)*.65)):kind==='storm'?point.clone().add(new Vector3(Math.cos(angle)*1.8,.1,Math.sin(angle)*1.8)):kind===0?this.point(null).copy(p.character.position).add(new Vector3(-Math.cos(p.character.facing)*.3,1.35,Math.sin(p.character.facing)*.3)):home;
   const mesh=new Group();if(this.assets.forceGeometry)mesh.add(this.assets.sword(this.bladeGeometry,this.bladeMaterial));else{const steel=new Mesh(this.bladeGeometry,this.bladeMaterial),guard=new Mesh(this.guardGeometry,this.bladeMaterial),handle=new Mesh(this.handleGeometry,this.bladeMaterial);steel.position.y=.10;guard.position.y=-.22;handle.position.y=-.29;mesh.add(steel,guard,handle);}this.group.add(mesh);this.projectiles.push({mesh,pos:from.clone(),from,point:point.clone(),t:0,delay:kind===1?.65:kind==='burst'?.10*i:kind==='storm'?.3:kind===2?.08*i:0,orbit:kind===1,angle,hit:false});
  }
  this.g.audio.play('charge',{volume:.4,pitch:1.3});
 }
 flushEndBurst(){
  if(!this.endBurst)return;
  if(this.p.arts.mode==='sheathed'){
   this.g.fx?.effectAtlas?.spawn('127578',this.endBurst,4,.4);
   this.assets.burst(this.endBurst,this.p.character.position.clone().add(new Vector3(0,1.1,0)));
   for(const e of this.endTargets??[])if(e.alive&&this.g.targetVisible(e)!==false&&withinSwordRange(this.p.character.position,e.position,9))this.damage(this.point(e),.5,72,'special',false,e);
   this.g.audio.play('heavy',{volume:.55,pitch:1.25});this.g.rig.shake(.045);
   this.endBurst=null;this.endTargets=null;
  }else if(this.p.arts.mode!=='sheath'){this.endBurst=null;this.endTargets=null;}
 }

 startTaunt(){this.traversal.cancel();this.ritual=null;const p=this.p;for(const m of p.moves)m.cancel();p._cancelPoses();p._toFree();p.guarding=false;p.arts.cancel();p.arts.mode='taunt';p.arts.endPose.hold(0);this.taunt={t:0};this.g.hud.notice('掲刀 — 挑発',1);}
 startRitual(end){this.restoreVisibility();this.traversal.cancel();if(end)this.traversal.prepare();this.endBurst=null;this.endTargets=null;this.taunt=null;this.p.arts.cancel();const p=this.p;for(const m of p.moves)m.cancel();p._cancelPoses();p._toFree();p.guarding=false;p.arts.charge();if(end){p.arts.mode='endCharge';p.arts.endPose.stop();p.arts.pose.hold(.35);}this.ritual={t:0,chargeRemaining:end?END_CHARGE.duration:0,end,targets:new Set(),struck:0,ghosts:0,origin:p.character.position.clone(),yaw:p.character.facing,chain:1,queued:false,airborne:!!(p.character.airHeight||p.character.jump?.locked||p.character.hop?.locked),point:this.point(this.target(end?9:18))};this.g.hud.notice(end?'次元斬・絶':'次元斬',1);this.g.audio.play('charge');if(end)this.g.hud.flash('rgba(8,12,24,.16)',.18);}
 get hidden(){const r=this.ritual;return !!(!this.p.dead&&r?.end&&!r.chargeRemaining&&r.t>=END_SEQUENCE.travel[0]&&r.t<END_SEQUENCE.return);}
 restoreVisibility(){for(const [node,visible] of this.visibility??[])node.visible=visible;this.visibility=null;}
 syncVisibility(){
  this.restoreVisibility();if(!this.hidden)return;
  const h=this.g.heroPresence;
  this.visibility=new Map([this.p.character.root,h?.root,h?.sheath,h?.katanaSheath?.copy].filter(Boolean).map(node=>[node,node.visible]));
  for(const node of this.visibility.keys())node.visible=false;
 }
 update(dt,input){const p=this.p,g=this.g,c=p.character;if(p.dead){this.reset();return undefined;}this.assets.update(dt);this.afterimages.update(dt);this.cooldown=Math.max(0,this.cooldown-dt);p.arts.transform=Math.max(0,p.arts.transform-dt);
  for(let i=this.projectiles.length-1;i>=0;i--){const s=this.projectiles[i];s.t+=dt;const previous=s.pos.clone();if(s.orbit&&s.t<s.delay){s.pos.copy(c.position).add(new Vector3(Math.cos(s.angle+s.t*7)*.7,1.25,Math.sin(s.angle+s.t*7)*.7));s.from.copy(s.pos);}else if(s.t>=s.delay){const d=s.point.clone().sub(s.pos),step=22*dt;if(d.length()<=step)s.pos.copy(s.point);else s.pos.addScaledVector(d.normalize(),step);for(const e of g.enemies.enemies){if(!e.alive||g.targetVisible(e)===false)continue;if(segmentDistance(e.position.clone().add(new Vector3(0,1,0)),previous,s.pos)<.3+(e.agent?.radius??.4)){this.stroke(s.pos);this.damage(s.pos,.45,9);s.hit=true;break;}}if(s.pos.distanceTo(s.point)<.05)s.hit=true;}s.mesh.position.copy(s.pos);const direction=s.point.clone().sub(s.pos).normalize();if(direction.lengthSq())s.mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),direction);if(s.hit||s.t>2){s.mesh.removeFromParent();this.projectiles.splice(i,1);}}
  if(p.dead||['hurt','down'].includes(p.state)||g.cinematic){this.traversal.cancel();this.endBurst=null;this.endTargets=null;if(this.ritual||this.taunt){this.ritual=null;this.taunt=null;p.arts.cancel();}return undefined;}
  this.flushEndBurst();
  if(this.taunt){const t=this.taunt;t.t+=dt;if(input.pending('guard')||input.pending('dodge')||input.pending('attack')||input.pending('weapon')||input.pending('magic')||p.dead||['hurt','down'].includes(p.state)||g.cinematic){this.taunt=null;p.arts.cancel();}else if(t.t>=1.4){this.taunt=null;p.arts.cancel();p.arts.startSheath();}else return p._hold();}
  if(input.pending('taunt')&&p._canCancel(.6)&&!c.airHeight&&!c.jump?.locked&&!c.hop?.locked&&!g.form.active){input.consume('taunt');this.startTaunt();return p._hold();}
  if(this.ritual){const r=this.ritual;if(r.chargeRemaining>0){if(input.pending('dodge')||input.pending('guard')){this.traversal.cancel();this.ritual=null;p.arts.cancel();return undefined;}r.chargeRemaining=Math.max(0,r.chargeRemaining-dt);p.arts.pose.hold(.35);p.arts.t=0;return p._hold();}r.t+=dt;p.arts.t=r.t;if(r.end&&r.t>=END_SEQUENCE.return){p.arts.pose.stop();p.arts.endPose.stop();p.arts.endRecoveryPose.hold(0);}else if(r.end&&r.t>=END_SEQUENCE.field){p.arts.endPose.stop();p.arts.pose.hold(.35);}else if(r.end&&r.t>=END_SEQUENCE.travel[0]){p.arts.endPose.stop();p.arts.pose.stop();}if(input.pending('dodge')||input.pending('guard')){this.traversal.cancel();this.ritual=null;p.arts.cancel();return undefined;}if(!r.end&&input.pending('weapon')){input.consume('weapon');if(canChainJudgement(r,r.t,p.mp)){p.mp-=JUDGEMENT_CHAIN.cost;r.queued=true;}}if(!r.end&&!r.drawn&&r.t>=.30){r.drawn=true;const hand=c.getBone('RightHand')?.getWorldPosition(c.position.clone());if(hand){this.assets.slash(hand,c.facing);g.fx.glow.spawn(hand,'#e5f7ff',.18,.08,{star:true,intensity:1.1});}}if(r.end&&r.ghosts<END_SEQUENCE.travel.length&&r.t>=END_SEQUENCE.travel[r.ghosts]){const path=endTravel(r.ghosts,r.origin,r.point);this.assets.flyingSlash(path.from.clone().add(new Vector3(0,1,0)),path.to.clone().add(new Vector3(0,1,0)),r.ghosts);g.fx?.effectAtlas?.travel(path.from.clone().add(new Vector3(0,1,0)),path.to.clone().add(new Vector3(0,1,0)),r.ghosts);r.ghosts++;}const times=r.end?[END_SEQUENCE.field,END_SEQUENCE.second]:[JUDGEMENT_CHAIN.hit];if(r.struck<times.length&&r.t>=times[r.struck]){r.struck++;if(r.end){if(r.struck===1)this.assets.end(r.point,END_SEQUENCE.fieldDuration);g.rig.shake(.045);if(r.struck<3)for(const e of g.enemies.enemies)if(e.alive&&g.targetVisible(e)!==false&&withinSwordRange(c.position,e.position,9)){r.targets.add(e);}}else{this.stroke(r.point);this.damage(r.point,1.6,24);}g.audio.play('heavy',{volume:.55,pitch:1.25});}if(r.queued&&r.t>=JUDGEMENT_CHAIN.restart){r.chain++;r.queued=false;r.t=.08;r.struck=0;r.drawn=false;r.point=this.point(this.target(18));p.arts.t=r.t;g.hud.notice('連続次元斬 '+r.chain, .6);}if(r.t>(r.end?END_SEQUENCE.sheath:.72)){this.traversal.cancel();this.ritual=null;p.arts.cancel();if(p.arts.startSheath(false,r.end?END_SEQUENCE.burst-END_SEQUENCE.sheath:null,r.end)&&r.end){this.endBurst=r.point.clone();this.endTargets=r.targets;}}return this.ritual?.end?this.traversal.update(r):p._hold();}
  if(input.consume('special')){if(p.arts.transform>0){p.arts.transform=0;g.hud.notice('竜人化解除',1);}else if(p.special>=.5){p.special-=.5;p.arts.transform=8;g.hud.notice('竜人化 — 刀技強化',1.5);this.stroke(c.position.clone().add(new Vector3(0,1,0)),true);}else g.hud.notice('竜人化ゲージが足りない',1);return undefined;}
  if(input.pending('finish')&&p._canCancel(.6)&&!c.airHeight&&!c.jump?.locked&&!c.hop?.locked){input.consume('finish');if(p.special>=1){p.special=0;this.startRitual(true);return p._hold();}g.hud.notice('奥義ゲージが足りない',1);}
  if(input.pending('weapon')&&p._canCancel(.55)){input.consume('weapon');if(p.mp>=12){p.mp-=12;this.startRitual(false);return p._hold();}g.hud.notice('霊力が足りない',1);}
  for(let i=0;i<3;i++)if(input.consume('el'+i)){this.mode=i;p.elementIndex=i;g.hud.notice(['幻影剣：射出','幻影剣：周回','幻影剣：雨'][i],1);}
  if(input.pending('magic')){input.consume('magic');if(this.cooldown>0)return undefined;const kind=input.held.guard?'storm':this.mode,cost=kind==='storm'||kind!==0?16:8;if(p.mp>=cost&&this.projectiles.length<18){p.mp-=cost;this.cooldown=.25;this.summon(kind);this.burstPending=kind===0;}else g.hud.notice('霊力が足りない',1);}
  if(this.burstPending&&input.held.magic&&input.holdTime.magic>.4&&p.mp>=16){p.mp-=16;this.summon('burst');this.burstPending=false;}if(!input.held.magic)this.burstPending=false;
  return undefined;
 }
}
