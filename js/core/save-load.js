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
    const EXPECTED = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
    for (const entry of entries) {
        const rle = new Int32Array(entry.rle);
        const chunk = new Int32Array(EXPECTED);
        let pos = 0;
        let overran = false;
        for (let i = 0; i + 1 < rle.length; i += 2) {
            const val = rle[i];
            const count = rle[i + 1];
            for (let j = 0; j < count; j++) {
                if (pos >= EXPECTED) { overran = true; break; }
                chunk[pos++] = val;
            }
            if (overran) break;
        }
        // v332 Fix E: detect malformed RLE. A well-formed chunk RLE must
        // decode to exactly CHUNK_VOLUME entries. If not, the saved record
        // is corrupt — drop the chunk so the sanitize pass clears the
        // generated flag and lazy-gen can regenerate it on load.
        if (pos !== EXPECTED || overran) {
            console.warn('[save-load] dropping malformed chunk idx=' + entry.idx
                + ' pos=' + pos + ' expected=' + EXPECTED
                + ' overran=' + overran);
            if (entry.idx < chunks.length) chunks[entry.idx] = null;
            continue;
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

// Loaded-save repair: chunk records and generated flags are stored separately.
// If a save has chunk data but its generated flag was missing/stale, startup
// lighting can skip that chunk, leaving it with old/dark saved light until a
// block edit forces a local relight. Trust actual chunk data and mark any
// present chunk as generated before init() runs lighting/meshing.
function _repairGeneratedFlagsFromLoadedChunks(d, dimName) {
    _sanitizeDimensionGeneratedFlags(d, dimName || 'overworld');
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

// v6 atomic save keys. Chunks/biomes are written under a unique saveId first,
// then the main slot metadata is committed last. If the browser closes during
// a save, the previous metadata still points at the previous complete key set.
function _dimChunksKeyV6(slot, dimName, saveId, batchIdx) { return slot + '_v6_' + saveId + '_dim_' + dimName + '_chunks_' + batchIdx; }
function _dimBiomesKeyV6(slot, dimName, saveId) { return slot + '_v6_' + saveId + '_dim_' + dimName + '_biomes'; }
function _isCurrentV6DataKey(slot, saveId, key) {
    return (typeof key === 'string' && key.startsWith(slot + '_v6_' + saveId + '_'));
}
function _isSlotDataKey(slot, key) {
    return (typeof key === 'string' && key.startsWith(slot + '_'));
}

function _chunkHasAnyData(chunk) {
    if (!chunk) return false;
    for (let i = 0; i < chunk.length; i++) {
        if ((chunk[i] & 0xFF) !== 0) return true;
    }
    return false;
}

function _isSkyblockSaveLoadContext() {
    try {
        if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 5) return true;
    } catch (_) {}
    try {
        if (typeof window !== 'undefined' && window._saveLoadWorldType === 5) return true;
    } catch (_) {}
    return false;
}

// v332 Fix B: Structural validation. A fully-generated overworld/nether
// chunk always has bedrock (block id 18) at y=0 for every column — gen
// phase 1 unconditionally writes `setVoxel(x, 0, z, 18)`. A partial
// chunk created by a stray setVoxel (e.g. fluid spreading into an
// ungenerated neighbor) will have data somewhere but NO bedrock at
// y=0. We sample five y=0 cells (four corners + center); if any are
// missing bedrock, the chunk is a partial fragment, not a real chunk.
//
// Indexing: li = lx + (ly << 4) + ((lz & 15) << 12). For y=0 the
// (ly << 4) term is 0, so the sample indices are 0, 15, 61440, 61455,
// and 32776.
function _chunkLooksStructurallyGenerated(chunk, dimName) {
    if (!chunk) return false;
    // Aether has floating islands with empty void at y=0 — no bedrock
    // floor, so skip structural validation there.
    if (dimName === 'aether') return _chunkHasAnyData(chunk);

    // Skyblock is intentionally a void/island world with no bedrock floor.
    // The normal overworld bedrock-floor validator would treat every saved
    // Skyblock island/player-built chunk as a partial invalid chunk and delete
    // it during save/load. Preserve any non-empty Skyblock chunk exactly.
    if (dimName === 'overworld' && _isSkyblockSaveLoadContext()) {
        return _chunkHasAnyData(chunk);
    }

    const BEDROCK = 18;
    const samples = [0, 15, 61440, 61455, 32776];
    for (const li of samples) {
        if ((chunk[li] & 0xFF) !== BEDROCK) return false;
    }
    return true;
}

function _stripSavedLightBitsFromDimension(d) {
    if (!d || !d.chunks) return;
    const clearMask = ~0x003FC000;
    for (const chunk of d.chunks) {
        if (!chunk) continue;
        for (let i = 0; i < chunk.length; i++) chunk[i] &= clearMask;
    }
}

// Generated flags are authoritative for lazy worldgen. A stale generated flag
// with no chunk payload makes the engine believe a chunk exists, so it will not
// regenerate it; the result is a full-height void strip after loading. Repair
// this both before saving and after loading. Overworld/nether all-air chunks are
// invalid, while aether can legitimately have empty void chunks.
//
// v332 Fix B: also catch the inverse failure mode — a chunk slot that has
// SOME data but was never fully generated (e.g. fluid spread allocated the
// slot via setVoxel + a few water blocks landed there). Previously these
// were promoted to flag=1 because `_chunkHasAnyData` returned true. Now
// we require structural validation (bedrock floor for non-aether dims).
// Partial chunks get nulled so lazy-gen regenerates them properly.
function _sanitizeDimensionGeneratedFlags(d, dimName) {
    if (!d || !d.generatedFlags) return { cleared: 0, restored: 0, emptyCleared: 0, partialCleared: 0 };
    const n = d.generatedFlags.length;
    let cleared = 0, restored = 0, emptyCleared = 0, partialCleared = 0;
    for (let i = 0; i < n; i++) {
        const chunk = d.chunks && d.chunks[i] ? d.chunks[i] : null;
        if (!chunk) {
            if (d.generatedFlags[i]) cleared++;
            d.generatedFlags[i] = 0;
            continue;
        }
        if (dimName !== 'aether' && !_chunkHasAnyData(chunk)) {
            if (d.generatedFlags[i]) emptyCleared++;
            d.generatedFlags[i] = 0;
            d.chunks[i] = null;
            continue;
        }
        // v332 Fix B: structural validation. If the chunk has data but
        // is missing the bedrock floor, it's a stray-setVoxel fragment.
        // Drop it so lazy-gen produces a real chunk.
        if (!_chunkLooksStructurallyGenerated(chunk, dimName)) {
            partialCleared++;
            d.generatedFlags[i] = 0;
            d.chunks[i] = null;
            continue;
        }
        if (!d.generatedFlags[i]) restored++;
        d.generatedFlags[i] = 1;
    }
    if (cleared || restored || emptyCleared || partialCleared) {
        console.warn(`[save-load] repaired ${dimName} generated flags: clearedMissing=${cleared}, restoredFromData=${restored}, clearedEmpty=${emptyCleared}, clearedPartial=${partialCleared}`);
    }
    return { cleared, restored, emptyCleared, partialCleared };
}

function _sanitizeAllDimensionsForSave() {
    if (typeof dimensionData === 'undefined') return;
    for (const dimName of ['overworld', 'nether', 'aether']) {
        _sanitizeDimensionGeneratedFlags(dimensionData[dimName], dimName);
    }
}

// v331: the render-distance slider can request up to 32 chunks. A 64x64
// storage world only has 32 chunks from center to edge, so radius 32 (+gen
// buffer) exposes the finite world boundary as a straight void strip. Expand
// old 64x64 saves to a larger centered storage grid while preserving world
// chunk coordinates. This fixes the issue at the source instead of treating it
// as save corruption.
function _minChunksForMaxRenderDistance() {
    let maxRd = 32;
    try {
        if (typeof RENDER_DISTANCES !== 'undefined' && RENDER_DISTANCES && RENDER_DISTANCES.length) {
            maxRd = Math.max.apply(null, RENDER_DISTANCES);
        }
    } catch (_) {}
    const needed = (maxRd + 2) * 2 + 1; // visible radius + lazy-gen buffer, both sides + center
    return Math.max(96, needed);
}

function _expandDimensionStorageIfNeeded(d, dimName, minChunks) {
    if (!d || !d.chunksX || !d.chunksZ || !d.chunks) return false;
    const oldCX = d.chunksX | 0;
    const oldCZ = d.chunksZ | 0;
    const newCX = Math.max(oldCX, minChunks | 0);
    const newCZ = Math.max(oldCZ, minChunks | 0);
    if (newCX === oldCX && newCZ === oldCZ) return false;

    const oldW = d.worldWidth || oldCX * CHUNK_SIZE;
    const oldD = d.worldDepth || oldCZ * CHUNK_SIZE;
    const newW = newCX * CHUNK_SIZE;
    const newD = newCZ * CHUNK_SIZE;
    const oldHalfCX = oldCX >> 1, oldHalfCZ = oldCZ >> 1;
    const newHalfCX = newCX >> 1, newHalfCZ = newCZ >> 1;
    const oldHalfW = oldW / 2, oldHalfD = oldD / 2;
    const newHalfW = newW / 2, newHalfD = newD / 2;

    const newChunks = new Array(newCX * newCZ).fill(null);
    const newFlags = new Uint8Array(newCX * newCZ);
    const newBiomeMap = new Array(newW * newD);

    for (let ocx = 0; ocx < oldCX; ocx++) {
        for (let ocz = 0; ocz < oldCZ; ocz++) {
            const oldIdx = ocx * oldCZ + ocz;
            const wcx = ocx - oldHalfCX;
            const wcz = ocz - oldHalfCZ;
            const ncx = wcx + newHalfCX;
            const ncz = wcz + newHalfCZ;
            if (ncx < 0 || ncx >= newCX || ncz < 0 || ncz >= newCZ) continue;
            const newIdx = ncx * newCZ + ncz;
            newChunks[newIdx] = d.chunks[oldIdx] || null;
            if (d.generatedFlags && d.generatedFlags[oldIdx]) newFlags[newIdx] = 1;

            // Copy biome cells for this chunk, if available. World coordinates
            // remain identical; only the centered array offset changes.
            if (d.biomeMap && d.biomeMap.length === oldW * oldD) {
                const startWX = wcx * CHUNK_SIZE;
                const startWZ = wcz * CHUNK_SIZE;
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                        const wx = startWX + lx;
                        const wz = startWZ + lz;
                        const oldG = (wx + oldHalfW) + (wz + oldHalfD) * oldW;
                        const newG = (wx + newHalfW) + (wz + newHalfD) * newW;
                        if (oldG >= 0 && oldG < d.biomeMap.length && newG >= 0 && newG < newBiomeMap.length) {
                            newBiomeMap[newG] = d.biomeMap[oldG];
                        }
                    }
                }
            }
        }
    }

    d.chunksX = newCX;
    d.chunksZ = newCZ;
    d.worldWidth = newW;
    d.worldDepth = newD;
    d.chunks = newChunks;
    d.generatedFlags = newFlags;
    d.biomeMap = newBiomeMap;
    console.warn(`[save-load] expanded ${dimName} storage from ${oldCX}x${oldCZ} to ${newCX}x${newCZ} for 32-chunk render distance support`);
    return true;
}

