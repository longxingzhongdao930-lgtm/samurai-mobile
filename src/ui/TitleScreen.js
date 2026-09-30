import { prefersTouchLayout } from '../utils/device.js';

/** The controls, as the sheet lists them: [what, PC, phone]. */
const CONTROLS = [
  ['移動', 'WASD（Shiftで走る）', '左スティック'],
  ['視点', 'クリックで取り込み → マウス（Escで解除）', '画面をドラッグ'],
  ['攻撃（5段連撃）', '左クリック / J', '攻'],
  ['ガード', '右クリック長押し / K', 'Guard 長押し'],
  ['パリィ', '敵の攻撃の直前にガードを上げる', '同左'],
  ['処刑', '「処刑」表示中に攻撃（パリィ直後・体勢崩れ）', '攻ボタンが赤く光ったら攻'],
  ['一閃', '敵の目が光った瞬間に攻撃', '同左'],
  ['蹴り（盾崩し）', 'E', 'Kick'],
  ['跳躍', 'Space', 'Leap'],
  ['飛燕 / 居合', 'B（長押しで居合）', '飛燕（長押しで居合）'],
  ['影走り / 雷切 / 縮地', 'V / C / X', '各ボタン'],
  ['無双', 'Q（ゲージ満タン）', '無双'],
  ['ロックオン', 'L（長押しで解除）', 'Lock'],
  ['魂を吸う / 強化', 'Z長押し / U', '吸魂 / 強化']
];

/**
 * 題 — the first screen: the game's name, the way into each mode, the stage
 * record, and the controls sheet. Plain DOM over the (paused) world; every
 * button is at least 44px for a thumb. It decides nothing — each button calls
 * a hook on the app.
 */
export class TitleScreen {
  /**
   * @param {object} hooks
   * @param {(resume: boolean) => void} hooks.onStage
   * @param {() => void} hooks.onFree
   * @param {() => void} hooks.onPvp
   * @param {() => void} hooks.onUpgrade
   * @param {() => {cleared: boolean, best: number|null, checkpoint: string}} hooks.record
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.root = document.createElement('div');
    this.root.className = 'title';
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.innerHTML =
      '<div class="title__card">' +
      '<p class="title__kanji">侍</p>' +
      '<p class="title__name">SAMURAI</p>' +
      '<p class="title__record"></p>' +
      '<div class="title__menu">' +
      '<button type="button" data-act="resume">一ノ章 · 続きから</button>' +
      '<button type="button" data-act="stage">一ノ章 · 最初から</button>' +
      '<button type="button" data-act="free">自由戦闘</button>' +
      '<button type="button" data-act="pvp">対戦 PvP</button>' +
      '<button type="button" data-act="upgrade">強化</button>' +
      '<button type="button" data-act="controls">操作説明</button>' +
      '</div></div>' +
      '<div class="title__controls" hidden><p class="title__controls-head">操作説明</p><table></table>' +
      '<button type="button" data-act="back">戻る</button></div>';
    this.record = this.root.querySelector('.title__record');
    this.resumeBtn = this.root.querySelector('[data-act="resume"]');
    this.card = this.root.querySelector('.title__card');
    this.controls = this.root.querySelector('.title__controls');
    const touch = prefersTouchLayout();
    this.controls.querySelector('table').innerHTML =
      `<tr><th></th><th>${touch ? 'スマホ' : 'PC'}</th></tr>` +
      CONTROLS.map(([what, pc, phone]) => `<tr><td>${what}</td><td>${touch ? phone : pc}</td></tr>`).join('');
    this.root.addEventListener('click', (e) => {
      const act = e.target?.dataset?.act;
      if (!act) return;
      if (act === 'resume') hooks.onStage(true);
      else if (act === 'stage') hooks.onStage(false);
      else if (act === 'free') hooks.onFree();
      else if (act === 'pvp') hooks.onPvp();
      else if (act === 'upgrade') hooks.onUpgrade();
      else if (act === 'controls') this._sheet(true);
      else if (act === 'back') this._sheet(false);
    });
    document.body.appendChild(this.root);
  }

  get visible() {
    return !this.root.hidden;
  }

  show() {
    const r = this.hooks.record?.() ?? {};
    const best = r.best != null ? ` · 最速 ${Math.floor(r.best / 60)}:${String(r.best % 60).padStart(2, '0')}` : '';
    this.record.textContent = `一ノ章 — ${r.cleared ? '討伐済' : '未踏破'}${best}`;
    this.resumeBtn.hidden = r.checkpoint !== 'save';
    this._sheet(false);
    this.root.hidden = false;
    document.body.classList.add('title-open');
  }

  hide() {
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.hidden = true;
    document.body.classList.remove('title-open');
  }

  _sheet(on) {
    this.card.hidden = on;
    this.controls.hidden = !on;
  }

  dispose() {
    this.root.remove();
  }
}
