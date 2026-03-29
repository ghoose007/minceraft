// ==========================================
// TNT & EXPLOSIONS
// ==========================================

// TNT SYSTEM
// ==========================================

// White flash material for TNT priming
let _tntWhiteMat = null;
function _getTNTWhiteMat() {
    if (!_tntWhiteMat) {
        _tntWhiteMat = new THREE.MeshBasicMaterial({ 
            color: 0xffffff, transparent: true, opacity: 0.6,
            depthWrite: false, side: THREE.FrontSide
        });
    }
    return _tntWhiteMat;
}

window.igniteTNT = function(x, y, z, fuseTime) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id !== 65) return; // Not TNT

    // Remove the block from the world
    setVoxel(x, y, z, 0);
    queueNeighbors(x, y, z);
    pendingBlockUpdates.push({x, y, z});
    triggerNeighborUpdates(x, y, z);

    // Create the TNT entity mesh (falling primed TNT)
    const tntMesh = typeof createFallingBlockMesh === 'function' 
        ? createFallingBlockMesh(65, x, y, z) 
        : new THREE.Mesh(new THREE.BoxGeometry(1,1,1), solidMaterial);
    // Geometry spans (0,0,0) to (1,1,1), so position at block origin directly
    tntMesh.position.set(x, y, z);
    scene.add(tntMesh);

    // White flash overlay — centered on the block geometry (0.5, 0.5, 0.5)
    const flashGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const flashMesh = new THREE.Mesh(flashGeo, _getTNTWhiteMat());
    flashMesh.position.set(0.5, 0.5, 0.5); // Align with block center
    flashMesh.visible = false;
    tntMesh.add(flashMesh); // Child of tntMesh so it moves with it

    const fuse = (fuseTime !== undefined) ? fuseTime : 4.0; // Classic MC: 4 second fuse

    activeTNT.push({
        mesh: tntMesh,
        flashMesh: flashMesh,
        x: x, y: y, z: z,
        vx: (Math.random() - 0.5) * 1.0,
        vy: 3.5, // Small upward bounce when ignited
        vz: (Math.random() - 0.5) * 1.0,
        fuse: fuse,
        maxFuse: fuse,
        onGround: false
    });

    swingAnimation = 1.0;

    // Play fuse hissing sound at the TNT location
    if (typeof window.playFuseSound === 'function') window.playFuseSound(x, y, z);
};

