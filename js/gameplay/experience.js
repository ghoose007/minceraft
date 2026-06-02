// ==========================================
// EXPERIENCE SYSTEM
// ==========================================

// --- XP STATE ---
let playerXP = 0;        // Total XP points accumulated at current level
let playerLevel = 0;     // Current level
let playerTotalXP = 0;   // Lifetime total XP (for save/load)

// --- XP LEVEL FORMULA (MC-accurate) ---
// Points needed to go from level L to L+1:
//   L  0-15:  2L + 7
//   L 16-30:  5L - 38
//   L 31+  :  9L - 158
function xpForNextLevel(level) {
    if (level <= 15) return 2 * level + 7;
    if (level <= 30) return 5 * level - 38;
    return 9 * level - 158;
}

// Total XP from level 0 to reach level L:
function totalXPForLevel(level) {
    if (level <= 0) return 0;
    if (level <= 16) {
        return level * level + 6 * level;
    }
    if (level <= 31) {
        return Math.floor(2.5 * level * level - 40.5 * level + 360);
    }
    return Math.floor(4.5 * level * level - 162.5 * level + 2220);
}

// Get progress fraction (0.0 to 1.0) within current level
function getXPProgress() {
    const needed = xpForNextLevel(playerLevel);
    if (needed <= 0) return 0;
    return Math.min(1.0, playerXP / needed);
}

// Add XP points to the player
function addPlayerXP(amount) {
    if (amount <= 0) return;
    playerXP += amount;
    playerTotalXP += amount;

    // Level up loop
    let needed = xpForNextLevel(playerLevel);
    while (playerXP >= needed) {
        playerXP -= needed;
        playerLevel++;
        needed = xpForNextLevel(playerLevel);
        // Play level-up sound
        if (typeof window._soundPlayLevelUp === 'function') {
            window._soundPlayLevelUp();
        }
    }
    updateXPBarUI();
}

// Set XP state from save data
function setPlayerXPState(level, xp, total) {
    playerLevel = level || 0;
    playerXP = xp || 0;
    playerTotalXP = total || 0;
    updateXPBarUI();
}

// Reset XP on death (MC: lose all levels, some orbs drop)
function resetPlayerXP() {
    // Drop some XP orbs at player position (MC drops level*7 capped at 100)
    const dropAmount = Math.min(playerLevel * 7, 100);
    if (dropAmount > 0) {
        // Spawn a few orbs worth of XP near death position
        const orbCount = Math.min(Math.ceil(dropAmount / 5), 10);
        const perOrb = Math.floor(dropAmount / orbCount);
        for (let i = 0; i < orbCount; i++) {
            spawnXPOrb(
                player.x + (Math.random() - 0.5) * 1.0,
                player.y + 0.5 + Math.random() * 0.5,
                player.z + (Math.random() - 0.5) * 1.0,
                perOrb
            );
        }
    }
    playerXP = 0;
    playerLevel = 0;
    playerTotalXP = 0;
    updateXPBarUI();
}

// ==========================================
// XP ORB ENTITIES
// ==========================================

const xpOrbs = [];
let _xpOrbTexture = null;
let _xpOrbFrames = []; // Array of canvas textures for animation frames

const XP_ORB_TINT = { r: 128 / 255, g: 255 / 255, b: 50 / 255 }; // MC greenish-yellow
const XP_ORB_PICKUP_RANGE = 1.5;   // Player picks up within this range
const XP_ORB_ATTRACT_RANGE = 6.0;  // Orbs start flying toward player at this range
const XP_ORB_ATTRACT_SPEED = 4.0;  // Speed of attraction
const XP_ORB_LIFETIME = 300;       // 5 minutes
const XP_ORB_PICKUP_DELAY = 0.5;   // Seconds before orb can be picked up
const XP_ORB_SIZE = 0.2;           // World-space size of the orb sprite

