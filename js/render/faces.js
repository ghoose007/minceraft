// ==========================================
// FACE RENDERING & VERTEX BUILDING
// ==========================================

const blockFaces = [
    { dir: [1, 0, 0], corners: [ {pos: [1, 1, 1], uv: [0, 1]}, {pos: [1, 0, 1], uv: [0, 0]}, {pos: [1, 0, 0], uv: [1, 0]}, {pos: [1, 1, 0], uv: [1, 1]} ] }, 
    { dir: [-1, 0, 0], corners: [ {pos: [0, 1, 0], uv: [0, 1]}, {pos: [0, 0, 0], uv: [0, 0]}, {pos: [0, 0, 1], uv: [1, 0]}, {pos: [0, 1, 1], uv: [1, 1]} ] }, 
    { dir: [0, 1, 0], corners: [ {pos: [0, 1, 0], uv: [0, 1]}, {pos: [0, 1, 1], uv: [0, 0]}, {pos: [1, 1, 1], uv: [1, 0]}, {pos: [1, 1, 0], uv: [1, 1]} ] }, 
    { dir: [0, -1, 0], corners: [ {pos: [0, 0, 1], uv: [0, 1]}, {pos: [0, 0, 0], uv: [0, 0]}, {pos: [1, 0, 0], uv: [1, 0]}, {pos: [1, 0, 1], uv: [1, 1]} ] }, 
    { dir: [0, 0, 1], corners: [ {pos: [0, 1, 1], uv: [0, 1]}, {pos: [0, 0, 1], uv: [0, 0]}, {pos: [1, 0, 1], uv: [1, 0]}, {pos: [1, 1, 1], uv: [1, 1]} ] }, 
    { dir: [0, 0, -1], corners: [ {pos: [1, 1, 0], uv: [0, 1]}, {pos: [1, 0, 0], uv: [0, 0]}, {pos: [0, 0, 0], uv: [1, 0]}, {pos: [0, 1, 0], uv: [1, 1]} ] }  
];

// Minecraft Fire: 4 planes pulled inward from block edges to prevent z-fighting with adjacent blocks
const fireFacesFull = [
    // South face (Z+), bottom at z=0.95, top tilts to z=0.85
    { dir: [0, 0, 1], corners: [{pos:[0,1,0.85],uv:[0,1]},{pos:[0,0,0.95],uv:[0,0]},{pos:[1,0,0.95],uv:[1,0]},{pos:[1,1,0.85],uv:[1,1]}] },
    // North face (Z-), bottom at z=0.05, top tilts to z=0.15
    { dir: [0, 0,-1], corners: [{pos:[1,1,0.15],uv:[0,1]},{pos:[1,0,0.05],uv:[0,0]},{pos:[0,0,0.05],uv:[1,0]},{pos:[0,1,0.15],uv:[1,1]}] },
    // East face (X+), bottom at x=0.95, top tilts to x=0.85
    { dir: [1, 0, 0], corners: [{pos:[0.85,1,1],uv:[0,1]},{pos:[0.95,0,1],uv:[0,0]},{pos:[0.95,0,0],uv:[1,0]},{pos:[0.85,1,0],uv:[1,1]}] },
    // West face (X-), bottom at x=0.05, top tilts to x=0.15
    { dir: [-1, 0, 0], corners: [{pos:[0.15,1,0],uv:[0,1]},{pos:[0.05,0,0],uv:[0,0]},{pos:[0.05,0,1],uv:[1,0]},{pos:[0.15,1,1],uv:[1,1]}] }
];

const crossFaces = [
    { dir: [-1, 0, 1], corners: [ {pos: [0, 1, 0], uv: [0, 1]}, {pos: [0, 0, 0], uv: [0, 0]}, {pos: [1, 0, 1], uv: [1, 0]}, {pos: [1, 1, 1], uv: [1, 1]} ] },
    { dir: [1, 0, -1], corners: [ {pos: [1, 1, 1], uv: [0, 1]}, {pos: [1, 0, 1], uv: [0, 0]}, {pos: [0, 0, 0], uv: [1, 0]}, {pos: [0, 1, 0], uv: [1, 1]} ] },
    { dir: [-1, 0, -1], corners: [ {pos: [0, 1, 1], uv: [0, 1]}, {pos: [0, 0, 1], uv: [0, 0]}, {pos: [1, 0, 0], uv: [1, 0]}, {pos: [1, 1, 0], uv: [1, 1]} ] },
    { dir: [1, 0, 1], corners: [ {pos: [1, 1, 0], uv: [0, 1]}, {pos: [1, 0, 0], uv: [0, 0]}, {pos: [0, 0, 1], uv: [1, 0]}, {pos: [0, 1, 1], uv: [1, 1]} ] }
];

