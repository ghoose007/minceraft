// ==========================================
// PLAYER MODEL
// ==========================================

// ==========================================
// 16. THIRD-PERSON CAMERA & PLAYER MODEL
// ==========================================
//
// Hierarchy (matches Minecraft):
//   root (player feet, rotated to bodyYaw + PI)
//    ├── bodyMesh (torso, tilts forward when crouching)
//    ├── headPivot (neck, tracks camera yaw-bodyYaw + pitch)
//    ├── rightArm (shoulder, walk + attack + idle sway)
//    │    └── heldItemAnchor (hand)
//    ├── leftArm (shoulder, walk + idle sway)
//    ├── rightLeg (hip, walk)
//    └── leftLeg (hip, walk)
//
// Body yaw:
//   - Follows movement direction when walking
//   - Stays put when standing still (NO drift toward camera)
//   - Hard-clamped so head never exceeds ±50° from body
//   - Only snaps when the clamp forces it

let cameraMode = 0;
let playerModel = null;
let playerModelMaterial = null;
let _playerHeldItemMesh = null;
let _playerHeldItemId = -1;

const TP_CAMERA_DIST = 4.0;

// ---- UV-MAPPED BOX ----

function createPlayerBox(w, h, d, u, v, texW, texH) {
    const geo = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
    const uvs = geo.attributes.uv.array;
    const setUV = (face, x, y, fw, fh) => {
        const u1 = x / texW, u2 = (x + fw) / texW;
        const v1 = 1.0 - ((y + fh) / texH), v2 = 1.0 - (y / texH);
        uvs[face * 8 + 0] = u1; uvs[face * 8 + 1] = v2;
        uvs[face * 8 + 2] = u2; uvs[face * 8 + 3] = v2;
        uvs[face * 8 + 4] = u1; uvs[face * 8 + 5] = v1;
        uvs[face * 8 + 6] = u2; uvs[face * 8 + 7] = v1;
    };
    setUV(0, u + d + w, v + d, d, h);
    setUV(1, u, v + d, d, h);
    setUV(2, u + d, v, w, d);
    setUV(3, u + d + w, v, w, d);
    setUV(4, u + d, v + d, w, h);
    setUV(5, u + 2 * d + w, v + d, w, h);

    const colors = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const biomeTints = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));
    return geo;
}

// ---- BUILD MODEL ----

