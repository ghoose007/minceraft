// ==========================================
// PIG MOB & SHARED MOB HELPERS
// ==========================================

// ==========================================

// Check if a block is solid (blocks movement)
Mob.prototype._isSolid = function(bx, by, bz) {
    const id = getVoxel(bx, by, bz) & 0xFF;
    if (id === 0 || isFluidBlock(id) || isCrossBlock(id) || id === 17 || id === 23 || id === 64 || id === 66 || id === 90) return false;
    return true;
};

// Pure AABB collision test — same logic as checkCollision but does NOT
// modify inWater/inLava. Safe to call from separation/repel code.
Mob.prototype._testCollisionPure = function(x, y, z) {
    const w = this.width / 2;
    const mobAABB = {
        minX: x - w + 0.1, maxX: x + w - 0.1,
        minY: y, maxY: y + this.height - 0.1,
        minZ: z - w + 0.1, maxZ: z + w - 0.1
    };
    const sMinX = Math.floor(mobAABB.minX), sMaxX = Math.floor(mobAABB.maxX);
    const sMinY = Math.floor(mobAABB.minY), sMaxY = Math.floor(mobAABB.maxY);
    const sMinZ = Math.floor(mobAABB.minZ), sMaxZ = Math.floor(mobAABB.maxZ);
    for (let bx = sMinX; bx <= sMaxX; bx++) {
        for (let by = sMinY; by <= sMaxY; by++) {
            for (let bz = sMinZ; bz <= sMaxZ; bz++) {
                const val = getVoxel(bx, by, bz);
                const id = val & 0xFF;
                if (id === 0 || isFluidBlock(id) || isCrossBlock(id) || id === 17 || id === 23 || id === 64 || id === 66 || id === 90) continue;
                const b = getBlockBounds(id, val, bx, by, bz);
                const blockAABB = {
                    minX: bx + b.minX, maxX: bx + b.maxX,
                    minY: by + b.minY, maxY: by + b.maxY,
                    minZ: bz + b.minZ, maxZ: bz + b.maxZ
                };
                if (mobAABB.minX < blockAABB.maxX && mobAABB.maxX > blockAABB.minX &&
                    mobAABB.minY < blockAABB.maxY && mobAABB.maxY > blockAABB.minY &&
                    mobAABB.minZ < blockAABB.maxZ && mobAABB.maxZ > blockAABB.minZ) {
                    return true;
                }
            }
        }
    }
    return false;
};