// NEW: Minecraft's 4-plane square layout for crops (Double-sided = 8 faces)
const cropFaces = [
    { dir: [0, 0, 1], corners: [{pos:[0,1,0.75],uv:[0,1]},{pos:[0,0,0.75],uv:[0,0]},{pos:[1,0,0.75],uv:[1,0]},{pos:[1,1,0.75],uv:[1,1]}] },
    { dir: [0, 0,-1], corners: [{pos:[1,1,0.75],uv:[0,1]},{pos:[1,0,0.75],uv:[0,0]},{pos:[0,0,0.75],uv:[1,0]},{pos:[0,1,0.75],uv:[1,1]}] },
    { dir: [0, 0,-1], corners: [{pos:[1,1,0.25],uv:[0,1]},{pos:[1,0,0.25],uv:[0,0]},{pos:[0,0,0.25],uv:[1,0]},{pos:[0,1,0.25],uv:[1,1]}] },
    { dir: [0, 0, 1], corners: [{pos:[0,1,0.25],uv:[0,1]},{pos:[0,0,0.25],uv:[0,0]},{pos:[1,0,0.25],uv:[1,0]},{pos:[1,1,0.25],uv:[1,1]}] },
    { dir: [ 1, 0, 0], corners: [{pos:[0.75,1,1],uv:[0,1]},{pos:[0.75,0,1],uv:[0,0]},{pos:[0.75,0,0],uv:[1,0]},{pos:[0.75,1,0],uv:[1,1]}] },
    { dir: [-1, 0, 0], corners: [{pos:[0.75,1,0],uv:[0,1]},{pos:[0.75,0,0],uv:[0,0]},{pos:[0.75,0,1],uv:[1,0]},{pos:[0.75,1,1],uv:[1,1]}] },
    { dir: [-1, 0, 0], corners: [{pos:[0.25,1,0],uv:[0,1]},{pos:[0.25,0,0],uv:[0,0]},{pos:[0.25,0,1],uv:[1,0]},{pos:[0.25,1,1],uv:[1,1]}] },
    { dir: [ 1, 0, 0], corners: [{pos:[0.25,1,1],uv:[0,1]},{pos:[0.25,0,1],uv:[0,0]},{pos:[0.25,0,0],uv:[1,0]},{pos:[0.25,1,0],uv:[1,1]}] }
];

// Vine faces: wall-attached planes for each cardinal direction (front + back of each)
// level 1 = -X wall, 2 = +X wall, 3 = -Z wall, 4 = +Z wall
const vineFaces = {
    1: [ // Attached to -X face (vine hangs on west wall)
        { dir: [1, 0, 0], corners: [{pos:[0.01,1,1],uv:[0,1]},{pos:[0.01,0,1],uv:[0,0]},{pos:[0.01,0,0],uv:[1,0]},{pos:[0.01,1,0],uv:[1,1]}] },
        { dir: [-1, 0, 0], corners: [{pos:[0.01,1,0],uv:[0,1]},{pos:[0.01,0,0],uv:[0,0]},{pos:[0.01,0,1],uv:[1,0]},{pos:[0.01,1,1],uv:[1,1]}] }
    ],
    2: [ // Attached to +X face (vine hangs on east wall)
        { dir: [-1, 0, 0], corners: [{pos:[0.99,1,0],uv:[0,1]},{pos:[0.99,0,0],uv:[0,0]},{pos:[0.99,0,1],uv:[1,0]},{pos:[0.99,1,1],uv:[1,1]}] },
        { dir: [1, 0, 0], corners: [{pos:[0.99,1,1],uv:[0,1]},{pos:[0.99,0,1],uv:[0,0]},{pos:[0.99,0,0],uv:[1,0]},{pos:[0.99,1,0],uv:[1,1]}] }
    ],
    3: [ // Attached to -Z face (vine hangs on north wall)
        { dir: [0, 0, 1], corners: [{pos:[0,1,0.01],uv:[0,1]},{pos:[0,0,0.01],uv:[0,0]},{pos:[1,0,0.01],uv:[1,0]},{pos:[1,1,0.01],uv:[1,1]}] },
        { dir: [0, 0, -1], corners: [{pos:[1,1,0.01],uv:[0,1]},{pos:[1,0,0.01],uv:[0,0]},{pos:[0,0,0.01],uv:[1,0]},{pos:[0,1,0.01],uv:[1,1]}] }
    ],
    4: [ // Attached to +Z face (vine hangs on south wall)
        { dir: [0, 0, -1], corners: [{pos:[1,1,0.99],uv:[0,1]},{pos:[1,0,0.99],uv:[0,0]},{pos:[0,0,0.99],uv:[1,0]},{pos:[0,1,0.99],uv:[1,1]}] },
        { dir: [0, 0, 1], corners: [{pos:[0,1,0.99],uv:[0,1]},{pos:[0,0,0.99],uv:[0,0]},{pos:[1,0,0.99],uv:[1,0]},{pos:[1,1,0.99],uv:[1,1]}] }
    ]
};

