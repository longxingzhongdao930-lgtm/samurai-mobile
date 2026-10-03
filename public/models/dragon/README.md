# Silver Dragonkin (Mir4)

`silver-dragon.glb` was converted from the user-supplied
`silver-dragonkin-mir4.zip`: `source/Silver Dragonkin (Mir4).rar` contains
`Mon_BlackDragon31_Skeleton.FBX`. Diffuse and normal textures come from the ZIP's
`textures/` directory. Source authorship/license metadata was not supplied;
this asset is not covered by an inferred change to the repository's code license.

The GLB embeds two textured materials, a 58-bone rig, and all 37 animation clips.
No external texture requests or runtime FBX conversion are needed.

To regenerate, extract the FBX and `T_Mon_BlackDragon31{a,b}_{D,N}.png` into a
local source directory, then run Blender 4.3:

```sh
blender -b -t 2 --python-exit-code 1 --python scripts/convert-dragon.py -- /path/to/source public/models/dragon/silver-dragon.glb
```

Each action's timeline starts at zero. The supplied packed `_M` textures are not
used because their channel convention is undocumented. The original FBX and
textures remain unmodified outside the checkout.