// Apply standard mob physics: gravity, vertical collision, horizontal
// collision with wall sliding. Returns true if the mob should jump.
// NO auto step-up teleporting — mobs jump over blocks like real Minecraft.
Mob.prototype._applyPhysics = function(dt) {
    // --- Vertical ---
    if (this.inWater) {
        this.vy += 4.0 * dt;
        if (this.vy > 2.0) this.vy = 2.0;
    } else {
        this.vy -= 28.0 * dt;
    }
    if (this.vy < -20) this.vy = -20;

    let nextY = this.y + this.vy * dt;
    this.onGround = false;
    if (this.checkCollision(this.x, nextY, this.z)) {
        if (this.vy < 0) {
            this.onGround = true;
            nextY = Math.ceil(nextY);
        } else {
            nextY = Math.floor(this.y);
        }
        this.vy = 0;
    }
    this.y = nextY;

    // --- Horizontal ---
    let needsJump = false;
    const moveX = this.vx * dt;
    const moveZ = this.vz * dt;

    // Try combined XZ
    let nx = this.x + moveX;
    let nz = this.z + moveZ;
    if (!this.checkCollision(nx, this.y, nz)) {
        this.x = nx;
        this.z = nz;
    } else {
        // Wall slide: try each axis independently
        let blockedX = false, blockedZ = false;

        nx = this.x + moveX;
        if (Math.abs(moveX) > 0.0001) {
            if (!this.checkCollision(nx, this.y, this.z)) {
                this.x = nx;
            } else {
                blockedX = true;
            }
        }

        nz = this.z + moveZ;
        if (Math.abs(moveZ) > 0.0001) {
            if (!this.checkCollision(this.x, this.y, nz)) {
                this.z = nz;
            } else {
                blockedZ = true;
            }
        }

        // If blocked while on ground, check if it's a 1-block wall we can jump over
        if ((blockedX || blockedZ) && this.onGround) {
            // Only signal jump if the obstacle is jumpable (1 block high with clearance above)
            const headRoom = Math.ceil(this.height);
            const feetY = Math.floor(this.y);
            const w = this.width / 2;
            const probeMinX = Math.floor(this.x + Math.sin(this.yaw) * 0.5 - w);
            const probeMaxX = Math.floor(this.x + Math.sin(this.yaw) * 0.5 + w);
            const probeMinZ = Math.floor(this.z + Math.cos(this.yaw) * 0.5 - w);
            const probeMaxZ = Math.floor(this.z + Math.cos(this.yaw) * 0.5 + w);

            // Check if there's space 1 block up (above the wall) + head clearance
            let canJumpOver = true;
            for (let bx = probeMinX; bx <= probeMaxX && canJumpOver; bx++) {
                for (let bz = probeMinZ; bz <= probeMaxZ && canJumpOver; bz++) {
                    for (let h = 0; h < headRoom; h++) {
                        if (this._isSolid(bx, feetY + 1 + h, bz)) {
                            canJumpOver = false;
                        }
                    }
                }
            }
            if (canJumpOver) needsJump = true;
        }
    }

    // --- Water sound hooks ---
    // Splash when entering water (with cooldown to prevent bobbing spam)
    if (!this._splashCooldown) this._splashCooldown = 0;
    if (this._splashCooldown > 0) this._splashCooldown -= dt;
    
    if (this.inWater && !this._wasInWater && this._splashCooldown <= 0) {
        if (typeof window._soundMobWaterSplash === 'function') {
            window._soundMobWaterSplash(this, false);
        }
        this._splashCooldown = 2.0; // Don't splash again for 2 seconds
    }
    // Swim sound while moving in water
    if (this.inWater) {
        const moveDist = Math.sqrt(this.vx * this.vx + this.vz * this.vz) * dt;
        if (typeof window._soundMobSwim === 'function') window._soundMobSwim(this, moveDist);
    }
    this._wasInWater = this.inWater;

    return needsJump;
};

// Initialize/reset pathfinding state on a mob
Mob.prototype._initPathState = function() {
    this._path = null;        // Array of {x,y,z} waypoints or null
    this._pathIndex = 0;      // Current waypoint index
    this._pathTimer = 0;      // Timer to re-path
    this._pathCooldown = 0;   // Minimum time between re-paths
    this._jumpCooldown = 0;   // Prevent jump spam
    this._pendingJump = false; // Queued jump for next frame
    this._stuckTimer = 0;     // Detect being stuck
    this._lastPosX = this.x;
    this._lastPosZ = this.z;
};

// Follow the current A* path — sets vx/vz toward next waypoint.
// Returns true if the mob has reached the end of the path (or path is null).
Mob.prototype._followPath = function(speed, dt) {
    if (!this._path || this._pathIndex >= this._path.length) return true;

    const wp = this._path[this._pathIndex];
    const dx = wp.x - this.x;
    const dz = wp.z - this.z;
    const distSq = dx * dx + dz * dz;

    // Waypoint reached threshold (within 0.35 blocks)
    if (distSq < 0.35 * 0.35) {
        this._pathIndex++;
        if (this._pathIndex >= this._path.length) return true;
        // Recalculate toward next waypoint
        return this._followPath(speed, dt);
    }

    const dist = Math.sqrt(distSq);
    this.vx = (dx / dist) * speed;
    this.vz = (dz / dist) * speed;
    this.targetYaw = Math.atan2(dx, dz);

    return false;
};

// Stuck detection: if mob hasn't moved much over a time window, force re-path
Mob.prototype._checkStuck = function(dt, threshold = 1.5) {
    const movedX = this.x - this._lastPosX;
    const movedZ = this.z - this._lastPosZ;
    const movedSq = movedX * movedX + movedZ * movedZ;

    // Compare against expected movement over this dt
    if (movedSq < 0.02 * dt) {
        this._stuckTimer += dt;
    } else {
        this._stuckTimer = 0;
    }
    this._lastPosX = this.x;
    this._lastPosZ = this.z;

    return this._stuckTimer > threshold;
};

