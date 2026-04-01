// ==========================================
// FURNACE UI
// ==========================================

// --- FURNACE UI LOGIC ---
window.openFurnace = function(x, y, z) {
    currentFurnacePos = `${x},${y},${z}`;
    if (!activeFurnaces.has(currentFurnacePos)) {
        activeFurnaces.set(currentFurnacePos, {
            input: {id: 0, count: 0}, fuel: {id: 0, count: 0}, output: {id: 0, count: 0},
            burnTime: 0, totalBurnTime: 1, cookTime: 0, totalCookTime: 10
        });
    }
    document.getElementById('furnace-modal').classList.remove('hidden');
    renderFurnace();
};

window.closeFurnace = function() {
    const modal = document.getElementById('furnace-modal');
    if (modal) modal.classList.add('hidden');
    currentFurnacePos = null;
};

function handleFurnaceClick(slotName, e) {
    if (!currentFurnacePos) return;
    const f = activeFurnaces.get(currentFurnacePos);
    if (!f) return;
    
    let slotItem = f[slotName]; 
    if (slotName === 'output') {
        if (slotItem.id === 0 || slotItem.count === 0) return;
        const smeltOutputId = slotItem.id;
        const smeltCount = slotItem.count;
        if (!window.cursorItem) {
            window.cursorItem = { ...slotItem };
            slotItem.id = 0; slotItem.count = 0; delete slotItem.durability;
        } else if (window.cursorItem.id === slotItem.id && window.cursorItem.count + slotItem.count <= 64) {
            window.cursorItem.count += slotItem.count;
            slotItem.id = 0; slotItem.count = 0; delete slotItem.durability;
        } else { return; }
        // Spawn smelting XP orbs at furnace position
        if (typeof window.spawnSmeltXP === 'function' && currentFurnacePos) {
            const parts = currentFurnacePos.split(',');
            if (parts.length === 3) {
                window.spawnSmeltXP(parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]), smeltOutputId, smeltCount);
            }
        }
    } else {
        interactWithSlot(slotItem, e);
    }
    renderFurnace();
    window.updateCursorItemUI(e);
}

window.updateFurnaceUI = function(f) {
    const flameFill = document.getElementById('furnace-flame-fill');
    const arrowFill = document.getElementById('furnace-arrow-fill');
    if (flameFill) flameFill.style.height = (f.totalBurnTime > 0 ? (f.burnTime / f.totalBurnTime * 100) : 0) + '%';
    if (arrowFill) arrowFill.style.width = (f.totalCookTime > 0 ? (f.cookTime / f.totalCookTime * 100) : 0) + '%';
};

window.renderFurnace = function() {
    if (!currentFurnacePos) return;
    const f = activeFurnaces.get(currentFurnacePos);
    if (!f) return;
    
    const renderSlot = (id, item, name) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        if (item && item.id !== 0 && item.count > 0) {
            el.appendChild(createIconElement(item.id));
            if (item.count > 1) {
                const badge = document.createElement('div');
                badge.className = 'item-count'; badge.textContent = item.count;
                el.appendChild(badge);
            }
            updateDurabilityBar(el, item); bindHoverEvents(el, item.id);
        }
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener('mousedown', (e) => { e.stopPropagation(); handleFurnaceClick(name, e); });
    };
    
    renderSlot('furnace-input', f.input, 'input');
    renderSlot('furnace-fuel', f.fuel, 'fuel');
    renderSlot('furnace-output', f.output, 'output');
    window.updateFurnaceUI(f);
    
    const mainInv = document.getElementById('furnace-main-inv');
    const hotbarInv = document.getElementById('furnace-hotbar');
    if (mainInv) mainInv.innerHTML = ''; 
    if (hotbarInv) hotbarInv.innerHTML = '';
    
    const createSlot = (i, isHotbar) => {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        if (isHotbar && i === activeSlot) slot.classList.add('active');
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
        return slot;
    };
    
    for (let i = 9; i < 36; i++) if (mainInv) mainInv.appendChild(createSlot(i, false));
    for (let i = 0; i < 9; i++) if (hotbarInv) hotbarInv.appendChild(createSlot(i, true));
};
