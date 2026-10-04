/** Observed event times from uploaded recordings, in seconds at recorded speed.
 * Camera-relative depth is inferred when retargeting to this character.
 * Single: 0559-13, sheath starts 3.64s and relaxed pose at approximately 6.16s.
 * Dual: 0617-29, left sheath 2.1–3.3s, right sheath 4.8–6.6s.
 */
export const SHEATH_REFERENCE = {
  single: {flourish:.8,lift:.35,retract:.75,align:.95,insert:2.15,relax:2.32,end:2.52}
};
export const sheathDuration = () => SHEATH_REFERENCE.single.end;
export function smoothPhase(t,start,end){const x=Math.max(0,Math.min(1,(t-start)/(end-start)));return x*x*(3-2*x);}
