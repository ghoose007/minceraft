// ==========================================
// HUD, HOTBAR & ITEM DISPLAY
// ==========================================

// --- SPAWN EGG TEXTURE COMPOSITING ---
// Composites base (index 150) + detail (index 151) from terrain.png with per-mob tint colors
const SPAWN_EGG_COLORS = {
    190: { base: [0xF0, 0xA5, 0xA2], detail: [0xDB, 0x63, 0x5F] }, // Pig
    191: { base: [0x44, 0x36, 0x26], detail: [0xA1, 0xA1, 0xA1] }, // Cow
    192: { base: [0xE7, 0xE7, 0xE7], detail: [0xFF, 0xB5, 0xB5] }, // Sheep
    193: { base: [0x00, 0xAF, 0xAF], detail: [0x79, 0x9C, 0x65] }, // Zombie
    194: { base: [0x0D, 0xA7, 0x0B], detail: [0x00, 0x00, 0x00] }, // Creeper
    195: { base: [0xC1, 0xC1, 0xC1], detail: [0x49, 0x49, 0x49] }, // Skeleton
    196: { base: [0xEA, 0x93, 0x93], detail: [0x4C, 0x71, 0x29] }, // Zombie Pigman
};
const _spawnEggDataUrls = {};
let _spawnEggAtlasReady = false;

function _buildSpawnEggTextures() {
    if (_spawnEggAtlasReady) return;
    const img = new Image();
    img.src = 'textures/terrain.png?v=' + ASSET_VERSION;
    img.onload = () => {
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.width; srcCanvas.height = img.height;
        const srcCtx = srcCanvas.getContext('2d');
        srcCtx.drawImage(img, 0, 0);
        
        // Extract base (150) and detail (151) tiles
        const baseCol = 150 % 16, baseRow = Math.floor(150 / 16);
        const detCol = 151 % 16, detRow = Math.floor(151 / 16);
        const baseData = srcCtx.getImageData(baseCol * 16, baseRow * 16, 16, 16);
        const detData = srcCtx.getImageData(detCol * 16, detRow * 16, 16, 16);
        
        for (const [idStr, colors] of Object.entries(SPAWN_EGG_COLORS)) {
            const c = document.createElement('canvas');
            c.width = 16; c.height = 16;
            const ctx = c.getContext('2d');
            const out = ctx.createImageData(16, 16);
            
            for (let i = 0; i < 16 * 16; i++) {
                const idx = i * 4;
                // Base layer tinted
                const ba = baseData.data[idx + 3];
                if (ba > 0) {
                    const gray = baseData.data[idx] / 255;
                    out.data[idx]     = Math.round(colors.base[0] * gray);
                    out.data[idx + 1] = Math.round(colors.base[1] * gray);
                    out.data[idx + 2] = Math.round(colors.base[2] * gray);
                    out.data[idx + 3] = ba;
                }
                // Detail layer tinted (overwrites base where opaque)
                const da = detData.data[idx + 3];
                if (da > 0) {
                    const gray = detData.data[idx] / 255;
                    out.data[idx]     = Math.round(colors.detail[0] * gray);
                    out.data[idx + 1] = Math.round(colors.detail[1] * gray);
                    out.data[idx + 2] = Math.round(colors.detail[2] * gray);
                    out.data[idx + 3] = da;
                }
            }
            ctx.putImageData(out, 0, 0);
            _spawnEggDataUrls[idStr] = c.toDataURL();
        }
        _spawnEggAtlasReady = true;
    };
}
_buildSpawnEggTextures();

function getSpawnEggDataUrl(itemId) {
    return _spawnEggDataUrls[itemId] || '';
}

