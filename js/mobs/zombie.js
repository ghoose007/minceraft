// ==========================================
// ZOMBIE MOB
// ==========================================

// ==========================================

let zombieMaterial = null;

function initZombieMaterial() {
    if (zombieMaterial) return;
    const tex = new THREE.TextureLoader().load('textures/zombie.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    zombieMaterial = new THREE.MeshBasicMaterial({
        map: tex,
        vertexColors: true,
        side: THREE.FrontSide,
        alphaTest: 0.1,
        transparent: false
    });
    if (typeof injectLightingShader === 'function') injectLightingShader(zombieMaterial);
    zombieMaterial.customProgramCacheKey = function() { return 'zombieMat'; };
}

class Zombie extends Mob {
    constructor(x, y, z) {
        super(x, y, z);

        this.width  = 0.6;   
        this.height = 1.8;   
        this.health = 20;

        this.aggroTarget  = null;
        this.attackTimer  = 0;
        this.isAggro      = false;
        this.burningTimer = 0;

        initZombieMaterial();
        if (this.material) this.material.dispose(); 
        this.material = zombieMaterial.clone();
        if (typeof injectLightingShader === 'function') injectLightingShader(this.material);
        this.material.customProgramCacheKey = function() { return 'zombieMatInst'; };

        const M = this.material;
        const TEX_W = 64, TEX_H = 32;

        this.rightLegPivot = new THREE.Group();
        const rLegGeo = createMobBox(4, 12, 4, 0, 16, TEX_W, TEX_H);
        const rLegMesh = new THREE.Mesh(rLegGeo, M);
        rLegMesh.position.set(0, -6/16, 0);
        this.rightLegPivot.add(rLegMesh);
        this.rightLegPivot.position.set(-2/16, 12/16, 0);
        this.mesh.add(this.rightLegPivot);

        this.leftLegPivot = new THREE.Group();
        const lLegGeo = createMobBox(4, 12, 4, 0, 16, TEX_W, TEX_H);
        const lLegMesh = new THREE.Mesh(lLegGeo, M);
        lLegMesh.position.set(0, -6/16, 0);
        this.leftLegPivot.add(lLegMesh);
        this.leftLegPivot.position.set(2/16, 12/16, 0);
        this.mesh.add(this.leftLegPivot);

        const bodyGeo = createMobBox(8, 12, 4, 16, 16, TEX_W, TEX_H);
        const bodyMesh = new THREE.Mesh(bodyGeo, M);
        bodyMesh.position.set(0, 18/16, 0);
        this.mesh.add(bodyMesh);

        this.rightArmPivot = new THREE.Group();
        const rArmGeo = createMobBox(4, 12, 4, 40, 16, TEX_W, TEX_H);
        const rArmMesh = new THREE.Mesh(rArmGeo, M);
        rArmMesh.position.set(0, -6/16, 0);
        this.rightArmPivot.add(rArmMesh);
        this.rightArmPivot.position.set(-6/16, 23/16, 0);
        this.mesh.add(this.rightArmPivot);

        this.leftArmPivot = new THREE.Group();
        const lArmGeo = createMobBox(4, 12, 4, 40, 16, TEX_W, TEX_H);
        const lArmMesh = new THREE.Mesh(lArmGeo, M);
        lArmMesh.position.set(0, -6/16, 0);
        this.leftArmPivot.add(lArmMesh);
        this.leftArmPivot.position.set(6/16, 23/16, 0);
        this.mesh.add(this.leftArmPivot);

        this.headGroup = new THREE.Group();
        const headGeo = createMobBox(8, 8, 8, 0, 0, TEX_W, TEX_H);
        const headMesh = new THREE.Mesh(headGeo, M);
        headMesh.position.set(0, 4/16, 0);
        this.headGroup.add(headMesh);
        this.headGroup.position.set(0, 24/16, 0);
        this.mesh.add(this.headGroup);
    }

