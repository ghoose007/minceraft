// ==========================================
// OVERWORLD GENERATION
// ==========================================

function generateChunkColumn(cx, cz) {
    if (_isChunkGenerated(cx, cz)) return;
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
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const bIdx = lx + lz * CHUNK_SIZE;
            
            let baseHeight = biomeData.heightMap[bIdx];
            let volatility = biomeData.volMap[bIdx];
            
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
            
            for (let y = 0; y < WORLD_HEIGHT; y++) {
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
                            
                            if (y <= GEN_SEA_LEVEL + 1 && biome !== 'tundra' && biome !== 'taiga' && biome !== 'swamp') surfId = 15;
                            else if (y <= GEN_SEA_LEVEL + 1 && (biome === 'tundra' || biome === 'taiga')) surfId = 5;
                            
                            // Swamp: use dirt for blocks at or below water level
                            if (biome === 'swamp' && y <= GEN_SEA_LEVEL) {
                                const aboveId = getVoxel(x, y + 1, z) & 0xFF;
                                if (aboveId === 4) surfId = 2; // Dirt under water
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
    
    // PHASE 3: Caves
    if (GEN_CAVES) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                const x = startX + lx;
                const z = startZ + lz;
                const surfaceY = getHighestBlock(x, z);
                for (let y = 2; y <= surfaceY; y++) {
                    const blockId = getVoxel(x, y, z) & 0xFF;
                    if (blockId !== 3 && blockId !== 2 && blockId !== 1 && blockId !== 15 && blockId !== 19 && blockId !== 5 && blockId !== 39) continue;
                    
                    // --- DYNAMIC CAVE WIDENING (NARROWED) ---
                    // Less extreme horizontal stretching
                    let scaleY = 30;
                    if (y < 40) scaleY += (40 - y) * 0.5; 
                    
                    const n1 = _wgCavePrimary.fbm3D(x / 40, y / scaleY, z / 40, 2, 0.5, 2.0);
                    
                    let threshold = 0.04; 
                    
                    // Narrowed the massive caverns by cutting the multiplier in half
                    if (y < 55) {
                        const depthFactor = Math.max(0, Math.min(1, (55 - y) / 50)); 
                        threshold += (depthFactor * 0.08); // Dropped from 0.15 to 0.08
                    }
                    
                    threshold *= _wgCaveDensityMult;
                    
                    const distToSurface = surfaceY - y;
                    if (distToSurface < 15) threshold *= (distToSurface / 15);
                    
                    if (Math.abs(n1) < threshold) {
                        if (y <= GEN_SEA_LEVEL + 2) {
                            let touchesWater = false;
                            for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                                if ((getVoxel(x+dx, y+dy, z+dz) & 0xFF) === 4) { touchesWater = true; break; }
                            }
                            if (touchesWater) continue;
                        }
                        
                        // --- NEW: ORGANIC LAVA POOLING ---
                        // Instead of a global flood, caves naturally pool with lava below Y=6
                        if (y <= 6) {
                            setVoxel(x, y, z, 27, 4, 0, 1); // Place Lava Source
                        } else {
                            setVoxel(x, y, z, 0); // Place Air
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
                
                treeChance *= treeScale;
                
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
                    } else if ((biome === 'forest' || biome === 'rainforest' || biome === 'plains') && surfId === 1) {
                        let logId = 13, leafId = 14, isBirch = false;
                        
                        if (biome === 'forest' && seededRandom() < 0.3) {
                            logId = 41; leafId = 43; isBirch = true;
                        }
                        
                        if (seededRandom() < 0.1 && !isBirch) {
                            const trunkHeight = 6 + Math.floor(seededRandom() * 5);
                            for (let ly = 1; ly <= trunkHeight; ly++) setVoxel(x, y + ly, z, logId);
                            
                            const placeLeafCluster = (lcx, lcy, lcz) => {
                                for (let ly = lcy - 2; ly <= lcy + 1; ly++) {
                                    const yDist = ly - lcy;
                                    const radius = (yDist >= 0) ? 1 : 2;
                                    for (let llx = -radius; llx <= radius; llx++) {
                                        for (let llz = -radius; llz <= radius; llz++) {
                                            if (Math.abs(llx) === radius && Math.abs(llz) === radius && (yDist >= 0 || seededRandom() < 0.5)) continue;
                                            if (llx === 0 && llz === 0 && ly <= lcy && lcx === x && lcz === z) continue;
                                            const cur = getVoxel(lcx+llx, ly, lcz+llz) & 0xFF;
                                            if (cur === 0) setVoxel(lcx+llx, ly, lcz+llz, leafId);
                                        }
                                    }
                                }
                            };
                            
                            placeLeafCluster(x, y + trunkHeight, z);
                            
                            const numBranches = 3 + Math.floor(seededRandom() * 4);
                            for (let b = 0; b < numBranches; b++) {
                                let bx = x, by = y + 3 + Math.floor(seededRandom() * (trunkHeight - 4)), bz = z;
                                let dirAngle = seededRandom() * Math.PI * 2;
                                let dirRadius = 0.6 + seededRandom() * 0.4;
                                let branchLen = 3 + Math.floor(seededRandom() * 3);
                                
                                for (let l = 0; l < branchLen; l++) {
                                    bx += Math.cos(dirAngle) * dirRadius;
                                    bz += Math.sin(dirAngle) * dirRadius;
                                    by += 0.7 + seededRandom() * 0.4;
                                    const ix = Math.round(bx), iy = Math.round(by), iz = Math.round(bz);
                                    const cur = getVoxel(ix, iy, iz) & 0xFF;
                                    if (cur === 0 || cur === 14) setVoxel(ix, iy, iz, logId);
                                }
                                placeLeafCluster(Math.round(bx), Math.round(by), Math.round(bz));
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
                const folMult = GEN_FOLIAGE_DENSITY / 100.0;
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
        
        for (let i = 0; i < packSize; i++) {
            // Scatter them slightly around the pack center
            const dx = packX + Math.floor(seededRandom() * 3) - 1;
            const dz = packZ + Math.floor(seededRandom() * 3) - 1;
            const py = getHighestBlock(dx, dz);
            
            // MINECRAFT RULE: Passive mobs can ONLY spawn on Grass Blocks (ID: 2)
            if ((getVoxel(dx, py, dz) & 0xFF) === 1) {
                // Safety cap to prevent lag on slower machines (Max 40 passive mobs loaded at once)
                if (typeof globalMobs !== 'undefined' && globalMobs.length < 40) {
                    if (typeof spawnMob === 'function') {
                        spawnMob('pig', dx + 0.5, py + 1.0, dz + 0.5);
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
    const fluidSimQueue = new Set();
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
    
    if (!useLazyGeneration) {
        // EAGER GENERATION (small worlds <= 64 chunks/side)
        updateLoadingBar(2, 'Generating terrain...');
        await yieldToUI();
        
        const totalChunks = CHUNKS_X * CHUNKS_Z;
        let chunksGenerated = 0;
        
        for (let cx = 0; cx < CHUNKS_X; cx++) {
            for (let cz = 0; cz < CHUNKS_Z; cz++) {
                generateChunkColumn(cx, cz);
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
        
        let total = (spawnMaxCX - spawnMinCX + 1) * (spawnMaxCZ - spawnMinCZ + 1);
        let count = 0;
        
        for (let cx = spawnMinCX; cx <= spawnMaxCX; cx++) {
            for (let cz = spawnMinCZ; cz <= spawnMaxCZ; cz++) {
                generateChunkColumn(cx, cz);
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
    
    glassMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, transparent: true, opacity: 1.0, alphaTest: 0.0, side: THREE.FrontSide, vertexColors: true, depthWrite: false });
    injectLightingShader(glassMaterial);
    
    const waterTex = await loadWaterTexture();
    waterMaterial = createFluidMaterial(waterTex, true);
    
    const lavaTex = await loadLavaTexture();
    lavaMaterial = createFluidMaterial(lavaTex, false);
}
// ==========================================