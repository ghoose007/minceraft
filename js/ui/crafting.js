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


// --- SHIFT-CLICK TRANSFER HELPERS ---
// Minecraft-style quick transfer: source stack moves into the target slot range,
// merging into compatible stacks first, then filling empty slots.
function _slotHasItem(slot) {
    return !!slot && slot.id !== 0 && slot.count > 0;
}

function _clearSlot(slot) {
    slot.id = 0;
    slot.count = 0;
    delete slot.durability;
}

function _copyStack(stack) {
    const out = { id: stack.id, count: stack.count };
    if (stack.durability !== undefined) out.durability = stack.durability;
    return out;
}

function _shiftMoveStackToRange(srcSlot, ranges) {
    if (!_slotHasItem(srcSlot)) return false;
    if (window.cursorItem) return false;

    const maxStack = window.getMaxStack ? window.getMaxStack(srcSlot.id) : (window.isStackable(srcSlot.id) ? 64 : 1);
    let remaining = srcSlot.count;
    let moved = false;

    const visit = (fn) => {
        for (const range of ranges) {
            const arr = range.arr;
            const start = range.start || 0;
            const end = (range.end === undefined) ? arr.length : range.end;
            for (let i = start; i < end; i++) {
                if (fn(arr[i], i, arr)) return true;
            }
        }
        return false;
    };

    // Merge into existing stacks first.
    if (maxStack > 1) {
        visit((dst) => {
            if (!dst || dst === srcSlot) return false;
            if (dst.id === srcSlot.id && dst.count > 0 && dst.count < maxStack) {
                const add = Math.min(maxStack - dst.count, remaining);
                dst.count += add;
                remaining -= add;
                moved = moved || add > 0;
                return remaining <= 0;
            }
            return false;
        });
    }

    // Then fill empty slots.
    if (remaining > 0) {
        visit((dst) => {
            if (!dst || dst === srcSlot) return false;
            if (dst.id === 0 || dst.count <= 0) {
                dst.id = srcSlot.id;
                dst.count = Math.min(maxStack, remaining);
                if (srcSlot.durability !== undefined) dst.durability = srcSlot.durability;
                else delete dst.durability;
                remaining -= dst.count;
                moved = true;
                return remaining <= 0;
            }
            return false;
        });
    }

    if (moved) {
        srcSlot.count = remaining;
        if (srcSlot.count <= 0) _clearSlot(srcSlot);
    }
    return moved;
}

function _shiftMoveInventorySlot(slotIndex) {
    if (typeof inventory === 'undefined') return false;
    const src = inventory[slotIndex];
    if (!_slotHasItem(src)) return false;

    // Armor goes directly into an empty matching armor slot if possible.
    const tool = (typeof TOOL_DATA !== 'undefined') ? TOOL_DATA[src.id] : null;
    if (tool && tool.type === 'armor' && typeof armorSlots !== 'undefined') {
        const slotNames = ['helmet', 'chestplate', 'leggings', 'boots'];
        const armorIndex = slotNames.indexOf(tool.armorSlot);
        if (armorIndex >= 0 && armorSlots[armorIndex] && armorSlots[armorIndex].id === 0) {
            armorSlots[armorIndex] = _copyStack(src);
            armorSlots[armorIndex].count = 1;
            src.count -= 1;
            if (src.count <= 0) _clearSlot(src);
            if (typeof _recalcArmorHealthBonus === 'function') _recalcArmorHealthBonus();
            return true;
        }
    }

    // Hotbar <-> main inventory, matching classic quick-move behavior.
    if (slotIndex < 9) {
        return _shiftMoveStackToRange(src, [{ arr: inventory, start: 9, end: 36 }]);
    }
    return _shiftMoveStackToRange(src, [{ arr: inventory, start: 0, end: 9 }]);
}

window._shiftMoveStackToRange = _shiftMoveStackToRange;
window._shiftMoveInventorySlot = _shiftMoveInventorySlot;

// --- RIGHT-CLICK DRAG DISTRIBUTION ---
// Hold right-click while carrying a stack and drag across slots to place one
// item per slot, matching Minecraft-style inventory distribution.
let _rightDragActive = false;
let _rightDragVisited = new Set();
let _rightDragDirty = false;