// --- 3D CSS INJECTION FOR INVENTORY BLOCKS, DAMAGE SHAKE & DURABILITY ---
if (!document.getElementById('mc-3d-styles')) {
    const style = document.createElement('style');
    style.id = 'mc-3d-styles';
    style.innerHTML = `
        /* Main Hotbar: Sits at the absolute bottom. Fixed 364px width and no-repeat fix white lines. */
        #main-hotbar {
            position: fixed;
            bottom: 0px; 
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            width: 364px; 
            height: 44px;
            background-image: url('textures/gui.png?v=${ASSET_VERSION}');
            background-size: 512px 512px; /* 2x Scale */
            background-position: 0 0;
            background-repeat: no-repeat !important; /* CRITICAL: Stops white border bleed */
            image-rendering: pixelated;
            overflow: visible;
            padding: 0;
            box-sizing: border-box;
            z-index: 100;
        }

        /* Slots: Set to 40px width to match the 2x texture regions exactly */
        #main-hotbar .item-slot {
            width: 40px;
            height: 44px;
            margin: 0 0.22px; /* Fine-tuned alignment for the 364px bar */
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            background: none !important; 
            border: none !important;     
            box-sizing: border-box;
            z-index: 1;
        }

        /* Selection Indicator: Scaled to 48x44 at Y=44 (original 24x22 at Y=22) */
        #main-hotbar .item-slot.active::after {
            content: '';
            position: absolute;
            width: 48px; 
            height: 44px;
            top: 0;
            left: -4px; 
            background-image: url('textures/gui.png?v=${ASSET_VERSION}');
            background-size: 512px 512px;
            background-position: 0 -44px; 
            background-repeat: no-repeat !important;
            image-rendering: pixelated;
            z-index: 10;
            pointer-events: none;
        }

        /* Health Bar: Anchored to the left side above the 364px hotbar */
        #health-bar {
            position: fixed;
            bottom: 44px;
            left: calc(50% - 178px);
            display: flex;
            flex-direction: row;
            z-index: 101;
        }

        /* Armor Bar: Same position as health but 20px higher */
        #armor-bar {
            position: fixed;
            bottom: 64px;
            left: calc(50% - 178px);
            display: flex;
            flex-direction: row;
            z-index: 101;
        }

        .mc-screen {
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            z-index: 100;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }

        /* 3D Isometric Block Icons: Restored to 2x Scale sizes */
        .item-icon.is-3d-block {
            position: absolute;
            top: 50%; left: 50%;
            width: 20px; height: 20px;
            transform-style: preserve-3d;
            transform: translate(-50%, -50%) rotateX(-25deg) rotateY(-45deg);
        }
        .item-icon.is-3d-block .face {
            position: absolute;
            width: 20px; height: 20px;
            background-image: url('textures/terrain.png?v=${ASSET_VERSION}');
            background-size: 1600% 1600%;
            image-rendering: pixelated;
        }
        .item-icon.is-3d-block .top { transform: rotateX(90deg) translateZ(10px); }
        .item-icon.is-3d-block .right { transform: rotateY(90deg) translateZ(10px); filter: brightness(0.8); }
        .item-icon.is-3d-block .front { transform: translateZ(10px); filter: brightness(0.5); }
        
        /* 2D Item Icons: Restored to 32px size */
        .item-icon {
            width: 32px;
            height: 32px;
            background-size: 1600% 1600%;
            image-rendering: pixelated;
            pointer-events: none;
        }

        @keyframes mc-damage-shake {
            0% { transform: translate(1px, 1px); }
            20% { transform: translate(-1px, -2px); }
            40% { transform: translate(-2px, 1px); }
            60% { transform: translate(2px, -1px); }
            80% { transform: translate(1px, 2px); }
            100% { transform: translate(0, 0); }
        }
        .damage-shake { animation: mc-damage-shake 0.3s ease-in-out; }

        .durability-bar {
            position: absolute;
            bottom: 7px;
            left: 4px;
            right: 4px;
            height: 3px;
            background: #000;
            border: 1px solid #000;
            pointer-events: none;
            display: flex;
        }
        .durability-progress { height: 100%; transition: width 0.1s; }

        /* Screen shake — applied to canvas so UI layout is unaffected */
        @keyframes damage-screen-shake {
            0%   { transform: translate(0, 0) rotate(0deg); }
            15%  { transform: translate(-4px, 2px) rotate(-0.3deg); }
            30%  { transform: translate(4px, -2px) rotate(0.3deg); }
            50%  { transform: translate(-3px, 1px) rotate(-0.2deg); }
            70%  { transform: translate(3px, -1px) rotate(0.2deg); }
            85%  { transform: translate(-1px, 1px) rotate(0deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
        }
        html.damage-shake-screen {
            animation: damage-screen-shake 0.28s cubic-bezier(.36,.07,.19,.97) both;
        }
    `;
    document.head.appendChild(style);
}

