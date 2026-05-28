Minceraft v1.8

"Minceraft" v1.8 is a browser-based voxel sandbox game designed to capture the feel of classic Minecraft-style gameplay. It's a simple clone so don't expect anything too crazy, but I think it's pretty neat.

You can explore a procedurally generated world, gather resources, break and place terrain, manage inventory, craft items, and survive in a sandbox inspired by the "Golden Age" of Minecraft. The project includes core systems such as world generation, caves, multiple biomes, inventory and hotbar management, crafting, furnaces, storage blocks, tools, mobs, sound, and local save support. (Do note, saves are kinda buggy right now, any world could bug out and corrupt)

The goal of the project was to recreate the feel and simplicity of classic gameplay while running directly in the browser. It is meant as a fan-made recreation and technical project that pays tribute to the style, atmosphere, and mechanics of the older game versions.

This project is not official and is not affiliated with, endorsed by, or connected to Mojang or Microsoft. It is simply a fan recreation inspired by classic Minecraft.

**Play it here, or run it locally with a live server - https://ghoose007.github.io/minceraft/ **


## Stability patch added by ChatGPT

This build includes `js/core/fix-kit.js`, a standalone stability layer loaded from `index.html`.

Added fixes/features:

- Catches runtime JavaScript errors and unhandled promise rejections in an on-screen overlay.
- Adds a Copy Error Log button for faster debugging.
- Resets stuck keyboard/mouse/touch inputs when the window loses focus or the tab is hidden.
- Adds F8 performance/stability panel showing FPS, frame time, loaded chunks, renderer stats, entity counts, registry warnings, and caught errors.
- Validates block/item/recipe registries at startup and warns about missing IDs.
- Wraps `saveWorld()` so if a save fails midway, the previous slot records are restored when possible instead of leaving the slot wiped.
- Replaces world deletion with a full prefix cleanup so v5 dimension chunk/biome records are deleted too, not just old v4 chunk keys.


## ChatGPT Fix Patch v314

- Fixed a mobile-controls startup crash caused by `camBtn` being block-scoped inside `_buildMobileUI()` but referenced inside `_bindTouchEvents()`.
- Added defensive mobile button checks so a partially rebuilt mobile UI cannot crash the whole game during startup or browser reload.


## ChatGPT v315 Block Expansion Patch

Added 19 new block registry entries using currently-free 8-bit voxel IDs:

- Red Sand: ID 25, terrain.png index 195, gravity-enabled, shovel-optimal, sand sounds.
- Red Sandstone: ID 45, top index 196, side index 197, bottom index 198, pickaxe-class, stone sounds.
- Terracotta set: Green, Light Blue, Lime, Magenta, Orange, Pink, Purple, Red, Light Grey, base Terracotta, Black, Blue, Brown, Cyan, Grey, White, Yellow using terrain.png indices 199-215.

Red Sandstone is craftable with a 2x2 Red Sand recipe and returns 4 Red Sandstone blocks. The terracotta blocks are currently creative/inventory blocks only and are ready for later Mesa biome generation.


## ChatGPT v316 block-fix patch

This patch fixes the v315 mesa/terracotta block integration. The terrain atlas slots 195-215 are now populated with generated red sand, red sandstone, and terracotta textures so inventory icons, held models, dropped item models, particles, and placed world meshes have visible texture data. The desktop and mobile placement whitelists were also updated so the high-ID terracotta blocks can be placed like other registered blocks.

## ChatGPT v317 block integration repair

- Repaired the mesa/red sand/terracotta block integration path so the new blocks are treated as normal full cube blocks by the held-item and dropped-item model builders.
- Added an explicit `MESA_BLOCK_IDS` / `isMesaBlock()` registry helper for the new block family.
- Replaced the fragile high-ID placement whitelist with a safer registered-block check, so future high-ID blocks do not fail placement just because they were omitted from a hardcoded array.
- Kept existing special-use item exceptions for seeds, flint-and-steel, door item, and spawn eggs.
- Updated red sand support rules so cactus and sugarcane-style placement checks treat red sand like sand.
- Updated asset/script cache version to 317.

## ChatGPT v318 Badlands biome patch

