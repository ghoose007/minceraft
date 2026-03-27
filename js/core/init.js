// ==========================================
// GAME INITIALIZATION & EVENT HANDLERS
// ==========================================

// --- "Click to Play" overlay shown after world loads ---
function _showClickToPlay() {
    // Remove any existing overlay
    const existing = document.getElementById('click-to-play-overlay');
    if (existing) existing.remove();
    
    // Hide the pause menu so it doesn't show behind the overlay
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    
    const overlay = document.createElement('div');
    overlay.id = 'click-to-play-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        cursor: pointer;
    `;
    
    const text = document.createElement('div');
    text.textContent = 'Click to Play';
    text.style.cssText = `
        font-family: 'Minecraft', 'Silkscreen', monospace, sans-serif;
        font-size: 36px;
        color: white;
        text-shadow: 3px 3px 0px #3f3f3f;
        pointer-events: none;
    `;
    overlay.appendChild(text);
    
    overlay.addEventListener('click', () => {
        overlay.remove();
        document.body.requestPointerLock();
    });
    
    document.body.appendChild(overlay);
}

// --- 2. INITIALIZATION ---
async function init(seed, loadedData) {
    CHUNKS_X = CHUNKS_X_ACTIVE;
    CHUNKS_Z = CHUNKS_Z_ACTIVE;
    WORLD_WIDTH = CHUNKS_X * CHUNK_SIZE;
    WORLD_DEPTH = CHUNKS_Z * CHUNK_SIZE;
    
    // Reset dimension state for fresh starts (loaded worlds restore this later)
    currentDimension = 'overworld';
    netherGenerated = false;
    overworldChunkStorage = null;
    overworldGeneratedChunks = null;
    overworldBiomeMap = null;
    netherChunkStorage = null;
    netherGeneratedChunks = null;
    if (!window._portalLinks) window._portalLinks = [];
    else window._portalLinks.length = 0;
    
    clearChunkStorage();
    initChunkStorage();
    _updateWorldHalves();
    
    useLazyGeneration = (CHUNKS_X > LAZY_GEN_THRESHOLD || CHUNKS_Z > LAZY_GEN_THRESHOLD);
    
    if (!useLazyGeneration && !loadedData) {
        for (let cx = 0; cx < CHUNKS_X; cx++) {
            for (let cz = 0; cz < CHUNKS_Z; cz++) {
                _getOrCreateChunkFast(cx, cz);
            }
        }
    }
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 
    const initialDist = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
    scene.fog = new THREE.Fog(0x87CEEB, initialDist * 0.4, initialDist);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera); 

    uiScene = new THREE.Scene();
    uiCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    uiScene.add(uiCamera);

    heldItemGroup = new THREE.Group();
    heldItemGroup.position.set(0.56, -0.52, -0.72);
    heldItemGroup.scale.set(0.35, 0.35, 0.35);
    heldItemGroup.rotation.order = 'YXZ';
    heldItemGroup.rotation.set(0, -Math.PI / 4, Math.PI / 16);
    uiCamera.add(heldItemGroup);
    
    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.autoClear = false; 
    document.body.appendChild(renderer.domElement);

    const highlightGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 1.0, 1.0));
    const highlightMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    highlightBox = new THREE.LineSegments(highlightGeo, highlightMat);
    highlightBox.visible = false;
    scene.add(highlightBox);
    
    celestialGroup = new THREE.Group();
    scene.add(celestialGroup);
    
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xFFFFAA, fog: false, side: THREE.DoubleSide });
    sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), sunMat);
    celestialGroup.add(sunMesh);
    
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xDDDDDD, fog: false, side: THREE.DoubleSide });
    moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), moonMat);
    celestialGroup.add(moonMesh);

    // --- INITIALIZE CLOUDS (TEXTURE MAP) ---
    const cloudImg = new Image();
    cloudImg.src = 'textures/clouds.png?v=' + ASSET_VERSION;
    cloudImg.onload = () => {
        // Draw the image to a hidden canvas to extract pixel data
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cloudImg, 0, 0, 256, 256);
        
        // Store the raw RGBA pixel array globally
        window.cloudMapData = ctx.getImageData(0, 0, 256, 256).data;

        const cloudGeo = new THREE.BoxGeometry(CLOUD_W, CLOUD_H, CLOUD_W);
        const cloudColors = [];
        
        const cTop = new THREE.Color(0xffffff);  // Pure white top
        const cSide = new THREE.Color(0xdddddd); // Light gray sides
        const cBot = new THREE.Color(0xbbbbbb);  // Darker gray bottom

        for (let i = 0; i < 6; i++) {
            let c = cSide;
            if (i === 2) c = cTop;
            if (i === 3) c = cBot;
            for (let j = 0; j < 4; j++) {
                cloudColors.push(c.r, c.g, c.b);
            }
        }
        cloudGeo.setAttribute('color', new THREE.Float32BufferAttribute(cloudColors, 3));

        // 1. The "Depth Shield" - Invisible, but blocks internal faces from drawing
        const cloudDepthMat = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true
        });

        // 2. The "Color Pass" - Transparent, draws exactly on top of the shield
        const cloudMat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            depthWrite: false, 
            fog: true 
        });

        // Create TWO instanced meshes
        window.cloudDepthMesh = new THREE.InstancedMesh(cloudGeo, cloudDepthMat, CLOUD_COVERAGE * CLOUD_COVERAGE);
        window.cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUD_COVERAGE * CLOUD_COVERAGE);

        // Force the invisible shield to render right before the colored clouds
        window.cloudDepthMesh.renderOrder = 1; 
        window.cloudMesh.renderOrder = 2; 

        scene.add(window.cloudDepthMesh);
        scene.add(window.cloudMesh);
    };
    // -------------------------

    document.addEventListener('contextmenu', e => {
        e.preventDefault(); 
    });

    if (!loadedData) {
        await generateWorld();
    } else {
        // Load textures and init noise for saved worlds
        updateLoadingBar(10, 'Initializing...');
        await yieldToUI();
        if (typeof _initWorldGenNoise === 'function') _initWorldGenNoise();
        biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);
        
        updateLoadingBar(20, 'Loading textures...');
        await yieldToUI();
        // Load your fire texture BEFORE building chunks
        if (typeof loadFireTexture === 'function') await loadFireTexture(); 
        textureAtlas = await loadTextureAtlas();
        await loadToolAtlas();
        solidMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, alphaTest: 0.5, transparent: false, side: THREE.FrontSide, vertexColors: true });
        injectLightingShader(solidMaterial);
        if (typeof createPortalMaterial === 'function') createPortalMaterial(textureAtlas);
        glassMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, transparent: true, opacity: 1.0, alphaTest: 0.0, side: THREE.FrontSide, vertexColors: true, depthWrite: false });
        injectLightingShader(glassMaterial);
        const waterTex = await loadWaterTexture();
        waterMaterial = createFluidMaterial(waterTex, true);
        const lavaTex = await loadLavaTexture();
        lavaMaterial = createFluidMaterial(lavaTex, false);
    }

    // --- INIT PLAYER MODEL FOR THIRD PERSON ---
    if (typeof initPlayerModel === 'function') initPlayerModel();

    // Init fire overlay (needs camera + fireMaterial to exist)
    if (typeof getFireOverlayPlane === 'function') getFireOverlayPlane();
    
    // --- OVERLAY MESH CREATION ---
    const breakGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    breakingMat = new THREE.MeshBasicMaterial({
        map: typeof textureAtlas !== 'undefined' ? textureAtlas : null,
        transparent: true,
        alphaTest: 0.1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
    });
    breakingBox = new THREE.Mesh(breakGeo, breakingMat);
    breakingBox.visible = false;
    scene.add(breakingBox);
    
    if (loadedData) {
        // --- RESTORE SAVED WORLD ---
        updateLoadingBar(30, 'Restoring world data...');
        await yieldToUI();
        
        if (loadedData.generatedFlags) {
            for (let i = 0; i < loadedData.generatedFlags.length && i < generatedChunksArr.length; i++) {
                generatedChunksArr[i] = loadedData.generatedFlags[i];
            }
        }
        if (typeof decompressChunks === 'function') decompressChunks(loadedData.chunks);
        
        // Rebuild biome map from noise
        updateLoadingBar(35, 'Rebuilding biome data...');
        await yieldToUI();
        const halfW = WORLD_WIDTH / 2, halfD = WORLD_DEPTH / 2;
        for (let cx = 0; cx < CHUNKS_X; cx++) {
            for (let cz = 0; cz < CHUNKS_Z; cz++) {
                if (generatedChunksArr[cx * CHUNKS_Z + cz] !== 1) continue;
                const biomeData = _computeChunkBiomeData(cx, cz);
                const sx = cx * CHUNK_SIZE - halfW, sz = cz * CHUNK_SIZE - halfD;
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                        const gIdx = (sx + lx + halfW) + (sz + lz + halfD) * WORLD_WIDTH;
                        if (gIdx >= 0 && gIdx < WORLD_WIDTH * WORLD_DEPTH)
                            biomeMap[gIdx] = BIOME_NAMES[biomeData.biomes[lx + lz * CHUNK_SIZE]];
                    }
                }
            }
        }
        
        // Restore player
        player.x = loadedData.player.x; player.y = loadedData.player.y; player.z = loadedData.player.z;
        player.yaw = loadedData.player.yaw || 0; player.pitch = loadedData.player.pitch || 0;
        player.health = loadedData.player.health || 20; player.maxHealth = loadedData.player.maxHealth || 20;
        player.flying = loadedData.player.flying || false;
        player.highestY = loadedData.player.highestY || loadedData.player.y;
        player.vx = 0; player.vy = 0; player.vz = 0; player.onGround = false;

        // Restore world spawn point (fallback to player position if not saved)
        window.worldSpawnX = loadedData.worldSpawnX !== undefined ? loadedData.worldSpawnX : player.x;
        window.worldSpawnY = loadedData.worldSpawnY !== undefined ? loadedData.worldSpawnY : (player.y - 2);
        window.worldSpawnZ = loadedData.worldSpawnZ !== undefined ? loadedData.worldSpawnZ : player.z;
        
        // Restore inventory
        if (loadedData.inventory) {
            for (let i = 0; i < inventory.length; i++) {
                if (loadedData.inventory[i]) {
                    inventory[i].id = loadedData.inventory[i].id;
                    inventory[i].count = loadedData.inventory[i].count;
                    if (loadedData.inventory[i].durability !== undefined) {
                        inventory[i].durability = loadedData.inventory[i].durability;
                    }
                }
                else { inventory[i].id = 0; inventory[i].count = 0; }
            }
        }
        
        // Restore chests
        if (loadedData.chests && typeof activeChests !== 'undefined') {
            activeChests.clear();
            for (const c of loadedData.chests) {
                activeChests.set(c.key, { slots: c.slots, doublePartner: c.doublePartner });
            }
        }
        
        // Restore furnaces
        if (loadedData.furnaces && typeof activeFurnaces !== 'undefined') {
            activeFurnaces.clear();
            for (const f of loadedData.furnaces) {
                activeFurnaces.set(f.key, {
                    input: f.input, fuel: f.fuel, output: f.output,
                    burnTime: f.burnTime, totalBurnTime: f.totalBurnTime,
                    cookTime: f.cookTime, totalCookTime: f.totalCookTime
                });
            }
        }
        
        // Restore dropped items — defer until after scene and meshes are ready
        if (loadedData.droppedItems && loadedData.droppedItems.length > 0) {
            window._pendingDroppedItems = loadedData.droppedItems;
        }
        
        // --- Restore dimension state ---
        if (loadedData._savedDimension && loadedData._savedDimension === 'nether') {
            // Player was in the nether when they saved.
            // chunkStorageArr currently holds overworld data (decompressed above).
            // Save it aside, then decompress nether into the active arrays.
            overworldChunkStorage = chunkStorageArr;
            overworldGeneratedChunks = generatedChunksArr;
            overworldBiomeMap = biomeMap;
            
            const total = CHUNKS_X * CHUNKS_Z;
            netherChunkStorage = new Array(total);
            for (let i = 0; i < total; i++) netherChunkStorage[i] = null;
            netherGeneratedChunks = new Uint8Array(total);
            
            if (loadedData.netherChunks && loadedData.netherChunks.length > 0) {
                // Temporarily point active arrays at nether storage for decompression
                chunkStorageArr = netherChunkStorage;
                generatedChunksArr = netherGeneratedChunks;
                if (loadedData.netherGeneratedFlags) {
                    for (let i = 0; i < loadedData.netherGeneratedFlags.length && i < generatedChunksArr.length; i++)
                        generatedChunksArr[i] = loadedData.netherGeneratedFlags[i];
                }
                if (typeof decompressChunks === 'function') decompressChunks(loadedData.netherChunks);
            }
            
            // Swap active arrays to nether (player is in nether)
            chunkStorageArr = netherChunkStorage;
            generatedChunksArr = netherGeneratedChunks;
            biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);
            currentDimension = 'nether';
            netherGenerated = true;
        } else {
            currentDimension = 'overworld';
            // If nether was previously generated, restore its data into stored arrays
            if (loadedData._netherGenerated && loadedData.netherChunks && loadedData.netherChunks.length > 0) {
                const total = CHUNKS_X * CHUNKS_Z;
                netherChunkStorage = new Array(total);
                for (let i = 0; i < total; i++) netherChunkStorage[i] = null;
                netherGeneratedChunks = new Uint8Array(total);
                
                const savedArr = chunkStorageArr;
                const savedGen = generatedChunksArr;
                chunkStorageArr = netherChunkStorage;
                generatedChunksArr = netherGeneratedChunks;
                if (loadedData.netherGeneratedFlags) {
                    for (let i = 0; i < loadedData.netherGeneratedFlags.length && i < generatedChunksArr.length; i++)
                        generatedChunksArr[i] = loadedData.netherGeneratedFlags[i];
                }
                if (typeof decompressChunks === 'function') decompressChunks(loadedData.netherChunks);
                chunkStorageArr = savedArr;
                generatedChunksArr = savedGen;
                netherGenerated = true;
            }
        }
        
        // Restore portal links and nether generated flag
        netherGenerated = loadedData._netherGenerated || netherGenerated || false;
        window._portalLinks = loadedData._portalLinks || [];
        
        // Lighting and meshing
        updateLoadingBar(60, 'Recalculating lighting...');
        await yieldToUI();
        const loadRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        if (useLazyGeneration) {
            const pcx = Math.floor((player.x + Math.floor(WORLD_WIDTH / 2)) / CHUNK_SIZE);
            const pcz = Math.floor((player.z + Math.floor(WORLD_DEPTH / 2)) / CHUNK_SIZE);
            for (let dx = -loadRadius; dx <= loadRadius; dx++)
                for (let dz = -loadRadius; dz <= loadRadius; dz++)
                    ensureChunkGenerated(pcx + dx, pcz + dz);
        }
        recalculateLightingInRadius(player.x, player.z, loadRadius * CHUNK_SIZE);
        
        updateLoadingBar(80, 'Building chunks...');
        await yieldToUI();
        if (useLazyGeneration) updateNearbyChunks(player.x, player.z, loadRadius);
        else updateAllChunks();
        
        updateLoadingBar(90, 'Meshing chunks...');
        await yieldToUI();
        let mc2 = 0; const td2 = dirtyChunks.size;
        for (let key of dirtyChunks) {
            const sep = key.indexOf(',');
            buildChunkMesh(parseInt(key.substring(0, sep)), parseInt(key.substring(sep + 1)));
            if (++mc2 % 64 === 0) { updateLoadingBar(90 + (mc2/td2)*9, `Meshing... ${mc2}/${td2}`); await yieldToUI(); }
        }
        dirtyChunks.clear();
        
        // If loaded into nether, set nether fog/sky immediately
        if (currentDimension === 'nether') {
            scene.fog = new THREE.Fog(0x571313, 1, 100);
            scene.background = new THREE.Color(0x571313);
        }
    } else {
    // --- NORMAL WORLD GENERATION PATH ---
    if (useLazyGeneration) {
        updateLoadingBar(85, 'Preparing spawn area...');
        await yieldToUI();
        const spawnRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        const centerCX = Math.floor(CHUNKS_X / 2);
        const centerCZ = Math.floor(CHUNKS_Z / 2);
        for (let dx = -spawnRadius; dx <= spawnRadius; dx++) {
            for (let dz = -spawnRadius; dz <= spawnRadius; dz++) {
                ensureChunkGenerated(centerCX + dx, centerCZ + dz);
            }
            if (dx % 4 === 0) {
                updateLoadingBar(85 + ((dx + spawnRadius) / (spawnRadius * 2)) * 5, 'Generating spawn chunks...');
                await yieldToUI();
            }
        }
        
        updateLoadingBar(90, 'Calculating spawn lighting...');
        await yieldToUI();
        recalculateLightingInRadius(0, 0, spawnRadius * CHUNK_SIZE);
    } else {
        updateLoadingBar(85, 'Calculating lighting...');
        await yieldToUI();
        recalculateLighting();
    }
    
    updateLoadingBar(92, 'Building initial chunks...');
    await yieldToUI();
    if (useLazyGeneration) {
        const spawnRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        updateNearbyChunks(0, 0, spawnRadius);
    } else {
        updateAllChunks();
    }
    
    updateLoadingBar(95, 'Meshing chunks...');
    await yieldToUI();
    let meshCount = 0;
    const totalDirty = dirtyChunks.size;
    for (let key of dirtyChunks) {
        const sep = key.indexOf(',');
        const cx = parseInt(key.substring(0, sep));
        const cz = parseInt(key.substring(sep + 1));
        buildChunkMesh(cx, cz);
        meshCount++;
        if (meshCount % 64 === 0) {
            updateLoadingBar(95 + (meshCount / totalDirty) * 4, `Meshing chunks... ${meshCount}/${totalDirty}`);
            await yieldToUI();
        }
    }
    dirtyChunks.clear();

    let spawnX = 0, spawnZ = 0;
    let spawnY = getHighestBlock(0, 0);
    let foundLand = spawnY >= GEN_SEA_LEVEL;
    if (!foundLand) {
        for (let r = 1; r < 200 && !foundLand; r += 2) {
            for (let dx = -r; dx <= r && !foundLand; dx += 4) {
                for (let dz = -r; dz <= r && !foundLand; dz += 4) {
                    if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
                    const sy = getHighestBlock(dx, dz);
                    const sid = getVoxel(dx, sy, dz) & 0xFF;
                    if (sy >= GEN_SEA_LEVEL && sid !== 0 && sid !== 4 && sid !== 27) {
                        spawnX = dx; spawnZ = dz; spawnY = sy;
                        foundLand = true;
                    }
                }
            }
        }
    }
    player.x = spawnX;
    player.z = spawnZ;
    player.y = spawnY + 2;

    // Store world spawn for respawning after death
    window.worldSpawnX = spawnX;
    window.worldSpawnZ = spawnZ;
    window.worldSpawnY = spawnY;
    } // end normal generation path

    if (typeof buildUI === 'function') buildUI();
    if (typeof selectSlot === 'function') selectSlot(0);
    if (typeof updateHeldItem === 'function') updateHeldItem();
    if (typeof updateHealthUI === 'function') updateHealthUI();

    // Restore dropped items from save data (deferred until scene + textures are ready)
    if (window._pendingDroppedItems && typeof window.spawnDroppedItem === 'function') {
        for (const item of window._pendingDroppedItems) {
            window.spawnDroppedItem(item.x, item.y, item.z, item.id, item.count, 0, 0, 0);
            // Restore durability on the newly spawned dropped item
            if (item.durability !== undefined && droppedItems.length > 0) {
                droppedItems[droppedItems.length - 1].durability = item.durability;
            }
        }
        delete window._pendingDroppedItems;
    }

    updateLoadingBar(100, 'Done!');
    await yieldToUI();
    
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('ui-layer').classList.remove('hidden');
    document.getElementById('clock-container').style.display = '';
    document.getElementById('hud-layer').style.display = '';
    
    if (typeof applyGUIScale === 'function') applyGUIScale(); 
    
    // Position camera at player so the view is correct behind the overlay
    camera.position.set(player.x, player.y + player.eyeLevel, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    
    animate();

    // Show "Click to Play" overlay instead of auto-requesting pointer lock
    _showClickToPlay();

    window.addEventListener('resize', () => {
        onWindowResize();
        applyGUIScale(); 
    });
    
    document.addEventListener('keydown', (e) => { 
        // ---> NEW: F3 Debug Screen Toggle <---
        if (e.code === 'F3') {
            e.preventDefault(); // Stop browser search bar from opening
            window.showDebugScreen = !window.showDebugScreen;
            return;
        }

        // F3 + M: toggle mob spawn menu
        if (e.code === 'KeyM' && window.showDebugScreen && uiState === 'PLAYING') {
            e.preventDefault();
            window._toggleMobSpawnMenu();
            return;
        }

        // F3 + P: toggle gamemode between creative and survival (dev shortcut)
        if ((e.code === 'KeyP' || e.code === 'Equal') && window.showDebugScreen) {
            e.preventDefault();
            gameMode = (gameMode === 'creative') ? 'survival' : 'creative';

            // If switching to survival while flying, disable flight
            if (gameMode === 'survival' && player.flying) {
                player.flying = false;
                player.vy = 0;
                const flightEl = document.getElementById('flight-indicator');
                if (flightEl) { flightEl.textContent = '✦ Not Flying'; flightEl.style.opacity = '1'; setTimeout(() => flightEl.style.opacity = '0', 1500); }
            }

            // Refresh health bar visibility
            if (typeof updateHealthUI === 'function') updateHealthUI();
            if (typeof buildUI === 'function') buildUI();

            const el = document.getElementById('action-text');
            if (el) {
                el.textContent = 'Game Mode: ' + (gameMode === 'creative' ? 'Creative' : 'Survival');
                el.style.opacity = '1';
                clearTimeout(window._actionTextTO);
                window._actionTextTO = setTimeout(() => el.style.opacity = '0', 2000);
            }
            return;
        } 
        if (e.repeat) return; 

        if(uiState === 'PLAYING') {
            if(keys.hasOwnProperty(e.code)) keys[e.code] = true; 

            if (e.code === 'KeyW') {
                const now = performance.now();
                if (now - lastWPressTime < DOUBLE_TAP_THRESHOLD) {
                    wDoubleTapped = true;
                }
                lastWPressTime = now;
            }

            if (e.code === 'Space') {
                const now = performance.now();
                if (now - lastSpacePressTime < DOUBLE_TAP_THRESHOLD && gameMode === 'creative') {
                    player.flying = !player.flying;
                    player.vy = 0;
                    const flightEl = document.getElementById('flight-indicator');
                    flightEl.textContent = player.flying ? '✦ Flying' : '✦ Not Flying';
                    flightEl.style.opacity = '1';
                    setTimeout(() => flightEl.style.opacity = '0', 1500);
                    lastSpacePressTime = 0; 
                } else {
                    lastSpacePressTime = now;
                }
            }

            if (e.code === 'KeyQ') {
                const item = inventory[activeSlot];
                if (item && item.id !== 0 && item.count > 0) {
                    const dropCount = keys.ShiftLeft ? item.count : 1;
                    
                    window.tossItem(item.id, dropCount, item.durability);

                    item.count -= dropCount;
                    if (item.count <= 0) {
                        item.id = 0;
                        item.count = 0;
                        delete item.durability;
                    }

                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
            }
        }

        if(e.code === 'KeyE') {
            if (uiState === 'PLAYING') {
                uiState = 'INVENTORY';
                document.exitPointerLock();
                
                if (gameMode === 'creative') {
                    document.getElementById('inventory-modal').classList.remove('hidden');
                } else {
                    document.getElementById('survival-inventory-modal').classList.remove('hidden');
                }
                
                if (typeof renderInventory === 'function') renderInventory();
            } else if (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST') {
                // Play chest close sound if we're closing a chest
                if (uiState === 'CHEST' && typeof window.playChestCloseSound === 'function') window.playChestCloseSound(window._lastChestX, window._lastChestY, window._lastChestZ);
                if (typeof closeCraftingTable === 'function') closeCraftingTable();
                if (typeof closeFurnace === 'function') closeFurnace();
                if (typeof closeChest === 'function') closeChest();
                document.body.requestPointerLock(); 
            }
        }

        if(e.code === 'KeyF' && uiState === 'PLAYING') {
            toggleRenderDist(); 
            const radius = RENDER_DISTANCES[currentRenderDistIndex];
            const el = document.getElementById('action-text');
            el.textContent = `Render Distance: ${RENDER_NAMES[currentRenderDistIndex]} (${radius} Chunks)`;
            el.style.opacity = '1';
            clearTimeout(actionTextTimeout);
            actionTextTimeout = setTimeout(() => el.style.opacity = '0', 2000);
        }

        if(e.code === 'KeyH' && uiState === 'PLAYING') {
            if (typeof toggleCameraMode === 'function') toggleCameraMode();
        }

        if ((uiState === 'PLAYING' || uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST') && e.key >= '1' && e.key <= '9') {
            selectSlot(parseInt(e.key) - 1);
            if (uiState === 'INVENTORY' || uiState === 'CRAFTING') {
                if (typeof renderInventory === 'function') renderInventory();
            }
            if (uiState === 'FURNACE' && typeof renderFurnace === 'function') {
                renderFurnace();
            }
            if (uiState === 'CHEST' && typeof renderChest === 'function') {
                renderChest();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => { 
        if(keys.hasOwnProperty(e.code)) keys[e.code] = false; 
        if (e.code === 'KeyW') wDoubleTapped = false;
    });
    
    document.addEventListener('wheel', (e) => {
        if (uiState !== 'PLAYING') return;
        if (e.deltaY > 0) activeSlot = (activeSlot + 1) % 9;
        else activeSlot = (activeSlot - 1 + 9) % 9;
        selectSlot(activeSlot);
    });

        
// --- COMBAT RAYCAST ---
const _mobRayDir = new THREE.Vector3(); // FIX: Pre-allocated to prevent GC stutter!

window.getTargetedMob = function() {
    let bestMob = null;
    let bestDist = 4.0; // Max reach distance
    camera.getWorldDirection(_mobRayDir);
    
    if (typeof globalMobs === 'undefined') return null;
    
    for (let mob of globalMobs) {
        if (mob.dead || mob.dying) continue; // Don't target dying pigs
        
        const dx = mob.x - player.x;
        const dy = (mob.y + mob.height/2) - (player.y + player.eyeLevel);
        const dz = mob.z - player.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        if (dist < bestDist) {
            const dot = (dx*_mobRayDir.x + dy*_mobRayDir.y + dz*_mobRayDir.z) / dist;
            if (dot > 0.92) { 
                bestDist = dist;
                bestMob = mob;
            }
        }
    }
    return bestMob;
};

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
                window.tossItem(cursorItem.id, cursorItem.count, cursorItem.durability);
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
                if (typeof window.playBurpSound === 'function') window.playBurpSound();
                
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
            if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock] && TOOL_DATA[currentBuildBlock].type === 'hoe') {
                const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                
                // If clicking the top face of Grass (1) or Dirt (2)
                if ((targetId === 1 || targetId === 2) && target.normal[1] === 1) {
                    const aboveId = getVoxel(target.hit[0], target.hit[1] + 1, target.hit[2]) & 0xFF;
                    if (aboveId === 0) { // Ensure the block above is air
                        setVoxel(target.hit[0], target.hit[1], target.hit[2], 62); // Turn to Dry Farmland
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                        
                        if (typeof spawnParticles === 'function') spawnParticles(target.hit[0], target.hit[1], target.hit[2], 2);
                        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
                        if (typeof window.playBlockSoundAt === 'function') window.playBlockSoundAt(2, 'dig', 0.6, target.hit[0], target.hit[1], target.hit[2]);
                        
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
                    pendingBlockUpdates.push({x: dx, y: otherY, z: dz});
                    triggerNeighborUpdates(dx, otherY, dz);
                }
                if (typeof updateChunks === 'function') updateChunks(dx, dy, dz);
                pendingBlockUpdates.push({x: dx, y: dy, z: dz});
                triggerNeighborUpdates(dx, dy, dz);
                if (typeof window.playDoorSound === 'function') window.playDoorSound(!wasOpen, dx, dy, dz);
                return;
            }

            // ---> TRAPDOOR INTERACTION (toggle open/close) <---
            if (interactTargetId === 150 && uiState === 'PLAYING') {
                const tx = target.hit[0], ty = target.hit[1], tz = target.hit[2];
                const tval = getVoxel(tx, ty, tz);
                const wasOpen = (tval >> 10) & 0x1;
                setVoxel(tx, ty, tz, tval ^ (1 << 10));
                if (typeof updateChunks === 'function') updateChunks(tx, ty, tz);
                if (typeof window.playDoorSound === 'function') window.playDoorSound(!wasOpen, tx, ty, tz);
                return;
            }

            if (currentBuildBlock === 0) return;
            
            // Block placement of tools/items — only allow actual placeable blocks and saplings
            if (currentBuildBlock >= 100) {
                // These are placeable despite being >= 100
                const placeableHighIds = [116, 117, 118, 136, 137, 138, 139, 140, 141, 144, 145, 146, 147, 148, 150, 151, 152, 154, 155, 156, 157, 158];
                if (!placeableHighIds.includes(currentBuildBlock)) return;
            }

            let px = target.hit[0] + target.normal[0];
            let py = target.hit[1] + target.normal[1];
            let pz = target.hit[2] + target.normal[2];
            
            const targetVal = getVoxel(target.hit[0], target.hit[1], target.hit[2]);
            const targetId = targetVal & 0xFF;
            
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
            // bottom face of top slab) merges into a full block.
            // Side faces place adjacent, NOT merge.
            if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock) && currentBuildBlock === targetId) {
                const existingIsTop = (targetVal >> 8) & 0x1;
                const slabToFull = { 70: 29, 71: 44, 72: 30, 73: 3, 74: 33, 75: 32, 76: 31, 77: 98, 157: 156 };
                const fullBlock = slabToFull[currentBuildBlock];
                if (fullBlock) {
                    // Only merge when clicking the open (exposed) face of the slab
                    let shouldMerge = false;
                    if (existingIsTop === 0 && target.normal[1] === 1) shouldMerge = true;   // Bottom slab, clicked top face (open)
                    else if (existingIsTop === 1 && target.normal[1] === -1) shouldMerge = true; // Top slab, clicked bottom face (open)
                    
                    if (shouldMerge) {
                        setVoxel(target.hit[0], target.hit[1], target.hit[2], fullBlock);
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
                    // Otherwise fall through to normal adjacent placement
                }
            }
            
            // --- SLAB MERGE AT PLACEMENT POSITION ---
            // When placing a slab into a space that already has the opposite half of the same slab,
            // merge them into a full block instead of overwriting.
            if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock)) {
                const placeVal = getVoxel(px, py, pz);
                const placeId = placeVal & 0xFF;
                if (placeId === currentBuildBlock) {
                    const existingIsTop = (placeVal >> 8) & 0x1;
                    const slabToFull = { 70: 29, 71: 44, 72: 30, 73: 3, 74: 33, 75: 32, 76: 31, 77: 98, 157: 156 };
                    const fullBlock = slabToFull[currentBuildBlock];
                    // Determine what half we'd place
                    let newIsTop = 0;
                    if (target.normal[1] === 1) newIsTop = 0;
                    else if (target.normal[1] === -1) newIsTop = 1;
                    else if (target.exactHit) {
                        const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                        newIsTop = (localY >= 0.5) ? 1 : 0;
                    }
                    // If opposite halves, merge into full block
                    if (fullBlock && existingIsTop !== newIsTop) {
                        setVoxel(px, py, pz, fullBlock);
                        pendingBlockUpdates.push({x: px, y: py, z: pz});
                        
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
                    // Same half already exists — can't place here, block placement
                    if (existingIsTop === newIsTop) return;
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
                        // Fill portal interior with portal blocks
                        for (const pos of portalResult.interior) {
                            setVoxel(pos.x, pos.y, pos.z, 90, portalResult.axis); // axis: 0=X-aligned, 1=Z-aligned
                            pendingBlockUpdates.push({x: pos.x, y: pos.y, z: pos.z});
                        }
                        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
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
                    if (target.exactHit) {
                        const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                        placeLevel = (localY >= 0.5) ? 1 : 0;
                    } else {
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
            else if (currentBuildBlock === 68) { 
                let yaw = player.yaw * (180 / Math.PI);
                if (yaw < 0) yaw += 360;
                
                // If looking East/West, align along Z-axis (1). If looking North/South, align along X-axis (0)
                if ((yaw > 45 && yaw <= 135) || (yaw > 225 && yaw <= 315)) {
                    placeLevel = 1;
                }
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
                
                if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(149, px, py, pz);
                
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
                    setVoxel(px, py, pz, 4, 8, 0, 1); 
                    updateWaterQueue.add(getVoxelIndex(px, py, pz));
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
                    window._soundPlaceBlock(currentBuildBlock, px, py, pz);
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

    uiLayer.addEventListener('click', () => { document.body.requestPointerLock(); });

    document.addEventListener('pointerlockchange', () => {
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
                window.tossItem(cursorItem.id, cursorItem.count, cursorItem.durability);
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
}

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
        if (typeof window.playToolBreakSound === 'function') window.playToolBreakSound();
        currentBuildBlock = 0;
    }
    
    // Refresh the UI to update the colored bar
    if (typeof buildUI === 'function') buildUI();
    if (typeof updateHeldItem === 'function') updateHeldItem();
};