// ==========================================
// DIMENSION SWITCHING (NETHER PORTALS)
// ==========================================

// ==========================================

// ==========================================
// PORTAL LINK REGISTRY
// ==========================================
if (!window._portalLinks) window._portalLinks = [];
if (!window._aetherPortalLinks) window._aetherPortalLinks = [];
let _dimensionSwitching = false;

// --- NETHER SIZING ---
// Classic (54 chunks, 864 blocks) and Small (64 chunks, 1024 blocks): 1:3 ratio
// Medium (192 chunks, 3072 blocks) and Large (320 chunks, 5120 blocks): 1:8 ratio
// Returns { ratio, netherChunks } based on the overworld chunk count
function _getNetherConfig() {
    // Use stored overworld size (or current if we haven't switched yet)
    const owChunks = overworldChunksX || CHUNKS_X;
    if (owChunks <= 32) {
        // Mobile sizes (16 or 32 chunks): 1:1 ratio for bigger nether
        return { ratio: 1, netherChunks: owChunks };
    } else if (owChunks <= 64) {
        // Classic/Small: 1:3 ratio
        return { ratio: 3, netherChunks: Math.ceil(owChunks / 3) };
    } else {
        // Medium/Large: 1:8 ratio
        return { ratio: 8, netherChunks: Math.ceil(owChunks / 8) };
    }
}

function _getNetherRatio() {
    return _getNetherConfig().ratio;
}

// Swap world dimensions to nether size
function _setNetherWorldSize() {
    const cfg = _getNetherConfig();
    netherChunksX = cfg.netherChunks;
    netherChunksZ = cfg.netherChunks;
    CHUNKS_X = netherChunksX;
    CHUNKS_Z = netherChunksZ;
    WORLD_WIDTH = CHUNKS_X * CHUNK_SIZE;
    WORLD_DEPTH = CHUNKS_Z * CHUNK_SIZE;
    _updateWorldHalves();
}

// Restore world dimensions to overworld size
function _setOverworldWorldSize() {
    CHUNKS_X = overworldChunksX;
    CHUNKS_Z = overworldChunksZ;
    WORLD_WIDTH = CHUNKS_X * CHUNK_SIZE;
    WORLD_DEPTH = CHUNKS_Z * CHUNK_SIZE;
    _updateWorldHalves();
}

// Aether uses same size as overworld (1:1 ratio)
function _setAetherWorldSize() {
    aetherChunksX = overworldChunksX;
    aetherChunksZ = overworldChunksZ;
    CHUNKS_X = aetherChunksX;
    CHUNKS_Z = aetherChunksZ;
    WORLD_WIDTH = CHUNKS_X * CHUNK_SIZE;
    WORLD_DEPTH = CHUNKS_Z * CHUNK_SIZE;
    _updateWorldHalves();
}

// Clamp Y to valid nether interior
function _clampNetherY(y) {
    return Math.max(2, Math.min(NETHER_HEIGHT - 6, y));
}

// Convert overworld coords to nether coords (clamped to nether world bounds)
function _overworldToNether(ox, oy, oz) {
    const ratio = _getNetherRatio();
    const nx = Math.floor(ox / ratio);
    const nz = Math.floor(oz / ratio);
    const ny = _clampNetherY(Math.floor(oy / 2));
    // Clamp to nether world bounds
    const cfg = _getNetherConfig();
    const netherHalf = Math.floor((cfg.netherChunks * CHUNK_SIZE) / 2);
    return {
        x: Math.max(-netherHalf + 5, Math.min(netherHalf - 5, nx)),
        y: ny,
        z: Math.max(-netherHalf + 5, Math.min(netherHalf - 5, nz))
    };
}

// Convert nether coords to overworld coords (clamped to overworld world bounds)
function _netherToOverworld(nx, ny, nz) {
    const ratio = _getNetherRatio();
    const ox = Math.floor(nx * ratio);
    const oz = Math.floor(nz * ratio);
    const oy = Math.floor(ny * 2);
    const owHalf = Math.floor((overworldChunksX * CHUNK_SIZE) / 2);
    return {
        x: Math.max(-owHalf + 5, Math.min(owHalf - 5, ox)),
        y: oy,
        z: Math.max(-owHalf + 5, Math.min(owHalf - 5, oz))
    };
}

// Find which portal the player is standing in (returns {x,y,z} of any portal block nearby)
function _findPlayerPortal() {
    const checkXs = [Math.floor(player.x), Math.floor(player.x + 0.3), Math.floor(player.x - 0.3)];
    const checkZs = [Math.floor(player.z), Math.floor(player.z + 0.3), Math.floor(player.z - 0.3)];
    
    for (const px of checkXs) {
        for (const pz of checkZs) {
            for (let checkY = Math.floor(player.y); checkY <= Math.floor(player.y + player.height); checkY++) {
                const blockId = getVoxel(px, checkY, pz) & 0xFF;
                if (blockId === 90) {
                    let minX = px, minY = checkY, minZ = pz;
                    while ((getVoxel(minX, minY - 1, minZ) & 0xFF) === 90) minY--;
                    while ((getVoxel(minX - 1, minY, minZ) & 0xFF) === 90) minX--;
                    while ((getVoxel(minX, minY, minZ - 1) & 0xFF) === 90) minZ--;
                    return { x: minX, y: minY, z: minZ, type: 'nether' };
                }
                if (blockId === 209) {
                    let minX = px, minY = checkY, minZ = pz;
                    while ((getVoxel(minX, minY - 1, minZ) & 0xFF) === 209) minY--;
                    while ((getVoxel(minX - 1, minY, minZ) & 0xFF) === 209) minX--;
                    while ((getVoxel(minX, minY, minZ - 1) & 0xFF) === 209) minZ--;
                    return { x: minX, y: minY, z: minZ, type: 'aether' };
                }
            }
        }
    }
    return null;
}

// Find a linked portal for the given position, or return null
function _findLinkedPortal(x, y, z, fromDimension) {
    const searchRadius = 5; // Portal corner can be within a few blocks
    for (const link of window._portalLinks) {
        if (fromDimension === 'overworld') {
            if (Math.abs(link.overworldX - x) <= searchRadius && 
                Math.abs(link.overworldY - y) <= searchRadius && 
                Math.abs(link.overworldZ - z) <= searchRadius) {
                return { x: link.netherX, y: link.netherY, z: link.netherZ };
            }
        } else {
            if (Math.abs(link.netherX - x) <= searchRadius && 
                Math.abs(link.netherY - y) <= searchRadius && 
                Math.abs(link.netherZ - z) <= searchRadius) {
                return { x: link.overworldX, y: link.overworldY, z: link.overworldZ };
            }
        }
    }
    return null;
}

