import { combatHint } from '../combat/CombatRhythm.js';
import { Vector3 } from 'three';

const _p = new Vector3();
const MAX_NUMBERS = 24;
const MAX_BARS = 10;

/**
 * Everything drawn over the game: the player's bars, the boss's bar, the
 * floating numbers and the bars over enemy heads, the lock reticle, the
 * execution prompt, the combo counter, the screen flashes and the cards.
 *
 * Plain DOM, positioned with transforms only. Pools are fixed-size and
 * re-used, and every write is skipped when the value it would write has not
 * changed — so the HUD costs a few style writes per frame, not a layout.
 */
export class HUD {
  constructor(game) {
    this.game = game;
    const root = (this.root = el('div', 'gh', document.body));

    // Player frame
    const frame = el('div', 'gh-player', root);
    el('div', 'gh-player__crest', frame).textContent = '影';
    const bars = el('div', 'gh-player__bars', frame);
    this.hpBar = bar(bars, 'gh-bar--hp');
    this.mpBar = bar(bars, 'gh-bar--mp');
    this.guardBar = bar(bars, 'gh-bar--guard');
    this.spiritRow = el('div', 'gh-spirit', bars);
    this.calmLabel = el('span', '', this.spiritRow);
    this.dragonLabel = el('span', '', this.spiritRow);
    this.calmLabel.title = '防御で蓄積。満タンで刀の長押し居合を強化';
    this.dragonLabel.title = '攻撃命中で蓄積。満タンで次の命中に竜爪';
    this.potion = el('div', 'gh-potion', frame);
    this.objective = el('div', 'gh-objective', root);
    this.combatHint = el('div', 'gh-combat-hint', root);
    this.combatHint.setAttribute('aria-live', 'polite');

    // Boss
    this.boss = el('div', 'gh-boss', root);
    this.bossName = el('div', 'gh-boss__name', this.boss);
    this.bossBar = bar(this.boss, 'gh-bar--boss');
    this.bossPosture = bar(this.boss, 'gh-bar--posture');

    // Combo
    this.combo = el('div', 'gh-combo', root);
    this.comboCount = el('span', 'gh-combo__n', this.combo);
    el('span', 'gh-combo__label', this.combo).textContent = '連撃';

    // Centre messages
    this.noticeEl = el('div', 'gh-notice', root);
    this.big = el('div', 'gh-big', root);
    this.card = el('div', 'gh-card', root);
    this.cardTitle = el('div', 'gh-card__title', this.card);
    this.cardSub = el('div', 'gh-card__sub', this.card);

    // World-anchored
    this.layer = el('div', 'gh-world', root);
    this.reticle = el('div', 'gh-reticle', this.layer);
    this.prompt = el('div', 'gh-prompt', this.layer);
    this.prompt.textContent = '処刑';
    this.danger = el('div', 'gh-danger', this.layer);
    this.danger.textContent = '危';
    this.numbers = [];
    for (let i = 0; i < MAX_NUMBERS; i++) {
      const n = el('div', 'gh-num', this.layer);
      this.numbers.push({ el: n, life: 0, age: 0, pos: new Vector3(), vy: 0 });
    }
    this.enemyBars = [];
    for (let i = 0; i < MAX_BARS; i++) {
      const b = el('div', 'gh-ebar', this.layer);
      const fill = el('i', '', b);
      const posture = el('b', '', b);
      this.enemyBars.push({ el: b, fill, posture, last: '' });
    }

    this.flashEl = el('div', 'gh-flash', root);
    this.vignette = el('div', 'gh-vignette', root);
    this.slowEl = el('div', 'gh-slow', root);

    this._cache = new Map();
    this._noticeTimer = 0;
    this._bigTimer = 0;
    this._cardTimer = 0;
    this._flash = 0;
    this._flashLife = 0;
    this._dangerTimer = 0;
    this._dangerAgent = null;
    this.visible = true;
  }

  /* ---- events ---- */

  notice(text, seconds = 1.6) {
    this.noticeEl.textContent = text;
    this.noticeEl.classList.add('is-on');
    this._noticeTimer = seconds;
  }

  bigText(text, color = '#f4e6c8', seconds = 0.9) {
    this.big.textContent = text;
    this.big.style.color = color;
    this.big.classList.remove('is-on');
    void this.big.offsetWidth;
    this.big.classList.add('is-on');
    this._bigTimer = seconds;
  }

