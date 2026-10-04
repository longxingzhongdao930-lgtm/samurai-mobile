import { Vector3 } from 'three';
import { preferences, readRun, readStored, writeStored, validateRun } from './Storage.js';
import { WEAPON_ORDER } from '../data/weapons.js';
import { TOWN_CHARACTERS } from '../data/townCharacters.js';
import { TARISLAND_DRAGON } from '../boss/TarislandDragon.js';
import { Rasetsu } from '../boss/Rasetsu.js';

export class Journey {
  constructor(game) {
    this.game = game; this.options = preferences(); this.practice = null;
    this.records = new Set((readStored('records', []) || []).filter?.(id => typeof id === 'string') ?? []);
    this.bossSeen = false; this.apply();
  }
  apply() {
    const g = this.game, o = this.options;
    g._muted = o.volume === 0;
    g.audio.volume.master = o.volume; g.audio.volume.music = o.music;
    if (g.audio.master) g.audio.master.gain.value = g._muted ? 0 : o.volume;
    if (g.audio.music) g.audio.music.gain.value = o.music;
    g.rig.shakeScale = g.reducedMotion ? 0 : (g.touch.root.classList.contains('tc--desktop') ? 1 : .45) * o.shake;
    g.touch.root.classList.toggle('tc--left', o.leftHanded);
    g.touch.root.style.setProperty('--touch-size', o.touchSize);
    g.touch.root.style.setProperty('--touch-opacity', o.touchOpacity);
    document.body.classList.toggle('clear-effects', o.effects === 'clear');
  }
  save() {
    const g = this.game; if (this.practice || this.importPending || !g.flow) return;
    const cp = g.flow.checkpoint;
    const ok = writeStored('run', { version: 1, checkpoint: { ...cp, position: cp.position.toArray() }, playTime: g.playTime, bossSeen: this.bossSeen });
    g.hud?.notice(ok ? '旅の記録を保存しました' : 'このブラウザでは保存できません。設定から記録を書き出せます', ok ? 1 : 4);
  }
  continueRun(raw = readRun()) {
    if (!raw) return;
    const g = this.game; g.start();
    g.flow.checkpoint = { ...raw.checkpoint, position: new Vector3().fromArray(raw.checkpoint.position) };
    g.playTime = raw.playTime; this.bossSeen = raw.bossSeen;
    g.flow.restartFromCheckpoint();this.save();g.hud.notice('記録した場所から再開', 2);
  }
  settings(back) {
    const g=this.game, o=this.options;
    const panel=g.screens._panel('gs-settings','<h2 class="gs-h">設定・旅の記録</h2>');
    const sliders=[['volume','音量',0,1,.05],['music','音楽',0,1,.05],['sensitivity','カメラ感度',.4,2,.1],['shake','カメラの揺れ',0,1,.1],['touchSize','ボタンの大きさ',.85,1.15,.05],['touchOpacity','ボタンの濃さ',.35,1,.05]];
    for(const [id,name,min,max,step] of sliders){
      const label=document.createElement('label'); label.textContent=name;
      const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=o[id];input.setAttribute('aria-label',name);
      input.addEventListener('input',()=>{o[id]=Number(input.value);this.apply();writeStored('preferences',o)});label.append(input);panel.append(label);
    }
    for(const [id,name,choices] of [['quality','画質（次回起動から）',[['auto','自動'],['low','軽量'],['mid','標準'],['high','高']]],['effects','演出',[['normal','通常'],['clear','視認性優先']]],['leftHanded','操作配置',[[false,'右手で攻撃'],[true,'左手で攻撃']]],['guardToggle','ガード操作',[[false,'押している間'],[true,'押すたび切替']]]]) {
      const label=document.createElement('label');label.textContent=name;const select=document.createElement('select');select.setAttribute('aria-label',name);
      for(const [value,text] of choices){const option=document.createElement('option');option.value=String(value);option.textContent=text;option.selected=String(o[id]??false)===String(value);select.append(option)}
      select.onchange=()=>{o[id]=['leftHanded','guardToggle'].includes(id)?select.value==='true':select.value;this.apply();writeStored('preferences',o)};label.append(select);panel.append(label);
    }
    const status=document.createElement('p');status.className='gs-tip';status.setAttribute('role','status');panel.append(status);
    this.button(panel,'記録を書き出す',()=>{
      const cp=g.flow?.checkpoint;const data=readRun()??(cp?validateRun({version:1,checkpoint:{...cp,position:cp.position.toArray()},playTime:g.playTime,bossSeen:this.bossSeen}):null);
      if(!data){status.textContent='保存された記録がありません';return}
      const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='kuroame-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','旅の記録を読み込む');
    file.onchange=async()=>{try{const f=file.files[0];if(!f||f.size>32000)throw Error();const data=validateRun(JSON.parse(await f.text()));if(!data)throw Error();if(!writeStored('run',data)){status.textContent='保存できませんでした';return}this.importPending=true;status.textContent='読み込みました。タイトルの「続きから」で再開できます';}catch{status.textContent='対応する旅の記録ではありません'}};panel.append(file);
    this.button(panel,'主人公の支度',()=>g.heroStudio.menu(()=>this.settings(back)));
    this.button(panel,'街の記録',()=>this.journal(()=>this.settings(back)));
    this.button(panel,'戻る',back);
  }
  discover(id){this.records.add(id);writeStored('records',[...this.records]);}
  journal(back){
    const p=this.game.screens._panel('gs-settings','<h2 class="gs-h">街の記録</h2>');
    for(const [id,text] of [['lore-well','井戸端：女王の飛剣を3回返すと体勢が崩れる。'],['lore-yard','裏庭：魔術師の照準が止まったら横へ回避する。'],['lore-tea','茶屋：暖かな提灯は本筋、淡い霊火は寄り道、赤い灯りは強敵。']]){
      const row=document.createElement('p');row.textContent=this.records.has(id)?text:'まだ見つかっていない書付';p.append(row);
    }
    const a=document.createElement('a');a.href='./characters.html';a.textContent='六体の敵図鑑を見る';a.className='gs-btn';p.append(a);this.button(p,'戻る',back);
  }
  button(panel,text,fn){const b=document.createElement('button');b.className='gs-btn';b.textContent=text;b.onclick=fn;panel.append(b);return b}
  menu(back) {
    if (this.game.state === 'playing') { this.game.state='paused';this.game.app.paused=true;this.game.input.reset();this.game.touch.setVisible(false); }
    const g=this.game,p=g.screens._panel('gs-settings','<h2 class="gs-h">稽古と強敵再戦</h2><p class="gs-tip">旅のセーブには影響しません。ポーズから退出できます。</p>');
    for(const [id,label] of [['ashigaru','弾き・回避の稽古'],['queen','飛剣返しの稽古'],['samurai','刀の間合い稽古'],['mage','レーザー回避の稽古']])this.button(p,label,()=>this.startPractice(id,true));
    for(const def of [...TOWN_CHARACTERS,{id:'tarislandDragon',name:'黒雨の古竜'}])if(this.records.has(def.id))this.button(p,`${def.name}と再戦`,()=>this.startPractice(def.id,false));
    this.button(p,'戻る',back);
  }
  startPractice(id,training=true) {
    const g=this.game;
    g.audio.unlock();g.form.load();
    if(this.practice)this.leavePractice();
    this.practice={id,training,flow:g.flow,respawn:0};g.flow=null;
    g._resetTransientCombat();g._timers.length=0;g.director.clear();g.magic.clear();g.form.clear();g.weapons.clear();g.stage.clearBarriers();g.fx.clear();
    g.screens.close();g.state='playing';g.app.paused=false;g.cinematic=false;g.hud.setVisible(true);g.touch.setVisible(true);g.boss=null;g.hud.showBoss('',false);
    g.player.maxHp=100;g.player.revive();g.player.invulnerable=0;g.player.special=1;g.player.unlocked=[true,true,true];
    const z=id==='tarislandDragon'?258:124;
    this.practice.flow._place(new Vector3(0,0,z),0);
    if(training&&id==='samurai')g.player.setWeapon('gauntlet');
    this.spawnPractice();
    g.hud.setObjective(training?({ashigaru:'刃が光る瞬間に守る · 避ける',queen:'飛剣を3回弾いて体勢を崩す',samurai:'攻撃を長押し→離して引き寄せ',mage:'照準が止まったら横へ回避'})[id]:'強敵再戦');
  }
  spawnPractice(){
    const g=this.game,{id,training}=this.practice;
    if(id==='tarislandDragon'){
      g.director.registerType(TARISLAND_DRAGON);const a=g.director.spawn(TARISLAND_DRAGON,0,274,Math.PI,{Agent:Rasetsu});g.boss=a.enemy;a.intro(true);
      a.onDefeated=()=>{g.hud.bigText('撃破','#ffd890',2);g.after(3,()=>this.menu(()=>g.toTitle()))};
    }else{const a=g.director.spawn(id,0,132,Math.PI,{alert:true});if(training){a.hp=a.maxHp=5000;}else if(a.type.elite){g.boss=a.enemy;g.hud.showBoss(a.type.name,true)}}
  }
  leavePractice(){if(this.practice){this.game.flow=this.practice.flow;this.practice=null}}
  update(dt){
    if(!this.practice||this.game.state!=='playing')return;
    const g=this.game;
    if(this.practice.training){g.player.hp=g.player.maxHp;g.player.mp=g.player.maxMp;g.player.special=1;}
    if(!this.practice.studio&&!g.director.aliveCount){this.practice.respawn+=dt;if(this.practice.respawn>3&&this.practice.id!=='tarislandDragon'){this.practice.respawn=0;if(this.practice.training){g.director.clear();this.spawnPractice()}else{this.menu(()=>g.toTitle())}}}
  }
  onKill(agent){if(this.practice)return;this.records.add(agent.type.id);writeStored('records',[...this.records]);}
}
