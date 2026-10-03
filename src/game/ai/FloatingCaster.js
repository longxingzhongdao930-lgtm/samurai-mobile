import { Group, Mesh, MeshBasicMaterial, SphereGeometry, CylinderGeometry, Vector3 } from 'three';

/** Local, disposable effects: no global timers or persistent projectile ownership. */
export class FloatingCaster {
  constructor(enemy) {
    this.enemy = enemy;
    this.time = 0; this.beamTime = 0;
    this.group = new Group(); enemy.root.add(this.group);
    this.material = new MeshBasicMaterial({ color: enemy.kind === 'mage' ? '#ba73ff' : '#bce8ff', transparent: true, opacity: 0.8, depthWrite: false });
    this.orb = new Mesh(new SphereGeometry(1, 12, 8), this.material);
    this.group.add(this.orb); this.orb.visible = false;
    this.beam = new Mesh(new CylinderGeometry(1, 1, 1, 8), this.material);
    this.group.add(this.beam); this.beam.visible = false;
    this.swords = [];
    if (enemy.kind === 'queen') this.swords = [...new Set(enemy.bones.values())].filter(b => /^Bone00[1-6]_\d+$/.test(b.name));
    this.aim = new Vector3(); this.hasAim = false;
  }
  handPosition() {
    const e = this.enemy, hand = e.bones.get('CC_Base_R_Hand_085');
    e.root.updateMatrixWorld(true);
    if (hand) return hand.getWorldPosition(new Vector3());
    return e.root.localToWorld(new Vector3(-0.4, 1.4, 0.25));
  }
  update(dt) {
    const e = this.enemy, a = e.agent;
    this.time += dt; this.beamTime = Math.max(0, this.beamTime - dt);
    const attacking = e.alive && a?.state === 'attack', phase = a?.move?.phase ?? 0;
    const contact = a?.moveSpec?.hits?.[0] ?? 0.55;
    if (!attacking) this.hasAim = false;
    if (e.kind === 'mage') {
      const charging = attacking && phase < contact;
      if (charging && (!this.hasAim || phase < contact - 0.15)) {
        this.aim.copy(a.game.playerPosition).y += 1.1; this.hasAim = true;
      }
      this.orb.visible = charging;
      const origin = this.handPosition();
      this.orb.position.copy(e.root.worldToLocal(origin.clone()));
      this.orb.scale.setScalar(0.08 + 0.24 * Math.min(1, phase / contact));
      this.beam.visible = e.alive && (charging || this.beamTime > 0);
      if (this.beam.visible) {
        const from = e.root.worldToLocal(origin.clone()), to = e.root.worldToLocal(this.aim.clone());
        const delta = to.sub(from), length = delta.length();
        this.beam.position.copy(from).addScaledVector(delta, 0.5);
        this.beam.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize());
        this.beam.scale.set(this.beamTime > 0 ? 0.16 : 0.012, length, this.beamTime > 0 ? 0.16 : 0.012);
      }
    }
    this.swords.forEach(bone => {
      if (!e.alive || !attacking) return;
      const hits = a?.moveSpec?.hits ?? [];
      const thrust = Math.max(0, ...hits.map(hit => 1 - Math.abs(phase - hit) / 0.14));
      const world = bone.getWorldPosition(new Vector3());
      world.addScaledVector(new Vector3(Math.sin(e.facing), 0, Math.cos(e.facing)), thrust * 1.5);
      bone.position.copy(bone.parent.worldToLocal(world));
    });
  }

  fire(spec) {
    const a = this.enemy.agent, origin = this.handPosition();
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
    this.group.traverse(node => node.geometry?.dispose());
    this.material.dispose(); this.group.removeFromParent();
  }
}
