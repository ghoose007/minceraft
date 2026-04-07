// ============================================================
// WORLDGEN WEB WORKER
// ============================================================
// Runs the chunk generation pipeline in a background thread so
// the main thread stays responsive (60+ FPS) during chunk streaming.
//
// Strategy: this file is loaded in a Web Worker context. It defines
// a "shim" of all the globals that overworld.js expects (setVoxel,
// getVoxel, biomeMap, currentDimension, etc.) but operating on a
// worker-local single-chunk Int32Array. Then it importScripts() the
// existing worldgen source files which "just work" because their
// function calls resolve to our shim implementations.
//
// The worker generates one chunk at a time, then transfers the
// resulting Int32Array buffer back to the main thread (zero-copy).
// ============================================================

// ----- Constants (must match main thread) -----
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 256;
let WORLD_WIDTH = 0;     // Set on init from main thread
let WORLD_DEPTH = 0;
let CHUNKS_X = 0;
let CHUNKS_Z = 0;
let CHUNK_VOLUME = 0;
let _halfW = 0;
let _halfD = 0;

// Worldgen settings — synced from main thread on init / updateSettings
let _worldSeed = 0;
let GEN_WORLD_TYPE = 0;
let GEN_SUPERFLAT_PRESET = 'classic';
let GEN_SUPERFLAT_LAYERS = [];
let GEN_SEA_LEVEL = 63;
let GEN_TERRAIN_HEIGHT = 80;
let GEN_BIOME_SCALE = 300;
let GEN_SMOOTHNESS = 50;
let GEN_VOLATILITY_MULT = 100;
let GEN_TEMP_OFFSET = 0;
let GEN_HUMID_OFFSET = 0;
let GEN_SINGLE_BIOME = null;
let GEN_BIOME_OVERRIDES = {};
let GEN_TREE_DENSITY = 100;
let GEN_FOLIAGE_DENSITY = 100;
let GEN_STRUCTURES = true;
let GEN_CAVES = true;
let GEN_CAVE_DENSITY = 50;
let GEN_CAVE_MIN_Y = 2;
let GEN_CAVE_LAVA_Y = 6;
let GEN_CAVE_SIZE = 100;
let GEN_TUNNEL_FREQUENCY = 100;
let GEN_TUNNEL_LENGTH = 100;
let GEN_TUNNEL_RADIUS = 100;
let GEN_TUNNEL_MAX_Y = 80;
let GEN_TUNNEL_BRANCH = 50;
let GEN_RAVINE_FREQUENCY = 100;
let GEN_RAVINE_DEPTH = 100;
let GEN_RAVINE_WIDTH = 100;
let GEN_ORE_ABUNDANCE = 100;

// ----- Worker-local state -----
// Single chunk being generated right now. Worker writes here, then
// transfers it back to main thread.
let _workerChunk = null;
let _workerChunkCx = 0;
let _workerChunkCz = 0;
let _workerChunkStartX = 0;  // World X of chunk's lx=0
let _workerChunkStartZ = 0;
// Per-chunk biome assignment, indexed lx + lz*16. Stored as biome ID (0-9).
let _workerBiomes = null;
// Events collected during gen that the main thread will replay
let _workerSpawners = [];
let _workerChests = [];
let _workerMobs = [];
// Cross-chunk setVoxel writes (e.g. tree leaves extending into neighbor chunks).
// Stored as flat array of 7-tuples: [wx, wy, wz, id, level, falling, source, ...]
// The main thread applies these to whichever chunk they actually belong to.
let _workerOverflow = [];
// Marker to know if a chunk has been "generated" (the current one is, others are not)
let _workerGenerated = false;

// ----- Shims for main-thread globals overworld.js expects -----

// biomeMap stub: in main thread it's a giant world-coord-indexed array.
// In the worker we don't actually need to STORE these — we get the biome
// data we need from chunkBiomeCache after gen finishes. But overworld.js
// does writes like `biomeMap[gIdx] = BIOME_NAMES[...]`, so the assignment
// needs to not crash. We use a Proxy that no-ops all sets.
const biomeMap = new Proxy({}, {
    set: function() { return true; },  // Drop writes
    get: function() { return undefined; },  // Reads return undefined (overworld.js doesn't read biomeMap)
});

// dirtyChunks — only used in updateNearbyChunks which we don't call. Stub it.
const dirtyChunks = { add() {}, has() { return false; }, delete() {}, clear() {}, size: 0 };

