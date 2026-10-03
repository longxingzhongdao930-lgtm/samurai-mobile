const PREFIX = 'kuroame.v1.';
export function readStored(key, fallback = null) {
  try { return JSON.parse(globalThis.localStorage?.getItem(PREFIX + key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}
export function writeStored(key, value) {
  try {
    if (!globalThis.localStorage) return false;
    if (value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
export const DEFAULT_PREFERENCES = Object.freeze({ volume: .9, music: .55, sensitivity: 1, shake: 1, quality: 'auto', effects: 'normal', touchSize: 1, touchOpacity: .9, leftHanded: false, guardToggle: false });
export function preferences(raw = readStored('preferences', {})) {
  const out = { ...DEFAULT_PREFERENCES };
  for (const [key, lo, hi] of [['volume',0,1],['music',0,1],['sensitivity',.4,2],['shake',0,1],['touchSize',.85,1.15],['touchOpacity',.35,1]]) {
    if (Number.isFinite(raw?.[key])) out[key] = Math.min(hi, Math.max(lo, raw[key]));
  }
  if (['auto','low','mid','high'].includes(raw?.quality)) out.quality = raw.quality;
  if (['normal','clear'].includes(raw?.effects)) out.effects = raw.effects;
  out.leftHanded = raw?.leftHanded === true;
  out.guardToggle = raw?.guardToggle === true;
  return out;
}
export function validateRun(raw) {
  const cp = raw?.checkpoint;
  if (raw?.version !== 1 || !cp || !Number.isInteger(cp.beat) || cp.beat < 0 || cp.beat > 10) return null;
  if (!Array.isArray(cp.position) || cp.position.length !== 3 || !cp.position.every(Number.isFinite)) return null;
  if (Math.abs(cp.position[0]) > 30 || cp.position[1] !== 0 || cp.position[2] < -8 || cp.position[2] > 283) return null;
  if (!Number.isFinite(cp.facing) || !Array.isArray(cp.unlocked) || cp.unlocked.length !== 3 || !cp.unlocked.every(x=>typeof x==='boolean')) return null;
  if (![100,120].includes(cp.maxHp) || !Number.isFinite(cp.special) || cp.special < 0 || cp.special > 1) return null;
  const blessings = Array.isArray(cp.blessings) ? cp.blessings.filter(x => Array.isArray(x) && x.length === 2 && ['road','sanctum'].includes(x[0]) && ['blade','step','dragon','flow','link'].includes(x[1])) : [];
  return { version: 1, checkpoint: { ...cp, position: [...cp.position], unlocked: [...cp.unlocked], blessings },
    playTime: Number.isFinite(raw.playTime) ? Math.max(0, raw.playTime) : 0,
    bossSeen: raw.bossSeen === true };
}
export const readRun = () => validateRun(readStored('run'));
