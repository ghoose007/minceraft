// ==========================================
// NETHER GENERATION
// ==========================================

// NETHER WORLD GENERATION
// ==========================================

let _netherNoise1, _netherNoise2, _netherNoise3;

function _initNetherNoise() {
    const s1 = ((_worldSeed * 173 + 719) * 0.00000001) % 1;
    const s2 = ((_worldSeed * 211 + 823) * 0.00000001) % 1;
    const s3 = ((_worldSeed * 277 + 937) * 0.00000001) % 1;
    _netherNoise1 = new PerlinNoise(Math.abs(s1) + 0.01);
    _netherNoise2 = new PerlinNoise(Math.abs(s2) + 0.01);
    _netherNoise3 = new PerlinNoise(Math.abs(s3) + 0.01);
}

function generateNetherChunkColumn(cx, cz) {
    if (_isChunkGenerated(cx, cz)) return;
    _markChunkGenerated(cx, cz);

    const startX = cx * CHUNK_SIZE - Math.floor(WORLD_WIDTH / 2);
    const startZ = cz * CHUNK_SIZE - Math.floor(WORLD_DEPTH / 2);
    const halfW = Math.floor(WORLD_WIDTH / 2);
    const halfD = Math.floor(WORLD_DEPTH / 2);
    const LAVA_LEVEL = typeof GEN_NETHER_LAVA_LEVEL !== 'undefined' ? GEN_NETHER_LAVA_LEVEL : 31;
    const opennessMult = (typeof GEN_NETHER_OPENNESS !== 'undefined' ? GEN_NETHER_OPENNESS : 100) / 100;
    const glowMult = (typeof GEN_NETHER_GLOW !== 'undefined' ? GEN_NETHER_GLOW : 100) / 100;
    const fireMult = (typeof GEN_NETHER_FIRE !== 'undefined' ? GEN_NETHER_FIRE : 100) / 100;
    const soulsandMult = (typeof GEN_NETHER_SOULSAND !== 'undefined' ? GEN_NETHER_SOULSAND : 100) / 100;
    const lavafallsMult = (typeof GEN_NETHER_LAVAFALLS !== 'undefined' ? GEN_NETHER_LAVAFALLS : 100) / 100;
    const gravelMult = (typeof GEN_NETHER_GRAVEL !== 'undefined' ? GEN_NETHER_GRAVEL : 100) / 100;
    const quartzMult = (typeof GEN_NETHER_QUARTZ !== 'undefined' ? GEN_NETHER_QUARTZ : 100) / 100;

    // PHASE 1: 3D noise density field — solid vs air between bedrock floor/ceiling
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const wx = x + halfW;
            const wz = z + halfD;

            // Bedrock floor + ceiling
            setVoxel(x, 0, z, 18);
            setVoxel(x, NETHER_HEIGHT - 1, z, 18);

            // Border walls
            if (wx <= 1 || wx >= WORLD_WIDTH - 2 || wz <= 1 || wz >= WORLD_DEPTH - 2) {
                for (let y = 1; y < NETHER_HEIGHT - 1; y++) setVoxel(x, y, z, 87);
                continue;
            }

            // Irregular bedrock layers at floor and ceiling
            for (let layer = 1; layer <= 4; layer++) {
                if (Math.random() < (1.0 - layer * 0.22)) setVoxel(x, layer, z, 18);
                if (Math.random() < (1.0 - layer * 0.22)) setVoxel(x, NETHER_HEIGHT - 1 - layer, z, 18);
            }

            for (let y = 1; y < NETHER_HEIGHT - 1; y++) {
                if ((getVoxel(x, y, z) & 0xFF) === 18) continue; // skip bedrock

                const floorDist = y;
                const ceilDist = (NETHER_HEIGHT - 1) - y;
                const edgeDist = Math.min(floorDist, ceilDist);

                // Primary large-scale terrain (squished vertically like real nether)
                const n1 = _netherNoise1.fbm3D(x / 40, y / 25, z / 40, 3, 0.5, 2.0);
                // Secondary detail
                const n2 = _netherNoise2.fbm3D(x / 20, y / 15, z / 20, 2, 0.55, 2.0);
                // Small pockets
                const n3 = _netherNoise3.noise3D(x / 12, y / 10, z / 12);

                let density = 0;

                if (edgeDist < 8) {
                    // Force solid near bedrock
                    density = 0.5 + (8 - edgeDist) * 0.1;
                } else {
                    density = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;

                    const midY = NETHER_HEIGHT / 2;
                    const yNorm = (y - midY) / midY;

                    // Main open caverns in the middle
                    if (y > 25 && y < 100) {
                        const centerFactor = 1.0 - Math.abs(yNorm) * 1.2;
                        density -= 0.15 * opennessMult * Math.max(0, centerFactor);
                    }

                    // Lower cavern system (y 15-45)
                    const lowerCavern = _netherNoise1.noise2D(x / 60, z / 60);
                    if (y > 15 && y < 45 && lowerCavern > 0.1) {
                        density -= 0.08 * opennessMult;
                    }

                    // Upper cavern system (y 70-110)
                    const upperCavern = _netherNoise2.noise2D(x / 55, z / 55);
                    if (y > 70 && y < 110 && upperCavern > 0.05) {
                        density -= 0.06 * opennessMult;
                    }
                }

                if (density < 0) {
                    if (y <= LAVA_LEVEL) {
                        setVoxel(x, y, z, 27, 4, 0, 1); // Lava
                    } else {
                        setVoxel(x, y, z, 0); // Air
                    }
                } else {
                    setVoxel(x, y, z, 87); // Netherrack
                }
            }
        }
    }

    // PHASE 2: Decorations
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const x = startX + lx;
            const z = startZ + lz;
            const wx = x + halfW;
            const wz = z + halfD;
            if (wx <= 2 || wx >= WORLD_WIDTH - 3 || wz <= 2 || wz >= WORLD_DEPTH - 3) continue;

            for (let y = 2; y < NETHER_HEIGHT - 5; y++) {
                const blockId = getVoxel(x, y, z) & 0xFF;
                if (blockId !== 87) continue;

                // --- QUARTZ ORE ---
                const oreNoise = _netherNoise3.noise3D(x / 8, y / 8, z / 8);
                if (quartzMult > 0 && oreNoise > (1.0 - 0.3 * quartzMult)) { setVoxel(x, y, z, 88); continue; }

                // --- GRAVEL PATCHES ---
                const gravelNoise = _netherNoise2.noise3D(x / 12, y / 12, z / 12);
                if (gravelNoise > 0.75) { setVoxel(x, y, z, 5); continue; }

                // --- SOUL SAND (near lava on exposed floors) ---
                if (y >= LAVA_LEVEL - 2 && y <= LAVA_LEVEL + 8 && soulsandMult > 0) {
                    const soulNoise = _netherNoise1.noise2D(x / 16, z / 16);
                    if (soulNoise > (0.85 - 0.5 * soulsandMult)) {
                        const above = getVoxel(x, y + 1, z) & 0xFF;
                        if (above === 0 || above === 27) { setVoxel(x, y, z, 92); continue; }
                    }
                }

                // --- GLOWSTONE CLUSTERS (hanging from ceilings) ---
                const below = getVoxel(x, y - 1, z) & 0xFF;
                if (below === 0 && y > 30 && glowMult > 0) {
                    const glowNoise = _netherNoise3.noise3D(x / 6, y / 6, z / 6);
                    if (glowNoise > (0.85 - 0.2 * glowMult)) {
                        setVoxel(x, y, z, 91);
                        const clusterSize = Math.floor(Math.random() * 3) + 1;
                        for (let dy = 1; dy <= clusterSize; dy++) {
                            if ((getVoxel(x, y - dy, z) & 0xFF) === 0) {
                                if (Math.random() < 0.7) setVoxel(x, y - dy, z, 91);
                            } else break;
                        }
                        for (const [dx, dz] of [[1,0],[0,1],[-1,0],[0,-1]]) {
                            if (Math.random() < 0.4) {
                                if ((getVoxel(x+dx, y, z+dz) & 0xFF) === 87 && (getVoxel(x+dx, y-1, z+dz) & 0xFF) === 0)
                                    setVoxel(x+dx, y, z+dz, 91);
                            }
                        }
                        continue;
                    }
                }

                // --- GRAVEL SHORES near lava ---
                if (y >= LAVA_LEVEL - 1 && y <= LAVA_LEVEL + 3) {
                    let nearLava = false;
                    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]]) {
                        if ((getVoxel(x+dx, y, z+dz) & 0xFF) === 27) { nearLava = true; break; }
                    }
                    if (nearLava && gravelMult > 0 && Math.random() < 0.5 * gravelMult) { setVoxel(x, y, z, 5); continue; }
                }

                // --- LAVA FALLS ---
                if (y > LAVA_LEVEL + 5 && y < NETHER_HEIGHT - 20) {
                    let exposed = false;
                    for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]) {
                        if ((getVoxel(x+dx, y+dy, z+dz) & 0xFF) === 0) { exposed = true; break; }
                    }
                    if (exposed && lavafallsMult > 0 && Math.random() < 0.002 * lavafallsMult) { setVoxel(x, y, z, 27, 4, 0, 1); continue; }
                }

                // --- FIRE PATCHES (groups of 4-8) ---
                const aboveId = getVoxel(x, y + 1, z) & 0xFF;
                if (aboveId === 0 && y > LAVA_LEVEL + 2 && fireMult > 0 && Math.random() < 0.001 * fireMult) {
                    const patchSize = 4 + Math.floor(Math.random() * 5);
                    let placed = 0;
                    for (let att = 0; att < patchSize * 3 && placed < patchSize; att++) {
                        const fdx = Math.floor(Math.random() * 5) - 2;
                        const fdz = Math.floor(Math.random() * 5) - 2;
                        if (fdx*fdx + fdz*fdz > 5) continue;
                        const fx = x+fdx, fz = z+fdz;
                        if ((getVoxel(fx, y, fz) & 0xFF) === 87 && (getVoxel(fx, y+1, fz) & 0xFF) === 0) {
                            setVoxel(fx, y+1, fz, 89, 0);
                            if (typeof window.activeFireBlocks !== 'undefined' && typeof getVoxelIndex === 'function')
                                window.activeFireBlocks.add(getVoxelIndex(fx, y+1, fz));
                            placed++;
                        }
                    }
                }
            }
        }
    }
}

