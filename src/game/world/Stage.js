import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CircleGeometry,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Points,
  ShaderMaterial,
  Vector3
} from 'three';
import { LAYER } from '../../core/Layers.js';
import { Builder } from './Builder.js';
import { Rain } from './Rain.js';
import { makeTextures } from './textures.js';

const _v = new Vector3();
const _t = new Vector3();

/**
 * 黒雨の城下町 — the trial's one stage, in three areas along +Z:
 *
 *   壱 城下町  (z −8 … 142)  the main street, two side yards, two plazas
 *   弐 廃神社  (z 141 … 214) a torii path through bamboo, the shrine court
 *   参 城門    (z 213 … 284) the approach and the castle court — 羅刹
 *
 * The walkable ground is a union of rectangles; everything outside them is
 * buildings, bamboo or wall, so collision is "stay inside the union" plus a
 * handful of round and boxy props. Spirit barriers close an arena while its
 * fight is on. The same rectangles keep the camera out of the walls.
 *
 * All geometry is primitives merged per material (a dozen draws for the whole
 * town) with canvas-painted textures; the lanterns share a small pool of
 * point lights that follow the player from lantern to lantern.
 */

/** [x0, x1, z0, z1] */
const WALKABLE = [
  [-4.6, 4.6, -8, 87], // main street
  [-12.5, -3.6, 33, 39.5], // left alley
  [-22, -11, 26, 48], // left courtyard
  [3.6, 12.5, 65.5, 72], // right alley
  [11, 24, 57, 81], // right yard
  [-13, 13, 85, 109], // plaza A — 赤鬼
  [-4.2, 4.2, 107, 114], // the gate between the plazas
  [-16, 16, 112, 142], // plaza B — the horde
  [-3.2, 3.2, 140, 190], // torii path
  [2.2, 11, 163.5, 169.5], // side path
  [10, 18, 159, 175], // hokora clearing
  [-14, 14, 188, 214], // shrine court
  [-3.6, 3.6, 212, 242], // castle approach
  [-18, 18, 240, 283] // castle court — 羅刹
];

/** Barriers the flow can raise: [x0, x1, z0, z1]. */
const BARRIERS = {
  plazaA: [-4.6, 4.6, 85, 86.2],
  gateAB: [-4.2, 4.2, 108.6, 109.8],
  plazaBIn: [-4.2, 4.2, 112, 113.2],
  plazaBOut: [-3.2, 3.2, 140.6, 141.8],
  shrineIn: [-3.2, 3.2, 187.6, 188.8],
  shrineOut: [-3.6, 3.6, 213.2, 214.4],
  bossIn: [-3.6, 3.6, 240.2, 241.4]
};

export class Stage {
  constructor(game) {
    this.game = game;
    this.group = new Group();
    this.group.name = 'Stage';
    /** Round obstacles: {x, z, r}. */
    this.circles = [];
    /** Box obstacles: [x0, x1, z0, z1]. */
    this.boxes = [];
    this.lanterns = [];
    this.barriers = {};
    this.flash = 0;
    this._time = 0;
    /** Points of interest the flow places pickups at. */
    this.spots = {};
  }

