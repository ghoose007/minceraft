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


## v351 Patch - Beta 1.7.3 Preset, Font Consistency, Small-World Save Fix

- Added a new **Beta 1.7.3** world type preset.
- Beta 1.7.3 preset disables hunger, XP, and Aether automatically.
- Beta 1.7.3 preset locks Advanced World Customization.
- Beta 1.7.3 worldgen is restricted to the old pre-Adventure biome set:
  Desert, Rainforest, Tundra, Taiga, Plains, Forest, Swamp, Seasonal Forest,
  Savanna, and Shrubland.
- Added Seasonal Forest, Savanna, and Shrubland biome IDs/names.
- Strengthened UI font CSS so dynamic inventory counts, settings values, HUD text,
  and modal text keep the pixel-style font instead of falling back to browser defaults.
- Fixed save/load storage expansion so 256x256 and 512x512 mobile worlds preserve
  their saved size instead of being enlarged on reload.


## v352 Patch - Beta 1.7.3 Biome/Terrain Tuning

- Added Seasonal Forest, Savanna, and Shrubland into regular/default biome selection.
- Beta 1.7.3 mode now keeps Ocean as a classified biome, but disables modern river generation.
- Beta 1.7.3 mode disables ravine generation.
- Beta 1.7.3 mode now applies older rolling-terrain tuning:
  - reduced modern macro-mountain influence
  - smoother/older terrain scale
  - per-biome height/variation shaping
- Tuned Beta 1.7.3 old-biome tree density:
  - Rainforest = dense trees, higher big-tree chance
  - Forest = dense trees
  - Seasonal Forest = medium forest density
  - Savanna = very sparse trees
  - Shrubland = sparse trees
  - Plains/Tundra = very sparse trees
- Tuned Beta 1.7.3 foliage/clutter rules:
  - Bush is used as the Beta fern equivalent
  - Dead Bush is used as the Beta shrub equivalent
  - Rainforest gets heavy grass/fern cover
  - Shrubland gets Bush + Dead Bush + grass
  - Savanna gets light dry-open grass/fern clutter


## v353 Patch - Updated Texture Atlases

- Replaced `textures/terrain.png` with the updated uploaded atlas.
- Replaced `textures/terrain_mip_map.png` with the updated uploaded mipmap atlas.
- Updated cache version to `353`.


## v354 Patch - Beta F3 River Fix, Biome Names, Font Lock

- Fixed F3 showing `River` in Beta 1.7.3 worlds.
- `isInRiverZone()` now returns false in Beta 1.7.3 mode.
- F3 biome display now uses explicit display names, including:
  - Seasonal Forest
  - Savanna
  - Shrubland
  - Rain Forest in Beta 1.7.3 mode
  - Swampland in Beta 1.7.3 mode
- Verified the new biomes feed through the same blurred height/variation terrain maps as the other biomes so their terrain blends instead of hard-cutting.
- Strengthened pixel-font enforcement:
  - added Silkscreen font import
  - forced pixel-font stack globally
  - patched dynamic menu/UI font enforcement after text updates
  - patched inline JS font-family fallbacks
- Updated cache version to `354`.


## v355 Patch - Bitmap Font Repair

- Removed the Silkscreen/browser-font patch from v354.
- Restored the UI to use the existing `textures/minecraft_font.png` bitmap font system.
- Improved `js/render/mc-font.js` so dynamic `textContent`/`innerText` updates on buttons, item counts, menu labels, HUD/debug labels, and headings are immediately re-rendered as bitmap canvases.
- Changed menu dynamic text updates to call the bitmap font renderer directly when available.
- Expanded the bitmap text observer so updated UI text does not remain as normal browser-rendered text.
- Updated cache version to `355`.


## v356 Patch - Beta 1.7.3 Terrain Blending Fix

- Fixed Beta 1.7.3 biome terrain cutoffs.
- Root cause: v352 blended base biome height/variation, but then applied Beta per-biome terrain modifiers from the hard biome ID in `overworld.js`.
- Moved Beta terrain modifier values into `_computeChunkBiomeData()` and blurred them alongside height/variation:
  - `betaElevScale`
  - `betaVolScale`
  - `betaMountainScale`
  - `betaSwampClamp`
- `overworld.js` now reads these blended modifier maps instead of branching on hard biome names for Beta terrain.
- Seasonal Forest, Savanna, Shrubland, Swamp, Plains, Forest, Rain Forest, Taiga, Tundra, Desert, and Ocean now blend their Beta terrain modifiers across borders.
- Updated cache version to `356`.


## v357 Patch - Beta Biome Tint, Savanna Terrain, Hand UV Fix

- Added explicit grass/foliage/water tint entries for:
  - Seasonal Forest
  - Savanna
  - Shrubland
- Updated the mesh worker's biome color tables to match the main-thread tables so worker-built chunks tint correctly.
- Raised old Beta Savanna terrain variation so it is still open/dry, but not unnaturally flat.
- Fixed first-person hand texture sampling:
  - uses exact `handtexture.png` pixel-space UV rectangles
  - uses nearest filtering
  - disables mipmaps for the hand texture
- Updated cache version to `357`.


## v358 Patch - Shrubland Density, Swamp Dips, Hand UV Nudge

- Reduced Beta Shrubland foliage clutter heavily:
  - far less grass/tallgrass
  - fewer Bush/fern placements
  - sparse Dead Bush/shrub placements remain
- Reduced Shrubland tree density.
- Narrowed Shrubland climate selection so it appears as smaller/less dominant dry transition regions.
- Made Beta Swampland more swamp-like:
  - more frequent low wet pockets
  - more terrain dips below sea level
  - less perfectly flat flooded surface
- Adjusted first-person hand UVs with half-texel sampling and clamp-to-edge texture settings to remove the subtle side-face half-pixel seam/offset.
- Updated cache version to `358`.


## v359 Patch - Beta Plains/Forest Terrain and Smaller Shrubland

- Made Shrubland much rarer/smaller by narrowing its climate eligibility:
  - Beta mode Shrubland now only appears in a thin mild/dry transition band.
  - Default-world Shrubland range was narrowed too.
- Reduced Shrubland tree density further.
- Tuned Beta 1.7.3 Forest terrain:
  - stronger elevation/volatility/mountain scale
  - occasional old-Beta cliff/overhang-style shelves in forest hills
- Tuned Beta 1.7.3 Plains terrain:
  - mostly open, but now can generate rolling hilly sections
- Updated cache version to `359`.


## v360 Patch - Beta 1.7.3 Global Terrain Generator

- Added a Beta 1.7.3 mode-specific global terrain pass in `overworld.js`.
- Removed the v359 biome-owned Forest cliff / Plains hill terrain logic.
- Beta terrain now behaves closer to old Minecraft:
  - global rolling height swings
  - global broad hill/mountain masses
  - global ridge/cliff bands
  - global overhang/shelf density bonus
  - terrain weirdness can occur under any Beta biome instead of belonging to Forest or Plains
- Biomes in Beta mode now mainly control:
  - surface blocks
  - color/tint
  - trees
  - grass/foliage/dead bush/cactus/snow decorations
- Mild biome terrain damping remains only for cases like Ocean/Swampland/Desert so they still read correctly.
- Updated cache version to `360`.


## v361 Patch - Remove Shrubland and Match Forest Terrain Damping

- Removed Shrubland from active biome generation.
- Removed Shrubland from Single Biome selection.
- Removed Shrubland from Advanced Biome Tuning selection.
- Removed Shrubland tint/color table entries.
- Cleaned Shrubland-specific tree/foliage generation code paths.
- Preserved a compatibility alias so old `shrubland` biome IDs resolve to Forest instead of breaking old saves.
- Changed Beta 1.7.3 Forest terrain damping values to the previous Shrubland values:
  - `elev: 0.82`
  - `vol: 0.72`
  - `mountain: 0.18`
  - `clampSwamp: 0.00`
