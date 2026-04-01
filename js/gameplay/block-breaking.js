// ==========================================
// BLOCK BREAKING & DROPS
// ==========================================

window.isLeftMouseHeld = false;

// --- GLOBAL DROP LOGIC (For Player Breaks AND Leaf Decay) ---
window.spawnBlockDrops = function(targetId, x, y, z, val) {
    if (typeof gameMode !== 'undefined' && gameMode === 'creative') return;
    if (typeof window.spawnDroppedItem !== 'function') return;

    let dropId = BLOCK_DATA[targetId] && BLOCK_DATA[targetId].dropId !== undefined ? BLOCK_DATA[targetId].dropId : targetId;
    
    // Custom Leaf Drops
    if (targetId === 14) { 
        dropId = 0;
        const r = Math.random();
        if (r < 0.05) dropId = 116; 
        else if (r < 0.10) dropId = 115; 
    } else if (targetId === 43) { 
        dropId = 0;
        const r = Math.random();
        if (r < 0.05) dropId = 117; 
        else if (r < 0.10) dropId = 115; 
    } else if (targetId === 22) { 
        dropId = Math.random() < 0.05 ? 118 : 0; 
    } else if (targetId === 97) { 
        dropId = 0;
        const r = Math.random();
        if (r < 0.04) dropId = 137; // Jungle sapling (rarer than oak, like MC)
        else if (r < 0.08) dropId = 115; // Apple
    } else if (targetId === 61) { 
        dropId = 0; 
        for (let i = 0; i < 4; i++) {
            window.spawnDroppedItem(x + 0.5, y + 0.5, z + 0.5, 120);
        }
    } 
    // ---> NEW: Wheat Crop Drops <---
    else if (targetId === 64) { 
        dropId = 0;
        const stage = val !== undefined ? ((val >> 8) & 0x7) : 0;
        if (stage >= 7) {
            // Fully Matured: Drop 1 Wheat and 1-3 Seeds
            window.spawnDroppedItem(x + 0.5, y + 0.5, z + 0.5, 129); 
            const seeds = 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < seeds; i++) window.spawnDroppedItem(x + 0.5, y + 0.5, z + 0.5, 128);
        } else {
            // Premature: Drop 1 Seed
            window.spawnDroppedItem(x + 0.5, y + 0.5, z + 0.5, 128);
        }
    }

    if (targetId === 16) { 
        if (Math.random() < 0.15) dropId = 128; 
        else dropId = 0;
    }
    
    // Door: only bottom half drops the item
    if (targetId === 149) {
        const isTopHalf = (val >> 11) & 0x1;
        if (isTopHalf) dropId = 0;
    }

    // Lapis Ore: drops 4-9 lapis lazuli (MC-accurate)
    if (targetId === 50) {
        dropId = 0;
        const count = 4 + Math.floor(Math.random() * 6); // 4-9
        for (let i = 0; i < count; i++) {
            window.spawnDroppedItem(x + 0.5, y + 0.5, z + 0.5, 199);
        }
    }

    if (dropId !== 0) {
        window.spawnDroppedItem(x + 0.5, y + 0.5, z + 0.5, dropId);
    }

    // --- XP from ore blocks ---
    if (typeof window.spawnOreBreakXP === 'function') {
        window.spawnOreBreakXP(x, y, z, targetId);
    }
};

// --- GLOBAL BLOCK BREAK FUNCTION ---
window.breakBlock = function(x, y, z, canHarvest = true) {
    const val = getVoxel(x, y, z);
    const targetId = val & 0xFF;
    if (targetId === 18 || targetId === 0 || targetId === 90) return;

    if (targetId === 60 && typeof forceCloseStructure === 'function') {
        forceCloseStructure(x, y, z);
    }

    // Unregister spawner when broken
    if (targetId === 54 && typeof window.unregisterSpawner === 'function') {
        window.unregisterSpawner(x, y, z);
    }

    // Loot chest broken — treat same as normal chest
    if ((targetId === 69 || targetId === 93) && typeof window.onChestBroken === 'function') {
        window.onChestBroken(x, y, z);
    }

    // Door broken — remove the other half too
    if (targetId === 149) {
        const isTopHalf = (val >> 11) & 0x1;
        const otherY = isTopHalf ? y - 1 : y + 1;
        const otherVal = getVoxel(x, otherY, z);
        if ((otherVal & 0xFF) === 149) {
            setVoxel(x, otherY, z, 0);
            pendingBlockUpdates.push({x, y: otherY, z});
            triggerNeighborUpdates(x, otherY, z);
        }
    }

    if (typeof spawnParticles === 'function') spawnParticles(x, y, z, targetId);
    
    // Ice breaks into water source (MC behavior)
    if (targetId === 95) {
        setVoxel(x, y, z, 4, 8, 0, 1); // Water source block
        updateWaterQueue.add(getVoxelIndex(x, y, z));
        queueNeighbors(x, y, z);
    } else {
        setVoxel(x, y, z, 0);
    }
    
    queueNeighbors(x, y, z);
    checkGravity(x, y + 1, z); 
    pendingBlockUpdates.push({x, y, z});
    triggerNeighborUpdates(x, y, z);
    swingAnimation = 1.0;

    if (canHarvest) {
        window.spawnBlockDrops(targetId, x, y, z, val);
    }

    // If an obsidian block was broken, destroy any adjacent portal blocks (cascade)
    if (targetId === 28) {
        _destroyAdjacentPortals(x, y, z);
    }
};

// Flood-fill destroy all connected portal blocks when a frame block breaks
function _destroyAdjacentPortals(ox, oy, oz) {
    const queue = [];
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    // Check all 6 neighbors of the broken block for portal blocks
    for (const [dx, dy, dz] of dirs) {
        const nx = ox + dx, ny = oy + dy, nz = oz + dz;
        if ((getVoxel(nx, ny, nz) & 0xFF) === 90) {
            queue.push([nx, ny, nz]);
        }
    }
    // Flood-fill destroy all connected portal blocks
    const visited = new Set();
    while (queue.length > 0) {
        const [px, py, pz] = queue.pop();
        const key = `${px},${py},${pz}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if ((getVoxel(px, py, pz) & 0xFF) !== 90) continue;
        if (typeof spawnParticles === 'function') spawnParticles(px, py, pz, 90);
        setVoxel(px, py, pz, 0);
        pendingBlockUpdates.push({x: px, y: py, z: pz});
        for (const [dx, dy, dz] of dirs) {
            queue.push([px + dx, py + dy, pz + dz]);
        }
    }
}

// --- NEW GLOBAL TOSS FUNCTION ---
window.tossItem = function(id, count, durability) {
    if (!id || count <= 0) return;
    
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    
    const throwForce = 2.0; 
    const vx = (player.vx * 0.5) + (dir.x * throwForce); 
    const vy = (dir.y * throwForce * 0.5) + 2.0; 
    const vz = (player.vz * 0.5) + (dir.z * throwForce);

    const spawnX = player.x + (dir.x * 0.6);
    const spawnY = player.y + player.eyeLevel - 0.2;
    const spawnZ = player.z + (dir.z * 0.6);

    if (typeof window.spawnDroppedItem === 'function') {
        window.spawnDroppedItem(spawnX, spawnY, spawnZ, id, count, vx, vy, vz);
        // Carry durability to the dropped item
        if (durability !== undefined && droppedItems.length > 0) {
            droppedItems[droppedItems.length - 1].durability = durability;
        }
        if (typeof window.playItemSound === 'function') window.playItemSound(0.3);
    }
};
