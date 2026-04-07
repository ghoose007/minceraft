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

    // Organized creative inventory by category
    const categories = [
        { name: 'Building Blocks', ids: [1, 2, 3, 33, 48, 31, 32, 10, 11, 12, 156, 99, 29, 44, 30, 98, 154, 155, 15, 19, 61, 5, 87, 92, 28, 139, 140, 141, 138, 39, 95] },
        { name: 'Decoration', ids: [34, 35, 36, 37, 38, 68, 158, 200, 51, 91] },
        { name: 'Slabs', ids: [70, 71, 72, 73, 74, 75, 76, 77, 157] },
        { name: 'Stairs', ids: [80, 81, 82, 83, 84, 85, 86, 94, 152] },
        { name: 'Fences & Doors', ids: [144, 145, 146, 147, 148, 149, 150, 151] },
        { name: 'Natural', ids: [13, 21, 41, 96, 14, 22, 43, 97, 16, 23, 24, 53, 212, 213, 52, 66, 67, 20, 40] },
        { name: 'Saplings & Seeds', ids: [116, 117, 118, 137, 128, 129] },
        { name: 'Ores & Minerals', ids: [7, 6, 8, 9, 49, 50, 88, 210, 119, 113, 143, 114, 153, 199, 211, 135, 121, 120] },
        { name: 'Redstone', ids: [202, 206, 203, 205, 207, 208, 65] },
        { name: 'Utilities', ids: [17, 58, 59, 69, 93, 201, 54, 62] },
        // Fluids now obtained via buckets only
        { name: 'Wooden Tools', ids: [101, 100, 102, 103, 130] },
        { name: 'Stone Tools', ids: [105, 104, 106, 107, 131] },
        { name: 'Iron Tools', ids: [109, 108, 110, 111, 132] },
        { name: 'Diamond Tools', ids: [125, 124, 126, 127, 133] },
        { name: 'Gold Tools', ids: [160, 159, 161, 162, 163] },
        { name: 'Emerald Tools', ids: [217, 215, 218, 214, 216] },
        { name: 'Combat', ids: [164, 165, 136, 223, 224, 225] },
        { name: 'Leather Armor', ids: [174, 175, 176, 177] },
        { name: 'Iron Armor', ids: [170, 171, 172, 173] },
        { name: 'Diamond Armor', ids: [178, 179, 180, 181] },
        { name: 'Gold Armor', ids: [182, 183, 184, 185] },
        { name: 'Emerald Armor', ids: [219, 220, 221, 222] },
        { name: 'Food', ids: [115, 134, 122, 123, 187, 188] },
        { name: 'Materials', ids: [112, 186, 197, 198] },
        { name: 'Spawn Eggs', ids: [190, 191, 192, 193, 194, 195, 196] },
    ];
    
    // If aether is disabled, remove emerald-related items
    const aetherDisabled = (typeof GEN_AETHER_ENABLED !== 'undefined' && !GEN_AETHER_ENABLED);
    if (aetherDisabled) {
        for (let i = categories.length - 1; i >= 0; i--) {
            if (categories[i].name === 'Emerald Tools' || categories[i].name === 'Emerald Armor') {
                categories.splice(i, 1);
            } else {
                // Remove emerald ore (210) and emerald item (211) from other categories
                categories[i].ids = categories[i].ids.filter(id => id !== 210 && id !== 211);
            }
        }
    }

    // Hidden blocks that should never appear
    const hideIds = new Set([18, 60, 63, 64, 89, 90, 151]);

    for (const cat of categories) {
        // Add category separator label
        const label = document.createElement('div');
        label.style.cssText = 'width:100%;padding:4px 8px;color:#aaa;font-size:10px;text-align:left;grid-column:1/-1;';
        label.textContent = cat.name;
        if (window.mcFont && window.mcFont.isReady()) {
            window.mcFont.convertEl(label, '#aaaaaa', 1);
        }
        grid.appendChild(label);

        for (const id of cat.ids) {
            if (hideIds.has(id)) continue;
            if (!BLOCK_DATA[id] && !(typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id])) continue;

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
    }

    // Add any blocks/items not in categories (catch-all)
    const allCategorized = new Set();
    for (const cat of categories) for (const id of cat.ids) allCategorized.add(id);
    
    let hasUncategorized = false;
    const addUncategorized = (data) => {
        for (let id in data) {
            const nid = parseInt(id);
            if (allCategorized.has(nid) || hideIds.has(nid)) continue;
            if (!hasUncategorized) {
                const label = document.createElement('div');
                label.style.cssText = 'width:100%;padding:4px 8px;color:#aaa;font-size:10px;text-align:left;grid-column:1/-1;';
                label.textContent = 'Other';
                grid.appendChild(label);
                hasUncategorized = true;
            }
            const slot = document.createElement('div');
            slot.className = 'item-slot';
            slot.appendChild(createIconElement(id));
            bindHoverEvents(slot, id);
            slot.addEventListener('mousedown', (e) => { e.stopPropagation(); handleCreativeCatalogClick(id, e); });
            grid.appendChild(slot);
        }
    };
    addUncategorized(BLOCK_DATA);
    if (typeof TOOL_DATA !== 'undefined') addUncategorized(TOOL_DATA);

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
    if (typeof _recalcArmorHealthBonus === 'function') _recalcArmorHealthBonus();
}