// --- DURABILITY LOGIC ---
function updateDurabilityBar(slotEl, item) {
    if (!item || item.id === 0) return;
    const tool = TOOL_DATA[item.id];
    if (!tool || !tool.maxDurability || item.durability === undefined || item.durability >= tool.maxDurability) {
        const existing = slotEl.querySelector('.durability-bar');
        if (existing) existing.remove();
        return;
    }

    let bar = slotEl.querySelector('.durability-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'durability-bar';
        const inner = document.createElement('div');
        inner.className = 'durability-progress';
        bar.appendChild(inner);
        slotEl.appendChild(bar);
    }

    const percent = Math.max(0, (item.durability / tool.maxDurability) * 100);
    const progress = bar.querySelector('.durability-progress');
    progress.style.width = percent + '%';

    let color = '#55ff55'; 
    if (percent < 20) color = '#ff5555';      
    else if (percent < 50) color = '#ffff55'; 
    
    progress.style.backgroundColor = color;
}
// Fix tooltip + action-text positioning
(function() {
    const s = document.createElement('style');
    s.textContent = [
        /* tooltip: fixed so zoom doesn't affect tracking */
        '#item-tooltip {',
        '    position: fixed !important;',
        '    z-index: 9999 !important;',
        '}',
        /* action-text: fixed, anchored just above the 44px hotbar */
        '#action-text {',
        '    position: fixed !important;',
        '    bottom: 48px !important;',
        '    left: 50% !important;',
        '    transform: translateX(-50%) !important;',
        '    z-index: 200 !important;',
        '    margin: 0 !important;',
        '    width: auto !important;',
        '    white-space: nowrap !important;',
        '    pointer-events: none !important;',
        '    background: rgba(0,0,0,0.3) !important;',
        '    padding: 1px 5px !important;',
        '}',
        /* html overflow hidden stops shake edge bleed */
        'html { overflow: hidden !important; }',
    ].join('\n');
    document.head.appendChild(s);
})();


window.isStackable = function(id) {
    // Any item in TOOL_DATA that has maxDurability is a tool and NOT stackable
    if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id] && TOOL_DATA[id].maxDurability) return false;
    return true;
};

// --- UI MANAGEMENT ---
function updateClock(t) {
    const canvas = document.getElementById('clock-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    
    ctx.save();
    ctx.translate(32, 32);
    ctx.rotate(t * Math.PI * 2);
    
    ctx.fillStyle = '#87CEEB';
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI, true); ctx.fill();
    
    ctx.fillStyle = '#020412';
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI, false); ctx.fill();

    ctx.fillStyle = '#FFDD00';
    ctx.fillRect(-6, -22, 12, 12);

    ctx.fillStyle = '#DDDDDD';
    ctx.fillRect(-5, 10, 10, 10);
    ctx.restore();

    ctx.strokeStyle = '#D4AF37'; 
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.stroke();
}