  async build() {
    const game = this.game;
    const app = game.app;
    const tex = makeTextures();
    this.tex = tex;
    const quality = game.quality;

    const std = (params, extra = {}) => {
      const m = new MeshStandardMaterial(params);
      Object.assign(m.userData, extra);
      return m;
    };
    // The floor's own flagstone, re-used for walls and lanterns. Cloned so its
    // repeat is ours: the floor re-tiles its copy every frame.
    const stoneSource = app.ground?.sets?.get('stone')?.map ?? null;
    const stoneMap = stoneSource ? stoneSource.clone() : null;
    if (stoneMap) {
      stoneMap.repeat.set(1, 1);
      stoneMap.offset.set(0, 0);
      stoneMap.needsUpdate = true;
    }
    this.materials = {
      wood: std({ map: tex.wood, roughness: 0.85, metalness: 0, color: '#d8c8b8' }),
      darkwood: std({ map: tex.wood, roughness: 0.9, color: '#6a5a50' }),
      lattice: std({ map: tex.lattice, roughness: 0.8 }),
      shoji: std({ map: tex.shoji, emissiveMap: tex.shoji, emissive: '#ffffff', emissiveIntensity: 2.0, roughness: 0.9 }),
      plaster: std({ map: tex.plaster, roughness: 0.95, color: '#9a968e' }),
      tiles: std({ map: tex.tiles, roughness: 0.38, metalness: 0.3, color: '#b0b8c8' }),
      vermilion: std({ map: tex.vermilion, roughness: 0.6, color: '#ffffff' }),
      stone: std({ map: stoneMap, roughness: 0.75, color: stoneMap ? '#8a8e96' : '#4a4e56' }),
      lantern: std({ map: tex.lantern, emissiveMap: tex.lantern, emissive: '#ffffff', emissiveIntensity: 2.6, roughness: 0.8 }, { castShadow: false }),
      noren: std({ map: tex.noren, roughness: 0.95, side: DoubleSide }),
      bamboo: std({ map: tex.bamboo, roughness: 0.6, color: '#c8d8b8' }),
      leaf: std({ color: '#1d2e1a', roughness: 0.8, side: DoubleSide }),
      iron: std({ color: '#2a2624', roughness: 0.45, metalness: 0.8 }),
      gold: std({ color: '#c9a25a', roughness: 0.35, metalness: 0.9, emissive: '#3a2a08', emissiveIntensity: 0.3 })
    };
    for (const m of Object.values(this.materials)) app.environment.excludeFromKeyLights?.(m);

    const b = new Builder();
    this._town(b);
    this._shrine(b);
    this._castle(b);
    const meshes = b.build(this.materials);
    for (const mesh of meshes) {
      mesh.layers.set(LAYER.WORLD);
      this.group.add(mesh);
    }

    this._puddles();
    this._lanternGlows();
    this._barrierMeshes();

    this.rain = new Rain(quality.rainCount);
    this.group.add(this.rain.lines, this.rain.splashes);

    // A few real lights, carried to the lanterns nearest the player.
    this.lights = [];
    for (let i = 0; i < quality.lanternLights; i++) {
      const light = new PointLight('#ff9a4a', 0, 15, 1.5);
      light.position.set(0, -50, 0);
      this.lights.push(light);
      this.group.add(light);
    }

    app.scene.add(this.group);
  }

  /* ------------------------------------------------------------------ */
  /* 壱 城下町                                                           */
  /* ------------------------------------------------------------------ */

  _town(b) {
    // The street, both sides, with the two alleys left open.
    this._row(b, 'left', -4.8, -8, 33);
    this._row(b, 'left', -4.8, 39.5, 85);
    this._row(b, 'right', 4.8, -8, 65.5);
    this._row(b, 'right', 4.8, 72, 85);
    // Behind the start: a closed wooden gate.
    b.box('darkwood', 0, 0, -8.6, 9.6, 3.2, 0.4);
    b.box('tiles', 0, 3.2, -8.6, 10.4, 0.25, 1.2);

    // Left courtyard, with the alley houses around it.
    this._rowX(b, 'north', 48.4, -22.5, -10.6);
    this._rowX(b, 'south', 25.6, -22.5, -10.6);
    this._row(b, 'right', -22.4, 26, 48, { depth: 6 });
    this._well(b, -16.5, 42);
    this._crates(b, -20, 29);
    this.spots.courtyard = new Vector3(-16.5, 0, 31);
    this._toro(b, -12, 46);

    // Right yard.
    this._rowX(b, 'north', 81.4, 10.6, 24.5);
    this._rowX(b, 'south', 56.6, 10.6, 24.5);
    this._row(b, 'left', 24.4, 57, 81, { depth: 6 });
    this._crates(b, 21, 60);
    this._barrel(b, 13, 79);
    this._barrel(b, 14, 79.6);
    this.spots.yard = new Vector3(20.5, 0, 74);

    // Plaza A — houses around three sides, a fire watchtower.
    this._row(b, 'left', -13.2, 85, 109);
    this._row(b, 'right', 13.2, 85, 109);
    this._rowX(b, 'north', 109.2, -13.5, -4.4);
    this._rowX(b, 'north', 109.2, 4.4, 13.5);
    this._rowX(b, 'south', 84.8, -13.5, -4.8);
    this._rowX(b, 'south', 84.8, 4.8, 13.5);
    this._watchtower(b, 9.5, 104.5);
    this._toro(b, -10, 88);
    this._toro(b, 10, 88);
    this.spots.plazaA = new Vector3(0, 0, 98);

    // Plaza B — the big square before the shrine road.
    this._row(b, 'left', -16.2, 112, 142);
    this._row(b, 'right', 16.2, 112, 142);
    this._rowX(b, 'south', 111.8, -16.5, -4.4);
    this._rowX(b, 'south', 111.8, 4.4, 16.5);
    this._rowX(b, 'north', 142.2, -16.5, -3.4);
    this._rowX(b, 'north', 142.2, 3.4, 16.5);
    for (const [x, z] of [[-8, 120], [8, 120], [-8, 134], [8, 134]]) this._toro(b, x, z);
    this._cart(b, -11, 126);
    this._barrel(b, 12, 138);
    this._barrel(b, 12.6, 137);
    this.spots.plazaB = new Vector3(0, 0, 127);
    // Lanterns strung across the street on lines.
    for (let z = 6; z < 84; z += 9) this._streetLanterns(z);
  }