// Shared per-frame damage tick for lava, fire-block contact, and fall damage.
// Call this from each mob's update() after physics resolve.
function _tickMobEnvironmentDamage(mob, dt) {
    // ---- LAVA DAMAGE ----
    if (mob.inLava) {
        mob._fireDmgTimer += dt;
        if (mob._fireDmgTimer >= 0.5) {
            mob._fireDmgTimer -= 0.5;
            mob.takeDamage(4, mob.x, mob.z); // 4 HP per 0.5s = 8 DPS, same as player
        }
        if (mob.hurtTime <= 0) mob.material.color.setHex(0xff5500);
    } else {
        // ---- FIRE BLOCK DAMAGE ----
        const fbx = Math.floor(mob.x);
        const fbz = Math.floor(mob.z);
        const fby = Math.floor(mob.y);
        const standingOnFire = (getVoxel(fbx, fby - 1, fbz) & 0xFF) === 89 ||
                               (getVoxel(fbx, fby,     fbz) & 0xFF) === 89;
        if (standingOnFire) {
            mob._fireDmgTimer += dt;
            if (mob._fireDmgTimer >= 0.5) {
                mob._fireDmgTimer -= 0.5;
                mob.takeDamage(1, mob.x, mob.z);
            }
            if (mob.hurtTime <= 0) mob.material.color.setHex(0xff8800);
        } else {
            mob._fireDmgTimer = 0;
        }
    }

    // ---- FALL DAMAGE ----
    // Track highest Y while airborne
    if (!mob.onGround) {
        if (mob.y > mob.highestY) mob.highestY = mob.y;
    } else {
        const fallDist = mob.highestY - mob.y;
        if (fallDist > 3.0 && !mob.inWater && !mob.inLava) {
            const dmg = Math.ceil(fallDist - 3.0);
            mob.takeDamage(dmg, mob.x, mob.z);
        }
        mob.highestY = mob.y;
    }
}

// ---- FIRE MESH HELPER (shared, same as zombie's _updateFireMeshes) ----
function _updateMobFireMeshes(mob, isOnFire) {
    if (!mob._fireMeshes) mob._fireMeshes = [];
    if (!isOnFire) {
        for (const fm of mob._fireMeshes) {
            mob.mesh.remove(fm);
            if (fm.geometry) fm.geometry.dispose();
            if (fm.material) fm.material.dispose();
        }
        mob._fireMeshes = [];
        return;
    }
    if (!window.fireMaterial || mob._fireMeshes.length > 0) return;
    const positions = [
        { x: 0,     z:  0.35, ry: 0 },
        { x: 0,     z: -0.35, ry: 0 },
        { x:  0.35, z: 0,     ry: Math.PI / 2 },
        { x: -0.35, z: 0,     ry: Math.PI / 2 },
    ];
    const fireH = mob.height;
    for (const pos of positions) {
        const geo = new THREE.PlaneGeometry(0.9, fireH);
        const mat = window.fireMaterial.clone();
        mat.uniforms = THREE.UniformsUtils.clone(window.fireMaterial.uniforms);
        mat.uniforms.uTexture = window.fireMaterial.uniforms.uTexture;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = false;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, fireH / 2, pos.z);
        mesh.rotation.y = pos.ry;
        mesh.renderOrder = 10;
        mob._fireMeshes.push(mesh);
        mob.mesh.add(mesh);
    }
}

function _tickMobFireMeshes(mob, isOnFire) {
    _updateMobFireMeshes(mob, isOnFire);
    if (isOnFire && mob._fireMeshes) {
        const t = (typeof globalTime !== 'undefined') ? globalTime : 0;
        for (const fm of mob._fireMeshes) {
            if (fm.material && fm.material.uniforms) fm.material.uniforms.uTime.value = t;
        }
    }
}

