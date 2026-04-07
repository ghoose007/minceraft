// ==========================================
// 15. WORLD SAVE / LOAD SYSTEM (IndexedDB)
// ==========================================

const SAVE_DB_NAME = 'mincecraft-saves';
const SAVE_DB_VERSION = 1;
const SAVE_STORE = 'worlds';
const MAX_SLOTS = 2;

let _saveDB = null;
let activeWorldSlot = -1; // -1 = no world loaded, 0 or 1 = slot index
let selectedWorldSlot = -1; // UI selection on world select screen
let currentWorldName = ''; // Name of the currently loaded/created world

// --- IndexedDB helpers ---

function openSaveDB() {
    return new Promise((resolve, reject) => {
        if (_saveDB) { resolve(_saveDB); return; }
        const req = indexedDB.open(SAVE_DB_NAME, SAVE_DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(SAVE_STORE)) {
                db.createObjectStore(SAVE_STORE, { keyPath: 'slot' });
            }
        };
        req.onsuccess = (e) => { _saveDB = e.target.result; resolve(_saveDB); };
        req.onerror = (e) => { console.error('IndexedDB error:', e); reject(e); };
    });
}

function dbPut(data) {
    return new Promise(async (resolve, reject) => {
        const db = await openSaveDB();
        const tx = db.transaction(SAVE_STORE, 'readwrite');
        const store = tx.objectStore(SAVE_STORE);
        store.put(data);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

function dbGet(slot) {
    return new Promise(async (resolve, reject) => {
        const db = await openSaveDB();
        const tx = db.transaction(SAVE_STORE, 'readonly');
        const store = tx.objectStore(SAVE_STORE);
        const req = store.get(slot);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e);
    });
}

function dbDelete(slot) {
    return new Promise(async (resolve, reject) => {
        const db = await openSaveDB();
        const tx = db.transaction(SAVE_STORE, 'readwrite');
        const store = tx.objectStore(SAVE_STORE);
        const req = store.delete(slot);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e);
    });
}

function dbGetAll() {
    return new Promise(async (resolve, reject) => {
        const db = await openSaveDB();
        const tx = db.transaction(SAVE_STORE, 'readonly');
        const store = tx.objectStore(SAVE_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e);
    });
}

// --- Chunk data compression (RLE on block IDs) ---
//
// REDESIGNED (v5): the primary entry points now take an explicit chunks
// array argument so they don't depend on the active globals. The old
// wrappers below preserve backwards compat for anything else that calls them.

function compressChunksFromArray(chunks) {
    if (!chunks) return [];
    const chunkEntries = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        
        let hasData = false;
        for (let j = 0; j < chunk.length; j++) {
            if (chunk[j] !== 0) { hasData = true; break; }
        }
        if (!hasData) continue;
        
        const rle = [];
        let runVal = chunk[0];
        let runLen = 1;
        for (let j = 1; j < chunk.length; j++) {
            if (chunk[j] === runVal && runLen < 65535) {
                runLen++;
            } else {
                rle.push(runVal, runLen);
                runVal = chunk[j];
                runLen = 1;
            }
        }
        rle.push(runVal, runLen);
        chunkEntries.push({ idx: i, rle: new Int32Array(rle).buffer });
    }
    return chunkEntries;
}

function decompressChunksIntoArray(entries, chunks) {
    if (!entries || !chunks) return;
    for (const entry of entries) {
        const rle = new Int32Array(entry.rle);
        const chunk = new Int32Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
        let pos = 0;
        for (let i = 0; i < rle.length; i += 2) {
            const val = rle[i];
            const count = rle[i + 1];
            for (let j = 0; j < count; j++) {
                chunk[pos++] = val;
            }
        }
        if (entry.idx < chunks.length) chunks[entry.idx] = chunk;
    }
}

// Legacy wrappers — operate on the active globals.
function compressChunks() {
    return compressChunksFromArray(chunkStorageArr);
}
function decompressChunks(entries) {
    decompressChunksIntoArray(entries, chunkStorageArr);
}

// --- Biome map RLE (biomes compress well — adjacent cells share biomes) ---

function compressBiomeMap(biomeMap) {
    if (!biomeMap || biomeMap.length === 0) return null;
    const nameToId = new Map();
    const table = [];
    function getId(name) {
        if (name === undefined || name === null) name = '';
        let id = nameToId.get(name);
        if (id === undefined) {
            id = table.length;
            table.push(name);
            nameToId.set(name, id);
        }
        return id;
    }
    
    const rle = [];
    let runId = getId(biomeMap[0]);
    let runLen = 1;
    for (let i = 1; i < biomeMap.length; i++) {
        const id = getId(biomeMap[i]);
        if (id === runId && runLen < 0x7FFFFFFF) {
            runLen++;
        } else {
            rle.push(runId, runLen);
            runId = id;
            runLen = 1;
        }
    }
    rle.push(runId, runLen);
    
    return {
        table: table,
        rle: new Int32Array(rle).buffer,
        length: biomeMap.length
    };
}

