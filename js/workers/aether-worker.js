// ============================================================
// AETHER WORLDGEN WEB WORKER
// ============================================================
// Background-thread chunk generator for the Aether dimension.
// Mirrors the architecture of nether-worker.js (which mirrors
// worldgen-worker.js for the overworld).
//
// Aether is a bit more complex than nether:
//   - It writes to biomeMap (3 biomes: aether_skyforest, aether_void, aether_lake)
//   - It uses isCrossBlock from block-helpers (we shim it locally)
//   - It generates trees and decorations that can overflow into neighbors
//
// What this worker does NOT do:
//   - Capture mob spawns (aether doesn't spawn mobs during gen)
//   - Capture spawners or loot chests (no aether structures)
// ============================================================

// ----- Constants (must match main thread) -----
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 256;
let WORLD_WIDTH = 0;
let WORLD_DEPTH = 0;
let CHUNKS_X = 0;
let CHUNKS_Z = 0;
let CHUNK_VOLUME = 0;
let _halfW = 0;
let _halfD = 0;

// World seed (set on init)
let _worldSeed = 0;

// ----- Aether-specific gen settings -----
// Defaults match menu.js so `typeof X !== 'undefined'` guards work.
let GEN_AETHER_ISLAND_DENSITY = 130;
let GEN_AETHER_ISLAND_SIZE = 180;
let GEN_AETHER_ISLAND_HEIGHT = 180;
let GEN_AETHER_TREE_DENSITY = 100;
let GEN_AETHER_GRASS_DENSITY = 100;
let GEN_AETHER_SMOOTHNESS = 130;
let GEN_AETHER_VOLATILITY = 100;
let GEN_AETHER_CAVE_SIZE = 120;
let GEN_AETHER_CAVE_DENSITY = 50;
let GEN_AETHER_ENABLED = true;
// Superflat preset (aether checks GEN_WORLD_TYPE / GEN_SUPERFLAT_PRESET)
let GEN_WORLD_TYPE = 0;
let GEN_SUPERFLAT_PRESET = 'classic';

// ----- Worker-local state -----
let _workerChunk = null;
let _workerChunkCx = 0;
let _workerChunkCz = 0;
let _workerChunkStartX = 0;
let _workerChunkStartZ = 0;
let _workerGenerated = false;
// Cross-chunk overflow writes (e.g. tree leaves spilling into neighbors)
let _workerOverflow = [];
// Per-chunk biome strip — captures all biomeMap[gIdx] = name writes that
// fall within this chunk's footprint. Indexed lx + lz*16. Encoded as small
// integer ID for transfer.
let _workerBiomes = null;

// ----- Shimmed globals -----

// biomeMap: aether.js writes biomeMap[gIdx] = name in its dense biome write
// loop. Those writes are harmless here — we don't need them, because the
// authoritative biome data is in chunkBiomeCache (populated by aether.js's
// _computeAetherChunkBiomeData). After gen finishes, we read the cache and
// pack the dense Uint8Array directly into _workerBiomes for transfer.
// This mirrors the overworld worker's pattern in worldgen-worker.js.
const biomeMap = {};

const dirtyChunks = { add() {}, has() { return false; }, delete() {}, clear() {}, size: 0 };

// Mob/structure stubs — aether doesn't generate any during gen
const globalMobs = [];
function _isPassiveMob() { return true; }
const MOB_CAP_PASSIVE = 1000000;
function spawnMob() {}
const window = {
    registerSpawner() {},
    fillLootChest() {}
};

// Dimension marker
const currentDimension = 'aether';

// ----- Block-helper LUTs (aether uses isCrossBlock) -----
// Same LUT contents as the overworld worker. Cross blocks are flowers,
// grass, saplings, mushrooms, etc. — small decorative blocks.
const _crossLUT = new Uint8Array(256);
_crossLUT[16] = 1; _crossLUT[23] = 1; _crossLUT[24] = 1; _crossLUT[26] = 1;
_crossLUT[42] = 1; _crossLUT[52] = 1; _crossLUT[53] = 1; _crossLUT[89] = 1;
_crossLUT[212] = 1; _crossLUT[213] = 1;
_crossLUT[116] = 1; _crossLUT[117] = 1; _crossLUT[118] = 1; _crossLUT[137] = 1;
function isCrossBlock(id) { return _crossLUT[id]; }

