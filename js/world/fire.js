// ==========================================
// FIRE SYSTEM
// ==========================================

window.activeFireBlocks = new Set();

setInterval(() => {
    if (window.fireMaterial) {
        window.fireMaterial.uniforms.uTime.value = performance.now() / 1000;
    }
    if (typeof getVoxel !== 'function' || typeof setVoxel !== 'function') return;
    if (window.activeFireBlocks.size === 0) return;

    const updates = [];

    for (let idx of window.activeFireBlocks) {
        if (idx === -1) continue;
        
        // Decode index to world coordinates
        const ix = idx % WORLD_WIDTH;
        const iy = Math.floor(idx / WORLD_WIDTH) % WORLD_HEIGHT;
        const iz = Math.floor(idx / (WORLD_WIDTH * WORLD_HEIGHT));
        const wx = ix - (WORLD_WIDTH / 2), wy = iy, wz = iz - (WORLD_DEPTH / 2);

        const val = getVoxel(wx, wy, wz);
        const id = val & 0xFF;

        if (id !== 89) {
            window.activeFireBlocks.delete(idx);
            continue; // Block was destroyed or replaced
        }

        const dir = (val >> 9) & 0x7;
        const frame = (val >> 8) & 0x1;
        const newFrame = frame === 0 ? 1 : 0; // Flip between 0 and 1

        // 1. ANIMATE (Now handled by Shader! We just update the Material Time)
        if (fireMaterial) fireMaterial.uniforms.uTime.value = performance.now() / 1000;

        // 2. SMOKE PARTICLES — only for fire blocks within 32 blocks of player
        if (typeof window.spawnFireSmoke === 'function') {
            const dx = wx - player.x, dy = wy - player.y, dz = wz - player.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < 1024) { // 32 blocks squared
                const count = Math.random() < 0.5 ? 2 : 1;
                for (let s = 0; s < count; s++) {
                    window.spawnFireSmoke(wx, wy, wz);
                }
            }
        }

        // 2. BURN & SPREAD (25% chance per tick = ~1 rapid action per second)
        if (Math.random() < 0.25) {
            const belowId = getVoxel(wx, wy - 1, wz) & 0xFF;
            const isInfiniBurn = (belowId === 87); // Netherrack burns forever

            const isFlammable = (blockId) => [13, 14, 21, 22, 29, 30, 41, 43, 44, 66, 16, 24].includes(blockId);

            let hasFuel = isInfiniBurn;
            const neighbors = [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]];

            // Check for fuel & destroy it rapidly
            for (let [dx, dy, dz] of neighbors) {
                const nId = getVoxel(wx + dx, wy + dy, wz + dz) & 0xFF;
                if (isFlammable(nId)) {
                    hasFuel = true;
                    if (Math.random() < 0.25) { 
                        setVoxel(wx + dx, wy + dy, wz + dz, 0); // Destroy fuel block
                        if (typeof spawnParticles === 'function') spawnParticles(wx+dx, wy+dy, wz+dz, nId);
                        updates.push({x: wx+dx, y: wy+dy, z: wz+dz});
                    }
                }
            }

            // Rapidly spread to air blocks touching fuel (DISABLED if on Netherrack!)
            if (!isInfiniBurn && Math.random() < 0.4) {
                const sx = wx + Math.floor(Math.random() * 3) - 1;
                const sy = wy + Math.floor(Math.random() * 3) - 1;
                const sz = wz + Math.floor(Math.random() * 3) - 1;

                if ((getVoxel(sx, sy, sz) & 0xFF) === 0) {
                    let fireDir = -1;
                    if (isFlammable(getVoxel(sx, sy-1, sz) & 0xFF)) fireDir = 0;
                    else if (isFlammable(getVoxel(sx-1, sy, sz) & 0xFF)) fireDir = 1;
                    else if (isFlammable(getVoxel(sx+1, sy, sz) & 0xFF)) fireDir = 2;
                    else if (isFlammable(getVoxel(sx, sy, sz-1) & 0xFF)) fireDir = 3;
                    else if (isFlammable(getVoxel(sx, sy, sz+1) & 0xFF)) fireDir = 4;
                    // Netherrack removed from valid spread targets!

                    if (fireDir !== -1) {
                        setVoxel(sx, sy, sz, 89, (fireDir << 1));
                        window.activeFireBlocks.add(getVoxelIndex(sx, sy, sz)); // Add new fire to queue!
                        updates.push({x: sx, y: sy, z: sz});
                    }
                }
            }

            // Extinguish if fuel is gone
            if (!hasFuel && Math.random() < 0.4) {
                setVoxel(wx, wy, wz, 0);
                window.activeFireBlocks.delete(idx);
                updates.push({x: wx, y: wy, z: wz});
            } else if (!isInfiniBurn && Math.random() < 0.05) {
                setVoxel(wx, wy, wz, 0);
                window.activeFireBlocks.delete(idx);
                updates.push({x: wx, y: wy, z: wz});
            }
        }
    }

    // Push all animation and destruction updates to the rendering engine
    if (typeof pendingBlockUpdates !== 'undefined') {
        for (let u of updates) pendingBlockUpdates.push(u);
    }
}, 250); // Runs every 250ms (4 frames per second)