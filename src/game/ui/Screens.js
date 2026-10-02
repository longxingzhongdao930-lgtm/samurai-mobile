/**
 * The full-screen layers: title, pause, defeat and the result.
 *
 * Each is a small DOM panel with buttons; the game passes callbacks in and
 * nothing here holds game state. Buttons answer to pointerup so a thumb that
 * slides off cancels, as a native button would.
 */
export class Screens {
  constructor({ touch }) {
    this.touch = touch;
    this.root = el('div', 'gs', document.body);
    this.current = null;
  }

  _panel(className, html) {
    this.close();
    const panel = el('div', `gs-panel ${className}`, this.root);
    panel.innerHTML = html;
    this.root.classList.add('is-on');
    this.current = panel;
    requestAnimationFrame(() => panel.classList.add('is-in'));
    return panel;
  }

  _bind(panel, handlers) {
    for (const [action, fn] of Object.entries(handlers)) {
      const button = panel.querySelector(`[data-action="${action}"]`);
      if (!button) continue;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        fn();
      });
    }
  }

  close() {
    this.current?.remove();
    this.current = null;
    this.root.classList.remove('is-on');
  }

  get open() {
    return this.current !== null;
  }

  title({ onStart, quality }) {
    const controls = this.touch
      ? '<li><b>左</b> 移動スティック</li><li><b>右スワイプ</b> カメラ</li><li><b>斬</b> 攻撃（長押しで居合）</li><li><b>守</b> ガード / 直前で弾き</li><li><b>避</b> 回避</li><li><b>術</b> 魔法 · <b>奥義</b> 必殺</li><li><b>敵をタップ</b> ロックオン</li>'
      : '<li><b>WASD</b> 移動 · <b>Shift</b> 歩き</li><li><b>マウス</b> カメラ</li><li><b>左クリック</b> 攻撃（長押しで居合）</li><li><b>右クリック</b> ガード · 直前で弾き</li><li><b>Space</b> 回避</li><li><b>Q</b> 魔法 · <b>1 2 3</b> 属性</li><li><b>R</b> 奥義 · <b>Tab / ホイール押し</b> ロックオン</li><li><b>Esc</b> ポーズ</li>';
    const panel = this._panel(
      'gs-title',
      `<div class="gs-title__mark">影</div>
       <h1 class="gs-title__name">黒雨の城下町</h1>
       <p class="gs-title__sub">— 体験版 —</p>
       <button class="gs-btn gs-btn--main" data-action="start">はじめる</button>
       <ul class="gs-controls">${controls}</ul>
       <p class="gs-fine">画質: ${quality} · ヘッドホン推奨${this.touch ? '' : ' · マウスで視点 · Escでカーソル解放'}</p>`
    );
    this._bind(panel, { start: onStart });
  }

  pause({ onResume, onRetry, onTitle, onVolume, muted }) {
    const panel = this._panel(
      'gs-pause',
      `<h2 class="gs-h">一時停止</h2>
       <button class="gs-btn gs-btn--main" data-action="resume">再開</button>
       <button class="gs-btn" data-action="retry">チェックポイントから再開</button>
       <button class="gs-btn" data-action="volume">${muted ? '音: オフ' : '音: オン'}</button>
       <button class="gs-btn gs-btn--quiet" data-action="title">タイトルへ</button>`
    );
    this._bind(panel, { resume: onResume, retry: onRetry, title: onTitle, volume: onVolume });
  }

  defeat({ onRetry, onTitle, tip }) {
    const panel = this._panel(
      'gs-defeat',
      `<div class="gs-defeat__mark">死</div>
       <h2 class="gs-h">討死</h2>
       <p class="gs-tip">${tip}</p>
       <button class="gs-btn gs-btn--main" data-action="retry">再挑戦</button>
       <button class="gs-btn gs-btn--quiet" data-action="title">タイトルへ</button>`
    );
    this._bind(panel, { retry: onRetry, title: onTitle });
  }

  result({ stats, onAgain, onTitle }) {
    const rows = [
      ['討伐時間', stats.time],
      ['討伐数', stats.kills],
      ['最大連撃', stats.maxCombo],
      ['弾き', stats.parries],
      ['見切り', stats.perfectDodges],
      ['処刑', stats.executions],
      ['属性反応', stats.reactions],
      ['被ダメージ', stats.damageTaken],
      ['再挑戦', stats.retries]
    ]
      .map(([k, v]) => `<div class="gs-row"><span>${k}</span><b>${v}</b></div>`)
      .join('');
    const panel = this._panel(
      'gs-result',
      `<p class="gs-result__over">黒角鬼・羅刹 討伐</p>
       <div class="gs-rank gs-rank--${stats.rank}">${stats.rank}</div>
       <div class="gs-rows">${rows}</div>
       <p class="gs-tip">${stats.comment}</p>
       <button class="gs-btn gs-btn--main" data-action="again">もう一度</button>
       <button class="gs-btn gs-btn--quiet" data-action="title">タイトルへ</button>`
    );
    this._bind(panel, { again: onAgain, title: onTitle });
  }

  dispose() {
    this.root.remove();
  }
}

function el(tag, className, parent) {
  const node = document.createElement(tag);
  node.className = className;
  parent?.appendChild(node);
  return node;
}