const _fluidLUT = new Uint8Array(256);
_fluidLUT[4] = 1; _fluidLUT[27] = 1;
function isFluidBlock(id) { return _fluidLUT[id]; }

function isSnowLayer(id) { return id === 40; }

// ----- Worker-local chunk storage helpers -----

function _isChunkGenerated(cx, cz) {
    return cx === _workerChunkCx && cz === _workerChunkCz && _workerGenerated;
}
function _markChunkGenerated(cx, cz) {
    _workerGenerated = true;
}
function _getChunkFast(cx, cz) {
    if (cx === _workerChunkCx && cz === _workerChunkCz) return _workerChunk;
    return null;
}
function _getOrCreateChunkFast(cx, cz) {
    if (cx === _workerChunkCx && cz === _workerChunkCz) return _workerChunk;
    return null;
}

function setVoxel(x, y, z, id, level = 0, falling = 0, source = 0) {
    const lx = (x | 0) - _workerChunkStartX;
    const lz = (z | 0) - _workerChunkStartZ;
    const ly = y | 0;
    if (ly < 0 || ly >= WORLD_HEIGHT) return;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
        // Cross-chunk write — capture for main thread to apply
        _workerOverflow.push((x | 0), ly, (z | 0), id, level, falling, source);
        return;
    }
    const li = lx + (ly << 4) + (lz << 12);
    const lightBits = _workerChunk[li] & 0x003FC000;
    _workerChunk[li] = id | (level << 8) | (falling << 12) | (source << 13) | lightBits;
}

function getVoxel(x, y, z) {
    const lx = (x | 0) - _workerChunkStartX;
    const lz = (z | 0) - _workerChunkStartZ;
    const ly = y | 0;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
    if (ly < 0 || ly >= WORLD_HEIGHT) return 0;
    return _workerChunk[lx + (ly << 4) + (lz << 12)];
}

function getVoxelIndex(x, y, z) {
    return -1;
}

function getHighestBlock(x, z) {
    const lx = (x | 0) - _workerChunkStartX;
    const lz = (z | 0) - _workerChunkStartZ;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
    const baseIdx = lx + (lz << 12);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = _workerChunk[baseIdx + (y << 4)] & 0xFF;
        if (id !== 0 && id !== 16 && id !== 17 && id !== 23 && id !== 24 &&
            id !== 26 && id !== 27 && id !== 42 && id !== 66 && id !== 67 &&
            id !== 116 && id !== 117 && id !== 118 && id !== 64 && id !== 202) {
            return y;
        }
    }
    return 0;
}

// ----- Stubs for things this worker doesn't run -----
function simulateChunkFluids() {}
function simulateAetherFluids() {}
function generateChunkColumn() {}
function generateNetherChunkColumn() {}
function _initWorldGenNoise() {}
function _initNetherNoise() {}
let _netherNoise1 = null;
const updateWaterQueue = { clear() {}, add() {} };
const updateLavaQueue = { clear() {}, add() {} };
const chunkBiomeCache = new Map();
// Aether constants used in display code only — provide so importScripts doesn't crash
let useLazyGeneration = true;
function updateLoadingBar() {}
async function yieldToUI() {}

// ----- Load source files -----
try {
    importScripts(
        '../world/noise.js',
        '../worldgen/aether.js'
    );
} catch (e) {
    self.postMessage({ type: 'error', error: 'importScripts failed: ' + e.message + '\n' + (e.stack || '') });
    throw e;
}

