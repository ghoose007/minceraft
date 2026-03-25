// ==========================================
// DIMENSION SWITCHING (NETHER PORTALS)
// ==========================================

// ==========================================

// ==========================================
// PORTAL LINK REGISTRY
// ==========================================
// Maps portal positions between dimensions
// Each entry: { overworldX, overworldY, overworldZ, netherX, netherY, netherZ }
if (!window._portalLinks) window._portalLinks = [];
let _dimensionSwitching = false;

// Find which portal the player is standing in (returns {x,y,z} of any portal block nearby)
function _findPlayerPortal() {
    const px = Math.floor(player.x);
    const pz = Math.floor(player.z);
    for (let checkY = Math.floor(player.y); checkY <= Math.floor(player.y + player.height); checkY++) {
        if ((getVoxel(px, checkY, pz) & 0xFF) === 90) {
            // Scan to find the bottom-left corner of this portal cluster
            let minX = px, minY = checkY, minZ = pz;
            // Scan down
            while ((getVoxel(minX, minY - 1, minZ) & 0xFF) === 90) minY--;
            // Scan left (X-)
            while ((getVoxel(minX - 1, minY, minZ) & 0xFF) === 90) minX--;
            // Scan left (Z-)  
            while ((getVoxel(minX, minY, minZ - 1) & 0xFF) === 90) minZ--;
            return { x: minX, y: minY, z: minZ };
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
    // Check if a link already exists nearby
    for (const link of window._portalLinks) {
        if (Math.abs(link.overworldX - owX) <= 5 && Math.abs(link.overworldZ - owZ) <= 5) return;
    }
    window._portalLinks.push({ 
        overworldX: owX, overworldY: owY, overworldZ: owZ,
        netherX: nX, netherY: nY, netherZ: nZ 
    });
}

window.switchDimension = async function() {
    if (_dimensionSwitching) return;
    _dimensionSwitching = true;

    // Find which portal the player is in
    const entryPortal = _findPlayerPortal();
    
    // Save current player position
    const savedX = player.x;
    const savedY = player.y;
    const savedZ = player.z;
    const savedYaw = player.yaw;
    const savedPitch = player.pitch;

    // Check for existing link
    const linkedDest = entryPortal ? _findLinkedPortal(entryPortal.x, entryPortal.y, entryPortal.z, currentDimension) : null;

    // Show loading screen
    document.exitPointerLock();
    uiState = 'LOADING';
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.remove('hidden');
    loadingScreen.style.zoom = '1';
    document.getElementById('loading-world-name').textContent = currentDimension === 'overworld' ? 'Entering the Nether...' : 'Returning to Overworld...';
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
    chunkMeshes.clear();
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

    // --- SAVE MOBS for current dimension and remove from scene ---
    if (!window._dimensionMobs) window._dimensionMobs = { overworld: [], nether: [] };
    
    // Serialize current mobs (save type + position) and remove from scene
    const savedMobs = [];
    if (typeof globalMobs !== 'undefined') {
        for (let i = globalMobs.length - 1; i >= 0; i--) {
            const mob = globalMobs[i];
            if (mob.dead || mob.dying) {
                // Don't save dead/dying mobs, just clean them up
                if (mob.mesh) scene.remove(mob.mesh);
                if (mob.shadow) scene.remove(mob.shadow);
                continue;
            }
            // Save mob data
            savedMobs.push({
                type: (mob instanceof Zombie) ? 'zombie' : 'pig',
                x: mob.x, y: mob.y, z: mob.z,
                health: mob.health || 20
            });
            // Remove from scene
            if (mob.mesh) scene.remove(mob.mesh);
            if (mob.shadow) scene.remove(mob.shadow);
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
    if (!window._dimensionSpawners) window._dimensionSpawners = { overworld: null, nether: null };
    if (typeof _spawnerRegistry !== 'undefined') {
        const spawnerData = [];
        for (const [key, data] of _spawnerRegistry) {
            spawnerData.push({ key, x: data.x, y: data.y, z: data.z, timer: data.timer, delayMin: data.delayMin, delayMax: data.delayMax });
        }
        window._dimensionSpawners[currentDimension] = spawnerData;
        _spawnerRegistry.clear();
    }

    if (currentDimension === 'overworld') {
        // --- SWITCH TO NETHER ---
        updateLoadingBar(5, 'Saving overworld...');
        await yieldToUI();

        overworldChunkStorage = chunkStorageArr;
        overworldGeneratedChunks = generatedChunksArr;
        overworldBiomeMap = biomeMap;

        if (!netherGenerated) {
            const total = CHUNKS_X * CHUNKS_Z;
            netherChunkStorage = new Array(total);
            for (let i = 0; i < total; i++) netherChunkStorage[i] = null;
            netherGeneratedChunks = new Uint8Array(total);
        }

        chunkStorageArr = netherChunkStorage;
        generatedChunksArr = netherGeneratedChunks;
        biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);
        currentDimension = 'nether';

        if (!netherGenerated) {
            updateLoadingBar(10, 'Generating Nether...');
            await yieldToUI();
            await generateNetherWorld();
            netherGenerated = true;
        }

        if (linkedDest) {
            // Existing link — teleport to linked nether portal
            // Ensure chunks around linked destination are generated
            const halfW = Math.floor(WORLD_WIDTH / 2);
            const halfD = Math.floor(WORLD_DEPTH / 2);
            const ldCX = Math.floor((linkedDest.x + halfW) / CHUNK_SIZE);
            const ldCZ = Math.floor((linkedDest.z + halfD) / CHUNK_SIZE);
            for (let dcx = ldCX - 3; dcx <= ldCX + 3; dcx++) {
                for (let dcz = ldCZ - 3; dcz <= ldCZ + 3; dcz++) {
                    if (dcx >= 0 && dcx < CHUNKS_X && dcz >= 0 && dcz < CHUNKS_Z) {
                        if (!_isChunkGenerated(dcx, dcz)) {
                            generateNetherChunkColumn(dcx, dcz);
                        }
                    }
                }
            }
            player.x = linkedDest.x + 0.5;
            player.y = linkedDest.y;
            player.z = linkedDest.z + 0.5;
        } else {
            // No link — spawn a new nether portal and register the link
            const destX = Math.floor(savedX);
            const destZ = Math.floor(savedZ);
            
            // Ensure nether chunks around the destination are generated
            const halfW = Math.floor(WORLD_WIDTH / 2);
            const halfD = Math.floor(WORLD_DEPTH / 2);
            const destCX = Math.floor((destX + halfW) / CHUNK_SIZE);
            const destCZ = Math.floor((destZ + halfD) / CHUNK_SIZE);
            const genRadius = 3; // Generate a small area around the destination
            for (let dcx = destCX - genRadius; dcx <= destCX + genRadius; dcx++) {
                for (let dcz = destCZ - genRadius; dcz <= destCZ + genRadius; dcz++) {
                    if (dcx >= 0 && dcx < CHUNKS_X && dcz >= 0 && dcz < CHUNKS_Z) {
                        if (!_isChunkGenerated(dcx, dcz)) {
                            generateNetherChunkColumn(dcx, dcz);
                        }
                    }
                }
            }
            
            const portalPos = _spawnNetherPortal(destX, destZ);
            
            player.x = portalPos.x + 0.5;
            player.y = portalPos.y;
            player.z = portalPos.z + 0.5;
            
            // Register the link
            if (entryPortal) {
                _registerPortalLink(entryPortal.x, entryPortal.y, entryPortal.z, portalPos.x, portalPos.y, portalPos.z);
            }
        }
        player.yaw = savedYaw;
        player.pitch = savedPitch;

    } else {
        // --- SWITCH TO OVERWORLD ---
        updateLoadingBar(5, 'Saving Nether...');
        await yieldToUI();

        netherChunkStorage = chunkStorageArr;
        netherGeneratedChunks = generatedChunksArr;

        chunkStorageArr = overworldChunkStorage;
        generatedChunksArr = overworldGeneratedChunks;
        biomeMap = overworldBiomeMap;
        currentDimension = 'overworld';

        if (linkedDest) {
            // Existing link — teleport to linked overworld portal
            // Ensure chunks around linked destination are generated
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
            // No link found — spawn a new overworld portal and register it
            const destX = Math.floor(savedX);
            const destZ = Math.floor(savedZ);
            
            // Ensure overworld chunks around destination are generated (for lazy-gen worlds)
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
            
            if (entryPortal) {
                _registerPortalLink(portalPos.x, portalPos.y, portalPos.z, entryPortal.x, entryPortal.y, entryPortal.z);
            }
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
    // Search from middle of nether upward for a 2-tall air pocket
    for (let y = 30; y < NETHER_HEIGHT - 10; y++) {
        const b0 = getVoxel(Math.floor(x), y, Math.floor(z)) & 0xFF;
        const b1 = getVoxel(Math.floor(x), y + 1, Math.floor(z)) & 0xFF;
        const bBelow = getVoxel(Math.floor(x), y - 1, Math.floor(z)) & 0xFF;
        if (b0 === 0 && b1 === 0 && bBelow !== 0 && !isFluidBlock(bBelow)) {
            return y;
        }
    }
    // Fallback: carve out a space
    const fy = 40;
    for (let dy = 0; dy < 3; dy++) {
        setVoxel(Math.floor(x), fy + dy, Math.floor(z), 0);
    }
    setVoxel(Math.floor(x), fy - 1, Math.floor(z), 87);
    return fy;
}

// Spawn a portal structure in the nether at given overworld coords
function _spawnNetherPortal(ox, oz) {
    const px = Math.floor(ox);
    const pz = Math.floor(oz);
    const py = _findNetherSpawnY(px, pz);

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
// SPAWNER BLOCK SYSTEM