// ==========================================
// ZOMBIE PIGMAN MOB
// ==========================================
// Neutral mob that spawns in the Nether.
// Uses zombie model + overlay "hat" layer for the skin.
// Holds a gold sword. Becomes hostile when attacked — all nearby pigmen aggro together.

let zombiePigmanMaterial = null;

function initZombiePigmanMaterial() {
    if (zombiePigmanMaterial) return;
    const tex = new THREE.TextureLoader().load('textures/zombiepigman.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    zombiePigmanMaterial = new THREE.MeshBasicMaterial({
        map: tex,
        vertexColors: true,
        side: THREE.FrontSide,
        alphaTest: 0.1,
        transparent: true
    });
    if (typeof injectLightingShader === 'function') injectLightingShader(zombiePigmanMaterial);
    zombiePigmanMaterial.customProgramCacheKey = function() { return 'zpigmanMat'; };
}

// Helper: create an inflated overlay box (same UVs, slightly larger for 3D skin layer)
function createOverlayMobBox(w, h, d, u, v, texW, texH, inflate) {
    const iw = w + inflate * 2, ih = h + inflate * 2, id = d + inflate * 2;
    const geo = new THREE.BoxGeometry(iw / 16, ih / 16, id / 16);
    const uvs = geo.attributes.uv.array;

    const setUV = (face, x, y, fw, fh) => {
        const u1 = x / texW;
        const u2 = (x + fw) / texW;
        const v1 = 1.0 - ((y + fh) / texH);
        const v2 = 1.0 - (y / texH);
        uvs[face*8 + 0] = u1; uvs[face*8 + 1] = v2;
        uvs[face*8 + 2] = u2; uvs[face*8 + 3] = v2;
        uvs[face*8 + 4] = u1; uvs[face*8 + 5] = v1;
        uvs[face*8 + 6] = u2; uvs[face*8 + 7] = v1;
    };

    // Same face order as createMobBox
    setUV(0, u + d + w, v + d, d, h);     // +X right
    setUV(1, u, v + d, d, h);             // -X left
    setUV(2, u + d, v, w, d);             // +Y top
    setUV(3, u + d + w, v, w, d);         // -Y bottom
    setUV(4, u + d, v + d, w, h);         // +Z front
    setUV(5, u + d + w + d, v + d, w, h); // -Z back

    // Set vertex colors to white for lighting
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) colors[i] = 1.0;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return geo;
}