function _expandAllDimensionsForRenderDistance() {
    if (typeof dimensionData === 'undefined') return;

    // v351: respect the saved world size. Mobile 256x256/512x512 worlds and
    // intentionally small worlds must not be expanded to 96x96 on load. The
    // older v331 expansion was too broad: it treated small saved storage as a
    // corruption/render-distance issue and silently enlarged the world, causing
    // empty far chunks to be generated after reload.
    //
    // Keep this hook as a no-op except for a future explicitly-marked legacy
    // migration. The active render-distance/chunk-repair paths already clamp to
    // CHUNKS_X/CHUNKS_Z bounds, so missing chunks outside a small world are not
    // corruption and should not be generated.
    const allowLegacyExpansion = (typeof window !== 'undefined' && window._allowLegacyStorageExpansion === true);
    if (!allowLegacyExpansion) {
        for (const dimName of ['overworld', 'nether', 'aether']) {
            _sanitizeDimensionGeneratedFlags(dimensionData[dimName], dimName);
        }
        return;
    }

    const minChunks = _minChunksForMaxRenderDistance();
    for (const dimName of ['overworld', 'nether', 'aether']) {
        _expandDimensionStorageIfNeeded(dimensionData[dimName], dimName, minChunks);
        _sanitizeDimensionGeneratedFlags(dimensionData[dimName], dimName);
    }
}

