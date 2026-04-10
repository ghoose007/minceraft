// ==========================================
// MESH BUILDER WEB WORKER
// ==========================================
//
// Builds chunk meshes off the main thread. Imports the same chunk-mesh.js,
// faces.js, block-helpers.js used on the main thread, with shimmed globals
// for chunk storage, biome data, and scene/THREE stubs (since the worker
// only does the data half — the main thread does THREE.js assembly).
//
// Message protocol:
//   init { BLOCK_DATA, WORLD_*, CHUNKS_*, settings, biomeNames }
//   setChunk { cx, cz, chunkBuf } [transferable]
//   setBiomeStrip { cx, cz, biomesBuf } [transferable]
//   setSettings { settings }
//   mesh { cx, cz }
//
// Responses:
//   initDone
//   meshDone { cx, cz, solidPos/Norm/Uv/Col/Tint, glassPos/..., waterPos/..., 
//              lavaPos/..., firePos/..., portalPos/..., aetherPortalPos/... }
//              All as Float32Arrays sent via Transferable.
//   error { error }

// ==========================================
// SHIMMED GLOBALS — must exist before importScripts runs
// ==========================================

// World dimensions — actual values come from init message, defaults match constants.js
var WORLD_WIDTH = 1024;
var WORLD_DEPTH = 1024;
const WORLD_HEIGHT = 256;
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;
var CHUNKS_X = 64;
var CHUNKS_Z = 64;
var CHUNK_VOLUME = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
var _halfW = WORLD_WIDTH >> 1;
var _halfD = WORLD_DEPTH >> 1;

// Settings — overridden by init/setSettings
var settingGraphicsFancy = true;
var settingSmoothLighting = true;
var settingGraphicsFabulous = false;

// Chunk storage mirror — populated by setChunk messages.
// Same shape as main thread: array of Int32Array indexed by cx*CHUNKS_Z+cz
var chunkStorageArr = null;

// Generated chunks flag (mesh build doesn't actually use this, but some helper code might)
var generatedChunksArr = null;

// biomeMap mirror — array of biome name strings indexed by world coords
// Populated by setBiomeStrip messages
var biomeMap = null;

// Biome ID → name lookup (sent in init)
var BIOME_NAMES_LIST = ['desert', 'rainforest', 'tundra', 'taiga', 'plains', 'forest', 'ocean', 'swamp', 'jungle', 'extreme_hills', 'aether_skyforest', 'aether_void', 'aether_lake', 'alpha_forest'];

// Stubs for the THREE.js assembly path — chunk-mesh.js declares them but we never call assembly
const chunkMeshes = new Map();
const dirtyChunks = new Set();
const scene = {
    add: function() {},
    remove: function() {}
};
const THREE = {
    Group: function() { this.children = []; this.add = function() {}; },
    BufferGeometry: function() { 
        this.setAttribute = function() {}; 
        this.computeBoundingSphere = function() {};
        this.dispose = function() {};
    },
    Float32BufferAttribute: function() {},
    Mesh: function() { this.geometry = { dispose: function() {} }; }
};

// Material stubs (referenced by _assembleChunkMeshFromArrays which we never call)
const solidMaterial = null;
const glassMaterial = null;
const waterMaterial = null;
const lavaMaterial = null;

// Current dimension (chunk-mesh.js uses this for fluid handling — we override per request)
var currentDimension = 'overworld';

// Override _getChunkFast to read from our local mirror
function _getChunkFast(cx, cz) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return null;
    if (!chunkStorageArr) return null;
    return chunkStorageArr[cx * CHUNKS_Z + cz];
}
function _getOrCreateChunkFast(cx, cz) {
    // Mesh build only reads, never creates. Return existing or null.
    return _getChunkFast(cx, cz);
}
function _isChunkGenerated(cx, cz) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return false;
    return _getChunkFast(cx, cz) !== null;
}
function _markChunkGenerated() {} // no-op in worker

