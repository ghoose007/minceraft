// ==========================================
// MOB CORE SYSTEM
// ==========================================

// ==========================================
// 14. MOBS & AI (PIGS)
// ==========================================

const globalMobs = [];
let mobMaterial = null;

function initMobMaterial() {
    if (mobMaterial) return;
    const texLoader = new THREE.TextureLoader();
    const tex = texLoader.load('textures/pig.png?v=' + ASSET_VERSION);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    
    mobMaterial = new THREE.MeshBasicMaterial({ 
        map: tex, 
        vertexColors: true, 
        side: THREE.FrontSide,
        transparent: true 
    });
    
    if (typeof injectLightingShader === 'function') {
        injectLightingShader(mobMaterial);
    }
}

function createMobBox(w, h, d, u, v, texW = 64, texH = 32) {
    const geo = new THREE.BoxGeometry(w / 16, h / 16, d / 16);
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
    
    setUV(0, u + d + w, v + d, d, h);     
    setUV(1, u, v + d, d, h);             
    setUV(2, u + d, v, w, d);             
    setUV(3, u + d + w, v, w, d);         
    setUV(4, u + d, v + d, w, h);         
    setUV(5, u + 2*d + w, v + d, w, h);   
    
    const colors = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const biomeTints = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));
    
    return geo;
}

// ==========================================
// MINECRAFT-STYLE MOB SHADOW SYSTEM
// ==========================================
// In real Minecraft, mob shadows are a semi-transparent circular texture
// projected onto the ground directly below the entity. The shadow:
// - Uses a radial gradient (fully opaque center → transparent edges)
// - Fades in opacity the further the mob is above the ground
// - Scales slightly smaller the higher the mob is
// - Sits on the ground surface (top of the highest solid block)
// - Is hidden when the mob is in water or when there's no ground below
// - Uses polygon offset to avoid z-fighting with terrain

let _mcShadowTex = null;
let _mcShadowMat = null;
let _mcShadowGeo = null;

function _getMCShadowTexture() {
    if (_mcShadowTex) return _mcShadowTex;
    
    // Generate a circular radial-gradient shadow texture (like MC's "shadow.png")
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Radial gradient: black center fading to transparent at edges
    const cx = size / 2, cy = size / 2, r = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');
    grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.85)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.4)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    
    _mcShadowTex = new THREE.CanvasTexture(canvas);
    _mcShadowTex.magFilter = THREE.LinearFilter;
    _mcShadowTex.minFilter = THREE.LinearFilter;
    return _mcShadowTex;
}

function _getMCShadowMat() {
    if (_mcShadowMat) return _mcShadowMat;
    _mcShadowMat = new THREE.MeshBasicMaterial({
        map: _getMCShadowTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        // Polygon offset prevents z-fighting with the ground surface
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        side: THREE.DoubleSide
    });
    return _mcShadowMat;
}

function _getMCShadowGeo() {
    if (_mcShadowGeo) return _mcShadowGeo;
    // Flat plane for the shadow decal
    _mcShadowGeo = new THREE.PlaneGeometry(1, 1);
    return _mcShadowGeo;
}

// Update shadow for a mob. Called from updateLighting.
// In MC, shadow is projected onto the highest solid block below the mob.
// opacity and scale decrease with height above ground.
// Hidden when: mob is dead/dying, mob is submerged in water, no ground below, 
// or mob is more than ~16 blocks above ground.
function _updateMobShadow(mob) {
    if (!mob.shadow) return;
    
    // Hide shadow if dead, dying, or fully submerged in water
    if (mob.dead || mob.dying || mob.inWater) {
        mob.shadow.visible = false;
        return;
    }
    
    const ix = Math.floor(mob.x), iz = Math.floor(mob.z);
    
    // Find the highest solid block directly below the mob
    const startY = Math.floor(mob.y);
    let groundY = -1;
    for (let by = startY; by >= Math.max(0, startY - 16); by--) {
        const id = getVoxel(ix, by, iz) & 0xFF;
        if (id !== 0 && !isFluidBlock(id) && !isCrossBlock(id) && id !== 17) {
            groundY = by;
            break;
        }
    }
    
    // No ground found within 16 blocks
    if (groundY < 0) {
        mob.shadow.visible = false;
        return;
    }
    
    // Height above ground surface
    const surfaceY = groundY + 1;
    const heightAbove = mob.y - surfaceY;
    
    // MC shadow maxes out at about 10-12 blocks above ground
    if (heightAbove > 12) {
        mob.shadow.visible = false;
        return;
    }
    
    mob.shadow.visible = true;
    
    // Position: on top of the ground block, slight offset to avoid z-fighting
    mob.shadow.position.set(mob.x, surfaceY + 0.005, mob.z);
    
    // Scale: base size is proportional to mob width, shrinks slightly with height
    // MC shadows are roughly mob-width sized
    const baseSize = Math.max(mob.width, 0.6) * 1.1;
    const heightFade = Math.max(0, 1.0 - heightAbove * 0.04);
    const scale = baseSize * (0.7 + 0.3 * heightFade);
    mob.shadow.scale.set(scale, scale, 1);
    
    // Opacity: fades as mob rises, MC goes from ~0.5 (on ground) to 0 (high up)
    const baseOpacity = 0.5;
    const opacity = baseOpacity * heightFade;
    
    // Update material opacity per-mob using a uniform or direct set
    // Since we share the material, we use mesh-level opacity via onBeforeRender
    mob._shadowOpacity = Math.max(0, opacity);
}