async function generateNetherWorld() {
    _initNetherNoise();

    const halfW = Math.floor(WORLD_WIDTH / 2);
    const halfD = Math.floor(WORLD_DEPTH / 2);

    if (!useLazyGeneration) {
        // EAGER GENERATION (small worlds <= 64 chunks/side)
        updateLoadingBar(2, 'Generating Nether...');
        await yieldToUI();

        const totalChunks = CHUNKS_X * CHUNKS_Z;
        let chunksGenerated = 0;

        for (let cx = 0; cx < CHUNKS_X; cx++) {
            for (let cz = 0; cz < CHUNKS_Z; cz++) {
                generateNetherChunkColumn(cx, cz);
                chunksGenerated++;

                if (chunksGenerated % 64 === 0) {
                    const pct = 2 + (chunksGenerated / totalChunks) * 48;
                    updateLoadingBar(pct, `Generating Nether... ${Math.round((chunksGenerated / totalChunks) * 100)}%`);
                    await yieldToUI();
                }
            }
        }

        updateLoadingBar(52, 'Simulating lava...');
        await yieldToUI();
        simulateChunkFluids(-halfW, -halfD, halfW, halfD);

    } else {
        // LAZY GENERATION (large worlds > 64 chunks/side)
        // Only generate chunks around the spawn portal area
        updateLoadingBar(2, 'Preparing Nether...');
        await yieldToUI();

        const spawnGenRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        const spawnMinCX = Math.max(0, Math.floor(CHUNKS_X / 2) - spawnGenRadius);
        const spawnMaxCX = Math.min(CHUNKS_X - 1, Math.floor(CHUNKS_X / 2) + spawnGenRadius);
        const spawnMinCZ = Math.max(0, Math.floor(CHUNKS_Z / 2) - spawnGenRadius);
        const spawnMaxCZ = Math.min(CHUNKS_Z - 1, Math.floor(CHUNKS_Z / 2) + spawnGenRadius);

        let total = (spawnMaxCX - spawnMinCX + 1) * (spawnMaxCZ - spawnMinCZ + 1);
        let count = 0;

        for (let cx = spawnMinCX; cx <= spawnMaxCX; cx++) {
            for (let cz = spawnMinCZ; cz <= spawnMaxCZ; cz++) {
                generateNetherChunkColumn(cx, cz);
                count++;
                if (count % 32 === 0) {
                    updateLoadingBar(2 + (count / total) * 48, `Generating Nether spawn... ${Math.round((count / total) * 100)}%`);
                    await yieldToUI();
                }
            }
        }

        updateLoadingBar(52, 'Simulating lava...');
        await yieldToUI();

        const fluidMinX = (spawnMinCX * CHUNK_SIZE) - halfW;
        const fluidMaxX = ((spawnMaxCX + 1) * CHUNK_SIZE) - halfW;
        const fluidMinZ = (spawnMinCZ * CHUNK_SIZE) - halfD;
        const fluidMaxZ = ((spawnMaxCZ + 1) * CHUNK_SIZE) - halfD;
        simulateChunkFluids(fluidMinX, fluidMinZ, fluidMaxX, fluidMaxZ);
    }

    // Full lighting pass so lava, fire, and glowstone light up properly
    updateLoadingBar(70, 'Calculating lighting...');
    await yieldToUI();
    if (typeof recalculateLighting === 'function') recalculateLighting();
}