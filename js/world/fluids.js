// --- IMMEDIATE CONVERSION AFTER FLUID PLACEMENT ---
// When water is placed at (x,y,z), check all neighbors for lava and convert immediately.
// When lava is placed at (x,y,z), check all neighbors for water and convert immediately.
// This prevents the one-tick delay where fluids visibly sit next to each other.

function _convertNeighborLava(x, y, z) {
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for (const [dx, dy, dz] of dirs) {
        const nx = x+dx, ny = y+dy, nz = z+dz;
        const nVal = getVoxel(nx, ny, nz);
        const nId = nVal & 0xFF;
        if (nId === 27) {
            const nSource = (nVal >> 13) & 0x1;
            if (nSource) {
                setVoxel(nx, ny, nz, 28); // obsidian
            } else {
                setVoxel(nx, ny, nz, 33); // cobblestone
            }
            if (typeof window.playFizzSound === 'function') window.playFizzSound(nx, ny, nz);
            pendingBlockUpdates.push({x: nx, y: ny, z: nz});
            queueNeighbors(nx, ny, nz);
        }
    }
}

function _convertNeighborWater(x, y, z) {
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    let converted = false;
    for (const [dx, dy, dz] of dirs) {
        const nx = x+dx, ny = y+dy, nz = z+dz;
        const nVal = getVoxel(nx, ny, nz);
        const nId = nVal & 0xFF;
        if (nId === 4) {
            // Water neighbor gets converted to cobblestone; lava at (x,y,z) survives
            setVoxel(nx, ny, nz, 33); // cobblestone replaces the water
            if (typeof window.playFizzSound === 'function') window.playFizzSound(nx, ny, nz);
            pendingBlockUpdates.push({x: nx, y: ny, z: nz});
            queueNeighbors(nx, ny, nz);
            converted = true;
        }
    }
    return converted;
}

