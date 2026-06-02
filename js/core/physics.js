// --- 4. PHYSICS & COLLISION ---
const _rayDir = new THREE.Vector3(); // Reusable — avoid allocation per frame
function raycastVoxel() {
    const dir = _rayDir;
    
    let ox, oy, oz;
    if (typeof cameraMode !== 'undefined' && cameraMode !== 0) {
        dir.set(
            -Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            -Math.cos(player.yaw) * Math.cos(player.pitch)
        );
        ox = player.x;
        oy = player.y + player.eyeLevel;
        oz = player.z;
    } else {
        camera.getWorldDirection(dir);
        ox = camera.position.x;
        oy = camera.position.y;
        oz = camera.position.z;
    }
    
    const maxDist = 5.0;

    // DDA raycast — steps exactly one voxel boundary at a time
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dir.x >= 0 ? 1 : -1;
    const stepY = dir.y >= 0 ? 1 : -1;
    const stepZ = dir.z >= 0 ? 1 : -1;

    // Distance along ray to next voxel boundary on each axis
    const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? (x + 1 - ox) : (ox - x)) / Math.abs(dir.x)) : Infinity;
    let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? (y + 1 - oy) : (oy - y)) / Math.abs(dir.y)) : Infinity;
    let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? (z + 1 - oz) : (oz - z)) / Math.abs(dir.z)) : Infinity;

    let normal = [0, 0, 0];
    let t = 0;

    for (let i = 0; i < 200; i++) {
        // Step to next voxel boundary
        if (tMaxX < tMaxY && tMaxX < tMaxZ) {
            t = tMaxX;
            x += stepX;
            tMaxX += tDeltaX;
            normal = [-stepX, 0, 0];
        } else if (tMaxY < tMaxZ) {
            t = tMaxY;
            y += stepY;
            tMaxY += tDeltaY;
            normal = [0, -stepY, 0];
        } else {
            t = tMaxZ;
            z += stepZ;
            tMaxZ += tDeltaZ;
            normal = [0, 0, -stepZ];
        }

        if (t > maxDist) break;

        const val = getVoxel(x, y, z);
        const id = val & 0xFF;

        if (id !== 0 && !isFluidBlock(id)) {
            // In survival, skip portal blocks — they are non-interactable
            if ((id === 90 || id === 209) && typeof gameMode !== 'undefined' && gameMode !== 'creative') continue;
            
            // For full blocks, the DDA hit is exact
            const exactX = ox + dir.x * t;
            const exactY = oy + dir.y * t;
            const exactZ = oz + dir.z * t;

            // For non-full blocks (slabs, stairs), verify the ray actually hits the AABB
            const b = getBlockBounds(id, val, x, y, z);
            const localX = exactX - x;
            const localY = exactY - y;
            const localZ = exactZ - z;

            // Fine-step through this voxel to check custom bounds
            let hit = false;
            if (localX >= b.minX - 0.001 && localX <= b.maxX + 0.001 &&
                localY >= b.minY - 0.001 && localY <= b.maxY + 0.001 &&
                localZ >= b.minZ - 0.001 && localZ <= b.maxZ + 0.001) {
                hit = true;
            }
            
            // Check stair upper bounds
            if (!hit && typeof isStairBlock === 'function' && isStairBlock(id)) {
                const ub = getStairUpperBounds(id, val);
                if (ub && localX >= ub.minX - 0.001 && localX <= ub.maxX + 0.001 &&
                    localY >= ub.minY - 0.001 && localY <= ub.maxY + 0.001 &&
                    localZ >= ub.minZ - 0.001 && localZ <= ub.maxZ + 0.001) {
                    hit = true;
                }
            }

            // For slabs/stairs that weren't hit at the voxel boundary, do a fine sub-step
            if (!hit) {
                const exitT = Math.min(tMaxX, tMaxY, tMaxZ);
                for (let st = t; st < exitT; st += 0.02) {
                    const lx = ox + dir.x * st - x;
                    const ly = oy + dir.y * st - y;
                    const lz = oz + dir.z * st - z;
                    if (lx >= b.minX && lx <= b.maxX && ly >= b.minY && ly <= b.maxY && lz >= b.minZ && lz <= b.maxZ) {
                        hit = true;
                        // Recompute normal for the sub-block hit
                        const prevLx = ox + dir.x * (st - 0.02) - x;
                        const prevLy = oy + dir.y * (st - 0.02) - y;
                        const prevLz = oz + dir.z * (st - 0.02) - z;
                        if (prevLx < b.minX) normal = [-1, 0, 0];
                        else if (prevLx > b.maxX) normal = [1, 0, 0];
                        else if (prevLy < b.minY) normal = [0, -1, 0];
                        else if (prevLy > b.maxY) normal = [0, 1, 0];
                        else if (prevLz < b.minZ) normal = [0, 0, -1];
                        else if (prevLz > b.maxZ) normal = [0, 0, 1];
                        break;
                    }
                    // Also check stair upper
                    if (typeof isStairBlock === 'function' && isStairBlock(id)) {
                        const ub = getStairUpperBounds(id, val);
                        if (ub && lx >= ub.minX && lx <= ub.maxX && ly >= ub.minY && ly <= ub.maxY && lz >= ub.minZ && lz <= ub.maxZ) {
                            hit = true; break;
                        }
                    }
                    // Check piston head in next block
                    if (!hit && (id === 207 || id === 208) && typeof getPistonHeadCollision === 'function') {
                        const phc = getPistonHeadCollision(id, val, x, y, z);
                        if (phc) {
                            const plx = (ox + dir.x * t) - phc.bx;
                            const ply = (oy + dir.y * t) - phc.by;
                            const plz = (oz + dir.z * t) - phc.bz;
                            if (plx >= phc.bounds.minX && plx <= phc.bounds.maxX && ply >= phc.bounds.minY && ply <= phc.bounds.maxY && plz >= phc.bounds.minZ && plz <= phc.bounds.maxZ) {
                                hit = true; break;
                            }
                        }
                    }
                }
            }

            if (hit) {
                return { hit: [x, y, z], normal: normal, id: id, val: val, exactHit: [ox + dir.x * t, oy + dir.y * t, oz + dir.z * t] };
            }
        }
    }
    return null;
}

