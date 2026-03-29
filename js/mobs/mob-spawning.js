// ==========================================
// MOB SPAWNING & UPDATE — Minecraft-accurate
// ==========================================
// Spawn chunks: 6-chunk radius around world spawn, always "loaded" for entity purposes.
// Mobs in spawn chunks never despawn regardless of distance.
//
// Mob caps (simplified for performance):
//   Passive (pig, sheep, cow): 10
//   Hostile (zombie, skeleton, creeper): 70
//   Nether (zombie pigman): 15
//
// Spawn distances (from player):
//   Minimum: 24 blocks (nothing spawns closer)
//   Maximum: 128 blocks (nothing spawns further)
//
// Despawn rules:
//   >128 blocks from player AND outside spawn chunks → instant despawn
//   32–128 blocks from player AND outside spawn chunks → random despawn (~1/800 per tick)
//   <32 blocks from player → never despawn
//   Inside spawn chunks → never despawn regardless of distance

// ---- SPAWN FUNCTION REGISTRY ----
window.spawnMob = function(type, x, y, z) {
    if (type === 'pig') new Pig(x, y, z);
    if (type === 'zombie') new Zombie(x, y, z);
    if (type === 'sheep') new Sheep(x, y, z);
    if (type === 'skeleton') new Skeleton(x, y, z);
    if (type === 'zombie_pigman') new ZombiePigman(x, y, z);
    if (type === 'cow') new Cow(x, y, z);
    if (type === 'creeper') new Creeper(x, y, z);
};

// ---- SPAWN CHUNKS ----
const SPAWN_CHUNK_RADIUS = 6;

function _isInSpawnChunks(wx, wz) {
    const spawnX = window.worldSpawnX || 0;
    const spawnZ = window.worldSpawnZ || 0;
    const chunkDist = Math.max(
        Math.abs(Math.floor(wx / CHUNK_SIZE) - Math.floor(spawnX / CHUNK_SIZE)),
        Math.abs(Math.floor(wz / CHUNK_SIZE) - Math.floor(spawnZ / CHUNK_SIZE))
    );
    return chunkDist <= SPAWN_CHUNK_RADIUS;
}

// ---- MOB CAPS ----
const MOB_CAP_PASSIVE = 10;
let MOB_CAP_HOSTILE = 32;
const MOB_CAP_NETHER  = 15;

function _isPassiveMob(m) { return m instanceof Pig || m instanceof Sheep || (typeof Cow !== 'undefined' && m instanceof Cow); }
function _isHostileMob(m) { return m instanceof Zombie || m instanceof Skeleton || (typeof Creeper !== 'undefined' && m instanceof Creeper); }
function _isNetherMob(m)  { return typeof ZombiePigman !== 'undefined' && m instanceof ZombiePigman; }

// ---- DESPAWN + UPDATE ----
window.updateMobs = function(dt) {
    for (let i = globalMobs.length - 1; i >= 0; i--) {
        const mob = globalMobs[i];
        mob.update(dt);

        const dx = mob.x - player.x;
        const dy = mob.y - player.y;
        const dz = mob.z - player.z;
        const distSq = dx*dx + dy*dy + dz*dz;
        const inSpawnChunks = _isInSpawnChunks(mob.x, mob.z);

        let shouldDespawn = false;
        const isPassive = _isPassiveMob(mob);
        // Only passive mobs are protected by spawn chunks
        const spawnProtected = isPassive && _isInSpawnChunks(mob.x, mob.z);

        if (!spawnProtected) {
            if (distSq > 128 * 128) {
                shouldDespawn = true;
            } else if (distSq > 32 * 32) {
                if (Math.random() < 0.00125) shouldDespawn = true;
            }
        }

        if (shouldDespawn) {
            if (mob._fireMeshes) {
                for (const fm of mob._fireMeshes) { mob.mesh.remove(fm); if (fm.geometry) fm.geometry.dispose(); if (fm.material) fm.material.dispose(); }
                mob._fireMeshes = [];
            }
            scene.remove(mob.mesh); scene.remove(mob.shadow);
            mob.mesh.traverse(child => { if (child.isMesh) child.geometry.dispose(); });
            if (mob.material) mob.material.dispose();
            globalMobs.splice(i, 1);
        }
    }
};

