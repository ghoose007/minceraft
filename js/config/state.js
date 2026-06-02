// ==========================================
// GLOBAL MUTABLE STATE
// ==========================================

let chunkStorageArr = null;  
let generatedChunksArr = null; 
const chunkStorage = { _arr: null }; 
const generatedChunks = { _arr: null }; 
let useLazyGeneration = false;

// --- DIMENSION SYSTEM ---
//
// REDESIGNED (v5): all per-dimension state lives in a single `dimensionData`
// table keyed by dimension name. The active globals (chunkStorageArr,
// generatedChunksArr, biomeMap, CHUNKS_X, CHUNKS_Z, WORLD_WIDTH, WORLD_DEPTH,
// _halfW, _halfD) are VIEW POINTERS that get rebound by _bindActiveDimension
// whenever the player switches dimensions. Save/load and dimension-switch
// touch dimensionData directly; they never have to swap arrays mid-stream.
//
// The legacy per-dimension globals below (overworldChunkStorage etc) still
// exist as backwards-compat aliases — _bindActiveDimension keeps them in
// sync so any old code reading them still gets the right values. New code
// should read from dimensionData[name] directly.
let currentDimension = 'overworld';

const dimensionData = {
    overworld: {
        chunks: null,             // Array of Int32Array | null
        generatedFlags: null,     // Uint8Array
        biomeMap: null,           // Array of biome name strings
        chunksX: 0,
        chunksZ: 0,
        worldWidth: 0,
        worldDepth: 0,
        generated: false,
        playerPos: null,          // {x, y, z, yaw, pitch}
    },
    nether: {
        chunks: null,
        generatedFlags: null,
        biomeMap: null,
        chunksX: 0,
        chunksZ: 0,
        worldWidth: 0,
        worldDepth: 0,
        generated: false,
        playerPos: null,
    },
    aether: {
        chunks: null,
        generatedFlags: null,
        biomeMap: null,
        chunksX: 0,
        chunksZ: 0,
        worldWidth: 0,
        worldDepth: 0,
        generated: false,
        playerPos: null,
    },
};

// Snapshot the player's current position into the active dimension's
// playerPos slot. Call this BEFORE rebinding so we don't lose the position.
function _snapshotPlayerPosToCurrentDim() {
    if (typeof currentDimension === 'undefined' || !currentDimension) return;
    const d = dimensionData[currentDimension];
    if (!d) return;
    if (typeof player === 'undefined' || !player) return;
    d.playerPos = {
        x: player.x, y: player.y, z: player.z,
        yaw: player.yaw, pitch: player.pitch,
        flying: player.flying
    };
}

// Bind the active globals (chunkStorageArr, biomeMap, CHUNKS_X, etc.) to
// point at a dimension's data. This is the ONLY place that swaps these
// pointers — all other code (save/load/dimension-switch) goes through here.
//
// Does NOT call notifyDimensionChange — caller is responsible for that
// (so the caller can decide whether the worker reset is wanted).
function _bindActiveDimension(name) {
    const d = dimensionData[name];
    if (!d) {
        console.error('[dimension] _bindActiveDimension: unknown dimension', name);
        return;
    }
    chunkStorageArr = d.chunks;
    generatedChunksArr = d.generatedFlags;
    biomeMap = d.biomeMap;
    CHUNKS_X = d.chunksX;
    CHUNKS_Z = d.chunksZ;
    WORLD_WIDTH = d.worldWidth;
    WORLD_DEPTH = d.worldDepth;
    if (typeof _updateWorldHalves === 'function') _updateWorldHalves();
    currentDimension = name;
    
    // Keep legacy aliases in sync for any code that still reads them
    if (name === 'overworld') {
        overworldChunkStorage = d.chunks;
        overworldGeneratedChunks = d.generatedFlags;
        overworldBiomeMap = d.biomeMap;
        overworldChunksX = d.chunksX;
        overworldChunksZ = d.chunksZ;
    } else if (name === 'nether') {
        netherChunkStorage = d.chunks;
        netherGeneratedChunks = d.generatedFlags;
        netherChunksX = d.chunksX;
        netherChunksZ = d.chunksZ;
    } else if (name === 'aether') {
        aetherChunkStorage = d.chunks;
        aetherGeneratedChunks = d.generatedFlags;
        aetherBiomeMap = d.biomeMap;
        aetherChunksX = d.chunksX;
        aetherChunksZ = d.chunksZ;
    }
}

