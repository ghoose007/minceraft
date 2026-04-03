// ==========================================
// MOBILE TOUCH CONTROLS (MCPE-Style)
// ==========================================

(function() {

// --- MOBILE DETECTION & STATE ---
let isMobileMode = false;
let _mobileUIBuilt = false;

// Auto-detect touch device
function _isTouchDevice() {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

window.isMobileMode = function() { return isMobileMode; };

window.enableMobileMode = function() {
    isMobileMode = true;
    _buildMobileUI();
    _applyMobileCSS();
    _hookMobileTick(); // Ensure polling is started
    // Skip pointer lock on mobile
    window._mobileSkipPointerLock = true;
    // Force GUI scale to 2 for mobile (zoom 1.0) — larger and easier to tap
    currentGUIScaleIndex = 1; // scale = 2
    if (typeof applyGUIScale === 'function') applyGUIScale();
    // Resize renderer to fill screen
    if (typeof onWindowResize === 'function') onWindowResize();
    // Lock world sizes for mobile
    _applyMobileWorldSizes();
    // Set playing state directly
    if (uiState === 'PLAYING') {
        isPointerLocked = true; // Fake it so input works
    }
};

window.disableMobileMode = function() {
    isMobileMode = false;
    _removeMobileUI();
    window._mobileSkipPointerLock = false;
};

window.toggleMobileMode = function() {
    if (isMobileMode) window.disableMobileMode();
    else window.enableMobileMode();
};

// --- TOUCH STATE TRACKING ---
const _touches = {};       // Active touches by identifier
let _lookTouchId = null;   // Touch controlling camera look
let _joystickTouchId = null; // Touch controlling movement joystick
let _joystickStart = null; // {x, y} of joystick touch start
let _joystickDelta = null; // {x, y} current offset

// --- INTERACTION STATE ---
let _tapStartTime = 0;
let _tapStartPos = null;
let _holdTimer = null;
let _isHolding = false;
let _lastTapTime = 0;
let _lastTapPos = null;
let _breakingTouch = false;
let _breakScreenX = 0;
let _breakScreenY = 0;
let _actionTouchId = null;

// --- JOYSTICK CONFIG ---
const JOYSTICK_RADIUS = 50;       // Max displacement in pixels
const JOYSTICK_DEAD_ZONE = 8;     // Dead zone in pixels
const LOOK_SENSITIVITY = 0.004;   // Camera look sensitivity
const HOLD_THRESHOLD = 300;       // ms before hold = break
const DOUBLE_TAP_TIME = 300;      // ms for double tap
const TAP_MOVE_THRESHOLD = 15;    // px movement before tap becomes drag

// ==========================================
// MOBILE UI CONSTRUCTION
// ==========================================

function _buildMobileUI() {
    if (_mobileUIBuilt) return;
    _mobileUIBuilt = true;

    // --- INJECT CSS ---
    const style = document.createElement('style');
    style.id = 'mobile-controls-css';
    style.textContent = `
        /* Container for all mobile controls */
        #mobile-controls {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: 150;
            pointer-events: none;
            touch-action: none;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
        }
        #mobile-controls * {
            pointer-events: auto;
            touch-action: none;
        }

        /* Joystick area (bottom-left) */
        #mobile-joystick-area {
            position: absolute;
            bottom: 80px;
            left: 20px;
            width: 140px;
            height: 140px;
        }
        #mobile-joystick-base {
            position: absolute;
            width: 120px; height: 120px;
            border-radius: 50%;
            background: rgba(255,255,255,0.12);
            border: 2px solid rgba(255,255,255,0.25);
            top: 10px; left: 10px;
        }
        #mobile-joystick-thumb {
            position: absolute;
            width: 50px; height: 50px;
            border-radius: 50%;
            background: rgba(255,255,255,0.35);
            border: 2px solid rgba(255,255,255,0.5);
            top: 45px; left: 45px;
            transition: none;
        }

        /* Action buttons (bottom-right) */
        #mobile-buttons-right {
            position: absolute;
            bottom: 80px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: center;
        }
        .mobile-btn {
            width: 56px; height: 56px;
            border-radius: 12px;
            background: rgba(255,255,255,0.15);
            border: 2px solid rgba(255,255,255,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            color: rgba(255,255,255,0.8);
            font-family: monospace;
            -webkit-tap-highlight-color: transparent;
        }
        .mobile-btn:active, .mobile-btn.active {
            background: rgba(255,255,255,0.35);
            border-color: rgba(255,255,255,0.6);
        }
        .mobile-btn-row {
            display: flex;
            gap: 10px;
        }

        /* Jump button — larger */
        #mobile-btn-jump {
            width: 64px; height: 64px;
            border-radius: 50%;
            font-size: 26px;
        }

        /* Sneak button */
        #mobile-btn-sneak {
            width: 48px; height: 48px;
            border-radius: 50%;
            font-size: 14px;
            position: absolute;
            bottom: 80px;
            right: 90px;
        }

        /* Pause button */
        #mobile-btn-pause {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 40px; height: 40px;
            border-radius: 8px;
            font-size: 20px;
        }

        /* Chat / inventory button */
        #mobile-btn-inventory {
            position: absolute;
            top: 10px;
            left: 10px;
            width: 40px; height: 40px;
            border-radius: 8px;
            font-size: 16px;
        }

        /* Look area — covers the rest of the screen for camera control */
        #mobile-look-area {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: -1;
        }

        /* Sprint indicator */
        #mobile-sprint-indicator {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 12px;
            font-family: monospace;
            opacity: 0;
            transition: opacity 0.3s;
            pointer-events: none !important;
        }

        /* Mobile toggle button on main menu */
        #mobile-toggle-btn {
            position: fixed;
            bottom: 10px;
            right: 10px;
            padding: 8px 16px;
            background: rgba(0,0,0,0.6);
            border: 2px solid rgba(255,255,255,0.3);
            color: white;
            font-family: monospace;
            font-size: 14px;
            border-radius: 8px;
            z-index: 999;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
        }

        /* Show crosshair on mobile — player places/interacts where crosshair points */

        /* Hide tooltips on mobile */
        body.mobile-mode #item-tooltip { display: none !important; }
        body.mobile-mode #action-text { display: none !important; }

        /* Fix item icon alignment in hotbar on mobile — don't resize slots, keep them matching the texture */
        body.mobile-mode #main-hotbar .item-slot {
            position: relative;
        }
        body.mobile-mode #main-hotbar .item-icon {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            margin: 0;
        }
        body.mobile-mode #main-hotbar .item-icon.is-3d-block {
            transform: translate(-50%, -50%) rotateX(-25deg) rotateY(-45deg);
        }
        body.mobile-mode #main-hotbar .item-count {
            position: absolute;
            bottom: 2px;
            right: 2px;
        }

        /* Fix 3D block icons on mobile — CSS zoom breaks preserve-3d */
        /* Flatten to show just the front face as a 2D icon */
        body.mobile-mode .item-icon.is-3d-block {
            transform-style: flat !important;
            transform: none !important;
            position: relative !important;
            top: auto !important;
            left: auto !important;
            width: 32px !important;
            height: 32px !important;
        }
        body.mobile-mode .item-icon.is-3d-block .face {
            display: none;
        }
        body.mobile-mode .item-icon.is-3d-block .front {
            display: block !important;
            position: relative !important;
            transform: none !important;
            filter: none !important;
            width: 32px !important;
            height: 32px !important;
        }
        /* Re-apply hotbar centering for flattened 3D icons */
        body.mobile-mode #main-hotbar .item-icon.is-3d-block {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
        }

        /* Make creative inventory scrollable on mobile */
        body.mobile-mode #inventory-grid {
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
            overflow-y: scroll !important;
            max-height: 45vh !important;
        }
        body.mobile-mode #inventory-modal {
            max-height: 90vh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
            transform: translate(-50%, -50%) scale(0.85) !important;
            padding-bottom: 16px !important;
        }
        body.mobile-mode #inventory-grid {
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
            overflow-y: scroll !important;
            max-height: 40vh !important;
        }
        body.mobile-mode #inv-hotbar {
            margin-bottom: 8px !important;
            flex-shrink: 0;
        }
        /* Ensure all inventory modals are scrollable on mobile */
        body.mobile-mode #survival-inventory-modal,
        body.mobile-mode #crafting-table-modal,
        body.mobile-mode #furnace-modal,
        body.mobile-mode #chest-modal,
        body.mobile-mode #enchanting-modal {
            max-height: 90vh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
        }

        /* Hotbar arrow buttons */
        .mobile-hotbar-arrow {
            position: fixed;
            bottom: 4px;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background: rgba(255,255,255,0.12);
            border: 2px solid rgba(255,255,255,0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 160;
            pointer-events: auto;
            touch-action: none;
            -webkit-tap-highlight-color: transparent;
        }
        .mobile-hotbar-arrow:active {
            background: rgba(255,255,255,0.35);
        }
        #mobile-hotbar-left {
            right: calc(50% + 186px);
        }
        #mobile-hotbar-right {
            left: calc(50% + 186px);
        }

        /* Fix mobile viewport — prevent cut-off */
        body.mobile-mode {
            overflow: hidden !important;
            position: fixed !important;
            width: 100% !important;
            height: 100% !important;
            touch-action: none;
            -webkit-overflow-scrolling: none;
        }
        body.mobile-mode canvas {
            width: 100vw !important;
            height: 100vh !important;
        }
        /* Exclude inventory doll and other UI canvases from fullscreen stretch */
        body.mobile-mode #inv-player-doll,
        body.mobile-mode #clock-canvas,
        body.mobile-mode #dirt-bg,
        body.mobile-mode #dirt-bg-2,
        body.mobile-mode #dirt-bg-3,
        body.mobile-mode #dirt-bg-ws {
            width: auto !important;
            height: auto !important;
        }

        /* Inventory button must float above inventory modals */
        #mobile-btn-inventory {
            z-index: 300 !important;
        }

        /* Hide clock on mobile */
        body.mobile-mode #clock-container {
            display: none !important;
        }

        /* Force menus to fit mobile screens */
        body.mobile-mode .mc-screen {
            transform-origin: top center;
        }
        body.mobile-mode #main-menu,
        body.mobile-mode #create-world,
        body.mobile-mode #pause-menu,
        body.mobile-mode #loading-screen {
            overflow-y: auto !important;
            max-height: 100vh !important;
        }

        /* Fix dirt background on mobile — counteract CSS zoom */
        body.mobile-mode #dirt-bg,
        body.mobile-mode #dirt-bg-2,
        body.mobile-mode #dirt-bg-3,
        body.mobile-mode #dirt-bg-ws {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            transform-origin: top left;
        }
    `;
    document.head.appendChild(style);

    // --- BUILD CONTROL ELEMENTS ---
    const container = document.createElement('div');
    container.id = 'mobile-controls';
    container.style.display = 'none';

    // Look area (full screen background touch target)
    const lookArea = document.createElement('div');
    lookArea.id = 'mobile-look-area';
    container.appendChild(lookArea);

    // Joystick
    const joyArea = document.createElement('div');
    joyArea.id = 'mobile-joystick-area';
    const joyBase = document.createElement('div');
    joyBase.id = 'mobile-joystick-base';
    const joyThumb = document.createElement('div');
    joyThumb.id = 'mobile-joystick-thumb';
    joyArea.appendChild(joyBase);
    joyArea.appendChild(joyThumb);
    container.appendChild(joyArea);

    // Right-side buttons
    const btnRight = document.createElement('div');
    btnRight.id = 'mobile-buttons-right';

    const jumpBtn = document.createElement('div');
    jumpBtn.id = 'mobile-btn-jump';
    jumpBtn.className = 'mobile-btn';
    jumpBtn.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"></polyline></svg>';
    btnRight.appendChild(jumpBtn);

    container.appendChild(btnRight);

    // Sneak button
    const sneakBtn = document.createElement('div');
    sneakBtn.id = 'mobile-btn-sneak';
    sneakBtn.className = 'mobile-btn';
    sneakBtn.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    container.appendChild(sneakBtn);

    // Camera perspective toggle
    const camBtn = document.createElement('div');
    camBtn.id = 'mobile-btn-camera';
    camBtn.className = 'mobile-btn';
    camBtn.style.cssText = 'width:40px;height:40px;border-radius:8px;position:absolute;bottom:150px;right:30px;';
    camBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>';
    container.appendChild(camBtn);

    // Pause button
    const pauseBtn = document.createElement('div');
    pauseBtn.id = 'mobile-btn-pause';
    pauseBtn.className = 'mobile-btn';
    pauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="rgba(255,255,255,0.85)"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    container.appendChild(pauseBtn);

    // Inventory button
    const invBtn = document.createElement('div');
    invBtn.id = 'mobile-btn-inventory';
    invBtn.className = 'mobile-btn';
    invBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    container.appendChild(invBtn);

    const sprintInd = document.createElement('div');
    sprintInd.id = 'mobile-sprint-indicator';
    sprintInd.textContent = '';
    container.appendChild(sprintInd);

    // Hotbar left/right arrows
    const hotbarLeft = document.createElement('div');
    hotbarLeft.id = 'mobile-hotbar-left';
    hotbarLeft.className = 'mobile-hotbar-arrow';
    hotbarLeft.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    container.appendChild(hotbarLeft);

    const hotbarRight = document.createElement('div');
    hotbarRight.id = 'mobile-hotbar-right';
    hotbarRight.className = 'mobile-hotbar-arrow';
    hotbarRight.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    container.appendChild(hotbarRight);

    document.body.appendChild(container);

    // --- BIND EVENTS ---
    _bindTouchEvents();
}

function _removeMobileUI() {
    const ctrl = document.getElementById('mobile-controls');
    if (ctrl) ctrl.style.display = 'none';
    document.body.classList.remove('mobile-mode');
    // Reset keys
    keys.KeyW = false; keys.KeyA = false; keys.KeyS = false; keys.KeyD = false;
    keys.Space = false; keys.ShiftLeft = false;
}

function _applyMobileCSS() {
    document.body.classList.add('mobile-mode');
    // Don't force-show controls here — _tickMobileUI handles visibility based on uiState
}

// Lock world sizes for mobile devices
let _mobileWorldSizesApplied = false;
function _applyMobileWorldSizes() {
    if (_mobileWorldSizesApplied) return;

    // Check if the arrays exist yet
    if (typeof worldSizeLabels === 'undefined' || typeof worldSizeChunks === 'undefined' || typeof worldOptions === 'undefined') {
        // Retry shortly — scripts may not have loaded yet
        setTimeout(_applyMobileWorldSizes, 100);
        return;
    }

    _mobileWorldSizesApplied = true;

    // Replace the global world size arrays
    worldSizeLabels.length = 0;
    worldSizeLabels.push('Normal (256 × 256)', 'Large (512 × 512) — May Crash');

    worldSizeChunks.length = 0;
    worldSizeChunks.push(16, 32);

    // Reset selection to first option
    worldOptions.worldsize = 0;

    // Update the button text
    const btn = document.getElementById('opt-worldsize');
    if (btn) btn.textContent = worldSizeLabels[0];

    // Patch toggleOption to cycle only 2 options for worldsize
    const _origToggle = toggleOption;
    toggleOption = function(key) {
        if (key === 'worldsize') {
            worldOptions.worldsize = (worldOptions.worldsize + 1) % worldSizeLabels.length;
            const b = document.getElementById('opt-worldsize');
            if (b) b.textContent = worldSizeLabels[worldOptions.worldsize];
            return;
        }
        return _origToggle(key);
    };
    window.toggleOption = toggleOption;
}

// ==========================================
// TOUCH EVENT HANDLERS
// ==========================================

function _bindTouchEvents() {
    const container = document.getElementById('mobile-controls');
    if (!container) return;

    // Prevent default on the whole mobile overlay
    container.addEventListener('touchstart', _onTouchStart, { passive: false });
    container.addEventListener('touchmove', _onTouchMove, { passive: false });
    container.addEventListener('touchend', _onTouchEnd, { passive: false });
    container.addEventListener('touchcancel', _onTouchEnd, { passive: false });

    // Hotbar taps
    document.addEventListener('touchstart', _onHotbarTouch, { passive: false });

    // Button bindings
    const jumpBtn = document.getElementById('mobile-btn-jump');
    const sneakBtn = document.getElementById('mobile-btn-sneak');
    const pauseBtn = document.getElementById('mobile-btn-pause');
    const invBtn = document.getElementById('mobile-btn-inventory');

    // Jump
    let _jumpLastTap = 0;
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        keys.Space = true;
        jumpBtn.classList.add('active');
        // Double-tap jump = toggle flight in creative
        const now = Date.now();
        if (now - _jumpLastTap < DOUBLE_TAP_TIME && gameMode === 'creative') {
            player.flying = !player.flying;
        }
        _jumpLastTap = now;
    });
    jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation();
        keys.Space = false;
        jumpBtn.classList.remove('active');
    });

    // Sneak / descend
    sneakBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        keys.ShiftLeft = true;
        sneakBtn.classList.add('active');
    });
    sneakBtn.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation();
        keys.ShiftLeft = false;
        sneakBtn.classList.remove('active');
    });

    // Pause
    pauseBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (uiState === 'PLAYING') {
            uiState = 'PAUSED';
            const pm = document.getElementById('pause-menu');
            if (pm) pm.classList.remove('hidden');
        }
    });

    // Inventory (toggle open/close)
    invBtn.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING') {
            // Close inventory/UI
            const modals = ['inventory-modal', 'survival-inventory-modal', 'crafting-table-modal', 'furnace-modal', 'chest-modal', 'enchanting-modal'];
            modals.forEach(id => { const m = document.getElementById(id); if (m) m.classList.add('hidden'); });
            if (typeof closeCraftingTable === 'function') closeCraftingTable();
            if (typeof closeFurnace === 'function') closeFurnace();
            if (typeof closeChest === 'function') closeChest();
            if (typeof closeEnchantingTable === 'function') closeEnchantingTable();
            // Toss cursor item
            if (typeof cursorItem !== 'undefined' && cursorItem) {
                if (typeof window.tossItem === 'function') window.tossItem(cursorItem.id, cursorItem.count);
                cursorItem = null;
                if (typeof updateCursorItemUI === 'function') updateCursorItemUI();
            }
            uiState = 'PLAYING';
            isPointerLocked = true;
        } else if (uiState === 'PLAYING') {
            if (gameMode === 'creative') {
                uiState = 'INVENTORY';
                const modal = document.getElementById('inventory-modal');
                if (modal) modal.classList.remove('hidden');
                if (typeof renderInventory === 'function') renderInventory();
            } else {
                uiState = 'INVENTORY';
                const modal = document.getElementById('survival-inventory-modal');
                if (modal) modal.classList.remove('hidden');
                if (typeof renderInventory === 'function') renderInventory();
            }
        }
    });

    // Camera perspective toggle
    if (camBtn) {
        camBtn.addEventListener('touchstart', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (typeof toggleCameraMode === 'function') toggleCameraMode();
        });
    }

    // Hotbar left/right arrows
    const hotbarLeft = document.getElementById('mobile-hotbar-left');
    const hotbarRight = document.getElementById('mobile-hotbar-right');
    if (hotbarLeft) {
        hotbarLeft.addEventListener('touchstart', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (uiState === 'PLAYING') {
                const newSlot = (activeSlot - 1 + 9) % 9;
                if (typeof selectSlot === 'function') selectSlot(newSlot);
            }
        });
    }
    if (hotbarRight) {
        hotbarRight.addEventListener('touchstart', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (uiState === 'PLAYING') {
                const newSlot = (activeSlot + 1) % 9;
                if (typeof selectSlot === 'function') selectSlot(newSlot);
            }
        });
    }
}

