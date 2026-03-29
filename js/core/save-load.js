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

function compressChunks() {
    // RLE compress each non-null chunk to dramatically reduce size
    // Most chunks are 90%+ air or repeated stone, so RLE is very effective
    const total = CHUNKS_X * CHUNKS_Z;
    const chunkEntries = [];
    for (let i = 0; i < total; i++) {
        const chunk = chunkStorageArr[i];
        if (!chunk) continue;
        
        // Check if chunk is entirely empty (all zeros) - skip it
        let hasData = false;
        for (let j = 0; j < chunk.length; j++) {
            if (chunk[j] !== 0) { hasData = true; break; }
        }
        if (!hasData) continue;
        
        // RLE encode: [value, runLength, value, runLength, ...]
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
        
        // Store as Int32Array buffer (pairs of value,count)
        chunkEntries.push({ idx: i, rle: new Int32Array(rle).buffer });
    }
    return chunkEntries;
}

function decompressChunks(entries) {
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
        chunkStorageArr[entry.idx] = chunk;
    }
}

// --- Save world to a slot ---

async function saveWorld(slot) {
    const saveStart = performance.now();
    
    // Delete any old chunk batches for this slot (both dimensions)
    const db = await openSaveDB();
    const tx1 = db.transaction(SAVE_STORE, 'readwrite');
    const store1 = tx1.objectStore(SAVE_STORE);
    const allKeys = await new Promise((res, rej) => {
        const req = store1.getAllKeys();
        req.onsuccess = () => res(req.result);
        req.onerror = rej;
    });
    for (const key of allKeys) {
        if (typeof key === 'string' && (key.startsWith(slot + '_chunks_') || key.startsWith(slot + '_nether_chunks_'))) {
            store1.delete(key);
        }
    }
    await new Promise((res, rej) => { tx1.oncomplete = res; tx1.onerror = rej; });
    
    const BATCH_SIZE = 128;
    
    // Determine which arrays hold overworld vs nether data right now
    let owChunkArr, owGenFlags;
    let ntChunkArr, ntGenFlags;
    
    if (currentDimension === 'overworld') {
        owChunkArr = chunkStorageArr;
        owGenFlags = generatedChunksArr;
        ntChunkArr = netherChunkStorage;
        ntGenFlags = netherGeneratedChunks;
    } else {
        // Player is in nether — active arrays are nether, stored arrays are overworld
        ntChunkArr = chunkStorageArr;
        ntGenFlags = generatedChunksArr;
        owChunkArr = overworldChunkStorage;
        owGenFlags = overworldGeneratedChunks;
    }
    
    // --- Save overworld chunks (key: slot_chunks_N) ---
    const savedActive = chunkStorageArr;
    chunkStorageArr = owChunkArr;
    const owCompressed = compressChunks();
    chunkStorageArr = savedActive;
    
    const numOwBatches = Math.ceil(owCompressed.length / BATCH_SIZE);
    for (let b = 0; b < numOwBatches; b++) {
        const batch = owCompressed.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        await dbPut({ slot: slot + '_chunks_' + b, data: batch });
    }
    
    // --- Save nether chunks if generated (key: slot_nether_chunks_N) ---
    let numNtBatches = 0;
    if (netherGenerated && ntChunkArr) {
        chunkStorageArr = ntChunkArr;
        const ntCompressed = compressChunks();
        chunkStorageArr = savedActive;
        
        numNtBatches = Math.ceil(ntCompressed.length / BATCH_SIZE);
        for (let b = 0; b < numNtBatches; b++) {
            const batch = ntCompressed.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
            await dbPut({ slot: slot + '_nether_chunks_' + b, data: batch });
        }
    }
    
    // Save metadata (small - no chunk data here)
    const saveData = {
        slot: slot,
        version: 4,
        timestamp: Date.now(),
        worldName: currentWorldName || 'World ' + (slot + 1),
        seed: _worldSeed,
        gameMode: gameMode,
        chunksX: CHUNKS_X,
        chunksZ: CHUNKS_Z,
        numChunkBatches: numOwBatches,
        numNetherChunkBatches: numNtBatches,
        
        // --- DIMENSION STATE ---
        currentDimension: currentDimension || 'overworld',
        netherGenerated: netherGenerated || false,
        portalLinks: window._portalLinks ? JSON.parse(JSON.stringify(window._portalLinks)) : [],
        
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
            foliageDensity: GEN_FOLIAGE_DENSITY
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
        generatedFlags: owGenFlags ? Array.from(owGenFlags) : Array.from(generatedChunksArr),
        netherGeneratedFlags: ntGenFlags ? Array.from(ntGenFlags) : null,
        // Chest inventories
        chests: (() => {
            if (typeof activeChests === 'undefined') return [];
            const arr = [];
            for (const [key, chest] of activeChests.entries()) {
                arr.push({ key, slots: chest.slots, doublePartner: chest.doublePartner });
            }
            return arr;
        })(),
        // Furnace states
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
        // Dropped items on the ground
        droppedItems: (() => {
            if (typeof droppedItems === 'undefined') return [];
            return droppedItems.map(item => ({
                id: item.id, count: item.count,
                x: item.x, y: item.y, z: item.z,
                vx: item.vx, vy: item.vy, vz: item.vz,
                durability: item.durability !== undefined ? item.durability : undefined
            }));
        })()
    };
    
    await dbPut(saveData);
    
    const elapsed = (performance.now() - saveStart).toFixed(0);
    console.log(`World saved to slot ${slot} in ${elapsed}ms (${owCompressed.length} OW chunks, ${numNtBatches} nether batches, dim=${currentDimension})`);
}

