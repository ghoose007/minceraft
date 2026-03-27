// ==========================================
// MOB SPAWNING & UPDATE
// ==========================================

window.spawnMob = function(type, x, y, z) {
    if (type === 'pig') new Pig(x, y, z);
    if (type === 'zombie') new Zombie(x, y, z);
    if (type === 'sheep') new Sheep(x, y, z);
    if (type === 'skeleton') new Skeleton(x, y, z);
    if (type === 'zombie_pigman') new ZombiePigman(x, y, z);
};

window.updateMobs = function(dt) {
    for (let i = globalMobs.length - 1; i >= 0; i--) {
        let mob = globalMobs[i];
        mob.update(dt);
        const distSq = (mob.x - player.x)**2 + (mob.y - player.y)**2 + (mob.z - player.z)**2;
        if (distSq > 16384) {
            // Clean up fire meshes if present
            if (mob._fireMeshes) {
                for (const fm of mob._fireMeshes) {
                    mob.mesh.remove(fm);
                    if (fm.geometry) fm.geometry.dispose();
                    if (fm.material) fm.material.dispose();
                }
                mob._fireMeshes = [];
            }
            scene.remove(mob.mesh);
            scene.remove(mob.shadow);
            mob.mesh.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
            // FIX: Dispose the per-mob cloned material to prevent GPU shader leak
            if (mob.material) mob.material.dispose();
            // Shadow geo/mat is shared, don't dispose
            globalMobs.splice(i, 1);
        }
    }
}; 

let globalSpawnTimer   = 0;
let zombieSpawnTimer   = 0;
const MAX_PASSIVE_MOBS = 20;
const MAX_HOSTILE_MOBS = 20;