- Updated cache version to `361`.


## v362 Patch - Rain Forest Terrain Damping and Pixel-Accurate Hand Geometry

- Reduced Beta 1.7.3 Rain Forest terrain damping values by 15%:
  - `elev: 1.05 -> 0.8925`
  - `vol: 1.05 -> 0.8925`
  - `mountain: 0.36 -> 0.306`
- Fixed first-person hand stretch by matching mesh geometry to the actual `handtexture.png` unwrap:
  - texture regions use a 4px x 4px x 8px arm layout
  - arm mesh now uses the same 1:1:2 face-size ratio
  - removed half-texel UV squeezing so the full pixel regions map directly
  - kept nearest filtering, clamp-to-edge, and no mipmaps
- Updated cache version to `362`.


## v363 Patch - First-Person Hand Texture Wrap Fix

- Reverted the v362 first-person hand mesh size change.
- Restored the original arm mesh geometry:
  - `0.6 x 0.6 x 1.8`
- Changed the hand texture to wrap/repeat on the mesh instead of resizing the mesh to the texture:
  - `RepeatWrapping` on S/T
  - long side faces repeat the source hand texture region 3x along the arm length
  - end caps remain single-mapped
- Kept nearest filtering and no mipmaps.
- Updated cache version to `363`.


## v364 Patch - Segmented First-Person Hand UV Fix

- Fixed the first-person hand UV issue shown in the screenshot.
- Reverted atlas-wide RepeatWrapping because it sampled black/empty parts of `handtexture.png`.
- Kept the original first-person arm mesh size.
- Rebuilt the hand mesh with segmented long faces:
  - each long side face is split into 3 sections
  - each section maps only to the correct brown arm sub-rectangle
  - no side face can sample the black/empty atlas area
- Kept nearest filtering, clamp-to-edge, and no mipmaps.
- Updated cache version to `364`.


## v365 Patch - First-Person Hand Face Winding Fix

- Fixed reversed/inside-out faces on the segmented first-person hand mesh.
- +X and -X side faces were already correctly wound.
- Flipped the winding order for:
  - +Y top face segments
  - -Y bottom face segments
  - +Z front cap
  - -Z back cap
- Kept the segmented UV fix from v364 so no face samples the black/empty texture area.
- Updated cache version to `365`.


## v366 Patch - Rolling Ocean Floor Terrain

- Changed Beta 1.7.3 ocean floor terrain so it is no longer overly flat.
- Ocean terrain now keeps roughly the same average underwater depth while adding:
  - broad rolling underwater hills
  - shallow valleys
  - mild seabed ridges
- Ocean floor is clamped safely below sea level so underwater terrain stays underwater.
- Updated cache version to `366`.


## v367 Patch - Shift-Click Inventory and Custom Cursor

- Added `textures/cursor.png` from the uploaded cursor texture.
- Added a CSS cursor using `textures/cursor.png` with hotspot `16 16`, so the square center hole is the actual click point.
- Added Minecraft-style Shift-click transfer behavior:
  - inventory hotbar <-> main inventory
  - armor quick-equip from inventory when possible
  - crafting input slots back to inventory
  - crafting output quick-crafts into inventory until ingredients or space run out
  - chest slots -> player inventory
  - player inventory -> open chest
  - basic enchantment inventory hotbar/main quick transfer
- Updated cache version to `367`.


## v368 Patch - Dropped Item Merge Delay and Ground-Only Merge

- Added a short merge delay before dropped stacks can combine.
- Dropped stacks now only merge when both matching stacks are resting on solid ground.
- Matching items no longer merge while flying/falling through the air.
- Saved and restored dropped-item merge metadata:
  - `age`
  - `pickupDelay`
  - `onGroundForMerge`
- Updated cache version to `368`.


## v369 Patch - Right-Click Drag Distribution and No-Flicker Item Counts

- Added Minecraft-style right-click drag distribution:
  - hold an item stack with the cursor
  - hold right-click
  - drag across inventory/crafting/chest slots
  - one item is placed into each valid slot
  - each slot is visited once per drag pass
- Applies to:
  - player inventory
  - hotbar inventory UI
  - survival/table crafting input grids
  - chest slots
  - player inventory while chest is open
- Fixed item-count bitmap font flicker:
  - `minecraft_font.png` count canvases are reused instead of destroyed/recreated
  - text setter reconversion now happens synchronously for bitmap UI text
  - reduces visible flashing when moving items or refreshing the inventory
- Updated cache version to `369`.


## v370 Patch - Right-Click Drag Distribution Continuity Fix

- Fixed right-click drag distribution stopping after only a couple slots.
- Root cause: v369 re-rendered inventory/chest DOM after every single-item placement, interrupting browser mouseenter events mid-drag.
- Right-drag now:
  - updates inventory/chest/crafting data immediately
  - keeps the current slot DOM alive during the drag
  - refreshes the UI once on right mouseup
- Chest right-drag also avoids full re-render until drag release.
- Updated cache version to `370`.


## v371 Patch - Live Slot Updates During Right-Click Drag

- Fixed right-click drag distribution visually leaving slots empty until mouseup.
- Right-drag still avoids full inventory/chest re-render during drag, but now updates only the affected slot element in place.
- Placed items/counts appear immediately while dragging across slots.
- Full UI refresh still happens once on mouseup for consistency.
- Updated cache version to `371`.


## v372 Patch - First-Person Tool and Held Block Positioning

- Applied the user's custom first-person held tool position:
  - `mesh.position.set(-0.5 + 1.13 / 16, -0.5 + -3.5 / 16, 0.35);`
- Applied matching generated/flat item positioning where the same handheld transform is used.
- Changed held block display to better resemble Minecraft:
  - moved blocks closer to the camera
  - lowered them into the lower-right first-person view area
  - added diagonal pitch/roll instead of a straight camera-aligned look
  - slightly increased held block scale
- Updated cache version to `372`.


## v373 Patch - First-Person Held Block Upright Rotation

- Removed the extra sideways pitch/roll from first-person held blocks.
- Held blocks now stay upright/flat and only rotate around the vertical Y axis:
  - `mesh.rotation.set(0, 45 * Math.PI / 180, 0);`
- Kept the v372 closer-to-camera block position and larger scale.
- Kept the user's custom held tool position.
- Updated cache version to `373`.


## v374 Patch - First-Person Held Block Raised and Yaw 45

- Moved first-person held blocks upward slightly.
- Kept blocks flat/upright.
- Kept held block rotation at 45 degrees around the vertical up/down Y axis:
  - `mesh.rotation.set(0, 45 * Math.PI / 180, 0);`
- Kept the closer-to-camera held block depth.
- Kept the user's custom tool position.
- Updated cache version to `374`.


## v375 Patch - User Item Mesh Position Values

- Replaced `js/render/item-mesh.js` with the user-uploaded version.
- Preserved the user's edited first-person positioning values for tools, extruded items, and held blocks.
- Updated cache version to `375`.


## v376 Patch - Superflat Plains Biome Persistence Fix

- Fixed superflat save/load biome tint drift.
- Saves now write the authoritative `GEN_WORLD_TYPE` value instead of relying only on `worldOptions.worldtype`.
- Loading a superflat overworld now force-repairs the overworld biome map to all `plains` and clears biome tint/mesh strip caches.
- Main-thread and mesh-worker biome tint smoothing now bypasses biome-map mixing in superflat overworlds and returns plains tint directly.
- Mesh worker now receives `GEN_WORLD_TYPE`, so worker-built chunk meshes also respect the superflat plains-only tint rule.
- Preserved the user's uploaded `item-mesh.js` values from v375.
- Updated cache version to `376`.


