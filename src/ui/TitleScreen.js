import { prefersTouchLayout } from '../utils/device.js';

/** The controls, as the sheet lists them: [what, PC, phone, gamepad]. */
const CONTROLS = [
  ['移動', 'WASD（Shiftで走る）', '左スティック', '左スティック'],
  ['視点', 'クリックで取り込み → マウス（Escで解除）', '画面をドラッグ', '右スティック'],
  ['攻撃（5段連撃）', '左クリック / J', '攻', 'A'],
  ['ガード', '右クリック長押し / K', 'Guard 長押し', 'RB 長押し'],
  ['パリィ', '敵の攻撃の直前にガードを上げる', '同左', '同左'],
  ['処刑', '「処刑」表示中に攻撃（パリィ直後・体勢崩れ）', '攻ボタンが赤く光ったら攻', 'A'],
  ['一閃', '敵の目が光った瞬間に攻撃', '同左', 'A'],
  ['蹴り（盾崩し）', 'E', 'Kick', 'X'],
  ['跳躍', 'Space', 'Leap', 'B'],
  ['飛燕 / 居合', 'B（長押しで居合）', '飛燕（長押しで居合）', 'Y（長押しで居合）'],
  ['影走り / 雷切 / 縮地', 'V / C / X', '各ボタン', '← / ↑ / R3'],
  ['無双', 'Q（ゲージ満タン）', '無双', 'RT'],
  ['ロックオン', 'L（長押しで解除）', 'Lock', 'LB（長押しで解除）'],
  ['魂を吸う / 強化', 'Z長押し / U', '吸魂 / 強化', 'LT 長押し / Back']
];

const DIFFICULTIES = [
  ['easy', '易'],
  ['normal', '普'],
  ['hard', '難']
];

const QUALITIES = [
  ['auto', '自動'],
  ['high', '高 High'],
  ['standard', '中 Medium'],
  ['light', '低 Low']
];

const time = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/**
 * 題 — the first screen, and the menus under it:
 *
 *   main     出陣 · 対戦 · 強化 · 設定 · 操作説明
 *   select   一ノ章 (続きから / 最初から / 修練から) and 自由戦闘, each with
 *            what it is and the record
 *   settings 音量 (全体 / 効果音 / BGM), 画質, 視点感度, セーブ削除
 *   controls the sheet, for the device in hand
 *
 * The same sheet is the in-game pause menu (`showPause`): its own first card
 * (再開 · 設定 · 操作説明 · 鏡から再開 · タイトルへ) over the same settings
 * and controls panels, whose 戻る then leads back to it.
 *
 * Plain DOM over the (paused) world; every button is at least 44px for a
 * thumb. It decides nothing — each choice calls a hook on the app.
 */