// --- Joystick zone detection ---
function _isInJoystickZone(x, y) {
    const joyArea = document.getElementById('mobile-joystick-area');
    if (!joyArea) return false;
    const rect = joyArea.getBoundingClientRect();
    // Expand the hit zone a bit
    return x >= rect.left - 30 && x <= rect.right + 30 &&
           y >= rect.top - 30 && y <= rect.bottom + 30;
}

function _isOnButton(target) {
    if (!target) return false;
    // Use closest() to catch taps on SVG children inside buttons
    return !!(target.closest('.mobile-btn') || target.closest('.mobile-hotbar-arrow'));
}

// ==========================================
// TOUCH START
// ==========================================

function _onTouchStart(e) {
    if (!isMobileMode) return;

    // During inventory/UI states, don't intercept touches — let them reach inventory slots
    const isInUI = (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING');
    if (isInUI) {
        // Only handle the inventory toggle button
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (_isOnButton(e.changedTouches[i].target)) return; // Let button handler deal with it
        }
        return; // Don't preventDefault — let touches pass through to inventory
    }

    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        _touches[t.identifier] = { x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY, startTime: Date.now(), target: t.target };

        // Skip if on a button — handle camera, hotbar arrows directly here
        if (_isOnButton(t.target)) {
            const btn = t.target.closest('.mobile-btn') || t.target.closest('.mobile-hotbar-arrow');
            if (btn) {
                const btnId = btn.id;
                if (btnId === 'mobile-btn-camera') {
                    if (typeof toggleCameraMode === 'function') toggleCameraMode();
                }
                if (btnId === 'mobile-hotbar-left') {
                    const newSlot = (activeSlot - 1 + 9) % 9;
                    if (typeof selectSlot === 'function') selectSlot(newSlot);
                }
                if (btnId === 'mobile-hotbar-right') {
                    const newSlot = (activeSlot + 1) % 9;
                    if (typeof selectSlot === 'function') selectSlot(newSlot);
                }
            }
            continue;
        }

        // Check if on hotbar
        if (_isOnHotbar(t.clientX, t.clientY)) continue;

        // Joystick zone
        if (_joystickTouchId === null && _isInJoystickZone(t.clientX, t.clientY)) {
            _joystickTouchId = t.identifier;
            _joystickStart = { x: t.clientX, y: t.clientY };
            _joystickDelta = { x: 0, y: 0 };
            continue;
        }

        // Everything else = look + action touch
        if (_lookTouchId === null && uiState === 'PLAYING') {
            _lookTouchId = t.identifier;
            _tapStartTime = Date.now();
            _tapStartPos = { x: t.clientX, y: t.clientY };
            _isHolding = false;
            _breakingTouch = false;

            // Start hold timer for breaking
            clearTimeout(_holdTimer);
            const holdX = t.clientX, holdY = t.clientY;
            _holdTimer = setTimeout(() => {
                if (_lookTouchId === t.identifier && uiState === 'PLAYING') {
                    _isHolding = true;
                    _startBreaking(holdX, holdY);
                }
            }, HOLD_THRESHOLD);
        }
    }
}