function _initXPOrbTexture() {
    if (_xpOrbFrames.length > 0) return;

    const img = new Image();
    img.onload = function () {
        // The sprite sheet is 64x64, 4 columns x 4 rows of 16x16 frames
        // Each frame is grayscale — we tint it to MC XP orb green
        const frameSize = 16;
        const cols = 4;
        const rows = 4;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const canvas = document.createElement('canvas');
                canvas.width = frameSize;
                canvas.height = frameSize;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(img, col * frameSize, row * frameSize, frameSize, frameSize, 0, 0, frameSize, frameSize);

                // Tint: read pixels, apply green tint, write back
                const imageData = ctx.getImageData(0, 0, frameSize, frameSize);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const gray = data[i]; // grayscale — R=G=B
                    const alpha = data[i + 3];
                    // Skip fully transparent / near-black pixels
                    if (alpha < 10 || gray < 10) {
                        data[i + 3] = 0; // Make transparent
                        continue;
                    }
                    // Apply tint: MC orbs are bright green-yellow with glow
                    data[i]     = Math.min(255, Math.floor(gray * XP_ORB_TINT.r * 1.5)); // R
                    data[i + 1] = Math.min(255, Math.floor(gray * XP_ORB_TINT.g * 1.5)); // G
                    data[i + 2] = Math.min(255, Math.floor(gray * XP_ORB_TINT.b * 1.5)); // B
                    data[i + 3] = Math.min(255, Math.floor(alpha * 0.95));
                }
                ctx.putImageData(imageData, 0, 0);

                const tex = new THREE.CanvasTexture(canvas);
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                _xpOrbFrames.push(tex);
            }
        }
    };
    img.src = 'textures/experience_orb.png?v=' + ASSET_VERSION;
}

function spawnXPOrb(x, y, z, amount) {
    if (amount <= 0) return;
    _initXPOrbTexture();

    // Create a billboard sprite
    const mat = new THREE.SpriteMaterial({
        map: _xpOrbFrames.length > 0 ? _xpOrbFrames[0] : null,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: 0xffffff
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(XP_ORB_SIZE, XP_ORB_SIZE, XP_ORB_SIZE);
    sprite.position.set(x, y, z);
    sprite.renderOrder = 5;
    scene.add(sprite);

    xpOrbs.push({
        sprite: sprite,
        material: mat,
        x: x, y: y, z: z,
        vx: (Math.random() - 0.5) * 2.0,
        vy: 2.0 + Math.random() * 2.0,
        vz: (Math.random() - 0.5) * 2.0,
        amount: amount,
        age: 0,
        pickupDelay: XP_ORB_PICKUP_DELAY,
        frame: Math.floor(Math.random() * 16),
        frameTimer: 0,
        collected: false
    });
}

// Spawn multiple small orbs with randomized amounts (MC-style split)
function spawnXPOrbsFromSource(x, y, z, totalXP) {
    if (typeof GEN_XP_ENABLED !== 'undefined' && !GEN_XP_ENABLED) return;
    if (totalXP <= 0) return;

    // MC splits XP into several orbs of varying sizes
    let remaining = totalXP;
    while (remaining > 0) {
        let orbAmount;
        if (remaining >= 10) {
            orbAmount = 3 + Math.floor(Math.random() * 5); // 3-7
        } else if (remaining >= 5) {
            orbAmount = 2 + Math.floor(Math.random() * 3); // 2-4
        } else {
            orbAmount = remaining;
        }
        orbAmount = Math.min(orbAmount, remaining);
        remaining -= orbAmount;
        spawnXPOrb(
            x + (Math.random() - 0.5) * 0.5,
            y + 0.3 + Math.random() * 0.3,
            z + (Math.random() - 0.5) * 0.5,
            orbAmount
        );
    }
}

function updateXPOrbs(dt) {
    if (xpOrbs.length === 0) return;

    const px = player.x;
    const py = player.y + player.eyeLevel * 0.5; // Orbs go toward center of player
    const pz = player.z;
    const isDead = player._dead || uiState === 'DEAD';

    for (let i = xpOrbs.length - 1; i >= 0; i--) {
        const orb = xpOrbs[i];

        orb.age += dt;
        orb.pickupDelay -= dt;

        // Remove if too old or collected
        if (orb.age > XP_ORB_LIFETIME || orb.collected) {
            scene.remove(orb.sprite);
            orb.material.dispose();
            xpOrbs.splice(i, 1);
            continue;
        }

        // Animation: cycle through frames
        orb.frameTimer += dt;
        if (orb.frameTimer >= 0.05) {
            orb.frameTimer = 0;
            orb.frame = (orb.frame + 1) % 16;
            if (_xpOrbFrames.length > orb.frame) {
                orb.material.map = _xpOrbFrames[orb.frame];
                orb.material.needsUpdate = true;
            }
        }

        // Scale pulsing (MC orbs glow/pulse)
        const pulse = 1.0 + Math.sin(orb.age * 6.0) * 0.15;
        orb.sprite.scale.set(XP_ORB_SIZE * pulse, XP_ORB_SIZE * pulse, XP_ORB_SIZE * pulse);

        // Physics: gravity
        orb.vy -= 20.0 * dt;

        // Ground collision (simple: check voxel below)
        const groundY = Math.floor(orb.y - 0.1);
        const blockBelow = typeof getVoxel === 'function' ? (getVoxel(Math.floor(orb.x), groundY, Math.floor(orb.z)) & 0xFF) : 0;
        if (blockBelow !== 0 && blockBelow !== 4 && blockBelow !== 27 && !isCrossBlock(blockBelow)) {
            if (orb.vy < 0) {
                orb.y = groundY + 1.0 + 0.15;
                orb.vy = 0;
            }
        }

        // Attraction to player
        if (!isDead && orb.pickupDelay <= 0 && gameMode !== 'creative') {
            const dx = px - orb.x;
            const dy = py - orb.y;
            const dz = pz - orb.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < XP_ORB_PICKUP_RANGE) {
                // Pick up!
                orb.collected = true;
                addPlayerXP(orb.amount);
                // Play XP pickup sound
                if (typeof window._soundPlayXPPickup === 'function') {
                    window._soundPlayXPPickup();
                }
                continue;
            } else if (dist < XP_ORB_ATTRACT_RANGE) {
                // Fly toward player — accelerate faster as it gets closer
                const attractStrength = XP_ORB_ATTRACT_SPEED * (1.0 + (XP_ORB_ATTRACT_RANGE - dist) / XP_ORB_ATTRACT_RANGE * 3.0);
                const nx = dx / dist;
                const ny = dy / dist;
                const nz = dz / dist;
                orb.vx += nx * attractStrength * dt * 5.0;
                orb.vy += ny * attractStrength * dt * 5.0;
                orb.vz += nz * attractStrength * dt * 5.0;
            }
        }

        // Creative mode: auto-pickup immediately
        if (!isDead && gameMode === 'creative' && orb.pickupDelay <= 0) {
            const dx = px - orb.x;
            const dy = py - orb.y;
            const dz = pz - orb.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < XP_ORB_ATTRACT_RANGE) {
                orb.collected = true;
                addPlayerXP(orb.amount);
                if (typeof window._soundPlayXPPickup === 'function') {
                    window._soundPlayXPPickup();
                }
                continue;
            }
        }

        // Apply velocity with drag
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        orb.z += orb.vz * dt;
        orb.vx *= Math.exp(-3.0 * dt);
        orb.vz *= Math.exp(-3.0 * dt);

        // Update sprite position
        orb.sprite.position.set(orb.x, orb.y, orb.z);
    }
}

