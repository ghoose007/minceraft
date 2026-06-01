// ==========================================
// ENCHANTING TABLE UI & BOOK ENTITY
// ==========================================

const enchantItemSlot = { id: 0, count: 0 };
const enchantLapisSlot = { id: 0, count: 0 };
let currentEnchantPos = null;
const _enchantBooks = new Map();

// ==========================================
// UI (same pattern as furnace/crafting/chest)
// ==========================================
window.openEnchantingTable = function(x, y, z) {
    currentEnchantPos = `${x},${y},${z}`;
    document.getElementById('enchanting-modal').classList.remove('hidden');
    renderEnchanting();
};

window.closeEnchantingTable = function() {
    const modal = document.getElementById('enchanting-modal');
    if (modal) modal.classList.add('hidden');
    [enchantItemSlot, enchantLapisSlot].forEach(slot => {
        if (slot.id !== 0 && slot.count > 0) {
            const leftover = window.addToInventory(slot.id, slot.count, slot.durability);
            if (leftover > 0) window.tossItem(slot.id, leftover, slot.durability);
            slot.id = 0; slot.count = 0; delete slot.durability;
        }
    });
    currentEnchantPos = null;
};

function renderEnchanting() {
    const itemEl = document.getElementById('enchant-item-slot');
    if (itemEl) {
        itemEl.innerHTML = '';
        if (enchantItemSlot.id !== 0 && enchantItemSlot.count > 0) {
            itemEl.appendChild(createIconElement(enchantItemSlot.id));
            if (enchantItemSlot.count > 1) { const c = document.createElement('div'); c.className = 'item-count'; c.textContent = enchantItemSlot.count; itemEl.appendChild(c); }
            if (typeof updateDurabilityBar === 'function') updateDurabilityBar(itemEl, enchantItemSlot);
        }
        itemEl.onmousedown = (e) => { e.stopPropagation(); interactWithSlot(enchantItemSlot, e); renderEnchanting(); window.updateCursorItemUI(e); };
        if (typeof bindHoverEvents === 'function' && enchantItemSlot.id) bindHoverEvents(itemEl, enchantItemSlot.id);
    }
    const lapisEl = document.getElementById('enchant-lapis-slot');
    if (lapisEl) {
        lapisEl.innerHTML = '';
        if (enchantLapisSlot.id !== 0 && enchantLapisSlot.count > 0) {
            lapisEl.appendChild(createIconElement(enchantLapisSlot.id));
            if (enchantLapisSlot.count > 1) { const c = document.createElement('div'); c.className = 'item-count'; c.textContent = enchantLapisSlot.count; lapisEl.appendChild(c); }
        }
        lapisEl.onmousedown = (e) => { e.stopPropagation(); interactWithSlot(enchantLapisSlot, e); renderEnchanting(); window.updateCursorItemUI(e); };
        if (typeof bindHoverEvents === 'function' && enchantLapisSlot.id) bindHoverEvents(lapisEl, enchantLapisSlot.id);
    }
    const mainInv = document.getElementById('enchant-main-inv');
    if (mainInv) {
        mainInv.innerHTML = '';
        for (let i = 9; i < 36; i++) {
            const slot = document.createElement('div'); slot.className = 'item-slot';
            const item = inventory[i];
            if (item && item.id !== 0 && item.count > 0) {
                slot.appendChild(createIconElement(item.id));
                if (item.count > 1) { const c = document.createElement('div'); c.className = 'item-count'; c.textContent = item.count; slot.appendChild(c); }
                if (typeof updateDurabilityBar === 'function') updateDurabilityBar(slot, item);
            }
            slot.addEventListener('mousedown', ((idx) => (e) => { e.stopPropagation(); if (e.shiftKey && !window.cursorItem && typeof _shiftMoveInventorySlot === 'function') { _shiftMoveInventorySlot(idx); } else { interactWithSlot(inventory[idx], e); } renderEnchanting(); if (typeof buildUI === 'function') buildUI(); window.updateCursorItemUI(e); })(i));
            if (typeof bindHoverEvents === 'function' && item && item.id) bindHoverEvents(slot, item.id);
            mainInv.appendChild(slot);
        }
    }
    const hbar = document.getElementById('enchant-hotbar');
    if (hbar) {
        hbar.innerHTML = '';
        for (let i = 0; i < 9; i++) {
            const slot = document.createElement('div'); slot.className = 'item-slot';
            if (i === activeSlot) slot.classList.add('active');
            const item = inventory[i];
            if (item && item.id !== 0 && item.count > 0) {
                slot.appendChild(createIconElement(item.id));
                if (item.count > 1) { const c = document.createElement('div'); c.className = 'item-count'; c.textContent = item.count; slot.appendChild(c); }
                if (typeof updateDurabilityBar === 'function') updateDurabilityBar(slot, item);
            }
            slot.addEventListener('mousedown', ((idx) => (e) => { e.stopPropagation(); if (e.shiftKey && !window.cursorItem && typeof _shiftMoveInventorySlot === 'function') { _shiftMoveInventorySlot(idx); } else { interactWithSlot(inventory[idx], e); } renderEnchanting(); if (typeof buildUI === 'function') buildUI(); window.updateCursorItemUI(e); })(i));
            if (typeof bindHoverEvents === 'function' && item && item.id) bindHoverEvents(slot, item.id);
            hbar.appendChild(slot);
        }
    }
    if (typeof buildUI === 'function') buildUI();
}

