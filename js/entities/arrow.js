// ==========================================
// ARROW ENTITY & BOW SHOOTING
// ==========================================

const globalArrows = [];

// Arrow entity texture
let _arrowTexture = null;
let _arrowMaterial = null;

function _getArrowMaterial() {
    if (_arrowMaterial) return _arrowMaterial;
    _arrowTexture = new THREE.TextureLoader().load('textures/arrow_entity.png?v=' + ASSET_VERSION);
    _arrowTexture.magFilter = THREE.NearestFilter;
    _arrowTexture.minFilter = THREE.NearestFilter;
    _arrowMaterial = new THREE.MeshBasicMaterial({
        map: _arrowTexture, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide
    });
    return _arrowMaterial;
}

// Build a 3D arrow mesh from the arrow_entity.png texture (16x5 pixels)
// 1 pixel = 1/16 block, so arrow is 16/16 = 1 block long, 5/16 blocks wide/tall
// Two perpendicular planes in a + (plus) pattern along the length axis
// Tip of arrow points in -Z direction (local space)
function _buildArrowMesh() {
    const mat = _getArrowMaterial();
    const group = new THREE.Group();

    const arrowLen = 5 / 16;  // 0.3125 blocks
    const arrowW = 16 / 16;   // 1.0 blocks

    // Both planes offset so tip is at origin
    // Reset to center, then shift 8 pixels (8/16 = 0.5) on Y axis toward tip

    // Horizontal plane
    const geo1 = new THREE.PlaneGeometry(arrowW, arrowLen);
    geo1.rotateX(-Math.PI / 2);
    geo1.rotateZ(Math.PI / 2);
    geo1.rotateY(Math.PI / 2);
    geo1.rotateX(Math.PI / 2);
    geo1.translate(0, 8/16 - 16/16 + 6/16, -6/16);
    const mesh1 = new THREE.Mesh(geo1, mat);
    group.add(mesh1);

    // Vertical plane
    const geo2 = new THREE.PlaneGeometry(arrowW, arrowLen);
    geo2.rotateX(-Math.PI / 2);
    geo2.rotateZ(-Math.PI / 2);
    geo2.rotateX(Math.PI);
    geo2.rotateX(Math.PI / 2);
    geo2.translate(0, 8/16 - 16/16 + 6/16, -6/16);
    const mesh2 = new THREE.Mesh(geo2, mat);
    group.add(mesh2);

    // DEBUG: small pink cube at origin point (tip) — only visible when F3 is open
    const debugGeo = new THREE.BoxGeometry(2/16, 2/16, 2/16);
    const debugMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const debugCube = new THREE.Mesh(debugGeo, debugMat);
    debugCube.visible = false;
    group.add(debugCube);

    // DEBUG: axis lines - Red=X, Green=Y, Blue=Z — only visible when F3 is open
    const axisLen = 0.5;
    const xLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(axisLen,0,0)]),
        new THREE.LineBasicMaterial({ color: 0xff0000 })
    );
    xLine.visible = false;
    group.add(xLine);
    const yLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,axisLen,0)]),
        new THREE.LineBasicMaterial({ color: 0x00ff00 })
    );
    yLine.visible = false;
    group.add(yLine);
    const zLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,axisLen)]),
        new THREE.LineBasicMaterial({ color: 0x0000ff })
    );
    zLine.visible = false;
    group.add(zLine);

    // Store debug refs for toggling
    group._debugMeshes = [debugCube, xLine, yLine, zLine];

    return group;
}

class Arrow {
    constructor(x, y, z, vx, vy, vz, shooterIsPlayer) {
        this.x = x; this.y = y; this.z = z;
        this.vx = vx; this.vy = vy; this.vz = vz;
        this.shooterIsPlayer = shooterIsPlayer;
        this.age = 0;
        this.stuck = false;
        this.stuckTimer = 0;
        this.damage = 6; // MC bow base damage at full charge
        this.hasHit = false;

        this.mesh = _buildArrowMesh();
        this.mesh.position.set(x, y, z);
        scene.add(this.mesh);

        globalArrows.push(this);
    }

    update(dt) {
        this.age += dt;

        if (this.stuck) {
            this.stuckTimer += dt;
            if (this.stuckTimer > 120) {
                this._remove();
                return true;
            }
            return false;
        }

        // --- GRAVITY (MC uses 0.05 blocks/tick² = 20 blocks/s²) ---
        this.vy -= 20.0 * dt;

        // --- AIR DRAG (MC: multiply velocity by 0.99 per tick = ~60% per second) ---
        const drag = Math.pow(0.99, dt * 20); // 0.99^(ticks)
        this.vx *= drag;
        this.vy *= drag;
        this.vz *= drag;

        // Calculate next position
        const nx = this.x + this.vx * dt;
        const ny = this.y + this.vy * dt;
        const nz = this.z + this.vz * dt;

        // --- ORIENT MESH: point tip along velocity using lookAt ---
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy + this.vz*this.vz);
        if (speed > 0.01) {
            // The arrow mesh tip is at origin, body extends behind.
            // We want the mesh's -Z axis to point along velocity (tip forward).
            // lookAt points the mesh's -Z at the target, which is exactly what we need.
            const lookTarget = new THREE.Vector3(
                this.x + this.vx / speed,
                this.y + this.vy / speed,
                this.z + this.vz / speed
            );
            this.mesh.lookAt(lookTarget);
        }