// Clean up all orbs (for dimension switch, etc.)
function clearXPOrbs() {
    for (const orb of xpOrbs) {
        scene.remove(orb.sprite);
        orb.material.dispose();
    }
    xpOrbs.length = 0;
}

// ==========================================
// XP BAR UI
// ==========================================

function buildXPBarUI() {
    // Remove existing if any
    let existing = document.getElementById('xp-bar-container');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'xp-bar-container';
    container.style.cssText = `
        position: fixed;
        bottom: 46px;
        left: 50%;
        transform: translateX(-50%);
        width: 364px;
        height: 10px;
        z-index: 101;
        image-rendering: pixelated;
        pointer-events: none;
    `;

    // Background (empty bar) — full width
    const bgBar = document.createElement('div');
    bgBar.id = 'xp-bar-bg';
    bgBar.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 100%;
        height: 10px;
        background-image: url('textures/xp_gui.png?v=${ASSET_VERSION}');
        background-size: 364px 20px;
        background-position: 0 0;
        background-repeat: no-repeat;
        image-rendering: pixelated;
    `;

    // Foreground (filled bar) — width controlled by XP progress
    const fgBar = document.createElement('div');
    fgBar.id = 'xp-bar-fg';
    fgBar.style.cssText = `
        position: absolute;
        top: 0; left: 0;
        width: 0%;
        height: 10px;
        background-image: url('textures/xp_gui.png?v=${ASSET_VERSION}');
        background-size: 364px 20px;
        background-position: 0 -10px;
        background-repeat: no-repeat;
        image-rendering: pixelated;
        overflow: hidden;
    `;

    // Level number text
    const levelText = document.createElement('div');
    levelText.id = 'xp-level-text';
    levelText.style.cssText = `
        position: absolute;
        top: -14px;
        left: 50%;
        transform: translateX(-50%);
        font-family: 'MinecraftBitmap', 'Courier New', monospace;
        font-size: 16px;
        line-height: 16px;
        color: #80FF32;
        text-shadow:
            1px 0px #2d3d12,
            -1px 0px #2d3d12,
            0px 1px #2d3d12,
            0px -1px #2d3d12,
            1px 1px #2d3d12,
            -1px -1px #2d3d12,
            1px -1px #2d3d12,
            -1px 1px #2d3d12;
        text-align: center;
        pointer-events: none;
        z-index: 102;
        image-rendering: pixelated;
        -webkit-font-smoothing: none;
    `;
    levelText.textContent = '';

    container.appendChild(bgBar);
    container.appendChild(fgBar);
    container.appendChild(levelText);

    const hudLayer = document.getElementById('hud-layer');
    if (hudLayer) {
        hudLayer.appendChild(container);
    }
}

function updateXPBarUI() {
    if (typeof window.updateSurvivalHudLayout === 'function') window.updateSurvivalHudLayout(false);
    const container = document.getElementById('xp-bar-container');
    if (container) {
        var hideXP = (typeof gameMode !== 'undefined' && gameMode !== 'survival') ||
                     (typeof GEN_XP_ENABLED !== 'undefined' && !GEN_XP_ENABLED);
        container.style.display = hideXP ? 'none' : '';
    }

    const fgBar = document.getElementById('xp-bar-fg');
    if (fgBar) {
        const progress = getXPProgress();
        fgBar.style.width = (progress * 100) + '%';
    }

    const levelText = document.getElementById('xp-level-text');
    if (levelText) {
        if (playerLevel > 0) {
            levelText.textContent = playerLevel.toString();
            // Also render with mcFont if available
            if (window.mcFont && window.mcFont.isReady()) {
                levelText.innerHTML = '';
                var c = window.mcFont.makeCanvas(playerLevel.toString(), 2, {color:'#80FF32', shadowColor:'#2d3d12'});
                if (c) { c.style.margin = '0 auto'; levelText.appendChild(c); }
            }
        } else {
            levelText.textContent = '';
        }
    }
}

// ==========================================
// XP SOUND EFFECTS (.ogg playback)
// ==========================================

(function () {
    let _xpOrbBuffer = null;
    let _xpLevelUpBuffer = null;
    let _loadingStarted = false;

    function _getXPAudioCtx() {
        // Use the shared game audio context to avoid multiple context issues on mobile
        if (typeof window._getSharedAudioCtx === 'function') {
            return window._getSharedAudioCtx();
        }
        // Fallback if sounds.js hasn't loaded yet
        return new (window.AudioContext || window.webkitAudioContext)();
    }

    async function _ensureXPSoundsLoaded() {
        if (_loadingStarted) return;
        _loadingStarted = true;
        const ctx = _getXPAudioCtx();
        try {
            const [orbResp, lvlResp] = await Promise.all([
                fetch('sounds/xp_orb.ogg?v=' + ASSET_VERSION),
                fetch('sounds/xp_level_up.ogg?v=' + ASSET_VERSION)
            ]);
            const [orbBuf, lvlBuf] = await Promise.all([
                orbResp.arrayBuffer(),
                lvlResp.arrayBuffer()
            ]);
            _xpOrbBuffer = await ctx.decodeAudioData(orbBuf);
            _xpLevelUpBuffer = await ctx.decodeAudioData(lvlBuf);
        } catch (e) {
            console.warn('Failed to load XP sounds:', e);
        }
    }

    // MC XP pickup: play xp_orb.ogg with random pitch (MC does 0.75-1.25 range)
    window._soundPlayXPPickup = function () {
        try {
            _ensureXPSoundsLoaded();
            const ctx = _getXPAudioCtx();
            if (!_xpOrbBuffer) return;

            const vol = (typeof settingSoundVolume !== 'undefined') ? settingSoundVolume : 1.0;

            const source = ctx.createBufferSource();
            source.buffer = _xpOrbBuffer;
            // Random pitch between 0.75 and 1.25 (MC-style)
            source.playbackRate.value = 0.75 + Math.random() * 0.5;

            const gain = ctx.createGain();
            gain.gain.value = 0.35 * vol;

            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(0);
        } catch (e) { /* ignore audio errors */ }
    };

    // Level-up sound: play xp_level_up.ogg at multiples of 5
    window._soundPlayLevelUp = function () {
        try {
            _ensureXPSoundsLoaded();
            const ctx = _getXPAudioCtx();
            if (!_xpLevelUpBuffer) return;
            // Only play at level multiples of 5 (5, 10, 15, 20, ...)
            if (playerLevel % 5 !== 0) return;

            const vol = (typeof settingSoundVolume !== 'undefined') ? settingSoundVolume : 1.0;

            const source = ctx.createBufferSource();
            source.buffer = _xpLevelUpBuffer;
            source.playbackRate.value = 1.0;

            const gain = ctx.createGain();
            gain.gain.value = 0.5 * vol;

            source.connect(gain);
            gain.connect(ctx.destination);
            source.start(0);
        } catch (e) { /* ignore */ }
    };
})();

// ==========================================
// XP AMOUNTS FROM SOURCES (MC-accurate)
// ==========================================

// Mob XP values (MC Java Edition)
const MOB_XP_VALUES = {
    'zombie': 5,
    'skeleton': 5,
    'creeper': 5,
    'zombie_pigman': 5,
    'pig': function () { return 1 + Math.floor(Math.random() * 3); }, // 1-3
    'cow': function () { return 1 + Math.floor(Math.random() * 3); }, // 1-3
    'sheep': function () { return 1 + Math.floor(Math.random() * 3); }, // 1-3
    'herobrine': 50
};

function getXPForMob(mobType) {
    const val = MOB_XP_VALUES[mobType];
    if (typeof val === 'function') return val();
    if (typeof val === 'number') return val;
    return 1;
}

// Ore XP values (dropped when mining in survival)
const ORE_XP_VALUES = {
    7: function () { return Math.floor(Math.random() * 3); },            // Coal Ore: 0-2
    9: function () { return 3 + Math.floor(Math.random() * 5); },        // Diamond Ore: 3-7
    49: function () { return 1 + Math.floor(Math.random() * 5); },       // Redstone Ore: 1-5
    50: function () { return 2 + Math.floor(Math.random() * 4); },       // Lapis Lazuli Ore: 2-5
    88: function () { return 2 + Math.floor(Math.random() * 4); },       // Nether Quartz Ore: 2-5
    54: function () { return 15 + Math.floor(Math.random() * 29 - 15); }, // Monster Spawner: 15-29
    210: function () { return 5 + Math.floor(Math.random() * 6); }        // Emerald Ore: 5-10
};

function getXPForOre(blockId) {
    const val = ORE_XP_VALUES[blockId];
    if (typeof val === 'function') return val();
    return 0;
}

// Smelting XP (when taking items from furnace)
const SMELT_XP_VALUES = {
    113: 0.7,  // Iron Ingot
    143: 1.0,  // Gold Ingot
    3: 0.1,    // Stone
    121: 0.3,  // Brick
    123: 0.35, // Cooked Porkchop
    188: 0.35  // Cooked Beef
};

function getXPForSmelt(outputId) {
    return SMELT_XP_VALUES[outputId] || 0.1;
}

// ==========================================
// GLOBAL HOOKS (called from other systems)
// ==========================================

// Called when a mob dies — spawn XP orbs at death location
window.spawnMobDeathXP = function (x, y, z, mobType) {
    if (gameMode !== 'survival') return;
    const xpAmount = getXPForMob(mobType);
    if (xpAmount > 0) {
        spawnXPOrbsFromSource(x, y + 0.5, z, xpAmount);
    }
};

// Called when an ore block is broken in survival
window.spawnOreBreakXP = function (x, y, z, blockId) {
    if (gameMode !== 'survival') return;
    const xpAmount = getXPForOre(blockId);
    if (xpAmount > 0) {
        spawnXPOrbsFromSource(x + 0.5, y + 0.5, z + 0.5, xpAmount);
    }
};

// Called when taking smelted item from furnace
window.spawnSmeltXP = function (x, y, z, outputId, count) {
    if (gameMode !== 'survival') return;
    const xpPer = getXPForSmelt(outputId);
    const totalXP = Math.floor(xpPer * count);
    if (totalXP > 0) {
        spawnXPOrbsFromSource(x + 0.5, y + 0.5, z + 0.5, totalXP);
    }
};

// Expose update function for game loop
window.updateXPOrbs = updateXPOrbs;
window.clearXPOrbs = clearXPOrbs;
window.buildXPBarUI = buildXPBarUI;
window.updateXPBarUI = updateXPBarUI;
window.resetPlayerXP = resetPlayerXP;
window.addPlayerXP = addPlayerXP;
window.spawnXPOrb = spawnXPOrb;
window.spawnXPOrbsFromSource = spawnXPOrbsFromSource;
window.setPlayerXPState = setPlayerXPState;

// Expose state for save/load
window.getPlayerXPState = function () {
    return { level: playerLevel, xp: playerXP, totalXP: playerTotalXP };
};