class Pig extends Mob {
    constructor(x, y, z) {
        super(x, y, z);
        
        this.headGroup = new THREE.Group();
        
        const headGeo = createMobBox(8, 8, 8, 0, 0);
        headGeo.translate(0, 0, 4/16); 
        this.head = new THREE.Mesh(headGeo, this.material);
        this.headGroup.add(this.head);
        
        const snoutGeo = createMobBox(4, 3, 1, 16, 16);
        snoutGeo.translate(0, -1.5/16, 8.5/16); 
        this.snout = new THREE.Mesh(snoutGeo, this.material);
        this.headGroup.add(this.snout);
        
        this.headGroup.position.set(0, 12/16, 6/16);
        this.mesh.add(this.headGroup);
        
        const bodyGeo = createMobBox(10, 16, 8, 28, 8);
        this.body = new THREE.Mesh(bodyGeo, this.material);
        this.body.rotation.x = Math.PI / 2;
        this.body.position.set(0, 10/16, 0); 
        this.mesh.add(this.body);
        
        const legGeo = createMobBox(4, 6, 4, 0, 16);
        legGeo.translate(0, -3/16, 0); 
        
        this.leg1 = new THREE.Mesh(legGeo, this.material); 
        this.leg1.position.set(3/16, 6/16, 5/16);
        this.leg2 = new THREE.Mesh(legGeo, this.material); 
        this.leg2.position.set(-3/16, 6/16, 5/16);
        this.leg3 = new THREE.Mesh(legGeo, this.material); 
        this.leg3.position.set(3/16, 6/16, -5/16);
        this.leg4 = new THREE.Mesh(legGeo, this.material); 
        this.leg4.position.set(-3/16, 6/16, -5/16);
        
        this.mesh.add(this.leg1); this.mesh.add(this.leg2);
        this.mesh.add(this.leg3); this.mesh.add(this.leg4);
    }

