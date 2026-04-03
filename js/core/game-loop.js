// ==========================================
// MAIN GAME LOOP
// ==========================================

// --- Cached function-existence checks (avoids 50+ typeof checks per frame) ---
// Populated once on first animate() call when all scripts are loaded.
let _fnCacheReady = false;
let _fn_updateClock, _fn_doRandomTicks, _fn_updateMobs, _fn_tickMobSpawning;
let _fn_updateArrows, _fn_tickSpawnerBlocks, _fn_updateTNTEntities;
let _fn_updateHerobrineEntities, _fn_tickEnchantBooks, _fn_updateXPOrbs, _fn_tickRedstone;
let _fn_soundUpdateListener, _fn_soundCheckDigTick, _fn_soundCheckFootsteps;
let _fn_soundCheckWaterSplash, _fn_soundCheckSwim, _fn_soundCheckAmbientFluids;
let _fn_getTargetedMob, _fn_breakBlock, _fn_damageHeldTool, _fn_addToInventory;
let _fn_playItemSound, _fn_playFizzSound, _fn_spawnFireSmoke, _fn_spawnWaterSplash;
let _fn_playWaterSplashAt, _fn_igniteTNT, _fn_animatePlayerModel;
let _fn_updateThirdPersonCamera, _fn_updateFireEffects, _fn_getWaterFlowDirection;

function _cacheFunctionRefs() {
    _fn_updateClock = typeof updateClock === 'function' ? updateClock : null;
    _fn_doRandomTicks = typeof doRandomTicks === 'function' ? doRandomTicks : null;
    _fn_updateMobs = typeof updateMobs === 'function' ? updateMobs : null;
    _fn_tickMobSpawning = typeof tickMobSpawning === 'function' ? tickMobSpawning : null;
    _fn_updateArrows = typeof updateArrows === 'function' ? updateArrows : null;
    _fn_tickSpawnerBlocks = typeof tickSpawnerBlocks === 'function' ? tickSpawnerBlocks : null;
    _fn_updateTNTEntities = typeof updateTNTEntities === 'function' ? updateTNTEntities : null;
    _fn_updateHerobrineEntities = typeof window.updateHerobrineEntities === 'function' ? window.updateHerobrineEntities : null;
    _fn_tickEnchantBooks = typeof window._tickEnchantBooks === 'function' ? window._tickEnchantBooks : null;
    _fn_updateXPOrbs = typeof window.updateXPOrbs === 'function' ? window.updateXPOrbs : null;
    _fn_tickRedstone = typeof window.tickRedstone === 'function' ? window.tickRedstone : null;
    _fn_soundUpdateListener = typeof window._soundUpdateListener === 'function' ? window._soundUpdateListener : null;
    _fn_soundCheckDigTick = typeof window._soundCheckDigTick === 'function' ? window._soundCheckDigTick : null;
    _fn_soundCheckFootsteps = typeof window._soundCheckFootsteps === 'function' ? window._soundCheckFootsteps : null;
    _fn_soundCheckWaterSplash = typeof window._soundCheckWaterSplash === 'function' ? window._soundCheckWaterSplash : null;
    _fn_soundCheckSwim = typeof window._soundCheckSwim === 'function' ? window._soundCheckSwim : null;
    _fn_soundCheckAmbientFluids = typeof window._soundCheckAmbientFluids === 'function' ? window._soundCheckAmbientFluids : null;
    _fn_getTargetedMob = typeof window.getTargetedMob === 'function' ? window.getTargetedMob : null;
    _fn_breakBlock = typeof window.breakBlock === 'function' ? window.breakBlock : null;
    _fn_damageHeldTool = typeof window.damageHeldTool === 'function' ? window.damageHeldTool : null;
    _fn_addToInventory = typeof window.addToInventory === 'function' ? window.addToInventory : null;
    _fn_playItemSound = typeof window.playItemSound === 'function' ? window.playItemSound : null;
    _fn_playFizzSound = typeof window.playFizzSound === 'function' ? window.playFizzSound : null;
    _fn_spawnFireSmoke = typeof window.spawnFireSmoke === 'function' ? window.spawnFireSmoke : null;
    _fn_spawnWaterSplash = typeof window.spawnWaterSplash === 'function' ? window.spawnWaterSplash : null;
    _fn_playWaterSplashAt = typeof window.playWaterSplashAt === 'function' ? window.playWaterSplashAt : null;
    _fn_igniteTNT = typeof window.igniteTNT === 'function' ? window.igniteTNT : null;
    _fn_animatePlayerModel = typeof animatePlayerModel === 'function' ? animatePlayerModel : null;
    _fn_updateThirdPersonCamera = typeof updateThirdPersonCamera === 'function' ? updateThirdPersonCamera : null;
    _fn_updateFireEffects = typeof window.updateFireEffects === 'function' ? window.updateFireEffects : null;
    _fn_getWaterFlowDirection = typeof getWaterFlowDirection === 'function' ? getWaterFlowDirection : null;
    _fnCacheReady = true;
}

// --- Cached DOM elements (avoid getElementById every frame) ---
let _cachedOverlayEl = null;
let _cachedDebugEl = null;

// --- Helper: refresh whichever survival UI is currently open ---
function refreshOpenUI() {
    if (uiState === 'INVENTORY' || uiState === 'CRAFTING') {
        if (typeof renderInventory === 'function') renderInventory();
    } else if (uiState === 'FURNACE') {
        if (typeof renderFurnace === 'function') renderFurnace();
    } else if (uiState === 'CHEST') {
        if (typeof renderChest === 'function') renderChest();
    } else if (uiState === 'ENCHANTING') {
        if (typeof renderEnchanting === 'function') renderEnchanting();
    }
}

// --- Helper: dispose and clean up a particle ---
function _disposeParticle(p) {
    scene.remove(p.mesh);
    if (p.mesh.onBeforeRender) p.mesh.onBeforeRender = null;
    if (p.isSmoke && p.mesh.material) p.mesh.material.dispose();
    if (p.mesh.geometry && p.mesh.geometry.userData && p.mesh.geometry.userData.refCount !== undefined) {
        p.mesh.geometry.userData.refCount--;
        if (p.mesh.geometry.userData.refCount <= 0) p.mesh.geometry.dispose();
    }
}

// --- LAVA POP & SMOKE TRAIL RESOURCES (Noise-Based) ---
let lavaPopMaterial = null;
const MAX_SMOKE_TRAILS = 30;

function createNoiseTexture(colorBase, variation, isFieryShape = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    
    // Clear to transparent
    ctx.clearRect(0, 0, 16, 16);
    
    for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
            // If it's the fireball, restrict it to a random "blob" in the center
            if (isFieryShape) {
                const dx = x - 8;
                const dy = y - 8;
                const dist = Math.sqrt(dx*dx + dy*dy);
                // Only fill if near center, and skip 30% of pixels for a jagged look
                if (dist > 4.5 || Math.random() < 0.3) continue;
            }

            const noise = Math.random() * variation;
            const r = Math.min(255, colorBase.r + noise);
            const g = Math.min(255, colorBase.g + noise);
            const b = Math.min(255, colorBase.b + noise);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    return tex;
}

function initLavaPopResources() {
    if (lavaPopMaterial) return;

    // Fiery Lava Texture (Reds/Oranges) - Now using the 'isFieryShape' flag
    const lavaTex = createNoiseTexture({r: 200, g: 50, b: 0}, 100, true);
    lavaPopMaterial = new THREE.SpriteMaterial({ 
        map: lavaTex, 
        transparent: true, 
        blending: THREE.AdditiveBlending 
    });
}

