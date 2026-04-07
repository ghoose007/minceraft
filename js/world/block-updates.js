// ==========================================
// BLOCK UPDATE SYSTEM
// ==========================================

function doBlockUpdate(x, y, z) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id === 0) return; // Air doesn't need updates

    if (!checkSupport(x, y, z)) {
        // Existing logic for breaking unsupported blocks (torches, grass, etc.)
        if (typeof spawnBlockDrops === 'function') spawnBlockDrops(id, x, y, z, val);
        spawnParticles(x, y, z, id);
        setVoxel(x, y, z, 0);
        queueNeighbors(x, y, z);
        checkGravity(x, y + 1, z);
        pendingBlockUpdates.push({x, y, z}); 
        triggerNeighborUpdates(x, y, z); 
        // Notify redstone system if a redstone component was broken
        if ((id === 202 || id === 203 || id === 205 || id === 206) && typeof window.onRedstoneBlockChanged === 'function') {
            window.onRedstoneBlockChanged(x, y, z);
        }
    } else {
        // NEW: If the block is sand (15) or gravel (5), check if it needs to fall
        // This ensures floating gravity blocks fall if a neighbor block is broken
        if ((id === 15 || id === 5) && typeof checkGravity === 'function') {
            checkGravity(x, y, z);
        }
    }
}

function triggerNeighborUpdates(x, y, z) {
    const dirs = [[0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1]];
    for (let [dx, dy, dz] of dirs) {
        doBlockUpdate(x + dx, y + dy, z + dz);
    }
}