function decompressBiomeMap(compressed) {
    if (!compressed || !compressed.table || !compressed.rle) return null;
    const out = new Array(compressed.length);
    const rle = new Int32Array(compressed.rle);
    const table = compressed.table;
    let pos = 0;
    for (let i = 0; i < rle.length; i += 2) {
        const id = rle[i];
        const count = rle[i + 1];
        const name = table[id] || '';
        for (let j = 0; j < count; j++) {
            out[pos++] = (name === '') ? undefined : name;
        }
    }
    return out;
}

// --- IndexedDB key helpers ---
function _dimChunksKey(slot, dimName, batchIdx) { return slot + '_dim_' + dimName + '_chunks_' + batchIdx; }
function _dimBiomesKey(slot, dimName) { return slot + '_dim_' + dimName + '_biomes'; }

// --- Save world to a slot (v5 format) ---
//
// New design: walks dimensionData directly. For each dimension that's been
// generated, RLE-compresses chunks and biomes, writes batches to IndexedDB.
// No more swap dance — each dimension's data is independently accessible
// from dimensionData[name].

async function saveWorld(slot) {
    const saveStart = performance.now();
    
    // 1. Snapshot the player's current position into the active dimension
    if (typeof _snapshotPlayerPosToCurrentDim === 'function') {
        _snapshotPlayerPosToCurrentDim();
    }
    
    // 2. Delete ALL existing keys for this slot (clears v4 + v5 keys)
    const db = await openSaveDB();
    const tx1 = db.transaction(SAVE_STORE, 'readwrite');
    const store1 = tx1.objectStore(SAVE_STORE);
    const allKeys = await new Promise((res, rej) => {
        const req = store1.getAllKeys();
        req.onsuccess = () => res(req.result);
        req.onerror = rej;
    });
    const slotPrefix = slot + '_';
    for (const key of allKeys) {
        if (typeof key === 'string' && key.startsWith(slotPrefix)) {
            store1.delete(key);
        }
    }
    await new Promise((res, rej) => { tx1.oncomplete = res; tx1.onerror = rej; });
    
    // 3. Walk dimensionData. For each generated dimension, write its chunks and biomes.
    const BATCH_SIZE = 128;
    const dimsMeta = {};
    let totalChunksSaved = 0;
    
    for (const dimName of ['overworld', 'nether', 'aether']) {
        const d = dimensionData[dimName];
        if (!d || !d.generated || !d.chunks) {
            dimsMeta[dimName] = null;
            continue;
        }
        
        const compressed = compressChunksFromArray(d.chunks);
        const numBatches = Math.ceil(compressed.length / BATCH_SIZE);
        for (let b = 0; b < numBatches; b++) {
            const batch = compressed.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
            await dbPut({ slot: _dimChunksKey(slot, dimName, b), data: batch });
        }
        
        let hasBiomes = false;
        if (d.biomeMap && d.biomeMap.length > 0) {
            const compressedBiomes = compressBiomeMap(d.biomeMap);
            if (compressedBiomes) {
                await dbPut({ slot: _dimBiomesKey(slot, dimName), data: compressedBiomes });
                hasBiomes = true;
            }
        }
        
        dimsMeta[dimName] = {
            chunksX: d.chunksX,
            chunksZ: d.chunksZ,
            worldWidth: d.worldWidth,
            worldDepth: d.worldDepth,
            numChunkBatches: numBatches,
            hasBiomes: hasBiomes,
            generatedFlags: d.generatedFlags ? Array.from(d.generatedFlags) : null,
            playerPos: d.playerPos || null,
            generated: true,
        };
        
        totalChunksSaved += compressed.length;
    }
    
    // 4. Write metadata blob (everything except chunks/biomes)
    const saveData = {
        slot: slot,
        version: 5,
        timestamp: Date.now(),
        worldName: currentWorldName || 'World ' + (slot + 1),
        seed: _worldSeed,
        gameMode: gameMode,
        // Display fields for world select screen (uses overworld dims)
        chunksX: dimsMeta.overworld ? dimsMeta.overworld.chunksX : CHUNKS_X,
        chunksZ: dimsMeta.overworld ? dimsMeta.overworld.chunksZ : CHUNKS_Z,
        currentDimension: currentDimension || 'overworld',
        dimensions: dimsMeta,
        portalLinks: window._portalLinks ? JSON.parse(JSON.stringify(window._portalLinks)) : [],
        aetherPortalLinks: window._aetherPortalLinks ? JSON.parse(JSON.stringify(window._aetherPortalLinks)) : [],
        
        genParams: {
            seaLevel: GEN_SEA_LEVEL,
            terrainHeight: GEN_TERRAIN_HEIGHT,
            caveDensity: GEN_CAVE_DENSITY,
            treeDensity: GEN_TREE_DENSITY,
            oreAbundance: GEN_ORE_ABUNDANCE,
            structures: GEN_STRUCTURES,
            caves: GEN_CAVES,
            lava: GEN_LAVA,
            biomeScale: GEN_BIOME_SCALE,
            smoothness: GEN_SMOOTHNESS,
            volatility: GEN_VOLATILITY_MULT,
            tempOffset: GEN_TEMP_OFFSET,
            humidOffset: GEN_HUMID_OFFSET,
            foliageDensity: GEN_FOLIAGE_DENSITY,
            caveSize: GEN_CAVE_SIZE,
            caveMinY: GEN_CAVE_MIN_Y,
            caveLavaY: GEN_CAVE_LAVA_Y,
            tunnelFrequency: GEN_TUNNEL_FREQUENCY,
            tunnelLength: GEN_TUNNEL_LENGTH,
            tunnelRadius: GEN_TUNNEL_RADIUS,
            tunnelMaxY: GEN_TUNNEL_MAX_Y,
            tunnelBranch: GEN_TUNNEL_BRANCH,
            ravineFrequency: GEN_RAVINE_FREQUENCY,
            ravineDepth: GEN_RAVINE_DEPTH,
            ravineWidth: GEN_RAVINE_WIDTH,
            hostileSpawns: GEN_HOSTILE_SPAWNS,
            hostileCap: GEN_HOSTILE_CAP,
            hostileRate: GEN_HOSTILE_RATE,
            spawnDist: GEN_SPAWN_DIST,
            xpEnabled: GEN_XP_ENABLED,
            aetherEnabled: (typeof GEN_AETHER_ENABLED !== 'undefined' ? GEN_AETHER_ENABLED : true),
            superflatLayers: (typeof GEN_SUPERFLAT_LAYERS !== 'undefined' ? GEN_SUPERFLAT_LAYERS : null),
            superflatPreset: (typeof GEN_SUPERFLAT_PRESET !== 'undefined' ? GEN_SUPERFLAT_PRESET : 'classic'),
            worldType: (typeof worldOptions !== 'undefined' ? worldOptions.worldtype : 0),
            biomeOverrides: GEN_BIOME_OVERRIDES
        },
        worldSpawnX: window.worldSpawnX || 0,
        worldSpawnY: window.worldSpawnY || 64,
        worldSpawnZ: window.worldSpawnZ || 0,
        player: {
            x: player.x, y: player.y, z: player.z,
            yaw: player.yaw, pitch: player.pitch,
            health: player.health, maxHealth: player.maxHealth,
            flying: player.flying,
            highestY: player.highestY
        },
        inventory: inventory.map(s => s.id !== 0 ? { id: s.id, count: s.count, durability: s.durability !== undefined ? s.durability : undefined } : null),
        armor: armorSlots.map(s => s.id !== 0 ? { id: s.id, count: s.count, durability: s.durability !== undefined ? s.durability : undefined } : null),
        chests: (() => {
            if (typeof activeChests === 'undefined') return [];
            const arr = [];
            for (const [key, chest] of activeChests.entries()) {
                arr.push({ key, slots: chest.slots, doublePartner: chest.doublePartner });
            }
            return arr;
        })(),
        furnaces: (() => {
            if (typeof activeFurnaces === 'undefined') return [];
            const arr = [];
            for (const [key, f] of activeFurnaces.entries()) {
                arr.push({ key, input: f.input, fuel: f.fuel, output: f.output,
                    burnTime: f.burnTime, totalBurnTime: f.totalBurnTime,
                    cookTime: f.cookTime, totalCookTime: f.totalCookTime });
            }
            return arr;
        })(),
        droppedItems: (() => {
            if (typeof droppedItems === 'undefined') return [];
            return droppedItems.map(item => ({
                id: item.id, count: item.count,
                x: item.x, y: item.y, z: item.z,
                vx: item.vx, vy: item.vy, vz: item.vz,
                durability: item.durability !== undefined ? item.durability : undefined
            }));
        })(),
        xpState: typeof window.getPlayerXPState === 'function' ? window.getPlayerXPState() : { level: 0, xp: 0, totalXP: 0 }
    };
    
    await dbPut(saveData);
    
    const elapsed = (performance.now() - saveStart).toFixed(0);
    console.log(`World saved to slot ${slot} in ${elapsed}ms (v5: ${totalChunksSaved} chunks total, current=${currentDimension})`);
}