  /** A row of houses whose fronts face the street along Z. */
  _row(b, side, xFront, z0, z1, { depth = 7 } = {}) {
    let z = z0;
    let i = Math.abs(Math.floor(xFront * 7 + z0));
    while (z < z1 - 2) {
      const width = Math.min(z1 - z, 5.5 + ((i * 37) % 30) / 10);
      const cx = side === 'left' ? xFront - depth / 2 : xFront + depth / 2;
      const ry = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
      this._house(b, cx, z + width / 2, width, depth, ry, i);
      z += width + 0.05;
      i++;
    }
  }

  /** A row along X whose fronts face ±Z. */
  _rowX(b, side, zFront, x0, x1, { depth = 7 } = {}) {
    let x = x0;
    let i = Math.abs(Math.floor(zFront * 3 + x0));
    while (x < x1 - 2) {
      const width = Math.min(x1 - x, 5.5 + ((i * 29) % 30) / 10);
      const cz = side === 'north' ? zFront + depth / 2 : zFront - depth / 2;
      const ry = side === 'north' ? Math.PI : 0;
      this._house(b, x + width / 2, cz, width, depth, ry, i);
      x += width + 0.05;
      i++;
    }
  }

  /**
   * One machiya. Local frame: front faces +Z (rotated by `ry`), width along X.
   */
  _house(b, cx, cz, w, d, ry, seed) {
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    // local (lx, lz) → world
    const at = (lx, lz) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
    const two = seed % 3 !== 0;
    const lower = 3.0;
    let [x, z] = at(0, 0);
    b.box('wood', x, 0, z, w, lower, d, { ry });
    // Street front: lattice, a lit window, the door cloth.
    [x, z] = at(0, d / 2 + 0.05);
    b.box('lattice', x, 0.35, z, w * 0.92, 2.25, 0.1, { ry, tile: 2.2 });
    if (seed % 2 === 0) {
      [x, z] = at(w * 0.22, d / 2 + 0.11);
      b.box('shoji', x, 0.9, z, w * 0.3, 1.1, 0.04, { ry, tile: 1.1 });
    }
    if (seed % 4 === 1) {
      [x, z] = at(-w * 0.2, d / 2 + 0.16);
      b.box('noren', x, 1.45, z, w * 0.32, 0.95, 0.02, { ry, tile: 1.4 });
    }
    // Pent roof over the ground floor.
    [x, z] = at(0, d / 2 + 0.55);
    b.box('tiles', x, lower - 0.05, z, w + 0.2, 0.14, 1.3, { ry, rx: 0.32, tile: 1.4 });

    let top = lower;
    if (two) {
      const upper = 2.3;
      [x, z] = at(0, -0.4);
      b.box('plaster', x, lower, z, w - 0.1, upper, d - 0.8, { ry, tile: 2.5 });
      [x, z] = at(0, d / 2 - 0.35);
      b.box('lattice', x, lower + 0.7, z, w * 0.6, 0.8, 0.08, { ry, tile: 1.2 });
      if (seed % 5 === 2) {
        [x, z] = at(-w * 0.2, d / 2 - 0.3);
        b.box('shoji', x, lower + 0.75, z, w * 0.25, 0.7, 0.04, { ry, tile: 0.8 });
      }
      top = lower + upper;
    }
    [x, z] = at(0, 0);
    b.gable('tiles', x, top, z, w + 0.7, d + 1.0, two ? 1.7 : 2.0, { ry });
    // Gable-end walls under the roof.
    // A pair of lanterns under the eave on some fronts.
    if (seed % 3 === 1) {
      for (const lx of [-w * 0.38, w * 0.38]) {
        [x, z] = at(lx, d / 2 + 0.9);
        this._lantern(b, x, 2.35, z);
      }
    }
  }

  _lantern(b, x, y, z, { size = 1 } = {}) {
    b.cylinder('lantern', x, y, z, 0.2 * size, 0.2 * size, 0.46 * size, { segments: 8, tile: 0.46 * size });
    b.cylinder('darkwood', x, y + 0.46 * size, z, 0.1 * size, 0.14 * size, 0.06, { segments: 6 });
    b.cylinder('darkwood', x, y - 0.05, z, 0.14 * size, 0.1 * size, 0.05, { segments: 6 });
    this.lanterns.push(new Vector3(x, y + 0.23 * size, z));
  }

  _streetLanterns(z) {
    // Hung from a line across the street, slightly swaying in the light only.
    for (const x of [-2.6, 0, 2.6]) this.lanterns.push(new Vector3(x, 3.6, z));
    this._pendingStreet ??= [];
    this._pendingStreet.push(z);
  }

