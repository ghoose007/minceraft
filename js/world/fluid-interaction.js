// ==========================================
// FLUID-BLOCK INTERACTION
// ==========================================

function _fluidFizz(x, y, z) {
    if (typeof window.playFizzSound === 'function') window.playFizzSound(x, y, z);
}

function _fluidMarkChanged(x, y, z) {
    pendingBlockUpdates.push({x, y, z});
    if (typeof queueNeighbors === 'function') queueNeighbors(x, y, z);
    if (typeof queueLavaNeighbors === 'function') queueLavaNeighbors(x, y, z);
    if (typeof updateWaterQueue !== 'undefined') updateWaterQueue.add(getVoxelIndex(x, y, z));
    if (typeof updateLavaQueue !== 'undefined') updateLavaQueue.add(getVoxelIndex(x, y, z));
}

// Minecraft-like liquid mixing:
// - Water touching lava source converts that lava source to obsidian.
// - Water touching flowing lava converts that flowing lava to cobblestone.
// - Lava flowing into a water source converts the water source to stone.
// - Flowing lava meeting flowing water converts the flowing lava to cobblestone.
// The important part is that lava-source obsidian and water-source stone are
// source-sensitive, while flowing/flowing contact is cobblestone.
function checkFluidInteraction(x, y, z) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id !== 4 && id !== 27) return false;

    const isSource = ((val >> 13) & 0x1) === 1;
    const dirs = [[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]];

    if (id === 4) {
        // Water updates are the water-driven side of the rules. Water converts
        // the lava block it touches; water itself survives.
        for (const [dx, dy, dz] of dirs) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            const nVal = getVoxel(nx, ny, nz);
            if ((nVal & 0xFF) !== 27) continue;

            const lavaSource = ((nVal >> 13) & 0x1) === 1;
            setVoxel(nx, ny, nz, lavaSource ? 28 : 33);
            _fluidFizz(nx, ny, nz);
            _fluidMarkChanged(nx, ny, nz);
            return false; // current water block survives
        }
        return false;
    }

    // Lava updates are the lava-driven side of the rules.
    if (id === 27) {
        for (const [dx, dy, dz] of dirs) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            const nVal = getVoxel(nx, ny, nz);
            if ((nVal & 0xFF) !== 4) continue;

            const waterSource = ((nVal >> 13) & 0x1) === 1;
            if (isSource) {
                // Source lava touching water is obsidian.
                setVoxel(x, y, z, 28);
                _fluidFizz(x, y, z);
                _fluidMarkChanged(x, y, z);
                return true; // current lava block was replaced
            }

            if (waterSource) {
                // Flowing lava into a water source makes stone at the water.
                setVoxel(nx, ny, nz, 3);
                _fluidFizz(nx, ny, nz);
                _fluidMarkChanged(nx, ny, nz);
                return false; // flowing lava survives for normal decay/flow
            }

            // Flowing lava + flowing water makes cobblestone, replacing lava.
            setVoxel(x, y, z, 33);
            _fluidFizz(x, y, z);
            _fluidMarkChanged(x, y, z);
            return true; // current lava block was replaced
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