async function _cleanupOldSlotDataKeys(slot, keepSaveId) {
    try {
        const db = await openSaveDB();
        const tx = db.transaction(SAVE_STORE, 'readwrite');
        const store = tx.objectStore(SAVE_STORE);
        const allKeys = await new Promise((res, rej) => {
            const req = store.getAllKeys();
            req.onsuccess = () => res(req.result);
            req.onerror = rej;
        });
        for (const key of allKeys) {
            if (!_isSlotDataKey(slot, key)) continue;
            if (keepSaveId && _isCurrentV6DataKey(slot, keepSaveId, key)) continue;
            store.delete(key);
        }
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (e) {
        console.warn('[save-load] old save-key cleanup failed; harmless stale records may remain', e);
    }

}

// During save, freeze new lazy chunk dispatch and wait for in-flight worldgen
// + lighting adoption to settle. Saving while worker chunks are still arriving
// can snapshot generated flags and chunk payloads out of sync, which later
// shows up as straight missing chunk strips after load.
async function _drainWorldWorkBeforeSave(timeoutMs) {
    const started = performance.now();
    const timeout = Math.max(250, timeoutMs || 4000);
    try { window._saveInProgress = true; } catch(_) {}

    function _countPendingWorkers() {
        let n = 0;
        try { if (typeof _pendingWorkerChunks !== 'undefined' && _pendingWorkerChunks) n += _pendingWorkerChunks.size; } catch(_) {}
        try { if (typeof _pendingNetherChunks !== 'undefined' && _pendingNetherChunks) n += _pendingNetherChunks.size; } catch(_) {}
        try { if (typeof _pendingAetherChunks !== 'undefined' && _pendingAetherChunks) n += _pendingAetherChunks.size; } catch(_) {}
        return n;
    }

    while (performance.now() - started < timeout) {
        try {
            if (typeof window.flushPendingWorldWorkNow === 'function') {
                // Small bounded flush each turn so lighting/dirties keep draining
                window.flushPendingWorldWorkNow(6, 6, 24);
            }
        } catch (e) {
            console.warn('[save-load] flushPendingWorldWorkNow failed during save drain', e);
        }

        const pendingWorkers = _countPendingWorkers();
        const pendingLight = (typeof _pendingLightingChunks !== 'undefined' && _pendingLightingChunks) ? _pendingLightingChunks.length : 0;
        const pendingMesh = (typeof _pendingMeshRequests !== 'undefined' && _pendingMeshRequests) ? _pendingMeshRequests.size : 0;
        if (pendingWorkers === 0 && pendingLight === 0 && pendingMesh === 0) break;
        await new Promise(r => setTimeout(r, 16));
    }

    // One last flush to capture anything that resolved on the final wait tick.
    try { if (typeof window.flushPendingWorldWorkNow === 'function') window.flushPendingWorldWorkNow(12, 12, 64); } catch(_) {}
}

// Heals loaded saves that have null chunk holes inside the player's current
// visible load radius (for example from an interrupted older save). We repair
// these BEFORE startup lighting so fresh-load lighting sees the same chunk
// neighborhood that a newly-created world would.
async function _repairVisibleChunkHolesAfterLoad(centerX, centerZ, radiusChunks) {
    if (!useLazyGeneration || !chunkStorageArr || !generatedChunksArr) return 0;
    const pCx = Math.floor((centerX + Math.floor(WORLD_WIDTH / 2)) / CHUNK_SIZE);
    const pCz = Math.floor((centerZ + Math.floor(WORLD_DEPTH / 2)) / CHUNK_SIZE);
    const r = Math.max(0, radiusChunks | 0);
    const coords = [];
    for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
            const cx = pCx + dx;
            const cz = pCz + dz;
            if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) continue;
            const idx = cx * CHUNKS_Z + cz;
            if (generatedChunksArr[idx] && chunkStorageArr[idx]) continue;
            coords.push({ cx, cz, d: dx*dx + dz*dz });
        }
    }
    if (coords.length === 0) return 0;
    coords.sort((a,b) => a.d - b.d);
    const ordered = coords.map(c => ({cx:c.cx, cz:c.cz}));
    if (typeof ensureChunksGeneratedBatch === 'function') {
        await ensureChunksGeneratedBatch(ordered, null, typeof ensureChunkGenerated === 'function' ? ensureChunkGenerated : null);
    } else if (typeof ensureChunkGenerated === 'function') {
        for (const c of ordered) ensureChunkGenerated(c.cx, c.cz);
    }
    return ordered.length;
}


