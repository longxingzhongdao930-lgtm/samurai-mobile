/** Observed event times from uploaded recordings, in seconds at recorded speed.
 * Camera-relative depth is inferred when retargeting to this character.
 * Single: 0559-13, sheath starts 3.64s and relaxed pose at approximately 6.16s.
 * Dual: 0617-29, left sheath 2.1–3.3s, right sheath 4.8–6.6s.
 */
export const SHEATH_REFERENCE = {
  single: {flourish:.8,lift:.35,retract:.75,align:.95,insert:2.15,relax:2.32,end:2.52},
  dualLeft: {lift:.18,retract:.35,align:.5,insert:1.05,relax:1.2,end:1.35},
  dualRight: {lift:.3,retract:.55,align:.75,insert:1.55,relax:1.65,end:1.8},
  dualDelay:2.7,
  flourish:2.1
};
export const sheathDuration = dual => dual ? SHEATH_REFERENCE.dualDelay+SHEATH_REFERENCE.dualRight.end : SHEATH_REFERENCE.single.end;
export function smoothPhase(t,start,end){const x=Math.max(0,Math.min(1,(t-start)/(end-start)));return x*x*(3-2*x);}
