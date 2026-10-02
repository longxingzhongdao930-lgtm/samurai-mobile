import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

/**
 * The town's surfaces, painted at load time onto small canvases.
 *
 * Nothing here is downloaded: boards, lattice, plaster, roof tiles and the
 * glowing shoji are all a few hundred lines of 2D drawing, tiled in world
 * space by the builder. Small (256²), so the whole set costs well under a
 * megabyte of GPU memory, and authored dark — the town is lit by lanterns.
 */

function canvas(size, draw, { srgb = true, repeat = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const texture = new CanvasTexture(c);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

let seed = 7;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function noise(ctx, size, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rand() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
}

export function makeTextures() {
  seed = 7;
  return {
    /** Weathered vertical boards. */
    wood: canvas(256, (ctx, s) => {
      ctx.fillStyle = '#2a1d16';
      ctx.fillRect(0, 0, s, s);
      const boards = 8;
      for (let i = 0; i < boards; i++) {
        const x = (i / boards) * s;
        const tone = 30 + rand() * 18;
        ctx.fillStyle = `rgb(${tone + 12},${tone},${tone - 8})`;
        ctx.fillRect(x + 1, 0, s / boards - 2, s);
        for (let g = 0; g < 14; g++) {
          ctx.strokeStyle = `rgba(0,0,0,${0.12 + rand() * 0.15})`;
          ctx.beginPath();
          const gx = x + 3 + rand() * (s / boards - 6);
          ctx.moveTo(gx, 0);
          ctx.bezierCurveTo(gx + rand() * 4 - 2, s * 0.3, gx + rand() * 4 - 2, s * 0.7, gx, s);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, 0, 1.5, s);
      }
      noise(ctx, s, 1600, 0.06);
    }),

    /** 格子 — the slatted street front of a machiya. */
    lattice: canvas(256, (ctx, s) => {
      ctx.fillStyle = '#0b0807';
      ctx.fillRect(0, 0, s, s);
      const slats = 16;
      for (let i = 0; i < slats; i++) {
        const tone = 46 + rand() * 12;
        ctx.fillStyle = `rgb(${tone},${tone - 14},${tone - 22})`;
        ctx.fillRect((i / slats) * s + 2, 0, s / slats - 6, s);
      }
      ctx.fillStyle = 'rgb(50,34,26)';
      ctx.fillRect(0, s * 0.48, s, 8);
      noise(ctx, s, 900, 0.07);
    }),

    /** Warm light through paper and lattice — an emissive map. */
    shoji: canvas(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s * 0.7);
      g.addColorStop(0, '#ffcf8a');
      g.addColorStop(1, '#b8622a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1a0e08';
      for (let i = 0; i <= 4; i++) ctx.fillRect((i / 4) * s - 2, 0, 4, s);
      for (let i = 0; i <= 6; i++) ctx.fillRect(0, (i / 6) * s - 2, s, 4);
    }),

    /** Lime plaster, stained by the rain. */
    plaster: canvas(256, (ctx, s) => {
      ctx.fillStyle = '#b9b2a4';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        const x = rand() * s;
        const g = ctx.createLinearGradient(x, 0, x, s);
        g.addColorStop(0, 'rgba(40,40,45,0.25)');
        g.addColorStop(1, 'rgba(40,40,45,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, 2 + rand() * 6, s * (0.2 + rand() * 0.6));
      }
      noise(ctx, s, 3000, 0.08);
    }),

    /** Kawara roof tiles: rows of rounded channels. */
    tiles: canvas(256, (ctx, s) => {
      ctx.fillStyle = '#16191f';
      ctx.fillRect(0, 0, s, s);
      const cols = 8;
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = (c / cols) * s;
          const y = (r / rows) * s;
          const w = s / cols;
          const h = s / rows;
          const g = ctx.createLinearGradient(x, 0, x + w, 0);
          g.addColorStop(0, '#0d0f13');
          g.addColorStop(0.5, `rgb(${52 + rand() * 12},${56 + rand() * 12},${66 + rand() * 12})`);
          g.addColorStop(1, '#0d0f13');
          ctx.fillStyle = g;
          ctx.fillRect(x, y, w, h - 3);
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(x, y + h - 3, w, 3);
        }
      }
      noise(ctx, s, 1200, 0.06);
    }),

    /** Aged vermilion lacquer — torii and shrine. */
    vermilion: canvas(128, (ctx, s) => {
      ctx.fillStyle = '#7a1e10';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(20,8,4,${0.1 + rand() * 0.25})`;
        ctx.fillRect(rand() * s, rand() * s, 2 + rand() * 20, 1 + rand() * 4);
      }
      noise(ctx, s, 1500, 0.07);
    }),

    /** Paper lantern: warm, with ribs. Used as an emissive map too. */
    lantern: canvas(128, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, '#a83a14');
      g.addColorStop(0.5, '#ffb35a');
      g.addColorStop(1, '#a83a14');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(60,10,0,0.55)';
      for (let i = 0; i < 9; i++) ctx.fillRect(0, (i / 9) * s, s, 2);
      ctx.fillStyle = 'rgba(20,0,0,0.85)';
      ctx.font = `bold ${s * 0.42}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('祭', s / 2, s / 2);
    }),

    /** Indigo noren cloth with a white crest. */
    noren: canvas(128, (ctx, s) => {
      ctx.fillStyle = '#1c2a48';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#0c1220';
      ctx.fillRect(s / 3 - 1, s * 0.25, 2, s);
      ctx.fillRect((2 * s) / 3 - 1, s * 0.25, 2, s);
      ctx.strokeStyle = '#d8d2c0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s / 2, s * 0.45, s * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    }),

    /** Bamboo culm: green with nodes. */
    bamboo: canvas(64, (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, '#1e3a1a');
      g.addColorStop(0.5, '#4a6a32');
      g.addColorStop(1, '#1e3a1a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(200,220,160,0.35)';
      ctx.fillRect(0, s - 4, s, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, s - 2, s, 2);
    })
  };
}