export class TitleScreen {
  /**
   * @param {object} hooks
   * @param {(options: {resume?: boolean, tutorial?: boolean}) => void} hooks.onStage
   * @param {() => void} hooks.onFree
   * @param {() => void} hooks.onPvp
   * @param {() => void} hooks.onUpgrade
   * @param {() => {cleared: boolean, best: number|null, checkpoint: string}} hooks.record
   * @param {() => object} hooks.prefs the current settings
   * @param {(prefs: object) => void} hooks.onPrefs a setting changed
   * @param {() => void} hooks.onErase erase the save
   * @param {() => void} [hooks.onSound] a button was pressed
   * @param {() => void} [hooks.onResume] pause: back to the game
   * @param {() => void} [hooks.onRestart] pause: back to the mirror (or the gate)
   * @param {() => void} [hooks.onQuit] pause: to the title
   */
  constructor(hooks) {
    this.hooks = hooks;
    const touch = prefersTouchLayout();
    this.root = document.createElement('div');
    this.root.className = 'title';
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.innerHTML = `
      <div class="title__card" data-view="main">
        <p class="title__kanji">侍</p>
        <p class="title__name">SAMURAI</p>
        <p class="title__record"></p>
        <div class="title__menu">
          <button type="button" data-act="select" class="is-primary">出陣</button>
          <button type="button" data-act="pvp">対戦 PvP</button>
          <button type="button" data-act="upgrade">強化</button>
          <button type="button" data-act="settings">設定</button>
          <button type="button" data-act="controls">操作説明</button>
        </div>
        <button type="button" data-act="fullscreen" class="title__fullscreen" hidden>⛶ 全画面</button>
      </div>
      <div class="title__panel title__pause" data-view="pause" hidden>
        <p class="title__panel-head">一時停止</p>
        <p class="title__stage-record title__pause-where"></p>
        <button type="button" data-act="resume-game" class="is-primary">再開</button>
        <button type="button" data-act="settings">設定</button>
        <button type="button" data-act="controls">操作説明</button>
        <button type="button" data-act="restart">鏡から再開</button>
        <button type="button" data-act="quit">タイトルへ</button>
      </div>
      <div class="title__panel" data-view="select" hidden>
        <p class="title__panel-head">出陣</p>
        <div class="title__field"><span>難易度</span><div class="title__seg" role="radiogroup">
          ${DIFFICULTIES.map(([id, label]) => `<button type="button" role="radio" data-difficulty="${id}">${label}</button>`).join('')}
        </div></div>
        <section class="title__stage">
          <p class="title__stage-name">一ノ章 <b>鬼武将 羅刹</b></p>
          <p class="title__stage-text">門を越え、広場の敵を斬り、鏡で記録し、羅刹を討て。</p>
          <p class="title__stage-record"></p>
          <div class="title__row">
            <button type="button" data-act="resume">続きから（鏡）</button>
            <button type="button" data-act="stage" class="is-primary">最初から</button>
            <button type="button" data-act="lesson">修練から</button>
          </div>
        </section>
        <section class="title__stage">
          <p class="title__stage-name">自由戦闘</p>
          <p class="title__stage-text">敵が絶え間なく現れる野。技を試し、魂を集める。</p>
          <div class="title__row"><button type="button" data-act="free">始める</button></div>
        </section>
        <button type="button" data-act="back" class="title__back">戻る</button>
      </div>
      <div class="title__panel" data-view="settings" hidden>
        <p class="title__panel-head">設定</p>
        <label class="title__field"><span>全体音量</span><input type="range" min="0" max="1" step="0.05" data-pref="volume"></label>
        <label class="title__field"><span>効果音</span><input type="range" min="0" max="1" step="0.05" data-pref="sfx"></label>
        <label class="title__field"><span>BGM</span><input type="range" min="0" max="1" step="0.05" data-pref="music"></label>
        <div class="title__field"><span>難易度</span><div class="title__seg" role="radiogroup">
          ${DIFFICULTIES.map(([id, label]) => `<button type="button" role="radio" data-difficulty="${id}">${label}</button>`).join('')}
        </div></div>
        <div class="title__field"><span>画質</span><div class="title__seg" role="radiogroup">
          ${QUALITIES.map(([id, label]) => `<button type="button" role="radio" data-quality="${id}">${label}</button>`).join('')}
        </div></div>
        <label class="title__field"><span>視点感度</span><input type="range" min="0.4" max="2" step="0.1" data-pref="sensitivity"></label>
        <label class="title__field title__check"><span>振動</span><input type="checkbox" data-pref-bool="vibration"><i>パリィ・被弾・処刑で振動（対応端末）</i></label>
        <p class="title__hint">高：MSAA・グロー・高解像度の影 ／ 中：標準 ／ 低：スマホ省電力。「自動」は重さに合わせて解像度を調整します。</p>
        <button type="button" data-act="erase" class="title__danger">セーブ削除</button>
        <button type="button" data-act="back" class="title__back">戻る</button>
      </div>
      <div class="title__panel title__controls" data-view="controls" hidden>
        <p class="title__panel-head">操作説明 · ${touch ? 'スマホ' : 'PC'}</p>
        <table>${touch ? '' : '<tr><th></th><th>キーボード / マウス</th><th>パッド</th></tr>'}${CONTROLS.map(
          ([what, pc, phone, pad]) => `<tr><td>${what}</td><td>${touch ? phone : pc}</td>${touch ? '' : `<td>${pad}</td>`}</tr>`
        ).join('')}</table>
        <button type="button" data-act="back" class="title__back">戻る</button>
      </div>`;
    this.views = [...this.root.querySelectorAll('[data-view]')];
    this.record = this.root.querySelector('.title__record');
    this.stageRecord = this.root.querySelector('.title__stage-record');
    this.resumeBtn = this.root.querySelector('[data-act="resume"]');
    this.eraseBtn = this.root.querySelector('[data-act="erase"]');
    this.restartBtn = this.root.querySelector('[data-act="restart"]');
    this.fullBtn = this.root.querySelector('[data-act="fullscreen"]');
    this.fullBtn.hidden = !document.fullscreenEnabled;
    this._onFull = () => {
      this.fullBtn.textContent = document.fullscreenElement ? '⛶ 全画面を解除' : '⛶ 全画面';
    };
    document.addEventListener('fullscreenchange', this._onFull);
    this.pauseWhere = this.root.querySelector('.title__pause-where');
    /** 'title' or 'pause' — which first card the panels lead back to. */
    this.mode = 'title';

    this.root.addEventListener('click', (e) => {
      const button = e.target.closest?.('button');
      if (!button) return;
      const act = button.dataset.act;
      const quality = button.dataset.quality;
      const difficulty = button.dataset.difficulty;
      if (act || quality || difficulty) hooks.onSound?.();
      if (quality || difficulty) {
        hooks.onPrefs(quality ? { quality } : { difficulty });
        this._syncPrefs();
        this._fillRecord();
        return;
      }
      if (act === 'resume') hooks.onStage({ resume: true });
      else if (act === 'stage') hooks.onStage({});
      else if (act === 'lesson') hooks.onStage({ tutorial: true });
      else if (act === 'free') hooks.onFree();
      else if (act === 'pvp') hooks.onPvp();
      else if (act === 'upgrade') hooks.onUpgrade();
      else if (act === 'select' || act === 'settings' || act === 'controls') this.view(act);
      else if (act === 'back') this.view(this.mode === 'pause' ? 'pause' : 'main');
      else if (act === 'erase') this._erase();
      else if (act === 'fullscreen') this._fullscreen();
      else if (act === 'resume-game') hooks.onResume?.();
      else if (act === 'restart') hooks.onRestart?.();
      else if (act === 'quit') hooks.onQuit?.();
    });
    this.root.addEventListener('input', (e) => {
      const key = e.target?.dataset?.pref;
      if (key) hooks.onPrefs({ [key]: Number(e.target.value) });
    });
    this.root.addEventListener('change', (e) => {
      const key = e.target?.dataset?.prefBool;
      if (key) {
        hooks.onPrefs({ [key]: !!e.target.checked });
        hooks.onSound?.();
      }
    });
    document.body.appendChild(this.root);
  }

