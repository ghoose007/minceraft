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
    // v430: Indev Island biome is locked to Indev Forest and never appears normally.
    if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 7) {
        // v435: Indev Forest terrain uses Swampland terrain settings.
        return { biome: 'indev_forest', bH: GEN_SEA_LEVEL + 1, bV: 3 };
    }
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

                // v318 badlands: Minecraft-style rare hot/dry mesa regions.
                // Badlands share desert climate, usually appear near deserts, but
                // should not replace every desert. Use deterministic cell hashing
                // so full Voronoi cells become badlands patches instead of noisy speckles.
                if ((typeof GEN_WORLD_TYPE === 'undefined' || GEN_WORLD_TYPE !== 6) && result.biome === 'desert' && cTemp > 0.25 && cHumid < -0.25) {
                    const badlandsRoll = _cellHash(cx, cz, _worldSeed + 424242);
                    if (badlandsRoll > 0.58 || (cTemp > 0.34 && cHumid < -0.38 && badlandsRoll > 0.42)) {
                        result.biome = 'badlands';
                        result.bH = GEN_SEA_LEVEL + 24;
                        result.bV = 14;
                    }
                }

                // v341 ice_spikes: MC-style rare variant of snowy plains
                // (tundra). MC calls this a "high weirdness" variant; we use
                // the same deterministic cell-hash approach as badlands so
                // whole Voronoi cells flip rather than speckling along
                // tundra borders. Terrain is flatter than tundra (bV=6
                // vs 24) since the visual interest comes from the packed-ice
                // spikes themselves, not from the heightmap; bH a little
                // lower so the snowy plains floor sits at a believable
                // elevation. Roll > 0.78 makes them findable but rare —
                // a player wandering tundra borders should occasionally
                // come across one.
                if ((typeof GEN_WORLD_TYPE === 'undefined' || GEN_WORLD_TYPE !== 6) && result.biome === 'tundra') {
                    const iceSpikesRoll = _cellHash(cx, cz, _worldSeed + 717171);
                    if (iceSpikesRoll > 0.78) {
                        result.biome = 'ice_spikes';
                        result.bH = GEN_SEA_LEVEL + 12;
                        result.bV = 6;
                    }
                }

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
    } else if ((typeof GEN_WORLD_TYPE === 'undefined' || GEN_WORLD_TYPE !== 6) && oceanNoise < 0.1) {
        // Modern/default beach-zone dampening. Beta 1.7.3 mode skips this
        // modern river/beach blend pass for a more abrupt old-world feel.
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
    if ((typeof GEN_WORLD_TYPE === 'undefined' || GEN_WORLD_TYPE !== 6) && biome !== 'ocean' && biome !== 'desert' && biome !== 'badlands') {
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
        else if (biome === 'badlands') { bH = GEN_SEA_LEVEL + 24; bV = 14; }
        else if (biome === 'jungle')   { bH = GEN_SEA_LEVEL + 6;  bV = 18; }
        else if (biome === 'rainforest') { bH = GEN_SEA_LEVEL + 10; bV = 35; }
        else if (biome === 'swamp')    { bH = GEN_SEA_LEVEL + 1;  bV = 3;  }
        else if (biome === 'tundra')   { bH = GEN_SEA_LEVEL + 18; bV = 24; }
        else if (biome === 'ice_spikes') { bH = GEN_SEA_LEVEL + 12; bV = 6; }
        else if (biome === 'taiga')    { bH = GEN_SEA_LEVEL + 14; bV = 30; }
        else if (biome === 'extreme_hills') { bH = GEN_SEA_LEVEL + 20; bV = 22; }
        else if (biome === 'seasonal_forest') { bH = GEN_SEA_LEVEL + 5; bV = 14; }
        else if (biome === 'savanna')  { bH = GEN_SEA_LEVEL + 4;  bV = 12; }
        else if (biome === 'shrubland') { biome = 'forest'; bH = GEN_SEA_LEVEL + 6;  bV = 18; }
        else if (biome === 'forest')   { bH = GEN_SEA_LEVEL + 6;  bV = 18; }
        else                           { bH = GEN_SEA_LEVEL + 3;  bV = 10; }
        return _applyBiomeOverrides(biome, bH, bV);
    }

    // Beta 1.7.3 preset: restrict climate classification to the old
    // pre-Adventure biome set.
    if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 6) {
        if (temp > 0.2 && humid < -0.25)        { biome = 'desert';          bH = GEN_SEA_LEVEL + 2;  bV = 8;  }
        else if (temp > 0.22 && humid >= 0.25)  { biome = 'rainforest';      bH = GEN_SEA_LEVEL + 11; bV = 22; }
        else if (temp > 0.08 && humid >= 0.12)  { biome = 'seasonal_forest'; bH = GEN_SEA_LEVEL + 5;  bV = 14; }
        else if (temp > -0.02 && humid >= 0.02) { biome = 'swamp';           bH = GEN_SEA_LEVEL + 1;  bV = 3;  }
        else if (temp > 0.12 && humid < -0.05)  { biome = 'savanna';         bH = GEN_SEA_LEVEL + 4;  bV = 12; }
        else if (temp < -0.25 && humid < 0)     { biome = 'tundra';          bH = GEN_SEA_LEVEL + 18; bV = 24; }
        else if (temp < -0.15 && humid >= 0)    { biome = 'taiga';           bH = GEN_SEA_LEVEL + 14; bV = 30; }
        else if (humid >= -0.05)                { biome = 'forest';          bH = GEN_SEA_LEVEL + 6;  bV = 18; }
        else                                    { biome = 'plains';          bH = GEN_SEA_LEVEL + 3;  bV = 10; }
        return _applyBiomeOverrides(biome, bH, bV);
    }

    if (temp > 0.2 && humid < -0.22)        { biome = 'desert';          bH = GEN_SEA_LEVEL + 2;  bV = 8;  }
    else if (temp > 0.22 && humid >= 0.28)  { biome = 'jungle';          bH = GEN_SEA_LEVEL + 6;  bV = 18; }
    else if (temp > 0.12 && humid >= 0.16)  { biome = 'rainforest';      bH = GEN_SEA_LEVEL + 11; bV = 22; }
    else if (temp > 0.06 && humid >= 0.08)  { biome = 'seasonal_forest'; bH = GEN_SEA_LEVEL + 5;  bV = 14; }
    else if (temp > -0.05 && temp <= 0.1 && humid >= 0.05) { biome = 'swamp'; bH = GEN_SEA_LEVEL + 1; bV = 3; }
    else if (temp > 0.10 && humid < -0.08)  { biome = 'savanna';         bH = GEN_SEA_LEVEL + 4;  bV = 12; }
    else if (temp < -0.25 && humid < 0)     { biome = 'tundra';          bH = GEN_SEA_LEVEL + 18; bV = 24; }
    else if (temp < -0.15 && humid >= 0)    { biome = 'taiga';           bH = GEN_SEA_LEVEL + 14; bV = 30; }
    else if (temp > -0.15 && temp <= 0.05 && humid < -0.15) { biome = 'extreme_hills'; bH = GEN_SEA_LEVEL + 20; bV = 22; }
    else if (temp > -0.05 && temp <= 0.2 && humid >= -0.1 && humid < 0.12) { biome = 'forest'; bH = GEN_SEA_LEVEL + 6; bV = 18; }
    else                                    { biome = 'plains';          bH = GEN_SEA_LEVEL + 3;  bV = 10; }

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