  reaction(name, color) {
    this.bigText(`${name}`, color, 1.0);
  }

  areaCard(title, sub, seconds = 3.2) {
    this.cardTitle.textContent = title;
    this.cardSub.textContent = sub;
    this.card.classList.remove('is-on');
    void this.card.offsetWidth;
    this.card.classList.add('is-on');
    this._cardTimer = seconds;
  }

  setObjective(text) {
    this.objective.textContent = text;
    this.objective.classList.toggle('is-on', Boolean(text));
  }

  flash(color, seconds = 0.15) {
    this.flashEl.style.background = color;
    this._flash = seconds;
    this._flashLife = seconds;
  }

  /** A red 危 over a body winding up something that cannot be blocked. */
  warn(agent, seconds = 0.9) {
    this._dangerAgent = agent;
    this._dangerTimer = seconds;
  }

  damage(position, amount, { crit = false, color = null, height = 1.8 } = {}) {
    let slot = this.numbers.find((n) => n.age >= n.life);
    if (!slot) slot = this.numbers.reduce((a, b) => (a.age > b.age ? a : b));
    slot.pos.set(position.x + (Math.random() - 0.5) * 0.5, position.y + height, position.z + (Math.random() - 0.5) * 0.5);
    slot.age = 0;
    slot.life = crit ? 1.0 : 0.75;
    slot.vy = 1.2;
    slot.el.textContent = String(amount);
    slot.el.className = `gh-num${crit ? ' gh-num--crit' : ''}`;
    slot.el.style.color = color ?? '';
  }

  showBoss(name, visible = true) {
    this.bossName.textContent = name;
    this.boss.classList.toggle('is-on', visible);
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.classList.toggle('is-hidden', !visible);
  }

  /* ---- per frame ---- */