window.explodeTNT = function(x, y, z, radius) {
    radius = radius || 4;
    const radiusSq = radius * radius;

    // Play explosion sound at the blast center
    if (typeof window.playExplosionSound === 'function') window.playExplosionSound(x, y, z);

    // Spawn explosion particles (big burst)
    for (let i = 0; i < 40; i++) {
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = (Math.random() - 0.5) * Math.PI;
        const speed = 3 + Math.random() * 8;
        const pvx = Math.cos(angle2) * Math.cos(angle1) * speed;
        const pvy = Math.sin(angle2) * speed + 2;
        const pvz = Math.cos(angle2) * Math.sin(angle1) * speed;

        // Use smoke-like particles for the explosion cloud
        if (typeof window.spawnSmoke === 'function') {
            window.spawnSmoke(
                x + (Math.random() - 0.5) * 2,
                y + (Math.random() - 0.5) * 2 + 0.5,
                z + (Math.random() - 0.5) * 2
            );
        }
    }

    // Spawn block break particles from destroyed blocks
    const destroyedBlocks = [];

    // Destroy blocks in sphere
    for (let bx = Math.floor(x - radius); bx <= Math.ceil(x + radius); bx++) {
        for (let by = Math.floor(y - radius); by <= Math.ceil(y + radius); by++) {
            for (let bz = Math.floor(z - radius); bz <= Math.ceil(z + radius); bz++) {
                const dx = bx + 0.5 - x;
                const dy = by + 0.5 - y;
                const dz = bz + 0.5 - z;
                const distSq = dx*dx + dy*dy + dz*dz;

                if (distSq > radiusSq) continue;

                const val = getVoxel(bx, by, bz);
                const bid = val & 0xFF;
                if (bid === 0 || bid === 18) continue; // Skip air and bedrock

                // Resistance: blocks further from center have a chance to survive
                const dist = Math.sqrt(distSq);
                const blastResistance = dist / radius;
                if (Math.random() < blastResistance * 0.3) continue;

                // Chain reaction: ignite other TNT blocks
                if (bid === 65) {
                    // Random short fuse for chain reaction (0.5 - 1.5s)
                    window.igniteTNT(bx, by, bz, 0.5 + Math.random() * 1.0);
                    continue;
                }

                // Spawn particles for destroyed blocks
                if (typeof spawnParticles === 'function' && Math.random() < 0.4) {
                    spawnParticles(bx, by, bz, bid);
                }

                // Drop items (25% chance in survival, like MC)
                if (gameMode === 'survival' && Math.random() < 0.25) {
                    if (typeof window.spawnBlockDrops === 'function') {
                        window.spawnBlockDrops(bid, bx, by, bz, val);
                    }
                }

                // Remove the block
                setVoxel(bx, by, bz, 0);
                destroyedBlocks.push({x: bx, y: by, z: bz});
            }
        }
    }

    // Batch update chunks and lighting
    if (destroyedBlocks.length > 0) {
        // Queue all neighbors for fluid/gravity updates
        for (const b of destroyedBlocks) {
            queueNeighbors(b.x, b.y, b.z);
            checkGravity(b.x, b.y + 1, b.z);
        }

        // Recalculate lighting centered on explosion
        recalculateLighting(Math.floor(x), Math.floor(y), Math.floor(z));

        // Mark dirty chunks
        const minCx = Math.floor((x - radius) / CHUNK_SIZE);
        const maxCx = Math.floor((x + radius) / CHUNK_SIZE);
        const minCz = Math.floor((z - radius) / CHUNK_SIZE);
        const maxCz = Math.floor((z + radius) / CHUNK_SIZE);
        for (let cx = minCx - 1; cx <= maxCx + 1; cx++) {
            for (let cz = minCz - 1; cz <= maxCz + 1; cz++) {
                dirtyChunks.add(`${cx},${cz}`);
            }
        }
    }

    // Knockback player
    const pdx = player.x - x;
    const pdy = (player.y + player.eyeLevel) - y;
    const pdz = player.z - z;
    const pDist = Math.sqrt(pdx*pdx + pdy*pdy + pdz*pdz);
    if (pDist < radius * 2 && pDist > 0) {
        const knockback = Math.max(0, 1.0 - pDist / (radius * 2)) * 15.0;
        player.vx += (pdx / pDist) * knockback;
        player.vy += (pdy / pDist) * knockback * 0.5 + 3.0;
        player.vz += (pdz / pDist) * knockback;
        
        // Damage player in survival
        if (gameMode === 'survival') {
            const damage = Math.floor(Math.max(0, (1.0 - pDist / (radius * 1.5)) * 14));
            if (damage > 0) {
                window.applyPlayerDamage(damage);
            }
        }
    }

    // Knockback mobs
    if (typeof globalMobs !== 'undefined') {
        for (const mob of globalMobs) {
            if (mob.dead || mob.dying) continue;
            const mdx = mob.x - x;
            const mdy = (mob.y + mob.height/2) - y;
            const mdz = mob.z - z;
            const mDist = Math.sqrt(mdx*mdx + mdy*mdy + mdz*mdz);
            if (mDist < radius * 2 && mDist > 0) {
                const kb = Math.max(0, 1.0 - mDist / (radius * 2)) * 12.0;
                mob.vx += (mdx / mDist) * kb;
                mob.vy += (mdy / mDist) * kb * 0.5 + 4.0;
                mob.vz += (mdz / mDist) * kb;
                const mobDmg = Math.floor(Math.max(0, (1.0 - mDist / (radius * 1.5)) * 20));
                if (mobDmg > 0 && typeof mob.takeDamage === 'function') {
                    mob.takeDamage(mobDmg, x, z);
                }
            }
        }
    }

    // Launch nearby dropped items
    for (const item of droppedItems) {
        const idx = item.x - x, idy = item.y - y, idz = item.z - z;
        const iDist = Math.sqrt(idx*idx + idy*idy + idz*idz);
        if (iDist < radius * 2 && iDist > 0) {
            const kb = Math.max(0, 1.0 - iDist / (radius * 2)) * 10.0;
            item.vx += (idx / iDist) * kb;
            item.vy += (idy / iDist) * kb * 0.5 + 3.0;
            item.vz += (idz / iDist) * kb;
        }
    }

    // Launch other primed TNT entities (classic MC TNT cannon behavior)
    for (const otherTNT of activeTNT) {
        const tdx = (otherTNT.x + 0.5) - x;
        const tdy = (otherTNT.y + 0.5) - y;
        const tdz = (otherTNT.z + 0.5) - z;
        const tDist = Math.sqrt(tdx*tdx + tdy*tdy + tdz*tdz);
        if (tDist < radius * 2 && tDist > 0.1) {
            const kb = Math.max(0, 1.0 - tDist / (radius * 2)) * 16.0;
            otherTNT.vx += (tdx / tDist) * kb;
            otherTNT.vy += (tdy / tDist) * kb * 0.6 + 5.0;
            otherTNT.vz += (tdz / tDist) * kb;
            otherTNT.onGround = false;
        }
    }
};

