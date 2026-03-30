// ==========================================
// MENU SYSTEM & WORLD SETTINGS
// ==========================================

const SPLASH_TEXTS = [
    "Also try Minceraft!", "Now with more blocks!", "100% genuine!",
    "Woo, mincecraft!", "Singleplayer only!", "As seen on TV!",
    "Pixels!", "Hot!", "9.99 is a steal!", "Infinite worlds!*",
    "Tell your friends!", "*not actually infinite", "Closed source!",
    "Breathing manually!", "HODL!", "Bigger than ever!",
    "Free range voxels!", "Not affiliated with Mojang!",
    "Procedurally generated!", "Exploding creepers!", "Mince the craft!",
    "Terrain ahoy!", "Voxel-based!", "Written in JavaScript!",
    "Now with biomes!", "Contains nuts!", "Limited edition!",
    "Seeded!", "12345 is a good seed!", "Try seed 404!",
    "1024 blocks wide!", "Subterranean adventure!", "Ooh, shiny ores!",
];

function pickSplash() {
    const el = document.getElementById('splash-text');
    el.textContent = SPLASH_TEXTS[Math.floor(Math.random() * SPLASH_TEXTS.length)];
}

// Draw repeating dirt texture on a canvas
// Dirt tile image cache
let _dirtTileImg = null;
function _loadDirtTile() {
    if (_dirtTileImg) return;
    _dirtTileImg = new Image();
    _dirtTileImg.crossOrigin = 'anonymous';
    _dirtTileImg.src = 'textures/terrain.png';
    _dirtTileImg.onload = () => {
        // Redraw any visible dirt backgrounds once loaded
        if (!document.getElementById('main-menu').classList.contains('hidden')) drawDirtBg('dirt-bg');
        if (!document.getElementById('create-world').classList.contains('hidden')) drawDirtBg('dirt-bg-2');
        if (!document.getElementById('loading-screen').classList.contains('hidden')) drawDirtBg('dirt-bg-3');
    };
}
_loadDirtTile();

function drawDirtBg(canvasId) {
    try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');

        // Extract the dirt texture (atlas index 2 = col 2, row 0) from terrain.png
        // Each tile is 16x16 in a 256x256 atlas
        const tileSize = 64; // Display size of each tile on screen

        if (_dirtTileImg && _dirtTileImg.complete && _dirtTileImg.naturalWidth > 0) {
            // Extract dirt tile (index 2: col=2, row=0 -> x=32, y=0 in 256x256 atlas)
            const tile = document.createElement('canvas');
            tile.width = tileSize; tile.height = tileSize;
            const tc = tile.getContext('2d');
            tc.imageSmoothingEnabled = false;
            // Draw the 16x16 dirt tile scaled up to tileSize
            tc.drawImage(_dirtTileImg, 32, 0, 16, 16, 0, 0, tileSize, tileSize);
            // Dark overlay
            tc.fillStyle = 'rgba(0,0,0,0.55)';
            tc.fillRect(0, 0, tileSize, tileSize);

            const pattern = ctx.createPattern(tile, 'repeat');
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            // Fallback: procedural dirt if texture not loaded yet
            const tile = document.createElement('canvas');
            tile.width = tileSize; tile.height = tileSize;
            const tc = tile.getContext('2d');
            let ds = 42;
            const dRand = () => { ds = (ds * 1103515245 + 12345) & 0x7fffffff; return ds / 0x80000000; };
            for (let x = 0; x < tileSize; x++) {
                for (let y = 0; y < tileSize; y++) {
                    const c = 60 + dRand() * 30;
                    tc.fillStyle = `rgb(${Math.floor(c+15+dRand()*8)}, ${Math.floor(c-5+dRand()*5)}, ${Math.floor(c-15+dRand()*5)})`;
                    tc.fillRect(x, y, 1, 1);
                }
            }
            tc.fillStyle = 'rgba(0,0,0,0.55)';
            tc.fillRect(0, 0, tileSize, tileSize);
            const pattern = ctx.createPattern(tile, 'repeat');
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    } catch(e) { console.error('drawDirtBg error:', e); }
}