// ---- SPAWN CYCLE TIMERS ----
let _passiveSpawnTimer = 0;
let _hostileSpawnTimer = 0;
let _netherSpawnTimer  = 0;

// ---- SHARED HELPERS ----

function _isValidSpawnFloor(x, y, z) {
    if (y < 1) return false;
    const floorId = getVoxel(x, y, z) & 0xFF;
    const air1 = getVoxel(x, y + 1, z) & 0xFF;
    const air2 = getVoxel(x, y + 2, z) & 0xFF;
    return (floorId !== 0 && !isFluidBlock(floorId) && !isCrossBlock(floorId)) && air1 === 0 && air2 === 0;
}

function _randomSpawnPos() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 24 + Math.random() * 104;
    return { x: Math.floor(player.x + Math.cos(angle) * dist), z: Math.floor(player.z + Math.sin(angle) * dist) };
}

function _findSurfaceSpawnY(x, z) {
    const surfY = getHighestBlock(x, z);
    if (surfY < 1) return -1;
    if (_isValidSpawnFloor(x, surfY, z)) return surfY;
    return -1;
}

function _findDarkSpawnY(x, z, sunLevel) {
    const surfY = getHighestBlock(x, z);
    if (surfY > 0 && _isValidSpawnFloor(x, surfY, z)) {
        const light = Math.max(getSunLight(x, surfY + 1, z) * sunLevel, getTorchLight(x, surfY + 1, z));
        if (light < 7) return surfY;
    }
    let inAir = false;
    for (let sy = surfY - 1; sy >= 1; sy--) {
        const id = getVoxel(x, sy, z) & 0xFF;
        if (id === 0 || isCrossBlock(id)) { inAir = true; }
        else if (inAir) {
            if (_isValidSpawnFloor(x, sy, z)) {
                const light = Math.max(getSunLight(x, sy + 1, z) * sunLevel, getTorchLight(x, sy + 1, z));
                if (light < 7) return sy;
            }
            inAir = false;
        }
    }
    return -1;
}

function _findNetherSpawnY(x, z) {
    const startY = Math.min(120, Math.floor(player.y) + 10);
    let inAir = false;
    for (let sy = startY; sy >= 2; sy--) {
        const id = getVoxel(x, sy, z) & 0xFF;
        if (id === 0) { inAir = true; }
        else if (inAir && !isFluidBlock(id)) {
            if (_isValidSpawnFloor(x, sy, z)) return sy;
            inAir = false;
        }
    }
    return -1;
}

function _isChunkInBounds(cx, cz) {
    return cx >= 0 && cx < CHUNKS_X && cz >= 0 && cz < CHUNKS_Z && _isChunkGenerated(cx, cz);
}

