// ==========================================
// PLAYER DEATH ANIMATION
// ==========================================

// ---- PLAYER DEATH ANIMATION ----

let _playerDeathTimer = 0;
let _playerDying = false;
const PLAYER_DEATH_DURATION = 1.2;

window.startPlayerDeathAnimation = function() {
    if (!playerModel) return;
    _playerDying = true;
    _playerDeathTimer = PLAYER_DEATH_DURATION;
    // Force third-person on if in first person so the death is visible
    if (cameraMode === 0) {
        cameraMode = 1;
        if (typeof heldItemGroup !== 'undefined' && heldItemGroup) heldItemGroup.visible = false;
    }
    // Make sure material is set to allow opacity changes
    playerModel.traverse(child => {
        if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.transparent = true;
            child.material.depthWrite = false;
        }
    });
};

window.resetPlayerModel = function() {
    _playerDying = false;
    _playerDeathTimer = 0;
    if (!playerModel) return;
    // Restore upright rotation
    playerModel.rotation.z = 0;
    playerModel.rotation.x = 0;
    // Re-assign original materials (death anim cloned them, causing color corruption)
    if (playerModel._originalMaterials) {
        playerModel.traverse(child => {
            if (child.isMesh) {
                const orig = playerModel._originalMaterials.get(child.uuid);
                if (orig) child.material = orig;
            }
        });
    }
    // Also remove any fire overlay meshes from the model
    if (playerModel._fireMeshes) {
        for (const fm of playerModel._fireMeshes) {
            playerModel.remove(fm);
            if (fm.geometry) fm.geometry.dispose();
        }
        playerModel._fireMeshes = [];
    }
    playerModel.visible = false;
};

// Called each frame from animatePlayerModel when dying
function tickPlayerDeathAnimation(dt) {
    if (!_playerDying || !playerModel) return;

    _playerDeathTimer -= dt;
    const progress = 1.0 - Math.max(0, _playerDeathTimer / PLAYER_DEATH_DURATION);

    // Tip over sideways — rotate Z from 0 → PI/2 (same as pig)
    playerModel.rotation.z = (Math.PI / 2) * Math.min(1, progress * 1.6);

    // Fade out in the second half
    const opacity = Math.max(0, 1.0 - Math.max(0, (progress - 0.5) * 2.0));
    playerModel.traverse(child => {
        if (child.isMesh && child.material) child.material.opacity = opacity;
    });

    if (_playerDeathTimer <= 0) {
        // Burst of smoke particles at death position
        if (typeof window.spawnSmoke === 'function') {
            for (let i = 0; i < 8; i++) {
                window.spawnSmoke(
                    player.x + (Math.random() - 0.5) * 0.8,
                    player.y + 0.8 + Math.random() * 0.6,
                    player.z + (Math.random() - 0.5) * 0.8
                );
            }
        }
        _playerDying = false;
        playerModel.visible = false;
    }
}