        // --- MOB COLLISION (arrow disappears on hit) ---
        if (this.shooterIsPlayer && !this.hasHit) {
            for (const mob of globalMobs) {
                if (mob.dead || mob.dying) continue;
                const dx = mob.x - this.x;
                const dy = (mob.y + mob.height * 0.5) - this.y;
                const dz = mob.z - this.z;
                if (dx*dx + dy*dy + dz*dz < 0.6 * 0.6) {
                    mob.takeDamage(this.damage, this.x, this.z);
                    this.hasHit = true;
                    this._remove();
                    return true;
                }
            }
        }

        // --- PLAYER COLLISION (mob arrows) ---
        if (!this.shooterIsPlayer && !this.hasHit && !player._dead && gameMode === 'survival') {
            const dx = player.x - this.x;
            const dy = (player.y + player.eyeLevel * 0.5) - this.y;
            const dz = player.z - this.z;
            if (dx*dx + dy*dy + dz*dz < 0.6 * 0.6) {
                this.hasHit = true;
                window.applyPlayerDamage(this.damage);
                this._remove();
                return true;
            }
        }

        // --- BLOCK COLLISION (arrow sticks tip-first) ---
        const steps = Math.max(1, Math.ceil(speed * dt * 4));
        for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            const cx = Math.floor(this.x + (nx - this.x) * t);
            const cy = Math.floor(this.y + (ny - this.y) * t);
            const cz = Math.floor(this.z + (nz - this.z) * t);
            const bid = getVoxel(cx, cy, cz) & 0xFF;
            if (bid !== 0 && !isFluidBlock(bid) && !isCrossBlock(bid) && bid !== 17 && bid !== 23 && bid !== 64 && bid !== 66 && bid !== 90) {
                this.stuck = true;
                this.vx = 0; this.vy = 0; this.vz = 0;
                if (typeof window.playArrowHitSound === 'function') window.playArrowHitSound(this.x, this.y, this.z);
                return false;
            }
        }

        this.x = nx; this.y = ny; this.z = nz;
        this.mesh.position.set(this.x, this.y, this.z);

        // Toggle debug visuals based on F3 state
        if (this.mesh._debugMeshes) {
            const showDebug = !!window.showDebugScreen;
            for (const dm of this.mesh._debugMeshes) dm.visible = showDebug;
        }

        if (this.age > 120) {
            this._remove();
            return true;
        }
        return false;
    }

    _remove() {
        scene.remove(this.mesh);
        this.mesh.traverse(c => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
        const idx = globalArrows.indexOf(this);
        if (idx !== -1) globalArrows.splice(idx, 1);
    }
}

// Update all arrows
window.updateArrows = function(dt) {
    for (let i = globalArrows.length - 1; i >= 0; i--) {
        globalArrows[i].update(dt);
    }
};

// Shoot an arrow from the player's position
window.shootArrow = function() {
    console.log('[BOW] shootArrow called, gameMode=' + gameMode);
    if (!player || player._dead) return;

    // Check if player has arrows (id 165) in inventory
    if (gameMode === 'survival') {
        let hasArrow = false;
        for (let i = 0; i < inventory.length; i++) {
            if (inventory[i].id === 165 && inventory[i].count > 0) {
                inventory[i].count--;
                if (inventory[i].count <= 0) { inventory[i].id = 0; inventory[i].count = 0; }
                hasArrow = true;
                if (typeof buildUI === 'function') buildUI();
                break;
            }
        }
        if (!hasArrow) return;

        // Damage bow durability
        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
    }

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const spawnX = player.x + dir.x * 0.5;
    const spawnY = player.y + player.eyeLevel + dir.y * 0.5;
    const spawnZ = player.z + dir.z * 0.5;

    const arrowSpeed = 30.0; // MC arrow speed
    const vx = dir.x * arrowSpeed;
    const vy = dir.y * arrowSpeed;
    const vz = dir.z * arrowSpeed;

    new Arrow(spawnX, spawnY, spawnZ, vx, vy, vz, true);

    // Play bow shoot sound
    if (typeof window.playBowSound === 'function') window.playBowSound();
};
