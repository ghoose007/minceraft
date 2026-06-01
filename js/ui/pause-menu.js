// ==========================================
// PAUSE MENU & SETTINGS
// ==========================================

// --- MENU API FUNCTIONS ---
let _initNeedsRemesh = false;

window.showPauseScreen = function(screenId) {
    document.getElementById('pause-main').classList.add('hidden');
    document.getElementById('options-menu').classList.add('hidden');
    document.getElementById('video-settings-menu').classList.add('hidden');
    document.getElementById('controls-menu').classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
}

window.toggleGraphics = function() {
    if (!settingGraphicsFancy && !settingGraphicsFabulous) {
        settingGraphicsFancy = true;
        settingGraphicsFabulous = false;
    } else if (settingGraphicsFancy && !settingGraphicsFabulous) {
        settingGraphicsFancy = true;
        settingGraphicsFabulous = true;
    } else {
        settingGraphicsFancy = false;
        settingGraphicsFabulous = false;
    }

    const label = settingGraphicsFabulous ? 'Fabulous!' : (settingGraphicsFancy ? 'Fancy' : 'Fast');
    const btn = document.getElementById('btn-graphics');
    if (btn) {
        btn.innerText = 'Graphics: ' + label;
        // Force repaint
    }
    console.log('[Settings] Graphics toggled to: ' + label);
    const warn = document.getElementById('fabulous-warning');
    if (warn) warn.style.display = settingGraphicsFabulous ? 'block' : 'none';
    _initNeedsRemesh = true;

    try {
        if (settingGraphicsFabulous) {
            if (typeof initFabulousGraphics === 'function' && !fabulousEnabled) {
                initFabulousGraphics();
            }
            if (typeof _applyFabulousShaders === 'function') _applyFabulousShaders();
        } else if (!settingGraphicsFancy) {
            if (typeof disposeFabulousGraphics === 'function') {
                disposeFabulousGraphics();
            }
            if (typeof _restoreStandardShaders === 'function') _restoreStandardShaders();
        }
    } catch (e) {
        console.error('[Fabulous] Error toggling graphics:', e);
    }
}

window.toggleSmoothLighting = function() {
    settingSmoothLighting = !settingSmoothLighting;
    var el = document.getElementById('btn-smooth-light');
    if (el) {
        el.innerText = 'Smooth Lighting: ' + (settingSmoothLighting ? 'ON' : 'OFF');
    }
    _initNeedsRemesh = true;
}

window.toggleViewBobbing = function() {
    settingViewBobbing = !settingViewBobbing;
    var el = document.getElementById('btn-view-bobbing');
    if (el) {
        el.innerText = 'View Bobbing: ' + (settingViewBobbing ? 'ON' : 'OFF');
    }
}

function getCurrentRenderDistanceChunks() {
    const value = RENDER_DISTANCES[currentRenderDistIndex];
    return Number.isFinite(value) ? value : 8;
}

function getRenderDistanceFraction() {
    return (getCurrentRenderDistanceChunks() - 2) / 30;
}

window.setRenderDistanceChunks = function(chunks) {
    chunks = Math.max(2, Math.min(32, Math.round(Number(chunks) || 8)));
    let bestIndex = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < RENDER_DISTANCES.length; i++) {
        const diff = Math.abs(RENDER_DISTANCES[i] - chunks);
        if (diff < bestDiff) { bestDiff = diff; bestIndex = i; }
    }
    currentRenderDistIndex = bestIndex;
    window.refreshRenderDistanceSlider();
};

window.refreshRenderDistanceSlider = function() {
    const btn = document.getElementById('render-distance-slider-btn');
    if (btn && btn._refreshSlider) btn._refreshSlider();
};

window.toggleGUIScale = function() {
    currentGUIScaleIndex = (currentGUIScaleIndex + 1) % GUI_SCALES.length;
    var el = document.getElementById('btn-gui-scale');
    if (el) {
        el.innerText = 'GUI Scale: ' + GUI_SCALES[currentGUIScaleIndex];
    }
    applyGUIScale();
}

window.applyGUIScale = function() {
    let scale = GUI_SCALES[currentGUIScaleIndex];
    if (scale === "Auto") {
        if (window.innerWidth < 800) scale = 1;
        else if (window.innerWidth < 1200) scale = 2;
        else scale = 3;
    }
    const zoomLevel = scale / 2; 
    
    const uiElements = ['main-menu', 'create-world', 'loading-screen', 'pause-menu', 'ui-layer', 'crosshair', 'debug-info', 'coordinates-display', 'flight-indicator', 'clock-container', 'hud-layer', 'inventory-modal', 'survival-inventory-modal', 'crafting-table-modal', 'furnace-modal', 'chest-modal', 'enchanting-modal', 'dragged-item'];
    // item-tooltip is intentionally excluded from zoom scaling — it must stay
    // position:fixed at real screen coords so mousemove tracking works correctly.
    
    uiElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.zoom = zoomLevel;
        }
    });
}

