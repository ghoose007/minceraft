// ==========================================
// SHEEP MOB
// ==========================================

// ==========================================
// Sheep texture is 64x32 — MC quadruped layout (same as pig):
//   HEAD  (8x6x6):   u=0, v=0   (but sheep head is 6 wide, 6 tall, 8 deep)
//   BODY  (6x8x16):  u=28, v=8  (horizontal, rotated 90° on X)
//   LEG   (4x12x4):  u=0, v=16
// Fur overlay uses sheep_fur.png (64x32) with same UV regions but inflated geometry (+1.5px)

let sheepMaterial = null;
let sheepFurMaterial = null;

function initSheepMaterial() {
    if (sheepMaterial) return;
    const tex = new THREE.TextureLoader().load('textures/sheep.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    sheepMaterial = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: false, alphaTest: 0.1 });
    if (typeof injectLightingShader === 'function') injectLightingShader(sheepMaterial);
    sheepMaterial.customProgramCacheKey = function() { return 'sheepMat'; };

    const furTex = new THREE.TextureLoader().load('textures/sheep_fur.png?v=' + ASSET_VERSION);
    furTex.magFilter = THREE.NearestFilter;
    furTex.minFilter = THREE.NearestFilter;
    sheepFurMaterial = new THREE.MeshBasicMaterial({ map: furTex, vertexColors: true, transparent: true, alphaTest: 0.1 });
    if (typeof injectLightingShader === 'function') injectLightingShader(sheepFurMaterial);
    sheepFurMaterial.customProgramCacheKey = function() { return 'sheepFurMat'; };
}

class Sheep extends Mob {
    constructor(x, y, z) {
        super(x, y, z);

        this.width = 0.9;
        this.height = 1.3;
        this.health = 8;
        this.hasFur = true;

        initSheepMaterial();
        if (this.material) this.material.dispose();
        this.material = sheepMaterial.clone();
        if (typeof injectLightingShader === 'function') injectLightingShader(this.material);
        this.material.customProgramCacheKey = function() { return 'sheepMatInst'; };

        this.furMaterial = sheepFurMaterial.clone();
        if (typeof injectLightingShader === 'function') injectLightingShader(this.furMaterial);
        this.furMaterial.customProgramCacheKey = function() { return 'sheepFurMatInst'; };

        const M = this.material;
        const FM = this.furMaterial;
        const TEX_W = 64, TEX_H = 32;

        // MC ModelSheep2 — built following the exact same pattern as the working Pig model
        // Sheep is like a pig but with: 12px legs (not 6), 6x6x8 head (not 8x8x8), 8x16x6 body (not 10x16x8)
        // Pig reference: legs at y=6/16, body at y=10/16, head at y=12/16 z=6/16
        // Sheep: legs at y=12/16, body at y=16/16, head at y=18/16 z=6/16

        // --- HEAD (6w × 6h × 8d) at UV(0,0) ---
        this.headGroup = new THREE.Group();
        const headGeo = createMobBox(6, 6, 8, 0, 0, TEX_W, TEX_H);
        headGeo.translate(0, 0, 4/16);
        const headMesh = new THREE.Mesh(headGeo, M);
        this.headGroup.add(headMesh);
        
        // FIXED: Raised Y up to 18/16 
        this.headGroup.position.set(0, 18/16, 6/16);
        this.mesh.add(this.headGroup);

        // --- BODY (8w × 16l × 6h) at UV(28,8) — horizontal (rotated 90° on X like pig) ---
        const bodyGeo = createMobBox(8, 16, 6, 28, 8, TEX_W, TEX_H);
        this.body = new THREE.Mesh(bodyGeo, M);
        this.body.rotation.x = Math.PI / 2;
        this.body.position.set(0, 15/16, 0);
        this.mesh.add(this.body);

        // --- FUR OVERLAY BODY ---
        const furBodyGeo = createMobBox(8, 16, 6, 28, 8, TEX_W, TEX_H);
        this.furBody = new THREE.Mesh(furBodyGeo, FM);
        this.furBody.rotation.x = Math.PI / 2;
        this.furBody.position.set(0, 15/16, 0);
        this.furBody.scale.set(1.18, 1.08, 1.25);
        this.mesh.add(this.furBody);

        // --- LEGS (4×12×4) at UV(0,16) ---
        const legGeo = createMobBox(4, 12, 4, 0, 16, TEX_W, TEX_H);
        legGeo.translate(0, -6/16, 0);

        // FIXED: X is now 2.5/16 (perfectly between the original 3/16 and the tight 2/16)
        this.leg1 = new THREE.Mesh(legGeo, M);
        this.leg1.position.set(2.5/16, 12/16, 5/16);
        
        this.leg2 = new THREE.Mesh(legGeo, M);
        this.leg2.position.set(-2.5/16, 12/16, 5/16);
        
        this.leg3 = new THREE.Mesh(legGeo, M);
        this.leg3.position.set(2.5/16, 12/16, -5/16);
        
        this.leg4 = new THREE.Mesh(legGeo, M);
        this.leg4.position.set(-2.5/16, 12/16, -5/16);
        
        this.mesh.add(this.leg1, this.leg2, this.leg3, this.leg4);

        // --- FUR OVERLAY LEGS ---
        const furLegGeo = createMobBox(4, 6, 4, 0, 16, TEX_W, TEX_H);
        furLegGeo.translate(0, -3/16, 0);
        const furLegScale = [1.15, 1.08, 1.15];

        // FIXED: Matched the new 2.5/16 X-axis width
        this.furLeg1 = new THREE.Mesh(furLegGeo, FM);
        this.furLeg1.position.set(2.5/16, 12/16, 5/16);
        this.furLeg1.scale.set(...furLegScale);
        
        this.furLeg2 = new THREE.Mesh(furLegGeo, FM);
        this.furLeg2.position.set(-2.5/16, 12/16, 5/16);
        this.furLeg2.scale.set(...furLegScale);
        
        this.furLeg3 = new THREE.Mesh(furLegGeo, FM);
        this.furLeg3.position.set(2.5/16, 12/16, -5/16);
        this.furLeg3.scale.set(...furLegScale);
        
        this.furLeg4 = new THREE.Mesh(furLegGeo, FM);
        this.furLeg4.position.set(-2.5/16, 12/16, -5/16);
        this.furLeg4.scale.set(...furLegScale);
        
        this.mesh.add(this.furLeg1, this.furLeg2, this.furLeg3, this.furLeg4);
    }

    _setFurVisible(visible) {
        this.furBody.visible = visible;
        this.furLeg1.visible = visible;
        this.furLeg2.visible = visible;
        this.furLeg3.visible = visible;
        this.furLeg4.visible = visible;
    }

    // --- ADD THIS BLOCK HERE ---
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
        const dist = Math.sqrt((this.x - this._lastStepX)**2 + (this.z - this._lastStepZ)**2);
        this._lastStepX = this.x; 
        this._lastStepZ = this.z;
        if (dist > 2.0 || dist < 0.001) return;
        this._stepDistAccum += dist;
        
        // This triggers the specific 'sheep' sound category defined in sounds.js
        if (this._stepDistAccum >= 1.3) {
            this._stepDistAccum = 0;
            if (typeof window.playMobSound === 'function') {
                window.playMobSound('sheep', 'step', this.x, this.y, this.z, 0.2); 
            }
        }
    }

    update(dt) {
    if (this.dead) {
        scene.remove(this.mesh);
        scene.remove(this.shadow);
        this.mesh.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
        if (this.material) this.material.dispose();
        if (this.furMaterial) this.furMaterial.dispose();
        const idx = globalMobs.indexOf(this);
        if (idx !== -1) globalMobs.splice(idx, 1);
        return;
    }

    if (this.dying) {
        this.deathTimer -= dt;
        this.mesh.rotation.z += (Math.PI / 2 - this.mesh.rotation.z) * dt * 5.0;
        this.material.opacity = Math.max(0, this.deathTimer);
        this.furMaterial.opacity = Math.max(0, this.deathTimer);
        if (this.deathTimer <= 0) {
            this.dead = true;
            if (typeof window.spawnSmoke === 'function') {
                for (let i = 0; i < 8; i++) {
                    window.spawnSmoke(this.x + (Math.random() - 0.5) * 0.8, this.y + 0.5 + Math.random() * 0.5, this.z + (Math.random() - 0.5) * 0.8);
                }
            }
            // Drop 1 wool if sheep still has fur
            if (this.hasFur && typeof spawnDroppedItem === 'function') {
                spawnDroppedItem(this.x, this.y + 0.5, this.z, 34, 1); // White wool = ID 34
            }
            // Also drop raw mutton (porkchop ID 122 as placeholder)
            const dropCount = 1 + Math.floor(Math.random() * 2);
            if (typeof spawnDroppedItem === 'function') spawnDroppedItem(this.x, this.y + 0.5, this.z, 122, dropCount);
            if (typeof window.spawnMobDeathXP === 'function') window.spawnMobDeathXP(this.x, this.y, this.z, 'sheep');
            return;
        }
        this.vy -= 28.0 * dt;
        let nextY = this.y + this.vy * dt;
        const savedHeight = this.height;
        this.height = 0.5;
        if (this.checkCollision(this.x, nextY, this.z)) { if (this.vy < 0) nextY = this.getFloorY(this.x, nextY, this.z); this.vy = 0; }
        this.height = savedHeight;
        this.y = nextY;
        this.mesh.position.set(this.x, this.y, this.z);
        return;
    }

    if (this.hurtTime > 0) { this.hurtTime -= dt; if (this.hurtTime <= 0) { this.material.color.setHex(0xffffff); this.furMaterial.color.setHex(0xffffff); } }

    // --- REQUIRED ADDITION: AMBIENT SOUNDS ---
    if (this._ambientTimer === undefined) this._ambientTimer = 3.0 + Math.random() * 5.0;
    this._ambientTimer -= dt;
    if (this._ambientTimer <= 0) {
        this._ambientTimer = 8.0 + Math.random() * 12.0;
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('sheep', 'say', this.x, this.y, this.z, 0.4);
        }
    }

    if (this._stuckTimer === undefined) this._initPathState();

    // --- SAME AI AS PIG ---
    this.timer -= dt;

    if (this.state === 'panic') {
        if (this.timer <= 0) {
            this.state = 'idle';
            this.timer = 2.0 + Math.random() * 2.0;
        } else {
            const fleeSpeed = 4.5;
            const fleeDx = this.x - (this._panicSourceX || this.x);
            const fleeDz = this.z - (this._panicSourceZ || this.z);
            const fleeAngle = Math.atan2(fleeDx, fleeDz) + (Math.sin(globalTime * 8) * 0.3);
            this.targetYaw = fleeAngle;
            this.vx = Math.sin(fleeAngle) * fleeSpeed;
            this.vz = Math.cos(fleeAngle) * fleeSpeed;
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

    let diff = this.targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * dt * (this.state === 'panic' ? 6.0 : 2.0);

    if (this.state === 'wander') {
        const speed = 2.0;
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
        if (this._checkStuck(dt, 1.2)) {
            this._stuckTimer = 0;
            this.targetYaw = this.yaw + Math.PI * (0.5 + Math.random());
            this.timer = Math.min(this.timer, 0.5);
        }
    } else if (this.state !== 'panic') {
        this.vx *= Math.exp(-10 * dt);
        this.vz *= Math.exp(-10 * dt);
    }

    if (this.inWater && Math.random() < 0.15) window.spawnWaterSplash(this.x, this.y, this.z);

    if (this._pendingJump) {
        this.vy = 8.2;
        this.onGround = false;
        this._pendingJump = false;
    }
    const needsJump = this._applyPhysics(dt);
    if (needsJump && this.onGround && (this.state === 'wander' || this.state === 'panic') && this._jumpCooldown <= 0) {
        this._pendingJump = true;
        this._jumpCooldown = 0.4;
    }
    if (this._jumpCooldown > 0) this._jumpCooldown -= dt;

    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    this._tickFootstep();

    // --- ANIMATIONS ---
    this._setFurVisible(this.hasFur);

    if (this.state === 'idle') {
        this.walkCycle = 0;
        this.leg1.rotation.x += (0 - this.leg1.rotation.x) * dt * 10.0;
        this.leg2.rotation.x += (0 - this.leg2.rotation.x) * dt * 10.0;
        this.leg3.rotation.x += (0 - this.leg3.rotation.x) * dt * 10.0;
        this.leg4.rotation.x += (0 - this.leg4.rotation.x) * dt * 10.0;
        // Fur legs follow base legs
        this.furLeg1.rotation.x = this.leg1.rotation.x;
        this.furLeg2.rotation.x = this.leg2.rotation.x;
        this.furLeg3.rotation.x = this.leg3.rotation.x;
        this.furLeg4.rotation.x = this.leg4.rotation.x;
        // Head look at player
        const dx = player.x - this.x, dy = (player.y + player.eyeLevel) - (this.y + 18/16), dz = player.z - this.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        if (distSq < 64) {
            const targetYaw = Math.atan2(dx, dz);
            let headYaw = targetYaw - this.yaw;
            while (headYaw > Math.PI) headYaw -= Math.PI * 2;
            while (headYaw < -Math.PI) headYaw += Math.PI * 2;
            headYaw = Math.max(-1.2, Math.min(1.2, headYaw));
            const distXZ = Math.sqrt(dx*dx + dz*dz);
            let headPitch = Math.atan2(-dy, distXZ);
            headPitch = Math.max(-0.8, Math.min(0.8, headPitch));
            this.headGroup.rotation.y += (headYaw - this.headGroup.rotation.y) * dt * 5.0;
            this.headGroup.rotation.x += (headPitch - this.headGroup.rotation.x) * dt * 5.0;
        } else {
            this.headGroup.rotation.y += (Math.sin(globalTime * 1.5) * 0.3 - this.headGroup.rotation.y) * dt * 5.0;
            this.headGroup.rotation.x += (Math.sin(globalTime * 1.0) * 0.2 - this.headGroup.rotation.x) * dt * 5.0;
        }
    } else {
        this.headGroup.rotation.y += (0 - this.headGroup.rotation.y) * dt * 5.0;
        this.headGroup.rotation.x += (0 - this.headGroup.rotation.x) * dt * 5.0;
        const legSpeed = this.state === 'panic' ? 18.0 : 10.0;
        this.walkCycle += dt * legSpeed;
        const legRot = Math.sin(this.walkCycle) * 0.8;
        this.leg1.rotation.x = legRot; this.leg4.rotation.x = legRot;
        this.leg2.rotation.x = -legRot; this.leg3.rotation.x = -legRot;
        this.furLeg1.rotation.x = legRot; this.furLeg4.rotation.x = legRot;
        this.furLeg2.rotation.x = -legRot; this.furLeg3.rotation.x = -legRot;
    }

    _tickMobEnvironmentDamage(this, dt);
    const onFire = this.inLava || (getVoxel(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) & 0xFF) === 89;
    _tickMobFireMeshes(this, onFire);

    // Ensure the mob renders behind transparent water when submerged
    const targetOrder = this.inWater ? 0 : 5; 
    if (this.mesh.renderOrder !== targetOrder) {
        this.mesh.renderOrder = targetOrder;
        this.mesh.traverse(c => { if (c.isMesh) c.renderOrder = targetOrder; });
    }

    this.updateLighting();
}
}

Sheep.prototype.takeDamage = function(amount, sourceX, sourceZ) {
    const wasDead = this.dying || this.dead;
    
    // Call base damage logic for health reduction and knockback
    Mob.prototype.takeDamage.call(this, amount, sourceX, sourceZ);
    
    if (!wasDead && (this.dying || this.dead)) {
        // FIXED: Play death sound using 'say' fallback since there is no sheep_death.ogg
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('sheep', 'death', this.x, this.y, this.z, 0.5);
        }
    } else if (!this.dying && !this.dead) {
        // FIXED: Trigger Panic Flee AI
        this.state = 'panic';
        this.timer = 2.0 + Math.random() * 1.5;
        this._panicSourceX = sourceX;
        this._panicSourceZ = sourceZ;
        
        // FIXED: Play hurt sound (uses pitched-up ambient sounds)
        if (typeof window.playMobSound === 'function') {
            window.playMobSound('sheep', 'say', this.x, this.y, this.z, 0.5, 1.1, 1.3);
        }
    }
};


// ==========================================
// SKELETON MOB (passive wander with held axe)