// ==========================================
// TOUCH MOVE
// ==========================================

function _onTouchMove(e) {
    if (!isMobileMode) return;
    const isInUI = (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING');
    if (isInUI) return; // Let inventory handle its own touches
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const prev = _touches[t.identifier];
        if (!prev) continue;

        // Joystick
        if (t.identifier === _joystickTouchId && _joystickStart) {
            let dx = t.clientX - _joystickStart.x;
            let dy = t.clientY - _joystickStart.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > JOYSTICK_RADIUS) {
                dx = dx / dist * JOYSTICK_RADIUS;
                dy = dy / dist * JOYSTICK_RADIUS;
            }
            _joystickDelta = { x: dx, y: dy };
            _updateJoystickUI(dx, dy);
            _updateMovementKeys(dx, dy, dist);
            prev.x = t.clientX;
            prev.y = t.clientY;
            continue;
        }

        // Camera look
        if (t.identifier === _lookTouchId && uiState === 'PLAYING') {
            const dx = t.clientX - prev.x;
            const dy = t.clientY - prev.y;

            if (_tapStartPos) {
                const totalDx = t.clientX - _tapStartPos.x;
                const totalDy = t.clientY - _tapStartPos.y;
                if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > TAP_MOVE_THRESHOLD) {
                    clearTimeout(_holdTimer);
                    _tapStartPos = null; // No longer a tap
                }
            }

            // Always move camera with finger drag (even while breaking)
            const sens = LOOK_SENSITIVITY * ((typeof settingSensitivity !== 'undefined') ? settingSensitivity : 1.0);
            player.yaw -= dx * sens;
            player.pitch -= dy * sens;
            player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
        }

        prev.x = t.clientX;
        prev.y = t.clientY;
    }
}

// ==========================================
// TOUCH END
// ==========================================

function _onTouchEnd(e) {
    if (!isMobileMode) return;
    const isInUI = (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING');
    if (isInUI) return;
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];

        // Joystick release
        if (t.identifier === _joystickTouchId) {
            _joystickTouchId = null;
            _joystickStart = null;
            _joystickDelta = null;
            _updateJoystickUI(0, 0);
            keys.KeyW = false; keys.KeyA = false; keys.KeyS = false; keys.KeyD = false;
            player.isSprinting = false;
        }

        // Look / action release
        if (t.identifier === _lookTouchId) {
            clearTimeout(_holdTimer);

            if (_breakingTouch) {
                _stopBreaking();
            }

            // Check if it was a tap (short duration, minimal movement)
            const wasTap = _tapStartPos && (Date.now() - _tapStartTime < HOLD_THRESHOLD);
            if (wasTap && !_isHolding && uiState === 'PLAYING') {
                const now = Date.now();
                // Double-tap detection
                if (_lastTapPos && (now - _lastTapTime < DOUBLE_TAP_TIME)) {
                    // Double tap = special action (not used in gameplay currently)
                    _lastTapTime = 0;
                    _lastTapPos = null;
                } else {
                    // Single tap = place block / interact / attack
                    _handleTap(t.clientX, t.clientY);
                    _lastTapTime = now;
                    _lastTapPos = { x: t.clientX, y: t.clientY };
                }
            }

            _lookTouchId = null;
            _tapStartPos = null;
            _isHolding = false;
        }

        delete _touches[t.identifier];
    }
}

