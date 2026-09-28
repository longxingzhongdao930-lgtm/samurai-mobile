/**
 * The player's health, and the screen that says they are down.
 *
 * A small bar — the lacquer HUD's gold frame with a vermilion fill — and a
 * pale trail behind it that catches up a moment later, so a hit reads as a
 * chunk taken off rather than as the bar simply being shorter. It sits top
 * centre on a desktop and under the window keys on a phone (`styles.css`).
 *
 * The down screen is a veil, one word, and a Retry button that appears once
 * the fall has had time to be seen. The button is the same for a mouse and a
 * thumb; `Enter` does the same on a keyboard (`App#_onKeyDown`).
 *
 * Plain DOM; every write is diffed, so a frame at full health touches nothing.
 */
export class PlayerHud {
  /**
   * @param {object} options
   * @param {() => void} options.onRetry
   * @param {boolean} [options.touch] whether to name the key in the hint
   */
  constructor({ onRetry, touch = false, parent = document.body }) {
    this.bar = document.createElement('div');
    this.bar.className = 'hp';
    this.bar.setAttribute('role', 'meter');
    this.bar.setAttribute('aria-label', 'Health');

    const label = document.createElement('span');
    label.className = 'hp__label';
    label.textContent = 'HP';
    const track = document.createElement('span');
    track.className = 'hp__track';
    this.trail = document.createElement('i');
    this.trail.className = 'hp__trail';
    this.fill = document.createElement('i');
    this.fill.className = 'hp__fill';
    track.append(this.trail, this.fill);
    this.value = document.createElement('span');
    this.value.className = 'hp__value';
    this.bar.append(label, track, this.value);

    this.veil = document.createElement('div');
    this.veil.className = 'down';
    this.veil.hidden = true;
    const title = document.createElement('p');
    title.className = 'down__title';
    title.textContent = 'Defeated';
    const kanji = document.createElement('p');
    kanji.className = 'down__kanji';
    kanji.textContent = '敗';
    this.retry = document.createElement('button');
    this.retry.type = 'button';
    this.retry.className = 'down__retry';
    this.retry.textContent = touch ? 'Retry' : 'Retry  ·  Enter';
    this.retry.addEventListener('click', () => onRetry());
    // Its own pointer handling, so a tap on it never reaches the canvas.
    this.retry.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.veil.append(kanji, title, this.retry);

    parent.append(this.bar, this.veil);

    this._hp = -1;
    this._max = -1;
  }

  /** @param {number} hp @param {number} max */
  setHp(hp, max) {
    const value = Math.max(0, Math.round(hp));
    if (value === this._hp && max === this._max) return;
    const hurt = value < this._hp;
    this._hp = value;
    this._max = max;
    const fraction = max > 0 ? value / max : 0;
    this.fill.style.transform = `scaleX(${fraction})`;
    this.trail.style.transform = `scaleX(${fraction})`;
    this.value.textContent = String(value);
    this.bar.setAttribute('aria-valuenow', String(value));
    this.bar.setAttribute('aria-valuemax', String(max));
    this.bar.classList.toggle('is-low', fraction <= 0.3);
    if (hurt) {
      this.bar.classList.remove('is-hit');
      void this.bar.offsetWidth;
      this.bar.classList.add('is-hit');
    }
  }

  /** Show the veil; the button comes up after `delay` seconds. */
  showDown(delay) {
    this.veil.hidden = false;
    this.retry.hidden = true;
    document.body.classList.add('player-down');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.retry.hidden = false;
    }, Math.max(0, delay) * 1000);
  }

  get retryReady() {
    return !this.veil.hidden && !this.retry.hidden;
  }

  hideDown() {
    clearTimeout(this._timer);
    this.veil.hidden = true;
    document.body.classList.remove('player-down');
  }

  dispose() {
    clearTimeout(this._timer);
    this.bar.remove();
    this.veil.remove();
    document.body.classList.remove('player-down');
  }
}
