# 侍 SAMURAI — a third-person sword action game in Three.js

A short, complete samurai action game that runs in the browser, on a PC or a
phone: a title screen, a tutorial, one chapter (一ノ章) from the first gate to
the boss 鬼武将 羅刹, a free-battle field, and 1-on-1 PvP duels. Everything —
the score and the sound effects included — is made in code; there is no audio
file in the project.

![The stage](docs/media/hero.jpg)

```bash
npm install
npm run dev -- --host   # http://localhost:5173 (and your LAN address for a phone)
npm run build           # production build in dist/ (with the PWA service worker)
npm run preview         # serve dist/ — install it as an app from http://localhost:4173
npm run lint            # ESLint
npm test                # PvP server + rank unit tests
npm run test:e2e        # browser regression (needs `npm run dev` and Playwright's Chromium)
npm run test:pvp        # two-browser PvP match (see tests/pvp-e2e.mjs)
npm run optimize:assets # rebuild public/ models & textures from assets-src/ (needs `npm run dev`)
```

`?dev=1` shows the editor (`G`) and the frame readout (`F`).

## Playing

**題 (title)** → **出陣** chooses a mode:

- **一ノ章 — 鬼武将 羅刹.** 修練 (a short lesson: move, three cuts, a parry, an
  execution, 縮地 — skippable, offered until done once) → 門 → 広場戦 (six
  bodies: swordsmen, a shield, a ninja, an archer, a brute) → 門開放 → 鏡 (the
  save point: it heals and records the checkpoint) → 羅刹 (three phases, every
  big move warned) → 討伐. The clear screen shows the time and the souls taken,
  and the best time of a run from the first gate. 続きから starts at the mirror.
- **自由戦闘.** The open night field: bodies keep coming. Try the arts, gather souls.
- **対戦 PvP.** Room codes, best of rounds, over `npm run server` (see `server/`).

Souls buy upgrades (**強化**, `U`). **設定** has 難易度 (易 / 普 / 難), the
volumes (master, effects, music), 画質 (自動 / 高 High / 中 Medium / 低 Low),
look sensitivity, 振動 and セーブ削除.

- **一時停止** (`P`, `Esc`, the phone's Pause, a pad's Start): 再開 · 設定 ·
  操作説明 · 鏡から再開 (門からやり直す before the mirror) · タイトルへ.
- **難易度** scales the blows that land on you, the parry window, the gaps
  between enemy swings and how many swing at once, their wind-up, and 羅刹's
  health. Duels always use the server's numbers.
- **評価** — every clear is ranked S/A/B/C from the time (from the gate), the
  health lost and falls, and parries/executions/一閃 (`src/world/rank.js`);
  the best per difficulty is kept and shown on the title.
- **台詞** at 出陣 and when 羅刹 stands up; brushed banners for its rage and
  its fall.
- **ゲームパッド** (standard layout): A attack · B leap · X kick · Y 飛燕/居合 ·
  LB lock · RB guard · LT absorb · RT 無双 · D-pad ↑ 雷切 ← 影走り → slash
  hit ↓ slide cut · R3 縮地 · Back 強化 · Start pause; the sticks walk and
  look, and drive every menu.
- **振動** on parries, hits taken, executions, 一閃 and 羅刹's roars (Android).
- **PWA**: installable, fullscreen, and after the first visit it starts from
  the cache — offline too. The title has a 全画面 button for the browser.

### The save

Everything kept between visits — souls, upgrade levels, the chapter's clear,
best time and checkpoint, whether the lesson is done, and the settings — is one
record in **IndexedDB** ([core/SaveStore.js](src/core/SaveStore.js)). The game
reads it synchronously from memory and writes it back shortly after each change
and when the page is hidden. Where IndexedDB is unavailable it falls back to
localStorage, and the localStorage keys earlier versions wrote are carried over
on the first run.

### Sound and music