function getIconStyle(blockId) {
    const id = parseInt(blockId);
    
    // Terrain Items (Sticks, Saplings, Food, Seeds 128, Wheat 129, Quartz 153)
    if ((id >= 112 && id <= 123) || id === 128 || id === 129 || id === 134 || id === 153 || id === 165 || id === 186 || id === 187 || id === 188) {
        const data = BLOCK_DATA[id] || TOOL_DATA[id];
        if (!data) return '';
        const atlasIdx = data.atlasIdx;
        const col = atlasIdx % 16, row = Math.floor(atlasIdx / 16);
        return `background-image: url('textures/terrain.png?v=${ASSET_VERSION}'); background-position: -${col * 100}% -${row * 100}%; background-size: 1600% 1600%; image-rendering: pixelated;`;
    }
    
    // Spawn eggs — composited canvas texture
    if (id >= 190 && id <= 196) {
        const url = getSpawnEggDataUrl(id);
        if (url) return `background-image: url('${url}'); background-size: contain; image-rendering: pixelated;`;
        return '';
    }
    
    // Tools — any item in TOOL_DATA with an atlasIdx that maps to tools.png
    if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id] && TOOL_DATA[id].maxDurability) {
        const data = TOOL_DATA[id];
        if (!data) return '';
        const atlasIdx = data.atlasIdx;
        const col = atlasIdx % 16, row = Math.floor(atlasIdx / 16);
        return `background-image: url('textures/tools.png?v=${ASSET_VERSION}'); background-position: -${col * 100}% -${row * 100}%; background-size: 1600% 1600%; image-rendering: pixelated;`;
    }
    
    const block = BLOCK_DATA[id];
    if (!block) return '';
    if (block.atlasIdx === -1) return `background-image: url('textures/water.png?v=${ASSET_VERSION}'); background-size: 400% 100%; background-position: 0 0; image-rendering: pixelated;`;
    if (block.atlasIdx === -2) return `background-image: url('textures/lava.png?v=${ASSET_VERSION}'); background-size: 400% 100%; background-position: 0 0; image-rendering: pixelated;`;
    
    let texIndex = id === 1 ? 0 : (typeof block.atlasIdx === 'object' ? (block.atlasIdx.front !== undefined ? block.atlasIdx.front : block.atlasIdx.side) : block.atlasIdx);
    const col = texIndex % 16, row = Math.floor(texIndex / 16);
    let filterStr = [1, 14, 16, 22, 24, 66, 67].includes(id) ? 'filter: sepia(1) hue-rotate(55deg) saturate(3.5) brightness(0.9);' : '';
    return `background-image: url('textures/terrain.png?v=${ASSET_VERSION}'); background-position: -${col * 100}% -${row * 100}%; background-size: 1600% 1600%; image-rendering: pixelated; ${filterStr}`;
}

