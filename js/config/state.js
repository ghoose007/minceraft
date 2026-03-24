// ==========================================
// GLOBAL MUTABLE STATE
// ==========================================

let chunkStorageArr = null;  
let generatedChunksArr = null; 
const chunkStorage = { _arr: null }; 
const generatedChunks = { _arr: null }; 
let useLazyGeneration = false;

// --- DIMENSION SYSTEM ---
let currentDimension = 'overworld';
let overworldChunkStorage = null;
let overworldGeneratedChunks = null;
let overworldBiomeMap = null;
let netherChunkStorage = null;
let netherGeneratedChunks = null;
let netherGenerated = false;
let overworldPlayerPos = null;
let netherPlayerPos = null;
let portalCooldown = 0;

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
let settingSmoothLighting = true;
let settingViewBobbing = true;
let currentGUIScaleIndex = 3;
let currentRenderDistIndex = 1;

let scene, camera, uiScene, uiCamera, renderer;
let biomeMap = []; 

const chunkMeshes = new Map();
let textureAtlas, solidMaterial, glassMaterial, waterMaterial, lavaMaterial; 
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
    walkDist: 0, walkDistO: 0, bob: 0, oBob: 0, landingImpact: 0, isSprinting: false, health: 20, maxHealth: 20, highestY: 0 };

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
