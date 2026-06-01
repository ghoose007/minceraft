// ==========================================
// SKELETON MOB
// ==========================================

let skeletonMaterial = null;

function initSkeletonMaterial() {
    if (skeletonMaterial) return;
    const tex = new THREE.TextureLoader().load('textures/skeleton.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    skeletonMaterial = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, alphaTest: 0.1 });
    if (typeof injectLightingShader === 'function') injectLightingShader(skeletonMaterial);
    skeletonMaterial.customProgramCacheKey = function() { return 'skeletonMat'; };
}

class Skeleton extends Mob {
    constructor(x, y, z) {
        super(x, y, z);

        this.width = 0.6;
        this.height = 1.8;
        this.health = 20;

        this.isAggro = false;
        this.attackTimer = 0;
        this.burningTimer = 0;

        initSkeletonMaterial();
        if (this.material) this.material.dispose();
        this.material = skeletonMaterial.clone();
        if (typeof injectLightingShader === 'function') injectLightingShader(this.material);
        this.material.customProgramCacheKey = function() { return 'skeletonMatInst'; };

        const M = this.material;
        const TEX_W = 64, TEX_H = 32;

        // Legs, Body, Arms, and Head construction...
        this.rightLegPivot = new THREE.Group();
        const rLegGeo = createMobBox(2, 12, 2, 0, 16, TEX_W, TEX_H);
        const rLegMesh = new THREE.Mesh(rLegGeo, M);
        rLegMesh.position.set(0, -6/16, 0);
        this.rightLegPivot.add(rLegMesh);
        this.rightLegPivot.position.set(-2/16, 12/16, 0);
        this.mesh.add(this.rightLegPivot);

        this.leftLegPivot = new THREE.Group();
        const lLegGeo = createMobBox(2, 12, 2, 0, 16, TEX_W, TEX_H);
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
        const rArmGeo = createMobBox(2, 12, 2, 40, 16, TEX_W, TEX_H);
        const rArmMesh = new THREE.Mesh(rArmGeo, M);
        rArmMesh.position.set(0, -6/16, 0);
        this.rightArmPivot.add(rArmMesh);
        this.rightArmPivot.position.set(-5/16, 23/16, 0);
        this.mesh.add(this.rightArmPivot);

        if (typeof buildItemMesh === 'function') {
            const bowMesh = buildItemMesh(164); // Bow
            if (bowMesh) {
                bowMesh.scale.set(0.4, 0.4, 0.4);
                bowMesh.rotation.set(1.75, 2.8 - 15 * Math.PI / 180, 0);
                bowMesh.position.set(-0.2, 0, -4/16);
                const heldAnchor = new THREE.Group();
                heldAnchor.position.set(0, -12.5/16, 0);
                heldAnchor.add(bowMesh);
                this.rightArmPivot.add(heldAnchor);

                // DEBUG: purple cube + XYZ lines at bow origin (F3 only)
                const dbgGeo = new THREE.BoxGeometry(2/16, 2/16, 2/16);
                const dbgMat = new THREE.MeshBasicMaterial({ color: 0x9900ff });
                const dbgCube = new THREE.Mesh(dbgGeo, dbgMat);
                dbgCube.visible = false;
                heldAnchor.add(dbgCube);
                const al = 0.4;
                const xL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(al,0,0)]), new THREE.LineBasicMaterial({color:0xff0000}));
                const yL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,al,0)]), new THREE.LineBasicMaterial({color:0x00ff00}));
                const zL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,al)]), new THREE.LineBasicMaterial({color:0x0000ff}));
                xL.visible = false; yL.visible = false; zL.visible = false;
                heldAnchor.add(xL); heldAnchor.add(yL); heldAnchor.add(zL);
                this._bowDebug = [dbgCube, xL, yL, zL];
            }
        }

        this.leftArmPivot = new THREE.Group();
        const lArmGeo = createMobBox(2, 12, 2, 40, 16, TEX_W, TEX_H);
        const lArmMesh = new THREE.Mesh(lArmGeo, M);
        lArmMesh.position.set(0, -6/16, 0);
        this.leftArmPivot.add(lArmMesh);
        this.leftArmPivot.position.set(5/16, 23/16, 0);
        this.mesh.add(this.leftArmPivot);

        this.headGroup = new THREE.Group();
        const headGeo = createMobBox(8, 8, 8, 0, 0, TEX_W, TEX_H);
        const headMesh = new THREE.Mesh(headGeo, M);
        headMesh.position.set(0, 4/16, 0);
        this.headGroup.add(headMesh);
        this.headGroup.position.set(0, 24/16, 0);
        this.mesh.add(this.headGroup);
    }

    // --- CUSTOM SKELETON FOOTSTEPS ---
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
        const STEP_DISTANCE = 1.8; 
        if (this._stepDistAccum >= STEP_DISTANCE) {
            this._stepDistAccum -= STEP_DISTANCE;
            if (this._stepDistAccum > STEP_DISTANCE) this._stepDistAccum = 0;
            if (typeof window.playMobSound === 'function') {
                window.playMobSound('skeleton', 'step', this.x, this.y, this.z, 0.35);
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
                for (let i = 0; i < 8; i++) {
                    window.spawnSmoke(this.x + (Math.random() - 0.5) * 0.8, this.y + 0.9 + Math.random() * 0.6, this.z + (Math.random() - 0.5) * 0.8);
                }
            }
            if (typeof window.spawnMobDeathXP === 'function') window.spawnMobDeathXP(this.x, this.y, this.z, 'skeleton');
        }
    }

    update(dt) {
        if (this.dead) {
            if (this._fireMeshes) {
                for (const fm of this._fireMeshes) { this.mesh.remove(fm); if (fm.geometry) fm.geometry.dispose(); if (fm.material) fm.material.dispose(); }
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

        if (this.hurtTime > 0) { this.hurtTime -= dt; if (this.hurtTime <= 0) this.material.color.setHex(0xffffff); }

        // --- AMBIENT BONE RATTLE ---
        if (this._ambientTimer === undefined) this._ambientTimer = 2.0 + Math.random() * 4.0;
        this._ambientTimer -= dt;
        if (this._ambientTimer <= 0) {
            this._ambientTimer = 4.0 + Math.random() * 8.0;
            if (typeof window.playMobSound === 'function') {
                window.playMobSound('skeleton', 'say', this.x, this.y, this.z, 0.55);
            }
        }

        if (this._stuckTimer === undefined) this._initPathState();

        // Daylight burning logic...
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
                } else { this.burningTimer = 0; }
            } else { this.burningTimer = 0; }
        }

        // Hostile AI and pathfinding movement...
        const dx = player.x - this.x;
        const dy = (player.y + 0.9) - (this.y + this.height * 0.5);
        const dz = player.z - this.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const distXZ = Math.sqrt(dx*dx + dz*dz);
        const sunLevel = (typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 0;

        const detectRange = (sunLevel > 0.5) ? 16 : 40;
        const canAggro = !player._dead && gameMode !== 'creative';
        // --- AGGRO & LOS SYSTEM ---
        const hasLOS = checkLineOfSight(this.x, this.y + 1.6, this.z, player.x, player.y + 1.6, player.z);

        if (canAggro && distSq < (detectRange * detectRange)) {
            if (hasLOS) {
                // If they see you, chase and reset the memory timer
                this.isAggro = true;
                this._lostSightTimer = 5.0; 
            } else if (this.isAggro) {
                // Count down for 5 seconds when sight is broken
                this._lostSightTimer -= dt;
                if (this._lostSightTimer <= 0) {
                    this.isAggro = false;
                }
            }
        } else {
            this.isAggro = false;
        }

        if (distSq > 64 * 64) this.isAggro = false;

        const SKEL_SPEED = 2.0;
        const SHOOT_RANGE = 15;       // Skeletons shoot from up to 15 blocks
        const PREFERRED_RANGE = 10;   // They try to maintain ~10 block distance
        const MIN_RANGE = 4;          // They back away if closer than this

        if (this.isAggro && !player._dead) {
            this.state = 'wander';

            // Movement: try to stay at preferred range
            if (distXZ > SHOOT_RANGE) {
                // Too far — chase closer
                this._pathTimer = (this._pathTimer || 0) + dt;
                if (this._pathCooldown > 0) this._pathCooldown -= dt;
                const needsRepath = !this._path || this._pathIndex >= this._path.length || this._pathTimer > 1.0 || this._checkStuck(dt, 0.8);
                if (needsRepath && (this._pathCooldown || 0) <= 0) {
                    this._path = findPath(this.x, this.y, this.z, player.x, player.y, player.z, this.height, 300);
                    this._pathIndex = 0; this._pathTimer = 0; this._pathCooldown = 0.3; this._stuckTimer = 0;
                }
                this._followPath(SKEL_SPEED, dt);
            } else if (distXZ < MIN_RANGE) {
                // Too close — back away
                this._path = null;
                const fleeAngle = Math.atan2(-dx, -dz);
                this.vx = Math.sin(fleeAngle) * SKEL_SPEED * 0.7;
                this.vz = Math.cos(fleeAngle) * SKEL_SPEED * 0.7;
                this.targetYaw = Math.atan2(dx, dz); // Still face player
            } else {
                // In shooting range — strafe slowly
                this._path = null;
                if (!this._strafeDir) this._strafeDir = Math.random() < 0.5 ? 1 : -1;
                if (!this._strafeTimer) this._strafeTimer = 0;
                this._strafeTimer += dt;
                if (this._strafeTimer > 3.0) { this._strafeDir *= -1; this._strafeTimer = 0; }
                const strafeAngle = Math.atan2(dx, dz) + (Math.PI / 2) * this._strafeDir;
                this.vx = Math.sin(strafeAngle) * SKEL_SPEED * 0.4;
                this.vz = Math.cos(strafeAngle) * SKEL_SPEED * 0.4;
                this.targetYaw = Math.atan2(dx, dz); // Face player
            }

            // Head tracking — look at player
            const playerAngle = Math.atan2(dx, dz);
            let headYaw = playerAngle - this.yaw;
            while (headYaw > Math.PI) headYaw -= Math.PI * 2;
            while (headYaw < -Math.PI) headYaw += Math.PI * 2;
            headYaw = Math.max(-1.2, Math.min(1.2, headYaw));
            let headPitch = Math.atan2(-dy, distXZ);
            headPitch = Math.max(-0.8, Math.min(0.8, headPitch));
            this.headGroup.rotation.y += (headYaw - this.headGroup.rotation.y) * dt * 10.0;
            this.headGroup.rotation.x += (headPitch - this.headGroup.rotation.x) * dt * 10.0;

            // --- BOW SHOOTING ---
            this.attackTimer -= dt;
            if (distXZ <= SHOOT_RANGE && hasLOS && this.attackTimer <= 0 && !player._dead) {
                this.attackTimer = 2.5; // 2.5 second cooldown between shots
                this._swingAnim = 1.0;

                // Calculate aim direction toward player with inaccuracy
                const aimDx = player.x - this.x;
                const aimDy = (player.y + player.eyeLevel * 0.5) - (this.y + 1.5);
                const aimDz = player.z - this.z;
                const aimDist = Math.sqrt(aimDx*aimDx + aimDy*aimDy + aimDz*aimDz) || 1;

                // Normalize aim direction
                let dirX = aimDx / aimDist;
                let dirY = aimDy / aimDist;
                let dirZ = aimDz / aimDist;

                // Add inaccuracy — random spread that increases with distance
                // MC skeletons have ~10 degree spread on Normal difficulty
                const spread = 0.12; // radians of random deviation
                dirX += (Math.random() - 0.5) * spread;
                dirY += (Math.random() - 0.5) * spread;
                dirZ += (Math.random() - 0.5) * spread;

                // Re-normalize after adding spread
                const newLen = Math.sqrt(dirX*dirX + dirY*dirY + dirZ*dirZ) || 1;
                dirX /= newLen; dirY /= newLen; dirZ /= newLen;

                // Add arc compensation — aim slightly upward to account for gravity
                const flightTime = aimDist / 30; // approximate time to reach player
                dirY += flightTime * 0.3; // compensate for gravity drop

                const arrowSpeed = 30.0;
                const spawnX = this.x + dirX * 0.5;
                const spawnY = this.y + 1.5 + dirY * 0.5;
                const spawnZ = this.z + dirZ * 0.5;

                if (typeof Arrow !== 'undefined') {
                    new Arrow(spawnX, spawnY, spawnZ, dirX * arrowSpeed, dirY * arrowSpeed, dirZ * arrowSpeed, false);
                }

                // Play bow sound
                if (typeof window.playBowSound === 'function') window.playBowSound();
            }
        } else {
            this._path = null;
            this.timer -= dt;
            if (this.timer <= 0) {
                if (Math.random() < 0.4) { this.state = 'idle'; this.timer = 2.0 + Math.random() * 3.0; }
                else { this.state = 'wander'; this.timer = 3.0 + Math.random() * 4.0; this.targetYaw = this.yaw + (Math.random() - 0.5) * Math.PI * 2; }
            }
            if (this.state === 'wander') {
                const vxC = Math.sin(this.yaw) * SKEL_SPEED * 0.5;
                const vzC = Math.cos(this.yaw) * SKEL_SPEED * 0.5;
                if (this.onGround && _mobStepIsDangerous(this, vxC, vzC)) {
                    this.state = 'idle'; this.timer = 1.0 + Math.random() * 1.5;
                    this.targetYaw = this.yaw + Math.PI + (Math.random() - 0.5) * Math.PI;
                    this.vx *= 0.1; this.vz *= 0.1;
                } else { this.vx = vxC; this.vz = vzC; }
                if (this._checkStuck(dt, 1.5)) { this._stuckTimer = 0; this.targetYaw = this.yaw + Math.PI * (0.5 + Math.random()); this.timer = Math.min(this.timer, 0.5); }
            } else { this.vx *= Math.exp(-8 * dt); this.vz *= Math.exp(-8 * dt); }
            const idleYaw = Math.sin(globalTime * 1.2) * 0.25;
            const idlePitch = Math.sin(globalTime * 0.8) * 0.15;
            this.headGroup.rotation.y += (idleYaw - this.headGroup.rotation.y) * dt * 4.0;
            this.headGroup.rotation.x += (idlePitch - this.headGroup.rotation.x) * dt * 4.0;
        }

        let diff = this.targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * dt * 3.5;

        if (this.inWater && Math.random() < 0.1) window.spawnWaterSplash(this.x, this.y, this.z);
        if (this._pendingJump) { this.vy = 8.2; this.onGround = false; this._pendingJump = false; }
        const needsJump = this._applyPhysics(dt);
        if (needsJump && this.onGround && this._jumpCooldown <= 0) { this._pendingJump = true; this._jumpCooldown = 0.4; }
        if (this._jumpCooldown > 0) this._jumpCooldown -= dt;

        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.yaw;

        this._tickFootstep(); // Trigger custom skeleton steps

        // Final physics and animation updates...
        const horizSpeed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
        const isMoving = horizSpeed > 0.15;
        this.walkCycle += dt * (isMoving ? 5.0 : 0.0);
        const legSwing = isMoving ? Math.sin(this.walkCycle) * 0.7 : 0;
        this.rightLegPivot.rotation.x += (legSwing - this.rightLegPivot.rotation.x) * dt * 12;
        this.leftLegPivot.rotation.x += (-legSwing - this.leftLegPivot.rotation.x) * dt * 12;

        if (!this._idleTime) this._idleTime = 0;
        this._idleTime += dt;
        const armIdleAmp = isMoving ? 0.0 : 1.0;
        const armIdleSway = Math.sin(this._idleTime * 1.5) * 0.06 * armIdleAmp;
        const armSwing = isMoving ? Math.sin(this.walkCycle) * 0.5 : 0;

        if (!this._swingAnim) this._swingAnim = 0;
        if (this._swingAnim > 0) this._swingAnim = Math.max(0, this._swingAnim - dt * 3.5);
        let attackSwingR = 0;
        if (this._swingAnim > 0) {
            const progress = 1.0 - this._swingAnim;
            const swingArc = Math.sin(Math.sqrt(progress) * Math.PI);
            attackSwingR = -swingArc * 1.5;
        }

        if (this.isAggro) {
            const aimPitch = this.headGroup.rotation.x;
            // Right arm: straight forward
            this.rightArmPivot.rotation.x += (-Math.PI / 2 + aimPitch + attackSwingR - this.rightArmPivot.rotation.x) * dt * 8;
            this.rightArmPivot.rotation.z += (0 - this.rightArmPivot.rotation.z) * dt * 8;
            this.rightArmPivot.rotation.y += (0 - this.rightArmPivot.rotation.y) * dt * 8;
            // Left arm: straight forward, rotated -45 degrees on Z toward right arm
            this.leftArmPivot.rotation.x += (-Math.PI / 2 + aimPitch - this.leftArmPivot.rotation.x) * dt * 8;
            this.leftArmPivot.rotation.z += (-Math.PI / 4 - this.leftArmPivot.rotation.z) * dt * 8;
            this.leftArmPivot.rotation.y += (0 - this.leftArmPivot.rotation.y) * dt * 8;
        } else {
            this.rightArmPivot.rotation.x += (-armSwing + armIdleSway + attackSwingR - this.rightArmPivot.rotation.x) * dt * 8;
            this.leftArmPivot.rotation.x += (armSwing + armIdleSway - this.leftArmPivot.rotation.x) * dt * 8;
            this.rightArmPivot.rotation.z += (0 - this.rightArmPivot.rotation.z) * dt * 8;
            this.leftArmPivot.rotation.z += (0 - this.leftArmPivot.rotation.z) * dt * 8;
            this.rightArmPivot.rotation.y += (0 - this.rightArmPivot.rotation.y) * dt * 8;
            this.leftArmPivot.rotation.y += (0 - this.leftArmPivot.rotation.y) * dt * 8;
        }

        _tickMobEnvironmentDamage(this, dt);
        const isOnFire = this.inLava || (getVoxel(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) & 0xFF) === 89 || isBurningFromSun;
        _tickMobFireMeshes(this, isOnFire);

        // Separation and lighting...
        let sepX = 0, sepZ = 0;
        const SEP_RADIUS = 0.65;
        for (let j = 0; j < globalMobs.length; j++) {
            const other = globalMobs[j];
            if (other === this || other.dead || other.dying) continue;
            const rdx = this.x - other.x, rdz = this.z - other.z;
            const dSq = rdx * rdx + rdz * rdz;
            if (dSq < SEP_RADIUS * SEP_RADIUS && dSq > 0.0001) {
                const d = Math.sqrt(dSq);
                sepX += (rdx / d) * Math.min(0.025, (SEP_RADIUS - d) * 0.3);
                sepZ += (rdz / d) * Math.min(0.025, (SEP_RADIUS - d) * 0.3);
            }
        }
        if (Math.abs(sepX) > 0.0001 && !this._testCollisionPure(this.x + sepX, this.y, this.z)) this.x += sepX;
        if (Math.abs(sepZ) > 0.0001 && !this._testCollisionPure(this.x, this.y, this.z + sepZ)) this.z += sepZ;

        // Ensure the mob renders behind transparent water when submerged
        // FIXED: Lower order (0) when in water to draw before the water pass
        const targetOrder = this.inWater ? 0 : 5; 
        if (this.mesh.renderOrder !== targetOrder) {
            this.mesh.renderOrder = targetOrder;
            // Apply to all sub-meshes (head, limbs, etc.)
            this.mesh.traverse(c => { if (c.isMesh) c.renderOrder = targetOrder; });
        }

        // Toggle bow debug visuals with F3
        if (this._bowDebug) {
            const show = !!window.showDebugScreen;
            for (const d of this._bowDebug) d.visible = show;
        }

        this.updateLighting();
    }
}

Skeleton.prototype.takeDamage = function(amount, sourceX, sourceZ, isFireDamage, kbDirX, kbDirZ) {
    if (this.hurtTime > 0 || this.dying || this.dead) return;
    this.health -= amount;
    this.hurtTime = 0.5;

    // Trigger proper custom sound depending on whether the hit was fatal
    if (this.health <= 0) {
        this.dying = true; this.deathTimer = 1.0;
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('skeleton', 'death', this.x, this.y, this.z, 0.75);
        }
    } else {
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('skeleton', 'hurt', this.x, this.y, this.z, 0.75);
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