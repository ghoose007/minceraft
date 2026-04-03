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

let _dirtTileImg = null;
function _loadDirtTile() {
    if (_dirtTileImg) return;
    _dirtTileImg = new Image();
    _dirtTileImg.crossOrigin = 'anonymous';
    _dirtTileImg.src = 'textures/terrain.png';
    _dirtTileImg.onload = () => {
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
        const tileSize = 64;
        if (_dirtTileImg && _dirtTileImg.complete && _dirtTileImg.naturalWidth > 0) {
            const tile = document.createElement('canvas');
            tile.width = tileSize; tile.height = tileSize;
            const tc = tile.getContext('2d');
            tc.imageSmoothingEnabled = false;
            tc.drawImage(_dirtTileImg, 32, 0, 16, 16, 0, 0, tileSize, tileSize);
            tc.fillStyle = 'rgba(0,0,0,0.55)';
            tc.fillRect(0, 0, tileSize, tileSize);
            const pattern = ctx.createPattern(tile, 'repeat');
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
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

// ==========================================
// WORLD OPTIONS STATE
// ==========================================

var worldOptions = {
    worldsize: 0,
    worldtype: 0,
    singleBiome: 0,
    structures: true,
    caves: true,
    lava: true,
    gamemode: 'survival',
    hostilespawns: true,
    xpenabled: true
};

var worldSizeLabelsDesktop = ['Classic (864 × 864)', 'Small (1024 × 1024)', 'Medium (3072 × 3072)', 'Large (5120 × 5120)'];
var worldSizeChunksDesktop = [54, 64, 192, 320];
var worldSizeLabelsMobile = ['Normal (256 × 256)', 'Large (512 × 512) — May Crash'];
var worldSizeChunksMobile = [16, 32];

function _getWorldSizeLabels() { return (window._deviceChoice === 'mobile') ? worldSizeLabelsMobile : worldSizeLabelsDesktop; }
function _getWorldSizeChunks() { return (window._deviceChoice === 'mobile') ? worldSizeChunksMobile : worldSizeChunksDesktop; }

const worldTypeLabels = ['Default', 'Superflat', 'Amplified', 'Single Biome'];
const singleBiomeList = ['plains', 'forest', 'desert', 'tundra', 'taiga', 'rainforest', 'swamp', 'jungle', 'extreme_hills'];
const singleBiomeLabels = ['Plains', 'Forest', 'Desert', 'Tundra', 'Taiga', 'Rainforest', 'Swamp', 'Jungle', 'Extreme Hills'];

function toggleOption(key) {
    if (key === 'worldsize') {
        var labels = _getWorldSizeLabels();
        worldOptions.worldsize = (worldOptions.worldsize + 1) % labels.length;
        document.getElementById('opt-worldsize').textContent = labels[worldOptions.worldsize];
    } else if (key === 'gamemode') {
        worldOptions.gamemode = worldOptions.gamemode === 'survival' ? 'creative' : 'survival';
        document.getElementById('opt-gamemode').textContent = worldOptions.gamemode === 'survival' ? 'Survival' : 'Creative';
    } else if (key === 'worldtype') {
        worldOptions.worldtype = (worldOptions.worldtype + 1) % 4;
        document.getElementById('opt-worldtype').textContent = worldTypeLabels[worldOptions.worldtype];
        const biomeGroup = document.getElementById('single-biome-group');
        if (biomeGroup) biomeGroup.style.display = worldOptions.worldtype === 3 ? 'block' : 'none';
    } else if (key === 'singlebiome') {
        worldOptions.singleBiome = (worldOptions.singleBiome + 1) % singleBiomeList.length;
        document.getElementById('opt-singlebiome').textContent = singleBiomeLabels[worldOptions.singleBiome];
    } else if (key === 'hostilespawns' || key === 'xpenabled' || key === 'structures' || key === 'caves' || key === 'lava') {
        worldOptions[key] = !worldOptions[key];
        var el = document.getElementById('opt-' + key);
        if (el) el.textContent = worldOptions[key] ? 'ON' : 'OFF';
    } else {
        worldOptions[key] = !worldOptions[key];
        var el = document.getElementById('opt-' + key);
        if (el) el.textContent = worldOptions[key] ? 'ON' : 'OFF';
    }
}

function updateSliderVal(slider, valId) {
    var el = document.getElementById(valId);
    if (!el) return;
    if (valId.includes('density') || valId.includes('abundance') || valId.includes('volatility') || valId.includes('foliage') || valId.includes('rate') || valId.includes('openness') || valId.includes('glow') || valId.includes('fire') || valId.includes('soulsand') || valId.includes('lavafalls') || valId.includes('gravel') || valId.includes('quartz') || valId.includes('cavesize') || valId.includes('hostilerate') || valId.includes('biome-height') || valId.includes('biome-var') || valId.includes('biome-tree') || valId.includes('biome-foliage') || valId.includes('ravinefreq') || valId.includes('ravinedepth') || valId.includes('ravinewidth') || valId.includes('tunnelfreq') || valId.includes('tunnellen') || valId.includes('tunnelradius') || valId.includes('tunnelbranch')) {
        el.textContent = slider.value + '%';
    } else {
        el.textContent = slider.value;
    }
}

// ==========================================
// NAVIGATION
// ==========================================

function showMainMenu() {
    document.getElementById('main-menu').classList.remove('hidden');
    document.getElementById('create-world').classList.add('hidden');
    document.getElementById('loading-screen').classList.add('hidden');
    var adv = document.getElementById('advanced-settings');
    if (adv) adv.classList.add('hidden');
    pickSplash();
}

function showCreateWorld() {
    document.getElementById('main-menu').classList.add('hidden');
    document.getElementById('create-world').classList.remove('hidden');
    worldOptions.worldsize = 0;
    var labels = _getWorldSizeLabels();
    document.getElementById('opt-worldsize').textContent = labels[0];
    requestAnimationFrame(function() { drawDirtBg('dirt-bg-2'); });
}

function showAdvancedSettings() {
    document.getElementById('create-world').classList.add('hidden');
    var adv = document.getElementById('advanced-settings');
    adv.classList.remove('hidden');
    _buildBiomeTuningUI();
    requestAnimationFrame(function() { drawDirtBg('dirt-bg-adv'); });
    // Hide all categories initially
    var cats = document.querySelectorAll('.adv-category');
    for (var i = 0; i < cats.length; i++) cats[i].style.display = 'none';
}

function hideAdvancedSettings() {
    document.getElementById('advanced-settings').classList.add('hidden');
    document.getElementById('create-world').classList.remove('hidden');
    requestAnimationFrame(function() { drawDirtBg('dirt-bg-2'); });
}

function showAdvCategory(name) {
    var cats = document.querySelectorAll('.adv-category');
    for (var i = 0; i < cats.length; i++) {
        cats[i].style.display = (cats[i].id === 'adv-' + name) ? 'block' : 'none';
    }
    // Scroll to top of the settings panel
    var scroll = document.getElementById('adv-settings-scroll');
    if (scroll) scroll.scrollTop = 0;
}

// ==========================================
// PER-BIOME TUNING UI BUILDER
// ==========================================

const BIOME_TUNE_LIST = [
    { key: 'plains', label: 'Plains' },
    { key: 'forest', label: 'Forest' },
    { key: 'desert', label: 'Desert' },
    { key: 'tundra', label: 'Tundra' },
    { key: 'taiga', label: 'Taiga' },
    { key: 'rainforest', label: 'Rainforest' },
    { key: 'swamp', label: 'Swamp' },
    { key: 'jungle', label: 'Jungle' },
    { key: 'extreme_hills', label: 'Extreme Hills' }
];

function _buildBiomeTuningUI() {
    var container = document.getElementById('biome-tuning-container');
    if (!container || container.children.length > 0) return; // Only build once

    for (var b = 0; b < BIOME_TUNE_LIST.length; b++) {
        var biome = BIOME_TUNE_LIST[b];
        var section = document.createElement('div');
        section.style.cssText = 'margin-bottom:14px; padding:6px; background:rgba(0,0,0,0.25); border:1px solid #444;';

        var title = document.createElement('div');
        title.style.cssText = 'color:#ddd; font-size:12px; margin-bottom:6px; text-shadow:1px 1px 0 #222;';
        title.textContent = biome.label;
        section.appendChild(title);

        var params = [
            { suffix: 'height', label: 'Base Height', min: 25, max: 200, val: 100 },
            { suffix: 'var', label: 'Height Variation', min: 25, max: 200, val: 100 },
            { suffix: 'tree', label: 'Tree Density', min: 0, max: 200, val: 100 },
            { suffix: 'foliage', label: 'Foliage Density', min: 0, max: 200, val: 100 }
        ];

        for (var p = 0; p < params.length; p++) {
            var param = params[p];
            var sliderId = 'sl-biome-' + biome.key + '-' + param.suffix;
            var valId = 'val-biome-' + biome.key + '-' + param.suffix;

            var row = document.createElement('div');
            row.className = 'mc-setting-group';
            row.style.marginBottom = '6px';
            row.innerHTML = '<div class="mc-setting-label">' + param.label + '</div>' +
                '<div class="mc-slider-row">' +
                '<input class="mc-slider" id="' + sliderId + '" type="range" min="' + param.min + '" max="' + param.max + '" value="' + param.val + '" oninput="updateSliderVal(this, \'' + valId + '\')">' +
                '<div class="mc-slider-val" id="' + valId + '">' + param.val + '%</div>' +
                '</div>';
            section.appendChild(row);
        }

        container.appendChild(section);
    }
}

// ==========================================
// SEEDED RNG
// ==========================================

function hashSeedString(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash = hash & 0x7fffffff;
    }
    return hash;
}

let _worldSeed = 0;
let _rngState = 0;
function seedRng(seed) { _worldSeed = seed; _rngState = seed; }
function seededRandom() { _rngState = (_rngState * 1103515245 + 12345) & 0x7fffffff; return _rngState / 0x80000000; }

// ==========================================
// GENERATION PARAMETERS (global)
// ==========================================

// Core terrain
let GEN_WORLD_TYPE = 0;
let GEN_SINGLE_BIOME = '';
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
let GEN_VOLATILITY_MULT = 100;
let GEN_TEMP_OFFSET = 0;
let GEN_HUMID_OFFSET = 0;
let GEN_FOLIAGE_DENSITY = 100;

// Cave tuning
let GEN_CAVE_SIZE = 120;
let GEN_CAVE_MIN_Y = 2;
let GEN_CAVE_LAVA_Y = 6;

// Cave tunnel settings
let GEN_TUNNEL_FREQUENCY = 200; // how many tunnel worms spawn per chunk region
let GEN_TUNNEL_LENGTH = 100;    // how long each worm carves
let GEN_TUNNEL_RADIUS = 120;    // radius multiplier for tunnel cross-section
let GEN_TUNNEL_MAX_Y = 80;      // highest Y a tunnel can start at
let GEN_TUNNEL_BRANCH = 70;     // chance of branching (0-100)

// Ravine tuning (NEW)
let GEN_RAVINE_FREQUENCY = 100;
let GEN_RAVINE_DEPTH = 100;
let GEN_RAVINE_WIDTH = 100;

// Mob/gameplay (NEW)
let GEN_HOSTILE_SPAWNS = true;
let GEN_HOSTILE_CAP = 32;
let GEN_HOSTILE_RATE = 100;
let GEN_SPAWN_DIST = 32;
let GEN_XP_ENABLED = true;

// Per-biome overrides (NEW) — percentage multipliers, 100 = default
var GEN_BIOME_OVERRIDES = {};
function _resetBiomeOverrides() {
    GEN_BIOME_OVERRIDES = {};
    for (var i = 0; i < BIOME_TUNE_LIST.length; i++) {
        var key = BIOME_TUNE_LIST[i].key;
        GEN_BIOME_OVERRIDES[key] = { height: 100, variation: 100, treeDensity: 100, foliageDensity: 100 };
    }
}
_resetBiomeOverrides();

// Nether
let GEN_NETHER_LAVA_LEVEL = 31;
let GEN_NETHER_OPENNESS = 100;
let GEN_NETHER_GLOW = 100;
let GEN_NETHER_FIRE = 100;
let GEN_NETHER_SOULSAND = 100;
let GEN_NETHER_LAVAFALLS = 100;
let GEN_NETHER_GRAVEL = 100;
let GEN_NETHER_QUARTZ = 100;

// ==========================================
// READ SETTINGS FROM UI & START WORLD
// ==========================================

function _readSlider(id, fallback) {
    var el = document.getElementById(id);
    return el ? parseInt(el.value) : fallback;
}

function _readBiomeOverrides() {
    for (var i = 0; i < BIOME_TUNE_LIST.length; i++) {
        var key = BIOME_TUNE_LIST[i].key;
        GEN_BIOME_OVERRIDES[key] = {
            height: _readSlider('sl-biome-' + key + '-height', 100),
            variation: _readSlider('sl-biome-' + key + '-var', 100),
            treeDensity: _readSlider('sl-biome-' + key + '-tree', 100),
            foliageDensity: _readSlider('sl-biome-' + key + '-foliage', 100)
        };
    }
}

async function startWorldCreation() {
    var seedStr = document.getElementById('world-seed').value.trim();
    var worldName = document.getElementById('world-name').value.trim() || 'New World';

    var seed;
    if (seedStr === '') {
        seed = Math.floor(Math.random() * 2147483647);
    } else if (/^\d+$/.test(seedStr)) {
        seed = parseInt(seedStr) & 0x7fffffff;
    } else {
        seed = hashSeedString(seedStr);
    }
    seedRng(seed);

    // Core terrain
    GEN_WORLD_TYPE = worldOptions.worldtype;
    GEN_SINGLE_BIOME = worldOptions.worldtype === 3 ? singleBiomeList[worldOptions.singleBiome] : '';
    GEN_SEA_LEVEL = _readSlider('sl-sealevel', 62);
    GEN_TERRAIN_HEIGHT = _readSlider('sl-terrainheight', 80);
    GEN_CAVE_DENSITY = _readSlider('sl-cavedensity', 50);
    GEN_TREE_DENSITY = _readSlider('sl-treedensity', 100);
    GEN_ORE_ABUNDANCE = _readSlider('sl-oreabundance', 100);
    GEN_STRUCTURES = worldOptions.structures;
    GEN_CAVES = worldOptions.caves;
    GEN_LAVA = worldOptions.lava;
    GEN_BIOME_SCALE = _readSlider('sl-biomescale', 300);
    GEN_SMOOTHNESS = _readSlider('sl-smoothness', 150);
    GEN_VOLATILITY_MULT = _readSlider('sl-volatility', 100);
    GEN_TEMP_OFFSET = _readSlider('sl-temp', 0);
    GEN_HUMID_OFFSET = _readSlider('sl-humid', 0);
    GEN_FOLIAGE_DENSITY = _readSlider('sl-foliage', 100);

    // Cave tuning
    GEN_CAVE_SIZE = _readSlider('sl-cavesize', 120);
    GEN_CAVE_MIN_Y = _readSlider('sl-caveminy', 2);
    GEN_CAVE_LAVA_Y = _readSlider('sl-cavelavay', 6);

    // Cave tunnel tuning
    GEN_TUNNEL_FREQUENCY = _readSlider('sl-tunnelfreq', 200);
    GEN_TUNNEL_LENGTH = _readSlider('sl-tunnellen', 100);
    GEN_TUNNEL_RADIUS = _readSlider('sl-tunnelradius', 120);
    GEN_TUNNEL_MAX_Y = _readSlider('sl-tunnelmaxy', 80);
    GEN_TUNNEL_BRANCH = _readSlider('sl-tunnelbranch', 70);

    // Ravine tuning
    GEN_RAVINE_FREQUENCY = _readSlider('sl-ravinefreq', 100);
    GEN_RAVINE_DEPTH = _readSlider('sl-ravinedepth', 100);
    GEN_RAVINE_WIDTH = _readSlider('sl-ravinewidth', 100);

    // Mob/gameplay
    GEN_HOSTILE_SPAWNS = worldOptions.hostilespawns;
    GEN_HOSTILE_CAP = _readSlider('sl-hostilecap', 32);
    GEN_HOSTILE_RATE = _readSlider('sl-hostilerate', 100);
    GEN_SPAWN_DIST = _readSlider('sl-spawndist', 32);
    GEN_XP_ENABLED = worldOptions.xpenabled;

    // Per-biome overrides
    _readBiomeOverrides();

    // Nether
    GEN_NETHER_LAVA_LEVEL = _readSlider('sl-nether-lava', 31);
    GEN_NETHER_OPENNESS = _readSlider('sl-nether-openness', 100);
    GEN_NETHER_GLOW = _readSlider('sl-nether-glow', 100);
    GEN_NETHER_FIRE = _readSlider('sl-nether-fire', 100);
    GEN_NETHER_SOULSAND = _readSlider('sl-nether-soulsand', 100);
    GEN_NETHER_LAVAFALLS = _readSlider('sl-nether-lavafalls', 100);
    GEN_NETHER_GRAVEL = _readSlider('sl-nether-gravel', 100);
    GEN_NETHER_QUARTZ = _readSlider('sl-nether-quartz', 100);

    // Amplified override
    if (GEN_WORLD_TYPE === 2) {
        GEN_TERRAIN_HEIGHT = Math.min(240, GEN_TERRAIN_HEIGHT * 2);
        GEN_VOLATILITY_MULT = Math.max(GEN_VOLATILITY_MULT, 200);
    }

    // Apply mob settings to runtime globals
    if (typeof MOB_CAP_HOSTILE !== 'undefined') MOB_CAP_HOSTILE = GEN_HOSTILE_CAP;

    gameMode = worldOptions.gamemode;

    var sizeIdx = worldOptions.worldsize;
    var chunks = _getWorldSizeChunks();
    CHUNKS_X_ACTIVE = chunks[sizeIdx];
    CHUNKS_Z_ACTIVE = chunks[sizeIdx];

    // Hide screens
    document.getElementById('create-world').classList.add('hidden');
    var adv = document.getElementById('advanced-settings');
    if (adv) adv.classList.add('hidden');
    document.getElementById('loading-screen').classList.remove('hidden');
    document.getElementById('loading-world-name').textContent = worldName + ' (Seed: ' + seed + ')';
    drawDirtBg('dirt-bg-3');

    await yieldToUI();
    await init(seed);
}

// ==========================================
// INIT
// ==========================================

window.addEventListener('load', function() {
    drawDirtBg('dirt-bg');
    pickSplash();
});
window.addEventListener('resize', function() {
    if (!document.getElementById('main-menu').classList.contains('hidden')) drawDirtBg('dirt-bg');
    if (!document.getElementById('create-world').classList.contains('hidden')) drawDirtBg('dirt-bg-2');
    if (!document.getElementById('loading-screen').classList.contains('hidden')) drawDirtBg('dirt-bg-3');
    var adv = document.getElementById('advanced-settings');
    if (adv && !adv.classList.contains('hidden')) drawDirtBg('dirt-bg-adv');
});