// Lily pad: flat horizontal plane sitting on water surface (top + bottom visible)
const lilypadFaces = [
    { dir: [0, 1, 0], corners: [{pos:[0,0.015,0],uv:[0,1]},{pos:[0,0.015,1],uv:[0,0]},{pos:[1,0.015,1],uv:[1,0]},{pos:[1,0.015,0],uv:[1,1]}] },
    { dir: [0, -1, 0], corners: [{pos:[1,0.015,0],uv:[1,1]},{pos:[1,0.015,1],uv:[1,0]},{pos:[0,0.015,1],uv:[0,0]},{pos:[0,0.015,0],uv:[0,1]}] }
];

// Per-chunk biome tint cache — uses the global chunkBiomeCache from 09-worldgen.js
// Keyed by numeric hash for fast lookup during mesh building
const _biomeTintCache = new Map();

function getSmoothedBiomeTint(bx, bz) {
    // Use numeric key for cache (faster than string)
    const cacheKey = ((bx + 32768) << 16) | (bz + 32768);
    const cached = _biomeTintCache.get(cacheKey);
    if (cached) return cached;
    
    let r = 0, g = 0, b = 0, count = 0;
    const halfW = WORLD_WIDTH / 2;
    const halfD = WORLD_DEPTH / 2;
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            const ix = bx + dx + halfW;
            const iz = bz + dz + halfD;
            if (ix >= 0 && ix < WORLD_WIDTH && iz >= 0 && iz < WORLD_DEPTH) {
                const biome = biomeMap[ix + iz * WORLD_WIDTH];
                const color = BIOME_COLORS[biome] || [1,1,1];
                r += color[0]; g += color[1]; b += color[2];
                count++;
            }
        }
    }
    const result = count > 0 ? [r/count, g/count, b/count] : [1,1,1];
    _biomeTintCache.set(cacheKey, result);
    return result;
}