  update(dt, camera, width, height) {
    const game = this.game;
    const player = game.player;
    if (!player) return;

    if (player.spirit) {
      this.calmLabel.textContent = player.spirit.calm >= 100 ? '静・居合準備' : `静 ${player.spirit.calm}/100`;
      this.dragonLabel.textContent = player.spirit.dragon >= 100 ? '竜・爪準備' : `竜 ${player.spirit.dragon}/100`;
      this.calmLabel.classList.toggle('is-ready', player.spirit.calm >= 100);
      this.dragonLabel.classList.toggle('is-ready', player.spirit.dragon >= 100);
    }
    this._text('combatHint', this.combatHint, combatHint(player));
    this.guardBar.parentElement.classList.toggle('is-low', player.guardMeter / player.maxGuard < 0.25);
    this._set('hp', this.hpBar, player.hp / player.maxHp);
    this._set('mp', this.mpBar, player.mp / player.maxMp);
    this._set('guard', this.guardBar, player.guardMeter / player.maxGuard);
    this.vignette.style.opacity = player.hp / player.maxHp < 0.3 ? String(game.reducedMotion ? 0.35 : 0.35 + 0.25 * Math.sin(performance.now() * 0.006)) : '0';

    // Boss
    const boss = game.boss;
    if (boss?.alive && boss.agent) {
      this._set('boss', this.bossBar, boss.agent.hp / boss.agent.maxHp);
      this._set('bossP', this.bossPosture, Math.min(1, boss.agent.posture / boss.agent.maxPosture));
    }

    // Combo
    const combo = player.hitCombo;
    this.combo.classList.toggle('is-on', combo >= 3);
    this._text('combo', this.comboCount, String(combo));

    // Timers
    if (this._noticeTimer > 0 && (this._noticeTimer -= dt) <= 0) this.noticeEl.classList.remove('is-on');
    if (this._bigTimer > 0 && (this._bigTimer -= dt) <= 0) this.big.classList.remove('is-on');
    if (this._cardTimer > 0 && (this._cardTimer -= dt) <= 0) this.card.classList.remove('is-on');
    if (game.reducedMotion) this._flash = 0;
    if (this._flash > 0) {
      this._flash -= dt;
      this.flashEl.style.opacity = String(Math.max(0, this._flash / this._flashLife));
    } else if (this.flashEl.style.opacity !== '0') {
      this.flashEl.style.opacity = '0';
    }
    this.slowEl.classList.toggle('is-on', game.slowFactor < 0.6);

    // World-anchored
    const lock = player.lockTarget;
    this._anchor(this.reticle, lock?.alive ? lock : null, camera, width, height, (lock?.agent?.type.height ?? 1.8) * 0.6);
    const exec = game.executionTarget();
    this._anchor(this.prompt, exec, camera, width, height, (exec?.agent?.type.height ?? 1.8) + 0.4);
    if (this._dangerTimer > 0) {
      this._dangerTimer -= dt;
      const agent = this._dangerAgent;
      this._anchor(this.danger, agent?.alive ? agent.enemy : null, camera, width, height, (agent?.type.height ?? 1.8) + 0.6);
    } else {
      this._anchor(this.danger, null);
    }

    for (const n of this.numbers) {
      if (n.age >= n.life) {
        if (n.el.style.opacity !== '0') n.el.style.opacity = '0';
        continue;
      }
      n.age += dt;
      n.pos.y += n.vy * dt;
      n.vy *= 1 - Math.min(1, dt * 3);
      const t = n.age / n.life;
      if (!project(n.pos, camera, width, height, _p)) {
        n.el.style.opacity = '0';
        continue;
      }
      const s = t < 0.12 ? 1.4 - t * 3.3 : 1;
      n.el.style.transform = `translate(${_p.x.toFixed(1)}px, ${_p.y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      n.el.style.opacity = String(t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
    }

    // Enemy bars: whoever has been hurt, nearest first.
    let used = 0;
    for (const agent of game.director.agents) {
      if (used >= MAX_BARS) break;
      if (!agent.alive || agent === game.boss?.agent || agent.hp >= agent.maxHp || agent.timeSinceHit() > 5) continue;
      if (agent.distance > 22) continue;
      _p.copy(agent.position);
      _p.y += agent.type.height + 0.2;
      if (!project(_p, camera, width, height, _p)) continue;
      const bar = this.enemyBars[used++];
      bar.el.style.transform = `translate(${_p.x.toFixed(0)}px, ${_p.y.toFixed(0)}px) translate(-50%, -50%)`;
      bar.el.style.opacity = '1';
      const key = `${(agent.hp / agent.maxHp).toFixed(2)}|${(agent.posture / agent.maxPosture).toFixed(2)}`;
      if (bar.last !== key) {
        bar.last = key;
        bar.fill.style.transform = `scaleX(${(agent.hp / agent.maxHp).toFixed(3)})`;
        bar.posture.style.transform = `scaleX(${Math.min(1, agent.posture / agent.maxPosture).toFixed(3)})`;
      }
    }
    for (let i = used; i < MAX_BARS; i++) {
      if (this.enemyBars[i].el.style.opacity !== '0') this.enemyBars[i].el.style.opacity = '0';
    }
  }

  _anchor(node, enemy, camera, width, height, lift = 1.8) {
    if (!enemy) {
      if (!node.classList.contains('is-off')) node.classList.add('is-off');
      return;
    }
    _p.copy(enemy.position);
    _p.y += lift;
    if (!project(_p, camera, width, height, _p)) {
      node.classList.add('is-off');
      return;
    }
    node.classList.remove('is-off');
    node.style.transform = `translate(${_p.x.toFixed(1)}px, ${_p.y.toFixed(1)}px) translate(-50%, -50%)`;
  }

  _set(key, fill, value) {
    const v = Math.max(0, Math.min(1, value)).toFixed(3);
    if (this._cache.get(key) === v) return;
    this._cache.set(key, v);
    fill.style.transform = `scaleX(${v})`;
    // The ghost bar trails behind a loss, so a hit reads as an amount.
    const ghost = fill.previousElementSibling;
    if (ghost) ghost.style.transform = `scaleX(${v})`;
  }

  _text(key, node, value) {
    if (this._cache.get(key) === value) return;
    this._cache.set(key, value);
    node.textContent = value;
  }

  dispose() {
    this.root.remove();
  }
}

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

function bar(parent, modifier) {
  const wrap = el('div', `gh-bar ${modifier}`, parent);
  el('i', 'gh-bar__ghost', wrap);
  return el('i', 'gh-bar__fill', wrap);
}

function project(world, camera, width, height, out) {
  out.copy(world).project(camera);
  if (out.z > 1 || out.z < -1) return false;
  out.x = (out.x * 0.5 + 0.5) * width;
  out.y = (-out.y * 0.5 + 0.5) * height;
  return out.x > -60 && out.x < width + 60 && out.y > -60 && out.y < height + 60;
}
