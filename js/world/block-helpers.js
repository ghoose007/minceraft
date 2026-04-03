// ==========================================
// BLOCK HELPER FUNCTIONS
// ==========================================

function isLeafBlock(id) {
    return (id === 14 || id === 22 || id === 43 || id === 97); 
}

// Pre-computed transparency lookup table (256 entries, rebuilt when graphics setting changes)
const _transparentLUT = new Uint8Array(256);
const _transparentFancyLUT = new Uint8Array(256);
(function() {
    // Added 62, 63, 64 for Farming, 66 for Vine, 67 for Lily Pad, 70-76 Slabs, 80-86 Stairs
    const transparentIds = [0, 4, 14, 16, 17, 20, 22, 23, 24, 26, 27, 38, 40, 42, 43, 52, 53, 62, 63, 64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 84, 85, 86, 89, 90, 93, 94, 95, 97, 116, 117, 118, 137, 144, 145, 146, 147, 148, 149, 150, 152, 157, 158, 201, 202, 203, 205, 206];
    const transparentFastIds = [0, 4, 16, 17, 20, 23, 24, 26, 27, 38, 40, 42, 52, 53, 62, 63, 64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 84, 85, 86, 90, 93, 94, 95, 116, 117, 118, 137, 144, 145, 146, 147, 148, 149, 150, 152, 157, 158, 201, 202, 203, 205, 206]; // leaves opaque in Fast mode
    for (const id of transparentIds) _transparentFancyLUT[id] = 1;
    for (const id of transparentFastIds) _transparentLUT[id] = 1;
})();

function isBlockTransparent(id) {
    return settingGraphicsFancy ? _transparentFancyLUT[id] : _transparentLUT[id];
}

const _fluidLUT = new Uint8Array(256);
_fluidLUT[4] = 1; _fluidLUT[27] = 1;
function isFluidBlock(id) { return _fluidLUT[id]; }

const _crossLUT = new Uint8Array(256);
_crossLUT[16] = 1; _crossLUT[23] = 1; _crossLUT[24] = 1; _crossLUT[26] = 1; _crossLUT[42] = 1; _crossLUT[52] = 1; _crossLUT[53] = 1; _crossLUT[89] = 1;
_crossLUT[116] = 1; _crossLUT[117] = 1; _crossLUT[118] = 1; _crossLUT[137] = 1;
function isCrossBlock(id) { return _crossLUT[id]; }

function isSnowLayer(id) {
    return id === 40;
}

const _slabLUT = new Uint8Array(256);
_slabLUT[70] = 1; _slabLUT[71] = 1; _slabLUT[72] = 1; _slabLUT[73] = 1; _slabLUT[74] = 1; _slabLUT[75] = 1; _slabLUT[76] = 1; _slabLUT[77] = 1; _slabLUT[157] = 1;
function isSlabBlock(id) { return _slabLUT[id]; }

const _stairLUT = new Uint8Array(256);
_stairLUT[80] = 1; _stairLUT[81] = 1; _stairLUT[82] = 1; _stairLUT[83] = 1; _stairLUT[84] = 1; _stairLUT[85] = 1; _stairLUT[86] = 1; _stairLUT[94] = 1; _stairLUT[152] = 1;
function isStairBlock(id) { return _stairLUT[id]; }

const _fenceLUT = new Uint8Array(256);
_fenceLUT[144] = 1; _fenceLUT[145] = 1; _fenceLUT[146] = 1; _fenceLUT[147] = 1; _fenceLUT[148] = 1;
function isFenceBlock(id) { return _fenceLUT[id]; }

