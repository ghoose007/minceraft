// ==========================================
// AETHER DIMENSION GENERATION
// ==========================================

let _aetherNoise1, _aetherNoise2, _aetherNoise3, _aetherNoise4, _aetherNoiseCave;

function _initAetherNoise() {
    const s1 = ((_worldSeed * 331 + 1171) * 0.00000001) % 1;
    const s2 = ((_worldSeed * 397 + 1283) * 0.00000001) % 1;
    const s3 = ((_worldSeed * 461 + 1399) * 0.00000001) % 1;
    const s4 = ((_worldSeed * 521 + 1511) * 0.00000001) % 1;
    const s5 = ((_worldSeed * 599 + 1613) * 0.00000001) % 1;
    _aetherNoise1 = new PerlinNoise(Math.abs(s1) + 0.01);
    _aetherNoise2 = new PerlinNoise(Math.abs(s2) + 0.01);
    _aetherNoise3 = new PerlinNoise(Math.abs(s3) + 0.01);
    _aetherNoise4 = new PerlinNoise(Math.abs(s4) + 0.01);
    _aetherNoiseCave = new PerlinNoise(Math.abs(s5) + 0.01);
}

// Aether biomes
const AETHER_BIOME_NAME = 'aether_skyforest';
const AETHER_VOID_BIOME = 'aether_void';
const AETHER_LAKE_BIOME = 'aether_lake';
if (typeof BIOME_COLORS !== 'undefined') {
    BIOME_COLORS[AETHER_BIOME_NAME] = [0.65, 0.82, 0.55];   // Original green grass
    BIOME_COLORS[AETHER_VOID_BIOME] = [0.7, 0.85, 0.95];
    BIOME_COLORS[AETHER_LAKE_BIOME] = [0.65, 0.82, 0.55];
}
if (typeof BIOME_FOLIAGE_COLORS !== 'undefined') {
    BIOME_FOLIAGE_COLORS[AETHER_BIOME_NAME] = [0.80, 0.72, 0.38];  // Golden-amber leaves
    BIOME_FOLIAGE_COLORS[AETHER_VOID_BIOME] = [0.80, 0.72, 0.38];
    BIOME_FOLIAGE_COLORS[AETHER_LAKE_BIOME] = [0.80, 0.72, 0.38];
}
if (typeof BIOME_WATER_COLORS !== 'undefined') {
    BIOME_WATER_COLORS[AETHER_BIOME_NAME] = [0.1, 1.8, 1.35];
    BIOME_WATER_COLORS[AETHER_VOID_BIOME] = [0.1, 1.8, 1.35];
    BIOME_WATER_COLORS[AETHER_LAKE_BIOME] = [0.1, 1.8, 1.35];
}

// Aether biome ID table — same shape as overworld's BIOME_IDS / BIOME_NAMES.
// These are LOCAL aether-only IDs used inside the chunkBiomeCache and the
// worker's biomes buffer. Order MUST match _AETHER_BIOME_ID_TO_NAME on the
// main thread (game-loop.js) which decodes the buffer.
const AETHER_BIOME_IDS = {
    'aether_void': 0,
    'aether_skyforest': 1,
    'aether_lake': 2
};
const AETHER_BIOME_NAMES_BY_ID = ['aether_void', 'aether_skyforest', 'aether_lake'];

// Mirror of overworld's _computeChunkBiomeData (in biomes.js). Produces a
// COMPLETE 256-cell Uint8Array of biome IDs for a chunk and caches it in
// the global chunkBiomeCache. Both main-thread gen and the worker pull
// from this cache; the worker also reads it after gen to pack into the
// transferred biomes buffer.
//
// Aether's biome decision is purely a function of the noise field: a cell
// is aether_skyforest iff totalPresence >= threshold (the same gate Phase 1
// uses to decide whether to place terrain in that column). All other cells
// are aether_void. This means we can compute the biome map BEFORE running
// the actual terrain placement, just like overworld does.
function _computeAetherChunkBiomeData(cx, cz) {
    const key = 'aether:' + cx + ',' + cz;
    if (chunkBiomeCache.has(key)) return chunkBiomeCache.get(key);
    
    const halfW = Math.floor(WORLD_WIDTH / 2);
    const startX = cx * CHUNK_SIZE - halfW;
    const startZ = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH / 2);
    
    // Match Phase 1's noise scale exactly
    const sizeM = GEN_AETHER_ISLAND_SIZE / 100;
    const smoothM = GEN_AETHER_SMOOTHNESS / 100;
    const densityM = GEN_AETHER_ISLAND_DENSITY / 100;
    const islandScale = 55 * sizeM * smoothM;
    const threshold = 0.10 - (densityM - 1.0) * 0.12;
    
    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const p1 = _aetherNoise1.fbm(x / (islandScale * 2.5), z / (islandScale * 2.5), 4);
            const p2 = _aetherNoise2.fbm(x / (islandScale * 0.9), z / (islandScale * 0.9), 3) * 0.35;
            const p3 = _aetherNoise4.fbm(x / (islandScale * 0.4), z / (islandScale * 0.4), 2) * 0.15;
            const totalPresence = p1 + p2 + p3;
            // Skyforest where there's island presence; void elsewhere
            biomes[lx + lz * CHUNK_SIZE] = (totalPresence >= threshold)
                ? AETHER_BIOME_IDS['aether_skyforest']
                : AETHER_BIOME_IDS['aether_void'];
        }
    }
    
    const data = { biomes };
    chunkBiomeCache.set(key, data);
    return data;
}

// Aether generation settings are declared in menu.js:
// GEN_AETHER_ISLAND_DENSITY, GEN_AETHER_ISLAND_SIZE, GEN_AETHER_ISLAND_HEIGHT,
// GEN_AETHER_TREE_DENSITY, GEN_AETHER_GRASS_DENSITY, GEN_AETHER_SMOOTHNESS,
// GEN_AETHER_VOLATILITY, GEN_AETHER_CAVE_SIZE, GEN_AETHER_CAVE_DENSITY

