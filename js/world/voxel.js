// ==========================================
// VOXEL DATA ACCESS
// ==========================================

// --- 3. WORLD GENERATION & DATA ---

// Precomputed half-world constants (updated on init)
let _halfW = 0, _halfD = 0;
function _updateWorldHalves() { _halfW = WORLD_WIDTH >> 1; _halfD = WORLD_DEPTH >> 1; }

// v332 Fix C: gate setVoxel allocation behind a worldgen context.
// Gameplay callers (fluid sim, redstone, TNT, etc.) hit setVoxel for blocks
// that may fall in not-yet-generated chunks. Before, setVoxel silently
// allocated those chunks, producing partial-data fragments that the
// save-side sanitize then promoted to "generated=1" (because they had
// SOME non-zero blocks). Now setVoxel only allocates when a worldgen
// function explicitly opens this window. Non-gen callers writing to a
// null chunk slot become silent no-ops, which is the right behavior:
// fluids can't flow into terrain that doesn't exist yet.
//
// We use a counter (not a boolean) so nested gen calls — e.g. tree
// leaves on a chunk edge that spill into a neighbor mid-gen — are
// handled correctly, and so a thrown exception in one gen call doesn't
// leave the counter in a corrupted state if try/finally is used.
let _inWorldGenDepth = 0;
function _enterWorldGen() { _inWorldGenDepth++; }
function _exitWorldGen() {
    _inWorldGenDepth--;
    if (_inWorldGenDepth < 0) _inWorldGenDepth = 0;
}
function _isInWorldGen() { return _inWorldGenDepth > 0; }

// Legacy string-key helpers (used by worldgen/lighting non-hot paths)
function _getChunk(key) {
    const parts = key.split(',');
    return _getChunkFast(parseInt(parts[0]), parseInt(parts[1]));
}
function _getOrCreateChunk(key) {
    const parts = key.split(',');
    return _getOrCreateChunkFast(parseInt(parts[0]), parseInt(parts[1]));
}

// Inline chunk access - the absolute hot path. No object allocation.
function getVoxel(x, y, z) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return 0;
    const cx = ix >> 4; // /16
    const cz = iz >> 4;
    const chunk = chunkStorageArr[cx * CHUNKS_Z + cz];
    if (!chunk) return 0;
    return chunk[(ix & 15) + (iy << 4) + ((iz & 15) << 12)]; // lx + iy*16 + lz*16*256
}

function getVoxelIndex(x, y, z) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return -1;
    return ix + iy * WORLD_WIDTH + iz * WORLD_WIDTH * WORLD_HEIGHT;
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

function setSunLight(x, y, z, val) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return;
    const cx = ix >> 4, cz = iz >> 4;
    // Use _getChunkFast (returns null for missing chunks) instead of
    // _getOrCreateChunkFast. Empty chunks have no blocks to render, so
    // storing light data in them is wasted memory. Without this, lighting
    // recalculation on a sparsely-loaded world (e.g. after loading a save)
    // can OOM by allocating a 256KB Int32Array for every empty cell in the
    // bounding box of generated chunks.
    const chunk = _getChunkFast(cx, cz);
    if (!chunk) return;
    const li = (ix & 15) + (iy << 4) + ((iz & 15) << 12);
    chunk[li] = (chunk[li] & ~(0xF << 14)) | (val << 14);
}

function setTorchLight(x, y, z, val) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return;
    const cx = ix >> 4, cz = iz >> 4;
    // Same fix as setSunLight: skip null chunks instead of allocating.
    const chunk = _getChunkFast(cx, cz);
    if (!chunk) return;
    const li = (ix & 15) + (iy << 4) + ((iz & 15) << 12);
    chunk[li] = (chunk[li] & ~(0xF << 18)) | (val << 18);
}

function setVoxel(x, y, z, id, level = 0, falling = 0, source = 0) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return;
    const cx = ix >> 4, cz = iz >> 4;
    // v332 Fix C: only worldgen may allocate a chunk via setVoxel.
    // Non-gen callers (fluid sim, redstone, TNT, etc.) writing to a
    // null slot become silent no-ops — previously they would create
    // partial-data fragments that survived save/load as "generated".
    let chunk;
    if (_inWorldGenDepth > 0) {
        chunk = _getOrCreateChunkFast(cx, cz);
    } else {
        chunk = chunkStorageArr[cx * CHUNKS_Z + cz];
        if (!chunk) return;
    }
    const li = (ix & 15) + (iy << 4) + ((iz & 15) << 12);
    const lightBits = chunk[li] & 0x003FC000;
    chunk[li] = id | (level << 8) | (falling << 12) | (source << 13) | lightBits;
}

function getHighestBlock(x, z) {
    const ix = (x | 0) + _halfW;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iz >>> 0) >= WORLD_DEPTH) return 0;
    const chunk = chunkStorageArr[(ix >> 4) * CHUNKS_Z + (iz >> 4)];
    if (!chunk) return 0;
    const base = (ix & 15) + ((iz & 15) << 12);
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = chunk[base + (y << 4)] & 0xFF;
        if (id !== 0 && id !== 16 && id !== 17 && id !== 23 && id !== 24 && id !== 26 && id !== 27 && id !== 42 && id !== 66 && id !== 67 && id !== 116 && id !== 117 && id !== 118 && id !== 64 && id !== 202) return y;
    }
    return 0;
}
