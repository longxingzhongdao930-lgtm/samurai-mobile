import { Mesh, RingGeometry, MeshBasicMaterial, DoubleSide } from 'three';

export const ENEMY_TIPS = {
  queen:'飛剣は直前ガードで返せる。3回返して体勢を崩す。',
  mage:'照準が止まってから横へ回避。レーザー後に距離を詰める。',
  samurai:'剣のチラ見せが合図。背後への縮地に合わせて振り向く。',
  achates:'翼の大きな予備動作を見て側面へ。着地後が攻め時。',
  dragon:'爪の連撃を欲張らず避け、最後の一撃の後に反撃。',
  infinian:'重い一撃を避けて体幹を削る。正面で連打しない。',
  tarislandDragon:'咆哮は段階変化の合図。広い衝撃波から離れる。'
};
export const WEAPON_TIPS = {
  katana:'刀：弾きから居合。静が満ちたら長押し。',odachi:'大太刀：溜めで体幹を崩す。振り終わりは回避。',
  spear:'槍：先端の間合いで突く。近づかれたら後退。',naginata:'薙刀：横薙ぎで群れをまとめて捉える。',
  kusarigama:'鎖鎌：離れた間合いから溜めで体幹を削る。',gauntlet:'手甲：長押し→離すと引き寄せ。近くで空中追撃。',shuriken:'手裏剣：距離を保って牽制し、他武器へつなぐ。'
};
export function defeatAdvice(cause, enemy) {
  if(cause==='guard')return '守りが崩れた。ガードを解いて回復し、強い一撃は回避しよう。';
  if(cause==='rear')return '背後から被弾した。敵を正面に置き、画面端の予兆を確認しよう。';
  if(ENEMY_TIPS[enemy])return ENEMY_TIPS[enemy];
  if(cause==='ranged')return '遠距離攻撃は横へ回避。壁や結界を挟めば遮れる。';
  return '予備動作を見て守るか避ける。大技のあとに一撃ずつ返そう。';
}
export class CombatCoach {
  constructor(game){
    this.game=game;this.warnings=[];this.lastCause='';this.lastEnemy='';this.reasonTime=0;
    this.root=document.createElement('div');this.root.className='combat-coach';game.hud.root.append(this.root);
    this.reason=document.createElement('div');this.reason.className='combat-reason';this.reason.setAttribute('role','status');this.root.append(this.reason);
    this.geometry=new RingGeometry(.96,1,64);
  }
  warn(agent,spec){
    if(this.warnings.some(w=>w.agent===agent))return;
    if(this.warnings.length>=3)this.remove(this.warnings[0]);
    const el=document.createElement('div');el.className='combat-warning';
    const glyph=spec.unparryable?'↔ 避':spec.unblockable?'△ 危':spec.guardBreak?'◇ 弾':'◇';
    const label=agent.type.id==='queen'?'飛剣':agent.type.id==='mage'?'詠唱':spec.ultimate?'大技':spec.ring?'範囲':agent.type.id==='samurai'?'縮地':'攻撃';
    el.textContent=`${glyph} ${label}`;this.root.append(el);
    const duration=Math.min(5, Math.max(1.2,agent.timeToHit?.(agent.move)??1.2));
    let ring=null;
    if(spec.ring){ring=new Mesh(this.geometry,new MeshBasicMaterial({color:spec.unblockable?'#ff804a':'#ffdc8e',transparent:true,opacity:.65,side:DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.scale.setScalar(spec.ring);ring.position.copy(agent.position);ring.position.y+=.06;this.game.app.scene.add(ring)}
    this.warnings.push({agent,el,t:duration,ring});
    this.game.audio.play(agent.type.id==='mage'?'charge':agent.type.id==='queen'?'telegraph':spec.ultimate?'bell':'danger',{pos:agent.position,volume:.45,pitch:agent.type.id==='queen'?1.3:.8});
  }
  hurt(hit,guard=false){
    const g=this.game,p=g.playerPosition,dx=(hit?.from?.x??p.x)-p.x,dz=(hit?.from?.z??p.z)-p.z;
    const rear=dx*Math.sin(g.app.character.facing)+dz*Math.cos(g.app.character.facing)<0;
    this.lastCause=guard?'guard':rear?'rear':['arrow','shadowLaser','flyingSword'].includes(hit?.kind)?'ranged':'hit';
    this.lastEnemy=hit?.attacker?.agent?.type.id??'';
    const side=dx*g.app.camera.matrixWorld.elements[0]+dz*g.app.camera.matrixWorld.elements[2];
    this.reason.textContent=`${side<0?'←':'→'} ${guard?'ガード崩れ':rear?'背後から被弾':this.lastCause==='ranged'?'遠距離から被弾':'被弾'}`;
    this.reasonTime=1.4;
  }
  remove(w){w.el.remove();if(w.ring){w.ring.removeFromParent();w.ring.material.dispose()}this.warnings.splice(this.warnings.indexOf(w),1)}
  clear(){for(const w of [...this.warnings])this.remove(w);this.reason.textContent='';this.reasonTime=0}
  update(dt){
    this.reasonTime-=dt;if(this.reasonTime<=0)this.reason.textContent='';
    const g=this.game,camera=g.app.camera;
    for(const w of [...this.warnings]){
      w.t-=dt;if(w.t<=0||!w.agent.alive||['hurt','broken','down','frozen'].includes(w.agent.state)){this.remove(w);continue}
      if(w.ring){w.ring.position.copy(w.agent.position);w.ring.position.y+=.06}
      const p=w.agent.position.clone();p.y+=(w.agent.type.height??1.8)+.3;p.project(camera);
      const off=p.z>1||Math.abs(p.x)>.85||Math.abs(p.y)>.8;
      if(p.z>1){p.x=-p.x;p.y=-p.y}
      w.el.style.left=`${50+Math.max(-.85,Math.min(.85,p.x))*50}%`;
      w.el.style.top=`${50-Math.max(-.65,Math.min(.7,p.y))*50}%`;
      w.el.classList.toggle('is-edge',off);
    }
    // Reduce translucent clutter while a dangerous move is being read.
    const clear=g.journey.options.effects==='clear'||this.warnings.some(w=>w.ring);
    if(g.fx.glow?.material.uniforms.uClarity)g.fx.glow.material.uniforms.uClarity.value=clear?.25:1;
    if(g.fx.ribbons?.mesh)g.fx.ribbons.mesh.visible=!clear;
  }
}