function createIconElement(id) {
    const icon = document.createElement('div');
    icon.className = 'item-icon';
    const parsedId = parseInt(id);
    
    // Terrain Items (Sticks, Saplings, Food, Seeds 128, Wheat 129, Nether Brick 142, Gold Ingot 143, Quartz 153)
    if ((parsedId >= 112 && parsedId <= 123) || parsedId === 128 || parsedId === 129 || parsedId === 134 || parsedId === 135 || parsedId === 137 || parsedId === 142 || parsedId === 143 || parsedId === 151 || parsedId === 153 || parsedId === 165 || parsedId === 186 || parsedId === 187 || parsedId === 188
        || parsedId === 197 || parsedId === 198 || parsedId === 199) {
        const data = BLOCK_DATA[parsedId] || TOOL_DATA[parsedId];
        if (data) {
            const atlasIdx = data.atlasIdx;
            const col = atlasIdx % 16, row = Math.floor(atlasIdx / 16);
            icon.style = `background-image: url('textures/terrain.png?v=${ASSET_VERSION}'); background-position: -${col * 100}% -${row * 100}%; background-size: 1600% 1600%; image-rendering: pixelated;`;
        }
        return icon;
    }
    // Spawn eggs — composited canvas texture
    if (parsedId >= 190 && parsedId <= 196) {
        const url = getSpawnEggDataUrl(parsedId);
        if (url) {
            icon.style = `background-image: url('${url}'); background-size: contain; image-rendering: pixelated;`;
        }
        return icon;
    }
    // Door block (149) uses the flat door item texture (atlas 135)
    if (parsedId === 149) {
        const col = 135 % 16, row = Math.floor(135 / 16);
        icon.style = `background-image: url('textures/terrain.png?v=${ASSET_VERSION}'); background-position: -${col * 100}% -${row * 100}%; background-size: 1600% 1600%; image-rendering: pixelated;`;
        return icon;
    } 
    // Tools — any item in TOOL_DATA with durability uses tools.png
    else if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[parsedId] && TOOL_DATA[parsedId].maxDurability) {
        const data = TOOL_DATA[parsedId];
        if (data) {
            const atlasIdx = data.atlasIdx;
            const col = atlasIdx % 16, row = Math.floor(atlasIdx / 16);
            icon.style = `background-image: url('textures/tools.png?v=${ASSET_VERSION}'); background-position: -${col * 100}% -${row * 100}%; background-size: 1600% 1600%; image-rendering: pixelated;`;
        }
        return icon;
    } 
    // 3D Blocks & Flat Plants
    else {
        const block = BLOCK_DATA[parsedId];
        if (!block) return icon;
        
        const flatRenderIds = [4, 27, 16, 23, 24, 17, 40, 52, 53, 66, 67, 68, 116, 117, 118, 137, 150, 158];
        if (flatRenderIds.includes(parsedId)) {
            icon.style = getIconStyle(parsedId); 
        } else if (typeof isFenceBlock === 'function' && isFenceBlock(parsedId)) {
            // Fence: flat 2D canvas icon matching the fence shape
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            canvas.style.cssText = 'image-rendering: pixelated; width: 32px; height: 32px; pointer-events: none;';
            const ctx2 = canvas.getContext('2d');
            
            const img = new Image();
            img.src = 'textures/terrain.png?v=' + ASSET_VERSION;
            img.onload = () => {
                const tIdx = typeof block.atlasIdx === 'object' ? block.atlasIdx.side : block.atlasIdx;
                const tcol = tIdx % 16, trow = Math.floor(tIdx / 16);
                const sx = tcol * 16, sy = trow * 16;
                const S = 2;
                // Post (4px wide x 16px tall, centered at x=6-10)
                ctx2.drawImage(img, sx+6, sy, 4, 16, 6*S, 0, 4*S, 16*S);
                // Upper rail left (x=0-6, y=1-4)
                ctx2.drawImage(img, sx, sy+1, 6, 3, 0, 1*S, 6*S, 3*S);
                // Upper rail right (x=10-16, y=1-4)
                ctx2.drawImage(img, sx+10, sy+1, 6, 3, 10*S, 1*S, 6*S, 3*S);
                // Lower rail left (x=0-6, y=7-10)
                ctx2.drawImage(img, sx, sy+7, 6, 3, 0, 7*S, 6*S, 3*S);
                // Lower rail right (x=10-16, y=7-10)
                ctx2.drawImage(img, sx+10, sy+7, 6, 3, 10*S, 7*S, 6*S, 3*S);
            };
            icon.appendChild(canvas);
        } else {
            icon.classList.add('is-3d-block');
            
            let texTop, texFront, texSide;
            if (typeof block.atlasIdx === 'object') {
                texTop = block.atlasIdx.top;
                texFront = block.atlasIdx.front !== undefined ? block.atlasIdx.front : (block.atlasIdx.sideX !== undefined ? block.atlasIdx.sideX : block.atlasIdx.side);
                texSide = block.atlasIdx.sideZ !== undefined ? block.atlasIdx.sideZ : block.atlasIdx.side;
            } else {
                texTop = texFront = texSide = block.atlasIdx;
            }
            
            let tintFilter = '';
            if ([14, 22, 43, 97].includes(parsedId)) {
                tintFilter = 'filter: sepia(1) hue-rotate(55deg) saturate(3.5) brightness(0.9);';
            }
            let topTint = tintFilter;
            if (parsedId === 1) {
                topTint = 'filter: sepia(1) hue-rotate(55deg) saturate(3.5) brightness(0.9);';
                tintFilter = topTint; // Grass side overlay also needs green tint
            }

            const getBgPos = (idx) => `background-position: -${(idx % 16) * 100}% -${Math.floor(idx / 16) * 100}%;`;

            // --- 3D SCULPTING FOR SLABS AND STAIRS ---
            if (block.type === 'slab') {
                icon.innerHTML = `
                    <div class="face top" style="${getBgPos(texTop)} ${topTint} transform: rotateX(90deg) translateZ(0px) !important;"></div>
                    <div class="face right" style="${getBgPos(texSide)} ${tintFilter} clip-path: inset(50% 0 0 0);"></div>
                    <div class="face front" style="${getBgPos(texFront)} ${tintFilter} clip-path: inset(50% 0 0 0);"></div>
                `;
            } else if (block.type === 'stair') {
                icon.innerHTML = `
                    <div class="face top" style="${getBgPos(texTop)} ${topTint} clip-path: inset(0 0 50% 0);"></div>
                    <div class="face top" style="${getBgPos(texTop)} ${topTint} clip-path: inset(50% 0 0 0); transform: rotateX(90deg) translateZ(0px) !important;"></div>
                    
                    <div class="face right" style="${getBgPos(texSide)} ${tintFilter} clip-path: polygon(50% 0, 100% 0, 100% 100%, 0 100%, 0 50%, 50% 50%);"></div>
                    
                    <div class="face front" style="${getBgPos(texFront)} ${tintFilter} clip-path: inset(50% 0 0 0);"></div>
                    <div class="face front" style="${getBgPos(texFront)} ${tintFilter} clip-path: inset(0 0 50% 0); transform: translateZ(0px) !important;"></div>
                `;
            } else if (parsedId === 201) {
                // Enchanting table: 12/16 = 75% height, clip top 25% of sides
                icon.innerHTML = `
                    <div class="face top" style="${getBgPos(texTop)} ${topTint} transform: rotateX(90deg) translateZ(4px) !important;"></div>
                    <div class="face right" style="${getBgPos(texSide)} ${tintFilter} clip-path: inset(25% 0 0 0);"></div>
                    <div class="face front" style="${getBgPos(texFront)} ${tintFilter} clip-path: inset(25% 0 0 0);"></div>
                `;
            } else {
                // Standard Blocks
                icon.innerHTML = `
                    <div class="face top" style="${getBgPos(texTop)} ${topTint}"></div>
                    <div class="face right" style="${getBgPos(texSide)} ${tintFilter}"></div>
                    <div class="face front" style="${getBgPos(texFront)} ${tintFilter}"></div>
                `;
            }
        }
    }
    return icon;
}