window.checkRemesh = function() {
    if (_initNeedsRemesh) {
        updateLoadingBar(0, 'Rebuilding chunks...');
        document.getElementById('loading-screen').classList.remove('hidden');
        document.getElementById('pause-menu').classList.add('hidden');
        setTimeout(async () => {
            updateAllChunks();
            let meshCount = 0;
            const totalDirty = dirtyChunks.size;
            for (let key of dirtyChunks) {
                const sep = key.indexOf(',');
                const cx = parseInt(key.substring(0, sep));
                const cz = parseInt(key.substring(sep + 1));
                buildChunkMesh(cx, cz);
                meshCount++;
                if (meshCount % 32 === 0) {
                    updateLoadingBar((meshCount / totalDirty) * 100, `Meshing... ${meshCount}/${totalDirty}`);
                    await yieldToUI();
                }
            }
            dirtyChunks.clear();
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('pause-menu').classList.remove('hidden');
        }, 50);
        _initNeedsRemesh = false;
    }
}


// ==========================================
// CHUNK LOADING SPEED
// ==========================================
const CHUNK_LOAD_SPEEDS = ['smooth', 'balanced', 'fast', 'extreme'];
const CHUNK_LOAD_LABELS = {
    smooth: 'Smooth',
    balanced: 'Balanced',
    fast: 'Fast',
    extreme: 'Extreme'
};

function refreshChunkLoadSpeedButton() {
    const btn = document.getElementById('btn-chunk-speed');
    if (btn) btn.innerText = 'Chunk Loading: ' + (CHUNK_LOAD_LABELS[settingChunkLoadSpeed] || 'Balanced');
}

window.toggleChunkLoadSpeed = function() {
    let idx = CHUNK_LOAD_SPEEDS.indexOf(settingChunkLoadSpeed);
    if (idx < 0) idx = 1;
    settingChunkLoadSpeed = CHUNK_LOAD_SPEEDS[(idx + 1) % CHUNK_LOAD_SPEEDS.length];
    refreshChunkLoadSpeedButton();
};

// ==========================================
// DIFFICULTY TOGGLE
// ==========================================
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABELS = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
const DIFFICULTY_MOB_CAPS = { easy: 16, normal: 32, hard: 48 };
const DIFFICULTY_DAMAGE_MULT = { easy: 0.75, normal: 1.0, hard: 1.25 };

function applyDifficulty() {
    settingDamageMultiplier = DIFFICULTY_DAMAGE_MULT[settingDifficulty];
    if (typeof MOB_CAP_HOSTILE !== 'undefined') {
        MOB_CAP_HOSTILE = DIFFICULTY_MOB_CAPS[settingDifficulty];
    }
    const btn = document.getElementById('btn-difficulty');
    if (btn) btn.innerText = 'Difficulty: ' + DIFFICULTY_LABELS[settingDifficulty];
}

window.toggleDifficulty = function() {
    const idx = DIFFICULTIES.indexOf(settingDifficulty);
    settingDifficulty = DIFFICULTIES[(idx + 1) % DIFFICULTIES.length];
    applyDifficulty();
};

// Apply on load
applyDifficulty();
refreshChunkLoadSpeedButton();

// ==========================================
// CHUNK LOADING SPEED TOGGLE
// ==========================================
const CHUNK_LOADING_SPEEDS = ['low', 'normal', 'fast', 'extreme'];
const CHUNK_LOADING_LABELS = { low: 'Low', normal: 'Normal', fast: 'Fast', extreme: 'Extreme' };

function applyChunkLoadingSpeedLabel() {
    const btn = document.getElementById('btn-chunk-loading');
    if (btn) {
        const key = (typeof settingChunkLoadingSpeed !== 'undefined' ? settingChunkLoadingSpeed : 'normal');
        btn.innerText = 'Chunk Loading: ' + (CHUNK_LOADING_LABELS[key] || 'Normal');
    }
}

window.toggleChunkLoadingSpeed = function() {
    if (typeof settingChunkLoadingSpeed === 'undefined') window.settingChunkLoadingSpeed = 'normal';
    const idx = CHUNK_LOADING_SPEEDS.indexOf(settingChunkLoadingSpeed);
    settingChunkLoadingSpeed = CHUNK_LOADING_SPEEDS[(idx + 1 + CHUNK_LOADING_SPEEDS.length) % CHUNK_LOADING_SPEEDS.length];
    applyChunkLoadingSpeedLabel();
};

applyChunkLoadingSpeedLabel();

