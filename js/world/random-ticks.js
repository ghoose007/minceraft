// ==========================================
// RANDOM TICK SYSTEM
// ==========================================

// --- NEW: RANDOM ENVIRONMENTAL BLOCK TICKS ---
// Runs procedurally on random blocks every game tick to simulate organic natural behavior!
function doRandomTicks() {
    if (typeof player === 'undefined' || !player) return;
    
    const pCx = Math.floor(player.x / CHUNK_SIZE);
    const pCz = Math.floor(player.z / CHUNK_SIZE);
    const radius = Math.min(4, RENDER_DISTANCES[currentRenderDistIndex]); 

    for (let cx = pCx - radius; cx <= pCx + radius; cx++) {
        for (let cz = pCz - radius; cz <= pCz + radius; cz++) {
            
            // Evaluates ~24 random voxels per active chunk per tick
            for (let i = 0; i < 24; i++) {
                const rx = Math.floor(Math.random() * 16);
                const ry = Math.floor(Math.random() * WORLD_HEIGHT);
                const rz = Math.floor(Math.random() * 16);

                const wx = cx * CHUNK_SIZE + rx;
                const wy = ry;
                const wz = cz * CHUNK_SIZE + rz;

                const val = getVoxel(wx, wy, wz);
                const id = val & 0xFF;

                // --- GRASS SPREAD & DEATH ---
                if (id === 1) { 
                    const aboveId = getVoxel(wx, wy + 1, wz) & 0xFF;
                    if (!isBlockTransparent(aboveId)) {
                        // Grass dies if blocked from light
                        setVoxel(wx, wy, wz, 2);
                        pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                    } else {
                        // Grass attempts to organically spread to nearby dirt blocks if it receives enough light
                        const light = Math.max(getSunLight(wx, wy+1, wz), getTorchLight(wx, wy+1, wz));
                        if (light >= 9) {
                            const dx = Math.floor(Math.random() * 3) - 1; 
                            const dy = Math.floor(Math.random() * 5) - 3; 
                            const dz = Math.floor(Math.random() * 3) - 1; 
                            
                            const tx = wx + dx;
                            const ty = wy + dy;
                            const tz = wz + dz;
                            
                            if ((getVoxel(tx, ty, tz) & 0xFF) === 2) {
                                const tAboveId = getVoxel(tx, ty + 1, tz) & 0xFF;
                                if (isBlockTransparent(tAboveId)) {
                                    setVoxel(tx, ty, tz, 1);
                                    pendingBlockUpdates.push({x: tx, y: ty, z: tz});
                                }
                            }
                        }
                    }
                } 
                // --- LEAF DECAY ---
                // MC Java: leaves decay if not connected to a log within 6 blocks (taxicab distance through other leaves)
                // Leaves with the "persistent" flag (bit 13 = player-placed) never decay
                else if (isLeafBlock(id)) {
                    // Check persistent flag — player-placed leaves never decay
                    const fullVal = getVoxel(wx, wy, wz);
                    const persistent = (fullVal >> 13) & 0x1;
                    if (persistent) continue; // Skip — player-placed leaf
                    
                    const maxDist = 6; // MC Java Edition distance
                    const q = [{x: wx, y: wy, z: wz, d: 0}];
                    const visited = new Set();
                    visited.add((wx + 512) + (wy << 10) + ((wz + 512) << 18));
                    let foundLog = false;

                    let head = 0;
                    
                    // Breadth-First Search (BFS) to evaluate if the leaf is connected to a log
                    while(head < q.length) {
                        const cur = q[head++];
                        const cid = getVoxel(cur.x, cur.y, cur.z) & 0xFF;

                        // Check ALL log types: oak(13), spruce(21), birch(41), jungle/acacia(96)
                        if (cid === 13 || cid === 21 || cid === 41 || cid === 96) { 
                            foundLog = true; 
                            break; 
                        }
                        
                        if (cur.d >= maxDist) continue; 

                        // Leaves only chain through other leaves, not air or dirt
                        if (cur.d > 0 && !isLeafBlock(cid)) continue;

                        const nx1 = cur.x+1, nx2 = cur.x-1, ny1 = cur.y+1, ny2 = cur.y-1, nz1 = cur.z+1, nz2 = cur.z-1;
                        const nd = cur.d + 1;
                        const neighbors = [
                            [nx1, cur.y, cur.z], [nx2, cur.y, cur.z],
                            [cur.x, ny1, cur.z], [cur.x, ny2, cur.z],
                            [cur.x, cur.y, nz1], [cur.x, cur.y, nz2]
                        ];
                        for (let ni = 0; ni < 6; ni++) {
                            const nb = neighbors[ni];
                            const key = (nb[0] + 512) + (nb[1] << 10) + ((nb[2] + 512) << 18);
                            if (!visited.has(key)) {
                                visited.add(key);
                                q.push({x: nb[0], y: nb[1], z: nb[2], d: nd});
                            }
                        }
                    }
                    
                    // The branch was severed. Dissolve the leaf!
                    if (!foundLog) {
                        // TRIGGER ITEM DROP BEFORE TURNING TO AIR
                        if (typeof window.spawnBlockDrops === 'function') window.spawnBlockDrops(id, wx, wy, wz);
                        
                        setVoxel(wx, wy, wz, 0);
                        if (typeof spawnParticles === 'function') spawnParticles(wx, wy, wz, id);
                        pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                        queueNeighbors(wx, wy, wz);
                    }
                }

                // --- SUGARCANE GROWTH ---
                else if (id === 52) { 
                    // 1. Check if there is air above it to grow into
                    if ((getVoxel(wx, wy + 1, wz) & 0xFF) === 0) {
                        
                        // 2. Calculate current stalk height by checking the blocks below
                        let height = 1;
                        for (let h = 1; h < 3; h++) {
                            if ((getVoxel(wx, wy - h, wz) & 0xFF) === 52) height++;
                            else break;
                        }
                        
                        // 3. Only grow if it's under the maximum height of 3
                        if (height < 3) {
                            let age = (val >> 8) & 0xF; // Use the 'level' bits as an age tracker!
                            
                            if (age >= 15) {
                                // Grow a new sugarcane block on top
                                setVoxel(wx, wy + 1, wz, 52, 0); 
                                setVoxel(wx, wy, wz, 52, 0); // Reset the age of the current block
                                pendingBlockUpdates.push({x: wx, y: wy + 1, z: wz});
                            } else {
                                // Increment the age slightly every random tick
                                setVoxel(wx, wy, wz, 52, age + 1);
                            }
                        }
                    }
                }
                
                // --- SAPLING GROWTH ---
                else if (id === 116 || id === 117 || id === 118 || id === 137) {
                    const light = Math.max(getSunLight(wx, wy, wz), getTorchLight(wx, wy, wz));
                    if (light >= 9 && Math.random() < 0.15) { // 15% chance to grow when evaluated
                        growTree(wx, wy, wz, id);
                    }
                }

                // --- ICE MELTING ---
                // Ice melts when torch light level >= 11 (torches, glowstone, lava nearby)
                // Same as MC: ice turns into water source when it melts
                else if (id === 95) {
                    const torchLight = getTorchLight(wx, wy, wz);
                    if (torchLight >= 11) {
                        setVoxel(wx, wy, wz, 4, 8, 0, 1); // Water source
                        pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                        updateWaterQueue.add(getVoxelIndex(wx, wy, wz));
                        queueNeighbors(wx, wy, wz);
                    }
                }

                // --- FARMLAND HYDRATION ---
                if (id === 62 || id === 63) {
                    let hasWater = false;
                    for (let dx = -4; dx <= 4 && !hasWater; dx++) {
                        for (let dy = 0; dy <= 1 && !hasWater; dy++) { // Water can be same level or 1 block above
                            for (let dz = -4; dz <= 4 && !hasWater; dz++) {
                                if ((getVoxel(wx + dx, wy + dy, wz + dz) & 0xFF) === 4) hasWater = true;
                            }
                        }
                    }
                    if (hasWater && id === 62) {
                        setVoxel(wx, wy, wz, 63); 
                        pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                    }
                    else if (!hasWater && id === 63 && Math.random() < 0.1) {
                        setVoxel(wx, wy, wz, 62);
                        pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                    }
                }

                // --- WHEAT GROWTH ---
                else if (id === 64) {
                    const light = Math.max(getSunLight(wx, wy + 1, wz), getTorchLight(wx, wy + 1, wz));
                    if (light >= 9) {
                        const belowId = getVoxel(wx, wy - 1, wz) & 0xFF;
                        if (belowId !== 62 && belowId !== 63) {
                            if (typeof window.spawnBlockDrops === 'function') window.spawnBlockDrops(64, wx, wy, wz, val);
                            setVoxel(wx, wy, wz, 0); 
                            pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                        } else {
                            let stage = (val >> 8) & 0x7;
                            if (stage < 7) {
                                // FIX: Fixed the variable reference to 'belowId' so growth executes!
                                let growthChance = (belowId === 63) ? 0.25 : 0.1; 
                                if (Math.random() < growthChance) {
                                    setVoxel(wx, wy, wz, 64, stage + 1);
                                    pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                                }
                            }
                        }
                    }
                }

                // --- VINE GROWTH ---
                else if (id === 66) {
                    const vineDir = (val >> 8) & 0xF;
                    // Check if vine still has a support block
                    let supported = false;
                    const aboveId = getVoxel(wx, wy + 1, wz) & 0xFF;
                    if (aboveId === 66 || isLeafBlock(aboveId)) supported = true;
                    if (vineDir === 1 && canSupport(getVoxel(wx - 1, wy, wz) & 0xFF)) supported = true;
                    if (vineDir === 2 && canSupport(getVoxel(wx + 1, wy, wz) & 0xFF)) supported = true;
                    if (vineDir === 3 && canSupport(getVoxel(wx, wy, wz - 1) & 0xFF)) supported = true;
                    if (vineDir === 4 && canSupport(getVoxel(wx, wy, wz + 1) & 0xFF)) supported = true;
                    
                    if (!supported) {
                        // Vine lost support, break it
                        setVoxel(wx, wy, wz, 0);
                        pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                    } else if (Math.random() < 0.05) {
                        // 5% chance to grow downward
                        const belowId = getVoxel(wx, wy - 1, wz) & 0xFF;
                        if (belowId === 0) {
                            setVoxel(wx, wy - 1, wz, 66, vineDir);
                            pendingBlockUpdates.push({x: wx, y: wy - 1, z: wz});
                        }
                    }
                }

                // --- ICE MELTING ---
                // Ice melts when torch light level is >= 11 (nearby torches, glowstone, lava glow)
                // Matches MC behavior: ice melts from light sources, not sunlight
                else if (id === 95) {
                    const torchLight = getTorchLight(wx, wy, wz);
                    if (torchLight >= 11) {
                        setVoxel(wx, wy, wz, 4, 8, 0, 1); // Replace with water source
                        updateWaterQueue.add(getVoxelIndex(wx, wy, wz));
                        pendingBlockUpdates.push({x: wx, y: wy, z: wz});
                    }
                }
            }
        }
    }
}

// ==========================================
// HIGH-SPEED FIRE SIMULATION LOOP
// ==========================================