function updateTNTEntities(dt) {
    for (let i = activeTNT.length - 1; i >= 0; i--) {
        const tnt = activeTNT[i];
        tnt.fuse -= dt;

        // Flash white: increases in frequency as fuse gets shorter (classic MC behavior)
        const flashRate = Math.max(2, 10 * (1.0 - tnt.fuse / tnt.maxFuse));
        const isFlashing = Math.sin(tnt.fuse * flashRate * Math.PI) > 0;
        tnt.flashMesh.visible = isFlashing;

        // Expand slightly when about to blow (classic MC pulsing)
        const pulseScale = 1.0 + (isFlashing ? 0.04 : 0.0);
        tnt.mesh.scale.setScalar(pulseScale);

        // Physics: gravity and ground collision
        tnt.vy -= GRAVITY * dt * 0.5;
        
        let nextX = tnt.x + tnt.vx * dt;
        let nextY = tnt.y + tnt.vy * dt;
        let nextZ = tnt.z + tnt.vz * dt;

        // Ground check (sample below center of block)
        const cx = nextX + 0.5, cz = nextZ + 0.5;
        const belowId = getVoxel(Math.floor(cx), Math.floor(nextY - 0.01), Math.floor(cz)) & 0xFF;
        if (belowId !== 0 && !isFluidBlock(belowId)) {
            nextY = Math.floor(nextY - 0.01) + 1;
            tnt.vy = 0;
            tnt.vx *= 0.7;
            tnt.vz *= 0.7;
            tnt.onGround = true;
        }

        // Wall checks (sample at block center height and edges)
        const midY = Math.floor(tnt.y + 0.5);
        if ((getVoxel(Math.floor(nextX + 1.0), midY, Math.floor(cz)) & 0xFF) !== 0 ||
            (getVoxel(Math.floor(nextX), midY, Math.floor(cz)) & 0xFF) !== 0) {
            tnt.vx *= -0.3; nextX = tnt.x;
        }
        if ((getVoxel(Math.floor(cx), midY, Math.floor(nextZ + 1.0)) & 0xFF) !== 0 ||
            (getVoxel(Math.floor(cx), midY, Math.floor(nextZ)) & 0xFF) !== 0) {
            tnt.vz *= -0.3; nextZ = tnt.z;
        }

        tnt.x = nextX; tnt.y = nextY; tnt.z = nextZ;
        tnt.mesh.position.set(tnt.x, tnt.y, tnt.z);

        // EXPLODE when fuse runs out
        if (tnt.fuse <= 0) {
            scene.remove(tnt.mesh);
            tnt.mesh.traverse(child => { if (child.isMesh && child.geometry) child.geometry.dispose(); });
            activeTNT.splice(i, 1);
            window.explodeTNT(tnt.x + 0.5, tnt.y + 0.5, tnt.z + 0.5);
        }
    }
}