import { prefersTouchLayout } from '../utils/device.js';

/**
 * 修練 — the lesson before the first gate of 一ノ章: five things done once,
 * each checked by what the game counts (`App#counters`), not by a timer.
 *
 *   move → land three blows → parry → execute → 縮地
 *
 * A training swordsman stands in the lane: harmless while you learn to move
 * and cut, then it starts swinging so there is something to parry, and the
 * parry leaves it open to the execution. A card says what to do (worded for a
 * mouse or a thumb) and can be skipped. The last card leaves two tips that are
 * not drilled here: 一閃 and breaking a shield.
 */
export class Tutorial {
  /**
   * @param {import('../core/App.js').App} app
   * @param {{onDone: () => void}} hooks
   */
  constructor(app, hooks) {
    this.app = app;
    this.hooks = hooks;
    const touch = prefersTouchLayout();
    this.steps = [
      { id: 'move', text: touch ? '左のスティックで移動しよう' : 'WASD で移動しよう' },
      { id: 'attack', text: touch ? '「攻」で 3 回斬りつけよう' : '左クリックで 3 回斬りつけよう' },
      { id: 'parry', text: touch ? '敵が斬りかかる直前に「Guard」— パリィ' : '敵が斬りかかる直前に右クリック（ガード）— パリィ' },
      { id: 'execute', text: touch ? '「処刑」が出たら、光る「攻」で処刑' : '頭上に「処刑」が出たら、左クリックで処刑' },
      { id: 'shukuchi', text: touch ? '「縮地」で一瞬で踏み込もう' : 'X（縮地）で一瞬で踏み込もう' }
    ];
    this.index = -1;
    this.dummy = null;

    this.card = document.createElement('div');
    this.card.className = 'tutorial';
    this.card.hidden = true;
    this.card.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.card.innerHTML =
      '<p class="tutorial__head"></p><p class="tutorial__text"></p>' +
      '<button type="button" class="tutorial__skip">スキップ</button>';
    this.head = this.card.querySelector('.tutorial__head');
    this.text = this.card.querySelector('.tutorial__text');
    this.card.querySelector('.tutorial__skip').addEventListener('click', () => this.finish(true));
    document.body.appendChild(this.card);
  }

  get active() {
    return this.index >= 0;
  }

  begin() {
    const app = this.app;
    this.index = -1;
    this.card.hidden = false;
    this._from = app.character.position.clone();
    this._next();
  }

  _next() {
    this.index++;
    const step = this.steps[this.index];
    if (!step) {
      this.finish(false);
      return;
    }
    const app = this.app;
    this.head.textContent = `修練 ${this.index + 1} / ${this.steps.length}`;
    this.text.textContent = step.text;
    this._base = { ...app.counters };
    if (step.id === 'attack') this._spawnDummy();
    if (step.id === 'parry' && this.dummy) {
      // Now it swings, soon and often.
      this.dummy._ai.cooldown = 0.6;
      this.dummy._passive = false;
    }
  }

  _spawnDummy() {
    const app = this.app;
    const p = app.character.position;
    this.dummy = app.enemies.spawnAt(p.x, p.z + 3, 'grunt', Math.PI);
    if (!this.dummy) return;
    // Sturdy enough to practise on; harmless until the parry lesson.
    this.dummy.maxHealth = this.dummy.health = 99;
    this.dummy._passive = true;
  }

  update() {
    if (!this.active) return;
    const app = this.app;
    const step = this.steps[this.index];
    const c = app.counters;
    const b = this._base;
    // Keep the training swordsman's blade down until it is wanted.
    if (this.dummy?._passive) this.dummy._ai.cooldown = 99;
    let done = false;
    switch (step.id) {
      case 'move':
        done = app.character.position.distanceTo(this._from) > 2.5;
        break;
      case 'attack':
        done = c.hits - b.hits >= 3;
        break;
      case 'parry':
        done = c.parry - b.parry >= 1;
        break;
      case 'execute':
        done = c.execution - b.execution >= 1;
        // Missed the window: it swings again, and the next parry opens it again.
        break;
      case 'shukuchi':
        done = c.shukuchi - b.shukuchi >= 1;
        break;
      default:
        break;
    }
    if (done) {
      app.toast.show('良し', 600);
      this._next();
    }
  }

  /** Done (or skipped): clear the lane, leave the tips, open the way. */
  finish(skipped) {
    if (!this.active) return;
    const app = this.app;
    this.index = -1;
    if (this.dummy?.alive) app.enemies.kill(this.dummy, 0, 1);
    this.dummy = null;
    this.card.hidden = true;
    app.toast.show(
      skipped ? '修練を飛ばした — 門へ進め' : '修練完了 · 目が光った瞬間の攻撃は「一閃」、盾は蹴りで崩せ',
      skipped ? 1200 : 3200
    );
    this.hooks.onDone?.();
  }

  cancel() {
    this.index = -1;
    this.card.hidden = true;
    this.dummy = null;
  }

  dispose() {
    this.card.remove();
  }
}