// --- Load world from a slot ---

async function loadWorldFromSlot(slot) {
    const data = await dbGet(slot);
    if (!data) { alert('No save data in slot ' + (slot + 1)); return; }
    
    activeWorldSlot = slot;
    currentWorldName = data.worldName || 'World ' + (slot + 1);
    
    // Load overworld chunk batches (always stored as slot_chunks_N)
    const numOwBatches = data.numChunkBatches || 0;
    const owChunks = [];
    for (let b = 0; b < numOwBatches; b++) {
        const batch = await dbGet(slot + '_chunks_' + b);
        if (batch && batch.data) {
            for (const entry of batch.data) owChunks.push(entry);
        }
    }
    data.chunks = owChunks; // init() will decompress these into chunkStorageArr
    
    // Load nether chunk batches if they exist
    const numNtBatches = data.numNetherChunkBatches || 0;
    const ntChunks = [];
    for (let b = 0; b < numNtBatches; b++) {
        const batch = await dbGet(slot + '_nether_chunks_' + b);
        if (batch && batch.data) {
            for (const entry of batch.data) ntChunks.push(entry);
        }
    }
    data.netherChunks = ntChunks;
    
    // Restore world dimensions
    CHUNKS_X_ACTIVE = data.chunksX;
    CHUNKS_Z_ACTIVE = data.chunksZ;
    
    // Restore seed and RNG
    _worldSeed = data.seed;
    seedRng(data.seed);
    
    // Restore game mode
    gameMode = data.gameMode || 'survival';
    worldOptions.gamemode = gameMode;
    
    // Restore dimension state BEFORE init so init can use it
    data._savedDimension = data.currentDimension || 'overworld';
    data._netherGenerated = data.netherGenerated || false;
    data._portalLinks = data.portalLinks || [];
    
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
    }
    
    // Show loading screen
    document.getElementById('world-select').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-world-name').textContent = (data.worldName || 'World') + ' (Loading...)';
    drawDirtBg('dirt-bg-3');
    
    await yieldToUI();
    
    // Use the existing init() with loadedData to skip generation
    await init(data.seed, data);
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