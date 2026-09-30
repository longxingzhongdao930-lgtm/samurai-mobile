const NS = 'http://www.w3.org/2000/svg';

/**
 * 空裂 — the sky cracking open along a cut.
 *
 * One SVG over the whole screen, drawn with plain strokes (no blur filter, so
 * a phone pays for a handful of paths and nothing else): a dark fracture line
 * under a white-hot core under a wide pale glow, a jagged main crack running
 * the way the blade went and a few branches off it. It races open, holds, and
 * seals up again.
 */
export class SkyCrack {
  constructor() {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'sky-crack');
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.layers = ['glow', 'shadow', 'core'].map((name) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', `sky-crack__${name}`);
      this.svg.appendChild(path);
      return path;
    });
    document.body.appendChild(this.svg);
    this._timer = null;
  }

  /**
   * Crack the sky.
   * @param {number} angle screen-space direction of the cut, radians (0 = rightward)
   * @param {number} [hold] seconds it stays open
   */
  crack(angle, hold = 0.55) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // The main line through the upper part of the screen, along the cut.
    const cx = w * (0.4 + Math.random() * 0.2);
    const cy = h * (0.22 + Math.random() * 0.1);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle) * 0.35; // flattened: the sky is a band, not a wall
    const half = Math.hypot(w, h) * 0.7;
    const main = jagged(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half, 22, h * 0.035);
    let d = toPath(main);
    // Branches off the main line, forking away from it.
    const branches = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < branches; i++) {
      const at = main[3 + Math.floor(Math.random() * (main.length - 6))];
      const side = Math.random() < 0.5 ? -1 : 1;
      const a = angle + side * (0.6 + Math.random() * 0.7);
      const len = h * (0.08 + Math.random() * 0.18);
      const b = jagged(at[0], at[1], at[0] + Math.cos(a) * len, at[1] + Math.sin(a) * len * 0.8, 6, h * 0.012);
      d += ' ' + toPath(b);
    }
    for (const path of this.layers) path.setAttribute('d', d);

    // Restart the animation from the top.
    this.svg.classList.remove('is-on');
    this.svg.style.setProperty('--hold', `${hold}s`);
    void this.svg.getBoundingClientRect();
    this.svg.classList.add('is-on');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.svg.classList.remove('is-on'), (hold + 0.9) * 1000);
  }

  dispose() {
    clearTimeout(this._timer);
    this.svg.remove();
  }
}

/** Points from (x0, y0) to (x1, y1) knocked sideways at random: a fracture. */
function jagged(x0, y0, x1, y1, steps, amp) {
  const pts = [];
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const nl = Math.hypot(nx, ny) || 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const k = i === 0 || i === steps ? 0 : (Math.random() - 0.5) * 2 * amp;
    pts.push([x0 + (x1 - x0) * t + (nx / nl) * k, y0 + (y1 - y0) * t + (ny / nl) * k]);
  }
  return pts;
}

function toPath(pts) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
}