- Added a new `badlands` overworld biome and registered it across the biome ID/name tables, mesh-worker biome tints, single-biome world menu, and biome tuning menu.
- Badlands now generate naturally as rare hot/dry regions near desert climate zones.
- Added Minecraft-style badlands surface generation using existing Red Sand, Red Sandstone, Terracotta, Orange Terracotta, Yellow Terracotta, Brown Terracotta, Red Terracotta, White Terracotta, and Light Grey Terracotta blocks.
- Added horizontal terracotta strata with seed/coherent vertical band shifting so exposed cliffs form colored mesa layers instead of plain stone.
- Added low red-sand caps with red sandstone beneath, terracotta mesa bodies, and eventual regular stone below the badlands formation.
- Added sparse badlands decoration behavior: no normal trees or grass, frequent dead bushes, rare cactus, and red-sand sugarcane support near water.
- Left `textures/terrain.png` untouched in this patch; the biome uses the existing block texture indices already wired into the block registry.
- Updated asset/script cache version to 318.

## ChatGPT v319 patch

- Added a real Dead Bush block at block ID 26 using terrain.png index 216.
- Dead Bush now uses cross-plane plant rendering in the world, sapling-style extruded held/dropped item meshes, sapling/grass sound category, and drops 1-3 sticks when broken.
- Badlands generation now places the new Dead Bush instead of the older fern/bush placeholder.
- Badlands terrain now has sharper hoodoo/spire-style vertical height spikes using deterministic ridge-noise terrain shaping.
- Left terrain.png untouched; index 216 is expected to be supplied by the project texture atlas.


## ChatGPT v322 Patch

- Continued from the v319 Badlands/Dead Bush build.
- Added natural Dead Bush spawning to regular Desert biome sand surfaces.
- Fixed Sugarcane held and dropped item rendering by routing block ID 52 through the same extruded material item mesh path used by saplings, flowers, and Dead Bush.
- Left `terrain.png` untouched.


## v323 Patch Notes
- Fixed Sugarcane held and dropped item routing by marking block ID 52 as a material-style item model in `BLOCK_DATA` and making `buildItemMesh()` honor per-item `itemModel` before falling back to cube rendering.
- Changed render distance from the old preset button to a 2-32 chunk slider in Video Settings.
- Removed the F key render-distance shortcut from gameplay and the controls menu.
- Updated cache version to 323.

## v324 Patch Notes
- Reworked the Video Settings render distance control to use the same Minecraft-style slider widget behavior as the existing Sound and Sensitivity sliders.
- Removed the oversized inline HTML range control that was stretching the Video Settings grid out of alignment.
- Render distance still supports 2-32 chunks and updates the current render distance live.
- Updated cache version to 324.

## v325 ChatGPT patch

- Replaced `textures/terrain.png` with the user-provided current atlas.
- Added `textures/terrain_mip_map.png` as a manual far-distance terrain atlas.
- Added manual chunk texture LOD: solid/glass terrain-atlas chunk meshes use the normal 16x16 tile atlas nearby and switch to the 8x8 tile mip atlas around 8 chunks away.
- Added small hysteresis around the mip switch boundary so chunks do not flicker between atlases while walking near the cutoff.
- Left block texture index mapping unchanged: both atlases use the same zero-based left-to-right, top-to-bottom 16x16 tile index layout.

## v326 ChatGPT patch

Adds a chunk loading optimization pass for high render distances:
- New Video Settings option: `Chunk Loading` with Smooth, Balanced, Fast, and Extreme modes.
- Frame-budgeted mesh dispatch so large dirty chunk backlogs do not spend too much main-thread time in one frame.
- Frame-budgeted worker-lighting handoff so generated chunks are lit gradually instead of causing long spikes.
- Backpressure-controlled worldgen dispatch based on dirty chunk, lighting, mesh, and worker queues.
- Nearby-first mesh prioritization with a small camera-direction bonus so chunks in front of the player appear first.
- Heavy-loading mode temporarily throttles non-critical simulation systems while large chunk queues are being processed.
- F3/debug overlay now shows chunk loading mode and lighting queue information.