class Mob {
    constructor(x, y, z) {
        this.x = x; this.y = y; this.z = z;
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.yaw = Math.random() * Math.PI * 2;
        this.targetYaw = this.yaw;
        this.width = 0.9;  
        this.height = 0.9; 
        this.onGround = false;
        this.inWater = false;
        this.inLava  = false;
        this.state = 'idle';
        this.timer = 0;
        this.walkCycle = 0;
        
        this.health = 10;
        this.hurtTime = 0;
        this.dead = false;
        this.dying = false;   
        this.deathTimer = 0;

        // Fall damage tracking (same logic as player)
        this.highestY = y;
        // Fire/lava damage timer
        this._fireDmgTimer = 0;
        
        // Footstep sound tracking (distance-based, same as player)
        this._stepDistAccum = 0;
        this._lastStepX = x;
        this._lastStepZ = z;
        // Water sound tracking
        this._wasInWater = false;
        
        initMobMaterial();
        // FIX: Clone material only once per mob (needed for individual hurt tinting)
        // but share the shader injection from the base material  
        this.material = mobMaterial.clone(); 
        if (typeof injectLightingShader === 'function') injectLightingShader(this.material);
        // Force a unique shader program so onBeforeCompile actually runs for this clone
        this.material.customProgramCacheKey = function() { return 'mobMat'; };
        
        this.mesh = new THREE.Group();
        this.mesh.renderOrder = 0; 
        scene.add(this.mesh);

        // MC-style shadow: radial gradient circle projected on ground
        this.shadow = new THREE.Mesh(_getMCShadowGeo(), _getMCShadowMat().clone());
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.renderOrder = -1; // Render below everything else
        this._shadowOpacity = 0.5;
        scene.add(this.shadow);
        
        globalMobs.push(this);
    }
    
    _tickFootstep() {
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
        if (dist > 2.0 || dist < 0.001) return; // teleport or stationary
        
        this._stepDistAccum += dist;
        
        const STEP_DISTANCE = 1.7;
        if (this._stepDistAccum >= STEP_DISTANCE) {
            this._stepDistAccum -= STEP_DISTANCE;
            if (this._stepDistAccum > STEP_DISTANCE) this._stepDistAccum = 0;
            
            // Spatial footstep — PannerNode handles distance falloff and stereo panning
            if (typeof player !== 'undefined' && typeof window.playBlockSoundAt === 'function') {
                const footX = Math.floor(this.x);
                const footY = Math.floor(this.y - 0.05);
                const footZ = Math.floor(this.z);
                const blockId = getVoxel(footX, footY, footZ) & 0xFF;
                if (blockId === 0 || blockId === 4 || blockId === 27) return;
                
                window.playBlockSoundAt(blockId, 'step', 0.18, this.x, this.y, this.z);
            }
        }
    }
    
