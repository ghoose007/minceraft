// ==========================================
// CONFIGURATION CONSTANTS
// ==========================================

const ASSET_VERSION = "312";

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256; 
let CHUNKS_X_ACTIVE = 64;
let CHUNKS_Z_ACTIVE = 64;
let CHUNKS_X = 64; 
let CHUNKS_Z = 64; 
let WORLD_WIDTH = CHUNKS_X * CHUNK_SIZE; 
let WORLD_DEPTH = CHUNKS_Z * CHUNK_SIZE; 
const WORLD_HEIGHT = 256; 

const CHUNK_VOLUME = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE; 

const NORMAL_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.5;
const NORMAL_EYE_LEVEL = 1.62;
const CROUCH_EYE_LEVEL = 1.27;
const PLAYER_WIDTH = 0.6;

const GRAVITY = 28.0;       
const JUMP_FORCE = 8.5;     
const WALK_SPEED = 4.317;
const SPRINT_SPEED = 5.612;
const SNEAK_SPEED = 1.3;
const FLIGHT_SPEED = 10.92;
const FLIGHT_SPRINT_SPEED = 21.84;

const GUI_SCALES = [1, 2, 3, "Auto"];

const RENDER_DISTANCES = [4, 8, 12, 16];
const RENDER_NAMES = ["Short", "Normal", "Far", "Extreme"];

const DAY_TIME = 720, NIGHT_TIME = 480, TOTAL_TIME = DAY_TIME + NIGHT_TIME; 

const DOUBLE_TAP_THRESHOLD = 300;

// --- DIMENSION SYSTEM ---
const PORTAL_COOLDOWN_TIME = 80; // ~4 seconds at 20tps
const NETHER_HEIGHT = 128;

// --- LAZY GENERATION ---
// v269: lowered to 0 so ALL worlds use the lazy spawn-area-only path,
// including mobile sizes. Mobile Large (512×512 / 32 chunks) sometimes
// crashed during eager init because the worker queue was overwhelmed
// generating every chunk up front. Lazy gen only generates the spawn
// area (~25×25 chunks max) and streams in the rest as the player walks.
// Setting to 0 means CHUNKS_X > 0 is always true → always lazy.
const LAZY_GEN_THRESHOLD = 0;

// --- CLOUD CONFIGURATION ---
const CLOUD_W = 12; 
const CLOUD_H = 4;  
const CLOUD_COVERAGE = 48; 
const CLOUD_HEIGHT = 128; 
const CLOUD_SPEED = 2.0;

// --- BIOME COLORS ---
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
    'alpha_forest': [199/255, 255/255, 140/255]
};

// MC-accurate foliage (leaf) tint colors per biome
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
    'alpha_forest': [199/255, 255/255, 140/255]
};

// MC-accurate water tint colors per biome
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

// ==========================================
// BLOCK ID CONSTANTS
// ==========================================
// Centralized block IDs to eliminate magic numbers throughout the codebase.
const BLOCK_IDS = {
    AIR: 0,
    WATER: 4,
    OAK_LEAVES: 14,
    FLOWER_YELLOW: 16,
    TORCH: 17,
    CACTUS: 20,
    BIRCH_LEAVES: 22,
    TALL_GRASS: 23,
    FERN: 24,
    DEAD_BUSH: 26,
    LAVA: 27,
    SUGAR_CANE: 38,
    SNOW_LAYER: 40,
    MUSHROOM_RED: 42,
    JUNGLE_LEAVES: 43,
    ROSE: 52,
    DANDELION: 53,
    FURNACE: 59,
    FARMLAND: 62,
    FARMLAND_WET: 63,
    CROPS: 64,
    TNT: 65,
    VINE: 66,
    LILY_PAD: 67,
    GLASS_PANE: 68,
    CHEST: 69,
    OAK_SLAB: 70,
    STONE_SLAB: 71,
    COBBLE_SLAB: 72,
    BRICK_SLAB: 73,
    STONE_BRICK_SLAB: 74,
    SPRUCE_SLAB: 75,
    BIRCH_SLAB: 76,
    NETHER_BRICK_SLAB: 77,
    OAK_STAIRS: 80,
    COBBLE_STAIRS: 81,
    BRICK_STAIRS: 82,
    STONE_BRICK_STAIRS: 83,
    SPRUCE_STAIRS: 84,
    BIRCH_STAIRS: 85,
    NETHER_BRICK_STAIRS: 86,
    FIRE: 89,
    NETHER_PORTAL: 90,
    GLOWSTONE: 91,
    SOUL_SAND: 92,
    LOOT_CHEST: 93,
    SANDSTONE_STAIRS: 94,
    ICE: 95,
    SPRUCE_LEAVES: 97,
    NETHER_WART_0: 116,
    NETHER_WART_1: 117,
    NETHER_WART_2: 118,
    PACKED_ICE: 138,
    OAK_FENCE: 144,
    SPRUCE_FENCE: 145,
    BIRCH_FENCE: 146,
    JUNGLE_FENCE: 147,
    NETHER_BRICK_FENCE: 148,
    DOOR: 149,
    TRAPDOOR: 150,
    JUNGLE_STAIRS: 152,
    JUNGLE_SLAB: 157,
    IRON_BARS: 158,
    ENCHANTING_TABLE: 201,
    REDSTONE_DUST: 202,
    WOOD_BUTTON: 203,
    LEVER: 205,
    REDSTONE_TORCH: 206,
    PISTON: 207,
    STICKY_PISTON: 208,
    AETHER_PORTAL: 209
};

// --- AETHER DIMENSION ---
const AETHER_HEIGHT = 128;