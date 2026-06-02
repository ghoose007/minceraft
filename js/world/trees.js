// ==========================================
// TREE GENERATION
// ==========================================

// --- NEW: PROCEDURAL TREE GENERATOR ---
function growTree(x, y, z, type) {
    // --- JUNGLE SAPLING: check for 2x2 formation first ---
    if (type === 137) {
        // Check all 4 possible 2x2 corners this sapling could be part of
        const offsets = [[0,0],[0,-1],[-1,0],[-1,-1]];
        for (const [ox, oz] of offsets) {
            const bx = x + ox, bz = z + oz;
            let all4 = true;
            for (let dx = 0; dx <= 1; dx++) {
                for (let dz = 0; dz <= 1; dz++) {
                    const id = getVoxel(bx + dx, y, bz + dz) & 0xFF;
                    if (id !== 137) { all4 = false; break; }
                }
                if (!all4) break;
            }
            if (all4) {
                growBigJungleTree(bx, bz, y);
                return;
            }
        }
        // No 2x2 found — grow small jungle tree
        growSmallJungleTree(x, y, z);
        return;
    }

    // v435: Oak/Birch saplings now use the same small regular tree shape used
    // by natural plains/forest worldgen, instead of the older custom sapling
    // canopy. This matches the in-world naturally generated regular oak/birch.
    if (type === 116 || type === 117) {
        _growNaturalOakBirchSaplingTree(x, y, z, type);
        return;
    }

    let logId = 13, leafId = 14, height = 4 + Math.floor(Math.random() * 3);
    if (type === 117) { logId = 41; leafId = 43; height = 5 + Math.floor(Math.random() * 3); }
    if (type === 118) { logId = 21; leafId = 22; height = 6 + Math.floor(Math.random() * 3); }

    // Check if there is space to grow
    for (let dy = 0; dy <= height; dy++) {
        const id = getVoxel(x, y + dy, z) & 0xFF;
        if (id !== 0 && id !== 116 && id !== 117 && id !== 118 && id !== 137 && id !== leafId) return; // Blocked!
    }

    setVoxel(x, y, z, 0); // Consume the sapling

    // Procedural Leaves
    if (type === 118) { // Spruce Shape
        let radius = 1;
        for (let dy = height + 1; dy >= height - 4; dy--) {
            const curRadius = dy > height ? 0 : radius;
            for (let dx = -curRadius; dx <= curRadius; dx++) {
                for (let dz = -curRadius; dz <= curRadius; dz++) {
                    if (dx*dx + dz*dz <= curRadius*curRadius + 0.5) {
                        if ((getVoxel(x+dx, y+dy, z+dz) & 0xFF) === 0) {
                            setVoxel(x+dx, y+dy, z+dz, leafId);
                            pendingBlockUpdates.push({x: x+dx, y: y+dy, z: z+dz});
                        }
                    }
                }
            }
            if (dy <= height) radius = (radius === 1) ? 2 : 1;
        }
    } else { // Oak & Birch Shape
        for (let dy = height - 3; dy <= height + 1; dy++) {
            const radius = (dy >= height) ? 1 : 2;
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    if (Math.abs(dx) === radius && Math.abs(dz) === radius && (Math.random() < 0.5 || dy >= height)) continue;
                    if ((getVoxel(x+dx, y+dy, z+dz) & 0xFF) === 0) {
                        setVoxel(x+dx, y+dy, z+dz, leafId);
                        pendingBlockUpdates.push({x: x+dx, y: y+dy, z: z+dz});
                    }
                }
            }
        }
    }

    // Generate Trunk
    for (let dy = 0; dy < height; dy++) {
        setVoxel(x, y + dy, z, logId);
        pendingBlockUpdates.push({x: x, y: y + dy, z: z});
    }
    
    // Trigger global lighting recalculation around the new canopy
    pendingBlockUpdates.push({x: x, y: y + Math.floor(height/2), z: z}); 
}


