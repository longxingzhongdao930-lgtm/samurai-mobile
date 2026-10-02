/**
 * Device tier and the runtime budget that follows from it.
 *
 * Three tiers, picked once at boot from what the browser will say about the
 * device (`?q=low|mid|high` overrides it). Everything that costs a fixed amount
 * — shadow-map size, light count, particle counts, post — is read from the
 * tier when it is built. What can move while playing — the render resolution
 * and how many enemies may stand at once — is steered by `DynamicBudget`
 * against the frame time actually measured, so a phone that is hotter than its
 * tier assumed sheds pixels before it sheds frames.
 */

const TIERS = {
  low: {
    name: 'low',
    pixelRatioMax: 1.0,
    pixelRatioMin: 0.6,
    shadowMapSize: 1024,
    shadows: true,
    bloom: false,
    lanternLights: 2,
    rainCount: 900,
    leaves: false,
    groundFog: 60,
    maxEnemies: 12,
    aiSkip: 2,
    terrainSegments: 128
  },
  mid: {
    name: 'mid',
    pixelRatioMax: 1.35,
    pixelRatioMin: 0.75,
    shadowMapSize: 2048,
    shadows: true,
    bloom: true,
    lanternLights: 3,
    rainCount: 1600,
    leaves: true,
    groundFog: 110,
    maxEnemies: 20,
    aiSkip: 1,
    terrainSegments: 192
  },
  high: {
    name: 'high',
    pixelRatioMax: 1.75,
    pixelRatioMin: 0.9,
    shadowMapSize: 2048,
    shadows: true,
    bloom: true,
    lanternLights: 4,
    rainCount: 2600,
    leaves: true,
    groundFog: 160,
    maxEnemies: 30,
    aiSkip: 1,
    terrainSegments: 256
  }
};

export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('touch') === '1') return true;
  if (params.get('touch') === '0') return false;
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints || 0) > 0 ||
    window.matchMedia?.('(pointer: coarse)').matches === true
  );
}

function detectTier() {
  const forced = new URLSearchParams(window.location.search).get('q');
  if (forced && TIERS[forced]) return forced;

  const touch = isTouchDevice();
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  const shortSide = Math.min(window.screen?.width || 800, window.screen?.height || 800);

  if (!touch) return cores >= 6 ? 'high' : 'mid';
  // Phones and tablets. A tablet-sized screen with plenty of cores is usually
  // a recent iPad or flagship; anything thin on memory is treated as low.
  if (memory <= 3 || cores <= 4) return 'low';
  if (shortSide >= 700 && cores >= 8) return 'high';
  return 'mid';
}

export const quality = { ...TIERS[detectTier()] };
export const TOUCH = isTouchDevice();

/**
 * Steers the render scale and the enemy cap from the measured frame time.
 *
 * Averaged over a window rather than read per frame, and asymmetric on purpose:
 * it backs off quickly when frames run long and climbs back slowly, so it does
 * not oscillate on the edge of the budget.
 */
export class DynamicBudget {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = 1 / 58;
    this.scale = 1;
    this._acc = 0;
    this._frames = 0;
    this._cooldown = 2;
    /** Multiplier on `quality.maxEnemies`, 0.5..1. */
    this.enemyFactor = 1;
    this.enabled = new URLSearchParams(window.location.search).get('dyn') !== '0';
  }

  get pixelRatio() {
    const device = window.devicePixelRatio || 1;
    const max = Math.min(device, quality.pixelRatioMax);
    return Math.max(quality.pixelRatioMin, max * this.scale);
  }

  get maxEnemies() {
    return Math.max(6, Math.round(quality.maxEnemies * this.enemyFactor));
  }

  sample(raw) {
    if (!this.enabled || raw <= 0) return;
    this._acc += raw;
    this._frames++;
    this._cooldown -= raw;
    if (this._acc < 1.0) return;

    const average = this._acc / this._frames;
    this._acc = 0;
    this._frames = 0;
    if (this._cooldown > 0) return;

    let changed = false;
    if (average > this.target * 1.18 && this.scale > 0.55) {
      this.scale = Math.max(0.55, this.scale - 0.1);
      this.enemyFactor = Math.max(0.5, this.enemyFactor - 0.1);
      changed = true;
      this._cooldown = 1.5;
    } else if (average < this.target * 0.92 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.05);
      this.enemyFactor = Math.min(1, this.enemyFactor + 0.05);
      changed = true;
      this._cooldown = 3;
    }
    if (changed) this.renderer.applyPixelRatio(this.pixelRatio);
  }
}