// --- Save world to a slot (v5 format) ---
//
// New design: walks dimensionData directly. For each dimension that's been
// generated, RLE-compresses chunks and biomes, writes batches to IndexedDB.
// No more swap dance — each dimension's data is independently accessible
// from dimensionData[name].

async function saveWorld(slot) {
    const saveStart = performance.now();

    // Freeze new lazy chunk dispatch and let in-flight worldgen/lighting settle
    // so the save snapshots a coherent chunk set instead of mixing old/new edges.
    await _drainWorldWorkBeforeSave(4500);
    
    // Snapshot the player's current position into the active dimension and
    // make sure no stale generated flags can be committed. The stale flag case
    // is the root cause of rare full-height void strips: the save says a chunk
    // is generated, but no chunk data exists, so load/lazy-gen never fills it.
    if (typeof _snapshotPlayerPosToCurrentDim === 'function') {
        _snapshotPlayerPosToCurrentDim();
    }
    _sanitizeAllDimensionsForSave();
    
    const db = await openSaveDB();
    const BATCH_SIZE = 128;
    const saveId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const dimsMeta = {};
    let totalChunksSaved = 0;
    
    // Write chunk/biome payloads under unique v6 keys first. Do NOT delete or
    // overwrite the previous committed data until the new metadata has been
    // safely committed at the end.
    for (const dimName of ['overworld', 'nether', 'aether']) {
        const d = dimensionData[dimName];
        if (!d || !d.generated || !d.chunks) {
            dimsMeta[dimName] = null;
            continue;
        }
        _sanitizeDimensionGeneratedFlags(d, dimName);
        
        const compressed = compressChunksFromArray(d.chunks);
        const numBatches = Math.ceil(compressed.length / BATCH_SIZE);
        for (let b = 0; b < numBatches; b++) {
            const batch = compressed.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
            await dbPut({ slot: _dimChunksKeyV6(slot, dimName, saveId, b), data: batch });
        }
        
        let hasBiomes = false;
        if (d.biomeMap && d.biomeMap.length > 0) {
            const compressedBiomes = compressBiomeMap(d.biomeMap);
            if (compressedBiomes) {
                await dbPut({ slot: _dimBiomesKeyV6(slot, dimName, saveId), data: compressedBiomes });
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
    
    const saveData = {
        slot: slot,
        version: 6,
        saveId: saveId,
        timestamp: Date.now(),
        worldName: currentWorldName || 'World ' + (slot + 1),
        seed: _worldSeed,
        gameMode: gameMode,
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
            hungerEnabled: (typeof GEN_HUNGER_ENABLED !== 'undefined' ? GEN_HUNGER_ENABLED : true),
            monolithsEnabled: (typeof GEN_MONOLITHS_ENABLED !== 'undefined' ? GEN_MONOLITHS_ENABLED : false),
            monolithChance: (typeof GEN_MONOLITH_CHANCE !== 'undefined' ? GEN_MONOLITH_CHANCE : 0.1),
            aetherEnabled: (typeof GEN_AETHER_ENABLED !== 'undefined' ? GEN_AETHER_ENABLED : true),
            superflatLayers: (typeof GEN_SUPERFLAT_LAYERS !== 'undefined' ? GEN_SUPERFLAT_LAYERS : null),
            superflatPreset: (typeof GEN_SUPERFLAT_PRESET !== 'undefined' ? GEN_SUPERFLAT_PRESET : 'classic'),
            worldType: (typeof GEN_WORLD_TYPE !== 'undefined' ? GEN_WORLD_TYPE : (typeof worldOptions !== 'undefined' ? worldOptions.worldtype : 0)),
            biomeOverrides: GEN_BIOME_OVERRIDES
        },
        worldSpawnX: window.worldSpawnX || 0,
        worldSpawnY: window.worldSpawnY || 64,
        worldSpawnZ: window.worldSpawnZ || 0,
        player: {
            x: player.x, y: player.y, z: player.z,
            yaw: player.yaw, pitch: player.pitch,
            health: player.health, maxHealth: player.maxHealth,
            hunger: player.hunger, saturation: player.saturation, exhaustion: player.exhaustion,
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
                age: item.age || 0,
                pickupDelay: item.pickupDelay || 0,
                onGroundForMerge: item.onGroundForMerge === true,
                durability: item.durability !== undefined ? item.durability : undefined
            }));
        })(),
        xpState: typeof window.getPlayerXPState === 'function' ? window.getPlayerXPState() : { level: 0, xp: 0, totalXP: 0 }
    };
    
    // Commit metadata LAST. After this point the new save is live.
    await dbPut(saveData);
    
    // Cleanup is intentionally after commit and best-effort only. A failed
    // cleanup leaves stale records, not a corrupted world.
    await _cleanupOldSlotDataKeys(slot, saveId);
    
    const elapsed = (performance.now() - saveStart).toFixed(0);
    try { window._saveInProgress = false; } catch(_) {}
    console.log(`World saved to slot ${slot} in ${elapsed}ms (v6 atomic: ${totalChunksSaved} chunks total, current=${currentDimension})`);
}