// Register a link between an overworld portal and a nether portal
function _registerPortalLink(owX, owY, owZ, nX, nY, nZ) {
    for (const link of window._portalLinks) {
        if (Math.abs(link.overworldX - owX) <= 5 && Math.abs(link.overworldZ - owZ) <= 5) return;
    }
    window._portalLinks.push({ 
        overworldX: owX, overworldY: owY, overworldZ: owZ,
        netherX: nX, netherY: nY, netherZ: nZ 
    });
}

// --- AETHER PORTAL LINKS ---
function _findLinkedAetherPortal(x, y, z, fromDimension) {
    const searchRadius = 5;
    for (const link of window._aetherPortalLinks) {
        if (fromDimension === 'overworld') {
            if (Math.abs(link.overworldX - x) <= searchRadius && 
                Math.abs(link.overworldY - y) <= searchRadius && 
                Math.abs(link.overworldZ - z) <= searchRadius) {
                return { x: link.aetherX, y: link.aetherY, z: link.aetherZ };
            }
        } else {
            if (Math.abs(link.aetherX - x) <= searchRadius && 
                Math.abs(link.aetherY - y) <= searchRadius && 
                Math.abs(link.aetherZ - z) <= searchRadius) {
                return { x: link.overworldX, y: link.overworldY, z: link.overworldZ };
            }
        }
    }
    return null;
}

function _registerAetherPortalLink(owX, owY, owZ, aX, aY, aZ) {
    for (const link of window._aetherPortalLinks) {
        if (Math.abs(link.overworldX - owX) <= 5 && Math.abs(link.overworldZ - owZ) <= 5) return;
    }
    window._aetherPortalLinks.push({ 
        overworldX: owX, overworldY: owY, overworldZ: owZ,
        aetherX: aX, aetherY: aY, aetherZ: aZ 
    });
}