// --- DAMAGE SOUND ---
(function() {
    const _damageBuffers = [null, null];
    let _damageAudioCtx = null;

    function getDamageAudioCtx() {
        if (!_damageAudioCtx) {
            _damageAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return _damageAudioCtx;
    }

    // Pre-load both damage sound variants
    for (let i = 0; i < 2; i++) {
        fetch(`sounds/damage_${i}.ogg`)
            .then(r => r.arrayBuffer())
            .then(buf => getDamageAudioCtx().decodeAudioData(buf))
            .then(decoded => { _damageBuffers[i] = decoded; })
            .catch(() => {});
    }

    window.playDamageSound = function() {
        // Pick a random variant that's loaded
        const loaded = _damageBuffers.filter(b => b !== null);
        if (loaded.length === 0) return;
        const buf = loaded[Math.floor(Math.random() * loaded.length)];
        const ctx = getDamageAudioCtx();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.85 + Math.random() * 0.30;
        src.connect(ctx.destination);
        src.start(0);
    };
})();

window.triggerDamageShake = function() {
    // Health bar shake (existing system)
    const bar = document.getElementById('health-bar');
    if (bar) {
        bar.classList.remove('damage-shake');
        void bar.offsetWidth;
        bar.classList.add('damage-shake');
    }

    // Screen shake — apply to the html element; html { overflow:hidden } clips the edges
    const shakeEl = document.documentElement;
    shakeEl.classList.remove('damage-shake-screen');
    void shakeEl.offsetWidth;
    shakeEl.classList.add('damage-shake-screen');
    clearTimeout(window._shakeCleanupTimer);
    window._shakeCleanupTimer = setTimeout(() => {
        shakeEl.classList.remove('damage-shake-screen');
    }, 300);

    // Play damage sound
    if (typeof window.playDamageSound === 'function') window.playDamageSound();
};

function updateHealthUI() {
    const bar = document.getElementById('health-bar');
    if (!bar) return;
    if (typeof gameMode !== 'undefined' && gameMode !== 'survival') { bar.style.display = 'none'; return; }
    
    bar.style.display = 'flex'; bar.innerHTML = '';
    const fullHearts = Math.floor(player.health / 2);
    const hasHalf = player.health % 2 !== 0;
    const emptyHearts = (player.maxHealth / 2) - fullHearts - (hasHalf ? 1 : 0);
    
    for (let i = 0; i < fullHearts; i++) { const h = document.createElement('div'); h.className = 'heart full'; bar.appendChild(h); }
    if (hasHalf) { const h = document.createElement('div'); h.className = 'heart half'; bar.appendChild(h); }
    for (let i = 0; i < emptyHearts; i++) { const h = document.createElement('div'); h.className = 'heart empty'; bar.appendChild(h); }
}

let handTexture = null;
let handMaterial = null;

function buildHandMesh() {
    // Helper to let you write in standard degrees (0 to 360) instead of radians
    const degToRad = (degrees) => degrees * (Math.PI / 180);

    if (!handMaterial) {
        handTexture = new THREE.TextureLoader().load('textures/handtexture.png?v=' + ASSET_VERSION);
        handTexture.magFilter = THREE.NearestFilter;
        handTexture.minFilter = THREE.NearestFilter;
        handMaterial = new THREE.MeshBasicMaterial({ map: handTexture, vertexColors: true });
        if (typeof injectLightingShader === 'function') injectLightingShader(handMaterial);
    }
    
    const geo = new THREE.BoxGeometry(0.6, 0.6, 1.8).toNonIndexed();
    geo.translate(0, 0, -0.9); 
    const uvs = geo.attributes.uv.array;
    
    const setUV = (faceIdx, u1, v1, u2, v2) => {
        const uMin = u1 / 16, uMax = u2 / 16;
        const vMax = 1.0 - (v1 / 12), vMin = 1.0 - (v2 / 12);
        const uvArr = [ uMin, vMax, uMin, vMin, uMax, vMax, uMin, vMin, uMax, vMin, uMax, vMax ];
        for(let i=0; i<6; i++) { uvs[(faceIdx * 6 + i) * 2] = uvArr[i*2]; uvs[(faceIdx * 6 + i) * 2 + 1] = uvArr[i*2+1]; }
    };

    setUV(0, 0, 0, 4, 8);    // +X 
    setUV(1, 8, 0, 12, 8);   // -X 
    setUV(2, 4, 0, 8, 8);    // +Y 
    setUV(3, 12, 0, 16, 8);  // -Y 
    setUV(4, 4, 8, 8, 12);   // +Z 
    setUV(5, 0, 8, 4, 12);   // -Z 
    
    const biomeTints = new Float32Array(geo.attributes.position.count * 3);
    for(let i=0; i<biomeTints.length; i++) biomeTints[i] = 1;
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));
    
    const colors = new Float32Array(geo.attributes.position.count * 3);
    for(let i = 0; i < colors.length; i += 3) {
        colors[i] = 1; colors[i+1] = 1;   
        let shade = 1.0;
        const normalX = geo.attributes.normal.array[i];
        const normalY = geo.attributes.normal.array[i+1];
        const normalZ = geo.attributes.normal.array[i+2];
        if (normalY < -0.5) shade = 0.5; 
        else if (normalX > 0.5 || normalX < -0.5) shade = 0.8; 
        else if (normalZ < -0.5) shade = 0.9; 
        colors[i+2] = shade; 
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const mesh = new THREE.Mesh(geo, handMaterial);
    mesh.rotation.order = 'YXZ';
    
    // Now using degrees: X (Pitch), Y (Yaw), Z (Roll)
    mesh.rotation.set(degToRad(30), degToRad(25), degToRad(-30)); 
    
    mesh.position.set(0.5, -0.4, 1.25); 
    
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

function updateHeldItem() {
    if (typeof heldItemGroup === 'undefined' || !heldItemGroup) return;
    
    if (currentHeldMesh) {
        heldItemGroup.remove(currentHeldMesh);
        if (currentHeldMesh.children[0] && currentHeldMesh.children[0].geometry) {
            currentHeldMesh.children[0].geometry.dispose();
        }
        currentHeldMesh = null;
    }
    
    if (currentBuildBlock !== 0 && typeof buildItemMesh === 'function') {
        currentHeldMesh = buildItemMesh(currentBuildBlock);
        
        // All MC-accurate scaling is now handled inside buildToolMesh / buildBlockItemMesh / buildMaterialMesh
        // No per-type override needed here
        
        heldItemGroup.add(currentHeldMesh);
    } else { 
        currentHeldMesh = buildHandMesh(); 
        heldItemGroup.add(currentHeldMesh); 
    }
}

function selectSlot(index) {
    activeSlot = index;
    if (typeof inventory !== 'undefined') currentBuildBlock = inventory[activeSlot] ? inventory[activeSlot].id : 0;
    else currentBuildBlock = hotbar[activeSlot] ? hotbar[activeSlot] : 0;
    
    // Toggle active class for the gui.png selector indicator
    const slots = document.querySelectorAll('#main-hotbar .item-slot');
    slots.forEach((s, i) => s.classList.toggle('active', i === activeSlot));

    const el = document.getElementById('action-text');
    if (currentBuildBlock !== 0) {
        let name = (BLOCK_DATA[currentBuildBlock] || (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock]))?.name || 'Unknown';
        if (name !== 'Unknown') {
            el.textContent = name; el.style.opacity = '1';
            clearTimeout(actionTextTimeout); actionTextTimeout = setTimeout(() => el.style.opacity = '0', 2000);
        } else el.style.opacity = '0';
    } else el.style.opacity = '0';
    updateHeldItem();
}

