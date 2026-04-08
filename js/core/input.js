// ==========================================
// INPUT HANDLING
// ==========================================

    document.addEventListener('mousedown', (e) => {
        
        // --- INVENTORY OUTSIDE-CLICK TOSS LOGIC ---
        if ((uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST') && typeof cursorItem !== 'undefined' && cursorItem) {
            const survModal = document.getElementById('survival-inventory-modal');
            const creatModal = document.getElementById('inventory-modal');
            const craftModal = document.getElementById('crafting-table-modal');
            const furnModal = document.getElementById('furnace-modal');
            
            let clickedInside = false;
            if (survModal && survModal.contains(e.target)) clickedInside = true;
            if (creatModal && creatModal.contains(e.target)) clickedInside = true;
            if (craftModal && craftModal.contains(e.target)) clickedInside = true;
            if (furnModal && furnModal.contains(e.target)) clickedInside = true;
            if (e.target.closest('.item-slot')) clickedInside = true;

            if (!clickedInside) {
                window.tossItem(cursorItem.id, cursorItem.count);
                cursorItem = null;
                if (typeof updateCursorItemUI === 'function') updateCursorItemUI(e);
                return;
            }
        }

        if (!isPointerLocked || uiState !== 'PLAYING') return;
        
        swingAnimation = 1.0;

        // --- EAT FOOD INTERACTION (Independent of block targeting) ---
        if (e.button === 2 && (currentBuildBlock === 115 || currentBuildBlock === 122 || currentBuildBlock === 123 || currentBuildBlock === 134) && uiState === 'PLAYING') {
            
            let healAmount = 0;
            if (currentBuildBlock === 115) healAmount = 4; // Apple (2 hearts)
            if (currentBuildBlock === 122) healAmount = 3; // Raw Pork (1.5 hearts)
            if (currentBuildBlock === 123) healAmount = 8; // Cooked Pork (4 hearts)
            if (currentBuildBlock === 134) healAmount = 5; // Bread (2.5 hearts)

            if (player.health < player.maxHealth) {
                player.health = Math.min(player.maxHealth, player.health + healAmount); 
                if (typeof updateHealthUI === 'function') updateHealthUI();
                
                if (typeof gameMode !== 'undefined' && gameMode === 'survival') {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) {
                        inventory[activeSlot].id = 0;
                        inventory[activeSlot].count = 0;
                    }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                swingAnimation = 1.0;
            }
            return; // Handled item use, don't proceed to block placement logic
        }

        const target = raycastVoxel();

        if (e.button === 0) {
            window.isLeftMouseHeld = true; 
            
            // ---> NEW: COMBAT CHECK BEFORE BREAKING BLOCKS <---
            const hitMob = typeof getTargetedMob === 'function' ? getTargetedMob() : null;
            if (hitMob) {
                swingAnimation = 1.0; // Swing arm
                
                // Calculate Damage (Default fist = 1)
                let damage = 1; 
                if (currentBuildBlock !== 0 && typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock]) {
                    damage = TOOL_DATA[currentBuildBlock].damage || 1;
                }
                
                hitMob.takeDamage(damage, player.x, player.z);
                window.damageHeldTool(2); // Hitting a mob costs 2 durability in MC
                return; // Stop here so we don't break the block behind the pig!
            }
            // --------------------------------------------------

            if (!target) return; // If we didn't hit a mob, make sure we hit a block before continuing
            const [x, y, z] = target.hit;
            const targetId = getVoxel(x, y, z) & 0xFF;
            
            if (targetId === 18 || targetId === 0) return; 

            if (typeof gameMode !== 'undefined' && gameMode === 'creative') {
                // TNT: Ignite on left-click instead of breaking
                if (targetId === 65) {
                    if (typeof window.igniteTNT === 'function') window.igniteTNT(x, y, z);
                    window.blockBreakCooldown = 0.3;
                } else {
                    window.breakBlock(x, y, z);
                    window.blockBreakCooldown = 0.1; 
                }
            } else {
                miningState.isMining = true;
                miningState.x = x;
                miningState.y = y;
                miningState.z = z;
                miningState.id = targetId;
                miningState.progress = 0;
                miningState.stage = -1;
                if (typeof breakingBox !== 'undefined') {
                    breakingBox.position.set(x + 0.5, y + 0.5, z + 0.5);
                    breakingBox.visible = true;
                }
            }
            
        } else if (e.button === 2) {
            
            // FIX: Prevent crashes if you right-click the sky
            if (!target) return; 

            // ---> NEW: Tilling Dirt/Grass with a Hoe <---
            if (currentBuildBlock >= 130 && currentBuildBlock <= 133) {
                const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                
                // If clicking the top face of Grass (1) or Dirt (2)
                if ((targetId === 1 || targetId === 2) && target.normal[1] === 1) {
                    const aboveId = getVoxel(target.hit[0], target.hit[1] + 1, target.hit[2]) & 0xFF;
                    if (aboveId === 0) { // Ensure the block above is air
                        setVoxel(target.hit[0], target.hit[1], target.hit[2], 62); // Turn to Dry Farmland
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                        
                        if (typeof spawnParticles === 'function') spawnParticles(target.hit[0], target.hit[1], target.hit[2], 2);
                        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
                        
                        swingAnimation = 1.0;
                        return; // Stop further placement logic
                    }
                }
            }

            // ---> Lily Pad Placement on Water <---
            if (currentBuildBlock === 67) {
                const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                // Place on top of water when clicking the top face, or on water surface
                if (targetId === 4 && target.normal[1] === 1) {
                    const aboveId = getVoxel(target.hit[0], target.hit[1] + 1, target.hit[2]) & 0xFF;
                    if (aboveId === 0) {
                        setVoxel(target.hit[0], target.hit[1] + 1, target.hit[2], 67);
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1] + 1, z: target.hit[2]});
                        
                        if (typeof gameMode !== 'undefined' && gameMode === 'survival') {
                            inventory[activeSlot].count--;
                            if (inventory[activeSlot].count <= 0) {
                                inventory[activeSlot].id = 0; inventory[activeSlot].count = 0;
                            }
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        }
                        swingAnimation = 1.0;
                        return;
                    }
                }
            }

            // ---> UPDATED: Planting Seeds <---
            if (currentBuildBlock === 128) {
                const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                
                // FIX: Removed the strict normal check because Farmland is inset. 
                // If you click farmland and there is air above it, it will plant!
                if (targetId === 62 || targetId === 63) {
                    const aboveId = getVoxel(target.hit[0], target.hit[1] + 1, target.hit[2]) & 0xFF;
                    if (aboveId === 0) {
                        setVoxel(target.hit[0], target.hit[1] + 1, target.hit[2], 64, 0); // Place Crop Stage 0
                        
                        // Force chunk update immediately so the crop appears!
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1] + 1, z: target.hit[2]}); 
                        
                        if (typeof gameMode !== 'undefined' && gameMode === 'survival') {
                            inventory[activeSlot].count--;
                            if (inventory[activeSlot].count <= 0) {
                                inventory[activeSlot].id = 0; 
                                inventory[activeSlot].count = 0;
                            }
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        }
                        swingAnimation = 1.0;
                        return; // Stop further placement logic
                    }
                }
            }
            
            // --- UI BLOCK INTERACTIONS ---
            const interactTargetVal = getVoxel(target.hit[0], target.hit[1], target.hit[2]);
            const interactTargetId = interactTargetVal & 0xFF;
            
            if (interactTargetId === 58 && uiState === 'PLAYING') {
                uiState = 'CRAFTING';
                document.exitPointerLock();
                if (typeof openCraftingTable === 'function') openCraftingTable();
                return; // Do not place a block!
            }
            
            if (interactTargetId === 59 && uiState === 'PLAYING') {
                uiState = 'FURNACE';
                document.exitPointerLock();
                if (typeof openFurnace === 'function') openFurnace(target.hit[0], target.hit[1], target.hit[2]);
                return; 
            }

            // ---> CHEST INTERACTION <---
            if (interactTargetId === 69 && uiState === 'PLAYING') {
                uiState = 'CHEST';
                document.exitPointerLock();
                if (typeof openChest === 'function') openChest(target.hit[0], target.hit[1], target.hit[2]);
                return;
            }

            // ---> LOOT CHEST INTERACTION (opens same as normal chest) <---
            if (interactTargetId === 93 && uiState === 'PLAYING') {
                uiState = 'CHEST';
                document.exitPointerLock();
                if (typeof openChest === 'function') openChest(target.hit[0], target.hit[1], target.hit[2]);
                return;
            }

            // ---> NEW: STRUCTURE BLOCK INTERACTION <---
            if (interactTargetId === 60 && uiState === 'PLAYING') {
                if (typeof openStructureUI === 'function') {
                    openStructureUI(target.hit[0], target.hit[1], target.hit[2]);
                }
                return; 
            }

            // ---> DOOR INTERACTION (toggle open/close) <---
            if (interactTargetId === 149 && uiState === 'PLAYING') {
                const dx = target.hit[0], dy = target.hit[1], dz = target.hit[2];
                const dval = getVoxel(dx, dy, dz);
                const wasOpen = (dval >> 10) & 0x1;
                setVoxel(dx, dy, dz, dval ^ (1 << 10));
                const isTopHalf = (dval >> 11) & 0x1;
                const otherY = isTopHalf ? dy - 1 : dy + 1;
                const otherVal = getVoxel(dx, otherY, dz);
                if ((otherVal & 0xFF) === 149) {
                    setVoxel(dx, otherY, dz, otherVal ^ (1 << 10));
                    if (typeof updateChunks === 'function') updateChunks(dx, otherY, dz);
                }
                if (typeof updateChunks === 'function') updateChunks(dx, dy, dz);
                if (typeof window.playDoorSound === 'function') window.playDoorSound(!wasOpen);
                return;
            }

            // ---> TRAPDOOR INTERACTION (toggle open/close) <---
            if (interactTargetId === 150 && uiState === 'PLAYING') {
                const tx = target.hit[0], ty = target.hit[1], tz = target.hit[2];
                const tval = getVoxel(tx, ty, tz);
                const wasOpen = (tval >> 10) & 0x1;
                setVoxel(tx, ty, tz, tval ^ (1 << 10));
                if (typeof updateChunks === 'function') updateChunks(tx, ty, tz);
                if (typeof window.playDoorSound === 'function') window.playDoorSound(!wasOpen);
                return;
            }

            if (currentBuildBlock === 0) return;
            
            // Block placement of tools/items — only allow actual placeable blocks and saplings
            if (currentBuildBlock >= 100) {
                // These are placeable despite being >= 100
                const placeableHighIds = [116, 117, 118, 136, 137, 138, 139, 140, 141, 144, 145, 146, 147, 148, 150, 151, 152, 154, 155, 156, 157, 158, 200, 201, 202, 203, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251];
                if (!placeableHighIds.includes(currentBuildBlock)) return;
            }

            let px = target.hit[0] + target.normal[0];
            let py = target.hit[1] + target.normal[1];
            let pz = target.hit[2] + target.normal[2];
            
            const targetVal = getVoxel(target.hit[0], target.hit[1], target.hit[2]);
            const targetId = targetVal & 0xFF;
            
            // --- BUTTON INTERACTION ---
            if (targetId === 203) {
                if (typeof window.pressButton === 'function') {
                    window.pressButton(target.hit[0], target.hit[1], target.hit[2]);
                }
                swingAnimation = 1.0;
                return;
            }

            if (currentBuildBlock === 40 && targetId === 40) {
                const curLayers = Math.max(1, Math.min(8, (targetVal >> 8) & 0xF));
                if (curLayers < 8) {
                    const newLayers = curLayers + 1;
                    if (newLayers >= 8) setVoxel(target.hit[0], target.hit[1], target.hit[2], 39); 
                    else setVoxel(target.hit[0], target.hit[1], target.hit[2], 40, newLayers);
                    pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                    
                    if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                        inventory[activeSlot].count--;
                        if (inventory[activeSlot].count <= 0) {
                            inventory[activeSlot].id = 0; inventory[activeSlot].count = 0;
                        }
                        if (typeof buildUI === 'function') buildUI();
                        if (typeof selectSlot === 'function') selectSlot(activeSlot);
                    }
                    return;
                }
            }
            
            // --- SLAB DOUBLING: Clicking a slab with matching slab fills into full block ---
            // Minecraft rules: clicking the open face of a slab (top face of bottom slab, 
            // bottom face of top slab) OR a side face merges into a full block.
            if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock) && currentBuildBlock === targetId) {
                const existingIsTop = (targetVal >> 8) & 0x1;
                const slabToFull = { 70: 29, 71: 44, 72: 30, 73: 3, 74: 33, 75: 32, 76: 31, 77: 98, 157: 156, 238: 227, 239: 228, 240: 231, 241: 232, 242: 233, 248: 19, 249: 154 };
                const fullBlock = slabToFull[currentBuildBlock];
                if (fullBlock) {
                    // Merge if clicking the open face of the slab, or any side face
                    let shouldMerge = false;
                    if (existingIsTop === 0 && target.normal[1] === 1) shouldMerge = true;   // Bottom slab, clicked top face (open)
                    else if (existingIsTop === 1 && target.normal[1] === -1) shouldMerge = true; // Top slab, clicked bottom face (open)
                    else if (target.normal[1] === 0) shouldMerge = true; // Side face always merges
                    
                    if (shouldMerge) {
                        setVoxel(target.hit[0], target.hit[1], target.hit[2], fullBlock);
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                        if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(fullBlock, target.hit[0], target.hit[1], target.hit[2]);
                        
                        if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                            inventory[activeSlot].count--;
                            if (inventory[activeSlot].count <= 0) {
                                inventory[activeSlot].id = 0; inventory[activeSlot].count = 0;
                            }
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        }
                        return;
                    }
                    // If clicking the solid face (bottom of bottom slab, top of top slab),
                    // fall through to normal placement in the adjacent block
                }
            }
            
            if (isCrossBlock(targetId)) {
                px = target.hit[0]; py = target.hit[1]; pz = target.hit[2];
            }
            
            if (!canPlaceBlock(currentBuildBlock, px, py, pz, target.normal)) return;
            
            // ---> NEW: Flint and Steel Ignition <---
            if (currentBuildBlock === 136) { 
                if ((getVoxel(px, py, pz) & 0xFF) === 0) {
                    
                    // --- PORTAL DETECTION ---
                    // Check if clicking inside a valid obsidian portal frame
                    const portalResult = detectPortalFrame(px, py, pz);
                    if (portalResult) {
                        // Nether portals can't be lit in the aether
                        if (typeof currentDimension !== 'undefined' && currentDimension === 'aether') {
                            swingAnimation = 1.0;
                            return;
                        }
                        // Fill portal interior with portal blocks
                        for (const pos of portalResult.interior) {
                            setVoxel(pos.x, pos.y, pos.z, 90, portalResult.axis); // axis: 0=X-aligned, 1=Z-aligned
                            pendingBlockUpdates.push({x: pos.x, y: pos.y, z: pos.z});
                        }
                        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
                        if (typeof window.playFlintAndSteelSound === 'function') window.playFlintAndSteelSound(px, py, pz);
                        if (typeof buildUI === 'function') buildUI();
                        swingAnimation = 1.0;
                        return;
                    }
                    
                    let fireDir = 0; 
                    if (target.normal[0] === 1) fireDir = 1;       // -X wall
                    else if (target.normal[0] === -1) fireDir = 2; // +X wall
                    else if (target.normal[2] === 1) fireDir = 3;  // -Z wall
                    else if (target.normal[2] === -1) fireDir = 4; // +Z wall

                    setVoxel(px, py, pz, 89, (fireDir << 1)); 
                    
                    // NEW: Add to our active high-speed simulation queue!
                    if (typeof window.activeFireBlocks !== 'undefined' && typeof getVoxelIndex === 'function') {
                        window.activeFireBlocks.add(getVoxelIndex(px, py, pz));
                    }
                    
                    if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                    pendingBlockUpdates.push({x: px, y: py, z: pz});
                    
                    if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
                    if (typeof window.playFlintAndSteelSound === 'function') window.playFlintAndSteelSound(px, py, pz);
                    if (typeof buildUI === 'function') buildUI();
                }
                swingAnimation = 1.0;
                return; // Prevent standard block placement
            }
            
            let placeLevel = 0;
            if (currentBuildBlock === 17) {
                if (target.normal[1] === 1) placeLevel = 0;
                else if (target.normal[0] === 1) placeLevel = 1;
                else if (target.normal[0] === -1) placeLevel = 2;
                else if (target.normal[2] === 1) placeLevel = 3;
                else if (target.normal[2] === -1) placeLevel = 4;
            } else if (currentBuildBlock === 59) {
                // Furnace directional placement logic (faces the player who placed it)
                let dirX = player.x - px;
                let dirZ = player.z - pz;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    placeLevel = dirX > 0 ? 1 : 3; 
                } else {
                    placeLevel = dirZ > 0 ? 0 : 2; 
                }
            } else if (currentBuildBlock === 69) {
                // Chest directional placement (faces the player)
                let dirX = player.x - px;
                let dirZ = player.z - pz;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    placeLevel = dirX > 0 ? 1 : 3;
                } else {
                    placeLevel = dirZ > 0 ? 0 : 2;
                }
            } else if (currentBuildBlock === 93) {
                // Loot Chest — same orientation logic as normal chest
                let dirX = player.x - px;
                let dirZ = player.z - pz;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    placeLevel = dirX > 0 ? 1 : 3;
                } else {
                    placeLevel = dirZ > 0 ? 0 : 2;
                }
            } else if (currentBuildBlock === 66) {
                // Vine: attach to the face you clicked
                if (target.normal[0] === 1) placeLevel = 1;       // -X wall
                else if (target.normal[0] === -1) placeLevel = 2;  // +X wall
                else if (target.normal[2] === 1) placeLevel = 3;   // -Z wall
                else if (target.normal[2] === -1) placeLevel = 4;  // +Z wall
                else placeLevel = 1; // default
            } else if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock)) {
                // Minecraft slab placement rules:
                // - Clicking top face of a block → bottom slab (level 0)
                // - Clicking bottom face of a block → top slab (level 1)
                // - Clicking side face → depends on exact Y hit position within the placement cell:
                //   if the ray hit the upper half (localY >= 0.5), top slab; otherwise bottom slab
                if (target.normal[1] === 1) {
                    placeLevel = 0; // Clicked top face = bottom slab
                } else if (target.normal[1] === -1) {
                    placeLevel = 1; // Clicked bottom face = top slab
                } else {
                    // Side face: use the exact Y coordinate where the ray hit
                    // to determine upper vs lower half within the placement block
                    if (target.exactHit) {
                        const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                        placeLevel = (localY >= 0.5) ? 1 : 0;
                    } else {
                        // Fallback if exactHit not available
                        placeLevel = 0;
                    }
                }
            } else if (typeof isStairBlock === 'function' && isStairBlock(currentBuildBlock)) {
                // Stairs: low step faces toward player, tall back faces away
                // sd=0: back=+Z(tall), front=-Z(low). sd=1: back=-Z, front=+Z.
                // sd=2: back=+X, front=-X. sd=3: back=-X, front=+X.
                // Player at +Z → low step at +Z → front=+Z → sd=1
                let dirX = player.x - (px + 0.5);
                let dirZ = player.z - (pz + 0.5);
                let stairDir = 0;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    stairDir = dirX > 0 ? 3 : 2; // player at +X → front at +X → sd=3
                } else {
                    stairDir = dirZ > 0 ? 1 : 0; // player at +Z → front at +Z → sd=1
                }
                // Upside-down: bit 2 (value 4). Place upside-down when clicking bottom face or upper side
                let upsideDown = 0;
                if (target.normal[1] === -1) {
                    upsideDown = 4;
                } else if (target.normal[1] === 0) {
                    if (target.exactHit) {
                        const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                        if (localY >= 0.5) upsideDown = 4;
                    }
                }
                placeLevel = stairDir | upsideDown;
            }
            else if (currentBuildBlock === 68 || currentBuildBlock === 158) { 
                let yaw = player.yaw * (180 / Math.PI);
                if (yaw < 0) yaw += 360;
                
                // If looking East/West, align along Z-axis (1). If looking North/South, align along X-axis (0)
                if ((yaw > 45 && yaw <= 135) || (yaw > 225 && yaw <= 315)) {
                    placeLevel = 1;
                }
            }
            // Wood Button (203) → place on side face of block
            else if (currentBuildBlock === 203) {
                // Only place on side faces (not top/bottom)
                if (target.normal[1] !== 0) return; // Can't place on top or bottom
                // Direction: which face the button attaches to
                // normal points away from the block the button goes on
                // dir 0 = button on +Z face of block (normal is [0,0,1])
                // dir 1 = button on +X face (normal [1,0,0])
                // dir 2 = button on -Z face (normal [0,0,-1])
                // dir 3 = button on -X face (normal [-1,0,0])
                let btnDir = 0;
                if (target.normal[2] === 1) btnDir = 0;
                else if (target.normal[0] === 1) btnDir = 1;
                else if (target.normal[2] === -1) btnDir = 2;
                else if (target.normal[0] === -1) btnDir = 3;
                placeLevel = btnDir;
            }
            // Redstone Dust (202) → place flat on top of solid block
            else if (currentBuildBlock === 202) {
                // Must be placed on top of a solid block
                if (target.normal[1] !== 1) return; // Only on top face
                const belowId = getVoxel(px, py - 1, pz) & 0xFF;
                if (belowId === 0 || isFluidBlock(belowId) || isCrossBlock(belowId)) return;
                setVoxel(px, py, pz, 202, 0); // Place with power 0
                pendingBlockUpdates.push({x: px, y: py, z: pz});
                if (typeof window.onRedstoneBlockChanged === 'function') window.onRedstoneBlockChanged(px, py, pz);
                if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(202, px, py, pz);
                if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                queueNeighbors(px, py, pz);
                triggerNeighborUpdates(px, py, pz);
                swingAnimation = 1.0;
                return;
            }
            // Door item (151) → place door block (149) as 2-block-tall structure
            else if (currentBuildBlock === 151) {
                // Check space for both bottom and top
                const aboveId = getVoxel(px, py + 1, pz) & 0xFF;
                if (aboveId !== 0 && aboveId !== 4 && aboveId !== 27) return; // No room above
                
                // Direction based on player yaw (face toward player)
                let dirX = player.x - (px + 0.5);
                let dirZ = player.z - (pz + 0.5);
                let doorDir = 0;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    doorDir = dirX > 0 ? 1 : 3;
                } else {
                    doorDir = dirZ > 0 ? 0 : 2;
                }
                
                // Hinge side: check for adjacent blocks to pick hinge
                // Default left hinge (0), switch to right (1) if block on left
                let hinge = 0;
                
                // Encode: bits 8-9 = dir, bit 10 = open(0), bit 11 = half(0=bottom,1=top), bit 12 = hinge
                const bottomVal = (doorDir) | (0 << 2) | (0 << 3) | (hinge << 4);
                const topVal = (doorDir) | (0 << 2) | (1 << 3) | (hinge << 4);
                
                setVoxel(px, py, pz, 149, bottomVal);
                setVoxel(px, py + 1, pz, 149, topVal);
                if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                if (typeof updateChunks === 'function') updateChunks(px, py + 1, pz);
                pendingBlockUpdates.push({x: px, y: py, z: pz});
                pendingBlockUpdates.push({x: px, y: py + 1, z: pz});
                
                if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(149);
                
                if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                swingAnimation = 1.0;
                return;
            }
            // Trapdoor directional placement
            else if (currentBuildBlock === 150) {
                // Direction = which face the trapdoor attaches to
                let tdDir = 0;
                if (target.normal[2] === 1) tdDir = 0;       // Attached to -Z face
                else if (target.normal[0] === -1) tdDir = 1;  // Attached to +X face
                else if (target.normal[2] === -1) tdDir = 2;  // Attached to +Z face
                else if (target.normal[0] === 1) tdDir = 3;   // Attached to -X face
                
                // Top or bottom placement based on click position
                let isTop = 0;
                if (target.normal[1] === -1) {
                    isTop = 1; // Clicking bottom of block above = top trapdoor
                } else if (target.normal[1] === 0) {
                    const clickY = target.hit[1] + 0.5;
                    if (player.y + player.eyeLevel > clickY + 0.5) isTop = 1;
                }
                
                // Encode: bits 8-9 = dir, bit 10 = open(0), bit 11 = isTop
                placeLevel = tdDir | (0 << 2) | (isTop << 3);
            }
            
            const margin = 0.05; 
            const pMinX = player.x - PLAYER_WIDTH/2 + margin, pMaxX = player.x + PLAYER_WIDTH/2 - margin;
            const pMinY = player.y + margin, pMaxY = player.y + player.height - margin;
            const pMinZ = player.z - PLAYER_WIDTH/2 + margin, pMaxZ = player.z + PLAYER_WIDTH/2 - margin;
            
            const bMinX = px, bMaxX = px + 1;
            const bMinY = py, bMaxY = py + 1;
            const bMinZ = pz, bMaxZ = pz + 1;
            
            const intersect = (pMinX < bMaxX && pMaxX > bMinX) &&
                              (pMinY < bMaxY && pMaxY > bMinY) &&
                              (pMinZ < bMaxZ && pMaxZ > bMinZ);
                              
            if (!intersect || currentBuildBlock === 17 || currentBuildBlock === 116 || currentBuildBlock === 117 || currentBuildBlock === 118 || currentBuildBlock === 137) {
                if (currentBuildBlock === 4) {
                    // Water can't exist in the nether — it would evaporate
                    // instantly. Block placement entirely.
                    if (typeof currentDimension !== 'undefined' && currentDimension === 'nether') {
                        // No-op — silently refuse the placement
                    } else {
                        setVoxel(px, py, pz, 4, 8, 0, 1); 
                        updateWaterQueue.add(getVoxelIndex(px, py, pz));
                    }
                } else if (currentBuildBlock === 27) {
                    setVoxel(px, py, pz, 27, 4, 0, 1); 
                    updateLavaQueue.add(getVoxelIndex(px, py, pz));
                } else if (currentBuildBlock === 40) {
                    setVoxel(px, py, pz, 40, 1); 
                } else if (isLeafBlock(currentBuildBlock)) {
                    // Player-placed leaves: set persistent flag (source bit 13 = 1) so they never decay
                    setVoxel(px, py, pz, currentBuildBlock, 0, 0, 1);
                } else {
                    setVoxel(px, py, pz, currentBuildBlock, placeLevel, 0, 0); 
                }
                
                // Chest placement hook — auto-merge into double chest
                if (currentBuildBlock === 69 && typeof window.onChestPlaced === 'function') {
                    window.onChestPlaced(px, py, pz);
                }

                // Loot Chest placement hook — fill with random loot
                if (currentBuildBlock === 93 && typeof window.fillLootChest === 'function') {
                    window.fillLootChest(px, py, pz);
                }

                // Spawner placement hook — register for particle/spawn ticking
                if (currentBuildBlock === 54 && typeof window.registerSpawner === 'function') {
                    window.registerSpawner(px, py, pz);
                }

                // Play block place sound
                if (typeof window._soundPlaceBlock === 'function') {
                    window._soundPlaceBlock(currentBuildBlock);
                }
                
                if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) {
                        inventory[activeSlot].id = 0;
                        inventory[activeSlot].count = 0;
                    }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }

                queueNeighbors(px, py, pz);
                checkGravity(px, py, pz); 
                triggerNeighborUpdates(px, py, pz);
                
                // Redstone update when placing button near redstone
                if ((currentBuildBlock === 203 || currentBuildBlock === 236) && typeof window.onRedstoneBlockChanged === 'function') {
                    window.onRedstoneBlockChanged(px, py, pz);
                }
                
                pendingBlockUpdates.push({x: px, y: py, z: pz});
            }
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            window.isLeftMouseHeld = false; 
            if (typeof miningState !== 'undefined') miningState.isMining = false;
            if (typeof breakingBox !== 'undefined' && breakingBox) breakingBox.visible = false;
        }
    });
    
    const uiLayer = document.getElementById('ui-layer');
    const crosshair = document.getElementById('crosshair');

    uiLayer.addEventListener('click', () => {
        if (window._mobileSkipPointerLock) {
            // Mobile: skip pointer lock, just go to playing state
            isPointerLocked = true;
            uiState = 'PLAYING';
            uiLayer.classList.add('hidden');
            document.getElementById('pause-menu').classList.add('hidden');
            return;
        }
        document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        // On mobile, pointer lock is faked — ignore real pointerlockchange events
        if (window._mobileSkipPointerLock) return;
        
        if (document.pointerLockElement === document.body) {
            isPointerLocked = true;
            uiState = 'PLAYING';
            uiLayer.classList.add('hidden');
            document.getElementById('inventory-modal').classList.add('hidden');
            
            const survModal = document.getElementById('survival-inventory-modal');
            if (survModal) survModal.classList.add('hidden');
            
            if (typeof closeCraftingTable === 'function') closeCraftingTable();
            if (typeof closeFurnace === 'function') closeFurnace();
            if (typeof closeChest === 'function') closeChest();
            
            document.getElementById('pause-menu').classList.add('hidden');
            crosshair.style.display = 'block';
            
            if (typeof cursorItem !== 'undefined' && cursorItem) {
                window.tossItem(cursorItem.id, cursorItem.count);
                cursorItem = null;
                if (typeof updateCursorItemUI === 'function') updateCursorItemUI();
            }

        } else {
            isPointerLocked = false;
            crosshair.style.display = 'none';
            for(let k in keys) keys[k] = false;
            
            window.isLeftMouseHeld = false;
            if (typeof miningState !== 'undefined') miningState.isMining = false;
            if (typeof breakingBox !== 'undefined' && breakingBox) breakingBox.visible = false;

            if (uiState === 'DEAD') {
                // Don't do anything when pointer lock drops during death screen
            } else if (uiState === 'PLAYING') {
                uiState = 'PAUSED';
                document.getElementById('pause-menu').classList.remove('hidden');
                showPauseScreen('pause-main');
            // Added uiState !== 'CHEST' to prevent the game from pausing
            } else if (uiState !== 'INVENTORY' && uiState !== 'CRAFTING' && uiState !== 'FURNACE' && uiState !== 'CHEST' && uiState !== 'PAUSED') {
                uiState = 'MENU';
                uiLayer.classList.remove('hidden');
            }
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST') {
            const tooltip = document.getElementById('item-tooltip');
            // Tooltip is position:fixed and excluded from CSS zoom, so use raw clientX
            tooltip.style.left = (e.clientX + 16) + 'px';
            tooltip.style.top  = (e.clientY + 14) + 'px';
        }
        if (!isPointerLocked || uiState !== 'PLAYING') return;
        const sensitivity = 0.002;
        player.yaw -= e.movementX * sensitivity;
        player.pitch -= e.movementY * sensitivity;
        player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
    });


window.damageHeldTool = function(amount) {
    if (gameMode !== 'survival') return;
    
    const item = inventory[activeSlot];
    if (!item || item.id === 0) return;

    const tool = TOOL_DATA[item.id];
    // This check ensures durability works for ANY item defined in TOOL_DATA with durability
    if (!tool || !tool.maxDurability) return;

    if (item.durability === undefined) item.durability = tool.maxDurability;
    
    item.durability -= amount;

    if (item.durability <= 0) {
        inventory[activeSlot] = { id: 0, count: 0 }; // Tool breaks
    }
    
    // Refresh the UI to update the colored bar
    if (typeof buildUI === 'function') buildUI();
    if (typeof updateHeldItem === 'function') updateHeldItem();
};
// ==========================================