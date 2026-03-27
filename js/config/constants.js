// ==========================================
// CONFIGURATION CONSTANTS
// ==========================================

const ASSET_VERSION = "57";

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
const LAZY_GEN_THRESHOLD = 64; 

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
    'jungle': [89/255, 174/255, 48/255]
};