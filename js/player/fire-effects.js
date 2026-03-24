// ==========================================
// PLAYER FIRE EFFECTS
// ==========================================

// ---- FIRE OVERLAY & MODEL FIRE ----
// Minecraft fire damage rates:
//   Lava: 4 HP every 0.5s (8 DPS)  -- player.onFire is set for 15s
//   Fire block: 1 HP every 0.5s (2 DPS) -- player.onFire set for 8s

// Fire screen overlay (first-person only) — a full-screen quad using the fire texture
let _fireOverlayPlane = null;

function getFireOverlayPlane() {
    if (_fireOverlayPlane) return _fireOverlayPlane;
    if (!window.fireMaterial) return null;

    // Clone the fire material so we can control it independently
    const mat = window.fireMaterial.clone();
    mat.uniforms = THREE.UniformsUtils.clone(window.fireMaterial.uniforms);
    mat.uniforms.uTexture = window.fireMaterial.uniforms.uTexture; // share texture ref
    mat.depthTest = false;
    mat.depthWrite = false;

    // A plane in uiCamera space fills the screen — same approach as the held item group.
    // uiCamera uses a perspective FOV of 75 and near=0.1, so at z=-0.5 the plane
    // needs to be sized to cover the full frustum cross-section.
    // tan(37.5 deg) ≈ 0.7673; at z=0.5 half-height = 0.5*0.7673 = 0.384, full = 0.768
    // Use 2x2 and scale up to guarantee coverage at all aspect ratios
    const geo = new THREE.PlaneGeometry(2, 2);
    _fireOverlayPlane = new THREE.Mesh(geo, mat);
    _fireOverlayPlane.renderOrder = 998;
    _fireOverlayPlane.frustumCulled = false;
    _fireOverlayPlane.scale.set(3, 3, 1); // covers any aspect ratio

    // Attach to uiCamera so it's always screen-filling
    if (typeof uiCamera !== 'undefined') {
        uiCamera.add(_fireOverlayPlane);
        // Offset Y downward so the fire sits lower on screen (less occlusion at top)
        _fireOverlayPlane.position.set(0, -0.55, -1.5);
    }
    _fireOverlayPlane.visible = false;
    return _fireOverlayPlane;
}

// Billboard fire quads applied to the player model (third-person while on fire)
function updateModelFireMeshes(isOnFire) {
    if (!playerModel) return;
    if (!playerModel._fireMeshes) playerModel._fireMeshes = [];

    const want = isOnFire && cameraMode !== 0 && playerModel.visible;

    if (!want) {
        // Remove existing
        for (const fm of playerModel._fireMeshes) {
            playerModel.remove(fm);
            if (fm.geometry) fm.geometry.dispose();
        }
        playerModel._fireMeshes = [];
        return;
    }

    if (!window.fireMaterial || playerModel._fireMeshes.length > 0) return;

    // Two crossed quads covering the model's bounding box (~1.8 blocks tall, 0.6 wide)
    const positions = [
        { x: 0,     z:  0.35, ry: 0 },
        { x: 0,     z: -0.35, ry: 0 },
        { x:  0.35, z: 0,     ry: Math.PI / 2 },
        { x: -0.35, z: 0,     ry: Math.PI / 2 },
    ];

    for (const pos of positions) {
        const geo = new THREE.PlaneGeometry(0.9, 1.8);
        const mat = window.fireMaterial.clone();
        mat.uniforms = THREE.UniformsUtils.clone(window.fireMaterial.uniforms);
        mat.uniforms.uTexture = window.fireMaterial.uniforms.uTexture;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = false;

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, 0.9, pos.z);
        mesh.rotation.y = pos.ry;
        mesh.renderOrder = 10;
        playerModel._fireMeshes.push(mesh);
        playerModel.add(mesh);
    }
}

// Called every frame from gameloop — pass player.onFire and current time
window.updateFireEffects = function(isOnFire, time) {
    const inFirst = (typeof cameraMode === 'undefined' || cameraMode === 0);

    // Update fire overlay (first-person)
    const overlay = getFireOverlayPlane();
    if (overlay) {
        overlay.visible = isOnFire && inFirst;
        if (overlay.visible && overlay.material.uniforms) {
            overlay.material.uniforms.uTime.value = time;
        }
    }

    // Update fire on model (third-person)
    updateModelFireMeshes(isOnFire);
    if (playerModel && playerModel._fireMeshes) {
        for (const fm of playerModel._fireMeshes) {
            if (fm.material && fm.material.uniforms) {
                fm.material.uniforms.uTime.value = time;
            }
        }
    }
};

// ==========================================
// HEROBRINE ENTITY