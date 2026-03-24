// ==========================================
// INVENTORY RENDERING
// ==========================================

function buildUI() {
    updateHealthUI();
    const mainContainer = document.getElementById('main-hotbar');
    if (!mainContainer) return;
    mainContainer.innerHTML = '';
    
    for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        if (i === activeSlot) slot.classList.add('active');
        
        const item = inventory[i];
        if (item && item.id !== 0 && item.count > 0) {
            slot.appendChild(createIconElement(item.id));
            if (item.count > 1) {
                const countBadge = document.createElement('div');
                countBadge.className = 'item-count';
                countBadge.textContent = item.count;
                slot.appendChild(countBadge);
            }
            updateDurabilityBar(slot, item);
        }
        mainContainer.appendChild(slot);
    }
}

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    const invHotbar = document.getElementById('inv-hotbar');
    if (!grid || !invHotbar) return;
    grid.innerHTML = ''; invHotbar.innerHTML = '';

    const addBatch = (data) => {
        for (let id in data) {
            // Hide internal blocks from the creative menu
            const hideId = parseInt(id);
            if (hideId === 64 || hideId === 89 || hideId === 90 || hideId === 151) continue;

            const slot = document.createElement('div');
            slot.className = 'item-slot';
            slot.appendChild(createIconElement(id));
            bindHoverEvents(slot, id);
            slot.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                handleCreativeCatalogClick(id, e);
            });
            grid.appendChild(slot);
        }
    };

    addBatch(BLOCK_DATA);
    if (typeof TOOL_DATA !== 'undefined') addBatch(TOOL_DATA);

    for (let i = 0; i < 9; i++) {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        if (i === activeSlot) slot.classList.add('active');
        const item = inventory[i];
        if (item && item.id !== 0 && item.count > 0) {
            slot.appendChild(createIconElement(item.id));
            if (item.count > 1) {
                const countBadge = document.createElement('div');
                countBadge.className = 'item-count'; countBadge.textContent = item.count;
                slot.appendChild(countBadge);
            }
            updateDurabilityBar(slot, item); bindHoverEvents(slot, item.id);
        }
        slot.addEventListener('mousedown', (e) => { e.stopPropagation(); handleInventoryClick(i, e); });
        invHotbar.appendChild(slot);
    }

    const renderGridSection = (id, gridData, type, outData, outId) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        gridData.forEach((item, i) => {
            const slot = document.createElement('div');
            slot.className = 'item-slot';
            if (item && item.id !== 0 && item.count > 0) {
                slot.appendChild(createIconElement(item.id));
                if (item.count > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'item-count'; badge.textContent = item.count;
                    slot.appendChild(badge);
                }
                updateDurabilityBar(slot, item); bindHoverEvents(slot, item.id);
            }
            slot.addEventListener('mousedown', (e) => { e.stopPropagation(); handleCraftingClick(i, type, e); });
            el.appendChild(slot);
        });

        const outEl = document.getElementById(outId);
        if (!outEl) return;
        outEl.innerHTML = '';
        if (outData.id !== 0) {
            outEl.appendChild(createIconElement(outData.id));
            if (outData.count > 1) {
                const badge = document.createElement('div');
                badge.className = 'item-count'; badge.textContent = outData.count;
                outEl.appendChild(badge);
            }
            updateDurabilityBar(outEl, outData); bindHoverEvents(outEl, outData.id);
        }
        const newOut = outEl.cloneNode(true);
        outEl.parentNode.replaceChild(newOut, outEl);
        newOut.addEventListener('mousedown', (e) => { e.stopPropagation(); handleCraftingOutputClick(type, e); });
    };

    renderGridSection('surv-crafting-input', survCraftingGrid, 'survival', survCraftingOutput, 'surv-crafting-output');
    renderGridSection('table-crafting-input', tableCraftingGrid, 'table', tableCraftingOutput, 'table-crafting-output');

    const fillInvRows = (id) => {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 9; i < 36; i++) {
            const slot = document.createElement('div');
            slot.className = 'item-slot';
            const item = inventory[i];
            if (item && item.id !== 0 && item.count > 0) {
                slot.appendChild(createIconElement(item.id));
                if (item.count > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'item-count'; badge.textContent = item.count;
                    slot.appendChild(badge);
                }
                updateDurabilityBar(slot, item); bindHoverEvents(slot, item.id);
            }
            slot.addEventListener('mousedown', (e) => { e.stopPropagation(); handleInventoryClick(i, e); });
            container.appendChild(slot);
        }
    };

    fillInvRows('surv-main-inv'); fillInvRows('table-main-inv');

    const fillHotbarRows = (id) => {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const slot = document.createElement('div');
            slot.className = 'item-slot';
            if (i === activeSlot) slot.classList.add('active');
            const item = inventory[i];
            if (item && item.id !== 0 && item.count > 0) {
                slot.appendChild(createIconElement(item.id));
                if (item.count > 1) {
                    const badge = document.createElement('div');
                    badge.className = 'item-count'; badge.textContent = item.count;
                    slot.appendChild(badge);
                }
                updateDurabilityBar(slot, item); bindHoverEvents(slot, item.id);
            }
            slot.addEventListener('mousedown', (e) => { e.stopPropagation(); handleInventoryClick(i, e); });
            container.appendChild(slot);
        }
    };

    fillHotbarRows('surv-hotbar'); fillHotbarRows('table-hotbar');
}

function applyDirtBackground() {
    const img = new Image();
    img.src = 'textures/terrain.png';
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 16; canvas.height = 16;
        const ctx = canvas.getContext('2d');
        
        // Dirt texture is at index 2 (X=32px) in terrain.png
        ctx.drawImage(img, 32, 0, 16, 16, 0, 0, 16, 16);
        
        const dataUrl = canvas.toDataURL('image/png');
        const bgStyle = `linear-gradient(rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.7)), url(${dataUrl})`;
        
        const screens = document.querySelectorAll('.mc-screen');
        screens.forEach(screen => {
            screen.style.background = bgStyle;
            screen.style.backgroundSize = 'auto, 64px 64px'; 
            screen.style.imageRendering = 'pixelated';
            screen.style.backgroundRepeat = 'repeat';
        });
    };
}
applyDirtBackground();

// ==========================================
// CHEST SYSTEM
// ==========================================