// Voxel access functions — duplicated from js/world/voxel.js so we don't need
// to importScripts it (voxel.js declares its own _halfW which would collide).
function getVoxel(x, y, z) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return 0;
    const chunk = chunkStorageArr[(ix >> 4) * CHUNKS_Z + (iz >> 4)];
    if (!chunk) return 0;
    return chunk[(ix & 15) + (iy << 4) + ((iz & 15) << 12)];
}

function getSunLight(x, y, z) {
    if (y >= WORLD_HEIGHT) return 15;
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return 15;
    const chunk = chunkStorageArr[(ix >> 4) * CHUNKS_Z + (iz >> 4)];
    if (!chunk) return 15;
    return (chunk[(ix & 15) + (iy << 4) + ((iz & 15) << 12)] >> 14) & 0xF;
}

function getTorchLight(x, y, z) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return 0;
    const chunk = chunkStorageArr[(ix >> 4) * CHUNKS_Z + (iz >> 4)];
    if (!chunk) return 0;
    return (chunk[(ix & 15) + (iy << 4) + ((iz & 15) << 12)] >> 18) & 0xF;
}

// setVoxel/setSunLight/setTorchLight are no-ops in worker (we don't modify chunks)
function setVoxel() {}
function setSunLight() {}
function setTorchLight() {}
function getVoxelIndex() { return -1; }
function getHighestBlock() { return 0; }

// Helpers from particles.js (inlined here so we don't have to importScripts the
// whole file which depends on THREE for particle geometries).
function getBlockHash(x, y, z) {
    let h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return h - Math.floor(h);
}

function getCornerHeight(bx, y, bz, dx, dz, fluidId) {
    if (fluidId === undefined) fluidId = 4;
    // Canonical Minecraft fluid corner height with weighted averaging — see
    // particles.js for full rationale. Cells at height >= 0.8 get 10x weight
    // so sources dominate over thin neighbors and don't tilt at the edges.
    let totalHeight = 0;
    let totalWeight = 0;
    for (let ix = 0; ix <= 1; ix++) {
        for (let iz = 0; iz <= 1; iz++) {
            const nx = bx + dx - 1 + ix, nz = bz + dz - 1 + iz;
            const nVal = getVoxel(nx, y, nz);
            if ((nVal & 0xFF) === fluidId) {
                const aboveVal = getVoxel(nx, y + 1, nz);
                if ((aboveVal & 0xFF) === fluidId) return 1.0;
                const isFalling = (nVal >> 12) & 0x1;
                if (isFalling) return 1.0;
                const isSource = (nVal >> 13) & 0x1;
                let h;
                if (isSource) {
                    h = 8.0 / 9.0;
                } else {
                    const level = (nVal >> 8) & 0xF;
                    h = level / 9.0;
                }
                if (h >= 0.8) {
                    totalHeight += h * 10.0;
                    totalWeight += 10;
                } else {
                    totalHeight += h;
                    totalWeight += 1;
                }
            }
        }
    }
    return totalWeight > 0 ? totalHeight / totalWeight : 0.0;
}

// ==========================================
// IMPORT SCRIPTS — load the actual mesh build code
// ==========================================
//
// Order matters:
//   1. constants.js — but it would re-declare CHUNKS_X etc. and break our shims.
//      Instead we manually inline what we need below.
//   2. blocks.js — defines BLOCK_DATA
//   3. block-helpers.js — defines isSlabBlock, _transparentLUT, etc.
//   4. faces.js — defines pushFace, getVertexLighting, biome tint helpers
//   5. chunk-mesh.js — defines _buildChunkMeshDataOnly

// Inline what we need from constants.js (avoid the let CHUNKS_X redeclaration issue)
const RENDER_DISTANCES = [4, 8, 12, 16];
const NETHER_HEIGHT = 128;

