// ==========================================
// CREEPER MOB
// ==========================================
// Hostile mob. Chases player, ignites within 2 blocks, explodes after 1.5s fuse.
// If player moves away during fuse, cancels and resumes chasing.
// 64x32 texture: head 8x8x8 at (0,0), body 8x12x4 at (16,16), leg 4x6x4 at (0,16)

let creeperMaterial = null;

function initCreeperMaterial() {
    if (creeperMaterial) return;
    const tex = new THREE.TextureLoader().load('textures/creeper.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    creeperMaterial = new THREE.MeshBasicMaterial({
        map: tex, vertexColors: true, side: THREE.FrontSide, alphaTest: 0.1, transparent: true
    });
    if (typeof injectLightingShader === 'function') injectLightingShader(creeperMaterial);
    creeperMaterial.customProgramCacheKey = function() { return 'creeperMat'; };
}

class Creeper extends Mob {
    constructor(x, y, z) {
        super(x, y, z);
        this.width = 0.6;
        this.height = 1.7;
        this.health = 20;

        this.isAggro = false;
        this.attackTimer = 0;
        this.burningTimer = 0;

        // Fuse state
        this.ignited = false;
        this.fuseTime = 0;
        this.FUSE_DURATION = 1.5; // seconds
        this._fuseStarted = false;
        this._baseScale = 1.0;

        initCreeperMaterial();
        if (this.material) this.material.dispose();
        this.material = creeperMaterial.clone();
        if (typeof injectLightingShader === 'function') injectLightingShader(this.material);
        this.material.customProgramCacheKey = function() { return 'creeperMatInst'; };

        const M = this.material;
        const TEX_W = 64, TEX_H = 32;

        // --- HEAD (8x8x8) at UV(0,0) ---
        this.headGroup = new THREE.Group();
        const headGeo = createMobBox(8, 8, 8, 0, 0, TEX_W, TEX_H);
        const headMesh = new THREE.Mesh(headGeo, M);
        headMesh.position.set(0, 4/16, 0);
        this.headGroup.add(headMesh);
        this.headGroup.position.set(0, 18/16, 0);
        this.mesh.add(this.headGroup);

        // --- BODY (8w x 12h x 4d) at UV(16,16) ---
        const bodyGeo = createMobBox(8, 12, 4, 16, 16, TEX_W, TEX_H);
        const bodyMesh = new THREE.Mesh(bodyGeo, M);
        bodyMesh.position.set(0, 12/16, 0);
        this.mesh.add(bodyMesh);

        // --- 4 LEGS (4x6x4) at UV(0,16) ---
        // Creeper has 4 short legs (not 2 like humanoids)
        const legGeo = createMobBox(4, 6, 4, 0, 16, TEX_W, TEX_H);
        legGeo.translate(0, -3/16, 0);

        this.legFR = new THREE.Mesh(legGeo, M);
        this.legFR.position.set(-2/16, 6/16, 3/16);
        this.legFL = new THREE.Mesh(legGeo, M);
        this.legFL.position.set(2/16, 6/16, 3/16);
        this.legBR = new THREE.Mesh(legGeo, M);
        this.legBR.position.set(-2/16, 6/16, -3/16);
        this.legBL = new THREE.Mesh(legGeo, M);
        this.legBL.position.set(2/16, 6/16, -3/16);

        this.mesh.add(this.legFR); this.mesh.add(this.legFL);
        this.mesh.add(this.legBR); this.mesh.add(this.legBL);
    }