function _renderSlotElementLive(el, item, isActive) {
    if (!el) return;
    el.innerHTML = '';
    if (isActive !== undefined) el.classList.toggle('active', !!isActive);
    if (item && item.id !== 0 && item.count > 0) {
        el.appendChild(createIconElement(item.id));
        if (item.count > 1) {
            const badge = document.createElement('div');
            badge.className = 'item-count';
            badge.textContent = item.count;
            el.appendChild(badge);
            if (window.mcFont && window.mcFont.isReady()) {
                window.mcFont.updateEl(badge, String(item.count));
            }
        }
        if (typeof updateDurabilityBar === 'function') updateDurabilityBar(el, item);
        if (typeof bindHoverEvents === 'function') bindHoverEvents(el, item.id);
    }
}
window._renderSlotElementLive = _renderSlotElementLive;

function _refreshAfterRightDrag(e) {
    if (!_rightDragDirty) return;
    _rightDragDirty = false;
    if (typeof updateCraftingResult === 'function') {
        updateCraftingResult('survival');
        updateCraftingResult('table');
    }
    if (typeof renderInventory === 'function' && (uiState === 'INVENTORY' || uiState === 'CRAFTING')) renderInventory();
    if (typeof renderChest === 'function' && uiState === 'CHEST') renderChest();
    if (typeof renderEnchanting === 'function' && uiState === 'ENCHANTING') renderEnchanting();
    if (typeof buildUI === 'function') buildUI();
    if (typeof selectSlot === 'function') selectSlot(activeSlot);
    if (typeof window.updateCursorItemUI === 'function') window.updateCursorItemUI(e);
}

function _endRightDragDistribution(e) {
    const wasActive = _rightDragActive;
    _rightDragActive = false;
    _rightDragVisited.clear();
    if (wasActive) _refreshAfterRightDrag(e);
}
document.addEventListener('mouseup', function(e) {
    if (e.button === 2) _endRightDragDistribution(e);
});
document.addEventListener('contextmenu', function(e) {
    if (_rightDragActive) e.preventDefault();
});

function _rightDragCanPlace(slotItem) {
    if (!window.cursorItem || window.cursorItem.count <= 0) return false;
    const stackLimit = window.getMaxStack ? window.getMaxStack(window.cursorItem.id) : (window.isStackable(window.cursorItem.id) ? 64 : 1);
    if (slotItem.id === 0 || slotItem.count <= 0) return true;
    return slotItem.id === window.cursorItem.id && stackLimit > 1 && slotItem.count < stackLimit;
}

function _rightDragPlaceOne(slotItem, key, e, onChanged) {
    if (!window.cursorItem || window.cursorItem.count <= 0) return false;
    if (_rightDragVisited.has(key)) return false;
    if (!_rightDragCanPlace(slotItem)) return false;

    const fakeEvent = { button: 2 };
    if (!interactWithSlot(slotItem, fakeEvent)) return false;

    _rightDragVisited.add(key);
    _rightDragDirty = true;
    if (typeof onChanged === 'function') onChanged(slotItem, key, e);
    if (typeof window.updateCursorItemUI === 'function') window.updateCursorItemUI(e);
    if (!window.cursorItem || window.cursorItem.count <= 0) _endRightDragDistribution(e);
    return true;
}

function _beginRightDragSlot(slotItem, key, e, onChanged) {
    if (!e || e.button !== 2 || !window.cursorItem) return false;
    _rightDragActive = true;
    _rightDragVisited.clear();
    _rightDragPlaceOne(slotItem, key, e, onChanged);
    return true;
}

function _continueRightDragSlot(slotItem, key, e, onChanged) {
    if (!_rightDragActive || !window.cursorItem) return false;
    if (e && e.buttons !== undefined && (e.buttons & 2) === 0) {
        _endRightDragDistribution();
        return false;
    }
    return _rightDragPlaceOne(slotItem, key, e, onChanged);
}

window._beginRightDragSlot = _beginRightDragSlot;
window._continueRightDragSlot = _continueRightDragSlot;

