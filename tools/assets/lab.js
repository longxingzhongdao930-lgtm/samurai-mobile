// Asset lab: load the shipped models the way the game does, and write them
// back out lighter. Driven by `tools/optimize-assets.mjs` through a browser
// (the loaders and the encoders are the browser's and three's own).
import { HalfFloatType, FloatType, DataUtils, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { AssetLoader } from '../../src/loaders/AssetLoader.js';

const assets = new AssetLoader();

const toBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const exportGLB = (input, options) =>
  new Promise((resolve, reject) => new GLTFExporter().parse(input, (r) => resolve(toBase64(r)), reject, { binary: true, ...options }));

window.lab = {
  async inspect(url) {
    const isFbx = /\.fbx$/i.test(url);
    const root = isFbx ? await assets.loadFBX(url) : (await assets.loadGLTF(url)).scene;
    let verts = 0;
    let meshes = 0;
    let bones = 0;
    const tex = new Map();
    root.traverse((o) => {
      if (o.isBone) bones++;
      if (o.isMesh) {
        meshes++;
        verts += o.geometry.attributes.position.count;
        for (const m of [].concat(o.material)) {
          for (const k of Object.keys(m)) {
            const t = m[k];
            if (t && t.isTexture && t.image) tex.set(t.uuid, `${m.name}.${k} ${t.image.width}x${t.image.height}`);
          }
        }
      }
    });
    return { meshes, verts, bones, textures: [...tex.values()], clips: root.animations?.length ?? 0 };
  },

  /**
   * An FBX as a GLB: the same objects three made of it, every name kept in
   * `extras` (glTF loaders rewrite names; `AssetLoader#loadModel` restores
   * them), its clips along. `clipOnly` drops the meshes and keeps the joints —
   * for the motion files, whose bodies the game never uses.
   */
  async fbxToGLB(url, { clipOnly = false } = {}) {
    const root = await assets.loadFBX(url);
    if (clipOnly) {
      const drop = [];
      root.traverse((o) => {
        if (o.isMesh) drop.push(o);
      });
      for (const o of drop) o.removeFromParent();
    }
    root.traverse((o) => {
      o.userData.name = o.name;
      // The look comes from the material library (`loaders/MaterialLibrary.js`),
      // matched by name: only the names (and base colours) need to travel.
      if (o.isMesh) {
        const strip = (m) => new MeshStandardMaterial({ name: m.name, color: m.color, side: m.side });
        o.material = Array.isArray(o.material) ? o.material.map(strip) : strip(o.material);
      }
    });
    return exportGLB(root, { animations: root.animations ?? [], onlyVisible: false });
  },

  /**
   * A GLB's textures re-encoded: JPEG (or WebP where the colour map's alpha
   * is used), at most `maxSize` square. The geometry and materials are kept.
   */
  async recompressGLB(url, { maxSize = 1024 } = {}) {
    const gltf = await assets.loadGLTF(url);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        const alpha = m.transparent || m.alphaTest > 0;
        for (const k of Object.keys(m)) {
          const t = m[k];
          if (!t || !t.isTexture) continue;
          t.userData.mimeType = alpha && k === 'map' ? 'image/webp' : 'image/jpeg';
        }
      }
    });
    return exportGLB(gltf.scene, { maxTextureSize: maxSize, animations: gltf.animations });
  },

  /** An image re-encoded (and optionally shrunk) as JPEG. */
  async recompressImage(url, { quality = 0.86, maxSize = 4096 } = {}) {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return toBase64(await blob.arrayBuffer());
  },

  /** A Radiance HDR halved (box filter) and written back as flat RGBE. */
  async shrinkHDR(url, factor = 2) {
    const loader = new RGBELoader().setDataType(FloatType);
    const tex = await loader.loadAsync(url);
    const { width: w, height: h, data } = tex.image;
    const read = (i) => (tex.type === HalfFloatType ? DataUtils.fromHalfFloat(data[i]) : data[i]);
    const W = Math.floor(w / factor);
    const H = Math.floor(h / factor);
    const header = `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`;
    const out = new Uint8Array(header.length + W * H * 4);
    for (let i = 0; i < header.length; i++) out[i] = header.charCodeAt(i);
    let o = header.length;
    // RGBELoader keeps the file's row order (it flips at upload), so rows go back out as they came.
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const i = ((y * factor + dy) * w + (x * factor + dx)) * 4;
            r += read(i);
            g += read(i + 1);
            b += read(i + 2);
          }
        }
        const n = factor * factor;
        r /= n;
        g /= n;
        b /= n;
        const m = Math.max(r, g, b);
        if (m < 1e-32) {
          out[o++] = 0;
          out[o++] = 0;
          out[o++] = 0;
          out[o++] = 0;
        } else {
          const e = Math.ceil(Math.log2(m) + 1e-9);
          const k = 256 / 2 ** e;
          out[o++] = Math.min(255, Math.floor(r * k));
          out[o++] = Math.min(255, Math.floor(g * k));
          out[o++] = Math.min(255, Math.floor(b * k));
          out[o++] = e + 128;
        }
      }
    }
    return toBase64(out.buffer);
  }
};
window.labReady = true;