class ZombiePigman extends Mob {
    constructor(x, y, z) {
        super(x, y, z);

        this.width  = 0.6;
        this.height = 1.8;
        this.health = 20;

        this.aggroTarget  = null;
        this.attackTimer  = 0;
        this.isAggro      = false;
        this.aggroTimer   = 0;       // How long aggro lasts after being hit
        this.burningTimer = 0;

        initZombiePigmanMaterial();
        if (this.material) this.material.dispose();
        this.material = zombiePigmanMaterial.clone();
        if (typeof injectLightingShader === 'function') injectLightingShader(this.material);
        this.material.customProgramCacheKey = function() { return 'zpigmanMatInst'; };

        const M = this.material;
        const TEX_W = 64, TEX_H = 64; // 64x64 skin format
        const INFLATE = 0.5; // overlay inflation in pixels

        // --- BASE MODEL (same as zombie, UV in top half of 64x64) ---

        // Right Leg
        this.rightLegPivot = new THREE.Group();
        const rLegGeo = createMobBox(4, 12, 4, 0, 16, TEX_W, TEX_H);
        this.rightLegPivot.add(new THREE.Mesh(rLegGeo, M));
        this.rightLegPivot.children[0].position.set(0, -6/16, 0);
        this.rightLegPivot.position.set(-2/16, 12/16, 0);
        this.mesh.add(this.rightLegPivot);

        // Left Leg (mirrored right leg in classic format)
        this.leftLegPivot = new THREE.Group();
        const lLegGeo = createMobBox(4, 12, 4, 0, 16, TEX_W, TEX_H);
        this.leftLegPivot.add(new THREE.Mesh(lLegGeo, M));
        this.leftLegPivot.children[0].position.set(0, -6/16, 0);
        this.leftLegPivot.position.set(2/16, 12/16, 0);
        this.mesh.add(this.leftLegPivot);

        // Body
        const bodyGeo = createMobBox(8, 12, 4, 16, 16, TEX_W, TEX_H);
        const bodyMesh = new THREE.Mesh(bodyGeo, M);
        bodyMesh.position.set(0, 18/16, 0);
        this.mesh.add(bodyMesh);

        // Right Arm
        this.rightArmPivot = new THREE.Group();
        const rArmGeo = createMobBox(4, 12, 4, 40, 16, TEX_W, TEX_H);
        const rArmMesh = new THREE.Mesh(rArmGeo, M);
        rArmMesh.position.set(0, -6/16, 0);
        this.rightArmPivot.add(rArmMesh);
        this.rightArmPivot.position.set(-6/16, 23/16, 0);
        this.mesh.add(this.rightArmPivot);

        // Left Arm (mirrored right arm in classic format)
        this.leftArmPivot = new THREE.Group();
        const lArmGeo = createMobBox(4, 12, 4, 40, 16, TEX_W, TEX_H);
        const lArmMesh = new THREE.Mesh(lArmGeo, M);
        lArmMesh.position.set(0, -6/16, 0);
        this.leftArmPivot.add(lArmMesh);
        this.leftArmPivot.position.set(6/16, 23/16, 0);
        this.mesh.add(this.leftArmPivot);

        // Head
        this.headGroup = new THREE.Group();
        const headGeo = createMobBox(8, 8, 8, 0, 0, TEX_W, TEX_H);
        const headMesh = new THREE.Mesh(headGeo, M);
        headMesh.position.set(0, 4/16, 0);
        this.headGroup.add(headMesh);

        // --- OVERLAY "HAT" LAYER (head, UV at 32,0, inflated) ---
        const hatGeo = createOverlayMobBox(8, 8, 8, 32, 0, TEX_W, TEX_H, INFLATE);
        const hatMesh = new THREE.Mesh(hatGeo, M);
        hatMesh.position.set(0, 4/16, 0);
        this.headGroup.add(hatMesh);

        this.headGroup.position.set(0, 24/16, 0);
        this.mesh.add(this.headGroup);

        // --- BODY OVERLAY (UV at 16,32 in bottom half, inflated) ---
        const bodyOvGeo = createOverlayMobBox(8, 12, 4, 16, 32, TEX_W, TEX_H, INFLATE);
        const bodyOvMesh = new THREE.Mesh(bodyOvGeo, M);
        bodyOvMesh.position.set(0, 18/16, 0);
        this.mesh.add(bodyOvMesh);

        // --- LEFT LEG OVERLAY (UV at 0,48 in bottom half) ---
        const lLegOvGeo = createOverlayMobBox(4, 12, 4, 0, 48, TEX_W, TEX_H, INFLATE);
        const lLegOvMesh = new THREE.Mesh(lLegOvGeo, M);
        lLegOvMesh.position.set(0, -6/16, 0);
        this.leftLegPivot.add(lLegOvMesh);

        // --- LEFT ARM OVERLAY (UV at 48,48 in bottom half) ---
        const lArmOvGeo = createOverlayMobBox(4, 12, 4, 48, 48, TEX_W, TEX_H, INFLATE);
        const lArmOvMesh = new THREE.Mesh(lArmOvGeo, M);
        lArmOvMesh.position.set(0, -6/16, 0);
        this.leftArmPivot.add(lArmOvMesh);

        // --- GOLD SWORD in right hand ---
        if (typeof buildItemMesh === 'function') {
            const swordMesh = buildItemMesh(162); // Gold Sword
            if (swordMesh) {
                swordMesh.scale.set(0.4, 0.4, 0.4);
                swordMesh.rotation.set(1.75, 2.538, 0);
                swordMesh.position.set(-1/16, 4/16, 0);
                const heldAnchor = new THREE.Group();
                heldAnchor.position.set(0, -12.5/16, 0);
                heldAnchor.add(swordMesh);
                this.rightArmPivot.add(heldAnchor);
                this._swordMesh = swordMesh;

                // DEBUG: pink cube + XYZ lines on sword mesh origin (F3 only)
                const dbgGeo = new THREE.BoxGeometry(2/16, 2/16, 2/16);
                const dbgMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
                const dbgCube = new THREE.Mesh(dbgGeo, dbgMat);
                dbgCube.visible = false;
                swordMesh.add(dbgCube);
                const al = 0.4;
                const xL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(al,0,0)]), new THREE.LineBasicMaterial({color:0xff0000}));
                const yL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,al,0)]), new THREE.LineBasicMaterial({color:0x00ff00}));
                const zL = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,al)]), new THREE.LineBasicMaterial({color:0x0000ff}));
                xL.visible = false; yL.visible = false; zL.visible = false;
                swordMesh.add(xL); swordMesh.add(yL); swordMesh.add(zL);
                this._swordDebug = [dbgCube, xL, yL, zL];
            }
        }
    }

    // Zombie pigman uses zombie step sounds (since there are no pigman-specific ones)
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
        if (this._stepDistAccum >= 1.8) {
            this._stepDistAccum -= 1.8;
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
        const savedHeight = this.height;
        this.height = 0.5;
        if (this.checkCollision(this.x, nextY, this.z)) {
            if (this.vy < 0) nextY = this.getFloorY(this.x, nextY, this.z);
            this.vy = 0;
        }
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
            // Drop gold nuggets (gold ingot) or gold sword rarely
            if (typeof window.spawnDroppedItem === 'function') {
                if (Math.random() < 0.5) {
                    window.spawnDroppedItem(this.x, this.y + 0.5, this.z, 143, 1); // Gold Ingot
                }
            }
            if (typeof window.spawnMobDeathXP === 'function') window.spawnMobDeathXP(this.x, this.y, this.z, 'zombie_pigman');
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

        _tickMobEnvironmentDamage(this, dt);

        // Ambient sounds — idle when passive, angry when aggroed
        if (this._ambientTimer === undefined) this._ambientTimer = 3.0 + Math.random() * 5.0;
        this._ambientTimer -= dt;
        if (this._ambientTimer <= 0) {
            this._ambientTimer = 5.0 + Math.random() * 8.0;
            if (typeof window.playMobSound === 'function') {
                const ambientAction = this.isAggro ? 'angry' : 'idle';
                window.playMobSound('zpig', ambientAction, this.x, this.y, this.z, 0.55);
            }
        }

        // Zombie pigmen are immune to fire and lava
        // (they live in the nether, so no sun burning either)

        // Environment damage (only from falling, not fire/lava)
        // Skip fire mesh ticking but still apply physics
        _tickMobFireMeshes(this, false); // Never visibly on fire

        // --- AGGRO DECAY ---
        if (this.isAggro) {
            this.aggroTimer -= dt;
            if (this.aggroTimer <= 0) {
                this.isAggro = false;
            }
        }

        const dx = player.x - this.x;
        const dy = (player.y + 0.9) - (this.y + this.height * 0.5);
        const dz = player.z - this.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const distXZ = Math.sqrt(dx*dx + dz*dz);

        const canAggro = !player._dead && gameMode !== 'creative';

        if (this._stuckTimer === undefined) this._initPathState();

        const PIGMAN_SPEED = 2.3;
        const ATTACK_RANGE = 1.75;
        const STOP_CHASE_DIST = ATTACK_RANGE - 0.2;

        // --- NEUTRAL AI: only chase if aggroed ---
        if (this.isAggro && canAggro && !player._dead) {
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

                const pathDone = this._followPath(PIGMAN_SPEED, dt);
                if (pathDone) {
                    const angle = Math.atan2(dx, dz);
                    this.vx = Math.sin(angle) * PIGMAN_SPEED;
                    this.vz = Math.cos(angle) * PIGMAN_SPEED;
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
            while (headYaw > Math.PI) headYaw -= Math.PI * 2;
            while (headYaw < -Math.PI) headYaw += Math.PI * 2;
            headYaw = Math.max(-0.8, Math.min(0.8, headYaw));
            let headPitch = Math.atan2(-dy, Math.max(0.1, distXZ));
            headPitch = Math.max(-0.8, Math.min(0.8, headPitch));
            this.headGroup.rotation.y += (headYaw - this.headGroup.rotation.y) * dt * 8.0;
            this.headGroup.rotation.x += (headPitch - this.headGroup.rotation.x) * dt * 8.0;

            // Attack
            this.attackTimer -= dt;
            if (distXZ <= ATTACK_RANGE && Math.abs(dy) < 2.0 && this.attackTimer <= 0 && !player._dead) {
                this.attackTimer = 1.0;
                this._swingAnim = 1.0;
                if (gameMode === 'survival') {
                    window.applyPlayerDamage(4); // Gold sword = 4 damage
                    const kbDist = distXZ || 1;
                    player.vx += (dx / kbDist) * 6.0;
                    player.vz += (dz / kbDist) * 6.0;
                    player.vy = Math.max(player.vy, 4.0);
                }
            }
        } else {
            // Passive wandering (same as zombie idle behavior)
            this._path = null;
            this.timer -= dt;
            if (this.timer <= 0) {
                if (Math.random() < 0.5) {
                    this.state = 'idle';
                    this.timer = 3.0 + Math.random() * 4.0;
                } else {
                    this.state = 'wander';
                    this.timer = 3.0 + Math.random() * 5.0;
                    this.targetYaw = this.yaw + (Math.random() - 0.5) * Math.PI * 2;
                }
            }

            if (this.state === 'wander') {
                const vxC = Math.sin(this.yaw) * PIGMAN_SPEED * 0.35;
                const vzC = Math.cos(this.yaw) * PIGMAN_SPEED * 0.35;
                if (this.onGround && _mobStepIsDangerous(this, vxC, vzC) || _mobWallAhead(this, vxC, vzC)) {
                    this.state = 'idle';
                    this.timer = 1.0 + Math.random() * 1.5;
                    this.targetYaw = this.yaw + Math.PI + (Math.random() - 0.5) * Math.PI;
                    this.vx *= 0.1; this.vz *= 0.1;
                } else {
                    this.vx = vxC;
                    this.vz = vzC;
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

            const idleYaw = Math.sin(globalTime * 1.0) * 0.2;
            const idlePitch = Math.sin(globalTime * 0.7) * 0.12;
            this.headGroup.rotation.y += (idleYaw - this.headGroup.rotation.y) * dt * 4.0;
            this.headGroup.rotation.x += (idlePitch - this.headGroup.rotation.x) * dt * 4.0;
        }

        // Yaw interpolation
        let diff = this.targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * dt * 3.5;

        // Physics
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

        this._tickFootstep();

        // Animation (zombie arms-out pose + sword swing)
        const horizSpeed = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
        const isMoving = horizSpeed > 0.15;
        this.walkCycle += dt * (isMoving ? 5.0 : 0.0);

        const legSwing = isMoving ? Math.sin(this.walkCycle) * 0.7 : 0;
        this.rightLegPivot.rotation.x += (legSwing - this.rightLegPivot.rotation.x) * dt * 12;
        this.leftLegPivot.rotation.x += (-legSwing - this.leftLegPivot.rotation.x) * dt * 12;

        if (!this._idleTime) this._idleTime = 0;
        this._idleTime += dt;
        const idleAmp = isMoving ? 0.0 : 1.0;
        const idleSway = Math.sin(this._idleTime * 1.5) * 0.06 * idleAmp;
        const idleSwayZ = Math.sin(this._idleTime * 1.2 + 0.5) * 0.03 * idleAmp;

        if (!this._swingAnim) this._swingAnim = 0;
        if (this._swingAnim > 0) this._swingAnim = Math.max(0, this._swingAnim - dt * 3.5);
        let attackSwing = 0;
        if (this._swingAnim > 0) {
            const progress = 1.0 - this._swingAnim;
            attackSwing = -Math.sin(Math.sqrt(progress) * Math.PI) * 1.2;
        }

        // Zombie arms-out pose
        const targetRightArm = -Math.PI / 2 + idleSway + attackSwing;
        const targetLeftArm = -Math.PI / 2 + idleSway + attackSwing;
        this.rightArmPivot.rotation.x += (targetRightArm - this.rightArmPivot.rotation.x) * dt * 6;
        this.leftArmPivot.rotation.x += (targetLeftArm - this.leftArmPivot.rotation.x) * dt * 6;
        this.rightArmPivot.rotation.z += (idleSwayZ - this.rightArmPivot.rotation.z) * dt * 6;
        this.leftArmPivot.rotation.z += (-idleSwayZ - this.leftArmPivot.rotation.z) * dt * 6;

        // Render order
        const targetOrder = this.inWater ? 6 : 0;
        if (this.mesh.renderOrder !== targetOrder) {
            this.mesh.renderOrder = targetOrder;
            this.mesh.traverse(c => { if (c.isMesh) c.renderOrder = targetOrder; });
        }

        // Separation from other mobs
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
        if (Math.abs(sepX) > 0.0001 && !this._testCollisionPure(this.x + sepX, this.y, this.z)) this.x += sepX;
        if (Math.abs(sepZ) > 0.0001 && !this._testCollisionPure(this.x, this.y, this.z + sepZ)) this.z += sepZ;

        // Toggle sword debug visuals with F3
        if (this._swordDebug) {
            const show = !!window.showDebugScreen;
            for (const d of this._swordDebug) d.visible = show;
        }

        this.updateLighting();
    }
}

// --- TAKE DAMAGE: aggro self + all nearby pigmen ---
ZombiePigman.prototype.takeDamage = function(amount, sourceX, sourceZ, isFireDamage) {
    if (this.hurtTime > 0 || this.dying || this.dead) return;
    this.health -= amount;
    this.hurtTime = 0.5;

    if (this.health <= 0) {
        this.dying = true;
        this.deathTimer = 1.0;
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('zpig', 'death', this.x, this.y, this.z, 0.75);
        }
    } else {
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('zpig', 'hurt', this.x, this.y, this.z, 0.75);
        }
    }

    if (!isFireDamage) {
        this.material.color.setHex(0xff7777);
        const dx = this.x - sourceX, dz = this.z - sourceZ;
        const dist = Math.sqrt(dx*dx + dz*dz) || 1;
        this.vx = (dx / dist) * 6.0;
        this.vz = (dz / dist) * 6.0;
        this.vy = 6.0;
        this.onGround = false;

        // Play angry sound on initial aggro
        if (!this.isAggro && typeof window.playMobSound === 'function') {
            window.playMobSound('zpig', 'angry', this.x, this.y, this.z, 0.7);
        }

        // Aggro this pigman
        this.isAggro = true;
        this.aggroTimer = 20.0 + Math.random() * 20.0; // 20-40 seconds

        // Aggro ALL nearby zombie pigmen within 32 blocks
        const AGGRO_RANGE_SQ = 32 * 32;
        for (const mob of globalMobs) {
            if (mob === this || !(mob instanceof ZombiePigman) || mob.dead || mob.dying) continue;
            const adx = mob.x - this.x;
            const adz = mob.z - this.z;
            if (adx * adx + adz * adz < AGGRO_RANGE_SQ) {
                // Play angry sound for each newly aggroed pigman
                if (!mob.isAggro && typeof window.playMobSound === 'function') {
                    window.playMobSound('zpig', 'angry', mob.x, mob.y, mob.z, 0.6);
                }
                mob.isAggro = true;
                mob.aggroTimer = 20.0 + Math.random() * 20.0;
            }
        }
    } else {
        this.material.color.setHex(0xff8844);
    }
};
