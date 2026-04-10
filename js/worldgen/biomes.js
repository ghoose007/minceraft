// ==========================================
// BIOME SYSTEM
// ==========================================

// --- Voronoi cell-based biome placement ---
// Instead of thresholding two linear noise gradients (which creates stripy boundaries),
// we scatter biome center points in a grid and assign each world position to its nearest center.
// The biome type at each center is still driven by temp/humid noise, so climate zones are coherent,
// but the boundaries between biomes become natural, blobby Voronoi edges.

// Deterministic hash for cell-based jitter
function _cellHash(ix, iz, salt) {
    let h = (ix * 374761393 + iz * 668265263 + salt) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h & 0x7fffffff) / 0x80000000; // 0..1
}

function _getRawBiome(x, z) {
    const cellSize = _wgBiomeScale * 1.8; // How large each Voronoi cell is in blocks
    
    // Light domain warping to add organic wobble to cell boundaries
    const warpScale = _wgBiomeScale * 0.8;
    const warpStrength = _wgBiomeScale * 0.3;
    const warpX = _wgPerlinVolatility.fbm(x / warpScale + 500, z / warpScale + 500, 2) * warpStrength;
    const warpZ = _wgPerlinVolatility.fbm(x / warpScale + 800, z / warpScale + 800, 2) * warpStrength;
    const wx = x + warpX;
    const wz = z + warpZ;
    
    // Find the grid cell this point is in
    const cellX = Math.floor(wx / cellSize);
    const cellZ = Math.floor(wz / cellSize);
    
    // Check this cell and all 8 neighbors to find closest center
    let closestDist = Infinity;
    let closestDist2 = Infinity; // second closest (for blending)
    let closestBiome = 'plains', closestBH = GEN_SEA_LEVEL + 3, closestBV = 10;
    
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const cx = cellX + dx;
            const cz = cellZ + dz;
            
            // Jitter the center point within its cell (0.2–0.8 range keeps them away from edges)
            const jx = (cx + 0.2 + _cellHash(cx, cz, _worldSeed) * 0.6) * cellSize;
            const jz = (cz + 0.2 + _cellHash(cx, cz, _worldSeed + 99999) * 0.6) * cellSize;
            
            const ddx = wx - jx;
            const ddz = wz - jz;
            const dist = ddx * ddx + ddz * ddz;
            
            if (dist < closestDist) {
                closestDist2 = closestDist;
                closestDist = dist;
                
                // Determine biome at this cell center using temp/humid noise
                const cTemp = _wgPerlinTemp.fbm(jx / _wgBiomeScale, jz / _wgBiomeScale, 3) + (GEN_TEMP_OFFSET / 100.0);
                const cHumid = _wgPerlinHumid.fbm(jx / _wgBiomeScale, jz / _wgBiomeScale, 3) + (GEN_HUMID_OFFSET / 100.0);
                
                const result = _classifyBiome(cTemp, cHumid);
                closestBiome = result.biome;
                closestBH = result.bH;
                closestBV = result.bV;
            } else if (dist < closestDist2) {
                closestDist2 = dist;
            }
        }
    }
    
    let biome = closestBiome, bH = closestBH, bV = closestBV;
    
    // Ocean override: ocean is determined by a separate large-scale noise layer
    // so that oceans can cut across any climate zone
    const oceanNoise = _wgPerlinOcean.fbm(wx / (_wgBiomeScale * 2.5), wz / (_wgBiomeScale * 2.5), 3);
    
    if (oceanNoise < -0.15) { 
        biome = 'ocean'; 
        bH = GEN_SEA_LEVEL - 16; 
        bV = 4; 
    } else if (oceanNoise < 0.1) {
        // Beach zone dampening
        const blend = (0.1 - oceanNoise) / 0.25; 
        bH = bH * (1.0 - blend) + (GEN_SEA_LEVEL - 2) * blend;
        bV = bV * (1.0 - blend) + 2 * blend;
    }

    // v298: Alpha preset — all non-ocean biomes become alpha_forest.
    // Rivers still work because the river override runs below this and
    // only exempts ocean/desert (alpha_forest is neither).
    if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 4 && biome !== 'ocean') {
        biome = 'alpha_forest';
        bH = GEN_SEA_LEVEL + 6;
        bV = 18;
    }
    
    // --- RIVER OVERRIDE ---
    // Uses ridge noise (1 - abs(noise)) to create narrow winding channels.
    // Multiple warp layers at different frequencies create realistic meanders.
    // Rivers blend terrain height down to sea level with tight bank transitions.
    if (biome !== 'ocean' && biome !== 'desert') {
        // Multi-scale domain warping for realistic river meanders
        // Large-scale bends (river valley direction)
        const rWarp1X = _wgPerlinRiver2.fbm(wx / 300, wz / 300, 2) * 60;
        const rWarp1Z = _wgPerlinRiver2.fbm(wx / 300 + 500, wz / 300 + 500, 2) * 60;
        // Medium-scale meanders (the classic S-curves)
        const rWarp2X = _wgPerlinRiver2.noise2D(wx / 80 + 200, wz / 80 + 200) * 25;
        const rWarp2Z = _wgPerlinRiver2.noise2D(wx / 80 + 700, wz / 80 + 700) * 25;
        // Small-scale wobble (organic irregularity)
        const rWarp3X = _wgPerlinRiver.noise2D(wx / 30 + 900, wz / 30 + 900) * 8;
        const rWarp3Z = _wgPerlinRiver.noise2D(wx / 30 + 1200, wz / 30 + 1200) * 8;
        
        const rwx = wx + rWarp1X + rWarp2X + rWarp3X;
        const rwz = wz + rWarp1Z + rWarp2Z + rWarp3Z;
        
        // Ridge noise at smaller scale for narrow paths
        const riverScale = 150;
        const rn = _wgPerlinRiver.fbm(rwx / riverScale, rwz / riverScale, 2);
        const ridge = 1.0 - Math.abs(rn);
        
        // Tight thresholds: core > 0.94, bank 0.90-0.94 gives ~4-8 block wide rivers
        const RIVER_CORE = 0.94;
        const RIVER_BANK = 0.90;
        
        if (ridge > RIVER_BANK) {
            const riverBlend = Math.min(1.0, (ridge - RIVER_BANK) / (RIVER_CORE - RIVER_BANK));
            // Smooth-step for more natural bank profile (steep sides, flat bottom)
            const smooth = riverBlend * riverBlend * (3.0 - 2.0 * riverBlend);
            
            const riverH = GEN_SEA_LEVEL - 2;
            const riverV = 1;
            
            bH = bH * (1.0 - smooth) + riverH * smooth;
            bV = bV * (1.0 - smooth) + riverV * smooth;
        }
    }
    
    return { biome, bH, bV };
}