window.switchDimension = async function(forceDimension) {
    if (_dimensionSwitching) return;

    const entryPortal = _findPlayerPortal();
    
    // Cross-dimension portal restriction: aether portals only work in the
    // overworld and aether (not nether), and nether portals only work in
    // the overworld and nether (not aether). You have to return to the
    // overworld first to switch to a different "other" dimension.
    if (!forceDimension && entryPortal) {
        if (currentDimension === 'nether' && entryPortal.type === 'aether') return;
        if (currentDimension === 'aether' && entryPortal.type === 'nether') return;
    }
    
    _dimensionSwitching = true;
    
    // Determine target dimension
    let targetDimension;
    if (forceDimension) {
        targetDimension = forceDimension;
    } else if (currentDimension === 'overworld') {
        if (entryPortal && entryPortal.type === 'aether') targetDimension = 'aether';
        else targetDimension = 'nether';
    } else if (currentDimension === 'nether') {
        targetDimension = 'overworld';
    } else if (currentDimension === 'aether') {
        targetDimension = 'overworld';
    }

    const savedX = player.x;
    const savedY = player.y;
    const savedZ = player.z;
    const savedYaw = player.yaw;
    const savedPitch = player.pitch;

    // Check for existing link
    let linkedDest = null;
    if (entryPortal) {
        if (targetDimension === 'nether' || (currentDimension === 'nether' && targetDimension === 'overworld')) {
            linkedDest = _findLinkedPortal(entryPortal.x, entryPortal.y, entryPortal.z, currentDimension);
        } else if (targetDimension === 'aether' || (currentDimension === 'aether' && targetDimension === 'overworld')) {
            linkedDest = _findLinkedAetherPortal(entryPortal.x, entryPortal.y, entryPortal.z, currentDimension);
        }
    }

    // Show loading screen
    document.exitPointerLock();
    uiState = 'LOADING';
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.remove('hidden');
    loadingScreen.style.zoom = '1';
    var dimText;
    if (targetDimension === 'nether') dimText = 'Entering the Nether...';
    else if (targetDimension === 'aether') dimText = 'Ascending to the Aether...';
    else if (currentDimension === 'nether') dimText = 'Returning to Overworld...';
    else if (currentDimension === 'aether') dimText = 'Descending to Overworld...';
    else dimText = 'Switching dimensions...';
    document.getElementById('loading-world-name').textContent = dimText;
    if (window.mcFont && window.mcFont.isReady()) {
        window.mcFont.updateEl(document.getElementById('loading-world-name'), dimText);
    }
    if (typeof drawDirtBg === 'function') drawDirtBg('dirt-bg-3');
    document.getElementById('pause-menu').classList.add('hidden');
    
    await yieldToUI();

    // --- Clean up current scene meshes ---
    for (const [key, group] of chunkMeshes) {
        scene.remove(group);
        group.traverse(child => {
            if (child.isMesh) {
                if (child.geometry) child.geometry.dispose();
            }
        });
    }
    chunkMeshes.clear(); window._lastVisChunkX = undefined;
    dirtyChunks.clear();
    updateWaterQueue.clear();
    updateLavaQueue.clear();
    if (window._fluidSchedule) window._fluidSchedule = [];
    pendingBlockUpdates.length = 0;
    window.activeFireBlocks.clear();

    // Clean up entities
    for (let i = particles.length - 1; i >= 0; i--) {
        scene.remove(particles[i].mesh);
    }
    particles.length = 0;
    
    if (typeof droppedItems !== 'undefined') {
        for (let i = droppedItems.length - 1; i >= 0; i--) {
            if (droppedItems[i].mesh) scene.remove(droppedItems[i].mesh);
        }
        droppedItems.length = 0;
    }

    // Clear arrows
    if (typeof globalArrows !== 'undefined') {
        for (let i = globalArrows.length - 1; i >= 0; i--) {
            if (globalArrows[i].mesh) scene.remove(globalArrows[i].mesh);
        }
        globalArrows.length = 0;
    }

    // Clear XP orbs
    if (typeof window.clearXPOrbs === 'function') window.clearXPOrbs();

    // --- SAVE MOBS for current dimension and remove from scene ---
    if (!window._dimensionMobs) window._dimensionMobs = { overworld: [], nether: [], aether: [] };
    
    // Serialize current mobs (save type + position) and remove from scene
    const savedMobs = [];
    if (typeof globalMobs !== 'undefined') {
        for (let i = globalMobs.length - 1; i >= 0; i--) {
            const mob = globalMobs[i];
            // Determine mob type
            let mobType = 'pig'; // fallback
            if (typeof Zombie !== 'undefined' && mob instanceof Zombie) mobType = 'zombie';
            else if (typeof Skeleton !== 'undefined' && mob instanceof Skeleton) mobType = 'skeleton';
            else if (typeof Creeper !== 'undefined' && mob instanceof Creeper) mobType = 'creeper';
            else if (typeof Cow !== 'undefined' && mob instanceof Cow) mobType = 'cow';
            else if (typeof Sheep !== 'undefined' && mob instanceof Sheep) mobType = 'sheep';
            else if (typeof ZombiePigman !== 'undefined' && mob instanceof ZombiePigman) mobType = 'zombie_pigman';
            else if (typeof Pig !== 'undefined' && mob instanceof Pig) mobType = 'pig';

            if (mob.dead || mob.dying) {
                // Don't save dead/dying mobs, just clean them up
                if (mob.mesh) { scene.remove(mob.mesh); mob.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
                if (mob.shadow) { scene.remove(mob.shadow); mob.shadow.geometry.dispose(); }
                continue;
            }
            // Save mob data
            savedMobs.push({
                type: mobType,
                x: mob.x, y: mob.y, z: mob.z,
                health: mob.health || 20
            });
            // Remove from scene and dispose
            if (mob.mesh) { scene.remove(mob.mesh); mob.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
            if (mob.shadow) { scene.remove(mob.shadow); mob.shadow.geometry.dispose(); }
        }
        globalMobs.length = 0;
    }
    window._dimensionMobs[currentDimension] = savedMobs;
    
    // --- Clean up spawner registry models from scene ---
    if (typeof _spawnerRegistry !== 'undefined') {
        for (const [key, data] of _spawnerRegistry) {
            if (data.model) scene.remove(data.model);
        }
    }
    // Save and clear spawner registry for current dimension
    if (!window._dimensionSpawners) window._dimensionSpawners = { overworld: null, nether: null, aether: null };
    if (typeof _spawnerRegistry !== 'undefined') {
        const spawnerData = [];
        for (const [key, data] of _spawnerRegistry) {
            spawnerData.push({ key, x: data.x, y: data.y, z: data.z, timer: data.timer, delayMin: data.delayMin, delayMax: data.delayMax });
        }
        window._dimensionSpawners[currentDimension] = spawnerData;
        _spawnerRegistry.clear();
    }

    if (currentDimension === 'overworld' && targetDimension === 'nether') {
        // --- SWITCH TO NETHER ---
        updateLoadingBar(5, 'Saving overworld...');
        await yieldToUI();

        // Snapshot overworld player pos before we leave
        if (typeof _snapshotPlayerPosToCurrentDim === 'function') _snapshotPlayerPosToCurrentDim();
        // Make sure overworld dimensionData entry has current sizes/data
        // (in case it wasn't initialized via the new path)
        dimensionData.overworld.chunks = chunkStorageArr;
        dimensionData.overworld.generatedFlags = generatedChunksArr;
        dimensionData.overworld.biomeMap = biomeMap;
        dimensionData.overworld.chunksX = CHUNKS_X;
        dimensionData.overworld.chunksZ = CHUNKS_Z;
        dimensionData.overworld.worldWidth = WORLD_WIDTH;
        dimensionData.overworld.worldDepth = WORLD_DEPTH;
        dimensionData.overworld.generated = true;
        overworldChunksX = CHUNKS_X;
        overworldChunksZ = CHUNKS_Z;

        // Set nether world size, then store sizes on dimensionData.nether
        _setNetherWorldSize();
        dimensionData.nether.chunksX = CHUNKS_X;
        dimensionData.nether.chunksZ = CHUNKS_Z;
        dimensionData.nether.worldWidth = WORLD_WIDTH;
        dimensionData.nether.worldDepth = WORLD_DEPTH;
        
        // Allocate nether arrays if first entry, then bind
        const wasNetherGenerated = !!dimensionData.nether.generated;
        _ensureDimensionAllocated('nether');
        _bindActiveDimension('nether');
        if (typeof notifyDimensionChange === 'function') notifyDimensionChange();
        
        if (!wasNetherGenerated) {
            updateLoadingBar(10, 'Generating Nether...');
            await yieldToUI();
            await generateNetherWorld();
            dimensionData.nether.generated = true;
            netherGenerated = true;
        }

        if (linkedDest) {
            const halfW = Math.floor(WORLD_WIDTH / 2);
            const halfD = Math.floor(WORLD_DEPTH / 2);
            const ldCX = Math.floor((linkedDest.x + halfW) / CHUNK_SIZE);
            const ldCZ = Math.floor((linkedDest.z + halfD) / CHUNK_SIZE);
            for (let dcx = ldCX - 3; dcx <= ldCX + 3; dcx++) {
                for (let dcz = ldCZ - 3; dcz <= ldCZ + 3; dcz++) {
                    if (dcx >= 0 && dcx < CHUNKS_X && dcz >= 0 && dcz < CHUNKS_Z) {
                        if (!_isChunkGenerated(dcx, dcz)) generateNetherChunkColumn(dcx, dcz);
                    }
                }
            }
            player.x = linkedDest.x + 0.5;
            player.y = linkedDest.y;
            player.z = linkedDest.z + 0.5;
        } else {
            const netherDest = _overworldToNether(savedX, savedY, savedZ);
            const destX = netherDest.x;
            const destZ = netherDest.z;
            const halfW = Math.floor(WORLD_WIDTH / 2);
            const halfD = Math.floor(WORLD_DEPTH / 2);
            const destCX = Math.floor((destX + halfW) / CHUNK_SIZE);
            const destCZ = Math.floor((destZ + halfD) / CHUNK_SIZE);
            for (let dcx = destCX - 3; dcx <= destCX + 3; dcx++) {
                for (let dcz = destCZ - 3; dcz <= destCZ + 3; dcz++) {
                    if (dcx >= 0 && dcx < CHUNKS_X && dcz >= 0 && dcz < CHUNKS_Z) {
                        if (!_isChunkGenerated(dcx, dcz)) generateNetherChunkColumn(dcx, dcz);
                    }
                }
            }
            const portalPos = _spawnNetherPortal(destX, destZ);
            player.x = portalPos.x + 0.5;
            player.y = portalPos.y;
            player.z = portalPos.z + 0.5;
            const owSide = entryPortal || { x: Math.floor(savedX), y: Math.floor(savedY), z: Math.floor(savedZ) };
            _registerPortalLink(owSide.x, owSide.y, owSide.z, portalPos.x, portalPos.y, portalPos.z);
        }
        player.yaw = savedYaw;
        player.pitch = savedPitch;

    } else if (currentDimension === 'overworld' && targetDimension === 'aether') {
        // --- SWITCH TO AETHER ---
        updateLoadingBar(5, 'Saving overworld...');
        await yieldToUI();

        if (typeof _snapshotPlayerPosToCurrentDim === 'function') _snapshotPlayerPosToCurrentDim();
        dimensionData.overworld.chunks = chunkStorageArr;
        dimensionData.overworld.generatedFlags = generatedChunksArr;
        dimensionData.overworld.biomeMap = biomeMap;
        dimensionData.overworld.chunksX = CHUNKS_X;
        dimensionData.overworld.chunksZ = CHUNKS_Z;
        dimensionData.overworld.worldWidth = WORLD_WIDTH;
        dimensionData.overworld.worldDepth = WORLD_DEPTH;
        dimensionData.overworld.generated = true;
        overworldChunksX = CHUNKS_X;
        overworldChunksZ = CHUNKS_Z;

        _setAetherWorldSize();
        dimensionData.aether.chunksX = CHUNKS_X;
        dimensionData.aether.chunksZ = CHUNKS_Z;
        dimensionData.aether.worldWidth = WORLD_WIDTH;
        dimensionData.aether.worldDepth = WORLD_DEPTH;

        const wasAetherGenerated = !!dimensionData.aether.generated;
        _ensureDimensionAllocated('aether');
        _bindActiveDimension('aether');
        if (typeof notifyDimensionChange === 'function') notifyDimensionChange();

        if (!wasAetherGenerated) {
            updateLoadingBar(10, 'Generating Aether...');
            await yieldToUI();
            await generateAetherWorld();
            dimensionData.aether.generated = true;
            aetherGenerated = true;
        }

        if (linkedDest) {
            const halfW = Math.floor(WORLD_WIDTH / 2);
            const halfD = Math.floor(WORLD_DEPTH / 2);
            const ldCX = Math.floor((linkedDest.x + halfW) / CHUNK_SIZE);
            const ldCZ = Math.floor((linkedDest.z + halfD) / CHUNK_SIZE);
            for (let dcx = ldCX - 3; dcx <= ldCX + 3; dcx++) {
                for (let dcz = ldCZ - 3; dcz <= ldCZ + 3; dcz++) {
                    if (dcx >= 0 && dcx < CHUNKS_X && dcz >= 0 && dcz < CHUNKS_Z) {
                        if (!_isChunkGenerated(dcx, dcz)) generateAetherChunkColumn(dcx, dcz);
                    }
                }
            }
            player.x = linkedDest.x + 0.5;
            player.y = linkedDest.y;
            player.z = linkedDest.z + 0.5;
        } else {
            // 1:1 coordinates — same X,Z as overworld
            const destX = Math.floor(savedX);
            const destZ = Math.floor(savedZ);
            const halfW = Math.floor(WORLD_WIDTH / 2);
            const halfD = Math.floor(WORLD_DEPTH / 2);
            const destCX = Math.floor((destX + halfW) / CHUNK_SIZE);
            const destCZ = Math.floor((destZ + halfD) / CHUNK_SIZE);
            for (let dcx = destCX - 3; dcx <= destCX + 3; dcx++) {
                for (let dcz = destCZ - 3; dcz <= destCZ + 3; dcz++) {
                    if (dcx >= 0 && dcx < CHUNKS_X && dcz >= 0 && dcz < CHUNKS_Z) {
                        if (!_isChunkGenerated(dcx, dcz)) generateAetherChunkColumn(dcx, dcz);
                    }
                }
            }
            const portalPos = _spawnAetherPortal(destX, destZ);
            player.x = portalPos.x + 0.5;
            player.y = portalPos.y;
            player.z = portalPos.z + 0.5;
            const owSide = entryPortal || { x: Math.floor(savedX), y: Math.floor(savedY), z: Math.floor(savedZ) };
            _registerAetherPortalLink(owSide.x, owSide.y, owSide.z, portalPos.x, portalPos.y, portalPos.z);
        }
        player.yaw = savedYaw;
        player.pitch = savedPitch;

    } else if (currentDimension === 'nether' && targetDimension === 'overworld') {
        // --- NETHER TO OVERWORLD ---
        updateLoadingBar(5, 'Saving Nether...');
        await yieldToUI();

        if (typeof _snapshotPlayerPosToCurrentDim === 'function') _snapshotPlayerPosToCurrentDim();
        // Make sure nether dimensionData is synced (in case the nether
        // wasn't allocated through the new path originally)
        dimensionData.nether.chunks = chunkStorageArr;
        dimensionData.nether.generatedFlags = generatedChunksArr;
        dimensionData.nether.biomeMap = biomeMap;
        dimensionData.nether.chunksX = CHUNKS_X;
        dimensionData.nether.chunksZ = CHUNKS_Z;
        dimensionData.nether.worldWidth = WORLD_WIDTH;
        dimensionData.nether.worldDepth = WORLD_DEPTH;
        dimensionData.nether.generated = true;

        _setOverworldWorldSize();
        dimensionData.overworld.chunksX = CHUNKS_X;
        dimensionData.overworld.chunksZ = CHUNKS_Z;
        dimensionData.overworld.worldWidth = WORLD_WIDTH;
        dimensionData.overworld.worldDepth = WORLD_DEPTH;

        _ensureDimensionAllocated('overworld');
        _bindActiveDimension('overworld');
        if (typeof notifyDimensionChange === 'function') notifyDimensionChange();

        if (linkedDest) {
            if (useLazyGeneration && typeof ensureChunkGenerated === 'function') {
                const halfW = Math.floor(WORLD_WIDTH / 2);
                const halfD = Math.floor(WORLD_DEPTH / 2);
                const ldCX = Math.floor((linkedDest.x + halfW) / CHUNK_SIZE);
                const ldCZ = Math.floor((linkedDest.z + halfD) / CHUNK_SIZE);
                for (let dcx = ldCX - 3; dcx <= ldCX + 3; dcx++) {
                    for (let dcz = ldCZ - 3; dcz <= ldCZ + 3; dcz++) {
                        ensureChunkGenerated(dcx, dcz);
                    }
                }
            }
            player.x = linkedDest.x + 0.5;
            player.y = linkedDest.y;
            player.z = linkedDest.z + 0.5;
        } else {
            const overworldDest = _netherToOverworld(savedX, savedY, savedZ);
            const destX = overworldDest.x;
            const destZ = overworldDest.z;
            if (useLazyGeneration && typeof ensureChunkGenerated === 'function') {
                const halfW = Math.floor(WORLD_WIDTH / 2);
                const halfD = Math.floor(WORLD_DEPTH / 2);
                const destCX = Math.floor((destX + halfW) / CHUNK_SIZE);
                const destCZ = Math.floor((destZ + halfD) / CHUNK_SIZE);
                for (let dcx = destCX - 3; dcx <= destCX + 3; dcx++) {
                    for (let dcz = destCZ - 3; dcz <= destCZ + 3; dcz++) {
                        ensureChunkGenerated(dcx, dcz);
                    }
                }
            }
            const destY = getHighestBlock(destX, destZ) + 1;
            const portalPos = _spawnOverworldPortal(destX, destY, destZ);
            player.x = portalPos.x + 0.5;
            player.y = portalPos.y;
            player.z = portalPos.z + 0.5;
            const netherSide = entryPortal || { x: Math.floor(savedX), y: Math.floor(savedY), z: Math.floor(savedZ) };
            _registerPortalLink(portalPos.x, portalPos.y, portalPos.z, netherSide.x, netherSide.y, netherSide.z);
        }
        player.yaw = savedYaw;
        player.pitch = savedPitch;

    } else if (currentDimension === 'aether' && targetDimension === 'overworld') {
        // --- AETHER TO OVERWORLD ---
        updateLoadingBar(5, 'Saving Aether...');
        await yieldToUI();

        if (typeof _snapshotPlayerPosToCurrentDim === 'function') _snapshotPlayerPosToCurrentDim();
        dimensionData.aether.chunks = chunkStorageArr;
        dimensionData.aether.generatedFlags = generatedChunksArr;
        dimensionData.aether.biomeMap = biomeMap;
        dimensionData.aether.chunksX = CHUNKS_X;
        dimensionData.aether.chunksZ = CHUNKS_Z;
        dimensionData.aether.worldWidth = WORLD_WIDTH;
        dimensionData.aether.worldDepth = WORLD_DEPTH;
        dimensionData.aether.generated = true;

        _setOverworldWorldSize();
        dimensionData.overworld.chunksX = CHUNKS_X;
        dimensionData.overworld.chunksZ = CHUNKS_Z;
        dimensionData.overworld.worldWidth = WORLD_WIDTH;
        dimensionData.overworld.worldDepth = WORLD_DEPTH;

        _ensureDimensionAllocated('overworld');
        _bindActiveDimension('overworld');
        if (typeof notifyDimensionChange === 'function') notifyDimensionChange();

        if (linkedDest) {
            if (useLazyGeneration && typeof ensureChunkGenerated === 'function') {
                const halfW = Math.floor(WORLD_WIDTH / 2);
                const halfD = Math.floor(WORLD_DEPTH / 2);
                const ldCX = Math.floor((linkedDest.x + halfW) / CHUNK_SIZE);
                const ldCZ = Math.floor((linkedDest.z + halfD) / CHUNK_SIZE);
                for (let dcx = ldCX - 3; dcx <= ldCX + 3; dcx++) {
                    for (let dcz = ldCZ - 3; dcz <= ldCZ + 3; dcz++) {
                        ensureChunkGenerated(dcx, dcz);
                    }
                }
            }
            player.x = linkedDest.x + 0.5;
            player.y = linkedDest.y;
            player.z = linkedDest.z + 0.5;
        } else {
            // 1:1 coordinates
            const destX = Math.floor(savedX);
            const destZ = Math.floor(savedZ);
            if (useLazyGeneration && typeof ensureChunkGenerated === 'function') {
                const halfW = Math.floor(WORLD_WIDTH / 2);
                const halfD = Math.floor(WORLD_DEPTH / 2);
                const destCX = Math.floor((destX + halfW) / CHUNK_SIZE);
                const destCZ = Math.floor((destZ + halfD) / CHUNK_SIZE);
                for (let dcx = destCX - 3; dcx <= destCX + 3; dcx++) {
                    for (let dcz = destCZ - 3; dcz <= destCZ + 3; dcz++) {
                        ensureChunkGenerated(dcx, dcz);
                    }
                }
            }
            const destY = getHighestBlock(destX, destZ) + 1;
            const portalPos = _spawnOverworldAetherPortal(destX, destY, destZ);
            player.x = portalPos.x + 0.5;
            player.y = portalPos.y;
            player.z = portalPos.z + 0.5;
            const aetherSide = entryPortal || { x: Math.floor(savedX), y: Math.floor(savedY), z: Math.floor(savedZ) };
            _registerAetherPortalLink(portalPos.x, portalPos.y, portalPos.z, aetherSide.x, aetherSide.y, aetherSide.z);
        }
        player.yaw = savedYaw;
        player.pitch = savedPitch;
    }

    // Reset player state
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.onGround = false;
    player.flying = false;
    player.highestY = player.y;

    // Calculate lighting for new dimension
    updateLoadingBar(72, 'Calculating lighting...');
    await yieldToUI();
    
    // Full global lighting pass so lava/fire/glowstone propagate correctly
    if (typeof recalculateLighting === 'function') recalculateLighting();
    
    updateLoadingBar(78, 'Building meshes...');
    await yieldToUI();

    // Rebuild all chunk meshes
    updateAllChunks();
    
    const totalDirty = dirtyChunks.size;
    let meshCount = 0;
    for (let key of dirtyChunks) {
        const sep = key.indexOf(',');
        const cx = parseInt(key.substring(0, sep));
        const cz = parseInt(key.substring(sep + 1));
        buildChunkMesh(cx, cz);
        meshCount++;
        if (meshCount % 32 === 0) {
            updateLoadingBar(75 + (meshCount / totalDirty) * 20, `Building meshes... ${meshCount}/${totalDirty}`);
            await yieldToUI();
        }
    }
    dirtyChunks.clear();

    // Update fog color for dimension
    if (currentDimension === 'nether') {
        scene.fog = new THREE.Fog(0x571313, 1, 100);
        scene.background = new THREE.Color(0x571313);
        if (typeof celestialGroup !== 'undefined' && celestialGroup) celestialGroup.visible = false;
        if (window.cloudMesh) window.cloudMesh.visible = false;
        if (window.cloudDepthMesh) window.cloudDepthMesh.visible = false;
    } else if (currentDimension === 'aether') {
        const rd = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
        scene.fog = new THREE.Fog(0xC0DFFF, rd * 0.5, rd);
        scene.background = new THREE.Color(0xC0DFFF);
        if (typeof celestialGroup !== 'undefined' && celestialGroup) celestialGroup.visible = true;
        if (window.cloudMesh) window.cloudMesh.visible = true;
        if (window.cloudDepthMesh) window.cloudDepthMesh.visible = true;
    } else {
        const rd = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
        scene.fog = new THREE.Fog(0x87CEEB, rd * 0.4, rd);
        scene.background = new THREE.Color(0x87CEEB);
        if (typeof celestialGroup !== 'undefined' && celestialGroup) celestialGroup.visible = true;
        if (window.cloudMesh) window.cloudMesh.visible = true;
        if (window.cloudDepthMesh) window.cloudDepthMesh.visible = true;
    }

    updateLoadingBar(100, 'Done!');
    await yieldToUI();

    // --- Restore mobs for the destination dimension ---
    if (window._dimensionMobs && window._dimensionMobs[currentDimension]) {
        const mobsToRestore = window._dimensionMobs[currentDimension];
        for (const mobData of mobsToRestore) {
            if (typeof spawnMob === 'function') {
                spawnMob(mobData.type, mobData.x, mobData.y, mobData.z);
            }
        }
        window._dimensionMobs[currentDimension] = []; // Clear after restoring
    }
    
    // --- Re-register spawner blocks for this dimension ---
    if (window._dimensionSpawners && window._dimensionSpawners[currentDimension]) {
        const spawners = window._dimensionSpawners[currentDimension];
        if (spawners && typeof window.registerSpawner === 'function') {
            for (const s of spawners) {
                // Only re-register if the spawner block still exists
                if ((getVoxel(s.x, s.y, s.z) & 0xFF) === 54) {
                    window.registerSpawner(s.x, s.y, s.z);
                }
            }
        }
        window._dimensionSpawners[currentDimension] = null;
    }

    // Resume game
    document.getElementById('loading-screen').classList.add('hidden');
    if (typeof applyGUIScale === 'function') applyGUIScale();
    uiState = 'PLAYING';
    
    // Reset cooldown AFTER everything is done so the player doesn't re-trigger immediately
    window._lastPortalUse = performance.now();
    _dimensionSwitching = false;
    
    document.body.requestPointerLock();
};

// Find a safe Y spawn in the nether (air pocket near the given X,Z)
function _findNetherSpawnY(x, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    // v311: Enforce minimum Y of 35 — below that the nether is dense
    // netherrack and lava, and the first air pocket is almost always
    // a tiny cave surrounded by lava, trapping the player.
    const minY = 35;
    const maxY = NETHER_HEIGHT - 6; // Stay below the ceiling bedrock
    
    for (let y = minY; y <= maxY; y++) {
        const b0 = getVoxel(fx, y, fz) & 0xFF;
        const b1 = getVoxel(fx, y + 1, fz) & 0xFF;
        const bBelow = getVoxel(fx, y - 1, fz) & 0xFF;
        if (b0 === 0 && b1 === 0 && bBelow !== 0 && !isFluidBlock(bBelow)) {
            return y;
        }
    }
    // Fallback: carve out a space at a safe mid-height
    const fy = Math.min(60, maxY - 5);
    for (let dy = 0; dy < 3; dy++) {
        setVoxel(fx, fy + dy, fz, 0);
    }
    setVoxel(fx, fy - 1, fz, 87);
    return fy;
}

// Spawn a portal structure in the nether at given nether coordinates
function _spawnNetherPortal(nx, nz) {
    const px = Math.floor(nx);
    const pz = Math.floor(nz);
    const rawY = _findNetherSpawnY(px, pz);
    // Ensure the full portal frame (5 blocks tall) fits within nether bounds
    // and respects the 35+ minimum spawn height
    const py = Math.max(35, Math.min(NETHER_HEIGHT - 8, rawY));

    const frameMinX = px;
    const frameMaxX = px + 3;
    const frameMinY = py - 1;
    const frameMaxY = py + 3;

    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            const isEdgeX = (x === frameMinX || x === frameMaxX);
            const isEdgeY = (y === frameMinY || y === frameMaxY);

            if (isEdgeX || isEdgeY) {
                setVoxel(x, y, pz, 28);
            } else {
                setVoxel(x, y, pz, 90, 0);
            }
            pendingBlockUpdates.push({ x, y, z: pz });
        }
    }

    // Clear space around portal
    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            for (let dz of [1, -1]) {
                const b = getVoxel(x, y, pz + dz) & 0xFF;
                if (b !== 0 && b !== 18 && !isFluidBlock(b)) {
                    setVoxel(x, y, pz + dz, 0);
                    pendingBlockUpdates.push({ x, y, z: pz + dz });
                }
            }
        }
    }

    // Floor
    for (let x = frameMinX - 1; x <= frameMaxX + 1; x++) {
        for (let dz = -1; dz <= 1; dz++) {
            const bf = getVoxel(x, frameMinY - 1, pz + dz) & 0xFF;
            if (bf === 0 || isFluidBlock(bf)) {
                setVoxel(x, frameMinY - 1, pz + dz, 87);
            }
        }
    }

    // Return the portal interior bottom-left position for linking
    return { x: frameMinX + 1, y: frameMinY + 1, z: pz };
}

