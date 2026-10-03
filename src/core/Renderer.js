import {
  WebGLRenderer,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  Vector2
} from 'three';
import { settings } from '../config/settings.js';
import { frame } from './FrameUniforms.js';

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

    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
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
    /** Set by `applyPixelRatio`; null leaves the device ratio in charge. */
    this.pixelRatioOverride = null;
    this._size = new Vector2();
  }

  /** Cap the pixel ratio: 4K + heavy transparency is not worth the fill rate. */
  targetPixelRatio() {
    return this.pixelRatioOverride ?? Math.min(window.devicePixelRatio || 1, 1.75);
  }

  /**
   * Pin the render scale (the game's dynamic budget steers it) and re-run the
   * resize path so the composer's targets follow.
   */
  applyPixelRatio(ratio) {
    this.pixelRatioOverride = ratio;
    this.handleResize();
  }

  get domElement() {
    return this.gl.domElement;
  }

  /** Canvas size in CSS pixels. One Vector2, reused — read it, don't keep it. */
  get size() {
    const out = this.gl.getSize(this._size);
    out.width = out.x;
    out.height = out.y;
    return out;
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
