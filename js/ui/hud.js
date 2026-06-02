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

        /* Health Bar: Left side above XP bar, only spans left half of hotbar */
        #health-bar {
            position: fixed;
            bottom: 56px;
            left: calc(50% - 182px);
            display: flex;
            flex-direction: column-reverse;
            z-index: 101;
            max-width: 168px;
        }
        .health-row {
            display: flex;
            flex-direction: row;
            max-width: 168px;
            overflow: hidden;
        }

        /* Armor Bar: dynamically positioned above health bar */
        #armor-bar {
            position: fixed;
            bottom: 76px;
            left: calc(50% - 182px);
            display: flex;
            flex-direction: row;
            z-index: 101;
            max-width: 160px;
            overflow: hidden;
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

        /* v288: individual heart regen shake — fires when health increases */
        @keyframes heart-regen-shake {
            0%   { transform: translate(0, 0); }
            20%  { transform: translate(0, -2px); }
            40%  { transform: translate(0, 2px); }
            60%  { transform: translate(0, -2px); }
            80%  { transform: translate(0, 1px); }
            100% { transform: translate(0, 0); }
        }
        .heart.regen-shake { animation: heart-regen-shake 0.35s ease-in-out; }

        /* v288: individual hunger shank drain shake — fires when hunger drops */
        @keyframes hunger-drain-shake {
            0%   { transform: translate(0, 0); }
            20%  { transform: translate(0, 2px); }
            40%  { transform: translate(0, -2px); }
            60%  { transform: translate(0, 2px); }
            80%  { transform: translate(0, -1px); }
            100% { transform: translate(0, 0); }
        }
        .hunger.drain-shake { animation: hunger-drain-shake 0.35s ease-in-out; }

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
        '    bottom: 60px !important;',
        '    left: 50% !important;',
        '    transform: translateX(-50%) !important;',
        '    z-index: 200 !important;',
        '    margin: 0 !important;',
        '    width: auto !important;',
        '    white-space: nowrap !important;',
        '    pointer-events: none !important;',
        '    background: none !important;',
        '    padding: 1px 5px !important;',
        '}',
        /* html overflow hidden stops shake edge bleed */
        'html { overflow: hidden !important; }',
    ].join('\n');
    document.head.appendChild(s);
})();


window.isStackable = function(id) {
    if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id] && TOOL_DATA[id].maxDurability) return false;
    // Filled buckets don't stack
    if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id] && TOOL_DATA[id].maxStack === 1) return false;
    return true;
};

window.getMaxStack = function(id) {
    if (!window.isStackable(id)) return 1;
    if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id] && TOOL_DATA[id].maxStack) return TOOL_DATA[id].maxStack;
    return 64;
};

// --- UI MANAGEMENT ---
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
    // v339: respect itemAtlasIdx when set so the inventory tile uses the
    // intended "item appearance" instead of the world-block appearance.
    // Currently only id 219 (Tall Grass) uses this — its world bottom-half
    // is atlas 217 (wispy), but the icon should show atlas 218 (leafier top).
    if (block.itemAtlasIdx !== undefined) texIndex = block.itemAtlasIdx;
    const col = texIndex % 16, row = Math.floor(texIndex / 16);
    // v408: mushrooms (221/222) intentionally use the raw atlas tile with no plant tint filter.
    let filterStr = [1, 14, 16, 22, 24, 66, 67, 219].includes(id) ? 'filter: sepia(1) hue-rotate(55deg) saturate(3.5) brightness(0.9);' : '';
    return `background-image: url('textures/terrain.png?v=${ASSET_VERSION}'); background-position: -${col * 100}% -${row * 100}%; background-size: 1600% 1600%; image-rendering: pixelated; ${filterStr}`;
}