// Allocate dimensionData[name] arrays if not already done. Sizes must be
// stored on dimensionData[name] BEFORE calling this (or it will use the
// CURRENT global CHUNKS_X/Z/WORLD_WIDTH/DEPTH as a fallback). Returns the
// dimensionData entry.
function _ensureDimensionAllocated(name) {
    const d = dimensionData[name];
    if (!d) return null;
    // Fall back to current globals if sizes weren't pre-set
    if (!d.chunksX) d.chunksX = CHUNKS_X;
    if (!d.chunksZ) d.chunksZ = CHUNKS_Z;
    if (!d.worldWidth) d.worldWidth = d.chunksX * CHUNK_SIZE;
    if (!d.worldDepth) d.worldDepth = d.chunksZ * CHUNK_SIZE;
    const total = d.chunksX * d.chunksZ;
    if (!d.chunks || d.chunks.length !== total) {
        d.chunks = new Array(total);
        for (let i = 0; i < total; i++) d.chunks[i] = null;
    }
    if (!d.generatedFlags || d.generatedFlags.length !== total) {
        d.generatedFlags = new Uint8Array(total);
    }
    if (!d.biomeMap || d.biomeMap.length !== d.worldWidth * d.worldDepth) {
        d.biomeMap = new Array(d.worldWidth * d.worldDepth);
    }
    return d;
}

// --- LEGACY DIMENSION GLOBALS (kept for backwards compat — read-only views) ---
// These stay in sync via _bindActiveDimension. New code should use dimensionData directly.
let overworldChunkStorage = null;
let overworldGeneratedChunks = null;
let overworldBiomeMap = null;
let netherChunkStorage = null;
let netherGeneratedChunks = null;
let netherGenerated = false;
let overworldPlayerPos = null;
let netherPlayerPos = null;

// --- AETHER STATE ---
let aetherChunkStorage = null;
let aetherGeneratedChunks = null;
let aetherBiomeMap = null;
let aetherGenerated = false;
let aetherPlayerPos = null;
let aetherChunksX = 0, aetherChunksZ = 0;

// Overworld/Nether dimension sizes (saved/restored on dimension switch)
let overworldChunksX = 0, overworldChunksZ = 0;
let netherChunksX = 0, netherChunksZ = 0;
let portalCooldown = 0;

// --- SETTINGS ---
let settingSoundVolume = 1.0;       // 0.0 to 1.0
let settingSensitivity = 1.0;       // 0.25 to 2.0 (maps to 25%-200%)
let settingDifficulty = 'normal';   // 'easy', 'normal', 'hard'
let settingDamageMultiplier = 1.0;  // derived from difficulty
let settingChunkLoadSpeed = 'balanced'; // 'smooth', 'balanced', 'fast', 'extreme'
let settingChunkLoadingSpeed = 'normal'; // 'low', 'normal', 'fast', 'extreme'

// --- ARMOR ---
// armorSlots[0]=helmet, [1]=chestplate, [2]=leggings, [3]=boots
let armorSlots = [
    { id: 0, count: 0 },
    { id: 0, count: 0 },
    { id: 0, count: 0 },
    { id: 0, count: 0 }
];

// --- CHUNK MANAGEMENT ---
function _chunkIdx(cx, cz) { return cx * CHUNKS_Z + cz; }
function _getChunkFast(cx, cz) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return null;
    return chunkStorageArr[cx * CHUNKS_Z + cz];
}
function _getOrCreateChunkFast(cx, cz) {
    const idx = cx * CHUNKS_Z + cz;
    let chunk = chunkStorageArr[idx];
    if (!chunk) {
        chunk = new Int32Array(CHUNK_VOLUME);
        chunkStorageArr[idx] = chunk;
    }
    return chunk;
}
function _isChunkGenerated(cx, cz) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return false;
    return generatedChunksArr[cx * CHUNKS_Z + cz] === 1;
}
function _markChunkGenerated(cx, cz) {
    generatedChunksArr[cx * CHUNKS_Z + cz] = 1;
}