// ---- MAIN SPAWN TICK ----
window.tickMobSpawning = function(dt) {
    const inNether = (typeof currentDimension !== 'undefined' && currentDimension === 'nether');
    const sunLevel = (typeof timeUniforms !== 'undefined') ? timeUniforms.uSunLevel.value : 1.0;
    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;

    // ---- OVERWORLD: PASSIVE ----
    if (!inNether) {
        _passiveSpawnTimer += dt;
        if (_passiveSpawnTimer >= 1.0) {
            _passiveSpawnTimer = 0;
            const totalPassive = globalMobs.filter(_isPassiveMob).length;
            if (totalPassive < MOB_CAP_PASSIVE) {
                // Count each species individually
                const pigCount = globalMobs.filter(m => m instanceof Pig).length;
                const sheepCount = globalMobs.filter(m => m instanceof Sheep).length;
                const cowCount = globalMobs.filter(m => (typeof Cow !== 'undefined' && m instanceof Cow)).length;

                // Pick the species with the fewest members to balance populations
                // If tied, pick randomly among the tied types
                const counts = [
                    { type: 'pig', count: pigCount },
                    { type: 'sheep', count: sheepCount },
                    { type: 'cow', count: cowCount }
                ];
                const minCount = Math.min(pigCount, sheepCount, cowCount);
                const candidates = counts.filter(c => c.count === minCount);
                const type = candidates[Math.floor(Math.random() * candidates.length)].type;

                const pos = _randomSpawnPos();
                const cx = Math.floor((pos.x + halfW) / CHUNK_SIZE);
                const cz = Math.floor((pos.z + halfD) / CHUNK_SIZE);
                if (_isChunkInBounds(cx, cz)) {
                    const sy = _findSurfaceSpawnY(pos.x, pos.z);
                    const floorId = sy >= 0 ? (getVoxel(pos.x, sy, pos.z) & 0xFF) : 0;
                    // Snow biomes: only 25% spawn rate
                    const snowBlock = floorId === 40;
                    if (sy >= GEN_SEA_LEVEL && (floorId === 1 || floorId === 40) && (!snowBlock || Math.random() < 0.25)) {
                        const light = Math.max(getSunLight(pos.x, sy+1, pos.z) * sunLevel, getTorchLight(pos.x, sy+1, pos.z));
                        if (light >= 9) {
                            const packSize = 1 + Math.floor(Math.random() * 4);
                            for (let i = 0; i < packSize && (totalPassive+i) < MOB_CAP_PASSIVE; i++) {
                                const sx = pos.x + Math.floor(Math.random()*7)-3;
                                const sz = pos.z + Math.floor(Math.random()*7)-3;
                                const ssy = _findSurfaceSpawnY(sx, sz);
                                if (ssy >= GEN_SEA_LEVEL && ((getVoxel(sx, ssy, sz) & 0xFF) === 1 || (getVoxel(sx, ssy, sz) & 0xFF) === 40)) {
                                    spawnMob(type, sx+0.5, ssy+1, sz+0.5);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ---- OVERWORLD: HOSTILE ----
    if (!inNether) {
        _hostileSpawnTimer += dt;
        if (_hostileSpawnTimer >= 1.0) {
            _hostileSpawnTimer = 0;
            const count = globalMobs.filter(_isHostileMob).length;
            if (count < MOB_CAP_HOSTILE) {
                for (let attempt = 0; attempt < 3; attempt++) {
                    const pos = _randomSpawnPos();
                    const cx = Math.floor((pos.x + halfW) / CHUNK_SIZE);
                    const cz = Math.floor((pos.z + halfD) / CHUNK_SIZE);
                    if (!_isChunkInBounds(cx, cz)) continue;
                    const sy = _findDarkSpawnY(pos.x, pos.z, sunLevel);
                    if (sy < 0) continue;
                    const packSize = 1 + Math.floor(Math.random() * 4);
                    const roll = Math.random();
                    const type = roll < 0.40 ? 'zombie' : (roll < 0.70 ? 'skeleton' : 'creeper');
                    for (let i = 0; i < packSize && (count+i) < MOB_CAP_HOSTILE; i++) {
                        const sx = pos.x + Math.floor(Math.random()*7)-3;
                        const sz = pos.z + Math.floor(Math.random()*7)-3;
                        const ssy = _findDarkSpawnY(sx, sz, sunLevel);
                        if (ssy >= 0) spawnMob(type, sx+0.5, ssy+1, sz+0.5);
                    }
                    break;
                }
            }
        }
    }

    // ---- NETHER: ZOMBIE PIGMAN ----
    if (inNether && typeof ZombiePigman !== 'undefined') {
        _netherSpawnTimer += dt;
        if (_netherSpawnTimer >= 1.0) {
            _netherSpawnTimer = 0;
            const count = globalMobs.filter(_isNetherMob).length;
            if (count < MOB_CAP_NETHER) {
                const pos = _randomSpawnPos();
                const sy = _findNetherSpawnY(pos.x, pos.z);
                if (sy >= 0) {
                    const packSize = 1 + Math.floor(Math.random() * 4);
                    for (let i = 0; i < packSize && (count+i) < MOB_CAP_NETHER; i++) {
                        const sx = pos.x + Math.floor(Math.random()*5)-2;
                        const sz = pos.z + Math.floor(Math.random()*5)-2;
                        const ssy = _findNetherSpawnY(sx, sz);
                        if (ssy >= 0) spawnMob('zombie_pigman', sx+0.5, ssy+1, sz+0.5);
                    }
                }
            }
        }
    }
};
