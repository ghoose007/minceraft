// ==========================================
// LIGHTING SYSTEM
// ==========================================

function recalculateLighting(ux, uy, uz) {
    let minX = -WORLD_WIDTH / 2;
    let maxX = WORLD_WIDTH / 2 - 1;
    let minZ = -WORLD_DEPTH / 2;
    let maxZ = WORLD_DEPTH / 2 - 1;
    let minY = 0;
    let maxY = WORLD_HEIGHT - 1;
    
    const isLocal = ux !== undefined;
    const LIGHT_RADIUS = 14; 
    if (isLocal) {
        minX = Math.max(minX, ux - LIGHT_RADIUS);
        maxX = Math.min(maxX, ux + LIGHT_RADIUS);
        minZ = Math.max(minZ, uz - LIGHT_RADIUS);
        maxZ = Math.min(maxZ, uz + LIGHT_RADIUS);
    }

    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;
    const lightMask = ~0x003FC000;
    
    let yTopLocal = maxY;

    if (isLocal) {
        yTopLocal = Math.min(maxY, (uy !== undefined ? uy : maxY) + LIGHT_RADIUS);
        let i = 0;
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const ix = x + _halfW;
                const iz = z + _halfD;
                if ((ix >>> 0) >= WORLD_WIDTH || (iz >>> 0) >= WORLD_DEPTH) {
                    for (let y = minY; y <= yTopLocal; y++) oldLightCache[i++] = 0;
                    continue;
                }
                const cx = ix >> 4, cz = iz >> 4;
                const chunk = _getChunkFast(cx, cz);
                const lx = ix & 15, lz = iz & 15;
                const base = lx + (lz << 12); // lx + lz * 16 * 256
                if (chunk) {
                    for (let y = minY; y <= yTopLocal; y++) {
                        const li = base + (y << 4);
                        oldLightCache[i] = chunk[li] & 0x003FC000;
                        chunk[li] &= lightMask;
                        i++;
                    }
                } else {
                    for (let y = minY; y <= yTopLocal; y++) oldLightCache[i++] = 0;
                }
            }
        }
    } else {
        // Clear all light data from all loaded chunks
        for (let ci = 0; ci < chunkStorageArr.length; ci++) {
            const chunk = chunkStorageArr[ci];
            if (chunk) {
                for (let j = 0; j < chunk.length; j++) {
                    chunk[j] &= lightMask;
                }
            }
        }
    }

    const queueCapacity = isLocal ? 50000 : MAX_LIGHT_QUEUE;
    let sunQueueLen = 0;
    let torchQueueLen = 0;
    
    let sMinX, sMaxX, sMinZ, sMaxZ;
    
    if (isLocal) {
        sMinX = minX - 1;
        sMaxX = maxX + 1;
        sMinZ = minZ - 1;
        sMaxZ = maxZ + 1;
    } else if (useLazyGeneration) {
        // For lazy generation, only light the loaded region
        let loadedMinCX = CHUNKS_X, loadedMaxCX = 0;
        let loadedMinCZ = CHUNKS_Z, loadedMaxCZ = 0;
        for (let ci = 0; ci < generatedChunksArr.length; ci++) {
            if (generatedChunksArr[ci]) {
                const cx = (ci / CHUNKS_Z) | 0;
                const cz = ci % CHUNKS_Z;
                if (cx < loadedMinCX) loadedMinCX = cx;
                if (cx > loadedMaxCX) loadedMaxCX = cx;
                if (cz < loadedMinCZ) loadedMinCZ = cz;
                if (cz > loadedMaxCZ) loadedMaxCZ = cz;
            }
        }
        if (loadedMinCX > loadedMaxCX) {
            // No chunks loaded, nothing to light
            return;
        }
        sMinX = loadedMinCX * CHUNK_SIZE - WORLD_WIDTH / 2;
        sMaxX = (loadedMaxCX + 1) * CHUNK_SIZE - WORLD_WIDTH / 2 - 1;
        sMinZ = loadedMinCZ * CHUNK_SIZE - WORLD_DEPTH / 2;
        sMaxZ = (loadedMaxCZ + 1) * CHUNK_SIZE - WORLD_DEPTH / 2 - 1;
        minX = sMinX;
        maxX = sMaxX;
        minZ = sMinZ;
        maxZ = sMaxZ;
    } else {
        sMinX = minX;
        sMaxX = maxX;
        sMinZ = minZ;
        sMaxZ = maxZ;
    }

    const hW = sMaxX - sMinX + 3;
    const hMap = new Int32Array(hW * (sMaxZ - sMinZ + 3));
    for(let bx = sMinX - 1; bx <= sMaxX + 1; bx++) {
        for(let bz = sMinZ - 1; bz <= sMaxZ + 1; bz++) {
            let hy = 0;
            for(let by = maxY; by >= minY; by--) {
                const id = getVoxel(bx, by, bz) & 0xFF;
                if (!isBlockTransparent(id) || id === 4 || id === 14 || id === 22 || id === 43 || id === 97 || id === 27 || id === 38 || id === 39) {
                    hy = by; break;
                }
            }
            hMap[(bx - (sMinX - 1)) + (bz - (sMinZ - 1)) * hW] = hy;
        }
    }

    for (let x = sMinX; x <= sMaxX; x++) {
        for (let z = sMinZ; z <= sMaxZ; z++) {
            let sunLevel = 15;
            
            const hX = x - (sMinX - 1);
            const hZ = z - (sMinZ - 1);
            const myHy = hMap[hX + hZ * hW];
            const maxHy = Math.max(
                myHy,
                hMap[(hX + 1) + hZ * hW],
                hMap[(hX - 1) + hZ * hW],
                hMap[hX + (hZ + 1) * hW],
                hMap[hX + (hZ - 1) * hW]
            );

            for (let y = maxY; y >= minY; y--) {
                const isBoundary = isLocal && (x < minX || x > maxX || z < minZ || z > maxZ || y === maxY);
                
                if (isBoundary) {
                    const sL = getSunLight(x, y, z);
                    if (sL > 0 && sunQueueLen < queueCapacity) {
                        sunQueueX[sunQueueLen] = x; sunQueueY[sunQueueLen] = y;
                        sunQueueZ[sunQueueLen] = z; sunQueueL[sunQueueLen] = sL;
                        sunQueueLen++;
                    }
                    const tL = getTorchLight(x, y, z);
                    if (tL > 0 && torchQueueLen < queueCapacity) {
                        torchQueueX[torchQueueLen] = x; torchQueueY[torchQueueLen] = y;
                        torchQueueZ[torchQueueLen] = z; torchQueueL[torchQueueLen] = tL;
                        torchQueueLen++;
                    }
                    continue;
                }

                const id = getVoxel(x, y, z) & 0xFF;
                const isOpaque = !isBlockTransparent(id);
                
                if (isOpaque) {
                    sunLevel = 0;
                } else if (id === 14 || id === 22 || id === 43 || id === 97) {
                    // Leaves reduce light by 2 per block (MC-like)
                    sunLevel = Math.max(0, sunLevel - 2);
                } else if (id === 4 || id === 27) {
                    // Water and lava reduce light by 1
                    sunLevel = Math.max(0, sunLevel - 1);
                }
                
                if (sunLevel > 0) {
                    setSunLight(x, y, z, sunLevel);
                    
                    let needsQueue = true;
                    if (sunLevel === 15 && y > maxHy) {
                        needsQueue = false;
                    }
                    
                    if (needsQueue && sunQueueLen < queueCapacity) {
                        sunQueueX[sunQueueLen] = x; sunQueueY[sunQueueLen] = y;
                        sunQueueZ[sunQueueLen] = z; sunQueueL[sunQueueLen] = sunLevel;
                        sunQueueLen++;
                    }
                }
                
                // --- NEW: Dynamic Emitter Lighting ---
                if (id === 17 || id === 27 || id === 89 || id === 91) { 
                    // Torches/Lava/Glowstone get 14, Fire gets max brightness 15!
                    const emitLight = (id === 89) ? 15 : 14; 
                    
                    setTorchLight(x, y, z, emitLight);
                    if (torchQueueLen < queueCapacity) {
                        torchQueueX[torchQueueLen] = x; torchQueueY[torchQueueLen] = y;
                        torchQueueZ[torchQueueLen] = z; torchQueueL[torchQueueLen] = emitLight;
                        torchQueueLen++;
                    }
                }
                // Lit furnace: emits light level 13 (MC-accurate)
                if (id === 59 && ((getVoxel(x, y, z) >> 12) & 0x1) === 1) {
                    setTorchLight(x, y, z, 13);
                    if (torchQueueLen < queueCapacity) {
                        torchQueueX[torchQueueLen] = x; torchQueueY[torchQueueLen] = y;
                        torchQueueZ[torchQueueLen] = z; torchQueueL[torchQueueLen] = 13;
                        torchQueueLen++;
                    }
                }
            }
        }
    }
    
    const ndx = [1,-1,0,0,0,0];
    const ndy = [0,0,1,-1,0,0];
    const ndz = [0,0,0,0,1,-1];
    let sqIdx = 0;
    while (sqIdx < sunQueueLen) {
        const sx = sunQueueX[sqIdx], sy = sunQueueY[sqIdx], sz = sunQueueZ[sqIdx], sl = sunQueueL[sqIdx];
        sqIdx++;
        if (sl <= 1) continue;
        for (let d = 0; d < 6; d++) {
            const nx = sx + ndx[d], ny = sy + ndy[d], nz = sz + ndz[d];
            if (nx < minX || nx > maxX || nz < minZ || nz > maxZ || ny < minY || ny > maxY) continue;
            
            const id = getVoxel(nx, ny, nz) & 0xFF;
            if (!isBlockTransparent(id)) continue;
            
            // Leaves reduce light by 2 per block, everything else by 1
            const reduction = (id === 14 || id === 22 || id === 43 || id === 97) ? 2 : 1;
            let nLevel = sl - reduction;
            if (nLevel < 0) nLevel = 0;
            
            if (nx === sx && nz === sz && ny < sy && sl === 15 && id === 0) nLevel = 15;
            
            if (nLevel > getSunLight(nx, ny, nz)) {
                setSunLight(nx, ny, nz, nLevel);
                if (sunQueueLen < queueCapacity) {
                    sunQueueX[sunQueueLen] = nx; sunQueueY[sunQueueLen] = ny;
                    sunQueueZ[sunQueueLen] = nz; sunQueueL[sunQueueLen] = nLevel;
                    sunQueueLen++;
                }
            }
        }
    }
    
    let tqIdx = 0;
    while (tqIdx < torchQueueLen) {
        const tx = torchQueueX[tqIdx], ty = torchQueueY[tqIdx], tz = torchQueueZ[tqIdx], tl = torchQueueL[tqIdx];
        tqIdx++;
        if (tl <= 1) continue;
        for (let d = 0; d < 6; d++) {
            const nx = tx + ndx[d], ny = ty + ndy[d], nz = tz + ndz[d];
            if (nx < minX || nx > maxX || nz < minZ || nz > maxZ || ny < minY || ny > maxY) continue;
            
            const id = getVoxel(nx, ny, nz) & 0xFF;
            if (!isBlockTransparent(id)) continue;
            
            // Leaves reduce torch light by 2 per block too
            const reduction = (id === 14 || id === 22 || id === 43 || id === 97) ? 2 : 1;
            let nLevel = tl - reduction;
            if (nLevel < 0) nLevel = 0;
            
            if (nLevel > getTorchLight(nx, ny, nz)) {
                setTorchLight(nx, ny, nz, nLevel);
                if (torchQueueLen < queueCapacity) {
                    torchQueueX[torchQueueLen] = nx; torchQueueY[torchQueueLen] = ny;
                    torchQueueZ[torchQueueLen] = nz; torchQueueL[torchQueueLen] = nLevel;
                    torchQueueLen++;
                }
            }
        }
    }

    if (isLocal) {
        let i = 0;
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                let chunkMarked = false;
                const ix = x + _halfW;
                const iz = z + _halfD;
                if ((ix >>> 0) >= WORLD_WIDTH || (iz >>> 0) >= WORLD_DEPTH) {
                    for (let y = minY; y <= yTopLocal; y++) i++;
                    continue;
                }
                const chunk = _getChunkFast(ix >> 4, iz >> 4);
                const base = (ix & 15) + ((iz & 15) << 12);
                for (let y = minY; y <= yTopLocal; y++) {
                    let curLight = 0;
                    if (chunk) curLight = chunk[base + (y << 4)] & 0x003FC000;
                    if (oldLightCache[i++] !== curLight) {
                        if (!chunkMarked) {
                            updateChunks(x, y, z);
                            chunkMarked = true;
                        }
                    }
                }
            }
        }
    }
}