function pushFaceUnlit(x, y, z, face, positions, normals, uvs, colors, biomeTints, blockId, tint, val = 0) {
    const blockData = BLOCK_DATA[blockId];
    let texIndex = -1;
    let overlayTexIndex = -1;
    
    if (blockData) {
        if (typeof blockData.atlasIdx === 'object') {
            if (face.dir[1] === 1) texIndex = blockData.atlasIdx.top;
            else if (face.dir[1] === -1) texIndex = blockData.atlasIdx.bottom;
            else {
                const level = (val >> 8) & 0xF;
                const isLit = (val >> 12) & 0x1;
                const isFrontFace = (level === 1 && face.dir[0] === 1) || 
                                    (level === 3 && face.dir[0] === -1) || 
                                    (level === 0 && face.dir[2] === 1) || 
                                    (level === 2 && face.dir[2] === -1);
                
                if (isFrontFace && blockData.atlasIdx.front !== undefined) {
                    texIndex = (isLit && blockData.atlasIdx.frontLit !== undefined) ? blockData.atlasIdx.frontLit : blockData.atlasIdx.front;
                } else {
                    if (face.dir[0] !== 0 && blockData.atlasIdx.sideX !== undefined) texIndex = blockData.atlasIdx.sideX;
                    else if (face.dir[2] !== 0 && blockData.atlasIdx.sideZ !== undefined) texIndex = blockData.atlasIdx.sideZ;
                    else texIndex = blockData.atlasIdx.side;
                }
                
                if (blockData.atlasIdx.overlay !== undefined) overlayTexIndex = blockData.atlasIdx.overlay;
            }
        } else {
            texIndex = blockData.atlasIdx;
        }
    }

    if (!settingGraphicsFancy) {
        if (blockId === 14) texIndex = 29;
        else if (blockId === 22) texIndex = 30;
        else if (blockId === 43) texIndex = 47;
        else if (blockId === 97) texIndex = 126;
    }

    const c0 = face.corners[0], c1 = face.corners[1], c2 = face.corners[2], c3 = face.corners[3];
    const isPlant = blockId === 16 || blockId === 23 || blockId === 24 || blockId === 26 || blockId === 42 || blockId === 116 || blockId === 117 || blockId === 118 || blockId === 137;
    const isCactus = blockId === 20;
    const isTorch = blockId === 17; 

    const buildQuad = (tIndex, bTint, faceTint) => {
        let uScale = 1, vScale = 1, uOffset = 0, vOffset = 0;
        if (tIndex >= 0) {
            uScale = 1 / 16; vScale = 1 / 16;
            const gridX = tIndex % 16, gridY = Math.floor(tIndex / 16);
            uOffset = gridX * uScale; vOffset = 1.0 - (gridY * vScale) - vScale;
        } else if (tIndex === -1 || tIndex === -2) {
            uScale = 1.0; vScale = 1.0; uOffset = 0.0; vOffset = 0.0;
        }

        const getUV = (c) => {
            let u = c.uv[0], v = c.uv[1];
            if (isCactus) {
                u = u === 0 ? 0.0625 : 0.9375;
                if (face.dir[1] !== 0) v = v === 0 ? 0.0625 : 0.9375;
                else v = v === 0 ? 0.01 : 0.99;
            } else if (isTorch) {
                u = 0.4375 + u * 0.125;
                if (face.dir[1] === 1) v = 0.5 + v * 0.125;         
                else if (face.dir[1] === -1) v = v * 0.125;         
                else v = v * 0.625;                                 
            } else {
                u = u === 0 ? 0.01 : (u === 1 ? 0.99 : u);
                v = v === 0 ? 0.01 : (v === 1 ? 0.99 : v);
            }
            return [uOffset + u * uScale, vOffset + v * vScale];
        };
        const uv0 = getUV(c0), uv1 = getUV(c1), uv2 = getUV(c2), uv3 = getUV(c3);

        const getP = (pos) => {
            let px = pos[0], py = pos[1], pz = pos[2];
            if (isPlant) {
                px = 0.5 + (px - 0.5) * 0.8; py *= 0.8; pz = 0.5 + (pz - 0.5) * 0.8;
            } else if (isCactus) {
                px = 0.5 + (px - 0.5) * 0.875; pz = 0.5 + (pz - 0.5) * 0.875;
            } else if (isTorch) {
                px = 0.5 + (px - 0.5) * 0.125; py *= 0.625; pz = 0.5 + (pz - 0.5) * 0.125;
            }
            return [x + px, y + py, z + pz];
        };

        const p0 = getP(c0.pos), p1 = getP(c1.pos), p2 = getP(c2.pos), p3 = getP(c3.pos);
        
        const shade = (blockId === 17 || blockId === 27) ? 1.0 : faceTint[0]; 

        positions.push(p0[0], p0[1], p0[2],  p1[0], p1[1], p1[2],  p2[0], p2[1], p2[2]);
        uvs.push(uv0[0], uv0[1], uv1[0], uv1[1], uv2[0], uv2[1]);
        colors.push(1.0, 1.0, shade,  1.0, 1.0, shade,  1.0, 1.0, shade);
        if (biomeTints) biomeTints.push(bTint[0], bTint[1], bTint[2], bTint[0], bTint[1], bTint[2], bTint[0], bTint[1], bTint[2]);
        
        positions.push(p0[0], p0[1], p0[2],  p2[0], p2[1], p2[2],  p3[0], p3[1], p3[2]);
        uvs.push(uv0[0], uv0[1], uv2[0], uv2[1], uv3[0], uv3[1]);
        colors.push(1.0, 1.0, shade,  1.0, 1.0, shade,  1.0, 1.0, shade);
        if (biomeTints) biomeTints.push(bTint[0], bTint[1], bTint[2], bTint[0], bTint[1], bTint[2], bTint[0], bTint[1], bTint[2]);
        
        for(let i=0; i<6; i++) normals.push(face.dir[0], face.dir[1], face.dir[2]);
    };

    let baseTint = [1,1,1];
    if ([1, 14, 16, 22, 24, 43, 66, 67, 97].includes(blockId) && (blockId !== 1 || face.dir[1] === 1)) {
        baseTint = [0.55, 0.75, 0.4];
    }
    
    buildQuad(texIndex, baseTint, tint);

    if (overlayTexIndex >= 0) {
        buildQuad(overlayTexIndex, [0.55, 0.75, 0.4], tint);
    }
}