// ==========================================
// MC-STYLE SLIDER INTERACTION
// ==========================================
function initSlider(btnId, thumbId, labelId, getValue, setValue, formatLabel) {
    const btn = document.getElementById(btnId);
    const thumb = document.getElementById(thumbId);
    const label = document.getElementById(labelId);
    if (!btn || !thumb || !label) return;

    function updateThumb(fraction) {
        const trackWidth = btn.clientWidth - 4; // account for border
        const thumbWidth = 16;
        const maxLeft = trackWidth - thumbWidth;
        thumb.style.left = Math.round(fraction * maxLeft) + 'px';
    }

    function updateFromEvent(e) {
        const rect = btn.getBoundingClientRect();
        let x = e.clientX - rect.left - 2; // account for border
        const trackWidth = btn.clientWidth - 4;
        let fraction = Math.max(0, Math.min(1, x / trackWidth));
        setValue(fraction);
        label.textContent = formatLabel(getValue());
        updateThumb(fraction);
    }

    // Initial state
    updateThumb(getValue());
    label.textContent = formatLabel(getValue());

    let dragging = false;

    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        updateFromEvent(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (dragging) updateFromEvent(e);
    });

    document.addEventListener('mouseup', () => {
        dragging = false;
    });

    // Store updater so we can refresh on menu open
    btn._refreshSlider = function() {
        updateThumb(getValue());
        label.textContent = formatLabel(getValue());
    };
}

// Sound volume slider: 0% to 100%
initSlider('sound-slider-btn', 'sound-thumb', 'sound-label',
    () => settingSoundVolume,
    (frac) => {
        settingSoundVolume = Math.round(frac * 20) / 20;
        if (window.MusicManager && typeof window.MusicManager.updateVolumeFromSettings === 'function') {
            window.MusicManager.updateVolumeFromSettings();
        }
    }, // snap to 5% increments
    (val) => 'Sound: ' + Math.round(val * 100) + '%'
);

// Sensitivity slider: 25% to 200%
initSlider('sensitivity-slider-btn', 'sensitivity-thumb', 'sensitivity-label',
    () => (settingSensitivity - 0.25) / 1.75, // normalize to 0-1
    (frac) => { settingSensitivity = Math.round((0.25 + frac * 1.75) * 20) / 20; }, // snap to 5% steps
    (val) => {
        const pct = Math.round((0.25 + val * 1.75) * 100);
        return 'Sensitivity: ' + pct + '%';
    }
);

// Render distance slider: 2 to 32 chunks, reuses the same MC-style slider behavior.
initSlider('render-distance-slider-btn', 'render-distance-thumb', 'render-distance-label',
    () => getRenderDistanceFraction(),
    (frac) => {
        const chunks = Math.max(2, Math.min(32, Math.round(2 + frac * 30)));
        window.setRenderDistanceChunks(chunks);
    },
    () => 'Render Distance: ' + getCurrentRenderDistanceChunks() + ' Chunks'
);

// Refresh sliders when options menu is shown
const _origShowPauseScreen = window.showPauseScreen;
window.showPauseScreen = function(screenId) {
    _origShowPauseScreen(screenId);
    if (screenId === 'options-menu') {
        // Refresh sliders
        const soundBtn = document.getElementById('sound-slider-btn');
        const sensBtn = document.getElementById('sensitivity-slider-btn');
        if (soundBtn && soundBtn._refreshSlider) soundBtn._refreshSlider();
        if (sensBtn && sensBtn._refreshSlider) sensBtn._refreshSlider();
        // Refresh difficulty label
        const diffBtn = document.getElementById('btn-difficulty');
        if (diffBtn && typeof DIFFICULTY_LABELS !== 'undefined') {
            diffBtn.innerText = 'Difficulty: ' + (DIFFICULTY_LABELS[settingDifficulty] || settingDifficulty);
        }
    }
    if (screenId === 'video-settings-menu') {
        // Refresh ALL video settings button labels to match current state
        const gfxLabel = settingGraphicsFabulous ? 'Fabulous!' : (settingGraphicsFancy ? 'Fancy' : 'Fast');
        const btnGfx = document.getElementById('btn-graphics');
        if (btnGfx) btnGfx.innerText = 'Graphics: ' + gfxLabel;

        window.refreshRenderDistanceSlider();

        const btnSL = document.getElementById('btn-smooth-light');
        if (btnSL) btnSL.innerText = 'Smooth Lighting: ' + (settingSmoothLighting ? 'ON' : 'OFF');

        refreshChunkLoadSpeedButton();

        const btnVB = document.getElementById('btn-view-bobbing');
        if (btnVB) btnVB.innerText = 'View Bobbing: ' + (settingViewBobbing ? 'ON' : 'OFF');

        const btnGS = document.getElementById('btn-gui-scale');
        if (btnGS) btnGS.innerText = 'GUI Scale: ' + GUI_SCALES[currentGUIScaleIndex];

        const warn = document.getElementById('fabulous-warning');
        if (warn) warn.style.display = settingGraphicsFabulous ? 'block' : 'none';
    }
};