    checkCollision(x, y, z) {
        const w = this.width / 2;
        const mobAABB = {
            minX: x - w + 0.1, maxX: x + w - 0.1,
            minY: y, maxY: y + this.height - 0.1,
            minZ: z - w + 0.1, maxZ: z + w - 0.1
        };
        const sMinX = Math.floor(mobAABB.minX), sMaxX = Math.floor(mobAABB.maxX);
        const sMinY = Math.floor(mobAABB.minY), sMaxY = Math.floor(mobAABB.maxY);
        const sMinZ = Math.floor(mobAABB.minZ), sMaxZ = Math.floor(mobAABB.maxZ);
        
        let foundWater = false;
        let foundLava  = false;
        let collided = false;
        
        for (let bx = sMinX; bx <= sMaxX; bx++) {
            for (let by = sMinY; by <= sMaxY; by++) {
                for (let bz = sMinZ; bz <= sMaxZ; bz++) {
                    const val = getVoxel(bx, by, bz);
                    const id = val & 0xFF;
                    if (id === 4)  foundWater = true;
                    if (id === 27) foundLava  = true;
                    // Pass through non-solids
                    if (id === 0 || isFluidBlock(id) || isCrossBlock(id) || id === 17 || id === 23 || id === 64 || id === 66 || id === 90) continue;
                    
                    if (typeof getBlockBounds === 'function') {
                        const bRaw = getBlockBounds(id, val, bx, by, bz);
                        // FIXED: Array support prevents crashes on Glass Panes
                        const boundsList = Array.isArray(bRaw) ? bRaw : [bRaw];
                        
                        for (let i = 0; i < boundsList.length; i++) {
                            const b = boundsList[i];
                            const blockAABB = {
                                minX: bx + b.minX, maxX: bx + b.maxX,
                                minY: by + b.minY, maxY: by + b.maxY,
                                minZ: bz + b.minZ, maxZ: bz + b.maxZ
                            };
                            if (mobAABB.minX < blockAABB.maxX && mobAABB.maxX > blockAABB.minX &&
                                mobAABB.minY < blockAABB.maxY && mobAABB.maxY > blockAABB.minY &&
                                mobAABB.minZ < blockAABB.maxZ && mobAABB.maxZ > blockAABB.minZ) {
                                collided = true;
                            }
                        }
                    } else {
                        collided = true;
                    }
                }
            }
        }
        this.inWater = foundWater;
        this.inLava  = foundLava;
        return collided;
    }

    // FIXED: Calculates exact block height directly below the mob for slabs/snow
    getFloorY(nx, ny, nz) {
        const w = this.width / 2;
        const mobAABB = {
            minX: nx - w + 0.1, maxX: nx + w - 0.1,
            minZ: nz - w + 0.1, maxZ: nz + w - 0.1
        };
        const sMinX = Math.floor(mobAABB.minX), sMaxX = Math.floor(mobAABB.maxX);
        const sMinY = Math.floor(ny);
        const sMaxY = Math.floor(ny + 1.0);
        const sMinZ = Math.floor(mobAABB.minZ), sMaxZ = Math.floor(mobAABB.maxZ);

        let highestY = Math.floor(ny);

        for (let bx = sMinX; bx <= sMaxX; bx++) {
            for (let by = sMinY; by <= sMaxY; by++) {
                for (let bz = sMinZ; bz <= sMaxZ; bz++) {
                    const val = getVoxel(bx, by, bz);
                    const id = val & 0xFF;
                    if (id === 0 || isFluidBlock(id) || isCrossBlock(id) || id === 17 || id === 23 || id === 64 || id === 66 || id === 90) continue;
                    
                    if (typeof getBlockBounds === 'function') {
                        const bRaw = getBlockBounds(id, val, bx, by, bz);
                        const boundsList = Array.isArray(bRaw) ? bRaw : [bRaw];
                        
                        for (let i = 0; i < boundsList.length; i++) {
                            const b = boundsList[i];
                            const blockAABB = {
                                minX: bx + b.minX, maxX: bx + b.maxX,
                                maxY: by + b.maxY,
                                minZ: bz + b.minZ, maxZ: bz + b.maxZ
                            };
                            if (mobAABB.minX < blockAABB.maxX && mobAABB.maxX > blockAABB.minX &&
                                mobAABB.minZ < blockAABB.maxZ && mobAABB.maxZ > blockAABB.minZ) {
                                if (blockAABB.maxY > highestY && blockAABB.maxY <= this.y + 0.6) {
                                    highestY = blockAABB.maxY;
                                }
                            }
                        }
                    } else {
                        if (by + 1 > highestY && by + 1 <= this.y + 0.6) highestY = by + 1;
                    }
                }
            }
        }
        return highestY;
    }

    // FIXED: Centralized physics that stops bouncing by using getFloorY
    _applyPhysics(dt) {
        let needsJump = false;

        this.vy -= 28.0 * dt; // Gravity
        let nextY = this.y + this.vy * dt;

        if (this.checkCollision(this.x, nextY, this.z)) {
            if (this.vy < 0) {
                this.onGround = true;
                // FIXED: Snap exactly to the top of the snow layer/slab surface
                // This prevents the constant "falling/colliding" loop that causes bouncing.
                nextY = this.getFloorY(this.x, nextY, this.z);
            } else {
                nextY = this.y;
            }
            this.vy = 0;
        } else {
            this.onGround = false;
        }
        this.y = nextY;
        
        // ... (rest of horizontal physics)

        let nextX = this.x + this.vx * dt;
        if (this.checkCollision(nextX, this.y, this.z)) {
            if (this.onGround && !this.checkCollision(nextX, this.y + 0.6, this.z)) {
                this.y += 0.6;
                this.x = nextX;
                needsJump = true;
            } else {
                this.vx = 0;
            }
        } else {
            this.x = nextX;
        }

        let nextZ = this.z + this.vz * dt;
        if (this.checkCollision(this.x, this.y, nextZ)) {
            if (this.onGround && !this.checkCollision(this.x, this.y + 0.6, nextZ)) {
                this.y += 0.6;
                this.z = nextZ;
                needsJump = true;
            } else {
                this.vz = 0;
            }
        } else {
            this.z = nextZ;
        }

        return needsJump;
    }

