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

    // --- ARMOR SLOTS ---
    const armorContainer = document.getElementById('surv-armor-slots');
    if (armorContainer) {
        armorContainer.innerHTML = '';
        const slotNames = ['helmet', 'chestplate', 'leggings', 'boots'];
        for (let i = 0; i < 4; i++) {
            const slot = document.createElement('div');
            slot.className = 'item-slot';
            const item = armorSlots[i];
            if (item && item.id !== 0 && item.count > 0) {
                slot.appendChild(createIconElement(item.id));
                updateDurabilityBar(slot, item);
                bindHoverEvents(slot, item.id);
            }
            slot.addEventListener('mousedown', ((idx) => (e) => {
                e.stopPropagation();
                handleArmorSlotClick(idx, e);
            })(i));
            armorContainer.appendChild(slot);
        }
    }

    // Update armor bar HUD
    if (typeof updateArmorBar === 'function') updateArmorBar();
}

// --- ARMOR SLOT CLICK HANDLER ---
function handleArmorSlotClick(slotIdx, e) {
    const armorItem = armorSlots[slotIdx];
    const slotNames = ['helmet', 'chestplate', 'leggings', 'boots'];
    const expectedSlot = slotNames[slotIdx];

    if (window.cursorItem && window.cursorItem.id !== 0) {
        // Placing item into armor slot — check if it's the right armor type
        const toolData = TOOL_DATA[window.cursorItem.id];
        if (!toolData || toolData.type !== 'armor' || toolData.armorSlot !== expectedSlot) return;

        if (armorItem.id === 0) {
            // Empty slot — place cursor item
            armorSlots[slotIdx] = { id: window.cursorItem.id, count: 1, durability: window.cursorItem.durability };
            window.cursorItem = null;
        } else {
            // Swap
            const temp = { id: armorItem.id, count: armorItem.count, durability: armorItem.durability };
            armorSlots[slotIdx] = { id: window.cursorItem.id, count: 1, durability: window.cursorItem.durability };
            window.cursorItem = temp;
        }
    } else {
        // Picking up armor
        if (armorItem.id !== 0) {
            window.cursorItem = { id: armorItem.id, count: armorItem.count, durability: armorItem.durability };
            armorSlots[slotIdx] = { id: 0, count: 0 };
        }
    }

    if (typeof renderInventory === 'function') renderInventory();
    if (typeof updateCursorItemUI === 'function') updateCursorItemUI(e);
}

// --- ARMOR BAR UI ---
window.updateArmorBar = function() {
    const bar = document.getElementById('armor-bar');
    if (!bar) return;

    // Calculate total armor defense points
    let totalDefense = 0;
    for (const slot of armorSlots) {
        if (slot.id !== 0) {
            const data = TOOL_DATA[slot.id];
            if (data && data.defense) totalDefense += data.defense;
        }
    }

    // MC: 20 max armor points = 10 pips, each pip = 2 points
    if (totalDefense <= 0) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        return;
    }

    bar.style.display = 'flex';
    bar.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        const pip = document.createElement('div');
        pip.className = 'armor-pip';
        const pointsForPip = totalDefense - i * 2;
        if (pointsForPip >= 2) {
            pip.classList.add('full');
        } else if (pointsForPip >= 1) {
            pip.classList.add('half');
        } else {
            pip.classList.add('empty');
        }
        bar.appendChild(pip);
    }
};

function applyDirtBackground() {
    const img = new Image();
    img.src = 'textures/terrain.png?v=' + ASSET_VERSION;
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