function _getBeta173TerrainScales(biome) {
    // v360: Beta terrain is now generated by a global Beta terrain pass in
    // overworld.js. These values are intentionally mild and mainly keep
    // oceans/swamps/deserts from becoming inappropriate, rather than giving
    // each biome its own terrain generator.
    if (biome === 'ocean')           return { elev: 0.45, vol: 0.35, mountain: 0.00, clampSwamp: 0.00 };
    if (biome === 'swamp')           return { elev: 0.55, vol: 0.10, mountain: 0.08, clampSwamp: 1.00 };
    if (biome === 'desert')          return { elev: 0.85, vol: 0.75, mountain: 0.25, clampSwamp: 0.00 };
    if (biome === 'savanna')         return { elev: 0.90, vol: 0.85, mountain: 0.28, clampSwamp: 0.00 };
    if (biome === 'plains')          return { elev: 0.92, vol: 0.82, mountain: 0.24, clampSwamp: 0.00 };
    if (biome === 'tundra')          return { elev: 0.90, vol: 0.82, mountain: 0.25, clampSwamp: 0.00 };
    if (biome === 'taiga')           return { elev: 1.20, vol: 0.85, mountain: 0.45, clampSwamp: 0.00 };
    if (biome === 'forest')          return { elev: 0.82, vol: 0.72, mountain: 0.18, clampSwamp: 0.00 };
    if (biome === 'seasonal_forest') return { elev: 0.98, vol: 0.92, mountain: 0.30, clampSwamp: 0.00 };
    if (biome === 'rainforest')      return { elev: 0.94, vol: 0.52, mountain: 0.44, clampSwamp: 0.00 };
    return { elev: 1.00, vol: 1.00, mountain: 0.30, clampSwamp: 0.00 };
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
    const rawBetaElev = new Float32Array(padW * padH);
    const rawBetaVol = new Float32Array(padW * padH);
    const rawBetaMountain = new Float32Array(padW * padH);
    const rawBetaSwampClamp = new Float32Array(padW * padH);
    // v389: Beta 1.7.3 ocean-to-land terrain blending. The biome label still
    // snaps at the ocean threshold, but terrain height needs a smoothed shore
    // weight or the seafloor cuts abruptly into land height.
    const rawBetaOceanBlend = new Float32Array(padW * padH);
    // v334: per-cell "is this raw biome badlands?" mask. We box-blur this
    // alongside the heightmap so we have a smooth 0..1 weight that the
    // spire/hoodoo height bonus can multiply through. Without this the
    // spire bonus was a binary on/off based on the chunk cell biome, which
    // produced visible height cliffs at the badlands/plains boundary even
    // though the underlying heightmap blended smoothly.
    const rawBadlands = new Float32Array(padW * padH);
    // v416: smoothed Rainforest/Rain Forest mask for terrain shaping.
    // The raw biome label still snaps per column, but terrain features that
    // are specific to Rainforest must fade across biome borders.
    const rawRainforest = new Float32Array(padW * padH);
    
    for (let lx = 0; lx < padW; lx++) {
        for (let lz = 0; lz < padH; lz++) {
            const wx = startX - pad + lx;
            const wz = startZ - pad + lz;
            const b = _getRawBiome(wx, wz);
            const idx = lx + lz * padW;
            rawH[idx] = b.bH;
            rawV[idx] = b.bV;
            rawBiomes[idx] = BIOME_IDS[b.biome];
            const betaScales = _getBeta173TerrainScales(b.biome);
            rawBetaElev[idx] = betaScales.elev;
            rawBetaVol[idx] = betaScales.vol;
            rawBetaMountain[idx] = betaScales.mountain;
            rawBetaSwampClamp[idx] = betaScales.clampSwamp;
            if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 6) {
                const oceanNoise = _wgPerlinOcean.fbm(wx / (_wgBiomeScale * 2.5), wz / (_wgBiomeScale * 2.5), 3);
                rawBetaOceanBlend[idx] = Math.max(0.0, Math.min(1.0, (0.1 - oceanNoise) / 0.25));
            } else {
                rawBetaOceanBlend[idx] = 0.0;
            }
            rawBadlands[idx] = (b.biome === 'badlands') ? 1.0 : 0.0;
            rawRainforest[idx] = (b.biome === 'rainforest') ? 1.0 : 0.0;
        }
    }
    
    // v354: all biomes, including Seasonal Forest/Savanna, feed
    // through rawH/rawV and the same box-blurred height/variation maps below.
    // This keeps terrain blended across biome borders instead of hard-cutting
    // elevation at the Voronoi cell boundary.
    // Box blur horizontal
    const tempH = new Float32Array(padW * padH);
    const tempV = new Float32Array(padW * padH);
    const tempB = new Float32Array(padW * padH);
    const tempRainforest = new Float32Array(padW * padH);
    const tempBetaElev = new Float32Array(padW * padH);
    const tempBetaVol = new Float32Array(padW * padH);
    const tempBetaMountain = new Float32Array(padW * padH);
    const tempBetaSwampClamp = new Float32Array(padW * padH);
    const tempBetaOceanBlend = new Float32Array(padW * padH);

    for (let z = 0; z < padH; z++) {
        let sumH = 0, sumV = 0, sumB = 0, sumRF = 0, sumBE = 0, sumBV = 0, sumBM = 0, sumBSC = 0, sumBO = 0, count = 0;
        for (let dx = 0; dx <= blurRadius && dx < padW; dx++) {
            const si = dx + z * padW;
            sumH += rawH[si];
            sumV += rawV[si];
            sumB += rawBadlands[si];
            sumRF += rawRainforest[si];
            sumBE += rawBetaElev[si];
            sumBV += rawBetaVol[si];
            sumBM += rawBetaMountain[si];
            sumBSC += rawBetaSwampClamp[si];
            sumBO += rawBetaOceanBlend[si];
            count++;
        }
        for (let x = 0; x < padW; x++) {
            const oi = x + z * padW;
            tempH[oi] = sumH / count;
            tempV[oi] = sumV / count;
            tempB[oi] = sumB / count;
            tempRainforest[oi] = sumRF / count;
            tempBetaElev[oi] = sumBE / count;
            tempBetaVol[oi] = sumBV / count;
            tempBetaMountain[oi] = sumBM / count;
            tempBetaSwampClamp[oi] = sumBSC / count;
            tempBetaOceanBlend[oi] = sumBO / count;
            const dropX = x - blurRadius;
            if (dropX >= 0) {
                const di = dropX + z * padW;
                sumH -= rawH[di];
                sumV -= rawV[di];
                sumB -= rawBadlands[di];
                sumRF -= rawRainforest[di];
                sumBE -= rawBetaElev[di];
                sumBV -= rawBetaVol[di];
                sumBM -= rawBetaMountain[di];
                sumBSC -= rawBetaSwampClamp[di];
                sumBO -= rawBetaOceanBlend[di];
                count--;
            }
            const addX = x + blurRadius + 1;
            if (addX < padW) {
                const ai = addX + z * padW;
                sumH += rawH[ai];
                sumV += rawV[ai];
                sumB += rawBadlands[ai];
                sumRF += rawRainforest[ai];
                sumBE += rawBetaElev[ai];
                sumBV += rawBetaVol[ai];
                sumBM += rawBetaMountain[ai];
                sumBSC += rawBetaSwampClamp[ai];
                sumBO += rawBetaOceanBlend[ai];
                count++;
            }
        }
    }

    // Box blur vertical, extract center
    const blurredH = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const blurredV = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const blurredBadlands = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const blurredRainforest = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const betaElevScale = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const betaVolScale = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const betaMountainScale = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const betaSwampClamp = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);
    const betaOceanBlend = new Float32Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let x = 0; x < padW; x++) {
        let sumH = 0, sumV = 0, sumB = 0, sumRF = 0, sumBE = 0, sumBV = 0, sumBM = 0, sumBSC = 0, sumBO = 0, count = 0;
        for (let dz = 0; dz <= blurRadius && dz < padH; dz++) {
            const si = x + dz * padW;
            sumH += tempH[si];
            sumV += tempV[si];
            sumB += tempB[si];
            sumRF += tempRainforest[si];
            sumBE += tempBetaElev[si];
            sumBV += tempBetaVol[si];
            sumBM += tempBetaMountain[si];
            sumBSC += tempBetaSwampClamp[si];
            sumBO += tempBetaOceanBlend[si];
            count++;
        }
        for (let z = 0; z < padH; z++) {
            const localX = x - pad;
            const localZ = z - pad;
            if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE) {
                const outIdx = localX + localZ * CHUNK_SIZE;
                blurredH[outIdx] = sumH / count;
                blurredV[outIdx] = sumV / count;
                blurredBadlands[outIdx] = sumB / count;
                blurredRainforest[outIdx] = sumRF / count;
                betaElevScale[outIdx] = sumBE / count;
                betaVolScale[outIdx] = sumBV / count;
                betaMountainScale[outIdx] = sumBM / count;
                betaSwampClamp[outIdx] = sumBSC / count;
                betaOceanBlend[outIdx] = sumBO / count;
            }
            const dropZ = z - blurRadius;
            if (dropZ >= 0) {
                const di = x + dropZ * padW;
                sumH -= tempH[di];
                sumV -= tempV[di];
                sumB -= tempB[di];
                sumRF -= tempRainforest[di];
                sumBE -= tempBetaElev[di];
                sumBV -= tempBetaVol[di];
                sumBM -= tempBetaMountain[di];
                sumBSC -= tempBetaSwampClamp[di];
                sumBO -= tempBetaOceanBlend[di];
                count--;
            }
            const addZ = z + blurRadius + 1;
            if (addZ < padH) {
                const ai = x + addZ * padW;
                sumH += tempH[ai];
                sumV += tempV[ai];
                sumB += tempB[ai];
                sumRF += tempRainforest[ai];
                sumBE += tempBetaElev[ai];
                sumBV += tempBetaVol[ai];
                sumBM += tempBetaMountain[ai];
                sumBSC += tempBetaSwampClamp[ai];
                sumBO += tempBetaOceanBlend[ai];
                count++;
            }
        }
    }

    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            biomes[lx + lz * CHUNK_SIZE] = rawBiomes[(lx + pad) + (lz + pad) * padW];
        }
    }
    
    const data = { biomes, heightMap: blurredH, volMap: blurredV, badlandsWeight: blurredBadlands, rainforestWeight: blurredRainforest, betaElevScale, betaVolScale, betaMountainScale, betaSwampClamp, betaOceanBlend };
    chunkBiomeCache.set(key, data);
    return data;
}

