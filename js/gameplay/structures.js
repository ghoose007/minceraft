// ==========================================
// 13. STRUCTURE BLOCKS & PREFABS
// ==========================================

window.STRUCTURE_PREFABS = {
    // Example: "house": { width: 5, height: 5, depth: 5, blocks: [...] }
};

let currentStructPos = null;
let currentStructMode = 'SAVE';
let previewBox = null;

// --- INITIALIZE THE 3D BOUNDING BOX ---
function initPreviewBox() {
    if (previewBox) return;
    if (typeof THREE === 'undefined' || typeof scene === 'undefined') return;
    
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    const mat = new THREE.LineBasicMaterial({ 
        color: 0x00FF00, 
        linewidth: 2,
        depthTest: false, // Renders through walls so you can always see the bounds!
        transparent: true,
        opacity: 0.8
    });
    previewBox = new THREE.LineSegments(geo, mat);
    previewBox.renderOrder = 999; // Force it to draw on top of the world
    previewBox.visible = false;
    scene.add(previewBox);
}

// --- UPDATE THE BOUNDING BOX ---
window.updateStructurePreview = function() {
    if (!previewBox) initPreviewBox();
    if (!previewBox || !currentStructPos) return;

    let w = 1, h = 1, d = 1;
    let offsetX = 0, offsetZ = 0;

    // Anchor coordinates (starting +1 block away from the Structure Block)
    const startX = currentStructPos.x + 1;
    const startY = currentStructPos.y;
    const startZ = currentStructPos.z + 1;

    if (currentStructMode === 'SAVE') {
        w = parseInt(document.getElementById('struct-x').value) || 1;
        h = parseInt(document.getElementById('struct-y').value) || 1;
        d = parseInt(document.getElementById('struct-z').value) || 1;
    } else {
        // LOAD MODE: Read dimensions from the prefab if it exists
        const name = document.getElementById('struct-name').value.trim();
        const prefab = window.STRUCTURE_PREFABS[name];
        if (prefab) {
            w = prefab.width;
            h = prefab.height;
            d = prefab.depth;
            // Pasting logic offsets by the center
            offsetX = Math.floor(w / 2);
            offsetZ = Math.floor(d / 2);
            previewBox.material.color.setHex(0x00A8FF); // Make the box blue for loading!
        } else {
            previewBox.visible = false;
            return;
        }
    }

    if (currentStructMode === 'SAVE') previewBox.material.color.setHex(0x00FF00); // Green for saving

    previewBox.scale.set(w, h, d);
    previewBox.position.set(startX + w/2 - offsetX, startY + h/2, startZ + d/2 - offsetZ);
    previewBox.visible = true;
};


// --- UI LOGIC ---
window.openStructureUI = function(x, y, z) {
    currentStructPos = { x, y, z };
    uiState = 'STRUCTURE_BLOCK';
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('structure-modal').classList.remove('hidden');
    setStructMode('SAVE');
    updateStructurePreview(); // Show the box immediately
};

// Added `keepPreview` parameter so the "Preview" button leaves the box visible
window.closeStructureUI = function(keepPreview = false) {
    uiState = 'PLAYING';
    currentStructPos = null;
    
    if (!keepPreview && previewBox) {
        previewBox.visible = false;
    }
    
    document.getElementById('structure-modal').classList.add('hidden');
    document.body.requestPointerLock();
};

window.setStructMode = function(mode) {
    currentStructMode = mode;
    const btnSave = document.getElementById('btn-struct-save');
    const btnLoad = document.getElementById('btn-struct-load');
    const sizeContainer = document.getElementById('struct-size-container');
    const actionBtn = document.getElementById('btn-struct-action');

    if (mode === 'SAVE') {
        btnSave.style.backgroundColor = '#7A7A7A'; 
        btnLoad.style.backgroundColor = '#555';    
        sizeContainer.style.display = 'block';
        actionBtn.innerText = 'SAVE STRUCTURE';
    } else {
        btnSave.style.backgroundColor = '#555';
        btnLoad.style.backgroundColor = '#7A7A7A';
        sizeContainer.style.display = 'none'; 
        actionBtn.innerText = 'LOAD STRUCTURE';
    }
    updateStructurePreview();
};