// --- Load world from a slot (v5 + v4 migration) ---
//
// New design: reads metadata, populates dimensionData for each saved
// dimension, then calls init() which binds the active dimension and runs
// lighting/meshing. v4 saves are migrated by reading old keys into the
// dimensionData structure; on next save they get written in v5 format.

async function loadWorldFromSlot(slot) {
    const data = await dbGet(slot);
    if (!data) { alert('No save data in slot ' + (slot + 1)); return; }
    
    activeWorldSlot = slot;
    currentWorldName = data.worldName || 'World ' + (slot + 1);
    
    // Branch on save format version
    if ((data.version || 0) >= 5) {
        await _loadV5IntoData(slot, data);
    } else {
        await _loadV4IntoData(slot, data);
    }
    
    // CRITICAL: set CHUNKS_X_ACTIVE / CHUNKS_Z_ACTIVE from the saved overworld
    // dimensions BEFORE init() runs. init() reads these to set CHUNKS_X /
    // WORLD_WIDTH, which determines whether useLazyGeneration is true and
    // therefore which lighting code path runs. If these are wrong, init's
    // full-world lighting can try to allocate a chunk for every storage slot
    // and run out of memory.
    const owDim = (dimensionData.overworld && dimensionData.overworld.generated) ? dimensionData.overworld : null;
    if (owDim && owDim.chunksX) {
        CHUNKS_X_ACTIVE = owDim.chunksX;
        CHUNKS_Z_ACTIVE = owDim.chunksZ;
    }
    
    // Restore seed and RNG
    _worldSeed = data.seed;
    seedRng(data.seed);
    
    // Restore game mode
    gameMode = data.gameMode || 'survival';
    worldOptions.gamemode = gameMode;
    
    // Restore generation params
    if (data.genParams) {
        GEN_SEA_LEVEL = data.genParams.seaLevel;
        GEN_TERRAIN_HEIGHT = data.genParams.terrainHeight;
        GEN_CAVE_DENSITY = data.genParams.caveDensity;
        GEN_TREE_DENSITY = data.genParams.treeDensity;
        GEN_ORE_ABUNDANCE = data.genParams.oreAbundance;
        GEN_STRUCTURES = data.genParams.structures;
        GEN_CAVES = data.genParams.caves;
        GEN_LAVA = data.genParams.lava;
        GEN_BIOME_SCALE = data.genParams.biomeScale;
        GEN_SMOOTHNESS = data.genParams.smoothness;
        GEN_VOLATILITY_MULT = data.genParams.volatility || 100;
        GEN_TEMP_OFFSET = data.genParams.tempOffset || 0;
        GEN_HUMID_OFFSET = data.genParams.humidOffset || 0;
        GEN_FOLIAGE_DENSITY = data.genParams.foliageDensity || 100;
        GEN_CAVE_SIZE = data.genParams.caveSize || 120;
        GEN_CAVE_MIN_Y = data.genParams.caveMinY !== undefined ? data.genParams.caveMinY : 2;
        GEN_CAVE_LAVA_Y = data.genParams.caveLavaY !== undefined ? data.genParams.caveLavaY : 6;
        GEN_TUNNEL_FREQUENCY = data.genParams.tunnelFrequency || 200;
        GEN_TUNNEL_LENGTH = data.genParams.tunnelLength || 100;
        GEN_TUNNEL_RADIUS = data.genParams.tunnelRadius || 120;
        GEN_TUNNEL_MAX_Y = data.genParams.tunnelMaxY || 80;
        GEN_TUNNEL_BRANCH = data.genParams.tunnelBranch !== undefined ? data.genParams.tunnelBranch : 70;
        GEN_RAVINE_FREQUENCY = data.genParams.ravineFrequency || 100;
        GEN_RAVINE_DEPTH = data.genParams.ravineDepth || 100;
        GEN_RAVINE_WIDTH = data.genParams.ravineWidth || 100;
        GEN_HOSTILE_SPAWNS = data.genParams.hostileSpawns !== undefined ? data.genParams.hostileSpawns : true;
        GEN_HOSTILE_CAP = data.genParams.hostileCap || 32;
        GEN_HOSTILE_RATE = data.genParams.hostileRate || 100;
        GEN_SPAWN_DIST = data.genParams.spawnDist || 32;
        GEN_XP_ENABLED = data.genParams.xpEnabled !== undefined ? data.genParams.xpEnabled : true;
        if (typeof GEN_AETHER_ENABLED !== 'undefined') {
            GEN_AETHER_ENABLED = data.genParams.aetherEnabled !== undefined ? data.genParams.aetherEnabled : true;
        }
        if (typeof GEN_SUPERFLAT_LAYERS !== 'undefined' && data.genParams.superflatLayers) {
            GEN_SUPERFLAT_LAYERS = data.genParams.superflatLayers;
        }
        if (typeof GEN_SUPERFLAT_PRESET !== 'undefined' && data.genParams.superflatPreset) {
            GEN_SUPERFLAT_PRESET = data.genParams.superflatPreset;
        }
        if (typeof worldOptions !== 'undefined' && data.genParams.worldType !== undefined) {
            worldOptions.worldtype = data.genParams.worldType;
        }
        if (data.genParams.biomeOverrides) {
            GEN_BIOME_OVERRIDES = data.genParams.biomeOverrides;
        } else {
            if (typeof _resetBiomeOverrides === 'function') _resetBiomeOverrides();
        }
        if (typeof MOB_CAP_HOSTILE !== 'undefined') MOB_CAP_HOSTILE = GEN_HOSTILE_CAP;
    }
    
    // Show loading screen
    document.getElementById('world-select').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-world-name').textContent = (data.worldName || 'World') + ' (Loading...)';
    drawDirtBg('dirt-bg-3');
    
    await yieldToUI();
    
    // dimensionData is now populated. init() will bind the active dimension
    // (data.currentDimension), run lighting/meshing, and call notifyDimensionChange.
    data._loadedFromV5 = true;
    await init(data.seed, data);
}

