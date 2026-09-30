/**
 * The glyph for each move, drawn rather than written.
 *
 * One 24×24 line drawing per ability id, in the same brush language: a single
 * stroke weight, round caps, and the faint marks — impact, trail, speed —
 * carried at lower opacity so the shape of the move reads first and the motion
 * second. Everything is `currentColor`, so a chip's state colours its icon by
 * setting `color` and nothing else.
 *
 * These are markup, not files: an inline `<svg>` costs no request, inherits the
 * chip's colour and transitions, and cannot arrive late and pop in over a HUD
 * that is already on screen.
 */

/** @param {string} body inner markup, in a 24×24 box */
const stroke = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/**
 * Icon markup by ability id.
 *
 * Keyed by the same `id` that names the settings block and the clip, so adding
 * a move means adding one entry here and one in `config/abilities.js`.
 *
 * @type {Record<string, string>}
 */
export const ABILITY_ICONS = {
  // An arc of travel with the leap's own arrowhead at the far end, dashed
  // because the ground under it is the part that is not there.
  leap: stroke(
    `<path d="M3 19.2c1.4-7.4 6.2-11.6 13.4-11.6" stroke-dasharray="2.4 2.6" opacity="0.8"/>` +
      `<path d="M12.8 4.4 17 7.6 13.6 11"/>` +
      `<circle cx="3" cy="19.2" r="1.5" fill="currentColor" stroke="none"/>`
  ),

  // A body on the stand, with a slot open either side of it — the studio is
  // where gear goes on, so the glyph is the fitting rather than the armour.
  customize: stroke(
    `<circle cx="12" cy="5.4" r="2.5"/>` +
      `<path d="M7.3 20.6c0-4.9.9-7.8 4.7-7.8s4.7 2.9 4.7 7.8" stroke-width="1.8"/>` +
      `<path d="M9.2 9.1 12 10.6l2.8-1.5" opacity="0.85"/>` +
      `<rect x="1.4" y="10.2" width="3.8" height="3.8" rx="1" opacity="0.6"/>` +
      `<rect x="18.8" y="10.2" width="3.8" height="3.8" rx="1" opacity="0.6"/>` +
      `<path d="M5.6 12.1h1.8M16.6 12.1h1.8" stroke-width="1.4" opacity="0.45"/>`
  ),

  // The leg, hip to knee to ankle to toe, with the impact thrown off the toe.
  // The hip is a dot and the foot a wedge: without them the joints read as a
  // tick mark rather than as a limb coming out of a body.
  kick: stroke(
    `<circle cx="4.6" cy="3.8" r="1.7" fill="currentColor" stroke="none"/>` +
      `<path d="M4.8 4.6 9 10.1 5.5 14 12.2 17.2" stroke-width="2.1"/>` +
      `<path d="M11.4 15.6 15.8 17.7 14.6 20.2 10.4 18.2z" fill="currentColor" stroke="none"/>` +
      `<path d="M17.2 13.2 20.4 11.2M18.4 16.6 22 16.2M17 19.8 20.4 21.4" ` +
      `stroke-width="1.4" opacity="0.62"/>`
  ),

  // Blade rising out of the guard, and the crescent the edge left behind it.
  slashHit: stroke(
    `<path d="M2.6 11.4C6.4 4.6 14.4 2.6 21.4 5.4" stroke-width="1.4" opacity="0.6"/>` +
      `<path d="M6.6 17.4 19 5" stroke-width="2"/>` +
      `<path d="M3.4 20.6 6.6 17.4" stroke-width="2.4"/>` +
      `<path d="M4.8 15.6 9 19.8" stroke-width="1.5"/>`
  ),

  // The same blade laid flat, its trail low and wide, and the speed behind it.
  crouchSlash: stroke(
    `<path d="M2.2 15.6C7.2 20.2 15.6 20.6 21.8 16" stroke-width="1.4" opacity="0.6"/>` +
      `<path d="M5.8 14.2 19 9.4" stroke-width="2"/>` +
      `<path d="M2.8 15.3 5.8 14.2" stroke-width="2.4"/>` +
      `<path d="M5 12.4 6.6 16.8" stroke-width="1.5"/>` +
      `<path d="M2.6 6.6h4.6M3.8 9.6h3.2" stroke-width="1.4" opacity="0.45"/>`
  ),

  // The string: three cuts one after another, each longer than the last —
  // read left to right, it is a rhythm rather than one blow.
  combo: stroke(
    `<path d="M3.2 15.6 8.4 7.2" opacity="0.55"/>` +
      `<path d="M8 18.4 14.2 6.6" opacity="0.78"/>` +
      `<path d="M12.8 21 20.8 4.2" stroke-width="2"/>` +
      `<path d="M19.2 3.6 21.4 2.4 21.1 5" stroke-width="1.4"/>`
  ),

  // The guard: a blade held crosswise in front of a body, the blow stopping on it.
  guard: stroke(
    `<path d="M4 17.5 18.8 4.8" stroke-width="2"/>` +
      `<path d="M3 15.2 6.4 18.6" stroke-width="1.6"/>` +
      `<path d="M12.6 20.4c-3.4-1.2-5.2-3.4-5.2-6.6V9.2l5.2-2 5.2 2v4.6c0 3.2-1.8 5.4-5.2 6.6z" opacity="0.6"/>`
  ),

  // 影走り: a blade and the shadows it left behind it.
  kagebashiri: stroke(
    `<path d="M4 19 19.5 5" stroke-width="2"/>` +
      `<path d="M4 14.5 12 7" opacity="0.5"/>` +
      `<path d="M9 20 17 12.5" opacity="0.35"/>`
  ),

  // 雷切: a bolt split by a blade.
  raikiri: stroke(
    `<path d="M13.5 2.5 7.5 12.5h5l-2.5 9 7-11.5h-5l2.2-7.5z" stroke-width="1.6"/>` +
      `<path d="M3 20.5 21 3.5" opacity="0.5"/>`
  ),

  // 縮地: a footprint, and the ground folding up behind it.
  shukuchi: stroke(
    `<path d="M3 18h7M5 14h8M3 10h6" opacity="0.55"/>` +
      `<path d="M16.5 6.5c2 0 3.2 1.8 3.2 4.2 0 3.6-1.6 7.8-3.6 7.8s-2.8-2.6-2.8-6c0-3.4 1.2-6 3.2-6z" stroke-width="1.6"/>`
  ),

  // 飛燕: a crescent of edge leaving the blade and flying.
  hien: stroke(
    `<path d="M3 20 9.5 13.5" stroke-width="2"/>` +
      `<path d="M11 4.5c5.2 1.2 8.6 5.4 8.6 10.6-2.2-3.6-5.6-5.6-9.6-5.4" stroke-width="1.7"/>` +
      `<path d="M8.6 8.6c2.6.6 4.4 2.4 5 5" opacity="0.55"/>`
  ),

  // The whirlwind: a ring of cuts round a point, open where the blade is.
  musou: stroke(
    `<path d="M12 3.2a8.8 8.8 0 1 1-8.1 5.4" stroke-width="1.9"/>` +
      `<path d="M3.9 8.6 3 4.9 6.7 5.6" stroke-width="1.5"/>` +
      `<path d="M12 7.4a4.6 4.6 0 1 0 4.4 3.2" opacity="0.7"/>` +
      `<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>`
  )
};

/**
 * The icon for an ability, as an element ready to append.
 *
 * Falls back to an empty span when an id has no drawing yet — a new move should
 * cost a missing glyph, not a HUD that fails to build.
 *
 * @param {string} id
 * @param {string} [className]
 */
export function createIcon(id, className = 'hud__icon') {
  const holder = document.createElement('span');
  holder.className = className;
  holder.innerHTML = ABILITY_ICONS[id] ?? '';
  return holder;
}
