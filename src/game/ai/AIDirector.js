import { TextureLoader, SRGBColorSpace } from 'three';
import { DRAGON_APPEARANCE } from '../boss/TarislandDragon.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TOWN_CHARACTERS, TOWN_TYPES } from '../data/townCharacters.js';
import { TownEnemy } from './TownEnemy.js';
import { retargetClip } from '../../animation/retarget.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { EnemyAgent } from './EnemyAgent.js';

const _sep = { x: 0, z: 0 };

/** Player clips the enemy rig is given, by the name the data uses. */
const SHARED_CLIPS = ['walk', 'run', 'slashHit', 'kick', 'crouchSlash', 'land', 'crouch'];

/**
 * The crowd: who exists, who may swing, and how they keep out of each other.
 *
 * Owns the enemy-side clip set (the player's motion retargeted onto the enemy
 * rig once, at load) and every `EnemyAgent`. Attack tokens are the core of the
 * crowd's manners: at most `maxMelee` bodies are ever swinging at once, so a
 * mob of fifteen still reads as a fight against two or three at a time.
 */
export class AIDirector {
  constructor(game) {
    this.game = game;
    this.agents = [];
    this.clips = new Map();
    this.appearances = new Map();
    this.maxMelee = 2;
    this.maxRanged = 2;
    this._melee = new Set();
    this._ranged = new Set();
    this._frame = 0;
    /**
     * Seconds until the next melee swing may start, crowd-wide. Two bodies
     * starting their wind-ups on the same frame read as one blur; staggered,
     * each one is a cue the player can answer.
     */
    this._gap = 0;
    this.minGap = 0.55;
  }

  /** Retarget the player's motion onto the enemy rig. Once. */
  prepare() {
    const manager = this.game.enemies;
    const bones = new Map();
    manager.source.traverse((node) => {
      if (!node.isBone) return;
      bones.set(node.name, node);
      const short = node.name.split(':').pop().replace(/^mixamorig/i, '');
      if (short && !bones.has(short)) bones.set(short, node);
    });

    const source = this.game.app.character.clips;
    for (const name of SHARED_CLIPS) {
      const clip = retargetClip(source.get(name), bones, name);
      if (clip) this.clips.set(name, clip);
    }
    if (manager.clip) this.clips.set('idle', manager.clip);

    // One clone per (type, move): two moves cut from the same clip need two
    // actions on one mixer, and a clip is what an action is keyed by.
    for (const type of Object.values(ENEMY_TYPES)) {
      for (const spec of type.attacks) {
        const clip = this.clips.get(spec.clip);
        if (clip) this.clips.set(`${type.id}:${spec.id}`, clip.clone());
      }
    }
  }

  async loadAppearances() {
    const loader = new GLTFLoader();
    const magicRingTexture = await new TextureLoader().loadAsync('./textures/effects/magic-ring-blue.png');
    magicRingTexture.colorSpace = SRGBColorSpace;
    // Load each shared source once; clones share geometry and textures.
    for (const definition of [...TOWN_CHARACTERS, DRAGON_APPEARANCE]) {
      const gltf = await loader.loadAsync(definition.url);
      this.appearances.set(definition.id, { gltf, definition: definition.id === 'mage' ? { ...definition, magicRingTexture } : definition });
    }
  }

  /** Register an extra type (the boss) and clone its move clips. */
  registerType(type) {
    for (const spec of type.attacks) {
      const clip = this.clips.get(spec.clip);
      if (clip && !this.clips.has(`${type.id}:${spec.id}`)) this.clips.set(`${type.id}:${spec.id}`, clip.clone());
    }
  }