function _spawnOverworldPortal(ox, oy, oz) {
    const px = Math.floor(ox);
    const pz = Math.floor(oz);
    const py = oy;

    const frameMinX = px;
    const frameMaxX = px + 3;
    const frameMinY = py;
    const frameMaxY = py + 4;

    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            const isEdgeX = (x === frameMinX || x === frameMaxX);
            const isEdgeY = (y === frameMinY || y === frameMaxY);

            if (isEdgeX || isEdgeY) {
                setVoxel(x, y, pz, 28);
            } else {
                setVoxel(x, y, pz, 90, 0);
            }
            pendingBlockUpdates.push({ x, y, z: pz });
        }
    }

    // Clear space around portal
    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            for (let dz of [1, -1]) {
                const b = getVoxel(x, y, pz + dz) & 0xFF;
                if (b !== 0 && b !== 18 && !isFluidBlock(b)) {
                    setVoxel(x, y, pz + dz, 0);
                    pendingBlockUpdates.push({ x, y, z: pz + dz });
                }
            }
        }
    }

    // Floor
    for (let x = frameMinX - 1; x <= frameMaxX + 1; x++) {
        for (let dz = -1; dz <= 1; dz++) {
            const bf = getVoxel(x, frameMinY - 1, pz + dz) & 0xFF;
            if (bf === 0 || isFluidBlock(bf)) {
                setVoxel(x, frameMinY - 1, pz + dz, 3); // Stone floor in overworld
            }
        }
    }

    return { x: frameMinX + 1, y: frameMinY + 1, z: pz };
}

