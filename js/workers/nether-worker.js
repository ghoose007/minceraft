// ============================================================
// NETHER WORLDGEN WEB WORKER
// ============================================================
// Background-thread chunk generator for the Nether dimension.
// Mirrors the architecture of worldgen-worker.js (which handles
// the overworld), but importScripts the Nether-specific source.
//
// Strategy: shim all the globals that nether.js expects (setVoxel,
// getVoxel, _markChunkGenerated, NETHER_HEIGHT, GEN_NETHER_*, etc.)
// to operate on a worker-local single-chunk Int32Array, then run
// generateNetherChunkColumn(cx, cz). The result is transferred
// back to the main thread via Transferable.
//
// What this worker does NOT do:
//   - Compute biomes (the nether has none — biomeMap is left blank)
//   - Capture mob spawns (nether mobs are spawned by mob-spawning.js
//     on the main thread, not by chunk gen)
//   - Capture spawners or loot chests (no nether structures yet)
// ============================================================

// ----- Constants (must match main thread) -----
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 256;
const NETHER_HEIGHT = 128;
let WORLD_WIDTH = 0;     // Set on init from main thread
let WORLD_DEPTH = 0;
let CHUNKS_X = 0;
let CHUNKS_Z = 0;
let CHUNK_VOLUME = 0;
let _halfW = 0;
let _halfD = 0;

// World seed (set on init)
let _worldSeed = 0;

// ----- Nether-specific gen settings -----
// All have sensible defaults so nether.js's `typeof X !== 'undefined'`
// guards still work even if the main thread doesn't send them.
let GEN_NETHER_LAVA_LEVEL = 31;
let GEN_NETHER_OPENNESS = 100;
let GEN_NETHER_GLOW = 100;
let GEN_NETHER_FIRE = 100;
let GEN_NETHER_SOULSAND = 100;
let GEN_NETHER_LAVAFALLS = 100;
let GEN_NETHER_GRAVEL = 100;
let GEN_NETHER_QUARTZ = 100;
// Superflat preset settings nether.js may check
let GEN_WORLD_TYPE = 0;
let GEN_SUPERFLAT_PRESET = 'classic';

// ----- Worker-local state -----
// One chunk in memory at a time — the one currently being generated.
let _workerChunk = null;
let _workerChunkCx = 0;
let _workerChunkCz = 0;
let _workerChunkStartX = 0;
let _workerChunkStartZ = 0;
let _workerGenerated = false;
// Cross-chunk overflow writes (e.g. structures or features that extend
// past the chunk boundary). Nether doesn't currently have any but we
// capture them anyway in case future features add them.
let _workerOverflow = [];

// ----- Shimmed globals that nether.js (or its dependencies) reference -----

// biomeMap: nether.js doesn't write to it but importScripts'd files might
// (defensively). Use a Proxy that no-ops everything.
const biomeMap = new Proxy({}, {
    set: function() { return true; },
    get: function() { return undefined; }
});

// dirtyChunks stub
const dirtyChunks = { add() {}, has() { return false; }, delete() {}, clear() {}, size: 0 };

// Mob spawning stubs — nether worldgen doesn't spawn mobs, but if any
// imported code references these defensively we need them present.
const globalMobs = [];
function _isPassiveMob() { return true; }
const MOB_CAP_PASSIVE = 1000000;
function spawnMob() { /* nether worldgen doesn't spawn mobs */ }

// Dimension — this worker only handles nether.
const currentDimension = 'nether';

// window shim for any code that references it
const window = {
    registerSpawner() { /* no nether structures */ },
    fillLootChest() { /* no nether structures */ }
};

// ----- Worker-local chunk storage helpers -----
// Single-chunk operations. Out-of-bounds reads return 0; out-of-bounds
// writes go to the overflow buffer.

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
    // Used by fluid sim — we don't run fluid sim in worker
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