  /**
   * @param {string|object} type id in `ENEMY_TYPES`, or a type object
   * @returns {EnemyAgent|null}
   */
  spawn(type, x, z, yaw, { alert = false, Agent = EnemyAgent } = {}) {
    const spec = typeof type === 'string' ? (TOWN_TYPES[type] ?? ENEMY_TYPES[type]) : type;
    const source = this.appearances.get(spec.appearance);
    if (spec.appearance && !source) throw new Error(`Enemy model not loaded: ${spec.appearance}`);
    const enemy = source ? new TownEnemy(source.gltf, source.definition, spec, this.game.enemies.terrain)
      : this.game.enemies.spawnAt(x, z, yaw, { height: spec.height });
    if (source) {
      enemy.place(x, z, yaw);
      this.game.enemies.group.add(enemy.root);
      this.game.enemies.enemies.push(enemy);
    }
    if (!enemy) return null;
    const agent = new Agent(this.game, enemy, spec, enemy.clips ?? this.clips);
    agent.alert = alert;
    this.agents.push(agent);
    return agent;
  }

  get aliveCount() {
    let n = 0;
    for (const agent of this.agents) if (agent.alive) n++;
    return n;
  }

  /** May this body start a swing now? */
  requestToken(agent, ranged) {
    const pool = ranged ? this._ranged : this._melee;
    if (pool.has(agent)) return true;
    // Fewer swingers when an elite is already mid-move: one big body's attack
    // is a whole event and deserves the stage.
    let max = ranged ? this.maxRanged : this.maxMelee;
    if (!ranged) {
      for (const other of pool) if (other.type.elite) max = 1;
      if (agent.type.elite && pool.size > 0) return false;
    }
    if (pool.size >= max) return false;
    if (!ranged && this._gap > 0 && !agent.type.boss) return false;
    if (!ranged) this._gap = this.minGap * (0.8 + Math.random() * 0.5);
    pool.add(agent);
    agent.token = true;
    return true;
  }

  releaseToken(agent) {
    this._melee.delete(agent);
    this._ranged.delete(agent);
    agent.token = false;
  }

  /** Push away from neighbours and the player. */
  separation(agent, x, z) {
    _sep.x = 0;
    _sep.z = 0;
    for (const other of this.agents) {
      if (other === agent || !other.alive) continue;
      const dx = x - other.position.x;
      const dz = z - other.position.z;
      const min = agent.radius + other.radius + 0.5;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / min;
      _sep.x += (dx / d) * push;
      _sep.z += (dz / d) * push;
    }
    const player = this.game.playerPosition;
    const dx = x - player.x;
    const dz = z - player.z;
    const min = agent.radius + 0.9;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      _sep.x += (dx / d) * (min - d);
      _sep.z += (dz / d) * (min - d);
    }
    return _sep;
  }

  update(dt, ctx) {
    this._frame++;
    this._gap -= dt;
    this._shadowTimer = (this._shadowTimer ?? 0) - dt;
    const shadows = this._shadowTimer <= 0;
    if (shadows) this._shadowTimer = 0.5;
    const skip = this.game.quality.aiSkip;
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const agent = this.agents[i];
      if (!agent.alive) {
        this.releaseToken(agent);
        if (agent.enemy.finished || !agent.enemy.root.parent) {
          agent.dispose();
          this.agents.splice(i, 1);
        }
        continue;
      }
      // Distant, idle bodies think every other frame on a slow device; anyone
      // in the fight thinks every frame.
      if (skip > 1 && agent.state === 'idle' && (i + this._frame) % skip !== 0) {
        agent._skipped = (agent._skipped ?? 0) + dt;
        continue;
      }
      // Only bodies near the player cast shadows: a skinned body in the
      // shadow pass costs as much as drawing it again.
      if (shadows) {
        const near = agent.distance === undefined || agent.distance < (this.game.quality.name === 'low' ? 0 : agent.type.elite ? 30 : 13);
        if (agent._shadow !== near) {
          agent._shadow = near;
          agent.enemy._castShadows(near);
        }
      }
      const step = dt + (agent._skipped ?? 0);
      agent._skipped = 0;
      agent.update(step, ctx);
      this.game.stage?.collide(agent.position, agent.radius);
    }
  }

  /** Remove every body at once (retry, area change). */
  clear() {
    for (const agent of this.agents) agent.dispose();
    this.agents.length = 0;
    this._melee.clear();
    this._ranged.clear();
    this.game.enemies.clear();
  }
}
