// ==========================================
// NETHER PORTAL FRAME DETECTION
// ==========================================

// --- NETHER PORTAL FRAME DETECTION ---
// Checks if (px, py, pz) is inside a valid obsidian portal frame
// Valid frame: at least 4 wide x 5 tall obsidian (2x3 air interior minimum)
// Returns { interior: [{x,y,z},...], axis: 0|1 } or null
function detectPortalFrame(px, py, pz) {
    // Try both axes: X-aligned (portal plane in XY, thin along Z) and Z-aligned (portal plane in ZY, thin along X)
    for (let axis = 0; axis <= 1; axis++) {
        const result = _tryPortalAxis(px, py, pz, axis);
        if (result) return result;
    }
    return null;
}

function _tryPortalAxis(px, py, pz, axis) {
    // axis 0: portal spans X direction, thin along Z
    // axis 1: portal spans Z direction, thin along X
    const getBlock = (h, v) => {
        if (axis === 0) return getVoxel(px + h, py + v, pz) & 0xFF;
        else return getVoxel(px, py + v, pz + h) & 0xFF;
    };
    
    // Find left edge of interior (scan left until we hit obsidian or exceed max width)
    let left = 0;
    while (left > -21) {
        left--;
        const b = getBlock(left, 0);
        if (b === 28) break; // obsidian
        if (b !== 0 && b !== 90) return null; // non-air/non-portal = invalid
    }
    if (getBlock(left, 0) !== 28) return null;
    
    // Find right edge
    let right = 0;
    while (right < 21) {
        right++;
        const b = getBlock(right, 0);
        if (b === 28) break;
        if (b !== 0 && b !== 90) return null;
    }
    if (getBlock(right, 0) !== 28) return null;
    
    const innerWidth = right - left - 1;
    if (innerWidth < 2) return null; // minimum 2 wide interior
    
    // Find bottom edge (scan down)
    let bottom = 0;
    while (bottom > -4) {
        bottom--;
        const b = getBlock(0, bottom);
        if (b === 28) break;
        if (b !== 0 && b !== 90) return null;
    }
    if (getBlock(0, bottom) !== 28) return null;
    
    // Find top edge
    let top = 0;
    while (top < 21) {
        top++;
        const b = getBlock(0, top);
        if (b === 28) break;
        if (b !== 0 && b !== 90) return null;
    }
    if (getBlock(0, top) !== 28) return null;
    
    const innerHeight = top - bottom - 1;
    if (innerHeight < 3) return null; // minimum 3 tall interior
    
    // Validate the full frame: check all border blocks are obsidian
    // Bottom row
    for (let h = left; h <= right; h++) {
        if (getBlock(h, bottom) !== 28) return null;
    }
    // Top row
    for (let h = left; h <= right; h++) {
        if (getBlock(h, top) !== 28) return null;
    }
    // Left column
    for (let v = bottom; v <= top; v++) {
        if (getBlock(left, v) !== 28) return null;
    }
    // Right column
    for (let v = bottom; v <= top; v++) {
        if (getBlock(right, v) !== 28) return null;
    }
    
    // Validate interior is all air or portal
    const interior = [];
    for (let h = left + 1; h < right; h++) {
        for (let v = bottom + 1; v < top; v++) {
            const b = getBlock(h, v);
            if (b !== 0 && b !== 90) return null;
            if (axis === 0) interior.push({ x: px + h, y: py + v, z: pz });
            else interior.push({ x: px, y: py + v, z: pz + h });
        }
    }
    
    return { interior, axis };
}