  get visible() {
    return !this.root.hidden;
  }

  /** Which of the screens is showing. */
  get current() {
    return this.views.find((v) => !v.hidden)?.dataset.view ?? 'main';
  }

  show() {
    this.mode = 'title';
    this._fillRecord();
    this.view('main');
    this.root.hidden = false;
    document.body.classList.add('title-open');
  }

  /**
   * The pause menu.
   * @param {{where: string, restart: string|null}} options what the line under
   *   the head says, and the restart button's label (null hides it)
   */
  showPause({ where = '', restart = null } = {}) {
    this.mode = 'pause';
    this.pauseWhere.textContent = where;
    this.restartBtn.hidden = !restart;
    if (restart) this.restartBtn.textContent = restart;
    this.view('pause');
    this.root.hidden = false;
    document.body.classList.add('title-open');
  }

  /** The title proper (not the pause menu) is up. */
  get atTitle() {
    return this.visible && this.mode === 'title';
  }

  hide() {
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
    this.root.hidden = true;
    document.body.classList.remove('title-open');
  }

  view(name) {
    for (const v of this.views) v.hidden = v.dataset.view !== name;
    if (name === 'settings' || name === 'select') this._syncPrefs();
    this._armed = false;
    this.eraseBtn.textContent = 'セーブ削除';
  }

  _fillRecord() {
    const r = this.hooks.record?.() ?? {};
    const best = r.best != null ? ` · 最速 ${time(r.best)}` : '';
    const diff = this.hooks.prefs?.().difficulty ?? 'normal';
    const rank = r.ranks?.[diff];
    const label = DIFFICULTIES.find(([id]) => id === diff)?.[1] ?? '普';
    const rankText = rank ? ` · 最高評価 ${rank}（${label}）` : '';
    this.record.textContent = `一ノ章 — ${r.cleared ? '討伐済' : '未踏破'}${best}${rankText}`;
    this.stageRecord.textContent =
      (r.cleared ? '討伐済' : '未踏破') + best + rankText + (r.checkpoint === 'save' ? ' · 鏡に記録あり' : '');
    this.resumeBtn.hidden = r.checkpoint !== 'save';
  }

  _syncPrefs() {
    const prefs = this.hooks.prefs?.() ?? {};
    for (const input of this.root.querySelectorAll('[data-pref]')) {
      const value = prefs[input.dataset.pref];
      if (value != null) input.value = String(value);
    }
    for (const b of this.root.querySelectorAll('[data-quality]')) {
      b.setAttribute('aria-checked', String(b.dataset.quality === prefs.quality));
    }
    for (const b of this.root.querySelectorAll('[data-difficulty]')) {
      b.setAttribute('aria-checked', String(b.dataset.difficulty === (prefs.difficulty ?? 'normal')));
    }
    for (const input of this.root.querySelectorAll('[data-pref-bool]')) {
      input.checked = !!prefs[input.dataset.prefBool];
    }
  }

  /** 全画面 — and on a phone, held sideways where the browser allows it. */
  async _fullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation?.lock?.('landscape').catch(() => {});
    } catch {
      // Refused (an iframe, iOS Safari): the button simply does nothing.
    }
  }

  /** Two presses: the first arms it, the second erases. */
  _erase() {
    if (!this._armed) {
      this._armed = true;
      this.eraseBtn.textContent = 'もう一度押すと削除（魂・強化・記録）';
      return;
    }
    this._armed = false;
    this.hooks.onErase();
    this._fillRecord();
    this._syncPrefs();
    this.eraseBtn.textContent = '削除しました';
  }

  dispose() {
    document.removeEventListener('fullscreenchange', this._onFull);
    this.root.remove();
  }
}