const _vlResult = { ao: 0, sun: 0, torch: 0 };

function getVertexLighting(bx, by, bz, nx, ny, nz, dx, dy, dz) {
    const cx = bx + nx, cy = by + ny, cz = bz + nz;

    let d1x = 0, d1y = 0, d1z = 0;
    let d2x = 0, d2y = 0, d2z = 0;

    if (nx !== 0) { d1y = dy; d2z = dz; }
    else if (ny !== 0) { d1x = dx; d2z = dz; }
    else { d1x = dx; d2y = dy; }

    const val0 = getVoxel(cx, cy, cz);
    const val1 = getVoxel(cx + d1x, cy + d1y, cz + d1z);
    const val2 = getVoxel(cx + d2x, cy + d2y, cz + d2z);
    const val3 = getVoxel(cx + dx, cy + dy, cz + dz);

    const id0 = val0 & 0xFF, id1 = val1 & 0xFF, id2 = val2 & 0xFF, id3 = val3 & 0xFF;
    const op0 = !isBlockTransparent(id0);
    const op1 = !isBlockTransparent(id1);
    const op2 = !isBlockTransparent(id2);
    const op3 = !isBlockTransparent(id3);

    let ao, sun, torch;

    if (op1 && op2) {
        ao = 3;
        if (op0) { sun = 0; torch = 0; }
        else { sun = (val0 >> 14) & 0xF; torch = (val0 >> 18) & 0xF; }
    } else {
        ao = (op1 ? 1 : 0) + (op2 ? 1 : 0) + (op3 ? 1 : 0);
        let valid = 1;
        if (op0) { sun = 0; torch = 0; }
        else { sun = (val0 >> 14) & 0xF; torch = (val0 >> 18) & 0xF; }
        if (!op1) { sun += (val1 >> 14) & 0xF; torch += (val1 >> 18) & 0xF; valid++; }
        if (!op2) { sun += (val2 >> 14) & 0xF; torch += (val2 >> 18) & 0xF; valid++; }
        if (!op3) { sun += (val3 >> 14) & 0xF; torch += (val3 >> 18) & 0xF; valid++; }
        sun /= valid; torch /= valid;
    }
    _vlResult.ao = ao; _vlResult.sun = sun; _vlResult.torch = torch;
    return _vlResult;
}