// --- v5 load helper: read v5 save into dimensionData ---
async function _loadV5IntoData(slot, data) {
    // Reset dimensionData (in case there was a previous world loaded)
    for (const dimName of ['overworld', 'nether', 'aether']) {
        const d = dimensionData[dimName];
        d.chunks = null;
        d.generatedFlags = null;
        d.biomeMap = null;
        d.chunksX = 0;
        d.chunksZ = 0;
        d.worldWidth = 0;
        d.worldDepth = 0;
        d.generated = false;
        d.playerPos = null;
    }
    
    if (!data.dimensions) return;
    
    for (const dimName of ['overworld', 'nether', 'aether']) {
        const dimMeta = data.dimensions[dimName];
        if (!dimMeta) continue;
        
        const d = dimensionData[dimName];
        d.chunksX = dimMeta.chunksX;
        d.chunksZ = dimMeta.chunksZ;
        d.worldWidth = dimMeta.worldWidth;
        d.worldDepth = dimMeta.worldDepth;
        d.generated = !!dimMeta.generated;
        d.playerPos = dimMeta.playerPos || null;
        
        const total = d.chunksX * d.chunksZ;
        d.chunks = new Array(total);
        for (let i = 0; i < total; i++) d.chunks[i] = null;
        d.generatedFlags = new Uint8Array(total);
        if (dimMeta.generatedFlags) {
            for (let i = 0; i < dimMeta.generatedFlags.length && i < total; i++) {
                d.generatedFlags[i] = dimMeta.generatedFlags[i];
            }
        }
        
        // Load chunk batches
        const numBatches = dimMeta.numChunkBatches || 0;
        for (let b = 0; b < numBatches; b++) {
            const batch = await dbGet(_dimChunksKey(slot, dimName, b));
            if (batch && batch.data) {
                decompressChunksIntoArray(batch.data, d.chunks);
            }
        }
        
        // Load biomes
        if (dimMeta.hasBiomes) {
            const biomeRec = await dbGet(_dimBiomesKey(slot, dimName));
            if (biomeRec && biomeRec.data) {
                const decoded = decompressBiomeMap(biomeRec.data);
                if (decoded) d.biomeMap = decoded;
            }
        }
        if (!d.biomeMap) {
            d.biomeMap = new Array(d.worldWidth * d.worldDepth);
        }
    }
    
    // Update legacy generated flags
    netherGenerated = !!(dimensionData.nether && dimensionData.nether.generated);
    aetherGenerated = !!(dimensionData.aether && dimensionData.aether.generated);
}

