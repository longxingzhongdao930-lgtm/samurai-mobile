import { SwordVolley } from './SwordVolley.js';
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, CylinderGeometry, Vector3, PlaneGeometry, DoubleSide, AdditiveBlending, Quaternion } from 'three';

/** Local, disposable effects: no global timers or persistent projectile ownership. */
export class FloatingCaster {
  constructor(enemy) {
    this.enemy = enemy;
    this.time = 0; this.beamTime = 0;
    this.group = new Group(); enemy.root.add(this.group);
    this.material = new MeshBasicMaterial({ color: enemy.kind === 'mage' ? '#91eaff' : '#bce8ff', transparent: true, opacity: 0.8, depthWrite: false });
    this.orb = new Mesh(new SphereGeometry(1, 12, 8), this.material);
    this.group.add(this.orb); this.orb.visible = false;
    this.beam = new Mesh(new CylinderGeometry(1, 1, 1, 8), this.material);
    this.group.add(this.beam); this.beam.visible = false;
    if (enemy.kind === 'mage') {
      this.ringPivot = new Group(); this.group.add(this.ringPivot);
      this.ringMaterial = new MeshBasicMaterial({ map: enemy.magicRingTexture ?? null, color: '#ffffff',
        transparent: true, blending: AdditiveBlending, side: DoubleSide, depthWrite: false, toneMapped: false });
      this.ring = new Mesh(new PlaneGeometry(1, 1), this.ringMaterial);
      this.ringPivot.add(this.ring); this.ringPivot.visible = false;
    }
    this.swords = [];
    if (enemy.kind === 'queen') this.swords = [...new Set(enemy.bones.values())].filter(b => /^Bone00[1-6]_\d+$/.test(b.name));
    if (this.swords.length) this.volley = new SwordVolley(enemy, this.swords);
    this.aim = new Vector3(); this.hasAim = false;
  }
  handPosition() {
    const e = this.enemy, hand = e.bones.get('CC_Base_R_Hand_085');
    e.root.updateMatrixWorld(true);
    if (hand) return hand.getWorldPosition(new Vector3());
    return e.root.localToWorld(new Vector3(-0.4, 1.4, 0.25));
  }
  palmPosition() {
    const wrist = this.handPosition(), finger = this.enemy.bones.get('CC_Base_R_Mid1_089');
    return finger ? wrist.lerp(finger.getWorldPosition(new Vector3()), 0.5) : wrist;
  }
  muzzlePosition() {
    const hand = this.palmPosition();
    const target = this.hasAim ? this.aim : this.enemy.agent?.game.playerPosition?.clone().add(new Vector3(0, 1.1, 0));
    return target ? hand.addScaledVector(target.clone().sub(hand).normalize(), 0.09) : hand;
  }
  cast(spec, index) {
    if (spec.magicSequence && index < 3) {
      this.enemy.agent.game.magic.enemyShot(this.enemy.agent, { ...spec, damage: 6, originCaster: true,
        originBone: 'CC_Base_R_Hand_085', projectile: { speed: 11, radius: 0.12, color: '#5dcfff' } });
      return;
    }
    this.fire(spec);
  }
  update(dt) {
    const e = this.enemy, a = e.agent;
    this.time += dt; this.beamTime = Math.max(0, this.beamTime - dt);
    const attacking = e.alive && a?.state === 'attack', phase = a?.move?.phase ?? 0;
    const contact = a?.moveSpec?.hits?.at(-1) ?? 0.55;
    if (!attacking) this.hasAim = false;
    if (e.kind === 'mage') {
      const charging = attacking && phase >= 0.48 && phase < contact;
      if (attacking && (!this.hasAim || phase < contact - 0.15)) {
        this.aim.copy(a.game.playerPosition).y += 1.1; this.hasAim = true;
      }
      this.orb.visible = false;
      const origin = this.muzzlePosition();
      this.orb.position.copy(e.root.worldToLocal(origin.clone()));
      this.orb.scale.setScalar(0.08 + 0.24 * Math.min(1, phase / contact));
      this.ringPivot.visible = attacking || (e.alive && this.beamTime > 0);
      if (this.ringPivot.visible) {
        const charge = Math.max(0, Math.min(1, (phase - 0.48) / (contact - 0.48)));
        const recovery = phase > contact ? Math.max(0, 1 - (phase - contact) / 0.16) : 1;
        this.ringPivot.position.copy(e.root.worldToLocal(origin.clone()));
        const direction = this.aim.clone().sub(origin).normalize();
        const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction);
        this.ringPivot.quaternion.copy(e.root.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
        this.ring.scale.setScalar((0.14 + charge * 0.04) * recovery);
        this.ring.rotation.z = this.time * (0.8 + charge);
        this.ringMaterial.opacity = (0.55 + charge * 0.45) * recovery;
      }
      this.beam.visible = e.alive && (charging || this.beamTime > 0);
      if (this.beam.visible) {
        const from = e.root.worldToLocal(origin.clone()), to = e.root.worldToLocal(this.aim.clone());
        const delta = to.sub(from), length = delta.length();
        this.beam.position.copy(from).addScaledVector(delta, 0.5);
        this.beam.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
        this.beam.scale.set(this.beamTime > 0 ? 0.16 : 0.012, length, this.beamTime > 0 ? 0.16 : 0.012);
      }
    }
    this.volley?.update(dt);
  }
  beforeAnimate() { this.volley?.beforeAnimate(); }

  fire(spec) {
    const a = this.enemy.agent, origin = this.muzzlePosition();
    if (!this.hasAim) this.aim.copy(a.game.playerPosition).y += 1.1;
    this.beamTime = 0.22;
    const delta = this.aim.clone().sub(origin), length = delta.length(); delta.normalize();
    const target = a.game.playerPosition.clone(); target.y += 1.1;
    const offset = target.sub(origin), along = offset.dot(delta);
    if (along >= 0 && along <= Math.min(22, length + 0.6) && offset.addScaledVector(delta, -along).length() < 0.5) {
      const result = a.game.player.receiveHit({ damage: spec.damage, posture: spec.posture, knockback: spec.knockback,
        from: origin, attacker: this.enemy, kind: 'shadowLaser', unparryable: true });
      if (result === 'block') a._recoil(0.25);
    }
    a.game.audio?.play('thunder', { pos: origin, volume: 0.6 });
  }
  dispose() {
    this.volley?.clear();
    this.group.traverse(node => node.geometry?.dispose());
    this.ringMaterial?.dispose();
    this.material.dispose(); this.group.removeFromParent();
  }
}