// Raycast that hits fluid source blocks (for bucket pickup)
function raycastFluidSource() {
    const dir = new THREE.Vector3();
    let ox, oy, oz;
    if (typeof cameraMode !== 'undefined' && cameraMode !== 0) {
        dir.set(-Math.sin(player.yaw)*Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw)*Math.cos(player.pitch));
        ox = player.x; oy = player.y + player.eyeLevel; oz = player.z;
    } else {
        camera.getWorldDirection(dir);
        ox = camera.position.x; oy = camera.position.y; oz = camera.position.z;
    }
    const maxDist = 5.0;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dir.x >= 0 ? 1 : -1, stepY = dir.y >= 0 ? 1 : -1, stepZ = dir.z >= 0 ? 1 : -1;
    const tDeltaX = dir.x !== 0 ? Math.abs(1/dir.x) : Infinity;
    const tDeltaY = dir.y !== 0 ? Math.abs(1/dir.y) : Infinity;
    const tDeltaZ = dir.z !== 0 ? Math.abs(1/dir.z) : Infinity;
    let tMaxX = dir.x !== 0 ? ((dir.x > 0 ? (x+1-ox) : (ox-x)) / Math.abs(dir.x)) : Infinity;
    let tMaxY = dir.y !== 0 ? ((dir.y > 0 ? (y+1-oy) : (oy-y)) / Math.abs(dir.y)) : Infinity;
    let tMaxZ = dir.z !== 0 ? ((dir.z > 0 ? (z+1-oz) : (oz-z)) / Math.abs(dir.z)) : Infinity;
    let normal = [0,0,0], t = 0;
    for (let i = 0; i < 200; i++) {
        if (tMaxX < tMaxY && tMaxX < tMaxZ) { t=tMaxX; x+=stepX; tMaxX+=tDeltaX; normal=[-stepX,0,0]; }
        else if (tMaxY < tMaxZ) { t=tMaxY; y+=stepY; tMaxY+=tDeltaY; normal=[0,-stepY,0]; }
        else { t=tMaxZ; z+=stepZ; tMaxZ+=tDeltaZ; normal=[0,0,-stepZ]; }
        if (t > maxDist) break;
        const val = getVoxel(x,y,z), id = val & 0xFF;
        if (id !== 0 && !isFluidBlock(id)) return null; // Hit solid block first
        if (isFluidBlock(id) && ((val >> 13) & 0x1) === 1) {
            return { hit: [x,y,z], normal: normal, id: id, val: val };
        }
    }
    return null;
}

