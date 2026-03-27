// ==========================================
// MONSTER SPAWNERS
// ==========================================

// ==========================================
//
// Minecraft spawner mechanics:
//   - Tracks all placed spawner blocks (ID 54) in a registry
//   - Spawns up to 6 mobs within 4-block radius of spawner
//   - Only spawns when player is within 16 blocks
//   - Does NOT spawn if spawner block has light level >= 9 (torch/day)
//   - Spawns in a 4-wide, 3-tall area centered on spawner
//   - Delay between spawns: 10-40 seconds (random each time)
//   - Shows spinning zombie model inside cage + fire particles

const _spawnerRegistry = new Map(); // key -> { x,y,z, timer, delayMin, delayMax, model }
const _SPAWNER_DETECT_RANGE = 16;
const _SPAWNER_SPAWN_RADIUS = 4;
const _SPAWNER_MAX_NEARBY   = 6;
const _SPAWNER_SPAWN_SPREAD = 4; // horizontal spread around spawner
const _SPAWNER_LIGHT_BLOCK  = 9; // light level at or above this = no spawn

// Fire particle textures for spawner cage (random pixel clusters, fire-coloured)
let _spawnerParticleMats = null;
let _spawnerParticleGeo  = null;

function _initSpawnerParticleAssets() {
    if (_spawnerParticleMats) return;
    _spawnerParticleMats = [];
    _spawnerParticleGeo = new THREE.PlaneGeometry(0.28, 0.28);

    const fireColors = [
        0xff1100, 0xff3300, 0xff5500, 0xff7700,
        0xff9900, 0xffbb00, 0xffdd00, 0xffee44
    ];

    for (let i = 0; i < 12; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 8; canvas.height = 8;
        const ctx = canvas.getContext('2d');
        const cx = 2 + Math.floor(Math.random() * 4);
        const cy = 2 + Math.floor(Math.random() * 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx, cy, 2, 2);
        const extras = 2 + Math.floor(Math.random() * 4);
        for (let p = 0; p < extras; p++) {
            const px = cx + Math.floor(Math.random() * 5) - 2;
            const py = cy + Math.floor(Math.random() * 5) - 2;
            if (px >= 0 && px < 8 && py >= 0 && py < 8) ctx.fillRect(px, py, 1, 1);
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        const col = fireColors[Math.floor(Math.random() * fireColors.length)];
        _spawnerParticleMats.push(new THREE.MeshBasicMaterial({
            map: tex, color: col, transparent: true, alphaTest: 0.01,
            depthWrite: false, fog: true, side: THREE.DoubleSide
        }));
    }
}

// Burst particles along the 12 edges of the spawner block face when mobs spawn
function _burstSpawnerParticles(sx, sy, sz) {
    _initSpawnerParticleAssets();

    // The 12 edges of a unit cube — each edge defined by a fixed axis coordinate
    // and a range along the other two. We sample random points along each edge.
    const bx = sx + 0.5, by = sy + 0.5, bz = sz + 0.5;
    const count = 24; // particles per burst

    for (let i = 0; i < count; i++) {
        const mat = _spawnerParticleMats[Math.floor(Math.random() * _spawnerParticleMats.length)].clone();
        mat.opacity = 1.0;

        const mesh = new THREE.Mesh(_spawnerParticleGeo, mat);

        // Pick a random edge of the block face
        // Each face has 4 edges; 6 faces × 4 edges = 24, but shared so 12 unique.
        // Simplify: pick one of 3 axes as the "along" direction, fix the other two to ±0.5
        const axis = Math.floor(Math.random() * 3);
        const t = Math.random() - 0.5; // position along the edge
        const s1 = (Math.random() < 0.5) ? -0.5 : 0.5;
        const s2 = (Math.random() < 0.5) ? -0.5 : 0.5;

        let px, py, pz;
        if (axis === 0)      { px = bx + t; py = by + s1; pz = bz + s2; }
        else if (axis === 1) { px = bx + s1; py = by + t; pz = bz + s2; }
        else                 { px = bx + s1; py = by + s2; pz = bz + t; }

        mesh.position.set(px, py, pz);
        mesh.onBeforeRender = function(renderer, scene, camera) {
            mesh.quaternion.copy(camera.quaternion);
        };
        scene.add(mesh);

        // Fly outward from edge then fade
        const outX = px - bx, outZ = pz - bz;
        const outLen = Math.sqrt(outX*outX + outZ*outZ) || 0.01;
        particles.push({
            mesh, mat,
            vx: (outX / outLen) * (0.3 + Math.random() * 0.4),
            vy: 0.2 + Math.random() * 0.6,
            vz: (outZ / outLen) * (0.3 + Math.random() * 0.4),
            life: 0.5 + Math.random() * 0.4,
            maxLife: 0.9,
            noGravity: true,
            isSmoke: true
        });
    }
}

// Build tiny zombie model using exact same proportions as the Zombie class.
// Hierarchy: root at feet, leg pivots y=12/16, body y=18/16, arms/head y=24/16.
// Uses createMobBox (64×32 zombie texture) with player-proportioned pivot layout.
function _buildSpawnerZombieModel() {
    const TEX_W = 64, TEX_H = 32;
    const tex = new THREE.TextureLoader().load('textures/zombie.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    const M = new THREE.MeshBasicMaterial({
        map: tex, vertexColors: true,
        side: THREE.FrontSide, transparent: false
    });
    if (typeof injectLightingShader === 'function') injectLightingShader(M);
    M.customProgramCacheKey = function() { return 'spawnerZombieMat'; };

    const group = new THREE.Group();

    const mesh = (w, h, d, u, v) => new THREE.Mesh(createMobBox(w, h, d, u, v, TEX_W, TEX_H), M);

    // Right leg pivot at y=12/16, x=-2/16
    const rLegPivot = new THREE.Group();
    const rLegMesh = mesh(4, 12, 4, 0, 16);
    rLegMesh.position.set(0, -6/16, 0);
    rLegPivot.add(rLegMesh);
    rLegPivot.position.set(-2/16, 12/16, 0);
    group.add(rLegPivot);

    // Left leg pivot at y=12/16, x=+2/16
    const lLegPivot = new THREE.Group();
    const lLegMesh = mesh(4, 12, 4, 0, 16);
    lLegMesh.position.set(0, -6/16, 0);
    lLegPivot.add(lLegMesh);
    lLegPivot.position.set(2/16, 12/16, 0);
    group.add(lLegPivot);

    // Body at y=18/16
    const bodyMesh = mesh(8, 12, 4, 16, 16);
    bodyMesh.position.set(0, 18/16, 0);
    group.add(bodyMesh);

    // Right arm pivot at y=23/16 (1px below shoulder), x=-6/16
    const rArmPivot = new THREE.Group();
    const rArmMesh = mesh(4, 12, 4, 40, 16);
    rArmMesh.position.set(0, -6/16, 0);
    rArmPivot.add(rArmMesh);
    rArmPivot.position.set(-6/16, 23/16, 0);
    rArmPivot.rotation.x = -Math.PI / 2; // raised zombie pose
    group.add(rArmPivot);

    // Left arm pivot at y=23/16, x=+6/16
    const lArmPivot = new THREE.Group();
    const lArmMesh = mesh(4, 12, 4, 40, 16);
    lArmMesh.position.set(0, -6/16, 0);
    lArmPivot.add(lArmMesh);
    lArmPivot.position.set(6/16, 23/16, 0);
    lArmPivot.rotation.x = -Math.PI / 2;
    group.add(lArmPivot);

    // Head pivot at y=24/16, mesh +4/16 (pivot at neck base)
    const headPivot = new THREE.Group();
    const headMesh = mesh(8, 8, 8, 0, 0);
    headMesh.position.set(0, 4/16, 0);
    headPivot.add(headMesh);
    headPivot.position.set(0, 24/16, 0);
    group.add(headPivot);

    // Scale to fit inside the 1-block cage (full height ~2 blocks → scale to ~0.35)
    group.scale.set(0.35, 0.35, 0.35);

    return group;
}

