// ==========================================
// HEROBRINE ENTITY
// ==========================================
// A single ambient entity that lurks at the edge of the player's
// render distance. Always stands still, always watches the player.
//
// At long render distances (12+ chunks / 192+ blocks):
//   Fully opaque. Flees if the player gets within 128 blocks.
//
// At short render distances (4 or 8 chunks / 64-128 blocks):
//   50% transparent (ghostly). Sits at the far edge of the render
//   distance and flees at 60% of render distance.

const _herobrineEntities = [];
let _herobrineMaterial = null;
let _herobrineHatMat = null;
let _herobrineTexLoaded = false;
let _herobrineSpawned = false;
let _lastRenderDistIndex = -1;

// --- RENDER-DISTANCE-AWARE SETTINGS ---
function _isShortRenderDist() {
    // RENDER_DISTANCES = [4, 8, 12, 16] — indices 0 and 1 are "short"
    return currentRenderDistIndex <= 1;
}

function _getFleeDistance() {
    const renderBlocks = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
    if (_isShortRenderDist()) {
        // Flee at 60% of render distance so there's room to exist
        return renderBlocks * 0.60;
    }
    return 128;
}

function _getTargetOpacity() {
    return _isShortRenderDist() ? 0.5 : 1.0;
}

// --- APPLY OPACITY TO ALL MESHES IN A HEROBRINE ENTITY ---
function _applyOpacity(hb, opacity) {
    const isTransparent = opacity < 1.0;
    hb.mesh.traverse(child => {
        if (child.isMesh && child.material) {
            child.material.transparent = isTransparent;
            child.material.opacity = opacity;
            child.material.depthWrite = !isTransparent;
            child.material.needsUpdate = true;
        }
    });
}

function _getHerobrineMaterial() {
    if (_herobrineMaterial) return _herobrineMaterial;
    
    const tex = new THREE.TextureLoader().load('textures/herobrine.png?v=' + ASSET_VERSION, () => {
        _herobrineTexLoaded = true;
    });
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    
    _herobrineMaterial = new THREE.MeshBasicMaterial({
        map: tex, vertexColors: true, side: THREE.FrontSide,
        alphaTest: 0.1, transparent: false
    });
    if (typeof injectLightingShader === 'function') injectLightingShader(_herobrineMaterial);
    _herobrineMaterial.customProgramCacheKey = function() { return 'herobrineMat'; };
    return _herobrineMaterial;
}

// ==========================================
// FIND A POSITION AT THE RENDER DISTANCE EDGE
// ==========================================
function _findEdgePosition() {
    const renderDist = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
    // Place at 85-95% of render distance
    const dist = renderDist * (0.85 + Math.random() * 0.10);
    const angle = Math.random() * Math.PI * 2;
    
    const tx = player.x + Math.cos(angle) * dist;
    const tz = player.z + Math.sin(angle) * dist;
    
    let ty = 0;
    if (typeof getHighestBlock === 'function') {
        ty = getHighestBlock(Math.floor(tx), Math.floor(tz));
        const blockId = (typeof getVoxel === 'function') ? (getVoxel(Math.floor(tx), ty, Math.floor(tz)) & 0xFF) : 0;
        // Skip water/lava — try alternate angles
        if (blockId === 4 || blockId === 27 || blockId === 0) {
            for (let attempt = 0; attempt < 8; attempt++) {
                const a2 = angle + (attempt + 1) * (Math.PI / 4);
                const tx2 = player.x + Math.cos(a2) * dist;
                const tz2 = player.z + Math.sin(a2) * dist;
                const ty2 = getHighestBlock(Math.floor(tx2), Math.floor(tz2));
                const bid2 = (typeof getVoxel === 'function') ? (getVoxel(Math.floor(tx2), ty2, Math.floor(tz2)) & 0xFF) : 0;
                if (bid2 !== 4 && bid2 !== 27 && bid2 !== 0) {
                    return { x: tx2 + 0.5, y: ty2 + 1, z: tz2 + 0.5 };
                }
            }
        }
    } else {
        ty = 70;
    }
    
    return { x: tx + 0.5, y: ty + 1, z: tz + 0.5 };
}

