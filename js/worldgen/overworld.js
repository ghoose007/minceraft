// ==========================================
// OVERWORLD GENERATION
// ==========================================

// Per-chunk cache for cave carving's getHighestBlock lookups (cleared at start of each chunk)
let _caveSurfYCache = null;

// ----- v318 BADLANDS / MESA SURFACE HELPERS -----
// Block IDs are literals here because worldgen-worker.js imports this file without
// loading config/constants.js. They must match BLOCK_IDS in constants.js.
const BADLANDS_RED_SAND = 25;
const BADLANDS_RED_SANDSTONE = 45;
const BADLANDS_TERRACOTTA = 168;
const BADLANDS_ORANGE_TERRACOTTA = 57;
const BADLANDS_RED_TERRACOTTA = 166;
const BADLANDS_LIGHT_GREY_TERRACOTTA = 167;
const BADLANDS_BROWN_TERRACOTTA = 204;
const BADLANDS_WHITE_TERRACOTTA = 254;
const BADLANDS_YELLOW_TERRACOTTA = 255;
const BADLANDS_DEAD_BUSH = 26;

function _positiveMod(n, m) { return ((n % m) + m) % m; }
function _smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// v335: read the badlands "Sub-Biome Size" multiplier (default 1.0 = 100%).
// Larger value = larger features (lower noise frequency); smaller value =
// tighter features. Applied to spire mask scales, wooded-badlands mask
// scale, red-sand mask, and terracotta layer offset, so a single slider
// controls all the badlands sub-features coherently.
function _badlandsSubScale() {
    if (typeof GEN_BIOME_OVERRIDES === 'undefined' || !GEN_BIOME_OVERRIDES) return 1.0;
    var b = GEN_BIOME_OVERRIDES.badlands;
    if (!b || typeof b.subBiomeSize !== 'number') return 1.0;
    return b.subBiomeSize / 100;
}

function _badlandsSpireHeightBonus(x, z) {
    // Hoodoo/eroded-spire approximation: a broad mesa mask selects parts of
    // the badlands, then narrow ridge noise raises thin vertical columns. This
    // is applied before the 3D density pass, so the normal cave/noise system
    // still carves into the spires while their silhouettes stay tall and jagged.
    if (typeof _wgPerlinMountains === 'undefined' || !_wgPerlinMountains ||
        typeof _wgPerlinVolatility === 'undefined' || !_wgPerlinVolatility) return 0;
    const subScale = _badlandsSubScale();
    const broad = (_wgPerlinMountains.fbm(x / (145 * subScale) + 3100, z / (145 * subScale) - 3100, 3) + 1) * 0.5;
    const ridgeA = 1.0 - Math.abs(_wgPerlinVolatility.fbm(x / (44 * subScale) + 4100, z / (44 * subScale) - 4100, 3));
    const ridgeB = 1.0 - Math.abs(_wgPerlinMountains.fbm(x / (23 * subScale) - 5600, z / (23 * subScale) + 5600, 2));
    const mask = _smoothstep(0.48, 0.78, broad);
    const needle = Math.max(_smoothstep(0.70, 0.94, ridgeA), _smoothstep(0.76, 0.97, ridgeB) * 0.75);
    if (mask <= 0 || needle <= 0) return 0;
    const jag = (_wgPerlinVolatility.noise2D(x / (17 * subScale) + 7200, z / (17 * subScale) - 7200) + 1) * 0.5;
    return Math.pow(mask * needle, 1.45) * (18 + jag * 34);
}

function _badlandsLayerOffset(x, z) {
    // Minecraft badlands use a world-seed layer table whose bands shift up/down
    // horizontally by roughly +/-7 blocks. This approximates that with the
    // existing seeded worldgen noise so bands stay coherent across chunk borders.
    if (typeof _wgPerlinVolatility === 'undefined' || !_wgPerlinVolatility) return 0;
    const subScale = _badlandsSubScale();
    return Math.round(_wgPerlinVolatility.fbm(x / (64 * subScale) + 1800, z / (64 * subScale) - 1800, 2) * 7);
}

function _getBadlandsTerracottaBlock(x, y, z) {
    const band = _positiveMod(Math.floor(y + _badlandsLayerOffset(x, z)), 64);

    // Natural badlands only use uncolored, orange, yellow, brown, red, white,
    // and light gray terracotta. Most layers are uncolored terracotta, with
    // thin colored seams repeating vertically like Minecraft's mesa strata.
    if (band === 6 || band === 7) return BADLANDS_WHITE_TERRACOTTA;
    if (band === 8) return BADLANDS_LIGHT_GREY_TERRACOTTA;
    if (band === 13 || band === 14) return BADLANDS_YELLOW_TERRACOTTA;
    if (band === 20 || band === 21 || band === 22) return BADLANDS_ORANGE_TERRACOTTA;
    if (band === 31 || band === 32) return BADLANDS_RED_TERRACOTTA;
    if (band === 38 || band === 39) return BADLANDS_BROWN_TERRACOTTA;
    if (band === 47) return BADLANDS_LIGHT_GREY_TERRACOTTA;
    if (band === 54 || band === 55) return BADLANDS_ORANGE_TERRACOTTA;
    if (band === 61) return BADLANDS_YELLOW_TERRACOTTA;
    return BADLANDS_TERRACOTTA;
}

function _isBadlandsRedSandCap(x, y, z) {
    // Vanilla badlands have red sand on low/flatter exposed ground and at the
    // feet of terracotta slopes, while taller/cliff faces expose terracotta.
    if (y <= GEN_SEA_LEVEL + 4) return true;
    const subScale = _badlandsSubScale();
    const n = (typeof _wgPerlinSeabed !== 'undefined' && _wgPerlinSeabed)
        ? _wgPerlinSeabed.fbm(x / (52 * subScale) + 2200, z / (52 * subScale) - 2200, 2)
        : 0;
    return y <= GEN_SEA_LEVEL + 10 && n < -0.10;
}

// v334 Wooded Badlands sub-biome
// Minecraft's wooded badlands occupy roughly the upper third of mesa plateaus:
// they keep the badlands terrain shape (terracotta strata under the surface,
// hoodoo spires nearby) but cap the top with grass + dirt + coarse-dirt patches
// and grow scattered oak trees instead of dead bushes. We model this with a
// large-scale noise lobe that's only consulted inside badlands cells, so the
// pattern stays inside mesa regions and we don't need a new biome ID. The
// scale is intentionally bigger than the spire scale so wooded patches read
// as their own "section" of the mesa rather than as one-block speckles.
function _woodedBadlandsMask(x, z) {
    if (typeof _wgPerlinMountains === 'undefined' || !_wgPerlinMountains) return 0;
    const subScale = _badlandsSubScale();
    const n = _wgPerlinMountains.fbm(x / (175 * subScale) + 9100, z / (175 * subScale) - 9100, 3);
    // Map noise to a soft 0..1 mask; smoothstep keeps the wooded/non-wooded
    // boundary smooth so the grass/red-sand transition isn't a hard line.
    return _smoothstep(0.05, 0.30, n);
}

// True when this column should generate as wooded badlands. Wooded badlands
// only appear above a height threshold so the lower red-sand basin around the
// mesa stays consistent with vanilla — grass shouldn't grow on the desert
// floor.
function _isWoodedBadlandsColumn(x, y, z) {
    if (y < GEN_SEA_LEVEL + 14) return false;
    return _woodedBadlandsMask(x, z) > 0.5;
}

function _placeFoliageGrass(x, y, z, chunkRng) {
    const twoBlockChance = 0.25;
    const cellY2 = y + 2;
    if (cellY2 < WORLD_HEIGHT && (getVoxel(x, cellY2, z) & 0xFF) === 0 && chunkRng() < twoBlockChance) {
        setVoxel(x, y + 1, z, 219);
        setVoxel(x, cellY2, z, 220);
    } else {
        setVoxel(x, y + 1, z, 16);
    }
}

// v341: ice-spikes-biome feature placement.
//
// MC's Ice Spikes biome has two distinct spike variants documented on the wiki:
//   - Short and wide: about 8-15 blocks tall, base radius ~2 blocks, tapers
//     to a point at the top. The common form.
//   - Tall and thin: 25-50 blocks tall, base radius 1, very thin all the way
//     up with a single-block "spear tip" at the top. Roughly 20% of spikes.
// Plus disk-shaped "ice patches" — small 5x5 packed-ice tiles that replace
// the snow surface in places. Together they create the chaotic spike-forest
// landscape that's the biome's signature.
//
// Built as top-level helpers (called from Phase 3.6 inside
// _generateNormalChunk) so they're reachable from inside the chunk RNG
// closure. The chunk RNG is passed in explicitly — same lesson as the
// v337 _placeFoliageGrass fix.
function _generateIceSpike(centerX, baseY, centerZ, isTall, chunkRng) {
    // v343: less uniform, more Minecraft-like packed-ice spikes.
    // Minecraft's ice spikes are generated as irregular tapered columns:
    // common short/wide spikes plus rarer tall needle spikes. They are not
    // perfect cones, so this uses per-spike height/radius/wobble/taper values
    // while still keeping the footprint bounded inside the current chunk.
    let height, baseRadiusX, baseRadiusZ, needleStart;

    if (isTall) {
        // Tall spikes: rarer, skinny, variable height. Most are narrow 1-2
        // radius columns that pinch hard into a spear tip.
        height = 22 + Math.floor(chunkRng() * 38); // 22-59
        baseRadiusX = 1 + (chunkRng() < 0.30 ? 1 : 0);
        baseRadiusZ = 1 + (chunkRng() < 0.22 ? 1 : 0);
        needleStart = 0.70 + chunkRng() * 0.18;
    } else {
        // Short spikes: much more common, squat/wide, highly variable.
        height = 7 + Math.floor(chunkRng() * 13); // 7-19
        baseRadiusX = 2 + Math.floor(chunkRng() * 2); // 2-3
        baseRadiusZ = 2 + Math.floor(chunkRng() * 2); // 2-3
        if (chunkRng() < 0.18) { baseRadiusX = 1; baseRadiusZ = 2; }
        if (chunkRng() < 0.18) { baseRadiusX = 2; baseRadiusZ = 1; }
        needleStart = 0.78 + chunkRng() * 0.14;
    }

    const startY = baseY - 1;
    const taperPower = isTall ? (0.85 + chunkRng() * 0.65) : (1.05 + chunkRng() * 0.85);
    const leanDirX = Math.floor(chunkRng() * 3) - 1; // -1,0,1
    const leanDirZ = Math.floor(chunkRng() * 3) - 1;
    const leanStrength = isTall ? (chunkRng() < 0.35 ? 1 : 0) : (chunkRng() < 0.18 ? 1 : 0);
    const roughness = isTall ? 0.20 : 0.32;

    for (let h = 0; h < height + 1; h++) {
        const ty = startY + h;
        if (ty < 1 || ty >= WORLD_HEIGHT) continue;

        const t = h / Math.max(1, height);
        let cx = centerX;
        let cz = centerZ;
        if (leanStrength) {
            // Slight stepped lean so very tall spikes are not perfectly plumb.
            cx += Math.round(leanDirX * t * leanStrength);
            cz += Math.round(leanDirZ * t * leanStrength);
        }

        let rx, rz;
        if (isTall && t > needleStart) {
            const tipT = (t - needleStart) / Math.max(0.01, (1 - needleStart));
            rx = Math.max(0, Math.round(baseRadiusX * (1 - tipT * 1.35)));
            rz = Math.max(0, Math.round(baseRadiusZ * (1 - tipT * 1.35)));
        } else {
            const taper = Math.pow(1 - t, taperPower);
            rx = Math.max(0, Math.round(baseRadiusX * taper));
            rz = Math.max(0, Math.round(baseRadiusZ * taper));
        }

        // Keep lower rows fuller so the spike looks rooted, and force the top
        // rows into one-block tips rather than flat cutoffs.
        if (h <= 1) { rx = Math.max(rx, Math.min(2, baseRadiusX)); rz = Math.max(rz, Math.min(2, baseRadiusZ)); }
        if (h >= height - 1) { rx = 0; rz = 0; }

        for (let dx = -rx; dx <= rx; dx++) {
            for (let dz = -rz; dz <= rz; dz++) {
                const nx = rx <= 0 ? 0 : dx / Math.max(0.01, rx + 0.15);
                const nz = rz <= 0 ? 0 : dz / Math.max(0.01, rz + 0.15);
                const dist = nx * nx + nz * nz;
                if (dist > 1.08) continue;

                // Randomly chip away some edge blocks, but never the center
                // column. This breaks up the repeated cone/cylinder look.
                const edge = dist > 0.62;
                if (edge && chunkRng() < roughness * (0.35 + t * 0.65)) continue;

                setVoxel(cx + dx, ty, cz + dz, 138); // Packed Ice
            }
        }
    }

    // A few short packed-ice roots around the base, similar to the way vanilla
    // spikes feel embedded in surrounding snow/ice instead of sitting on top.
    const rootRadius = Math.max(baseRadiusX, baseRadiusZ) + (isTall ? 0 : 1);
    for (let dx = -rootRadius; dx <= rootRadius; dx++) {
        for (let dz = -rootRadius; dz <= rootRadius; dz++) {
            const distSq = dx*dx + dz*dz;
            if (distSq > rootRadius * rootRadius + 0.5) continue;
            if (chunkRng() < 0.28) continue;
            const wx = centerX + dx;
            const wz = centerZ + dz;
            for (let y = baseY + 1; y >= baseY - 2; y--) {
                const id = getVoxel(wx, y, wz) & 0xFF;
                if (id === 39 || id === 2 || id === 40 || id === 138) {
                    setVoxel(wx, y, wz, 138);
                    break;
                }
            }
        }
    }
}

function _getIceSpikeMargin(isTall, chunkRng) {
    // Conservative footprint margin matching the possible randomized base
    // radii above. Keeps feature writes inside this chunk.
    return isTall ? 3 : 4;
}

// v341: ice patch — 5x5 disk of packed ice replacing the local surface
// block (snow or dirt). Matches MC's "Ice Patch" feature: the wiki
// describes it as a 5x5 pattern with corners removed, and "each block
// adapts to the height of the surface block it replaces" — so we scan
// for the local surface y rather than assuming a flat slab.
function _generateIcePatch(centerX, centerSurfaceY, centerZ) {
    // 5x5 with corners trimmed → 21 tiles, vaguely circular.
    const pattern = [
        [0, 1, 1, 1, 0],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [0, 1, 1, 1, 0]
    ];
    for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
            if (pattern[dz + 2][dx + 2] === 0) continue;
            const wx = centerX + dx;
            const wz = centerZ + dz;
            // Find local surface y near the patch center (snow layers above
            // the surface block are transparent and don't count).
            let localY = -1;
            for (let y = centerSurfaceY + 3; y >= centerSurfaceY - 3; y--) {
                if (y < 1 || y >= WORLD_HEIGHT) continue;
                const id = getVoxel(wx, y, wz) & 0xFF;
                if (id !== 0 && id !== 40) { localY = y; break; }
            }
            if (localY < 0) continue;
            // Only replace snow or dirt — avoid clobbering existing ice or
            // overwriting spikes we just placed.
            const surfId = getVoxel(wx, localY, wz) & 0xFF;
            if (surfId === 39 || surfId === 2) {
                setVoxel(wx, localY, wz, 138);
            }
        }
    }
}

function _applyBadlandsColumnBlock(x, y, z, depth) {
    if (depth === 0 && _isBadlandsRedSandCap(x, y, z)) {
        setVoxel(x, y, z, BADLANDS_RED_SAND);
        return;
    }

    // Red sandstone naturally sits below red sand. Otherwise fill the exposed
    // mesa body with colored terracotta bands down to a stone transition.
    const aboveId = getVoxel(x, y + 1, z) & 0xFF;
    if (depth > 0 && depth <= 3 && (aboveId === BADLANDS_RED_SAND || aboveId === BADLANDS_RED_SANDSTONE)) {
        setVoxel(x, y, z, BADLANDS_RED_SANDSTONE);
        return;
    }

    if (y >= GEN_SEA_LEVEL - 18) {
        setVoxel(x, y, z, _getBadlandsTerracottaBlock(x, y, z));
    }
    // Below the terracotta body, leave the original stone in place.
}