    // --- OVERRIDE GENERIC FOOTSTEPS WITH CUSTOM ZOMBIE STEPS ---
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
        const STEP_DISTANCE = 1.8; // Zombies have a slightly wider stride than pigs
        if (this._stepDistAccum >= STEP_DISTANCE) {
            this._stepDistAccum -= STEP_DISTANCE;
            if (this._stepDistAccum > STEP_DISTANCE) this._stepDistAccum = 0;
            if (typeof window.playMobSound === 'function') {
                window.playMobSound('zombie', 'step', this.x, this.y, this.z, 0.4);
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
        // Use reduced height during death animation (mob is falling over)
        const savedHeight = this.height;
        this.height = 0.5;
        if (this.checkCollision(this.x, nextY, this.z)) { if (this.vy < 0) nextY = this.getFloorY(this.x, nextY, this.z); this.vy = 0; }
        this.height = savedHeight;
        this.y = nextY;
        this.mesh.position.set(this.x, this.y, this.z);

        if (this.deathTimer <= 0) {
            this.dead = true;
            if (typeof window.spawnSmoke === 'function') {
                for (let i = 0; i < 8; i++) {
                    window.spawnSmoke(
                        this.x + (Math.random() - 0.5) * 0.8,
                        this.y + 0.9 + Math.random() * 0.6,
                        this.z + (Math.random() - 0.5) * 0.8
                    );
                }
            }
            if (Math.random() < 0.10 && typeof window.spawnDroppedItem === 'function') {
                window.spawnDroppedItem(this.x, this.y + 0.5, this.z, 113, 1);
            }
            if (typeof window.spawnMobDeathXP === 'function') window.spawnMobDeathXP(this.x, this.y, this.z, 'zombie');
        }
    }

    update(dt) {
        if (this.dead) {
            if (this._fireMeshes) {
                for (const fm of this._fireMeshes) {
                    this.mesh.remove(fm);
                    if (fm.geometry) fm.geometry.dispose();
                    if (fm.material) fm.material.dispose();
                }
                this._fireMeshes = [];
            }
            scene.remove(this.mesh);
            scene.remove(this.shadow);
            this.mesh.traverse(c => { if (c.isMesh) c.geometry.dispose(); });
            if (this.material) this.material.dispose();
            const idx = globalMobs.indexOf(this);
            if (idx !== -1) globalMobs.splice(idx, 1);
            return;
        }

        if (this.dying) { this._tickDying(dt); return; }

        if (this.hurtTime > 0) {
            this.hurtTime -= dt;
            if (this.hurtTime <= 0) this.material.color.setHex(0xffffff);
        }

        // ---- AMBIENT SOUNDS ----
        if (this._ambientTimer === undefined) this._ambientTimer = 2.0 + Math.random() * 4.0;
        this._ambientTimer -= dt;
        if (this._ambientTimer <= 0) {
            this._ambientTimer = 4.0 + Math.random() * 6.0;
            if (typeof window.playMobSound === 'function') {
                window.playMobSound('zombie', 'say', this.x, this.y, this.z, 0.65);
            }
        }

        let isBurningFromSun = false;
        
        if (this.health > 0 && !this.inWater && !this.inLava) {
            const timeOfDay = typeof globalTime !== 'undefined' ? globalTime : 0;
            const DAY_LENGTH = typeof DAY_TIME !== 'undefined' ? DAY_TIME : 24000;
            const isDaytime = (timeOfDay >= DAY_LENGTH * 0.05 && timeOfDay <= DAY_LENGTH * 0.45);
            if (isDaytime) {
                const headY = Math.floor(this.y + this.height);
                if (typeof getSunLight === 'function' && getSunLight(Math.floor(this.x), headY, Math.floor(this.z)) === 15) {
                    isBurningFromSun = true; 
                    this.burningTimer += dt;
                    if (this.burningTimer > 1.0) {
                        this.burningTimer = 0;
                        this.takeDamage(1, this.x, this.z, true); 
                        if (typeof spawnParticles === 'function') spawnParticles(this.x, this.y + 1, this.z, 89);
                    }
                } else {
                    this.burningTimer = 0;
                }
            } else {
                this.burningTimer = 0;
            }
        }

        const isVisiblyOnFire = this.inLava || 
            (getVoxel(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) & 0xFF) === 89 || 
            isBurningFromSun;
        _tickMobFireMeshes(this, isVisiblyOnFire);
        _tickMobEnvironmentDamage(this, dt);

        const sunLevel = (typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 0;
        const dx = player.x - this.x;
        const dy = (player.y + 0.9) - (this.y + this.height * 0.5);
        const dz = player.z - this.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const distXZ  = Math.sqrt(dx*dx + dz*dz);

        const detectRange = (sunLevel > 0.5) ? 16 : 40;
        const detectRangeSq = detectRange * detectRange;
        const canAggro = !player._dead && gameMode !== 'creative';

        // --- AGGRO & LOS SYSTEM ---
        const hasLOS = checkLineOfSight(this.x, this.y + 1.6, this.z, player.x, player.y + 1.6, player.z);

        if (canAggro && distSq < detectRangeSq) {
            if (hasLOS) {
                // If they see you, chase and reset the memory timer
                this.isAggro = true;
                this._lostSightTimer = 5.0; 
            } else if (this.isAggro) {
                // If they lose sight, count down for 5 seconds before giving up
                this._lostSightTimer -= dt;
                if (this._lostSightTimer <= 0) {
                    this.isAggro = false;
                }
            }
        } else {
            this.isAggro = false;
        }

        // Hard break if you get too far away (64 blocks)
        if (distSq > 64 * 64) this.isAggro = false;

        if (this._stuckTimer === undefined) this._initPathState();

        const ZOMBIE_SPEED = 2.0;
        const ATTACK_RANGE    = 1.75;
        const STOP_CHASE_DIST = ATTACK_RANGE - 0.2;

        if (this.isAggro && !player._dead) {
            this.state = 'wander';

            if (distXZ > STOP_CHASE_DIST) {
                this._pathTimer += dt;
                if (this._pathCooldown > 0) this._pathCooldown -= dt;

                const needsRepath = !this._path
                    || this._pathIndex >= this._path.length
                    || this._pathTimer > 1.0    
                    || this._checkStuck(dt, 0.8); 

                if (needsRepath && this._pathCooldown <= 0) {
                    this._path = findPath(
                        this.x, this.y, this.z,
                        player.x, player.y, player.z,
                        this.height, 300
                    );
                    this._pathIndex = 0;
                    this._pathTimer = 0;
                    this._pathCooldown = 0.3; 
                    this._stuckTimer = 0;
                }

                const pathDone = this._followPath(ZOMBIE_SPEED, dt);

                if (pathDone) {
                    const angle = Math.atan2(dx, dz);
                    this.vx = Math.sin(angle) * ZOMBIE_SPEED;
                    this.vz = Math.cos(angle) * ZOMBIE_SPEED;
                    this.targetYaw = angle;
                }
            } else {
                this.vx *= Math.exp(-12 * dt);
                this.vz *= Math.exp(-12 * dt);
                this._path = null;
            }

            const angle = Math.atan2(dx, dz);
            this.targetYaw = this._path && this._pathIndex < this._path.length ? this.targetYaw : angle;
            
            let headYaw = angle - this.yaw;
            while (headYaw >  Math.PI) headYaw -= Math.PI * 2;
            while (headYaw < -Math.PI) headYaw += Math.PI * 2;
            headYaw = Math.max(-0.8, Math.min(0.8, headYaw));
            let headPitch = Math.atan2(-dy, Math.max(0.1, distXZ));
            headPitch = Math.max(-0.8, Math.min(0.8, headPitch));
            this.headGroup.rotation.y += (headYaw  - this.headGroup.rotation.y)  * dt * 8.0;
            this.headGroup.rotation.x += (headPitch - this.headGroup.rotation.x) * dt * 8.0;

            this.attackTimer -= dt;
            if (distXZ <= ATTACK_RANGE && Math.abs(dy) < 2.0 && this.attackTimer <= 0 && !player._dead) {
                this.attackTimer = 1.0;
                this._swingAnim = 1.0;
                if (gameMode === 'survival') {
                    window.applyPlayerDamage(2);
                    if (typeof window.applyPlayerKnockback === 'function') {
                        window.applyPlayerKnockback(this.x, this.z, 4.2, 2.2);
                    }
                }
            }
        } else {
            this._path = null; 
            this.timer -= dt;
            if (this.timer <= 0) {
                if (Math.random() < 0.4) {
                    this.state = 'idle';
                    this.timer = 2.0 + Math.random() * 3.0;
                } else {
                    this.state = 'wander';
                    this.timer = 3.0 + Math.random() * 4.0;
                    this.targetYaw = this.yaw + (Math.random() - 0.5) * Math.PI * 2;
                }
            }

            if (this.state === 'wander') {
                const vxCandidate = Math.sin(this.yaw) * ZOMBIE_SPEED * 0.5;
                const vzCandidate = Math.cos(this.yaw) * ZOMBIE_SPEED * 0.5;
                if (this.onGround && _mobStepIsDangerous(this, vxCandidate, vzCandidate) || _mobWallAhead(this, vxCandidate, vzCandidate)) {
                    this.state = 'idle';
                    this.timer = 1.0 + Math.random() * 1.5;
                    this.targetYaw = this.yaw + Math.PI + (Math.random() - 0.5) * Math.PI;
                    this.vx *= 0.1; this.vz *= 0.1;
                } else {
                    this.vx = vxCandidate;
                    this.vz = vzCandidate;
                }
                if (this._checkStuck(dt, 1.5)) {
                    this._stuckTimer = 0;
                    this.targetYaw = this.yaw + Math.PI * (0.5 + Math.random());
                    this.timer = Math.min(this.timer, 0.5);
                }
            } else {
                this.vx *= Math.exp(-8 * dt);
                this.vz *= Math.exp(-8 * dt);
            }

            const idleYaw   = Math.sin(globalTime * 1.2) * 0.25;
            const idlePitch = Math.sin(globalTime * 0.8) * 0.15;
            this.headGroup.rotation.y += (idleYaw   - this.headGroup.rotation.y)  * dt * 4.0;
            this.headGroup.rotation.x += (idlePitch - this.headGroup.rotation.x) * dt * 4.0;
        }

        let diff = this.targetYaw - this.yaw;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * dt * 3.5;

        if (this.inWater && Math.random() < 0.1) window.spawnWaterSplash(this.x, this.y, this.z);
        if (this._pendingJump) {
            this.vy = 8.2;
            this.onGround = false;
            this._pendingJump = false;
        }
        const needsJump = this._applyPhysics(dt);
        if (needsJump && this.onGround && this._jumpCooldown <= 0) {
            this._pendingJump = true;
            this._jumpCooldown = 0.4;
        }
        if (this._jumpCooldown > 0) this._jumpCooldown -= dt;

        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.yaw;
        
        // Use custom zombie footstep logic
        this._tickFootstep();

        const horizSpeed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
        const isMoving = horizSpeed > 0.15;
        this.walkCycle += dt * (isMoving ? 5.0 : 0.0);

        const legSwing = isMoving ? Math.sin(this.walkCycle) * 0.7 : 0;
        this.rightLegPivot.rotation.x += (legSwing  - this.rightLegPivot.rotation.x) * dt * 12;
        this.leftLegPivot.rotation.x  += (-legSwing - this.leftLegPivot.rotation.x)  * dt * 12;

        if (!this._idleTime) this._idleTime = 0;
        this._idleTime += dt;
        const idleAmp   = isMoving ? 0.0 : 1.0; 
        const idleSway  = Math.sin(this._idleTime * 1.5) * 0.06 * idleAmp;
        const idleSwayZ = Math.sin(this._idleTime * 1.2 + 0.5) * 0.03 * idleAmp;

        if (!this._swingAnim) this._swingAnim = 0;
        if (this._swingAnim > 0) this._swingAnim = Math.max(0, this._swingAnim - dt * 3.5);
        let attackSwing = 0;
        if (this._swingAnim > 0) {
            const progress = 1.0 - this._swingAnim;
            const swingArc = Math.sin(Math.sqrt(progress) * Math.PI);
            attackSwing = -swingArc * 1.2; 
        }

        const targetRightArm = -Math.PI / 2 + idleSway + attackSwing;
        const targetLeftArm  = -Math.PI / 2 + idleSway + attackSwing;
        this.rightArmPivot.rotation.x += (targetRightArm - this.rightArmPivot.rotation.x) * dt * 6;
        this.leftArmPivot.rotation.x  += (targetLeftArm  - this.leftArmPivot.rotation.x)  * dt * 6;
        this.rightArmPivot.rotation.z += ( idleSwayZ - this.rightArmPivot.rotation.z) * dt * 6;
        this.leftArmPivot.rotation.z  += (-idleSwayZ - this.leftArmPivot.rotation.z)  * dt * 6;

        const targetOrder = this.inWater ? 6 : 0;
        if (this.mesh.renderOrder !== targetOrder) {
            this.mesh.renderOrder = targetOrder;
            this.mesh.traverse(c => { if (c.isMesh) c.renderOrder = targetOrder; });
        }

        let sepX = 0, sepZ = 0;
        const SEP_RADIUS = 0.65;
        for (let j = 0; j < globalMobs.length; j++) {
            const other = globalMobs[j];
            if (other === this || other.dead || other.dying) continue;
            const rdx = this.x - other.x;
            const rdz = this.z - other.z;
            const dSq = rdx * rdx + rdz * rdz;
            if (dSq < SEP_RADIUS * SEP_RADIUS && dSq > 0.0001) {
                const d = Math.sqrt(dSq);
                const overlap = SEP_RADIUS - d;
                const pushAmt = Math.min(0.025, overlap * 0.3);
                sepX += (rdx / d) * pushAmt;
                sepZ += (rdz / d) * pushAmt;
            }
        }
        if (Math.abs(sepX) > 0.0001) {
            if (!this._testCollisionPure(this.x + sepX, this.y, this.z)) {
                this.x += sepX;
            }
        }
        if (Math.abs(sepZ) > 0.0001) {
            if (!this._testCollisionPure(this.x, this.y, this.z + sepZ)) {
                this.z += sepZ;
            }
        }

        this.updateLighting();
    }
}

// Override takeDamage to support optional fire-damage flag, and trigger custom hurt/death sounds!
Zombie.prototype.takeDamage = function(amount, sourceX, sourceZ, isFireDamage, kbDirX, kbDirZ) {
    if (this.hurtTime > 0 || this.dying || this.dead) return;
    this.health -= amount;
    this.hurtTime = 0.5;

    // Trigger proper custom sound depending on whether the hit was fatal
    if (this.health <= 0) {
        this.dying = true;
        this.deathTimer = 1.0;
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('zombie', 'death', this.x, this.y, this.z, 0.75);
        }
    } else {
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('zombie', 'hurt', this.x, this.y, this.z, 0.75);
        }
    }

    if (!isFireDamage) {
        this.material.color.setHex(0xff7777);
        this.applyKnockback(sourceX, sourceZ, 7.0, 2.2, kbDirX, kbDirZ);
        this.isAggro = true;
    } else {
        this.material.color.setHex(0xff8844);
    }
};