// Toggle options state
const worldOptions = {
    worldsize: 0,
    worldtype: 0, // 0=Default, 1=Superflat, 2=Amplified, 3=Single Biome
    singleBiome: 0, // index into singleBiomeList
    structures: true,
    caves: true,
    lava: true,
    gamemode: 'survival'
};
const worldSizeLabels = ['Classic (864 × 864)', 'Small (1024 × 1024)', 'Medium (3072 × 3072)', 'Large (5120 × 5120)'];
const worldSizeChunks = [54, 64, 192, 320];
const worldTypeLabels = ['Default', 'Superflat', 'Amplified', 'Single Biome'];
const singleBiomeList = ['plains', 'forest', 'desert', 'tundra', 'taiga', 'rainforest', 'swamp', 'jungle', 'extreme_hills'];
const singleBiomeLabels = ['Plains', 'Forest', 'Desert', 'Tundra', 'Taiga', 'Rainforest', 'Swamp', 'Jungle', 'Extreme Hills'];

function toggleOption(key) {
    if (key === 'worldsize') {
        worldOptions.worldsize = (worldOptions.worldsize + 1) % 4;
        document.getElementById('opt-worldsize').textContent = worldSizeLabels[worldOptions.worldsize];
    } else if (key === 'gamemode') {
        worldOptions.gamemode = worldOptions.gamemode === 'survival' ? 'creative' : 'survival';
        document.getElementById('opt-gamemode').textContent = worldOptions.gamemode === 'survival' ? 'Survival' : 'Creative';
    } else if (key === 'worldtype') {
        worldOptions.worldtype = (worldOptions.worldtype + 1) % 4;
        document.getElementById('opt-worldtype').textContent = worldTypeLabels[worldOptions.worldtype];
        // Show/hide single biome selector
        const biomeGroup = document.getElementById('single-biome-group');
        if (biomeGroup) biomeGroup.style.display = worldOptions.worldtype === 3 ? 'block' : 'none';
    } else if (key === 'singlebiome') {
        worldOptions.singleBiome = (worldOptions.singleBiome + 1) % singleBiomeList.length;
        document.getElementById('opt-singlebiome').textContent = singleBiomeLabels[worldOptions.singleBiome];
    } else {
        worldOptions[key] = !worldOptions[key];
        document.getElementById('opt-' + key).textContent = worldOptions[key] ? 'ON' : 'OFF';
    }
}

function updateSliderVal(slider, valId) {
    const el = document.getElementById(valId);
    if (valId.includes('density') || valId.includes('abundance') || valId.includes('volatility') || valId.includes('foliage')) {
        el.textContent = slider.value + '%';
    } else {
        el.textContent = slider.value;
    }
}

function showMainMenu() {
    document.getElementById('main-menu').classList.remove('hidden');
    document.getElementById('create-world').classList.add('hidden');
    document.getElementById('loading-screen').classList.add('hidden');
    pickSplash();
}

function showCreateWorld() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('create-world').classList.remove('hidden');
    requestAnimationFrame(() => drawDirtBg('dirt-bg-2'));
}

function hashSeedString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash = hash & 0x7fffffff;
    }
    return hash;
}

// Seeded PRNG for world gen (replaces Math.random in generateWorld)
let _worldSeed = 0;
let _rngState = 0;
function seedRng(seed) {
    _worldSeed = seed;
    _rngState = seed;
}
function seededRandom() {
    _rngState = (_rngState * 1103515245 + 12345) & 0x7fffffff;
    return _rngState / 0x80000000;
}

// World gen parameters (set from UI before generation)
let GEN_WORLD_TYPE = 0; // 0=Default, 1=Superflat, 2=Amplified, 3=Single Biome
let GEN_SINGLE_BIOME = ''; // empty = normal, otherwise biome name to lock to
let GEN_SEA_LEVEL = 62;
let GEN_TERRAIN_HEIGHT = 80;
let GEN_CAVE_DENSITY = 50;
let GEN_TREE_DENSITY = 100;
let GEN_ORE_ABUNDANCE = 100;
let GEN_STRUCTURES = true;
let GEN_CAVES = true;
let GEN_LAVA = true;
let GEN_BIOME_SCALE = 300;
let GEN_SMOOTHNESS = 150;

// New Custom Variables
let GEN_VOLATILITY_MULT = 100;
let GEN_TEMP_OFFSET = 0;
let GEN_HUMID_OFFSET = 0;
let GEN_FOLIAGE_DENSITY = 100;

// Nether generation parameters
let GEN_NETHER_LAVA_LEVEL = 31;
let GEN_NETHER_OPENNESS = 100;
let GEN_NETHER_GLOW = 100;
let GEN_NETHER_FIRE = 100;
let GEN_NETHER_SOULSAND = 100;
let GEN_NETHER_LAVAFALLS = 100;
let GEN_NETHER_GRAVEL = 100;
let GEN_NETHER_QUARTZ = 100;

