# Silver dragon motions

One of the five default enemies is now the silver dragon. It starts in front of
the player, runs when distant, walks into attack range, cycles through four
attacks with occasional skill motions, and returns to idle between attacks. The usual player controls and
summoned attacks can target it. Four successful hits defeat it; nonlethal hits
play a reaction, while the last hit interrupts any action with the death clip.
The final death pose stays for the configured corpse time before removal.

Motion switches blend over 0.2 seconds (short reactions use a shorter fade).
Horizontal root travel is removed from cloned clips so controller movement is
not doubled and looping locomotion does not snap the dragon back. The dragon
uses its own skeleton, not the human ragdoll or slicing implementation.

| State | Clip | Behavior |
| --- | --- | --- |
| Idle | `Btl_Std01` | Loop |
| Walk | `Btl_Walk01` | Loop |
| Run | `Btl_Run01` | Loop |
| Attack | `Btl_Atk01`–`04` | One shot, then idle |
| Hit | `Dmg_Hit01`–`02` | Interrupt attack, then idle |
| Death | `Dmg_Die01` | Interrupt everything, hold final pose |
| Explicit skill | `Btl_Skl01`–`08` | One shot, then idle |

All 37 source clips are retained in the GLB. Unidentified introductions,
cinematics, alternate deaths and stuns are not randomly played during combat.
Skill clips can be inspected with `app.enemies.enemies.find(e => e.isDragon &&
e.alive).playSkill(0)` (indexes 0–7). Skills are animation playback only; no new
breath effects, hitboxes or player health system are implemented. The existing
game has no player-damage system, so dragon attacks currently animate without
reducing player health.

Tune `settings.creatures.dragon` in `src/config/settings.js`, or use **G → Combat → Enemies →
Silver dragon** in the editor. Health changes apply at the next spawn.

Validation:

```sh
node --test tests/*.test.js
npm run build
```

Browser checks also need WebGL2. On the cloud machine Chromium can use software
WebGL; this verifies animation behavior, not mobile-device performance.