function createIconElement(id) {
    const icon = document.createElement('div');
    icon.className = 'item-icon';
    const parsedId = parseInt(id);
    
    // Terrain Items (Sticks, Saplings, Food, Seeds 128, Wheat 129, Nether Brick 142, Gold Ingot 143, Quartz 153)
    if ((parsedId >= 112 && parsedId <= 123) || parsedId === 128 || parsedId === 129 || parsedId === 134 || parsedId === 135 || parsedId === 137 || parsedId === 142 || parsedId === 143 || parsedId === 151 || parsedId === 153 || parsedId === 165 || parsedId === 186 || parsedId === 187 || parsedId === 188
        || parsedId === 197 || parsedId === 198 || parsedId === 199 || parsedId === 202 || parsedId === 205 || parsedId === 206 || parsedId === 211 || parsedId === 260 || parsedId === 261 || parsedId === 26 || parsedId === 221 || parsedId === 222) {
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
    // Also buckets (223-225) which use tools.png but have no durability
    else if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[parsedId] && (TOOL_DATA[parsedId].maxDurability || parsedId === 223 || parsedId === 224 || parsedId === 225)) {
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
        
        // v339: 219 (Tall Grass) joins the flat-icon list so its inventory
        // tile renders as a 2D atlas swatch (using its itemAtlasIdx = 218,
        // see getIconStyle below) rather than the 3D-block icon path.
        const flatRenderIds = [4, 27, 16, 23, 24, 26, 17, 40, 52, 53, 66, 67, 68, 116, 117, 118, 137, 150, 158, 212, 213, 219, 221, 222];
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
        } else if (parsedId === 203) {
            // Wood Button: small button shape canvas icon
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            canvas.style.cssText = 'image-rendering: pixelated; width: 32px; height: 32px; pointer-events: none;';
            const ctx2 = canvas.getContext('2d');
            const img = new Image();
            img.src = 'textures/terrain.png?v=' + ASSET_VERSION;
            img.onload = () => {
                const tIdx = 32; // Wood plank texture
                const tcol = tIdx % 16, trow = Math.floor(tIdx / 16);
                const sx = tcol * 16, sy = trow * 16;
                const S = 2;
                // Draw a small button (6x4 pixels centered, 2px deep)
                // Front face: 6x4 from texture at position (5,6)
                ctx2.drawImage(img, sx+5, sy+6, 6, 4, 5*S, 6*S, 6*S, 4*S);
                // Top edge: 6x2
                ctx2.drawImage(img, sx+5, sy+4, 6, 2, 5*S, 4*S, 6*S, 2*S);
                // Side edge: 2x4
                ctx2.drawImage(img, sx+3, sy+6, 2, 4, 3*S, 6*S, 2*S, 4*S);
                // Darken side for depth
                ctx2.fillStyle = 'rgba(0,0,0,0.3)';
                ctx2.fillRect(3*S, 6*S, 2*S, 4*S);
                ctx2.fillRect(5*S, 4*S, 6*S, 2*S);
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
            const grassTintFilter = 'filter: sepia(1) hue-rotate(55deg) saturate(3.5) brightness(0.9);';
            if (parsedId === 1) {
                // v429: Grass Block icon keeps dirt sides untinted. The green
                // grass overhang is drawn as separate overlay faces below.
                topTint = grassTintFilter;
                tintFilter = '';
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
                if (parsedId === 1) {
                    const overlayTex = (typeof block.atlasIdx === 'object' && block.atlasIdx.overlay !== undefined) ? block.atlasIdx.overlay : 1;
                    icon.innerHTML = `
                        <div class="face top" style="${getBgPos(texTop)} ${topTint}"></div>
                        <div class="face right" style="${getBgPos(texSide)}"></div>
                        <div class="face front" style="${getBgPos(texFront)}"></div>
                        <div class="face right" style="${getBgPos(overlayTex)} ${grassTintFilter} clip-path: inset(0 0 50% 0);"></div>
                        <div class="face front" style="${getBgPos(overlayTex)} ${grassTintFilter} clip-path: inset(0 0 50% 0);"></div>
                    `;
                } else {
                    icon.innerHTML = `
                        <div class="face top" style="${getBgPos(texTop)} ${topTint}"></div>
                        <div class="face right" style="${getBgPos(texSide)} ${tintFilter}"></div>
                        <div class="face front" style="${getBgPos(texFront)} ${tintFilter}"></div>
                    `;
                }
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
    // Health bar shake (whole-bar shake preserved; v288 removed screen shake)
    const bar = document.getElementById('health-bar');
    if (bar) {
        bar.classList.remove('damage-shake');
        void bar.offsetWidth;
        bar.classList.add('damage-shake');
    }

    // Play damage sound
    if (typeof window.playDamageSound === 'function') window.playDamageSound();
};

// v288: track previous values to detect regen/drain for individual icon shake
let _prevHealthForShake = -1;
let _prevHungerForShake = -1;
// v288: track last rendered values to avoid rebuilding the DOM every frame.
// The rebuild was wiping animated shake classes before they could play.
let _lastRenderedHealth = -1;
let _lastRenderedMaxHealth = -1;
let _lastRenderedHunger = -1;
let _lastRenderedGamemode = '';
let _lastRenderedHungerEnabled = null;
let _hudLayoutSignature = '';


function updateSurvivalHudLayout(force) {
    const survival = (typeof gameMode !== 'undefined' && gameMode === 'survival');
    const hungerOn = (typeof GEN_HUNGER_ENABLED === 'undefined' || GEN_HUNGER_ENABLED);
    const xpOn = (typeof GEN_XP_ENABLED === 'undefined' || GEN_XP_ENABLED);
    const healthBar = document.getElementById('health-bar');
    const hungerBar = document.getElementById('hunger-bar');
    const armorBar = document.getElementById('armor-bar');
    const xpBar = document.getElementById('xp-bar-container');

    const totalHearts = (typeof player !== 'undefined' && player && player.maxHealth)
        ? Math.ceil(player.maxHealth / 2)
        : 10;
    const bonusHeartRows = Math.max(0, Math.ceil(Math.max(0, totalHearts - 10) / 10));

    const sig = [survival ? 1 : 0, hungerOn ? 1 : 0, xpOn ? 1 : 0, bonusHeartRows, gameMode || ''].join('|');
    if (!force && sig === _hudLayoutSignature) return;
    _hudLayoutSignature = sig;

    const baseBottom = xpOn ? 56 : 50;      // XP bar present -> leave the classic XP slot
    const rowGap = 20;                      // one icon row
    // v404: health always occupies the left row at baseBottom.
    // Hunger occupies the right row at baseBottom when enabled.
    // Armor must sit above health when hunger is enabled, but when hunger is
    // disabled it should use the empty right-side hunger row, not overlap hearts.
    // v412: if emerald armor adds bonus heart rows, only move armor up when
    // hunger exists. If hunger is disabled, armor keeps using the hunger slot.
    const armorBonusOffset = hungerOn ? (bonusHeartRows * rowGap) : 0;
    const armorBottom = hungerOn ? (baseBottom + rowGap + armorBonusOffset) : baseBottom;

    if (healthBar) {
        healthBar.style.bottom = baseBottom + 'px';
        healthBar.style.display = survival ? 'flex' : 'none';
    }
    if (hungerBar) {
        hungerBar.style.bottom = baseBottom + 'px';
        hungerBar.style.display = (survival && hungerOn) ? 'flex' : 'none';
    }
    if (armorBar) {
        armorBar.style.bottom = armorBottom + 'px';
        armorBar.style.left = hungerOn ? 'calc(50% - 182px)' : 'calc(50% + 14px)';
        armorBar.style.right = hungerOn ? '' : 'calc(50% - 182px)';
        armorBar.style.justifyContent = hungerOn ? 'flex-start' : 'flex-end';
        if (!survival) armorBar.style.display = 'none';
    }
    if (xpBar) {
        xpBar.style.display = (survival && xpOn) ? '' : 'none';
    }
}
window.updateSurvivalHudLayout = updateSurvivalHudLayout;

window.forceRefreshSurvivalHUD = function() {
    _lastRenderedHealth = -1;
    _lastRenderedMaxHealth = -1;
    _lastRenderedHunger = -1;
    _lastRenderedGamemode = '';
    _lastRenderedHungerEnabled = null;
    _hudLayoutSignature = '';
    if (typeof updateSurvivalHudLayout === 'function') updateSurvivalHudLayout(true);
    if (typeof updateHealthUI === 'function') updateHealthUI();
    if (typeof updateHungerUI === 'function') updateHungerUI();
    if (typeof updateArmorBar === 'function') updateArmorBar();
    if (typeof updateXPBarUI === 'function') updateXPBarUI();
};

function updateHealthUI() {
    if (typeof updateSurvivalHudLayout === 'function') updateSurvivalHudLayout(false);
    const bar = document.getElementById('health-bar');
    if (!bar) return;
    if (typeof gameMode !== 'undefined' && gameMode !== 'survival') {
        bar.style.display = 'none';
        _prevHealthForShake = player.health;
        _lastRenderedHealth = -1;
        return;
    }
    // v288/v412: early-exit only if both current health and max-health layout are unchanged.
    // Emerald armor can add bonus max-health rows without changing current health.
    if (player.health === _lastRenderedHealth && player.maxHealth === _lastRenderedMaxHealth && bar.children.length > 0) {
        return;
    }
    
    bar.style.display = 'flex'; bar.innerHTML = '';
    
    const totalHearts = Math.ceil(player.maxHealth / 2);
    const baseHearts = 10; // Standard row = 10 hearts
    const bonusHearts = Math.max(0, totalHearts - baseHearts);
    const hasBonus = bonusHearts > 0;
    const isRegen = (_prevHealthForShake >= 0 && player.health > _prevHealthForShake);
    
    // Build hearts array: full, half, empty based on current health
    function buildRow(startHeart, numHearts, health, maxForRow) {
        const row = document.createElement('div');
        row.className = 'health-row';
        for (let i = 0; i < numHearts; i++) {
            const h = document.createElement('div');
            h.className = 'heart';
            const heartIdx = startHeart + i;
            const healthAtHeart = heartIdx * 2; // health value at start of this heart
            let isFilled = false;
            if (player.health >= healthAtHeart + 2) {
                h.classList.add('full');
                isFilled = true;
            } else if (player.health >= healthAtHeart + 1) {
                h.classList.add('half');
                isFilled = true;
            } else {
                h.classList.add('empty');
            }
            // v288: apply regen-shake synchronously with staggered delay
            if (isRegen && isFilled) {
                h.style.animationDelay = (heartIdx * 30) + 'ms';
                h.classList.add('regen-shake');
            }
            row.appendChild(h);
        }
        return row;
    }
    
    // Row 1 (bottom): first 10 hearts (health 0-20)
    bar.appendChild(buildRow(0, baseHearts, player.health, 20));
    
    // Row 2 (top): bonus hearts (health 20+)
    if (hasBonus) {
        bar.appendChild(buildRow(baseHearts, bonusHearts, player.health, player.maxHealth));
    }
    
    // HUD row positions are handled by updateSurvivalHudLayout().
    _prevHealthForShake = player.health;
    _lastRenderedHealth = player.health;
    _lastRenderedMaxHealth = player.maxHealth;
}

// v284: Hunger bar — 10 icons mirroring the health bar on the right side.
// Slot 0 (leftmost) = highest hunger values (19-20). Drains left to right.
function updateHungerUI() {
    if (typeof updateSurvivalHudLayout === 'function') updateSurvivalHudLayout(false);
    const bar = document.getElementById('hunger-bar');
    if (!bar) return;
    // Hide the bar when not in survival OR hunger disabled
    const survMode = (typeof gameMode !== 'undefined' && gameMode === 'survival');
    const hungerOn = (typeof GEN_HUNGER_ENABLED !== 'undefined' && GEN_HUNGER_ENABLED);
    if (!survMode || !hungerOn) {
        bar.style.display = 'none';
        _prevHungerForShake = player.hunger;
        _lastRenderedHunger = -1;
        _lastRenderedGamemode = survMode ? 'survival' : 'creative';
        _lastRenderedHungerEnabled = hungerOn;
        return;
    }
    // v288: early-exit if nothing changed. Otherwise the full DOM rebuild
    // every frame was wiping the in-flight shake animation classes before
    // they had time to play.
    const hunger = player.hunger || 0;
    if (hunger === _lastRenderedHunger &&
        _lastRenderedGamemode === 'survival' &&
        _lastRenderedHungerEnabled === hungerOn &&
        bar.children.length > 0) {
        return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'health-row'; // reuse row layout
    const isDrain = (_prevHungerForShake >= 0 && hunger < _prevHungerForShake);
    for (let i = 0; i < 10; i++) {
        const h = document.createElement('div');
        h.className = 'hunger';
        // Slot 0 (leftmost) = 19-20, slot 9 (rightmost) = 1-2
        const hungerAt = (9 - i) * 2;
        let isFilled = false;
        if (hunger >= hungerAt + 2) {
            h.classList.add('full');
            isFilled = true;
        } else if (hunger >= hungerAt + 1) {
            h.classList.add('half');
            isFilled = true;
        } else {
            h.classList.add('empty');
        }
        // v288: apply drain-shake synchronously with a staggered animation-delay.
        // The class is added BEFORE the element is appended to the DOM so the
        // animation starts immediately when the browser paints the new node.
        if (isDrain && isFilled) {
            h.style.animationDelay = (i * 25) + 'ms';
            h.classList.add('drain-shake');
        }
        row.appendChild(h);
    }
    bar.appendChild(row);
    _prevHungerForShake = hunger;
    _lastRenderedHunger = hunger;
    _lastRenderedGamemode = 'survival';
    _lastRenderedHungerEnabled = hungerOn;
}
window.updateHungerUI = updateHungerUI;

let handTexture = null;
let handMaterial = null;

function buildHandMesh() {
    // Helper to let you write in standard degrees (0 to 360) instead of radians
    const degToRad = (degrees) => degrees * (Math.PI / 180);

    if (!handMaterial) {
        handTexture = new THREE.TextureLoader().load('textures/handtexture.png?v=' + ASSET_VERSION);
        handTexture.magFilter = THREE.NearestFilter;
        handTexture.minFilter = THREE.NearestFilter;
        handTexture.generateMipmaps = false;
        handTexture.wrapS = THREE.ClampToEdgeWrapping;
        handTexture.wrapT = THREE.ClampToEdgeWrapping;
        handTexture.needsUpdate = true;
        handMaterial = new THREE.MeshBasicMaterial({ map: handTexture, vertexColors: true });
        if (typeof injectLightingShader === 'function') injectLightingShader(handMaterial);
    }
    
    // v365: keep the original first-person arm mesh size, build
    // custom segmented geometry, and use outward-facing winding on every face. The old RepeatWrapping fix repeated the
    // whole handtexture.png atlas, causing black bars when UVs crossed out
    // of the brown arm strip. This repeats only the correct sub-rect by
    // creating multiple quads, each mapped inside the valid arm pixels.
    const positions = [];
    const normals = [];
    const uvsArr = [];
    const indices = [];
    let vIndex = 0;

    const HAND_TEX_W = 16;
    const HAND_TEX_H = 12;
    const W = 0.6;
    const H = 0.6;
    const L = 1.8;
    const x0 = -W / 2, x1 = W / 2;
    const y0 = -H / 2, y1 = H / 2;
    const z0 = -L, z1 = 0;

    const uvRect = (u1, v1, u2, v2) => {
        return {
            uMin: u1 / HAND_TEX_W,
            uMax: u2 / HAND_TEX_W,
            vMax: 1.0 - (v1 / HAND_TEX_H),
            vMin: 1.0 - (v2 / HAND_TEX_H)
        };
    };

    const addQuad = (verts, normal, rect) => {
        positions.push(
            verts[0][0], verts[0][1], verts[0][2],
            verts[1][0], verts[1][1], verts[1][2],
            verts[2][0], verts[2][1], verts[2][2],
            verts[3][0], verts[3][1], verts[3][2]
        );
        for (let i = 0; i < 4; i++) normals.push(normal[0], normal[1], normal[2]);
        uvsArr.push(
            rect.uMin, rect.vMax,
            rect.uMin, rect.vMin,
            rect.uMax, rect.vMin,
            rect.uMax, rect.vMax
        );
        indices.push(vIndex, vIndex + 1, vIndex + 2, vIndex, vIndex + 2, vIndex + 3);
        vIndex += 4;
    };

    // Long side faces: the mesh is 3 blocks/pixel-units long relative to its
    // width. We split each long face into three 0.6-long sections. Each section
    // maps to a safe 4x4-pixel slice inside the correct brown side texture.
    // This creates texture wrapping without ever sampling the black/empty atlas area.
    for (let s = 0; s < 3; s++) {
        const za = z1 - s * W;
        const zb = z1 - (s + 1) * W;

        addQuad([[x1,y0,za],[x1,y0,zb],[x1,y1,zb],[x1,y1,za]], [1,0,0],  uvRect(0, 0, 4, 4));   // +X
        addQuad([[x0,y0,zb],[x0,y0,za],[x0,y1,za],[x0,y1,zb]], [-1,0,0], uvRect(8, 0, 12, 4));  // -X
        addQuad([[x0,y1,zb],[x0,y1,za],[x1,y1,za],[x1,y1,zb]], [0,1,0],  uvRect(4, 0, 8, 4));   // +Y
        addQuad([[x0,y0,za],[x0,y0,zb],[x1,y0,zb],[x1,y0,za]], [0,-1,0], uvRect(12, 0, 16, 4)); // -Y
    }

    // End caps use the existing 4x4 regions once.
    addQuad([[x0,y1,z1],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1]], [0,0,1],  uvRect(4, 8, 8, 12)); // +Z/front
    addQuad([[x1,y1,z0],[x1,y0,z0],[x0,y0,z0],[x0,y1,z0]], [0,0,-1], uvRect(0, 8, 4, 12)); // -Z/back

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvsArr, 2));
    geo.setIndex(indices);

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
            if (window.mcFont && window.mcFont.isReady()) {
                el.innerHTML = ''; var ac = window.mcFont.makeCanvas(name, 2, {color:'#ffffff'}); if (ac) { ac.style.margin='0 auto'; el.appendChild(ac); }
            }
            clearTimeout(actionTextTimeout); actionTextTimeout = setTimeout(() => el.style.opacity = '0', 2000);
        } else el.style.opacity = '0';
    } else el.style.opacity = '0';
    updateHeldItem();
}


