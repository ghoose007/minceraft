// ==========================================
// COW MOB
// ==========================================

let cowMaterial = null;

function initCowMaterial() {
    if (cowMaterial) return;
    const tex = new THREE.TextureLoader().load('textures/cow.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    cowMaterial = new THREE.MeshBasicMaterial({
        map: tex, vertexColors: true, side: THREE.FrontSide, alphaTest: 0.1, transparent: true
    });
    if (typeof injectLightingShader === 'function') injectLightingShader(cowMaterial);
    cowMaterial.customProgramCacheKey = function() { return 'cowMat'; };
}

class Cow extends Mob {
    constructor(x, y, z) {
        super(x, y, z);
        this.width = 0.9;
        this.height = 1.4;
        this.health = 10;

        initCowMaterial();
        if (this.material) this.material.dispose();
        this.material = cowMaterial.clone();
        if (typeof injectLightingShader === 'function') injectLightingShader(this.material);
        this.material.customProgramCacheKey = function() { return 'cowMatInst'; };

        const M = this.material;
        const TEX_W = 64, TEX_H = 64;

        // MC Cow model (ModelCow): 64x64 texture
        // Head:  addBox(-4, -4, -6, 8, 8, 6)  at UV(0,0)  → 8w × 8h × 6d
        // Body:  addBox(-6, -10, -7, 12, 18, 10) at UV(18,4) → 12w × 18d × 10h (rotated 90° on X)
        // Legs:  addBox(-2, 0, -2, 4, 12, 4)   at UV(0,16) → 4w × 12h × 4d
        // Horns: addBox(-1, -3, -1, 1, 3, 1) each side

        // --- HEAD (8w × 8h × 6d) at UV(0,0) ---
        // MC: addBox(-4, -4, -6, 8, 8, 6) at pivot (0, 20, -8)
        // No separate snout mesh in Java MC — the nose is painted on the head front face
        this.headGroup = new THREE.Group();
        const headGeo = createMobBox(8, 8, 6, 0, 0, TEX_W, TEX_H);
        headGeo.translate(0, 0, 3/16); // Center offset: head extends in +Z (forward)
        this.headGroup.add(new THREE.Mesh(headGeo, M));

        // Horns at UV(22,0) — 1w × 3h × 1d
        // MC Right horn: addBox(-4, -5, -4, 1, 3, 1) relative to head pivot
        // In our coords relative to head center: x=-3.5/16, y=+3.5/16, z=+0.5/16
        const hornR = createMobBox(1, 3, 1, 22, 0, TEX_W, TEX_H);
        hornR.translate(-4.5/16, 3.5/16, 0.5/16);
        this.headGroup.add(new THREE.Mesh(hornR, M));
        // MC Left horn: addBox(3, -5, -4, 1, 3, 1) relative to head pivot
        const hornL = createMobBox(1, 3, 1, 22, 0, TEX_W, TEX_H);
        hornL.translate(4.5/16, 3.5/16, 0.5/16);
        this.headGroup.add(new THREE.Mesh(hornL, M));

        // Head pivot: MC cow head is at y=20, z=8 (in pixels from ground)
        // Body center is at y=13/16, so head sits above at y=20/16 forward at z=8/16
        this.headGroup.position.set(0, 20/16, 8/16);
        this.mesh.add(this.headGroup);

        // --- BODY (12w × 18d × 10h) at UV(18,4) rotated horizontal ---
        const bodyGeo = createMobBox(12, 18, 10, 18, 4, TEX_W, TEX_H);
        // Fix back face UVs (-Z face = face 5) — flip vertically to correct rotation artifact
        const bUvs = bodyGeo.attributes.uv.array;
        // Face 5 is at indices 40-47 (8 floats per face). Swap top/bottom V pairs.
        const tmpV0 = bUvs[41], tmpV1 = bUvs[43];
        bUvs[41] = bUvs[45]; bUvs[43] = bUvs[47];
        bUvs[45] = tmpV0; bUvs[47] = tmpV1;
        bodyGeo.attributes.uv.needsUpdate = true;

        const bodyMesh = new THREE.Mesh(bodyGeo, M);
        bodyMesh.rotation.x = Math.PI / 2; // Rotate so the long axis runs along Z
        bodyMesh.position.set(0, 17/16, 0);  // Center of body
        this.mesh.add(bodyMesh);

        // --- 4 LEGS (4w × 12h × 4d) at UV(0,16) ---
        // Each leg geometry: pivot at top, extends downward
        // MC legs: offset(-2, 0, -2) means pivot is at top of leg
        const makeLeg = () => {
            const geo = createMobBox(4, 12, 4, 0, 16, TEX_W, TEX_H);
            geo.translate(0, -6/16, 0); // center offset so pivot is at top
            return new THREE.Mesh(geo, M);
        };

        // Front-right, front-left, back-right, back-left
        // MC positions: front legs at z=+7, back at z=-5 (with body centered)
        // Width: ±4 from center
        this.legFR = makeLeg();
        this.legFR.position.set(-4/16, 12/16, 7/16);
        this.legFL = makeLeg();
        this.legFL.position.set(4/16, 12/16, 7/16);
        this.legBR = makeLeg();
        this.legBR.position.set(-4/16, 12/16, -5/16);
        this.legBL = makeLeg();
        this.legBL.position.set(4/16, 12/16, -5/16);

        this.mesh.add(this.legFR); this.mesh.add(this.legFL);
        this.mesh.add(this.legBR); this.mesh.add(this.legBL);
    }