Use `Chunk Loading: Smooth` for the steadiest FPS at 32 render distance, `Balanced` for normal use, `Fast` for quicker filling, and `Extreme` for the most aggressive loading.


## ChatGPT Patch v327 - Lighting Load Consistency
- Added a post-load/post-spawn lighting settle pass so saved worlds use the same local relight path as normal runtime chunk updates.
- Fixed smooth-lighting samples next to missing/unloaded chunks so they do not treat unloaded air as zero-light black air.
- This targets the issue where saved worlds looked darker after loading until a nearby block update forced a relight/remesh.


## v328 Lighting Load Repair

- Fixed a saved-world lighting issue where some chunks could keep stale/dark light values in the mesh worker after startup relighting.
- Global relight now invalidates mesh-worker chunk mirrors and marks correct world-coordinate dirty chunks, forcing remeshes with fresh lighting.
- Loaded save data now repairs generated flags from actual chunk data before lighting so saved chunks cannot be skipped by startup relight because of stale/missing generated flags.


## v329 Save/Lighting Integrity Patch

- Added atomic v6 save payload keys so chunk data is written before the main slot metadata is committed.
- Save cleanup now runs only after a successful commit, preventing interrupted saves from leaving partial chunk strips.
- Repaired stale generated flags before saving and after loading; a generated flag without chunk data now gets cleared so lazy generation can refill the chunk instead of rendering a void column.
- Strips saved light bits on load and recalculates lighting from the same runtime lighting path so loaded worlds do not depend on stale persisted lighting.
- Kept v5/v4 save compatibility.


## v332 Partial-Chunk Save/Load Fix

Fixed a critical bug where chunk-aligned holes (stone/lava/water visible where surface terrain should be) appeared in saved worlds after loading. Root cause: gameplay `setVoxel` calls (most often fluid spread from a generated chunk into an adjacent ungenerated one) silently allocated a partial chunk; the save-side sanitize then promoted that fragment to `generated=1` because it contained some non-zero blocks; on load, `_isChunkGenerated` reported true and lazy-gen never refilled it. The render shows whatever sparse blocks happened to land in the slot (typically water plus cobblestone/obsidian from water-lava reactions), surrounded by air.

Fixes:
- **A.** Fluid simulation (`updateWater`, `updateLava`, neighbor-conversion helpers) now checks `_isChunkGenerated` before any cross-chunk `setVoxel`, so fluids cannot spread into ungenerated terrain.
- **B.** Save/load sanitize is stricter: an overworld/nether chunk slot with data but no bedrock floor at y=0 is now treated as a partial fragment, nulled out, and its `generated` flag cleared so lazy-gen reproduces it correctly. Aether keeps its empty-void allowance.
- **C.** `setVoxel` only allocates a fresh chunk slot when called inside an explicit worldgen window (`_enterWorldGen` / `_exitWorldGen`). The three chunk-gen entry points (`generateChunkColumn`, `generateNetherChunkColumn`, `generateAetherChunkColumn`) open the window via try/finally so nested cross-chunk writes (tree leaves, etc.) still work, but gameplay callers writing to a null slot become silent no-ops.
- **D.** `notifyDimensionChange` now also clears `updateWaterQueue`, `updateLavaQueue`, `_fluidSchedule`, and `pendingBlockUpdates`. Voxel indices in these queues were packed with the previous dimension's WORLD_WIDTH; unpacking them in the new dimension produced wrong (wx, wz) coords and could spread fluids into uninitialized cells across dimensions.
- **E.** `decompressChunksIntoArray` validates that each RLE decodes to exactly `CHUNK_VOLUME` entries. Malformed records are dropped (chunk set to null) so sanitize/lazy-gen can recover instead of rendering a partial chunk; a console warning surfaces any underlying corruption.

Result: existing v6 saves with already-corrupted slots will self-heal on load (Fix B nulls the partial chunks and lazy-gen refills them with proper terrain), and no new partial chunks can form during play.


## v333 Worker-Side Gen-Window Shim (regression hotfix)

Fixed a regression introduced by v332 Fix C where chunks stopped loading at the render-distance edge during play (save-and-reload temporarily restored them, only for the same symptom to recur as the player walked further).

