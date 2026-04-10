// ==========================================
// WORLD GEN NOISE INITIALIZATION
// ==========================================

// ==========================================
// WORLD GENERATION - Chunked & Lazy Support
// ==========================================

// Persistent noise instances (created once per world, reused for lazy gen)
let _wgPerlinTemp, _wgPerlinHumid, _wgPerlinElevation, _wgPerlinVolatility, _wgPerlin3D, _wgPerlinMountains, _wgPerlinOcean, _wgPerlinSeabed, _wgPerlinClay, _wgPerlinRiver, _wgPerlinRiver2;
let _wgCavePrimary;
let _wgTerrainMult, _wgBiomeScale, _wgSmoothness, _wgCaveDensityMult;

// Store biome info sparsely per chunk column
const chunkBiomeCache = new Map();

// --- NEW: WORLD-GEN PREFABS & PASTER ---
const DUNGEON_0 = {"width":7,"height":5,"depth":7,"dimension":"overworld","biome":"any","blocks":[33,33,33,33,33,33,33,33,33,33,33,48,33,33,33,33,48,33,33,33,33,33,33,33,33,33,48,33,33,33,33,48,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,0,0,33,33,33,33,33,0,0,0,0,0,33,33,0,0,0,0,93,33,33,0,0,54,0,0,33,33,0,0,0,0,0,33,48,0,93,0,0,0,33,33,33,33,48,33,48,33,33,0,0,48,33,33,33,48,0,0,0,0,0,48,33,0,0,0,0,0,33,33,0,0,0,0,0,48,48,0,0,0,0,0,33,33,0,0,0,0,0,33,33,33,33,33,48,33,33,33,0,0,33,33,33,33,33,0,0,0,0,0,33,33,0,0,0,0,0,33,33,0,0,0,0,0,33,33,0,0,0,0,0,48,33,0,0,0,0,0,33,33,48,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,48,33,33,33,33,33,33,48,33,33,33,48,48,48,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33,33]};

function _pastePrefabWorldGen(prefab, blockX, blockY, blockZ) {
    const { width, height, depth, blocks } = prefab;
    const offsetX = Math.floor(width / 2);
    const offsetZ = Math.floor(depth / 2);

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                const i = x + (z * width) + (y * width * depth);
                const blockId = blocks[i];
                
                const targetX = blockX + x - offsetX;
                const targetY = blockY + y;
                const targetZ = blockZ + z - offsetZ;
                
                const currentId = getVoxel(targetX, targetY, targetZ) & 0xFF;
                if (currentId !== 18) { // Never overwrite bedrock
                    setVoxel(targetX, targetY, targetZ, blockId);
                    
                    // Register spawner blocks so they get the zombie model + spawning behavior
                    if (blockId === 54 && typeof window.registerSpawner === 'function') {
                        window.registerSpawner(targetX, targetY, targetZ);
                    }
                    
                    // Fill loot chests with random loot
                    if (blockId === 93 && typeof window.fillLootChest === 'function') {
                        window.fillLootChest(targetX, targetY, targetZ);
                    }
                }
            }
        }
    }
}
// ------------------------------------

const BIOME_IDS = { 'desert': 0, 'rainforest': 1, 'tundra': 2, 'taiga': 3, 'plains': 4, 'forest': 5, 'ocean': 6, 'swamp': 7, 'jungle': 8, 'extreme_hills': 9, 'aether_skyforest': 10, 'aether_void': 11, 'aether_lake': 12, 'alpha_forest': 13 };
const BIOME_NAMES = ['desert', 'rainforest', 'tundra', 'taiga', 'plains', 'forest', 'ocean', 'swamp', 'jungle', 'extreme_hills', 'aether_skyforest', 'aether_void', 'aether_lake', 'alpha_forest'];

function _initWorldGenNoise() {
    const s1 = (_worldSeed * 0.00000001) % 1;
    const s2 = ((_worldSeed * 7 + 13) * 0.00000001) % 1;
    const s3 = ((_worldSeed * 31 + 97) * 0.00000001) % 1;
    const s4 = ((_worldSeed * 127 + 251) * 0.00000001) % 1;
    const s5 = ((_worldSeed * 53 + 179) * 0.00000001) % 1;
    const s6 = ((_worldSeed * 89 + 311) * 0.00000001) % 1; 
    const s7 = ((_worldSeed * 101 + 409) * 0.00000001) % 1; // NEW: Ocean Seed
    const s8 = ((_worldSeed * 103 + 509) * 0.00000001) % 1; // NEW: Seabed seed
    const s9 = ((_worldSeed * 107 + 601) * 0.00000001) % 1; // NEW: Clay seed
    const s10 = ((_worldSeed * 113 + 701) * 0.00000001) % 1; // River seed
    const s11 = ((_worldSeed * 131 + 797) * 0.00000001) % 1; // River warp seed
    
    _wgPerlinTemp      = new PerlinNoise(Math.abs(s1) + 0.01);
    _wgPerlinOcean     = new PerlinNoise(Math.abs(s7) + 0.01);
    _wgPerlinHumid     = new PerlinNoise(Math.abs(s2) + 0.01);
    _wgPerlinElevation = new PerlinNoise(Math.abs(s3) + 0.01);
    _wgPerlinVolatility= new PerlinNoise(Math.abs(s4) + 0.01);
    _wgPerlin3D        = new PerlinNoise(Math.abs(s5) + 0.01);
    _wgPerlinMountains = new PerlinNoise(Math.abs(s6) + 0.01); // NEW: Mountain Noise
    _wgPerlinSeabed    = new PerlinNoise(Math.abs(s8) + 0.01); // NEW: Seabed Noise
    _wgPerlinClay      = new PerlinNoise(Math.abs(s9) + 0.01); // NEW: Clay Noise
    _wgPerlinRiver     = new PerlinNoise(Math.abs(s10) + 0.01); // River path noise
    _wgPerlinRiver2    = new PerlinNoise(Math.abs(s11) + 0.01); // River warp noise
    _wgTerrainMult = GEN_TERRAIN_HEIGHT / 80;
    _wgBiomeScale = GEN_BIOME_SCALE;
    _wgSmoothness = GEN_SMOOTHNESS;
    
    _wgCavePrimary = new PerlinNoise(Math.abs((_worldSeed * 97 + 311) * 0.00000001) % 1 + 0.01);
    _wgCaveDensityMult = GEN_CAVE_DENSITY / 50;
}

// Deterministic per-chunk seeded random
function _chunkSeededRandom(cx, cz) {
    let s = (_worldSeed & 0x7fffffff) || 1;
    s = (s ^ (cx * 73856093) ^ (cz * 19349663)) & 0x7fffffff;
    s = ((s * 9301 + 49297) % 233280) || 1;
    return function() {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}