    // --- OVERRIDE GENERIC FOOTSTEPS WITH CUSTOM PIG STEPS ---
    _tickFootstep() {
        if (this._lastStepX === undefined) {
            this._lastStepX = this.x;
            this._lastStepZ = this.z;
            this._stepDistAccum = 0;
        }
        if (!this.onGround || this.dead || this.dying) {
            this._stepDistAccum = 0;
            this._lastStepX = this.x;
            this._lastStepZ = this.z;
            return;
        }
        const dx = this.x - this._lastStepX;
        const dz = this.z - this._lastStepZ;
        this._lastStepX = this.x;
        this._lastStepZ = this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2.0 || dist < 0.001) return;
        this._stepDistAccum += dist;
        const STEP_DISTANCE = 1.3; // Pigs take shorter/more frequent steps than player
        if (this._stepDistAccum >= STEP_DISTANCE) {
            this._stepDistAccum -= STEP_DISTANCE;
            if (this._stepDistAccum > STEP_DISTANCE) this._stepDistAccum = 0;
            if (typeof window.playMobSound === 'function') {
                window.playMobSound('pig', 'step', this.x, this.y, this.z, 0.15); // soft footsteps
            }
        }
    }
    
    update(dt) {
        if (this.dead) {
            scene.remove(this.mesh);
            scene.remove(this.shadow);
            this.mesh.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
            if (this.material) this.material.dispose();
            const idx = globalMobs.indexOf(this);
            if (idx !== -1) globalMobs.splice(idx, 1);
            return;
        }

        if (this.dying) {
            this.deathTimer -= dt;
            this.mesh.rotation.z += (Math.PI / 2 - this.mesh.rotation.z) * dt * 5.0;
            this.material.opacity = Math.max(0, this.deathTimer);
            if (this.deathTimer <= 0) {
                this.dead = true;
                if (typeof window.spawnSmoke === 'function') {
                    for(let i = 0; i < 8; i++) {
                        window.spawnSmoke(this.x + (Math.random() - 0.5) * 0.8, this.y + 0.5 + Math.random() * 0.5, this.z + (Math.random() - 0.5) * 0.8);
                    }
                }
                const dropCount = 1 + Math.floor(Math.random() * 3);
                if (typeof spawnDroppedItem === 'function') spawnDroppedItem(this.x, this.y + 0.5, this.z, 122, dropCount);
                return;
            }
            this.vy -= 28.0 * dt;
            let nextY = this.y + this.vy * dt;
            if (this.checkCollision(this.x, nextY, this.z)) { if (this.vy < 0) nextY = this.getFloorY(this.x, nextY, this.z); this.vy = 0; }
            this.y = nextY;
            this.mesh.position.set(this.x, this.y, this.z);
            return;
        }

        if (this.hurtTime > 0) { this.hurtTime -= dt; if (this.hurtTime <= 0) this.material.color.setHex(0xffffff); }

        // --- AMBIENT SOUNDS ---
        if (this._ambientTimer === undefined) this._ambientTimer = 2.0 + Math.random() * 4.0;
        this._ambientTimer -= dt;
        if (this._ambientTimer <= 0) {
            this._ambientTimer = 5.0 + Math.random() * 10.0;
            if (typeof window.playMobSound === 'function') {
                window.playMobSound('pig', 'say', this.x, this.y, this.z, 0.45);
            }
        }

        // --- INIT PATH STATE ONCE ---
        if (this._stuckTimer === undefined) this._initPathState();

        // --- AI STATE MACHINE ---
        this.timer -= dt;

        // Panic state: pig was attacked, flee from attacker
        if (this.state === 'panic') {
            if (this.timer <= 0) {
                // Panic over, return to normal
                this.state = 'idle';
                this.timer = 2.0 + Math.random() * 2.0;
            } else {
                // Run away from last attacker position
                const fleeSpeed = 4.5; // Much faster than normal wander
                const fleeDx = this.x - (this._panicSourceX || this.x);
                const fleeDz = this.z - (this._panicSourceZ || this.z);
                const fleeDist = Math.sqrt(fleeDx * fleeDx + fleeDz * fleeDz) || 1;
                // Flee direction with some random wobble for natural look
                const fleeAngle = Math.atan2(fleeDx, fleeDz) + (Math.sin(globalTime * 8) * 0.3);
                this.targetYaw = fleeAngle;
                this.vx = Math.sin(fleeAngle) * fleeSpeed;
                this.vz = Math.cos(fleeAngle) * fleeSpeed;
                // If fleeing into danger, pick random perpendicular direction
                if (this.onGround && _mobStepIsDangerous(this, this.vx, this.vz)) {
                    const sideAngle = fleeAngle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
                    this.targetYaw = sideAngle;
                    this.vx = Math.sin(sideAngle) * fleeSpeed;
                    this.vz = Math.cos(sideAngle) * fleeSpeed;
                }
            }
        } else if (this.timer <= 0) {
            if (Math.random() < 0.5) {
                this.state = 'idle';
                this.timer = 2.0 + Math.random() * 4.0;
                this.targetYaw = this.yaw + (Math.random() - 0.5) * Math.PI;
            } else {
                this.state = 'wander';
                this.timer = 3.0 + Math.random() * 5.0;
                this.targetYaw = this.yaw + (Math.random() - 0.5) * Math.PI * 2;
                this._stuckTimer = 0;
            }
        }

        // Smooth yaw turning (faster during panic for snappy flee)
        let diff = this.targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * dt * (this.state === 'panic' ? 6.0 : 2.0);

        let speed = 0;
        if (this.state === 'wander') {
            speed = 2.0;
            const vxC = Math.sin(this.yaw) * speed;
            const vzC = Math.cos(this.yaw) * speed;
            if (this.onGround && (_mobStepIsDangerous(this, vxC, vzC) || _mobWallAhead(this, vxC, vzC))) {
                this.state = 'idle';
                this.timer = 1.0 + Math.random() * 1.5;
                this.targetYaw = this.yaw + Math.PI + (Math.random() - 0.5) * Math.PI;
                this.vx *= 0.1; this.vz *= 0.1;
            } else {
                this.vx = vxC;
                this.vz = vzC;
            }
            // Stuck detection — if not moving, pick new direction
            if (this._checkStuck(dt, 1.2)) {
                this._stuckTimer = 0;
                this.targetYaw = this.yaw + Math.PI * (0.5 + Math.random());
                this.timer = Math.min(this.timer, 0.5);
            }
        } else if (this.state !== 'panic') {
            // Idle friction — but NOT during panic (panic sets vx/vz directly above)
            this.vx *= Math.exp(-10 * dt);
            this.vz *= Math.exp(-10 * dt);
        }

        // Water particles
        if (this.inWater && Math.random() < 0.15) window.spawnWaterSplash(this.x, this.y, this.z);

        // --- PHYSICS ---
        // Apply pending jump BEFORE physics so vertical pass lifts the mob this frame
        if (this._pendingJump) {
            this.vy = 8.2;
            this.onGround = false;
            this._pendingJump = false;
        }
        const needsJump = this._applyPhysics(dt);
        if (needsJump && this.onGround && (this.state === 'wander' || this.state === 'panic') && this._jumpCooldown <= 0) {
            // Don't jump immediately — defer to next frame so vertical pass runs first
            this._pendingJump = true;
            this._jumpCooldown = 0.4;
        }
        if (this._jumpCooldown > 0) this._jumpCooldown -= dt;

        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.yaw;
        
        // Use custom pig footstep logic
        this._tickFootstep();

        // --- ANIMATIONS ---
        if (this.state === 'idle') {
            this.walkCycle = 0;
            this.leg1.rotation.x += (0 - this.leg1.rotation.x) * dt * 10.0;
            this.leg2.rotation.x += (0 - this.leg2.rotation.x) * dt * 10.0;
            this.leg3.rotation.x += (0 - this.leg3.rotation.x) * dt * 10.0;
            this.leg4.rotation.x += (0 - this.leg4.rotation.x) * dt * 10.0;
            const dx = player.x - this.x;
            const dy = (player.y + player.eyeLevel) - (this.y + 12/16);
            const dz = player.z - this.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            if (distSq < 64) {
                const targetYaw = Math.atan2(dx, dz);
                let headYaw = targetYaw - this.yaw;
                while(headYaw > Math.PI) headYaw -= Math.PI * 2;
                while(headYaw < -Math.PI) headYaw += Math.PI * 2;
                headYaw = Math.max(-1.2, Math.min(1.2, headYaw));
                const distXZ = Math.sqrt(dx*dx + dz*dz);
                let headPitch = Math.atan2(-dy, distXZ);
                headPitch = Math.max(-0.8, Math.min(0.8, headPitch));
                this.headGroup.rotation.y += (headYaw - this.headGroup.rotation.y) * dt * 5.0;
                this.headGroup.rotation.x += (headPitch - this.headGroup.rotation.x) * dt * 5.0;
                if (Math.abs(headYaw) > 0.8 && Math.random() < 0.02) this.targetYaw = targetYaw;
            } else {
                const idleYaw = Math.sin(globalTime * 1.5) * 0.3;
                const idlePitch = Math.sin(globalTime * 1.0) * 0.2;
                this.headGroup.rotation.y += (idleYaw - this.headGroup.rotation.y) * dt * 5.0;
                this.headGroup.rotation.x += (idlePitch - this.headGroup.rotation.x) * dt * 5.0;
            }
        } else {
            this.headGroup.rotation.y += (0 - this.headGroup.rotation.y) * dt * 5.0;
            this.headGroup.rotation.x += (0 - this.headGroup.rotation.x) * dt * 5.0;
            const legSpeed = this.state === 'panic' ? 18.0 : 10.0;
            this.walkCycle += dt * legSpeed;
            const legRot = Math.sin(this.walkCycle) * 0.8;
            this.leg1.rotation.x = legRot; this.leg4.rotation.x = legRot;
            this.leg2.rotation.x = -legRot; this.leg3.rotation.x = -legRot;
        }

        _tickMobEnvironmentDamage(this, dt);
        const pigOnFire = this.inLava || (getVoxel(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) & 0xFF) === 89;
        _tickMobFireMeshes(this, pigOnFire);
        this.updateLighting();
    }
}

// Override Pig takeDamage to trigger panic flee AND trigger death/hurt sounds
Pig.prototype.takeDamage = function(amount, sourceX, sourceZ) {
    const wasDead = this.dying || this.dead;
    Mob.prototype.takeDamage.call(this, amount, sourceX, sourceZ);
    
    // Check if the hit killed the pig
    if (!wasDead && (this.dying || this.dead)) {
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('pig', 'death', this.x, this.y, this.z, 0.6);
        }
    } else if (!this.dying && !this.dead) {
        // Pig survived: Panic flee behavior
        this.state = 'panic';
        this.timer = 2.0 + Math.random() * 1.5; // 2-3.5 seconds of fleeing
        this._panicSourceX = sourceX;
        this._panicSourceZ = sourceZ;
        
        // Squeal when hurt!
        if (typeof window.playMobSound === 'function') {
            // Slightly higher pitch for hurt say
            window.playMobSound('pig', 'say', this.x, this.y, this.z, 0.5, 1.1, 1.3);
        }
    }
};