[audio/CombatAudio.js](src/audio/CombatAudio.js) synthesises every effect —
swings, cuts, guards, the **parry**'s ring, the **execution**'s boom, a
**shield**'s wooden knock, the boss's **roar**, **footsteps** (the brute's and
the boss's heavy ones too) and the menu tick — on an effects bus.
[audio/Music.js](src/audio/Music.js) plays the score on a music bus: taiko,
koto, shakuhachi and a drone in the in-sen scale; *title*, *field* (its drums
follow how many bodies are close), *boss* (faster and denser each phase) and
*clear*. Nothing plays until the first press (browser rule).

## Controls

| | PC | Phone |
| --- | --- | --- |
| Move | `WASD` (`Shift` runs) | left stick |
| Look | click to capture the mouse (`Esc` releases) · drag | drag the open screen · pinch zooms |
| Attack — five-step string | left click / `J` | 攻 |
| Guard (parry just before a blow lands) | hold right click / `K` | Guard |
| Execution (after a parry or a broken stance) | attack while 「処刑」 shows | 攻 when it glows red |
| 一閃 | attack the instant an enemy's eyes flash | same |
| Kick · Slash Hit · Slide Cut | `E` · `R` · `T` | their buttons |
| Leap | `Space` | Leap |
| 飛燕 / 居合 | `B` (hold for 居合) | 飛燕 (hold for 居合) |
| 影走り · 雷切 · 縮地 | `V` · `C` · `X` | their buttons |
| 無双 (gauge full) | `Q` | 無双 |
| Lock-on | `L` (hold to release) | Lock |
| Absorb souls · upgrades | hold `Z` · `U` | 吸魂 · 強化 |
| Equipment studio | `Tab` | Character |

The moves are drawn along the bottom of the screen (on a phone, under the
thumbs); every one of them is a line in [src/config/abilities.js](src/config/abilities.js).
A touch screen gets its own layout ([src/ui/MobileControls.js](src/ui/MobileControls.js)),
detected by `(pointer: coarse)` — `?mobile=1` forces it on a desktop. Every
button *is* its key, so nothing in the game has a mobile branch.

### Assets and first load

What the game loads is generated from the sources in `assets-src/` by
`npm run optimize:assets` ([tools/optimize-assets.mjs](tools/optimize-assets.mjs)):
the FBX rig, bodies and motions become GLB (converted by three's own loaders
and exporter in a browser, names kept, meshopt-compressed), the material
library's and the gear's textures JPEG/WebP, the textures re-encoded, the HDR
halved. The first visit went from ~75 MB to ~9 MB. The JS is split: three in
its own long-cached chunk, the dev editor loaded only with `?dev=1`.

### Performance

画質 sets the pixel ratio (a desktop caps the device ratio; a phone works to a
pixel budget, so a tablet and a small phone cost the same), anti-aliasing
(MSAA on a desktop, FXAA on a phone), a bright-only bloom for cuts and fire
(High), the sun's shadow map size and how often it redraws, anisotropic
filtering, draw distance, mist/leaf counts, the stage's pine wood and how many
bodies the open field keeps up.
**自動** starts from 標準 on a phone and 高 on a desktop and then steps the
resolution down when frames run slower than ~45 fps, and back up when there is
headroom. A phone also gets thinner defaults across the board
([config/mobile.js](src/config/mobile.js)): smaller shadow map, fewer leaves,
fog puffs, bodies, miasma and soul particles, a shorter sword trail.

---

## The world

![Night](docs/media/night.jpg)

One height field, one sky, one body of air, and nothing on screen is allowed to
disagree with any of them.

| System | File | Notes |
| --- | --- | --- |
| Terrain | [src/world/Terrain.js](src/world/Terrain.js) | The world's height field, and the only thing allowed to answer "how high is the ground here". Table-driven value noise, evaluated identically on the GPU (the floor, the litter) and in JS (the character, the camera, the shadow focus). Every knob is a live uniform. |
| Floor | [src/world/Ground.js](src/world/Ground.js) | A grid that follows the character and is displaced up the height field in its vertex shader, so there is no world edge to walk off. The tiling is world-locked through the texture offset and everything the shader does is a function of world position, so only the light pool travels. |
| Sky | [src/world/Sky.js](src/world/Sky.js) | One fullscreen shader: a gradient whose horizon *is* the haze colour, a cell-hashed star field, and a moon. It **owns where the moon is** — `sky.moon.azimuth/elevation` resolve into `frame.uLightDir`, so the disc, the glare, the haze's inscatter lobe and the ground mist's lit side can never disagree. |
| Moon | [src/world/Moon.js](src/world/Moon.js) | The moon as a body rather than a dot product. A sphere carrying a real lunar surface material, projected **triplanar in object space** — the maps are 1024² squares of ground, so wrapping them on sphere UVs would seam the face and pinch every crater into the poles. The relief is *geometry*: the height map displaces vertices, so crater rims break the silhouette instead of being shaded onto a circle. `Sky` stands its own disc down whenever this one is up. |
| Air | [src/world/Atmosphere.js](src/world/Atmosphere.js) | What replaces three's linear fog: an analytic height-fog integral with a moonlit forward lobe, so haze pools in the hollows and glows looking into the moon. One `exp` per fragment more than a linear fog. |
| Ground fog | [src/world/GroundFog.js](src/world/GroundFog.js) | Soft billboard puffs carried downwind, spreading as they age, reading the floor's own baked height field so they hug the ground and dissolve into it. The whole trajectory is closed-form in the vertex shader — the CPU only writes the handful of slots that expired this frame. |
| Leaves | [src/world/Leaves.js](src/world/Leaves.js) | Two populations, one look: 5 600 leaves lying on the floor ([LeafLitter](src/world/LeafLitter.js)) and 260 in the air ([LeafDrift](src/world/LeafDrift.js)), off one sheet of nine leaves with one grade, one backlight and one wind. Drawn opaque and **alpha-tested** rather than blended — they write depth, need no sorting, and can be drawn in any order, which is the only reason they cost one draw call each. Walking through the litter scatters it: the body's position and its ground velocity go in raw, so a sprint throws leaves and standing still disturbs nothing. |
| Lighting | [src/world/Environment.js](src/world/Environment.js) | One cool key with a 4096² shadow map re-centred on the character, a cool rim behind it, a deep blue sky fill and a pale bounce off the ground. The key and the rim light **the character only**: three has no per-object light filtering, so the world's own surfaces are patched to drop every directional light instead. The HDR probe is kept only as a dim specular response and is never the visible sky. |
| Contact shadows | [src/world/ContactShadows.js](src/world/ContactShadows.js) | The tight darkening under the feet the sun's shadow map cannot resolve. |
| Camera | [src/core/CameraRig.js](src/core/CameraRig.js) | Orbit rig whose distance always resolves back to `settings.camera.distance`, so the wheel and the settings file never disagree. |
| Post | [src/postprocessing/PostProcessing.js](src/postprocessing/PostProcessing.js) | Bloom → tone map → one grade pass (aberration, contrast/saturation/temperature, vignette, grain). |

### The terrain, and why the noise is a table

`terrainHeightAt(vec2)` in
[src/shaders/lib/terrain.glsl.js](src/shaders/lib/terrain.glsl.js) is the world's
surface. The floor mesh is displaced by it in its vertex shader, the leaf litter
lies on it, and [src/world/Terrain.js](src/world/Terrain.js) mirrors the same
arithmetic in JS so the character, the camera anchor, the contact shadow and the
sun's shadow focus all stand on exactly the ground you can see.

That mirroring is why the noise is **table-driven** rather than the usual
`snoise`. A procedural hash (`fract(sin(...) * 43758.5)`) does not evaluate
identically on a GPU and in JS — it agrees to a few decimals, which is
centimetres of terrain, which is a character sinking into a hill. A 256×256 byte
table sampled with `NEAREST` returns exactly `byte / 255` on both sides, and
everything downstream of it is plain float maths that lands within a micrometre.

Two things then have to be handled or the ground boils:

- **Swimming.** The floor plane follows the character, so a vertex's world
  position — and therefore its height — would change under it every frame.
  `Ground#setCenter` snaps the plane to whole vertex spacings, so every vertex
  keeps landing on the same world positions and the mesh slides beneath a
  surface that never moves.
- **Normals.** Taken analytically from the field by central difference, over
  exactly half the vertex spacing, so the shading never claims detail the
  triangles cannot show. The tiling's own normal map rides on top.

Everything in `settings.terrain` is a live uniform, so the landscape can be
redialled while walking over it:

| `amplitude: 0` | `amplitude: 3.4` (shipped) | `amplitude: 15, ridge: 0.85` |
| --- | --- | --- |
| ![Flat](docs/media/terrain-flat.jpg) | ![Rolling](docs/media/terrain-rolling.jpg) | ![Peaks](docs/media/terrain-peaks.jpg) |

The two exceptions are `seed` (reshuffles the table) and `segments` (rebuilds the
floor grid). `octaves` is the real cost dial. Amplitude 0 collapses the whole
thing back to a flat plane at y = 0, for free.

---

## The character

![The blade](docs/media/blade.jpg)

The body and its motion live in different files.

`public/models/tpose.fbx` is the skin: one textured, skinned mesh rigged to
Mixamo's `mixamorig:` skeleton, in a T-pose with no animation of its own.
[CharacterController](src/animation/CharacterController.js) normalises it to
`settings.character.targetHeight`, converts its materials to PBR and keeps
whatever maps and colours the export carries.

`public/animations/*.fbx` are skeleton-only exports — joints, no mesh. Because
both files name their joints identically, `_retarget()` lifts the first clip out
of each and binds it to the body, dropping tracks for joints this rig does not
have. Two corrections happen on the way:

- **Units.** Translation tracks are rescaled by the ratio the two bind poses
  imply, measured off the hips, so a body exported in metres takes a clip
  authored in centimetres without launching into the sky. Rotations need none.
- **Root motion.** The controller owns where the body is, so the hips'
  horizontal travel is frozen at its first frame and the clip plays in place.
  The vertical is kept — that is the gait's bob, not travel. A clip named in
  `ROOT_MOTION_CLIPS` has that horizontal travel *recorded* on the way past
  instead of merely dropped, so something else can replay it onto the root.

Adding a state is one line in `ANIMATION_URLS` plus a weight in `Locomotion`.

### Moving

[ThirdPersonController](src/animation/ThirdPersonController.js) integrates the
input into a velocity rather than applying it as a position delta, and turns the
body toward where it is *going* rather than where the camera looks.
[Locomotion](src/animation/Locomotion.js) reads that one speed and blends
idle → walk → run from it. All three clips play permanently and only their
weights move, so a stop-start input can never catch the body between fades; walk
is the master gait and run is slaved to its normalised phase, which is what
stops the mid-blend shuffle. Playback rate is the body's real speed divided by
the speed the clips themselves cover, so raising `walkSpeed` or `runSpeed` turns
the legs over faster to match instead of skating them.

`Space` from a run — never from a walk, never from standing — commits the body to
[Jump](src/animation/Jump.js). It is a committed move: the stick is dead from
launch until the feet are down, and the arc's own travel is what carries the
character. `settings.jump.distance` renormalises that travel to an exact reach in
metres. At any lesser pace the same class plays the in-place hop from
`settings.hop`, which never takes the controls — `gaitBleed` is how much of the
walk or run keeps playing underneath, because taking the whole standing-jump pose
would plant the legs while the body travels on.

---

## Fighting

### Who a press would land on

![Target locks](docs/media/targeting.jpg)

A body wears a ring because a key would take it — not because it happens to be
standing inside some cone alongside three others the swing will never reach. The
question is asked one move at a time, and it is that move's *own* question:
`findTarget` with its range and its cone, which is the exact call
`ThirdPersonController` makes on the press. Two rings can come up at once, and
when they do they are telling the truth: the kick and the slash have locked
different bodies, and the caps over each head say which key goes where.

One answer feeds three things — the cap over the head, the plate along the
bottom, and the press itself — so a plate can never light over a body no key
would reach.

### Aiming an animation that was authored for someone else

A kick is authored against an imaginary opponent at one exact distance and one
exact angle, and the player is never standing there. There are only three ways
out of that and two of them are wrong: sliding the body over with an ease reads
as skating, and letting the foot swing through air a foot short reads as a bug.
[Attack](src/animation/Attack.js) does the third — **motion warping**.

On the press the target is locked, the spot the clip needs (`standoff` metres
short of that body, facing it) is resolved once, and the character is carried
onto it *inside the clip's own approach* — turning first and stepping in second
(`turnAt`), because that is the order a person does it in. By `hitAt` the body is
exactly where the animator assumed it was, and the foot lands.

The class never writes a transform. Like `Jump` it only resolves where the body
*should* be, and `ThirdPersonController` — the one authority over position — puts
it there. Its clock is the action's own, so the whole move obeys
`animationSpeed`, the pause key and the hit-stop for free.

The kick (`E`), the slash (`R`) and the slide cut (`T`) are three instances of
that one class, differing only in the clip they were handed and the settings
block they read. A press with nothing in range still swings: an attack button
that does nothing feels broken, and a whiff is information.

### Contact

Three things happen on the same frame and all three are the same beat: the body
is handed to the ragdoll, the world drops to `hitStopScale` of its speed for
`hitStop` seconds, and the lens takes a `shake`. Any one alone reads as a glitch;
together they read as weight. The hit-stop is a scale on `dt` rather than a
pause, so the animation, the ragdoll and the mist all slow together — and the
shake runs on real time, so the lens keeps moving while the world holds still.

All three are read off the move that landed, which is the whole difference
between the attacks at the moment of impact: the kick's is a short flat shove,
the slash's a longer freeze and a body in two pieces.

### Feel: the beat around contact

Tuned with a physics duel (Stick & Steel) as the reference for *feel* — none
of its code or assets are used here. Every number is in `settings.combat` and
on each move's own block, and all of it is live in the editor under
**Combat → Feel & sound**.

- **Wounds, not one-shots for everything.** Bodies have `enemies.health` (2).
  A sword (`damage: 2`) still fells a fresh body; a boot (`damage: 1`)
  staggers it. A body that survives is shoved back, rocks on a spring through
  its spine (solved so the first peak is exactly `flinch` radians), stops
  turning to face you, and its rim flares.
- **Hit-stop that scales with what the blow did** — full on a kill,
  `staggerScale` of it on a stagger, `finisherBoost` more on a body that was
  already wounded — and a `hitStopRelease` that eases the world back up to
  speed instead of snapping.
- **A lens that is hit along the blow**, not just shaken: a push in the blow's
  direction, a small FOV kick and a touch of roll (`CameraRig#punch`).
- **Sparks and sound on the contact frame.** Sparks reuse
  `vfx/BladeImpact.js`; the sounds are synthesised in
  [src/audio/CombatAudio.js](src/audio/CombatAudio.js) (no audio files) —
  a whoosh a beat before contact (`swingAt`), then a thump, and for an edge a
  hiss and a ring, panned by where the hit is.
- **Combos.** After a move has landed and passed `cancelAt`, a *different*
  move may cut its recovery short and plays `chainSpeed` faster. A press made
  a little early is buffered for `bufferTime`. Kick → Slash is the basic
  chain: stagger, then finisher.
- **Hit detection.** At contact the body must still be within `reach` and
  inside `strikeArc` of where the character faces; a sweep also takes
  whoever else stands inside `cleaveReach`/`cleaveArc`.

### The crowd fight

The string, the sweep and the special were designed with a crowd brawler
(voxel-musou) as the reference for *structure* — how a string is timed, how a
blow meets a crowd, how a special is paced. None of its code is used.

- **The normal string** (`J`, the big button on a phone) is five ordinary
  `Attack` moves, `settings.combo1` … `combo5`, cut from the three attack clips
  by *which part* of each clip they play (`startAt`), how fast, how far they
  step in (`maxWarp`), how wide and far they reach (`areaRange`/`areaArc`) and
  how hard they land (`damage`). Quick, quick, low, heavy, and a finisher that
  runs straight through. Pressed again after a step lands, the next one cuts
  its recovery short; left alone, the string ends and the next press starts it
  over.
- **Soft lock.** The stick says which way a step goes; left alone, it closes on
  the nearest body in front — or, once it has cut through the middle of a
  crowd, the nearest body anywhere in reach. A step swung at nobody still
  travels.
- **Every body in the sector** at contact is struck, nearest first, thrown
  outward. A sweep through a crowd freezes a little longer than one through a
  single body, and only the first three get a sound of their own.
- **Musou** (`Q`): a gauge that fills with hits and kills (`settings.musou`).
  Full, one press spends it: the world drops to a crawl, everyone close is
  shoved out to a ring, and three steps throw themselves — a sweep all the way
  round, a run through, and a last sweep wide enough to reach the edge, with
  the ground opening under it.
- **The crowd.** `enemies.count` standing (14 on a desktop, 10 on a phone),
  hard-capped at `MAX_BODIES` = 30 *bodies* in `combat/EnemyManager.js` —
  corpses included; at the cap the oldest corpse is burned away early to make
  room. New bodies spawn into the emptiest of twelve sectors round the player,
  and standing bodies are held `spacing` apart so knockback never stacks them.
  A running hit count sits on the right.

### Enemy AI

Each body runs a small state machine (`combat/Enemy.js#_think`, tuned in
`settings.enemyAI`): **idle** until the player is inside `detectRadius`, a
moment to **notice**, **chase** at a walk, **hold** at `engageDistance`, then
a **windup** (the player's kick or slash replayed on the enemy rig, slowed,
with the rim burning `telegraphColor`), the **strike** — checked against
reach and arc on the contact frame, so stepping away during the tell makes it
miss — and a **recover** in which it stands open. A blow taken at any point
interrupts it. `EnemyManager` decides the shared part: only the
`maxEngaged` nearest close to striking distance (the rest wait at
`waitDistance`), and only `maxAttackers` may be swinging at once, at least
`attackGap` seconds apart. No new swings start during the Musou or flight.
A landed blow shakes the lens, freezes briefly, flashes the screen edges and
shoves the player back.

### Health and going down

The player has `settings.combat.player.maxHp` (100). Every enemy blow that
lands takes `damage` (12) on top of the flash and shake above, and leaves
`invulnerable` seconds (0.6) in which nothing else can land — so a ring of
them cannot chain blows through one opening. At 0 the body falls over
backward (laid on the character's `tilt` group, pivoting at the feet), every
control stops, no enemy starts a swing, and after `retryDelay` a Retry button
comes up — click or tap it, or press `Enter`. Retry restores full health,
stands a fresh ring of bodies up, and covers the player for
`retryInvulnerable` seconds. The bar is top centre on a desktop and under the
window keys on a phone. All of it is in the editor under
**Combat → Feel & sound → Player HP**.

### The ragdoll

![Ragdoll](docs/media/ragdoll.jpg)

[Ragdoll](src/combat/Ragdoll.js) adds no physics engine, because a ragdoll does
not need one. What the eye reads as a body falling is bone lengths that never
change and limbs that cannot bend the wrong way, under gravity, with the ground
in the way — and all three of those are distance constraints. So the skeleton
becomes a particle per joint, the bones become constraints, and the whole thing
is relaxed a few times per substep. The solve is position-based rather than plain
Verlet: predict, project, then read the velocity back out of the correction,
which is the form that survives a hit-stop and a paused clock.

Three things stop it reading as a rope:

- **Mass.** The pelvis and chest are heavy, the hands and feet light, held as
  inverse mass. Corrections split in that ratio, so an arm whips off a torso
  that barely notices.
- **Bracing.** Bone lengths alone give a chain that folds flat. A dozen extra
  constraints across the pelvis, the chest and the spine give the body a shape it
  is trying to keep while everything else flails.
- **Limits.** A knee that bends both ways is the most recognisable tell there is,
  so the hip-to-ankle distance is floored and capped.

Getting points back onto a skeleton is the other half. Every bone is turned to
*aim* at its child's particle, which leaves the twist about its own axis exactly
as the death pose had it. The pelvis and the chest have two independent
directions available, so their full orientation is rebuilt from that frame
instead — without it, a body face-up and a body face-down are the same aim vector
and the corpse lands on its side every time.

The handover is not a blend. The mixer is stopped mid-frame and the solver's
first pose is whatever the clip was showing when the blow connected, which is the
only way a death looks like it happened to the same body that was standing there.

### The bodies

Five of them stand within `radius` of the player and no nearer than `minRadius`,
spread over the *area* of that ring rather than its radius, and rejected against
each other so no two share a patch of ground. One rig is downloaded and every
enemy is a `SkeletonUtils` clone of it, each idling on its own phase of the same
clip at its own slight pace — five bodies breathing in unison is the most
artificial thing a crowd can do.

A corpse does not hold a slot: the refill timer starts when the body dies, so the
ring is back to full while the old one is still lying there. It stays for
`corpseTime`, then burns away over `dissolveTime` on a noise dissolve that rises
from the feet — `discard` rather than alpha, so a body lying inside a bank of
ground mist never has to be sorted against it.

The export carries no textures at all, so the look is authored rather than
imported: a cold near-black body with an ember fresnel rim, which is the one
combination that stays legible against a blue night at twenty metres.

---

## 秘剣 — the sword arts

[combat/Arts.js](src/combat/Arts.js), each on its own block of `settings.arts`:

- **雷切 (C)** — a lightning cut: a straight dash through everything on the line,
  then the strike chains to the nearest bodies around it.
- **影走り (V)** — run through the bodies in front, leaving afterimages; each
  one passed is cut.
- **縮地 (X)** — a flash step: in an instant, the body is in front of the target.
- **居合 (hold B)** — hold to draw, release to step in with one great cut and
  a 飛燕 wave behind it. A tap of `B` is plain **飛燕**, the crescent thrown.

With them: **処刑** (executions on a parried or broken body), **一閃** (the
counter on an enemy's flash), **無双** (`Q`), and the **妖気** — the violet
miasma the bodies bleed and wind up in.

## 鬼武将 羅刹 — the boss

[combat/Boss.js](src/combat/Boss.js) is a state machine on top of an enemy of
kind `boss`. Its entrance is a beat of its own: the lock-on takes it, the lens
pulls back to frame its size, its name comes up and it roars before it moves.
Phases by health (66 % / 33 %) — each a roar, a shockwave, a red flash and a
faster body — add 地割り (a warned slam), then 雷雨 (three warned strikes) and
百矢 (a fan of arrows) and two retainers. The music follows the phase.

---

## The burning katana

[WeaponFire](src/vfx/WeaponFire.js) is aimed by a **volume**, not a bone: `box`
is an oriented box in the weapon's own frame, and every face of the model inside
it is emitting. It starts as the model's own bounding box, so the whole sword is
alight and already aligned with the blade at any angle the hand holds it; shrink
it down the blade to leave the grip cold.

A surface sampler flattens the faces it keeps into a triangle pool, and
everything else is a different way of reading that same pool:

- [DistanceField](src/vfx/DistanceField.js) bakes it into "how far is the steel
  from here", and [VolumetricFireMaterial](src/vfx/VolumetricFireMaterial.js)
  raymarches a black-body volume through that — which is what makes this the
  sword burning rather than a box of fire around it.
- [EmberSystem](src/vfx/EmberSystem.js) picks triangles out of it by area and
  throws sparks off them, so every ember leaves an actual face of the model.
- [BladeHeat](src/vfx/BladeHeat.js) makes the steel inside the box incandescent,
  so the weapon is a light source rather than a dark prop standing in a flame.

All three radiate through the same `blackbody()`, at temperatures on one scale,
so a cooling spark, the fringe of the plume and the glowing spine are the same
colour when they are the same temperature. That is what makes the effect read as
one object rather than three layers.

---

## The equipment studio — `Tab`

![The studio](docs/media/studio.jpg)

`Tab` moves the body out of the play scene and onto a set built for one thing:
looking at it and dressing it. It is a *mode*, not a scene-graph trick — entering
swaps the camera, the lighting and the grade, and hands the pointer to an
inspection orbit. Nothing is duplicated: the same skeleton, the same mixer and
the same equipment mounts are on screen in both places, which is what makes gear
tuned here already correct out in the world.

| Piece | File | Notes |
| --- | --- | --- |
| The set | [src/world/StudioStage.js](src/world/StudioStage.js) | Key light *twice* — a spot that carries the shadow and a rect-area softbox at the same angle that does the wrap and the specular roll — plus an area fill from the opposite quarter, a cool rim and a warm kicker behind each shoulder (deliberately unmatched: equal edges read as a mistake, differing ones read as a room), a hair light, and a cyclorama whose halo is placed from the view vector every frame so the silhouette is always framed against the bright part of the wall. |
| Camera | [src/screens/StudioCamera.js](src/screens/StudioCamera.js) | Free inspection orbit — drag to spin, wheel to dolly, right-drag to pan — plus framing presets that glide and abandon themselves the moment the pointer touches the canvas. |
| The mode | [src/screens/CharacterScreen.js](src/screens/CharacterScreen.js) | Owns the switch: which scene the post stack draws, which camera, which grade block, and which update path runs. |
| Panel | [src/ui/CharacterScreenUI.js](src/ui/CharacterScreenUI.js) | Plain DOM. Holds no state: every value is re-read from the manager, so the gizmo and the number boxes can never disagree. |

![Skeleton overlay](docs/media/studio-skeleton.jpg)

Tuning a placement: pick a category, click an item to equip it, then set the
joint and nudge the offset. The `Move`/`Rotate` gizmo in the viewport writes the
same numbers the inspector's sliders do — drag the arrow and the slider follows,
type in the box and the piece moves. `Skeleton` draws the rig through the armour,
the joint marker shows where a piece is anchored, and `Motion` plays the walk and
run so gear can be judged while the body moves.

When it looks right, **Copy defaults** puts the placements on the clipboard as a
snippet to paste over `defaults` in the catalog. **Save** keeps a loadout in
localStorage and **Export** writes it as JSON.

### The catalog is the whole content layer

Adding a sword is one entry in
[src/equipment/EquipmentCatalog.js](src/equipment/EquipmentCatalog.js) and no code
anywhere else:

```js
{
  id: 'sword',
  name: 'Katana',
  category: 'weapons',
  url: './models/weapons/sword.glb',
  defaults: { bone: 'RightHand', position: [-0.051, 0.102, 0.052], rotation: [-168.3, 84, -0.8], scale: 1 }
}
```

`weapons` and `attachments` are kept apart on purpose. Weapons is the category
that will grow rules — drawing and sheathing, a hand it has to be in, damage;
attachments are cosmetic and never will. Splitting them now makes that later work
a change to one category rather than a filter over a flat list.

Two things happen to a model on the way in:

- **It loads lazily.** Nothing downloads until something asks for it — the boot
  path is untouched by a catalog of any size. The rest is prefetched in the
  background once the screen is actually open.
- **It wears the body's materials.** Every one of these exports embeds the same
  four 1024² maps the character's palette already carries; they came out of one
  Blender scene. So the material is resolved against
  [MaterialLibrary](src/loaders/MaterialLibrary.js) by name and the export's own
  is released — zero extra texture memory, and gear lit by exactly the same
  material the armour is.

### Mounts, and why offsets are in metres

[EquipmentManager](src/equipment/EquipmentManager.js) parents each piece to a
*mount* rather than straight to the joint, and the mount's scale is the inverse of
the joint's world scale. The rig is a Mixamo FBX — authored in centimetres, scaled
by `fbxScale` and again to reach `targetHeight` — so a joint's world scale is
about 0.01, and an object parented straight to it would arrive a hundred times
too small with offsets to match. The mount cancels exactly that: everything inside
it is in metres, whatever the rig was exported at, and the numbers stay valid when
`targetHeight` moves.

Straight to a bone still works, for code that wants no placement of its own:

```js
app.character.attach(sword, 'RightHand');
const head = app.character.getBone('Head');
```

Bones are indexed under both their raw and namespace-stripped names, so ask for
the plain joint. Anything parented to one rides the skeleton for free.

---

## The editor — `G`

![The editor](docs/media/editor.jpg)

Every tweakable number in the project lives in
[src/config/settings.js](src/config/settings.js), and
[src/ui/Editor.js](src/ui/Editor.js) is a lil-gui panel bound straight to it.

No controller has an `onChange` handler, because none is needed: the lights, the
floor shader, the leaves, the rig and the post stack all *sample* those fields
every frame, so a slider re-lights the scene on the next one with no rebuild and
no shader recompile. That holds while the clock is paused (`P`), which is when a
pose is actually worth lighting.

Systems may only ever sample these values — never copy one into a record at
construction time and read it back later. That single rule is what the whole
live-editing story rests on.

Presets are snapshots of the whole tree in localStorage, exportable and importable
as JSON, with a reset to the shipped defaults. Loading merges *into* the live
objects rather than replacing them, so bindings held by a shader or a light stay
valid.

The same fields are on `window`, so the console works too:

```js
settings.terrain.amplitude = 14;                // mountains, walked on the same frame
settings.terrain.ridge = 1;                     // sharp crests instead of rolling downs
settings.terrain.amplitude = 0;                 // back to a flat plane, for free
settings.leaves.drift.count = 900;              // a gale of leaves
settings.fire.intensity = 0;                    // put the katana out
settings.environment.sunIntensity = 4;          // re-lights on the next frame
settings.environment.floorTextureSet = 'stone'; // swap the soil for flagstone
settings.global.timeScale = 0.25;               // bullet time, everything at once
settings.camera.distance = 8;                   // the rig glides out
```

And the app itself:

```js
app.toggleCharacterScreen();                    // same as pressing Tab
app.enemies.respawnAll();                       // a fresh ring of them
await app.characterScreen.equipment.equip('scabbard');
app.characterScreen.equipment.setBone('scabbard', 'Spine');
console.log(app.characterScreen.equipment.snippet());  // paste over the catalog defaults
```

## Frame stats — `F`

<img src="docs/media/stats.png" width="240" alt="Frame stats">

Frame rate, average and peak frame time, draw calls and triangles, averaged over a
half-second window. The counters are sampled at the top of the *next* frame, where
a frame ends for certain, rather than at each of the several places one can end.

The numbers above are a full stage — terrain, litter, drift, mist, five enemies, a
burning katana and the whole post chain — in about 66 draw calls.

---

## How it fits together

`core/App.js` builds every subsystem and then does nothing but order the
per-frame updates. The wiring is deliberately one-directional: no subsystem
reaches back into App.

The order in `frame()` is the whole architecture, and every step is there because
something downstream reads what it wrote:

1. **Terrain** — any slider moved this frame lands here, before anything reads a height.
2. **Air, sky, moon** — one look, re-read together; the moon hangs itself on the light direction the sky has just resolved.
3. **Controller** — movement first: it sets the heading and the speed the blend animates to. It only ever touches XZ, which is why the body can be dropped onto the ground without the controller knowing the ground exists.
4. **Ground height + character** — the one place in the project that owns the body's height.
5. **Enemies → target rings → marks** — a body felled this frame loses its ring and its mark on the same frame.
6. **Equipment → weapon fire → shadows → judgement → blades** — each hangs off the final pose of the thing before it.
7. **Floor → ground fog → leaves** — the mist and the litter stand on the height-field bake the floor just refreshed.
8. **Camera** — on *real* time, so orbiting stays responsive while paused.
9. **Shadow map, grade, post.**

There are two modes and exactly one thing switches between them:
`characterScreen.active` decides which scene the post pipeline draws, which camera
it draws it through, which grade block is in force, and which of the two update
paths runs. Neither mode knows about the other.

### Layout

```
src/
  core/          renderer, clock, orbit rig, input, shared frame uniforms
  world/         terrain, floor, sky, moon, air, ground fog, leaves, lighting, the studio set
  animation/     character rig, retargeting, locomotion, jump, flight, attacks
  combat/        enemies, ragdoll, target marking
  vfx/           weapon fire, shadows, judgement, blade storm, markers, blood
  equipment/     catalog, lazy library, mount manager
  screens/       the character screen and its camera
  postprocessing/ bloom, tone map, grade
  ui/            action HUD, editor, stats, toasts, loading veil
  config/        settings.js — every number — and abilities.js — every move
  shaders/lib/   noise, terrain height field, black-body radiation
```

## Built with

[three](https://threejs.org) ^0.185 · [lil-gui](https://lil-gui.georgealways.com)
^0.21 · [vite](https://vite.dev) ^8.1 · no other runtime dependencies.

## Credits

- **Character model** — [dark_igorek](https://sketchfab.com/dark_igorek) on Sketchfab
- **Animations** — [Mixamo](https://mixamo.com)
- **Textures** — [ambientCG](https://ambientcg.com)
- **HDRI** — [Poly Haven](https://polyhaven.com)