// Superflat aether: random small flat islands made of 1 grass + 2 dirt + 3 stone
// Uses deterministic per-region random for consistent island placement
function _generateSuperflatAetherChunk(cx, cz) {
    _markChunkGenerated(cx, cz);
    _getOrCreateChunkFast(cx, cz);
    
    const startX = cx * CHUNK_SIZE - Math.floor(WORLD_WIDTH / 2);
    const startZ = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH / 2);
    const halfW = Math.floor(WORLD_WIDTH / 2);
    const halfD = Math.floor(WORLD_DEPTH / 2);
    
    // Build a complete dense biome array for this chunk and cache it for
    // the worker to read after gen. Mirrors the overworld pattern in
    // biomes.js -> _computeChunkBiomeData. Superflat aether is mostly void
    // with skyforest where islands sit; we fill void first then mark island
    // cells as skyforest as the region loop runs below.
    const aetherBiomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    aetherBiomes.fill(AETHER_BIOME_IDS['aether_void']);
    
    // Pre-fill biome map as void
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = startX + lx + halfW;
            const wz = startZ + lz + halfD;
            if (wx >= 0 && wx < WORLD_WIDTH && wz >= 0 && wz < WORLD_DEPTH) {
                biomeMap[wx + wz * WORLD_WIDTH] = AETHER_VOID_BIOME;
            }
        }
    }
    
    // Region-based island placement: divide world into 24x24 regions, each region MAY have one island
    const REGION_SIZE = 24;
    const ISLAND_Y = 80; // grass top Y
    
    // Find regions that overlap this chunk
    const regionMinX = Math.floor((startX - REGION_SIZE) / REGION_SIZE);
    const regionMaxX = Math.floor((startX + CHUNK_SIZE + REGION_SIZE) / REGION_SIZE);
    const regionMinZ = Math.floor((startZ - REGION_SIZE) / REGION_SIZE);
    const regionMaxZ = Math.floor((startZ + CHUNK_SIZE + REGION_SIZE) / REGION_SIZE);
    
    function regionHash(rx, rz) {
        let h = (rx * 374761393 + rz * 668265263) ^ 0x9E3779B9;
        h = (h ^ (h >>> 13)) * 1274126177;
        h = h ^ (h >>> 16);
        return (h >>> 0) / 4294967296;
    }
    
    for (let rx = regionMinX; rx <= regionMaxX; rx++) {
        for (let rz = regionMinZ; rz <= regionMaxZ; rz++) {
            const presence = regionHash(rx, rz);
            if (presence < 0.55) continue; // ~45% of regions have an island
            
            // Island center within region
            const cxOff = regionHash(rx + 1, rz) * REGION_SIZE;
            const czOff = regionHash(rx, rz + 1) * REGION_SIZE;
            const islandCX = rx * REGION_SIZE + Math.floor(cxOff);
            const islandCZ = rz * REGION_SIZE + Math.floor(czOff);
            
            // Island radius 3 to 6 blocks
            const radius = 3 + Math.floor(regionHash(rx + 7, rz + 11) * 4);
            
            // Place blocks
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    // Roughly circular shape
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist > radius) continue;
                    
                    const wx = islandCX + dx;
                    const wz = islandCZ + dz;
                    
                    // Only place if in this chunk's range
                    if (wx < startX || wx >= startX + CHUNK_SIZE) continue;
                    if (wz < startZ || wz >= startZ + CHUNK_SIZE) continue;
                    
                    // 1 grass + 2 dirt + 3 stone (top to bottom)
                    setVoxel(wx, ISLAND_Y, wz, 1);     // Grass
                    setVoxel(wx, ISLAND_Y - 1, wz, 2); // Dirt
                    setVoxel(wx, ISLAND_Y - 2, wz, 2); // Dirt
                    setVoxel(wx, ISLAND_Y - 3, wz, 3); // Stone
                    setVoxel(wx, ISLAND_Y - 4, wz, 3); // Stone
                    setVoxel(wx, ISLAND_Y - 5, wz, 3); // Stone
                    
                    // Mark biome as skyforest for this column
                    const bx = wx + halfW;
                    const bz = wz + halfD;
                    if (bx >= 0 && bx < WORLD_WIDTH && bz >= 0 && bz < WORLD_DEPTH) {
                        biomeMap[bx + bz * WORLD_WIDTH] = AETHER_BIOME_NAME;
                    }
                    // Also mark in our local dense array so the worker sees it
                    const localLx = wx - startX;
                    const localLz = wz - startZ;
                    if (localLx >= 0 && localLx < CHUNK_SIZE && localLz >= 0 && localLz < CHUNK_SIZE) {
                        aetherBiomes[localLx + localLz * CHUNK_SIZE] = AETHER_BIOME_IDS['aether_skyforest'];
                    }
                }
            }
        }
    }
    
    // Cache the dense biome array so the worker can pull it after gen
    chunkBiomeCache.set('aether:' + cx + ',' + cz, { biomes: aetherBiomes });
}