    updateLighting() {
        const ix = Math.floor(this.x), iy = Math.floor(this.y + 0.5), iz = Math.floor(this.z);
        const pSun = getSunLight(ix, iy, iz) / 15.0;
        const pTorch = getTorchLight(ix, iy, iz) / 15.0;

        // Update MC-style shadow
        _updateMobShadow(this);
        if (this.shadow && this.shadow.visible) {
            this.shadow.material.opacity = this._shadowOpacity;
        }

        this.mesh.traverse(child => {
            if (child.isMesh && child.geometry.attributes.color) {
                const colors = child.geometry.attributes.color.array;
                let changed = false;
                for (let i = 0; i < colors.length; i += 3) {
                    if (Math.abs(colors[i] - pSun) > 0.01 || Math.abs(colors[i+1] - pTorch) > 0.01) {
                        colors[i] = pSun;
                        colors[i+1] = pTorch;
                        changed = true;
                    }
                }
                if (changed) child.geometry.attributes.color.needsUpdate = true;
            }
        });
    }

    takeDamage(amount, sourceX, sourceZ) {
        if (this.hurtTime > 0 || this.dying || this.dead) return;
        
        this.health -= amount;
        this.hurtTime = 0.5; 
        this.material.color.setHex(0xff7777); 
        
        // MC-style knockback: pushed away from attacker horizontally + small upward pop
        const dx = this.x - sourceX;
        const dz = this.z - sourceZ;
        const dist = Math.sqrt(dx*dx + dz*dz) || 1;
        this.vx = (dx / dist) * 5.0;
        this.vz = (dz / dist) * 5.0;
        this.vy = Math.max(this.vy, 3.5);
        this.onGround = false;
        
        if (this.health <= 0) {
            this.dying = true;
            this.deathTimer = 1.0; 
        }
    }
}

// ---- SHARED MOB HAZARD HELPERS ----

// Returns true if stepping one block in (vx,vz) direction would put the mob
// over a dangerous drop (> dropThreshold blocks) or directly into lava/fire.
// Used by passive AI and zombie passive wander to steer away from hazards.
function _mobStepIsDangerous(mob, vx, vz, dropThreshold = 3) {
    if (Math.abs(vx) < 0.001 && Math.abs(vz) < 0.001) return false;
    const len = Math.sqrt(vx * vx + vz * vz);
    const nx = vx / len;
    const nz = vz / len;

    // Look one half-width ahead so we catch edges before the mob steps off
    const probeX = Math.floor(mob.x + nx * (mob.width * 0.6 + 0.3));
    const probeZ = Math.floor(mob.z + nz * (mob.width * 0.6 + 0.3));
    const feetY  = Math.floor(mob.y);

    // Check for lava or fire at foot level in the probe column
    for (let dy = -1; dy <= 1; dy++) {
        const bid = getVoxel(probeX, feetY + dy, probeZ) & 0xFF;
        if (bid === 27 || bid === 89) return true; // lava or fire
    }

    // Scan downward from current foot level to find ground at probe position
    let groundY = feetY - 1;
    for (let sy = feetY; sy >= feetY - (dropThreshold + 1); sy--) {
        const bid = getVoxel(probeX, sy, probeZ) & 0xFF;
        if (bid !== 0 && !isFluidBlock(bid) && !isCrossBlock(bid)) {
            groundY = sy;
            break;
        }
    }
    const drop = feetY - groundY - 1;
    return drop > dropThreshold;
}

/**
 * Simple voxel raycast to check if there is a clear path between two points.
 */
function checkLineOfSight(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    const steps = Math.ceil(dist * 2.5);
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const px = Math.floor(x1 + dx * t);
        const py = Math.floor(y1 + dy * t);
        const pz = Math.floor(z1 + dz * t);
        
        const id = getVoxel(px, py, pz) & 0xFF;
        
        // Block vision if the voxel is solid (air, fluids, and foliage are transparent)
        if (id !== 0 && !isFluidBlock(id) && !isCrossBlock(id) && id !== 17 && id !== 18 && id !== 20 && id !== 90) {
            return false;
        }
    }
    return true;
}