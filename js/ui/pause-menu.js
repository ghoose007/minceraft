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
    settingGraphicsFancy = !settingGraphicsFancy;
    document.getElementById('btn-graphics').innerText = `Graphics: ${settingGraphicsFancy ? 'Fancy' : 'Fast'}`;
    _initNeedsRemesh = true;
}

window.toggleSmoothLighting = function() {
    settingSmoothLighting = !settingSmoothLighting;
    document.getElementById('btn-smooth-light').innerText = `Smooth Lighting: ${settingSmoothLighting ? 'ON' : 'OFF'}`;
    _initNeedsRemesh = true;
}

window.toggleViewBobbing = function() {
    settingViewBobbing = !settingViewBobbing;
    document.getElementById('btn-view-bobbing').innerText = `View Bobbing: ${settingViewBobbing ? 'ON' : 'OFF'}`;
}

window.toggleRenderDist = function() {
    currentRenderDistIndex = (currentRenderDistIndex + 1) % RENDER_DISTANCES.length;
    document.getElementById('btn-render-dist').innerText = `Render Distance: ${RENDER_NAMES[currentRenderDistIndex]}`;
}

window.toggleGUIScale = function() {
    currentGUIScaleIndex = (currentGUIScaleIndex + 1) % GUI_SCALES.length;
    document.getElementById('btn-gui-scale').innerText = `GUI Scale: ${GUI_SCALES[currentGUIScaleIndex]}`;
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
    
    const uiElements = ['main-menu', 'create-world', 'loading-screen', 'pause-menu', 'ui-layer', 'crosshair', 'debug-info', 'coordinates-display', 'flight-indicator', 'clock-container', 'hud-layer', 'inventory-modal', 'survival-inventory-modal', 'crafting-table-modal', 'furnace-modal', 'chest-modal', 'dragged-item'];
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
    (frac) => { settingSoundVolume = Math.round(frac * 20) / 20; }, // snap to 5% increments
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

// Refresh sliders when options menu is shown
const _origShowPauseScreen = window.showPauseScreen;
window.showPauseScreen = function(screenId) {
    _origShowPauseScreen(screenId);
    if (screenId === 'options-menu') {
        const soundBtn = document.getElementById('sound-slider-btn');
        const sensBtn = document.getElementById('sensitivity-slider-btn');
        if (soundBtn && soundBtn._refreshSlider) soundBtn._refreshSlider();
        if (sensBtn && sensBtn._refreshSlider) sensBtn._refreshSlider();
    }
};

// ==========================================
// PLAYER DAMAGE HELPER (applies difficulty multiplier)
// ==========================================
window.applyPlayerDamage = function(amount) {
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
