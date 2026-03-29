// ==========================================
// DEATH & RESPAWN SYSTEM
// ==========================================

// ==========================================

(function injectDeathScreen() {
    if (document.getElementById('death-screen')) return;
    const div = document.createElement('div');
    div.id = 'death-screen';
    div.innerHTML = `
        <style>
            @font-face {
                font-family: 'Minecraft';
                src: url('textures/minecraft-font.ttf') format('truetype');
            }
            #death-screen {
                display: none;
                position: fixed;
                inset: 0;
                z-index: 9000;
                background: transparent;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                font-family: 'Minecraft', monospace, sans-serif;
                pointer-events: none;
            }
            #death-screen.visible {
                display: flex;
                pointer-events: all;
            }
            /* Dark red overlay that fades in */
            #death-screen-bg {
                position: absolute;
                inset: 0;
                background: rgba(0,0,0,0);
                transition: background 1.0s ease;
            }
            #death-screen.visible #death-screen-bg {
                background: rgba(70, 0, 0, 0.65);
            }
            #death-screen-content {
                position: relative;
                z-index: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0;
            }
            #death-screen h1 {
                color: #FF2222;
                font-size: 48px;
                font-weight: normal;
                text-shadow: 3px 3px 0 #3B0000;
                margin: 0 0 4px 0;
                letter-spacing: 1px;
                opacity: 0;
                transform: scale(0.85);
                transition: opacity 0.3s ease 0.2s, transform 0.3s ease 0.2s;
            }
            #death-screen.visible h1 {
                opacity: 1;
                transform: scale(1);
            }
            #death-screen p.death-subtitle {
                color: #888;
                font-size: 15px;
                text-shadow: 1px 1px 0 #000;
                margin: 0 0 28px 0;
                opacity: 0;
                transition: opacity 0.3s ease 0.4s;
            }
            #death-screen.visible p.death-subtitle {
                opacity: 1;
            }
            /* MC-style buttons */
            .death-btn {
                width: 200px;
                height: 20px;
                padding: 0;
                margin: 2px 0;
                font-family: inherit;
                font-size: 14px;
                font-weight: normal;
                color: #E0E0E0;
                text-shadow: 1px 1px 0 #3F3F3F;
                cursor: pointer;
                border: none;
                outline: none;
                image-rendering: pixelated;
                position: relative;
                /* MC button: grey gradient with lighter top edge */
                background: linear-gradient(to bottom,
                    #8B8B8B 0%, #8B8B8B 2px,
                    #6F6F6F 2px, #6F6F6F calc(100% - 2px),
                    #3A3A3A calc(100% - 2px));
                box-shadow:
                    inset 1px 0 0 #9F9F9F,
                    inset -1px 0 0 #3A3A3A,
                    inset 0 1px 0 #9F9F9F,
                    inset 0 -1px 0 #3A3A3A,
                    2px 2px 0 #1A1A1A;
                opacity: 0;
                transition: opacity 0.3s ease 0.5s;
                line-height: 20px;
            }
            #death-screen.visible .death-btn { opacity: 1; }
            .death-btn:hover {
                background: linear-gradient(to bottom,
                    #A8A8FF 0%, #A8A8FF 2px,
                    #8080D8 2px, #8080D8 calc(100% - 2px),
                    #4040A0 calc(100% - 2px));
                box-shadow:
                    inset 1px 0 0 #C0C0FF,
                    inset -1px 0 0 #4040A0,
                    inset 0 1px 0 #C0C0FF,
                    inset 0 -1px 0 #4040A0,
                    2px 2px 0 #1A1A1A;
                color: #FFFFA0;
                text-shadow: 1px 1px 0 #000;
            }
            .death-btn:active {
                filter: brightness(0.85);
            }
        </style>
        <div id="death-screen-bg"></div>
        <div id="death-screen-content">
            <h1>You Died!</h1>
            <p class="death-subtitle">Oops! Better luck next time.</p>
            <button class="death-btn" onclick="window.respawnPlayer()">Respawn</button>
            <button class="death-btn" onclick="window.respawnToMenu()" style="margin-top:4px">Title Screen</button>
        </div>
    `;
    document.body.appendChild(div);
})();

// Track world spawn point
window.worldSpawnX = 0;
window.worldSpawnY = 64;
window.worldSpawnZ = 0;