    // Creeper uses player footstep sounds at 50% volume
    _tickFootstep() {
        if (this._lastStepX === undefined) { this._lastStepX = this.x; this._lastStepZ = this.z; this._stepDistAccum = 0; }
        if (!this.onGround || this.dead || this.dying) { this._stepDistAccum = 0; this._lastStepX = this.x; this._lastStepZ = this.z; return; }
        const dx = this.x - this._lastStepX, dz = this.z - this._lastStepZ;
        this._lastStepX = this.x; this._lastStepZ = this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2.0 || dist < 0.001) return;
        this._stepDistAccum += dist;
        if (this._stepDistAccum >= 1.5) {
            this._stepDistAccum -= 1.5;
            // Use the block-based footstep at 50% volume
            const floorId = getVoxel(Math.floor(this.x), Math.floor(this.y) - 1, Math.floor(this.z)) & 0xFF;
            if (typeof window.playBlockSoundAt === 'function') {
                window.playBlockSoundAt(floorId || 1, 'step', 0.08, this.x, this.y, this.z);
            }
        }
    }

    _tickDying(dt) {
        this.deathTimer -= dt;
        this.mesh.rotation.z += (Math.PI / 2 - this.mesh.rotation.z) * dt * 5.0;
        this.material.transparent = true;
        this.material.opacity = Math.max(0, this.deathTimer);
        this.vy -= 28.0 * dt;
        let nextY = this.y + this.vy * dt;
        const savedHeight = this.height;
        this.height = 0.5;
        if (this.checkCollision(this.x, nextY, this.z)) { if (this.vy < 0) nextY = this.getFloorY(this.x, nextY, this.z); this.vy = 0; }
        this.height = savedHeight;
        this.y = nextY;
        this.mesh.position.set(this.x, this.y, this.z);
        if (this.deathTimer <= 0) {
            this.dead = true;
            if (typeof window.spawnSmoke === 'function') {
                for (let i = 0; i < 8; i++) window.spawnSmoke(this.x+(Math.random()-0.5)*0.8, this.y+0.9+Math.random()*0.6, this.z+(Math.random()-0.5)*0.8);
            }
            if (Math.random() < 0.33 && typeof window.spawnDroppedItem === 'function') {
                window.spawnDroppedItem(this.x, this.y + 0.5, this.z, 65, 1); // Gunpowder = TNT for now
            }
            if (typeof window.spawnMobDeathXP === 'function') window.spawnMobDeathXP(this.x, this.y, this.z, 'creeper');
        }
    }

    _explode() {
        // Creeper explosion: radius 3, same as TNT but slightly smaller
        if (typeof window.explodeTNT === 'function') {
            window.explodeTNT(this.x, this.y + 0.5, this.z, 3);
        }
        // Kill the creeper
        this.dead = true;
        scene.remove(this.mesh); scene.remove(this.shadow);
        this.mesh.traverse(c => { if (c.isMesh) c.geometry.dispose(); });
        if (this.material) this.material.dispose();
        const idx = globalMobs.indexOf(this);
        if (idx !== -1) globalMobs.splice(idx, 1);
    }

    update(dt) {
        if (this.dead) {
            if (this._fireMeshes) { for (const fm of this._fireMeshes) { this.mesh.remove(fm); if (fm.geometry) fm.geometry.dispose(); if (fm.material) fm.material.dispose(); } this._fireMeshes = []; }
            scene.remove(this.mesh); scene.remove(this.shadow);
            this.mesh.traverse(c => { if (c.isMesh) c.geometry.dispose(); });
            if (this.material) this.material.dispose();
            const idx = globalMobs.indexOf(this); if (idx !== -1) globalMobs.splice(idx, 1);
            return;
        }
        if (this.dying) { this._tickDying(dt); return; }
        if (this.hurtTime > 0) { this.hurtTime -= dt; if (this.hurtTime <= 0) this.material.color.setHex(0xffffff); }

        // Creepers do NOT burn in sunlight (unlike zombies/skeletons)
        const isVisiblyOnFire = this.inLava || (getVoxel(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) & 0xFF) === 89;
        _tickMobFireMeshes(this, isVisiblyOnFire);
        _tickMobEnvironmentDamage(this, dt);

        const sunLevel = (typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 0;
        const dx = player.x - this.x;
        const dy = (player.y + 0.9) - (this.y + this.height * 0.5);
        const dz = player.z - this.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const distXZ = Math.sqrt(dx*dx + dz*dz);

        const detectRange = (sunLevel > 0.5) ? 16 : 40;
        const canAggro = !player._dead && gameMode !== 'creative';
        const hasLOS = checkLineOfSight(this.x, this.y+1.4, this.z, player.x, player.y+1.6, player.z);

        // Aggro logic
        if (canAggro && distSq < detectRange*detectRange && hasLOS) {
            this.isAggro = true;
            this._lostSightTimer = 5.0;
        } else if (this.isAggro) {
            if (!this._lostSightTimer) this._lostSightTimer = 5.0;
            this._lostSightTimer -= dt;
            if (this._lostSightTimer <= 0) this.isAggro = false;
        }
        if (distSq > 64*64) this.isAggro = false;

        if (this._stuckTimer === undefined) this._initPathState();

        const CREEPER_SPEED = 2.0;
        const IGNITE_RANGE = 2.5;
        const CANCEL_RANGE = 3.5;

        // --- FUSE / IGNITION LOGIC ---
        if (this.ignited) {
            this.fuseTime += dt;
            // White flash effect: lerp material color toward white
            const fuseProgress = Math.min(this.fuseTime / this.FUSE_DURATION, 1.0);
            const flash = Math.sin(fuseProgress * Math.PI * 8) * 0.5 + 0.5; // Pulsing
            const white = 1.0 + fuseProgress * 1.5;
            this.material.color.setRGB(white, white, white);
            // Scale up slightly
            const scale = 1.0 + fuseProgress * 0.15;
            this.mesh.scale.set(scale, scale, scale);

            // Cancel if player moves away
            if (distXZ > CANCEL_RANGE || !canAggro || player._dead) {
                this.ignited = false;
                this.fuseTime = 0;
                this._fuseStarted = false;
                this.material.color.setHex(0xffffff);
                this.mesh.scale.set(1, 1, 1);
            }

            // Explode when fuse runs out
            if (this.fuseTime >= this.FUSE_DURATION) {
                this._explode();
                return;
            }

            // Stand still while ignited
            this.vx *= Math.exp(-12 * dt);
            this.vz *= Math.exp(-12 * dt);
        } else if (this.isAggro && canAggro && !player._dead) {
            // Chase player
            this.state = 'wander';

            if (distXZ > IGNITE_RANGE) {
                // Move toward player
                this._pathTimer += dt;
                if (this._pathCooldown > 0) this._pathCooldown -= dt;
                const needsRepath = !this._path || this._pathIndex >= this._path.length || this._pathTimer > 1.0 || this._checkStuck(dt, 0.8);
                if (needsRepath && this._pathCooldown <= 0) {
                    this._path = findPath(this.x, this.y, this.z, player.x, player.y, player.z, this.height, 300);
                    this._pathIndex = 0; this._pathTimer = 0; this._pathCooldown = 0.3; this._stuckTimer = 0;
                }
                const pathDone = this._followPath(CREEPER_SPEED, dt);
                if (pathDone) {
                    const angle = Math.atan2(dx, dz);
                    this.vx = Math.sin(angle) * CREEPER_SPEED;
                    this.vz = Math.cos(angle) * CREEPER_SPEED;
                    this.targetYaw = angle;
                }
            } else {
                // Within ignite range — start fuse!
                if (!this.ignited) {
                    this.ignited = true;
                    this.fuseTime = 0;
                    this._fuseStarted = true;
                    // Play fuse sound
                    if (typeof window.playFuseSound === 'function') window.playFuseSound(this.x, this.y, this.z);
                }
                this.vx *= Math.exp(-12 * dt);
                this.vz *= Math.exp(-12 * dt);
            }

            const angle = Math.atan2(dx, dz);
            this.targetYaw = this._path && this._pathIndex < this._path.length ? this.targetYaw : angle;
            let headYaw = angle - this.yaw;
            while (headYaw > Math.PI) headYaw -= Math.PI * 2;
            while (headYaw < -Math.PI) headYaw += Math.PI * 2;
            headYaw = Math.max(-0.8, Math.min(0.8, headYaw));
            let headPitch = Math.atan2(-dy, Math.max(0.1, distXZ));
            headPitch = Math.max(-0.8, Math.min(0.8, headPitch));
            this.headGroup.rotation.y += (headYaw - this.headGroup.rotation.y) * dt * 8;
            this.headGroup.rotation.x += (headPitch - this.headGroup.rotation.x) * dt * 8;
        } else {
            // Passive wander
            this._path = null;
            this.timer -= dt;
            if (this.timer <= 0) {
                if (Math.random() < 0.4) { this.state = 'idle'; this.timer = 2 + Math.random() * 3; }
                else { this.state = 'wander'; this.timer = 3 + Math.random() * 4; this.targetYaw = this.yaw + (Math.random()-0.5) * Math.PI * 2; }
            }
            if (this.state === 'wander') {
                const vxC = Math.sin(this.yaw) * CREEPER_SPEED * 0.5;
                const vzC = Math.cos(this.yaw) * CREEPER_SPEED * 0.5;
                if (this.onGround && _mobStepIsDangerous(this, vxC, vzC) || _mobWallAhead(this, vxC, vzC)) {
                    this.state = 'idle'; this.timer = 1 + Math.random()*1.5;
                    this.targetYaw = this.yaw + Math.PI + (Math.random()-0.5)*Math.PI;
                    this.vx *= 0.1; this.vz *= 0.1;
                } else { this.vx = vxC; this.vz = vzC; }
                if (this._checkStuck(dt, 1.5)) { this._stuckTimer = 0; this.targetYaw = this.yaw + Math.PI*(0.5+Math.random()); this.timer = Math.min(this.timer, 0.5); }
            } else { this.vx *= Math.exp(-8*dt); this.vz *= Math.exp(-8*dt); }

            const idleYaw = Math.sin(globalTime * 1.2) * 0.25;
            const idlePitch = Math.sin(globalTime * 0.8) * 0.15;
            this.headGroup.rotation.y += (idleYaw - this.headGroup.rotation.y) * dt * 4;
            this.headGroup.rotation.x += (idlePitch - this.headGroup.rotation.x) * dt * 4;
        }

        // Yaw interpolation
        let diff = this.targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * dt * 3.5;

        // Physics
        if (this._pendingJump) { this.vy = 8.2; this.onGround = false; this._pendingJump = false; }
        const needsJump = this._applyPhysics(dt);
        if (needsJump && this.onGround && this._jumpCooldown <= 0) { this._pendingJump = true; this._jumpCooldown = 0.4; }
        if (this._jumpCooldown > 0) this._jumpCooldown -= dt;

        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.yaw;
        this._tickFootstep();

        // Leg animation (4-legged walk — diagonal pairs like MC quadrupeds)
        const speed = Math.sqrt(this.vx*this.vx + this.vz*this.vz);
        const isMoving = speed > 0.15;
        this.walkCycle += dt * (isMoving ? 6.0 : 0);
        if (isMoving) {
            const swing = Math.sin(this.walkCycle) * 0.6;
            // Diagonal pairs: FR+BL together, FL+BR together
            this.legFR.rotation.x += (swing - this.legFR.rotation.x) * dt * 12;
            this.legBL.rotation.x += (swing - this.legBL.rotation.x) * dt * 12;
            this.legFL.rotation.x += (-swing - this.legFL.rotation.x) * dt * 12;
            this.legBR.rotation.x += (-swing - this.legBR.rotation.x) * dt * 12;
        } else {
            this.legFR.rotation.x += (0 - this.legFR.rotation.x) * dt * 8;
            this.legFL.rotation.x += (0 - this.legFL.rotation.x) * dt * 8;
            this.legBR.rotation.x += (0 - this.legBR.rotation.x) * dt * 8;
            this.legBL.rotation.x += (0 - this.legBL.rotation.x) * dt * 8;
        }

        // Separation
        let sepX = 0, sepZ = 0;
        for (let j = 0; j < globalMobs.length; j++) {
            const other = globalMobs[j]; if (other === this || other.dead || other.dying) continue;
            const rdx = this.x - other.x, rdz = this.z - other.z;
            const dSq = rdx*rdx + rdz*rdz;
            if (dSq < 0.65*0.65 && dSq > 0.0001) {
                const d = Math.sqrt(dSq);
                const push = Math.min(0.025, (0.65-d)*0.3);
                sepX += (rdx/d)*push; sepZ += (rdz/d)*push;
            }
        }
        if (Math.abs(sepX) > 0.0001 && !this._testCollisionPure(this.x+sepX, this.y, this.z)) this.x += sepX;
        if (Math.abs(sepZ) > 0.0001 && !this._testCollisionPure(this.x, this.y, this.z+sepZ)) this.z += sepZ;

        this.updateLighting();
    }
}

Creeper.prototype.takeDamage = function(amount, sourceX, sourceZ, isFireDamage, kbDirX, kbDirZ) {
    if (this.hurtTime > 0 || this.dying || this.dead) return;
    this.health -= amount;
    this.hurtTime = 0.5;
    if (this.health <= 0) {
        // Cancel fuse if dying
        this.ignited = false; this.fuseTime = 0;
        this.material.color.setHex(0xffffff);
        this.mesh.scale.set(1, 1, 1);
        this.dying = true; this.deathTimer = 1.0;
        if (typeof window.playMobSound === 'function') window.playMobSound('creeper', 'death', this.x, this.y, this.z, 0.75);
    } else {
        if (typeof window.playMobSound === 'function') window.playMobSound('creeper', 'hurt', this.x, this.y, this.z, 0.75);
    }
    if (!isFireDamage) {
        this.material.color.setHex(0xff7777);
        this.applyKnockback(sourceX, sourceZ, 7.0, 2.2, kbDirX, kbDirZ);
        this.isAggro = true;
    } else { this.material.color.setHex(0xff8844); }
};