// ==========================================
// BUILD THE MODEL
// ==========================================
function _buildHerobrineModel() {
    const texW = 64, texH = 64;
    const mat = _getHerobrineMaterial();
    
    const root = new THREE.Group();
    
    const bodyGeo = createPlayerBox(8, 12, 4, 16, 16, texW, texH);
    const bodyMesh = new THREE.Mesh(bodyGeo, mat);
    bodyMesh.position.set(0, 18 / 16, 0);
    root.add(bodyMesh);
    
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 24 / 16, 0);
    headPivot.name = 'headPivot';
    root.add(headPivot);
    
    const headGeo = createPlayerBox(8, 8, 8, 0, 0, texW, texH);
    const headMesh = new THREE.Mesh(headGeo, mat);
    headMesh.position.set(0, 4 / 16, 0);
    headPivot.add(headMesh);
    
    const hatGeo = createPlayerBox(8, 8, 8, 32, 0, texW, texH);
    _herobrineHatMat = mat.clone();
    _herobrineHatMat.alphaTest = 0.1; _herobrineHatMat.transparent = false; _herobrineHatMat.side = THREE.DoubleSide;
    _herobrineHatMat.customProgramCacheKey = function() { return 'herobrineHat'; };
    if (typeof injectLightingShader === 'function') injectLightingShader(_herobrineHatMat);
    const hatMesh = new THREE.Mesh(hatGeo, _herobrineHatMat);
    hatMesh.position.set(0, 4 / 16, 0);
    hatMesh.scale.set(1.125, 1.125, 1.125);
    headPivot.add(hatMesh);
    
    const rightArm = new THREE.Group();
    rightArm.position.set(-6 / 16, 24 / 16, 0);
    rightArm.name = 'rightArm';
    root.add(rightArm);
    const rightArmGeo = createPlayerBox(4, 12, 4, 40, 16, texW, texH);
    const rightArmMesh = new THREE.Mesh(rightArmGeo, mat);
    rightArmMesh.position.set(0, -6 / 16, 0);
    rightArm.add(rightArmMesh);
    
    const leftArm = new THREE.Group();
    leftArm.position.set(6 / 16, 24 / 16, 0);
    leftArm.name = 'leftArm';
    root.add(leftArm);
    const leftArmGeo = createPlayerBox(4, 12, 4, 32, 48, texW, texH);
    const leftArmMesh = new THREE.Mesh(leftArmGeo, mat);
    leftArmMesh.position.set(0, -6 / 16, 0);
    leftArm.add(leftArmMesh);
    
    const rightLeg = new THREE.Group();
    rightLeg.position.set(-2 / 16, 12 / 16, 0);
    rightLeg.name = 'rightLeg';
    root.add(rightLeg);
    const rightLegGeo = createPlayerBox(4, 12, 4, 0, 16, texW, texH);
    const rightLegMesh = new THREE.Mesh(rightLegGeo, mat);
    rightLegMesh.position.set(0, -6 / 16, 0);
    rightLeg.add(rightLegMesh);
    
    const leftLeg = new THREE.Group();
    leftLeg.position.set(2 / 16, 12 / 16, 0);
    leftLeg.name = 'leftLeg';
    root.add(leftLeg);
    const leftLegGeo = createPlayerBox(4, 12, 4, 16, 48, texW, texH);
    const leftLegMesh = new THREE.Mesh(leftLegGeo, mat);
    leftLegMesh.position.set(0, -6 / 16, 0);
    leftLeg.add(leftLegMesh);
    
    root.scale.set(0.9, 0.9, 0.9);
    
    return { root, headPivot, rightArm, leftArm, rightLeg, leftLeg };
}

// ==========================================
// TELEPORT TO NEW EDGE POSITION
// ==========================================
function _teleportHerobrine(hb) {
    const pos = _findEdgePosition();
    hb.x = pos.x;
    hb.y = pos.y;
    hb.z = pos.z;
    hb.mesh.position.set(pos.x, pos.y, pos.z);
    
    const dx = player.x - hb.x;
    const dz = player.z - hb.z;
    hb.bodyYaw = Math.atan2(dx, dz);
    hb.mesh.rotation.set(0, hb.bodyYaw, 0);
}

// ==========================================
// SPAWN (called once, automatically)
// ==========================================
function spawnHerobrine(x, y, z) {
    const model = _buildHerobrineModel();
    
    model.root.position.set(x, y, z);
    
    const dx = player.x - x;
    const dz = player.z - z;
    const spawnYaw = Math.atan2(dx, dz);
    model.root.rotation.y = spawnYaw;
    
    scene.add(model.root);
    
    const entity = {
        mesh: model.root,
        x, y, z,
        idleTime: Math.random() * 100,
        bodyYaw: spawnYaw,
        headPivot: model.headPivot,
        rightArm: model.rightArm,
        leftArm: model.leftArm,
        rightLeg: model.rightLeg,
        leftLeg: model.leftLeg
    };
    
    // Set initial opacity based on current render distance
    _applyOpacity(entity, _getTargetOpacity());
    
    _herobrineEntities.push(entity);
    return entity;
}

