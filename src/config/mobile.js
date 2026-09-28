/**
 * The phone's settings: what `config/settings.js` is patched with on a touch
 * device, and only there.
 *
 * Applied once, before the defaults are snapshotted, so on a phone these *are*
 * the defaults — "Reset to defaults" in the editor comes back here rather than
 * to the desktop's numbers, and a desktop never sees any of it.
 *
 * Every entry trades a cost that scales with pixels or with counts for one the
 * eye does not miss at arm's length on a six-inch screen. The look is the same
 * look: nothing is switched off, only thinned.
 */
export const MOBILE_OVERRIDES = {
  environment: {
    /**
     * 4096² → 1024², and the box it covers 46 m → 22 m half-width.
     *
     * The only things casting are the body, its gear and the ring of bodies
     * within 13 m of it, so a 22 m box still holds every caster in frame. Over
     * that box a texel is ~4.3 cm against the desktop's ~2.2 cm — soft-filtered,
     * it reads the same — for a sixteenth of the map (64 MB → 4 MB of depth)
     * and a quarter of the caster fill.
     */
    shadowMapSize: 1024,
    shadowExtent: 22
  },

  fire: {
    volume: {
      /**
       * The raymarch is per pixel of the flame, every frame: half the samples
       * is half its fill, and the flame reads the same.
       *
       * `octaves` stays at 5 on purpose. The finest octaves are what shreds the
       * smoke off the plume — at 3 or 4 it no longer tears apart and hangs over
       * the blade as a pink cloud.
       */
      steps: 32
    },
    /** Half the sparks. Still a shower at this size, not a cloud. */
    embers: { rate: 170 }
  },

  leaves: {
    /**
     * A smaller window of litter at the same density: 1.86 leaves/m² against
     * 1.79, over 44 m instead of 56 m. The ring that goes is out where the haze
     * already has it — 3 600 leaves instead of 5 600.
     */
    litter: { field: 44, perCell: 9 },
    /** Fewer in the air, born closer in. */
    drift: { count: 140, radius: 20 }
  },

  /**
   * Fewer bodies standing at once: 14 → 10. Every one is a skinned mesh with
   * its own mixer and a shadow caster, and a phone pays for each of them.
   * The ceiling (`EnemyManager` MAX_BODIES, 30) is the same on both.
   */
  enemies: { count: 10 },

  /** Soft transparent quads are pure fill. 190 → 120 puffs. */
  groundFog: { count: 120 },

  /**
   * The floor grid: 384² → 256² vertices, 295k → 131k triangles. Its normals
   * follow the vertex spacing, so the hills lose only detail no one could see
   * at this size.
   */
  terrain: { segments: 256 },

  studio: {
    /** The character screen's key light: 2048² → 1024². */
    lights: { shadowMapSize: 1024 }
  }
};