  _toro(b, x, z) {
    b.box('stone', x, 0, z, 0.9, 0.3, 0.9);
    b.cylinder('stone', x, 0.3, z, 0.14, 0.18, 0.9, { segments: 6 });
    b.box('stone', x, 1.2, z, 0.75, 0.2, 0.75);
    b.box('shoji', x, 1.4, z, 0.42, 0.42, 0.42, { tile: 0.42 });
    b.geometry('stone', new ConeGeometry(0.62, 0.45, 6).translate(x, 2.05, z));
    this.lanterns.push(new Vector3(x, 1.6, z));
    this.circles.push({ x, z, r: 0.55 });
  }

  _well(b, x, z) {
    b.cylinder('stone', x, 0, z, 0.9, 0.95, 0.75, { segments: 12 });
    b.box('darkwood', x - 0.85, 0, z, 0.14, 2.2, 0.14);
    b.box('darkwood', x + 0.85, 0, z, 0.14, 2.2, 0.14);
    b.gable('tiles', x, 2.2, z, 2.0, 1.6, 0.5);
    this.circles.push({ x, z, r: 1.05 });
  }

  _barrel(b, x, z) {
    b.cylinder('darkwood', x, 0, z, 0.38, 0.34, 0.9, { segments: 10 });
    this.circles.push({ x, z, r: 0.42 });
  }

  _crates(b, x, z) {
    b.box('wood', x, 0, z, 1.1, 1.0, 1.1, { ry: 0.2 });
    b.box('wood', x + 1.0, 0, z + 0.3, 0.9, 0.8, 0.9, { ry: -0.3 });
    b.box('wood', x + 0.4, 1.0, z + 0.1, 0.8, 0.7, 0.8, { ry: 0.5 });
    this.circles.push({ x: x + 0.5, z: z + 0.15, r: 1.2 });
  }

  _cart(b, x, z) {
    b.box('wood', x, 0.6, z, 1.6, 0.25, 2.6);
    b.cylinder('darkwood', x - 0.9, 0.0, z, 0.55, 0.55, 0.12, { segments: 12 }).rotateZ(Math.PI / 2);
    b.box('darkwood', x, 0.55, z + 1.8, 0.1, 0.1, 1.6);
    this.boxes.push([x - 1.0, x + 1.0, z - 1.4, z + 2.4]);
  }