// --- v4 migration: read old format keys into dimensionData ---
async function _loadV4IntoData(slot, data) {
    // Reset dimensionData
    for (const dimName of ['overworld', 'nether', 'aether']) {
        const d = dimensionData[dimName];
        d.chunks = null;
        d.generatedFlags = null;
        d.biomeMap = null;
        d.chunksX = 0;
        d.chunksZ = 0;
        d.worldWidth = 0;
        d.worldDepth = 0;
        d.generated = false;
        d.playerPos = null;
    }
    
    // --- Overworld ---
    const owCX = data.overworldChunksX || data.chunksX;
    const owCZ = data.overworldChunksZ || data.chunksZ;
    if (owCX && owCZ) {
        const od = dimensionData.overworld;
        od.chunksX = owCX;
        od.chunksZ = owCZ;
        od.worldWidth = owCX * CHUNK_SIZE;
        od.worldDepth = owCZ * CHUNK_SIZE;
        od.generated = true;
        const total = owCX * owCZ;
        od.chunks = new Array(total);
        for (let i = 0; i < total; i++) od.chunks[i] = null;
        od.generatedFlags = new Uint8Array(total);
        if (data.generatedFlags) {
            for (let i = 0; i < data.generatedFlags.length && i < total; i++) {
                od.generatedFlags[i] = data.generatedFlags[i];
            }
        }
        od.biomeMap = new Array(od.worldWidth * od.worldDepth);
        // Snapshot saved-player as overworld playerPos if save was in overworld
        if ((data.currentDimension || 'overworld') === 'overworld' && data.player) {
            od.playerPos = { x: data.player.x, y: data.player.y, z: data.player.z, yaw: data.player.yaw, pitch: data.player.pitch, flying: data.player.flying };
        }
        
        const numOwBatches = data.numChunkBatches || 0;
        for (let b = 0; b < numOwBatches; b++) {
            const batch = await dbGet(slot + '_chunks_' + b);
            if (batch && batch.data) {
                decompressChunksIntoArray(batch.data, od.chunks);
            }
        }
    }
    
    // --- Nether ---
    if (data.netherGenerated && data.numNetherChunkBatches > 0) {
        const nd = dimensionData.nether;
        const netherChunksCount = (typeof _getNetherConfig === 'function') ? _getNetherConfig().netherChunks : owCX;
        nd.chunksX = netherChunksCount;
        nd.chunksZ = netherChunksCount;
        nd.worldWidth = nd.chunksX * CHUNK_SIZE;
        nd.worldDepth = nd.chunksZ * CHUNK_SIZE;
        nd.generated = true;
        const total = nd.chunksX * nd.chunksZ;
        nd.chunks = new Array(total);
        for (let i = 0; i < total; i++) nd.chunks[i] = null;
        nd.generatedFlags = new Uint8Array(total);
        if (data.netherGeneratedFlags) {
            for (let i = 0; i < data.netherGeneratedFlags.length && i < total; i++) {
                nd.generatedFlags[i] = data.netherGeneratedFlags[i];
            }
        }
        nd.biomeMap = new Array(nd.worldWidth * nd.worldDepth);
        if ((data.currentDimension || 'overworld') === 'nether' && data.player) {
            nd.playerPos = { x: data.player.x, y: data.player.y, z: data.player.z, yaw: data.player.yaw, pitch: data.player.pitch, flying: data.player.flying };
        }
        
        const numNtBatches = data.numNetherChunkBatches || 0;
        for (let b = 0; b < numNtBatches; b++) {
            const batch = await dbGet(slot + '_nether_chunks_' + b);
            if (batch && batch.data) {
                decompressChunksIntoArray(batch.data, nd.chunks);
            }
        }
    }
    
    // --- Aether ---
    if (data.aetherGenerated && data.numAetherChunkBatches > 0) {
        const ad = dimensionData.aether;
        ad.chunksX = owCX;
        ad.chunksZ = owCZ;
        ad.worldWidth = ad.chunksX * CHUNK_SIZE;
        ad.worldDepth = ad.chunksZ * CHUNK_SIZE;
        ad.generated = true;
        const total = ad.chunksX * ad.chunksZ;
        ad.chunks = new Array(total);
        for (let i = 0; i < total; i++) ad.chunks[i] = null;
        ad.generatedFlags = new Uint8Array(total);
        if (data.aetherGeneratedFlags) {
            for (let i = 0; i < data.aetherGeneratedFlags.length && i < total; i++) {
                ad.generatedFlags[i] = data.aetherGeneratedFlags[i];
            }
        }
        ad.biomeMap = new Array(ad.worldWidth * ad.worldDepth);
        if ((data.currentDimension || 'overworld') === 'aether' && data.player) {
            ad.playerPos = { x: data.player.x, y: data.player.y, z: data.player.z, yaw: data.player.yaw, pitch: data.player.pitch, flying: data.player.flying };
        }
        
        const numAeBatches = data.numAetherChunkBatches || 0;
        for (let b = 0; b < numAeBatches; b++) {
            const batch = await dbGet(slot + '_aether_chunks_' + b);
            if (batch && batch.data) {
                decompressChunksIntoArray(batch.data, ad.chunks);
            }
        }
    }
    
    // Synthesize the v5-style dimensions metadata so init can use one code path
    data.dimensions = {
        overworld: dimensionData.overworld.generated ? {
            chunksX: dimensionData.overworld.chunksX,
            chunksZ: dimensionData.overworld.chunksZ,
            worldWidth: dimensionData.overworld.worldWidth,
            worldDepth: dimensionData.overworld.worldDepth,
            generated: true,
            hasBiomes: false,  // v4 didn't persist biomes — init must reconstruct
            playerPos: dimensionData.overworld.playerPos,
        } : null,
        nether: dimensionData.nether.generated ? {
            chunksX: dimensionData.nether.chunksX,
            chunksZ: dimensionData.nether.chunksZ,
            worldWidth: dimensionData.nether.worldWidth,
            worldDepth: dimensionData.nether.worldDepth,
            generated: true,
            hasBiomes: false,
            playerPos: dimensionData.nether.playerPos,
        } : null,
        aether: dimensionData.aether.generated ? {
            chunksX: dimensionData.aether.chunksX,
            chunksZ: dimensionData.aether.chunksZ,
            worldWidth: dimensionData.aether.worldWidth,
            worldDepth: dimensionData.aether.worldDepth,
            generated: true,
            hasBiomes: false,
            playerPos: dimensionData.aether.playerPos,
        } : null,
    };
    data.currentDimension = data.currentDimension || 'overworld';
    
    netherGenerated = !!(dimensionData.nether && dimensionData.nether.generated);
    aetherGenerated = !!(dimensionData.aether && dimensionData.aether.generated);
}