## v377 Patch - Ambient Music System

- Added all uploaded `0_` through `18_` MP3 files to the root `music/` folder.
- Added `js/core/music.js`, a world-only ambient music manager.
- Music now starts inside a world, with browser autoplay fallback that retries after the click-to-play user gesture.
- Music stops and resets when returning to the title/menu via save-and-quit/main menu paths.
- Tracks play from shuffled 0–18 playlists.
- The next playlist is generated while the final song of the current playlist is playing.
- The first track of the next playlist cannot be the same as the final track of the previous playlist.
- Tracks fade in over 10 seconds and fade out over the final 10 seconds.
- Added small random gaps between tracks so playback is ambient/periodic rather than stacked.
- Preserved the user's uploaded `item-mesh.js` values and the v376 superflat plains biome fix.
- Updated cache version to `377`.


## v378 Patch - Reduced Positional Sound Range

- Reduced the shared world-positioned sound cutoff from 32 blocks to 16 blocks.
- Changed spatial audio falloff to fade out more aggressively.
- This affects general positional sounds, including mob sounds, block sounds, footsteps, fluids, etc.
- Ambient music is unaffected because it is non-positional.
- Preserved the v377 ambient music system.
- Updated cache version to `378`.


## v379 Patch - Music Base Volume and Sound Slider

- Lowered the ambient music base volume to `0.30`.
- Music volume now follows the existing global Sound slider:
  - final music volume = `MUSIC_BASE_VOLUME * settingSoundVolume`
- Moving the Sound slider now updates currently playing music volume live.
- Music fade-in and fade-out still use the same slider-scaled target volume.
- Preserved the v378 reduced positional sound range and v377 ambient music system.
- Updated cache version to `379`.


## v380 Patch - Long Ambient Music Silence

- Changed ambient music track gaps to a random 2–8 minute silence between songs.
- Music still uses shuffled 0–18 playlists and prevents final-track to next-first-track repeats.
- Music still fades in for 10 seconds and fades out for 10 seconds.
- Music still follows the Sound slider through the v379 volume system.
- Updated cache version to `380`.


## v381 Patch - Mob Held Item Position Defaults

- Updated skeleton bow held position to:
  - `bowMesh.position.set(-0.2, 0, -4/16);`
- Updated zombie pigman gold sword held position to:
  - `swordMesh.position.set(-0.20, 0, 0);`
- Preserved the v380 ambient music silence gap, v379 music volume slider support, and v378 positional sound range reduction.
- Updated cache version to `381`.


## v382 Patch - Minecraft-Style Directional Knockback

- Added a shared directional knockback system for mobs and the player.
- Mob knockback now uses horizontal push away from the attacker plus a modest vertical hop.
- Removed/replaced old hostile mob damage knockback that launched mobs mostly straight upward.
- Knockback is now stored separately from AI movement velocity so mob pathfinding/steering cannot instantly overwrite it.
- Player knockback is now separate from normal movement velocity so input acceleration cannot instantly cancel it.
- Zombie and zombie pigman melee attacks now call the shared player knockback helper.
- Skeleton arrows now apply directional player knockback on hit.
- Mobs hit by player attacks/arrows now use the shared mob knockback helper.
- Preserved the v381 mob held item position defaults and all recent music/sound changes.
- Updated cache version to `382`.


## v383 Patch - Player-Facing Knockback Direction Fix

- Fixed melee mob knockback direction.
- Player melee hits now pass the player's facing direction into mob knockback:
  - `kbDirX = -Math.sin(player.yaw)`
  - `kbDirZ = -Math.cos(player.yaw)`
- Mob knockback can now use an explicit push direction instead of only source/player position.
- Increased horizontal melee knockback strength slightly and reduced vertical hop slightly.
- Player-fired arrows now pass arrow travel direction into mob knockback.
- Preserved the v382 separate knockback impulse system, v381 mob held-item values, and all recent music/sound changes.
- Updated cache version to `383`.


## v384 Patch - Hostile Mob Knockback Priority Fix

- Fixed hostile mobs not visibly moving horizontally when hit.
- Added a short knockback-priority timer to the shared mob physics.
- While that timer is active, mob AI/pathfinding velocity cannot cancel the combat knockback impulse.
- Increased melee knockback impulse for clearer Minecraft-style horizontal movement.
- Reduced the vertical hop slightly so knockback reads more as horizontal displacement instead of bouncing.
- Preserved the v383 player-facing knockback direction system and all recent music/sound changes.
- Updated cache version to `384`.


## v385 Patch - Redesigned Mob Knockback Around Actual Mob Physics

- Re-inspected the mob code path and found the real issue:
  - `pig.js` overwrites `Mob.prototype._applyPhysics` after `mob-core.js` loads.
  - Previous knockback patches changed `mob-core.js`, but hostile mobs were actually using the later `pig.js` shared physics method.
  - That method only moved mobs by `this.vx/this.vz`, so the new knockback velocity was ignored.
- Rebuilt knockback around the actual active shared mob physics method in `js/mobs/pig.js`.
- Combat knockback now has its own physical velocity:
  - `knockbackX`
  - `knockbackZ`
  - `_knockbackTimer`
- During the short knockback timer, AI/pathfinding velocity is ignored and the mob is moved by knockback velocity.
- Knockback now decays through friction inside the real mob physics method.
- Hit collisions zero the blocked knockback axis instead of silently preserving stale movement.
- Increased horizontal push and lowered vertical hop so hostile mobs visibly move horizontally instead of just hopping.
- Preserved player-facing melee knockback direction and arrow-direction knockback.
- Updated cache version to `385`.


## v386 Patch - Knockback Tuning

- Tuned mob melee knockback after v385 testing.
- Reduced horizontal knockback strength:
  - `8.5` → `7.0`
- Increased vertical knockback:
  - `1.7` → `2.2`
- Slightly shortened the knockback-only timer:
  - `0.32s` → `0.28s`
- Preserved the redesigned v385 knockback system that hooks into the actual shared mob physics method.
- Updated cache version to `386`.


## v387 Patch - Tallgrass Foliage Tint and Taiga Terrain Tuning

- Changed tallgrass tinting so these blocks now use the foliage tint path:
  - `16` Tall Grass
  - `219` 2-block Tall Grass bottom
  - `220` 2-block Tall Grass top
- Tallgrass now uses `getSmoothedFoliageTint(x, z)` instead of `getSmoothedBiomeTint(x, z)`.
- Updated Beta 1.7.3 Taiga terrain scaler:
  - `elev: 1.20`
  - `vol: 0.85`
  - `mountain: 0.45`
  - `clampSwamp: 0.00`
- Preserved the v386 knockback tuning and recent music/sound changes.
- Updated cache version to `387`.


## v388 Patch - Revert Tallgrass Tint Change

- Reverted the v387 tallgrass foliage-tint change.
- Tallgrass IDs now use the grass-tint path again:
  - `16`
  - `219`
  - `220`
- Leaves and vines still use foliage tint:
  - `14`
  - `97`
  - `66`
- Kept the v387 Beta 1.7.3 Taiga terrain tuning:
  - `elev: 1.20`
  - `vol: 0.85`
  - `mountain: 0.45`
  - `clampSwamp: 0.00`
- Updated cache version to `388`.


## v389 Patch - Beta Ocean/Land Terrain Blending

- Fixed Beta 1.7.3 ocean-to-land terrain cutoffs.
- Added a Beta-only smoothed ocean blend map in `js/worldgen/biomes.js`.
- `js/worldgen/overworld.js` now uses that smoothed `betaOceanBlend` terrain weight so ocean floor height ramps into land height instead of switching abruptly at the ocean biome label.
- Kept the ocean biome classification itself unchanged; this only affects terrain height/volatility blending.
- Preserved v388 tallgrass tint revert, v387 Taiga terrain tuning, v386 knockback tuning, and recent music/sound changes.
- Updated cache version to `389`.