function checkAABB(aabb1, aabb2) {
    return (aabb1.minX < aabb2.maxX && aabb1.maxX > aabb2.minX &&
            aabb1.minY < aabb2.maxY && aabb1.maxY > aabb2.minY &&
            aabb1.minZ < aabb2.maxZ && aabb1.maxZ > aabb2.minZ);
}

function sweepAxis(axis, dist, pos, height) {
    if (dist === 0) return { collided: false, val: pos[axis] };

    const steps = Math.ceil(Math.abs(dist) / 0.1);
    const stepDist = dist / steps;

    const minX = Math.floor(pos.x - PLAYER_WIDTH / 2);
    const maxX = Math.floor(pos.x + PLAYER_WIDTH / 2);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + height);
    const minZ = Math.floor(pos.z - PLAYER_WIDTH / 2);
    const maxZ = Math.floor(pos.z + PLAYER_WIDTH / 2);

    for (let i = 0; i < steps; i++) {
        pos[axis] += stepDist;
        const playerAABB = {
            minX: pos.x - PLAYER_WIDTH / 2, maxX: pos.x + PLAYER_WIDTH / 2,
            minY: pos.y, maxY: pos.y + height,
            minZ: pos.z - PLAYER_WIDTH / 2, maxZ: pos.z + PLAYER_WIDTH / 2
        };

        let collided = false;
        const sMinX = Math.floor(playerAABB.minX);
        const sMaxX = Math.floor(playerAABB.maxX);
        const sMinY = Math.floor(playerAABB.minY);
        const sMaxY = Math.floor(playerAABB.maxY);
        const sMinZ = Math.floor(playerAABB.minZ);
        const sMaxZ = Math.floor(playerAABB.maxZ);

        for (let bx = sMinX; bx <= sMaxX; bx++) {
            for (let by = sMinY; by <= sMaxY; by++) {
                for (let bz = sMinZ; bz <= sMaxZ; bz++) {
                    const val = getVoxel(bx, by, bz);
                    const id = val & 0xFF;
                    // Exclude fluids, torches, roses, crops, vines, and tall grass from physical body collision
                    if (id !== 0 && !isFluidBlock(id) && id !== 17 && id !== 206 && id !== 23 && id !== 64 && id !== 66 && id !== 90 && id !== 209 && !isCrossBlock(id)) {
                        const b = getBlockBounds(id, val, bx, by, bz);
                        const blockAABB = {
                            minX: bx + b.minX, maxX: bx + b.maxX,
                            minY: by + b.minY, maxY: by + b.maxY,
                            minZ: bz + b.minZ, maxZ: bz + b.maxZ
                        };
                        if (checkAABB(playerAABB, blockAABB)) {
                            collided = true;
                            break;
                        }
                        // Stairs have a second AABB for the upper step
                        if (typeof isStairBlock === 'function' && isStairBlock(id)) {
                            const ub = getStairUpperBounds(id, val);
                            if (ub) {
                                const upperAABB = {
                                    minX: bx + ub.minX, maxX: bx + ub.maxX,
                                    minY: by + ub.minY, maxY: by + ub.maxY,
                                    minZ: bz + ub.minZ, maxZ: bz + ub.maxZ
                                };
                                if (checkAABB(playerAABB, upperAABB)) {
                                    collided = true;
                                    break;
                                }
                            }
                        }
                        // Extended piston: head+arm occupy next block space
                        if (!collided && (id === 207 || id === 208) && ((val >> 11) & 0x1)) {
                            const pdir = (val >> 8) & 0x7;
                            const pdvs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
                            const pdv = pdvs[pdir];
                            const hbx = bx+pdv[0], hby = by+pdv[1], hbz = bz+pdv[2];
                            const headAABB = { minX:hbx, maxX:hbx+1, minY:hby, maxY:hby+1, minZ:hbz, maxZ:hbz+1 };
                            if (checkAABB(playerAABB, headAABB)) {
                                collided = true; break;
                            }
                        }
                    }
                }
                if (collided) break;
            }
            if (collided) break;
        }

        if (collided) {
            pos[axis] -= stepDist; 
            return { collided: true, val: pos[axis] };
        }
    }
    return { collided: false, val: pos[axis] };
}

