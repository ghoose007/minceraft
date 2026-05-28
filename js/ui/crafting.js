// ==========================================
// CRAFTING SYSTEM
// ==========================================

// --- CRAFTING & FURNACE ---
const survCraftingGrid = new Array(4).fill(null).map(() => ({id: 0, count: 0}));
const tableCraftingGrid = new Array(9).fill(null).map(() => ({id: 0, count: 0}));
let survCraftingOutput = {id: 0, count: 0};
let tableCraftingOutput = {id: 0, count: 0};

window.openCraftingTable = function() {
    document.getElementById('crafting-table-modal').classList.remove('hidden');
    renderInventory();
};

window.closeCraftingTable = function() {
    const modal = document.getElementById('crafting-table-modal');
    if (modal) modal.classList.add('hidden');
    
    [survCraftingGrid, tableCraftingGrid].forEach(grid => {
        grid.forEach(slot => {
            if (slot.id !== 0 && slot.count > 0) {
                const leftover = window.addToInventory(slot.id, slot.count);
                if (leftover > 0) window.tossItem(slot.id, leftover);
                slot.id = 0; slot.count = 0;
            }
        });
    });
    updateCraftingResult('survival');
    updateCraftingResult('table');
};

function checkRecipe(gridData, gridSize) {
    let minX = gridSize, maxX = -1, minY = gridSize, maxY = -1;
    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            if (gridData[y * gridSize + x].id !== 0) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
        }
    }
    if (maxX === -1) return null; 

    let w = maxX - minX + 1;
    let h = maxY - minY + 1;

    for (let recipe of RECIPES) {
        if (w !== recipe.pattern[0].length || h !== recipe.pattern.length) continue;
        
        let match = true;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let gridItem = gridData[(minY + y) * gridSize + (minX + x)].id;
                let patItem = recipe.pattern[y][x];

                if ((patItem === 0 && gridItem !== 0) || 
                    (typeof patItem === 'number' && patItem !== 0 && patItem !== gridItem) || 
                    (typeof patItem === 'string' && !RECIPE_GROUPS[patItem]?.includes(gridItem))) { 
                    match = false; break; 
                }
            }
            if (!match) break;
        }
        if (match) {
            // Block emerald tools/armor recipes when aether is disabled
            if (typeof GEN_AETHER_ENABLED !== 'undefined' && !GEN_AETHER_ENABLED) {
                const outId = recipe.output.id;
                // v339: emerald tools stay at 214-218; emerald armor moved to 256-259
                // (tall-grass conflict resolution). Cover both ranges so the aether-disabled
                // gate still hides all emerald recipes.
                if ((outId >= 214 && outId <= 218) || (outId >= 256 && outId <= 259)) continue;
            }
            return recipe.output;
        }
    }
    return null;
}

function updateCraftingResult(type) {
    const grid = type === 'survival' ? survCraftingGrid : tableCraftingGrid;
    const output = type === 'survival' ? survCraftingOutput : tableCraftingOutput;
    const gridSize = type === 'survival' ? 2 : 3;

    const result = checkRecipe(grid, gridSize);
    if (result) { output.id = result.id; output.count = result.count; } 
    else { output.id = 0; output.count = 0; }
}

function interactWithSlot(slotItem, e) {
    if (!window.cursorItem) {
        if (slotItem.id !== 0 && slotItem.count > 0) {
            if (e.button === 2 && window.isStackable(slotItem.id)) {
                const take = Math.ceil(slotItem.count / 2);
                window.cursorItem = { ...slotItem, count: take };
                slotItem.count -= take;
                if (slotItem.count === 0) { slotItem.id = 0; delete slotItem.durability; }
            } else {
                window.cursorItem = { ...slotItem };
                slotItem.id = 0; slotItem.count = 0;
                delete slotItem.durability;
            }
            return true;
        }
    } else {
        const stackLimit = window.getMaxStack ? window.getMaxStack(window.cursorItem.id) : (window.isStackable(window.cursorItem.id) ? 64 : 1);
        
        if (slotItem.id === 0 || slotItem.count === 0) {
            if (e.button === 2) {
                slotItem.id = window.cursorItem.id; slotItem.count = 1;
                if (window.cursorItem.durability !== undefined) slotItem.durability = window.cursorItem.durability;
                window.cursorItem.count--;
                if (window.cursorItem.count === 0) window.cursorItem = null;
            } else {
                Object.assign(slotItem, window.cursorItem);
                window.cursorItem = null;
            }
            return true;
        } else if (slotItem.id === window.cursorItem.id && stackLimit > 1) {
            if (e.button === 2) {
                if (slotItem.count < stackLimit) {
                    slotItem.count++; window.cursorItem.count--;
                    if (window.cursorItem.count === 0) window.cursorItem = null;
                }
            } else {
                const space = stackLimit - slotItem.count;
                const transfer = Math.min(space, window.cursorItem.count);
                slotItem.count += transfer; window.cursorItem.count -= transfer;
                if (window.cursorItem.count === 0) window.cursorItem = null;
            }
            return true;
        } else {
            if (e.button === 0) {
                const temp = { ...slotItem };
                Object.assign(slotItem, window.cursorItem);
                window.cursorItem = temp;
                return true;
            }
        }
    }
    return false;
}

function handleInventoryClick(slotIndex, e) {
    if (typeof inventory === 'undefined') return;
    if (interactWithSlot(inventory[slotIndex], e)) {
        finalizeInvUpdate(slotIndex);
        window.updateCursorItemUI(e);
    }
}

function handleCraftingClick(index, type, e) {
    const grid = type === 'survival' ? survCraftingGrid : tableCraftingGrid;
    if (interactWithSlot(grid[index], e)) {
        updateCraftingResult(type); renderInventory(); window.updateCursorItemUI(e);
    }
}

function handleCraftingOutputClick(type, e) {
    const grid = type === 'survival' ? survCraftingGrid : tableCraftingGrid;
    const output = type === 'survival' ? survCraftingOutput : tableCraftingOutput;

    if (output.id === 0 || output.count === 0) return;

    const stackLimit = window.getMaxStack ? window.getMaxStack(output.id) : (window.isStackable(output.id) ? 64 : 1);

    if (!window.cursorItem) {
        window.cursorItem = { id: output.id, count: output.count };
        const tool = TOOL_DATA[output.id];
        if (tool && tool.maxDurability) window.cursorItem.durability = tool.maxDurability;
    } else if (window.cursorItem.id === output.id && window.cursorItem.count + output.count <= stackLimit) {
        window.cursorItem.count += output.count;
    } else { return; }

    for (let i = 0; i < grid.length; i++) {
        if (grid[i].id !== 0 && grid[i].count > 0) {
            grid[i].count--;
            if (grid[i].count === 0) { grid[i].id = 0; delete grid[i].durability; }
        }
    }

    updateCraftingResult(type); renderInventory(); window.updateCursorItemUI(e);
}

function handleCreativeCatalogClick(id, e) {
    let parsedId = parseInt(id);
    // Door block in creative gives door item
    if (parsedId === 149) parsedId = 151;
    if (!window.cursorItem) { 
        window.cursorItem = { id: parsedId, count: window.getMaxStack ? window.getMaxStack(parsedId) : (window.isStackable(parsedId) ? 64 : 1) }; 
        const tool = TOOL_DATA[parsedId];
        if (tool && tool.maxDurability) window.cursorItem.durability = tool.maxDurability;
    } 
    else { window.cursorItem = null; }
    window.updateCursorItemUI(e);
}