function _growNaturalOakBirchSaplingTree(x, y, z, type) {
    const logId = (type === 117) ? 41 : 13;
    const leafId = (type === 117) ? 43 : 14;
    const trunkHeight = (type === 117)
        ? (5 + Math.floor(Math.random() * 3))
        : (4 + Math.floor(Math.random() * 3));

    // v439: y is the sapling block position and therefore also the first trunk
    // block position. The previous v435 helper copied worldgen's "ground y"
    // convention and started the trunk at y+1, making bonemeal trees float.
    for (let dy = 0; dy <= trunkHeight + 2; dy++) {
        const id = getVoxel(x, y + dy, z) & 0xFF;
        if (id !== 0 && id !== type && id !== leafId) return;
    }

    setVoxel(x, y, z, 0);

    // Natural regular small-tree canopy shape, shifted to sapling-base coords.
    for (let ly = y + trunkHeight - 3; ly <= y + trunkHeight; ly++) {
        const yDist = ly - (y + trunkHeight - 1);
        const radius = (yDist >= 0) ? 1 : 2;
        for (let llx = -radius; llx <= radius; llx++) {
            for (let llz = -radius; llz <= radius; llz++) {
                if (Math.abs(llx) === radius && Math.abs(llz) === radius) {
                    if (yDist >= 0 || Math.random() < 0.5) continue;
                }
                if (llx === 0 && llz === 0 && ly < y + trunkHeight) continue;
                if ((getVoxel(x + llx, ly, z + llz) & 0xFF) === 0) {
                    setVoxel(x + llx, ly, z + llz, leafId);
                    pendingBlockUpdates.push({x: x + llx, y: ly, z: z + llz});
                }
            }
        }
    }

    for (let ly = 0; ly < trunkHeight; ly++) {
        setVoxel(x, y + ly, z, logId);
        pendingBlockUpdates.push({x, y: y + ly, z});
    }

    pendingBlockUpdates.push({x, y: y + Math.floor(trunkHeight / 2), z});
}


// --- SMALL JUNGLE TREE (1x1 trunk, like MC's small jungle tree) ---
function growSmallJungleTree(x, y, z) {
    const logId = 96, leafId = 97;
    const height = 4 + Math.floor(Math.random() * 4); // 4-7 blocks tall

    // Space check
    for (let dy = 0; dy <= height + 1; dy++) {
        const id = getVoxel(x, y + dy, z) & 0xFF;
        if (id !== 0 && id !== 137 && id !== leafId) return;
    }

    setVoxel(x, y, z, 0); // Consume sapling

    // Trunk
    for (let dy = 0; dy < height; dy++) {
        setVoxel(x, y + dy, z, logId);
        pendingBlockUpdates.push({x, y: y + dy, z});
    }

    // Leaves — standard Minecraft small jungle tree canopy
    for (let dy = height - 3; dy <= height + 1; dy++) {
        const yDist = dy - height;
        let radius;
        if (yDist <= -2) radius = 2;
        else if (yDist <= 0) radius = 2;
        else radius = 1;
        if (yDist > 1) radius = 0;
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (Math.abs(dx) === radius && Math.abs(dz) === radius) {
                    if (yDist >= 0 || Math.random() < 0.5) continue;
                }
                if (dx === 0 && dz === 0 && dy < y + height) continue;
                const cur = getVoxel(x + dx, y + dy, z + dz) & 0xFF;
                if (cur === 0) {
                    setVoxel(x + dx, y + dy, z + dz, leafId);
                    pendingBlockUpdates.push({x: x + dx, y: y + dy, z: z + dz});
                }
            }
        }
    }

    // Vines on leaf edges
    _placeJungleVines(x, y, z, height, 2);
    
    pendingBlockUpdates.push({x, y: y + Math.floor(height/2), z});
}