## v390 Patch - Slab Ambient Occlusion

- Fixed half slabs not receiving the same smooth-lighting ambient occlusion path as full cube blocks.
- Slabs still use `slabHeights` for half-block geometry, but `pushFace()` no longer treats those heights like recessed farmland lighting.
- Farmland keeps its old recessed-top lighting behavior.
- Applies to both main-thread and worker chunk meshing because the worker imports the shared `faces.js`.
- Preserved v389 Beta ocean/land blending, v388 tallgrass tint revert, v387 Taiga tuning, and recent knockback/music/sound changes.
- Updated cache version to `390`.


## v391 Patch - Stair Ambient Occlusion

- Fixed stair blocks being lit with one flat value per face.
- Stair direct-quad rendering now samples per-vertex smooth lighting and ambient occlusion through `getVertexLighting()`.
- Added AO-aware quad splitting for stair faces to reduce diagonal lighting seams.
- Keeps internal stair step faces working while allowing external stair faces to receive block-style AO.
- Preserved v390 slab AO, v389 Beta ocean/land blending, and recent knockback/music/sound changes.
- Updated cache version to `391`.


## v392 Patch - Directional Shading and AO Consistency

- Audited the block lighting path across:
  - normal cube faces in `faces.js`
  - slab/farmland/special-height faces through `pushFace()`
  - custom stair quads in `chunk-mesh.js`
  - manually emitted door/trapdoor/fence/piston-style quads
  - Fabulous shader lighting injection
- Centralized Minecraft-style face brightness:
  - top: `1.0`
  - bottom: `0.5`
  - north/south `Z` faces: `0.8`
  - east/west `X` faces: `0.6`
- Fixed inconsistent manual renderers that had X/Z side brightness reversed.
- Kept +X/-X and +Z/-Z matched so both directions on the same axis shade identically.
- Prevented the Fabulous shader from adding a second normal-vs-sun directional multiplier on top of baked block face shading.
- Preserved v391 stair AO, v390 slab AO, v389 Beta ocean/land blending, and recent knockback/music/sound changes.
- Updated cache version to `392`.


## v393 Patch - Minecraft-Style Text Chat

- Added a per-session Minecraft-style chat overlay.
- Press `T` while in-world to open chat.
- Opening chat releases pointer lock and blocks movement/mouse look while typing.
- Chat input uses a black bottom bar and a blinking `_` caret.
- Typed text is rendered from `textures/minecraft_font.png` using the existing bitmap font renderer.
- Press `Enter` to send a message in this format:
  - `<Steve> Hello world!`
- Press `Esc` to close chat without sending.
- Sent chat remains visible for about 20 seconds, then hides.
- Reopening chat shows history.
- Chat display shows up to 10 messages at once.
- Mouse wheel, arrow keys, and Page Up/Page Down scroll the per-session chat history while chat is open.
- Chat history is wiped whenever a world is initialized, saved/quit, or the page reloads.
- Preserved v392 directional shading/AO fixes and recent gameplay/rendering changes.
- Updated cache version to `393`.


## v394 Patch - Chat Pause Suppression and Chat Box Layout

- Fixed pressing `T` to open chat also opening the pause menu.
- Chat now suppresses the pointer-lock pause transition when it intentionally releases pointer lock for typing.
- Moved the chat box higher above the hotbar.
- Changed chat from full-screen width to a Minecraft-style lower-left chat box width.
- Long messages now wrap inside the chat box instead of stretching across the screen.
- The black input bar now matches the narrower chat width.
- Preserved v393 chat behavior, v392 directional shading/AO fixes, and recent gameplay/rendering changes.
- Updated cache version to `394`.


## v395 Patch - Chat Timer and Connected Background

- Fixed reopened old chat history restarting the 20-second on-screen timer.
- Only newly sent messages refresh the temporary visible timer now.
- Opening chat still shows the full scrollable history while the chat input is open.
- Closing chat after only viewing old messages no longer leaves those old messages stuck on-screen for 20 seconds.
- Widened the chat box:
  - `520px` → `640px`
- Changed the chat history from separate black bars per message to one connected translucent black chat background with rows inside it, closer to Minecraft's chat.
- Long messages still wrap inside the chat box.
- Preserved v394 chat pause fix, v392 directional shading/AO fixes, and recent gameplay/rendering changes.
- Updated cache version to `395`.


## v396 Patch - Chat FPS Render Loop Fix

- Investigated the FPS hit after sending chat messages.
- Root cause: the chat history was being rebuilt every animation frame during the 20-second post-send visibility window.
- Typing did not lag because typing only redrew the input canvas when characters changed.
- Added dirty/cached chat-history rendering:
  - history rows rebuild only when messages, visibility, or scroll state changes
  - the 20-second timeout now hides chat with a timer instead of per-frame DOM/canvas rebuilds
- Preserved chat wrapping, connected background, pause suppression, and all recent rendering/AO fixes.
- Updated cache version to `396`.


## v397 Patch - F3 Debug Redesign and F8 Removal

- Removed the F8 debug menu/keybind.
- Removed the F3+P / F3+= gamemode-changing debug shortcut.
- Redesigned the F3 debug overlay into a simple Minecraft-style top-left panel.
- The F3 panel now renders with `textures/minecraft_font.png` through the bitmap font renderer.
- The new F3 panel shows:
  - FPS
  - XYZ coordinates
  - block coordinates
  - current chunk
  - coordinates inside the current chunk
  - facing direction
  - current biome
  - current dimension
- Preserved v396 chat FPS fix, v395 chat layout/timer fixes, v392 directional shading/AO fixes, and recent gameplay/rendering changes.
- Updated cache version to `397`.


## v398 Patch - Extreme Hills One-Block Tallgrass

- Added sparse regular one-block tall grass generation to the Extreme Hills biome.
- Extreme Hills uses block ID `16` only.
- It does not call `_placeFoliageGrass()` in Extreme Hills, so it cannot generate the two-block tallgrass pair `219/220`.
- Preserved v397 F3 debug redesign/F8 removal, v396 chat FPS fix, v392 directional shading/AO fixes, and recent gameplay/rendering changes.
- Updated cache version to `398`.


## v399 Patch - World-Size Scaled Biome Maps

- Added world-size-based biome map scaling so smaller worlds sample the biome map more densely.
- The largest desktop world keeps the original biome scale.
- Smaller world sizes now use an effective biome scale multiplier:
  - 5120x5120: 100%
  - 3072x3072: 82%
  - 1024x1024: 48%
  - 864x864: 42%
  - 512x512 mobile: 36%
  - 256x256 mobile: 30%
- `GEN_BIOME_SCALE` remains the base UI/save value.
- New `GEN_EFFECTIVE_BIOME_SCALE` controls actual biome sampling for the selected world size.
- Worker worldgen receives the same effective scale, so lazy-generated chunks match spawn chunks.
- Saved worlds store the effective biome scale so later lazy generation remains consistent after loading.
- Preserved v398 Extreme Hills one-block tallgrass, v397 F3 debug redesign/F8 removal, v396 chat FPS fix, and recent rendering/AO changes.
- Updated cache version to `399`.


## v400 Patch - Chat Commands and Error Overlay Removal

- Removed the intrusive bottom-right Fix Kit runtime error overlay.
- Added in-game slash commands through the Minecraft-style chat:
  - `/gamemode Survival`
  - `/gamemode Creative`
  - `/time set Day`
  - `/time set Night`
  - `/time set 0000-2400`
  - `/give ID amount`
  - `/help`