window.tickMobSpawning = function(dt) {
    const inNether = (typeof currentDimension !== 'undefined' && currentDimension === 'nether');
    const sunLevel  = (typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 1.0;

    // ---- PASSIVE: PIG + SHEEP SPAWNING (overworld only, on grass in daylight) ----
    if (!inNether) {
        globalSpawnTimer += dt;
        if (globalSpawnTimer >= 2.0) {
            globalSpawnTimer = 0;
            const passiveCount = globalMobs.filter(m => m instanceof Pig || m instanceof Sheep).length;
            if (passiveCount < MAX_PASSIVE_MOBS) {
                const angle = Math.random() * Math.PI * 2;
                const dist  = 24 + Math.random() * 48;
                const pcX = Math.floor(player.x + Math.cos(angle) * dist);
                const pcZ = Math.floor(player.z + Math.sin(angle) * dist);
                const cx  = Math.floor(pcX / CHUNK_SIZE);
                const cz  = Math.floor(pcZ / CHUNK_SIZE);
                if (!_isChunkGenerated || _isChunkGenerated(cx, cz)) {
                    const pcY = getHighestBlock(pcX, pcZ);
                    if ((getVoxel(pcX, pcY, pcZ) & 0xFF) === 1) {
                        const packSize = Math.floor(Math.random() * 3) + 1;
                        // Each pack is either all pigs or all sheep (like MC)
                        const mobType = Math.random() < 0.5 ? 'pig' : 'sheep';
                        for (let i = 0; i < packSize; i++) {
                            const dx = pcX + Math.floor(Math.random() * 5) - 2;
                            const dz = pcZ + Math.floor(Math.random() * 5) - 2;
                            const dy = getHighestBlock(dx, dz);
                            if ((getVoxel(dx, dy, dz) & 0xFF) === 1 && passiveCount < MAX_PASSIVE_MOBS)
                                spawnMob(mobType, dx + 0.5, dy + 1.0, dz + 0.5);
                        }
                    }
                }
            }
        }
    }

    // ---- HOSTILE: ZOMBIE + SKELETON SPAWNING (overworld only) ----
    if (!inNether) {
    zombieSpawnTimer += dt;
    if (zombieSpawnTimer >= 3.0) {
        zombieSpawnTimer = 0;
        const hostileCount = globalMobs.filter(m => m instanceof Zombie || m instanceof Skeleton).length;
        if (hostileCount < MAX_HOSTILE_MOBS) {
            const angle = Math.random() * Math.PI * 2;
            const dist  = 20 + Math.random() * 44;
            const pcX   = Math.floor(player.x + Math.cos(angle) * dist);
            const pcZ   = Math.floor(player.z + Math.sin(angle) * dist);
            const cx    = Math.floor(pcX / CHUNK_SIZE);
            const cz    = Math.floor(pcZ / CHUNK_SIZE);
            if (_isChunkGenerated(cx, cz)) {
                const packSize = Math.floor(Math.random() * 3) + 1;
                // Each pack is either all zombies or all skeletons
                const hostileType = Math.random() < 0.5 ? 'zombie' : 'skeleton';
                for (let i = 0; i < packSize && globalMobs.filter(m => m instanceof Zombie || m instanceof Skeleton).length < MAX_HOSTILE_MOBS; i++) {
                    const sx    = pcX + Math.floor(Math.random() * 7) - 3;
                    const sz    = pcZ + Math.floor(Math.random() * 7) - 3;
                    const surfY = getHighestBlock(sx, sz);

                    // Helper: test whether a given floor Y is a valid dark spawn spot
                    const trySpawnAt = (floorY) => {
                        if (floorY < 1) return false;
                        const floorId = getVoxel(sx, floorY, sz) & 0xFF;
                        const air1Id  = getVoxel(sx, floorY + 1, sz) & 0xFF;
                        const air2Id  = getVoxel(sx, floorY + 2, sz) & 0xFF;
                        const isSolid = floorId !== 0 && !isFluidBlock(floorId) && !isCrossBlock(floorId);
                        const hasSpace = air1Id === 0 && air2Id === 0;
                        if (!isSolid || !hasSpace) return false;

                        const sunRaw        = getSunLight(sx, floorY + 1, sz);
                        const torchRaw      = getTorchLight(sx, floorY + 1, sz);
                        const effectiveLight = Math.max(sunRaw * sunLevel, torchRaw);
                        if (effectiveLight >= 7) return false;

                        spawnMob(hostileType, sx + 0.5, floorY + 1.0, sz + 0.5);
                        return true;
                    };

                    // 1. Try the surface (works at night or in shaded spots)
                    if (!trySpawnAt(surfY)) {
                        // 2. Scan downward for a cave floor below the surface
                        //    Start one block below the surface top and go down to y=1.
                        let inAir = false;
                        for (let sy = surfY - 1; sy >= 1; sy--) {
                            const id = getVoxel(sx, sy, sz) & 0xFF;
                            const isEmpty = id === 0 || isCrossBlock(id);
                            if (isEmpty) {
                                inAir = true;
                            } else if (inAir) {
                                // Transition from air to solid = potential cave floor
                                if (trySpawnAt(sy)) break;
                                inAir = false;
                            }
                        }
                    }
                }
            }
        }
    }
    } // end if (!inNether) for zombie spawning

    // ---- NETHER: ZOMBIE PIGMAN SPAWNING ----
    if (inNether && typeof ZombiePigman !== 'undefined') {
        if (!window._pigmanSpawnTimer) window._pigmanSpawnTimer = 0;
        window._pigmanSpawnTimer += dt;
        if (window._pigmanSpawnTimer >= 3.0) {
            window._pigmanSpawnTimer = 0;
            const pigmanCount = globalMobs.filter(m => m instanceof ZombiePigman).length;
            if (pigmanCount < 15) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 16 + Math.random() * 40;
                const sx = Math.floor(player.x + Math.cos(angle) * dist);
                const sz = Math.floor(player.z + Math.sin(angle) * dist);

                // Scan downward from player's Y to find a solid floor with 2 air blocks above
                // The nether is a cave system so getHighestBlock returns the ceiling
                const startY = Math.min(120, Math.floor(player.y) + 10);
                let spawned = false;
                let inAir = false;
                for (let sy = startY; sy >= 2 && !spawned; sy--) {
                    const id = getVoxel(sx, sy, sz) & 0xFF;
                    const isEmpty = (id === 0);
                    if (isEmpty) {
                        inAir = true;
                    } else if (inAir && !isFluidBlock(id)) {
                        // Found solid block with air above — this is a floor
                        const air1 = getVoxel(sx, sy + 1, sz) & 0xFF;
                        const air2 = getVoxel(sx, sy + 2, sz) & 0xFF;
                        if (air1 === 0 && air2 === 0) {
                            const packSize = 1 + Math.floor(Math.random() * 3);
                            for (let i = 0; i < packSize && pigmanCount + i < 15; i++) {
                                const px = sx + Math.floor(Math.random() * 5) - 2;
                                const pz = sz + Math.floor(Math.random() * 5) - 2;
                                // Find floor at this offset too
                                let pInAir = false;
                                for (let py = startY; py >= 2; py--) {
                                    const pid = getVoxel(px, py, pz) & 0xFF;
                                    if (pid === 0) { pInAir = true; }
                                    else if (pInAir && !isFluidBlock(pid)) {
                                        const pa1 = getVoxel(px, py + 1, pz) & 0xFF;
                                        const pa2 = getVoxel(px, py + 2, pz) & 0xFF;
                                        if (pa1 === 0 && pa2 === 0) {
                                            spawnMob('zombie_pigman', px + 0.5, py + 1.0, pz + 0.5);
                                        }
                                        break;
                                    }
                                }
                            }
                            spawned = true;
                        }
                        inAir = false;
                    }
                }
            }
        }
    }
};
