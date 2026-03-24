// ==========================================
// THIRD-PERSON CAMERA
// ==========================================

// ---- THIRD-PERSON CAMERA ----

function updateThirdPersonCamera() {
    if (cameraMode === 0) return false;

    const eyeX = player.x;
    const eyeY = player.y + player.eyeLevel;
    const eyeZ = player.z;

    const lookDirX = -Math.sin(player.yaw) * Math.cos(player.pitch);
    const lookDirY = Math.sin(player.pitch);
    const lookDirZ = -Math.cos(player.yaw) * Math.cos(player.pitch);

    if (cameraMode === 1) {
        const bx = -lookDirX, by = -lookDirY, bz = -lookDirZ;
        const dist = castCameraRay(eyeX, eyeY, eyeZ, bx, by, bz, TP_CAMERA_DIST);
        camera.position.set(eyeX + bx * dist, eyeY + by * dist, eyeZ + bz * dist);
        camera.lookAt(eyeX, eyeY, eyeZ);
    } else {
        const dist = castCameraRay(eyeX, eyeY, eyeZ, lookDirX, lookDirY, lookDirZ, TP_CAMERA_DIST);
        camera.position.set(eyeX + lookDirX * dist, eyeY + lookDirY * dist, eyeZ + lookDirZ * dist);
        camera.lookAt(eyeX, eyeY, eyeZ);
    }
    return true;
}

function castCameraRay(sx, sy, sz, dx, dy, dz, maxDist) {
    const step = 0.2, margin = 0.3;
    for (let t = step; t <= maxDist; t += step) {
        const id = getVoxel(Math.floor(sx + dx * t), Math.floor(sy + dy * t), Math.floor(sz + dz * t)) & 0xFF;
        if (id !== 0 && !isFluidBlock(id) && !isCrossBlock(id)) return Math.max(margin, t - step);
    }
    return maxDist;
}

// ---- TOGGLE ----

function toggleCameraMode() {
    cameraMode = (cameraMode + 1) % 3;
    const el = document.getElementById('action-text');
    el.textContent = ['First Person', 'Third Person Back', 'Third Person Front'][cameraMode];
    el.style.opacity = '1';
    clearTimeout(actionTextTimeout);
    actionTextTimeout = setTimeout(() => el.style.opacity = '0', 2000);

    if (typeof heldItemGroup !== 'undefined' && heldItemGroup) heldItemGroup.visible = (cameraMode === 0);
    if (cameraMode !== 0) _playerHeldItemId = -1;
}