// --- Load world from a slot (v5 + v4 migration) ---
//
// New design: reads metadata, populates dimensionData for each saved
// dimension, then calls init() which binds the active dimension and runs
// lighting/meshing. v4 saves are migrated by reading old keys into the
// dimensionData structure; on next save they get written in v5 format.


// v376: Superflat worlds must be plains-only for tinting forever.
// Saved biome maps can contain stale mixed biome names from old mesh/save paths,
// so loading a superflat save overwrites the entire overworld biome map to plains
// and clears tint/mesh biome caches before remeshing.
function _forceSuperflatOverworldBiomesToPlains() {
    try {
        if (typeof GEN_WORLD_TYPE === 'undefined' || GEN_WORLD_TYPE !== 1) return;
        const od = (typeof dimensionData !== 'undefined' && dimensionData.overworld) ? dimensionData.overworld : null;
        if (od && od.biomeMap) {
            const len = od.worldWidth && od.worldDepth ? (od.worldWidth * od.worldDepth) : od.biomeMap.length;
            for (let i = 0; i < len; i++) od.biomeMap[i] = 'plains';
        }
        if (typeof currentDimension !== 'undefined' && currentDimension === 'overworld'
            && typeof biomeMap !== 'undefined' && biomeMap) {
            const len = (typeof WORLD_WIDTH !== 'undefined' && typeof WORLD_DEPTH !== 'undefined')
                ? (WORLD_WIDTH * WORLD_DEPTH)
                : biomeMap.length;
            for (let i = 0; i < len; i++) biomeMap[i] = 'plains';
        }
        if (typeof _biomeTintCache !== 'undefined' && _biomeTintCache) _biomeTintCache.clear();
        if (typeof _biomeFoliageTintCache !== 'undefined' && _biomeFoliageTintCache) _biomeFoliageTintCache.clear();
        if (typeof _biomeWaterTintCache !== 'undefined' && _biomeWaterTintCache) _biomeWaterTintCache.clear();
        if (typeof _biomeStripsSent !== 'undefined' && _biomeStripsSent) _biomeStripsSent.clear();
        if (typeof dirtyChunks !== 'undefined' && dirtyChunks && typeof dimensionData !== 'undefined') {
            const d = dimensionData.overworld;
            if (d && d.generatedFlags && d.chunksX && d.chunksZ) {
                const hx = d.chunksX >> 1, hz = d.chunksZ >> 1;
                for (let cx = 0; cx < d.chunksX; cx++) {
                    for (let cz = 0; cz < d.chunksZ; cz++) {
                        if (d.generatedFlags[cx * d.chunksZ + cz] === 1) {
                            dirtyChunks.add((cx - hx) + ',' + (cz - hz));
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Superflat plains biome repair failed:', e);
    }
}
if (typeof window !== 'undefined') window._forceSuperflatOverworldBiomesToPlains = _forceSuperflatOverworldBiomesToPlains;


async function loadWorldFromSlot(slot) {
    const data = await dbGet(slot);
    if (!data) { alert('No save data in slot ' + (slot + 1)); return; }
    
    activeWorldSlot = slot;
    currentWorldName = data.worldName || 'World ' + (slot + 1);

    // _loadV5IntoData repairs/sanitizes chunks before genParams are restored
    // into GEN_WORLD_TYPE. Preserve the saved world type here so Skyblock chunks
    // are not mistaken for invalid partial overworld chunks.
    try {
        if (typeof window !== 'undefined') {
            window._saveLoadWorldType = data.genParams && typeof data.genParams.worldType === 'number'
                ? data.genParams.worldType
                : null;
        }
    } catch (_) {}

    // Branch on save format version
    if ((data.version || 0) >= 5) {
        await _loadV5IntoData(slot, data);
    } else {
        await _loadV4IntoData(slot, data);
    }

    // v351: sanitize loaded generated flags, but preserve the saved storage
    // size. Small/mobile worlds must not be expanded on load.
    _expandAllDimensionsForRenderDistance();
    
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
        if (typeof GEN_HUNGER_ENABLED !== 'undefined' || true) {
            GEN_HUNGER_ENABLED = data.genParams.hungerEnabled !== undefined ? data.genParams.hungerEnabled : true;
            if (typeof worldOptions !== 'undefined') worldOptions.hungerEnabled = GEN_HUNGER_ENABLED;
        }
        GEN_MONOLITHS_ENABLED = data.genParams.monolithsEnabled === true;
        GEN_MONOLITH_CHANCE = (typeof data.genParams.monolithChance === 'number') ? data.genParams.monolithChance : 0.1;
        if (typeof worldOptions !== 'undefined') {
            worldOptions.monolithsEnabled = GEN_MONOLITHS_ENABLED;
            worldOptions.monolithChance = GEN_MONOLITH_CHANCE;
        }
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
            // v264: ALSO update GEN_WORLD_TYPE so the worldgen workers see the
            // right preset. Without this, loading a superflat (or amplified, or
            // single-biome) world reverts to default overworld generation
            // because the workers only check GEN_WORLD_TYPE, not worldOptions.
            if (typeof GEN_WORLD_TYPE !== 'undefined') {
                GEN_WORLD_TYPE = data.genParams.worldType;
            }
        }
        _forceSuperflatOverworldBiomesToPlains();
        if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 6) {
            // Beta 1.7.3 saved worlds always keep the preset-locked gameplay
            // and generation behavior.
            GEN_HUNGER_ENABLED = false;
            GEN_XP_ENABLED = false;
            GEN_RAVINE_FREQUENCY = 0;
            GEN_SINGLE_BIOME = '';
            GEN_SMOOTHNESS = Math.max(GEN_SMOOTHNESS, 165);
            GEN_VOLATILITY_MULT = Math.min(GEN_VOLATILITY_MULT, 85);
            GEN_TERRAIN_HEIGHT = Math.min(GEN_TERRAIN_HEIGHT, 80);
            GEN_BIOME_SCALE = Math.max(GEN_BIOME_SCALE, 260);
            if (typeof GEN_AETHER_ENABLED !== 'undefined') GEN_AETHER_ENABLED = false;
            if (typeof worldOptions !== 'undefined') {
                worldOptions.hungerEnabled = false;
                worldOptions.xpenabled = false;
                worldOptions.aetherEnabled = false;
            }
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
        
        // Load chunk batches. v6 uses unique atomic payload keys; v5 uses
        // the legacy fixed keys.
        const saveId = data.saveId || null;
        const numBatches = dimMeta.numChunkBatches || 0;
        for (let b = 0; b < numBatches; b++) {
            const key = (data.version || 0) >= 6 && saveId
                ? _dimChunksKeyV6(slot, dimName, saveId, b)
                : _dimChunksKey(slot, dimName, b);
            const batch = await dbGet(key);
            if (batch && batch.data) {
                decompressChunksIntoArray(batch.data, d.chunks);
            } else {
                console.warn('[save-load] missing chunk batch during load', key);
            }
        }
        
        _repairGeneratedFlagsFromLoadedChunks(d, dimName);
        _stripSavedLightBitsFromDimension(d);

        // Load biomes
        if (dimMeta.hasBiomes) {
            const biomeKey = (data.version || 0) >= 6 && saveId
                ? _dimBiomesKeyV6(slot, dimName, saveId)
                : _dimBiomesKey(slot, dimName);
            const biomeRec = await dbGet(biomeKey);
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
        _repairGeneratedFlagsFromLoadedChunks(od, 'overworld');
        _stripSavedLightBitsFromDimension(od);
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
        _repairGeneratedFlagsFromLoadedChunks(nd, 'nether');
        _stripSavedLightBitsFromDimension(nd);
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
        _repairGeneratedFlagsFromLoadedChunks(ad, 'aether');
        _stripSavedLightBitsFromDimension(ad);
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
    if (window.MusicManager && typeof window.MusicManager.stopForMenu === 'function') {
        window.MusicManager.stopForMenu();
    }
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
        try { window._saveInProgress = false; } catch(_) {}
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