// ----- Message handler -----
self.onmessage = function(ev) {
    const msg = ev.data;
    
    if (msg.type === 'init') {
        WORLD_WIDTH = msg.WORLD_WIDTH;
        WORLD_DEPTH = msg.WORLD_DEPTH;
        CHUNKS_X = msg.CHUNKS_X;
        CHUNKS_Z = msg.CHUNKS_Z;
        CHUNK_VOLUME = msg.CHUNK_VOLUME;
        _halfW = WORLD_WIDTH / 2;
        _halfD = WORLD_DEPTH / 2;
        _worldSeed = msg.worldSeed;
        applySettings(msg.settings || {});
        _initAetherNoise();
        self.postMessage({ type: 'initDone' });
        return;
    }
    
    if (msg.type === 'updateSettings') {
        applySettings(msg.settings || {});
        if (msg.reinitNoise) _initAetherNoise();
        return;
    }
    
    if (msg.type === 'gen') {
        const cx = msg.cx, cz = msg.cz;
        
        _workerChunkCx = cx;
        _workerChunkCz = cz;
        _workerChunkStartX = cx * CHUNK_SIZE - _halfW;
        _workerChunkStartZ = cz * CHUNK_SIZE - _halfD;
        _workerChunk = new Int32Array(CHUNK_VOLUME);
        _workerBiomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        _workerOverflow.length = 0;
        _workerGenerated = false;
        
        let errMsg = null;
        try {
            // Run the actual aether worldgen — same code as main thread.
            // It populates chunkBiomeCache via _computeAetherChunkBiomeData.
            generateAetherChunkColumn(cx, cz);
            
            // Pull the dense biome array out of the cache (mirrors overworld
            // worker pattern in worldgen-worker.js lines 296-301).
            const cacheKey = 'aether:' + cx + ',' + cz;
            if (typeof chunkBiomeCache !== 'undefined' && chunkBiomeCache.has(cacheKey)) {
                const data = chunkBiomeCache.get(cacheKey);
                _workerBiomes.set(data.biomes);
                chunkBiomeCache.delete(cacheKey);
            }
        } catch (e) {
            errMsg = e.message + '\n' + (e.stack || '');
        }
        
        if (errMsg) {
            self.postMessage({ type: 'genError', cx, cz, error: errMsg });
            return;
        }
        
        const chunkBuf = _workerChunk.buffer;
        const biomesBuf = _workerBiomes.buffer;
        const overflow = _workerOverflow.slice();
        
        _workerChunk = null;
        _workerBiomes = null;
        
        self.postMessage({
            type: 'genDone',
            cx, cz,
            chunkBuf,
            biomesBuf,
            overflow
        }, [chunkBuf, biomesBuf]);
        return;
    }
};

function applySettings(s) {
    if ('GEN_AETHER_ISLAND_DENSITY' in s) GEN_AETHER_ISLAND_DENSITY = s.GEN_AETHER_ISLAND_DENSITY;
    if ('GEN_AETHER_ISLAND_SIZE' in s) GEN_AETHER_ISLAND_SIZE = s.GEN_AETHER_ISLAND_SIZE;
    if ('GEN_AETHER_ISLAND_HEIGHT' in s) GEN_AETHER_ISLAND_HEIGHT = s.GEN_AETHER_ISLAND_HEIGHT;
    if ('GEN_AETHER_TREE_DENSITY' in s) GEN_AETHER_TREE_DENSITY = s.GEN_AETHER_TREE_DENSITY;
    if ('GEN_AETHER_GRASS_DENSITY' in s) GEN_AETHER_GRASS_DENSITY = s.GEN_AETHER_GRASS_DENSITY;
    if ('GEN_AETHER_SMOOTHNESS' in s) GEN_AETHER_SMOOTHNESS = s.GEN_AETHER_SMOOTHNESS;
    if ('GEN_AETHER_VOLATILITY' in s) GEN_AETHER_VOLATILITY = s.GEN_AETHER_VOLATILITY;
    if ('GEN_AETHER_CAVE_SIZE' in s) GEN_AETHER_CAVE_SIZE = s.GEN_AETHER_CAVE_SIZE;
    if ('GEN_AETHER_CAVE_DENSITY' in s) GEN_AETHER_CAVE_DENSITY = s.GEN_AETHER_CAVE_DENSITY;
    if ('GEN_AETHER_ENABLED' in s) GEN_AETHER_ENABLED = s.GEN_AETHER_ENABLED;
    if ('GEN_WORLD_TYPE' in s) GEN_WORLD_TYPE = s.GEN_WORLD_TYPE;
    if ('GEN_SUPERFLAT_PRESET' in s) GEN_SUPERFLAT_PRESET = s.GEN_SUPERFLAT_PRESET;
}
