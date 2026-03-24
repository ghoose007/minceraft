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