  _watchtower(b, x, z) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box('darkwood', x + dx, 0, z + dz, 0.22, 7, 0.22);
    b.box('wood', x, 6.2, z, 2.6, 0.2, 2.6);
    b.gable('tiles', x, 7.6, z, 3.0, 3.0, 1.0);
    b.box('gold', x, 7.0, z, 0.5, 0.5, 0.5);
    this.boxes.push([x - 1.2, x + 1.2, z - 1.2, z + 1.2]);
  }

  /* ------------------------------------------------------------------ */
  /* 弐 廃神社                                                           */
  /* ------------------------------------------------------------------ */

  _shrine(b) {
    // 千本鳥居 — a run of gates up the path.
    for (let z = 146; z < 186; z += 4.2) this._torii(b, 0, z, 5.4, 4.0);
    // Bamboo on both sides.
    let k = 1;
    for (let z = 141; z < 190; z += 1.1) {
      for (const side of [-1, 1]) {
        for (let layer = 0; layer < 3; layer++) {
          k = (k * 16807) % 2147483647;
          const r = (k % 1000) / 1000;
          const x = side * (3.9 + layer * 2.2 + r * 1.6);
          if (side > 0 && z > 162 && z < 171) continue; // side path gap
          this._bamboo(b, x, z + r * 0.8, 7 + r * 5, 0.06 + r * 0.03);
        }
      }
    }
    // The hokora (small shrine) in its clearing.
    this._hokora(b, 15.5, 168);
    this.spots.hokora = new Vector3(13.5, 0, 168);
    for (let z = 160; z < 176; z += 1.4) {
      for (const x of [9.6, 18.6]) this._bamboo(b, x + (z % 2) * 0.3, z, 8, 0.07);
    }
    for (let x = 10; x < 19; x += 1.3) {
      this._bamboo(b, x, 158.6, 8, 0.07);
      this._bamboo(b, x, 175.6, 8, 0.07);
    }

    // The court: stone fence, the hall, lanterns.
    this._fence(b, -14.4, 188, -14.4, 214);
    this._fence(b, 14.4, 188, 14.4, 214);
    this._fence(b, -14.4, 187.6, -3.4, 187.6);
    this._fence(b, 3.4, 187.6, 14.4, 187.6);
    this._torii(b, 0, 189.5, 7, 5.2, true);
    this._hall(b, 0, 208);
    for (const [x, z] of [[-6, 194], [6, 194], [-6, 200], [6, 200]]) this._toro(b, x, z);
    this.spots.shrine = new Vector3(0, 0, 202.5);
    // The court's back, behind the hall: thick bamboo.
    for (let x = -14; x <= 14; x += 1.2) this._bamboo(b, x, 215.5 + (Math.abs(x) % 3) * 0.4, 10, 0.08);
  }

  _torii(b, x, z, span = 5.4, height = 4, big = false) {
    const half = span / 2;
    const r = big ? 0.3 : 0.2;
    b.cylinder('vermilion', x - half, 0, z, r, r * 1.1, height, { segments: 10, tile: 1 });
    b.cylinder('vermilion', x + half, 0, z, r, r * 1.1, height, { segments: 10, tile: 1 });
    b.box('vermilion', x, height - 0.85, z, span + 0.6, 0.28, 0.28);
    b.box('vermilion', x, height, z, span + 1.6, 0.34, 0.5);
    b.box('darkwood', x, height + 0.34, z, span + 2.0, 0.22, 0.6);
    if (big) b.box('gold', x, height - 0.7, z + 0.16, 0.8, 0.5, 0.06);
    this.circles.push({ x: x - half, z, r: r + 0.25 }, { x: x + half, z, r: r + 0.25 });
  }

  _bamboo(b, x, z, height, radius) {
    b.cylinder('bamboo', x, 0, z, radius, radius * 1.1, height, { segments: 5, tile: 0.9 });
    // A sparse crown of dark leaf cards.
    const lean = (Math.sin(x * 3.1 + z) * 0.5 + 0.5) * 0.5;
    for (let i = 0; i < 2; i++) {
      const g = new PlaneGeometry(1.6, 0.5).rotateX(-1.2 + i * 0.4).rotateY(x * 1.7 + i * 1.9 + z);
      g.translate(x + lean * 0.3, height - 0.6 - i * 1.2, z);
      b.geometry('leaf', g);
    }
  }

  _fence(b, x0, z0, x1, z1) {
    const length = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    b.box('stone', (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.5, 1.1, length, { ry, tile: 1.5 });
    b.box('tiles', (x0 + x1) / 2, 1.1, (z0 + z1) / 2, 0.8, 0.12, length, { ry });
  }

  _hall(b, x, z) {
    b.box('stone', x, 0, z, 13, 1.0, 9);
    // steps
    for (let i = 0; i < 4; i++) b.box('stone', x, 0, z - 4.7 - i * 0.35, 4, 1.0 - i * 0.25, 0.35);
    for (const dx of [-5.6, -2, 2, 5.6]) {
      for (const dz of [-3.6, 3.6]) b.cylinder('vermilion', x + dx, 1.0, z + dz, 0.22, 0.24, 4, { segments: 10 });
    }
    b.box('wood', x, 1.0, z + 1, 11, 3.6, 6);
    b.box('lattice', x, 1.2, z - 2.05, 6, 2.8, 0.1, { tile: 2.4 });
    b.box('shoji', x, 1.6, z - 2.12, 2.4, 1.8, 0.04, { tile: 1.2 });
    b.gable('tiles', x, 5.0, z, 15, 12, 3.4, { thickness: 0.3 });
    b.box('gold', x, 1.0, z - 3.2, 1.6, 0.9, 0.8);
    this._lantern(b, x - 2.6, 3.6, z - 4.6, { size: 1.6 });
    this._lantern(b, x + 2.6, 3.6, z - 4.6, { size: 1.6 });
    this.boxes.push([x - 6.6, x + 6.6, z - 4.6, z + 4.6]);
    this.boxes.push([x - 2.2, x + 2.2, z - 6.2, z - 4.4]);
  }

  _hokora(b, x, z) {
    b.box('stone', x, 0, z, 2.2, 0.6, 2.2);
    b.box('wood', x, 0.6, z, 1.4, 1.2, 1.2);
    b.gable('tiles', x, 1.8, z, 1.9, 1.8, 0.7, { ry: Math.PI / 2 });
    b.box('shoji', x - 0.72, 0.8, z, 0.04, 0.6, 0.6);
    this._torii(b, x - 3.2, z, 1.8, 2.2);
    this.circles.push({ x, z, r: 1.4 });
  }

  /* ------------------------------------------------------------------ */
  /* 参 城門                                                             */
  /* ------------------------------------------------------------------ */

  _castle(b) {
    // The approach: low walls and lanterns.
    this._fence(b, -3.9, 214, -3.9, 240);
    this._fence(b, 3.9, 214, 3.9, 240);
    for (let z = 218; z < 240; z += 7) {
      this._toro(b, -2.8, z);
      this._toro(b, 2.8, z);
    }
    // The court: stone walls topped with white plaster and tiles.
    const wall = (x0, z0, x1, z1) => {
      const length = Math.hypot(x1 - x0, z1 - z0);
      const ry = Math.atan2(x1 - x0, z1 - z0);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      b.box('stone', cx, 0, cz, 2.4, 3.6, length, { ry, tile: 2.2 });
      b.box('plaster', cx, 3.6, cz, 1.2, 2.2, length, { ry, tile: 2.5 });
      b.box('tiles', cx, 5.8, cz, 2.0, 0.22, length + 0.6, { ry, tile: 1.5 });
    };
    wall(-19.4, 240, -19.4, 284);
    wall(19.4, 240, 19.4, 284);
    wall(-19.4, 239.2, -4.4, 239.2);
    wall(4.4, 239.2, 19.4, 239.2);
    wall(-19.4, 284.6, -6.5, 284.6);
    wall(6.5, 284.6, 19.4, 284.6);
    // The gate: towers either side, the doors, the turret over them.
    for (const side of [-1, 1]) {
      b.box('stone', side * 5.2, 0, 284.6, 3.2, 6, 4.4);
      b.box('plaster', side * 5.2, 6, 284.6, 3.0, 3, 4.2);
      b.gable('tiles', side * 5.2, 9, 284.6, 3.8, 5.0, 1.6, { ry: Math.PI / 2 });
    }
    b.box('wood', 0, 0, 284.4, 7.2, 7.4, 0.5, { tile: 1.6 });
    for (let y = 1; y < 7; y += 1.5) {
      for (let x = -3; x <= 3; x += 1.2) b.box('iron', x, y, 284.1, 0.18, 0.18, 0.1);
    }
    b.box('iron', 0, 0, 284.0, 0.12, 7.4, 0.12);
    b.box('plaster', 0, 7.4, 284.6, 13.6, 2.8, 4.6);
    b.box('lattice', 0, 8.2, 282.25, 9, 1.0, 0.1, { tile: 1.5 });
    b.gable('tiles', 0, 10.2, 284.6, 15, 6.4, 2.4, { thickness: 0.3 });
    b.box('gold', -7.4, 12.4, 284.6, 0.6, 0.8, 0.3);
    b.box('gold', 7.4, 12.4, 284.6, 0.6, 0.8, 0.3);
    this._lantern(b, -4.6, 3.4, 281.9, { size: 1.8 });
    this._lantern(b, 4.6, 3.4, 281.9, { size: 1.8 });
    // Braziers in the court.
    for (const [x, z] of [[-12, 250], [12, 250], [-12, 274], [12, 274]]) {
      b.cylinder('iron', x, 0, z, 0.5, 0.25, 1.1, { segments: 8 });
      this.lanterns.push(new Vector3(x, 1.4, z));
      this.circles.push({ x, z, r: 0.6 });
      this._brazier ??= [];
      this._brazier.push(new Vector3(x, 1.2, z));
    }
    this.spots.boss = new Vector3(0, 0, 268);
  }

  /* ------------------------------------------------------------------ */
  /* dressing                                                            */
  /* ------------------------------------------------------------------ */

  /** Glossy dark pools that catch the lantern light. */
  _puddles() {
    const material = new MeshStandardMaterial({
      color: '#0c1118',
      roughness: 0.03,
      metalness: 0.35,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    });
    material.userData.castShadow = false;
    this.game.app.environment.excludeFromKeyLights?.(material);
    const geometries = [];
    let k = 3;
    const rnd = () => (k = (k * 16807) % 2147483647) / 2147483647;
    for (const [x0, x1, z0, z1] of WALKABLE) {
      const area = (x1 - x0) * (z1 - z0);
      const count = Math.min(14, Math.floor(area / 45));
      for (let i = 0; i < count; i++) {
        const w = 0.8 + rnd() * 2.4;
        const d = 0.6 + rnd() * 1.8;
        // An irregular blob rather than a rectangle: a squashed polygon.
        const g = new CircleGeometry(0.5, 10).rotateX(-Math.PI / 2).scale(w, 1, d).rotateY(rnd() * 3);
        g.translate(x0 + 1 + rnd() * (x1 - x0 - 2), 0.012, z0 + 1 + rnd() * (z1 - z0 - 2));
        geometries.push(g);
      }
    }
    const geometry = mergeAll(geometries);
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    mesh.layers.set(LAYER.WORLD);
    this.group.add(mesh);
  }

  /** A soft halo on every lantern — cheap glow without bloom. */
  _lanternGlows() {
    // The strung street lanterns get geometry too.
    const b = new Builder();
    for (const z of this._pendingStreet ?? []) {
      b.box('darkwood', 0, 3.95, z, 7.8, 0.03, 0.03);
      for (const x of [-2.6, 0, 2.6]) {
        b.cylinder('lantern', x, 3.38, z, 0.2, 0.2, 0.46, { segments: 8, tile: 0.46 });
        b.cylinder('darkwood', x, 3.84, z, 0.08, 0.1, 0.12, { segments: 6 });
      }
    }
    for (const mesh of b.build(this.materials, { castShadow: false })) {
      mesh.layers.set(LAYER.WORLD);
      this.group.add(mesh);
    }

    const count = this.lanterns.length;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    this.lanterns.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      seeds[i] = Math.random() * 10;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    this.glowMaterial = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uColor: { value: new Color('#ff8a3a') } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uScale;
        varying float vFlicker;
        void main() {
          vFlicker = 0.85 + 0.15 * sin(uTime * 7.0 + aSeed * 5.0) * sin(uTime * 3.1 + aSeed);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 1.9 * uScale / max(0.5, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vFlicker;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = dot(p, p);
          float a = exp(-r * 4.5) * 0.55 * vFlicker;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    });
    const points = new Points(geometry, this.glowMaterial);
    points.frustumCulled = false;
    points.layers.set(LAYER.WORLD);
    points.renderOrder = 8;
    this.group.add(points);
  }

  /** Spirit walls: a curtain of red mist that closes an arena. */
  _barrierMeshes() {
    this.barrierMaterial = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new Color('#ff3a2a') } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float flow = n(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 0.8)) * 0.6 + n(vec2(vUv.x * 14.0 + uTime * 0.3, vUv.y * 8.0 - uTime * 1.6)) * 0.4;
          float a = (1.0 - vUv.y) * (0.25 + flow * 0.6) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          gl_FragColor = vec4(uColor * a * 1.6, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide
    });
    for (const [id, [x0, x1, z0, z1]] of Object.entries(BARRIERS)) {
      const w = x1 - x0;
      const geometry = new PlaneGeometry(w, 4.5);
      geometry.translate(0, 2.25, 0);
      const mesh = new Mesh(geometry, this.barrierMaterial);
      mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      mesh.visible = false;
      mesh.layers.set(LAYER.WORLD);
      mesh.renderOrder = 7;
      this.group.add(mesh);
      this.barriers[id] = { rect: [x0, x1, z0, z1], active: false, mesh };
    }
  }

  /** Raise or drop a spirit wall. */
  setBarrier(id, active) {
    const barrier = this.barriers[id];
    if (!barrier || barrier.active === active) return;
    barrier.active = active;
    barrier.mesh.visible = active;
    if (active) this.game.audio?.play('danger', { pos: barrier.mesh.position, volume: 0.5 });
  }

  clearBarriers() {
    for (const id of Object.keys(this.barriers)) this.setBarrier(id, false);
  }

  /* ------------------------------------------------------------------ */
  /* collision                                                           */
  /* ------------------------------------------------------------------ */

  /** Keep a circle of `radius` at `position` inside the town. */
  collide(position, radius) {
    // Props first, then the union of walkable ground (which wins).
    for (const c of this.circles) {
      const dx = position.x - c.x;
      const dz = position.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      position.x = c.x + (dx / d) * min;
      position.z = c.z + (dz / d) * min;
    }
    for (const box of this.boxes) pushOutOfBox(position, box, radius);
    for (const barrier of Object.values(this.barriers)) {
      if (barrier.active) pushOutOfBox(position, barrier.rect, radius);
    }
    clampToUnion(position, radius);
  }

  /** Whether a point is inside a wall (for projectiles). */
  blocks(x, z) {
    for (const [x0, x1, z0, z1] of WALKABLE) {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return false;
    }
    return true;
  }

  /** Pull the camera in front of any wall between it and the player. */
  cameraCollide(rig, dt = 1 / 60) {
    const camera = rig.camera;
    const target = rig.controls.target;
    const steps = 12;
    let free = 1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      _v.lerpVectors(target, camera.position, t);
      if (_v.y > 9) break; // above the roofs
      if (!insideUnion(_v.x, _v.z, 0.2)) {
        free = Math.max(0.2, ((i - 1) / steps) * 0.95);
        break;
      }
    }
    // In at once (a wall must never be looked through), out gently.
    const current = this._pull ?? 1;
    this._pull = free < current ? free : current + (free - current) * Math.min(1, dt * 2.5);
    if (this._pull < 0.999) {
      _t.lerpVectors(target, camera.position, this._pull);
      camera.position.copy(_t);
    }
  }

  /* ------------------------------------------------------------------ */
  /* per frame                                                           */
  /* ------------------------------------------------------------------ */

  /** A flash of lightning over the town. */
  lightning() {
    this.flash = 1;
    this._flashPulse = Math.random() < 0.5 ? 2 : 1;
  }

  update(dt, raw, player) {
    this._time += raw;
    // Lightning: a double flicker, on real time.
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - raw * 3.2);
      if (this.flash < 0.45 && this._flashPulse > 1) {
        this._flashPulse = 1;
        this.flash = 0.8;
      }
    }
    const env = this.game.app.environment;
    const f = this.flash * this.flash;
    env.hemi.intensity = env._baseHemi ?? (env._baseHemi = env.hemi.intensity);
    env.hemi.intensity = env._baseHemi + f * 3.5;

    // Lanterns nearest the player get the real lights.
    const lights = this.lights;
    if (lights.length) {
      this._lightTimer = (this._lightTimer ?? 0) - raw;
      if (this._lightTimer <= 0) {
        this._lightTimer = 0.25;
        const sorted = this._sorted ?? (this._sorted = []);
        sorted.length = 0;
        for (const lantern of this.lanterns) {
          const dx = lantern.x - player.x;
          const dz = lantern.z - player.z;
          sorted.push([dx * dx + dz * dz, lantern]);
        }
        sorted.sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < lights.length; i++) {
          const entry = sorted[i];
          if (!entry) continue;
          lights[i].userData.target = entry[1];
        }
      }
      for (const light of lights) {
        const target = light.userData.target;
        if (!target) continue;
        light.position.copy(target);
        light.position.y -= 0.3;
        const flicker = 0.9 + 0.1 * Math.sin(this._time * 9 + target.x) * Math.sin(this._time * 4.3 + target.z);
        light.intensity = 16 * flicker;
      }
    }
  }

  lateUpdate(dt, raw) {
    const app = this.game.app;
    // Brazier flames in the castle court.
    if (this._brazier && Math.abs(this.game.playerPosition.z - 262) < 40) {
      this._flameAcc = (this._flameAcc ?? 0) + raw * 40;
      while (this._flameAcc > 1) {
        this._flameAcc -= 1;
        const b = this._brazier[Math.floor(Math.random() * this._brazier.length)];
        _v.set(b.x + (Math.random() - 0.5) * 0.5, b.y, b.z + (Math.random() - 0.5) * 0.5);
        this.game.fx.glow.spawn(_v, Math.random() < 0.5 ? '#ff6a1a' : '#ffb040', 0.5 + Math.random() * 0.4, 0.6, { vy: 2.4, grow: -0.5, intensity: 1.8 });
      }
    }
    const height = app.renderer.size.height * app.renderer.gl.getPixelRatio();
    this.rain.update(this._time, app.camera, 0, this.flash, height);
    this.glowMaterial.uniforms.uTime.value = this._time;
    this.glowMaterial.uniforms.uScale.value = height * 0.9;
    this.barrierMaterial.uniforms.uTime.value = this._time;
  }

  /** Is the player inside the rectangle [x0, x1, z0, z1]? */
  static inside(p, [x0, x1, z0, z1]) {
    return p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1;
  }
}

