// ==========================================
// CHEST SYSTEM
// ==========================================


// Storage: Map of "x,y,z" → { slots: [{id,count},...], doublePartner: "x2,y2,z2"|null }
const activeChests = new Map();
let currentChestPos = null;

function _chestKey(x,y,z) { return `${x},${y},${z}`; }

function getOrCreateChest(x, y, z) {
    const key = _chestKey(x,y,z);
    if (!activeChests.has(key)) {
        activeChests.set(key, {
            slots: new Array(27).fill(null).map(() => ({id:0, count:0})),
            doublePartner: null
        });
    }
    return activeChests.get(key);
}

// Find adjacent single chest for double-chest merging
function findAdjacentSingleChest(x, y, z) {
    const neighbors = [[x+1,y,z],[x-1,y,z],[x,y,z+1],[x,y,z-1]];
    for (const [nx,ny,nz] of neighbors) {
        if ((getVoxel(nx,ny,nz) & 0xFF) === 69) {
            const nKey = _chestKey(nx,ny,nz);
            const nChest = activeChests.get(nKey);
            // Only merge with single chests (no partner)
            if (nChest && !nChest.doublePartner) return [nx,ny,nz];
            // If chest data doesn't exist yet, it's a single chest
            if (!nChest) return [nx,ny,nz];
        }
    }
    return null;
}

// Called after placing a chest block
window.onChestPlaced = function(x, y, z) {
    const chest = getOrCreateChest(x, y, z);
    const adj = findAdjacentSingleChest(x, y, z);
    if (adj) {
        const [ax,ay,az] = adj;
        const adjChest = getOrCreateChest(ax, ay, az);
        // Link them as double
        chest.doublePartner = _chestKey(ax,ay,az);
        adjChest.doublePartner = _chestKey(x,y,z);
    }
};

// ---- LOOT TABLE ----
// Called when a Loot Chest (ID 93) is placed or spawned in a structure.
// Fills 27 slots with randomly chosen loot — items placed in random slots
// so the chest contents feel hand-placed, not uniform.
window.fillLootChest = function(x, y, z) {
    const chest = getOrCreateChest(x, y, z);

    // Weighted loot pool: [id, minCount, maxCount, weight]
    // IDs: 112=Stick, 113=Iron Ingot, 114=Diamond, 115=Apple,
    //      119=Coal, 122=Raw Porkchop, 123=Cooked Porkchop,
    //      128=Seeds, 134=Bread, 135=Flint
    //      Tools: 101=Wood Sword, 105=Stone Pickaxe, 109=Iron Pickaxe,
    //             111=Iron Sword, 125=Diamond Pickaxe, 127=Diamond Sword
    const pool = [
        { id: 112, min: 1, max: 8,  weight: 20 }, // Stick
        { id: 119, min: 2, max: 8,  weight: 18 }, // Coal
        { id: 128, min: 2, max: 6,  weight: 16 }, // Seeds
        { id: 135, min: 1, max: 4,  weight: 14 }, // Flint
        { id: 115, min: 1, max: 3,  weight: 12 }, // Apple
        { id: 122, min: 1, max: 3,  weight: 11 }, // Raw Porkchop
        { id: 123, min: 1, max: 2,  weight: 10 }, // Cooked Porkchop
        { id: 134, min: 1, max: 2,  weight:  9 }, // Bread
        { id: 113, min: 1, max: 4,  weight:  8 }, // Iron Ingot
        { id: 105, min: 1, max: 1,  weight:  5 }, // Stone Pickaxe
        { id: 101, min: 1, max: 1,  weight:  4 }, // Wood Sword
        { id: 109, min: 1, max: 1,  weight:  3 }, // Iron Pickaxe
        { id: 111, min: 1, max: 1,  weight:  3 }, // Iron Sword
        { id: 114, min: 1, max: 2,  weight:  2 }, // Diamond
        { id: 125, min: 1, max: 1,  weight:  1 }, // Diamond Pickaxe
        { id: 127, min: 1, max: 1,  weight:  1 }, // Diamond Sword
    ];

    const totalWeight = pool.reduce((s, e) => s + e.weight, 0);

    function pickItem() {
        let r = Math.random() * totalWeight;
        for (const entry of pool) {
            r -= entry.weight;
            if (r <= 0) return entry;
        }
        return pool[0];
    }

    function randInt(min, max) {
        return min + Math.floor(Math.random() * (max - min + 1));
    }

    // Reset slots to empty
    chest.slots = new Array(27).fill(null).map(() => ({ id: 0, count: 0 }));

    // Pick 4-10 distinct random slot indices to fill
    const numItems = randInt(4, 10);
    const slotIndices = [];
    while (slotIndices.length < numItems) {
        const s = Math.floor(Math.random() * 27);
        if (!slotIndices.includes(s)) slotIndices.push(s);
    }

    for (const si of slotIndices) {
        const entry = pickItem();
        chest.slots[si] = { id: entry.id, count: randInt(entry.min, entry.max) };
    }
};