// ==========================================
// PLAYER DAMAGE HELPER (applies difficulty multiplier)
// ==========================================
window.applyPlayerDamage = function(amount) {
    // v284: damage exhaustion (0.1 per hit)
    if (typeof window.addExhaustion === 'function') window.addExhaustion(0.1);
    if (typeof gameMode !== 'undefined' && gameMode !== 'survival') return;
    if (typeof player === 'undefined' || !player || player._dead) return;

    // Apply difficulty multiplier
    let finalDmg = amount * settingDamageMultiplier;

    // Apply armor damage reduction (MC formula: each defense point = 4% reduction, max 80%)
    let totalDefense = 0;
    for (const slot of armorSlots) {
        if (slot.id !== 0) {
            const data = TOOL_DATA[slot.id];
            if (data && data.defense) totalDefense += data.defense;
        }
    }
    const reduction = Math.min(0.80, totalDefense * 0.04);
    finalDmg *= (1.0 - reduction);

    // Damage armor durability (spread across equipped pieces)
    const equippedPieces = [];
    for (let i = 0; i < armorSlots.length; i++) {
        if (armorSlots[i].id !== 0) equippedPieces.push(i);
    }
    if (equippedPieces.length > 0) {
        // Each piece takes 1 durability per hit
        for (const idx of equippedPieces) {
            const slot = armorSlots[idx];
            const data = TOOL_DATA[slot.id];
            if (data && data.maxDurability) {
                if (slot.durability === undefined) slot.durability = data.maxDurability;
                slot.durability--;
                if (slot.durability <= 0) {
                    // Armor breaks
                    if (typeof window.playToolBreakSound === 'function') window.playToolBreakSound();
                    armorSlots[idx] = { id: 0, count: 0 };
                }
            }
        }
        if (typeof updateArmorBar === 'function') updateArmorBar();
    }

    player.health = Math.max(0, player.health - finalDmg);
    if (typeof triggerDamageShake === 'function') triggerDamageShake();
    if (typeof updateHealthUI === 'function') updateHealthUI();
    if (player.health <= 0 && !player._dead) {
        if (typeof window.killPlayer === 'function') window.killPlayer();
    }
};


// v382: shared Minecraft-style directional player knockback.
// Damage and knockback are intentionally separate so environmental damage
// can hurt without pushing, while mob/arrow attacks can push directionally.
window.applyPlayerKnockback = function(sourceX, sourceZ, strength, vertical) {
    if (typeof player === 'undefined' || !player || player._dead) return;
    if (typeof sourceX !== 'number' || typeof sourceZ !== 'number') return;
    const dx = player.x - sourceX;
    const dz = player.z - sourceZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) return;
    const nx = dx / dist;
    const nz = dz / dist;
    const h = (typeof strength === 'number') ? strength : 4.2;
    const v = (typeof vertical === 'number') ? vertical : 2.2;

    player.knockbackX = (player.knockbackX || 0) * 0.5 + nx * h;
    player.knockbackZ = (player.knockbackZ || 0) * 0.5 + nz * h;
    player.vx *= 0.5;
    player.vz *= 0.5;
    player.vy = Math.max(player.vy || 0, v);
    player.onGround = false;
};

// ==========================================
// FABULOUS SHADER MATERIAL MANAGEMENT
// ==========================================
window._applyFabulousShaders = function() {
    if (typeof injectFabulousLightingShader === 'function') {
        if (solidMaterial) {
            solidMaterial.onBeforeCompile = null;
            solidMaterial.needsUpdate = true;
            injectFabulousLightingShader(solidMaterial);
            solidMaterial.needsUpdate = true;
        }
        if (glassMaterial) {
            glassMaterial.onBeforeCompile = null;
            glassMaterial.needsUpdate = true;
            injectFabulousLightingShader(glassMaterial);
            glassMaterial.needsUpdate = true;
        }
    }
};

window._restoreStandardShaders = function() {
    if (typeof injectLightingShader === 'function') {
        if (solidMaterial) {
            solidMaterial.onBeforeCompile = null;
            solidMaterial.needsUpdate = true;
            injectLightingShader(solidMaterial);
            solidMaterial.needsUpdate = true;
        }
        if (glassMaterial) {
            glassMaterial.onBeforeCompile = null;
            glassMaterial.needsUpdate = true;
            injectLightingShader(glassMaterial);
            glassMaterial.needsUpdate = true;
        }
    }
};