- `/give` defaults to amount `1` when no amount is specified.
- Commands produce system messages in chat instead of sending as `<Steve>`.
- Added command-only autocomplete:
  - suggestions appear only when the input starts with `/`
  - pulsing completion text is rendered with `textures/minecraft_font.png`
  - `Tab` accepts the current suggestion
- Preserved v399 scaled biome maps, v398 Extreme Hills one-block tallgrass, v397 F3 redesign, v396 chat FPS fix, and recent rendering/AO changes.
- Updated cache version to `400`.


## v401 Patch - Static Grey Command Autocomplete

- Removed pulsing animation from command autocomplete text.
- Autocomplete suggestions now render as static grey Minecraft-font text.
- Tab autocomplete behavior is unchanged.
- Preserved v400 chat commands/error overlay removal and recent worldgen/rendering fixes.
- Updated cache version to `401`.


## v402 Patch - Gamemode HUD Layout and Chat History Recall

- Fixed HUD bars not fully refreshing after `/gamemode` changes.
- Added a forced survival-HUD refresh path used by chat commands.
- XP bar now hides in Creative and when XP is disabled.
- When XP is disabled, health and hunger move down directly above the hotbar instead of leaving the XP gap.
- When hunger is disabled, the armor bar uses the hunger-row position above the hotbar.
- Armor bar hides outside Survival mode.
- Pressing Up Arrow while chat is open now recalls the last sent chat message or command into the input field.
- Pressing Down Arrow cycles forward through recalled chat history and clears when past the newest entry.
- Preserved v401 static grey autocomplete, v400 commands/error overlay removal, v399 biome scale fix, and recent rendering/AO changes.
- Updated cache version to `402`.


## v403 Patch - Slash Key Opens Command Chat

- Pressing `/` while in-world now opens chat immediately.
- The chat input starts with `/` already typed, ready for commands.
- `T` still opens normal empty chat.
- Preserved v402 HUD layout/chat history recall, v401 static grey autocomplete, v400 chat commands, and recent worldgen/rendering fixes.
- Updated cache version to `403`.


## v404 Patch - Armor Layout and Bush/Fern Item Tint Fix

- Fixed armor bar placement when hunger is disabled.
- When hunger is disabled, armor now uses the empty right-side hunger-row slot instead of overlapping the health bar.
- When hunger is enabled, armor still uses the row above the health/food bars.
- Fixed held/dropped Bush item tint.
- Bush, the in-game fern equivalent, now uses the same default green tint path as other foliage/tallgrass held and dropped item meshes.
- Preserved v403 slash-to-command-chat, v402 HUD/chat history fixes, v401 static grey autocomplete, v400 commands, and recent worldgen/rendering fixes.
- Updated cache version to `404`.


## v405 Patch - Tooltip Cleanup on Inventory Close

- Added a shared `window.hideItemTooltip()` helper.
- Closing inventory-style UIs now clears and hides any item tooltip that was visible.
- Applied cleanup to:
  - creative inventory
  - survival inventory
  - crafting table
  - furnace
  - chest
  - enchanting table when present
- Also hides the tooltip when dragging/cursor-item updates occur.
- Preserved v404 armor layout/Bush tint fixes, v403 slash-command chat, and recent worldgen/rendering fixes.
- Updated cache version to `405`.


## v406 Patch - Beta Swamp Volatility and Mushrooms

- Replaced `textures/terrain.png` and `textures/terrain_mip_map.png` with the new uploaded default atlases.
- Lowered only Beta 1.7.3 swamp terrain volatility scaling from `0.55` to `0.10`.
- Added two new centered X-pattern plant blocks:
  - `221` Brown Mushroom using terrain atlas index `219`
  - `222` Red Mushroom using terrain atlas index `220`
- Mushrooms render centered with no random plant offset.
- Mushrooms spawn naturally in swamp biomes.
- Mushrooms also spawn sparsely on cave floors after cave carving.
- Added mushroom support to transparent/cross-block LUTs and held/dropped item mesh routing.
- Preserved v405 tooltip cleanup, v404 armor/Bush tint fixes, v403 slash-command chat, and recent worldgen/rendering fixes.
- Updated cache version to `406`.


## v407 Patch - Mushroom Item Mesh and Shading Fix

- Confirmed Brown Mushroom `221` and Red Mushroom `222` use the extruded 3D material mesh path.
- Dropped mushroom items are now treated as material/extruded items, not block/cube items.
- Mushroom held/dropped item materials now skip the directional lighting shader so one side does not render dark.
- Mushroom item normals are flattened to keep extruded sides evenly lit.
- Mushroom world X-pattern rendering keeps centered plant sizing and avoids dark-side shading.
- Preserved v406 Beta swamp/mushroom worldgen, v405 tooltip cleanup, and recent command/HUD fixes.
- Updated cache version to `407`.


## v408 Patch - Mushroom Plant Positioning and Inventory Icon Fix

- Brown Mushroom `221` and Red Mushroom `222` now use the same X-pattern positioning/rotation jitter path as other plant objects.
- Removed the special no-offset centered render exception from mushroom world rendering.
- Mushroom held/dropped items still use the extruded 3D material mesh path.
- Mushroom inventory icons now use the raw terrain atlas tile like normal plant icons.
- Mushroom inventory icons do not receive the green plant tint/filter.
- Preserved v407 mushroom item shading fix, v406 mushroom worldgen/Beta swamp volatility, and recent command/HUD fixes.
- Updated cache version to `408`.


## v409 Patch - Correct Mushroom Held Positioning Scope

- Reverted the mistaken v408 world-render positioning change.
- Brown Mushroom `221` and Red Mushroom `222` are centered X-pattern blocks in the world again.
- Held/dropped mushrooms explicitly use the same `buildMaterialMesh()` position/rotation/scale path as other plant/material items.
- Mushroom held/dropped items remain extruded 3D item meshes.
- Mushroom inventory icons still use the raw terrain atlas tile with no green tint/filter.
- Preserved v407 mushroom shading fix, v406 mushroom worldgen/Beta swamp volatility, and recent command/HUD fixes.
- Updated cache version to `409`.


## v410 Patch - Mushroom Raw Tint Fix and Held Y Position

- Fixed Brown Mushroom `221` and Red Mushroom `222` held/dropped pink tint issue.
- Mushroom item meshes now use a dedicated raw-atlas `MeshBasicMaterial`.
- Mushroom item material disables vertex color tinting and skips lighting shader injection.
- Added small mushroom-only UV padding to prevent neighboring atlas pixels from bleeding into the extruded item mesh.
- Updated material/plant held mesh position to:
  `mesh.position.set(1.13 / 16, 0.90, 0.35);`
- Mushroom held/dropped items remain extruded 3D material meshes.
- Preserved v409 corrected mushroom world centering/raw inventory icons and recent worldgen/HUD/chat fixes.
- Updated cache version to `410`.


## v411 Patch - Emerald Armor Third-Person Texture Fix

- Fixed third-person emerald armor rendering as iron armor.
- Updated the third-person armor tier mapping from the old emerald armor IDs `219-222` to the current emerald armor IDs `256-259`.
- Emerald armor now resolves to `emerald_0.png` / `emerald_1.png` instead of falling through to the iron fallback.
- Scanned and patched any remaining stale emerald armor ID range checks.
- Preserved v410 mushroom tint/held-Y fix, v406 mushroom worldgen/Beta swamp volatility, and recent HUD/chat fixes.
- Updated cache version to `411`.


## v412 Patch - Armor Bar Layout with Emerald Bonus Hearts