function checkFluidLevel(px, py, pz, height) {
    const minX = Math.floor(px - PLAYER_WIDTH / 2);
    const maxX = Math.floor(px + PLAYER_WIDTH / 2);
    const minZ = Math.floor(pz - PLAYER_WIDTH / 2);
    const maxZ = Math.floor(pz + PLAYER_WIDTH / 2);
    
    let inWater = false;
    let waterLevel = 0;
    let inLava = false;
    
    const eyeY = py + height - 0.2; 
    
    for (let bx = minX; bx <= maxX; bx++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
            for (let by = Math.floor(py); by <= Math.floor(eyeY); by++) {
                const id = getVoxel(bx, by, bz) & 0xFF;
                if (id === BLOCK_IDS.WATER) {
                    inWater = true;
                    waterLevel = Math.max(waterLevel, by + 0.8); 
                } else if (id === BLOCK_IDS.LAVA) {
                    inLava = true;
                }
            }
        }
    }
    
    return { 
        inWater: inWater, 
        waterDepth: inWater ? (waterLevel - py) : 0,
        submerged: inWater && (eyeY < waterLevel),
        inLava: inLava
    };
}

function movePlayer(dt) {
    if (dt > 0.1) dt = 0.1;
    const isPlaying = (uiState === 'PLAYING') && !(window.MinecraftChat && window.MinecraftChat.isOpen && window.MinecraftChat.isOpen());

    const fluid = checkFluidLevel(player.x, player.y, player.z, player.height);
    const isSneaking = keys.ShiftLeft && !player.flying && isPlaying;
    const _canSprint = (gameMode === 'creative') || (gameMode === 'survival' && typeof GEN_HUNGER_ENABLED !== 'undefined' && GEN_HUNGER_ENABLED && player.hunger >= 6);
    const isSprinting = (keys.ControlLeft || wDoubleTapped) && !isSneaking && keys.KeyW && isPlaying && _canSprint;
    player.isSprinting = isSprinting; 
    
    player.height = isSneaking ? CROUCH_HEIGHT : NORMAL_HEIGHT;
    player.eyeLevel = isSneaking ? CROUCH_EYE_LEVEL : NORMAL_EYE_LEVEL;

    // Check if player is touching a vine block (for climbing)
    const playerCenterX = Math.floor(player.x);
    const playerFeetY = Math.floor(player.y);
    const playerBodyY = Math.floor(player.y + 0.8);
    const playerCenterZ = Math.floor(player.z);
    let onVine = false;
    for (let checkY = playerFeetY; checkY <= playerBodyY; checkY++) {
        if ((getVoxel(playerCenterX, checkY, playerCenterZ) & 0xFF) === BLOCK_IDS.VINE) { onVine = true; break; }
    }

    // Track highest point for fall damage
    if (player.onGround || player.flying || fluid.inWater || fluid.inLava || onVine) {
        player.highestY = player.y;
    } else {
        if (player.y > player.highestY) player.highestY = player.y;
    }

    let speed = isSneaking ? SNEAK_SPEED : (isSprinting ? SPRINT_SPEED : WALK_SPEED);
    if (player.flying) speed = isSprinting ? FLIGHT_SPRINT_SPEED : FLIGHT_SPEED;
    
    if (fluid.inWater) {
        speed = WALK_SPEED * 0.5;
        if (player.flying) player.flying = false;
    } else if (fluid.inLava) {
        speed = WALK_SPEED * 0.3;
        if (player.flying) player.flying = false;
    }
    // v288: slow player while eating (MC uses ~0.2x walk speed)
    if (player.eatItemId && player.eatTimer > 0) {
        speed *= 0.2;
    }

    // Soul Sand slowdown: check block under player's feet
    if (!player.flying) {
        const feetBlockId = getVoxel(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z)) & 0xFF;
        if (feetBlockId === BLOCK_IDS.SOUL_SAND) {
            speed *= 0.4; // MC soul sand is roughly 60% slower
        }
    }

    // Ice slipperiness: MC ice = 0.98, packed ice = 0.989 (vs normal ground 0.6)
    // This translates to much lower acceleration so the player slides
    // MC accel formula: accel = 0.1 * (0.6/slip)^3 where slip is block slipperiness
    // Normal (0.6): accel ≈ 0.1, Ice (0.98): accel ≈ 0.023, Packed Ice (0.989): accel ≈ 0.022
    let _iceSlip = 0;
    if (!player.flying && player.onGround) {
        const iceCheckId = getVoxel(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z)) & 0xFF;
        if (iceCheckId === BLOCK_IDS.ICE) _iceSlip = 0.98;        // Ice
        else if (iceCheckId === BLOCK_IDS.PACKED_ICE) _iceSlip = 0.989;  // Packed Ice
    }

    const yaw = player.yaw;
    let inputX = 0;
    let inputZ = 0;

    if (isPlaying) {
        // Collect raw inputs
        if (keys.KeyW) inputZ += 1;
        if (keys.KeyS) inputZ -= 1;
        if (keys.KeyA) inputX -= 1; 
        if (keys.KeyD) inputX += 1;
    }

    let targetVx = 0;
    let targetVz = 0;

    // FIX: Normalize diagonal movement
    if (inputX !== 0 || inputZ !== 0) {
        const length = Math.sqrt(inputX * inputX + inputZ * inputZ);
        inputX /= length;
        inputZ /= length;

        // Apply rotation and speed to normalized inputs
        targetVx = (inputX * Math.cos(yaw) - inputZ * Math.sin(yaw)) * speed;
        targetVz = (inputX * Math.sin(yaw) + inputZ * Math.cos(yaw)) * -speed;
    }

    // MC-accurate acceleration: ice uses slipperiness-based formula
    let accel;
    if (_iceSlip > 0) {
        const slip3 = (0.6 / _iceSlip) * (0.6 / _iceSlip) * (0.6 / _iceSlip);
        accel = slip3 * 2.0;  // scaled for our dt-based system
    } else {
        accel = (player.onGround || player.flying || fluid.inWater || fluid.inLava) ? 10.0 : 2.0;
    }
    player.vx += (targetVx - player.vx) * dt * accel;
    player.vz += (targetVz - player.vz) * dt * accel;

    // --- WATER FLOW PUSH (player) ---
    // MC applies ~0.014 blocks/tick² horizontal acceleration in flow direction = 0.28/s² at 20tps
    if (fluid.inWater && typeof getWaterFlowDirection === 'function') {
        const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
        const flow = getWaterFlowDirection(px, py, pz);
        const FLOW_FORCE = 5.6; // MC 0.014 * 20tps * 20 (our accel scaling)
        player.vx += flow.x * FLOW_FORCE * dt;
        player.vz += flow.z * FLOW_FORCE * dt;
    }

    if (player.flying) {
        player.vy = 0;
        if (isPlaying) {
            if (keys.Space) player.vy = speed;
            if (keys.ShiftLeft) player.vy = -speed;
        }
    } else if (onVine && !player.flying) {
        // Vine climbing: similar to MC ladder mechanics
        if (player.vy < -2.0) player.vy = -2.0; // Slow falling on vine
        if (keys.Space && isPlaying) {
            player.vy = 2.5; // Climb up
        } else if (keys.ShiftLeft && isPlaying) {
            player.vy = 0; // Hold position (sneak on vine)
            player.vx *= 0.5;
            player.vz *= 0.5;
        } else {
            player.vy -= GRAVITY * 0.05 * dt; // Very slow descent
            if (player.vy < -2.0) player.vy = -2.0;
        }
    } else if (fluid.inWater || fluid.inLava) {
        player.vy -= GRAVITY * 0.2 * dt; 
        if (player.vy < -4.0) player.vy = -4.0;
        if (keys.Space && isPlaying) {
            player.vy += JUMP_FORCE * 1.5 * dt; 
            if (player.vy > 3.0) player.vy = 3.0;
        }
    } else {
        player.vy -= GRAVITY * dt;
        if (player.onGround && keys.Space && isPlaying) {
            player.vy = JUMP_FORCE;
            player.onGround = false;
            // v291: MC sprint-jump horizontal boost. In MC, jumping while
            // sprinting adds a one-shot horizontal velocity kick in the
            // direction the player is facing (~0.2 blocks/tick = ~4 m/s in
            // our units). This is what makes sprint-jumping in MC feel
            // noticeably faster than sprint-running — without it, jumps
            // slow you down because air acceleration is reduced.
            if (player.isSprinting) {
                const fx = -Math.sin(player.yaw);
                const fz = -Math.cos(player.yaw);
                const BOOST = 1.5;
                player.vx += fx * BOOST;
                player.vz += fz * BOOST;
            }
            // v284: jump exhaustion. Sprint jump = 0.2, regular jump = 0.05.
            if (typeof window.addExhaustion === 'function') {
                window.addExhaustion(player.isSprinting ? 0.2 : 0.05);
            }
        }
    }

    // v382: combine player movement with separate combat knockback.
    // Input acceleration keeps controlling vx/vz, while knockback decays independently.
    const playerKbFriction = player.onGround ? 10.0 : 4.0;
    const totalPlayerVx = player.vx + (player.knockbackX || 0);
    const totalPlayerVz = player.vz + (player.knockbackZ || 0);

    let dx = totalPlayerVx * dt;
    let dy = player.vy * dt;
    let dz = totalPlayerVz * dt;

    const oldX = player.x;
    const oldZ = player.z;

    const STEP_HEIGHT = (player.onGround && !isSneaking && !fluid.inWater) ? 0.6 : 0;

    let _blockedX = false, _blockedZ = false;

    const xResult = sweepAxis('x', dx, {x: player.x, y: player.y, z: player.z}, player.height);
    if (xResult.collided) {
        if (STEP_HEIGHT > 0 && player.onGround && !isSneaking) {
            const steppedY = player.y + STEP_HEIGHT;
            const xStepResult = sweepAxis('x', dx, {x: player.x, y: steppedY, z: player.z}, player.height);
            if (!xStepResult.collided) {
                const tmpX = player.x + dx;
                const dropResult = sweepAxis('y', -STEP_HEIGHT, {x: tmpX, y: steppedY, z: player.z}, player.height);
                player.x = tmpX;
                player.y = dropResult.collided ? dropResult.val : steppedY - STEP_HEIGHT;
                player.onGround = dropResult.collided;
            } else {
                player.x = xResult.val;
                player.vx = 0;
                player.knockbackX = 0;
                _blockedX = true;
            }
        } else {
            player.x = xResult.val;
            player.vx = 0; 
            _blockedX = true;
        }
    } else {
        player.x += dx;
    }

    const zResult = sweepAxis('z', dz, {x: player.x, y: player.y, z: player.z}, player.height);
    if (zResult.collided) {
        if (STEP_HEIGHT > 0 && player.onGround && !isSneaking) {
            const steppedY = player.y + STEP_HEIGHT;
            const zStepResult = sweepAxis('z', dz, {x: player.x, y: steppedY, z: player.z}, player.height);
            if (!zStepResult.collided) {
                const tmpZ = player.z + dz;
                const dropResult = sweepAxis('y', -STEP_HEIGHT, {x: player.x, y: steppedY, z: tmpZ}, player.height);
                player.z = tmpZ;
                player.y = dropResult.collided ? dropResult.val : steppedY - STEP_HEIGHT;
                player.onGround = dropResult.collided;
            } else {
                player.z = zResult.val;
                player.vz = 0;
                player.knockbackZ = 0;
                _blockedZ = true;
            }
        } else {
            player.z = zResult.val;
            player.vz = 0; 
            _blockedZ = true;
        }
    } else {
        player.z += dz;
    }


    // v430: Indev Island hard world border. The ocean continues visually at
    // the edge, but movement is blocked at the 256x256 playable boundary.
    if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 7) {
        const margin = 0.31;
        const minX = -WORLD_WIDTH / 2 + margin;
        const maxX =  WORLD_WIDTH / 2 - margin;
        const minZ = -WORLD_DEPTH / 2 + margin;
        const maxZ =  WORLD_DEPTH / 2 - margin;
        if (player.x < minX) { player.x = minX; player.vx = 0; player.knockbackX = 0; }
        if (player.x > maxX) { player.x = maxX; player.vx = 0; player.knockbackX = 0; }
        if (player.z < minZ) { player.z = minZ; player.vz = 0; player.knockbackZ = 0; }
        if (player.z > maxZ) { player.z = maxZ; player.vz = 0; player.knockbackZ = 0; }
    }

    const playerKbDecay = Math.exp(-playerKbFriction * dt);
    player.knockbackX = (player.knockbackX || 0) * playerKbDecay;
    player.knockbackZ = (player.knockbackZ || 0) * playerKbDecay;
    if (Math.abs(player.knockbackX) < 0.02) player.knockbackX = 0;
    if (Math.abs(player.knockbackZ) < 0.02) player.knockbackZ = 0;

    // --- AUTOJUMP (mobile only) ---
    if (typeof window.isMobileMode === 'function' && window.isMobileMode() &&
        player.onGround && !isSneaking && !fluid.inWater && !fluid.inLava && !player.flying &&
        (inputX !== 0 || inputZ !== 0) && (_blockedX || _blockedZ)) {
        // Use intended movement direction, not dx/dz (which are 0 after wall collision)
        const intendedDx = targetVx * dt;
        const intendedDz = targetVz * dt;
        const jumpY = player.y + 1.01;
        let canClear = false;
        if (_blockedX && intendedDx !== 0) {
            canClear = !sweepAxis('x', intendedDx, {x: player.x, y: jumpY, z: player.z}, player.height).collided;
        }
        if (!canClear && _blockedZ && intendedDz !== 0) {
            canClear = !sweepAxis('z', intendedDz, {x: player.x, y: jumpY, z: player.z}, player.height).collided;
        }
        if (canClear) {
            player.vy = JUMP_FORCE;
            player.onGround = false;
        }
    }

    if (isSneaking && player.onGround && !fluid.inWater) {
        const dropResult = sweepAxis('y', -0.1, {x: player.x, y: player.y, z: player.z}, player.height);
        if (!dropResult.collided) {
            player.x = oldX;
            player.z = oldZ;
            player.vx = 0;
            player.vz = 0;
        }
    }

    // v284: sprint-movement exhaustion (0.1 per meter sprinted)
    if (player.isSprinting && player.onGround) {
        const _dxMoved = player.x - oldX;
        const _dzMoved = player.z - oldZ;
        const _moved = Math.sqrt(_dxMoved * _dxMoved + _dzMoved * _dzMoved);
        if (_moved > 0.0001 && typeof window.addExhaustion === 'function') {
            window.addExhaustion(0.1 * _moved);
        }
    }

    const yResult = sweepAxis('y', dy, {x: player.x, y: player.y, z: player.z}, player.height);
    player.y = yResult.collided ? yResult.val : player.y + dy;
    
    if (yResult.collided) {
        if (player.vy < 0) {
            if (!player.onGround) {
                // Fall Damage
                const fallDist = player.highestY - player.y;
                if (gameMode === 'survival' && fallDist > 3.0 && !fluid.inWater && !fluid.inLava) {
                    const damage = Math.ceil(fallDist - 3.0);
                    window.applyPlayerDamage(damage);
                }
                player.highestY = player.y;

                // Landing particles — only when the fall would cause damage (fallDist > 3.0)
                if (fallDist > 3.0 && typeof spawnParticles === 'function') {
                    const lx = Math.floor(player.x);
                    const lz = Math.floor(player.z);
                    const ly = Math.floor(player.y) - 1;
                    const landedBlockId = getVoxel(lx, ly, lz) & 0xFF;
                    if (landedBlockId !== 0 && landedBlockId !== 4 && landedBlockId !== 27) {
                        spawnParticles(lx, ly + 1, lz, landedBlockId);
                    }
                }

                // Landing Bob
                if (player.vy < -7.0) {
                    player.landingImpact = Math.min(Math.abs(player.vy) * 0.005, 0.08); 
                }
            }
            player.onGround = true;
        }
        player.vy = 0;
    } else {
        player.onGround = false;
    }

    if (player.y < -10) {
        player.vy = 0;
        player.y = getHighestBlock(Math.floor(player.x), Math.floor(player.z)) + 2;
    }

    if (fluid.submerged) {
        const overlay = document.getElementById('underwater-overlay');
        overlay.style.opacity = '1';
        overlay.style.backgroundColor = fluid.inLava ? 'rgba(255, 60, 0, 0.7)' : 'rgba(0, 30, 100, 0.5)';
    } else {
        document.getElementById('underwater-overlay').style.opacity = '0';
    }