// ==========================================
// HOTBAR TOUCH HANDLING
// ==========================================

function _isOnHotbar(x, y) {
    const hotbar = document.getElementById('main-hotbar');
    if (!hotbar) return false;
    const rect = hotbar.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function _onHotbarTouch(e) {
    if (!isMobileMode || uiState !== 'PLAYING') return;

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const hotbar = document.getElementById('main-hotbar');
        if (!hotbar) continue;

        const rect = hotbar.getBoundingClientRect();
        if (t.clientX >= rect.left && t.clientX <= rect.right &&
            t.clientY >= rect.top && t.clientY <= rect.bottom) {
            e.preventDefault();
            // Calculate which slot was tapped
            const relX = t.clientX - rect.left;
            const slotWidth = rect.width / 9;
            const slotIdx = Math.floor(relX / slotWidth);
            if (slotIdx >= 0 && slotIdx < 9) {
                if (typeof selectSlot === 'function') selectSlot(slotIdx);
            }
        }
    }
}

// ==========================================
// JOYSTICK → MOVEMENT KEYS
// ==========================================

function _updateMovementKeys(dx, dy, dist) {
    if (dist < JOYSTICK_DEAD_ZONE) {
        keys.KeyW = false; keys.KeyA = false; keys.KeyS = false; keys.KeyD = false;
        player.isSprinting = false;
        return;
    }

    // Normalize
    const nx = dx / JOYSTICK_RADIUS;
    const ny = dy / JOYSTICK_RADIUS;

    // Forward/back (up = -Y in screen space = forward)
    keys.KeyW = ny < -0.3;
    keys.KeyS = ny > 0.3;
    keys.KeyA = nx < -0.3;
    keys.KeyD = nx > 0.3;

    // Sprint when joystick pushed to edge while moving forward
    const sprintInd = document.getElementById('mobile-sprint-indicator');
    if (dist > JOYSTICK_RADIUS * 0.85 && keys.KeyW) {
        player.isSprinting = true;
        if (sprintInd) sprintInd.style.opacity = '1';
    } else {
        player.isSprinting = false;
        if (sprintInd) sprintInd.style.opacity = '0';
    }
}

function _updateJoystickUI(dx, dy) {
    const thumb = document.getElementById('mobile-joystick-thumb');
    if (!thumb) return;
    // Center of base is at 45,45 within the 140px area (thumb is 50px)
    thumb.style.left = (45 + dx) + 'px';
    thumb.style.top = (45 + dy) + 'px';
}

// ==========================================
// SCREEN-TO-WORLD RAYCAST (MCPE-style)
// ==========================================
// On mobile, the tap position on screen determines where the player
// looks/interacts, not the center crosshair.

const _mobileRayDir = new THREE.Vector3();
const _mobileRaycaster = new THREE.Raycaster();

function _setPlayerLookFromScreen(screenX, screenY) {
    if (!camera) return;
    // Convert screen coords to normalized device coordinates (-1 to +1)
    // Account for CSS zoom on the renderer canvas
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    // Unproject to get world ray direction from camera
    _mobileRayDir.set(ndcX, ndcY, 0.5);
    _mobileRayDir.unproject(camera);
    _mobileRayDir.sub(camera.position).normalize();

    // Convert ray direction to yaw/pitch and set player look
    player.yaw = Math.atan2(-_mobileRayDir.x, -_mobileRayDir.z);
    player.pitch = Math.asin(_mobileRayDir.y);
    player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
}

function _raycastVoxelFromScreen(screenX, screenY) {
    if (!camera || typeof getVoxel !== 'function') return null;

    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    const dir = new THREE.Vector3(ndcX, ndcY, 0.5);
    dir.unproject(camera);
    dir.sub(camera.position).normalize();

    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    const maxDist = 5.0;

    // DDA raycast
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;
    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? (x + 1 - ox) : (ox - x)) / Math.abs(dir.x)) : Infinity;
    let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? (y + 1 - oy) : (oy - y)) / Math.abs(dir.y)) : Infinity;
    let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? (z + 1 - oz) : (oz - z)) / Math.abs(dir.z)) : Infinity;
    let normal = [0, 0, 0];
    let t = 0;

    for (let i = 0; i < 200; i++) {
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            t = tMaxX; x += stepX; tMaxX += tDeltaX; normal = [-stepX, 0, 0];
        } else if (tMaxY < tMaxZ) {
            t = tMaxY; y += stepY; tMaxY += tDeltaY; normal = [0, -stepY, 0];
        } else {
            t = tMaxZ; z += stepZ; tMaxZ += tDeltaZ; normal = [0, 0, -stepZ];
        }
        if (t > maxDist) return null;
        if (y < 0 || y >= 256) continue;

        const val = getVoxel(x, y, z);
        const id = val & 0xFF;
        if (id !== 0 && id !== 4 && id !== 27 && !(typeof isCrossBlock === 'function' && isCrossBlock(id)) && id !== 90) {
            return { hit: [x, y, z], normal: normal, val: val };
        }
    }
    return null;
}

function _getTargetedMobFromScreen(screenX, screenY) {
    if (!camera || typeof globalMobs === 'undefined') return null;

    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((screenY - rect.top) / rect.height) * 2 + 1;

    const dir = new THREE.Vector3(ndcX, ndcY, 0.5);
    dir.unproject(camera);
    dir.sub(camera.position).normalize();

    let bestMob = null;
    let bestDist = 4.0;

    for (const mob of globalMobs) {
        if (mob.dead || mob.dying) continue;
        const dx = mob.x - camera.position.x;
        const dy = (mob.y + mob.height / 2) - camera.position.y;
        const dz = mob.z - camera.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < bestDist) {
            const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / dist;
            if (dot > 0.85) { // Slightly more lenient for touch
                bestDist = dist;
                bestMob = mob;
            }
        }
    }
    return bestMob;
}

// ==========================================
// TAP → PLACE / INTERACT / ATTACK
// ==========================================