- Armor bar now shifts upward to clear extra emerald bonus heart rows.
- This upward shift only applies when hunger is enabled.
- If hunger is disabled, armor keeps using the empty right-side hunger-row slot and does not move up.
- HUD layout now includes max-health/bonus-heart rows in its cache signature.
- Equipping/removing emerald armor now forces survival HUD layout refresh immediately.
- Preserved v411 emerald third-person texture fix, v410 mushroom tint/held-Y fix, and recent HUD/chat fixes.
- Updated cache version to `412`.


## v413 Patch - Loaded Armor HUD Refresh

- Fixed loaded worlds not showing the armor bar until inventory opened or the player took damage.
- After `buildUI()` during world load/startup, the game now recalculates armor bonus health and forces survival HUD layout refresh.
- Armor pips now render immediately from restored `armorSlots`.
- `_recalcArmorHealthBonus()` now supports a forced HUD refresh, so non-emerald armor also updates after loading even when max health does not change.
- Preserved v412 emerald bonus-heart armor-bar layout, v411 emerald third-person armor texture fix, and v410 mushroom fixes.
- Updated cache version to `413`.


## v414 Patch - Halved Global Biome Map Scale

- Cut the global effective biome scale in half for every world-size bucket.
- New biome scale factors:
  - `5120x5120`: `1.00 → 0.50`
  - `3072x3072`: `0.82 → 0.41`
  - `1024x1024`: `0.48 → 0.24`
  - `864x864`: `0.42 → 0.21`
  - `512x512`: `0.36 → 0.18`
  - `256x256`: `0.30 → 0.15`
- Lowered the minimum effective biome scale clamp from `72` to `36` so the smallest worlds are actually cut in half too.
- Preserved v413 loaded armor HUD refresh, v412 emerald bonus-heart armor-bar layout, v411 emerald armor texture fix, and v410 mushroom fixes.
- Updated cache version to `414`.


## v415 Patch - Rainforest Cliff Terrain Tuning

- Tuned Rainforest terrain in both regular world generation and Beta 1.7.3 Rain Forest.
- Reduced Rainforest base terrain variation from `35` to `22` in both regular and Beta biome maps.
- Changed Beta Rain Forest terrain scale from `vol: 0.8925, mountain: 0.306` to `vol: 0.52, mountain: 0.44`.
- Added Rainforest-specific cliff/terrace shaping:
  - broad cliff ridge masks
  - rough flatter terrace stepping
  - less loose 3D volatility
  - reduced anomaly strength that previously caused floating terrain blobs
- Reduced Beta shelf/overhang density contribution inside Rain Forest so it keeps cliff ledges without creating floating chunks.
- Added cliff-wall density reinforcement below/near the surface to make faces feel more solid and vertical.
- Preserved v414 halved biome scale, v413 loaded armor HUD refresh, v412 emerald bonus-heart armor-bar layout, and v410 mushroom fixes.
- Updated cache version to `415`.


## v416 Patch - F3 Seed Display and Beta Rain Forest Blending Fix

- Added world seed to the F3 debug overlay using the existing `minecraft_font.png` bitmap font path.
- Added a blurred `rainforestWeight` biome mask to the biome-data blend pipeline.
- Rainforest/Rain Forest cliff and terrace shaping now fades by `rainforestWeight` instead of hard-switching on the raw biome label.
- Fixed Beta 1.7.3 Rain Forest terrain shaping not blending cleanly into neighboring Beta biomes.
- Blended Rain Forest anomaly and Beta shelf/overhang strength at biome edges to prevent abrupt borders.
- Preserved v415 Rainforest cliff tuning, v414 biome scale changes, v413 armor HUD load refresh, and v410 mushroom fixes.
- Updated cache version to `416`.


## v417 Patch - Mob Swimming and Undead Drowning

- Tuned mob water movement so swimming mobs bob upward slower and no longer glide on the water surface as aggressively.
- Zombies and skeletons can no longer swim upward in water.
- Zombies and skeletons now sink with water drag instead of receiving the normal mob swim lift.
- Added hostile-undead breath tracking:
  - 20 seconds of air while the head is underwater.
  - After air runs out, drowning damage ticks every 0.5 seconds.
  - Damage continues until the mob dies or leaves water.
- Drowning uses the existing mob damage/death path and is treated like environmental damage.
- Kept the base mob-core physics in sync defensively, although pig.js remains the active shared mob physics override.
- Preserved v416 F3 seed/Beta Rain Forest blending, v415 Rainforest cliff tuning, and recent armor/mushroom fixes.
- Updated cache version to `417`.


## v418 Patch - Mob Water Drag and Moving Swim Bob

- Fixed mobs not being meaningfully slowed by water.
- Water now applies drag to the final mob physics movement after AI/pathfinding velocity is calculated.
- Swimming mobs now move at about `42%` of normal horizontal speed in water.
- Non-swimming undead mobs move at about `28%` of normal horizontal speed in water.
- Added moving swim bobbing:
  - pigs, creepers, and other swimming mobs now bob up/down while moving in water
  - bobbing is slower and less surface-glide-like than before
  - upward velocity cap lowered to reduce sliding across the water surface
- Extra water drag is applied to AI velocity and knockback while submerged.
- Preserved v417 zombie/skeleton drowning, v416 F3 seed/Beta Rain Forest blending, and recent armor/mushroom fixes.
- Updated cache version to `418`.


## v419 Patch - Sugarcane X-Pattern Face Shading and Skeleton Double-Sided Mesh

- Fixed Sugarcane `52` X-pattern plant face shading.
- Sugarcane now skips directional face shading on crossed plant quads, matching the mushroom face-lighting fix.
- Added a second-path note so cross plants, including Sugarcane, stay protected from directional face darkening.
- Enabled double-sided material rendering for skeleton meshes only.
- Other mob materials are unchanged.
- Preserved v418 mob water drag/swim bobbing, v417 zombie/skeleton drowning, v416 F3 seed/Beta Rain Forest blending, and recent armor/mushroom fixes.
- Updated cache version to `419`.


## v420 Patch - True Double-Sided Sugarcane Cross Faces

- Fixed Sugarcane `52` dark/back-side crossed-face rendering using the cleaner approach:
  - kept world chunk materials `FrontSide`
  - emitted reversed back-facing triangles for Sugarcane cross quads only
  - reused the same UVs, vertex colors, and biome tint values on the reverse side
  - pushed reverse normals for correctness
- Added Sugarcane `52` to missing plant-style render groups in `faces.js`.
- Avoided changing normal cube/block rendering or making all chunks double-sided.
- Preserved v419 skeleton-only double-sided material, v418 mob water drag/swim bobbing, v416 F3 seed/Beta Rain Forest blending, and recent armor/mushroom fixes.
- Updated cache version to `420`.


## v421 Patch - Sugarcane Adjacent Block AO/Light Fix

- Fixed the actual Sugarcane `52` dark-face cause: nearby full blocks were influencing the cane cross-face lighting.
- Sugarcane cross faces now use brightest local plant light from:
  - the cane block cell
  - the block above
  - non-solid transparent/air side cells
- Sugarcane now ignores adjacency AO on its crossed visual planes, so a full block placed beside it cannot darken the opposite side face.
- Kept the v420 true double-sided Sugarcane cross faces in place.
- Preserved v419 skeleton-only double-sided material, v418 mob water drag/swim bobbing, v416 F3 seed/Beta Rain Forest blending, and recent armor/mushroom fixes.
- Updated cache version to `421`.


## v422 Patch - Sugarcane Diagonal AO Fix and Fix Kit UI Removal