// ==========================================
// AETHER PORTAL SPAWNING
// ==========================================

// Find a suitable Y on a floating island in the aether
function _findAetherSpawnY(x, z) {
    const fx = Math.floor(x), fz = Math.floor(z);
    // Scan down from top of island range
    for (let y = 120; y >= 30; y--) {
        const b = getVoxel(fx, y, fz) & 0xFF;
        const above = getVoxel(fx, y + 1, fz) & 0xFF;
        const above2 = getVoxel(fx, y + 2, fz) & 0xFF;
        if (b !== 0 && !isFluidBlock(b) && above === 0 && above2 === 0) {
            return y + 1;
        }
    }
    // Fallback: create a small platform at Y=64
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            setVoxel(fx + dx, 63, fz + dz, 1); // Grass platform
        }
    }
    return 64;
}

function _spawnAetherPortal(ax, az) {
    const px = Math.floor(ax);
    const pz = Math.floor(az);
    const rawY = _findAetherSpawnY(px, pz);
    const py = Math.max(5, rawY);

    const frameMinX = px;
    const frameMaxX = px + 3;
    const frameMinY = py - 1;
    const frameMaxY = py + 3;

    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            const isEdgeX = (x === frameMinX || x === frameMaxX);
            const isEdgeY = (y === frameMinY || y === frameMaxY);
            if (isEdgeX || isEdgeY) {
                setVoxel(x, y, pz, 91); // Glowstone frame
            } else {
                setVoxel(x, y, pz, 209, 0); // Aether portal block
            }
            pendingBlockUpdates.push({ x, y, z: pz });
        }
    }

    // Clear space around portal
    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            for (let dz of [1, -1]) {
                const b = getVoxel(x, y, pz + dz) & 0xFF;
                if (b !== 0 && b !== 18 && !isFluidBlock(b)) {
                    setVoxel(x, y, pz + dz, 0);
                    pendingBlockUpdates.push({ x, y, z: pz + dz });
                }
            }
        }
    }

    // Floor
    for (let x = frameMinX - 1; x <= frameMaxX + 1; x++) {
        for (let dz = -1; dz <= 1; dz++) {
            const bf = getVoxel(x, frameMinY - 1, pz + dz) & 0xFF;
            if (bf === 0 || isFluidBlock(bf)) {
                setVoxel(x, frameMinY - 1, pz + dz, 1); // Grass floor
            }
        }
    }

    return { x: frameMinX + 1, y: frameMinY + 1, z: pz };
}