function _handleTap(screenX, screenY) {
    if (uiState !== 'PLAYING') return;

    swingAnimation = 1.0;

    // Check for mob hit using camera center (where crosshair is)
    const hitMob = (typeof targetedMob !== 'undefined') ? targetedMob : null;
    if (hitMob) {
        let damage = 1;
        if (currentBuildBlock !== 0 && typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock]) {
            damage = TOOL_DATA[currentBuildBlock].damage || 1;
        }
        hitMob.takeDamage(damage, player.x, player.z);
        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(2);
        return;
    }

    // Use camera-center raycast (same as desktop — where crosshair points)
    const target = (typeof raycastVoxel === 'function') ? raycastVoxel() : null;
    if (!target) return;

    const interactId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;

    // --- Food ---
    if ((currentBuildBlock === 115 || currentBuildBlock === 122 || currentBuildBlock === 123 ||
         currentBuildBlock === 134 || currentBuildBlock === 187 || currentBuildBlock === 188)) {
        let healAmount = 0;
        if (currentBuildBlock === 115) healAmount = 4;
        if (currentBuildBlock === 122) healAmount = 3;
        if (currentBuildBlock === 123) healAmount = 8;
        if (currentBuildBlock === 134) healAmount = 5;
        if (currentBuildBlock === 187) healAmount = 3;
        if (currentBuildBlock === 188) healAmount = 8;
        if (healAmount > 0 && player.health < player.maxHealth) {
            player.health = Math.min(player.maxHealth, player.health + healAmount);
            if (typeof updateHealthUI === 'function') updateHealthUI();
            if (gameMode === 'survival') {
                inventory[activeSlot].count--;
                if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                if (typeof buildUI === 'function') buildUI();
                if (typeof selectSlot === 'function') selectSlot(activeSlot);
            }
            return;
        }
    }

    // --- UI block interactions (crafting table, furnace, chest, etc.) ---
    if (interactId === 58) { uiState = 'CRAFTING'; if (typeof openCraftingTable === 'function') openCraftingTable(); return; }
    if (interactId === 59) { uiState = 'FURNACE'; if (typeof openFurnace === 'function') openFurnace(target.hit[0], target.hit[1], target.hit[2]); return; }
    if (interactId === 69) { uiState = 'CHEST'; if (typeof openChest === 'function') openChest(target.hit[0], target.hit[1], target.hit[2]); return; }
    if (interactId === 93) { uiState = 'CHEST'; if (typeof openChest === 'function') openChest(target.hit[0], target.hit[1], target.hit[2]); return; }
    if (interactId === 201) { uiState = 'ENCHANTING'; if (typeof openEnchantingTable === 'function') openEnchantingTable(target.hit[0], target.hit[1], target.hit[2]); return; }
    
    // --- Button press ---
    if (interactId === 203) {
        if (typeof window.pressButton === 'function') window.pressButton(target.hit[0], target.hit[1], target.hit[2]);
        return;
    }

    // --- Lever toggle ---
    if (interactId === 205) {
        if (typeof window.toggleLever === 'function') window.toggleLever(target.hit[0], target.hit[1], target.hit[2]);
        return;
    }

    // --- Door toggle ---
    if (interactId === 149) {
        const val = getVoxel(target.hit[0], target.hit[1], target.hit[2]);
        const isOpen = (val >> 10) & 0x1;
        setVoxel(target.hit[0], target.hit[1], target.hit[2], 149,
            ((val >> 8) & 0x3) | (isOpen ? 0 : (1 << 2)) | ((val >> 12) & 0x1) << 4,
            (val >> 12) & 0x1, (val >> 13) & 0x1);
        // Toggle partner
        const isTop = (val >> 11) & 0x1;
        const otherY = isTop ? target.hit[1] - 1 : target.hit[1] + 1;
        const otherVal = getVoxel(target.hit[0], otherY, target.hit[2]);
        if ((otherVal & 0xFF) === 149) {
            const oOpen = (otherVal >> 10) & 0x1;
            setVoxel(target.hit[0], otherY, target.hit[2], 149,
                ((otherVal >> 8) & 0x3) | (oOpen ? 0 : (1 << 2)) | ((otherVal >> 12) & 0x1) << 4,
                (otherVal >> 12) & 0x1, (otherVal >> 13) & 0x1);
            if (typeof updateChunks === 'function') updateChunks(target.hit[0], otherY, target.hit[2]);
        }
        if (typeof updateChunks === 'function') updateChunks(target.hit[0], target.hit[1], target.hit[2]);
        if (typeof window.playDoorSound === 'function') window.playDoorSound(!isOpen);
        return;
    }

    // --- Trapdoor toggle ---
    if (interactId === 150) {
        const val = getVoxel(target.hit[0], target.hit[1], target.hit[2]);
        const wasOpen = (val >> 10) & 0x1;
        setVoxel(target.hit[0], target.hit[1], target.hit[2], 150,
            ((val >> 8) & 0x3) | (wasOpen ? 0 : (1 << 2)) | (((val >> 11) & 0x1) << 3),
            (val >> 12) & 0x1, (val >> 13) & 0x1);
        if (typeof updateChunks === 'function') updateChunks(target.hit[0], target.hit[1], target.hit[2]);
        if (typeof window.playDoorSound === 'function') window.playDoorSound(!wasOpen);
        return;
    }

    // --- Flint & Steel ---
    if (currentBuildBlock === 136) {
        if (typeof window.useFlintAndSteel === 'function') {
            window.useFlintAndSteel(target);
        }
        return;
    }

    // --- Spawn eggs ---
    if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock] && TOOL_DATA[currentBuildBlock].type === 'spawn_egg') {
        const [dx, dy, dz] = [target.hit[0] + target.normal[0], target.hit[1] + target.normal[1], target.hit[2] + target.normal[2]];
        const mobType = TOOL_DATA[currentBuildBlock].mobType;
        if (typeof window.spawnMobByType === 'function') window.spawnMobByType(mobType, dx + 0.5, dy, dz + 0.5);
        if (gameMode === 'survival') {
            inventory[activeSlot].count--;
            if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
            if (typeof buildUI === 'function') buildUI();
        }
        return;
    }

    // --- Bow ---
    if (currentBuildBlock === 164) {
        if (typeof window.shootArrow === 'function') window.shootArrow();
        return;
    }

    // --- Place block ---
    if (currentBuildBlock !== 0 && !_isToolItem(currentBuildBlock)) {
        const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
        const targetVal = getVoxel(target.hit[0], target.hit[1], target.hit[2]);

        // --- REDSTONE DUST PLACEMENT (block 202) ---
        if (currentBuildBlock === 202) {
            if (target.normal[1] !== 1) return; // Only on top face
            const [dx, dy, dz] = [target.hit[0] + target.normal[0], target.hit[1] + target.normal[1], target.hit[2] + target.normal[2]];
            const belowId = getVoxel(dx, dy - 1, dz) & 0xFF;
            if (!canSupport(belowId)) return;
            const existId = getVoxel(dx, dy, dz) & 0xFF;
            if (existId !== 0) return;
            setVoxel(dx, dy, dz, 202, 0);
            pendingBlockUpdates.push({x: dx, y: dy, z: dz});
            if (typeof window.onRedstoneBlockChanged === 'function') window.onRedstoneBlockChanged(dx, dy, dz);
            if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(3, dx, dy, dz);
            if (gameMode === 'survival' && inventory[activeSlot]) {
                inventory[activeSlot].count--;
                if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                if (typeof buildUI === 'function') buildUI();
                if (typeof selectSlot === 'function') selectSlot(activeSlot);
            }
            return;
        }

        // --- WOOD BUTTON PLACEMENT (203) ---
        if (currentBuildBlock === 203) {
            if (target.normal[1] !== 0) return; // Side faces only
            const attachId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
            if (!canSupport(attachId)) return;
            const [dx, dy, dz] = [target.hit[0] + target.normal[0], target.hit[1] + target.normal[1], target.hit[2] + target.normal[2]];
            const existId = getVoxel(dx, dy, dz) & 0xFF;
            if (existId !== 0) return;
            let btnDir = 0;
            if (target.normal[2] === 1) btnDir = 2;
            else if (target.normal[0] === 1) btnDir = 3;
            else if (target.normal[2] === -1) btnDir = 0;
            else if (target.normal[0] === -1) btnDir = 1;
            setVoxel(dx, dy, dz, 203, btnDir);
            pendingBlockUpdates.push({x: dx, y: dy, z: dz});
            if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(13, dx, dy, dz);
            if (gameMode === 'survival' && inventory[activeSlot]) {
                inventory[activeSlot].count--;
                if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                if (typeof buildUI === 'function') buildUI();
                if (typeof selectSlot === 'function') selectSlot(activeSlot);
            }
            return;
        }

        // --- LEVER PLACEMENT (205) ---
        if (currentBuildBlock === 205) {
            if (target.normal[1] !== 0) return;
            const attachId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
            if (!canSupport(attachId)) return;
            const [dx, dy, dz] = [target.hit[0] + target.normal[0], target.hit[1] + target.normal[1], target.hit[2] + target.normal[2]];
            const existId = getVoxel(dx, dy, dz) & 0xFF;
            if (existId !== 0) return;
            let levDir = 0;
            if (target.normal[2] === 1) levDir = 2;
            else if (target.normal[0] === 1) levDir = 3;
            else if (target.normal[2] === -1) levDir = 0;
            else if (target.normal[0] === -1) levDir = 1;
            setVoxel(dx, dy, dz, 205, levDir);
            pendingBlockUpdates.push({x: dx, y: dy, z: dz});
            if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(205, dx, dy, dz);
            if (gameMode === 'survival' && inventory[activeSlot]) {
                inventory[activeSlot].count--;
                if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                if (typeof buildUI === 'function') buildUI();
                if (typeof selectSlot === 'function') selectSlot(activeSlot);
            }
            return;
        }

        // --- SLAB DOUBLING ---
        if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock) && currentBuildBlock === targetId) {
            const existingIsTop = (targetVal >> 8) & 0x1;
            const slabToFull = { 70: 29, 71: 44, 72: 30, 73: 3, 74: 33, 75: 32, 76: 31, 77: 98, 157: 156 };
            const fullBlock = slabToFull[currentBuildBlock];
            if (fullBlock) {
                let shouldMerge = false;
                if (existingIsTop === 0 && target.normal[1] === 1) shouldMerge = true;
                else if (existingIsTop === 1 && target.normal[1] === -1) shouldMerge = true;
                else if (target.normal[1] === 0) shouldMerge = true;
                if (shouldMerge) {
                    setVoxel(target.hit[0], target.hit[1], target.hit[2], fullBlock);
                    pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                    if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(fullBlock, target.hit[0], target.hit[1], target.hit[2]);
                    if (gameMode === 'survival' && inventory[activeSlot]) {
                        inventory[activeSlot].count--;
                        if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                        if (typeof buildUI === 'function') buildUI();
                        if (typeof selectSlot === 'function') selectSlot(activeSlot);
                    }
                    return;
                }
            }
        }

        let [dx, dy, dz] = [target.hit[0] + target.normal[0], target.hit[1] + target.normal[1], target.hit[2] + target.normal[2]];
        const existingId = getVoxel(dx, dy, dz) & 0xFF;

        if (typeof isCrossBlock === 'function' && isCrossBlock(targetId)) {
            dx = target.hit[0]; dy = target.hit[1]; dz = target.hit[2];
        }

        if (existingId !== 0 && existingId !== 4 && existingId !== 27 &&
            !(typeof isCrossBlock === 'function' && isCrossBlock(existingId))) return;

        // Don't place inside player
        const pw = 0.3;
        if (dx + 1 > player.x - pw && dx < player.x + pw &&
            dy + 1 > player.y && dy < player.y + player.height &&
            dz + 1 > player.z - pw && dz < player.z + pw) return;

        if (typeof canPlaceBlock === 'function' && !canPlaceBlock(currentBuildBlock, dx, dy, dz, target.normal)) return;

        let placeLevel = 0;
        if (currentBuildBlock === 17 || currentBuildBlock === 206) {
            // Torch
            if (target.normal[1] === 1) placeLevel = 0;
            else if (target.normal[0] === 1) placeLevel = 1;
            else if (target.normal[0] === -1) placeLevel = 2;
            else if (target.normal[2] === 1) placeLevel = 3;
            else if (target.normal[2] === -1) placeLevel = 4;
        } else if (currentBuildBlock === 59) {
            // Furnace
            let dirX = player.x - dx; let dirZ = player.z - dz;
            if (Math.abs(dirX) > Math.abs(dirZ)) { placeLevel = dirX > 0 ? 1 : 3; }
            else { placeLevel = dirZ > 0 ? 0 : 2; }
        } else if (currentBuildBlock === 69 || currentBuildBlock === 93) {
            // Chest / Loot Chest
            let dirX = player.x - dx; let dirZ = player.z - dz;
            if (Math.abs(dirX) > Math.abs(dirZ)) { placeLevel = dirX > 0 ? 1 : 3; }
            else { placeLevel = dirZ > 0 ? 0 : 2; }
        } else if (currentBuildBlock === 66) {
            // Vine
            if (target.normal[0] === 1) placeLevel = 1;
            else if (target.normal[0] === -1) placeLevel = 2;
            else if (target.normal[2] === 1) placeLevel = 3;
            else if (target.normal[2] === -1) placeLevel = 4;
            else placeLevel = 1;
        } else if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock)) {
            // Slab placement
            if (target.normal[1] === 1) { placeLevel = 0; }
            else if (target.normal[1] === -1) { placeLevel = 1; }
            else {
                if (target.exactHit) {
                    const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                    placeLevel = (localY >= 0.5) ? 1 : 0;
                } else { placeLevel = 0; }
            }
        } else if (typeof isStairBlock === 'function' && isStairBlock(currentBuildBlock)) {
            // Stair placement
            let dirX = player.x - (dx + 0.5); let dirZ = player.z - (dz + 0.5);
            let stairDir = 0;
            if (Math.abs(dirX) > Math.abs(dirZ)) { stairDir = dirX > 0 ? 3 : 2; }
            else { stairDir = dirZ > 0 ? 1 : 0; }
            let upsideDown = 0;
            if (target.normal[1] === -1) { upsideDown = 4; }
            else if (target.normal[1] === 0 && target.exactHit) {
                const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                if (localY >= 0.5) upsideDown = 4;
            }
            placeLevel = stairDir | upsideDown;
        } else if (currentBuildBlock === 68 || currentBuildBlock === 158) {
            // Logs / pillars
            let yaw = player.yaw * (180 / Math.PI);
            if (yaw < 0) yaw += 360;
            if ((yaw > 45 && yaw <= 135) || (yaw > 225 && yaw <= 315)) placeLevel = 1;
        }

        setVoxel(dx, dy, dz, currentBuildBlock, placeLevel);
        pendingBlockUpdates.push({x: dx, y: dy, z: dz});

        if (typeof window._soundPlaceBlock === 'function') {
            window._soundPlaceBlock(currentBuildBlock, dx, dy, dz);
        }

        if (gameMode === 'survival') {
            inventory[activeSlot].count--;
            if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
            if (typeof buildUI === 'function') buildUI();
            if (typeof selectSlot === 'function') selectSlot(activeSlot);
        }
    }
}

