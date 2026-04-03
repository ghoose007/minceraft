// ==========================================
// FLUID-BLOCK INTERACTION
// ==========================================

function checkFluidInteraction(x, y, z) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id !== 4 && id !== 27) return false;
    
    const isSource = (val >> 13) & 0x1;
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    
    if (id === 27) {
        // THIS block is lava — check if any neighbor is water
        for (const [dx, dy, dz] of dirs) {
            const nVal = getVoxel(x+dx, y+dy, z+dz);
            const nId = nVal & 0xFF;
            if (nId === 4) {
                if (isSource) {
                    // Lava SOURCE touched by water → lava becomes obsidian
                    setVoxel(x, y, z, 28);
                    pendingBlockUpdates.push({x, y, z});
                    queueNeighbors(x, y, z);
                    if (typeof window.playFizzSound === 'function') window.playFizzSound(x, y, z);
                    return true; // lava block was destroyed
                } else {
                    // FLOWING lava touched by water → water becomes cobblestone, lava survives
                    setVoxel(x+dx, y+dy, z+dz, 33); // cobblestone replaces the water
                    pendingBlockUpdates.push({x: x+dx, y: y+dy, z: z+dz});
                    queueNeighbors(x+dx, y+dy, z+dz);
                    if (typeof window.playFizzSound === 'function') window.playFizzSound(x+dx, y+dy, z+dz);
                    // Don't return — lava survives and should continue flowing
                }
            }
        }
    }
    
    if (id === 4) {
        // THIS block is water — check if any neighbor is lava
        for (const [dx, dy, dz] of dirs) {
            const nVal = getVoxel(x+dx, y+dy, z+dz);
            const nId = nVal & 0xFF;
            if (nId === 27) {
                const nSource = (nVal >> 13) & 0x1;
                if (nSource) {
                    // Water touching lava SOURCE → lava becomes obsidian
                    setVoxel(x+dx, y+dy, z+dz, 28);
                } else {
                    // Water touching FLOWING lava → lava becomes cobblestone
                    setVoxel(x+dx, y+dy, z+dz, 33);
                }
                if (typeof window.playFizzSound === 'function') window.playFizzSound(x+dx, y+dy, z+dz);
                pendingBlockUpdates.push({x: x+dx, y: y+dy, z: z+dz});
                queueLavaNeighbors(x+dx, y+dy, z+dz);
                queueNeighbors(x+dx, y+dy, z+dz);
                return false; // water itself survives
            }
        }
    }
    
    return false;
}

const MAX_LIGHT_QUEUE = 2000000;
const sunQueueX = new Int16Array(MAX_LIGHT_QUEUE);
const sunQueueY = new Int16Array(MAX_LIGHT_QUEUE);
const sunQueueZ = new Int16Array(MAX_LIGHT_QUEUE);
const sunQueueL = new Uint8Array(MAX_LIGHT_QUEUE);
const torchQueueX = new Int16Array(MAX_LIGHT_QUEUE);
const torchQueueY = new Int16Array(MAX_LIGHT_QUEUE);
const torchQueueZ = new Int16Array(MAX_LIGHT_QUEUE);
const torchQueueL = new Uint8Array(MAX_LIGHT_QUEUE);

const oldLightCache = new Int32Array(32 * 32 * 256);