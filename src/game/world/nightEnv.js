import { DataTexture, FloatType, LinearFilter, RGBAFormat } from 'three';

/**
 * The environment probe for a rainy night, generated rather than downloaded.
 *
 * A small equirectangular HDR: a deep blue-black sky, a faint cool band at the
 * horizon, and a scatter of warm low glows standing in for the town's lanterns
 * — which is what wet stone and steel should be reflecting. It replaces the
 * 5.7 MB sunrise HDR in the game, and goes through the same PMREM path.
 */
export function makeNightEnvironment(width = 256, height = 128) {
  const data = new Float32Array(width * height * 4);
  const glows = [];
  for (let i = 0; i < 14; i++) {
    glows.push({ u: Math.random(), v: 0.5 + Math.random() * 0.06, r: 0.012 + Math.random() * 0.02, k: 2 + Math.random() * 4 });
  }
  for (let y = 0; y < height; y++) {
    // Row 0 is the bottom of the texture (straight down); v here is 0 up, 1 down.
    const v = 1 - y / (height - 1);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      let r;
      let g;
      let b;
      if (v < 0.5) {
        const t = v / 0.5; // 0 zenith → 1 horizon
        r = 0.006 + 0.03 * t * t;
        g = 0.01 + 0.045 * t * t;
        b = 0.022 + 0.08 * t * t;
      } else {
        const t = (v - 0.5) / 0.5;
        r = 0.02 * (1 - t) + 0.004;
        g = 0.024 * (1 - t) + 0.005;
        b = 0.03 * (1 - t) + 0.007;
      }
      for (const glow of glows) {
        let du = Math.abs(u - glow.u);
        du = Math.min(du, 1 - du);
        const dv = v - glow.v;
        const d2 = (du * du * 4 + dv * dv) / (glow.r * glow.r);
        const k = glow.k * Math.exp(-d2);
        r += k * 1.0;
        g += k * 0.45;
        b += k * 0.15;
      }
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 1;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