Root cause: Fix C wrapped `generateChunkColumn`, `generateNetherChunkColumn`, and `generateAetherChunkColumn` with `_enterWorldGen()` / `_exitWorldGen()` calls. Those helpers live in `js/world/voxel.js`. The worldgen workers (`worldgen-worker.js`, `nether-worker.js`, `aether-worker.js`) `importScripts` the gen sources but NOT `voxel.js` — each worker provides its own setVoxel/getVoxel shim against a single-chunk in-memory buffer. So in the worker context, the new `_enterWorldGen()` call threw `ReferenceError`, the worker caught it and posted `genError` for every dispatched chunk, and the main thread's lazy-gen loop kept retrying chunks that never landed. Init's load path didn't trip the bug because it runs inline gen on the main thread before the worker is spawned — which is exactly why save-and-reload restored chunks within the load radius and only chunks beyond it stayed empty.

Fix: each worker now defines no-op shims for `_enterWorldGen` / `_exitWorldGen` / `_isInWorldGen` before its `importScripts` block. The gen-window logic is irrelevant inside the worker (worker setVoxel only writes to the per-call `_workerChunk`; cross-chunk writes go to `_workerOverflow` to be replayed on the main thread), so the no-op is the correct behavior in that context.


## v334 Wooded Badlands + Sub-Biome Blend

Added the Wooded Badlands sub-feature and fixed sub-biome blending across badlands boundaries.

**Wooded Badlands.** Within badlands cells, a large-scale noise lobe (`_woodedBadlandsMask`, scale ~175 blocks) picks roughly the upper plateaus and replaces the red-sand + terracotta cap with a plains-style grass + dirt cap. Oak trees (with the existing big-oak generator) grow on those grass-capped columns at ~5× the density of the desert-floor cactus pattern, and sparse tall grass appears on the surface. The badlands biome tint is unchanged, so leaves and grass blocks render with the brown/orange badlands palette — matching the Minecraft wooded-badlands look.

**Sub-biome blending fix.** The badlands height bonus from hoodoo spires was previously applied inside a binary `if (biome === 'badlands')` check. The base heightmap blends smoothly across biome cells (12-block-radius box blur), but the spire bonus stepped from 0 to its full ~20–50 block contribution as the column crossed the biome cell boundary, creating visible vertical cliffs wherever a spire noise lobe happened to straddle the edge. v334:

1. `_computeChunkBiomeData` now also blurs a binary "is this raw biome badlands?" mask through the same box-blur, producing a per-column `badlandsWeight` Float32Array (1.0 deep inside badlands, fading to 0.0 over ~24 blocks at the boundary).
2. Phase 1 multiplies the spire bonus by this weight, so spires feather out into neighboring terrain instead of cliff-edging.
3. Phase 2 also extends the badlands surface (terracotta / red sand / wooded grass) into the buffer zone where `badlandsWeight > 0.5`, matching the smoothed height profile so the mesa rim doesn't rise as a grass-capped hill before its biome label changes.

Verified with `/home/claude/test_v334_badlands_blur.js`: at a synthetic plains/badlands boundary, the weight transitions 0 → 1 smoothly across z = −12 .. +12 with weight = 0.52 exactly at the boundary line.


## v335 Tall Grass + Badlands Sub-Biome Size Slider

Two features:

### Tall Grass (2-block-tall foliage)

A new foliage block modeled on Minecraft's 2-block tall grass. Single inventory item (id 219, `itemAtlasIdx: 218` so the held / dropped / inventory icon uses the leafier top texture via the same extruded-cross mesh saplings use). Placement writes id 219 at the target cell and id 220 (engine-only top half) directly above. Both halves render as X-pattern cross blocks and use the grass-tint path — the greyscale atlas texture (217 bottom, 218 top) takes the smoothed biome tint at the world position so it reads correctly in plains, swamp, jungle, wooded badlands, etc.

Breaking either half removes both (door-style partner clear) and rolls the seed drop exactly once (15% chance, item 128). The bottom owns the seed roll; when the player breaks the top, the code explicitly fires the missed roll before clearing the partner so either-half breaks are equivalent. Support-loss cascading through `doBlockUpdate` works without changes because the partner is removed before the cascade fires. Verified in `/home/claude/test_v335_tallgrass_drops.js`: all four removal paths yield exactly one 15% seed chance.

