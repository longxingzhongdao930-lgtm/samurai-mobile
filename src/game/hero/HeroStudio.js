import { SWORD_VARIANTS } from './SwordVariants.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { readStored, writeStored } from '../progression/Storage.js';
import { WEAPON_ORDER, WEAPONS } from '../data/weapons.js';
import { weaponCycle } from '../combat/WeaponCycle.js';
import { settings } from '../../config/settings.js';

export const STYLES={draw:{name:'居合の型',key:'sheath',need:3,detail:'納刀強化時の踏み込み +1m'},spell:{name:'流水の型',key:'parry',need:3,detail:'弾きで霊力 +5'}};
export function heroTitle(stats){return stats.damageTaken===0?'無傷の帰還':stats.parries>=8?'不動':stats.maxCombo>=12?'百芸':stats.perfectDodges>=5?'風渡り':'黒雨を歩む者';}
export function validateHero(raw={}){
  const counts={};for(const k of ['hits','sheath','fist','parry','dodge','spacing','tip','cut'])counts[k]=Number.isFinite(raw?.counts?.[k])?Math.min(9999,Math.max(0,Math.floor(raw.counts[k]))):0;
  const build=STYLES[raw?.build]&&counts[STYLES[raw.build].key]>=STYLES[raw.build].need?raw.build:'none';
  const appearance=['plain','hat','mask','coat'].includes(raw?.appearance)?raw.appearance:'plain';
  const sets=Array.isArray(raw?.sets)?raw.sets.slice(0,3).filter(s=>!!WEAPONS[s?.weapon]?.combo&&Number.isInteger(s.element)&&s.element>=0&&s.element<3).map(s=>({name:typeof s.name==='string'?s.name.slice(0,20):'',weapon:'katana',sword:Object.hasOwn(SWORD_VARIANTS,s.sword)?s.sword:s.sword==='dual'?(Object.hasOwn(SWORD_VARIANTS,raw.singleSword)?raw.singleSword:'mythical'):null,element:s.element,build:STYLES[s.build]?s.build:'none',blessings:Array.isArray(s.blessings)?s.blessings.filter(x=>Array.isArray(x)&&['road','sanctum'].includes(x[0])&&['blade','step','dragon','flow','link'].includes(x[1])).slice(0,2):[]})):[];
  return {counts,build,appearance,sets,singleSword:['mythical','oni','classic'].includes(raw?.singleSword)?raw.singleSword:['mythical','oni','classic'].includes(raw?.sword)?raw.sword:'mythical',sword:Object.hasOwn(SWORD_VARIANTS,raw?.sword)?raw.sword:raw?.sword==='dual'&&Object.hasOwn(SWORD_VARIANTS,raw?.singleSword)?raw.singleSword:'mythical'};
}
export class HeroStudio {
  constructor(game){this.g=game;Object.assign(this,validateHero(readStored('hero',{})));this.clock={};this.photo=null;}
  save(){writeStored('hero',{counts:this.counts,build:this.build,appearance:this.appearance,sets:this.sets,sword:this.sword,singleSword:this.singleSword});}
  saveSet(name=''){
    const p=this.g.player;
    const set={name:name.trim().slice(0,20),weapon:p.weapon.id,sword:this.sword,element:p.elementIndex,build:this.build,blessings:this.g.blessings.snapshot()};
    this.sets.unshift(set);this.sets.length=Math.min(3,this.sets.length);this.save();return set;
  }
  async applySet(set){
    const sword=set.sword??this.sword;
    if(!await this.g.weapons.swords.select(sword))return false;
    const p=this.g.player;this.sword=sword;p.setWeapon(set.weapon);
    if(p.unlocked[set.element])p.elementIndex=set.element;
    if(!STYLES[set.build])this.build='none';
    else if(STYLES[set.build]&&this.counts[STYLES[set.build].key]>=STYLES[set.build].need)this.build=set.build;
    if(this.g.journey.practice)this.g.blessings.restore(set.blessings);
    this.save();return true;
  }
  record(key){
    if(!(key in this.counts))return;
    const now=this.g.elapsed;if(now-(this.clock[key]??-Infinity)<.25)return;this.clock[key]=now;
    this.counts[key]++;this.save();
    for(const s of Object.values(STYLES))if(s.key===key&&this.counts[key]===s.need)this.g.hud.notice(`${s.name}を習得 — 主人公の支度で選択`,3);
  }
  menu(back){
    const g=this.g,j=g.journey;if(g.state==='playing')g.pause();
    const panel=g.screens._panel('gs-settings','<h2 class="gs-h">主人公の支度</h2><p class="gs-tip">C／納：納刀・竜化解除　V／蹴：蹴り<br>居合の構え中は攻撃を離して抜刀、守で解除。<br>Shift：回避　Space／跳：ジャンプ、空中で攻撃すると空中技。</p>');
    const status=document.createElement('p');status.className='gs-tip';status.setAttribute('role','status');panel.append(status);
    const choose=(name,value,items,fn)=>{const label=document.createElement('label');label.textContent=name;const select=document.createElement('select');select.setAttribute('aria-label',name);for(const [id,text,disabled]of items){const o=document.createElement('option');o.value=id;o.textContent=text;o.disabled=!!disabled;o.selected=id===value;select.append(o)}select.onchange=()=>fn(select.value);label.append(select);panel.append(label);return select};
    const styleSelect=choose('戦いの型',this.build,[['none','基本'],...Object.entries(STYLES).map(([id,s])=>[id,`${s.name}：${s.detail}（${Math.min(s.need,this.counts[s.key])}/${s.need}）`,this.counts[s.key]<s.need])],v=>{this.build=v;this.save()});
    choose('外見',this.appearance,[['plain','通常'],['hat','旅笠'],['mask','朱の半面'],['coat','雨除け羽織']],v=>{this.appearance=v;this.save()});
    let swordRequest=0;
    const swordSelect=choose('刀装',this.sword,Object.entries(SWORD_VARIANTS).map(([id,s])=>[id,s.name]),async v=>{const request=++swordRequest;saveButton.disabled=true;status.textContent='刀と鞘を読み込み中…';try{if(await g.weapons.swords.select(v)){this.sword=v;this.save();g.player.setWeapon('katana');status.textContent='刀と鞘を変更しました';}}catch(e){if(request===swordRequest){swordSelect.value=this.sword;status.textContent='読み込みに失敗しました。再度選んでください';}}finally{if(request===swordRequest)saveButton.disabled=false;}});
    const setName=document.createElement('input');setName.type='text';setName.maxLength=20;setName.placeholder='装備名（任意）';setName.setAttribute('aria-label','装備名');panel.append(setName);
    const saveButton=j.button(panel,'装備セットを保存',()=>{this.saveSet(setName.value);this.menu(back)});
    this.sets.forEach((s,i)=>j.button(panel,`装備 ${i+1}：${s.name||WEAPONS[s.weapon].name}${s.weapon==='katana'&&s.sword?' · '+SWORD_VARIANTS[s.sword].name:''}`,async()=>{
      const request=++swordRequest;saveButton.disabled=true;status.textContent='装備を読み込み中…';
      try{if(await this.applySet(s)){swordSelect.value=this.sword;styleSelect.value=this.build;status.textContent=j.practice?'刀装・装備・属性・加護を適用':'刀装・装備を適用。本編の未取得属性・加護は変更しません';}}
      catch(e){if(request===swordRequest){swordSelect.value=this.sword;status.textContent='装備の読み込みに失敗しました。再度選んでください';}}
      finally{if(request===swordRequest)saveButton.disabled=false;}
    }));
    j.button(panel,'試着・試技へ',()=>this.trial());
    if(g.state==='paused')j.button(panel,'フォトモード',()=>this.openPhoto(()=>this.menu(back)));
    j.button(panel,'戻る',back);
  }
  trial(){
    const g=this.g;g.journey.startPractice('ashigaru',true);g.journey.practice.studio=true;g.director.clear();
    g.hud.setObjective('試技 — ポーズから支度・退出');this.trialMenu();
  }
  trialMenu(){
    const g=this.g;g.pause();const p=g.screens._panel('gs-settings','<h2 class="gs-h">主人公の試着・試技</h2>');
    for(const id of weaponCycle())g.journey.button(p,WEAPONS[id].name,async()=>{g.form.clear();g.player.setWeapon(id);g.resume();g.after(2,()=>{if(g.journey.practice?.studio)this.trialMenu()})});
    g.journey.button(p,'攻撃モーション',()=>{g.resume();g.input.press('attack');g.input.release('attack');g.after(2,()=>{if(g.journey.practice?.studio)this.trialMenu()})});
    g.journey.button(p,'銀竜へ変身',()=>{g.resume();if(!g.form.begin())g.hud.notice('銀竜を読み込み中');g.after(2,()=>{if(g.journey.practice?.studio)this.trialMenu()})});
    g.journey.button(p,'自由に試す',()=>g.resume());g.journey.button(p,'外見・型を選ぶ',()=>this.menu(()=>this.trialMenu()));g.journey.button(p,'退出',()=>g.toTitle());
  }
  openPhoto(back){
    const g=this.g;if(g.state==='playing')g.pause();if(this.photo)return;
    this.photo={back,distance:settings.camera.distance,fov:settings.camera.fov,az:g.rig.azimuth,polar:g.rig.polar};
    g.hud.setVisible(false);g.touch.setVisible(false);
    const post=g.app.post;this.bokeh=new BokehPass(g.app.scene,g.app.camera,{focus:settings.camera.distance,aperture:0,maxblur:.012});post.composer.insertPass(this.bokeh,1);
    const panel=g.screens._panel('gs-settings hero-photo','<h2 class="gs-h">フォトモード</h2>');
    const slider=(name,min,max,step,value,fn)=>{const l=document.createElement('label');l.textContent=name;const i=document.createElement('input');i.type='range';Object.assign(i,{min,max,step,value});i.setAttribute('aria-label',name);i.oninput=()=>fn(Number(i.value));l.append(i);panel.append(l)};
    slider('左右',-180,180,1,0,v=>g.rig.orbit(this.photo.az+v*Math.PI/180-g.rig.azimuth,0));
    slider('上下',.4,2.1,.05,g.rig.polar,v=>g.rig.orbit(0,v-g.rig.polar));
    slider('距離',1.5,12,.1,settings.camera.distance,v=>{settings.camera.distance=v;g.rig.distance=v});
    slider('画角',25,80,1,g.app.camera.fov,v=>{settings.camera.fov=v;g.app.camera.fov=v;g.app.camera.updateProjectionMatrix()});
    slider('ピント',1,20,.1,settings.camera.distance,v=>this.bokeh.uniforms.focus.value=v);
    slider('背景ぼけ',0,.004,.0001,0,v=>this.bokeh.uniforms.aperture.value=v);
    g.journey.button(panel,'画像を保存',()=>{const root=g.screens.root;root.style.visibility='hidden';g.app.frame();const url=g.app.renderer.gl.domElement.toDataURL('image/png');root.style.visibility='';const a=document.createElement('a');a.href=url;a.download='kuroame-ronin.png';a.click()});
    g.journey.button(panel,'戻る',()=>this.closePhoto());
  }
  closePhoto(){
    if(!this.photo)return;const g=this.g,p=this.photo;this.photo=null;
    g.app.post.composer.removePass(this.bokeh);this.bokeh.dispose();this.bokeh=null;
    settings.camera.distance=p.distance;g.rig.distance=p.distance;settings.camera.fov=p.fov;g.app.camera.fov=p.fov;g.app.camera.updateProjectionMatrix();g.rig.orbit(p.az-g.rig.azimuth,p.polar-g.rig.polar);
    g.hud.setVisible(g.state!=='title');p.back();
  }
}