function _isToolItem(id) {
    if (typeof TOOL_DATA === 'undefined') return false;
    const t = TOOL_DATA[id];
    if (!t) return false;
    return t.type === 'axe' || t.type === 'pickaxe' || t.type === 'shovel' || t.type === 'sword' ||
           t.type === 'hoe' || t.type === 'bow';
}

// ==========================================
// HOLD → BREAK BLOCK
// ==========================================

function _startBreaking(screenX, screenY) {
    if (uiState !== 'PLAYING') return;
    _breakingTouch = true;
    _breakScreenX = screenX;
    _breakScreenY = screenY;
    window.isLeftMouseHeld = true;

    // Use camera-center raycast (where crosshair points)
    const target = (typeof raycastVoxel === 'function') ? raycastVoxel() : null;
    if (!target) return;

    const [x, y, z] = target.hit;
    const targetId = getVoxel(x, y, z) & 0xFF;
    if (targetId === 18 || targetId === 0) return;

    if (gameMode === 'creative') {
        if (targetId === 65) {
            if (typeof window.igniteTNT === 'function') window.igniteTNT(x, y, z);
        } else {
            if (typeof window.breakBlock === 'function') window.breakBlock(x, y, z);
        }
        window.blockBreakCooldown = 0.1;
    } else {
        miningState.isMining = true;
        miningState.x = x; miningState.y = y; miningState.z = z;
        miningState.id = targetId;
        miningState.progress = 0; miningState.stage = -1;
        if (typeof breakingBox !== 'undefined') {
            breakingBox.position.set(x + 0.5, y + 0.5, z + 0.5);
            breakingBox.visible = true;
        }
    }
}

function _stopBreaking() {
    _breakingTouch = false;
    window.isLeftMouseHeld = false;
    miningState.isMining = false;
    miningState.progress = 0;
    miningState.stage = -1;
    if (typeof breakingBox !== 'undefined' && breakingBox) breakingBox.visible = false;
}

// Redirect breaking to a new screen position (finger moved while holding)
function _redirectBreaking(screenX, screenY) {
    _breakScreenX = screenX;
    _breakScreenY = screenY;

    const target = _raycastVoxelFromScreen(screenX, screenY);
    if (!target) return;

    const [x, y, z] = target.hit;
    const targetId = getVoxel(x, y, z) & 0xFF;
    if (targetId === 18 || targetId === 0) return;

    // If targeting a different block, reset mining progress
    if (miningState.x !== x || miningState.y !== y || miningState.z !== z) {
        if (gameMode === 'creative') {
            if (targetId === 65) {
                if (typeof window.igniteTNT === 'function') window.igniteTNT(x, y, z);
            } else {
                if (typeof window.breakBlock === 'function') window.breakBlock(x, y, z);
            }
            window.blockBreakCooldown = 0.1;
        } else {
            miningState.isMining = true;
            miningState.x = x; miningState.y = y; miningState.z = z;
            miningState.id = targetId;
            miningState.progress = 0; miningState.stage = -1;
            if (typeof breakingBox !== 'undefined') {
                breakingBox.position.set(x + 0.5, y + 0.5, z + 0.5);
                breakingBox.visible = true;
            }
        }
    }
}

// ==========================================
// INVENTORY TOUCH HANDLING (MCPE-Style)
// ==========================================
// Tap with no cursor item → pick up full stack (left-click)
// Tap empty slot while holding → place ONE item (right-click)
// Tap same item while holding → place ONE item (right-click)
// Double-tap slot while holding → drop ENTIRE stack (left-click)
// Tap different item while holding → swap stacks (left-click)
// Tap crafting/furnace output → always take full result (left-click)