// --- Save & Quit (called from pause menu) ---

async function saveAndQuit() {
    if (activeWorldSlot < 0) {
        // No slot assigned yet — this was a new world, assign to a slot
        const allRecords = await dbGetAll();
        const usedSlots = new Set(allRecords.filter(s => typeof s.slot === 'number').map(s => s.slot));
        // Find first free slot
        activeWorldSlot = -1;
        for (let i = 0; i < MAX_SLOTS; i++) {
            if (!usedSlots.has(i)) { activeWorldSlot = i; break; }
        }
        // If all slots full, overwrite slot 0
        if (activeWorldSlot < 0) activeWorldSlot = 0;
    }
    
    try {
        await saveWorld(activeWorldSlot);
        // Close the database connection to ensure all writes are flushed
        if (_saveDB) {
            _saveDB.close();
            _saveDB = null;
        }
        // Small delay to let IndexedDB fully commit before page unload
        await new Promise(r => setTimeout(r, 100));
    } catch(e) {
        console.error('Save failed:', e);
    }
    
    location.reload();
}

// --- World Select Screen ---

async function showWorldSelect() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('world-select').classList.remove('hidden');
    requestAnimationFrame(() => drawDirtBg('dirt-bg-ws'));
    
    selectedWorldSlot = -1;
    updateWorldSelectButtons();
    await renderWorldList();
}