// --- BIG JUNGLE TREE (2x2 trunk, like MC's tall jungle tree) ---
// bx,bz is the SW corner of the 2x2 sapling formation
function growBigJungleTree(bx, bz, y) {
    const logId = 96, leafId = 97;
    const height = 15 + Math.floor(Math.random() * 12); // 15-26 blocks tall (MC range)

    // Clear saplings
    for (let dx = 0; dx <= 1; dx++) {
        for (let dz = 0; dz <= 1; dz++) {
            setVoxel(bx + dx, y, bz + dz, 0);
        }
    }

    // 2x2 trunk
    for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
            for (let dz = 0; dz <= 1; dz++) {
                setVoxel(bx + dx, y + dy, bz + dz, logId);
                pendingBlockUpdates.push({x: bx + dx, y: y + dy, z: bz + dz});
            }
        }
    }

    // Canopy: large leafy crown at the top, MC-style layered spheroid
    const cx = bx + 0.5, cz = bz + 0.5; // center of 2x2
    const canopyBottom = y + height - 5 - Math.floor(Math.random() * 3);
    const canopyTop = y + height + 2;
    
    for (let ly = canopyBottom; ly <= canopyTop; ly++) {
        const yDist = ly - (y + height);
        let radius;
        if (yDist <= -4) radius = 2;
        else if (yDist <= -2) radius = 4;
        else if (yDist <= 0) radius = 3;
        else if (yDist === 1) radius = 2;
        else radius = 1;
        
        for (let dx = -radius; dx <= radius + 1; dx++) {
            for (let dz = -radius; dz <= radius + 1; dz++) {
                const ddx = dx - 0.5, ddz = dz - 0.5;
                const dist = Math.sqrt(ddx * ddx + ddz * ddz);
                if (dist > radius + 0.5) continue;
                // Corner trimming
                if (dist > radius - 0.5 && Math.random() < 0.35) continue;
                
                const px = bx + dx, pz = bz + dz;
                const cur = getVoxel(px, ly, pz) & 0xFF;
                if (cur === 0) {
                    setVoxel(px, ly, pz, leafId);
                    pendingBlockUpdates.push({x: px, y: ly, z: pz});
                }
            }
        }
    }

    // Branches — 2-4 branches coming off the trunk at random heights
    const numBranches = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < numBranches; b++) {
        const branchY = y + 6 + Math.floor(Math.random() * (height - 10));
        const angle = Math.random() * Math.PI * 2;
        const branchLen = 3 + Math.floor(Math.random() * 3);
        let bxp = bx + 0.5, bzp = bz + 0.5;
        
        for (let l = 0; l < branchLen; l++) {
            bxp += Math.cos(angle) * 0.8;
            bzp += Math.sin(angle) * 0.8;
            const ix = Math.round(bxp), iz = Math.round(bzp);
            const by = branchY + l;
            const cur = getVoxel(ix, by, iz) & 0xFF;
            if (cur === 0 || cur === leafId) {
                setVoxel(ix, by, iz, logId);
                pendingBlockUpdates.push({x: ix, y: by, z: iz});
            }
        }
        // Small leaf cluster at branch end
        const endX = Math.round(bxp), endZ = Math.round(bzp);
        const endY = branchY + branchLen;
        for (let dy2 = -1; dy2 <= 1; dy2++) {
            const r2 = dy2 === 0 ? 2 : 1;
            for (let dx2 = -r2; dx2 <= r2; dx2++) {
                for (let dz2 = -r2; dz2 <= r2; dz2++) {
                    if (Math.abs(dx2) === r2 && Math.abs(dz2) === r2 && Math.random() < 0.5) continue;
                    const cur = getVoxel(endX + dx2, endY + dy2, endZ + dz2) & 0xFF;
                    if (cur === 0) {
                        setVoxel(endX + dx2, endY + dy2, endZ + dz2, leafId);
                        pendingBlockUpdates.push({x: endX + dx2, y: endY + dy2, z: endZ + dz2});
                    }
                }
            }
        }
    }

    // Dense vines on the big tree
    _placeJungleVines(bx, y, bz, height, 5);
    
    pendingBlockUpdates.push({x: bx, y: y + Math.floor(height/2), z: bz});
}

// --- Shared vine placement helper for jungle trees ---
function _placeJungleVines(tx, ty, tz, treeHeight, maxRadius) {
    const leafId = 97;
    for (let ly = ty + treeHeight - 5; ly <= ty + treeHeight + 1; ly++) {
        for (let dx = -maxRadius; dx <= maxRadius + 1; dx++) {
            for (let dz = -maxRadius; dz <= maxRadius + 1; dz++) {
                const lx = tx + dx, lz = tz + dz;
                const blockId = getVoxel(lx, ly, lz) & 0xFF;
                if (blockId !== leafId) continue;
                
                const vineChecks = [
                    { ddx: 1, ddz: 0, dir: 1 },
                    { ddx: -1, ddz: 0, dir: 2 },
                    { ddx: 0, ddz: 1, dir: 3 },
                    { ddx: 0, ddz: -1, dir: 4 }
                ];
                for (const vc of vineChecks) {
                    const nx = lx + vc.ddx, nz = lz + vc.ddz;
                    if ((getVoxel(nx, ly, nz) & 0xFF) === 0 && Math.random() < 0.4) {
                        const vineLen = 2 + Math.floor(Math.random() * 5);
                        for (let vl = 0; vl < vineLen; vl++) {
                            if ((getVoxel(nx, ly - vl, nz) & 0xFF) === 0) {
                                setVoxel(nx, ly - vl, nz, 66, vc.dir);
                                pendingBlockUpdates.push({x: nx, y: ly - vl, z: nz});
                            } else break;
                        }
                    }
                }
            }
        }
    }
}
