/** Observed event times from uploaded recordings, in seconds at recorded speed.
 * Camera-relative depth is inferred when retargeting to this character.
 * Single: handheld staging informed by Vergil 0746-16 close-up.
 * Timings below are a snappier gameplay adaptation, not measured trace times.
 * Dual: 0617-29, left sheath 2.1–3.3s, right sheath 4.8–6.6s.
 */
export const SHEATH_REFERENCE = {
  single: {flourish:.22,lift:.16,retract:.32,align:.42,insert:1.08,relax:1.16,end:1.42,handheld:true}
};
export const sheathDuration = () => SHEATH_REFERENCE.single.end;
export function smoothPhase(t,start,end){const x=Math.max(0,Math.min(1,(t-start)/(end-start)));return x*x*(3-2*x);}