function getBlockBounds(id, val, bx, by, bz) {
    let b = { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
    
    // --- NEW: Smart Fire Hitboxes ---
    if (id === 89) {
        const dir = (val >> 9) & 0x7;
        // Floor fire (dir === 0) keeps the default full 1x1x1 bounding box!
        if (dir === 1) { b.maxX = 0.1; }       // Attached to -X wall
        else if (dir === 2) { b.minX = 0.9; }  // Attached to +X wall
        else if (dir === 3) { b.maxZ = 0.1; }  // Attached to -Z wall
        else if (dir === 4) { b.minZ = 0.9; }  // Attached to +Z wall
    } 
    else if (id === 40) {
        const layers = Math.max(1, Math.min(8, (val >> 8) & 0xF));
        b.maxY = layers / 8.0;
    } else if (id === 16 || id === 23 || id === 24 || id === 26 || id === 42 || id === 52 || id === 53 || id === 116 || id === 117 || id === 118) {
        b.minX = 0.1; b.maxX = 0.9; b.minY = 0.0; b.maxY = 0.8; b.minZ = 0.1; b.maxZ = 0.9;
    } else if (id === 20) {
        b.minX = 0.0625; b.maxX = 0.9375; b.minY = 0.0; b.maxY = 1.0; b.minZ = 0.0625; b.maxZ = 0.9375;
    } else if (id === 17) {
        const level = (val >> 8) & 0xF;
        if (level === 0) { b.minX=0.4; b.maxX=0.6; b.minY=0.0; b.maxY=0.6; b.minZ=0.4; b.maxZ=0.6; }
        else if (level === 1) { b.minX=0.0; b.maxX=0.2; b.minY=0.2; b.maxY=0.8; b.minZ=0.4; b.maxZ=0.6; }
        else if (level === 2) { b.minX=0.8; b.maxX=1.0; b.minY=0.2; b.maxY=0.8; b.minZ=0.4; b.maxZ=0.6; }
        else if (level === 3) { b.minX=0.4; b.maxX=0.6; b.minY=0.2; b.maxY=0.8; b.minZ=0.0; b.maxZ=0.2; }
        else if (level === 4) { b.minX=0.4; b.maxX=0.6; b.minY=0.2; b.maxY=0.8; b.minZ=0.8; b.maxZ=1.0; }
    } else if (id === 206) {
        // Redstone torch: same hitbox as regular torch
        const level = (val >> 8) & 0xF;
        if (level === 0) { b.minX=0.4; b.maxX=0.6; b.minY=0.0; b.maxY=0.6; b.minZ=0.4; b.maxZ=0.6; }
        else if (level === 1) { b.minX=0.0; b.maxX=0.2; b.minY=0.2; b.maxY=0.8; b.minZ=0.4; b.maxZ=0.6; }
        else if (level === 2) { b.minX=0.8; b.maxX=1.0; b.minY=0.2; b.maxY=0.8; b.minZ=0.4; b.maxZ=0.6; }
        else if (level === 3) { b.minX=0.4; b.maxX=0.6; b.minY=0.2; b.maxY=0.8; b.minZ=0.0; b.maxZ=0.2; }
        else if (level === 4) { b.minX=0.4; b.maxX=0.6; b.minY=0.2; b.maxY=0.8; b.minZ=0.8; b.maxZ=1.0; }
    } else if (id === 202) {
        // Redstone dust: flat on top of block, 1px tall
        b.minY = 0.0; b.maxY = 1/16;
    } else if (id === 203) {
        // Wood button: small protrusion on wall face
        const dir = (val >> 8) & 0x3;
        const pressed = (val >> 10) & 0x1;
        const depth = pressed ? 1/16 : 2/16;
        if (dir === 0)      { b.minX=5/16; b.maxX=11/16; b.minY=6/16; b.maxY=10/16; b.minZ=1-depth; b.maxZ=1; }
        else if (dir === 1) { b.minZ=5/16; b.maxZ=11/16; b.minY=6/16; b.maxY=10/16; b.minX=1-depth; b.maxX=1; }
        else if (dir === 2) { b.minX=5/16; b.maxX=11/16; b.minY=6/16; b.maxY=10/16; b.minZ=0; b.maxZ=depth; }
        else if (dir === 3) { b.minZ=5/16; b.maxZ=11/16; b.minY=6/16; b.maxY=10/16; b.minX=0; b.maxX=depth; }
    } else if (id === 205) {
        // Lever: base 6x4x2 + stick extends beyond
        const dir = (val >> 8) & 0x3;
        if (dir === 0)      { b.minX=5/16; b.maxX=11/16; b.minY=5/16; b.maxY=11/16; b.minZ=1-3/16; b.maxZ=1; }
        else if (dir === 1) { b.minZ=5/16; b.maxZ=11/16; b.minY=5/16; b.maxY=11/16; b.minX=1-3/16; b.maxX=1; }
        else if (dir === 2) { b.minX=5/16; b.maxX=11/16; b.minY=5/16; b.maxY=11/16; b.minZ=0; b.maxZ=3/16; }
        else if (dir === 3) { b.minZ=5/16; b.maxZ=11/16; b.minY=5/16; b.maxY=11/16; b.minX=0; b.maxX=3/16; }
    }
    
    // --- Farming Block Bounds ---
    if (id === 62 || id === 63) {
        b.maxY = 0.9375; // 15/16 pixels high
    } else if (id === 201) {
        b.maxY = 0.75; // Enchanting table: 12/16 pixels high
    } else if (id === 64) {
        // Proper crop raycast hitbox
        b.minX = 0.0; b.maxX = 1.0; b.minY = 0.0; b.maxY = 0.25; b.minZ = 0.0; b.maxZ = 1.0;
    } else if (id === 67) {
        // Lily pad: flat thin plane on water surface
        b.minX = 0.0; b.maxX = 1.0; b.minY = 0.0; b.maxY = 0.1; b.minZ = 0.0; b.maxZ = 1.0;
    } else if (id === 68 || id === 158) {
        // Glass Pane / Iron Bars: hitbox follows connectivity
        const T0 = 7/16, T1 = 9/16;
        b.minY = 0; b.maxY = 1;
        if (bx !== undefined && typeof getVoxel === 'function') {
            const gn = (nx,nz) => { const nId = getVoxel(nx,by,nz)&0xFF; return nId===68 || nId===158 || (nId!==0 && !isBlockTransparent(nId)); };
            const hXN=gn(bx-1,bz), hXP=gn(bx+1,bz), hZN=gn(bx,bz-1), hZP=gn(bx,bz+1);
            const hX=hXN||hXP, hZ=hZN||hZP;
            if (hX && hZ) { b.minX=0; b.maxX=1; b.minZ=0; b.maxZ=1; }
            else if (hX) { b.minX=hXN?0:T0; b.maxX=hXP?1:T1; b.minZ=T0; b.maxZ=T1; }
            else if (hZ) { b.minX=T0; b.maxX=T1; b.minZ=hZN?0:T0; b.maxZ=hZP?1:T1; }
            else { b.minX=T0; b.maxX=T1; b.minZ=T0; b.maxZ=T1; } // isolated: just center post
        } else {
            // Fallback: use stored direction
            const pdir = (val >> 8) & 0x1;
            if (pdir === 1) { b.minX=T0; b.maxX=T1; b.minZ=0; b.maxZ=1; }
            else { b.minX=0; b.maxX=1; b.minZ=T0; b.maxZ=T1; }
        }
    } else if (id === 90) {
        // Nether Portal: 2 pixels thick, directional like glass panes
        const dir = (val >> 8) & 0x1;
        if (dir === 1) { // Z-axis (portal faces E/W)
            b.minX = 0.375; b.maxX = 0.625; b.minY = 0.0; b.maxY = 1.0; b.minZ = 0.0; b.maxZ = 1.0;
        } else { // X-axis (portal faces N/S)
            b.minX = 0.0; b.maxX = 1.0; b.minY = 0.0; b.maxY = 1.0; b.minZ = 0.375; b.maxZ = 0.625;
        }
    } else if (id === 66) {
        // Vine: thin plane on a wall face
        const level = (val >> 8) & 0xF;
        if (level === 1) { b.minX = 0.0; b.maxX = 0.1; } // West face (-X)
        else if (level === 2) { b.minX = 0.9; b.maxX = 1.0; } // East face (+X)
        else if (level === 3) { b.minZ = 0.0; b.maxZ = 0.1; } // North face (-Z)
        else if (level === 4) { b.minZ = 0.9; b.maxZ = 1.0; } // South face (+Z)
        else { b.minX = 0.0; b.maxX = 1.0; b.minY = 0.9; b.maxY = 1.0; } // Default hanging
    } else if (isSlabBlock(id)) {
        const isTop = (val >> 8) & 0x1;
        if (isTop) { b.minY = 0.5; b.maxY = 1.0; }
        else { b.minY = 0.0; b.maxY = 0.5; }
    } else if (typeof isStairBlock === 'function' && isStairBlock(id)) {
        // Stairs return the bottom slab as the primary AABB.
        // The upper step is handled by getStairUpperBounds() checked separately in physics.
        const isUpsideDown = (val >> 8) & 0x4;
        if (isUpsideDown) {
            b.minX = 0.0; b.maxX = 1.0; b.minY = 0.5; b.maxY = 1.0; b.minZ = 0.0; b.maxZ = 1.0;
        } else {
            b.minX = 0.0; b.maxX = 1.0; b.minY = 0.0; b.maxY = 0.5; b.minZ = 0.0; b.maxZ = 1.0;
        }
    } else if (typeof isFenceBlock === 'function' && isFenceBlock(id)) {
        // Fence collision
        b.minX = 0.0; b.maxX = 1.0; b.minY = 0.0; b.maxY = 1.5; b.minZ = 0.0; b.maxZ = 1.0;
    } else if (id === 149) {
        // Door: hitbox must match mesh renderer positions exactly
        const dir = (val >> 8) & 0x3;
        const isOpen = (val >> 10) & 0x1;
        const hinge = (val >> 12) & 0x1;
        const D = 3/16;
        const E = 0.005;
        b.minY = 0.0; b.maxY = 1.0;
        if (!isOpen) {
            if (dir === 0) { b.minX=0; b.maxX=1; b.minZ=E; b.maxZ=D; }
            else if (dir === 1) { b.minX=1-D; b.maxX=1-E; b.minZ=0; b.maxZ=1; }
            else if (dir === 2) { b.minX=0; b.maxX=1; b.minZ=1-D; b.maxZ=1-E; }
            else { b.minX=E; b.maxX=D; b.minZ=0; b.maxZ=1; }
        } else {
            if (dir === 0) {
                if (hinge===0) { b.minX=E; b.maxX=D; b.minZ=0; b.maxZ=1; }
                else { b.minX=1-D; b.maxX=1-E; b.minZ=0; b.maxZ=1; }
            } else if (dir === 1) {
                if (hinge===0) { b.minX=0; b.maxX=1; b.minZ=E; b.maxZ=D; }
                else { b.minX=0; b.maxX=1; b.minZ=1-D; b.maxZ=1-E; }
            } else if (dir === 2) {
                if (hinge===0) { b.minX=1-D; b.maxX=1-E; b.minZ=0; b.maxZ=1; }
                else { b.minX=E; b.maxX=D; b.minZ=0; b.maxZ=1; }
            } else {
                if (hinge===0) { b.minX=0; b.maxX=1; b.minZ=1-D; b.maxZ=1-E; }
                else { b.minX=0; b.maxX=1; b.minZ=E; b.maxZ=D; }
            }
        }
    } else if (id === 150) {
        // Trapdoor
        const isOpen = (val >> 10) & 0x1;
        const isTop = (val >> 11) & 0x1;
        const dir = (val >> 8) & 0x3;
        if (!isOpen) {
            b.minX=0; b.maxX=1; b.minZ=0; b.maxZ=1;
            if (isTop) {b.minY=0.8125;b.maxY=1;} else {b.minY=0;b.maxY=0.1875;}
        } else {
            b.minY=0; b.maxY=1;
            if (dir===0) {b.minX=0;b.maxX=1;b.minZ=0;b.maxZ=0.1875;}
            else if (dir===1) {b.minX=0.8125;b.maxX=1;b.minZ=0;b.maxZ=1;}
            else if (dir===2) {b.minX=0;b.maxX=1;b.minZ=0.8125;b.maxZ=1;}
            else {b.minX=0;b.maxX=0.1875;b.minZ=0;b.maxZ=1;}
        }
    } // <--- end of collision bounds

    // Now this applies to EVERY block, preventing the crash
    return b; 
}

function canSupport(id) {
    if (id === 0 || id === 4 || id === 27 || isCrossBlock(id) || id === 20 || id === 40 || id === 38 || id === 17 || id === 64 || id === 66 || id === 67 || id === 68 || id === 158 || id === 202 || id === 203 || id === 205 || id === 206) return false;
    return true;
}

// Returns the upper step AABB for a stair block, or null if not a stair.
// The bottom slab is returned by getBlockBounds; this is the second collision box.
// val is the raw voxel value: bits 8-9 = direction (sd), bit 10 = upside-down
// sd: 0=back+Z, 1=back-Z, 2=back+X, 3=back-X
function getStairUpperBounds(id, val) {
    if (!isStairBlock(id)) return null;
    const sd = (val >> 8) & 0x3;
    const isUpsideDown = (val >> 8) & 0x4;
    const b = {};
    
    if (isUpsideDown) {
        // Upside-down: full slab on top (y 0.5-1), step extends down (y 0-0.5) on back side
        if (sd === 0) { b.minX=0; b.maxX=1; b.minY=0; b.maxY=0.5; b.minZ=0.5; b.maxZ=1; }
        else if (sd === 1) { b.minX=0; b.maxX=1; b.minY=0; b.maxY=0.5; b.minZ=0; b.maxZ=0.5; }
        else if (sd === 2) { b.minX=0.5; b.maxX=1; b.minY=0; b.maxY=0.5; b.minZ=0; b.maxZ=1; }
        else { b.minX=0; b.maxX=0.5; b.minY=0; b.maxY=0.5; b.minZ=0; b.maxZ=1; }
    } else {
        // Normal: full slab on bottom (y 0-0.5), step extends up (y 0.5-1) on back side
        if (sd === 0) { b.minX=0; b.maxX=1; b.minY=0.5; b.maxY=1; b.minZ=0.5; b.maxZ=1; }
        else if (sd === 1) { b.minX=0; b.maxX=1; b.minY=0.5; b.maxY=1; b.minZ=0; b.maxZ=0.5; }
        else if (sd === 2) { b.minX=0.5; b.maxX=1; b.minY=0.5; b.maxY=1; b.minZ=0; b.maxZ=1; }
        else { b.minX=0; b.maxX=0.5; b.minY=0.5; b.maxY=1; b.minZ=0; b.maxZ=1; }
    }
    return b;
}

function canPlaceBlock(id, x, y, z, normal) {
    // Lily pad: can only be placed on top of water
    if (id === 67) {
        const below = getVoxel(x, y-1, z) & 0xFF;
        return below === 4;
    }
    // Vine: must attach to a solid block face
    if (id === 66) {
        if (normal[0] === 1) return canSupport(getVoxel(x-1, y, z) & 0xFF);
        if (normal[0] === -1) return canSupport(getVoxel(x+1, y, z) & 0xFF);
        if (normal[2] === 1) return canSupport(getVoxel(x, y, z-1) & 0xFF);
        if (normal[2] === -1) return canSupport(getVoxel(x, y, z+1) & 0xFF);
        if (normal[1] === -1) return canSupport(getVoxel(x, y+1, z) & 0xFF);
        return false;
    }
    if (isCrossBlock(id) || id === 64) {
        const below = getVoxel(x, y-1, z) & 0xFF;
        
        if (id === 52) { 
            if (below === 52) return true;
            if (below !== 1 && below !== 2 && below !== 15 && below !== 5) return false;
            let hasWater = false;
            for (let [dx, dy, dz] of [[1,0,0], [-1,0,0], [0,0,1], [0,0,-1]]) {
                if ((getVoxel(x+dx, y-1, z+dz) & 0xFF) === 4) { hasWater = true; break; }
            }
            return hasWater;
        }
        if (id === 64) {
            return (below === 62 || below === 63);
        }
        return (below === 1 || below === 2); 
    }
    if (id === 17) {
        if (normal[1] === 1) return canSupport(getVoxel(x, y-1, z) & 0xFF);
        if (normal[0] === 1) return canSupport(getVoxel(x-1, y, z) & 0xFF);
        if (normal[0] === -1) return canSupport(getVoxel(x+1, y, z) & 0xFF);
        if (normal[2] === 1) return canSupport(getVoxel(x, y, z-1) & 0xFF);
        if (normal[2] === -1) return canSupport(getVoxel(x, y, z+1) & 0xFF);
        return false; 
    }
    if (id === 20) {
        const below = getVoxel(x, y-1, z) & 0xFF;
        return (below === 15 || below === 20); 
    }
    return true;
}

function checkSupport(x, y, z) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id === 0) return true; 
    
    if (isCrossBlock(id) || id === 64) {
        const below = getVoxel(x, y-1, z) & 0xFF;
        
        if (id === 52) {
            if (below === 52) return true;
            if (below !== 1 && below !== 2 && below !== 15 && below !== 5) return false;
            let hasWater = false;
            for (let [dx, dy, dz] of [[1,0,0], [-1,0,0], [0,0,1], [0,0,-1]]) {
                if ((getVoxel(x+dx, y-1, z+dz) & 0xFF) === 4) { hasWater = true; break; }
            }
            return hasWater;
        }
        if (id === 64) {
            return (below === 62 || below === 63);
        }
        return (below === 1 || below === 2);
    }
    if (id === 17) {
        const level = (val >> 8) & 0xF;
        if (level === 0) return canSupport(getVoxel(x, y-1, z) & 0xFF);
        if (level === 1) return canSupport(getVoxel(x-1, y, z) & 0xFF);
        if (level === 2) return canSupport(getVoxel(x+1, y, z) & 0xFF);
        if (level === 3) return canSupport(getVoxel(x, y, z-1) & 0xFF);
        if (level === 4) return canSupport(getVoxel(x, y, z+1) & 0xFF);
        return true;
    }
    if (id === 20) {
        const below = getVoxel(x, y-1, z) & 0xFF;
        return (below === 15 || below === 20);
    }
    // Vine: needs solid anchor block on its face OR a vine/leaf block above
    if (id === 66) {
        const vineDir = (val >> 8) & 0xF;
        const aboveId = getVoxel(x, y + 1, z) & 0xFF;
        if (aboveId === 66 || isLeafBlock(aboveId)) return true;
        if (vineDir === 1 && canSupport(getVoxel(x - 1, y, z) & 0xFF)) return true;
        if (vineDir === 2 && canSupport(getVoxel(x + 1, y, z) & 0xFF)) return true;
        if (vineDir === 3 && canSupport(getVoxel(x, y, z - 1) & 0xFF)) return true;
        if (vineDir === 4 && canSupport(getVoxel(x, y, z + 1) & 0xFF)) return true;
        return false;
    }
    // Lily pad: needs water below
    if (id === 67) {
        return (getVoxel(x, y - 1, z) & 0xFF) === 4;
    }
    // Redstone dust: needs solid block below
    if (id === 202) {
        return canSupport(getVoxel(x, y - 1, z) & 0xFF);
    }
    // Wood button: needs solid block on its attached face
    if (id === 203 || id === 205) {
        const dir = (val >> 8) & 0x3;
        if (dir === 0) return canSupport(getVoxel(x, y, z + 1) & 0xFF);
        if (dir === 1) return canSupport(getVoxel(x + 1, y, z) & 0xFF);
        if (dir === 2) return canSupport(getVoxel(x, y, z - 1) & 0xFF);
        if (dir === 3) return canSupport(getVoxel(x - 1, y, z) & 0xFF);
        return false;
    }
    return true;
}

