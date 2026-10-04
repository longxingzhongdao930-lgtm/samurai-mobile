import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
const DIRECT = new Set(['melee', 'thrown', 'spell', 'magic', 'deflect']);

/** Defence feeds the drawn blade; successful attacks awaken a brief spectral dragon arm. */
export class DualSpirit {
  constructor(player) { this.player = player; this.game = player.game; this.reset(); }
  reset() { this.calm = 0; this.dragon = 0; this.gainCooldown = 0; this.pulse = 0; if (this.arm) this.arm.visible = false; }
  defend(parry) {
    if (this.game.form?.active || this.player.dead) return;
    const before = this.calm; this.calm = Math.min(100, this.calm + (parry ? 34 : 12));
    if (before < 100 && this.calm === 100) this.game.hud?.notice('静けさ充填 — 刀の長押しで強化居合', 2.2);
  }
  empowerMove(config, isHeavy) {
    if (!isHeavy || this.player.weapon.id !== 'katana' || this.calm < 100 || this.game.form?.active) return config;
    this.calm = 0;
    this.game.hud?.notice('静の居合', 1);
    this.game.audio?.play('charge');
    return { ...config, damage: config.damage * 1.6, posture: config.posture * 1.5, spiritCalm: true };
  }
  eligible(hit) { return !this.player.dead && !this.game.form?.active && !hit.execute && DIRECT.has(hit.source) && hit.damage > 0; }
  prepareHit(hit) {
    if (!this.eligible(hit) || this.dragon < 100) return hit;
    return { ...hit, damage: hit.damage + 10, posture: (hit.posture ?? 0) + 24, dragonPulse: true };
  }
  landed(hit, result, enemy) {
    if (!this.eligible(hit) || !result?.damage || result.evaded) return;
    if (hit.dragonPulse) {
      this.dragon = 0; this.gainCooldown = 0.2; this.pulse = 0.8;
      this.game.fx?.slam(enemy.position, 0.9, '#a6e8ff');
      this.game.audio?.play('roar', { volume: 0.35, pitch: 1.4 });
      this.game.hud?.notice('竜爪 — 体幹を砕く', 1);
    } else if (this.gainCooldown <= 0) {
      const before = this.dragon; this.dragon = Math.min(100, this.dragon + 10); this.gainCooldown = 0.18;
      if (before < 100 && this.dragon === 100) this.game.hud?.notice('竜の力充填 — 次の命中で竜爪', 1.8);
    }
  }
  update(dt) {
    this.gainCooldown = Math.max(0, this.gainCooldown - dt);
    this.pulse = Math.max(0, this.pulse - dt);
    if (this.player.dead || this.game.form?.active) this.pulse = 0;
  }
  _buildArm() {
    const arm = this.arm = new Group(); arm.name = 'Partial Dragon Claw';
    const material = this.armMaterial = new MeshBasicMaterial({ color: '#a5dbff', transparent: true, opacity: 0.65, depthWrite: false });
    const scale = new BoxGeometry(0.12, 0.1, 0.1), claw = new ConeGeometry(0.035, 0.22, 5);
    for (let i = 0; i < 3; i++) {
      const plate = new Mesh(scale, material); plate.position.z = 0.07 + i * 0.075; plate.rotation.z = i % 2 ? 0.2 : -0.2; arm.add(plate);
      const nail = new Mesh(claw, material); nail.rotation.x = Math.PI / 2; nail.position.set((i - 1) * 0.065, 0, 0.39); arm.add(nail);
    }
    this.game.app.scene.add(arm);
  }
  lateUpdate() {
    const partial=this.player.arts?.transform??0;
    const visible = (partial>0 || this.pulse > 0 && !this.game.form?.active) && !this.player.dead;
    if (!visible) { if (this.arm) this.arm.visible = false; return; }
    if (!this.arm) this._buildArm();
    const c = this.player.character, elbow = c.getBone('LeftForeArm'), hand = c.getBone('LeftHand');
    this.arm.visible = !!elbow && !!hand;
    if (!this.arm.visible) return;
    const from = elbow.getWorldPosition(new Vector3()), direction = hand.getWorldPosition(new Vector3()).sub(from).normalize();
    this.arm.position.copy(from); this.arm.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction));
    this.arm.scale.setScalar(1 + Math.sin(this.pulse / 0.8 * Math.PI) * 0.25);
    this.armMaterial.opacity = partial>0?.28:Math.min(.7,this.pulse*3);
  }
}
