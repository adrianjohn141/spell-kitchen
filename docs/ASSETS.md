# Asset manifest

All bundled assets are CC0. Only the files below ship with the app. Textures and the HDRI are at most 1k; no audio is included.

| Name | Source URL | Author | License | Local path |
| --- | --- | --- | --- | --- |
| Stone Tiles 02 (Diffuse, 1k) | https://polyhaven.com/a/stone_tiles_02 | Charlotte Baglioni | CC0 | `public/assets/polyhaven/stone_tiles_02/stone_tiles_02_diff_1k.jpg` |
| Stone Tiles 02 (nor_gl, 1k) | https://polyhaven.com/a/stone_tiles_02 | Charlotte Baglioni | CC0 | `public/assets/polyhaven/stone_tiles_02/stone_tiles_02_nor_gl_1k.jpg` |
| Stone Tiles 02 (Rough, 1k) | https://polyhaven.com/a/stone_tiles_02 | Charlotte Baglioni | CC0 | `public/assets/polyhaven/stone_tiles_02/stone_tiles_02_rough_1k.jpg` |
| Brick Wall 001 (Diffuse, 1k) | https://polyhaven.com/a/brick_wall_001 | Rob Tuytel, Dimitrios Savva | CC0 | `public/assets/polyhaven/brick_wall_001/brick_wall_001_diffuse_1k.jpg` |
| Brick Wall 001 (nor_gl, 1k) | https://polyhaven.com/a/brick_wall_001 | Rob Tuytel, Dimitrios Savva | CC0 | `public/assets/polyhaven/brick_wall_001/brick_wall_001_nor_gl_1k.jpg` |
| Brick Wall 001 (Rough, 1k) | https://polyhaven.com/a/brick_wall_001 | Rob Tuytel, Dimitrios Savva | CC0 | `public/assets/polyhaven/brick_wall_001/brick_wall_001_rough_1k.jpg` |
| Wood Planks (Diffuse, 1k) | https://polyhaven.com/a/wood_planks | Amal Kumar | CC0 | `public/assets/polyhaven/wood_planks/wood_planks_diff_1k.jpg` |
| Wood Planks (nor_gl, 1k) | https://polyhaven.com/a/wood_planks | Amal Kumar | CC0 | `public/assets/polyhaven/wood_planks/wood_planks_nor_gl_1k.jpg` |
| Wood Planks (Rough, 1k) | https://polyhaven.com/a/wood_planks | Amal Kumar | CC0 | `public/assets/polyhaven/wood_planks/wood_planks_rough_1k.jpg` |
| Studio Small 09 (hdri, 1k) | https://polyhaven.com/a/studio_small_09 | Sergej Majboroda | CC0 | `public/assets/polyhaven/studio_small_09/studio_small_09_1k.hdr` |
| Mini Dungeon 2.0: column.glb | https://kenney.nl/assets/mini-dungeon | Kenney | CC0 | `public/assets/kenney/mini-dungeon/column.glb` |
| Mini Dungeon 2.0: chest.glb | https://kenney.nl/assets/mini-dungeon | Kenney | CC0 | `public/assets/kenney/mini-dungeon/chest.glb` |
| Mini Dungeon 2.0: pot.glb | https://kenney.nl/assets/mini-dungeon | Kenney | CC0 | `public/assets/kenney/mini-dungeon/pot.glb` |
| Mini Dungeon 2.0: potion.glb | https://kenney.nl/assets/mini-dungeon | Kenney | CC0 | `public/assets/kenney/mini-dungeon/potion.glb` |
| Mini Dungeon 2.0: banner.glb | https://kenney.nl/assets/mini-dungeon | Kenney | CC0 | `public/assets/kenney/mini-dungeon/banner.glb` |
| Mini Dungeon 2.0: Textures/colormap.png | https://kenney.nl/assets/mini-dungeon | Kenney | CC0 | `public/assets/kenney/mini-dungeon/Textures/colormap.png` |

Poly Haven: [CC0 asset license](https://polyhaven.com/license). The public API supplied authors and 1k download URLs; downloaded files were checked against its MD5 hashes.

Kenney: [Mini Dungeon source and CC0 license](https://kenney.nl/assets/mini-dungeon). The official 2.0 ZIP was inspected for executables/scripts before extracting only five GLB files and their shared PNG atlas. No archive is bundled. Models remain unmodified; chest animations are not played.

Column, chest and pot visuals fit the existing pillar, crate and cauldron bounds. Pot receives a procedural rectangular stone plinth matching its rectangular collider. Enemies keep the existing primitive silhouettes because this kit has no fitting models for the five enemy types. Shelves, the chest base and fallback crates use the wood PBR maps; Kenney models retain their original atlas.