// Mob spawning — overworld checks `typeof globalMobs !== 'undefined'`.
// If we leave it undefined, no passive mobs spawn from worker chunks (bad).
// Provide stubs that collect mob spawn events into _workerMobs.
const globalMobs = [];  // Empty array — passiveCount filter always returns 0
function _isPassiveMob(m) { return true; }
const MOB_CAP_PASSIVE = 1000000;  // Effectively unlimited — main thread enforces real cap
function spawnMob(type, x, y, z) {
    _workerMobs.push({ type, x, y, z });
}

// Dimension — worker only handles overworld. Set permanently.
const currentDimension = 'overworld';

// window shim for dungeon prefab paste callbacks
const window = {
    registerSpawner(x, y, z) { _workerSpawners.push({ x, y, z }); },
    fillLootChest(x, y, z) { _workerChests.push({ x, y, z }); }
};

// ----- Worker-local chunk storage helpers -----
// These replace _getChunkFast / _getOrCreateChunkFast / setVoxel / getVoxel etc.
// The worker only ever has ONE chunk in memory at a time (the one being
// generated). All voxel access is clamped to that chunk's bounds — out of
// bounds reads return 0, out of bounds writes are silently dropped.

function _isChunkGenerated(cx, cz) {
    // Only the chunk we're currently generating is "generated"
    return cx === _workerChunkCx && cz === _workerChunkCz && _workerGenerated;
}
function _markChunkGenerated(cx, cz) {
    // We assume only the current chunk gets marked
    _workerGenerated = true;
}
function _getChunkFast(cx, cz) {
    if (cx === _workerChunkCx && cz === _workerChunkCz) return _workerChunk;
    return null;
}
function _getOrCreateChunkFast(cx, cz) {
    if (cx === _workerChunkCx && cz === _workerChunkCz) return _workerChunk;
    return null;  // Out-of-chunk creates not allowed
}

// Voxel access — uses local chunk for in-bounds reads, returns 0 otherwise.
// All bounds checks use the current chunk's start coordinates.
function setVoxel(x, y, z, id, level = 0, falling = 0, source = 0) {
    const lx = (x | 0) - _workerChunkStartX;
    const lz = (z | 0) - _workerChunkStartZ;
    const ly = y | 0;
    if (ly < 0 || ly >= WORLD_HEIGHT) return;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
        // Cross-chunk write (e.g. tree leaves extending into neighbor).
        // Capture it in the overflow buffer so the main thread can apply it
        // to whichever chunk it actually belongs to.
        _workerOverflow.push((x | 0), ly, (z | 0), id, level, falling, source);
        return;
    }
    const li = lx + (ly << 4) + (lz << 12);
    // Preserve light bits if any (will be 0 here since we just allocated)
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
    // Used by fluid sim — we don't run fluid sim in worker, so this is unused.
    // Return -1 to be safe.
    return -1;
}

function getHighestBlock(x, z) {
    const lx = (x | 0) - _workerChunkStartX;
    const lz = (z | 0) - _workerChunkStartZ;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
    const baseIdx = lx + (lz << 12);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = _workerChunk[baseIdx + (y << 4)] & 0xFF;
        // Same skip-list as the main thread version
        if (id !== 0 && id !== 16 && id !== 17 && id !== 23 && id !== 24 &&
            id !== 26 && id !== 27 && id !== 42 && id !== 66 && id !== 67 &&
            id !== 116 && id !== 117 && id !== 118 && id !== 64 && id !== 202) {
            return y;
        }
    }
    return 0;
}

// ----- Block-helper LUTs (worldgen needs these) -----
const _fluidLUT = new Uint8Array(256);
_fluidLUT[4] = 1; _fluidLUT[27] = 1;
function isFluidBlock(id) { return _fluidLUT[id]; }

const _crossLUT = new Uint8Array(256);
_crossLUT[16] = 1; _crossLUT[23] = 1; _crossLUT[24] = 1; _crossLUT[26] = 1;
_crossLUT[42] = 1; _crossLUT[52] = 1; _crossLUT[53] = 1; _crossLUT[89] = 1;
_crossLUT[212] = 1; _crossLUT[213] = 1;
_crossLUT[116] = 1; _crossLUT[117] = 1; _crossLUT[118] = 1; _crossLUT[137] = 1;
function isCrossBlock(id) { return _crossLUT[id]; }