function bindHoverEvents(element, blockId) {
    const tooltip = document.getElementById('item-tooltip');
    element.addEventListener('mouseenter', () => {
        if (window.cursorItem) return;
        let name = (BLOCK_DATA[blockId] || (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[blockId]))?.name || 'Unknown';
        tooltip.textContent = name;
        tooltip.classList.remove('hidden');
    });
    element.addEventListener('mouseleave', () => { tooltip.classList.add('hidden'); });
}

if (typeof window.cursorItem === 'undefined') window.cursorItem = null;

window.updateCursorItemUI = function(e) {
    const el = document.getElementById('dragged-item');
    if (!el) return;
    
    if (window.cursorItem) {
        el.classList.remove('hidden');
        
        const draggedIcon = document.getElementById('dragged-item-icon');
        const newIcon = createIconElement(window.cursorItem.id);
        newIcon.id = 'dragged-item-icon';
        draggedIcon.parentNode.replaceChild(newIcon, draggedIcon);
        
        document.getElementById('dragged-item-count').textContent = window.cursorItem.count > 1 ? window.cursorItem.count : '';
        
        // Render durability if tool
        updateDurabilityBar(el, window.cursorItem);

        if (e) {
            let scale = GUI_SCALES[currentGUIScaleIndex];
            if (scale === "Auto") scale = window.innerWidth < 800 ? 1 : (window.innerWidth < 1200 ? 2 : 3);
            const zoomLevel = scale / 2;
            
            el.style.left = (e.clientX / zoomLevel) + 'px';
            el.style.top = (e.clientY / zoomLevel) + 'px';
            
            const tooltip = document.getElementById('item-tooltip');
            if (tooltip) tooltip.classList.add('hidden');
        }
    } else {
        el.classList.add('hidden');
    }
};

