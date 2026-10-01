/**
 * 台詞 — a few lines at the turning points of the chapter, as a lower-third
 * card: who speaks, and what. It never stops the game; each line holds for a
 * time that follows its length (on the game's clock, so a pause holds it too)
 * and a tap or a click on the card moves on. `say` replaces whatever was up.
 */
export class Dialogue {
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'dialogue';
    this.root.hidden = true;
    this.root.innerHTML = '<p class="dialogue__who"></p><p class="dialogue__line"></p>';
    this.who = this.root.querySelector('.dialogue__who');
    this.line = this.root.querySelector('.dialogue__line');
    this.queue = [];
    this.t = 0;
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this._next();
    });
    document.body.appendChild(this.root);
  }

  get active() {
    return !this.root.hidden;
  }

  /** @param {{who?: string, text: string}[]} lines */
  say(lines) {
    this.queue = lines.slice();
    this._next();
  }

  _next() {
    const line = this.queue.shift();
    if (!line) {
      this.root.hidden = true;
      return;
    }
    this.who.textContent = line.who ?? '';
    this.who.hidden = !line.who;
    this.line.textContent = line.text;
    this.t = line.hold ?? 1.2 + line.text.length * 0.07;
    this.root.hidden = false;
    // Restart the fade for every line.
    this.root.classList.remove('is-in');
    void this.root.offsetWidth;
    this.root.classList.add('is-in');
  }

  update(dt) {
    if (this.root.hidden) return;
    this.t -= dt;
    if (this.t <= 0) this._next();
  }

  clear() {
    this.queue = [];
    this.root.hidden = true;
  }

  dispose() {
    this.root.remove();
  }
}