window.hideItemTooltip = function() {
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    tooltip.classList.add('hidden');
    tooltip.textContent = '';
    tooltip.innerHTML = '';
};

function bindHoverEvents(element, blockId) {
    const tooltip = document.getElementById('item-tooltip');
    element.addEventListener('mouseenter', () => {
        if (window.cursorItem) return;
        let name = (BLOCK_DATA[blockId] || (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[blockId]))?.name || 'Unknown';
        tooltip.textContent = name;
        if (window.mcFont && window.mcFont.isReady()) {
            tooltip.innerHTML = ''; var tc = window.mcFont.makeCanvas(name, 2, {color:'#ffffff'}); if (tc) tooltip.appendChild(tc);
        }
        tooltip.classList.remove('hidden');
    });
    element.addEventListener('mouseleave', () => { if (typeof window.hideItemTooltip === 'function') window.hideItemTooltip(); else tooltip.classList.add('hidden'); });
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
        // Immediately convert to MC font — don't rely on the debounced MutationObserver
        // which can't keep up during continuous mousemove
        const _dragCount = document.getElementById('dragged-item-count');
        if (_dragCount && _dragCount.textContent.trim() && window.mcFont && window.mcFont.isReady()) {
            _dragCount.removeAttribute('data-mc-text'); // Force re-convert
            window.mcFont.convertEl(_dragCount);
        }
        
        // Render durability if tool
        updateDurabilityBar(el, window.cursorItem);

        if (e) {
            let scale = GUI_SCALES[currentGUIScaleIndex];
            if (scale === "Auto") scale = window.innerWidth < 800 ? 1 : (window.innerWidth < 1200 ? 2 : 3);
            const zoomLevel = scale / 2;
            
            el.style.left = (e.clientX / zoomLevel) + 'px';
            el.style.top = (e.clientY / zoomLevel) + 'px';
            
            if (typeof window.hideItemTooltip === 'function') window.hideItemTooltip();
            else {
                const tooltip = document.getElementById('item-tooltip');
                if (tooltip) tooltip.classList.add('hidden');
            }
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

    const stackLimit = window.getMaxStack ? window.getMaxStack(id) : (window.isStackable(id) ? 64 : 1);

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

let _finalizePending = false;
let _finalizeSlot = -1;
function finalizeInvUpdate(idx) {
    // Track which slot needs updating (activeSlot or -1 for any)
    if (idx === activeSlot || idx === -1) _finalizeSlot = idx;
    
    if (_finalizePending) return; // Already scheduled
    _finalizePending = true;
    
    setTimeout(function() {
        _finalizePending = false;
        buildUI();
        if (typeof renderInventory === 'function' && 
            (uiState === 'INVENTORY' || uiState === 'CRAFTING')) renderInventory();
        if (typeof renderFurnace === 'function' && uiState === 'FURNACE') renderFurnace();
        if (_finalizeSlot === activeSlot || _finalizeSlot === -1) selectSlot(activeSlot);
        _finalizeSlot = -1;
    }, 30);
}

// Expose for use by menu.js superflat layer editor
window.createIconElement = createIconElement;