function updateWater(x, y, z, dirtyBounds) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id !== 4) return;

    if (checkFluidInteraction(x, y, z)) {
        if (dirtyBounds) { dirtyBounds.dirty = true; if (x < dirtyBounds.minX) dirtyBounds.minX = x; if (x > dirtyBounds.maxX) dirtyBounds.maxX = x; if (z < dirtyBounds.minZ) dirtyBounds.minZ = z; if (z > dirtyBounds.maxZ) dirtyBounds.maxZ = z; }
        return;
    }

    const markDirty = (bx, bz) => {
        if (dirtyBounds) {
            if (bx < dirtyBounds.minX) dirtyBounds.minX = bx;
            if (bx > dirtyBounds.maxX) dirtyBounds.maxX = bx;
            if (bz < dirtyBounds.minZ) dirtyBounds.minZ = bz;
            if (bz > dirtyBounds.maxZ) dirtyBounds.maxZ = bz;
            dirtyBounds.dirty = true;
        }
        updateChunks(bx, y, bz);
    };

    const level = (val >> 8) & 0xF;
    const isFalling = (val >> 12) & 0x1;
    const isSource = (val >> 13) & 0x1;

    // --- INFINITE WATER SOURCE MECHANIC ---
    // A non-source water block with 2+ horizontal source neighbors on top of a solid block becomes a source
    if (!isSource) {
        const belowBlock = getVoxel(x, y - 1, z) & 0xFF;
        const belowIsSolid = belowBlock !== 0 && !isFluidBlock(belowBlock) && !isCrossBlock(belowBlock);
        if (belowIsSolid) {
            let sourceCount = 0;
            const hNeighbors = [
                getVoxel(x + 1, y, z), getVoxel(x - 1, y, z),
                getVoxel(x, y, z + 1), getVoxel(x, y, z - 1)
            ];
            for (const n of hNeighbors) {
                if ((n & 0xFF) === 4 && ((n >> 13) & 0x1) === 1) sourceCount++;
            }
            if (sourceCount >= 2) {
                // Convert to source block
                setVoxel(x, y, z, 4, 8, 0, 1);
                queueNeighbors(x, y, z);
                markDirty(x, z);
                return;
            }
        }
    }

    if (!isSource) {
        let expectedLevel = 0;
        let expectedFalling = 0;

        const above = getVoxel(x, y + 1, z);
        if ((above & 0xFF) === 4) {
            expectedLevel = 8;
            expectedFalling = 1;
        } else {
            let maxN = 0;
            const neighbors = [
                getVoxel(x + 1, y, z), getVoxel(x - 1, y, z),
                getVoxel(x, y, z + 1), getVoxel(x, y, z - 1)
            ];
            for (let n of neighbors) {
                if ((n & 0xFF) === 4) {
                    const nLevel = (n >> 8) & 0xF;
                    const nFalling = (n >> 12) & 0x1;
                    const nSource = (n >> 13) & 0x1;
                    if (nFalling || nSource) {
                        if (8 > maxN) maxN = 8;
                    } else if (nLevel > maxN) {
                        maxN = nLevel;
                    }
                }
            }
            if (maxN > 1) {
                expectedLevel = maxN - 1;
                expectedFalling = 0;
            }
        }

        if (expectedLevel === 0) {
            setVoxel(x, y, z, 0);
            queueNeighbors(x, y, z);
            markDirty(x, z);
            return; 
        } else if (expectedLevel !== level || expectedFalling !== isFalling) {
            setVoxel(x, y, z, 4, expectedLevel, expectedFalling, 0);
            queueNeighbors(x, y, z);
            markDirty(x, z);
        }
    }

    const curVal = getVoxel(x, y, z);
    const curLevel = (curVal >> 8) & 0xF;
    const below = getVoxel(x, y - 1, z);
    const belowId = below & 0xFF;

    // Flow downward: into air, cross blocks, or same fluid (always flows down into itself)
    if (belowId === 0 || isCrossBlock(belowId)) {
        setVoxel(x, y - 1, z, 4, 8, 1, 0);
        _convertNeighborLava(x, y - 1, z); // immediate check for adjacent lava
        updateWaterQueue.add(getVoxelIndex(x, y - 1, z));
        markDirty(x, z);
    } else if (belowId === 4) {
        // Flow into existing water below — update it if not already full
        const belowLevel = (below >> 8) & 0xF;
        if (belowLevel < 8) {
            setVoxel(x, y - 1, z, 4, 8, 1, 0);
            updateWaterQueue.add(getVoxelIndex(x, y - 1, z));
            markDirty(x, z);
        }
    } else if (belowId === 27) {
        // Water flowing down onto lava — immediate conversion
        const belowSource = (below >> 13) & 0x1;
        if (belowSource) {
            setVoxel(x, y - 1, z, 28); // obsidian
        } else {
            setVoxel(x, y - 1, z, 33); // cobblestone
        }
        if (typeof window.playFizzSound === 'function') window.playFizzSound(x, y - 1, z);
        pendingBlockUpdates.push({x, y: y - 1, z});
        queueNeighbors(x, y - 1, z);
        markDirty(x, z);
    } else {
        // Can't flow down — spread horizontally
        if (curLevel > 1) {
            const neighbors = [ [x+1, y, z], [x-1, y, z], [x, y, z+1], [x, y, z-1] ];
            for (let [nx, ny, nz] of neighbors) {
                const nVal = getVoxel(nx, ny, nz);
                const nId = nVal & 0xFF;
                if (nId === 27) {
                    // Water spreading into lava horizontally — immediate conversion
                    const nSource = (nVal >> 13) & 0x1;
                    if (nSource) {
                        setVoxel(nx, ny, nz, 28); // obsidian
                    } else {
                        setVoxel(nx, ny, nz, 33); // cobblestone
                    }
                    if (typeof window.playFizzSound === 'function') window.playFizzSound(nx, ny, nz);
                    pendingBlockUpdates.push({x: nx, y: ny, z: nz});
                    queueNeighbors(nx, ny, nz);
                    markDirty(nx, nz);
                } else if (nId === 0 || isCrossBlock(nId) || (nId === 4 && ((nVal >> 8) & 0xF) < curLevel - 1 && !((nVal >> 13) & 0x1))) {
                    setVoxel(nx, ny, nz, 4, curLevel - 1, 0, 0);
                    if (nId !== 4) _convertNeighborLava(nx, ny, nz); // immediate check for adjacent lava
                    updateWaterQueue.add(getVoxelIndex(nx, ny, nz));
                    markDirty(nx, nz);
                }
            }
        }
    }
}

function queueLavaNeighbors(x, y, z) {
    updateLavaQueue.add(getVoxelIndex(x+1, y, z));
    updateLavaQueue.add(getVoxelIndex(x-1, y, z));
    updateLavaQueue.add(getVoxelIndex(x, y+1, z));
    updateLavaQueue.add(getVoxelIndex(x, y-1, z));
    updateLavaQueue.add(getVoxelIndex(x, y, z+1));
    updateLavaQueue.add(getVoxelIndex(x, y, z-1));
}