window.executeStructureBlock = function() {
    // Requires a temporary re-assignment because closeStructureUI nulls it
    const pos = currentStructPos; 
    if (!pos) return;
    
    const name = document.getElementById('struct-name').value.trim();
    if (!name) { alert("Please enter a structure name!"); return; }

    const { x, y, z } = pos;

    if (currentStructMode === 'SAVE') {
        const w = parseInt(document.getElementById('struct-x').value);
        const h = parseInt(document.getElementById('struct-y').value);
        const d = parseInt(document.getElementById('struct-z').value);
        exportStructure(name, x, y, z, w, h, d);
    } else {
        pasteStructure(name, x, y, z);
    }
    closeStructureUI(false); // Hide the preview box upon execution
};

// --- CORE SCANNING LOGIC ---
function exportStructure(name, blockX, blockY, blockZ, width, height, depth) {
    const blocks = [];
    const startX = blockX + 1;
    const startY = blockY;
    const startZ = blockZ + 1;

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                const val = getVoxel(startX + x, startY + y, startZ + z);
                const id = val & 0xFF; 
                blocks.push(id);
            }
        }
    }

    // Read dimension and biome restrictions from UI
    const dimEl = document.getElementById('struct-dimension');
    const biomeEl = document.getElementById('struct-biome');
    const dimension = dimEl ? dimEl.value : 'any';
    const biome = biomeEl ? biomeEl.value : 'any';

    const prefab = { width, height, depth, dimension, biome, blocks };
    window.STRUCTURE_PREFABS[name] = prefab;

    console.log(`%c=== STRUCTURE EXPORTED: ${name} ===`, "color: #00ff00; font-weight: bold; font-size: 14px;");
    console.log(`Dimension: ${dimension}, Biome: ${biome}`);
    console.log("Copy the JSON string below and save it to window.STRUCTURE_PREFABS in 13-structures.js:");
    console.log(`"${name}": ${JSON.stringify(prefab)},`);
    alert(`Structure '${name}' saved to memory and logged to Console (F12)!\nDimension: ${dimension}, Biome: ${biome}`);
}

// --- CORE PASTING LOGIC ---
window.pasteStructure = function(name, blockX, blockY, blockZ) {
    const prefab = window.STRUCTURE_PREFABS[name];
    if (!prefab) {
        alert(`Structure '${name}' not found in memory!`);
        return;
    }

    const { width, height, depth, blocks } = prefab;
    const startX = blockX + 1;
    const startY = blockY;
    const startZ = blockZ + 1;
    
    const offsetX = Math.floor(width / 2);
    const offsetZ = Math.floor(depth / 2);

    for (let y = 0; y < height; y++) {
        for (let z = 0; z < depth; z++) {
            for (let x = 0; x < width; x++) {
                const i = x + (z * width) + (y * width * depth);
                const blockId = blocks[i];
                
                setVoxel(startX + x - offsetX, startY + y, startZ + z - offsetZ, blockId);
                pendingBlockUpdates.push({x: startX + x - offsetX, y: startY + y, z: startZ + z - offsetZ});
            }
        }
    }
    
    // Force light recalculation
    recalculateLighting(startX, startY, startZ);
    console.log(`Pasted structure '${name}' at ${startX}, ${startY}, ${startZ}`);
};

// --- FORCE CLOSE IF DESTROYED ---
window.forceCloseStructure = function(x, y, z) {
    // If the coordinates of the broken block match the active structure block...
    if (currentStructPos && currentStructPos.x === x && currentStructPos.y === y && currentStructPos.z === z) {
        closeStructureUI(false); // Force close the UI and hide the green preview box
    }
};