// Biome color tables (same as constants.js + aether.js post-load assignments)
const BIOME_COLORS = {
    'desert': [191/255, 183/255, 85/255],
    'rainforest': [89/255, 201/255, 60/255],
    'tundra': [128/255, 180/255, 151/255],
    'taiga': [134/255, 183/255, 131/255],
    'plains': [145/255, 189/255, 89/255],
    'forest': [121/255, 192/255, 90/255],
    'ocean': [60/255, 100/255, 160/255],
    'swamp': [106/255, 112/255, 57/255],
    'jungle': [89/255, 174/255, 48/255],
    'extreme_hills': [0x8A/255, 0xB6/255, 0x89/255],
    'alpha_forest': [199/255, 255/255, 140/255],
    // Aether — values must match aether.js BIOME_COLORS assignments
    'aether_skyforest': [0.65, 0.82, 0.55],
    'aether_void':      [0.7, 0.85, 0.95],
    'aether_lake':      [0.65, 0.82, 0.55]
};
const BIOME_FOLIAGE_COLORS = {
    'desert': [174/255, 164/255, 42/255],
    'rainforest': [48/255, 187/255, 28/255],
    'tundra': [96/255, 161/255, 123/255],
    'taiga': [104/255, 164/255, 100/255],
    'plains': [119/255, 171/255, 47/255],
    'forest': [89/255, 174/255, 48/255],
    'ocean': [113/255, 168/255, 48/255],
    'swamp': [106/255, 112/255, 57/255],
    'jungle': [48/255, 150/255, 22/255],
    'extreme_hills': [0x6D/255, 0xA3/255, 0x6B/255],
    'alpha_forest': [199/255, 255/255, 140/255],
    // Aether — golden-amber leaves
    'aether_skyforest': [0.80, 0.72, 0.38],
    'aether_void':      [0.80, 0.72, 0.38],
    'aether_lake':      [0.80, 0.72, 0.38]
};
const BIOME_WATER_COLORS = {
    'plains':        [0x44/255, 0xAF/255, 0xF5/255],
    'desert':        [0x61/255, 0x7B/255, 0x64/255],
    'forest':        [0x3F/255, 0x76/255, 0xE4/255],
    'taiga':         [0x28/255, 0x7E/255, 0x98/255],
    'tundra':        [0x39/255, 0x38/255, 0xC9/255],
    'swamp':         [0x4C/255, 0x67/255, 0x59/255],
    'jungle':        [0x14/255, 0xA2/255, 0xC5/255],
    'rainforest':    [0x1B/255, 0x9E/255, 0xD8/255],
    'ocean':         [0x3F/255, 0x76/255, 0xE4/255],
    'extreme_hills': [0x00/255, 0x7B/255, 0xF7/255],
    'aether_skyforest': [0.1, 1.8, 1.35],
    'aether_void':      [0.1, 1.8, 1.35],
    'aether_lake':      [0.1, 1.8, 1.35]
};

// `window` shim — chunk-mesh.js does `if (!window._opaqueFullCubeLUT) {...}`
// to lazily build a LUT. We provide a simple object that can hold properties.
const window = {};

// BLOCK_DATA gets sent in the init message (instead of importScripts'ing blocks.js,
// which uses `const BLOCK_DATA = {...}` and would conflict if we redeclared)
var BLOCK_DATA = {};

// Now import the helpers and mesh code
try {
    importScripts(
        '../world/block-helpers.js',
        '../render/faces.js',
        '../render/chunk-mesh.js'
    );
} catch (e) {
    self.postMessage({ type: 'error', error: 'importScripts failed: ' + e.message + ' @ ' + e.filename + ':' + e.lineno });
    throw e;
}

// ==========================================
// MESSAGE HANDLER
// ==========================================

