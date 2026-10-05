import { VergilIaiMotion } from './VergilIaiMotion.js';
import { Group, Mesh, MeshStandardMaterial, ConeGeometry, CylinderGeometry, SphereGeometry, BufferGeometry, Line, LineBasicMaterial, Vector3, RingGeometry, MeshBasicMaterial, AdditiveBlending, DoubleSide } from 'three';
import { SheathBody } from './SheathBody.js';
import { SHEATH_REFERENCE } from './SheathReference.js';
import { KatanaSheath } from './KatanaSheath.js';
import { ik } from '../combat/WeaponMotion.js';

/** Small, reversible pose offsets; no edits to the imported rig or animation tracks. */
export class HeroPresence {
  constructor(game){
    this.g=game;this.iaiMotion=new VergilIaiMotion(this);this.sheathBody=new SheathBody(this);this.katanaSheath=new KatanaSheath(this,{reference:SHEATH_REFERENCE.single});this.originals=new Map();this.look=0;this.speed=0;this.sway=0;
    this.root=new Group();game.app.scene.add(this.root);
    const cloth=new MeshStandardMaterial({color:'#252f39',roughness:.95,side:DoubleSide});this.cloth=cloth;
    this.hat=new Mesh(new ConeGeometry(.43,.14,24),new MeshStandardMaterial({color:'#584632',roughness:1}));
    this.mask=new Mesh(new SphereGeometry(.115,12,8),new MeshStandardMaterial({color:'#8e3929',roughness:.6}));this.mask.scale.set(1,.72,.32);
    this.coat=new Group();this.flaps=[];
    for(const side of [-1,1]){const f=new Mesh(new CylinderGeometry(.255,.31,.6,12,4,true,side<0?.55:Math.PI,Math.PI-.55),cloth);f.position.set(0,-.17,0);this.flaps.push(f);this.coat.add(f);}
    this.chargeRing=new Mesh(new RingGeometry(.11,.125,32),new MeshBasicMaterial({color:'#99d9ff',transparent:true,opacity:0,depthWrite:false,side:DoubleSide,blending:AdditiveBlending}));this.root.add(this.chargeRing);
    this.sheath=new Group();this.sheath.name='Mythical scabbard mount';
    this.root.add(this.hat,this.mask,this.coat,this.sheath);
    const dragonMaterial=new MeshStandardMaterial({color:'#abcce2',emissive:'#224e80',emissiveIntensity:.8,metalness:.65,roughness:.35});
    this.dragonHorns=new Group();for(const side of [-1,1]){const horn=new Mesh(new ConeGeometry(.045,.24,6),dragonMaterial);horn.position.set(side*.13,.23,-.035);horn.rotation.z=-side*.35;this.dragonHorns.add(horn);}this.root.add(this.dragonHorns);
    this.sleeves=['Left','Right'].map(side=>{const mesh=new Mesh(new CylinderGeometry(.14,.12,.24,10,1,true),cloth);this.root.add(mesh);return {side,mesh};});
    this.tether=new Line(new BufferGeometry().setFromPoints([new Vector3(),new Vector3()]),new LineBasicMaterial({color:'#9dd8eb',transparent:true,opacity:.5}));this.tether.frustumCulled=false;this.root.add(this.tether);
  }
  async loadScabbard(){
    await this.g.weapons.swords.select(this.g.heroStudio.sword);
  }
  restore(){for(const [bone,q] of this.originals)bone.quaternion.copy(q);this.originals.clear();}
  turn(bone,x=0,y=0,z=0){if(!bone)return;if(!this.originals.has(bone))this.originals.set(bone,bone.quaternion.clone());bone.rotateX(x);bone.rotateY(y);bone.rotateZ(z);}
  update(dt){
    const g=this.g,p=g.player,c=p.character,arts=p.arts;
    this.root.visible=!p.dead&&!g.form.active;
    if(!this.root.visible){g.fx?.leftTrail.end();return;}
    const speed=g.app.controller.speed??0, decel=Math.max(0,this.speed-speed);this.speed=speed;
    const target=p.lockTarget?.alive?p.lockTarget:g._nearest(6);
    let want=target?Math.atan2(target.position.x-c.position.x,target.position.z-c.position.z)-c.facing:0;
    want=Math.atan2(Math.sin(want),Math.cos(want));want=Math.max(-.55,Math.min(.55,want));this.look+=(want-this.look)*Math.min(1,dt*8);
    if(p.state==='free'&&!arts.mode){
      this.turn(c.getBone('Head'),0,this.look*.65,0);this.turn(c.getBone('Spine2'),Math.min(.06,decel*.02),this.look*.18,0);
      const near=target&&target.position.distanceTo(c.position)<3;
      this.turn(c.getBone('RightArm'),near?-.05:.04,0,arts.mode?-.08:0);
      if(p.spirit.calm>=100)this.turn(c.getBone('Spine1'),.06,0,0);
      if(p.hp<25)this.turn(c.getBone('Spine1'),.018*Math.sin(g.elapsed*5),0,0);
      if(p.hp<25&&g.state==='playing'&&g.elapsed>(this.breathAt??0)){this.breathAt=g.elapsed+4;g.audio.play('breath',{volume:.12})}
      const threat=g.coach.warnings.find(w=>w.el.classList.contains('is-edge'));
      if(threat)this.turn(c.getBone('LeftArm'),0,0,.08);
    }
    const groundedIai=p.weapon.id==='katana'&&p.state==='attack'&&(p.move===p.heavy||p.move?.config.swordMotion)&&!p.move?.config.airborne;
    if((p.state==='free'&&speed<2||groundedIai)&&!(p.techniques?.traversal?.lift>0)&&!c.airHeight&&!c.jump?.locked&&!c.hop?.locked){
      for(const side of ['Left','Right']){
        const up=c.getBone(side+'UpLeg'),low=c.getBone(side+'Leg'),foot=c.getBone(side+'Foot');if(!up||!low||!foot)continue;
        c.root.updateMatrixWorld(true);const at=foot.getWorldPosition(new Vector3()),ground=g.app.terrain.heightAt(at.x,at.z);
        const delta=Math.max(-.12,Math.min(.12,ground+.08-at.y));
        if(Math.abs(delta)>.015){for(const b of [up,low])this.originals.set(b,b.quaternion.clone());ik(up,low,foot,at.add(new Vector3(0,delta,0)),new Vector3(Math.sin(c.facing),0,Math.cos(c.facing)),groundedIai?.9:.45);}
      }
    }
    this.sheathBody.update(dt);
    // Keep the supporting feet fixed through insertion and the upright release.
    // Locomotion and airborne actions immediately relinquish these anchors.
    const planted=p.weapon.id==='katana'&&p.state==='free'&&speed<.1&&['sheath','flourish','sheathed'].includes(arts.mode)&&!c.airHeight&&!c.jump?.locked&&!c.hop?.locked;
    if(planted){
      c.root.updateMatrixWorld(true);
      if(!this.sheathFeet)this.sheathFeet=['Left','Right'].map(side=>c.getBone(side+'Foot')?.getWorldPosition(new Vector3()));
      for(const [i,side] of ['Left','Right'].entries()){
        const up=c.getBone(side+'UpLeg'),low=c.getBone(side+'Leg'),foot=c.getBone(side+'Foot');
        if(up&&low&&foot&&this.sheathFeet[i]){this.turn(up);this.turn(low);ik(up,low,foot,this.sheathFeet[i],new Vector3(Math.sin(c.facing),0,Math.cos(c.facing)),1);}
      }
    }else this.sheathFeet=null;
    const cfg=p.move?.config;
    if(p.state==='attack'&&cfg){
      const pulse=Math.sin(Math.PI*Math.min(1,p.move.phase));
      if(cfg.heroFinish==='thrust'||p.move===p.counter&&cfg.heroCounter===0){
        const upper=c.getBone('RightArm'),lower=c.getBone('RightForeArm'),hand=c.getBone('RightHand');
        if(upper&&lower&&hand){this.turn(upper);this.turn(lower);c.root.updateMatrixWorld(true);
          const at=hand.getWorldPosition(new Vector3()).add(new Vector3(Math.sin(c.facing)*.18*pulse,0,Math.cos(c.facing)*.18*pulse));
          ik(upper,lower,hand,at,new Vector3(0,-1,0),.6);
        }
      }
      if(cfg.heroBack)this.turn(c.getBone('Spine1'),.06*pulse,0,0);
      if(cfg.heroClose)this.turn(c.getBone('RightArm'),.18*pulse,0,0);
      if(cfg.heroCounter)this.turn(c.getBone('Spine2'),0,cfg.heroCounter*.12*pulse,0);
      if(cfg.heroFinish==='low')this.turn(c.getBone('Spine1'),.12*pulse,0,0);
      if(cfg.heroFinish==='rear'||cfg.heroDirection==='left'||cfg.heroDirection==='right')this.turn(c.getBone('Spine2'),0,(cfg.heroDirection==='left'?-.14:.14)*pulse,0);
      if(cfg.heroSwitch)this.turn(c.getBone('LeftArm'),0,0,.12*pulse);
    }
    const head=c.getBone('Head'),chest=c.getBone('Spine2');c.root.updateMatrixWorld(true);
    const cosmetic=g.heroStudio?.appearance??'plain';
    this.hat.visible=cosmetic==='hat';this.mask.visible=cosmetic==='mask';this.coat.visible=cosmetic==='coat';
    this.dragonHorns.visible=arts.transform>0;if(head){head.getWorldPosition(this.dragonHorns.position);this.dragonHorns.quaternion.copy(head.getWorldQuaternion(this.dragonHorns.quaternion));head.getWorldPosition(this.hat.position);this.hat.position.y+=.28;this.hat.rotation.y=c.facing;head.getWorldPosition(this.mask.position);this.mask.position.add(new Vector3(Math.sin(c.facing)*.12,.12,Math.cos(c.facing)*.12));this.mask.rotation.y=c.facing;}
    if(chest){chest.getWorldPosition(this.coat.position);this.coat.rotation.y=c.facing;}
    for(const {side,mesh} of this.sleeves){
      const upper=c.getBone(side+'Arm'),lower=c.getBone(side+'ForeArm');mesh.visible=cosmetic==='coat'&&!!upper&&!!lower;
      if(mesh.visible){const a=upper.getWorldPosition(new Vector3()),b=lower.getWorldPosition(new Vector3());mesh.position.copy(a).lerp(b,.35);mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),b.sub(a).normalize());}
    }
    this.sway+=(Math.min(.22,speed*.035)-this.sway)*Math.min(1,dt*5);
    for(let i=0;i<this.flaps.length;i++)this.flaps[i].rotation.x=-this.sway+Math.sin(g.elapsed*3+i)*.025;
    this.cloth.color.setRGB(.025*(1-arts.dirt*.35),.035*(1-arts.dirt*.35),.045*(1-arts.dirt*.35));
    this.sheath.visible=p.weapon.id==='katana';
    const blade=g.weapons.blade?.() ?? g.weapons._slot()?.model;if(blade&&p.weapon.id==='katana')blade.visible=!['sheath','sheathed','charge'].includes(arts.mode);
    this.iaiMotion.update();
    this.katanaSheath.update(dt);
    if(p.weapon.id==='katana'&&p.state==='free'&&!p.guarding&&arts.mode==='sheathed'&&!c.airHeight){for(const side of ['Left','Right'])this.katanaSheath.straightenWrist(side);}
    this.chargeRing.visible=p.weapon.id==='katana'&&arts.mode==='charge';
    if(this.chargeRing.visible){const ready=Math.min(1,arts.t/.32);this.chargeRing.position.copy(this.sheath.position);this.chargeRing.quaternion.copy(g.app.rig.camera.quaternion);this.chargeRing.scale.setScalar(.7+ready*.45+Math.sin(arts.t*18)*.12);this.chargeRing.material.opacity=.25+ready*.35;if(g.elapsed>(this.chargeSparkAt??0)){this.chargeSparkAt=g.elapsed+.09;g.fx.glow.spawn(this.sheath.position,'#aee9ff',.08+ready*.06,.16,{star:true,grow:1,intensity:.65});}}
    const fist=g.weapons.fist,f=fist?.flight;
    this.tether.visible=!!f&&(f.time<.2||f.returning||f.grabbed);
    if(this.tether.visible){const a=this.tether.geometry.attributes.position,home=fist.home();a.setXYZ(0,home.x,home.y,home.z);a.setXYZ(1,f.pos.x,f.pos.y,f.pos.z);a.needsUpdate=true;}
  }
}