// ----- Stubs for things that exist in main thread but worker doesn't run -----
// Fluid simulation runs on main thread, not in worker
function simulateChunkFluids() {}
function simulateAetherFluids() {}
// Aether/Overworld functions referenced from other modules but not used here
function generateChunkColumn() {}
function generateAetherChunkColumn() {}
function _initWorldGenNoise() {}
function _initAetherNoise() {}
let _aetherNoise1 = null;
const updateWaterQueue = { clear() {}, add() {} };
const updateLavaQueue = { clear() {}, add() {} };
// Biome cache — not used in nether but might be referenced
const chunkBiomeCache = new Map();

// v332 Fix C regression shim: see worldgen-worker.js for context.
function _enterWorldGen() {}
function _exitWorldGen() {}
function _isInWorldGen() { return true; }

// ----- Now load the source files -----
// Order matters: noise.js defines PerlinNoise (used by _initNetherNoise)
try {
    importScripts(
        '../world/noise.js',
        '../worldgen/nether.js'
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
        // Initialize nether noise instances using the world seed
        _initNetherNoise();
        self.postMessage({ type: 'initDone' });
        return;
    }
    
    if (msg.type === 'updateSettings') {
        applySettings(msg.settings || {});
        if (msg.reinitNoise) _initNetherNoise();
        return;
    }
    
    if (msg.type === 'gen') {
        const cx = msg.cx, cz = msg.cz;
        
        // Set up worker state for this chunk
        _workerChunkCx = cx;
        _workerChunkCz = cz;
        _workerChunkStartX = cx * CHUNK_SIZE - _halfW;
        _workerChunkStartZ = cz * CHUNK_SIZE - _halfD;
        _workerChunk = new Int32Array(CHUNK_VOLUME);
        _workerOverflow.length = 0;
        _workerGenerated = false;
        
        let errMsg = null;
        try {
            generateNetherChunkColumn(cx, cz);
        } catch (e) {
            errMsg = e.message + '\n' + (e.stack || '');
        }
        
        if (errMsg) {
            self.postMessage({ type: 'genError', cx, cz, error: errMsg });
            return;
        }
        
        // Send chunk back. Transfer the buffer for zero-copy.
        const chunkBuf = _workerChunk.buffer;
        const overflow = _workerOverflow.slice();
        
        // Release worker reference so the buffer can be transferred
        _workerChunk = null;
        
        self.postMessage({
            type: 'genDone',
            cx, cz,
            chunkBuf,
            overflow
        }, [chunkBuf]);
        return;
    }
};

function applySettings(s) {
    if ('GEN_NETHER_LAVA_LEVEL' in s) GEN_NETHER_LAVA_LEVEL = s.GEN_NETHER_LAVA_LEVEL;
    if ('GEN_NETHER_OPENNESS' in s) GEN_NETHER_OPENNESS = s.GEN_NETHER_OPENNESS;
    if ('GEN_NETHER_GLOW' in s) GEN_NETHER_GLOW = s.GEN_NETHER_GLOW;
    if ('GEN_NETHER_FIRE' in s) GEN_NETHER_FIRE = s.GEN_NETHER_FIRE;
    if ('GEN_NETHER_SOULSAND' in s) GEN_NETHER_SOULSAND = s.GEN_NETHER_SOULSAND;
    if ('GEN_NETHER_LAVAFALLS' in s) GEN_NETHER_LAVAFALLS = s.GEN_NETHER_LAVAFALLS;
    if ('GEN_NETHER_GRAVEL' in s) GEN_NETHER_GRAVEL = s.GEN_NETHER_GRAVEL;
    if ('GEN_NETHER_QUARTZ' in s) GEN_NETHER_QUARTZ = s.GEN_NETHER_QUARTZ;
    if ('GEN_WORLD_TYPE' in s) GEN_WORLD_TYPE = s.GEN_WORLD_TYPE;
    if ('GEN_SUPERFLAT_PRESET' in s) GEN_SUPERFLAT_PRESET = s.GEN_SUPERFLAT_PRESET;
}