function generateAetherChunkColumn(cx, cz) {
    if (_isChunkGenerated(cx, cz)) return;
    
    // Superflat dispatch
    if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 1) {
        _generateSuperflatAetherChunk(cx, cz);
        return;
    }
    
    _markChunkGenerated(cx, cz);

    const startX = cx * CHUNK_SIZE - Math.floor(WORLD_WIDTH / 2);
    const startZ = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH / 2);
    const halfW = Math.floor(WORLD_WIDTH / 2);
    const halfD = Math.floor(WORLD_DEPTH / 2);

    const densityM = GEN_AETHER_ISLAND_DENSITY / 100;
    const sizeM = GEN_AETHER_ISLAND_SIZE / 100;
    const heightM = GEN_AETHER_ISLAND_HEIGHT / 100;
    const treeM = GEN_AETHER_TREE_DENSITY / 100;
    const grassM = GEN_AETHER_GRASS_DENSITY / 100;
    const smoothM = GEN_AETHER_SMOOTHNESS / 100;
    const volM = GEN_AETHER_VOLATILITY / 100;
    const caveSizeM = GEN_AETHER_CAVE_SIZE / 100;
    const caveDensityM = GEN_AETHER_CAVE_DENSITY / 100;

    // Noise scales — smoothness affects these
    const islandScale = 55 * sizeM * smoothM;
    const detailScale = 30 * smoothM;

    // Compute the chunk's complete biome data from noise (mirrors overworld
    // pattern in biomes.js -> _computeChunkBiomeData). This produces a dense
    // 256-cell Uint8Array of biome IDs that gets cached for the worker to
    // read after gen finishes. Then we write each cell's biome name into
    // biomeMap as a dense pass — no more sparse writes scattered through
    // the gen code.
    const aetherBiomeData = _computeAetherChunkBiomeData(cx, cz);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const wx = startX + lx + halfW;
            const wz = startZ + lz + halfD;
            if (wx >= 0 && wx < WORLD_WIDTH && wz >= 0 && wz < WORLD_DEPTH) {
                const id = aetherBiomeData.biomes[lx + lz * CHUNK_SIZE];
                biomeMap[wx + wz * WORLD_WIDTH] = AETHER_BIOME_NAMES_BY_ID[id];
            }
        }
    }

    // Track per-column highest solid Y for decoration phases
    const colSurfaceY = new Int32Array(CHUNK_SIZE * CHUNK_SIZE).fill(-1);

    // ==========================================
    // PHASE 1: 3D DENSITY FIELD — FLOATING ISLANDS
    // ==========================================

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const wx = x + halfW;
            const wz = z + halfD;

            if (wx <= 1 || wx >= WORLD_WIDTH - 2 || wz <= 1 || wz >= WORLD_DEPTH - 2) continue;

            // Large-scale island presence (low freq 2D noise)
            const presence1 = _aetherNoise1.fbm(x / (islandScale * 2.5), z / (islandScale * 2.5), 4);
            const presence2 = _aetherNoise2.fbm(x / (islandScale * 0.9), z / (islandScale * 0.9), 3) * 0.35;
            const presence3 = _aetherNoise4.fbm(x / (islandScale * 0.4), z / (islandScale * 0.4), 2) * 0.15;

            const totalPresence = presence1 + presence2 + presence3;
            const threshold = 0.10 - (densityM - 1.0) * 0.12;
            if (totalPresence < threshold) continue;

            const strength = Math.min(1.0, (totalPresence - threshold) / 0.35);

            // Per-island height variation
            const heightOffset = _aetherNoise3.fbm(x / (islandScale * 3), z / (islandScale * 3), 2);
            const islandCenterY = 60 + Math.max(0, Math.floor(heightOffset * 30 * volM));

            // Surface detail
            const hillNoise = _aetherNoise3.fbm(x / detailScale, z / detailScale, 4, 0.45);
            const hillNoise2 = _aetherNoise4.fbm(x / (detailScale * 0.6), z / (detailScale * 0.6), 3, 0.5);
            const surfDetail = (hillNoise * 12 + hillNoise2 * 6) * heightM * strength * volM;

            // Island thickness
            const edgeStr = Math.pow(strength, 0.6);
            const thickBase = 12 + edgeStr * 30 * heightM;
            const thickDetail = _aetherNoise4.noise3D(x / 25, 0, z / 25) * 6;
            const thickness = Math.max(5, thickBase + thickDetail);

            const topY = Math.floor(islandCenterY + surfDetail + thickness * 0.3);
            const botY = Math.max(3, Math.floor(islandCenterY + surfDetail - thickness * 0.7));

            let highestSolid = -1;

            for (let y = botY; y <= topY; y++) {
                if (y < 0 || y >= 256) continue;

                const vertMid = (botY + topY) / 2;
                const halfH = (topY - botY) / 2 + 0.01;
                const vertNorm = (y - vertMid) / halfH;
                const vertDensity = Math.cos(vertNorm * Math.PI * 0.5);

                const n3d = _aetherNoise2.noise3D(x / (20 * smoothM), y / (14 * smoothM), z / (20 * smoothM));
                const med = _aetherNoise1.noise3D(x / (35 * smoothM), y / (25 * smoothM), z / (35 * smoothM)) * 0.25;
                const fine = _aetherNoise4.noise3D(x / (9 * smoothM), y / (7 * smoothM), z / (9 * smoothM)) * 0.15;

                const density = vertDensity * edgeStr * 0.55 + n3d * 0.3 + med + fine - 0.08;

                if (density > 0) {
                    const yAbove = y + 1;
                    let aboveIsSolid = false;
                    if (yAbove <= topY) {
                        const avNorm = (yAbove - vertMid) / halfH;
                        const avDens = Math.cos(avNorm * Math.PI * 0.5);
                        const avN3d = _aetherNoise2.noise3D(x / (20 * smoothM), yAbove / (14 * smoothM), z / (20 * smoothM));
                        const avMed = _aetherNoise1.noise3D(x / (35 * smoothM), yAbove / (25 * smoothM), z / (35 * smoothM)) * 0.25;
                        const avFine = _aetherNoise4.noise3D(x / (9 * smoothM), yAbove / (7 * smoothM), z / (9 * smoothM)) * 0.15;
                        aboveIsSolid = (avDens * edgeStr * 0.55 + avN3d * 0.3 + avMed + avFine - 0.08) > 0;
                    }

                    if (!aboveIsSolid) {
                        setVoxel(x, y, z, 1); // Grass surface
                        highestSolid = Math.max(highestSolid, y);
                    } else {
                        // Place stone for now — dirt layer applied in post-pass
                        setVoxel(x, y, z, 3);
                    }
                }
            }

            colSurfaceY[lx + lz * CHUNK_SIZE] = highestSolid;
        }
    }

    // ==========================================
    // PHASE 1a: DIRT LAYER — scan each column top-down, place dirt below every grass surface
    // This handles overhangs, multiple surfaces, and irregular terrain
    // ==========================================
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;

            let depthBelowSurface = -1;
            for (let y = 200; y >= 3; y--) {
                const bid = getVoxel(x, y, z) & 0xFF;
                if (bid === 0 || bid === 4 || isCrossBlock(bid)) {
                    // Air/water/cross — reset depth counter
                    depthBelowSurface = -1;
                } else if (bid === 1) {
                    // Grass surface — start counting
                    depthBelowSurface = 0;
                } else if (bid === 3 && depthBelowSurface >= 0) {
                    // Stone below a surface — convert to dirt if within 3-4 blocks
                    depthBelowSurface++;
                    if (depthBelowSurface <= 4) {
                        setVoxel(x, y, z, 2);
                    } else {
                        depthBelowSurface = -1; // Deep enough, stop converting
                    }
                } else if (bid === 2) {
                    // Already dirt, keep counting
                    if (depthBelowSurface >= 0) depthBelowSurface++;
                    if (depthBelowSurface > 4) depthBelowSurface = -1;
                } else {
                    depthBelowSurface = -1;
                }
            }
        }
    }

    // ==========================================
    // PHASE 1b: WATER BODIES — large depressions inside islands
    // Finds 50x50+ areas fully within presence >= 0.25, depresses terrain
    // using noise for natural shapes, fills air with water up to Y=67.
    // ==========================================
    const AETHER_WATER_LEVEL = 67;
    const WATER_REGION_SIZE = 40;

    function _getPresenceMargin(wx, wz) {
        const pp1 = _aetherNoise1.fbm(wx / (islandScale * 2.5), wz / (islandScale * 2.5), 4);
        const pp2 = _aetherNoise2.fbm(wx / (islandScale * 0.9), wz / (islandScale * 0.9), 3) * 0.35;
        const pp3 = _aetherNoise4.fbm(wx / (islandScale * 0.4), wz / (islandScale * 0.4), 2) * 0.15;
        const thr = 0.10 - (densityM - 1.0) * 0.12;
        return (pp1 + pp2 + pp3) - thr;
    }

    const chunkWorldMinX = startX;
    const chunkWorldMaxX = startX + CHUNK_SIZE - 1;
    const chunkWorldMinZ = startZ;
    const chunkWorldMaxZ = startZ + CHUNK_SIZE - 1;

    const regionMinRX = Math.floor((chunkWorldMinX - 50) / WATER_REGION_SIZE) - 1;
    const regionMaxRX = Math.floor((chunkWorldMaxX + 50) / WATER_REGION_SIZE) + 1;
    const regionMinRZ = Math.floor((chunkWorldMinZ - 50) / WATER_REGION_SIZE) - 1;
    const regionMaxRZ = Math.floor((chunkWorldMaxZ + 50) / WATER_REGION_SIZE) + 1;

    for (let rx = regionMinRX; rx <= regionMaxRX; rx++) {
        for (let rz = regionMinRZ; rz <= regionMaxRZ; rz++) {
            const rSeed = (rx * 48271 ^ rz * 16807 ^ (_worldSeed & 0xFFFF) * 65521) & 0x7FFFFFFF;
            let rState = rSeed || 1;
            const rng = () => { rState ^= rState << 13; rState ^= rState >> 17; rState ^= rState << 5; return (rState & 0x7FFFFFFF) / 0x7FFFFFFF; };

            // ~25% of regions get a water body attempt
            if (rng() > 0.50) continue;

            const bodyCenterX = rx * WATER_REGION_SIZE + Math.floor(rng() * WATER_REGION_SIZE);
            const bodyCenterZ = rz * WATER_REGION_SIZE + Math.floor(rng() * WATER_REGION_SIZE);
            const bodySize = 12 + Math.floor(rng() * 13); // 25-50 block radius

            // Quick chunk overlap check
            if (bodyCenterX + bodySize < chunkWorldMinX || bodyCenterX - bodySize > chunkWorldMaxX) continue;
            if (bodyCenterZ + bodySize < chunkWorldMinZ || bodyCenterZ - bodySize > chunkWorldMaxZ) continue;

            // Verify entire area is within presence >= 0.25
            // Sample every 5 blocks along the perimeter + corners + center
            let allInside = true;
            for (let checkDist = 0; checkDist <= bodySize; checkDist += 5) {
                if (!allInside) break;
                // Check 8 directions at this distance
                for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]]) {
                    const cx = bodyCenterX + Math.floor(dx * checkDist);
                    const cz = bodyCenterZ + Math.floor(dz * checkDist);
                    if (_getPresenceMargin(cx, cz) < 0.18) {
                        allInside = false; break;
                    }
                }
            }
            if (!allInside) continue;

            const maxDepth = 3 + Math.floor(rng() * 6);
            const blendDist = 24;
            const totalRadius = bodySize + blendDist;

            // PASS 1: Carve water body
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    const x = startX + lx;
                    const z = startZ + lz;

                    const dx = x - bodyCenterX;
                    const dz = z - bodyCenterZ;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist > bodySize) continue;

                    const sy = colSurfaceY[lx + lz * CHUNK_SIZE];
                    if (sy < 0) continue;

                    const edgeFactor = 1.0 - (dist / bodySize);
                    const smoothEdge = edgeFactor * edgeFactor;

                    const shapeNoise = _aetherNoiseCave.noise3D(x * 0.06, 0, z * 0.06) * 0.3 +
                                       _aetherNoise4.noise3D(x * 0.12 + 300, 0, z * 0.12 + 300) * 0.15;
                    const noiseShape = smoothEdge + shapeNoise;
                    if (noiseShape < 0.1) continue;

                    const depth = Math.max(1, Math.floor(maxDepth * noiseShape));
                    const targetBedY = AETHER_WATER_LEVEL - 1 - depth;

                    for (let y = sy; y > targetBedY; y--) {
                        const bid = getVoxel(x, y, z) & 0xFF;
                        if (bid === 1 || bid === 2 || bid === 3 || bid === 16 || bid === 23 || bid === 53 || bid === 24 || isCrossBlock(bid)) {
                            setVoxel(x, y, z, 0);
                        }
                    }

                    if (targetBedY >= 3) {
                        // Gravel patches on lake bed using noise
                        const gravelN = _aetherNoise4.noise3D(x * 0.15 + 100, targetBedY * 0.1, z * 0.15 + 100);
                        if (gravelN > 0.2) {
                            setVoxel(x, targetBedY, z, 5); // Gravel
                        } else {
                            setVoxel(x, targetBedY, z, 2); // Dirt
                        }
                    }

                    for (let y = targetBedY + 1; y <= AETHER_WATER_LEVEL; y++) {
                        const bid = getVoxel(x, y, z) & 0xFF;
                        if (bid === 0 || isCrossBlock(bid)) {
                            setVoxel(x, y, z, 4, 8, 0, 1);
                        }
                    }

                    colSurfaceY[lx + lz * CHUNK_SIZE] = -1;
                }
            }
        }
    }

    // ==========================================
    // PHASE 1c: TERRAIN BLENDING — independent of water body regions
    // Checks every column in the chunk for nearby water using getVoxel
    // (cross-chunk safe). Blends terrain smoothly to sea level.
    // ==========================================
    {
        const blendDist = 24;

        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const sy = colSurfaceY[lx + lz * CHUNK_SIZE];
                if (sy === -1) continue;

                const x = startX + lx;
                const z = startZ + lz;

                // Find nearest water using actual voxels — works across chunks
                let minWaterDist = 999;
                const searchR = blendDist + 2;
                for (let sdx = -searchR; sdx <= searchR && minWaterDist > 1; sdx++) {
                    for (let sdz = -searchR; sdz <= searchR && minWaterDist > 1; sdz++) {
                        const wd = Math.sqrt(sdx * sdx + sdz * sdz);
                        if (wd >= minWaterDist) continue;
                        if ((getVoxel(x + sdx, AETHER_WATER_LEVEL, z + sdz) & 0xFF) === 4) {
                            minWaterDist = wd;
                        }
                    }
                }

                if (minWaterDist >= blendDist || minWaterDist >= 999) continue;

                const blendFactor = 1.0 - (minWaterDist / blendDist);
                const smoothBlend = blendFactor * blendFactor;
                const blendTargetY = AETHER_WATER_LEVEL;

                let actualSY = sy;
                if (actualSY < 0) {
                    for (let scanY = AETHER_WATER_LEVEL + 30; scanY >= 3; scanY--) {
                        const bid = getVoxel(x, scanY, z) & 0xFF;
                        if (bid !== 0 && bid !== 4 && !isCrossBlock(bid)) {
                            actualSY = scanY; break;
                        }
                    }
                    if (actualSY < 0) actualSY = AETHER_WATER_LEVEL - 10;
                }

                const targetY = Math.round(actualSY + (blendTargetY - actualSY) * smoothBlend);

                if (targetY > actualSY) {
                    for (let y = actualSY; y <= targetY; y++) {
                        if (y === targetY) setVoxel(x, y, z, 1);
                        else if (y >= targetY - 3) setVoxel(x, y, z, 2);
                        else {
                            const existing = getVoxel(x, y, z) & 0xFF;
                            if (existing === 0 || existing === 4 || isCrossBlock(existing)) setVoxel(x, y, z, 3);
                        }
                    }
                    if (actualSY >= 3 && (getVoxel(x, actualSY, z) & 0xFF) === 1) setVoxel(x, actualSY, z, 2);
                    colSurfaceY[lx + lz * CHUNK_SIZE] = targetY;

                } else if (targetY < actualSY) {
                    for (let y = actualSY; y > targetY; y--) {
                        const bid = getVoxel(x, y, z) & 0xFF;
                        if (bid === 1 || bid === 2 || bid === 3 || bid === 16 || bid === 23 || bid === 53 || bid === 24 || isCrossBlock(bid)) {
                            setVoxel(x, y, z, 0);
                        }
                    }
                    const belowBid = getVoxel(x, targetY - 1, z) & 0xFF;
                    if (belowBid === 0 || belowBid === 4) {
                        for (let fy = targetY - 1; fy >= targetY - 6; fy--) {
                            const fb = getVoxel(x, fy, z) & 0xFF;
                            if (fb !== 0 && fb !== 4 && !isCrossBlock(fb)) break;
                            setVoxel(x, fy, z, 3);
                        }
                    }
                    setVoxel(x, targetY, z, 1);
                    for (let dy = 1; dy <= 3; dy++) {
                        if (targetY - dy < 3) break;
                        const bid = getVoxel(x, targetY - dy, z) & 0xFF;
                        if (bid === 3) setVoxel(x, targetY - dy, z, 2);
                        else break;
                    }
                    colSurfaceY[lx + lz * CHUNK_SIZE] = targetY;
                }
            }
        }

        // Seal leaks — plug void columns next to water
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                if (colSurfaceY[lx + lz * CHUNK_SIZE] !== -1) continue;
                const x = startX + lx;
                const z = startZ + lz;
                for (const [ndx, ndz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const nlx = lx + ndx, nlz = lz + ndz;
                    if (nlx < 0 || nlx >= CHUNK_SIZE || nlz < 0 || nlz >= CHUNK_SIZE) continue;
                    const neighborSY = colSurfaceY[nlx + nlz * CHUNK_SIZE];
                    if (neighborSY === -1 || neighborSY >= 0) continue;
                    const nx = x + ndx, nz = z + ndz;
                    for (let y = AETHER_WATER_LEVEL - 1; y >= AETHER_WATER_LEVEL - 8; y--) {
                        const nBid = getVoxel(nx, y, nz) & 0xFF;
                        if (nBid !== 0 && nBid !== 4 && !isCrossBlock(nBid)) break;
                        if (nBid === 0 || isCrossBlock(nBid)) setVoxel(nx, y, nz, 3);
                    }
                }
            }
        }
    }
    // PHASE 2 (biome assignment) used to live here as a sparse pass that
    // upgraded specific cells from void to skyforest. It's now done up-front
    // by _computeAetherChunkBiomeData which produces a complete dense biome
    // array, mirroring the overworld's pattern. No work needed here.

    // ==========================================
    // PHASE 3: WORM TUNNEL CAVES (runs AFTER water to avoid lake zones)
    // ==========================================
    if (caveDensityM > 0.01) {
        const chunkMinX = startX;
        const chunkMaxX = startX + CHUNK_SIZE - 1;
        const chunkMinZ = startZ;
        const chunkMaxZ = startZ + CHUNK_SIZE - 1;
        const caveRadMult = caveSizeM;

        function _estimateIslandRange(ex, ez) {
            const p1 = _aetherNoise1.fbm(ex / (islandScale * 2.5), ez / (islandScale * 2.5), 4);
            const p2 = _aetherNoise2.fbm(ex / (islandScale * 0.9), ez / (islandScale * 0.9), 3) * 0.35;
            const p3 = _aetherNoise4.fbm(ex / (islandScale * 0.4), ez / (islandScale * 0.4), 2) * 0.15;
            const tp = p1 + p2 + p3;
            const thr = 0.10 - (densityM - 1.0) * 0.12;
            if (tp < thr) return null;
            const str = Math.min(1.0, (tp - thr) / 0.35);
            const edgeStr = Math.pow(str, 0.6);
            const hOff = _aetherNoise3.fbm(ex / (islandScale * 3), ez / (islandScale * 3), 2);
            const centerY = 65 + hOff * 30 * volM;
            const hill = _aetherNoise3.fbm(ex / detailScale, ez / detailScale, 4, 0.45);
            const hill2 = _aetherNoise4.fbm(ex / (detailScale * 0.6), ez / (detailScale * 0.6), 3, 0.5);
            const surfD = (hill * 12 + hill2 * 6) * heightM * str * volM;
            const thickB = 12 + edgeStr * 30 * heightM;
            const topY = Math.floor(centerY + surfD + thickB * 0.3);
            const botY = Math.max(3, Math.floor(centerY + surfD - thickB * 0.7));
            return { top: topY, bot: botY };
        }

        function _aetherCarveWorm(rng, wx, wy, wz, maxSteps, baseRadius, yaw, pitch, depth) {
            const rad = baseRadius * caveRadMult;
            for (let step = 0; step < maxSteps; step++) {
                const t = step / maxSteps;
                let taper = 1.0;
                if (t < 0.1) taper = t / 0.1;
                else if (t > 0.88) taper = (1.0 - t) / 0.12;
                taper = Math.max(0, Math.min(1, taper));

                const roomWobble = 1.0 + Math.sin(step * 0.15) * 0.35 * caveSizeM;
                const r = Math.max(0.5, rad * taper * roomWobble);

                yaw += (rng() - 0.5) * 0.6;
                pitch += (rng() - 0.5) * 0.4;
                pitch = Math.max(-0.8, Math.min(0.8, pitch));

                wx += Math.cos(yaw) * Math.cos(pitch);
                wy += Math.sin(pitch);
                wz += Math.sin(yaw) * Math.cos(pitch);

                if (wy < 8) { pitch = Math.abs(pitch) * 0.5; wy = 8; }
                if (wy > 120) { pitch = -Math.abs(pitch) * 0.5; wy = 120; }

                const branchRoll = rng();
                if (depth < 1 && step > 6 && step < maxSteps - 6 && branchRoll < 0.04 * caveDensityM) {
                    const bLen = Math.floor(maxSteps * (0.2 + rng() * 0.3));
                    const bYaw = yaw + (rng() - 0.5) * 2.5;
                    const bPitch = pitch + (rng() - 0.5) * 0.5;
                    const bRad = rad * (0.4 + rng() * 0.4) / caveRadMult;
                    _aetherCarveWorm(rng, wx, wy, wz, bLen, bRad, bYaw, bPitch, depth + 1);
                }

                const cix = Math.floor(wx), ciy = Math.floor(wy), ciz = Math.floor(wz);
                const ri = Math.ceil(r) + 1;

                if (cix + ri >= chunkMinX && cix - ri <= chunkMaxX &&
                    ciz + ri >= chunkMinZ && ciz - ri <= chunkMaxZ) {
                    const rSq = r * r;
                    for (let dx = -ri; dx <= ri; dx++) {
                        for (let dy = -ri; dy <= ri; dy++) {
                            for (let dz = -ri; dz <= ri; dz++) {
                                if (dx * dx + dy * dy * 1.3 + dz * dz > rSq) continue;
                                const bx = cix + dx, by = ciy + dy, bz = ciz + dz;
                                if (bx < chunkMinX || bx > chunkMaxX || bz < chunkMinZ || bz > chunkMaxZ) continue;
                                if (by < 5 || by >= 256) continue;

                                // Don't carve near water — 2 block radius check
                                const bid = getVoxel(bx, by, bz) & 0xFF;
                                if (bid === 4 || bid === 15) continue; // Water or sand = lake area
                                if (bid !== 3 && bid !== 2 && bid !== 1) continue;

                                // Safety: don't carve if any block within 2 blocks is water
                                let nearWater = false;
                                for (let cdx = -2; cdx <= 2 && !nearWater; cdx++) {
                                    for (let cdy = -2; cdy <= 2 && !nearWater; cdy++) {
                                        for (let cdz = -2; cdz <= 2 && !nearWater; cdz++) {
                                            if (cdx === 0 && cdy === 0 && cdz === 0) continue;
                                            if (Math.abs(cdx) + Math.abs(cdy) + Math.abs(cdz) > 3) continue;
                                            const nid = getVoxel(bx+cdx, by+cdy, bz+cdz) & 0xFF;
                                            if (nid === 4) nearWater = true;
                                        }
                                    }
                                }
                                if (nearWater) continue;

                                setVoxel(bx, by, bz, 0);
                            }
                        }
                    }
                }
            }
        }

        const wormReach = 6;
        for (let rcx = cx - wormReach; rcx <= cx + wormReach; rcx++) {
            for (let rcz = cz - wormReach; rcz <= cz + wormReach; rcz++) {
                const rSeed = (rcx * 73856093 ^ rcz * 19349663 ^ (_worldSeed & 0xFFFF) * 83492791) & 0x7FFFFFFF;
                let rState = rSeed || 1;
                const rng = () => { rState ^= rState << 13; rState ^= rState >> 17; rState ^= rState << 5; return (rState & 0x7FFFFFFF) / 0x7FFFFFFF; };

                if (rng() > 0.25 * caveDensityM) continue;

                const numWorms = 1 + Math.floor(rng() * 2);
                for (let w = 0; w < numWorms; w++) {
                    const ox = rcx * CHUNK_SIZE - halfW + Math.floor(rng() * CHUNK_SIZE);
                    const oz = rcz * CHUNK_SIZE - halfD + Math.floor(rng() * CHUNK_SIZE);

                    const range = _estimateIslandRange(ox, oz);
                    if (!range || range.top - range.bot < 8) {
                        rng(); rng(); rng(); rng(); continue;
                    }

                    const oy = range.bot + Math.floor(rng() * (range.top - range.bot - 4)) + 2;
                    const wormLen = Math.floor((30 + rng() * 60) * caveSizeM);
                    const wormRad = 1.0 + rng() * 1.5;
                    const wormYaw = rng() * Math.PI * 2;
                    const wormPitch = (rng() - 0.5) * 0.6;

                    _aetherCarveWorm(rng, ox, oy, oz, wormLen, wormRad, wormYaw, wormPitch, 0);
                }
            }
        }
    }


    // ==========================================
    // PHASE 4: ORES
    // ==========================================
    let chunkMinSolidY = 256, chunkMaxSolidY = 0;
    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        if (colSurfaceY[i] > chunkMaxSolidY) chunkMaxSolidY = colSurfaceY[i];
    }
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            for (let y = 5; y < 128; y++) {
                const b = getVoxel(x, y, z) & 0xFF;
                if (b === 3 || b === 2 || b === 1) {
                    if (y < chunkMinSolidY) chunkMinSolidY = y;
                    break;
                }
            }
        }
    }

    if (chunkMaxSolidY > chunkMinSolidY + 3) {
        const oreMinY = chunkMinSolidY;
        const oreMaxY = chunkMaxSolidY - 2;

        const _placeBlobs = (id, blobCount, minSize, maxSize, yMin, yMax) => {
            const effMin = Math.max(oreMinY, yMin);
            const effMax = Math.min(oreMaxY, yMax);
            if (effMax <= effMin) return;
            for (let i = 0; i < blobCount; i++) {
                const bx = startX + Math.floor(Math.random() * CHUNK_SIZE);
                const bz = startZ + Math.floor(Math.random() * CHUNK_SIZE);
                const by = effMin + Math.floor(Math.random() * (effMax - effMin));
                const targetSize = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
                const radius = Math.pow(targetSize, 1/3) * 0.75 + 0.5;
                const rSq = radius * radius;
                const bound = Math.ceil(radius);
                let placed = 0, done = false;
                for (let ox = -bound; ox <= bound && !done; ox++) {
                    for (let oy = -bound; oy <= bound && !done; oy++) {
                        for (let oz = -bound; oz <= bound && !done; oz++) {
                            if (ox*ox + oy*oy + oz*oz <= rSq * (0.8 + Math.random() * 0.4)) {
                                if ((getVoxel(bx+ox, by+oy, bz+oz) & 0xFF) === 3) {
                                    setVoxel(bx+ox, by+oy, bz+oz, id);
                                    placed++;
                                    if (placed >= targetSize) done = true;
                                }
                            }
                        }
                    }
                }
            }
        };

        _placeBlobs(7,  16, 8, 14, 0, 255);  // Coal
        _placeBlobs(6,  14, 4, 8,  0, 255);  // Iron
        _placeBlobs(8,  2,  3, 7,  0, 255);  // Redstone
        _placeBlobs(49, 6,  3, 6,  0, 255);  // Gold
        _placeBlobs(50, 1,  2, 5,  0, 255);  // Lapis
        _placeBlobs(9,  1,  2, 6,  0, 255);  // Diamond

        // Stone variants — large patches scattered through the stone
        _placeBlobs(10, 8,  15, 30, 0, 255);  // Diorite
        _placeBlobs(11, 8,  15, 30, 0, 255);  // Granite
        _placeBlobs(12, 8,  15, 30, 0, 255);  // Andesite
        _placeBlobs(5,  6,  10, 20, 0, 255);  // Gravel

        // Emerald — Aether exclusive, 1-3 veins per chunk
        const emeraldAttempts = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < emeraldAttempts; i++) {
            for (let attempt = 0; attempt < 8; attempt++) {
                const bx = startX + Math.floor(Math.random() * CHUNK_SIZE);
                const bz = startZ + Math.floor(Math.random() * CHUNK_SIZE);
                const by = oreMinY + Math.floor(Math.random() * (oreMaxY - oreMinY));
                if ((getVoxel(bx, by, bz) & 0xFF) !== 3) continue;
                setVoxel(bx, by, bz, 210);
                const veinSize = 1 + Math.floor(Math.random() * 3);
                if (veinSize >= 2) {
                    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
                    let placed = 1;
                    for (const [dx, dy, dz] of dirs) {
                        if (placed >= veinSize) break;
                        if ((getVoxel(bx+dx, by+dy, bz+dz) & 0xFF) === 3) {
                            setVoxel(bx+dx, by+dy, bz+dz, 210);
                            placed++;
                        }
                    }
                }
                break;
            }
        }
    }


    // ==========================================
    // PHASE 5: TREES (oak log = 13, oak leaves = 14)
    // ==========================================
    for (let lx = 3; lx < CHUNK_SIZE - 3; lx++) {
        for (let lz = 3; lz < CHUNK_SIZE - 3; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const sy = colSurfaceY[lx + lz * CHUNK_SIZE];
            if (sy < 0) continue;
            if ((getVoxel(x, sy, z) & 0xFF) !== 1) continue;
            if ((getVoxel(x, sy + 1, z) & 0xFF) !== 0) continue;

            const treeN = _aetherNoise3.noise3D(x * 0.25, 0, z * 0.25);
            if (treeN < 0.40 - treeM * 0.15) continue;
            if (Math.random() > 0.12 * treeM) continue;

            const trunkH = 4 + Math.floor(Math.random() * 4);
            const leafR = trunkH > 5 ? 3 : 2;

            let canPlace = true;
            for (let ty = 1; ty <= trunkH + 2; ty++) {
                if ((getVoxel(x, sy + ty, z) & 0xFF) !== 0) { canPlace = false; break; }
            }
            if (!canPlace) continue;

            for (let ty = 1; ty <= trunkH; ty++) {
                setVoxel(x, sy + ty, z, 13);
            }

            const leafBase = sy + trunkH - 1;
            for (let dx = -leafR; dx <= leafR; dx++) {
                for (let dz = -leafR; dz <= leafR; dz++) {
                    for (let dy = 0; dy <= leafR + 1; dy++) {
                        const dist = dx * dx + dz * dz + (dy - 1) * (dy - 1);
                        if (dist > leafR * leafR + 1) continue;
                        if (dx === 0 && dz === 0 && dy < 2) continue;
                        const lx2 = x + dx, ly2 = leafBase + dy, lz2 = z + dz;
                        if ((getVoxel(lx2, ly2, lz2) & 0xFF) === 0) {
                            setVoxel(lx2, ly2, lz2, 14);
                        }
                    }
                }
            }
        }
    }


    // ==========================================
    // PHASE 6: GROUND COVER (tall grass=16, rose=23, dandelion=53)
    // ==========================================
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const sy = colSurfaceY[lx + lz * CHUNK_SIZE];
            if (sy < 0) continue;
            if ((getVoxel(x, sy, z) & 0xFF) !== 1) continue;
            if ((getVoxel(x, sy + 1, z) & 0xFF) !== 0) continue;

            const roll = Math.random();
            if (roll < 0.30 * grassM) {
                setVoxel(x, sy + 1, z, 16);
            } else if (roll < 0.36 * grassM) {
                const flowerRoll = Math.random();
                if (flowerRoll < 0.25) setVoxel(x, sy + 1, z, 53);
                else if (flowerRoll < 0.50) setVoxel(x, sy + 1, z, 23);
                else if (flowerRoll < 0.75) setVoxel(x, sy + 1, z, 212);
                else setVoxel(x, sy + 1, z, 213);
            }
        }
    }
}

