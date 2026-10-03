# Added characters

The default page is the full **黒雨の城下町** trial from
`claude/confident-goldberg-8tk9be` (`00db330`), including its town, progression,
weapons, combat and dragon transformation. On its title screen select
**追加キャラクター6体を見る** to enter the separate character playground (`?dev`).
The trial does not download these six showcase assets during startup. Its own
`models/dragonkin.glb` continues to power the playable dragon form.

In the playground, open **Characters · 6** and select a name to move near
that character. The menu works with touch and keyboard. The existing player
character and controls are retained.

| Character | Recommended role | Supplied animations used |
| --- | --- | --- |
| Silver Dragon | Enemy | 37 retained; idle, walk, run, attacks, skills, hit, death mapped |
| Achates | Enemy | 19 selected from 122; complete attack sequences, movement, reactions, death |
| Infinian | Enemy | All 14 retained; movement, attack, skills, death mapped |
| Queen of Swords | Camp guardian | The supplied 10-second presentation clip |
| Samurai | Training companion | The supplied 8.33-second presentation clip |
| Shadowkin Mage | Ritual keeper | Supplied ActionPose; no animated movement exists in the file |

Camp roles describe their placement/presentation: these three are not combat AI
or replacements for the playable samurai. They stand to the left of the initial
spawn and can also be reached using the menu.

In the playground, the three enemies occupy three of the existing five population slots. They
approach using walk/run, play ordinary attacks and occasional skill motions,
and return to idle. Multi-part Achates attacks play all sections in order.
Infinian's Skill03 can play Up → Down as one sequence. A lethal hit interrupts
any sequence and holds the final death pose until corpse removal. Infinian has
no supplied hit animation: a nonlethal hit interrupts it into idle instead.
Settings are under `settings.creatures` and **G → Combat → Enemies**.

This playground is animation integration. It has no player-health system;
playground enemy attacks do not damage the player, and newly mapped skills do not create
new breath/spell VFX or hitboxes. No unsupported cross-rig retargeting is used. The separate town trial retains its
complete player-health, enemy AI, boss and progression systems.

## Asset preparation

The supplied files are preserved outside the repository. Runtime copies embed
their textures in GLB, normalize each animation timeline to zero, and use
1024-pixel WebP textures for the five additional characters. Achates keeps only
the mapped complete sequences to reduce its download; the source ZIP retains
all 122 clips. No runtime compression decoder is required beyond browser WebP
support. Every model file is below Cloudflare Pages' 25 MiB per-file limit.

`scripts/prepare-characters.mjs` is the offline conversion tool. Install
`@gltf-transform/core@4.5.1`, `@gltf-transform/functions@4.5.1` and
`@gltf-transform/extensions@4.5.1` into a separate tool directory. Pass
`MODEL_TOOLS=/path/to/tools/node_modules` and a JSON map from character IDs to
source GLB/glTF files. For Achates, first extract its ZIP preserving the
`scene.gltf`, `scene.bin`, and `textures/` paths. The silver dragon has a separate
Blender conversion script documented in `public/models/dragon/README.md`.

```sh
node --test tests/*.test.js
npm run build
```

Credits and source links are accessible from the character menu and in
`public/model-credits.html`; original metadata is in `docs/character-credits.json`.
Queen of Swords is CC-BY-NC-SA-4.0, Samurai is CC-BY-NC-4.0, and the other three
newly supplied models are CC-BY-4.0. These asset licenses are separate from the
repository's code license.