// Pure climate classification — maps temp/humid to a biome + terrain params
function _classifyBiome(temp, humid) {
    let biome = 'plains', bH = GEN_SEA_LEVEL + 3, bV = 10;
    
    // Single biome mode — override everything
    if (typeof GEN_SINGLE_BIOME !== 'undefined' && GEN_SINGLE_BIOME) {
        biome = GEN_SINGLE_BIOME;
        if (biome === 'desert')        { bH = GEN_SEA_LEVEL + 2;  bV = 8;  }
        else if (biome === 'jungle')   { bH = GEN_SEA_LEVEL + 6;  bV = 18; }
        else if (biome === 'rainforest') { bH = GEN_SEA_LEVEL + 10; bV = 35; }
        else if (biome === 'swamp')    { bH = GEN_SEA_LEVEL + 1;  bV = 3;  }
        else if (biome === 'tundra')   { bH = GEN_SEA_LEVEL + 18; bV = 24; }
        else if (biome === 'taiga')    { bH = GEN_SEA_LEVEL + 14; bV = 30; }
        else if (biome === 'extreme_hills') { bH = GEN_SEA_LEVEL + 20; bV = 22; }
        else if (biome === 'forest')   { bH = GEN_SEA_LEVEL + 6;  bV = 18; }
        else                           { bH = GEN_SEA_LEVEL + 3;  bV = 10; }
        return _applyBiomeOverrides(biome, bH, bV);
    }
    
    if (temp > 0.2 && humid < -0.1)        { biome = 'desert';     bH = GEN_SEA_LEVEL + 2;  bV = 8;  }
    else if (temp > 0.15 && humid >= 0.25)  { biome = 'jungle';     bH = GEN_SEA_LEVEL + 6;  bV = 18; }
    else if (temp > 0.1 && humid >= 0.1)    { biome = 'rainforest'; bH = GEN_SEA_LEVEL + 10; bV = 35; }
    else if (temp > -0.05 && temp <= 0.1 && humid >= 0.05) { biome = 'swamp'; bH = GEN_SEA_LEVEL + 1; bV = 3; }
    else if (temp < -0.25 && humid < 0)     { biome = 'tundra';     bH = GEN_SEA_LEVEL + 18; bV = 24; }
    else if (temp < -0.15 && humid >= 0)    { biome = 'taiga';      bH = GEN_SEA_LEVEL + 14; bV = 30; }
    else if (temp > -0.15 && temp <= 0.05 && humid < -0.15) { biome = 'extreme_hills'; bH = GEN_SEA_LEVEL + 20; bV = 22; }
    else if (temp > -0.05 && temp <= 0.2 && humid >= -0.1 && humid < 0.1) { biome = 'forest'; bH = GEN_SEA_LEVEL + 6; bV = 18; }
    else                                    { biome = 'plains';     bH = GEN_SEA_LEVEL + 3;  bV = 10; }
    
    return _applyBiomeOverrides(biome, bH, bV);
}