// Spawn an aether portal (glowstone frame) in the overworld
function _spawnOverworldAetherPortal(ox, oy, oz) {
    const px = Math.floor(ox);
    const pz = Math.floor(oz);
    const py = oy;

    const frameMinX = px;
    const frameMaxX = px + 3;
    const frameMinY = py;
    const frameMaxY = py + 4;

    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            const isEdgeX = (x === frameMinX || x === frameMaxX);
            const isEdgeY = (y === frameMinY || y === frameMaxY);
            if (isEdgeX || isEdgeY) {
                setVoxel(x, y, pz, 91); // Glowstone frame
            } else {
                setVoxel(x, y, pz, 209, 0); // Aether portal block
            }
            pendingBlockUpdates.push({ x, y, z: pz });
        }
    }

    for (let x = frameMinX; x <= frameMaxX; x++) {
        for (let y = frameMinY; y <= frameMaxY; y++) {
            for (let dz of [1, -1]) {
                const b = getVoxel(x, y, pz + dz) & 0xFF;
                if (b !== 0 && b !== 18 && !isFluidBlock(b)) {
                    setVoxel(x, y, pz + dz, 0);
                    pendingBlockUpdates.push({ x, y, z: pz + dz });
                }
            }
        }
    }

    for (let x = frameMinX - 1; x <= frameMaxX + 1; x++) {
        for (let dz = -1; dz <= 1; dz++) {
            const bf = getVoxel(x, frameMinY - 1, pz + dz) & 0xFF;
            if (bf === 0 || isFluidBlock(bf)) {
                setVoxel(x, frameMinY - 1, pz + dz, 3);
            }
        }
    }

    return { x: frameMinX + 1, y: frameMinY + 1, z: pz };
}

