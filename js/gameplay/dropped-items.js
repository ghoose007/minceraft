// ==========================================
// DROPPED ITEMS
// ==========================================

let randomTickTimer = 0; 
window.creativeBreakTimer = 0; 
let lastCloudGridX = -999;
let lastCloudGridZ = -999;
let lastCloudBlockOffset = -999;
window.showDebugScreen = false;

// Pre-allocated objects to avoid per-frame GC pressure
const _skyColorDay = new THREE.Color(0x87CEEB);
const _skyColorSunset = new THREE.Color(0xFD5E53);
const _skyColorNight = new THREE.Color(0x020412);
const _currentSkyColor = new THREE.Color();
const _cloudDummy = new THREE.Object3D();
const _itemBox = new THREE.Box3();
const _itemCenter = new THREE.Vector3();

// Shared shadow geometry and material for all dropped items (prevents per-item allocation)
let _sharedItemShadowGeo = null;
let _sharedItemShadowMat = null;
function _getItemShadowGeo() {
    if (!_sharedItemShadowGeo) _sharedItemShadowGeo = new THREE.CircleGeometry(0.3, 12);
    return _sharedItemShadowGeo;
}
function _getItemShadowMat() {
    if (!_sharedItemShadowMat) _sharedItemShadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
    return _sharedItemShadowMat;
}

window.spawnDroppedItem = function(x, y, z, id, count = 1, customVx = null, customVy = null, customVz = null) {
    if (!BLOCK_DATA[id] && (typeof TOOL_DATA === 'undefined' || !TOOL_DATA[id]) && (id < 112 || id > 123) && id !== 137 && id !== 142 && id !== 143 && id !== 151) return;
    
    const wrapper = new THREE.Group();
    const baseMesh = typeof buildItemMesh === 'function' ? buildItemMesh(id) : null;
    if (!baseMesh || baseMesh.children.length === 0) return;
    
    const mesh = baseMesh.clone();
    mesh.traverse((child) => {
        if (child.isMesh && child.geometry) {
            child.geometry = child.geometry.clone();
        }
    });
    
    // Reuse pre-allocated Box3/Vector3 instead of creating new ones each call
    _itemBox.setFromObject(mesh);
    _itemBox.getCenter(_itemCenter);
    
    mesh.position.x = -_itemCenter.x;
    mesh.position.y = -_itemCenter.y;
    mesh.position.z = -_itemCenter.z;
    
    wrapper.add(mesh);
    
    // MC dropped item scaling: 3D blocks = 0.25, 2D flat items = 0.5
    // Reset the inner mesh's first-person display transforms so ground items look correct
    const isMaterial = (id >= 112 && id <= 123) || id === 128 || id === 129 || id === 134 || id === 135 || id === 137 || id === 142 || id === 143 || id === 151
                    || id === 23 || id === 53 || id === 24 || id === 116 || id === 117 || id === 118;
    const isFlatBlock = (id === 66 || id === 67);
    const isToolItem = (id >= 100 && typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id]);
    const is2D = isMaterial || isFlatBlock || isToolItem;
    
    // Strip the first-person display transforms from the inner mesh
    // (the auto-centering above already handled position via bounding box)
    const inner = mesh.children[0];
    if (inner) {
        inner.rotation.set(0, 0, 0);
        inner.scale.set(1, 1, 1);
    }
    
    if (is2D) {
        wrapper.scale.set(0.5, 0.5, 0.5);
    } else {
        wrapper.scale.set(0.25, 0.25, 0.25);
    }
    
    wrapper.position.set(x, y, z);
    
    // Reuse shared shadow geometry and material
    const shadow = new THREE.Mesh(_getItemShadowGeo(), _getItemShadowMat());
    shadow.rotation.x = -Math.PI / 2;
    shadow.visible = false; 
    
    scene.add(wrapper);
    scene.add(shadow);
    
    droppedItems.push({
        id: id, count: count, mesh: wrapper, shadow: shadow, x: x, y: y, z: z,
        vx: customVx !== null ? customVx : (Math.random() - 0.5) * 3.0,
        vy: customVy !== null ? customVy : 2.0 + Math.random() * 2.0,
        vz: customVz !== null ? customVz : (Math.random() - 0.5) * 3.0,
        age: 0, pickupDelay: customVx !== null ? 1.5 : 0.8 
    });
};