// Apply per-biome height/variation overrides from GEN_BIOME_OVERRIDES
function _applyBiomeOverrides(biome, bH, bV) {
    if (typeof GEN_BIOME_OVERRIDES !== 'undefined' && GEN_BIOME_OVERRIDES[biome]) {
        var ov = GEN_BIOME_OVERRIDES[biome];
        // Height override: scale the elevation above sea level
        var aboveSea = bH - GEN_SEA_LEVEL;
        bH = GEN_SEA_LEVEL + aboveSea * (ov.height / 100);
        // Variation override: scale the height variation
        bV = bV * (ov.variation / 100);
    }
    return { biome: biome, bH: bH, bV: bV };
}

function _computeChunkBiomeData(cx, cz) {
    const key = cx + ',' + cz;
    if (chunkBiomeCache.has(key)) return chunkBiomeCache.get(key);
    
    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;
    const startX = cx * CHUNK_SIZE - halfW;
    const startZ = cz * CHUNK_SIZE - halfD;
    const blurRadius = 12;
    
    const pad = blurRadius + 1;
    const padW = CHUNK_SIZE + pad * 2;
    const padH = CHUNK_SIZE + pad * 2;
    
    const rawH = new Float32Array(padW * padH);
    const rawV = new Float32Array(padW * padH);
    const rawBiomes = new Uint8Array(padW * padH);
    
    for (let lx = 0; lx < padW; lx++) {
        for (let lz = 0; lz < padH; lz++) {
            const wx = startX - pad + lx;
            const wz = startZ - pad + lz;
            const b = _getRawBiome(wx, wz);
            const idx = lx + lz * padW;
            rawH[idx] = b.bH;
            rawV[idx] = b.bV;
            rawBiomes[idx] = BIOME_IDS[b.biome];
        }
    }
    
    // Box blur horizontal
    const tempH = new Float32Array(padW * padH);
    const tempV = new Float32Array(padW * padH);
    
    for (let z = 0; z < padH; z++) {
        let sumH = 0, sumV = 0, count = 0;
        for (let dx = 0; dx <= blurRadius && dx < padW; dx++) {
            sumH += rawH[dx + z * padW]; sumV += rawV[dx + z * padW]; count++;
        }
        for (let x = 0; x < padW; x++) {
            tempH[x + z * padW] = sumH / count;
            tempV[x + z * padW] = sumV / count;
            const dropX = x - blurRadius;
            if (dropX >= 0) { sumH -= rawH[dropX + z * padW]; sumV -= rawV[dropX + z * padW]; count--; }
            const addX = x + blurRadius + 1;
            if (addX < padW) { sumH += rawH[addX + z * padW]; sumV += rawV[addX + z * padW]; count++; }
        }
    }
    
    // Box blur vertical, extract center
    const blurredH = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const blurredV = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    
    for (let x = 0; x < padW; x++) {
        let sumH = 0, sumV = 0, count = 0;
        for (let dz = 0; dz <= blurRadius && dz < padH; dz++) {
            sumH += tempH[x + dz * padW]; sumV += tempV[x + dz * padW]; count++;
        }
        for (let z = 0; z < padH; z++) {
            const localX = x - pad;
            const localZ = z - pad;
            if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE) {
                blurredH[localX + localZ * CHUNK_SIZE] = sumH / count;
                blurredV[localX + localZ * CHUNK_SIZE] = sumV / count;
            }
            const dropZ = z - blurRadius;
            if (dropZ >= 0) { sumH -= tempH[x + dropZ * padW]; sumV -= tempV[x + dropZ * padW]; count--; }
            const addZ = z + blurRadius + 1;
            if (addZ < padH) { sumH += tempH[x + addZ * padW]; sumV += tempV[x + addZ * padW]; count++; }
        }
    }
    
    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            biomes[lx + lz * CHUNK_SIZE] = rawBiomes[(lx + pad) + (lz + pad) * padW];
        }
    }
    
    const data = { biomes, heightMap: blurredH, volMap: blurredV };
    chunkBiomeCache.set(key, data);
    return data;
}