// ==========================================
// UPDATE — called every frame from game loop
// ==========================================
window.updateHerobrineEntities = function(dt) {
    if (typeof player === 'undefined' || !player) return;
    if (typeof scene === 'undefined' || !scene) return;

    // Skyblock is a tiny void-island test preset; Herobrine's render-distance
    // edge spawning/fleeing logic does not fit it and can spawn him in the void.
    if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 5) {
        if (_herobrineEntities.length > 0) {
            for (const hb of _herobrineEntities) {
                if (hb && hb.mesh && hb.mesh.parent) hb.mesh.parent.remove(hb.mesh);
            }
            _herobrineEntities.length = 0;
        }
        _herobrineSpawned = true;
        return;
    }
    
    // --- AUTO-SPAWN: one Herobrine, once, after the world is loaded ---
    if (!_herobrineSpawned && typeof getHighestBlock === 'function') {
        if (!window._herobrineSpawnDelay) {
            window._herobrineSpawnDelay = 0;
        }
        window._herobrineSpawnDelay += dt;
        if (window._herobrineSpawnDelay > 3.0) {
            const pos = _findEdgePosition();
            spawnHerobrine(pos.x, pos.y, pos.z);
            _herobrineSpawned = true;
            _lastRenderDistIndex = currentRenderDistIndex;
        }
        return;
    }
    
    // --- RENDER DISTANCE CHANGED: reposition and update opacity ---
    if (currentRenderDistIndex !== _lastRenderDistIndex) {
        _lastRenderDistIndex = currentRenderDistIndex;
        const opacity = _getTargetOpacity();
        for (const hb of _herobrineEntities) {
            _teleportHerobrine(hb);
            _applyOpacity(hb, opacity);
        }
    }
    
    const fleeDistance = _getFleeDistance();
    
    for (const hb of _herobrineEntities) {
        hb.idleTime += dt;
        
        // --- CHECK DISTANCE: if player gets too close, teleport away ---
        const pdx = player.x - hb.x;
        const pdz = player.z - hb.z;
        const playerDist = Math.sqrt(pdx * pdx + pdz * pdz);
        
        if (playerDist < fleeDistance) {
            _teleportHerobrine(hb);
            continue;
        }
        
        // --- IDLE ARM SWAY ---
        const sway = Math.sin(hb.idleTime * 1.5) * 0.06;
        const swayZ = Math.sin(hb.idleTime * 1.2 + 0.5) * 0.03;
        
        hb.rightArm.rotation.set(sway, 0, swayZ);
        hb.leftArm.rotation.set(sway, 0, -swayZ);
        
        // --- HEAD: always looks directly at the player ---
        const dx = player.x - hb.x;
        const dy = (player.y + player.eyeLevel) - (hb.y + 24 / 16 * 0.9);
        const dz = player.z - hb.z;
        
        const targetHeadYaw = Math.atan2(dx, dz);
        
        // --- BODY: lags behind head, clamped ---
        let bodyDiff = targetHeadYaw - hb.bodyYaw;
        while (bodyDiff > Math.PI) bodyDiff -= Math.PI * 2;
        while (bodyDiff < -Math.PI) bodyDiff += Math.PI * 2;
        
        hb.bodyYaw += bodyDiff * dt * 2.0;
        
        let clampDiff = targetHeadYaw - hb.bodyYaw;
        while (clampDiff > Math.PI) clampDiff -= Math.PI * 2;
        while (clampDiff < -Math.PI) clampDiff += Math.PI * 2;
        
        const MAX_OFFSET = 50 * (Math.PI / 180);
        if (clampDiff > MAX_OFFSET) hb.bodyYaw = targetHeadYaw - MAX_OFFSET;
        else if (clampDiff < -MAX_OFFSET) hb.bodyYaw = targetHeadYaw + MAX_OFFSET;
        
        hb.mesh.rotation.set(0, hb.bodyYaw, 0);
        
        // --- HEAD: relative yaw from body, pitch toward player ---
        let headRelYaw = targetHeadYaw - hb.bodyYaw;
        while (headRelYaw > Math.PI) headRelYaw -= Math.PI * 2;
        while (headRelYaw < -Math.PI) headRelYaw += Math.PI * 2;
        headRelYaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, headRelYaw));
        
        const distXZ = Math.sqrt(dx * dx + dz * dz);
        let headPitch = Math.atan2(-dy, distXZ);
        headPitch = Math.max(-0.8, Math.min(0.8, headPitch));
        
        const currYaw = hb.headPivot.rotation.y;
        const currPitch = hb.headPivot.rotation.x;
        hb.headPivot.rotation.set(
            currPitch + (headPitch - currPitch) * dt * 5.0,
            currYaw + (headRelYaw - currYaw) * dt * 5.0,
            0, 'YXZ'
        );
        
        // --- UPDATE LIGHTING ---
        const ix = Math.floor(hb.x), iy = Math.floor(hb.y + 0.5), iz = Math.floor(hb.z);
        if (typeof getSunLight === 'function' && typeof getTorchLight === 'function') {
            const pSun = getSunLight(ix, iy, iz) / 15.0;
            const pTorch = getTorchLight(ix, iy, iz) / 15.0;
            hb.mesh.traverse(child => {
                if (child.isMesh && child.geometry.attributes.color) {
                    const colors = child.geometry.attributes.color.array;
                    for (let i = 0; i < colors.length; i += 3) {
                        colors[i] = pSun;
                        colors[i + 1] = pTorch;
                    }
                    child.geometry.attributes.color.needsUpdate = true;
                }
            });
        }
    }
};

// Expose for dimension switching cleanup
window._herobrineEntities = _herobrineEntities;
window.spawnHerobrine = spawnHerobrine;