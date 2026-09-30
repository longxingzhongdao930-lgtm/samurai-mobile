/**
 * Whether the page should lay itself out for a thumb rather than a mouse.
 *
 * Asked once, at boot, and the answer is kept: a layout that flipped because a
 * window was resized past some width would pull the controls out from under a
 * thumb that is holding them.
 *
 * `(pointer: coarse)` is the *primary* pointer, which is the right question — a
 * laptop with a touch screen still has a trackpad as its primary pointer and
 * keeps the keyboard layout. `?mobile=1` forces the touch layout on anything
 * (the way to test it on a desktop), and `?mobile=0` forces it off.
 */
let cached = null;

export function prefersTouchLayout() {
  if (cached !== null) return cached;
  if (typeof window === 'undefined') return (cached = false);

  const forced = new URLSearchParams(window.location.search).get('mobile');
  if (forced === '1') return (cached = true);
  if (forced === '0') return (cached = false);

  return (cached = window.matchMedia?.('(pointer: coarse)').matches === true);
}

/**
 * Developer mode: the stage editor (`G`), the frame readout (`F`) and the
 * other tuning aids are only built with `?dev=1` in the address. A player never
 * sees them, and a phone never pays to build a panel of several hundred
 * sliders it will not show.
 */
let devCached = null;

export function isDevMode() {
  if (devCached !== null) return devCached;
  if (typeof window === 'undefined') return (devCached = false);
  return (devCached = new URLSearchParams(window.location.search).get('dev') === '1');
}