// --- Biome sub-type detection for F3 display ---
// Checks if a world position is in a river zone (replicates the river noise from _getRawBiome)
function isInRiverZone(x, z) {
    if (!_wgPerlinRiver || !_wgPerlinRiver2) return false;
    
    // Replicate the same domain warp from _getRawBiome
    const warpScale = _wgBiomeScale * 0.8;
    const warpStrength = _wgBiomeScale * 0.3;
    const warpX = _wgPerlinVolatility.fbm(x / warpScale + 500, z / warpScale + 500, 2) * warpStrength;
    const warpZ = _wgPerlinVolatility.fbm(x / warpScale + 800, z / warpScale + 800, 2) * warpStrength;
    const wx = x + warpX;
    const wz = z + warpZ;
    
    // River domain warp (same as in _getRawBiome)
    const rWarp1X = _wgPerlinRiver2.fbm(wx / 300, wz / 300, 2) * 60;
    const rWarp1Z = _wgPerlinRiver2.fbm(wx / 300 + 500, wz / 300 + 500, 2) * 60;
    const rWarp2X = _wgPerlinRiver2.noise2D(wx / 80 + 200, wz / 80 + 200) * 25;
    const rWarp2Z = _wgPerlinRiver2.noise2D(wx / 80 + 700, wz / 80 + 700) * 25;
    const rWarp3X = _wgPerlinRiver.noise2D(wx / 30 + 900, wz / 30 + 900) * 8;
    const rWarp3Z = _wgPerlinRiver.noise2D(wx / 30 + 1200, wz / 30 + 1200) * 8;
    
    const rwx = wx + rWarp1X + rWarp2X + rWarp3X;
    const rwz = wz + rWarp1Z + rWarp2Z + rWarp3Z;
    
    const rn = _wgPerlinRiver.fbm(rwx / 150, rwz / 150, 2);
    const ridge = 1.0 - Math.abs(rn);
    
    return ridge > 0.90;
}

// Returns a display-friendly biome name including River/Ocean sub-labels
function getBiomeDisplayName(x, z) {
    const halfW = Math.floor(WORLD_WIDTH / 2);
    const halfD = Math.floor(WORLD_DEPTH / 2);
    const biomeIdx = (x + halfW) + (z + halfD) * WORLD_WIDTH;
    const baseBiome = (biomeIdx >= 0 && biomeIdx < WORLD_WIDTH * WORLD_DEPTH && biomeMap[biomeIdx])
        ? biomeMap[biomeIdx] : 'unknown';
    
    if (baseBiome === 'ocean') return 'Ocean';
    
    // Check river zone (skip in nether)
    if (currentDimension === 'overworld' && baseBiome !== 'desert' && isInRiverZone(x, z)) {
        return 'River';
    }
    
    return baseBiome.charAt(0).toUpperCase() + baseBiome.slice(1);
}
