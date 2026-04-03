// ==========================================
// VOXEL DATA ACCESS
// ==========================================

// --- 3. WORLD GENERATION & DATA ---

// Precomputed half-world constants (updated on init)
let _halfW = 0, _halfD = 0;
function _updateWorldHalves() { _halfW = WORLD_WIDTH >> 1; _halfD = WORLD_DEPTH >> 1; }

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
    const chunk = _getOrCreateChunkFast(cx, cz);
    const li = (ix & 15) + (iy << 4) + ((iz & 15) << 12);
    chunk[li] = (chunk[li] & ~(0xF << 14)) | (val << 14);
}

function setTorchLight(x, y, z, val) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return;
    const cx = ix >> 4, cz = iz >> 4;
    const chunk = _getOrCreateChunkFast(cx, cz);
    const li = (ix & 15) + (iy << 4) + ((iz & 15) << 12);
    chunk[li] = (chunk[li] & ~(0xF << 18)) | (val << 18);
}

function setVoxel(x, y, z, id, level = 0, falling = 0, source = 0) {
    const ix = (x | 0) + _halfW;
    const iy = y | 0;
    const iz = (z | 0) + _halfD;
    if ((ix >>> 0) >= WORLD_WIDTH || (iy >>> 0) >= WORLD_HEIGHT || (iz >>> 0) >= WORLD_DEPTH) return;
    const cx = ix >> 4, cz = iz >> 4;
    const chunk = _getOrCreateChunkFast(cx, cz);
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