window.killPlayer = function() {
    if (player._dead) return;
    player._dead = true;

    // Drop all inventory items at player feet
    for (let i = 0; i < inventory.length; i++) {
        const item = inventory[i];
        if (item && item.id !== 0 && item.count > 0) {
            if (typeof window.spawnDroppedItem === 'function') {
                window.spawnDroppedItem(
                    player.x + (Math.random() - 0.5) * 0.8,
                    player.y + 0.5,
                    player.z + (Math.random() - 0.5) * 0.8,
                    item.id, item.count,
                    (Math.random() - 0.5) * 4,
                    2 + Math.random() * 3,
                    (Math.random() - 0.5) * 4
                );
            }
            inventory[i] = { id: 0, count: 0 };
        }
    }

    // Drop all armor items
    for (let i = 0; i < armorSlots.length; i++) {
        const item = armorSlots[i];
        if (item && item.id !== 0) {
            if (typeof window.spawnDroppedItem === 'function') {
                window.spawnDroppedItem(
                    player.x + (Math.random() - 0.5) * 0.8,
                    player.y + 0.5,
                    player.z + (Math.random() - 0.5) * 0.8,
                    item.id, 1,
                    (Math.random() - 0.5) * 4,
                    2 + Math.random() * 3,
                    (Math.random() - 0.5) * 4
                );
            }
            armorSlots[i] = { id: 0, count: 0 };
        }
    }
    if (typeof updateArmorBar === 'function') updateArmorBar();

    // Clear fire state
    player.onFire = false;
    player._fireTimer = 0;
    player._fireDamageTimer = 0;
    if (typeof window.updateFireEffects === 'function') window.updateFireEffects(false, 0);

    // Update hotbar UI immediately to show empty slots
    if (typeof buildUI === 'function') buildUI();

    // Trigger third-person death animation
    if (typeof window.startPlayerDeathAnimation === 'function') {
        window.startPlayerDeathAnimation();
    }

    // Release pointer lock and freeze input
    if (document.pointerLockElement) document.exitPointerLock();
    uiState = 'DEAD';

    // Show death screen after dramatic delay
    setTimeout(() => {
        const screen = document.getElementById('death-screen');
        if (screen) screen.classList.add('visible');
    }, 900);
};

window.respawnPlayer = function() {
    const screen = document.getElementById('death-screen');
    if (screen) screen.classList.remove('visible');

    player._dead = false;
    player._dyingTimer = 0;
    player.onFire = false;
    player._fireTimer = 0;
    player._fireDamageTimer = 0;
    player.health = player.maxHealth;
    player.vy = 0; player.vx = 0; player.vz = 0;

    // If in the nether, switch back to overworld first
    if (typeof currentDimension !== 'undefined' && currentDimension === 'nether') {
        if (overworldChunkStorage) {
            netherChunkStorage = chunkStorageArr;
            netherGeneratedChunks = generatedChunksArr;
            chunkStorageArr = overworldChunkStorage;
            generatedChunksArr = overworldGeneratedChunks;
            if (overworldBiomeMap) biomeMap = overworldBiomeMap;
            currentDimension = 'overworld';

            // Clear nether mobs
            if (typeof globalMobs !== 'undefined') {
                for (let i = globalMobs.length - 1; i >= 0; i--) {
                    const mob = globalMobs[i];
                    scene.remove(mob.mesh);
                    scene.remove(mob.shadow);
                    mob.mesh.traverse(c => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
                    if (mob.material) mob.material.dispose();
                }
                globalMobs.length = 0;
            }

            // Clear dropped items
            if (typeof droppedItems !== 'undefined') {
                for (const item of droppedItems) {
                    scene.remove(item.mesh);
                    scene.remove(item.shadow);
                    item.mesh.traverse(c => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
                }
                droppedItems.length = 0;
            }

            // Restore overworld fog/sky
            const rd = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
            scene.fog = new THREE.Fog(0x87CEEB, rd * 0.4, rd);
            scene.background = new THREE.Color(0x87CEEB);
            if (typeof celestialGroup !== 'undefined' && celestialGroup) celestialGroup.visible = true;
            if (window.cloudMesh) window.cloudMesh.visible = true;
            if (window.cloudDepthMesh) window.cloudDepthMesh.visible = true;

            // Rebuild lighting and chunks
            if (typeof recalculateLighting === 'function') recalculateLighting();
            if (typeof updateAllChunks === 'function') updateAllChunks();
            for (const key of dirtyChunks) {
                const sep = key.indexOf(',');
                const cx = parseInt(key.substring(0, sep));
                const cz = parseInt(key.substring(sep + 1));
                if (typeof buildChunkMesh === 'function') buildChunkMesh(cx, cz);
            }
            dirtyChunks.clear();
        }
    }

    // Teleport to world spawn
    player.x = window.worldSpawnX;
    player.z = window.worldSpawnZ;
    player.y = window.worldSpawnY + 2;
    player.highestY = player.y;

    // Reset third-person model (restores original materials)
    if (typeof window.resetPlayerModel === 'function') window.resetPlayerModel();

    // Clear fire effects
    if (typeof window.updateFireEffects === 'function') window.updateFireEffects(false, 0);

    // Refresh UI
    if (typeof updateHealthUI === 'function') updateHealthUI();
    if (typeof buildUI === 'function') buildUI();

    uiState = 'PLAYING';
    setTimeout(() => document.body.requestPointerLock(), 100);
};

window.respawnToMenu = function() {
    const screen = document.getElementById('death-screen');
    if (screen) screen.classList.remove('visible');
    player._dead = false;
    player._dyingTimer = 0;
    player.onFire = false;
    player._fireTimer = 0;
    player._fireDamageTimer = 0;
    player.health = player.maxHealth;
    if (typeof window.resetPlayerModel === 'function') window.resetPlayerModel();
    if (typeof window.updateFireEffects === 'function') window.updateFireEffects(false, 0);
    document.getElementById('ui-layer').classList.add('hidden');
    window.showMainMenu();
};