import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  Vector3
} from 'three';

const _p = new Vector3();

/**
 * What makes 羅刹 read as heavy: a long lacquer-red loincloth that trails his
 * stride, and a black miasma that pools at his feet and climbs him.
 *
 * The cloth hangs from the hips in two panels, each hinged at the belt and
 * swung by a damped spring the body's own motion drives. The miasma is a small
 * pool of soft dark sprites (normal blending, so it darkens what is behind it
 * rather than glowing), thicker with every phase.
 */
export class BossDressing {
  constructor(agent) {
    this.agent = agent;
    this.enemy = agent.enemy;
    const h = agent.type.height;
    const k = h / 1.8;

    /* ---- the loincloth ---- */
    this.panels = [];
    const hips = this.enemy.bones.get('Hips');
    if (hips) {
      this.enemy.root.updateWorldMatrix(true, true);
      const scale = hips.getWorldScale(new Vector3());
      const mount = new Group();
      mount.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
      hips.add(mount);
      this.mount = mount;
      const cloth = new MeshStandardMaterial({ color: '#4a0c08', roughness: 0.85, metalness: 0.05, side: DoubleSide });
      const trim = new MeshStandardMaterial({ color: '#b08a34', roughness: 0.4, metalness: 0.8, side: DoubleSide });
      for (const side of [1, -1]) {
        const hinge = new Group();
        hinge.position.set(0, -0.02 * k, side * 0.16 * k);
        const length = (side > 0 ? 0.62 : 0.55) * k;
        const width = 0.36 * k;
        const panel = new Mesh(new PlaneGeometry(width, length, 1, 4).translate(0, -length / 2, 0), cloth);
        const band = new Mesh(new PlaneGeometry(width * 1.02, 0.05 * k).translate(0, -length + 0.03 * k, 0.002 * side), trim);
        panel.castShadow = true;
        for (const m of [panel, band]) {
          m.userData.ownMaterial = true;
          m.userData.half = 'lower';
          hinge.add(m);
        }
        mount.add(hinge);
        this.panels.push({ hinge, side, angle: 0, vel: 0 });
      }
    }

    /* ---- the miasma ---- */
    const material = new SpriteMaterial({ map: smokeTexture(), color: '#2a0610', transparent: true, depthWrite: false, opacity: 0 });
    this.puffs = [];
    this.group = new Group();
    for (let i = 0; i < 16; i++) {
      const sprite = new Sprite(material.clone());
      sprite.visible = false;
      this.group.add(sprite);
      this.puffs.push({ sprite, life: 0, max: 1, vy: 0 });
    }
    agent.game.app.scene.add(this.group);
    this._spawn = 0;
    this._lastX = this.enemy.position.x;
    this._lastZ = this.enemy.position.z;
  }

  update(dt, phase, alive) {
    if (dt <= 0) return;
    const pos = this.enemy.position;
    const h = this.agent.type.height;

    // The body's own forward speed swings the cloth back; a flutter keeps it alive.
    const vx = (pos.x - this._lastX) / dt;
    const vz = (pos.z - this._lastZ) / dt;
    this._lastX = pos.x;
    this._lastZ = pos.z;
    const forward = Math.min(6, Math.hypot(vx, vz));
    const t = performance.now() / 1000;
    for (const p of this.panels) {
      // The back panel trails; the front is kicked forward by the knees.
      const target = forward * (p.side > 0 ? -0.07 : 0.14) + Math.sin(t * 3.1 + p.side) * 0.05;
      p.vel += ((target - p.angle) * 40 - p.vel * 7) * dt;
      p.angle += p.vel * dt;
      p.hinge.rotation.x = p.angle;
    }

    // The miasma: denser each phase, gone with him.
    const rate = alive ? [0, 7, 11, 16][phase] ?? 7 : 0;
    this._spawn += dt * rate;
    for (const puff of this.puffs) {
      if (puff.life > 0) {
        puff.life -= dt;
        const u = 1 - puff.life / puff.max;
        puff.sprite.position.y += puff.vy * dt;
        puff.sprite.scale.setScalar(puff.size * (0.6 + u * 1.2));
        puff.sprite.material.opacity = Math.sin(u * Math.PI) * 0.55;
        if (puff.life <= 0) puff.sprite.visible = false;
      } else if (this._spawn >= 1) {
        this._spawn -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = 0.35 + Math.random() * 0.6;
        _p.set(pos.x + Math.cos(a) * r, pos.y + Math.random() * h * 0.45, pos.z + Math.sin(a) * r);
        puff.sprite.position.copy(_p);
        puff.max = puff.life = 1.4 + Math.random() * 1.0;
        puff.size = 0.9 + Math.random() * 0.8;
        puff.vy = 0.5 + Math.random() * 0.6;
        puff.sprite.visible = true;
      }
    }
    this._spawn = Math.min(this._spawn, 2);
  }

  dispose() {
    this.mount?.removeFromParent();
    this.group.removeFromParent();
  }
}

let _smoke = null;
function smokeTexture() {
  if (_smoke) return _smoke;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _smoke = new CanvasTexture(canvas);
  return _smoke;
}