// ==========================================
// AETHER VOID FALL — returns player to overworld at same coordinates
// ==========================================
window.handleAetherVoidFall = async function() {
    if (_dimensionSwitching || currentDimension !== 'aether') return;
    if (player.y > -5) return;
    _dimensionSwitching = true;

    const savedX = player.x;
    const savedZ = player.z;
    const savedYaw = player.yaw;
    const savedPitch = player.pitch;

    // Show loading
    document.exitPointerLock();
    uiState = 'LOADING';
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.remove('hidden');
    loadingScreen.style.zoom = '1';
    document.getElementById('loading-world-name').textContent = 'Falling to Overworld...';
    if (window.mcFont && window.mcFont.isReady()) {
        window.mcFont.updateEl(document.getElementById('loading-world-name'), 'Falling to Overworld...');
    }
    if (typeof drawDirtBg === 'function') drawDirtBg('dirt-bg-3');
    document.getElementById('pause-menu').classList.add('hidden');
    await yieldToUI();

    // Clean up scene
    for (const [key, group] of chunkMeshes) {
        scene.remove(group);
        group.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
    }
    chunkMeshes.clear(); window._lastVisChunkX = undefined; dirtyChunks.clear();
    updateWaterQueue.clear(); updateLavaQueue.clear();
    if (window._fluidSchedule) window._fluidSchedule = [];
    pendingBlockUpdates.length = 0;
    if (typeof window.activeFireBlocks !== 'undefined') window.activeFireBlocks.clear();
    for (let i = particles.length - 1; i >= 0; i--) scene.remove(particles[i].mesh);
    particles.length = 0;
    if (typeof droppedItems !== 'undefined') {
        for (let i = droppedItems.length - 1; i >= 0; i--) { if (droppedItems[i].mesh) scene.remove(droppedItems[i].mesh); }
        droppedItems.length = 0;
    }
    if (typeof window.clearXPOrbs === 'function') window.clearXPOrbs();

    // Clear arrows
    if (typeof globalArrows !== 'undefined') {
        for (let i = globalArrows.length - 1; i >= 0; i--) {
            if (globalArrows[i].mesh) scene.remove(globalArrows[i].mesh);
        }
        globalArrows.length = 0;
    }

    // Save mobs
    if (!window._dimensionMobs) window._dimensionMobs = { overworld: [], nether: [], aether: [] };
    const savedMobs = [];
    if (typeof globalMobs !== 'undefined') {
        for (let i = globalMobs.length - 1; i >= 0; i--) {
            const mob = globalMobs[i];
            let mobType = 'pig';
            if (typeof Zombie !== 'undefined' && mob instanceof Zombie) mobType = 'zombie';
            else if (typeof Skeleton !== 'undefined' && mob instanceof Skeleton) mobType = 'skeleton';
            else if (typeof Creeper !== 'undefined' && mob instanceof Creeper) mobType = 'creeper';
            else if (typeof Cow !== 'undefined' && mob instanceof Cow) mobType = 'cow';
            else if (typeof Sheep !== 'undefined' && mob instanceof Sheep) mobType = 'sheep';
            else if (typeof ZombiePigman !== 'undefined' && mob instanceof ZombiePigman) mobType = 'zombie_pigman';
            else if (typeof Pig !== 'undefined' && mob instanceof Pig) mobType = 'pig';
            if (!mob.dead && !mob.dying) {
                savedMobs.push({ type: mobType, x: mob.x, y: mob.y, z: mob.z, health: mob.health || 20 });
            }
            if (mob.mesh) { scene.remove(mob.mesh); mob.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
            if (mob.shadow) { scene.remove(mob.shadow); mob.shadow.geometry.dispose(); }
        }
        globalMobs.length = 0;
    }
    window._dimensionMobs['aether'] = savedMobs;

    // Save aether state, restore overworld
    if (typeof _snapshotPlayerPosToCurrentDim === 'function') _snapshotPlayerPosToCurrentDim();
    dimensionData.aether.chunks = chunkStorageArr;
    dimensionData.aether.generatedFlags = generatedChunksArr;
    dimensionData.aether.biomeMap = biomeMap;
    dimensionData.aether.chunksX = CHUNKS_X;
    dimensionData.aether.chunksZ = CHUNKS_Z;
    dimensionData.aether.worldWidth = WORLD_WIDTH;
    dimensionData.aether.worldDepth = WORLD_DEPTH;
    dimensionData.aether.generated = true;

    _setOverworldWorldSize();
    dimensionData.overworld.chunksX = CHUNKS_X;
    dimensionData.overworld.chunksZ = CHUNKS_Z;
    dimensionData.overworld.worldWidth = WORLD_WIDTH;
    dimensionData.overworld.worldDepth = WORLD_DEPTH;

    _ensureDimensionAllocated('overworld');
    _bindActiveDimension('overworld');
    if (typeof notifyDimensionChange === 'function') notifyDimensionChange();

    // Ensure chunks at destination are generated
    if (useLazyGeneration && typeof ensureChunkGenerated === 'function') {
        const halfW = Math.floor(WORLD_WIDTH / 2);
        const halfD = Math.floor(WORLD_DEPTH / 2);
        const destCX = Math.floor((Math.floor(savedX) + halfW) / CHUNK_SIZE);
        const destCZ = Math.floor((Math.floor(savedZ) + halfD) / CHUNK_SIZE);
        for (let dcx = destCX - 3; dcx <= destCX + 3; dcx++) {
            for (let dcz = destCZ - 3; dcz <= destCZ + 3; dcz++) {
                ensureChunkGenerated(dcx, dcz);
            }
        }
    }

    // Place player above highest block — NO portal spawned
    const destX = Math.floor(savedX);
    const destZ = Math.floor(savedZ);
    const surfY = getHighestBlock(destX, destZ);
    player.x = savedX;
    player.y = 265;
    player.z = savedZ;
    player.yaw = savedYaw;
    player.pitch = savedPitch;
    player.vx = 0; player.vy = 0; player.vz = 0;
    player.onGround = false; player.flying = false;
    player.highestY = player.y;

    // Rebuild
    updateLoadingBar(60, 'Recalculating lighting...');
    await yieldToUI();
    if (typeof recalculateLighting === 'function') recalculateLighting();

    updateLoadingBar(75, 'Building meshes...');
    await yieldToUI();
    updateAllChunks();
    const totalDirty = dirtyChunks.size;
    let meshCount = 0;
    for (let key of dirtyChunks) {
        const sep = key.indexOf(',');
        const cx2 = parseInt(key.substring(0, sep));
        const cz2 = parseInt(key.substring(sep + 1));
        buildChunkMesh(cx2, cz2);
        meshCount++;
        if (meshCount % 32 === 0) {
            updateLoadingBar(75 + (meshCount / totalDirty) * 20, `Building meshes... ${meshCount}/${totalDirty}`);
            await yieldToUI();
        }
    }
    dirtyChunks.clear();

    // Overworld sky
    const rd = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
    scene.fog = new THREE.Fog(0x87CEEB, rd * 0.4, rd);
    scene.background = new THREE.Color(0x87CEEB);
    if (typeof celestialGroup !== 'undefined' && celestialGroup) celestialGroup.visible = true;
    if (window.cloudMesh) window.cloudMesh.visible = true;
    if (window.cloudDepthMesh) window.cloudDepthMesh.visible = true;

    // Restore mobs
    if (window._dimensionMobs && window._dimensionMobs['overworld']) {
        for (const mobData of window._dimensionMobs['overworld']) {
            if (typeof spawnMob === 'function') spawnMob(mobData.type, mobData.x, mobData.y, mobData.z);
        }
        window._dimensionMobs['overworld'] = [];
    }

    updateLoadingBar(100, 'Done!');
    await yieldToUI();

    document.getElementById('loading-screen').classList.add('hidden');
    if (typeof applyGUIScale === 'function') applyGUIScale();
    uiState = 'PLAYING';
    window._lastPortalUse = performance.now();
    _dimensionSwitching = false;
    document.body.requestPointerLock();
};

// ==========================================
// SPAWNER BLOCK SYSTEM