function updateLava(x, y, z, dirtyBounds) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id !== 27) return;

    if (checkFluidInteraction(x, y, z)) {
        dirtyBounds.dirty = true;
        if (x < dirtyBounds.minX) dirtyBounds.minX = x;
        if (x > dirtyBounds.maxX) dirtyBounds.maxX = x;
        if (z < dirtyBounds.minZ) dirtyBounds.minZ = z;
        if (z > dirtyBounds.maxZ) dirtyBounds.maxZ = z;
        return;
    }

    // Lava flows 4 blocks in overworld (maxLevel=5), 8 in nether (maxLevel=8, like water)
    const inNether = (typeof currentDimension !== 'undefined' && currentDimension === 'nether');
    const maxLevel = inNether ? 8 : 5;

    const level = (val >> 8) & 0xF;
    const isFalling = (val >> 12) & 0x1;
    const isSource = (val >> 13) & 0x1;

    const markDirty = (bx, bz) => {
        if (bx < dirtyBounds.minX) dirtyBounds.minX = bx;
        if (bx > dirtyBounds.maxX) dirtyBounds.maxX = bx;
        if (bz < dirtyBounds.minZ) dirtyBounds.minZ = bz;
        if (bz > dirtyBounds.maxZ) dirtyBounds.maxZ = bz;
        dirtyBounds.dirty = true;
        updateChunks(bx, y, bz);
    };

    if (!isSource) {
        let expectedLevel = 0;
        let expectedFalling = 0;

        const above = getVoxel(x, y + 1, z);
        const aboveId = above & 0xFF;
        if (aboveId === 27) {
            expectedLevel = maxLevel;
            expectedFalling = 1;
        } else {
            let maxN = 0;
            const neighbors = [
                getVoxel(x + 1, y, z), getVoxel(x - 1, y, z),
                getVoxel(x, y, z + 1), getVoxel(x, y, z - 1)
            ];
            for (let n of neighbors) {
                if ((n & 0xFF) === 27) {
                    const nLevel = (n >> 8) & 0xF;
                    const nFalling = (n >> 12) & 0x1;
                    const nSource = (n >> 13) & 0x1;
                    if (nFalling || nSource) {
                        if (maxLevel > maxN) maxN = maxLevel;
                    } else if (nLevel > maxN) {
                        maxN = nLevel;
                    }
                }
            }
            if (maxN > 1) {
                expectedLevel = maxN - 1;
                expectedFalling = 0;
            }
        }

        if (expectedLevel === 0) {
            setVoxel(x, y, z, 0);
            queueLavaNeighbors(x, y, z);
            markDirty(x, z);
            return; 
        } else if (expectedLevel !== level || expectedFalling !== isFalling) {
            setVoxel(x, y, z, 27, expectedLevel, expectedFalling, 0);
            queueLavaNeighbors(x, y, z);
            markDirty(x, z);
        }
    }

    const curVal = getVoxel(x, y, z);
    const curLevel = (curVal >> 8) & 0xF;
    const below = getVoxel(x, y - 1, z);
    const belowId = below & 0xFF;

    // Flow downward: into air, cross blocks, or same fluid
    if (belowId === 0 || isCrossBlock(belowId)) {
        setVoxel(x, y - 1, z, 27, maxLevel, 1, 0);
        _convertNeighborWater(x, y - 1, z); // convert any adjacent water immediately
        updateLavaQueue.add(getVoxelIndex(x, y - 1, z));
        markDirty(x, z);
    } else if (belowId === 27) {
        // Flow into existing lava below — update if not already full
        const belowLevel = (below >> 8) & 0xF;
        const belowSource = (below >> 13) & 0x1;
        if (belowLevel < maxLevel && !belowSource) {
            setVoxel(x, y - 1, z, 27, maxLevel, 1, 0);
            updateLavaQueue.add(getVoxelIndex(x, y - 1, z));
            markDirty(x, z);
        }
        // If pool below is already settled (full level or source), do
        // nothing — we're a falling lava cell sitting on top of a pool
        // and that's a legitimate continuous column. Rendering treats
        // falling cells as full-height so the column merges visually.
        // We must NOT enter the horizontal-spread branch (the else below)
        // because that would create a floating layer of flowing lava on
        // the pool surface.
        return;
    } else if (belowId === 4) {
        // Lava flowing down onto water — water becomes cobblestone, lava continues next tick
        setVoxel(x, y - 1, z, 33); // cobblestone replaces the water
        if (typeof window.playFizzSound === 'function') window.playFizzSound(x, y - 1, z);
        pendingBlockUpdates.push({x, y: y - 1, z});
        queueNeighbors(x, y - 1, z);
        // Re-queue the lava above so it can flow down onto the new cobblestone next tick
        updateLavaQueue.add(getVoxelIndex(x, y, z));
        markDirty(x, z);
    } else {
        // Can't flow down — spread horizontally
        if (curLevel > 1) {
            const neighbors = [ [x+1, y, z], [x-1, y, z], [x, y, z+1], [x, y, z-1] ];
            for (let [nx, ny, nz] of neighbors) {
                const nVal = getVoxel(nx, ny, nz);
                const nId = nVal & 0xFF;
                if (nId === 4) {
                    // Lava spreading into water horizontally — immediate conversion
                    setVoxel(nx, ny, nz, 33); // cobblestone
                    if (typeof window.playFizzSound === 'function') window.playFizzSound(nx, ny, nz);
                    pendingBlockUpdates.push({x: nx, y: ny, z: nz});
                    queueNeighbors(nx, ny, nz);
                    markDirty(nx, nz);
                } else if (nId === 0 || isCrossBlock(nId) || (nId === 27 && ((nVal >> 8) & 0xF) < curLevel - 1 && !((nVal >> 13) & 0x1))) {
                    setVoxel(nx, ny, nz, 27, curLevel - 1, 0, 0);
                    if (nId !== 27) _convertNeighborWater(nx, ny, nz); // convert any adjacent water
                    updateLavaQueue.add(getVoxelIndex(nx, ny, nz));
                    markDirty(nx, nz);
                }
            }
        }
    }
}