function initChunkStorage() {
    const total = CHUNKS_X * CHUNKS_Z;
    chunkStorageArr = new Array(total);
    for (let i = 0; i < total; i++) chunkStorageArr[i] = null;
    generatedChunksArr = new Uint8Array(total);
}
function clearChunkStorage() {
    if (chunkStorageArr) {
        for (let i = 0; i < chunkStorageArr.length; i++) chunkStorageArr[i] = null;
    }
    if (generatedChunksArr) generatedChunksArr.fill(0);
    chunkBiomeCache.clear();
}

// --- RENDERING STATE ---
let settingGraphicsFancy = true;
let settingGraphicsFabulous = false;  // Fabulous! shader-quality graphics
let settingSmoothLighting = true;
let settingViewBobbing = true;
let currentGUIScaleIndex = 4;
let currentRenderDistIndex = 6; // 8 chunks in RENDER_DISTANCES (2..32)

let scene, camera, uiScene, uiCamera, renderer;
let biomeMap = []; 

const chunkMeshes = new Map();
let textureAtlas, textureAtlasMip, solidMaterial, solidMaterialMip, glassMaterial, glassMaterialMip, waterMaterial, lavaMaterial; 
let highlightBox;
let activeHighlight = null;
const updateWaterQueue = new Set();
const updateLavaQueue = new Set();
const dirtyChunks = new Set();
let waterTickTimer = 0;
let lavaTickTimer = 0;

const pendingBlockUpdates = [];

// --- DEBUG ---
let debugFps = 0, debugFrameTime = 0, debugTickRate = 0, debugFrameCount = 0, debugTickCount = 0;
let debugLastSecond = performance.now();
let debugWaterQueue = 0, debugLavaQueue = 0;

// --- TIME ---
let globalTime = 0;
let celestialGroup, sunMesh, moonMesh;

const timeUniforms = {
    uSunLevel: { value: 1.0 },
    uSunColor: { value: new THREE.Color(1.0, 1.0, 1.0) }, 
    uTorchColor: { value: new THREE.Color(1.0, 0.85, 0.6) }, 
    uAmbientColor: { value: new THREE.Color(0.12, 0.12, 0.16) }, 
    uFluidTime: { value: 0.0 }
};

// --- PHYSICS ---
const fallingBlocks = new Set();
const particles = [];
const particleGeometries = {};
const activeTNT = [];

// --- PLAYER ---
let gameMode = 'survival'; 

const player = { x: 0, y: 15, z: 0, vx: 0, vy: 0, vz: 0, pitch: 0, yaw: 0, onGround: false, height: NORMAL_HEIGHT, eyeLevel: NORMAL_EYE_LEVEL, flying: false,
    walkDist: 0, walkDistO: 0, bob: 0, oBob: 0, landingImpact: 0, isSprinting: false, health: 20, maxHealth: 20, highestY: 0,
    hunger: 20, maxHunger: 20, saturation: 5, exhaustion: 0,
    eatTimer: 0, eatItemId: 0, regenTimer: 0, hungerDamageTimer: 0, hungerTickTimer: 0 };

const miningState = { isMining: false, x: 0, y: 0, z: 0, progress: 0, stage: -1, id: 0 };
let breakingBox, breakingMat;

let lastSpacePressTime = 0, lastWPressTime = 0, wDoubleTapped = false;

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, Space: false, ShiftLeft: false, ControlLeft: false };
let isPointerLocked = false, lastTime = performance.now(), currentBuildBlock = 1;
let heldItemGroup, currentHeldMesh = null, swingAnimation = 0.0;

// --- UI STATE ---
let uiState = 'MENU', activeSlot = 0;
const inventory = new Array(36).fill(null).map(() => ({id: 0, count: 0}));
const droppedItems = [];
let actionTextTimeout;

// --- FURNACE ---
const activeFurnaces = new Map(); 
let currentFurnacePos = null; 

// --- UTILITY ---
function updateLoadingBar(pct, status) {
    document.getElementById('loading-bar').style.width = pct + '%';
    document.getElementById('loading-status').textContent = status;
}

function yieldToUI() { return new Promise(resolve => setTimeout(resolve, 0)); }