// Splash particles for player floating/moving in water
    if (fluid.inWater && !fluid.submerged) { // FIX: Don't spawn if submerged
        const isPlayerMoving = Math.abs(player.vx) > 0.1 || Math.abs(player.vz) > 0.1;
        const spawnChance = isPlayerMoving ? 0.06 : 0.015; 
        if (Math.random() < spawnChance) {
            window.spawnWaterSplash(player.x, player.y, player.z);
        }
    }

    // --- PORTAL CHECK (Nether + Aether) ---
    const now = performance.now();
    if (typeof window._lastPortalUse === 'undefined') window._lastPortalUse = 0;
    const isSwitching = (typeof _dimensionSwitching !== 'undefined' && _dimensionSwitching);
    if (!isSwitching && !(typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 7) && now - window._lastPortalUse > 4000) { // 4 second cooldown
        const checkXs = [Math.floor(player.x), Math.floor(player.x + 0.3), Math.floor(player.x - 0.3)];
        const checkZs = [Math.floor(player.z), Math.floor(player.z + 0.3), Math.floor(player.z - 0.3)];
        let inPortal = false;
        let inAetherPortal = false;
        outer:
        for (const cpx of checkXs) {
            for (const cpz of checkZs) {
                for (let checkY = Math.floor(player.y); checkY <= Math.floor(player.y + player.height); checkY++) {
                    const bid = getVoxel(cpx, checkY, cpz) & 0xFF;
                    if (bid === BLOCK_IDS.NETHER_PORTAL) {
                        inPortal = true;
                        break outer;
                    }
                    if (bid === BLOCK_IDS.AETHER_PORTAL) {
                        inAetherPortal = true;
                        break outer;
                    }
                }
            }
        }
        if (inPortal && typeof window.switchDimension === 'function') {
            window._lastPortalUse = now;
            window.switchDimension();
        } else if (inAetherPortal && typeof window.switchDimension === 'function') {
            window._lastPortalUse = now;
            window.switchDimension();
        }
    }

}