// ==========================================
// WATER FLOW DIRECTION (MC-accurate)
// ==========================================
// Returns {x, z} normalized flow vector at a given water block position.
// MC computes flow from the gradient of effective water levels among neighbors.

function _getEffectiveWaterLevel(x, y, z) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id !== 4) return -1;
    const isSource = (val >> 13) & 0x1;
    if (isSource) return 8;
    const isFalling = (val >> 12) & 0x1;
    if (isFalling) return 8;
    return (val >> 8) & 0xF;
}

function getWaterFlowDirection(x, y, z) {
    const val = getVoxel(x, y, z);
    if ((val & 0xFF) !== 4) return { x: 0, z: 0 };

    const myLevel = _getEffectiveWaterLevel(x, y, z);
    let flowX = 0, flowZ = 0;

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of dirs) {
        const nLevel = _getEffectiveWaterLevel(x + dx, y, z + dz);
        if (nLevel < 0) {
            const nId = getVoxel(x + dx, y, z + dz) & 0xFF;
            if (nId !== 0 && !isFluidBlock(nId) && !isCrossBlock(nId)) continue;
            flowX += dx * myLevel;
            flowZ += dz * myLevel;
        } else {
            const diff = myLevel - nLevel;
            flowX += dx * diff;
            flowZ += dz * diff;
        }
    }

    const len = Math.sqrt(flowX * flowX + flowZ * flowZ);
    if (len > 0.001) {
        flowX /= len;
        flowZ /= len;
    }
    return { x: flowX, z: flowZ };
}