Worldgen places the 2-block version as a sub-selection of the existing 1-block tall grass spawns in the biomes Minecraft uses for it: plains, forest, rainforest, taiga, swamp, jungle, and wooded badlands. About 25% of those placements become 2-block where there's headroom (y+2 air and within world bounds); the rest stay 1-block, so density and look stay close to the prior overworld while gaining MC's mix.

### Badlands Sub-Biome Size slider

A new world-customization slider, shown only in the Badlands biome section: **Sub-Biome Size**, range 25%–300%, default 100%. Stored as `GEN_BIOME_OVERRIDES.badlands.subBiomeSize` (rides the existing settings channel to the worldgen worker). A single helper `_badlandsSubScale()` reads the value and returns a multiplier applied to every badlands sub-feature noise scale:

- `_badlandsSpireHeightBonus` — scales 145, 44, 23, 17 (broad mesa mask, two ridge noises, jag noise)
- `_woodedBadlandsMask` — scale 175 (wooded patch mask)
- `_isBadlandsRedSandCap` — scale 52 (red-sand vs terracotta cap)
- `_badlandsLayerOffset` — scale 64 (terracotta stratum offset)

Lower values produce tighter spires and smaller wooded/red-sand patches; higher values produce sprawling features that span entire mesas. All four sub-features scale together so the badlands stays internally coherent at any setting.


## v336 Hotfix — Badlands Spire Ocean-Leak

Field-reported regression introduced by v334. Spires from the badlands biome were appearing as tall stone walls in adjacent ocean cells. Root cause:

v334's smooth `badlandsWeight` (12-block box blur of a binary "is this cell badlands?" mask) extends from 1.0 at the cell center down to 0.0 across about 24 blocks at the cell boundary. The spire bonus was multiplied by this weight and applied **before** `shoreDampen` was computed, so ocean cells within the blur radius (weight ~0.2–0.5) were receiving 10–25 blocks of spire bonus on top of their seafloor base height — pushing stone columns 6–15 blocks above sea level with no badlands surface treatment (since `useBadlandsSurface` only triggers at weight > 0.5).

Fix: compute `shoreDampen` first, then gate the spire bonus through `_smoothstep(0.5, 1.0, shoreDampen)` so the contribution is zero in any ocean cell (shoreDampen < 0.5) and ramps to full only once well inland. Same blend curve as `_woodedBadlandsMask` uses for its noise threshold, keeps the spire continuous along the actual badlands-shore transition without the deep-water intrusion.

Verified in `/home/claude/test_v336_spire_ocean_leak.js`: worst-case deep-ocean (shoreDampen = 0) intrusion drops from +6.5 blocks to 0 across a synthetic transect.


## v337 Hotfix — Tall-Grass Foliage Spawn ReferenceError

Field-reported regression introduced in v335. Console showed:

```
ReferenceError: seededRandom is not defined
    at _placeFoliageGrass (overworld.js:132:66)
    at _generateNormalChunk (overworld.js:1601:48)
    at generateChunkColumn (overworld.js:181:9)
```

Affected every chunk where the foliage pass tried to spawn tall grass in plains / forest / rainforest / taiga / swamp / jungle / wooded-badlands columns. The chunk threw, the worker returned an empty payload, and the column dropped straight to the void with no terrain visible — explaining the "empty chunks all the way down" screenshots and the inability to place blocks where chunks were nominally located.

Root cause: `seededRandom` is **not** a global. It's a closure-local inside `_generateNormalChunk` (`const seededRandom = _chunkSeededRandom(cx, cz)`), giving each chunk a deterministic RNG keyed off its (cx, cz). My v335 `_placeFoliageGrass` helper lives at module top-level so it can't reach into that closure — the call fell through to the global scope where the symbol doesn't exist.

Fix: pass the chunk's RNG in as a parameter. The helper now takes `chunkRng` as its fourth argument; all 6 call sites in `_generateNormalChunk` pass `seededRandom`. Other v334–v336 module-level helpers (`_badlandsSubScale`, `_woodedBadlandsMask`, `_isWoodedBadlandsColumn`) only reach for actual globals (`GEN_BIOME_OVERRIDES`, `_wgPerlinMountains`, `GEN_SEA_LEVEL`) and are unaffected.

