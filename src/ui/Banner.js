/**
 * 幕 — a big brushed word across the middle of the screen for the moments
 * that deserve one (羅刹's rage, its fall): the word sweeps in like ink,
 * holds, and fades. One at a time; a new one replaces the last.
 */
export class Banner {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'banner';
    this.root.hidden = true;
    this.root.innerHTML = '<b class="banner__word"></b><span class="banner__sub"></span>';
    this.word = this.root.querySelector('.banner__word');
    this.sub = this.root.querySelector('.banner__sub');
    this._t = 0;
    document.body.appendChild(this.root);
  }

  /**
   * @param {string} word the big one (two or three characters read best)
   * @param {string} [sub] the line under it
   * @param {'red'|'gold'} [tone]
   * @param {number} [hold] seconds on screen (game time)
   */
  show(word, sub = '', tone = 'red', hold = 2.2) {
    this.word.textContent = word;
    this.sub.textContent = sub;
    this.root.dataset.tone = tone;
    this.root.hidden = false;
    this.root.classList.remove('is-in');
    void this.root.offsetWidth;
    this.root.classList.add('is-in');
    this._t = hold;
  }

  update(dt) {
    if (this.root.hidden) return;
    this._t -= dt;
    if (this._t <= 0) this.root.hidden = true;
  }

  clear() {
    this.root.hidden = true;
  }

  dispose() {
    this.root.remove();
  }
}