// Called when a chest block is broken — drop items and unlink double
window.onChestBroken = function(x, y, z) {
    const key = _chestKey(x,y,z);
    const chest = activeChests.get(key);
    if (!chest) return;
    
    // Drop all items from this chest's slots
    for (const slot of chest.slots) {
        if (slot.id !== 0 && slot.count > 0) {
            if (typeof spawnBlockDrops === 'function' || typeof window.spawnDroppedItem === 'function') {
                window.spawnDroppedItem(x+0.5, y+0.5, z+0.5, slot.id, slot.count);
            }
        }
    }
    
    // Unlink partner
    if (chest.doublePartner) {
        const partner = activeChests.get(chest.doublePartner);
        if (partner) partner.doublePartner = null;
    }
    
    activeChests.delete(key);
    
    // Close UI if this chest was open
    if (currentChestPos === key && uiState === 'CHEST') {
        closeChest();
        document.body.requestPointerLock();
    }
};

// Get combined slots for a double chest (this chest's 27 + partner's 27)
function getChestSlots(key) {
    const chest = activeChests.get(key);
    if (!chest) return [];
    if (!chest.doublePartner) return chest.slots;
    
    const partner = activeChests.get(chest.doublePartner);
    if (!partner) return chest.slots;
    
    // Determine order: lower coords first for consistent ordering
    const [x1,y1,z1] = key.split(',').map(Number);
    const [x2,y2,z2] = chest.doublePartner.split(',').map(Number);
    if (x1 < x2 || (x1 === x2 && z1 < z2)) {
        return chest.slots.concat(partner.slots);
    } else {
        return partner.slots.concat(chest.slots);
    }
}

function isDoubleChest(key) {
    const chest = activeChests.get(key);
    return chest && chest.doublePartner !== null;
}

window.openChest = function(x, y, z) {
    currentChestPos = _chestKey(x, y, z);
    window._lastChestX = x; window._lastChestY = y; window._lastChestZ = z;
    getOrCreateChest(x, y, z); // Ensure data exists
    document.getElementById('chest-modal').classList.remove('hidden');
    renderChest();
    if (typeof window.playChestOpenSound === 'function') window.playChestOpenSound(x, y, z);
};

window.closeChest = function() {
    const modal = document.getElementById('chest-modal');
    if (modal) modal.classList.add('hidden');
    currentChestPos = null;
};

function handleChestSlotClick(slotIdx, e) {
    if (!currentChestPos) return;
    const slots = getChestSlots(currentChestPos);
    if (slotIdx >= slots.length) return;
    interactWithSlot(slots[slotIdx], e);
    renderChest();
    window.updateCursorItemUI(e);
}

window.renderChest = function() {
    if (!currentChestPos) return;
    const chest = activeChests.get(currentChestPos);
    if (!chest) return;
    
    const isDouble = isDoubleChest(currentChestPos);
    const slots = getChestSlots(currentChestPos);
    const totalSlots = isDouble ? 54 : 27;
    
    // Update title
    const title = document.getElementById('chest-title');
    if (title) title.textContent = isDouble ? 'Large Chest' : 'Chest';
    
    // Update chest grid size for double chest
    const chestGrid = document.getElementById('chest-slots');
    if (!chestGrid) return;
    chestGrid.innerHTML = '';
    // Set grid to 9 columns, rows depend on single(3) or double(6)
    chestGrid.style.gridTemplateColumns = 'repeat(9, 40px)';
    chestGrid.style.gridTemplateRows = `repeat(${isDouble ? 6 : 3}, 40px)`;
    
    for (let i = 0; i < totalSlots; i++) {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        const item = slots[i];
        if (item && item.id !== 0 && item.count > 0) {
            slot.appendChild(createIconElement(item.id));
            if (item.count > 1) {
                const badge = document.createElement('div');
                badge.className = 'item-count'; badge.textContent = item.count;
                slot.appendChild(badge);
            }
            updateDurabilityBar(slot, item);
            bindHoverEvents(slot, item.id);
        }
        slot.addEventListener('mousedown', ((idx) => (e) => { e.stopPropagation(); handleChestSlotClick(idx, e); })(i));
        chestGrid.appendChild(slot);
    }
    
    // Player inventory (slots 9-35 = main, 0-8 = hotbar)
    const mainInv = document.getElementById('chest-main-inv');
    const hotbarInv = document.getElementById('chest-hotbar');
    if (mainInv) mainInv.innerHTML = '';
    if (hotbarInv) hotbarInv.innerHTML = '';
    
    const createInvSlot = (i, isHotbar) => {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        if (isHotbar && i === activeSlot) slot.classList.add('active');
        const item = inventory[i];
        if (item && item.id !== 0 && item.count > 0) {
            slot.appendChild(createIconElement(item.id));
            if (item.count > 1) {
                const badge = document.createElement('div');
                badge.className = 'item-count'; badge.textContent = item.count;
                slot.appendChild(badge);
            }
            updateDurabilityBar(slot, item);
            bindHoverEvents(slot, item.id);
        }
        slot.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            interactWithSlot(inventory[i], e);
            renderChest();
            window.updateCursorItemUI(e);
        });
        return slot;
    };
    
    for (let i = 9; i < 36; i++) { if (mainInv) mainInv.appendChild(createInvSlot(i, false)); }
    for (let i = 0; i < 9; i++) { if (hotbarInv) hotbarInv.appendChild(createInvSlot(i, true)); }
};

// Hook into block breaking to drop chest items
const _origSpawnBlockDrops = typeof window.spawnBlockDrops === 'function' ? window.spawnBlockDrops : null;
window.spawnBlockDrops = function(id, x, y, z, val) {
    if (id === 69) {
        window.onChestBroken(x, y, z);
    }
    if (_origSpawnBlockDrops) return _origSpawnBlockDrops(id, x, y, z, val);
};

// ==========================================
// DEATH / GAME OVER SYSTEM