// Register a spawner when it's placed (called from init.js on block place)
window.registerSpawner = function(x, y, z) {
    const key = `${x},${y},${z}`;
    if (_spawnerRegistry.has(key)) return;

    const model = _buildSpawnerZombieModel();
    // Centre horizontally, vertically centred in block
    // Tilt backward ~25° so it looks like the classic MC spawner zombie pose
    model.position.set(x + 0.5, y + 0.08, z + 0.5);
    model.rotation.x = 0;
    scene.add(model);

    _spawnerRegistry.set(key, {
        x, y, z,
        timer: 5.0,
        delayMin: 10, delayMax: 40,
        model,
    });
};

// Unregister when broken
window.unregisterSpawner = function(x, y, z) {
    const key = `${x},${y},${z}`;
    const data = _spawnerRegistry.get(key);
    if (!data) return;
    if (data.model) scene.remove(data.model);
    _spawnerRegistry.delete(key);
};

// Called every frame from gameloop
window.tickSpawnerBlocks = function(dt) {
    for (const [key, data] of _spawnerRegistry) {
        const { x, y, z } = data;

        // Remove if block was broken externally
        if ((getVoxel(x, y, z) & 0xFF) !== 54) {
            if (data.model) scene.remove(data.model);
            _spawnerRegistry.delete(key);
            continue;
        }

        const dx = player.x - (x + 0.5);
        const dz = player.z - (z + 0.5);
        const distToPlayer = Math.sqrt(dx*dx + dz*dz);
        const playerNearby = distToPlayer <= _SPAWNER_DETECT_RANGE;

        // ---- SPINNING MODEL ANIMATION ----
        if (data.model) {
            // Fast constant spin
            data.model.rotation.y += dt * 6.0;

            // Update world lighting — sample from the brightest adjacent block
            // (the spawner interior counts as 0, so we check all 6 neighbors)
            const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
            let bestSun = 0, bestTorch = 0;
            const dirs = [[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
            for (const [dx, dy, dz] of dirs) {
                const nId = getVoxel(ix+dx, iy+dy, iz+dz) & 0xFF;
                if (nId === 0 || isFluidBlock(nId) || isCrossBlock(nId)) {
                    bestSun   = Math.max(bestSun,   getSunLight(ix+dx, iy+dy, iz+dz));
                    bestTorch = Math.max(bestTorch, getTorchLight(ix+dx, iy+dy, iz+dz));
                }
            }
            const sunLevel = (typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 1.0;
            const pSun   = bestSun   / 15.0;
            const pTorch = bestTorch / 15.0;
            // Ambient floor so the model is never fully black inside a dark cave
            const AMBIENT = 0.15;
            const finalSun   = Math.max(AMBIENT, pSun * sunLevel);
            const finalTorch = pTorch;
            data.model.traverse(child => {
                if (child.isMesh && child.geometry && child.geometry.attributes.color) {
                    const colors = child.geometry.attributes.color.array;
                    for (let i = 0; i < colors.length; i += 3) {
                        colors[i]     = finalSun;
                        colors[i + 1] = finalTorch;
                    }
                    child.geometry.attributes.color.needsUpdate = true;
                }
            });
        }

        if (!playerNearby) continue;

        // ---- LIGHT CHECK ----
        const lightAtSpawner = Math.max(
            getSunLight(x, y + 1, z) * ((typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 1),
            getTorchLight(x, y + 1, z)
        );
        if (lightAtSpawner >= _SPAWNER_LIGHT_BLOCK) {
            data.timer = data.delayMin + Math.random() * (data.delayMax - data.delayMin);
            continue;
        }

        // ---- SPAWN TIMER ----
        data.timer -= dt;
        if (data.timer > 0) continue;

        data.timer = data.delayMin + Math.random() * (data.delayMax - data.delayMin);

        // Check nearby mob cap
        const nearbyZombies = globalMobs.filter(m => {
            if (!(m instanceof Zombie)) return false;
            const mx = m.x - (x + 0.5), mz = m.z - (z + 0.5);
            return Math.sqrt(mx*mx + mz*mz) <= 8;
        }).length;

        if (nearbyZombies >= _SPAWNER_MAX_NEARBY) continue;

        // ---- SPAWN WAVE + BURST PARTICLES ----
        const packSize = 1 + Math.floor(Math.random() * 4);
        let spawned = 0;
        for (let i = 0; i < packSize; i++) {
            let attempts = 0;
            while (attempts < 8) {
                attempts++;
                const sx = x + (Math.random() - 0.5) * _SPAWNER_SPAWN_SPREAD * 2;
                const sz = z + (Math.random() - 0.5) * _SPAWNER_SPAWN_SPREAD * 2;
                const sy = y + Math.floor(Math.random() * 2);

                const floorId = getVoxel(Math.floor(sx), sy - 1, Math.floor(sz)) & 0xFF;
                const air1Id  = getVoxel(Math.floor(sx), sy,     Math.floor(sz)) & 0xFF;
                const air2Id  = getVoxel(Math.floor(sx), sy + 1, Math.floor(sz)) & 0xFF;

                const solidFloor = floorId !== 0 && !isFluidBlock(floorId) && !isCrossBlock(floorId);
                const hasSpace   = air1Id === 0 && air2Id === 0;

                const spawnLight = Math.max(
                    getSunLight(Math.floor(sx), sy, Math.floor(sz)) *
                        ((typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 1),
                    getTorchLight(Math.floor(sx), sy, Math.floor(sz))
                );

                if (solidFloor && hasSpace && spawnLight < _SPAWNER_LIGHT_BLOCK) {
                    if (typeof spawnMob === 'function') spawnMob('zombie', sx, sy, sz);
                    spawned++;
                    break;
                }
            }
        }

        // Burst particles only when at least one mob actually spawned
        if (spawned > 0) {
            _burstSpawnerParticles(x, y, z);
        }
    }
};