// ==========================================
// FULL WORLD GENERATION
// ==========================================
async function generateAetherWorld() {
    _initAetherNoise();

    // Initialize biomeMap for the aether dimension. We leave cells as undefined
    // (rather than blanket-filling with void) so that ungenerated areas don't
    // pollute the smoothing kernel with void colors at chunk boundaries. Each
    // chunk's biomeMap entries get populated densely by _computeAetherChunkBiomeData
    // when the chunk is generated. The mesh worker's biomeMap defaults to plains
    // for any cell it never received, but `_syncChunkToMeshWorker` has a
    // dimension-aware fallback that uses aether_skyforest in aether so undefined
    // cells get a sensible aether tint.
    biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);

    if (!useLazyGeneration) {
        updateLoadingBar(2, 'Generating Aether...');
        await yieldToUI();

        const totalChunks = CHUNKS_X * CHUNKS_Z;
        let chunksGenerated = 0;

        for (let cx = 0; cx < CHUNKS_X; cx++) {
            for (let cz = 0; cz < CHUNKS_Z; cz++) {
                generateAetherChunkColumn(cx, cz);
                chunksGenerated++;
                if (chunksGenerated % 64 === 0) {
                    updateLoadingBar(2 + (chunksGenerated / totalChunks) * 48, `Generating Aether... ${Math.round((chunksGenerated / totalChunks) * 100)}%`);
                    await yieldToUI();
                }
            }
        }

        updateLoadingBar(52, 'Simulating water...');
        await yieldToUI();
        const halfW = Math.floor(WORLD_WIDTH / 2);
        const halfD = Math.floor(WORLD_DEPTH / 2);
        simulateAetherFluids(-halfW, -halfD, halfW, halfD);
    } else {
        updateLoadingBar(2, 'Preparing Aether...');
        await yieldToUI();

        const spawnGenRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        const spawnMinCX = Math.max(0, Math.floor(CHUNKS_X / 2) - spawnGenRadius);
        const spawnMaxCX = Math.min(CHUNKS_X - 1, Math.floor(CHUNKS_X / 2) + spawnGenRadius);
        const spawnMinCZ = Math.max(0, Math.floor(CHUNKS_Z / 2) - spawnGenRadius);
        const spawnMaxCZ = Math.min(CHUNKS_Z - 1, Math.floor(CHUNKS_Z / 2) + spawnGenRadius);

        let total = (spawnMaxCX - spawnMinCX + 1) * (spawnMaxCZ - spawnMinCZ + 1);
        let count = 0;

        for (let cx = spawnMinCX; cx <= spawnMaxCX; cx++) {
            for (let cz = spawnMinCZ; cz <= spawnMaxCZ; cz++) {
                generateAetherChunkColumn(cx, cz);
                count++;
                if (count % 32 === 0) {
                    updateLoadingBar(2 + (count / total) * 48, `Generating Aether... ${Math.round((count / total) * 100)}%`);
                    await yieldToUI();
                }
            }
        }

        updateLoadingBar(52, 'Simulating water...');
        await yieldToUI();
        const fluidMinX = (spawnMinCX * CHUNK_SIZE) - Math.floor(WORLD_WIDTH / 2);
        const fluidMaxX = ((spawnMaxCX + 1) * CHUNK_SIZE) - Math.floor(WORLD_WIDTH / 2);
        const fluidMinZ = (spawnMinCZ * CHUNK_SIZE) - Math.floor(WORLD_DEPTH / 2);
        const fluidMaxZ = ((spawnMaxCZ + 1) * CHUNK_SIZE) - Math.floor(WORLD_DEPTH / 2);
        simulateAetherFluids(fluidMinX, fluidMinZ, fluidMaxX, fluidMaxZ);
    }

    updateLoadingBar(70, 'Calculating lighting...');
    await yieldToUI();
    if (typeof recalculateLighting === 'function') recalculateLighting();
}