- Fixed remaining Sugarcane `52` darkening from diagonal full blocks.
- Sugarcane flat plant light now samples the full 3x3 ring around the cane, including diagonals, at cane height and one block above.
- Sugarcane still ignores adjacency AO on its crossed visual planes.
- Removed the Fix Kit 1.0.0 diagnostic UI/opening keybind.
- Existing Fix Kit save/error guards remain loaded, but the UI panel no longer opens.
- Existing music stop key behavior is preserved through the music system; only the Fix Kit UI was removed.
- Preserved v421/v420 Sugarcane cross-face fixes, v419 skeleton-only double-sided material, v418 mob water fixes, and recent armor/mushroom fixes.
- Updated cache version to `422`.


## v423 Patch - Dedicated Sugarcane Cross Renderer

- Redesigned Sugarcane `52` world rendering to bypass the generic cross-face AO path entirely.
- Sugarcane still appears as a centered X-pattern plant block.
- Sugarcane now uses a dedicated renderer in `js/render/chunk-mesh.js` that:
  - emits two centered diagonal plant planes
  - emits both front and back triangle windings
  - uses uniform local ambient sunlight/torchlight
  - avoids face-direction AO and adjacent/diagonal block occlusion
  - keeps normal world chunk materials `FrontSide`
- This preserves ambient lighting while preventing nearby full blocks from over-darkening one Sugarcane face.
- Preserved v422 Fix Kit UI removal, v419 skeleton-only double-sided material, v418 mob water fixes, and recent armor/mushroom fixes.
- Updated cache version to `423`.


## v424 Patch - Bones, Bonemeal, Crop Growth, and Grass Spread

- Added Bone item `260` using `terrain.png` atlas index `221`.
- Added Bonemeal item `261` using `terrain.png` atlas index `222`.
- Bone and Bonemeal are registered as `TOOL_DATA` items, not `BLOCK_DATA` blocks, so they cannot be placed.
- Bone and Bonemeal use the existing 3D extruded material mesh for held and dropped models.
- Added crafting recipe: `1 Bone -> 3 Bonemeal`.
- Skeletons now drop `0-2` bones on death.
- Bonemeal right-click behavior:
  - right-click Wheat Crop `64` to instantly set it to final growth stage `7`
  - right-click Grass Block `1` to randomly spawn grass, roses, and dandelions in a compact `4x4` area
- Bonemeal is consumed only when it successfully grows a crop or spawns foliage.
- Added mobile tap support for bonemeal use.
- Preserved v423 dedicated Sugarcane renderer, v422 Fix Kit UI removal, v419 skeleton-only double-sided rendering, and v418 mob water fixes.
- Updated cache version to `424`.


## v425 Patch - Updated Default Terrain Atlases

- Replaced the default `textures/terrain.png` with the uploaded `terrain(3).png`.
- Replaced the default `textures/terrain_mip_map.png` with the uploaded `terrain_mip_map(3).png`.
- Bone uses terrain atlas index `221`; Bonemeal uses terrain atlas index `222` from the new default atlas.
- Preserved v424 Bones/Bonemeal, v423 dedicated Sugarcane renderer, v422 Fix Kit UI removal, v419 skeleton-only double-sided rendering, and v418 mob water fixes.
- Updated cache version to `425`.


## v426 Patch - Bonemeal No Particles and Radius-5 Grass Spread

- Removed bonemeal particle effects from crop growth and grass spreading.
- Changed bonemeal-on-grass spread from a compact `4x4` square to a circular radius-5 area.
- Grass, roses, and dandelions are now randomly dispersed inside the circle.
- Plant density falls slightly toward the edge of the radius for a more natural spread.
- Bonemeal still instantly grows Wheat Crop `64` to final stage `7`.
- Bone and Bonemeal remain item-only and non-placeable.
- Preserved v425 updated terrain atlases, v424 Bones/Bonemeal, v423 dedicated Sugarcane renderer, and recent mob/render fixes.
- Updated cache version to `426`.


## v428 Patch - Emergency Revert of v427 UI Breakage and Safe Time/Grass Fix

- Rebuilt this patch from stable v426 instead of the broken v427 output.
- Restored the working inventory icon renderer, hotbar selector behavior, chat rendering/sending behavior, and held block positioning from v426.
- Re-applied only the safe `/time set HHMM` mapping fix:
  - `0900` = day
  - `1200` = noon
  - `2100` = night
  - `0000` = midnight
- Safely fixed Grass Block held/dropped item rendering without touching HUD layout:
  - base Grass Block remains the standard full cube item mesh
  - dirt sides stay untinted
  - top face uses default grass/plant tint
  - side grass overhang is added as a separate tinted overlay mesh
  - existing held block position/scale/rotation is preserved
- Preserved v426 Bonemeal radius/no-particles, v425 updated atlases, v424 Bones/Bonemeal, v423 Sugarcane renderer, and recent mob/render fixes.
- Updated cache version to `428`.


## v429 Patch - Grass Block Held Mesh and Isometric Icon Repair

- Rebuilt Grass Block `1` held/dropped mesh as one dedicated single mesh instead of a separate overlay child mesh.
- Fixed visible gap between the side grass-overhang overlay and the grass block side texture.
- Grass side overhang now sits visually flush with the dirt side face.
- Grass side overhang now uses the same material, vertex-color, biome-tint, normal, and lighting path as the rest of the held/dropped block mesh.
- Fixed Grass Block isometric inventory icon:
  - dirt side faces are no longer tinted green
  - top face is tinted green
  - grass side-overhang overlay is rendered as separate tinted right/front overlay faces
  - the overhang is no longer missing from the icon
- General inventory icon rendering, chat, hotbar selector behavior, and held block positioning are preserved from v428/v426.
- Preserved v428 time command fix, v426 Bonemeal changes, v425 terrain atlases, v424 Bones/Bonemeal, and v423 Sugarcane renderer.
- Updated cache version to `429`.


## v430 Patch - Indev Island World Type

- Added new world type: `Indev Island`.
- Indev Island is a locked preset like Beta 1.7.3 and greys out world customization settings.
- Indev Island forces a `256x256` world size.
- Added locked biome `indev_forest` / display name `Indev Forest`.
  - This biome is only used by Indev Island and does not generate normally.
  - Uses the Alpha grass/foliage tint.
- Added dedicated Indev Island terrain generator:
  - single island shape
  - terrain tapers into ocean before the border
  - ocean water and bedrock floor at the island/world edge
  - mild rolling terrain
  - 10-15 block cliff-face features
  - surface-piercing caves and underground caves
  - no ravines
  - regular oak trees only
  - no grass plants, tallgrass, flowers, sugarcane, cactus, dead bushes, or other vegetation
- Indev Island gameplay locks:
  - Hunger disabled
  - XP disabled
  - Aether disabled
  - Nether portal use/lighting disabled
- Indev Island natural mob restrictions:
  - Passive: pigs and cows only
  - Hostile: zombies and creepers only
  - no sheep, skeletons, zombie pigmen, or other natural spawns
- Added hard world-border clamp so the player cannot move past the 256x256 playable area.
- Preserved v429 grass block item/icon repair, v428 time command fix, v426 Bonemeal changes, v425 terrain atlases, v424 Bones/Bonemeal, and v423 Sugarcane renderer.
- Updated cache version to `430`.



## v431 Patch - Indev Shore Beaches, Fake Infinite Ocean, and Tint Lock Fix

- Retuned Indev Island terrain:
  - terrain now stays closer to sea level
  - 10-15 block cliff formations are rarer
  - coastline has sand beach terrain
  - shore taper is broader and smoother
  - oak trees only spawn farther inland
- Inside the 256x256 playable border:
  - ocean floor still generates as real terrain
  - beach/shore/ocean cells are real blocks
- Outside the 256x256 playable border:
  - added visual-only infinite ocean planes
  - added visual-only bedrock floor planes at bedrock level
  - these are not real chunks, water blocks, or bedrock blocks
  - player border clamp remains active