Pre-existing v336 chunks that failed gen aren't recoverable from disk — they were saved as empty. A fresh world from this build should generate cleanly through the foliage pass.


## v338 Hotfix — Tall-Grass Halves Aligned

Field-reported: the top half (atlas 218) of placed tall grass was visibly offset from the bottom half (atlas 217) — they jittered and rotated independently and read as two disconnected plants rather than one continuous 2-block plant.

Root cause: cross-block rendering hashes `(x, y, z)` per cell to pick the in-cell offset and rotation, so each `y` gets its own jitter. For id 220 (top half) at `y+1`, the hash differs from id 219 (bottom half) at `y`. Fix in `render/chunk-mesh.js`: when rendering id 220, use `y - 1` as the hash Y so the top half samples the same random seed as its bottom partner. Single-block crosses (16, 23, 24, 26, etc.) are unaffected — they continue to hash by their own `y`.


## v339 — Grass Rename, Tall Grass in Creative, ID Collision Resolved

Three changes shipped together because they all touched the same code surface.

### 1. Renamed id 16 from "Tall Grass" to "Grass"

Modern Minecraft naming: the 1-block plant is "Grass" (formerly called "Tall Grass" / "Short Grass" in older versions), the 2-block plant is "Tall Grass". This iteration of the codebase now matches that — id 16 is "Grass", id 219 is "Tall Grass". No gameplay behavior changes; the seed-drop logic, biome spawning, and rendering paths key off block IDs, not names.

### 2. Hard ID collision at 219/220 resolved

Discovered while preparing to add Tall Grass to the creative inventory: id 219 was simultaneously `BLOCK_DATA[219]` (Tall Grass bottom) AND `TOOL_DATA[219]` (Emerald Helmet). `createIconElement` checks TOOL_DATA's `maxDurability` branch before falling through to blocks, so the inventory icon for Tall Grass would have rendered as Emerald Helmet. Same problem at 220 (Emerald Chestplate). The world-block rendering paths use `BLOCK_DATA` directly so the placed plant looked correct — the collision was latent until inventory display was attempted.

Resolution: Emerald armor moved from TOOL_DATA[219-222] to TOOL_DATA[256-259]. Armor items live only in inventory data structures (never as voxels), so the 8-bit voxel-ID limit doesn't apply — the JSON save format stores them as plain integers and >255 ids work fine. Updated consumers:

- `config/tools.js` — entries moved
- `config/recipes.js` — emerald armor recipe outputs updated
- `ui/inventory.js` — creative "Emerald Armor" row IDs updated
- `ui/inventory-doll.js` — armor-tier categorizer updated
- `ui/crafting.js` — aether-disabled gate now covers `(214-218) | (256-259)`

(Players carrying Emerald armor in an existing save would find it became Tall Grass on load — but the user is on fresh worlds, so no migration path was needed.)

### 3. Both grasses get 3D extruded held/dropped models