// ==========================================
// SKYBLOCK PROTOTYPE WORLDGEN
// ==========================================
// World type 5: classic Skyblock prototype. The overworld is void except for
// a small L-shaped dirt/grass starter island at world origin, one oak tree,
// and one starter chest. This function is safe in both main thread and the
// worldgen worker: setVoxel captures cross-chunk tree leaves as overflow in
// the worker, while the main thread applies them directly.
function _generateSkyblockChunk(cx, cz) {
    _markChunkGenerated(cx, cz);
    _getOrCreateChunkFast(cx, cz);

    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;
    const startX = cx * CHUNK_SIZE - halfW;
    const startZ = cz * CHUNK_SIZE - halfD;

    // Biome tint should remain normal/plains for the void world.
    if (typeof biomeMap !== 'undefined' && biomeMap) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const wx = startX + lx;
                const wz = startZ + lz;
                const gIdx = (wx + halfW) + (wz + halfD) * WORLD_WIDTH;
                if (gIdx >= 0 && gIdx < WORLD_WIDTH * WORLD_DEPTH) biomeMap[gIdx] = 'plains';
            }
        }
    }

    // Only the center-area chunk receives blocks. All other chunks are real
    // generated void chunks so the lazy streamer stops re-requesting them.
    const inThisChunk = (x, z) => x >= startX && x < startX + CHUNK_SIZE && z >= startZ && z < startZ + CHUNK_SIZE;
    const topY = 64;
    const dirtBottomY = 61;

    // Classic L footprint: a 5x5 island with the north-east 2x2 corner missing.
    // Top layer is grass; lower layers are dirt.
    for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
            const inL = (z <= 0) || (x <= 0);
            if (!inL) continue;
            if (!inThisChunk(x, z)) continue;
            for (let y = dirtBottomY; y < topY; y++) setVoxel(x, y, z, 2);
            setVoxel(x, topY, z, 1);
        }
    }

    // Tree is generated later on the main thread by setupSkyblockStarterTree(),
    // using the existing sapling growTree() code path. Do not generate a custom
    // leaf blob here; the worker does not have access to growTree().

    // Starter chest on the front/right arm of the L.
    if (inThisChunk(2, -1)) setVoxel(2, topY + 1, -1, 69);
}

// Create the custom Skyblock starter chest inventory on the main thread after
// the island chunk has been generated. The chest block itself is placed during
// worldgen; this fills its persistent chest data.
function setupSkyblockStarterChest() {
    if (typeof getOrCreateChest !== 'function') return;
    const chest = getOrCreateChest(2, 65, -1);
    if (!chest || !chest.slots) return;

    const alreadyFilled = chest.slots.some(s => s && s.id && s.count > 0);
    if (alreadyFilled) return;

    const contents = [
        { id: 224, count: 1 }, // Water Bucket
        { id: 225, count: 1 }, // Lava Bucket
        { id: 116, count: 1 }, // Oak Sapling
        { id: 20,  count: 1 }, // Cactus
        { id: 52,  count: 1 }, // Sugarcane
        { id: 128, count: 1 }, // Seeds
        { id: 2,   count: 3 }, // Dirt
        { id: 15,  count: 1 }, // Sand
        { id: 5,   count: 1 }  // Gravel
    ];

    for (let i = 0; i < contents.length; i++) {
        chest.slots[i].id = contents[i].id;
        chest.slots[i].count = contents[i].count;
    }
}
if (typeof window !== 'undefined') window.setupSkyblockStarterChest = setupSkyblockStarterChest;


// Grow the Skyblock starter oak through the exact same runtime sapling tree
// generator used elsewhere in the game. This avoids a special custom Skyblock
// canopy and keeps the starter tree visually consistent with normal oak trees.
function setupSkyblockStarterTree() {
    if (typeof growTree !== 'function') return;
    const x = -2, y = 65, z = -2; // corner of the island; ground is y=64

    // Do not duplicate trees if this hook is ever called twice.
    let hasTree = false;
    for (let yy = y; yy <= y + 8; yy++) {
        const id = getVoxel(x, yy, z) & 0xFF;
        if (id === 13 || id === 14) { hasTree = true; break; }
    }
    if (hasTree) return;

    // Place a real oak sapling and immediately grow it with the existing tree
    // system. growTree consumes the sapling, places logs/leaves, and queues
    // lighting updates exactly like normal sapling growth.
    setVoxel(x, y, z, 116);
    growTree(x, y, z, 116);

    if (typeof updateChunksInBounds === 'function') {
        updateChunksInBounds(x - 3, x + 3, z - 3, z + 3);
    }
}
if (typeof window !== 'undefined') window.setupSkyblockStarterTree = setupSkyblockStarterTree;


function generateChunkColumn(cx, cz) {
    if (_isChunkGenerated(cx, cz)) return;
    // v332 Fix C: open the worldgen-allocate window. Tree leaves on a
    // chunk edge can spill into neighbor chunks via setVoxel; those
    // legitimately need to allocate the neighbor slot. Outside this
    // window, setVoxel refuses to allocate.
    _enterWorldGen();
    try {
        // Skyblock prototype world type
        if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 5) {
            _generateSkyblockChunk(cx, cz);
            return;
        }

        // Superflat world type
        if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 1) {
            // 'overworld' preset uses normal generator with flattened heightmap
            if (typeof GEN_SUPERFLAT_PRESET !== 'undefined' && GEN_SUPERFLAT_PRESET === 'overworld') {
                _generateNormalChunk(cx, cz);
                return;
            }
            // 'classic' preset uses the layer editor
            _generateSuperflatChunk(cx, cz);
            return;
        }

        _generateNormalChunk(cx, cz);
    } finally {
        _exitWorldGen();
    }
}

function _generateSuperflatChunk(cx, cz) {
    _markChunkGenerated(cx, cz);
    _getOrCreateChunkFast(cx, cz);
    
    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;
    const startX = cx * CHUNK_SIZE - halfW;
    const startZ = cz * CHUNK_SIZE - halfD;
    
    // v265: Populate chunkBiomeCache so the worker's send-back path picks up
    // the correct biome data. Without this, when this function runs in the
    // worldgen worker, the writes to biomeMap[gIdx] = 'plains' below are
    // dropped by the worker's biomeMap proxy, and the worker sends back
    // all-zero biome IDs which the main thread interprets as 'desert' (the
    // first entry in BIOME_NAMES). On the main thread the biomeMap writes
    // succeed too — populating the cache here is harmless extra work.
    if (typeof chunkBiomeCache !== 'undefined') {
        const PLAINS_ID = 4; // BIOME_NAMES.indexOf('plains')
        const cellCount = CHUNK_SIZE * CHUNK_SIZE;
        const sfBiomes = new Uint8Array(cellCount);
        sfBiomes.fill(PLAINS_ID);
        chunkBiomeCache.set(cx + ',' + cz, { biomes: sfBiomes });
    }
    
    // Store biome as plains for all superflat
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = startX + lx;
            const wz = startZ + lz;
            const gIdx = (wx + halfW) + (wz + halfD) * WORLD_WIDTH;
            if (gIdx >= 0 && gIdx < WORLD_WIDTH * WORLD_DEPTH) {
                biomeMap[gIdx] = 'plains';
            }
        }
    }
    
    // Read superflat layers from global config (top of list = top of world)
    const layers = (typeof GEN_SUPERFLAT_LAYERS !== 'undefined' && GEN_SUPERFLAT_LAYERS.length > 0)
        ? GEN_SUPERFLAT_LAYERS
        : [{ id: 1, depth: 1 }, { id: 2, depth: 2 }, { id: 3, depth: 1 }, { id: 18, depth: 1 }];
    
    // Calculate total depth, cap at 128 for build room
    let totalDepth = 0;
    for (const layer of layers) totalDepth += layer.depth;
    if (totalDepth > 128) totalDepth = 128;
    
    // Build column from bottom up: bottom of stack at y=0, top at y=totalDepth-1
    // Layers are top-of-list = top-of-world, so iterate layers in order and assign Y from top down
    const columnBlocks = new Array(totalDepth);
    let yCursor = totalDepth - 1; // start at top
    for (const layer of layers) {
        for (let d = 0; d < layer.depth; d++) {
            if (yCursor < 0) break;
            columnBlocks[yCursor] = layer.id;
            yCursor--;
        }
        if (yCursor < 0) break;
    }
    // Fill any remaining slots from bottom with the last layer's id (shouldn't happen normally)
    for (let i = 0; i < totalDepth; i++) {
        if (columnBlocks[i] === undefined) columnBlocks[i] = layers[layers.length - 1].id;
    }
    
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = startX + lx;
            const wz = startZ + lz;
            for (let y = 0; y < totalDepth; y++) {
                setVoxel(wx, y, wz, columnBlocks[y]);
            }
        }
    }
}