function pushOutOfBox(p, [x0, x1, z0, z1], r) {
  if (p.x < x0 - r || p.x > x1 + r || p.z < z0 - r || p.z > z1 + r) return;
  const left = p.x - (x0 - r);
  const right = x1 + r - p.x;
  const down = p.z - (z0 - r);
  const up = z1 + r - p.z;
  const m = Math.min(left, right, down, up);
  if (m === left) p.x = x0 - r;
  else if (m === right) p.x = x1 + r;
  else if (m === down) p.z = z0 - r;
  else p.z = z1 + r;
}

function insideUnion(x, z, inset) {
  for (const [x0, x1, z0, z1] of WALKABLE) {
    if (x >= x0 + inset && x <= x1 - inset && z >= z0 + inset && z <= z1 - inset) return true;
  }
  return false;
}

function clampToUnion(p, r) {
  if (insideUnion(p.x, p.z, r)) return;
  let best = null;
  let bestD = Infinity;
  for (const [x0, x1, z0, z1] of WALKABLE) {
    const cx = Math.min(Math.max(p.x, x0 + r), x1 - r);
    const cz = Math.min(Math.max(p.z, z0 + r), z1 - r);
    const d = (cx - p.x) ** 2 + (cz - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [cx, cz];
    }
  }
  if (best) {
    p.x = best[0];
    p.z = best[1];
  }
}

function mergeAll(geometries) {
  let count = 0;
  for (const g of geometries) count += (g.index ? g.toNonIndexed() : g).attributes.position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  let o = 0;
  for (const source of geometries) {
    const g = source.index ? source.toNonIndexed() : source;
    positions.set(g.attributes.position.array, o * 3);
    normals.set(g.attributes.normal.array, o * 3);
    uvs.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(positions, 3));
  merged.setAttribute('normal', new BufferAttribute(normals, 3));
  merged.setAttribute('uv', new BufferAttribute(uvs, 2));
  return merged;
}

export { WALKABLE, BARRIERS, BoxGeometry };
