# Assets

`manifest.json` is the asset list. Each asset lives in `assets/<group>/<id>/` (groups: `buildings`, `aircraft`) and holds the MagicaVoxel source (`.vox`), the OBJ mesh, its MTL, the 256 by 1 palette PNG, and a preview GIF.

To add an asset: copy its folder under the matching category, then add an entry to `manifest.json` with the same fields as the existing entries.