async function startWorldCreation() {
    // Read settings from UI
    const seedStr = document.getElementById('world-seed').value.trim();
    const worldName = document.getElementById('world-name').value.trim() || 'New World';
    
    let seed;
    if (seedStr === '') {
        seed = Math.floor(Math.random() * 2147483647);
    } else if (/^\d+$/.test(seedStr)) {
        seed = parseInt(seedStr) & 0x7fffffff;
    } else {
        seed = hashSeedString(seedStr);
    }
    
    seedRng(seed);

    // Read slider values
    GEN_WORLD_TYPE = worldOptions.worldtype;
    GEN_SINGLE_BIOME = worldOptions.worldtype === 3 ? singleBiomeList[worldOptions.singleBiome] : '';
    GEN_SEA_LEVEL = parseInt(document.getElementById('sl-sealevel').value);
    GEN_TERRAIN_HEIGHT = parseInt(document.getElementById('sl-terrainheight').value);
    GEN_CAVE_DENSITY = parseInt(document.getElementById('sl-cavedensity').value);
    GEN_TREE_DENSITY = parseInt(document.getElementById('sl-treedensity').value);
    GEN_ORE_ABUNDANCE = parseInt(document.getElementById('sl-oreabundance').value);
    GEN_STRUCTURES = worldOptions.structures;
    GEN_CAVES = worldOptions.caves;
    GEN_LAVA = worldOptions.lava;
    GEN_BIOME_SCALE = parseInt(document.getElementById('sl-biomescale').value);
    GEN_SMOOTHNESS = parseInt(document.getElementById('sl-smoothness').value);
    
    // Read new custom slider values
    GEN_VOLATILITY_MULT = parseInt(document.getElementById('sl-volatility').value);
    GEN_TEMP_OFFSET = parseInt(document.getElementById('sl-temp').value);
    GEN_HUMID_OFFSET = parseInt(document.getElementById('sl-humid').value);
    GEN_FOLIAGE_DENSITY = parseInt(document.getElementById('sl-foliage').value);
    
    // Read nether settings
    GEN_NETHER_LAVA_LEVEL = parseInt(document.getElementById('sl-nether-lava').value);

    // Apply world type overrides
    if (GEN_WORLD_TYPE === 2) { // Amplified
        GEN_TERRAIN_HEIGHT = Math.min(240, GEN_TERRAIN_HEIGHT * 2);
        GEN_VOLATILITY_MULT = Math.max(GEN_VOLATILITY_MULT, 200);
    }
    GEN_NETHER_OPENNESS = parseInt(document.getElementById('sl-nether-openness').value);
    GEN_NETHER_GLOW = parseInt(document.getElementById('sl-nether-glow').value);
    GEN_NETHER_FIRE = parseInt(document.getElementById('sl-nether-fire').value);
    GEN_NETHER_SOULSAND = parseInt(document.getElementById('sl-nether-soulsand').value);
    GEN_NETHER_LAVAFALLS = parseInt(document.getElementById('sl-nether-lavafalls').value);
    GEN_NETHER_GRAVEL = parseInt(document.getElementById('sl-nether-gravel').value);
    GEN_NETHER_QUARTZ = parseInt(document.getElementById('sl-nether-quartz').value);
    
    // Inject the selected game mode into the global tracker before booting!
    gameMode = worldOptions.gamemode;
    
    // Set world size
    const sizeIdx = worldOptions.worldsize;
    CHUNKS_X_ACTIVE = worldSizeChunks[sizeIdx];
    CHUNKS_Z_ACTIVE = worldSizeChunks[sizeIdx];

    // Show loading screen
    document.getElementById('create-world').classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-world-name').textContent = worldName + ' (Seed: ' + seed + ')';
    drawDirtBg('dirt-bg-3');

    await yieldToUI();
    await init(seed);
}

// Initialize dirt backgrounds and splash on load
window.addEventListener('load', () => {
    drawDirtBg('dirt-bg');
    pickSplash();
});
window.addEventListener('resize', () => {
    if (!document.getElementById('main-menu').classList.contains('hidden')) drawDirtBg('dirt-bg');
    if (!document.getElementById('create-world').classList.contains('hidden')) drawDirtBg('dirt-bg-2');
    if (!document.getElementById('loading-screen').classList.contains('hidden')) drawDirtBg('dirt-bg-3');
});