function isSnowLayer(id) { return id === 40; }

// ----- Stubs for things overworld.js calls but worker doesn't run -----
// These are only called if we generate nether/aether chunks (we don't).
function generateNetherChunkColumn() {}
function generateAetherChunkColumn() {}
function _initNetherNoise() {}
function _initAetherNoise() {}
let _netherNoise1 = null;
let _aetherNoise1 = null;
function simulateChunkFluids() {}
function simulateAetherFluids() {}

// updateWaterQueue/updateLavaQueue — referenced inside simulateChunkFluids
// (which we don't call) but defined at module level might be needed for parsing.
const updateWaterQueue = { clear() {} };
const updateLavaQueue = { clear() {} };

// ----- Now load the existing worldgen sources -----
// IMPORTANT: importScripts is synchronous. The order matters.
// noise.js defines PerlinNoise (used by noise-init.js)
// noise-init.js defines _initWorldGenNoise, _chunkSeededRandom, BIOME_IDS, BIOME_NAMES, _pastePrefabWorldGen, DUNGEON_0
// biomes.js defines _getRawBiome, _classifyBiome, _applyBiomeOverrides, _computeChunkBiomeData
// overworld.js defines generateChunkColumn, _generateNormalChunk, _generateSuperflatChunk
try {
    importScripts(
        '../world/noise.js',
        '../worldgen/noise-init.js',
        '../worldgen/biomes.js',
        '../worldgen/overworld.js'
    );
} catch (e) {
    // Send error back to main thread for debugging
    self.postMessage({ type: 'error', error: 'importScripts failed: ' + e.message + '\n' + (e.stack || '') });
    throw e;
}

// ----- Message handler -----
self.onmessage = function(ev) {
    const msg = ev.data;
    
    if (msg.type === 'init') {
        // Apply world dimensions and constants
        WORLD_WIDTH = msg.WORLD_WIDTH;
        WORLD_DEPTH = msg.WORLD_DEPTH;
        CHUNKS_X = msg.CHUNKS_X;
        CHUNKS_Z = msg.CHUNKS_Z;
        CHUNK_VOLUME = msg.CHUNK_VOLUME;
        _halfW = WORLD_WIDTH / 2;
        _halfD = WORLD_DEPTH / 2;
        _worldSeed = msg.worldSeed;
        
        // Apply gen settings
        applySettings(msg.settings);
        
        // Initialize Perlin instances with the world seed
        _initWorldGenNoise();
        
        self.postMessage({ type: 'initDone' });
        return;
    }
    
    if (msg.type === 'updateSettings') {
        applySettings(msg.settings);
        // Re-init noise if seed-affecting settings changed
        if (msg.reinitNoise) _initWorldGenNoise();
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
        _workerBiomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        _workerSpawners.length = 0;
        _workerChests.length = 0;
        _workerMobs.length = 0;
        _workerOverflow.length = 0;
        _workerGenerated = false;
        
        let errMsg = null;
        try {
            // Run the actual worldgen — same code that runs on main thread
            generateChunkColumn(cx, cz);
            
            // Capture biome data into _workerBiomes from the cache that
            // _computeChunkBiomeData populated
            const cacheKey = cx + ',' + cz;
            if (typeof chunkBiomeCache !== 'undefined' && chunkBiomeCache.has(cacheKey)) {
                const data = chunkBiomeCache.get(cacheKey);
                _workerBiomes.set(data.biomes);
                // Free the cache entry — we don't need it after gen
                chunkBiomeCache.delete(cacheKey);
            }
        } catch (e) {
            errMsg = e.message + '\n' + (e.stack || '');
        }
        
        if (errMsg) {
            self.postMessage({ type: 'genError', cx, cz, error: errMsg });
            return;
        }
        
        // Send chunk back to main thread. Transfer the buffer (zero-copy).
        const chunkBuf = _workerChunk.buffer;
        const biomesBuf = _workerBiomes.buffer;
        // Copy mob/spawner/chest events + overflow writes (small arrays, ok to clone)
        const mobs = _workerMobs.slice();
        const spawners = _workerSpawners.slice();
        const chests = _workerChests.slice();
        const overflow = _workerOverflow.slice();
        
        // Release worker references so the buffers can be transferred
        _workerChunk = null;
        _workerBiomes = null;
        
        self.postMessage({
            type: 'genDone',
            cx, cz,
            chunkBuf,
            biomesBuf,
            mobs,
            spawners,
            chests,
            overflow
        }, [chunkBuf, biomesBuf]);
        return;
    }
};