(function() {
    let _invLastTapTime = 0;
    let _invLastTapSlot = null;
    let _invPendingTap = null; // Deferred single-tap timer

    function _dispatchSlotEvent(slot, button, clientX, clientY) {
        const mouseEvent = new MouseEvent('mousedown', {
            bubbles: true, cancelable: true,
            clientX: clientX, clientY: clientY,
            button: button
        });
        slot.dispatchEvent(mouseEvent);
    }

    function _executeSingleTap(slot, touch) {
        const isOutputSlot = slot.classList.contains('surv-craft-out') ||
                             slot.classList.contains('craft-table-out') ||
                             slot.classList.contains('furnace-output-slot') ||
                             slot.id === 'surv-crafting-output' ||
                             slot.id === 'table-crafting-output' ||
                             slot.id === 'furnace-output';

        // Creative catalog slots — always left-click (pick up 64 or drop cursor)
        const isCreativeCatalog = slot.closest('#inventory-grid') !== null;

        let button = 0;

        if (window.cursorItem && !isOutputSlot && !isCreativeCatalog) {
            const hasIcon = slot.querySelector('.item-icon');
            if (!hasIcon) {
                button = 2; // Empty slot → place ONE
            } else {
                // Has item — try right-click (place one if same), fallback left-click (swap if different)
                const savedCursor = { ...window.cursorItem };
                _dispatchSlotEvent(slot, 2, touch.clientX, touch.clientY);
                if (window.cursorItem && window.cursorItem.count === savedCursor.count) {
                    _dispatchSlotEvent(slot, 0, touch.clientX, touch.clientY);
                }
                return;
            }
        }

        _dispatchSlotEvent(slot, button, touch.clientX, touch.clientY);
    }

    document.addEventListener('touchstart', function(e) {
        if (!isMobileMode) return;
        if (uiState !== 'INVENTORY' && uiState !== 'CRAFTING' && uiState !== 'FURNACE' && uiState !== 'CHEST' && uiState !== 'ENCHANTING') return;

        const touch = e.changedTouches[0];
        if (!touch) return;

        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!el) return;

        const slot = el.closest('.item-slot');
        if (!slot) return;

        // Creative catalog slots — let the native mousedown from touch handle them
        // Don't dispatch synthetic events or they'll fire twice
        const isCreativeCatalog = slot.closest('#inventory-grid') !== null;
        if (isCreativeCatalog) return;

        const now = Date.now();
        const isDoubleTap = (_invLastTapSlot === slot && now - _invLastTapTime < 300);

        if (isDoubleTap && window.cursorItem) {
            // Cancel the pending single-tap
            if (_invPendingTap) {
                clearTimeout(_invPendingTap);
                _invPendingTap = null;
            }
            // Drop entire stack (left-click)
            _dispatchSlotEvent(slot, 0, touch.clientX, touch.clientY);
            _invLastTapTime = 0;
            _invLastTapSlot = null;
            return;
        }

        _invLastTapTime = now;
        _invLastTapSlot = slot;

        // If holding cursor item, defer the single-tap to wait for possible double-tap
        if (window.cursorItem) {
            const savedTouch = { clientX: touch.clientX, clientY: touch.clientY };
            _invPendingTap = setTimeout(() => {
                _invPendingTap = null;
                _executeSingleTap(slot, savedTouch);
            }, 200);
        } else {
            // No cursor item — execute immediately (pick up stack)
            _executeSingleTap(slot, touch);
        }
    }, { passive: false });
})();

// ==========================================
// GAME LOOP INTEGRATION
// ==========================================

