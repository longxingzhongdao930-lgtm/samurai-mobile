import { applySettings, settings } from '../../config/settings.js';
import { quality } from '../../core/Quality.js';

/**
 * The template's settings, re-dialled for the trial.
 *
 * Merged into the live `settings` object once at boot (`applySettings`), so
 * every system keeps sampling the same fields it always did — this file is
 * only a different set of numbers. Quality-dependent fields (fog count, leaf
 * fields, bloom, terrain resolution) are then set by `Game` from the tier.
 */
export const GAME_SETTINGS = {
  camera: {
    distance: 5.2,
    minDistance: 3,
    maxDistance: 8,
    fov: 58,
    targetHeight: 1.45,
    damping: 0.0004,
    minPolar: 0.55,
    maxPolar: 1.5
  },
  character: {
    turnRate: 0.0006
  },
  locomotion: {
    walkSpeed: 1.7,
    runSpeed: 5.2,
    acceleration: 26,
    deceleration: 30
  },
  // The town is flat: buildings and walls frame it, fog hides the rest.
  terrain: {
    amplitude: 0.0,
    octaves: 1
  },
  enemies: {
    count: 0,
    watch: false,
    collide: true,
    bodyRadius: 0.38,
    corpseTime: 3.2,
    dissolveTime: 1.1
  },
  fire: {
    intensity: 0.0
  },
  // Clicks are attacks in the game, not marks.
  flight: { enabled: false },
  slice: {
    blood: {
      color: '#5a0a12',
      burst: 150,
      drip: 40,
      bleedTime: 1.6
    }
  },
  judgement: {
    height: 3.6,
    beats: { open: 0.38, charge: 0.26, fall: 0.2, dwell: 0.4, withdraw: 0.32, close: 0.24 },
    seal: { color: '#6a1206', coreColor: '#ff6a20', intensity: 1.6 },
    fist: {
      color: '#1a0805',
      fresnel: { color: '#ff4a12', emissive: 2.4 },
      veins: { color: '#ffb040', hotColor: '#fff2d0' },
      birth: { color: '#ffe0b0' }
    },
    shock: { color: '#ff7a2a', crackColor: '#ffb050', radius: 4.6 }
  },
  environment: {
    // The moon lights the town too here (in the template it lit only the
    // body): long cool shadows of the eaves across the street.
    keyCharacterOnly: false,
    sunIntensity: 1.15,
    sunColor: '#8fa8d8',
    ambientIntensity: 0.55,
    ambientColor: '#3a4c6e',
    hemiIntensity: 1.25,
    hemiSkyColor: '#5a78a8',
    hemiGroundColor: '#2a2a30',
    rimIntensity: 2.2,
    rimColor: '#9fc0f0',
    envIntensity: 0.35,
    shadowExtent: 34,
    floorColor: '#1a222c',
    floorTint: '#34465a',
    floorRoughness: 0.55,
    floorSheen: 0.22,
    floorTextureSet: 'stone',
    floorTextureScale: 2.2,
    floorTexTint: 0.55
  },
  haze: {
    color: '#22324a',
    sunColor: '#4a6488',
    density: 0.013,
    start: 8,
    ground: 0.022,
    inscatter: 0.3,
    max: 0.93
  },
  sky: {
    zenith: '#050b18',
    exposure: 0.3,
    stars: { enabled: false },
    moon: { brightness: 1.6, opacity: 0.02 }
  },
  groundFog: {
    color: '#3a4a5e',
    litColor: '#8a9ab0',
    opacity: 0.1,
    radius: 26
  },
  leaves: {
    tint: '#6a2a10',
    tintAmount: 0.6,
    litter: { perCell: 5 },
    drift: { count: 60 }
  },
  post: {
    exposure: 1.2,
    bloomStrength: 0.38,
    bloomRadius: 0.45,
    bloomThreshold: 1.0,
    vignette: 0.85,
    contrast: 1.08,
    saturation: 0.92,
    temperature: -0.02
  }
};

/** Merge the trial's numbers in, then the device tier's. Before `App` is built. */
export function applyGameSettings() {
  applySettings(GAME_SETTINGS);
  settings.groundFog.count = quality.groundFog;
  settings.leaves.litter.enabled = quality.leaves;
  settings.leaves.drift.enabled = quality.leaves;
  settings.post.bloomStrength = quality.bloom ? GAME_SETTINGS.post.bloomStrength : 0;
  settings.terrain.segments = quality.terrainSegments;
}
