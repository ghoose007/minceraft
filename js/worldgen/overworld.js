// ==========================================
// OVERWORLD GENERATION
// ==========================================

// Per-chunk cache for cave carving's getHighestBlock lookups (cleared at start of each chunk)
let _caveSurfYCache = null;

function generateChunkColumn(cx, cz) {
    if (_isChunkGenerated(cx, cz)) return;
    
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
            
            // --- NEW: SHORELINE DAMPENING MULTIPLIER ---
            // Fades from 1.0 (inland) to 0.0 (in the ocean)
            const oceanNoise = _wgPerlinOcean.fbm(x / (_wgBiomeScale * 2.5), z / (_wgBiomeScale * 2.5), 3);
            let shoreDampen = 1.0;
            if (oceanNoise < 0.1) {
                shoreDampen = Math.max(0.0, (oceanNoise - (-0.15)) / 0.25); 
            }

            // Standard rolling elevation (Dampened near shores)
            const elevationNoise = _wgPerlinElevation.fbm(x / _wgSmoothness, z / _wgSmoothness, 4);
            baseHeight += elevationNoise * 20 * _wgTerrainMult * shoreDampen;
            
            // --- MACRO MOUNTAIN FORMATIONS ---
            const mountainScale = _wgSmoothness * 3.5; 
            const mNoise = _wgPerlinMountains.fbm(x / mountainScale, z / mountainScale, 4);
            
            if (mNoise > 0.1) {
                let steepness = Math.pow((mNoise - 0.1) * 1.5, 2.0); 
                steepness *= shoreDampen; // Kills mountains before they hit the beach
                
                baseHeight += steepness * 120 * _wgTerrainMult; 
                volatility += steepness * 25; 
            }
            // --------------------------------------

            // Dampen the smaller 3D carving noise near the shores too
            volatility += _wgPerlinVolatility.fbm(x / 100, z / 100, 3) * 10 * shoreDampen;
            volatility *= _wgTerrainMult * (GEN_VOLATILITY_MULT / 100.0);
            // --------------------------------------

            volatility += _wgPerlinVolatility.fbm(x / 100, z / 100, 3) * 10;
            volatility *= _wgTerrainMult * (GEN_VOLATILITY_MULT / 100.0);
            
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
                
                let density = -falloff + (n3D * activeVolatility);
                
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
            
            let depth = -1;
            for (let y = WORLD_HEIGHT - 1; y >= 1; y--) {
                const block = getVoxel(x, y, z) & 0xFF;
                
                if (block === 0 || block === 4 || block === 27) { depth = -1; continue; }
                
                if (block === 3) {
                    depth++;
                    if (depth === 0) {
                        if (y >= GEN_SEA_LEVEL - 1) {
                            let surfId = 1;
                            if (biome === 'desert') surfId = 15;
                            else if (biome === 'tundra') surfId = 39;
                            else if (biome === 'ocean') surfId = 15; // Sandy beaches right at the edge
                            
                            // Beach override — skipped in flat overworld preset since ALL land is at sea level
                            if (!isOverworldPreset) {
                                if (y <= GEN_SEA_LEVEL + 1 && biome !== 'tundra' && biome !== 'taiga' && biome !== 'swamp') surfId = 15;
                                else if (y <= GEN_SEA_LEVEL + 1 && (biome === 'tundra' || biome === 'taiga')) surfId = 5;
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
    
    // PHASE 2.5: Ice on water in snowy biomes (tundra, taiga)
    // Replace the top water source block at sea level with ice where the block above is air
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const bIdx = lx + lz * CHUNK_SIZE;
            const biome = BIOME_NAMES[biomeData.biomes[bIdx]];
            if (biome !== 'tundra' && biome !== 'taiga') continue;
            
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
    if (GEN_CAVES) {
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
                            if (rimBiome === 'desert') {
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
    placeChunkBlobs(10, 3, 15, 32, 1, 80);
    placeChunkBlobs(11, 3, 15, 32, 1, 80);
    placeChunkBlobs(12, 3, 15, 32, 1, 80);
    placeChunkBlobs(5,  4, 15, 32, 1, 80);
        
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
                if (biome === 'rainforest') treeChance = 0.025;
                else if (biome === 'forest') treeChance = 0.012;
                else if (biome === 'taiga') treeChance = 0.02;
                else if (biome === 'plains') treeChance = 0.0005;
                else if (biome === 'tundra') treeChance = 0.001;
                else if (biome === 'desert') treeChance = 0.002;
                else if (biome === 'swamp') treeChance = 0.008;
                else if (biome === 'jungle') treeChance = 0.035;
                else if (biome === 'extreme_hills') treeChance = 0.003;
                
                treeChance *= treeScale;
                
                // Apply per-biome tree density override
                if (typeof GEN_BIOME_OVERRIDES !== 'undefined' && GEN_BIOME_OVERRIDES[biome]) {
                    treeChance *= (GEN_BIOME_OVERRIDES[biome].treeDensity / 100);
                }
                
                if (seededRandom() < treeChance) {
                    if (biome === 'desert' && surfId === 15) {
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
                    } else if ((biome === 'forest' || biome === 'rainforest' || biome === 'plains' || biome === 'extreme_hills') && surfId === 1) {
                        let logId = 13, leafId = 14, isBirch = false;
                        
                        if (biome === 'forest' && seededRandom() < 0.3) {
                            logId = 41; leafId = 43; isBirch = true;
                        }
                        
                        if (seededRandom() < 0.1 && !isBirch) {
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
                    
                    if (biome === 'plains' && surfId === 1) {
                        if (r < 0.3 * folMult) setVoxel(x, y+1, z, 16);
                        else if (r < 0.32 * folMult) setVoxel(x, y+1, z, 23);
                        else if (r < 0.33 * folMult) setVoxel(x, y+1, z, 24);
                        else if (r < 0.35 * folMult) setVoxel(x, y+1, z, 53);
                    } else if ((biome === 'forest' || biome === 'rainforest') && surfId === 1) {
                        if (r < 0.15 * folMult) setVoxel(x, y+1, z, 16);
                        else if (r < 0.17 * folMult) setVoxel(x, y+1, z, 23);
                        else if (r < 0.18 * folMult) setVoxel(x, y+1, z, 24);
                        else if (r < 0.20 * folMult) setVoxel(x, y+1, z, 53);
                    } else if (biome === 'taiga' && surfId === 1) {
                        if (r < 0.15 * folMult) setVoxel(x, y+1, z, 16);
                    } else if (biome === 'tundra' && surfId === 39) {
                        setVoxel(x, y+1, z, 40, 1);
                    } else if (biome === 'swamp' && surfId === 1) {
                        if (r < 0.25 * folMult) setVoxel(x, y+1, z, 16); // Tall grass
                        else if (r < 0.26 * folMult) setVoxel(x, y+1, z, 24); // Bush
                    } else if (biome === 'jungle' && surfId === 1) {
                        // Very dense ground cover like MC jungle
                        if (r < 0.45 * folMult) setVoxel(x, y+1, z, 16); // Tall grass (very dense)
                        else if (r < 0.52 * folMult) setVoxel(x, y+1, z, 24); // Bush
                        else if (r < 0.54 * folMult) setVoxel(x, y+1, z, 23); // Rose
                    } else if (biome === 'extreme_hills' && surfId === 1) {
                        if (r < 0.08 * folMult) setVoxel(x, y+1, z, 16); // Sparse tall grass
                    }
                }
                
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
        
        if (groundId === 1 || groundId === 2 || groundId === 15 || groundId === 5) {
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
            if (biome === 'tundra' || biome === 'taiga') {
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
                if (id===27 && nId===4) { setVoxel(x,y,z,isSource?28:3); interacted=true; for(const [ndx,ndy,ndz] of dirs) fluidSimQueue.add(getVoxelIndex(x+ndx,y+ndy,z+ndz)); break; }
                if (id===4 && nId===27) { const nSource=(nVal>>13)&0x1; setVoxel(x+dx,y+dy,z+dz,nSource?28:3); for(const [ndx,ndy,ndz] of dirs) fluidSimQueue.add(getVoxelIndex(x+dx+ndx,y+dy+ndy,z+dz+ndz)); }
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
    await loadToolAtlas();
    solidMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, alphaTest: 0.5, transparent: false, side: THREE.FrontSide, vertexColors: true });
    injectLightingShader(solidMaterial);
    if (typeof createPortalMaterial === 'function') createPortalMaterial(textureAtlas);
    if (typeof createAetherPortalMaterial === 'function') createAetherPortalMaterial(textureAtlas);
    
    glassMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, transparent: true, opacity: 1.0, alphaTest: 0.0, side: THREE.FrontSide, vertexColors: true, depthWrite: false });
    injectLightingShader(glassMaterial);
    
    const waterTex = await loadWaterTexture();
    waterMaterial = createFluidMaterial(waterTex, true);
    
    const lavaTex = await loadLavaTexture();
    lavaMaterial = createFluidMaterial(lavaTex, false);
}
// ==========================================