function animate() {
    requestAnimationFrame(animate);
    if (!_fnCacheReady) _cacheFunctionRefs();
    const time = performance.now();
    let dt = (time - lastTime) / 1000;
    lastTime = time;
    if (dt > 0.1) dt = 0.1;

    const isDead = (uiState === 'DEAD');
    const isPaused = (uiState === 'PAUSED' || uiState === 'MENU' || uiState === 'CREATE_WORLD' || isDead);
    if (!isPaused) {
        globalTime = (globalTime + dt) % TOTAL_TIME;
    } 
    
    let t = 0;
    if (globalTime < DAY_TIME / 2) t = (globalTime / (DAY_TIME / 2)) * 0.25;
    else if (globalTime < DAY_TIME / 2 + NIGHT_TIME) t = 0.25 + ((globalTime - DAY_TIME / 2) / NIGHT_TIME) * 0.5;
    else t = 0.75 + ((globalTime - DAY_TIME / 2 - NIGHT_TIME) / (DAY_TIME / 2)) * 0.25;

    if (!isPaused && _fn_updateClock) _fn_updateClock(t);

    const angle = t * Math.PI * 2;
    const sunHeight = Math.cos(angle); 
    timeUniforms.uSunLevel.value = Math.max(0.05, Math.min(1.0, sunHeight * 2.0 + 0.2));
    
    // Nether has no sunlight
    if (currentDimension === 'nether') {
        timeUniforms.uSunLevel.value = 0.05;
    }
    
    if (sunHeight > 0.2) _currentSkyColor.copy(_skyColorDay);
    else if (sunHeight > -0.2) {
        const interp = (sunHeight + 0.2) / 0.4; 
        if (interp > 0.5) _currentSkyColor.copy(_skyColorSunset).lerp(_skyColorDay, (interp - 0.5) * 2);
        else _currentSkyColor.copy(_skyColorNight).lerp(_skyColorSunset, interp * 2);
    } else _currentSkyColor.copy(_skyColorNight);

    if (!isPaused) {
        randomTickTimer += dt;
        if (randomTickTimer >= 0.05) { 
            randomTickTimer = 0;
            if (_fn_doRandomTicks) _fn_doRandomTicks();
        }

        window.blockBreakCooldown = window.blockBreakCooldown || 0;
        if (window.blockBreakCooldown > 0) window.blockBreakCooldown -= dt;

        if (_fn_updateMobs) _fn_updateMobs(dt);
        if (_fn_tickMobSpawning) _fn_tickMobSpawning(dt);
        if (_fn_updateArrows) _fn_updateArrows(dt);
        if (_fn_tickSpawnerBlocks) _fn_tickSpawnerBlocks(dt);
        if (_fn_updateTNTEntities) _fn_updateTNTEntities(dt);
        if (_fn_updateHerobrineEntities) _fn_updateHerobrineEntities(dt);
        if (_fn_tickEnchantBooks) _fn_tickEnchantBooks(dt);
        if (_fn_updateXPOrbs) _fn_updateXPOrbs(dt);
        if (_fn_tickRedstone) _fn_tickRedstone(dt);

        // Sound system — update listener position for spatial audio, then tick sounds
        if (_fn_soundUpdateListener) _fn_soundUpdateListener();
        if (_fn_soundCheckDigTick) _fn_soundCheckDigTick(dt);
        if (_fn_soundCheckFootsteps) _fn_soundCheckFootsteps(dt);
        if (_fn_soundCheckWaterSplash) _fn_soundCheckWaterSplash();
        if (_fn_soundCheckSwim) _fn_soundCheckSwim();
        if (_fn_soundCheckAmbientFluids) _fn_soundCheckAmbientFluids(dt);

        if (typeof gameMode !== 'undefined') {
            const holdingLeftClick = typeof isLeftMouseHeld !== 'undefined' && isLeftMouseHeld;
            
            if (gameMode === 'survival') {
                const targetRay = raycastVoxel();
                const currentId = miningState.isMining ? miningState.id : (targetRay ? targetRay.id : 0);
                
                let hardness = 0.5, speedMult = 1.0, canHarvest = true;
                const bData = BLOCK_DATA[currentId];
                if (bData) {
                    hardness = bData.hardness !== undefined ? bData.hardness : 0.5;
                    const toolId = typeof inventory !== 'undefined' && inventory[activeSlot] ? inventory[activeSlot].id : (typeof hotbar !== 'undefined' ? hotbar[activeSlot] : 0);
                    const tool = typeof TOOL_DATA !== 'undefined' ? TOOL_DATA[toolId] : null;

                    if (bData.reqTool) {
                        if (tool && tool.type === bData.reqTool) {
                            speedMult = tool.speed;
                            canHarvest = tool.tier >= bData.reqTier;
                        } else canHarvest = false; 
                    } else if (bData.optTool && tool && tool.type === bData.optTool) speedMult = tool.speed;
                }

                if (holdingLeftClick && !miningState.isMining && window.blockBreakCooldown <= 0) {
                    const hitMob = _fn_getTargetedMob ? _fn_getTargetedMob() : null;
                    if (hitMob) {
                        let damage = 1; 
                        if (currentBuildBlock !== 0 && typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock]) {
                            damage = TOOL_DATA[currentBuildBlock].damage || 1;
                        }
                        hitMob.takeDamage(damage, player.x, player.z);
                        swingAnimation = 1.0;
                        window.blockBreakCooldown = 0.3; 
                    } else {
                        const target = targetRay;
                        if (target && target.id !== 18 && target.id !== BLOCK_IDS.AIR) {
                            if (hardness === 0) {
                                if (_fn_breakBlock) _fn_breakBlock(target.hit[0], target.hit[1], target.hit[2], canHarvest);
                                window.damageHeldTool(1);
                                window.blockBreakCooldown = 0.3; 
                            } else {
                                miningState.isMining = true;
                                miningState.x = target.hit[0]; miningState.y = target.hit[1]; miningState.z = target.hit[2];
                                miningState.id = target.id; miningState.progress = 0; miningState.stage = -1;
                                if (typeof breakingBox !== 'undefined' && breakingBox) {
                                    breakingBox.position.set(miningState.x + 0.5, miningState.y + 0.5, miningState.z + 0.5);
                                    breakingBox.visible = true;
                                    if (!breakingBox.material.map && typeof textureAtlas !== 'undefined') {
                                        breakingBox.material.map = textureAtlas;
                                        breakingBox.material.needsUpdate = true;
                                    }
                                }
                            }
                        }
                    } 
                }
                
                if (miningState.isMining) {
                    const target = raycastVoxel();
                    if (!target || target.hit[0] !== miningState.x || target.hit[1] !== miningState.y || target.hit[2] !== miningState.z) {
                        miningState.isMining = false;
                        if (breakingBox) breakingBox.visible = false;
                    } else {
                        if (swingAnimation <= 0) swingAnimation = 1.0;
                        if (hardness < 0) miningState.progress = 0;
                        else if (hardness === 0) {
                            // TNT: Ignite on punch instead of breaking
                            if (miningState.id === BLOCK_IDS.TNT && _fn_igniteTNT) {
                                _fn_igniteTNT(miningState.x, miningState.y, miningState.z);
                            } else {
                                if (_fn_breakBlock) _fn_breakBlock(miningState.x, miningState.y, miningState.z, canHarvest);
                            }
                            miningState.isMining = false;
                            if (breakingBox) breakingBox.visible = false;
                            window.blockBreakCooldown = 0.3;
                        } else {
                            miningState.progress += (dt * speedMult) / (hardness * 1.5); 
                            if (miningState.progress >= 1.0) {
                                if (_fn_breakBlock) {
                                    _fn_breakBlock(miningState.x, miningState.y, miningState.z, canHarvest);
                                }
                                
                                // Apply durability damage when a block is fully broken
                                if (_fn_damageHeldTool) {
                                    _fn_damageHeldTool(1);
                                }

                                miningState.isMining = false;
                                if (breakingBox) breakingBox.visible = false;
                                window.blockBreakCooldown = 0.3;
                            } else {
                                const stage = Math.floor(miningState.progress * 10); 
                                if (stage !== miningState.stage) {
                                    miningState.stage = stage;
                                    if (typeof window.updateBreakingUVs === 'function') window.updateBreakingUVs(55 + stage); 
                                }
                            }
                        } 
                    }
                }
            } else if (gameMode === 'creative' && holdingLeftClick) {
                if (window.blockBreakCooldown <= 0) {
                    const hitMob = _fn_getTargetedMob ? _fn_getTargetedMob() : null;
                    if (hitMob) {
                        hitMob.takeDamage(100, player.x, player.z); 
                        swingAnimation = 1.0;
                        window.blockBreakCooldown = 0.3;
                    } else {
                        const target = raycastVoxel();
                        if (target && target.id !== 18 && target.id !== BLOCK_IDS.AIR) {
                            if (_fn_breakBlock) _fn_breakBlock(target.hit[0], target.hit[1], target.hit[2]);
                            window.blockBreakCooldown = 0.3;
                        }
                    } 
                }
            }

            const oldX = player.x;
            const oldZ = player.z;

            movePlayer(dt);

            // --- FIRE / LAVA DAMAGE TICK ---
            // Minecraft rates: Lava = 4hp per 0.5s, fire block = 1hp per 0.5s
            if (gameMode === 'survival' && !player._dead) {
                if (!player._fireDamageTimer) player._fireDamageTimer = 0;
                if (!player._fireTimer)      player._fireTimer      = 0;

                // Check what the player is standing in/on
                const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
                const feetId  = getVoxel(px, py, pz) & 0xFF;
                const bodyId  = getVoxel(px, py + 1, pz) & 0xFF;
                const inLavaNow  = (feetId === BLOCK_IDS.LAVA || bodyId === BLOCK_IDS.LAVA);
                const onFireNow  = (feetId === BLOCK_IDS.FIRE || bodyId === BLOCK_IDS.FIRE);

                if (inLavaNow) {
                    // Lava: set on fire for 15s, damage 4hp every 0.5s
                    player._fireTimer = 15.0;
                    player._fireDamageTimer += dt;
                    if (player._fireDamageTimer >= 0.5) {
                        player._fireDamageTimer -= 0.5;
                        window.applyPlayerDamage(4);
                    }
                } else if (onFireNow) {
                    // Fire block: set on fire for 8s, damage 1hp every 0.5s
                    player._fireTimer = Math.max(player._fireTimer || 0, 8.0);
                    player._fireDamageTimer += dt;
                    if (player._fireDamageTimer >= 0.5) {
                        player._fireDamageTimer -= 0.5;
                        window.applyPlayerDamage(1);
                    }
                } else {
                    // Not in lava/fire — count down burn timer, reset damage timer when done
                    if (player._fireTimer > 0) {
                        player._fireTimer -= dt;
                        if (player._fireTimer <= 0) {
                            player._fireTimer = 0;
                            player._fireDamageTimer = 0;
                        } else {
                            // Still on fire from residual — 1hp per 0.5s
                            player._fireDamageTimer += dt;
                            if (player._fireDamageTimer >= 0.5) {
                                player._fireDamageTimer -= 0.5;
                                window.applyPlayerDamage(1);
                            }
                        }
                    } else {
                        player._fireDamageTimer = 0;
                    }
                    // Water extinguishes fire
                    const inWaterNow = (feetId === BLOCK_IDS.WATER || bodyId === BLOCK_IDS.WATER);
                    if (inWaterNow) { player._fireTimer = 0; player._fireDamageTimer = 0; }
                }
                player.onFire = (player._fireTimer > 0) || inLavaNow || onFireNow;
            } else {
                player.onFire = false;
            }

            // Update fire overlay + model fire meshes
            if (_fn_updateFireEffects) {
                _fn_updateFireEffects(player.onFire, performance.now() / 1000);
            }

            // Animate the player model for third-person view
            if (_fn_animatePlayerModel) _fn_animatePlayerModel(dt);

            const NORMAL_FOV = 75;
            const SPRINT_FOV = 85;
            let targetFov = NORMAL_FOV;
            
            if (player.isSprinting) targetFov = SPRINT_FOV;
            else if (player.flying && (keys.ControlLeft || wDoubleTapped) && keys.KeyW) targetFov = SPRINT_FOV;

            if (Math.abs(camera.fov - targetFov) > 0.1) {
                camera.fov += (targetFov - camera.fov) * dt * 10.0;
                camera.updateProjectionMatrix();
            }

            player.bobPhase = player.bobPhase || 0;
            player.bobAmplitude = player.bobAmplitude || 0;

            const horizontalSpeed = Math.sqrt(player.vx * player.vx + player.vz * player.vz);
            const isMoving = horizontalSpeed > 0.1;

            if (player.onGround && !player.flying) player.bobPhase += horizontalSpeed * dt * 1.5; 

            const targetAmp = (isMoving && player.onGround && !player.flying) ? Math.min(horizontalSpeed * 0.01, 0.4) : 0.0;
            player.bobAmplitude += (targetAmp - player.bobAmplitude) * 10.0 * dt;

            if (player.bobPhase > Math.PI * 200) player.bobPhase -= Math.PI * 200;

            if (player.landingImpact > 0) {
                player.landingImpact -= dt * 2.5;
                if (player.landingImpact < 0) player.landingImpact = 0;
            }

            let camBobX = 0, camBobY = 0, camRollDeg = 0, camPitchDeg = 0;

            if (settingViewBobbing) {
                camBobX = Math.sin(player.bobPhase) * player.bobAmplitude;
                camBobY = -Math.abs(Math.cos(player.bobPhase)) * player.bobAmplitude * 0.6; 
                camRollDeg = Math.sin(player.bobPhase) * player.bobAmplitude * 12.0;
                camPitchDeg = Math.abs(Math.cos(player.bobPhase - 0.2)) * player.bobAmplitude * 18.0;
            }

            // Check if third-person camera should take over
            const isThirdPerson = (typeof cameraMode !== 'undefined' && cameraMode !== 0 && _fn_updateThirdPersonCamera);
            
            if (!isThirdPerson) {
                const yawSin = Math.sin(player.yaw);
                const yawCos = Math.cos(player.yaw);

                camera.position.set(
                    player.x + camBobX * yawCos,
                    player.y + player.eyeLevel + camBobY - player.landingImpact,
                    player.z - camBobX * yawSin
                );

                camera.rotation.set(
                    player.pitch + camPitchDeg * (Math.PI / 180),
                    player.yaw,
                    camRollDeg * (Math.PI / 180),
                    'YXZ'
                );
            } else {
                _fn_updateThirdPersonCamera();
            }

            const SWING_DURATION = 0.3; 
            if (swingAnimation > 0) {
                swingAnimation -= dt / SWING_DURATION;
                if (swingAnimation < 0) swingAnimation = 0;
            }

            const swingProgress = (swingAnimation > 0) ? (1.0 - swingAnimation) : 0;

            if (typeof heldItemGroup !== 'undefined' && heldItemGroup) {
                const sqrtSwing = Math.sqrt(swingProgress);
                const swingTX = -0.4 * Math.sin(sqrtSwing * Math.PI);
                const swingTY =  0.2 * Math.sin(sqrtSwing * Math.PI * 2.0);
                const swingTZ = -0.2 * Math.sin(swingProgress * Math.PI);
                const s1 = Math.sin(swingProgress * swingProgress * Math.PI);
                const s2 = Math.sin(sqrtSwing * Math.PI);
                const swingRotY = s2 * 70.0;   
                const swingRotZ = s1 * -20.0;  
                const swingRotX = s2 * -80.0;  

                let handBobX = 0, handBobY = 0, handRollDeg = 0;
                if (settingViewBobbing) {
                    handBobX = Math.sin(player.bobPhase) * player.bobAmplitude * 0.8;
                    handBobY = -Math.abs(Math.cos(player.bobPhase)) * player.bobAmplitude * 1.5;
                    handRollDeg = Math.sin(player.bobPhase) * player.bobAmplitude * 10.0;
                }

                heldItemGroup.position.set(0.56 + swingTX + handBobX, -0.52 + swingTY + handBobY, -0.72 + swingTZ);

                const toRad = Math.PI / 180;
                heldItemGroup.rotation.set((0 + swingRotX) * toRad, (-45.0 + swingRotY) * toRad, (0 + swingRotZ + handRollDeg) * toRad, 'YXZ');

                if (currentHeldMesh && currentHeldMesh.children.length > 0) {
                    const headX = Math.floor(player.x), headY = Math.floor(player.y + player.eyeLevel), headZ = Math.floor(player.z);
                    let pSun = getSunLight(headX, headY, headZ) / 15.0;
                    let pTorch = getTorchLight(headX, headY, headZ) / 15.0;
                    
                    if (currentBuildBlock === BLOCK_IDS.TORCH || currentBuildBlock === BLOCK_IDS.LAVA) { pSun = 1.0; pTorch = 1.0; }
                    
                    const mesh = currentHeldMesh.children[0];
                    if (mesh && mesh.geometry && mesh.geometry.attributes && mesh.geometry.attributes.color) {
                        const colorsAttr = mesh.geometry.attributes.color;
                        const colors = colorsAttr.array;
                        if (Math.abs(colors[0] - (pSun * colors[2])) > 0.01 || Math.abs(colors[1] - (pTorch * colors[2])) > 0.01) {
                            for (let i = 0; i < colors.length; i += 3) {
                                const shade = colors[i + 2];
                                colors[i] = pSun * shade;     
                                colors[i + 1] = pTorch * shade; 
                            }
                            colorsAttr.needsUpdate = true;
                        }
                    }
                }
            }

            for (let [posKey, f] of activeFurnaces.entries()) {
                // Cache parsed coords on furnace object to avoid split+map every frame
                if (f._fx === undefined) {
                    const parts = posKey.split(',');
                    f._fx = +parts[0]; f._fy = +parts[1]; f._fz = +parts[2];
                }
                const fx = f._fx, fy = f._fy, fz = f._fz;
                const val = getVoxel(fx, fy, fz);
                if ((val & 0xFF) !== 59) {
                    if (f.input.count > 0) window.spawnDroppedItem(fx+0.5, fy+0.5, fz+0.5, f.input.id, f.input.count);
                    if (f.fuel.count > 0) window.spawnDroppedItem(fx+0.5, fy+0.5, fz+0.5, f.fuel.id, f.fuel.count);
                    if (f.output.count > 0) window.spawnDroppedItem(fx+0.5, fy+0.5, fz+0.5, f.output.id, f.output.count);
                    activeFurnaces.delete(posKey);
                    if (currentFurnacePos === posKey && uiState === 'FURNACE') {
                        if (typeof closeFurnace === 'function') closeFurnace();
                        document.body.requestPointerLock();
                    }
                    continue;
                }

                let isBurning = f.burnTime > 0;
                let wasBurning = isBurning;
                let dirty = false;

                if (isBurning) {
                    f.burnTime -= dt;
                    if (f.burnTime < 0) f.burnTime = 0;
                    dirty = true;
                }

                const recipe = typeof SMELTING_RECIPES !== 'undefined' ? SMELTING_RECIPES[f.input.id] : null;
                const canSmelt = recipe && f.input.count > 0 && 
                    (f.output.id === 0 || (f.output.id === recipe.id && f.output.count + recipe.count <= 64));

                if (canSmelt && f.burnTime <= 0 && f.fuel.count > 0 && FUEL_DATA[f.fuel.id]) {
                    f.totalBurnTime = FUEL_DATA[f.fuel.id];
                    f.burnTime = f.totalBurnTime;
                    f.fuel.count--;
                    if (f.fuel.count === 0) f.fuel.id = 0;
                    isBurning = true;
                    dirty = true;
                }

                if (isBurning && canSmelt) {
                    f.cookTime += dt;
                    dirty = true;
                    if (f.cookTime >= f.totalCookTime) {
                        f.cookTime = 0;
                        f.input.count--;
                        if (f.input.count === 0) f.input.id = 0;
                        
                        f.output.id = recipe.id;
                        f.output.count += recipe.count;
                    }
                } else {
                    if (f.cookTime > 0) {
                        f.cookTime = 0;
                        dirty = true;
                    }
                }

                if (isBurning !== wasBurning) {
                    setVoxel(fx, fy, fz, 59, (val >> 8) & 0xF, isBurning ? 1 : 0, 0);
                    // MC lit furnace emits light level 13
                    if (typeof setTorchLight === 'function') {
                        setTorchLight(fx, fy, fz, isBurning ? 13 : 0);
                    }
                    pendingBlockUpdates.push({x: fx, y: fy, z: fz});
                }

                if (uiState === 'FURNACE' && currentFurnacePos === posKey) {
                    // Always update progress bars while furnace UI is open
                    if (typeof updateFurnaceUI === 'function') updateFurnaceUI(f);
                    // Re-render slot contents when items change
                    if (dirty && typeof renderFurnace === 'function') renderFurnace();
                }
            }

            timeUniforms.uFluidTime.value += dt;
            if (window.portalMaterial) window.portalMaterial.uniforms.uTime.value = performance.now() / 1000;

            // --- SCHEDULED FLUID TICK SYSTEM ---
            // Each fluid block is scheduled with a specific process time
            // Water: 0.25s delay per spread, Lava: 1.5s overworld / 0.5s nether
            if (!window._fluidSchedule) window._fluidSchedule = [];
            
            const now = performance.now() / 1000;
            
            // Move queue entries into the schedule with proper delays
            const WATER_DELAY = 0.25;
            const inNether = (typeof currentDimension !== 'undefined' && currentDimension === 'nether');
            const LAVA_DELAY = inNether ? 0.5 : 1.5;
            
            for (const idx of updateWaterQueue) {
                window._fluidSchedule.push({ idx, type: 'water', time: now + WATER_DELAY });
            }
            updateWaterQueue.clear();
            
            for (const idx of updateLavaQueue) {
                window._fluidSchedule.push({ idx, type: 'lava', time: now + LAVA_DELAY });
            }
            updateLavaQueue.clear();
            
            // Process scheduled fluid updates that are ready
            if (window._fluidSchedule.length > 0) {
                const waterBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, dirty: false };
                const lavaBounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, dirty: false };
                
                // In-place compaction: process ready entries, keep unready ones
                let _remainingWater = 0, _remainingLava = 0;
                let writeIdx = 0;
                for (let ri = 0; ri < window._fluidSchedule.length; ri++) {
                    const entry = window._fluidSchedule[ri];
                    if (entry.time <= now) {
                        const idx = entry.idx;
                        if (idx === -1) continue;
                        const ix = idx % WORLD_WIDTH;
                        const iy = Math.floor(idx / WORLD_WIDTH) % WORLD_HEIGHT;
                        const iz = Math.floor(idx / (WORLD_WIDTH * WORLD_HEIGHT));
                        const wx = ix - WORLD_WIDTH / 2;
                        const wz = iz - WORLD_DEPTH / 2;
                        if (entry.type === 'water') {
                            updateWater(wx, iy, wz, waterBounds);
                        } else {
                            updateLava(wx, iy, wz, lavaBounds);
                        }
                    } else {
                        window._fluidSchedule[writeIdx++] = entry;
                        if (entry.type === 'water') _remainingWater++;
                        else _remainingLava++;
                    }
                }
                window._fluidSchedule.length = writeIdx;
                
                if (waterBounds.dirty) {
                    const cx = Math.floor((waterBounds.minX + waterBounds.maxX) / 2);
                    const cz = Math.floor((waterBounds.minZ + waterBounds.maxZ) / 2);
                    recalculateLighting(cx, 0, cz);
                    updateChunksInBounds(waterBounds.minX, waterBounds.maxX, waterBounds.minZ, waterBounds.maxZ);
                    debugTickCount++;
                }
                if (lavaBounds.dirty) {
                    const cx = Math.floor((lavaBounds.minX + lavaBounds.maxX) / 2);
                    const cz = Math.floor((lavaBounds.minZ + lavaBounds.maxZ) / 2);
                    recalculateLighting(cx, 0, cz);
                    updateChunksInBounds(lavaBounds.minX, lavaBounds.maxX, lavaBounds.minZ, lavaBounds.maxZ);
                    debugTickCount++;
                }
                debugWaterQueue = _remainingWater;
                debugLavaQueue = _remainingLava;
            } else {
                debugWaterQueue = 0;
                debugLavaQueue = 0;
            }

            if (pendingBlockUpdates.length > 0) {
                if (pendingBlockUpdates.length === 1) {
                    const u = pendingBlockUpdates[0];
                    recalculateLighting(u.x, u.y, u.z);
                    updateChunks(u.x, u.y, u.z); 
                } else {
                    let cx = 0, cy = 0, cz = 0;
                    for (const u of pendingBlockUpdates) { 
                        cx += u.x; cy += u.y; cz += u.z; 
                    }
                    cx = Math.round(cx / pendingBlockUpdates.length);
                    cy = Math.round(cy / pendingBlockUpdates.length);
                    cz = Math.round(cz / pendingBlockUpdates.length);
                    recalculateLighting(cx, cy, cz);
                    for (const u of pendingBlockUpdates) {
                        updateChunks(u.x, u.y, u.z);
                    }
                }
                pendingBlockUpdates.length = 0;
            }

            if (dirtyChunks.size > 0) {
                const meshStartTime = performance.now();
                const meshBudget = debugFrameTime < 12 ? 14 : (debugFrameTime < 20 ? 7 : 3);
                let processed = 0;
                const pCx = Math.floor(player.x / CHUNK_SIZE);
                const pCz = Math.floor(player.z / CHUNK_SIZE);
                
                if (dirtyChunks.size > 8) {
                    // Reuse persistent array to avoid GC from allocating objects every frame
                    if (!window._dirtyChunkSortArr) window._dirtyChunkSortArr = [];
                    const keysToProcess = window._dirtyChunkSortArr;
                    keysToProcess.length = 0;
                    for (let key of dirtyChunks) {
                        const sep = key.indexOf(',');
                        const kx = parseInt(key.substring(0, sep));
                        const kz = parseInt(key.substring(sep + 1));
                        const dist = (kx - pCx) * (kx - pCx) + (kz - pCz) * (kz - pCz);
                        keysToProcess.push({key, cx: kx, cz: kz, dist});
                    }
                    keysToProcess.sort((a, b) => a.dist - b.dist);
                    for (const item of keysToProcess) {
                        buildChunkMesh(item.cx, item.cz);
                        dirtyChunks.delete(item.key);
                        processed++;
                        if (performance.now() - meshStartTime > meshBudget) break; 
                    }
                } else {
                    for (let key of dirtyChunks) {
                        const sep = key.indexOf(',');
                        const kx = parseInt(key.substring(0, sep));
                        const kz = parseInt(key.substring(sep + 1));
                        buildChunkMesh(kx, kz);
                        dirtyChunks.delete(key);
                        processed++;
                        if (performance.now() - meshStartTime > meshBudget) break; 
                    }
                }
            }
            
            if (useLazyGeneration) {
                const lazyStartTime = performance.now();
                const pCx = ((player.x | 0) + _halfW) >> 4;
                const pCz = ((player.z | 0) + _halfD) >> 4;
                const genRadius = RENDER_DISTANCES[currentRenderDistIndex] + 2;
                const maxGen = debugFrameTime < 12 ? 6 : (debugFrameTime < 20 ? 3 : 1);
                const lazyBudget = debugFrameTime < 12 ? 10 : 5;
                let generated = 0;
                
                for (let r = 0; r <= genRadius && generated < maxGen; r++) {
                    for (let dx = -r; dx <= r && generated < maxGen; dx++) {
                        for (let dz = -r; dz <= r && generated < maxGen; dz++) {
                            if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
                            const gcx = pCx + dx;
                            const gcz = pCz + dz;
                            if (gcx < 0 || gcx >= CHUNKS_X || gcz < 0 || gcz >= CHUNKS_Z) continue;
                            if (!_isChunkGenerated(gcx, gcz)) {
                                ensureChunkGenerated(gcx, gcz);
                                const wcx = gcx - CHUNKS_X / 2;
                                const wcz = gcz - CHUNKS_Z / 2;
                                const cx_center = wcx * CHUNK_SIZE + CHUNK_SIZE / 2;
                                const cz_center = wcz * CHUNK_SIZE + CHUNK_SIZE / 2;
                                recalculateLighting(cx_center, 64, cz_center);
                                dirtyChunks.add(`${wcx},${wcz}`);
                                dirtyChunks.add(`${wcx+1},${wcz}`);
                                dirtyChunks.add(`${wcx-1},${wcz}`);
                                dirtyChunks.add(`${wcx},${wcz+1}`);
                                dirtyChunks.add(`${wcx},${wcz-1}`);
                                generated++;
                            }
                            if (performance.now() - lazyStartTime > lazyBudget) { generated = maxGen; break; }
                        }
                    }
                }
            }
            
            const itemsToRemove = new Set();
            for (let i = droppedItems.length - 1; i >= 0; i--) {
                let item = droppedItems[i];
                
                for (let j = i - 1; j >= 0; j--) {
                    let other = droppedItems[j];
                    if (other.id === item.id && other.count < 64 && item.count > 0 && window.isStackable(item.id)) {
                        const dSq = (item.x - other.x)**2 + (item.y - other.y)**2 + (item.z - other.z)**2;
                        if (dSq < 1.5) { 
                            const space = 64 - other.count;
                            const transfer = Math.min(space, item.count);
                            other.count += transfer;
                            item.count -= transfer;
                            if (transfer > 0) {
                                other.vy += 1.5; 
                            }
                        }
                    }
                }

                if (item.count <= 0) {
                    itemsToRemove.add(i);
                    continue; 
                }

                // MC pile thresholds: 1=1, 2-5=2, 6-16=3, 17-32=4, 33+=5
                let targetVisualCount = 1;
                if (item.count >= 2) targetVisualCount = 2;
                if (item.count >= 6) targetVisualCount = 3;
                if (item.count >= 17) targetVisualCount = 4;
                if (item.count >= 33) targetVisualCount = 5;

                if (item.mesh.children.length < targetVisualCount) {
                    const baseChild = item.mesh.children[0];
                    while (item.mesh.children.length < targetVisualCount) {
                        const newChild = baseChild.clone();
                        const offsetAmount = 0.15;
                        newChild.position.x = baseChild.position.x + (Math.random() - 0.5) * offsetAmount;
                        newChild.position.y = baseChild.position.y + (Math.random() - 0.5) * offsetAmount;
                        newChild.position.z = baseChild.position.z + (Math.random() - 0.5) * offsetAmount;
                        newChild.rotation.x += (Math.random() - 0.5) * 0.2;
                        newChild.rotation.y += (Math.random() - 0.5) * 0.2;
                        newChild.rotation.z += (Math.random() - 0.5) * 0.2;
                        item.mesh.add(newChild);
                    }
                }

                item.age += dt;
                if (item.pickupDelay > 0) item.pickupDelay -= dt;

                // --- WATER DETECTION FOR THIS ITEM ---
                const _itemIx = Math.floor(item.x), _itemIy = Math.floor(item.y), _itemIz = Math.floor(item.z);
                const _itemBlockAtFeet = getVoxel(_itemIx, _itemIy, _itemIz) & 0xFF;
                const itemInWater = (_itemBlockAtFeet === BLOCK_IDS.WATER);

                // Splash sound & particles when item first enters water
                if (itemInWater && !item._wasInWater) {
                    const splashVol = Math.min(0.2, 0.05 + Math.abs(item.vy) * 0.015);
                    if (_fn_playWaterSplashAt) {
                        _fn_playWaterSplashAt(item.x, item.y, item.z, splashVol);
                    }
                    if (_fn_spawnWaterSplash) {
                        _fn_spawnWaterSplash(item.x, item.y, item.z);
                    }
                }
                item._wasInWater = itemInWater;

                if (itemInWater) {
                    // Check if the block above is also water or air
                    const _aboveId = getVoxel(_itemIx, _itemIy + 1, _itemIz) & 0xFF;
                    const atSurface = (_aboveId !== BLOCK_IDS.WATER); // block above is NOT water = at surface level

                    if (atSurface && Math.abs(item.vy) < 0.5) {
                        // At surface AND nearly stopped: settle to rest position
                        item.vy *= Math.exp(-10.0 * dt);
                        const surfaceY = _itemIy + 0.85;
                        const diff = surfaceY - item.y;
                        item.vy += diff * 6.0 * dt;
                    } else {
                        // Sinking or rising through water: gravity + buoyancy
                        item.vy -= GRAVITY * dt * 0.15;  // reduced gravity
                        item.vy += 4.0 * dt;              // buoyancy
                        if (item.vy > 2.0) item.vy = 2.0;
                        // Drag slows vertical movement (makes sinking feel heavy)
                        item.vy *= Math.exp(-2.0 * dt);
                    }
                    if (item.vy < -3.0) item.vy = -3.0;
                    item.vx *= Math.exp(-6.0 * dt);
                    item.vz *= Math.exp(-6.0 * dt);

                    // --- WATER FLOW PUSH (items) ---
                    if (_fn_getWaterFlowDirection) {
                        const flow = _fn_getWaterFlowDirection(_itemIx, _itemIy, _itemIz);
                        const ITEM_FLOW_FORCE = 5.6;
                        item.vx += flow.x * ITEM_FLOW_FORCE * dt;
                        item.vz += flow.z * ITEM_FLOW_FORCE * dt;
                    }
                } else {
                    item.vy -= GRAVITY * dt * 0.4; 
                }
                
                let nextX = item.x + item.vx * dt;
                let nextY = item.y + item.vy * dt;
                let nextZ = item.z + item.vz * dt;

                // X/Z wall collisions — skip fluid blocks so items can enter water
                const _wallXId = getVoxel(Math.floor(nextX), Math.floor(item.y), Math.floor(item.z)) & 0xFF;
                if (_wallXId !== 0 && !isFluidBlock(_wallXId)) {
                    item.vx *= -0.5; nextX = item.x;
                }
                const _wallZId = getVoxel(Math.floor(item.x), Math.floor(item.y), Math.floor(nextZ)) & 0xFF;
                if (_wallZId !== 0 && !isFluidBlock(_wallZId)) {
                    item.vz *= -0.5; nextZ = item.z;
                }
                // Ceiling collision — skip fluid blocks
                const _ceilId = getVoxel(Math.floor(item.x), Math.floor(item.y + 0.3), Math.floor(item.z)) & 0xFF;
                if (_ceilId !== 0 && !isFluidBlock(_ceilId)) {
                    if (item.vy > 0) item.vy = -0.5; 
                }

                const bX = Math.floor(nextX);
                const bY = Math.floor(nextY - 0.15); 
                const bZ = Math.floor(nextZ);
                const blockBelowVal = getVoxel(bX, bY, bZ);
                const blockBelowId = blockBelowVal & 0xFF;
                
                let onGround = false;
                if (blockBelowId !== BLOCK_IDS.AIR && !isFluidBlock(blockBelowId) && !isCrossBlock(blockBelowId) && blockBelowId !== BLOCK_IDS.TORCH && blockBelowId !== BLOCK_IDS.TALL_GRASS && blockBelowId !== BLOCK_IDS.CROPS && blockBelowId !== BLOCK_IDS.VINE && blockBelowId !== BLOCK_IDS.NETHER_PORTAL) {
                    // Get actual block top height for partial blocks (snow, slabs)
                    let blockTop = bY + 1;
                    if (typeof getBlockBounds === 'function') {
                        const bounds = getBlockBounds(blockBelowId, blockBelowVal, bX, bY, bZ);
                        if (!Array.isArray(bounds)) {
                            blockTop = bY + bounds.maxY;
                        } else {
                            let maxTop = 0;
                            for (const b of bounds) if (b.maxY > maxTop) maxTop = b.maxY;
                            blockTop = bY + maxTop;
                        }
                    }
                    if (nextY - 0.15 < blockTop) {
                        nextY = blockTop + 0.15;
                        if (item.vy < -4.0) item.vy *= -0.3; 
                        else item.vy = 0;

                        // --- ICE SLIPPERINESS FOR ITEMS ---
                        let itemFriction;
                        if (blockBelowId === BLOCK_IDS.ICE) itemFriction = 0.98;
                        else if (blockBelowId === BLOCK_IDS.PACKED_ICE) itemFriction = 0.989;
                        else itemFriction = 0.6;
                        const frictionDecay = -Math.log(itemFriction) * 20.0;
                        item.vx *= Math.exp(-frictionDecay * dt); 
                        item.vz *= Math.exp(-frictionDecay * dt);
                        onGround = true;
                    }
                } else if (!itemInWater) {
                    item.vx *= Math.exp(-1.5 * dt);
                    item.vz *= Math.exp(-1.5 * dt);
                }

                item.x = nextX; item.y = nextY; item.z = nextZ;

                // Destroy items that touch lava
                const itemBlockId = getVoxel(Math.floor(item.x), Math.floor(item.y), Math.floor(item.z)) & 0xFF;
                if (itemBlockId === BLOCK_IDS.LAVA) {
                    if (_fn_playFizzSound) {
                        _fn_playFizzSound(item.x, item.y, item.z);
                    }
                    itemsToRemove.add(i);
                    continue;
                }

                // MC EntityItem: bob = sin(age/10 + uniqueOffset) * 0.1 + 0.1
                // MC EntityItem: spin = ageInTicks / 20.0 radians (~0.314 rad/sec)
                const hoverOffset = Math.sin(item.age * 1.2) * 0.08 + 0.15;
                item.mesh.position.set(item.x, item.y + hoverOffset, item.z);
                item.mesh.rotation.y += dt * 2.4;

                if (onGround) {
                    // Use actual block top for shadow (respects snow layers, slabs)
                    let shadowTop = bY + 1.01;
                    if (typeof getBlockBounds === 'function') {
                        const sb = getBlockBounds(blockBelowId, blockBelowVal, bX, bY, bZ);
                        if (!Array.isArray(sb)) shadowTop = bY + sb.maxY + 0.01;
                        else { let mx = 0; for (const b of sb) if (b.maxY > mx) mx = b.maxY; shadowTop = bY + mx + 0.01; }
                    }
                    item.shadow.position.set(item.x, shadowTop, item.z);
                    item.shadow.visible = true;
                } else item.shadow.visible = false;

                // Compute light values once outside traverse to avoid redundant lookups
                const _iLx = Math.floor(item.x), _iLy = Math.floor(item.y + hoverOffset), _iLz = Math.floor(item.z);
                let _iSun = getSunLight(_iLx, _iLy, _iLz) / 15.0;
                let _iTorch = getTorchLight(_iLx, _iLy, _iLz) / 15.0;
                if (item.id === BLOCK_IDS.TORCH || item.id === BLOCK_IDS.LAVA) { _iSun = 1.0; _iTorch = 1.0; }

                // Only traverse if light changed since last update
                if (item._lastSun !== _iSun || item._lastTorch !== _iTorch) {
                    item._lastSun = _iSun;
                    item._lastTorch = _iTorch;
                    item.mesh.traverse((child) => {
                        if (child.isMesh && child.geometry && child.geometry.attributes && child.geometry.attributes.color) {
                            const colorsAttr = child.geometry.attributes.color;
                            const colors = colorsAttr.array;
                            for (let c = 0; c < colors.length; c += 3) {
                                const shade = colors[c + 2];
                                colors[c] = _iSun * shade;     
                                colors[c + 1] = _iTorch * shade; 
                            }
                            colorsAttr.needsUpdate = true;
                        }
                    });
                }

                if (item.pickupDelay <= 0) {
                    const distSq = (player.x - item.x)**2 + (player.y - item.y)**2 + (player.z - item.z)**2;
                    if (distSq < 2.5) { 
                        if (_fn_addToInventory) {
                            const leftover = _fn_addToInventory(item.id, item.count, item.durability);
                            if (leftover === 0) {
                                if (_fn_playItemSound) _fn_playItemSound(0.3);
                                itemsToRemove.add(i);
                                refreshOpenUI();
                                continue;
                            } else {
                                item.count = leftover;
                                refreshOpenUI();
                            }
                        }
                    }
                }

                if (item.age > 300) itemsToRemove.add(i);
            }

            // Remove items — sort descending so splicing doesn't shift later indices
            if (itemsToRemove.size > 0) {
                const sortedIndices = Array.from(itemsToRemove).sort((a, b) => b - a);
                for (const i of sortedIndices) {
                    const drop = droppedItems[i];
                    scene.remove(drop.mesh);
                    scene.remove(drop.shadow);
                    drop.mesh.traverse((child) => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
                    droppedItems.splice(i, 1);
                }
            }

            const blocksToRemove = [];
            for (let block of fallingBlocks) {
                block.vy -= 20.0 * dt; 
                let nextY = block.y + block.vy * dt;
                let landed = false, landY = Math.floor(block.y);
                
                for (let testY = Math.floor(block.y); testY >= Math.floor(nextY); testY--) {
                    const belowVal = getVoxel(block.x, testY - 1, block.z);
                    const belowId = belowVal & 0xFF;
                    if (belowId !== 0 && !isFluidBlock(belowId) && !isCrossBlock(belowId) && !isSnowLayer(belowId)) {
                        if (nextY <= testY) { landed = true; landY = testY; }
                        break; 
                    }
                    if (isSnowLayer(belowId)) {
                        if (nextY <= testY) { landed = true; landY = testY - 1; }
                        break;
                    }
                }
                
                if (landed) {
                    const existingId = getVoxel(block.x, landY, block.z) & 0xFF;
                    setVoxel(block.x, landY, block.z, block.id);
                    queueNeighbors(block.x, landY, block.z);
                    checkGravity(block.x, landY + 1, block.z); 
                    pendingBlockUpdates.push({x: block.x, y: landY, z: block.z});
                    scene.remove(block.mesh);
                    block.mesh.geometry.dispose();
                    blocksToRemove.push(block);
                } else {
                    block.y = nextY;
                    block.mesh.position.y = block.y;
                    if (block.y < -5) { 
                        scene.remove(block.mesh);
                        block.mesh.geometry.dispose();
                        blocksToRemove.push(block);
                    }
                }
            }
            for (let b of blocksToRemove) fallingBlocks.delete(b);

            // Cap max particles to prevent lag
            const MAX_PARTICLES = 200;
            while (particles.length > MAX_PARTICLES) {
                const oldest = particles.shift();
                _disposeParticle(oldest);
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.life -= dt;

                // --- REMOVAL: swap-and-pop (O(1) instead of O(n) splice) ---
                if (p.life <= 0) {
                    _disposeParticle(p);
                    // Swap with last element and pop
                    particles[i] = particles[particles.length - 1];
                    particles.pop();
                    continue;
                }

                if (!p.noGravity) {
                    p.vy -= GRAVITY * dt * 0.6; 
                } else {
                    p.vx *= Math.exp(-3.0 * dt);
                    p.vy *= Math.exp(-3.0 * dt);
                    p.vz *= Math.exp(-3.0 * dt);
                    // Fade out smoke/splash particles via opacity (material is cloned per-particle)
                    if (p.isSmoke && p.mesh.material && p.mesh.material.transparent) {
                        p.mesh.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.8);
                    }
                }

                let nextX = p.mesh.position.x + p.vx * dt, nextY = p.mesh.position.y + p.vy * dt, nextZ = p.mesh.position.z + p.vz * dt;

                if (!p.noGravity) {
                    const blockBelow = getVoxel(Math.floor(p.mesh.position.x), Math.floor(nextY - 0.075), Math.floor(p.mesh.position.z)) & 0xFF;
                    if (blockBelow !== 0 && !isFluidBlock(blockBelow) && !isCrossBlock(blockBelow)) {
                        p.vy *= -0.4; p.vx *= 0.6; p.vz *= 0.6;
                        nextY = Math.floor(nextY - 0.075) + 1 + 0.075;
                    }
                }
                
                p.mesh.position.set(nextX, nextY, nextZ);

                // --- LAVA POP TRAIL (Using existing Fire Smoke) ---
                if (p.type === 'lava_pop') {
                    // Check distance from the last smoke puff to create the "lag"
                    const dx = p.mesh.position.x - p.lastX;
                    const dy = p.mesh.position.y - p.lastY;
                    const dz = p.mesh.position.z - p.lastZ;
                    const distSq = dx*dx + dy*dy + dz*dz;

                    // Spawn existing smoke at the PREVIOUS position (lagging behind)
                    if (distSq > 0.12) {
                        if (_fn_spawnFireSmoke) {
                            _fn_spawnFireSmoke(p.lastX, p.lastY, p.lastZ);
                        }
                        
                        // Update memory to current position
                        p.lastX = p.mesh.position.x;
                        p.lastY = p.mesh.position.y;
                        p.lastZ = p.mesh.position.z;
                    }
                }
            
                p.mesh.rotation.x += p.vx * dt;

                p.mesh.rotation.y += p.vy * dt;
                const scale = Math.max(0.01, p.life / p.maxLife);
                p.mesh.scale.setScalar(scale);
            }

            if (typeof cloudMesh !== 'undefined' && cloudMesh && window.cloudMapData) {
                const halfCov = Math.floor(CLOUD_COVERAGE / 2);
                const pGridX = Math.floor(player.x / CLOUD_W);
                const pGridZ = Math.floor(player.z / CLOUD_W);
                
                const totalCloudShift = globalTime * CLOUD_SPEED;
                const cloudBlockOffset = Math.floor(totalCloudShift / CLOUD_W);
                const continuousOffset = totalCloudShift % CLOUD_W;

                cloudMesh.position.set(pGridX * CLOUD_W - continuousOffset, CLOUD_HEIGHT, pGridZ * CLOUD_W);
                if (typeof cloudDepthMesh !== 'undefined' && cloudDepthMesh) {
                    cloudDepthMesh.position.copy(cloudMesh.position);
                }

                if (pGridX !== lastCloudGridX || pGridZ !== lastCloudGridZ || cloudBlockOffset !== lastCloudBlockOffset) {
                    let idx = 0;
                    
                    for (let x = -halfCov; x < halfCov; x++) {
                        for (let z = -halfCov; z < halfCov; z++) {
                            const worldBlockX = pGridX + x + cloudBlockOffset;
                            const worldBlockZ = pGridZ + z;
                            
                            const texX = ((worldBlockX % 256) + 256) % 256;
                            const texZ = ((worldBlockZ % 256) + 256) % 256;
                            
                            const pixelIdx = (texZ * 256 + texX) * 4;
                            const isCloud = window.cloudMapData[pixelIdx + 3] > 128 || window.cloudMapData[pixelIdx] > 128;
                            
                            if (isCloud) {
                                _cloudDummy.position.set(x * CLOUD_W, 0, z * CLOUD_W);
                            } else {
                                _cloudDummy.position.set(0, 999999, 0);
                            }
                            
                            _cloudDummy.updateMatrix();
                            
                            cloudMesh.setMatrixAt(idx, _cloudDummy.matrix);
                            if (typeof cloudDepthMesh !== 'undefined' && cloudDepthMesh) {
                                cloudDepthMesh.setMatrixAt(idx, _cloudDummy.matrix);
                            }
                            
                            idx++; 
                        }
                    }
                    cloudMesh.instanceMatrix.needsUpdate = true;
                    if (typeof cloudDepthMesh !== 'undefined' && cloudDepthMesh) {
                        cloudDepthMesh.instanceMatrix.needsUpdate = true;
                    }
                    
                    lastCloudGridX = pGridX;
                    lastCloudGridZ = pGridZ;
                    lastCloudBlockOffset = cloudBlockOffset;
                }
            }
        } 
    } 

    celestialGroup.position.set(player.x, player.y, player.z);
    sunMesh.position.set(0, Math.cos(angle) * 150, -Math.sin(angle) * 150);
    sunMesh.lookAt(celestialGroup.position);
    moonMesh.position.set(0, Math.cos(angle + Math.PI) * 150, -Math.sin(angle + Math.PI) * 150);
    moonMesh.lookAt(celestialGroup.position);

    // --- CLOUD LIGHTING: darken clouds at night ---
    if (typeof cloudMesh !== 'undefined' && cloudMesh && cloudMesh.material) {
        const sl = timeUniforms.uSunLevel.value;
        const cloudBrightness = 0.15 + sl * 0.85;
        cloudMesh.material.color.setRGB(cloudBrightness, cloudBrightness, cloudBrightness);
    }

    const camX = Math.floor(camera.position.x), camY = Math.floor(camera.position.y), camZ = Math.floor(camera.position.z);
    const _camBlockId = getVoxel(camX, camY, camZ) & 0xFF;
    const isCameraUnderwater = _camBlockId === BLOCK_IDS.WATER;
    const isCameraInLava = _camBlockId === BLOCK_IDS.LAVA;
    if (!_cachedOverlayEl) _cachedOverlayEl = document.getElementById('underwater-overlay');
    const overlay = _cachedOverlayEl;
    const radius = RENDER_DISTANCES[currentRenderDistIndex];
    const blocksDist = radius * CHUNK_SIZE;

    if (isCameraInLava) {
        overlay.style.opacity = '1'; overlay.style.backgroundColor = 'rgba(200, 60, 0, 0.7)';
        scene.fog.color.setHex(0xCC3300); scene.fog.near = 0; scene.fog.far = 5; scene.background.setHex(0xCC3300);
    } else if (isCameraUnderwater) {
        overlay.style.backgroundColor = 'rgba(0, 30, 100, 0.5)'; overlay.style.opacity = '1';
        scene.fog.color.setHex(0x001e4d); scene.fog.near = 0; scene.fog.far = 15; scene.background.setHex(0x001e4d);
    } else if (currentDimension === 'nether') {
        overlay.style.opacity = '0';
        scene.fog.color.setHex(0x571313); scene.fog.near = 1; scene.fog.far = Math.min(blocksDist, 100); scene.background.setHex(0x571313);
    } else {
        overlay.style.opacity = '0';
        scene.fog.color.copy(_currentSkyColor); scene.fog.near = blocksDist * 0.4; scene.fog.far = blocksDist; scene.background.copy(_currentSkyColor);
    }

    const pCx = Math.floor(player.x / CHUNK_SIZE), pCz = Math.floor(player.z / CHUNK_SIZE);
    const rSq = radius * radius;
    for (let [key, group] of chunkMeshes.entries()) {
        const sep = key.indexOf(',');
        const cx = parseInt(key.substring(0, sep));
        const cz = parseInt(key.substring(sep + 1));
        const distSq = (cx - pCx)**2 + (cz - pCz)**2;
        group.visible = distSq <= rSq;
    }

    const target = raycastVoxel();
    if (target && !isPaused && uiState === 'PLAYING') {
        highlightBox.visible = true;
        const b = target.bounds || getBlockBounds(target.id, target.val);
        const w = b.maxX - b.minX + 0.01, h = b.maxY - b.minY + 0.01, d = b.maxZ - b.minZ + 0.01;
        highlightBox.scale.set(w, h, d);
        highlightBox.position.set(target.hit[0] + b.minX + (b.maxX - b.minX) / 2, target.hit[1] + b.minY + (b.maxY - b.minY) / 2, target.hit[2] + b.minZ + (b.maxZ - b.minZ) / 2);
    } else highlightBox.visible = false;

    debugFrameCount++;
    const frameEnd = performance.now();
    debugFrameTime = frameEnd - time;
    const elapsed = frameEnd - debugLastSecond;
    if (elapsed >= 1000) {
        debugFps = Math.round(debugFrameCount * 1000 / elapsed);
        debugTickRate = debugTickCount;
        debugFrameCount = 0; debugTickCount = 0; debugLastSecond = frameEnd;
    }
    
    if (!_cachedDebugEl) _cachedDebugEl = document.getElementById('debug-info');
    const debugEl = _cachedDebugEl;
    if (debugEl) {
        if (window.showDebugScreen) {
            const px = player.x.toFixed(3);
            const py = player.y.toFixed(5);
            const pz = player.z.toFixed(3);
            
            const mobCount = typeof globalMobs !== 'undefined' ? globalMobs.length : 0;
            const itemCount = typeof droppedItems !== 'undefined' ? droppedItems.length : 0;
            const partCount = typeof particles !== 'undefined' ? particles.length : 0;
            const tntCount = typeof activeTNT !== 'undefined' ? activeTNT.length : 0;
            const entityCount = mobCount + itemCount + partCount + tntCount;
            
            const bX = Math.floor(player.x);
            const bY = Math.floor(player.y);
            const bZ = Math.floor(player.z);
            
            // Get biome at player position
            const biomeDisplay = (typeof getBiomeDisplayName === 'function')
                ? getBiomeDisplayName(bX, bZ)
                : 'Unknown';
            
            // Get facing direction from yaw
            let yawDeg = ((player.yaw * 180 / Math.PI) % 360 + 360) % 360;
            let facingDir, facingAxis;
            if (yawDeg >= 315 || yawDeg < 45) { facingDir = 'South'; facingAxis = '+Z'; }
            else if (yawDeg >= 45 && yawDeg < 135) { facingDir = 'West'; facingAxis = '-X'; }
            else if (yawDeg >= 135 && yawDeg < 225) { facingDir = 'North'; facingAxis = '-Z'; }
            else { facingDir = 'East'; facingAxis = '+X'; }
            
            // Build per-type mob breakdown
            let mobBreakdown = '';
            if (typeof globalMobs !== 'undefined' && globalMobs.length > 0) {
                const counts = {};
                for (const mob of globalMobs) {
                    const name = mob.constructor.name || 'Unknown';
                    counts[name] = (counts[name] || 0) + 1;
                }
                mobBreakdown = '\n' + Object.entries(counts).map(([k,v]) => `  ${k}: ${v}`).join('\n');
            }

            debugEl.textContent = `Mincecraft Beta 1.7.3 (Browser)
FPS: ${debugFps} | Frame: ${debugFrameTime.toFixed(1)}ms | Ticks/s: ${debugTickRate}
Dimension: ${currentDimension === 'nether' ? 'The Nether' : 'Overworld'}
XYZ: ${px}, ${py}, ${pz}
Block: ${bX} ${bY} ${bZ}
Chunk: ${(bX >> 4)} ${(bZ >> 4)}
Facing: ${facingDir} (${facingAxis}) (${yawDeg.toFixed(1)})
Biome: ${biomeDisplay}

E: ${entityCount} (Mobs: ${mobCount}, Items: ${itemCount}, Particles: ${partCount})${mobBreakdown}
Water Q: ${debugWaterQueue} | Lava Q: ${debugLavaQueue} | Dirty Chunks: ${dirtyChunks.size}`;

            debugEl.style.display = 'block';
        } else {
            debugEl.style.display = 'none';
        }
    }

    // During death, keep animating the player model tip-over even though gameplay is paused
    if (isDead && _fn_animatePlayerModel) _fn_animatePlayerModel(dt);

    uiScene.fog = scene.fog; 

    // Fabulous! graphics: use post-processing pipeline
    if (settingGraphicsFabulous && typeof renderFabulous === 'function' && fabulousEnabled) {
        renderFabulous(dt);
    } else {
        renderer.clear(); renderer.render(scene, camera);
        renderer.clearDepth(); renderer.render(uiScene, uiCamera);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    uiCamera.aspect = window.innerWidth / window.innerHeight;
    uiCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Resize Fabulous render targets if active
    if (typeof resizeFabulousGraphics === 'function' && fabulousEnabled) {
        resizeFabulousGraphics();
    }
}