// Recalculate player max health based on emerald armor bonus
function _recalcArmorHealthBonus() {
    const baseHealth = 20;
    let bonus = 0;
    for (const slot of armorSlots) {
        if (slot.id === 0) continue;
        const data = TOOL_DATA[slot.id];
        if (data && data.bonusHealth) bonus += data.bonusHealth;
    }
    const newMax = baseHealth + bonus;
    if (player.maxHealth !== newMax) {
        player.maxHealth = newMax;
        if (player.health > player.maxHealth) player.health = player.maxHealth;
    }
}
window._recalcArmorHealthBonus = _recalcArmorHealthBonus;

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
// MOBILE CREATIVE INVENTORY SCROLL BUTTONS
// ==========================================
(function() {
    function _setupMobileInvScroll() {
        const grid = document.getElementById('inventory-grid');
        const btnUp = document.getElementById('inv-scroll-up');
        const btnDown = document.getElementById('inv-scroll-down');
        if (!grid || !btnUp || !btnDown) return;

        const SCROLL_AMOUNT = 40;
        let scrollInterval = null;

        function startScroll(dir) {
            stopScroll();
            grid.scrollTop += dir * SCROLL_AMOUNT;
            scrollInterval = setInterval(() => { grid.scrollTop += dir * SCROLL_AMOUNT; }, 250);
        }
        function stopScroll() {
            if (scrollInterval) { clearInterval(scrollInterval); scrollInterval = null; }
        }

        btnUp.addEventListener('mousedown', () => startScroll(-1));
        btnUp.addEventListener('touchstart', (e) => { e.preventDefault(); startScroll(-1); });
        btnUp.addEventListener('mouseup', stopScroll);
        btnUp.addEventListener('touchend', stopScroll);
        btnUp.addEventListener('mouseleave', stopScroll);
        btnUp.addEventListener('touchcancel', stopScroll);

        btnDown.addEventListener('mousedown', () => startScroll(1));
        btnDown.addEventListener('touchstart', (e) => { e.preventDefault(); startScroll(1); });
        btnDown.addEventListener('mouseup', stopScroll);
        btnDown.addEventListener('touchend', stopScroll);
        btnDown.addEventListener('mouseleave', stopScroll);
        btnDown.addEventListener('touchcancel', stopScroll);
    }

    // Show scroll buttons on mobile when inventory opens
    const _origRenderInv = window.renderInventory || (typeof renderInventory !== 'undefined' ? renderInventory : null);

    function _mobileInvPostRender() {
        const btnUp = document.getElementById('inv-scroll-up');
        const btnDown = document.getElementById('inv-scroll-down');
        if (!btnUp || !btnDown) return;
        const isMobile = typeof window.isMobileMode === 'function' && window.isMobileMode();
        btnUp.style.display = isMobile ? 'block' : 'none';
        btnDown.style.display = isMobile ? 'block' : 'none';
        if (isMobile) _setupMobileInvScroll();
    }

    // Hook into renderInventory
    if (typeof renderInventory === 'function') {
        const orig = renderInventory;
        renderInventory = function() {
            orig.apply(this, arguments);
            _mobileInvPostRender();
        };
    }
})();

// ==========================================
// CHEST SYSTEM
// ==========================================