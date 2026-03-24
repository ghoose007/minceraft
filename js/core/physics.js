// --- 4. PHYSICS & COLLISION ---
function raycastVoxel() {
    const dir = new THREE.Vector3();
    
    // In third-person mode, raycast from player's eyes in the direction they're looking,
    // not from the camera position (which is behind/in front of the player)
    let x, y, z;
    if (typeof cameraMode !== 'undefined' && cameraMode !== 0) {
        // Player look direction from yaw/pitch
        dir.set(
            -Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            -Math.cos(player.yaw) * Math.cos(player.pitch)
        );
        x = player.x;
        y = player.y + player.eyeLevel;
        z = player.z;
    } else {
        camera.getWorldDirection(dir);
        x = camera.position.x;
        y = camera.position.y;
        z = camera.position.z;
    }
    
    let lastX = Math.floor(x);
    let lastY = Math.floor(y);
    let lastZ = Math.floor(z);
    
    const step = 0.05;
    const maxDist = 5.0; 
    
    for (let t = 0; t < maxDist; t += step) {
        x += dir.x * step;
        y += dir.y * step;
        z += dir.z * step;
        
        const vx = Math.floor(x);
        const vy = Math.floor(y);
        const vz = Math.floor(z);
        
        const val = getVoxel(vx, vy, vz);
        const id = val & 0xFF;
        
        if (id !== 0 && !isFluidBlock(id)) {
            const bRaw = getBlockBounds(id, val, vx, vy, vz);
            const boundsList = Array.isArray(bRaw) ? bRaw : [bRaw]; // Allow Arrays
            
            for (let i = 0; i < boundsList.length; i++) {
                const b = boundsList[i];
                const localX = x - vx;
                const localY = y - vy;
                const localZ = z - vz;
                
                if (localX >= b.minX && localX <= b.maxX &&
                    localY >= b.minY && localY <= b.maxY &&
                    localZ >= b.minZ && localZ <= b.maxZ) {
                    
                    // FIXED: Calculate normal based on the closest AABB face to the hit point, 
                    // completely eliminating the [0,0,0] placement bug on complex blocks.
                    const dists = [
                        { n: [-1, 0, 0], d: Math.abs(localX - b.minX) },
                        { n: [1, 0, 0],  d: Math.abs(b.maxX - localX) },
                        { n: [0, -1, 0], d: Math.abs(localY - b.minY) },
                        { n: [0, 1, 0],  d: Math.abs(b.maxY - localY) },
                        { n: [0, 0, -1], d: Math.abs(localZ - b.minZ) },
                        { n: [0, 0, 1],  d: Math.abs(b.maxZ - localZ) }
                    ];

                    let normal = dists[0].n;
                    let minDist = dists[0].d;

                    for (let j = 1; j < 6; j++) {
                        if (dists[j].d < minDist) {
                            minDist = dists[j].d;
                            normal = dists[j].n;
                        }
                    }
                    
                    return { hit: [vx, vy, vz], normal: normal, id: id, val: val };
                }
            }
        }
        
        lastX = vx; lastY = vy; lastZ = vz;
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
                    // Exclude fluids, torches, roses, crops, vines, and tall grass
                    if (id !== 0 && !isFluidBlock(id) && id !== 17 && id !== 23 && id !== 64 && id !== 66 && id !== 90 && !isCrossBlock(id)) {
                        
                        const bRaw = getBlockBounds(id, val, bx, by, bz);
                        const boundsList = Array.isArray(bRaw) ? bRaw : [bRaw]; // Allow Arrays
                        
                        for (let i = 0; i < boundsList.length; i++) {
                            const b = boundsList[i];
                            const blockAABB = {
                                minX: bx + b.minX, maxX: bx + b.maxX,
                                minY: by + b.minY, maxY: by + b.maxY,
                                minZ: bz + b.minZ, maxZ: bz + b.maxZ
                            };
                            if (checkAABB(playerAABB, blockAABB)) {
                                collided = true;
                                break;
                            }
                        }
                        if (collided) break;
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
                if (id === 4) {
                    inWater = true;
                    waterLevel = Math.max(waterLevel, by + 0.8); 
                } else if (id === 27) {
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
    const isPlaying = (uiState === 'PLAYING');

    const fluid = checkFluidLevel(player.x, player.y, player.z, player.height);
    const isSneaking = keys.ShiftLeft && !player.flying && isPlaying;
    const isSprinting = (keys.ControlLeft || wDoubleTapped) && !isSneaking && keys.KeyW && isPlaying && gameMode === 'creative';
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
        if ((getVoxel(playerCenterX, checkY, playerCenterZ) & 0xFF) === 66) { onVine = true; break; }
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

    // Soul Sand slowdown: check block under player's feet
    if (!player.flying) {
        const feetBlockId = getVoxel(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z)) & 0xFF;
        if (feetBlockId === 92) {
            speed *= 0.4; // MC soul sand is roughly 60% slower
        }
    }

    // Ice slipperiness: very low friction/acceleration when standing on ice
    // MC ice has 0.98 slipperiness (vs normal 0.6) — player slides and has very sluggish control
    let _onIce = false;
    if (!player.flying && player.onGround) {
        const iceCheckId = getVoxel(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z)) & 0xFF;
        if (iceCheckId === 95) _onIce = true;
    }

    // Ice slipperiness: check block under player's feet
    // In MC, ice has very low friction — player slides and takes longer to stop/turn
    let onIce = false;
    if (!player.flying) {
        const iceCheckId = getVoxel(Math.floor(player.x), Math.floor(player.y - 0.1), Math.floor(player.z)) & 0xFF;
        if (iceCheckId === 95) onIce = true;
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

    // MC ice friction: acceleration is much lower so player slides
    // Normal ground accel = 10, air = 2, ice = 1.2 (very slippery)
    const accel = _onIce ? 1.0 : (player.onGround || player.flying || fluid.inWater || fluid.inLava ? 10.0 : 2.0); 
    player.vx += (targetVx - player.vx) * dt * accel;
    player.vz += (targetVz - player.vz) * dt * accel;

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
        }
    }

    let dx = player.vx * dt;
    let dy = player.vy * dt;
    let dz = player.vz * dt;

    const oldX = player.x;
    const oldZ = player.z;

    const STEP_HEIGHT = (player.onGround && !isSneaking && !fluid.inWater) ? 0.6 : 0;

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
            }
        } else {
            player.x = xResult.val;
            player.vx = 0; 
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
            }
        } else {
            player.z = zResult.val;
            player.vz = 0; 
        }
    } else {
        player.z += dz;
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

    const yResult = sweepAxis('y', dy, {x: player.x, y: player.y, z: player.z}, player.height);
    player.y = yResult.collided ? yResult.val : player.y + dy;
    
    if (yResult.collided) {
        if (player.vy < 0) {
            if (!player.onGround) {
                // Fall Damage
                const fallDist = player.highestY - player.y;
                if (gameMode === 'survival' && fallDist > 3.0 && !fluid.inWater && !fluid.inLava) {
                    const damage = Math.ceil(fallDist - 3.0);
                    player.health -= damage;
                    if (player.health < 0) player.health = 0;
                    
                    if (typeof triggerDamageShake === 'function') triggerDamageShake();
                    if (typeof updateHealthUI === 'function') updateHealthUI();

                    // Death check
                    if (player.health <= 0 && !player._dead) {
                        if (typeof window.killPlayer === 'function') window.killPlayer();
                    }
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

    // --- NETHER PORTAL CHECK ---
    // Use a timestamp-based cooldown so it survives dimension switching
    const now = performance.now();
    if (typeof window._lastPortalUse === 'undefined') window._lastPortalUse = 0;
    const isSwitching = (typeof _dimensionSwitching !== 'undefined' && _dimensionSwitching);
    if (!isSwitching && now - window._lastPortalUse > 4000) { // 4 second cooldown
        const px = Math.floor(player.x);
        const pzPortal = Math.floor(player.z);
        let inPortal = false;
        for (let checkY = Math.floor(player.y); checkY <= Math.floor(player.y + player.height); checkY++) {
            if ((getVoxel(px, checkY, pzPortal) & 0xFF) === 90) {
                inPortal = true;
                break;
            }
        }
        if (inPortal && typeof window.switchDimension === 'function') {
            window._lastPortalUse = now;
            window.switchDimension();
        }
    }

}