The user reported id 16 was falling through to `buildBlockItemMesh` (the cube path), so held grass looked like a tiny green cube instead of a leaf sprite. Added id 16 to the `buildMaterialMesh` route in `render/item-mesh.js` so it gets the same extruded-cross treatment saplings already had. Tall Grass (id 219) was already in the route from v335. Both items now bake a fixed plains-green tint (the world rendering relies on biome grass-tint, which can't be sampled without a world position).

Tall Grass is now in the creative "Natural" row right after Grass, with its inventory icon using atlas 218 (leafier top — driven by the new `getIconStyle` check for `block.itemAtlasIdx`).


## v340 — Tall Grass Placement Bug + Particle Tint Fix

Two field-reported issues, both rooted in the same architectural quirk: `js/core/input.js` exists in the repo and was being edited as if it were live, but `index.html` only includes `js/core/init.js` — the input.js variant has been **dead code** since at least v335. Every tall-grass placement edit I made to input.js (the dedicated branch, the intersect-exception list update) never executed.

### Issue 1: only the bottom half placed

The init.js placement handler had no tall-grass branch, so currentBuildBlock=219 fell through to the generic placement at the end of the handler — which writes a single `setVoxel(px, py, pz, 219)` and stops, leaving the top half (220) unwritten and the cell at py+1 air.

Fix: ported the v335 tall-grass placement branch to init.js (places 219 at py and 220 at py+1, single inventory decrement, plays the grass place sound, queues mesh updates for both cells). Also added 219 to init.js's intersect-exception list so the plant can be placed at the player's feet like other 1-block cross plants. The same branch was added to `mobile/touch-controls.js` so mobile placement also writes both halves.

### Issue 2: break particles are greyscale

`render/particles.js`'s `getParticleGeometry` keeps a hardcoded list of grass-tinted block IDs at line 50: `[14, 16, 22, 24, 43, 66, 67, 97]`. Existing Grass (id 16) was in the list, so its particles got the plains-green default tint. Tall Grass (219, 220) wasn't — so particles used a pTint of [1,1,1] (no tint) over the greyscale atlas tile, hence the white/grey particle look. Added 219 and 220 to the list. World-rendered tall grass is biome-tinted via `getSmoothedBiomeTint`, but the particle path has no world position context (it's keyed only by blockId), so we use the same plains-green fallback we use for held/dropped items.


## v341 — Ice Spikes Biome + Dead-Code Cleanup

Two changes. The cleanup is small; the biome is the main feature.

### Cleanup: deleted `js/core/input.js`

Confirmed in v340 that `js/core/input.js` was a dead file — `index.html` never loaded it, every tall-grass edit I made there for v335 was inert, and the placement handler init.js was running silently. Removed the file entirely. The historical-context comment in `init.js` (`"index.html only loads init.js; the input.js variant exists but isn't included..."`) is now a lie about the past but still useful as a tombstone — kept it.

### Ice Spikes biome

Modeled after Minecraft's Ice Spikes biome (originally "Ice Plains Spikes"). Rare cold-climate variant of tundra featuring vertical packed-ice pillars and flat ice patches on a snow floor.

**Classification.** Within the tundra climate range (`temp < -0.25 && humid < 0`), a deterministic cell-hash roll (`> 0.78`) flips the cell to ice_spikes. About 22% of tundra cells convert, so they're findable along snowy frontiers without being everywhere. Same `_cellHash` mechanism the badlands uses, so whole Voronoi cells flip cleanly rather than speckling along borders. Terrain parameters: `bH = SEA_LEVEL + 12` (lower than tundra's +18 to give the spikes more vertical room to read against the skybox), `bV = 6` (very flat — the visual interest comes from the spikes, not from rolling heightmap).

**Surface.** Snow block (id 39) over dirt (id 2) over stone — identical to tundra. Snow layer (id 40) placed in the Phase 7 foliage pass. Phase 2.5 + Phase 8.5 both extended to freeze surface water in ice_spikes the same way they already did for tundra/taiga.

**Spike generation — Phase 3.6 (new).** Runs after caves and ravines, before ores. Per-column in ice_spikes cells:
- **1.2% chance** to attempt a spike (~3 per chunk on average)
- Of those, **80% short** (8–15 blocks tall, base radius 2, linear taper to point) and **20% tall** (25–50 blocks, base radius 1, holds 1-wide for 85% of height then pinches to a single-block tip — the "spear" form described in the wiki)
- Both variants anchor 1 block into the snow surface so they don't read as floating
- All packed ice (id 138)
- Chunk-boundary margin equal to the spike's base radius — entire footprint must fit within the chunk so the worker doesn't have to write into neighbor cells

**Ice patches.** Per-column **1.8% chance** for a 5×5 disk of packed ice with corners trimmed (matches MC's "Ice Patch" wiki feature exactly). Each tile finds its own local surface y and only replaces snow or dirt — won't clobber a just-placed spike.

**No trees.** `treeChance = 0` in ice_spikes (MC allows rare spruce on exposed dirt, but our biome doesn't expose dirt naturally, so the visual difference is nil).

**UI.** Added to `BIOME_TUNE_LIST` so the four standard sliders (height, variation, tree density, foliage density) work on it. `getBiomeDisplayName` now title-cases underscore-separated biome names, so F3 shows "Ice Spikes" instead of "Ice_spikes" (also fixes "Extreme Hills" and "Alpha Forest" which had the same bug).

**Colors.** Pale frosty grass tint `[144, 188, 178]` (slightly cooler/bluer than tundra). Foliage tint `[120, 165, 145]`. Water tint deep frozen blue `[50, 71, 165]`. Visible mostly on the rare grass block exposed at biome borders — the spike body is opaque packed-ice, no tint.


## v342 ChatGPT Patch

- Added **Ice Spikes** to the Single Biome world type selector.
- Confirmed **Ice Spikes** is present in the Advanced World Customizer Biomes tab/tuning list.
- Updated asset cache version to `342`.

## v343 ChatGPT Patch

- Improved Ice Spikes biome spike generation so packed-ice spikes use randomized height, width, taper, lean, elliptical footprint, chipped edges, and embedded base roots.
- Kept the existing Ice Spikes biome registration/menu/customizer support from v342.
- Updated asset cache version to `343`.


## v344 ChatGPT Patch - Skyblock Prototype

- Added **Skyblock** as a new world type/preset in the Create World menu.
- Skyblock generates a void overworld with a small classic L-shaped dirt island.
- Island has a top grass layer and lower dirt layers.
- Added one naturally generated oak tree on the starter island.
- Added one starter chest on the island with:
  - 1 Water Bucket
  - 1 Lava Bucket
  - 1 Oak Sapling
  - 1 Cactus
  - 1 Sugarcane
  - 1 Seeds
  - 3 Dirt
  - 1 Sand
  - 1 Gravel


## v345 ChatGPT Patch - Skyblock Prototype Refinement

- Skyblock starter tree now uses the same small natural oak tree shape as normal overworld oak trees.
- Moved the starter oak tree to the corner of the island.
- Skyblock now locks World Size to **1024 × 1024** automatically.
- The World Size option is greyed out while Skyblock is selected.
- Advanced World Customization is greyed out/disabled while Skyblock is selected because the preset is fixed for this prototype.


## v346 ChatGPT Patch - Skyblock Spawn Fix

- Moved the Skyblock player spawn to an open grass block away from the oak leaves.
- Skyblock now uses an exact ground spawn height instead of the normal terrain `spawnY + 2` air-spawn offset.
- Stored Skyblock respawn height now matches the corrected ground spawn.


## v347 ChatGPT Patch - Skyblock Tree and Safe Spawn

- Reworked the Skyblock oak into a shorter basic small-oak shape:
  - 4-block trunk
  - two wide lower leaf layers
  - small upper cap
- Kept the tree in the island corner, but reduced its canopy height/size so it does not cover the spawn area.
- Replaced hardcoded Skyblock spawn coordinates with a safe-spawn search.
- Skyblock now always chooses an actual free grass block on the starter island with two air blocks above it.


## v348 ChatGPT Patch - Skyblock Oak and Herobrine

- Removed the custom Skyblock tree canopy generator.
- Skyblock now grows the corner oak through the existing runtime `growTree()` sapling tree generator used by normal oak saplings.
- The safe spawn search now runs after the real oak is grown, so it avoids leaf-covered blocks.
- Disabled Herobrine in Skyblock worlds and removes any existing Herobrine entity if the preset is active.


## v349 ChatGPT Patch - Minecraft-Accurate Lava/Water Conversion

- Unified live fluid interaction and worldgen fluid pre-simulation lava/water conversion rules.
- Water touching lava source now converts the lava source to obsidian.
- Water touching flowing lava now converts the flowing lava to cobblestone.
- Flowing lava entering a water source now creates stone.
- Flowing lava meeting flowing water now creates cobblestone.
- Updated cache version to `349`.


## v350 ChatGPT Patch - Skyblock Save/Load Preservation

- Fixed Skyblock saves being wiped/reset on reload.
- The save/load chunk sanitizer now recognizes Skyblock as a no-bedrock void world.
- Non-empty Skyblock chunks are now preserved exactly instead of being deleted as “partial invalid overworld chunks.”
- The saved world type is now made available before chunk-repair runs, so loaded Skyblock chunks are handled correctly.
