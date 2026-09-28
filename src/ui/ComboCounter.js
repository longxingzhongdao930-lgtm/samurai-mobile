/**
 * The running score of a crowd fight: hits in a row, and how many fell.
 *
 * A count that climbs is half of why cutting through a crowd feels like
 * cutting through a crowd — the number is the proof. It shows on the first hit,
 * pops a little on each one after, and clears itself `WINDOW` seconds after
 * the last, which is also what ends the chain: a pause long enough to lose the
 * rhythm starts the count again.
 *
 * Plain DOM, one element, diffed writes: a frame with no new hit touches
 * nothing but a timer.
 */
const WINDOW = 2.4;

export class ComboCounter {
  constructor(parent = document.body) {
    this.element = document.createElement('div');
    this.element.className = 'combo-count';
    this.element.setAttribute('aria-live', 'off');

    this.hitsEl = document.createElement('span');
    this.hitsEl.className = 'combo-count__hits';
    const label = document.createElement('span');
    label.className = 'combo-count__label';
    label.textContent = 'HITS';
    this.killsEl = document.createElement('span');
    this.killsEl.className = 'combo-count__kills';

    this.element.append(this.hitsEl, label, this.killsEl);
    parent.appendChild(this.element);

    this.hits = 0;
    this.kills = 0;
    this._idle = WINDOW;
  }

  /** One body struck; `felled` if it went down. */
  hit(felled = false) {
    this.hits++;
    if (felled) this.kills++;
    this._idle = 0;
    this.hitsEl.textContent = String(this.hits);
    this.killsEl.textContent = this.kills ? `${this.kills} felled` : '';
    this.element.classList.add('is-visible');
    // Restart the pop: drop the class, force a style read, put it back.
    this.element.classList.remove('is-pop');
    void this.element.offsetWidth;
    this.element.classList.add('is-pop');
  }

  /** @param {number} dt real seconds — the window runs through a hit-stop. */
  update(dt) {
    if (this._idle >= WINDOW) return;
    this._idle += dt;
    if (this._idle < WINDOW) return;
    this.hits = 0;
    this.kills = 0;
    this.element.classList.remove('is-visible', 'is-pop');
  }

  dispose() {
    this.element.remove();
  }
}