// Show/hide controls based on game state
function _tickMobileUI() {
    if (!isMobileMode) return;
    const ctrl = document.getElementById('mobile-controls');
    if (!ctrl) return;

    const isInUI = (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING');
    const shouldShow = (uiState === 'PLAYING' || isInUI);

    ctrl.style.display = shouldShow ? 'block' : 'none';
    ctrl.style.visibility = shouldShow ? 'visible' : 'hidden';
    ctrl.style.opacity = shouldShow ? '1' : '0';

    if (uiState === 'PLAYING') isPointerLocked = true;

    // During inventory/UI states, hide all buttons except inventory toggle
    // and make look area non-interactive so inventory touches pass through
    const btnIds = ['mobile-btn-jump', 'mobile-btn-sneak', 'mobile-btn-pause', 'mobile-btn-camera', 'mobile-joystick-area', 'mobile-sprint-indicator', 'mobile-hotbar-left', 'mobile-hotbar-right'];
    for (const id of btnIds) {
        const el = document.getElementById(id);
        if (el) el.style.display = isInUI ? 'none' : '';
    }
    const lookArea = document.getElementById('mobile-look-area');
    if (lookArea) lookArea.style.pointerEvents = isInUI ? 'none' : 'auto';

    // During UI states, disable touch interception on the overlay so native scrolling works
    ctrl.style.touchAction = isInUI ? 'auto' : 'none';
    ctrl.style.pointerEvents = isInUI ? 'none' : 'none'; // Container always none, children are auto

    // Hide hotbar and related HUD elements during inventory/UI states on mobile
    const hotbar = document.getElementById('main-hotbar');
    if (hotbar) hotbar.style.display = isInUI ? 'none' : '';
    const hudBars = document.getElementById('hud-bars');
    if (hudBars) hudBars.style.display = isInUI ? 'none' : '';
    const xpBar = document.getElementById('xp-bar-container');
    if (xpBar) {
        const hideXP = isInUI || (typeof gameMode !== 'undefined' && gameMode === 'creative') ||
                       (typeof GEN_XP_ENABLED !== 'undefined' && !GEN_XP_ENABLED);
        xpBar.style.display = hideXP ? 'none' : '';
    }

    // Inventory button always visible when controls are shown
    const invBtn = document.getElementById('mobile-btn-inventory');
    if (invBtn) invBtn.style.display = shouldShow ? '' : 'none';

    // Hide clock on mobile
    const clock = document.getElementById('clock-container');
    if (clock) clock.style.display = 'none';

    // Enforce mobile world sizes on the create world screen
    if (_mobileWorldSizesApplied && uiState === 'CREATE_WORLD') {
        const wsBtn = document.getElementById('opt-worldsize');
        if (wsBtn && typeof worldSizeLabels !== 'undefined' && typeof worldOptions !== 'undefined') {
            wsBtn.textContent = worldSizeLabels[worldOptions.worldsize] || worldSizeLabels[0];
        }
    }
}

// Hook into the game's animation frame
const _origRAF = window.requestAnimationFrame;
let _mobileTickHooked = false;

function _hookMobileTick() {
    if (_mobileTickHooked) return;
    _mobileTickHooked = true;

    // Poll mobile UI state every frame
    setInterval(_tickMobileUI, 100);
}

// ==========================================
// CLICK-TO-PLAY OVERRIDE FOR MOBILE
// ==========================================

// On mobile, "Click to Play" should respond to touch
document.addEventListener('touchstart', function(e) {
    if (!isMobileMode) return;

    // Handle "Click to Play" overlay
    const overlay = document.getElementById('click-to-play-overlay');
    if (overlay && overlay.style.display !== 'none') {
        e.preventDefault();
        overlay.style.display = 'none';
        uiState = 'PLAYING';
        isPointerLocked = true;
        return;
    }

    // Handle main menu start / world select buttons
    const target = e.target;
    if (target && target.tagName === 'BUTTON') {
        // Let buttons work normally
        return;
    }

    // Handle UI layer click (normally requests pointer lock)
    if (uiState === 'PLAYING' || uiState === 'PAUSED') {
        isPointerLocked = true;
    }
}, { passive: false, capture: true });

// Prevent context menu on long press
document.addEventListener('contextmenu', function(e) {
    if (isMobileMode) e.preventDefault();
}, { passive: false });

// ==========================================
// INITIALIZATION
// ==========================================
// device-prompt.js handles the prompt and sets window._deviceChoice.
// If user picked mobile, it calls enableMobileMode().
// We just need to build the UI and start the tick.

function _initMobile() {
    _buildMobileUI();
    _hookMobileTick();
    // If device-prompt already chose mobile, enable now
    if (window._deviceChoice === 'mobile') {
        window.enableMobileMode();
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    _initMobile();
} else {
    document.addEventListener('DOMContentLoaded', _initMobile);
}

// Fallback: if user starts using touch while in desktop mode, auto-switch
document.addEventListener('touchstart', function(e) {
    if (!isMobileMode && uiState === 'PLAYING') {
        window.enableMobileMode();
    }
}, { passive: true });

// Fallback: if user starts using keyboard while in mobile mode, auto-switch
document.addEventListener('keydown', function(e) {
    if (isMobileMode && uiState === 'PLAYING' && (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD')) {
        window.disableMobileMode();
    }
}, { passive: true });

// ==========================================
// POINTER LOCK OVERRIDE FOR MOBILE
// ==========================================
// Instead of patching every requestPointerLock() call,
// override the method to be a no-op on mobile and
// just set the game to playing state.

const _origRequestPointerLock = HTMLElement.prototype.requestPointerLock;
HTMLElement.prototype.requestPointerLock = function() {
    if (window._mobileSkipPointerLock) {
        // Fake pointer lock for mobile — replicate full pointerlockchange behavior
        isPointerLocked = true;
        if (uiState !== 'DEAD') uiState = 'PLAYING';

        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.classList.add('hidden');
        const pm = document.getElementById('pause-menu');
        if (pm) pm.classList.add('hidden');
        const invModal = document.getElementById('inventory-modal');
        if (invModal) invModal.classList.add('hidden');
        const survModal = document.getElementById('survival-inventory-modal');
        if (survModal) survModal.classList.add('hidden');

        if (typeof closeCraftingTable === 'function') closeCraftingTable();
        if (typeof closeFurnace === 'function') closeFurnace();
        if (typeof closeChest === 'function') closeChest();

        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = 'block';

        // Remove click-to-play overlay if present
        const overlay = document.getElementById('click-to-play-overlay');
        if (overlay) overlay.remove();

        // Toss cursor item if holding one
        if (typeof cursorItem !== 'undefined' && cursorItem) {
            if (typeof window.tossItem === 'function') window.tossItem(cursorItem.id, cursorItem.count);
            cursorItem = null;
            if (typeof updateCursorItemUI === 'function') updateCursorItemUI();
        }

        // Immediately show mobile controls
        _tickMobileUI();
        return;
    }
    return _origRequestPointerLock.call(this);
};

const _origExitPointerLock = Document.prototype.exitPointerLock;
Document.prototype.exitPointerLock = function() {
    if (window._mobileSkipPointerLock) {
        isPointerLocked = false;
        return;
    }
    return _origExitPointerLock.call(this);
};

// ==========================================
// UI BUTTON SOUND (button.ogg)
// ==========================================

let _btnSoundBuffer = null;
let _btnSoundLoading = false;

async function _loadButtonSound() {
    if (_btnSoundLoading || _btnSoundBuffer) return;
    _btnSoundLoading = true;
    try {
        const ctx = (typeof window._getSharedAudioCtx === 'function') ? window._getSharedAudioCtx() : new (window.AudioContext || window.webkitAudioContext)();
        const resp = await fetch('sounds/button.ogg?v=' + ASSET_VERSION);
        const buf = await resp.arrayBuffer();
        _btnSoundBuffer = await ctx.decodeAudioData(buf);
    } catch (e) { console.warn('Failed to load button sound:', e); }
}

window.playButtonSound = function() {
    _loadButtonSound();
    const ctx = (typeof window._getSharedAudioCtx === 'function') ? window._getSharedAudioCtx() : null;
    if (!_btnSoundBuffer || !ctx) return;
    try {
        if (ctx.state === 'suspended') ctx.resume();
        const vol = (typeof settingSoundVolume !== 'undefined') ? settingSoundVolume : 1.0;
        const source = ctx.createBufferSource();
        source.buffer = _btnSoundBuffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.5 * vol;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(0);
    } catch (e) { /* ignore */ }
};

// Attach button sound to menu/pause buttons only (not mobile game controls)
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.mc-button, button');
    if (btn && !btn.classList.contains('mobile-btn') && typeof window.playButtonSound === 'function') {
        window.playButtonSound();
    }
}, true);
document.addEventListener('touchstart', function(e) {
    const btn = e.target.closest('.mc-button, button');
    if (btn && !btn.classList.contains('mobile-btn') && typeof window.playButtonSound === 'function') {
        window.playButtonSound();
    }
}, true);

// ==========================================
// MOBILE INVENTORY DOLL (2D Canvas Fallback)
// ==========================================
// Mobile browsers can't handle multiple WebGL contexts.
// Creates a separate 2D canvas overlaid on top of the WebGL doll canvas.

(function() {
    let _mobileDollImg = null;
    let _mobileDollLoaded = false;
    let _mobileDollCanvas = null;

    function _loadMobileDollTexture() {
        if (_mobileDollImg) return;
        _mobileDollImg = new Image();
        _mobileDollImg.onload = () => { _mobileDollLoaded = true; };
        _mobileDollImg.src = 'textures/steve.png?v=' + (typeof ASSET_VERSION !== 'undefined' ? ASSET_VERSION : '1');
    }

    function _ensureMobileDollCanvas() {
        if (_mobileDollCanvas) return _mobileDollCanvas;
        // Create a new 2D canvas and overlay it exactly on top of the original doll canvas
        const origCanvas = document.getElementById('inv-player-doll');
        if (!origCanvas || !origCanvas.parentNode) return null;

        _mobileDollCanvas = document.createElement('canvas');
        _mobileDollCanvas.id = 'mobile-inv-doll';
        _mobileDollCanvas.width = 98;
        _mobileDollCanvas.height = 140;
        _mobileDollCanvas.style.cssText = origCanvas.style.cssText;
        _mobileDollCanvas.style.zIndex = '5';
        _mobileDollCanvas.style.pointerEvents = 'none';

        // Hide the original WebGL canvas
        origCanvas.style.display = 'none';

        origCanvas.parentNode.appendChild(_mobileDollCanvas);
        return _mobileDollCanvas;
    }

    function _drawMobileDoll() {
        const canvas = _ensureMobileDollCanvas();
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (!_mobileDollLoaded || !_mobileDollImg) return;

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const s = 4;
        const cx = canvas.width / 2;
        const headY = 10;

        // Head (8x8 at 8,8 in texture)
        ctx.drawImage(_mobileDollImg, 8, 8, 8, 8, cx - 4*s, headY, 8*s, 8*s);

        // Body (8x12 at 20,20 in texture)
        ctx.drawImage(_mobileDollImg, 20, 20, 8, 12, cx - 4*s, headY + 8*s, 8*s, 12*s);

        // Right Arm (4x12 at 44,20 in texture)
        ctx.drawImage(_mobileDollImg, 44, 20, 4, 12, cx - 8*s, headY + 8*s, 4*s, 12*s);

        // Left Arm (mirrored)
        ctx.save();
        ctx.translate(cx + 8*s, headY + 8*s);
        ctx.scale(-1, 1);
        ctx.drawImage(_mobileDollImg, 44, 20, 4, 12, 0, 0, 4*s, 12*s);
        ctx.restore();

        // Right Leg (4x12 at 4,20 in texture)
        ctx.drawImage(_mobileDollImg, 4, 20, 4, 12, cx - 4*s, headY + 20*s, 4*s, 12*s);

        // Left Leg (mirrored)
        ctx.save();
        ctx.translate(cx + 4*s, headY + 20*s);
        ctx.scale(-1, 1);
        ctx.drawImage(_mobileDollImg, 4, 20, 4, 12, 0, 0, 4*s, 12*s);
        ctx.restore();

        // Armor overlays
        if (typeof armorSlots !== 'undefined') {
            const colors = {
                174:'rgba(139,90,43,0.5)',175:'rgba(139,90,43,0.5)',176:'rgba(139,90,43,0.5)',177:'rgba(139,90,43,0.5)',
                170:'rgba(200,200,200,0.5)',171:'rgba(200,200,200,0.5)',172:'rgba(200,200,200,0.5)',173:'rgba(200,200,200,0.5)',
                178:'rgba(80,220,220,0.5)',179:'rgba(80,220,220,0.5)',180:'rgba(80,220,220,0.5)',181:'rgba(80,220,220,0.5)',
                182:'rgba(220,200,50,0.5)',183:'rgba(220,200,50,0.5)',184:'rgba(220,200,50,0.5)',185:'rgba(220,200,50,0.5)'
            };
            if (armorSlots[0] && colors[armorSlots[0].id]) { ctx.fillStyle = colors[armorSlots[0].id]; ctx.fillRect(cx-5*s, headY-s, 10*s, 9*s); }
            if (armorSlots[1] && colors[armorSlots[1].id]) { ctx.fillStyle = colors[armorSlots[1].id]; ctx.fillRect(cx-8*s, headY+8*s, 16*s, 12*s); }
            if (armorSlots[2] && colors[armorSlots[2].id]) { ctx.fillStyle = colors[armorSlots[2].id]; ctx.fillRect(cx-4*s, headY+20*s, 8*s, 12*s); }
            if (armorSlots[3] && colors[armorSlots[3].id]) { ctx.fillStyle = colors[armorSlots[3].id]; ctx.fillRect(cx-4*s, headY+28*s, 8*s, 4*s); }
        }
    }

    // Override the doll start/stop for mobile
    const _origStartDoll = window._startInventoryDoll;
    const _origStopDoll = window._stopInventoryDoll;
    let _mobileDollInterval = null;

    window._startInventoryDoll = function() {
        if (isMobileMode) {
            _loadMobileDollTexture();
            _mobileDollInterval = setInterval(_drawMobileDoll, 100);
            setTimeout(_drawMobileDoll, 50);
        } else {
            // Desktop: make sure mobile canvas is hidden, original is shown
            const origCanvas = document.getElementById('inv-player-doll');
            if (origCanvas) origCanvas.style.display = '';
            const mobCanvas = document.getElementById('mobile-inv-doll');
            if (mobCanvas) mobCanvas.style.display = 'none';
            if (_origStartDoll) _origStartDoll();
        }
    };

    window._stopInventoryDoll = function() {
        if (_mobileDollInterval) {
            clearInterval(_mobileDollInterval);
            _mobileDollInterval = null;
        }
        // Hide mobile canvas
        const mobCanvas = document.getElementById('mobile-inv-doll');
        if (mobCanvas) mobCanvas.style.display = 'none';
        // Show original for desktop
        const origCanvas = document.getElementById('inv-player-doll');
        if (origCanvas) origCanvas.style.display = '';
        if (_origStopDoll) _origStopDoll();
    };
})();

})();