async function renderWorldList() {
    const container = document.getElementById('world-list');
    container.innerHTML = '';
    
    const allRecords = await dbGetAll();
    const saveMap = {};
    allRecords.forEach(s => { 
        // Only include metadata records (numeric slot), not chunk batches (string keys)
        if (typeof s.slot === 'number') saveMap[s.slot] = s; 
    });
    
    for (let i = 0; i < MAX_SLOTS; i++) {
        const save = saveMap[i];
        const slot = document.createElement('div');
        slot.className = 'world-slot' + (save ? '' : ' empty');
        slot.dataset.slot = i;
        
        if (save) {
            const dateStr = new Date(save.timestamp).toLocaleDateString() + ' ' + 
                            new Date(save.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
            const modeStr = (save.gameMode || 'survival').charAt(0).toUpperCase() + (save.gameMode || 'survival').slice(1);
            const sizeStr = save.chunksX * 16 + '×' + save.chunksZ * 16;
            
            slot.innerHTML = `
                <div class="world-slot-icon">🌍</div>
                <div class="world-slot-info">
                    <div class="world-slot-name">${escapeHtml(save.worldName || 'World ' + (i+1))}</div>
                    <div class="world-slot-details">${modeStr} | ${sizeStr} | Seed: ${save.seed}</div>
                    <div class="world-slot-details">${dateStr}</div>
                </div>
            `;
            slot.onclick = () => selectWorldSlot(i);
            slot.ondblclick = () => { selectWorldSlot(i); loadSelectedWorld(); };
        } else {
            slot.innerHTML = `
                <div class="world-slot-icon" style="color:#666;">—</div>
                <div class="world-slot-info">
                    <div class="world-slot-name" style="color:#888;">Empty Slot ${i + 1}</div>
                    <div class="world-slot-details">No world saved</div>
                </div>
            `;
        }
        
        container.appendChild(slot);
    }
    
    // Convert world list text to bitmap font
    if (window.mcFont && window.mcFont.isReady()) {
        var names = container.querySelectorAll('.world-slot-name');
        for (var wi = 0; wi < names.length; wi++) window.mcFont.convertEl(names[wi]);
        var details = container.querySelectorAll('.world-slot-details');
        for (var di = 0; di < details.length; di++) window.mcFont.convertEl(details[di], null, 1);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function selectWorldSlot(slot) {
    selectedWorldSlot = slot;
    
    // Update visual selection
    document.querySelectorAll('.world-slot').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.slot) === slot);
    });
    
    updateWorldSelectButtons();
}