// ==========================================
// 3D BOOK ENTITY
// ==========================================
// Uses the book item (198) dropped-item mesh, hovering above the
// enchanting table with the same bob + spin animation as dropped items.

function _createBookEntity() {
    // Build the book item mesh (id 198) — same as buildItemMesh
    const baseMesh = typeof buildItemMesh === 'function' ? buildItemMesh(198) : null;
    if (!baseMesh || baseMesh.children.length === 0) return null;

    const mesh = baseMesh.clone();
    mesh.traverse(child => {
        if (child.isMesh && child.geometry) child.geometry = child.geometry.clone();
    });

    // Strip first-person transforms from inner mesh (same as dropped items do)
    const inner = mesh.children[0];
    if (inner) {
        inner.rotation.set(0, 0, 0);
        inner.scale.set(1, 1, 1);
        inner.position.set(0, 0, 0);
    }

    // Recenter around geometry center
    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);
    mesh.position.set(-center.x, -center.y, -center.z);

    const wrapper = new THREE.Group();
    wrapper.add(mesh);
    // Scale like a 2D dropped item (book is a material/flat item)
    wrapper.scale.set(0.5, 0.5, 0.5);

    return wrapper;
}

function _registerEnchantBook(x, y, z) {
    const key = `${x},${y},${z}`;
    if (_enchantBooks.has(key)) return;

    const mesh = _createBookEntity();
    if (!mesh) return;

    mesh.position.set(x + 0.5, y + 1.0, z + 0.5);
    scene.add(mesh);

    _enchantBooks.set(key, {
        mesh, x, y, z,
        age: Math.random() * 100 // random start offset so multiple books aren't synced
    });
}

// ==========================================
// ANIMATION (matches dropped item bob + spin)
// ==========================================
window.updateEnchantBooks = function(dt) {
    for (const [key, b] of _enchantBooks) {
        // Remove if block was broken
        if ((getVoxel(b.x, b.y, b.z) & 0xFF) !== 201) {
            scene.remove(b.mesh);
            b.mesh.traverse(c => { if (c.geometry) c.geometry.dispose(); });
            _enchantBooks.delete(key);
            continue;
        }

        b.age += dt;

        // Same bob formula as dropped items: sin(age * 1.2) * 0.08 + 0.15
        const hoverOffset = Math.sin(b.age * 1.2) * 0.08 + 0.15;
        b.mesh.position.set(b.x + 0.5, b.y + 0.95 + hoverOffset, b.z + 0.5);

        // Same spin as dropped items: dt * 2.4 rad/s
        b.mesh.rotation.y += dt * 2.4;
    }
};

window.scanForEnchantingTables = function() {
    if (typeof player === 'undefined') return;
    const d = 20, px = Math.floor(player.x), pz = Math.floor(player.z);
    const my = Math.max(1, Math.floor(player.y) - 8);
    const xy = Math.min(WORLD_HEIGHT - 1, Math.floor(player.y) + 8);
    for (let x = px - d; x <= px + d; x++)
        for (let z = pz - d; z <= pz + d; z++)
            for (let y = my; y <= xy; y++)
                if ((getVoxel(x, y, z) & 0xFF) === 201) _registerEnchantBook(x, y, z);
};

let _enchantScanTimer = 0;
window._tickEnchantBooks = function(dt) {
    _enchantScanTimer += dt;
    if (_enchantScanTimer > 2) { _enchantScanTimer = 0; window.scanForEnchantingTables(); }
    window.updateEnchantBooks(dt);
};