// --- Biome sub-type detection for F3 display ---
// Checks if a world position is in a river zone (replicates the river noise from _getRawBiome)
function isInRiverZone(x, z) {
    // Beta 1.7.3 mode has no modern river biome/river override.
    if (typeof GEN_WORLD_TYPE !== 'undefined' && (GEN_WORLD_TYPE === 6 || GEN_WORLD_TYPE === 7)) return false;
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

    const beta173Mode = (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 6);
    const indevMode = (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 7);

    const biomeDisplayNames = {
        ocean: 'Ocean',
        desert: 'Desert',
        rainforest: beta173Mode ? 'Rain Forest' : 'Rainforest',
        tundra: 'Tundra',
        taiga: 'Taiga',
        plains: 'Plains',
        forest: 'Forest',
        swamp: beta173Mode ? 'Swampland' : 'Swamp',
        seasonal_forest: 'Seasonal Forest',
        savanna: 'Savanna',
        jungle: 'Jungle',
        extreme_hills: 'Extreme Hills',
        alpha_forest: 'Alpha Forest',
        indev_forest: 'Indev Forest',
        badlands: 'Badlands',
        ice_spikes: 'Ice Spikes',
        aether_void: 'Aether Void',
        aether_skyforest: 'Aether Skyforest',
        aether_lake: 'Aether Lake',
        unknown: 'Unknown'
    };

    if (baseBiome === 'ocean') return biomeDisplayNames.ocean;

    // Check river zone only outside Beta 1.7.3 mode. Beta mode has no modern
    // river biome, so F3 must never report River there.
    if (!beta173Mode && currentDimension === 'overworld' && baseBiome !== 'desert' && isInRiverZone(x, z)) {
        return 'River';
    }

    if (biomeDisplayNames[baseBiome]) return biomeDisplayNames[baseBiome];

    if (baseBiome.indexOf('_') >= 0) {
        return baseBiome.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    return baseBiome.charAt(0).toUpperCase() + baseBiome.slice(1);
}