window._continueRightDragInventorySlot = function(slotIndex, e) {
    if (typeof inventory === 'undefined') return false;
    return _continueRightDragSlot(inventory[slotIndex], 'inv:' + slotIndex, e, function(slotItem, key, ev) {
        _renderSlotElementLive(ev && ev.currentTarget, slotItem, slotIndex === activeSlot);
    });
};

window._continueRightDragCraftingSlot = function(index, type, e) {
    const grid = type === 'survival' ? survCraftingGrid : tableCraftingGrid;
    return _continueRightDragSlot(grid[index], 'craft:' + type + ':' + index, e, function(slotItem, key, ev) {
        updateCraftingResult(type);
        _renderSlotElementLive(ev && ev.currentTarget, slotItem, false);
    });
};


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
    if (_beginRightDragSlot(inventory[slotIndex], 'inv:' + slotIndex, e, function(slotItem, key, ev) {
        _renderSlotElementLive(ev && ev.currentTarget, slotItem, slotIndex === activeSlot);
    })) return;
    if (e.shiftKey && !window.cursorItem) {
        if (_shiftMoveInventorySlot(slotIndex)) {
            finalizeInvUpdate(-1);
            renderInventory();
            if (typeof buildUI === 'function') buildUI();
            if (typeof selectSlot === 'function') selectSlot(activeSlot);
            window.updateCursorItemUI(e);
        }
        return;
    }
    if (interactWithSlot(inventory[slotIndex], e)) {
        finalizeInvUpdate(slotIndex);
        window.updateCursorItemUI(e);
    }
}

function handleCraftingClick(index, type, e) {
    const grid = type === 'survival' ? survCraftingGrid : tableCraftingGrid;
    if (_beginRightDragSlot(grid[index], 'craft:' + type + ':' + index, e, function(slotItem, key, ev) {
        updateCraftingResult(type);
        _renderSlotElementLive(ev && ev.currentTarget, slotItem, false);
    })) return;
    if (e.shiftKey && !window.cursorItem) {
        if (_shiftMoveStackToRange(grid[index], [{ arr: inventory, start: 0, end: 36 }])) {
            updateCraftingResult(type); renderInventory(); if (typeof buildUI === 'function') buildUI(); window.updateCursorItemUI(e);
        }
        return;
    }
    if (interactWithSlot(grid[index], e)) {
        updateCraftingResult(type); renderInventory(); window.updateCursorItemUI(e);
    }
}

function handleCraftingOutputClick(type, e) {
    const grid = type === 'survival' ? survCraftingGrid : tableCraftingGrid;
    const output = type === 'survival' ? survCraftingOutput : tableCraftingOutput;

    if (output.id === 0 || output.count === 0) return;

    const stackLimit = window.getMaxStack ? window.getMaxStack(output.id) : (window.isStackable(output.id) ? 64 : 1);

    const consumeIngredients = () => {
        for (let i = 0; i < grid.length; i++) {
            if (grid[i].id !== 0 && grid[i].count > 0) {
                grid[i].count--;
                if (grid[i].count === 0) { grid[i].id = 0; delete grid[i].durability; }
            }
        }
    };

    const makeOutputStack = () => {
        const stack = { id: output.id, count: output.count };
        const tool = TOOL_DATA[output.id];
        if (tool && tool.maxDurability) stack.durability = tool.maxDurability;
        return stack;
    };

    if (e.shiftKey && !window.cursorItem) {
        let craftedAny = false;
        let safety = 0;
        while (output.id !== 0 && output.count > 0 && safety++ < 256) {
            const temp = makeOutputStack();
            const before = temp.count;
            if (!_shiftMoveStackToRange(temp, [{ arr: inventory, start: 0, end: 36 }])) break;
            if (temp.count > 0) break;
            craftedAny = true;
            consumeIngredients();
            updateCraftingResult(type);
        }
        if (craftedAny) { renderInventory(); if (typeof buildUI === 'function') buildUI(); window.updateCursorItemUI(e); }
        return;
    }

    if (!window.cursorItem) {
        window.cursorItem = makeOutputStack();
    } else if (window.cursorItem.id === output.id && window.cursorItem.count + output.count <= stackLimit) {
        window.cursorItem.count += output.count;
    } else { return; }

    consumeIngredients();

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
