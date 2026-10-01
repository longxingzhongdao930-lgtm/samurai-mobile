import {
  WebGLRenderer,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  SRGBColorSpace
} from 'three';
import { settings } from '../config/settings.js';
import { frame } from './FrameUniforms.js';
import { prefersTouchLayout } from '../utils/device.js';

/**
 * Thin wrapper around WebGLRenderer that owns canvas sizing, pixel-ratio
 * budgeting and the render-quality knobs the rest of the app never touches.
 */
export class Renderer {
  constructor(canvas) {
    this.gl = new WebGLRenderer({
      canvas,
      // Off, and it has to be: every frame goes through the composer, so the
      // default framebuffer only ever receives one full-screen quad and an MSAA
      // backbuffer here would be paid for and then thrown away. The anti-
      // aliasing that matters happens on the composer's own targets — see
      // `postprocessing/PostProcessing.js`, `post.samples`.
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false
    });

    /** 'auto' | 'high' | 'standard' | 'light' — the settings screen's 画質. */
    this.quality = 'auto';
    /** The auto mode's own resolution scale, 0.6 … 1, moved by frame time. */
    this.autoScale = 1;
    this._frameMs = 0;
    this._frames = 0;
    this._fastFor = 0;

    this.gl.setPixelRatio(this.targetPixelRatio());
    this.gl.setSize(window.innerWidth, window.innerHeight, false);

    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    // The frame renders the scene several times (depth prepass, distortion,
    // contact shadows, main pass). Automatic updates would rebuild the cascade
    // shadow maps for every one of them, so the app flags a single update per
    // frame instead.
    this.gl.shadowMap.autoUpdate = false;

    // Tone mapping is executed by the post pipeline's OutputPass, which reads
    // these two properties from the renderer.
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = settings.post.exposure;
    frame.uExposure.value = settings.post.exposure;
    this.gl.outputColorSpace = SRGBColorSpace;

    this.gl.info.autoReset = false;

    this._onResize = null;
  }

  /**
   * The pixel ratio for the quality in force.
   *
   * A desktop caps the device ratio (4K + heavy transparency is not worth the
   * fill rate). A phone works to a *pixel budget* instead — a 3x screen held at
   * arm's length cannot show the difference, and its GPU pays for every pixel
   * in heat — so a big tablet and a small phone land on the same cost.
   * 'auto' starts from 標準 on a phone and 高 on a desktop and is then scaled
   * by the frame rate (`measure`).
   */
  targetPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const touch = prefersTouchLayout();
    const mode = this.quality === 'auto' ? (touch ? 'standard' : 'high') : this.quality;
    let ratio;
    if (touch) {
      const budget = { high: 0.85e6, standard: 0.5e6, light: 0.33e6 }[mode] ?? 0.5e6;
      const fit = Math.sqrt(budget / Math.max(1, window.innerWidth * window.innerHeight));
      ratio = Math.max(0.6, Math.min(dpr, 2, fit));
    } else {
      ratio = Math.min(dpr, { high: 1.75, standard: 1.25, light: 1 }[mode] ?? 1.75);
    }
    if (this.quality === 'auto') ratio *= this.autoScale;
    return Math.max(0.5, ratio);
  }

  /** Change 画質; takes effect at once. */
  setQuality(mode) {
    this.quality = mode;
    this.autoScale = 1;
    this.handleResize();
  }

  /**
   * Auto quality: average the real frame time over ~1.5 s windows. Slower than
   * ~45 fps steps the resolution down; comfortably over 60 for several windows
   * in a row steps it back up. Each step is a resize, so they are rare.
   *
   * @param {number} raw seconds this frame took
   */
  measure(raw) {
    if (this.quality !== 'auto' || document.hidden || raw > 0.25) return;
    this._frameMs += raw * 1000;
    this._frames++;
    if (this._frameMs < 1500) return;
    const avg = this._frameMs / this._frames;
    this._frameMs = 0;
    this._frames = 0;
    const min = prefersTouchLayout() ? 0.6 : 0.7;
    if (avg > 22 && this.autoScale > min) {
      this.autoScale = Math.max(min, this.autoScale * 0.85);
      this._fastFor = 0;
      this.handleResize();
    } else if (avg < 14.5 && this.autoScale < 1) {
      if (++this._fastFor >= 4) {
        this._fastFor = 0;
        this.autoScale = Math.min(1, this.autoScale + 0.1);
        this.handleResize();
      }
    } else {
      this._fastFor = 0;
    }
  }

  get domElement() {
    return this.gl.domElement;
  }

  get size() {
    return this.gl.getSize({ width: 0, height: 0 });
  }

  onResize(callback) {
    this._onResize = callback;
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  handleResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setPixelRatio(this.targetPixelRatio());
    this.gl.setSize(w, h, false);
    this._onResize?.(w, h, this.gl.getPixelRatio());
  };

  /**
   * Called once per frame before rendering so the editor can drive exposure.
   *
   * @param {{exposure: number}} [look] which grade block is in force. The
   *   character screen swaps its own in wholesale, so exposure has to come from
   *   the same object the post stack is reading rather than always from `post`.
   */
  syncSettings(look = settings.post) {
    this.gl.toneMappingExposure = look.exposure;
    // Mirrored for the shaders that have to hold a colour across both grades —
    // see `core/FrameUniforms.js`.
    frame.uExposure.value = look.exposure;
  }

  dispose() {
    window.removeEventListener('resize', this.handleResize);
    this.gl.dispose();
  }
}