function applySettings(s) {
    if ('GEN_WORLD_TYPE' in s) GEN_WORLD_TYPE = s.GEN_WORLD_TYPE;
    if ('GEN_SUPERFLAT_PRESET' in s) GEN_SUPERFLAT_PRESET = s.GEN_SUPERFLAT_PRESET;
    if ('GEN_SUPERFLAT_LAYERS' in s) GEN_SUPERFLAT_LAYERS = s.GEN_SUPERFLAT_LAYERS;
    if ('GEN_SEA_LEVEL' in s) GEN_SEA_LEVEL = s.GEN_SEA_LEVEL;
    if ('GEN_TERRAIN_HEIGHT' in s) GEN_TERRAIN_HEIGHT = s.GEN_TERRAIN_HEIGHT;
    if ('GEN_BIOME_SCALE' in s) GEN_BIOME_SCALE = s.GEN_BIOME_SCALE;
    if ('GEN_SMOOTHNESS' in s) GEN_SMOOTHNESS = s.GEN_SMOOTHNESS;
    if ('GEN_VOLATILITY_MULT' in s) GEN_VOLATILITY_MULT = s.GEN_VOLATILITY_MULT;
    if ('GEN_TEMP_OFFSET' in s) GEN_TEMP_OFFSET = s.GEN_TEMP_OFFSET;
    if ('GEN_HUMID_OFFSET' in s) GEN_HUMID_OFFSET = s.GEN_HUMID_OFFSET;
    if ('GEN_SINGLE_BIOME' in s) GEN_SINGLE_BIOME = s.GEN_SINGLE_BIOME;
    if ('GEN_BIOME_OVERRIDES' in s) GEN_BIOME_OVERRIDES = s.GEN_BIOME_OVERRIDES;
    if ('GEN_TREE_DENSITY' in s) GEN_TREE_DENSITY = s.GEN_TREE_DENSITY;
    if ('GEN_FOLIAGE_DENSITY' in s) GEN_FOLIAGE_DENSITY = s.GEN_FOLIAGE_DENSITY;
    if ('GEN_STRUCTURES' in s) GEN_STRUCTURES = s.GEN_STRUCTURES;
    if ('GEN_CAVES' in s) GEN_CAVES = s.GEN_CAVES;
    if ('GEN_CAVE_DENSITY' in s) GEN_CAVE_DENSITY = s.GEN_CAVE_DENSITY;
    if ('GEN_CAVE_MIN_Y' in s) GEN_CAVE_MIN_Y = s.GEN_CAVE_MIN_Y;
    if ('GEN_CAVE_LAVA_Y' in s) GEN_CAVE_LAVA_Y = s.GEN_CAVE_LAVA_Y;
    if ('GEN_CAVE_SIZE' in s) GEN_CAVE_SIZE = s.GEN_CAVE_SIZE;
    if ('GEN_TUNNEL_FREQUENCY' in s) GEN_TUNNEL_FREQUENCY = s.GEN_TUNNEL_FREQUENCY;
    if ('GEN_TUNNEL_LENGTH' in s) GEN_TUNNEL_LENGTH = s.GEN_TUNNEL_LENGTH;
    if ('GEN_TUNNEL_RADIUS' in s) GEN_TUNNEL_RADIUS = s.GEN_TUNNEL_RADIUS;
    if ('GEN_TUNNEL_MAX_Y' in s) GEN_TUNNEL_MAX_Y = s.GEN_TUNNEL_MAX_Y;
    if ('GEN_TUNNEL_BRANCH' in s) GEN_TUNNEL_BRANCH = s.GEN_TUNNEL_BRANCH;
    if ('GEN_RAVINE_FREQUENCY' in s) GEN_RAVINE_FREQUENCY = s.GEN_RAVINE_FREQUENCY;
    if ('GEN_RAVINE_DEPTH' in s) GEN_RAVINE_DEPTH = s.GEN_RAVINE_DEPTH;
    if ('GEN_RAVINE_WIDTH' in s) GEN_RAVINE_WIDTH = s.GEN_RAVINE_WIDTH;
    if ('GEN_ORE_ABUNDANCE' in s) GEN_ORE_ABUNDANCE = s.GEN_ORE_ABUNDANCE;
}