    _tickFootstep() {
        if (this._lastStepX === undefined) { this._lastStepX = this.x; this._lastStepZ = this.z; this._stepDistAccum = 0; }
        if (!this.onGround || this.dead || this.dying) { this._stepDistAccum = 0; this._lastStepX = this.x; this._lastStepZ = this.z; return; }
        const dx = this.x - this._lastStepX, dz = this.z - this._lastStepZ;
        this._lastStepX = this.x; this._lastStepZ = this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2.0 || dist < 0.001) return;
        this._stepDistAccum += dist;
        if (this._stepDistAccum >= 1.4) {
            this._stepDistAccum -= 1.4;
            if (typeof window.playMobSound === 'function') window.playMobSound('cow', 'step', this.x, this.y, this.z, 0.2);
        }
    }

    update(dt) {
        if (this.dead) {
            scene.remove(this.mesh); scene.remove(this.shadow);
            this.mesh.traverse(c => { if (c.isMesh) c.geometry.dispose(); });
            if (this.material) this.material.dispose();
            const idx = globalMobs.indexOf(this); if (idx !== -1) globalMobs.splice(idx, 1);
            return;
        }

        if (this.dying) {
            this.deathTimer -= dt;
            this.mesh.rotation.z += (Math.PI / 2 - this.mesh.rotation.z) * dt * 5.0;
            this.material.opacity = Math.max(0, this.deathTimer);
            if (this.deathTimer <= 0) {
                this.dead = true;
                if (typeof window.spawnSmoke === 'function') {
                    for (let i = 0; i < 8; i++) window.spawnSmoke(this.x + (Math.random()-0.5)*0.8, this.y + 0.5 + Math.random()*0.5, this.z + (Math.random()-0.5)*0.8);
                }
                const dropCount = 1 + Math.floor(Math.random() * 3);
                if (typeof spawnDroppedItem === 'function') spawnDroppedItem(this.x, this.y + 0.5, this.z, 122, dropCount); // Raw Porkchop
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

        // Ambient sounds
        if (this._ambientTimer === undefined) this._ambientTimer = 3 + Math.random() * 5;
        this._ambientTimer -= dt;
        if (this._ambientTimer <= 0) {
            this._ambientTimer = 6 + Math.random() * 10;
            if (typeof window.playMobSound === 'function') window.playMobSound('cow', 'say', this.x, this.y, this.z, 0.4);
        }

        // Sun burning
        const isBurning = this.inLava || (getVoxel(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) & 0xFF) === 89;
        _tickMobFireMeshes(this, isBurning);
        _tickMobEnvironmentDamage(this, dt);

        // Initialize jump state if needed
        if (this._jumpCooldown === undefined) { this._jumpCooldown = 0; this._pendingJump = false; }

        // Passive AI with panic flee
        this.timer -= dt;
        if (this.state === 'panic') {
            if (this.timer <= 0) {
                this.state = 'idle'; this.timer = 2.0 + Math.random() * 2.0;
            } else {
                const fleeSpeed = 4.5;
                const fleeDx = this.x - (this._panicSourceX || this.x);
                const fleeDz = this.z - (this._panicSourceZ || this.z);
                const fleeAngle = Math.atan2(fleeDx, fleeDz) + (Math.sin(globalTime * 8) * 0.3);
                this.targetYaw = fleeAngle;
                this.vx = Math.sin(fleeAngle) * fleeSpeed;
                this.vz = Math.cos(fleeAngle) * fleeSpeed;
                if (this.onGround && _mobStepIsDangerous(this, this.vx, this.vz)) {
                    const sideAngle = fleeAngle + (Math.random() < 0.5 ? Math.PI/2 : -Math.PI/2);
                    this.targetYaw = sideAngle;
                    this.vx = Math.sin(sideAngle) * fleeSpeed;
                    this.vz = Math.cos(sideAngle) * fleeSpeed;
                }
            }
        } else {
            if (this.timer <= 0) {
                if (Math.random() < 0.4) { this.state = 'idle'; this.timer = 2 + Math.random() * 3; }
                else { this.state = 'wander'; this.timer = 3 + Math.random() * 4; this.targetYaw = this.yaw + (Math.random()-0.5) * Math.PI * 2; }
            }
        }
        const COW_SPEED = 1.5;
        if (this.state === 'wander') {
            const vxC = Math.sin(this.yaw) * COW_SPEED;
            const vzC = Math.cos(this.yaw) * COW_SPEED;
            if (this.onGround && (_mobStepIsDangerous(this, vxC, vzC) || _mobWallAhead(this, vxC, vzC))) {
                this.state = 'idle'; this.timer = 1 + Math.random() * 1.5;
                this.targetYaw = this.yaw + Math.PI + (Math.random()-0.5) * Math.PI;
                this.vx *= 0.1; this.vz *= 0.1;
            } else { this.vx = vxC; this.vz = vzC; }
        } else if (this.state !== 'panic') { this.vx *= Math.exp(-8 * dt); this.vz *= Math.exp(-8 * dt); }

        let diff = this.targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * dt * (this.state === 'panic' ? 6.0 : 3.5);

        if (this._pendingJump) { this.vy = 8.2; this.onGround = false; this._pendingJump = false; }
        const needsJump = this._applyPhysics(dt);
        if (needsJump && this.onGround && this._jumpCooldown <= 0 && (this.state === 'wander' || this.state === 'panic')) { this._pendingJump = true; this._jumpCooldown = 0.4; }
        if (this._jumpCooldown > 0) this._jumpCooldown -= dt;

        this.mesh.position.set(this.x, this.y, this.z);
        this.mesh.rotation.y = this.yaw;
        this._tickFootstep();

        const speed = Math.sqrt(this.vx*this.vx + this.vz*this.vz);
        const isMoving = speed > 0.15;
        this.walkCycle += dt * (isMoving ? (this.state === 'panic' ? 10.0 : 5.0) : 0);
        if (isMoving) {
            const swing = Math.sin(this.walkCycle) * 0.8;
            // Diagonal pairs: FR+BL together, FL+BR together (like real quadruped walk)
            this.legFR.rotation.x += (swing - this.legFR.rotation.x) * dt * 12;
            this.legBL.rotation.x += (swing - this.legBL.rotation.x) * dt * 12;
            this.legFL.rotation.x += (-swing - this.legFL.rotation.x) * dt * 12;
            this.legBR.rotation.x += (-swing - this.legBR.rotation.x) * dt * 12;
        } else {
            // Smoothly return to rest when stopped
            this.legFR.rotation.x += (0 - this.legFR.rotation.x) * dt * 8;
            this.legFL.rotation.x += (0 - this.legFL.rotation.x) * dt * 8;
            this.legBR.rotation.x += (0 - this.legBR.rotation.x) * dt * 8;
            this.legBL.rotation.x += (0 - this.legBL.rotation.x) * dt * 8;
        }

        const idleYaw = Math.sin(globalTime * 1.2) * 0.25;
        const idlePitch = Math.sin(globalTime * 0.8) * 0.15;
        this.headGroup.rotation.y += (idleYaw - this.headGroup.rotation.y) * dt * 4;
        this.headGroup.rotation.x += (idlePitch - this.headGroup.rotation.x) * dt * 4;

        this.updateLighting();
    }
}

Cow.prototype.takeDamage = function(amount, sourceX, sourceZ) {
    if (this.hurtTime > 0 || this.dying || this.dead) return;
    this.health -= amount;
    this.hurtTime = 0.5;
    this.material.color.setHex(0xff7777);
    const dx = this.x - sourceX, dz = this.z - sourceZ;
    const dist = Math.sqrt(dx*dx + dz*dz) || 1;
    this.vx = (dx/dist)*5; this.vz = (dz/dist)*5; this.vy = Math.max(this.vy, 3.5); this.onGround = false;

    if (this.health <= 0) {
        this.dying = true; this.deathTimer = 1.0;
        if (typeof window.playMobSound === 'function') window.playMobSound('cow', 'hurt', this.x, this.y, this.z, 0.6);
    } else {
        if (typeof window.playMobSound === 'function') window.playMobSound('cow', 'hurt', this.x, this.y, this.z, 0.6);
        // Panic flee
        this.state = 'panic';
        this.timer = 2.0 + Math.random() * 1.5;
        this._panicSourceX = sourceX;
        this._panicSourceZ = sourceZ;
    }
};