async function updateWorldSelectButtons() {
    const playBtn = document.getElementById('btn-play-world');
    const deleteBtn = document.getElementById('btn-delete-world');
    
    if (selectedWorldSlot < 0) {
        playBtn.disabled = true;
        deleteBtn.disabled = true;
        return;
    }
    
    const save = await dbGet(selectedWorldSlot);
    playBtn.disabled = !save;
    deleteBtn.disabled = !save;
}

async function loadSelectedWorld() {
    if (selectedWorldSlot < 0) return;
    const save = await dbGet(selectedWorldSlot);
    if (!save) return;
    
    await loadWorldFromSlot(selectedWorldSlot);
}

async function deleteSelectedWorld() {
    if (selectedWorldSlot < 0) return;
    const save = await dbGet(selectedWorldSlot);
    if (!save) return;
    
    if (!confirm(`Delete "${save.worldName || 'World ' + (selectedWorldSlot+1)}"? This cannot be undone!`)) return;
    
    // Delete chunk batches (overworld + nether)
    const numBatches = save.numChunkBatches || 0;
    for (let b = 0; b < numBatches; b++) {
        await dbDelete(selectedWorldSlot + '_chunks_' + b);
    }
    const numNetherBatches = save.numNetherChunkBatches || 0;
    for (let b = 0; b < numNetherBatches; b++) {
        await dbDelete(selectedWorldSlot + '_nether_chunks_' + b);
    }
    const numAetherBatches = save.numAetherChunkBatches || 0;
    for (let b = 0; b < numAetherBatches; b++) {
        await dbDelete(selectedWorldSlot + '_aether_chunks_' + b);
    }
    
    // Delete metadata
    await dbDelete(selectedWorldSlot);
    selectedWorldSlot = -1;
    updateWorldSelectButtons();
    await renderWorldList();
}

// --- Hook into Create World flow ---
// When creating a new world, assign a slot

const _originalStartWorldCreation = typeof startWorldCreation === 'function' ? startWorldCreation : null;

async function startWorldCreationWithSlot() {
    // Find a free slot for this new world
    const allRecords = await dbGetAll();
    const usedSlots = new Set(allRecords.filter(s => typeof s.slot === 'number').map(s => s.slot));
    activeWorldSlot = -1;
    for (let i = 0; i < MAX_SLOTS; i++) {
        if (!usedSlots.has(i)) { activeWorldSlot = i; break; }
    }
    if (activeWorldSlot < 0) {
        if (!confirm('Both save slots are full. Creating a new world will require overwriting a save when you quit. Continue?')) return;
        activeWorldSlot = 0;
    }
    
    // Capture world name
    const nameEl = document.getElementById('world-name');
    currentWorldName = (nameEl && nameEl.value.trim()) || 'New World';
    
    // Call the original startWorldCreation
    if (_originalStartWorldCreation) {
        await _originalStartWorldCreation();
    }
}

// Override the original function
window.startWorldCreation = startWorldCreationWithSlot;

// --- Update showMainMenu and showCreateWorld to handle world-select screen ---

const _origShowMainMenu = typeof showMainMenu === 'function' ? showMainMenu : null;
window.showMainMenu = function() {
    document.getElementById('world-select').classList.add('hidden');
    if (_origShowMainMenu) _origShowMainMenu();
    requestAnimationFrame(() => drawDirtBg('dirt-bg'));
};

const _origShowCreateWorld = typeof showCreateWorld === 'function' ? showCreateWorld : null;
window.showCreateWorld = function() {
    document.getElementById('world-select').classList.add('hidden');
    if (_origShowCreateWorld) _origShowCreateWorld();
};

// Add resize handler for world select bg
window.addEventListener('resize', () => {
    if (!document.getElementById('world-select').classList.contains('hidden')) drawDirtBg('dirt-bg-ws');
});