- Fixed Indev Forest tint reverting after chunk/terrain updates:
  - worker-adopted chunks are now explicitly locked back to `indev_forest`
  - grass/foliage tint should stay Alpha green instead of changing to plains/savanna-like colors
- Preserved v430 Indev Island rules, v429 grass block repair, v428 time fix, v426 Bonemeal changes, v425 terrain atlases, and v424 Bones/Bonemeal.
- Updated cache version to `431`.



## v432 Patch - Indev Textured Fake Ocean/Bedrock Planes and Mesh-Worker Tint Fix

- Updated the visual-only Indev Island outside-border ocean planes:
  - now use the actual `textures/water.png` texture
  - placed exactly at `GEN_SEA_LEVEL`
  - remain visual-only, not real water blocks/chunks
- Updated the visual-only Indev Island outside-border bedrock floor planes:
  - now use the actual Bedrock tile from `textures/terrain.png` atlas index `18`
  - placed exactly at bedrock level `Y=0`
  - remain visual-only, not real bedrock blocks/chunks
- Fixed the remaining Indev Forest tint overwrite:
  - the mesh worker's biome ID lookup table was missing newer biome IDs, including `indev_forest`
  - this caused async mesh-worker biome strips to decode Indev biome ID `18` as fallback `plains`, making chunk meshes repaint from Alpha green to plains/savanna-like tint
  - added the full biome list through `indev_forest`
  - Indev mesh-worker biome strips now force `indev_forest` while `GEN_WORLD_TYPE === 7`
  - mesh-worker default biome prefill is now `indev_forest` for Indev worlds instead of `plains`
- Preserved v431 beach/terrain tuning, v430 Indev Island rules, v429 grass block repair, v428 time fix, v426 Bonemeal changes, v425 terrain atlases, and v424 Bones/Bonemeal.
- Updated cache version to `432`.



## v433 Patch - Bonemeal Saplings and Indev Terrain Tuning

- Added Bonemeal right-click functionality for saplings.
- Bonemeal now instantly grows:
  - Oak Sapling `116`
  - Birch Sapling `117`
  - Spruce Sapling `118`
  - Jungle Sapling `137`
- Sapling bonemeal uses the existing `growTree()` code path used by regular tick growth.
- Bonemeal is only consumed if the sapling actually grows; blocked saplings do not consume it.
- Increased Indev Island base terrain height by 2 blocks.
- Made Indev cliff formations a little more common while keeping the v431 rare-cliff tuning style.
- Preserved v432 Indev fake water/bedrock texture planes and mesh-worker tint fix, v431 beaches, v429 grass block repair, and v424 Bones/Bonemeal.
- Updated cache version to `433`.



## v434 Patch - Indev Ocean Floor, Regular Oak Shape, Regular Cave Carver, and Plane Fixes

- Fixed Indev edge ocean floor generation:
  - removed the old water-only edge columns that dropped straight to bedrock
  - every column inside the 256x256 border now generates a normal seabed/ocean floor
  - ocean floor now uses regular-style seabed materials: gravel, dirt, sand, and clay pockets
  - visual-only outside-border ocean/bedrock planes remain outside the playable border only
- Replaced the custom weird Indev oak tree shape with the regular oak sapling `growTree()` canopy/trunk shape.
- Replaced the custom Indev cave mouth carver with a regular overworld-style worm cave carver.
- Ravines remain disabled in Indev Island.
- Fixed the outside-border water plane visibility:
  - water plane still uses `textures/water.png`
  - opacity increased and depth behavior corrected
  - plane remains at sea level
- Bedrock plane still uses terrain atlas Bedrock tile `18`, repeats at one tile per block, and remains at normal bedrock level.
- Preserved v433 Bonemeal saplings, v432 Indev tint fix/textured planes, v431 beaches, v430 Indev rules, v429 grass block repair, and previous fixes.
- Updated cache version to `434`.



## v435 Patch - Indev Swampland Terrain, Remove Fake Planes, Regular Sapling Trees

- Removed the visual-only infinite water planes completely.
- Removed the visual-only infinite bedrock planes completely.
- Disabled the custom Indev Island terrain generator path.
- Indev Forest now uses the normal overworld generator with Swampland terrain settings:
  - base height `GEN_SEA_LEVEL + 1`
  - low volatility `3`
  - normal cave worm formations from regular worlds
  - ravines remain disabled
- Indev Forest still stays locked to the Indev Island world type and does not generate normally.
- Indev Forest natural trees now use the regular natural overworld oak tree branch, not the swamp-vine tree branch and not the custom Indev tree.
- Oak and Birch sapling growth now uses the same regular natural small-tree shape used by worldgen instead of the older custom sapling canopy.
- Preserved Bonemeal sapling functionality, Indev world type locking, fixed 256x256 size, disabled hunger/XP/Aether, v432 mesh-worker tint fix, and previous fixes.
- Updated cache version to `435`.



## v436 Patch - Indev Forest Tree/Sugarcane Cleanup and Island Edge Falloff

- Tuned Indev Forest further while keeping it on the normal overworld generator.
- Removed large oak generation from Indev Forest.
  - Indev Forest now uses only the regular small oak tree branch.
- Disabled Sugarcane natural generation in Indev Island.
- Added a forced 16-block edge perimeter falloff for Indev Island:
  - the outer 16 blocks blend down toward ocean
  - the world still keeps normal seabed generation inside the 256x256 border
  - this restores the island silhouette without bringing back fake water/bedrock planes
- Preserved v435 Swampland-style Indev terrain settings, normal cave generation, removed fake planes, Bonemeal saplings, and previous fixes.
- Updated cache version to `436`.



## v437 Patch - Indev Graphics Locks

- Added Indev-only graphics restrictions.
- When the world type is Indev Island:
  - Smooth Lighting is forced OFF.
  - Smooth Lighting button is locked/greyed out and displays `Smooth Lighting: OFF (Indev)`.
  - Fabulous graphics is unavailable.
  - Graphics button cycles only `Fast` and `Fancy`.
  - If a loaded/active Indev world had Fabulous enabled, it is forcibly disabled and standard shaders are restored.
- Mesh worker settings now also receive Smooth Lighting OFF and Fabulous OFF for Indev worlds, so chunk meshes follow the locked setting.
- Preserved v436 Indev no-large-oak/sugarcane/edge-ocean tuning and all previous fixes.
- Updated cache version to `437`.



## v438 Patch - Remove Clock UI and Add GUI Scale 4

- Removed the old top-right clock UI entirely.
  - Removed the clock canvas container from `index.html`.
  - Removed the old clock drawing function.
  - Removed clock update hooks from the game loop.
  - Removed clock display initialization.
  - Removed clock from GUI scaling targets.
- Added a fourth GUI scale option.
  - GUI Scale now cycles: `1`, `2`, `3`, `4`, `Auto`.
  - Default GUI scale remains `Auto`.
  - Scale `4` makes the UI larger/closer than scale `3`.
- Preserved v437 Indev graphics locks, v436 Indev tuning, and all previous fixes.
- Updated cache version to `438`.



## v439 Patch - Bonemeal Sapling Y Fix and Tall Grass Water Cleanup

- Fixed Bonemeal-grown Oak/Birch saplings spawning one block too high.
  - The v435 natural-tree helper was using worldgen's ground-block Y convention.
  - Runtime saplings pass the sapling block position, so trunks now start at the sapling's block instead of one block above it.
- Fixed water/lava replacing two-high Tall Grass.
  - If fluid destroys the bottom half `219`, the top half `220` is also removed.
  - If fluid destroys the top half `220`, the bottom half `219` is cleaned up too.
- Preserved v438 clock removal / GUI scale 4, v437 Indev graphics locks, v436 Indev tuning, and previous fixes.
- Updated cache version to `439`.