window.updateBreakingUVs = function(texIndex) {
    if (typeof breakingBox === 'undefined' || !breakingBox) return;
    const uScale = 1 / 16, vScale = 1 / 16;
    const gridX = texIndex % 16, gridY = Math.floor(texIndex / 16);
    const uOffset = gridX * uScale, vOffset = 1.0 - (gridY * vScale) - vScale;
    const uvs = breakingBox.geometry.attributes.uv.array;
    const baseUVs = [0,1, 1,1, 0,0, 1,0, 0,1, 1,1, 0,0, 1,0, 0,1, 1,1, 0,0, 1,0, 0,1, 1,1, 0,0, 1,0, 0,1, 1,1, 0,0, 1,0, 0,1, 1,1, 0,0, 1,0];
    for (let i = 0; i < 48; i += 2) {
        uvs[i] = uOffset + baseUVs[i] * uScale;
        uvs[i+1] = vOffset + baseUVs[i+1] * vScale;
    }
    breakingBox.geometry.attributes.uv.needsUpdate = true;
};

window.spawnLavaPopParticle = function(x, y, z) {
    initLavaPopResources(); 
    
    const sprite = new THREE.Sprite(lavaPopMaterial);
    sprite.position.set(x, y, z);
    
    // REDUCED SCALE: Change 0.15 to 0.1 for a smaller fireball
    sprite.scale.set(0.1, 0.1, 1.0); 
    
    scene.add(sprite);

    particles.push({
        mesh: sprite,
        type: 'lava_pop',
        life: 1.0,
        maxLife: 1.0,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 3.0 + Math.random() * 2.0, 
        vz: (Math.random() - 0.5) * 1.5,
        lastX: x, lastY: y, lastZ: z
    });
};

// ==========================================