function initPlayerModel() {
    if (playerModel) return;
    const texW = 64, texH = 64;

    const tex = new THREE.TextureLoader().load('textures/steve.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;

    playerModelMaterial = new THREE.MeshBasicMaterial({
        map: tex, vertexColors: true, side: THREE.FrontSide,
        alphaTest: 0.1,
        transparent: false
    });
    if (typeof injectLightingShader === 'function') injectLightingShader(playerModelMaterial);
    playerModelMaterial.customProgramCacheKey = function() { return 'playerModel'; };

    playerModel = new THREE.Group();

    // Body mesh
    const bodyGeo = createPlayerBox(8, 12, 4, 16, 16, texW, texH);
    const bodyMesh = new THREE.Mesh(bodyGeo, playerModelMaterial);
    bodyMesh.position.set(0, 18 / 16, 0);
    bodyMesh.name = 'bodyMesh';
    playerModel.add(bodyMesh);

    // Head pivot at neck (y=24)
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 24 / 16, 0);
    headPivot.name = 'headPivot';
    playerModel.add(headPivot);

    const headGeo = createPlayerBox(8, 8, 8, 0, 0, texW, texH);
    const headMesh = new THREE.Mesh(headGeo, playerModelMaterial);
    headMesh.position.set(0, 4 / 16, 0);
    headPivot.add(headMesh);

    // Hat overlay
    const hatGeo = createPlayerBox(8, 8, 8, 32, 0, texW, texH);
    const hatMat = playerModelMaterial.clone();
    hatMat.alphaTest = 0.1; hatMat.transparent = false; hatMat.side = THREE.DoubleSide;
    hatMat.customProgramCacheKey = function() { return 'playerModelHat'; };
    if (typeof injectLightingShader === 'function') injectLightingShader(hatMat);
    const hatMesh = new THREE.Mesh(hatGeo, hatMat);
    hatMesh.position.set(0, 4 / 16, 0);
    hatMesh.scale.set(1.125, 1.125, 1.125);
    headPivot.add(hatMesh);

    // Right arm (shoulder at y=24, x=-6)
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(-6 / 16, 24 / 16, 0);
    rightArmPivot.name = 'rightArm';
    playerModel.add(rightArmPivot);

    const rightArmGeo = createPlayerBox(4, 12, 4, 40, 16, texW, texH);
    const rightArmMesh = new THREE.Mesh(rightArmGeo, playerModelMaterial);
    rightArmMesh.position.set(0, -6 / 16, 0);
    rightArmPivot.add(rightArmMesh);

    // Held item anchor at hand — positioned at the bottom of the arm (the hand)
    const heldItemAnchor = new THREE.Group();
    heldItemAnchor.position.set(0 / 16, -12.5 / 16, 0 / 16);
    heldItemAnchor.name = 'heldItemAnchor';
    rightArmPivot.add(heldItemAnchor);

    // Left arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(6 / 16, 24 / 16, 0);
    leftArmPivot.name = 'leftArm';
    playerModel.add(leftArmPivot);

    const leftArmGeo = createPlayerBox(4, 12, 4, 32, 48, texW, texH);
    const leftArmMesh = new THREE.Mesh(leftArmGeo, playerModelMaterial);
    leftArmMesh.position.set(0, -6 / 16, 0);
    leftArmPivot.add(leftArmMesh);

    // Right leg (hip at y=12, x=-2)
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(-2 / 16, 12 / 16, 0);
    rightLegPivot.name = 'rightLeg';
    playerModel.add(rightLegPivot);

    const rightLegGeo = createPlayerBox(4, 12, 4, 0, 16, texW, texH);
    const rightLegMesh = new THREE.Mesh(rightLegGeo, playerModelMaterial);
    rightLegMesh.position.set(0, -6 / 16, 0);
    rightLegPivot.add(rightLegMesh);

    // Left leg
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(2 / 16, 12 / 16, 0);
    leftLegPivot.name = 'leftLeg';
    playerModel.add(leftLegPivot);

    const leftLegGeo = createPlayerBox(4, 12, 4, 16, 48, texW, texH);
    const leftLegMesh = new THREE.Mesh(leftLegGeo, playerModelMaterial);
    leftLegMesh.position.set(0, -6 / 16, 0);
    leftLegPivot.add(leftLegMesh);

    playerModel.scale.set(0.9, 0.9, 0.9);
    playerModel.visible = false;
    scene.add(playerModel);

    playerModel._bodyYaw = 0;
    playerModel._walkTime = 0;
    playerModel._amp = 0;
    playerModel._idleTime = 0;

    // Store original materials so death animation can restore them on respawn
    playerModel._originalMaterials = new Map();
    playerModel.traverse(child => {
        if (child.isMesh) playerModel._originalMaterials.set(child.uuid, child.material);
    });
}

// ---- HELD ITEM ----

function updatePlayerModelHeldItem() {
    if (!playerModel) return;
    const anchor = playerModel.getObjectByName('heldItemAnchor');
    if (!anchor) return;

    const item = (typeof inventory !== 'undefined' && typeof activeSlot !== 'undefined') ? inventory[activeSlot] : null;
    const heldId = (item && item.id !== 0 && item.count > 0) ? item.id : 0;

    if (heldId === _playerHeldItemId) return;
    _playerHeldItemId = heldId;

    if (_playerHeldItemMesh) {
        anchor.remove(_playerHeldItemMesh);
        _playerHeldItemMesh = null;
    }

    if (heldId === 0 || typeof buildItemMesh !== 'function') return;
    const mesh = buildItemMesh(heldId);
    if (!mesh) return;

    const isTool = (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[heldId] && TOOL_DATA[heldId].maxDurability) ? true : false;

    if (isTool) {
        mesh.scale.set(0.4, 0.4, 0.4);
        // Rotation: tilt forward and angle to match MC third-person sword grip
        mesh.rotation.set(1.75, 2.8, 0);
        // Position: nudge into the hand center
        mesh.position.set(-0.02, 0.18, 0.0);
    } else {
        mesh.scale.set(0.3, 0.3, 0.3);
        mesh.position.set(0, 0.05, 0.1875);
    }

    anchor.add(mesh);
    _playerHeldItemMesh = mesh;
}

// ---- LIGHTING ----