self.onmessage = function(ev) {
    const msg = ev.data;
    
    if (msg.type === 'init') {
        try {
            // Apply world constants
            WORLD_WIDTH = msg.WORLD_WIDTH;
            WORLD_DEPTH = msg.WORLD_DEPTH;
            CHUNKS_X = msg.CHUNKS_X;
            CHUNKS_Z = msg.CHUNKS_Z;
            CHUNK_VOLUME = msg.CHUNK_VOLUME;
            _halfW = WORLD_WIDTH >> 1;
            _halfD = WORLD_DEPTH >> 1;
            
            // Apply settings
            if (msg.settings) {
                if ('settingGraphicsFancy' in msg.settings) settingGraphicsFancy = msg.settings.settingGraphicsFancy;
                if ('settingSmoothLighting' in msg.settings) settingSmoothLighting = msg.settings.settingSmoothLighting;
                if ('settingGraphicsFabulous' in msg.settings) settingGraphicsFabulous = msg.settings.settingGraphicsFabulous;
            }
            
            // Apply BLOCK_DATA
            if (msg.BLOCK_DATA) {
                // Replace contents (BLOCK_DATA is a let so we can reassign)
                BLOCK_DATA = msg.BLOCK_DATA;
            }
            
            // Allocate chunk storage mirror
            const total = CHUNKS_X * CHUNKS_Z;
            chunkStorageArr = new Array(total);
            for (let i = 0; i < total; i++) chunkStorageArr[i] = null;
            generatedChunksArr = new Uint8Array(total);
            
            // Allocate biomeMap mirror — pre-fill with 'plains' so any unset slot
            // (chunks not yet synced) returns a valid biome instead of undefined.
            // This prevents the bright-green stripe bug at the edge of loaded area
            // where smoothing kernels read into unsynced neighbor chunks.
            biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);
            for (let i = 0; i < biomeMap.length; i++) biomeMap[i] = 'plains';
            
            self.postMessage({ type: 'initDone' });
            return;
        } catch (e) {
            self.postMessage({ type: 'error', error: 'init failed: ' + e.message });
            return;
        }
    }
    
    if (msg.type === 'setChunk') {
        try {
            const cx = msg.cx, cz = msg.cz;
            if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
            // Adopt the transferred buffer
            chunkStorageArr[cx * CHUNKS_Z + cz] = new Int32Array(msg.chunkBuf);
            generatedChunksArr[cx * CHUNKS_Z + cz] = 1;
            return;
        } catch (e) {
            self.postMessage({ type: 'error', error: 'setChunk failed: ' + e.message });
            return;
        }
    }
    
    if (msg.type === 'setBiomeStrip') {
        try {
            const cx = msg.cx, cz = msg.cz;
            const biomes = new Uint8Array(msg.biomesBuf);
            const startX = cx * CHUNK_SIZE;
            const startZ = cz * CHUNK_SIZE;
            // Translate ID → name and store into biomeMap
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    const wx = startX + lx;
                    const wz = startZ + lz;
                    const gIdx = wx + wz * WORLD_WIDTH;
                    if (gIdx >= 0 && gIdx < WORLD_WIDTH * WORLD_DEPTH) {
                        const id = biomes[lx + lz * CHUNK_SIZE];
                        biomeMap[gIdx] = BIOME_NAMES_LIST[id] || 'plains';
                    }
                }
            }
            // CRITICAL: invalidate the smoothed tint caches. Their keys are
            // world positions only, so without this they'd return stale tints
            // from before the biome data was updated. Clearing the entire
            // cache is a small cost vs the visible bug it fixes.
            if (typeof _biomeTintCache !== 'undefined' && _biomeTintCache) _biomeTintCache.clear();
            if (typeof _biomeFoliageTintCache !== 'undefined' && _biomeFoliageTintCache) _biomeFoliageTintCache.clear();
            if (typeof _biomeWaterTintCache !== 'undefined' && _biomeWaterTintCache) _biomeWaterTintCache.clear();
            return;
        } catch (e) {
            self.postMessage({ type: 'error', error: 'setBiomeStrip failed: ' + e.message });
            return;
        }
    }
    
    if (msg.type === 'reset') {
        // Clear chunk mirror, biome map, and tint caches. Used on dimension switch.
        // If new world dimensions are passed (because dimensions like the nether
        // have a different size than the overworld), REALLOCATE the arrays to
        // the new sizes. Without this, after switching to a smaller dimension
        // the worker would have oversized arrays indexed with wrong strides,
        // causing setBiomeStrip writes and the smoothing kernel reads to land
        // on different cells.
        if (typeof msg.WORLD_WIDTH === 'number' && typeof msg.WORLD_DEPTH === 'number'
            && typeof msg.CHUNKS_X === 'number' && typeof msg.CHUNKS_Z === 'number') {
            WORLD_WIDTH = msg.WORLD_WIDTH;
            WORLD_DEPTH = msg.WORLD_DEPTH;
            CHUNKS_X = msg.CHUNKS_X;
            CHUNKS_Z = msg.CHUNKS_Z;
            if (typeof msg.CHUNK_VOLUME === 'number') CHUNK_VOLUME = msg.CHUNK_VOLUME;
            _halfW = WORLD_WIDTH >> 1;
            _halfD = WORLD_DEPTH >> 1;
            const total = CHUNKS_X * CHUNKS_Z;
            chunkStorageArr = new Array(total);
            for (let i = 0; i < total; i++) chunkStorageArr[i] = null;
            generatedChunksArr = new Uint8Array(total);
            biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);
            for (let i = 0; i < biomeMap.length; i++) biomeMap[i] = 'plains';
        } else {
            // Same-size reset: just clear contents
            if (chunkStorageArr) {
                for (let i = 0; i < chunkStorageArr.length; i++) chunkStorageArr[i] = null;
            }
            if (biomeMap) {
                for (let i = 0; i < biomeMap.length; i++) biomeMap[i] = 'plains';
            }
        }
        if (typeof _biomeTintCache !== 'undefined' && _biomeTintCache) _biomeTintCache.clear();
        if (typeof _biomeFoliageTintCache !== 'undefined' && _biomeFoliageTintCache) _biomeFoliageTintCache.clear();
        if (typeof _biomeWaterTintCache !== 'undefined' && _biomeWaterTintCache) _biomeWaterTintCache.clear();
        return;
    }
    
    if (msg.type === 'setSettings') {
        if (msg.settings) {
            if ('settingGraphicsFancy' in msg.settings) settingGraphicsFancy = msg.settings.settingGraphicsFancy;
            if ('settingSmoothLighting' in msg.settings) settingSmoothLighting = msg.settings.settingSmoothLighting;
            if ('settingGraphicsFabulous' in msg.settings) settingGraphicsFabulous = msg.settings.settingGraphicsFabulous;
        }
        return;
    }
    
    if (msg.type === 'mesh') {
        const wcx = msg.wcx, wcz = msg.wcz;
        try {
            // Verify the center chunk exists in our mirror.
            // _buildChunkMeshDataOnly expects WORLD chunk coords; it converts
            // internally to storage indices via the same _halfW logic.
            const scx = wcx + (CHUNKS_X >> 1);
            const scz = wcz + (CHUNKS_Z >> 1);
            if (!_getChunkFast(scx, scz)) {
                self.postMessage({ type: 'meshDone', wcx: wcx, wcz: wcz, empty: true });
                return;
            }
            
            // Run the mesh build (fills the _cm_* arrays)
            _buildChunkMeshDataOnly(wcx, wcz);
            
            // Convert all the arrays to Float32Arrays for transfer
            const solidPos = new Float32Array(_cm_solidPos);
            const solidNrm = new Float32Array(_cm_solidNrm);
            const solidUv = new Float32Array(_cm_solidUv);
            const solidCol = new Float32Array(_cm_solidCol);
            const solidBt = new Float32Array(_cm_solidBt);
            
            const glassPos = new Float32Array(_cm_glassPos);
            const glassNrm = new Float32Array(_cm_glassNrm);
            const glassUv = new Float32Array(_cm_glassUv);
            const glassCol = new Float32Array(_cm_glassCol);
            const glassBt = new Float32Array(_cm_glassBt);
            
            const waterPos = new Float32Array(_cm_waterPos);
            const waterNrm = new Float32Array(_cm_waterNrm);
            const waterUv = new Float32Array(_cm_waterUv);
            const waterCol = new Float32Array(_cm_waterCol);
            const waterBt = new Float32Array(_cm_waterBt);
            const waterFt = new Float32Array(_cm_waterFt);
            const waterFd = new Float32Array(_cm_waterFd);
            
            const lavaPos = new Float32Array(_cm_lavaPos);
            const lavaNrm = new Float32Array(_cm_lavaNrm);
            const lavaUv = new Float32Array(_cm_lavaUv);
            const lavaCol = new Float32Array(_cm_lavaCol);
            const lavaFt = new Float32Array(_cm_lavaFt);
            const lavaFd = new Float32Array(_cm_lavaFd);
            
            const firePos = new Float32Array(_cm_firePos);
            const fireNrm = new Float32Array(_cm_fireNrm);
            const fireUv = new Float32Array(_cm_fireUv);
            const fireCol = new Float32Array(_cm_fireCol);
            const fireBt = new Float32Array(_cm_fireBt);
            
            const portalPos = new Float32Array(_cm_portalPos);
            const portalNrm = new Float32Array(_cm_portalNrm);
            const portalUv = new Float32Array(_cm_portalUv);
            const portalCol = new Float32Array(_cm_portalCol);
            const portalBt = new Float32Array(_cm_portalBt);
            
            const aPortalPos = new Float32Array(_cm_aPortalPos);
            const aPortalNrm = new Float32Array(_cm_aPortalNrm);
            const aPortalUv = new Float32Array(_cm_aPortalUv);
            const aPortalCol = new Float32Array(_cm_aPortalCol);
            const aPortalBt = new Float32Array(_cm_aPortalBt);
            
            // Collect all the buffers for transfer
            const buffers = [
                solidPos.buffer, solidNrm.buffer, solidUv.buffer, solidCol.buffer, solidBt.buffer,
                glassPos.buffer, glassNrm.buffer, glassUv.buffer, glassCol.buffer, glassBt.buffer,
                waterPos.buffer, waterNrm.buffer, waterUv.buffer, waterCol.buffer, waterBt.buffer, waterFt.buffer, waterFd.buffer,
                lavaPos.buffer, lavaNrm.buffer, lavaUv.buffer, lavaCol.buffer, lavaFt.buffer, lavaFd.buffer,
                firePos.buffer, fireNrm.buffer, fireUv.buffer, fireCol.buffer, fireBt.buffer,
                portalPos.buffer, portalNrm.buffer, portalUv.buffer, portalCol.buffer, portalBt.buffer,
                aPortalPos.buffer, aPortalNrm.buffer, aPortalUv.buffer, aPortalCol.buffer, aPortalBt.buffer
            ];
            
            self.postMessage({
                type: 'meshDone', wcx: wcx, wcz: wcz, empty: false,
                solidPos, solidNrm, solidUv, solidCol, solidBt,
                glassPos, glassNrm, glassUv, glassCol, glassBt,
                waterPos, waterNrm, waterUv, waterCol, waterBt, waterFt, waterFd,
                lavaPos, lavaNrm, lavaUv, lavaCol, lavaFt, lavaFd,
                firePos, fireNrm, fireUv, fireCol, fireBt,
                portalPos, portalNrm, portalUv, portalCol, portalBt,
                aPortalPos, aPortalNrm, aPortalUv, aPortalCol, aPortalBt
            }, buffers);
            return;
        } catch (e) {
            self.postMessage({ type: 'meshError', wcx: wcx, wcz: wcz, error: e.message + ' @ ' + (e.stack || '') });
            return;
        }
    }
};