function pushFace(x, y, z, face, positions, normals, uvs, colors, biomeTints, blockId, heights = null, offset = null, val = 0) {
    const blockData = BLOCK_DATA[blockId];
    
    let texIndex = -1;
    let overlayTexIndex = -1;
    
    if (blockData) {
        if (typeof blockData.atlasIdx === 'object') {
            if (face.dir[1] === 1) texIndex = blockData.atlasIdx.top;
            else if (face.dir[1] === -1) texIndex = blockData.atlasIdx.bottom;
            else {
                const level = (val >> 8) & 0xF;
                const isLit = (val >> 12) & 0x1;
                const isFrontFace = (level === 1 && face.dir[0] === 1) || 
                                    (level === 3 && face.dir[0] === -1) || 
                                    (level === 0 && face.dir[2] === 1) || 
                                    (level === 2 && face.dir[2] === -1);
                
                if (isFrontFace && blockData.atlasIdx.front !== undefined) {
                    texIndex = (isLit && blockData.atlasIdx.frontLit !== undefined) ? blockData.atlasIdx.frontLit : blockData.atlasIdx.front;
                } else {
                    if (face.dir[0] !== 0 && blockData.atlasIdx.sideX !== undefined) texIndex = blockData.atlasIdx.sideX;
                    else if (face.dir[2] !== 0 && blockData.atlasIdx.sideZ !== undefined) texIndex = blockData.atlasIdx.sideZ;
                    else texIndex = blockData.atlasIdx.side;
                }
                
                if (blockData.atlasIdx.overlay !== undefined) overlayTexIndex = blockData.atlasIdx.overlay;
            }
        } else {
            texIndex = blockData.atlasIdx;
        }
    }

    if (!settingGraphicsFancy) {
        if (blockId === 14) texIndex = 29;
        else if (blockId === 22) texIndex = 30;
        else if (blockId === 43) texIndex = 47;
        else if (blockId === 97) texIndex = 126;
    }

    // Override texture index if a custom texture was provided (used by crop growth stages)
    if (offset && offset.customTex !== undefined) {
        texIndex = offset.customTex;
    }

    let tintColor = [1, 1, 1];
    let overlayColor = null;

    // Birch leaves (43) use a fixed classic colour — #80A755 — never biome-tinted
    const BIRCH_LEAF_TINT = [128/255, 167/255, 85/255];

    const isTintedPlant = blockId === 14 || blockId === 16 || blockId === 22 || blockId === 24 || blockId === 66 || blockId === 67 || blockId === 97;

    if (blockId === 43) {
        tintColor = BIRCH_LEAF_TINT;
    } else if (isTintedPlant) {
        tintColor = getSmoothedBiomeTint(x, z);
    } else if (blockId === 1 && face.dir[1] === 1) {
        tintColor = getSmoothedBiomeTint(x, z);
    }
    
    if (overlayTexIndex >= 0) {
        overlayColor = getSmoothedBiomeTint(x, z);
    }

    const c0 = face.corners[0], c1 = face.corners[1], c2 = face.corners[2], c3 = face.corners[3];
    
    for (let c of [c0, c1, c2, c3]) {
        let dx = 0, dy = 0, dz = 0;
        if (face.dir[0] === 0) dx = c.pos[0] * 2 - 1;
        if (face.dir[1] === 0) dy = c.pos[1] * 2 - 1;
        if (face.dir[2] === 0) dz = c.pos[2] * 2 - 1;

        let sunL, torchL, ao = 0;

        // Determine if this face is pushed inward (Farmland top)
        let isRecessed = (heights && face.dir[1] === 1 && heights.h00 < 1);
        
        // Add Crops (64) to the flat lighting group alongside cross blocks
        if (isCrossBlock(blockId) || blockId === 64 || blockId === 17 || blockId === 27) {
            sunL = getSunLight(x, y, z);
            torchL = getTorchLight(x, y, z);
            if (blockId === 17 || blockId === 27) torchL = 14; 
        } else if (!settingSmoothLighting) {
            // Fast Lighting: If recessed, sample our own block's light (0 offset) instead of the neighbor
            const nx = x + (isRecessed ? 0 : face.dir[0]);
            const ny = y + (isRecessed ? 0 : face.dir[1]);
            const nz = z + (isRecessed ? 0 : face.dir[2]);
            sunL = getSunLight(nx, ny, nz);
            torchL = getTorchLight(nx, ny, nz);
            ao = 0; 
        } else {
            // Smooth Lighting: Pass 0,0,0 as the normal if recessed so it calculates AO from the inside
            const lx = isRecessed ? 0 : face.dir[0];
            const ly = isRecessed ? 0 : face.dir[1];
            const lz = isRecessed ? 0 : face.dir[2];
            
            const lData = getVertexLighting(x, y, z, lx, ly, lz, dx, dy, dz);
            sunL = lData.sun;
            torchL = lData.torch;
            ao = lData.ao;
        }

        c.ao = ao;

        const sunStrength = sunL / 15.0;
        const torchStrength = torchL / 15.0;
        
        let shade = 1.0;
        if (!isCrossBlock(blockId) && blockId !== 17 && blockId !== 27) {
            if (face.dir[1] === 1) shade = 1.0;
            else if (face.dir[1] === -1) shade = 0.5;
            else if (face.dir[2] !== 0) shade = 0.8; 
            else shade = 0.6;                        
        }

        const shadeAO = shade * (1.0 - (ao * 0.25));
        c.color = [sunStrength * shadeAO, torchStrength * shadeAO, shadeAO];
    }
    
    const isPlant = blockId === 16 || blockId === 23 || blockId === 24 || blockId === 116 || blockId === 117 || blockId === 118;
    const isCactus = blockId === 20;
    const isTorch = blockId === 17; 

    const buildQuad = (tIndex, bColor, faceOffsetDist) => {
        let uScale = 1, vScale = 1, uOffset = 0, vOffset = 0;
        if (tIndex >= 0) {
            uScale = 1 / 16; vScale = 1 / 16;
            const gridX = tIndex % 16, gridY = Math.floor(tIndex / 16);
            uOffset = gridX * uScale; vOffset = 1.0 - (gridY * vScale) - vScale;
        } else if (tIndex === -1 || tIndex === -2) {
            uScale = 1.0; vScale = 1.0;
        } 

        const getP = (pos) => {
            let px = pos[0], py = pos[1], pz = pos[2];
            if (isPlant) { 
                px = 0.5 + (px - 0.5) * 0.8; py *= 0.8; pz = 0.5 + (pz - 0.5) * 0.8; 
            } 
            else if (isCactus) { 
                px = 0.5 + (px - 0.5) * 0.875; pz = 0.5 + (pz - 0.5) * 0.875; 
            } 
            else if (isTorch) { 
                px = 0.5 + (px - 0.5) * 0.125; py *= 0.625; pz = 0.5 + (pz - 0.5) * 0.125; 
                
                const torchLevel = offset ? (offset.torchLevel || 0) : 0;
                if (torchLevel > 0) {
                    let tx = px - 0.5, ty = py, tz = pz - 0.5;
                    const angle = 0.4;
                    const outOffset = 0.43; 
                    const upOffset = 0.22;  
                    if (torchLevel === 1) {
                        let rX = tx * Math.cos(-angle) - ty * Math.sin(-angle);
                        let rY = tx * Math.sin(-angle) + ty * Math.cos(-angle);
                        tx = rX - outOffset; ty = rY + upOffset;
                    } else if (torchLevel === 2) {
                        let rX = tx * Math.cos(angle) - ty * Math.sin(angle);
                        let rY = tx * Math.sin(angle) + ty * Math.cos(angle);
                        tx = rX + outOffset; ty = rY + upOffset;
                    } else if (torchLevel === 3) {
                        let rZ = tz * Math.cos(-angle) - ty * Math.sin(-angle);
                        let rY = tz * Math.sin(-angle) + ty * Math.cos(-angle);
                        tz = rZ - outOffset; ty = rY + upOffset;
                    } else if (torchLevel === 4) {
                        let rZ = tz * Math.cos(angle) - ty * Math.sin(angle);
                        let rY = tz * Math.sin(angle) + ty * Math.cos(angle);
                        tz = rZ + outOffset; ty = rY + upOffset;
                    }
                    px = tx + 0.5; py = ty; pz = tz + 0.5;
                }
            }
            return [px, py, pz];
        };

        const xPos = (pos) => {
            let p = getP(pos);
            let px = p[0], pz = p[2];
            if (offset && offset.rot !== undefined) {
                const cx = px - 0.5, cz = pz - 0.5;
                px = 0.5 + cx * Math.cos(offset.rot) - cz * Math.sin(offset.rot);
            }
            return x + px + (offset && offset.x !== undefined ? offset.x : 0) + (face.dir[0] * faceOffsetDist);
        };

        const yPos = (pos) => {
            let p = getP(pos);
            let py = p[1];
            
            let calcY = py;
            if (heights && pos[1] !== 0) {
                if (pos[0] === 0 && pos[2] === 0) calcY = heights.h00 * py;
                else if (pos[0] === 1 && pos[2] === 0) calcY = heights.h10 * py;
                else if (pos[0] === 0 && pos[2] === 1) calcY = heights.h01 * py;
                else if (pos[0] === 1 && pos[2] === 1) calcY = heights.h11 * py;
            }
            // NEW: Added support for offset.y so we can sink the crop into the block space
            return y + calcY + (offset && offset.y !== undefined ? offset.y : 0) + (face.dir[1] * faceOffsetDist);
        };

        const zPos = (pos) => {
            let p = getP(pos);
            let px = p[0], pz = p[2];
            if (offset && offset.rot !== undefined) {
                const cx = px - 0.5, cz = pz - 0.5;
                pz = 0.5 + cx * Math.sin(offset.rot) + cz * Math.cos(offset.rot);
            }
            return z + pz + (offset && offset.z !== undefined ? offset.z : 0) + (face.dir[2] * faceOffsetDist);
        };

        const getUV = (c) => {
            let u = c.uv[0], v = c.uv[1];
            const eps = 0.01;
            if (isCactus) {
                u = u === 0 ? 0.0625 : 0.9375;
                if (face.dir[1] !== 0) v = v === 0 ? 0.0625 : 0.9375;
            } else if (isTorch) {
                u = 0.4375 + u * 0.125;
                if (face.dir[1] === 1) v = 0.5 + v * 0.125;         
                else if (face.dir[1] === -1) v = v * 0.125;         
                else v = v * 0.625;                                 
            } else {
                u = u === 0 ? eps : (u === 1 ? 1 - eps : u);
            }

            let finalU = uOffset + u * uScale;
            let localV = v;

            if (face.dir[1] === 0 && !isTorch) { 
                if (c.pos[1] === 0) localV = 0;
                else if (!heights) localV = 1.0;
                else if (c.pos[0] === 0 && c.pos[2] === 0) localV = heights.h00;
                else if (c.pos[0] === 1 && c.pos[2] === 0) localV = heights.h10;
                else if (c.pos[0] === 0 && c.pos[2] === 1) localV = heights.h01;
                else if (c.pos[0] === 1 && c.pos[2] === 1) localV = heights.h11;
                else localV = 1.0; 
            }
            
            if (!(isCactus && face.dir[1] !== 0) && !isTorch) {
                if (localV <= 0) localV = eps;
                else if (localV >= 1) localV = 1 - eps;
            }
            
            return [finalU, vOffset + localV * vScale];
        };

        const uv0 = getUV(c0), uv1 = getUV(c1), uv2 = getUV(c2), uv3 = getUV(c3);
        const flipQuad = c0.ao + c2.ao > c1.ao + c3.ao;

        if (flipQuad) {
            positions.push(xPos(c0.pos), yPos(c0.pos), zPos(c0.pos),  xPos(c1.pos), yPos(c1.pos), zPos(c1.pos),  xPos(c3.pos), yPos(c3.pos), zPos(c3.pos));
            uvs.push(uv0[0], uv0[1],  uv1[0], uv1[1],  uv3[0], uv3[1]);
            colors.push(c0.color[0], c0.color[1], c0.color[2], c1.color[0], c1.color[1], c1.color[2], c3.color[0], c3.color[1], c3.color[2]);
            if (biomeTints) biomeTints.push(bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2]);
            
            positions.push(xPos(c1.pos), yPos(c1.pos), zPos(c1.pos),  xPos(c2.pos), yPos(c2.pos), zPos(c2.pos),  xPos(c3.pos), yPos(c3.pos), zPos(c3.pos));
            uvs.push(uv1[0], uv1[1],  uv2[0], uv2[1],  uv3[0], uv3[1]);
            colors.push(c1.color[0], c1.color[1], c1.color[2], c2.color[0], c2.color[1], c2.color[2], c3.color[0], c3.color[1], c3.color[2]);
            if (biomeTints) biomeTints.push(bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2]);
        } else {
            positions.push(xPos(c0.pos), yPos(c0.pos), zPos(c0.pos),  xPos(c1.pos), yPos(c1.pos), zPos(c1.pos),  xPos(c2.pos), yPos(c2.pos), zPos(c2.pos));
            uvs.push(uv0[0], uv0[1],  uv1[0], uv1[1],  uv2[0], uv2[1]);
            colors.push(c0.color[0], c0.color[1], c0.color[2], c1.color[0], c1.color[1], c1.color[2], c2.color[0], c2.color[1], c2.color[2]);
            if (biomeTints) biomeTints.push(bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2]);
            
            positions.push(xPos(c0.pos), yPos(c0.pos), zPos(c0.pos),  xPos(c2.pos), yPos(c2.pos), zPos(c2.pos),  xPos(c3.pos), yPos(c3.pos), zPos(c3.pos));
            uvs.push(uv0[0], uv0[1],  uv2[0], uv2[1],  uv3[0], uv3[1]);
            colors.push(c0.color[0], c0.color[1], c0.color[2], c2.color[0], c2.color[1], c2.color[2], c3.color[0], c3.color[1], c3.color[2]);
            if (biomeTints) biomeTints.push(bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2], bColor[0], bColor[1], bColor[2]);
        }
        
        for(let i=0; i<6; i++) {
            if (offset && offset.rot !== undefined && face.dir[1] === 0) {
                const nx = face.dir[0] * Math.cos(offset.rot) - face.dir[2] * Math.sin(offset.rot);
                const nz = face.dir[0] * Math.sin(offset.rot) + face.dir[2] * Math.cos(offset.rot);
                normals.push(nx, face.dir[1], nz);
            } else {
                normals.push(face.dir[0], face.dir[1], face.dir[2]);
            }
        }
    };

    buildQuad(texIndex, tintColor, 0);

    if (overlayTexIndex >= 0) {
        buildQuad(overlayTexIndex, overlayColor, 0); 
    }
}