function updatePlayerModelLighting() {
    if (!playerModel || !playerModel.visible) return;
    const ix = Math.floor(player.x);
    const iy = Math.floor(player.y + player.eyeLevel);
    const iz = Math.floor(player.z);
    const pSun = (typeof getSunLight === 'function') ? getSunLight(ix, iy, iz) / 15.0 : 1.0;
    const pTorch = (typeof getTorchLight === 'function') ? getTorchLight(ix, iy, iz) / 15.0 : 0.0;

    playerModel.traverse(child => {
        if (child.isMesh && child.geometry && child.geometry.attributes.color) {
            const colors = child.geometry.attributes.color.array;
            let changed = false;
            for (let i = 0; i < colors.length; i += 3) {
                if (Math.abs(colors[i] - pSun) > 0.01 || Math.abs(colors[i + 1] - pTorch) > 0.01) {
                    colors[i] = pSun;
                    colors[i + 1] = pTorch;
                    changed = true;
                }
            }
            if (changed) child.geometry.attributes.color.needsUpdate = true;
        }
    });
}

// ---- ANIMATION ----

function animatePlayerModel(dt) {
    if (!playerModel) return;

    // Handle death animation — overrides normal animation entirely
    if (_playerDying) {
        playerModel.visible = true;
        playerModel.position.set(player.x, player.y, player.z);
        tickPlayerDeathAnimation(dt);
        return;
    }

    const isVisible = cameraMode !== 0;
    playerModel.visible = isVisible;
    if (!isVisible) return;

    // Position at player feet
    playerModel.position.set(player.x, player.y, player.z);

    // --- SNEAKING STATE ---
    const isSneaking = (typeof keys !== 'undefined' && keys.ShiftLeft && 
                        typeof uiState !== 'undefined' && uiState === 'PLAYING' &&
                        !player.flying);

    // Sneak constants (from MC guide)
    const SNEAK_BODY_TILT = 0.5; // ~28 degrees forward
    const SNEAK_Y_OFFSET = -0.2; // Lower the whole model

    // Apply vertical offset for sneak
    if (isSneaking) {
        playerModel.position.y += SNEAK_Y_OFFSET;
    }

    // --- BODY YAW ---
    const cameraYaw = player.yaw;
    let bodyYaw = playerModel._bodyYaw;

    const speed = Math.sqrt(player.vx * player.vx + player.vz * player.vz);
    const isWalking = speed > 0.3;

    if (isWalking) {
        const moveYaw = Math.atan2(-player.vx, -player.vz);
        let moveDiff = moveYaw - bodyYaw;
        while (moveDiff > Math.PI) moveDiff -= Math.PI * 2;
        while (moveDiff < -Math.PI) moveDiff += Math.PI * 2;
        bodyYaw += moveDiff * dt * 6.0;
    }

    // Hard clamp: body can't be more than ~50° from camera
    let camBodyDiff = cameraYaw - bodyYaw;
    while (camBodyDiff > Math.PI) camBodyDiff -= Math.PI * 2;
    while (camBodyDiff < -Math.PI) camBodyDiff += Math.PI * 2;

    const MAX_OFFSET = 50 * (Math.PI / 180);
    if (camBodyDiff > MAX_OFFSET) bodyYaw = cameraYaw - MAX_OFFSET;
    else if (camBodyDiff < -MAX_OFFSET) bodyYaw = cameraYaw + MAX_OFFSET;

    playerModel._bodyYaw = bodyYaw;
    playerModel.rotation.set(0, bodyYaw + Math.PI, 0);

    // --- BODY MESH: apply sneak tilt ---
    const bodyMesh = playerModel.getObjectByName('bodyMesh');
    if (bodyMesh) {
        bodyMesh.rotation.x = isSneaking ? SNEAK_BODY_TILT : 0;
        bodyMesh.position.set(0, 18 / 16, isSneaking ? 2 / 16 : 0);
    }

    // --- HEAD: tracks camera, compensates for body tilt ---
    const headPivot = playerModel.getObjectByName('headPivot');
    if (headPivot) {
        // When sneaking, the top of the torso moves forward+down due to tilt.
        // Head pivot needs to follow: forward on Z, slightly down on Y.
        if (isSneaking) {
            headPivot.position.set(0, 22.5 / 16, 5 / 16);
        } else {
            headPivot.position.set(0, 24 / 16, 0);
        }

        let headRelYaw = cameraYaw - bodyYaw;
        while (headRelYaw > Math.PI) headRelYaw -= Math.PI * 2;
        while (headRelYaw < -Math.PI) headRelYaw += Math.PI * 2;
        headRelYaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, headRelYaw));

        // No pitch compensation needed — the head pivot position already follows the lean.
        // Just apply camera pitch directly.
        headPivot.rotation.set(-player.pitch, headRelYaw, 0, 'YXZ');
    }

    // --- WALK ANIMATION ---
    if (isWalking) {
        playerModel._walkTime += speed * dt * 2.0;
    }
    const t = playerModel._walkTime;

    const targetAmp = isWalking ? Math.min(speed * 0.2, 1.2) : 0;
    playerModel._amp += (targetAmp - playerModel._amp) * dt * 10;
    const a = playerModel._amp;

    let legSwing = Math.cos(t) * a;

    // --- IDLE ARM SWAY ---
    playerModel._idleTime += dt;
    const idleAmp = (1.0 - Math.min(a * 5, 1.0));
    const idleSway = Math.sin(playerModel._idleTime * 1.5) * 0.06 * idleAmp;
    const idleSwayZ = Math.sin(playerModel._idleTime * 1.2 + 0.5) * 0.03 * idleAmp;

    // --- ATTACK SWING on right arm ---
    let attackSwingX = 0;
    let attackSwingY = 0;
    let attackSwingZ = 0;
    if (typeof swingAnimation !== 'undefined' && swingAnimation > 0) {
        const progress = 1.0 - swingAnimation;
        const sqrtP = Math.sqrt(progress);
        const swingArc = Math.sin(sqrtP * Math.PI);
        
        // Forward/down swing
        attackSwingX = -swingArc * 1.5;
        
        // Swing INWARD toward camera direction (negate Y so it sweeps across body)
        let headRelYaw = cameraYaw - bodyYaw;
        while (headRelYaw > Math.PI) headRelYaw -= Math.PI * 2;
        while (headRelYaw < -Math.PI) headRelYaw += Math.PI * 2;
        attackSwingY = -swingArc * headRelYaw * 0.5;
        
        // Slight Z tilt for natural arc
        attackSwingZ = swingArc * 0.3;
    }

    // --- SNEAKING: adjust limbs per MC guide ---
    // Arms inherit body tilt, legs get reduced swing
    const sneakArmTilt = isSneaking ? SNEAK_BODY_TILT : 0;
    if (isSneaking) {
        legSwing *= 0.5; // Reduced swing when sneaking
    }

    const rightArm = playerModel.getObjectByName('rightArm');
    const leftArm = playerModel.getObjectByName('leftArm');
    const rightLeg = playerModel.getObjectByName('rightLeg');
    const leftLeg = playerModel.getObjectByName('leftLeg');

    // Arm positions: when sneaking, follow the top of the tilted torso (forward + slightly down)
    if (rightArm) rightArm.position.set(-6 / 16, isSneaking ? 23.5 / 16 : 24 / 16, isSneaking ? 5 / 16 : 0);
    if (leftArm)  leftArm.position.set(6 / 16, isSneaking ? 23.5 / 16 : 24 / 16, isSneaking ? 5 / 16 : 0);

    // Leg positions: when sneaking, shift back slightly 
    if (rightLeg) rightLeg.position.set(-2 / 16, 12 / 16, isSneaking ? -0.5 / 16 : 0);
    if (leftLeg)  leftLeg.position.set(2 / 16, 12 / 16, isSneaking ? -0.5 / 16 : 0);

    // Apply rotations: arms get sneakArmTilt added, legs get reduced swing
    if (rightLeg) rightLeg.rotation.set(legSwing, 0, 0);
    if (leftLeg)  leftLeg.rotation.set(-legSwing, 0, 0);
    if (rightArm) rightArm.rotation.set(-legSwing + sneakArmTilt + attackSwingX + idleSway, attackSwingY, idleSwayZ + attackSwingZ);
    if (leftArm)  leftArm.rotation.set(legSwing + sneakArmTilt + idleSway, 0, -idleSwayZ);

    // --- HELD ITEM + LIGHTING ---
    updatePlayerModelHeldItem();
    updatePlayerModelLighting();
}