document.addEventListener('mousemove', (e) => {
    if (window.cursorItem && typeof window.updateCursorItemUI === 'function') {
        window.updateCursorItemUI(e);
    }
});

window.addToInventory = function(id, count, durability) {
    if (typeof inventory === 'undefined') return count;

    const stackLimit = window.isStackable(id) ? 64 : 1;

    // First try stacking
    if (stackLimit > 1) {
        for (let i = 0; i < 36; i++) {
            if (inventory[i].id === id && inventory[i].count < stackLimit) {
                const space = stackLimit - inventory[i].count;
                const toAdd = Math.min(space, count);
                inventory[i].count += toAdd;
                count -= toAdd;
                if (count <= 0) {
                    finalizeInvUpdate(i);
                    return 0; 
                }
            }
        }
    }

    // Then find empty slots
    for (let i = 0; i < 36; i++) {
        if (inventory[i].id === 0 || inventory[i].count === 0) {
            inventory[i].id = id;
            const toAdd = Math.min(stackLimit, count);
            inventory[i].count = toAdd;
            
            // Initialize or restore tool durability
            const tool = TOOL_DATA[id];
            if (tool && tool.maxDurability) {
                inventory[i].durability = (durability !== undefined) ? durability : tool.maxDurability;
            }

            count -= toAdd;
            if (count <= 0) {
                finalizeInvUpdate(i);
                return 0; 
            }
        }
    }
    
    finalizeInvUpdate(-1);
    return count; 
};

function finalizeInvUpdate(idx) {
    buildUI();
    if (typeof renderInventory === 'function') renderInventory();
    if (typeof renderFurnace === 'function' && uiState === 'FURNACE') renderFurnace();
    if (idx === activeSlot || idx === -1) selectSlot(activeSlot);
}