function _generateNormalChunk(cx, cz) {
    _markChunkGenerated(cx, cz);
    _getOrCreateChunkFast(cx, cz);
    
    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;
    const startX = cx * CHUNK_SIZE - halfW;
    const startZ = cz * CHUNK_SIZE - halfD;
    
    const biomeData = _computeChunkBiomeData(cx, cz);
    const seededRandom = _chunkSeededRandom(cx, cz);
    
    // Store biome info in global biomeMap
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = startX + lx;
            const wz = startZ + lz;
            const gIdx = (wx + halfW) + (wz + halfD) * WORLD_WIDTH;
            if (gIdx >= 0 && gIdx < WORLD_WIDTH * WORLD_DEPTH) {
                biomeMap[gIdx] = BIOME_NAMES[biomeData.biomes[lx + lz * CHUNK_SIZE]];
            }
        }
    }
    
    // PHASE 1: 3D terrain density
    const isOverworldPreset = (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 1
        && typeof GEN_SUPERFLAT_PRESET !== 'undefined' && GEN_SUPERFLAT_PRESET === 'overworld');
    
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const bIdx = lx + lz * CHUNK_SIZE;
            
            let baseHeight, volatility;
            
            if (isOverworldPreset) {
                // Flat overworld: snap to sea level for land, keep depression for rivers/oceans
                let h = biomeData.heightMap[bIdx];
                // Threshold: anything within 2 of sea level becomes flat land at sea level.
                // Anything more than 2 below stays as river/ocean bed (but must leave at least 1 water block).
                if (h >= GEN_SEA_LEVEL - 1) {
                    h = GEN_SEA_LEVEL;
                } else {
                    // Keep depression but cap so there's always at least 1 stone below water
                    if (h < 1) h = 1;
                }
                baseHeight = Math.floor(h);
                volatility = 0;
                
                // Place bedrock at y=0, stone up to baseHeight, water above to sea level
                setVoxel(x, 0, z, 18); // Bedrock
                for (let y = 1; y <= baseHeight; y++) {
                    setVoxel(x, y, z, 3); // Stone
                }
                for (let y = baseHeight + 1; y <= GEN_SEA_LEVEL; y++) {
                    setVoxel(x, y, z, 4, 8, 0, 1); // Water source
                }
                continue;
            }
            
            baseHeight = biomeData.heightMap[bIdx];
            volatility = biomeData.volMap[bIdx];
            const biomeNameForTerrain = BIOME_NAMES[biomeData.biomes[bIdx]];

            // Beta 1.7.3 terrain preset modifiers. These are now read from
            // betaElevScale/betaVolScale/betaMountainScale/betaSwampClamp,
            // which are blurred in _computeChunkBiomeData together with the
            // biome height/variation maps. This prevents hard terrain cutoffs
            // at Beta biome borders.
            const isBeta173Terrain = (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 6);
            let betaMountainScale = 1.0;
            let betaElevScale = 1.0;
            let betaVolScale = 1.0;
            let betaSwampClamp = 0.0;
            if (isBeta173Terrain && biomeData.betaElevScale && biomeData.betaVolScale && biomeData.betaMountainScale) {
                betaElevScale = biomeData.betaElevScale[bIdx];
                betaVolScale = biomeData.betaVolScale[bIdx];
                betaMountainScale = biomeData.betaMountainScale[bIdx];
                betaSwampClamp = biomeData.betaSwampClamp ? biomeData.betaSwampClamp[bIdx] : 0.0;
                if (betaSwampClamp > 0.001) {
                    const swampPocketNoise = _wgPerlinElevation.fbm(x / 42, z / 42, 3);
                    const swampWetMask = Math.max(0.0, Math.min(1.0, (0.34 - swampPocketNoise) / 0.68));
                    const swampTarget = (GEN_SEA_LEVEL + 1) - swampWetMask * 4.0;
                    baseHeight = baseHeight * (1.0 - betaSwampClamp) + Math.min(baseHeight, swampTarget) * betaSwampClamp;
                    // Keep some volatility so swamp basins form uneven wet pockets
                    // instead of one perfectly flat flooded sheet.
                    volatility += swampWetMask * betaSwampClamp * 2.5;
                }
            }

            // v336: compute shoreDampen FIRST (was further down), then use
            // it to gate the spire bonus. The bug it fixes: v334's smooth
            // badlandsWeight extends the spire bonus ~24 blocks past the
            // strict Voronoi cell boundary. Adjacent ocean cells were
            // catching that bonus (weight ~0.2–0.4 within the blur radius),
            // which let stone columns shoot 15–25 blocks above sea level
            // out of the water — clearly broken in screenshots. The
            // elevation-noise and mountain contributions are already
            // shore-dampened; the spire bonus needs the same gate.
            const oceanNoise = _wgPerlinOcean.fbm(x / (_wgBiomeScale * 2.5), z / (_wgBiomeScale * 2.5), 3);
            let shoreDampen = 1.0;
            if (oceanNoise < 0.1) {
                shoreDampen = Math.max(0.0, (oceanNoise - (-0.15)) / 0.25);
            }

            // v334: smoothly-blended badlands continuity weight. 1.0 in the
            // middle of a badlands cell, fading to 0 across the ~24-block
            // blur radius at the biome boundary. The previous code applied
            // the spire bonus inside a binary `biome === 'badlands'` check,
            // which created visible height cliffs where a spire's noise lobe
            // happened to cross the biome border. By multiplying the spire
            // bonus through this weight, spires now feather out into
            // neighboring terrain the same way the base heightmap does.
            const badlandsWeight = (biomeData.badlandsWeight
                ? biomeData.badlandsWeight[bIdx]
                : (biomeNameForTerrain === 'badlands' ? 1.0 : 0.0));
            if (badlandsWeight > 0.001) {
                // v336: spires need to die in any ocean cell, not just deep
                // ocean. Linear × shoreDampen leaves a residual 2–5 block
                // bump in shallow water (shoreDampen ≈ 0.2–0.5) — visible
                // as small stone bumps poking out of the sea right at the
                // badlands shore. The smoothstep(0.5, 1.0, shoreDampen)
                // gate clamps to zero whenever shoreDampen < 0.5 (i.e.,
                // any ocean cell at all) and ramps up smoothly to full
                // contribution once we're well inland.
                const shoreSpireGate = _smoothstep(0.5, 1.0, shoreDampen);
                const spireBonus = _badlandsSpireHeightBonus(x, z) * _wgTerrainMult * badlandsWeight * shoreSpireGate;
                if (spireBonus > 0.25) {
                    baseHeight += spireBonus;
                    // More vertical and jagged than normal rolling terrain, but not so
                    // noisy that the spires dissolve into floating blobs.
                    volatility += Math.min(18, spireBonus * 0.18);
                }
            }

            // Standard rolling elevation (Dampened near shores)
            const elevationNoise = _wgPerlinElevation.fbm(x / _wgSmoothness, z / _wgSmoothness, 4);
            baseHeight += elevationNoise * 20 * _wgTerrainMult * shoreDampen * betaElevScale;

            // v360: Beta 1.7.3 global terrain generator pass.
            // In real Beta terrain is not driven by biome-specific terrain
            // profiles. This global pass applies old-Beta-style hills,
            // cliffs, shelves, and overhang potential across the whole Beta
            // world, while biomes later control colors/surfaces/decorations.
            if (isBeta173Terrain) {
                const betaRolling = _wgPerlinElevation.fbm(x / 118, z / 118, 5);
                const betaBroad = _wgPerlinMountains.fbm(x / 310, z / 310, 4);
                const betaRidge = 1.0 - Math.abs(_wgPerlinMountains.fbm(x / 155 + 1337, z / 155 - 7331, 3));
                const betaBroken = _wgPerlinVolatility.fbm(x / 72 - 420, z / 72 + 420, 3);

                // Rolling terrain everywhere, with broad Beta-like height swings.
                baseHeight += betaRolling * 18.0 * _wgTerrainMult * shoreDampen;

                // Large hill/mountain masses that can occur under any biome.
                if (betaBroad > 0.04) {
                    const betaMass = Math.pow((betaBroad - 0.04) * 1.35, 2.0) * shoreDampen;
                    baseHeight += betaMass * 72.0 * _wgTerrainMult;
                    volatility += betaMass * 26.0;
                }

                // Ridge/cliff bands: old Beta-style abrupt faces, not biome-owned.
                if (betaRidge > 0.72) {
                    const ridgeAmt = Math.pow((betaRidge - 0.72) * 2.4, 2.0) * shoreDampen;
                    baseHeight += ridgeAmt * 36.0 * _wgTerrainMult;
                    volatility += ridgeAmt * 36.0;
                }

                // Broken secondary terrain helps create uneven cliffs and ledges.
                if (betaBroken > 0.18) {
                    const brokenAmt = (betaBroken - 0.18) * 1.65 * shoreDampen;
                    baseHeight += brokenAmt * 18.0 * _wgTerrainMult;
                    volatility += brokenAmt * 18.0;
                }

                // Keep oceans water-shaped even under the global Beta pass,
                // but do not make the seafloor flat. Add broad rolling
                // underwater hills/valleys around the same average depth.
                if (biomeNameForTerrain === 'ocean') {
                    const oceanRollA = _wgPerlinSeabed.fbm(x / 88, z / 88, 4);
                    const oceanRollB = _wgPerlinElevation.fbm(x / 145 + 900, z / 145 - 900, 3);
                    const oceanRidge = 1.0 - Math.abs(_wgPerlinSeabed.fbm(x / 54 - 300, z / 54 + 300, 2));
                    const oceanHill = Math.max(0.0, oceanRidge - 0.62) * 5.0;

                    const targetOceanFloor = (GEN_SEA_LEVEL - 15)
                        + oceanRollA * 5.5
                        + oceanRollB * 3.5
                        + oceanHill * 2.0;

                    // Stay safely underwater, but allow rolling seafloor relief.
                    const cappedOceanFloor = Math.min(GEN_SEA_LEVEL - 4, Math.max(GEN_SEA_LEVEL - 27, targetOceanFloor));
                    baseHeight = baseHeight * 0.20 + cappedOceanFloor * 0.80;
                    volatility = Math.max(volatility * 0.45, 2.5 + Math.abs(oceanRollA) * 3.0);
                }
            }
            
            // --- MACRO MOUNTAIN FORMATIONS ---
            const mountainScale = _wgSmoothness * 3.5; 
            const mNoise = _wgPerlinMountains.fbm(x / mountainScale, z / mountainScale, 4);
            
            if (mNoise > 0.1) {
                let steepness = Math.pow((mNoise - 0.1) * 1.5, 2.0); 
                steepness *= shoreDampen; // Kills mountains before they hit the beach
                
                baseHeight += steepness * 120 * _wgTerrainMult * betaMountainScale; 
                volatility += steepness * 25 * betaMountainScale; 
            }
            // --------------------------------------

            // Dampen the smaller 3D carving noise near the shores too
            volatility += _wgPerlinVolatility.fbm(x / 100, z / 100, 3) * 10 * shoreDampen * betaVolScale;
            volatility *= _wgTerrainMult * (GEN_VOLATILITY_MULT / 100.0) * betaVolScale;
            // --------------------------------------

            volatility += _wgPerlinVolatility.fbm(x / 100, z / 100, 3) * 10 * betaVolScale;
            volatility *= _wgTerrainMult * (GEN_VOLATILITY_MULT / 100.0) * betaVolScale;
            
            // PERF: Cap Y to baseHeight + headroom. Above (baseHeight + 2*volatility + 16),
            // the density calculation will essentially always be negative (= air), so we
            // can skip the expensive 3D noise sampling for those Y levels entirely.
            // The +16 buffer accounts for anomaly volatility boost.
            const yMaxScan = Math.min(WORLD_HEIGHT - 1,
                Math.ceil(baseHeight + Math.abs(volatility) * 2 + 16));
            
            for (let y = 0; y <= yMaxScan; y++) {
                if (y === 0) { setVoxel(x, y, z, 18); continue; }
                
                let heightDiff = y - baseHeight;
                let falloff = heightDiff > 0 ? heightDiff * 0.5 : heightDiff;
                
                const n3D = _wgPerlin3D.fbm3D(
                    x / (_wgSmoothness * 0.4),
                    y / (_wgSmoothness * 0.15),
                    z / (_wgSmoothness * 0.4),
                    4, 0.5, 2.0
                );
                
                const anomaly = _wgPerlinElevation.noise3D(x / 120, y / 120, z / 120);
                let activeVolatility = volatility;
                if (anomaly > 0.2) {
                    activeVolatility *= (1.0 + (anomaly - 0.2) * 5.0);
                }
                
                let betaCliffDensityBonus = 0.0;
                if (isBeta173Terrain && y > GEN_SEA_LEVEL + 6) {
                    // Global old-Beta overhang/shelf potential. This is
                    // intentionally not biome-specific: forest, plains,
                    // savanna, etc. can all inherit odd Beta terrain.
                    const shelfNoise = _wgPerlin3D.noise3D(x / 58, y / 35, z / 58);
                    const pocketNoise = _wgPerlin3D.noise3D(x / 92 + 600, y / 70 - 600, z / 92 + 1200);
                    if (shelfNoise > 0.34) {
                        betaCliffDensityBonus += (shelfNoise - 0.34) * 11.5;
                    }
                    if (pocketNoise > 0.42 && y > baseHeight - 10) {
                        betaCliffDensityBonus += (pocketNoise - 0.42) * 8.0;
                    }
                }

                let density = -falloff + (n3D * activeVolatility) + betaCliffDensityBonus;
                
                if (density > 0) {
                    setVoxel(x, y, z, 3);
                } else if (y <= GEN_SEA_LEVEL) {
                    setVoxel(x, y, z, 4, 8, 0, 1);
                }
            }
            
            // Fill water from yMaxScan+1 to GEN_SEA_LEVEL if we capped before reaching sea level
            // (only relevant if baseHeight is below sea level — i.e., ocean or river)
            if (yMaxScan < GEN_SEA_LEVEL) {
                for (let y = yMaxScan + 1; y <= GEN_SEA_LEVEL; y++) {
                    setVoxel(x, y, z, 4, 8, 0, 1);
                }
            }
        }
    }
    
    // PHASE 2: Surface & biome application
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const bIdx = lx + lz * CHUNK_SIZE;
            const biome = BIOME_NAMES[biomeData.biomes[bIdx]];
            
            const snowDepth = 2 + Math.floor((_wgPerlinElevation.noise2D(x * 0.1, z * 0.1) * 0.5 + 0.5) * 2);
            const dirtDepth = 2 + Math.floor((_wgPerlinVolatility.noise2D(x * 0.1, z * 0.1) * 0.5 + 0.5) * 2);
            // v334: wooded-badlands per-column verdict, latched on depth==0
            // and reused for depth 1..N so the grass cap and dirt subsurface
            // belong to the same column choice.
            let _wbColumnCache = false;
            
            let depth = -1;
            for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
                const block = getVoxel(x, y, z) & 0xFF;
                
                if (block === 0 || block === 4 || block === 27) { depth = -1; continue; }
                
                if (block === 3) {
                    depth++;
                    // v334: extend the badlands surface (terracotta / red
                    // sand / wooded grass) into the smoothly-blended border
                    // zone, not just the strict Voronoi cell. The heightmap
                    // already lifts terrain through that 24-block buffer,
                    // so without this the mesa rises into a grass-topped
                    // hill at the cell edge — clearly wrong. Using the
                    // blurred badlandsWeight here aligns the surface
                    // texture with the height transition.
                    const useBadlandsSurface = (biome === 'badlands')
                        || (biomeData.badlandsWeight && biomeData.badlandsWeight[bIdx] > 0.5);
                    if (useBadlandsSurface) {
                        // Wooded Badlands: noise-masked columns on the mesa
                        // plateaus get a plains-style cap (grass over dirt
                        // over stone) instead of red sand + terracotta.
                        // Decided per-column at depth==0 and cached so all
                        // four depth layers make a consistent choice.
                        if (depth === 0) _wbColumnCache = _isWoodedBadlandsColumn(x, y, z);
                        if (_wbColumnCache) {
                            if (depth === 0) {
                                setVoxel(x, y, z, 1); // Grass block
                            } else if (depth <= dirtDepth) {
                                setVoxel(x, y, z, 2); // Dirt
                            }
                            // Below dirtDepth: leave stone in place.
                            continue;
                        }
                        _applyBadlandsColumnBlock(x, y, z, depth);
                        continue;
                    }
                    if (depth === 0) {
                        if (y >= GEN_SEA_LEVEL - 1) {
                            let surfId = 1;
                            if (biome === 'desert') surfId = 15;
                            else if (biome === 'tundra') surfId = 39;
                            else if (biome === 'ice_spikes') surfId = 39; // v341: snow block top, same as tundra
                            else if (biome === 'ocean') surfId = 15; // Sandy beaches right at the edge
                            
                            // Beach override — skipped in flat overworld preset since ALL land is at sea level
                            if (!isOverworldPreset) {
                                if (y <= GEN_SEA_LEVEL + 1 && biome !== 'tundra' && biome !== 'taiga' && biome !== 'swamp' && biome !== 'ice_spikes') surfId = 15;
                                else if (y <= GEN_SEA_LEVEL + 1 && (biome === 'tundra' || biome === 'taiga' || biome === 'ice_spikes')) surfId = 5;
                            }
                            
                            // Swamp: use dirt for blocks at or below water level
                            if (biome === 'swamp' && y <= GEN_SEA_LEVEL) {
                                const aboveId = getVoxel(x, y + 1, z) & 0xFF;
                                if (aboveId === 4) surfId = 2; // Dirt under water
                            }
                            
                            // Extreme Hills: exposed stone and gravel at high elevations
                            if (biome === 'extreme_hills') {
                                const stoneNoise = _wgPerlinVolatility.noise2D(x * 0.08, z * 0.08);
                                if (y > GEN_SEA_LEVEL + 35 && stoneNoise > 0.1) {
                                    surfId = 3; // Exposed stone
                                } else if (y > GEN_SEA_LEVEL + 25 && stoneNoise > 0.4) {
                                    surfId = 5; // Gravel patches
                                }
                            }
                            
                            setVoxel(x, y, z, surfId);
                        } else {
                            // --- NEW: ORGANIC SEABED LOGIC ---
                            let floorId = 5; // Base ocean/lake floor is Gravel
                            
                            // Wide, sweeping patches of Dirt and Sand
                            const seabedNoise = _wgPerlinSeabed.fbm(x / 45, z / 45, 2);
                            if (seabedNoise > 0.25) floorId = 2; // Dirt
                            else if (seabedNoise < -0.25) floorId = 15; // Sand
                            
                            // Tight, high-frequency pockets of Clay
                            const clayNoise = _wgPerlinClay.fbm(x / 20, z / 20, 2);
                            if (clayNoise > 0.45) floorId = 61; // Clay
                            
                            setVoxel(x, y, z, floorId);
                        }
                    } else {
                        // Sub-surface layers
                        if (y < GEN_SEA_LEVEL - 1 && depth < 3) {
                            // Extrude the seabed materials 3 blocks deep so they can be effectively mined
                            let subId = 5; 
                            
                            const seabedNoise = _wgPerlinSeabed.fbm(x / 45, z / 45, 2);
                            if (seabedNoise > 0.25) subId = 2;
                            else if (seabedNoise < -0.25) subId = 15;
                            
                            const clayNoise = _wgPerlinClay.fbm(x / 20, z / 20, 2);
                            if (clayNoise > 0.45) subId = 61;
                            
                            setVoxel(x, y, z, subId);
                        } else if (biome === 'tundra') {
                            // ... keep your existing tundra logic here ...
                            if (y >= GEN_SEA_LEVEL - 1) {
                                if (depth < snowDepth) setVoxel(x, y, z, 39);
                                else if (depth < snowDepth + dirtDepth) setVoxel(x, y, z, 2);
                            } else {
                                if (depth < dirtDepth) setVoxel(x, y, z, 2);
                            }
                        } else if (biome === 'ice_spikes') {
                            // v341: ice_spikes shares tundra's snow + dirt
                            // stack. Surface treatment is otherwise identical
                            // — the unique features (packed-ice spikes, ice
                            // patches) come later, after surface generation.
                            // MC's biome is technically "snowy plains spikes"
                            // i.e. snowy plains underneath, so we want this
                            // to match tundra's snow/dirt subsurface exactly.
                            if (y >= GEN_SEA_LEVEL - 1) {
                                if (depth < snowDepth) setVoxel(x, y, z, 39);
                                else if (depth < snowDepth + dirtDepth) setVoxel(x, y, z, 2);
                            } else {
                                if (depth < dirtDepth) setVoxel(x, y, z, 2);
                            }
                        } else {
                            // ... keep your existing default sub-surface logic here ...
                            if (depth < 3) {
                                let subId = 2;
                                const aboveId = getVoxel(x, y+1, z) & 0xFF;
                                if (biome === 'desert') subId = 19;
                                if (y < GEN_SEA_LEVEL + 2) {
                                    if (aboveId === 15) subId = 15;
                                    else if (aboveId === 5) subId = 5;
                                }
                                setVoxel(x, y, z, subId);
                            }
                        }
                    }
                }
            }
        }
    }
    
    // PHASE 2.5: Ice on water in snowy biomes (tundra, taiga, ice_spikes)
    // Replace the top water source block at sea level with ice where the block above is air
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const bIdx = lx + lz * CHUNK_SIZE;
            const biome = BIOME_NAMES[biomeData.biomes[bIdx]];
            if (biome !== 'tundra' && biome !== 'taiga' && biome !== 'ice_spikes') continue;
            
            const x = startX + lx;
            const z = startZ + lz;
            
            // Scan down from sea level to find the top water block
            for (let y = GEN_SEA_LEVEL; y >= GEN_SEA_LEVEL - 2; y--) {
                const blockId = getVoxel(x, y, z) & 0xFF;
                const aboveId = getVoxel(x, y + 1, z) & 0xFF;
                if (blockId === 4 && (aboveId === 0 || aboveId === 40)) {
                    // Water with air or snow above — freeze it
                    setVoxel(x, y, z, 95); // Ice
                    break;
                }
                if (blockId !== 0 && blockId !== 40 && blockId !== 4) break; // Hit solid, stop
            }
        }
    }
    
    // PHASE 3: Cave Tunnels (Worm Carver)
    // Each chunk region has a chance to spawn cave systems. Worms start a few blocks
    // below surface, then descend. They carve only within the current chunk but the
    // worm path is simulated across chunk boundaries for seamless caves.
    // Key design: worms never call getHighestBlock for cross-chunk coordinates.
    // Instead, the entry Y is used as the surface reference, and worms only carve
    // blocks that are solid stone-type (so they naturally stop at air/surface).
    if (GEN_CAVES) {
        const caveMinY = (typeof GEN_CAVE_MIN_Y !== 'undefined') ? GEN_CAVE_MIN_Y : 2;
        const caveLavaY = (typeof GEN_CAVE_LAVA_Y !== 'undefined') ? GEN_CAVE_LAVA_Y : 6;
        const tunnelFreqMult = (typeof GEN_TUNNEL_FREQUENCY !== 'undefined' ? GEN_TUNNEL_FREQUENCY : 100) / 100;
        const tunnelLenMult = (typeof GEN_TUNNEL_LENGTH !== 'undefined' ? GEN_TUNNEL_LENGTH : 100) / 100;
        const tunnelRadMult = (typeof GEN_TUNNEL_RADIUS !== 'undefined' ? GEN_TUNNEL_RADIUS : 100) / 100;
        const tunnelMaxY = (typeof GEN_TUNNEL_MAX_Y !== 'undefined') ? GEN_TUNNEL_MAX_Y : 80;
        const tunnelBranchChance = (typeof GEN_TUNNEL_BRANCH !== 'undefined' ? GEN_TUNNEL_BRANCH : 50) / 100;
        const caveSizeMult = (typeof GEN_CAVE_SIZE !== 'undefined' ? GEN_CAVE_SIZE : 100) / 100;
        
        // PERF: Clear per-chunk surface Y cache for cave carving
        if (_caveSurfYCache) _caveSurfYCache.clear();
        else _caveSurfYCache = new Map();
        
        // The chunk boundaries for carving — only carve blocks inside this chunk
        const chunkMinX = startX;
        const chunkMaxX = startX + CHUNK_SIZE - 1;
        const chunkMinZ = startZ;
        const chunkMaxZ = startZ + CHUNK_SIZE - 1;
        
        // Carve a worm tunnel. The worm path is fully simulated (even outside this chunk)
        // but only blocks within [chunkMinX..chunkMaxX, chunkMinZ..chunkMaxZ] are carved.
        function _carveWorm(rng, startWX, startWY, startWZ, maxSteps, baseRadius, startYaw, startPitch, depth) {
            let wx = startWX, wy = startWY, wz = startWZ;
            let yaw = startYaw, pitch = startPitch;
            const rad = baseRadius * tunnelRadMult;
            
            for (let step = 0; step < maxSteps; step++) {
                const t = step / maxSteps;
                
                // Taper smoothly at both ends
                let taper = 1.0;
                if (t < 0.08) taper = t / 0.08;
                else if (t > 0.9) taper = (1.0 - t) / 0.1;
                taper = Math.max(0, Math.min(1, taper));
                
                // Room wobble: periodic widening for natural variation
                const roomWobble = 1.0 + Math.sin(step * 0.12) * 0.4 * caveSizeMult;
                const r = Math.max(0.6, rad * taper * roomWobble);
                
                // Wobble direction
                yaw += (rng() - 0.5) * 0.5;
                pitch += (rng() - 0.5) * 0.35;
                pitch = Math.max(-1.2, Math.min(0.6, pitch));
                
                // Advance position
                wx += Math.cos(yaw) * Math.cos(pitch);
                wy += Math.sin(pitch);
                wz += Math.sin(yaw) * Math.cos(pitch);
                
                // Clamp Y
                if (wy < caveMinY + 1) { pitch = Math.abs(pitch) * 0.3; wy = caveMinY + 1; }
                if (wy > tunnelMaxY) { pitch = -Math.abs(pitch) * 0.5; wy = tunnelMaxY; }
                
                // Branch check — always consume RNG for determinism even if we skip carving
                const branchRoll = rng();
                const branchShouldSpawn = (depth < 2 && step > 8 && step < maxSteps - 8 && branchRoll < tunnelBranchChance * 0.025);
                
                // Quick bounding-box check: is any part of this sphere near our chunk?
                const cix = Math.floor(wx);
                const ciy = Math.floor(wy);
                const ciz = Math.floor(wz);
                const ri = Math.ceil(r) + 1;
                
                const sphereInChunk = (cix + ri >= chunkMinX && cix - ri <= chunkMaxX &&
                                       ciz + ri >= chunkMinZ && ciz - ri <= chunkMaxZ);
                
                if (sphereInChunk) {
                    // Carve sphere — only blocks inside this chunk
                    const rSq = r * r;
                    
                    for (let dx = -ri; dx <= ri; dx++) {
                        for (let dy = -ri; dy <= ri; dy++) {
                            for (let dz = -ri; dz <= ri; dz++) {
                                const distSq = dx * dx + dy * dy * 1.4 + dz * dz;
                                if (distSq > rSq) continue;
                                
                                const bx = cix + dx;
                                const by = ciy + dy;
                                const bz = ciz + dz;
                                
                                if (bx < chunkMinX || bx > chunkMaxX || bz < chunkMinZ || bz > chunkMaxZ) continue;
                                if (by < caveMinY || by >= WORLD_HEIGHT - 1) continue;
                                
                                const blockId = getVoxel(bx, by, bz) & 0xFF;
                                // Only carve stone-type blocks (and dirt/grass for surface exposure)
                                if (blockId !== 3 && blockId !== 2 && blockId !== 1 && blockId !== 15 &&
                                    blockId !== 19 && blockId !== 5 && blockId !== 39) continue;
                                
                                // Don't carve the very top 1 block to preserve the grass layer.
                                // Cached: getHighestBlock scans the entire Y column each call,
                                // but inside a sphere we hit the same (bx,bz) many times.
                                const surfKey = bx * 65536 + (bz & 0xFFFF);
                                let surfY = _caveSurfYCache.get(surfKey);
                                if (surfY === undefined) {
                                    surfY = getHighestBlock(bx, bz);
                                    _caveSurfYCache.set(surfKey, surfY);
                                }
                                if (by >= surfY) continue;
                                
                                // Don't carve near ocean/river water
                                if (by <= GEN_SEA_LEVEL + 2) {
                                    let touchesWater = false;
                                    for (const [nx, ny, nz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                                        if ((getVoxel(bx+nx, by+ny, bz+nz) & 0xFF) === 4) { touchesWater = true; break; }
                                    }
                                    if (touchesWater) continue;
                                }
                                
                                if (by <= caveLavaY) {
                                    setVoxel(bx, by, bz, 27, 4, 0, 1);
                                } else {
                                    setVoxel(bx, by, bz, 0);
                                }
                            }
                        }
                    }
                }
                
                // Spawn branch (after carving so RNG state is consistent)
                if (branchShouldSpawn) {
                    const branchLen = Math.floor(maxSteps * (0.25 + rng() * 0.35));
                    const branchYaw = yaw + (rng() - 0.5) * 2.8;
                    const branchPitch = pitch + (rng() - 0.5) * 0.6;
                    const branchRad = rad * (0.5 + rng() * 0.4) / tunnelRadMult;
                    _carveWorm(rng, wx, wy, wz, branchLen, branchRad, branchYaw, branchPitch, depth + 1);
                }
            }
        }
        
        // For each nearby chunk region, deterministically decide if it spawns caves,
        // then simulate the full worm paths and carve only within our chunk.
        const wormReach = 8;
        for (let rcx = cx - wormReach; rcx <= cx + wormReach; rcx++) {
            for (let rcz = cz - wormReach; rcz <= cz + wormReach; rcz++) {
                const rng = _chunkSeededRandom(rcx * 5 + 4219, rcz * 5 + 8731);
                
                // ~1 in 6 chunks spawns a cave system
                if (rng() > (1.0 / 6.0) * tunnelFreqMult) continue;
                
                // 1-3 worms per system
                const numWorms = 1 + Math.floor(rng() * 2.5);
                
                for (let w = 0; w < numWorms; w++) {
                    // Pick origin X/Z in the source chunk
                    const ox = rcx * CHUNK_SIZE - halfW + Math.floor(rng() * CHUNK_SIZE);
                    const oz = rcz * CHUNK_SIZE - halfD + Math.floor(rng() * CHUNK_SIZE);
                    
                    // Estimate surface Y: use elevation noise (same noise as terrain gen)
                    // This works for any coordinate without needing the chunk to be generated.
                    const bScale = _wgBiomeScale || 300;
                    const elev = _wgPerlinElevation.fbm(ox / (bScale * 1.2), oz / (bScale * 1.2), 4);
                    const approxSurfY = Math.floor(GEN_SEA_LEVEL + elev * 30 * _wgTerrainMult);
                    
                    if (approxSurfY < 15) {
                        // Consume RNG to stay deterministic
                        rng(); rng(); rng(); rng(); rng();
                        continue;
                    }
                    
                    // Entry point: mix of shallow and deep starts.
                    // Some worms start just 1-3 blocks below surface (surface-breaking caves)
                    // Others start deeper (traditional underground caves)
                    const depthRoll = rng();
                    let oy;
                    if (depthRoll < 0.35) {
                        // Shallow start — these are the ones that break the surface on slopes
                        oy = Math.max(caveMinY + 5, approxSurfY - 1 - Math.floor(rng() * 4));
                    } else {
                        // Deep start — traditional underground caves
                        oy = Math.max(caveMinY + 5, approxSurfY - 5 - Math.floor(rng() * 15));
                    }
                    
                    const wormLength = Math.floor((50 + rng() * 100) * tunnelLenMult);
                    const wormRadius = 1.2 + rng() * 1.8;
                    const wormYaw = rng() * Math.PI * 2;
                    // Mix of downward, horizontal, and slightly upward initial pitches
                    // This allows some tunnels to carve along the surface or rise into hillsides
                    const pitchRoll = rng();
                    let wormPitch;
                    if (pitchRoll < 0.3) {
                        wormPitch = -0.05 + rng() * 0.15;   // Nearly horizontal / slightly up
                    } else if (pitchRoll < 0.6) {
                        wormPitch = -(0.1 + rng() * 0.3);   // Gentle descent
                    } else {
                        wormPitch = -(0.3 + rng() * 0.6);   // Steep descent (original)
                    }
                    
                    _carveWorm(rng, ox, oy, oz, wormLength, wormRadius, wormYaw, wormPitch, 0);
                }
            }
        }
    }
    
    // PHASE 3.5: Ravines
    if (GEN_CAVES && (typeof GEN_WORLD_TYPE === 'undefined' || GEN_WORLD_TYPE !== 6)) {
        const ravineFreq = (typeof GEN_RAVINE_FREQUENCY !== 'undefined' ? GEN_RAVINE_FREQUENCY : 100) / 100;
        const ravineDepthMult = (typeof GEN_RAVINE_DEPTH !== 'undefined' ? GEN_RAVINE_DEPTH : 100) / 100;
        const ravineWideMult = (typeof GEN_RAVINE_WIDTH !== 'undefined' ? GEN_RAVINE_WIDTH : 100) / 100;
        const caveLavaY = (typeof GEN_CAVE_LAVA_Y !== 'undefined') ? GEN_CAVE_LAVA_Y : 6;
        
        const checkRadius = 10;
        for (let rcx = cx - checkRadius; rcx <= cx + checkRadius; rcx++) {
            for (let rcz = cz - checkRadius; rcz <= cz + checkRadius; rcz++) {
                const rRng = _chunkSeededRandom(rcx * 3 + 7919, rcz * 3 + 6271);
                if (rRng() > 0.02 * ravineFreq) continue;
                
                const origX = rcx * CHUNK_SIZE - halfW + Math.floor(rRng() * CHUNK_SIZE);
                const origZ = rcz * CHUNK_SIZE - halfD + Math.floor(rRng() * CHUNK_SIZE);
                const origSurfY = getHighestBlock(origX, origZ);
                if (origSurfY < GEN_SEA_LEVEL + 2) continue;
                
                const angle = rRng() * Math.PI * 2;
                const length = 80 + Math.floor(rRng() * 80);
                const ravineDepth = Math.floor((20 + rRng() * 20) * ravineDepthMult);
                const baseTopWidth = (2.5 + rRng() * 2.5) * ravineWideMult;
                const baseBottomWidth = (0.5 + rRng() * 1.0) * ravineWideMult;
                // Perpendicular width is narrower — gives elongated cross-section along travel direction
                const perpWidthRatio = 0.6 + rRng() * 0.3; // 60-90% of main width
                
                let pathX = origX, pathZ = origZ;
                const dirX = Math.cos(angle);
                const dirZ = Math.sin(angle);
                // Perpendicular direction for cross-section width
                const perpX = -dirZ;
                const perpZ = dirX;
                let wobbleAngle = 0;
                
                // Pre-walk to collect path points for smooth tapering
                const pathPoints = [];
                let tmpX = origX, tmpZ = origZ, tmpWob = 0;
                for (let step = 0; step < length; step++) {
                    tmpWob += (rRng() - 0.5) * 0.15;
                    tmpX += dirX + Math.cos(tmpWob) * 0.3;
                    tmpZ += dirZ + Math.sin(tmpWob) * 0.3;
                    pathPoints.push({ x: tmpX, z: tmpZ });
                }
                
                // Carve along path
                for (let step = 0; step < length; step++) {
                    const pt = pathPoints[step];
                    const ix = Math.floor(pt.x);
                    const iz = Math.floor(pt.z);
                    
                    // Smooth taper: cubic ease at ends for natural blending (no flat walls)
                    let endT = 1.0;
                    const fadeLen = 20;
                    if (step < fadeLen) {
                        const t = step / fadeLen;
                        endT = t * t * (3 - 2 * t); // smoothstep
                    } else if (step > length - fadeLen) {
                        const t = (length - step) / fadeLen;
                        endT = t * t * (3 - 2 * t);
                    }
                    
                    const surfY = getHighestBlock(ix, iz);
                    if (surfY < 10) continue;
                    
                    const carveTopY = surfY - 1;
                    const carveBottomY = Math.max(2, surfY - Math.floor(ravineDepth * endT));
                    if (carveTopY <= carveBottomY) continue;
                    
                    // Max width at this step
                    const stepTopW = baseTopWidth * endT;
                    const stepBottomW = baseBottomWidth * endT;
                    const maxRadius = Math.ceil(stepTopW) + 1;
                    
                    for (let cy = carveBottomY; cy <= carveTopY; cy++) {
                        // Width interpolates from bottom to top
                        const vt = (cy - carveBottomY) / Math.max(1, carveTopY - carveBottomY);
                        const mainW = stepBottomW + (stepTopW - stepBottomW) * vt;
                        const perpW = mainW * perpWidthRatio;
                        
                        if (mainW < 0.3) continue;
                        
                        // Carve an elliptical cross-section
                        for (let dx = -maxRadius; dx <= maxRadius; dx++) {
                            for (let dz = -maxRadius; dz <= maxRadius; dz++) {
                                // Project dx,dz onto the ravine's main and perp axes
                                const alongMain = dx * perpX + dz * perpZ; // distance along perpendicular
                                const alongPerp = dx * dirX + dz * dirZ;  // distance along travel direction
                                
                                // Elliptical distance check
                                const distSq = (alongMain * alongMain) / (mainW * mainW + 0.01) +
                                               (alongPerp * alongPerp) / (perpW * perpW + 0.01);
                                if (distSq > 1.0) continue;
                                
                                const wx = ix + dx;
                                const wz = iz + dz;
                                
                                // Check if within this chunk
                                const lx = wx - startX;
                                const lz = wz - startZ;
                                if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
                                
                                const blockId = getVoxel(wx, cy, wz) & 0xFF;
                                if (blockId === 0 || blockId === 4 || blockId === 27 || blockId === 18) continue;
                                if (isFluidBlock(blockId)) continue;
                                
                                // Don't carve near water
                                if (cy <= GEN_SEA_LEVEL + 1) {
                                    let touchesWater = false;
                                    for (const [nx, ny, nz] of [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1]]) {
                                        if ((getVoxel(wx+nx, cy+ny, wz+nz) & 0xFF) === 4) { touchesWater = true; break; }
                                    }
                                    if (touchesWater) continue;
                                }
                                
                                if (cy <= caveLavaY) {
                                    setVoxel(wx, cy, wz, 27, 4, 0, 1);
                                } else {
                                    setVoxel(wx, cy, wz, 0);
                                }
                            }
                        }
                    }
                    
                    // Surface blending: fix the rim where ravine meets terrain surface
                    // Use biome-appropriate materials (grass+dirt, sand+sandstone, snow, etc.)
                    for (let dx = -maxRadius - 1; dx <= maxRadius + 1; dx++) {
                        for (let dz = -maxRadius - 1; dz <= maxRadius + 1; dz++) {
                            const wx = ix + dx;
                            const wz = iz + dz;
                            const lx = wx - startX;
                            const lz = wz - startZ;
                            if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
                            
                            const colSurfY = getHighestBlock(wx, wz);
                            if (colSurfY < GEN_SEA_LEVEL - 2) continue;
                            
                            const topBid = getVoxel(wx, colSurfY, wz) & 0xFF;
                            const aboveId = getVoxel(wx, colSurfY + 1, wz) & 0xFF;
                            if (aboveId !== 0) continue; // Only fix blocks exposed to air
                            
                            // Only fix raw stone/dirt that was exposed by the ravine carve
                            if (topBid !== 3 && topBid !== 2) continue;
                            
                            // Get biome at this position
                            const bIdx2 = (wx - startX) + (wz - startZ) * CHUNK_SIZE;
                            var rimBiome = 'plains';
                            if (bIdx2 >= 0 && bIdx2 < CHUNK_SIZE * CHUNK_SIZE) {
                                rimBiome = BIOME_NAMES[biomeData.biomes[bIdx2]] || 'plains';
                            }
                            
                            // Apply biome-appropriate surface layers
                            if (rimBiome === 'badlands') {
                                _applyBadlandsColumnBlock(wx, colSurfY, wz, 0);
                                if ((getVoxel(wx, colSurfY - 1, wz) & 0xFF) === 3) _applyBadlandsColumnBlock(wx, colSurfY - 1, wz, 1);
                                if ((getVoxel(wx, colSurfY - 2, wz) & 0xFF) === 3) _applyBadlandsColumnBlock(wx, colSurfY - 2, wz, 2);
                            } else if (rimBiome === 'desert') {
                                // Sand on top, sandstone below
                                setVoxel(wx, colSurfY, wz, 15); // Sand
                                if ((getVoxel(wx, colSurfY - 1, wz) & 0xFF) === 3) {
                                    setVoxel(wx, colSurfY - 1, wz, 19); // Sandstone
                                }
                                if ((getVoxel(wx, colSurfY - 2, wz) & 0xFF) === 3) {
                                    setVoxel(wx, colSurfY - 2, wz, 19); // Sandstone
                                }
                            } else if (rimBiome === 'tundra') {
                                setVoxel(wx, colSurfY, wz, 39); // Snow block
                                if ((getVoxel(wx, colSurfY - 1, wz) & 0xFF) === 3) {
                                    setVoxel(wx, colSurfY - 1, wz, 2); // Dirt
                                }
                            } else {
                                // Grass biomes: grass on top, dirt below
                                setVoxel(wx, colSurfY, wz, 1); // Grass
                                if ((getVoxel(wx, colSurfY - 1, wz) & 0xFF) === 3) {
                                    setVoxel(wx, colSurfY - 1, wz, 2); // Dirt
                                }
                                if ((getVoxel(wx, colSurfY - 2, wz) & 0xFF) === 3) {
                                    setVoxel(wx, colSurfY - 2, wz, 2); // Dirt
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // PHASE 3.6: Ice Spikes + Ice Patches (v341)
    // Surface features for the ice_spikes biome — MC-style packed-ice
    // spikes (two variants) and 5x5 ice patches. Runs AFTER caves and
    // ravines so we don't carve through a placed spike, and BEFORE ores
    // (which target stone underground) and trees (which we'd want growing
    // around spikes, except this biome has no trees anyway).
    //
    // Density: ~1.2% per-column for spikes (~3 per chunk on average), of
    // which ~20% are tall variants — gives ~2-3 short and 0-1 tall per
    // 16x16, matching MC's visual density. Ice patches at ~1.8% per
    // column, on top of that.
    //
    // Chunk boundaries: each spike footprint must fit entirely within the
    // chunk so the worker doesn't have to write into neighbor cells (which
    // it can't, except via fragile margin tricks). We skip spawn attempts
    // near the chunk edge by a `margin` matching the spike base radius.
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const bIdx = lx + lz * CHUNK_SIZE;
            const biome = BIOME_NAMES[biomeData.biomes[bIdx]];
            if (biome !== 'ice_spikes') continue;

            const x = startX + lx;
            const z = startZ + lz;

            // Locate the surface (skip snow-layer overlays).
            let surfaceY = -1;
            for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
                const id = getVoxel(x, y, z) & 0xFF;
                if (id !== 0 && id !== 40) { surfaceY = y; break; }
            }
            if (surfaceY < GEN_SEA_LEVEL) continue; // skip underwater columns
            const surfId = getVoxel(x, surfaceY, z) & 0xFF;
            if (surfId !== 39 && surfId !== 2) continue; // only on snow or dirt

            const roll = seededRandom();
            if (roll < 0.0135) {
                // Spike attempt. Around 20% tall, 80% short, with the shape
                // itself randomized in _generateIceSpike so repeated spikes
                // no longer look like cloned cones/columns.
                const isTall = seededRandom() < 0.20;
                const margin = _getIceSpikeMargin(isTall, seededRandom);
                if (lx < margin || lx >= CHUNK_SIZE - margin || lz < margin || lz >= CHUNK_SIZE - margin) continue;
                _generateIceSpike(x, surfaceY + 1, z, isTall, seededRandom);
            } else if (roll < 0.0315) {
                // Ice patch attempt. The patch fits in a 5x5 footprint, so
                // we use a 2-block margin for it too — keeps the disk inside
                // the chunk and avoids the per-tile boundary writes.
                if (lx < 2 || lx >= CHUNK_SIZE - 2 || lz < 2 || lz >= CHUNK_SIZE - 2) continue;
                _generateIcePatch(x, surfaceY, z);
            }
        }
    }

    // PHASE 4: Ores (per-chunk)
    const abundanceMult = (GEN_ORE_ABUNDANCE / 100);
    
    const placeChunkBlobs = (id, blobsPerChunk, minSize, maxSize, minY, maxY) => {
        const totalBlobs = Math.round(blobsPerChunk * abundanceMult);
        for (let i = 0; i < totalBlobs; i++) {
            let bx = startX + Math.floor(seededRandom() * CHUNK_SIZE);
            let bz = startZ + Math.floor(seededRandom() * CHUNK_SIZE);
            let by = minY + Math.floor(seededRandom() * (maxY - minY));
            
            const targetSize = minSize + Math.floor(seededRandom() * (maxSize - minSize + 1));
            const radius = Math.pow(targetSize, 1/3) * 0.75 + 0.5;
            const rSq = radius * radius;
            const bound = Math.ceil(radius);
            
            let blocksPlaced = 0, blobDone = false;
            for (let ox = -bound; ox <= bound && !blobDone; ox++) {
                for (let oy = -bound; oy <= bound && !blobDone; oy++) {
                    for (let oz = -bound; oz <= bound && !blobDone; oz++) {
                        if (ox*ox + oy*oy + oz*oz <= rSq * (0.8 + seededRandom() * 0.4)) {
                            if ((getVoxel(bx + ox, by + oy, bz + oz) & 0xFF) === 3) {
                                setVoxel(bx + ox, by + oy, bz + oz, id);
                                blocksPlaced++;
                                if (blocksPlaced >= targetSize) blobDone = true;
                            }
                        }
                    }
                }
            }
        }
    };
    
    placeChunkBlobs(7,  20, 10, 16, 1, 255);
    placeChunkBlobs(6,  20, 4,  8,  1, 63);
    placeChunkBlobs(8,  2,  3,  8,  1, 31);
    placeChunkBlobs(49, 8,  4,  8,  1, 15);
    placeChunkBlobs(50, 1,  3,  6,  1, 31);
    placeChunkBlobs(9,  1,  2,  8,  1, 15);
    // v297: stone variants spawn as larger blobs (was 3/15/32, now 5/20/48)
    // v297: dirt patches in stone, similar size to gravel patches
    placeChunkBlobs(10, 5, 20, 48, 1, 80); // Diorite
    placeChunkBlobs(11, 5, 20, 48, 1, 80); // Granite
    placeChunkBlobs(12, 5, 20, 48, 1, 80); // Andesite
    placeChunkBlobs(5,  4, 15, 32, 1, 80); // Gravel
    placeChunkBlobs(2,  4, 20, 40, 1, 80); // Dirt patches in stone
        
    // PHASE 6: Underground springs
    const springCount = 2;
    for (let attempt = 0; attempt < springCount; attempt++) {
        const sx = startX + 2 + Math.floor(seededRandom() * (CHUNK_SIZE - 4));
        const sz = startZ + 2 + Math.floor(seededRandom() * (CHUNK_SIZE - 4));
        const sy = 7 + Math.floor(seededRandom() * 33);
        if ((getVoxel(sx, sy, sz) & 0xFF) !== 0) continue;
        let solidCount = 0;
        for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
            const nId = getVoxel(sx+dx, sy+dy, sz+dz) & 0xFF;
            if (nId !== 0 && !isFluidBlock(nId) && !isCrossBlock(nId)) solidCount++;
        }
        if (solidCount < 3) continue;
        setVoxel(sx, sy, sz, 4, 8, 0, 1);
    }
    
    // PHASE 7: Trees & Foliage
    if (GEN_STRUCTURES) {
        const treeScale = (GEN_TREE_DENSITY / 100.0);
        
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const x = startX + lx;
                const z = startZ + lz;
                const bIdx = lx + lz * CHUNK_SIZE;
                const biome = BIOME_NAMES[biomeData.biomes[bIdx]];
                const y = getHighestBlock(x, z);
                if (y < GEN_SEA_LEVEL) continue;
                
                const surfId = getVoxel(x, y, z) & 0xFF;
                
                let treeChance = 0;
                const isBeta173Decor = (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 6);
                if (isBeta173Decor) {
                    // Approximate old Beta per-biome tree density. Rain Forest
                    // is intentionally dense and gets a high big-tree chance
                    // below; Savanna/Plains are open.
                    if (biome === 'rainforest') treeChance = 0.040;
                    else if (biome === 'forest') treeChance = 0.018;
                    else if (biome === 'seasonal_forest') treeChance = 0.012;
                    else if (biome === 'savanna') treeChance = 0.0015;
                    else if (biome === 'taiga') treeChance = 0.020;
                    else if (biome === 'plains') treeChance = 0.0005;
                    else if (biome === 'tundra') treeChance = 0.0006;
                    else if (biome === 'swamp') treeChance = 0.006;
                    else if (biome === 'desert') treeChance = 0.0015;
                } else {
                    if (biome === 'rainforest') treeChance = 0.025;
                    else if (biome === 'forest') treeChance = 0.012;
                    else if (biome === 'seasonal_forest') treeChance = 0.010;
                    else if (biome === 'savanna') treeChance = 0.002;
                    else if (biome === 'alpha_forest') treeChance = 0.012;
                    else if (biome === 'taiga') treeChance = 0.02;
                    else if (biome === 'plains') treeChance = 0.0005;
                    else if (biome === 'tundra') treeChance = 0.001;
                    else if (biome === 'ice_spikes') treeChance = 0; // v341: no trees in MC ice spikes
                    else if (biome === 'desert') treeChance = 0.002;
                    else if (biome === 'badlands') {
                        // v334: wooded badlands sections (grass surface) want
                        // visible oak coverage; the regular red-sand basin keeps
                        // its sparse dead-bush look unchanged.
                        treeChance = (surfId === 1) ? 0.010 : 0.002;
                    }
                    else if (biome === 'swamp') treeChance = 0.008;
                    else if (biome === 'jungle') treeChance = 0.035;
                    else if (biome === 'extreme_hills') treeChance = 0.003;
                }
                
                treeChance *= treeScale;
                
                // Apply per-biome tree density override
                if (typeof GEN_BIOME_OVERRIDES !== 'undefined' && GEN_BIOME_OVERRIDES[biome]) {
                    treeChance *= (GEN_BIOME_OVERRIDES[biome].treeDensity / 100);
                }
                
                if (seededRandom() < treeChance) {
                    if ((biome === 'desert' && surfId === 15) || (biome === 'badlands' && surfId === BADLANDS_RED_SAND)) {
                        const ch = 1 + Math.floor(seededRandom() * 3);
                        let canPlace = true;
                        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                            if ((getVoxel(x+dx, y+1, z+dz) & 0xFF) !== 0) canPlace = false;
                        }
                        if (canPlace) {
                            for (let cy = 1; cy <= ch; cy++) setVoxel(x, y+cy, z, 20);
                        }
                    } else if (biome === 'swamp' && surfId === 1) {
                        // Swamp oak: variable trunk (5-8), wide canopy, vines hanging from leaves
                        const trunkHeight = 5 + Math.floor(seededRandom() * 4);
                        for (let ly = 1; ly <= trunkHeight; ly++) setVoxel(x, y + ly, z, 13);
                        
                        // Wide canopy starting 3 below top
                        for (let ly = y + trunkHeight - 3; ly <= y + trunkHeight + 1; ly++) {
                            const yDist = ly - (y + trunkHeight);
                            let radius;
                            if (yDist <= -2) radius = 3;
                            else if (yDist <= -1) radius = 3;
                            else if (yDist === 0) radius = 2;
                            else radius = 1;
                            for (let llx = -radius; llx <= radius; llx++) {
                                for (let llz = -radius; llz <= radius; llz++) {
                                    if (Math.abs(llx) === radius && Math.abs(llz) === radius) {
                                        if (seededRandom() < 0.4) continue;
                                    }
                                    if (llx === 0 && llz === 0 && ly <= y + trunkHeight) continue;
                                    if ((getVoxel(x+llx, ly, z+llz) & 0xFF) === 0) {
                                        setVoxel(x+llx, ly, z+llz, 14);
                                    }
                                }
                            }
                        }
                        
                        // Hang vines from leaf edges
                        for (let ly = y + trunkHeight - 3; ly <= y + trunkHeight; ly++) {
                            for (let llx = -3; llx <= 3; llx++) {
                                for (let llz = -3; llz <= 3; llz++) {
                                    if (llx === 0 && llz === 0) continue;
                                    const leafId = getVoxel(x+llx, ly, z+llz) & 0xFF;
                                    if (leafId !== 14) continue;
                                    
                                    // Check each side for air to hang a vine
                                    const vineChecks = [
                                        { dx: 1, dz: 0, dir: 1 },  // vine on -X face
                                        { dx: -1, dz: 0, dir: 2 }, // vine on +X face
                                        { dx: 0, dz: 1, dir: 3 },  // vine on -Z face
                                        { dx: 0, dz: -1, dir: 4 }  // vine on +Z face
                                    ];
                                    for (const vc of vineChecks) {
                                        const nx = x+llx+vc.dx, nz = z+llz+vc.dz;
                                        if ((getVoxel(nx, ly, nz) & 0xFF) === 0 && seededRandom() < 0.35) {
                                            // Place vine and let it hang down 1-3 blocks
                                            const vineLen = 1 + Math.floor(seededRandom() * 3);
                                            for (let vl = 0; vl < vineLen; vl++) {
                                                if ((getVoxel(nx, ly - vl, nz) & 0xFF) === 0) {
                                                    setVoxel(nx, ly - vl, nz, 66, vc.dir);
                                                } else break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else if (biome === 'jungle' && surfId === 1) {
                        // --- JUNGLE BIOME TREES ---
                        const jungleRoll = seededRandom();
                        
                        if (jungleRoll < 0.12) {
                            // BIG 2x2 JUNGLE TREE (15-26 tall, like MC)
                            const trunkHeight = 15 + Math.floor(seededRandom() * 12);
                            
                            // Place 2x2 trunk
                            for (let ly = 1; ly <= trunkHeight; ly++) {
                                for (let dx2 = 0; dx2 <= 1; dx2++) {
                                    for (let dz2 = 0; dz2 <= 1; dz2++) {
                                        setVoxel(x + dx2, y + ly, z + dz2, 96);
                                    }
                                }
                            }
                            
                            // Large canopy
                            const canopyBottom = y + trunkHeight - 5 - Math.floor(seededRandom() * 3);
                            const canopyTop = y + trunkHeight + 2;
                            for (let ly = canopyBottom; ly <= canopyTop; ly++) {
                                const yDist = ly - (y + trunkHeight);
                                let rad;
                                if (yDist <= -4) rad = 2;
                                else if (yDist <= -2) rad = 4;
                                else if (yDist <= 0) rad = 3;
                                else if (yDist === 1) rad = 2;
                                else rad = 1;
                                
                                for (let llx = -rad; llx <= rad + 1; llx++) {
                                    for (let llz = -rad; llz <= rad + 1; llz++) {
                                        const ddx = llx - 0.5, ddz = llz - 0.5;
                                        const dist = Math.sqrt(ddx * ddx + ddz * ddz);
                                        if (dist > rad + 0.5) continue;
                                        if (dist > rad - 0.5 && seededRandom() < 0.35) continue;
                                        const cur = getVoxel(x + llx, ly, z + llz) & 0xFF;
                                        if (cur === 0) setVoxel(x + llx, ly, z + llz, 97);
                                    }
                                }
                            }
                            
                            // Branches
                            const numBr = 2 + Math.floor(seededRandom() * 3);
                            for (let b = 0; b < numBr; b++) {
                                const brY = y + 6 + Math.floor(seededRandom() * (trunkHeight - 10));
                                const angle = seededRandom() * Math.PI * 2;
                                const bLen = 3 + Math.floor(seededRandom() * 3);
                                let bxp = x + 0.5, bzp = z + 0.5;
                                for (let l = 0; l < bLen; l++) {
                                    bxp += Math.cos(angle) * 0.8;
                                    bzp += Math.sin(angle) * 0.8;
                                    const ix = Math.round(bxp), iz = Math.round(bzp), iy = brY + l;
                                    const cur = getVoxel(ix, iy, iz) & 0xFF;
                                    if (cur === 0 || cur === 97) setVoxel(ix, iy, iz, 96);
                                }
                                // Branch leaf cluster
                                const ex = Math.round(bxp), ez = Math.round(bzp), ey = brY + bLen;
                                for (let dy2 = -1; dy2 <= 1; dy2++) {
                                    const r2 = dy2 === 0 ? 2 : 1;
                                    for (let dx2 = -r2; dx2 <= r2; dx2++) {
                                        for (let dz2 = -r2; dz2 <= r2; dz2++) {
                                            if (Math.abs(dx2) === r2 && Math.abs(dz2) === r2 && seededRandom() < 0.5) continue;
                                            if ((getVoxel(ex+dx2, ey+dy2, ez+dz2) & 0xFF) === 0)
                                                setVoxel(ex+dx2, ey+dy2, ez+dz2, 97);
                                        }
                                    }
                                }
                            }
                            
                            // Vines on big tree
                            for (let ly = canopyBottom; ly <= canopyTop; ly++) {
                                for (let llx = -5; llx <= 6; llx++) {
                                    for (let llz = -5; llz <= 6; llz++) {
                                        if ((getVoxel(x+llx, ly, z+llz) & 0xFF) !== 97) continue;
                                        const vChecks = [{dx:1,dz:0,dir:1},{dx:-1,dz:0,dir:2},{dx:0,dz:1,dir:3},{dx:0,dz:-1,dir:4}];
                                        for (const vc of vChecks) {
                                            const nx = x+llx+vc.dx, nz = z+llz+vc.dz;
                                            if ((getVoxel(nx, ly, nz) & 0xFF) === 0 && seededRandom() < 0.4) {
                                                const vLen = 3 + Math.floor(seededRandom() * 6);
                                                for (let vl = 0; vl < vLen; vl++) {
                                                    if ((getVoxel(nx, ly - vl, nz) & 0xFF) === 0)
                                                        setVoxel(nx, ly - vl, nz, 66, vc.dir);
                                                    else break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            
                        } else if (jungleRoll < 0.30) {
                            // GROUND BUSH: single jungle log with oak leaves (like MC jungle bush)
                            setVoxel(x, y + 1, z, 96);
                            for (let dx2 = -2; dx2 <= 2; dx2++) {
                                for (let dz2 = -2; dz2 <= 2; dz2++) {
                                    for (let dy2 = 0; dy2 <= 2; dy2++) {
                                        if (dx2 === 0 && dz2 === 0 && dy2 <= 1) continue;
                                        const dist = Math.abs(dx2) + Math.abs(dz2) + (dy2 > 1 ? 1 : 0);
                                        if (dist > 3) continue;
                                        if (dist === 3 && seededRandom() < 0.5) continue;
                                        if ((getVoxel(x+dx2, y+1+dy2, z+dz2) & 0xFF) === 0)
                                            setVoxel(x+dx2, y+1+dy2, z+dz2, 14); // Oak leaves for bush (like MC)
                                    }
                                }
                            }
                        } else {
                            // SMALL JUNGLE TREE (4-7 tall, 1x1 trunk)
                            const trunkHeight = 4 + Math.floor(seededRandom() * 4);
                            for (let ly = 1; ly <= trunkHeight; ly++) setVoxel(x, y + ly, z, 96);
                            
                            for (let ly = y + trunkHeight - 2; ly <= y + trunkHeight + 1; ly++) {
                                const yDist = ly - (y + trunkHeight);
                                let rad = (yDist >= 0) ? 1 : 2;
                                if (yDist > 1) rad = 0;
                                for (let llx = -rad; llx <= rad; llx++) {
                                    for (let llz = -rad; llz <= rad; llz++) {
                                        if (Math.abs(llx) === rad && Math.abs(llz) === rad) {
                                            if (yDist >= 0 || seededRandom() < 0.5) continue;
                                        }
                                        if (llx === 0 && llz === 0 && ly <= y + trunkHeight) continue;
                                        if ((getVoxel(x+llx, ly, z+llz) & 0xFF) === 0)
                                            setVoxel(x+llx, ly, z+llz, 97);
                                    }
                                }
                            }
                            
                            // Vines on small tree
                            for (let ly = y + trunkHeight - 2; ly <= y + trunkHeight + 1; ly++) {
                                for (let llx = -3; llx <= 3; llx++) {
                                    for (let llz = -3; llz <= 3; llz++) {
                                        if ((getVoxel(x+llx, ly, z+llz) & 0xFF) !== 97) continue;
                                        const vChecks = [{dx:1,dz:0,dir:1},{dx:-1,dz:0,dir:2},{dx:0,dz:1,dir:3},{dx:0,dz:-1,dir:4}];
                                        for (const vc of vChecks) {
                                            const nx = x+llx+vc.dx, nz = z+llz+vc.dz;
                                            if ((getVoxel(nx, ly, nz) & 0xFF) === 0 && seededRandom() < 0.3) {
                                                const vLen = 1 + Math.floor(seededRandom() * 4);
                                                for (let vl = 0; vl < vLen; vl++) {
                                                    if ((getVoxel(nx, ly - vl, nz) & 0xFF) === 0)
                                                        setVoxel(nx, ly - vl, nz, 66, vc.dir);
                                                    else break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else if ((biome === 'forest' || biome === 'alpha_forest' || biome === 'rainforest' || biome === 'seasonal_forest' || biome === 'savanna' || biome === 'plains' || biome === 'extreme_hills' || biome === 'badlands') && surfId === 1) {
                        let logId = 13, leafId = 14, isBirch = false;
                        
                        if ((biome === 'forest' || biome === 'seasonal_forest') && seededRandom() < 0.3) {
                            logId = 41; leafId = 43; isBirch = true;
                        }
                        
                        if (seededRandom() < ((typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 6 && biome === 'rainforest') ? 0.333 : 0.1) && !isBirch) {
                            // ----------------------------------------------------------
                            // LARGE OAK — accurate to MC's BigTreeFeature.
                            //
                            // Algorithm summary (matches net.minecraft.world.gen.feature
                            // BigTreeFeature in 1.6-1.12 era):
                            //   1. Pick a tree size (height) — tall enough to look big.
                            //   2. Pick a "trunk height" = floor(size * 0.618). Trunk is
                            //      straight from base up to trunkTop.
                            //   3. Generate foliage cluster positions: clusters are
                            //      arranged in horizontal "rings" descending from the
                            //      top, with each cluster offset randomly from the trunk
                            //      axis (offset distance grows with size).
                            //   4. For each cluster, trace a log line from cluster center
                            //      back to the trunk axis (creating a branch).
                            //   5. For each cluster, place an "oblate spheroid" of leaves
                            //      (2 layers tall: a wide middle and narrower top/bottom).
                            //
                            // Result: tall straight trunk with several leaf balls floating
                            // off to the sides, each connected by a diagonal branch.
                            // ----------------------------------------------------------
                            
                            const treeSize = 8 + Math.floor(seededRandom() * 6); // 8-13 blocks
                            const trunkHeight = Math.floor(treeSize * 0.618);
                            const baseY = y + 1;
                            const topY = y + treeSize;
                            
                            // ---------- Helper: place leaf ball around (cx, cy, cz) ----------
                            // 4 layers tall:
                            //   yOff = -1: narrow bottom (radius 2)
                            //   yOff =  0: wide middle (radius 3)
                            //   yOff =  1: wide middle (radius 3)
                            //   yOff =  2: narrow top (radius 2)
                            // Each layer culls true corners with a probability so the
                            // overall shape is round-ish rather than square.
                            //
                            // Individual leaf balls are capped at topY+2 — slightly above
                            // the trunk top so clusters near the top can still extend
                            // upward a bit. The TAPERED CAP pass below adds a separate
                            // narrowing dome on top of the trunk to blend the canopy
                            // upward smoothly.
                            const placeLeafBall = (cx, cy, cz) => {
                                for (let yOff = -1; yOff <= 2; yOff++) {
                                    const ty = cy + yOff;
                                    if (ty > topY + 4) continue;
                                    const layerRadius = (yOff === 0 || yOff === 1) ? 3 : 2;
                                    const rSq = layerRadius * layerRadius;
                                    for (let lx = -layerRadius; lx <= layerRadius; lx++) {
                                        for (let lz = -layerRadius; lz <= layerRadius; lz++) {
                                            const ddSq = lx*lx + lz*lz;
                                            // Hard outer bound — circular footprint
                                            if (ddSq > rSq + 1) continue;
                                            // Cull true corners with some chance to soften
                                            if (ddSq > rSq && seededRandom() < 0.6) continue;
                                            const tx = cx + lx, tz = cz + lz;
                                            if ((getVoxel(tx, ty, tz) & 0xFF) === 0) {
                                                setVoxel(tx, ty, tz, leafId);
                                            }
                                        }
                                    }
                                }
                            };
                            
                            // ---------- Helper: dust leaves around a single log ----------
                            // Used to leaf the BRANCH path so branches don't look bare.
                            // Places a small +-shape of leaves around the log position,
                            // capped slightly above the trunk top.
                            const dustLeavesAround = (px, py, pz) => {
                                if (py > topY + 4) return;
                                const offsets = [
                                    [1,0,0],[-1,0,0],[0,0,1],[0,0,-1],
                                    [0,1,0],[0,-1,0],
                                    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1]
                                ];
                                for (const [ox, oy, oz] of offsets) {
                                    const ty = py + oy;
                                    if (ty > topY + 4) continue;
                                    // Skip diagonal corners with 30% chance
                                    if ((ox !== 0 && oz !== 0) && seededRandom() < 0.3) continue;
                                    const tx = px + ox, tz = pz + oz;
                                    if ((getVoxel(tx, ty, tz) & 0xFF) === 0) {
                                        setVoxel(tx, ty, tz, leafId);
                                    }
                                }
                            };
                            
                            // ---------- Helper: trace a log line from (x0,y0,z0) to (x1,y1,z1) ----------
                            // Used to draw branches from trunk to each foliage cluster.
                            // Bresenham-style 3D line. Returns the list of placed log
                            // positions so the caller can dust leaves around them later.
                            const traceBranch = (x0, y0, z0, x1, y1, z1) => {
                                const path = [];
                                const dxL = x1 - x0, dyL = y1 - y0, dzL = z1 - z0;
                                const steps = Math.max(Math.abs(dxL), Math.abs(dyL), Math.abs(dzL));
                                if (steps === 0) return path;
                                for (let s = 0; s <= steps; s++) {
                                    const t = s / steps;
                                    const px = Math.round(x0 + dxL * t);
                                    const py = Math.round(y0 + dyL * t);
                                    const pz = Math.round(z0 + dzL * t);
                                    // Don't place branch logs above the trunk top — keeps
                                    // the silhouette tidy.
                                    if (py > topY) continue;
                                    const cur = getVoxel(px, py, pz) & 0xFF;
                                    if (cur === 0 || cur === leafId) {
                                        setVoxel(px, py, pz, logId);
                                        path.push([px, py, pz]);
                                    }
                                }
                                return path;
                            };
                            
                            // ---------- Generate foliage cluster positions ----------
                            // MC: clusters are placed in descending Y order. The number of
                            // clusters per Y level depends on how high in the tree we are.
                            // Top cluster is right at the top, lower ones spiral around the
                            // trunk. We approximate with: numClusters scaled by treeSize,
                            // with cluster Y positions distributed from trunkTop down to
                            // (trunkHeight + baseY) — i.e. clusters never go below where
                            // the trunk's straight portion ends.
                            
                            const clusters = [];
                            
                            // Top cluster: directly on trunk axis at the top
                            clusters.push({ x: x, y: topY, z: z });
                            
                            // Side clusters: scaled by treeSize. MC formula is roughly
                            // numClusters = floor(1.382 + (treeSize/13)^2 * something).
                            // For simplicity: 3-6 clusters depending on treeSize.
                            const numSideClusters = 3 + Math.floor((treeSize - 8) * 0.5) + Math.floor(seededRandom() * 2);
                            
                            // Distribute clusters from topY-1 down to (baseY + trunkHeight - 2)
                            // The lowest foliage cluster shouldn't be below 1/3 of tree height.
                            const lowestClusterY = baseY + Math.floor(treeSize * 0.4);
                            for (let i = 0; i < numSideClusters; i++) {
                                // Random Y in the upper portion of the tree.
                                // Cap at topY-1 so a cluster centered there still has room
                                // for its top layer at topY (within the topY+1 cap).
                                const cy = Math.min(topY - 1, lowestClusterY + Math.floor(seededRandom() * (topY - lowestClusterY - 1)));
                                // Random angle and distance from trunk
                                const angle = seededRandom() * Math.PI * 2;
                                // Branch length grows with height-from-top: branches near
                                // the top are longer (forming the wide canopy), branches
                                // lower are shorter.
                                const heightFromTop = topY - cy;
                                const maxReach = 1 + heightFromTop * 0.5;
                                const reach = 1.5 + seededRandom() * Math.max(0.5, maxReach - 1.5);
                                const cx = x + Math.round(Math.cos(angle) * reach);
                                const cz = z + Math.round(Math.sin(angle) * reach);
                                // Skip if cluster center landed on the trunk itself
                                if (cx === x && cz === z) continue;
                                clusters.push({ x: cx, y: cy, z: cz });
                            }
                            
                            // ---------- Place trunk ----------
                            // Straight from baseY up to trunkTop. Some MC big oaks have
                            // the trunk continuing past trunkTop in a small sliver to
                            // join the top foliage; we include that with the topY logs.
                            for (let ly = baseY; ly <= topY; ly++) {
                                setVoxel(x, ly, z, logId);
                            }
                            
                            // ---------- Place branches ----------
                            // For each side cluster, draw a branch from trunk back to
                            // the cluster center. The branch's trunk-side endpoint is at
                            // the cluster's Y on the trunk axis (so branches angle outward).
                            // Save the branch paths so we can dust leaves around them
                            // after placing the leaf balls (so we don't overwrite leaves
                            // that the balls already placed).
                            const branchPaths = [];
                            for (let ci = 1; ci < clusters.length; ci++) {
                                const c = clusters[ci];
                                // Branch starts at the trunk at cluster Y (or one below
                                // for a more natural angle)
                                const trunkAttachY = Math.max(baseY, c.y - 1);
                                const path = traceBranch(x, trunkAttachY, z, c.x, c.y, c.z);
                                branchPaths.push(path);
                            }
                            
                            // ---------- Place foliage ----------
                            for (const c of clusters) {
                                placeLeafBall(c.x, c.y, c.z);
                            }
                            
                            // ---------- Dust leaves along each branch ----------
                            // Walk the saved branch paths and place a small + of leaves
                            // around each log position. This makes branches appear leafy
                            // along their length rather than only at the cluster ends.
                            for (const path of branchPaths) {
                                for (const [px, py, pz] of path) {
                                    dustLeavesAround(px, py, pz);
                                }
                            }
                            
                            // ---------- Tapered top dome ----------
                            // After all the leaf balls and branch dusting, lay down a few
                            // narrowing leaf layers DIRECTLY ABOVE the trunk top. This
                            // blends the canopy upward into a domed silhouette instead
                            // of cutting off flat. Each layer is centered on the trunk
                            // axis and shrinks as it goes up.
                            //
                            // Layer schedule (relative to topY):
                            //   topY+1: radius 3 (full ring on top of the trunk)
                            //   topY+2: radius 3
                            //   topY+3: radius 2
                            //   topY+4: radius 1 (always one narrower than the layer below)
                            const capLayers = [
                                { yOff: 1, r: 3 },
                                { yOff: 2, r: 3 },
                                { yOff: 3, r: 2 },
                                { yOff: 4, r: 1 },
                            ];
                            for (const { yOff, r } of capLayers) {
                                const ty = topY + yOff;
                                if (r === 0) {
                                    if ((getVoxel(x, ty, z) & 0xFF) === 0) {
                                        setVoxel(x, ty, z, leafId);
                                    }
                                    continue;
                                }
                                const rSq = r * r;
                                for (let lx = -r; lx <= r; lx++) {
                                    for (let lz = -r; lz <= r; lz++) {
                                        const ddSq = lx*lx + lz*lz;
                                        // Circular footprint
                                        if (ddSq > rSq + 1) continue;
                                        // Cull true corners with some chance for a softer
                                        // dome shape
                                        if (ddSq > rSq && seededRandom() < 0.6) continue;
                                        const tx = x + lx, tz = z + lz;
                                        if ((getVoxel(tx, ty, tz) & 0xFF) === 0) {
                                            setVoxel(tx, ty, tz, leafId);
                                        }
                                    }
                                }
                            }
                        } else {
                            const trunkHeight = isBirch ? (5 + Math.floor(seededRandom() * 3)) : (4 + Math.floor(seededRandom() * 3));
                            for (let ly = 1; ly <= trunkHeight; ly++) setVoxel(x, y + ly, z, logId);
                            
                            for (let ly = y + trunkHeight - 2; ly <= y + trunkHeight + 1; ly++) {
                                const yDist = ly - (y + trunkHeight);
                                const radius = (yDist >= 0) ? 1 : 2;
                                for (let llx = -radius; llx <= radius; llx++) {
                                    for (let llz = -radius; llz <= radius; llz++) {
                                        if (Math.abs(llx) === radius && Math.abs(llz) === radius) {
                                            if (yDist >= 0 || seededRandom() < 0.5) continue;
                                        }
                                        if (llx === 0 && llz === 0 && ly <= y + trunkHeight) continue;
                                        if ((getVoxel(x+llx, ly, z+llz) & 0xFF) === 0) setVoxel(x+llx, ly, z+llz, leafId);
                                    }
                                }
                            }
                        }
                    } else if ((biome === 'taiga' || biome === 'tundra') && (surfId === 25 || surfId === 1 || surfId === 39 || surfId === 5 || surfId === 2)) {
                        const trunkHeight = 6 + Math.floor(seededRandom() * 4);
                        for (let ly = 1; ly <= trunkHeight; ly++) setVoxel(x, y + ly, z, 21);
                        
                        const leafBottom = y + 2 + Math.floor(seededRandom() * 2);
                        let r = 1;
                        
                        if ((getVoxel(x, y + trunkHeight + 1, z) & 0xFF) === 0) setVoxel(x, y + trunkHeight + 1, z, 22);
                        
                        for (let ly = y + trunkHeight; ly >= leafBottom; ly--) {
                            for (let llx = -r; llx <= r; llx++) {
                                for (let llz = -r; llz <= r; llz++) {
                                    if (Math.abs(llx) === r && Math.abs(llz) === r && r > 0) {
                                        if (seededRandom() < 0.5) continue;
                                    }
                                    if (llx === 0 && llz === 0 && ly <= y + trunkHeight) continue;
                                    if ((getVoxel(x+llx, ly, z+llz) & 0xFF) === 0) setVoxel(x+llx, ly, z+llz, 22);
                                }
                            }
                            if (r >= 2) r = 1; else r++;
                        }
                    }
                }
                
                // Foliage
                let folMult = GEN_FOLIAGE_DENSITY / 100.0;
                // Apply per-biome foliage density override
                if (typeof GEN_BIOME_OVERRIDES !== 'undefined' && GEN_BIOME_OVERRIDES[biome]) {
                    folMult *= (GEN_BIOME_OVERRIDES[biome].foliageDensity / 100);
                }
                if ((getVoxel(x, y+1, z) & 0xFF) === 0) {
                    const r = seededRandom();
                    
                    if ((biome === 'plains' || biome === 'savanna') && surfId === 1) {
                        if (isBeta173Decor && biome === 'savanna') {
                            if (r < 0.055 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                            else if (r < 0.060 * folMult) setVoxel(x, y+1, z, 24); // Bush = fern
                        } else {
                            if (r < 0.3 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                            else if (r < 0.32 * folMult) setVoxel(x, y+1, z, 23);
                            else if (r < 0.33 * folMult) setVoxel(x, y+1, z, 24);
                            else if (r < 0.35 * folMult) setVoxel(x, y+1, z, 53);
                        }
                    } else if (biome === 'alpha_forest' && surfId === 1) {
                        // v310: Alpha forest has only flowers, no tall grass or bushes
                        if (r < 0.017 * folMult) setVoxel(x, y+1, z, 23); // Rose
                        else if (r < 0.020 * folMult) setVoxel(x, y+1, z, 53); // Dandelion
                    } else if ((biome === 'forest' || biome === 'rainforest' || biome === 'seasonal_forest') && surfId === 1) {
                        if (isBeta173Decor && biome === 'rainforest') {
                            // Beta Rain Forest: heavy, sometimes continuous grass/fern cover.
                            if (r < 0.48 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                            else if (r < 0.58 * folMult) setVoxel(x, y+1, z, 24); // Bush = fern
                            else if (r < 0.61 * folMult) setVoxel(x, y+1, z, 23);
                            else if (r < 0.64 * folMult) setVoxel(x, y+1, z, 53);
                        } else if (isBeta173Decor && biome === 'seasonal_forest') {
                            if (r < 0.18 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                            else if (r < 0.22 * folMult) setVoxel(x, y+1, z, 24); // Bush = fern
                            else if (r < 0.235 * folMult) setVoxel(x, y+1, z, 23);
                            else if (r < 0.255 * folMult) setVoxel(x, y+1, z, 53);
                        } else if (isBeta173Decor && biome === 'forest') {
                            if (r < 0.16 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                            else if (r < 0.19 * folMult) setVoxel(x, y+1, z, 24); // Bush = fern
                            else if (r < 0.205 * folMult) setVoxel(x, y+1, z, 23);
                            else if (r < 0.220 * folMult) setVoxel(x, y+1, z, 53);
                        } else {
                            if (r < 0.15 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                            else if (r < 0.17 * folMult) setVoxel(x, y+1, z, 23);
                            else if (r < 0.18 * folMult) setVoxel(x, y+1, z, 24);
                            else if (r < 0.20 * folMult) setVoxel(x, y+1, z, 53);
                        }
                    } else if (biome === 'taiga' && surfId === 1) {
                        if (r < (isBeta173Decor ? 0.10 : 0.15) * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                        else if (isBeta173Decor && r < 0.13 * folMult) setVoxel(x, y+1, z, 24); // Bush = fern
                    } else if (biome === 'tundra' && surfId === 39) {
                        setVoxel(x, y+1, z, 40, 1);
                    } else if (biome === 'ice_spikes' && surfId === 39) {
                        // v341: ice_spikes biome has the highest snow
                        // accumulation in MC. We already place the base
                        // snow layer here; the heavier scatter below
                        // gives many cells a 2-layer snow stack, which
                        // matches the visible "thick snow" look without
                        // overcomplicating the worldgen.
                        setVoxel(x, y+1, z, 40, 1);
                    } else if (biome === 'swamp' && surfId === 1) {
                        if (r < (isBeta173Decor ? 0.16 : 0.25) * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                        else if (r < (isBeta173Decor ? 0.18 : 0.26) * folMult) setVoxel(x, y+1, z, 24); // Bush
                    } else if (biome === 'jungle' && surfId === 1) {
                        // Very dense ground cover like MC jungle
                        if (r < 0.45 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                        else if (r < 0.50 * folMult) setVoxel(x, y+1, z, 24); // Bush
                    } else if (biome === 'badlands' && surfId === 1) {
                        // Wooded badlands grass plateau: sparse tall grass
                        if (r < 0.08 * folMult) _placeFoliageGrass(x, y, z, seededRandom);
                    } else if (biome === 'desert' && surfId === 15) {
                        // Deserts: vanilla-style dead bushes on sand, with cactus handled by the
                        // existing sparse cactus pass above. Keep density lower than badlands.
                        if (r < 0.035 * folMult) setVoxel(x, y+1, z, 26);
                    } else if (biome === 'badlands' && surfId === BADLANDS_RED_SAND) {
                        // Badlands red sand basins: a little harsher/drier than desert,
                        // with the beta dead-bush silhouette. Dead bush block id is 26.
                        if (r < 0.055 * folMult) setVoxel(x, y+1, z, 26);
                    }                }
                
                // Swamp lily pads: spawn on water surface (independent of air-above check)
                if (biome === 'swamp') {
                    const waterY = GEN_SEA_LEVEL;
                    if ((getVoxel(x, waterY, z) & 0xFF) === 4 && (getVoxel(x, waterY + 1, z) & 0xFF) === 0) {
                        if (seededRandom() < 0.04 * folMult) {
                            setVoxel(x, waterY + 1, z, 67); // Lily pad
                        }
                    }
                }
            }
        }
    }
    
    // PHASE 7.5: Pumpkins
    if (seededRandom() < 0.04) {
        const px = startX + Math.floor(seededRandom() * CHUNK_SIZE);
        const pz = startZ + Math.floor(seededRandom() * CHUNK_SIZE);
        const py = getHighestBlock(px, pz);

        if ((getVoxel(px, py, pz) & 0xFF) === 1) { 
            const patchSize = 6 + Math.floor(seededRandom() * 9);
            for (let i = 0; i < patchSize; i++) {
                const ox = px + Math.floor(seededRandom() * 12) - 6;
                const oz = pz + Math.floor(seededRandom() * 12) - 6;
                const oy = getHighestBlock(ox, oz);
                
                if ((getVoxel(ox, oy, oz) & 0xFF) === 1 && (getVoxel(ox, oy + 1, oz) & 0xFF) === 0) {
                    setVoxel(ox, oy + 1, oz, 51);
                }
            }
        }
    }

    // PHASE 7.6: Sugarcane
    for (let attempt = 0; attempt < 12; attempt++) { 
        const sx = startX + Math.floor(seededRandom() * CHUNK_SIZE);
        const sz = startZ + Math.floor(seededRandom() * CHUNK_SIZE);
        const sy = getHighestBlock(sx, sz);

        const groundId = getVoxel(sx, sy, sz) & 0xFF;
        
        if (groundId === 1 || groundId === 2 || groundId === 15 || groundId === 5 || groundId === BADLANDS_RED_SAND) {
            if ((getVoxel(sx, sy + 1, sz) & 0xFF) === 0) {
                let hasWater = false;
                for (const [dx, dy, dz] of [[1,0,0], [-1,0,0], [0,0,1], [0,0,-1]]) {
                    if ((getVoxel(sx + dx, sy, sz + dz) & 0xFF) === 4) {
                        hasWater = true;
                        break;
                    }
                }

                if (hasWater) {
                    const stalkHeight = 1 + Math.floor(seededRandom() * 3);
                    for (let h = 1; h <= stalkHeight; h++) {
                        if ((getVoxel(sx, sy + h, sz) & 0xFF) === 0) {
                            setVoxel(sx, sy + h, sz, 52); 
                        } else {
                            break;
                        }
                    }
                }
            }
        }
    }
    
    // PHASE 8: Snow on trees
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const bIdx = lx + lz * CHUNK_SIZE;
            const biome = BIOME_NAMES[biomeData.biomes[bIdx]];
            if (biome === 'tundra') {
                for (let sy = WORLD_HEIGHT - 1; sy >= GEN_SEA_LEVEL; sy--) {
                    const sid = getVoxel(x, sy, z) & 0xFF;
                    if (sid === 0 || isSnowLayer(sid)) continue;
                    if (sid === 14 || sid === 22 || sid === 43 || sid === 13 || sid === 21 || sid === 41) {
                        if ((getVoxel(x, sy+1, z) & 0xFF) === 0 && seededRandom() < 0.75) {
                            setVoxel(x, sy+1, z, 40, 1);
                        }
                    }
                    break;
                }
            }
            // Extreme Hills: snow on peaks above y=95
            if (biome === 'extreme_hills') {
                for (let sy = WORLD_HEIGHT - 1; sy >= GEN_SEA_LEVEL + 33; sy--) {
                    const sid = getVoxel(x, sy, z) & 0xFF;
                    if (sid === 0) continue;
                    if (sid !== 4 && sid !== 27 && !isFluidBlock(sid)) {
                        // If the topmost non-air block is a cross block (tall
                        // grass, flowers, dead bush, etc.) the snow layer
                        // should REPLACE it rather than stack on top. Stacking
                        // on top leaves visible grass poking through the snow.
                        if (isCrossBlock(sid)) {
                            setVoxel(x, sy, z, 40, 1);
                        } else if ((getVoxel(x, sy+1, z) & 0xFF) === 0) {
                            setVoxel(x, sy+1, z, 40, 1);
                        }
                        break;
                    }
                    break;
                }
            }
        }
    }
    
    // PHASE 8.5: Ice on water in snowy biomes (tundra and taiga)
    // In MC, the top water source block in cold biomes freezes to ice.
    // Only freeze water at sea level with air above (surface water bodies).
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const bIdx = lx + lz * CHUNK_SIZE;
            const biome = BIOME_NAMES[biomeData.biomes[bIdx]];
            if (biome === 'tundra' || biome === 'taiga' || biome === 'ice_spikes') {
                // Scan from sea level down to find the top water source
                for (let sy = GEN_SEA_LEVEL; sy >= GEN_SEA_LEVEL - 2; sy--) {
                    const bid = getVoxel(x, sy, z) & 0xFF;
                    if (bid === 4) {
                        const aboveId = getVoxel(x, sy + 1, z) & 0xFF;
                        // Only freeze if air or snow layer above (surface water)
                        if (aboveId === 0 || aboveId === 40) {
                            setVoxel(x, sy, z, 95); // Ice block
                            break;
                        }
                    }
                    // Stop if we hit a solid block (not water surface)
                    if (bid !== 0 && bid !== 4 && !isCrossBlock(bid)) break;
                }
            }
        }
    }

    // --- NEW: PHASE 9: UNDERGROUND DUNGEONS ---
    if (GEN_STRUCTURES && GEN_CAVES && currentDimension !== 'nether') {
        // 3% chance per chunk column to spawn a dungeon
        if (seededRandom() < 0.03) {
            // Offset slightly from the chunk edge so it generates cleanly
            const dx = startX + Math.floor(seededRandom() * (CHUNK_SIZE - 8)) + 4; 
            const dz = startZ + Math.floor(seededRandom() * (CHUNK_SIZE - 8)) + 4;
            const surfaceY = getHighestBlock(dx, dz);
            
            // Ensure the terrain is thick enough to hold a dungeon
            if (surfaceY > 25) {
                // Pick a random Y coordinate deep underground (between Bedrock and 15 blocks below surface)
                const dy = 5 + Math.floor(seededRandom() * (surfaceY - 20));
                
                // Verify the floor is somewhat solid (stone/ores) so it doesn't float awkwardly in massive ravines
                const floorId = getVoxel(dx, dy - 1, dz) & 0xFF;
                if (floorId === 3 || floorId === 5 || floorId === 6 || floorId === 7 || floorId === 8 || floorId === 9 || floorId === 49) {
                    _pastePrefabWorldGen(DUNGEON_0, dx, dy, dz);
                }
            }
        }
    }

    // --- NEW: PHASE 10: PASSIVE MOBS ---
    // 10% chance per chunk to spawn a pack of animals
    if (seededRandom() < 0.10) { 
        const packSize = Math.floor(seededRandom() * 3) + 2; // Pack of 2 to 4
        
        // Pick a random center for the herd
        const packX = startX + Math.floor(seededRandom() * 12) + 2;
        const packZ = startZ + Math.floor(seededRandom() * 12) + 2;

        // Equal chance for each passive mob type
        const mobRoll = seededRandom();
        const mobType = mobRoll < 0.33 ? 'pig' : (mobRoll < 0.66 ? 'sheep' : 'cow');
        
        for (let i = 0; i < packSize; i++) {
            // Scatter them slightly around the pack center
            const dx = packX + Math.floor(seededRandom() * 3) - 1;
            const dz = packZ + Math.floor(seededRandom() * 3) - 1;
            const py = getHighestBlock(dx, dz);
            
            // MINECRAFT RULE: Passive mobs can ONLY spawn on Grass Blocks (ID: 1)
            if ((getVoxel(dx, py, dz) & 0xFF) === 1) {
                // Cap to MOB_CAP_PASSIVE to prevent overpopulation
                if (typeof globalMobs !== 'undefined' && typeof _isPassiveMob === 'function') {
                    const passiveCount = globalMobs.filter(_isPassiveMob).length;
                    if (passiveCount < (typeof MOB_CAP_PASSIVE !== 'undefined' ? MOB_CAP_PASSIVE : 10)) {
                        if (typeof spawnMob === 'function') {
                            spawnMob(mobType, dx + 0.5, py + 1.0, dz + 0.5);
                        }
                    }
                }
            }
        }
    }

    // v293: Alpha-style monolith post-pass. Shifts the entire chunk up so
    // the bedrock block sits at sea level, leaving a void under the terrain.
    _applyMonolithLift(cx, cz);
}

// v293: Alpha Minecraft-style monoliths. A 2x2 chunk region seeded roll
// determines whether all 4 chunks in that region get lifted so their
// bedrock moves from Y=0 up to Y=GEN_SEA_LEVEL. Everything above is
// shifted up by the same amount, creating a sheer cliff around the
// region and an open void below. Only applies to the normal overworld
// generator (not superflat, nether, or aether).
function _applyMonolithLift(cx, cz) {
    if (typeof GEN_MONOLITHS_ENABLED === 'undefined' || !GEN_MONOLITHS_ENABLED) return;
    // Skip for superflat
    if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 1) return;
    // Region is 2x2 chunks. All four chunks in the same region roll identically.
    const rcx = cx >> 1;
    const rcz = cz >> 1;
    const rng = _chunkSeededRandom(rcx * 9173 + 4421, rcz * 7841 + 6287);
    const chancePct = (typeof GEN_MONOLITH_CHANCE === 'number') ? GEN_MONOLITH_CHANCE : 0.1;
    if (rng() * 100 >= chancePct) return;
    const lift = (typeof GEN_SEA_LEVEL === 'number') ? (GEN_SEA_LEVEL | 0) : 62;
    if (lift <= 0) return;
    const chunk = _getOrCreateChunkFast(cx, cz);
    if (!chunk) return;
    // In-place shift upward. Walk ly from top to bottom so source rows
    // haven't been overwritten by the time we read them. Indexing:
    // i = lx + (ly << 4) + (lz << 12), stride Y = 16.
    for (let ly = WORLD_HEIGHT - 1; ly >= 0; ly--) {
        const srcY = ly - lift;
        if (srcY >= 0) {
            // Copy the entire (lx, lz) slab at srcY → ly
            const destBaseY = ly << 4;
            const srcBaseY = srcY << 4;
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const destBaseZ = destBaseY + (lz << 12);
                const srcBaseZ = srcBaseY + (lz << 12);
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    chunk[lx + destBaseZ] = chunk[lx + srcBaseZ];
                }
            }
        } else {
            // Below where any source exists — fill with air
            const destBaseY = ly << 4;
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const destBaseZ = destBaseY + (lz << 12);
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    chunk[lx + destBaseZ] = 0;
                }
            }
        }
    }
}

// Ensure a chunk is generated (for lazy generation)
function ensureChunkGenerated(cx, cz) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    if (_isChunkGenerated(cx, cz)) return;
    if (currentDimension === 'nether') {
        if (!_netherNoise1) _initNetherNoise();
        generateNetherChunkColumn(cx, cz);
        // Simulate fluids for this chunk
        const startX = cx * CHUNK_SIZE - Math.floor(WORLD_WIDTH / 2);
        const startZ = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH / 2);
        simulateChunkFluids(startX, startZ, startX + CHUNK_SIZE, startZ + CHUNK_SIZE);
    } else if (currentDimension === 'aether') {
        if (!_aetherNoise1) _initAetherNoise();
        generateAetherChunkColumn(cx, cz);
        // Simulate fluids for this chunk (aether water is at island heights)
        const startX = cx * CHUNK_SIZE - Math.floor(WORLD_WIDTH / 2);
        const startZ = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH / 2);
        simulateAetherFluids(startX, startZ, startX + CHUNK_SIZE, startZ + CHUNK_SIZE);
    } else {
        generateChunkColumn(cx, cz);
    }
}

// Lighting for a radius around a point
function recalculateLightingInRadius(centerX, centerZ, radius) {
    recalculateLighting();
}

// Mark nearby chunks as dirty
function updateNearbyChunks(playerX, playerZ, radiusChunks) {
    const pCx = Math.floor(playerX / CHUNK_SIZE);
    const pCz = Math.floor(playerZ / CHUNK_SIZE);
    
    const chunks = [];
    for (let cx = pCx - radiusChunks; cx <= pCx + radiusChunks; cx++) {
        for (let cz = pCz - radiusChunks; cz <= pCz + radiusChunks; cz++) {
            const dist = (cx - pCx) ** 2 + (cz - pCz) ** 2;
            chunks.push({ cx, cz, dist });
        }
    }
    chunks.sort((a, b) => a.dist - b.dist);
    for (const c of chunks) dirtyChunks.add(`${c.cx},${c.cz}`);
}

// Fluid simulation for a region
function simulateChunkFluids(startX, startZ, endX, endZ) {
    // Seed phase: find all source fluid blocks in the region that touch
    // air, cross-blocks, or a different fluid. These are the cells that
    // need to start propagating. Add them directly to the live sim queues
    // (updateLavaQueue / updateWaterQueue).
    for (let x = startX; x < endX; x++) {
        for (let z = startZ; z < endZ; z++) {
            for (let y = 1; y <= GEN_SEA_LEVEL; y++) {
                const val = getVoxel(x, y, z);
                const id = val & 0xFF;
                if (!isFluidBlock(id)) continue;
                const src = (val >> 13) & 0x1;
                if (!src) continue;
                if (id === 4 && y >= (GEN_SEA_LEVEL - 2)) continue;
                for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                    const nId = getVoxel(x+dx,y+dy,z+dz) & 0xFF;
                    if (nId === 0 || isCrossBlock(nId) || (isFluidBlock(nId) && nId !== id)) {
                        if (id === 27) updateLavaQueue.add(getVoxelIndex(x, y, z));
                        else updateWaterQueue.add(getVoxelIndex(x, y, z));
                        break;
                    }
                }
            }
        }
    }
    
    // Drain the queues by repeatedly invoking the LIVE updateLava/updateWater
    // functions on every queued index. The live functions will re-queue any
    // affected neighbors via the same global queues, so we just keep looping
    // until both are empty (or we hit the pass limit, just in case).
    //
    // This used to be a parallel reimplementation of the sim, but the worldgen
    // copy diverged from the live code over time (different maxLevel, missing
    // falling-onto-pool handling, etc), producing geometry artifacts that the
    // live sim never produced. Mirroring the live sim here eliminates that
    // entire class of bugs.
    const dummyBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, dirty: false };
    let passes = 0;
    const MAX_PASSES = 256;
    while ((updateWaterQueue.size > 0 || updateLavaQueue.size > 0) && passes < MAX_PASSES) {
        // Snapshot the queues into arrays so we can iterate while updateLava/
        // updateWater re-add to the live sets.
        const waterBatch = Array.from(updateWaterQueue);
        updateWaterQueue.clear();
        const lavaBatch = Array.from(updateLavaQueue);
        updateLavaQueue.clear();
        
        for (const idx of waterBatch) {
            if (idx === -1) continue;
            const ix = idx % WORLD_WIDTH, iy = Math.floor(idx / WORLD_WIDTH) % WORLD_HEIGHT;
            const iz = Math.floor(idx / (WORLD_WIDTH * WORLD_HEIGHT));
            const wx = ix - WORLD_WIDTH/2, wy = iy, wz = iz - WORLD_DEPTH/2;
            updateWater(wx, wy, wz, dummyBounds);
        }
        for (const idx of lavaBatch) {
            if (idx === -1) continue;
            const ix = idx % WORLD_WIDTH, iy = Math.floor(idx / WORLD_WIDTH) % WORLD_HEIGHT;
            const iz = Math.floor(idx / (WORLD_WIDTH * WORLD_HEIGHT));
            const wx = ix - WORLD_WIDTH/2, wy = iy, wz = iz - WORLD_DEPTH/2;
            updateLava(wx, wy, wz, dummyBounds);
        }
        passes++;
    }
    
    // Make sure the queues are clean before returning so the live game
    // doesn't immediately re-process everything we just did.
    updateWaterQueue.clear();
    updateLavaQueue.clear();
}

// Aether fluid simulation — scans full Y range since water is at island heights
function simulateAetherFluids(startX, startZ, endX, endZ) {
    const fluidSimQueue = new Set();
    for (let x = startX; x < endX; x++) {
        for (let z = startZ; z < endZ; z++) {
            for (let y = 1; y <= 200; y++) {
                const val = getVoxel(x, y, z);
                const id = val & 0xFF;
                if (!isFluidBlock(id)) continue;
                const src = (val >> 13) & 0x1;
                if (!src) continue;
                for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                    const nId = getVoxel(x+dx,y+dy,z+dz) & 0xFF;
                    if (nId === 0 || isCrossBlock(nId) || (isFluidBlock(nId) && nId !== id)) {
                        fluidSimQueue.add(getVoxelIndex(x, y, z)); break;
                    }
                }
            }
        }
    }
    let passes = 0;
    while (fluidSimQueue.size > 0 && passes < 128) {
        const batch = Array.from(fluidSimQueue); fluidSimQueue.clear();
        for (const idx of batch) {
            if (idx === -1) continue;
            const ix = idx % WORLD_WIDTH, iy = Math.floor(idx / WORLD_WIDTH) % WORLD_HEIGHT;
            const iz = Math.floor(idx / (WORLD_WIDTH * WORLD_HEIGHT));
            const x = ix - WORLD_WIDTH/2, y = iy, z = iz - WORLD_DEPTH/2;
            let val = getVoxel(x,y,z); let id = val & 0xFF;
            if (!isFluidBlock(id)) continue;
            let interacted = false;
            const isSource = (val >> 13) & 0x1;
            const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
            for (const [dx,dy,dz] of dirs) {
                const nVal = getVoxel(x+dx,y+dy,z+dz); const nId = nVal & 0xFF;
                if (id===27 && nId===4) {
                    const waterSource=(nVal>>13)&0x1;
                    if (isSource) {
                        setVoxel(x,y,z,28); // water touches lava source -> obsidian
                        interacted=true;
                        for(const [ndx,ndy,ndz] of dirs) fluidSimQueue.add(getVoxelIndex(x+ndx,y+ndy,z+ndz));
                        break;
                    } else if (waterSource) {
                        setVoxel(x+dx,y+dy,z+dz,3); // flowing lava into water source -> stone
                        for(const [ndx,ndy,ndz] of dirs) fluidSimQueue.add(getVoxelIndex(x+dx+ndx,y+dy+ndy,z+dz+ndz));
                    } else {
                        setVoxel(x,y,z,33); // flowing lava + flowing water -> cobblestone
                        interacted=true;
                        for(const [ndx,ndy,ndz] of dirs) fluidSimQueue.add(getVoxelIndex(x+ndx,y+ndy,z+ndz));
                        break;
                    }
                }
                if (id===4 && nId===27) {
                    const nSource=(nVal>>13)&0x1;
                    setVoxel(x+dx,y+dy,z+dz,nSource?28:33); // water converts lava source to obsidian, flowing lava to cobble
                    for(const [ndx,ndy,ndz] of dirs) fluidSimQueue.add(getVoxelIndex(x+dx+ndx,y+dy+ndy,z+dz+ndz));
                }
            }
            if (interacted) continue;
            val = getVoxel(x,y,z); id = val & 0xFF; if (!isFluidBlock(id)) continue;
            const maxLevel = id===27?4:8, level=(val>>8)&0xF, falling=(val>>12)&0x1, source=(val>>13)&0x1;
            if (!source) {
                let exp=0, expF=0;
                if ((getVoxel(x,y+1,z)&0xFF)===id) { exp=maxLevel; expF=1; }
                else { let maxN=0; for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) { const n=getVoxel(x+dx,y+dy,z+dz); if((n&0xFF)===id){const nl=(n>>8)&0xF,nf=(n>>12)&0x1,ns=(n>>13)&0x1; if(nf||ns){if(maxLevel>maxN)maxN=maxLevel;}else if(nl>maxN)maxN=nl;}} if(maxN>1)exp=maxN-1; }
                if (exp===0) { setVoxel(x,y,z,0); for(const [dx,dy,dz] of dirs) fluidSimQueue.add(getVoxelIndex(x+dx,y+dy,z+dz)); continue; }
                if (exp!==level||expF!==falling) { setVoxel(x,y,z,id,exp,expF,0); for(const [dx,dy,dz] of dirs) fluidSimQueue.add(getVoxelIndex(x+dx,y+dy,z+dz)); }
            }
            const cl=(getVoxel(x,y,z)>>8)&0xF, bId=getVoxel(x,y-1,z)&0xFF;
            if(bId===0||isCrossBlock(bId)||(bId===id&&((getVoxel(x,y-1,z)>>8)&0xF)<maxLevel)){setVoxel(x,y-1,z,id,maxLevel,1,0);fluidSimQueue.add(getVoxelIndex(x,y-1,z));}
            else if(bId!==id||!((getVoxel(x,y-1,z)>>12)&0x1)){if(cl>1){for(const [nx,ny,nz] of [[x+1,y,z],[x-1,y,z],[x,y,z+1],[x,y,z-1]]){const nv=getVoxel(nx,ny,nz),ni=nv&0xFF;if(ni===0||isCrossBlock(ni)||(ni===id&&((nv>>8)&0xF)<cl-1)){setVoxel(nx,ny,nz,id,cl-1,0,0);fluidSimQueue.add(getVoxelIndex(nx,ny,nz));}else if(isFluidBlock(ni)&&ni!==id){fluidSimQueue.add(getVoxelIndex(nx,ny,nz));}}}}
        }
        passes++;
    }
    updateWaterQueue.clear(); updateLavaQueue.clear();
}

async function generateWorld() {
    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;
    
    _initWorldGenNoise();
    
    biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);
    
    // v267: spawn the worldgen worker FIRST so initial chunk generation
    // can route through it. Inline gen is now a fallback that only runs
    // if the worker fails to spawn or initialize. This fixes the inline
    // superflat biome bug because the worker path correctly handles
    // biome data for all worldgen presets.
    let workerAvailable = false;
    if (typeof spawnWorldgenWorker === 'function') {
        try {
            spawnWorldgenWorker();
            if (typeof awaitWorkerReady === 'function') {
                await awaitWorkerReady();
                workerAvailable = (typeof _workerReady !== 'undefined') ? _workerReady : true;
            }
        } catch (e) {
            console.warn('[generateWorld] worker spawn/ready failed, using inline fallback:', e);
            workerAvailable = false;
        }
    }
    
    if (!useLazyGeneration) {
        // EAGER GENERATION (small worlds <= 64 chunks/side)
        updateLoadingBar(2, 'Generating terrain...');
        await yieldToUI();
        
        // Build the coordinate list for the entire world
        const coords = [];
        for (let cx = 0; cx < CHUNKS_X; cx++) {
            for (let cz = 0; cz < CHUNKS_Z; cz++) {
                coords.push({ cx, cz });
            }
        }
        const totalChunks = coords.length;
        
        if (workerAvailable && typeof ensureChunksGeneratedBatch === 'function') {
            // v267: route through the worker
            await ensureChunksGeneratedBatch(coords, (done, total) => {
                const pct = 2 + (done / total) * 48;
                updateLoadingBar(pct, `Generating terrain... ${Math.round((done / total) * 100)}%`);
            });
        } else {
            // Inline fallback
            let chunksGenerated = 0;
            for (const c of coords) {
                generateChunkColumn(c.cx, c.cz);
                chunksGenerated++;
                if (chunksGenerated % 64 === 0) {
                    const pct = 2 + (chunksGenerated / totalChunks) * 48;
                    updateLoadingBar(pct, `Generating terrain... ${Math.round((chunksGenerated / totalChunks) * 100)}%`);
                    await yieldToUI();
                }
            }
        }
        
        updateLoadingBar(52, 'Simulating fluids...');
        await yieldToUI();
        simulateChunkFluids(-halfW, -halfD, halfW, halfD);
        
    } else {
        // LAZY GENERATION (large worlds > 64 chunks/side)
        updateLoadingBar(2, 'Preparing world generators...');
        await yieldToUI();
        
        const spawnGenRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        const spawnMinCX = Math.max(0, Math.floor(CHUNKS_X / 2) - spawnGenRadius);
        const spawnMaxCX = Math.min(CHUNKS_X - 1, Math.floor(CHUNKS_X / 2) + spawnGenRadius);
        const spawnMinCZ = Math.max(0, Math.floor(CHUNKS_Z / 2) - spawnGenRadius);
        const spawnMaxCZ = Math.min(CHUNKS_Z - 1, Math.floor(CHUNKS_Z / 2) + spawnGenRadius);
        
        // Build the coordinate list for the spawn area
        const coords = [];
        for (let cx = spawnMinCX; cx <= spawnMaxCX; cx++) {
            for (let cz = spawnMinCZ; cz <= spawnMaxCZ; cz++) {
                coords.push({ cx, cz });
            }
        }
        
        if (workerAvailable && typeof ensureChunksGeneratedBatch === 'function') {
            // v267: route through the worker
            await ensureChunksGeneratedBatch(coords, (done, total) => {
                updateLoadingBar(2 + (done / total) * 48, `Generating spawn area... ${Math.round((done / total) * 100)}%`);
            });
        } else {
            // Inline fallback
            let count = 0;
            const total = coords.length;
            for (const c of coords) {
                generateChunkColumn(c.cx, c.cz);
                count++;
                if (count % 32 === 0) {
                    updateLoadingBar(2 + (count / total) * 48, `Generating spawn area... ${Math.round((count / total) * 100)}%`);
                    await yieldToUI();
                }
            }
        }
        
        updateLoadingBar(52, 'Simulating spawn fluids...');
        await yieldToUI();
        
        const fluidMinX = (spawnMinCX * CHUNK_SIZE) - halfW;
        const fluidMaxX = ((spawnMaxCX + 1) * CHUNK_SIZE) - halfW;
        const fluidMinZ = (spawnMinCZ * CHUNK_SIZE) - halfD;
        const fluidMaxZ = ((spawnMaxCZ + 1) * CHUNK_SIZE) - halfD;
        simulateChunkFluids(fluidMinX, fluidMinZ, fluidMaxX, fluidMaxZ);
    }
    
    updateLoadingBar(82, 'Loading textures...');
    await yieldToUI();
    if (typeof loadFireTexture === 'function') await loadFireTexture();

    textureAtlas = await loadTextureAtlas();
    textureAtlasMip = (typeof loadMipTextureAtlas === 'function') ? await loadMipTextureAtlas() : textureAtlas;
    await loadToolAtlas();
    solidMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, alphaTest: 0.5, transparent: false, side: THREE.FrontSide, vertexColors: true });
    injectLightingShader(solidMaterial);
    solidMaterialMip = new THREE.MeshBasicMaterial({ map: textureAtlasMip || textureAtlas, alphaTest: 0.5, transparent: false, side: THREE.FrontSide, vertexColors: true });
    injectLightingShader(solidMaterialMip);
    if (typeof createPortalMaterial === 'function') createPortalMaterial(textureAtlas);
    if (typeof createAetherPortalMaterial === 'function') createAetherPortalMaterial(textureAtlas);
    
    glassMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, transparent: true, opacity: 1.0, alphaTest: 0.0, side: THREE.FrontSide, vertexColors: true, depthWrite: false });
    injectLightingShader(glassMaterial);
    glassMaterialMip = new THREE.MeshBasicMaterial({ map: textureAtlasMip || textureAtlas, transparent: true, opacity: 1.0, alphaTest: 0.0, side: THREE.FrontSide, vertexColors: true, depthWrite: false });
    injectLightingShader(glassMaterialMip);
    
    const waterTex = await loadWaterTexture();
    waterMaterial = createFluidMaterial(waterTex, true);
    
    const lavaTex = await loadLavaTexture();
    lavaMaterial = createFluidMaterial(lavaTex, false);
}
// ==========================================