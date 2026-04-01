// ==========================================
// CHUNK MESH BUILDER
// ==========================================

function buildChunkMesh(cx, cz) {
    // Clear per-chunk biome tint cache for fresh data
    _biomeTintCache.clear();
    _biomeFoliageTintCache.clear();

    const firePositions = [], fireNormals = [], fireUvs = [], fireColors = [], fireBiomeTints = [];
    const portalPositions = [], portalNormals = [], portalUvs = [], portalColors = [], portalBiomeTints = [];
    const solidPositions = [], solidNormals = [], solidUvs = [], solidColors = [], solidBiomeTints = [];
    const glassPositions = [], glassNormals = [], glassUvs = [], glassColors = [], glassBiomeTints = [];
    const waterPositions = [], waterNormals = [], waterUvs = [], waterColors = [], waterFluidTypes = [], waterFlowDirs = [];
    const lavaPositions = [], lavaNormals = [], lavaUvs = [], lavaColors = [], lavaFluidTypes = [], lavaFlowDirs = [];

    const startX = cx * CHUNK_SIZE, startZ = cz * CHUNK_SIZE;

    const ix0 = startX + _halfW;
    const iz0 = startZ + _halfD;
    const ccx = ix0 >> 4, ccz = iz0 >> 4;
    const localChunk = _getChunkFast(ccx, ccz);
    if (!localChunk) return; 

    const nxp = _getChunkFast(ccx + 1, ccz);
    const nxn = _getChunkFast(ccx - 1, ccz);
    const nzp = _getChunkFast(ccx, ccz + 1);
    const nzn = _getChunkFast(ccx, ccz - 1);
    const nxpzp = _getChunkFast(ccx + 1, ccz + 1);
    const nxpzn = _getChunkFast(ccx + 1, ccz - 1);
    const nxnzp = _getChunkFast(ccx - 1, ccz + 1);
    const nxnzn = _getChunkFast(ccx - 1, ccz - 1);

    const getLocal = (lx, y, lz) => {
        if ((y >>> 0) >= WORLD_HEIGHT) return 0;
        let chunk, rx, rz;
        if (lx >= 0 && lx < 16) {
            if (lz >= 0 && lz < 16) { chunk = localChunk; rx = lx; rz = lz; }
            else if (lz >= 16) { chunk = nzp; rx = lx; rz = lz & 15; }
            else { chunk = nzn; rx = lx; rz = (lz + 16) & 15; }
        } else if (lx >= 16) {
            if (lz >= 0 && lz < 16) { chunk = nxp; rx = lx & 15; rz = lz; }
            else if (lz >= 16) { chunk = nxpzp; rx = lx & 15; rz = lz & 15; }
            else { chunk = nxpzn; rx = lx & 15; rz = (lz + 16) & 15; }
        } else { 
            if (lz >= 0 && lz < 16) { chunk = nxn; rx = (lx + 16) & 15; rz = lz; }
            else if (lz >= 16) { chunk = nxnzp; rx = (lx + 16) & 15; rz = lz & 15; }
            else { chunk = nxnzn; rx = (lx + 16) & 15; rz = (lz + 16) & 15; }
        }
        if (!chunk) return 0;
        return chunk[rx + (y << 4) + (rz << 12)]; 
    };

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = startX + lx;
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            const z = startZ + lz;
            for (let y = 0; y < WORLD_HEIGHT; y++) {
                const val = localChunk[lx + (y << 4) + (lz << 12)]; 
                const id = val & 0xFF;
                
                if (id === 0) continue; 

                // --- SLAB RENDERING ---
                if (isSlabBlock(id)) {
                    const isTop = (val >> 8) & 0x1;
                    // Slab: render as a standard block with height clamped to 0.5
                    // Use heights to squish the block to half height
                    const h = 0.5;
                    const slabHeights = { h00: h, h10: h, h01: h, h11: h };
                    const slabOff = isTop ? { y: 0.5, vShift: 0.5 } : null;
                    
                    for (let face of blockFaces) {
                        const nVal = getLocal(lx + face.dir[0], y + face.dir[1], lz + face.dir[2]);
                        const nId = nVal & 0xFF;
                        let draw = false;
                        
                        if (face.dir[1] === 1) {
                            if (!isTop) draw = true; // bottom slab top face always visible
                            else if (nId === 0 || isBlockTransparent(nId)) draw = true;
                        } else if (face.dir[1] === -1) {
                            if (isTop) draw = true; // top slab bottom face always visible
                            else if (nId === 0 || isBlockTransparent(nId)) draw = true;
                        } else {
                            if (nId === 0 || isBlockTransparent(nId)) draw = true;
                            if (isSlabBlock(nId) && ((nVal >> 8) & 0x1) === isTop) draw = false;
                        }
                        
                        if (draw) {
                            // All faces use slabHeights so sides are half-height and top/bottom are at correct Y
                            pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, slabHeights, slabOff, val);
                        }
                    }
                    continue;
                }

                // --- CHEST & LOOT CHEST & DOUBLE CHEST RENDERING ---
                if (id === 69 || id === 93) {
                    const dir = (val >> 8) & 0xF; // Use 0xF to exactly match the engine's 'level' extraction
                    
                    const isChest = (dx, dz) => {
                        const v = getVoxel(x + dx, y, z + dz);
                        const nid = v & 0xFF;
                        return (nid === 69 || nid === 93) && ((v >> 8) & 0xF) === dir;
                    };

                    // Define Left and Right faces based on the direction the chest is facing
                    let leftFaceDir = [0, 0, 0];
                    let rightFaceDir = [0, 0, 0];

                    if (dir === 0) { leftFaceDir = [-1, 0, 0]; rightFaceDir = [1, 0, 0]; }      // Front is +Z (South)
                    else if (dir === 1) { leftFaceDir = [0, 0, 1]; rightFaceDir = [0, 0, -1]; } // Front is +X (East)
                    else if (dir === 2) { leftFaceDir = [1, 0, 0]; rightFaceDir = [-1, 0, 0]; } // Front is -Z (North)
                    else if (dir === 3) { leftFaceDir = [0, 0, -1]; rightFaceDir = [0, 0, 1]; } // Front is -X (West)

                    const neighborLeft = isChest(leftFaceDir[0], leftFaceDir[2]);
                    const neighborRight = isChest(rightFaceDir[0], rightFaceDir[2]);

                    for (let face of blockFaces) {
                        // 1. Cull the inner connecting faces between the chests
                        if (neighborLeft && face.dir[0] === leftFaceDir[0] && face.dir[2] === leftFaceDir[2]) continue;
                        if (neighborRight && face.dir[0] === rightFaceDir[0] && face.dir[2] === rightFaceDir[2]) continue;

                        // 2. Standard block culling against solid walls
                        const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
                        const nId = getVoxel(nx, ny, nz) & 0xFF;
                        if (nId !== 0 && !isBlockTransparent(nId)) continue;

                        // 3. Identify the front face using the EXACT same logic as pushFace()
                        const isFrontFace = (dir === 1 && face.dir[0] === 1) || 
                                            (dir === 3 && face.dir[0] === -1) || 
                                            (dir === 0 && face.dir[2] === 1) || 
                                            (dir === 2 && face.dir[2] === -1);

                        // 4. Swap the texture IF it is the front face of a double chest!
                        let customOffset = null;
                        if (isFrontFace) {
                            if (neighborRight) customOffset = { customTex: 109 }; // I am the left visual half
                            else if (neighborLeft) customOffset = { customTex: 110 }; // I am the right visual half
                        }
                        
                        pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, customOffset, val);
                    }
                    continue;
                }

                // --- STAIR RENDERING (direct quad emission) ---
                if (isStairBlock(id)) {
                    const sd = (val >> 8) & 0x3;
                    const texIdx = typeof BLOCK_DATA[id].atlasIdx === 'object' ? BLOCK_DATA[id].atlasIdx.side : BLOCK_DATA[id].atlasIdx;
                    const gx = texIdx % 16, gy = Math.floor(texIdx / 16);
                    const e = 0.01;
                    const u0 = (gx + e) / 16, u1 = (gx + 1 - e) / 16;
                    const um = (gx + 0.5) / 16;
                    const v0 = 1 - (gy + 1 - e) / 16, v1 = 1 - (gy + e) / 16;
                    const vm = 1 - (gy + 0.5) / 16;
                    
                    const nt=(dx,dy,dz)=>{const n=getVoxel(x+dx,y+dy,z+dz)&0xFF;return n===0||isBlockTransparent(n);};
                    
                    const Q=(ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz,a,b,c,d,n)=>{
                        // Check if this face is on the outer bounding box of the voxel
                        const isExt = (n[0]===1 && ax===x+1) || (n[0]===-1 && ax===x) || 
                                      (n[1]===1 && ay===y+1) || (n[1]===-1 && ay===y) || 
                                      (n[2]===1 && az===z+1) || (n[2]===-1 && az===z);
                        
                        // External faces sample from neighbor; internal faces (step tops, inner walls)
                        // sample from the stair block itself since it has open air space
                        const lx = isExt ? n[0] : 0;
                        const ly = isExt ? n[1] : 0;
                        const lz = isExt ? n[2] : 0;
                        
                        // For internal upward faces, sample from above (y+1) since stair block
                        // itself may have 0 light stored
                        let sampleX = x+lx, sampleY = y+ly, sampleZ = z+lz;
                        if (!isExt && n[1] === 1) { sampleY = y + 1; }
                        
                        let sh = 1.0;
                        if (n[1] === -1) sh = 0.5;
                        else if (Math.abs(n[0]) === 1) sh = 0.8;
                        else if (Math.abs(n[2]) === 1) sh = 0.6;
                        
                        const sl = getSunLight(sampleX, sampleY, sampleZ) / 15.0;
                        const tl = getTorchLight(sampleX, sampleY, sampleZ) / 15.0;
                        
                        solidPositions.push(ax,ay,az,bx,by,bz,cx,cy,cz,ax,ay,az,cx,cy,cz,dx,dy,dz);
                        solidUvs.push(a[0],a[1],b[0],b[1],c[0],c[1],a[0],a[1],c[0],c[1],d[0],d[1]);
                        for(let i=0;i<6;i++){
                            solidColors.push(sl*sh, tl*sh, sh);
                            solidBiomeTints.push(1, 1, 1);
                            solidNormals.push(n[0],n[1],n[2]);
                        }
                    };
                    
                    const X=x,Y=y,Z=z,H=y+.5,X1=x+1,Y1=y+1,Z1=z+1,XH=x+.5,ZH=z+.5;

                    if(sd===0){// South: back=+Z, front=-Z
                      if(nt(0,-1,0))Q(X,Y,Z1,X,Y,Z,X1,Y,Z,X1,Y,Z1,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[0,-1,0]);
                      if(nt(0,1,0))Q(X,Y1,ZH,X,Y1,Z1,X1,Y1,Z1,X1,Y1,ZH,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,1,0]);
                      Q(X,H,Z,X,H,ZH,X1,H,ZH,X1,H,Z,[u0,v1],[u0,vm],[u1,vm],[u1,v1],[0,1,0]); 
                      Q(X1,Y1,ZH,X1,H,ZH,X,H,ZH,X,Y1,ZH,[u0,v1],[u0,vm],[u1,vm],[u1,v1],[0,0,-1]);
                      if(nt(0,0,1))Q(X,Y1,Z1,X,Y,Z1,X1,Y,Z1,X1,Y1,Z1,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[0,0,1]); 
                      if(nt(0,0,-1))Q(X1,H,Z,X1,Y,Z,X,Y,Z,X,H,Z,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,0,-1]);
                      if(nt(-1,0,0)){
                          Q(X,H,Z,X,Y,Z,X,Y,Z1,X,H,Z1,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[-1,0,0]); 
                          Q(X,Y1,ZH,X,H,ZH,X,H,Z1,X,Y1,Z1,[um,v1],[um,vm],[u1,vm],[u1,v1],[-1,0,0]); 
                      }
                      if(nt(1,0,0)){
                          Q(X1,H,Z1,X1,Y,Z1,X1,Y,Z,X1,H,Z,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[1,0,0]); 
                          Q(X1,Y1,Z1,X1,H,Z1,X1,H,ZH,X1,Y1,ZH,[u0,v1],[u0,vm],[um,vm],[um,v1],[1,0,0]); 
                      }
                    }else if(sd===1){// North: back=-Z, front=+Z
                      if(nt(0,-1,0))Q(X,Y,Z1,X,Y,Z,X1,Y,Z,X1,Y,Z1,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[0,-1,0]);
                      if(nt(0,1,0))Q(X,Y1,Z,X,Y1,ZH,X1,Y1,ZH,X1,Y1,Z,[u0,v1],[u0,vm],[u1,vm],[u1,v1],[0,1,0]); 
                      Q(X,H,ZH,X,H,Z1,X1,H,Z1,X1,H,ZH,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,1,0]); 
                      Q(X,Y1,ZH,X,H,ZH,X1,H,ZH,X1,Y1,ZH,[u0,v1],[u0,vm],[u1,vm],[u1,v1],[0,0,1]); 
                      if(nt(0,0,-1))Q(X1,Y1,Z,X1,Y,Z,X,Y,Z,X,Y1,Z,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[0,0,-1]); 
                      if(nt(0,0,1))Q(X,H,Z1,X,Y,Z1,X1,Y,Z1,X1,H,Z1,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,0,1]); 
                      if(nt(-1,0,0)){
                          Q(X,H,Z,X,Y,Z,X,Y,Z1,X,H,Z1,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[-1,0,0]); 
                          Q(X,Y1,Z,X,H,Z,X,H,ZH,X,Y1,ZH,[u0,v1],[u0,vm],[um,vm],[um,v1],[-1,0,0]); 
                      }
                      if(nt(1,0,0)){
                          Q(X1,H,Z1,X1,Y,Z1,X1,Y,Z,X1,H,Z,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[1,0,0]); 
                          Q(X1,Y1,ZH,X1,H,ZH,X1,H,Z,X1,Y1,Z,[um,v1],[um,vm],[u1,vm],[u1,v1],[1,0,0]); 
                      }
                    }else if(sd===2){// East: back=+X, front=-X
                      if(nt(0,-1,0))Q(X,Y,Z1,X,Y,Z,X1,Y,Z,X1,Y,Z1,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[0,-1,0]);
                      if(nt(0,1,0))Q(XH,Y1,Z,XH,Y1,Z1,X1,Y1,Z1,X1,Y1,Z,[um,v1],[um,v0],[u1,v0],[u1,v1],[0,1,0]); 
                      Q(X,H,Z,X,H,Z1,XH,H,Z1,XH,H,Z,[u0,v1],[u0,v0],[um,v0],[um,v1],[0,1,0]); 
                      Q(XH,Y1,Z,XH,H,Z,XH,H,Z1,XH,Y1,Z1,[u0,v1],[u0,vm],[u1,vm],[u1,v1],[-1,0,0]); 
                      if(nt(1,0,0))Q(X1,Y1,Z1,X1,Y,Z1,X1,Y,Z,X1,Y1,Z,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[1,0,0]); 
                      if(nt(-1,0,0))Q(X,H,Z,X,Y,Z,X,Y,Z1,X,H,Z1,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[-1,0,0]); 
                      if(nt(0,0,-1)){
                          Q(X1,H,Z,X1,Y,Z,X,Y,Z,X,H,Z,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,0,-1]); 
                          Q(X1,Y1,Z,X1,H,Z,XH,H,Z,XH,Y1,Z,[u0,v1],[u0,vm],[um,vm],[um,v1],[0,0,-1]); 
                      }
                      if(nt(0,0,1)){
                          Q(X,H,Z1,X,Y,Z1,X1,Y,Z1,X1,H,Z1,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,0,1]); 
                          Q(XH,Y1,Z1,XH,H,Z1,X1,H,Z1,X1,Y1,Z1,[um,v1],[um,vm],[u1,vm],[u1,v1],[0,0,1]); 
                      }
                    }else{// West: back=-X, front=+X
                      if(nt(0,-1,0))Q(X,Y,Z1,X,Y,Z,X1,Y,Z,X1,Y,Z1,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[0,-1,0]);
                      if(nt(0,1,0))Q(X,Y1,Z,X,Y1,Z1,XH,Y1,Z1,XH,Y1,Z,[u0,v1],[u0,v0],[um,v0],[um,v1],[0,1,0]); 
                      Q(XH,H,Z,XH,H,Z1,X1,H,Z1,X1,H,Z,[um,v1],[um,v0],[u1,v0],[u1,v1],[0,1,0]); 
                      Q(XH,Y1,Z1,XH,H,Z1,XH,H,Z,XH,Y1,Z,[u0,v1],[u0,vm],[u1,vm],[u1,v1],[1,0,0]); 
                      if(nt(-1,0,0))Q(X,Y1,Z,X,Y,Z,X,Y,Z1,X,Y1,Z1,[u0,v1],[u0,v0],[u1,v0],[u1,v1],[-1,0,0]); 
                      if(nt(1,0,0))Q(X1,H,Z1,X1,Y,Z1,X1,Y,Z,X1,H,Z,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[1,0,0]); 
                      if(nt(0,0,-1)){
                          Q(X1,H,Z,X1,Y,Z,X,Y,Z,X,H,Z,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,0,-1]); 
                          Q(XH,Y1,Z,XH,H,Z,X,H,Z,X,Y1,Z,[um,v1],[um,vm],[u1,vm],[u1,v1],[0,0,-1]); 
                      }
                      if(nt(0,0,1)){
                          Q(X,H,Z1,X,Y,Z1,X1,Y,Z1,X1,H,Z1,[u0,vm],[u0,v0],[u1,v0],[u1,vm],[0,0,1]); 
                          Q(X,Y1,Z1,X,H,Z1,XH,H,Z1,XH,Y1,Z1,[u0,v1],[u0,vm],[um,vm],[um,v1],[0,0,1]); 
                      }
                    }
                    continue;
                }

                // --- FARMLAND HEIGHT ---
                if (id === 62 || id === 63) {
                    const farmHeights = { h00: 0.9375, h10: 0.9375, h01: 0.9375, h11: 0.9375 };
                    for (let face of blockFaces) {
                        pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, farmHeights, null, val);
                    }
                    continue;
                }

                // --- ENCHANTING TABLE HEIGHT (12/16 = 0.75) ---
                if (id === 201) {
                    const enchantHeights = { h00: 0.75, h10: 0.75, h01: 0.75, h11: 0.75 };
                    for (let face of blockFaces) {
                        pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, enchantHeights, null, val);
                    }
                    continue;
                }

                // NEW: Render Wheat Crops using the square crop geometry and growth stage textures
                if (id === 64) {
                    const stage = (val >> 8) & 0x7; // Bits 8-10 (values 0-7)
                    const cropTex = 91 + stage;     // Index 91 to 98
                    for (let cFace of cropFaces) {
                        // Apply a -0.0625 Y offset so the crop sits flush on the 15/16ths farmland
                        pushFace(x, y, z, cFace, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, { x: 0, y: -0.0625, z: 0, rot: 0, customTex: cropTex }, val);
                    }
                    continue;
                }

                // --- UPDATED: FIRE RENDERING (ID 89) ---
                if (id === 89) {
                    const dir = (val >> 9) & 0x7;
                    // Passing { customTex: -1 } tells pushFace NOT to scale UVs to a 1/16 tile
                    const fireOffset = { customTex: -1 };
                    
                    if (dir === 0) {
                        for (let f of fireFacesFull) {
                            pushFace(x, y, z, f, firePositions, fireNormals, fireUvs, fireColors, fireBiomeTints, id, null, fireOffset, val);
                        }
                    } else {
                        const faces = vineFaces[dir];
                        if (faces) {
                            for (let f of faces) {
                                pushFace(x, y, z, f, firePositions, fireNormals, fireUvs, fireColors, fireBiomeTints, id, null, fireOffset, val);
                            }
                        }
                    }
                    continue; 
                }

                // --- NETHER PORTAL RENDERING (ID 90) ---
                // Renders as a thin block (2px / 0.125 wide) like glass panes — all 6 faces
                if (id === 90) {
                    const portalDir = (val >> 8) & 0x1;
                    const portalOffset = { customTex: -1 };

                    // Thin portal faces: 4 pixels wide (0.25 blocks) centered
                    const tMin = 0.375, tMax = 0.625;

                    let portalFaces;
                    if (portalDir === 0) {
                        // Thin along Z axis
                        portalFaces = [
                            // Front/back (Z-facing, full width+height)
                            { dir: [0,0, 1], corners: [{pos:[0,1,tMax],uv:[0,1]},{pos:[0,0,tMax],uv:[0,0]},{pos:[1,0,tMax],uv:[1,0]},{pos:[1,1,tMax],uv:[1,1]}] },
                            { dir: [0,0,-1], corners: [{pos:[1,1,tMin],uv:[0,1]},{pos:[1,0,tMin],uv:[0,0]},{pos:[0,0,tMin],uv:[1,0]},{pos:[0,1,tMin],uv:[1,1]}] },
                            // Top/bottom (thin strip)
                            { dir: [0, 1,0], corners: [{pos:[0,1,tMin],uv:[0,1]},{pos:[0,1,tMax],uv:[0,0]},{pos:[1,1,tMax],uv:[1,0]},{pos:[1,1,tMin],uv:[1,1]}] },
                            { dir: [0,-1,0], corners: [{pos:[0,0,tMax],uv:[0,1]},{pos:[0,0,tMin],uv:[0,0]},{pos:[1,0,tMin],uv:[1,0]},{pos:[1,0,tMax],uv:[1,1]}] },
                            // Left/right edges (thin strip)
                            { dir: [ 1,0,0], corners: [{pos:[1,1,tMax],uv:[0,1]},{pos:[1,0,tMax],uv:[0,0]},{pos:[1,0,tMin],uv:[1,0]},{pos:[1,1,tMin],uv:[1,1]}] },
                            { dir: [-1,0,0], corners: [{pos:[0,1,tMin],uv:[0,1]},{pos:[0,0,tMin],uv:[0,0]},{pos:[0,0,tMax],uv:[1,0]},{pos:[0,1,tMax],uv:[1,1]}] }
                        ];
                    } else {
                        // Thin along X axis
                        portalFaces = [
                            // Front/back (X-facing, full depth+height)
                            { dir: [ 1,0,0], corners: [{pos:[tMax,1,1],uv:[0,1]},{pos:[tMax,0,1],uv:[0,0]},{pos:[tMax,0,0],uv:[1,0]},{pos:[tMax,1,0],uv:[1,1]}] },
                            { dir: [-1,0,0], corners: [{pos:[tMin,1,0],uv:[0,1]},{pos:[tMin,0,0],uv:[0,0]},{pos:[tMin,0,1],uv:[1,0]},{pos:[tMin,1,1],uv:[1,1]}] },
                            // Top/bottom
                            { dir: [0, 1,0], corners: [{pos:[tMin,1,0],uv:[0,1]},{pos:[tMin,1,1],uv:[0,0]},{pos:[tMax,1,1],uv:[1,0]},{pos:[tMax,1,0],uv:[1,1]}] },
                            { dir: [0,-1,0], corners: [{pos:[tMin,0,1],uv:[0,1]},{pos:[tMin,0,0],uv:[0,0]},{pos:[tMax,0,0],uv:[1,0]},{pos:[tMax,0,1],uv:[1,1]}] },
                            // Left/right edges
                            { dir: [0,0, 1], corners: [{pos:[tMin,1,1],uv:[0,1]},{pos:[tMin,0,1],uv:[0,0]},{pos:[tMax,0,1],uv:[1,0]},{pos:[tMax,1,1],uv:[1,1]}] },
                            { dir: [0,0,-1], corners: [{pos:[tMax,1,0],uv:[0,1]},{pos:[tMax,0,0],uv:[0,0]},{pos:[tMin,0,0],uv:[1,0]},{pos:[tMin,1,0],uv:[1,1]}] }
                        ];
                    }

                    for (let f of portalFaces) {
                        // Cull faces against solid neighbors
                        const nx = x + f.dir[0], ny = y + f.dir[1], nz = z + f.dir[2];
                        const nId = getVoxel(nx, ny, nz) & 0xFF;
                        // Don't cull between adjacent portal blocks
                        if (nId === 90) continue;
                        // Don't render face if neighbor is solid opaque
                        if (nId !== 0 && !isBlockTransparent(nId)) continue;
                        pushFace(x, y, z, f, portalPositions, portalNormals, portalUvs, portalColors, portalBiomeTints, id, null, portalOffset, val);
                    }
                    continue;
                }

                // Standard Cross Block Rendering (Skipping Fire)
                if (isCrossBlock(id) && id !== 89) { 
                    let offset = null;
                    if (id !== 17 && id !== 52 && id !== 116 && id !== 117 && id !== 118) { 
                        const hash1 = getBlockHash(x, y, z);
                        const hash2 = getBlockHash(x + 1, y, z);
                        offset = { x: (hash1 * 2 - 1) * 0.25, z: (hash2 * 2 - 1) * 0.25, rot: hash1 * Math.PI };
                    }
                    for (let cFace of crossFaces) { pushFace(x, y, z, cFace, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, offset, val); }
                    continue;
                }

                // --- VINE RENDERING: wall-attached 2D plane ---
                if (id === 66) {
                    const vineDir = (val >> 8) & 0xF;
                    const faces = vineFaces[vineDir];
                    if (faces) {
                        for (let vf of faces) {
                            pushFace(x, y, z, vf, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, null, val);
                        }
                    }
                    continue;
                }

                // --- GLASS PANE / IRON BARS RENDERING (ID 68, 158) ---
                if (id === 68 || id === 158) {
                    const texIdx = typeof BLOCK_DATA[id].atlasIdx === 'object' ? BLOCK_DATA[id].atlasIdx.side : BLOCK_DATA[id].atlasIdx;
                    const TX = texIdx % 16, TY = Math.floor(texIdx / 16);
                    const U = (px) => (TX + px/16) / 16;
                    const Vp = (py) => 1 - (TY + py/16) / 16;
                    
                    const sl = getSunLight(x, y, z) / 15.0;
                    const tl = getTorchLight(x, y, z) / 15.0;
                    
                    // Single-sided quad only (glass panes should not show inner faces)
                    const PQ = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                                au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
                        let sh = 1.0;
                        if (ny === -1) sh = 0.5;
                        else if (nx !== 0) sh = 0.8;
                        else if (nz !== 0) sh = 0.6;
                        solidPositions.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
                        solidUvs.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
                        for(let i=0;i<6;i++){ solidColors.push(sl*sh,tl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(nx,ny,nz); }
                    };
                    // Double-sided for edges/caps (Fixed winding order)
                    const PQ2 = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                                au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
                        PQ(ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz, au,av, bu,bv, cu,cv, du,dv, nx,ny,nz);
                        // FIXED: Reordered to A, D, C, B for proper CCW backside triangles
                        PQ(ax,ay,az, dx,dy,dz, cx,cy,cz, bx,by,bz, au,av, du,dv, cu,cv, bu,bv, -nx,-ny,-nz);
                    };
                    
                    const T0 = 7/16, T1 = 9/16;
                    
                    // FIXED: Reusable function to filter out non-solid blocks (torches, grass, etc)
                    const canConnect = (nx, nz) => {
                        const nId = getVoxel(nx, y, nz) & 0xFF;
                        if (nId === 0 || isFluidBlock(nId) || isCrossBlock(nId) || nId === 17 || nId === 40 || nId === 66 || nId === 67) return false;
                        return true;
                    };
                    
                    const hasXN = canConnect(x-1, z);
                    const hasXP = canConnect(x+1, z);
                    const hasZN = canConnect(x, z-1);
                    const hasZP = canConnect(x, z+1);
                    
                    const hasX = hasXN || hasXP;
                    const hasZ = hasZN || hasZP;
                    const drawX = hasX || (!hasX && !hasZ);
                    const drawZ = hasZ;
                    
                    const fu0=U(0), fu1=U(16), fv0=Vp(16), fv1=Vp(0);
                    
                    // X-aligned segment (thin along Z)
                    if (drawX) {
                        const sx = hasXN ? x : x + T0;
                        const ex = hasXP ? x + 1 : x + T1;
                        const spx = hasXN ? 0 : 7;
                        const epx = hasXP ? 16 : 9;
                        
                        // Front face (+Z) - single sided outward
                        PQ(sx,y+1,T1+z, sx,y,T1+z, ex,y,T1+z, ex,y+1,T1+z,
                           U(spx),fv1, U(spx),fv0, U(epx),fv0, U(epx),fv1, 0,0,1);
                        // Back face (-Z) - single sided outward
                        PQ(ex,y+1,T0+z, ex,y,T0+z, sx,y,T0+z, sx,y+1,T0+z,
                           U(epx),fv1, U(epx),fv0, U(spx),fv0, U(spx),fv1, 0,0,-1);
                        // End caps
                        if (!hasXN) PQ2(sx,y+1,T0+z, sx,y,T0+z, sx,y,T1+z, sx,y+1,T1+z,
                                       U(7),fv1, U(7),fv0, U(9),fv0, U(9),fv1, -1,0,0);
                        if (!hasXP) PQ2(ex,y+1,T1+z, ex,y,T1+z, ex,y,T0+z, ex,y+1,T0+z,
                                       U(7),fv1, U(7),fv0, U(9),fv0, U(9),fv1, 1,0,0);
                    }
                    
                    // Z-aligned segment (thin along X)
                    if (drawZ) {
                        const sz = hasZN ? z : z + T0;
                        const ez = hasZP ? z + 1 : z + T1;
                        const spz = hasZN ? 0 : 7;
                        const epz = hasZP ? 16 : 9;
                        
                        // Front face (+X) - FIXED: Swapped sz/ez order for proper CCW winding
                        PQ(T1+x,y+1,ez, T1+x,y,ez, T1+x,y,sz, T1+x,y+1,sz,
                           U(epz),fv1, U(epz),fv0, U(spz),fv0, U(spz),fv1, 1,0,0);
                           
                        // Back face (-X) - FIXED: Swapped sz/ez order for proper CCW winding
                        PQ(T0+x,y+1,sz, T0+x,y,sz, T0+x,y,ez, T0+x,y+1,ez,
                           U(spz),fv1, U(spz),fv0, U(epz),fv0, U(epz),fv1, -1,0,0);
                           
                        // End caps
                        if (!hasZN) PQ2(T1+x,y+1,sz, T1+x,y,sz, T0+x,y,sz, T0+x,y+1,sz,
                                       U(7),fv1, U(7),fv0, U(9),fv0, U(9),fv1, 0,0,-1);
                        if (!hasZP) PQ2(T0+x,y+1,ez, T0+x,y,ez, T1+x,y,ez, T1+x,y+1,ez,
                                       U(7),fv1, U(7),fv0, U(9),fv0, U(9),fv1, 0,0,1);
                    }
                    
                    // Corner edge strips: where X and Z segments meet, add vertical border faces
                    // These use the edge 8px (pixels 0-7) of the texture for a border look
                    if (drawX && drawZ) {
                        const eu0c=U(0), eu1c=U(2);
                        // At the center post, draw 4 small vertical edge strips
                        // +X edge of Z-segment meeting X-segment
                        PQ2(x+T1,y+1,z+T0, x+T1,y,z+T0, x+T1,y,z+T1, x+T1,y+1,z+T1,
                           eu0c,fv1, eu0c,fv0, eu1c,fv0, eu1c,fv1, 1,0,0);
                        // -X edge
                        PQ2(x+T0,y+1,z+T1, x+T0,y,z+T1, x+T0,y,z+T0, x+T0,y+1,z+T0,
                           eu0c,fv1, eu0c,fv0, eu1c,fv0, eu1c,fv1, -1,0,0);
                        // +Z edge of X-segment meeting Z-segment  
                        PQ2(x+T0,y+1,z+T1, x+T0,y,z+T1, x+T1,y,z+T1, x+T1,y+1,z+T1,
                           eu0c,fv1, eu0c,fv0, eu1c,fv0, eu1c,fv1, 0,0,1);
                        // -Z edge
                        PQ2(x+T1,y+1,z+T0, x+T1,y,z+T0, x+T0,y,z+T0, x+T0,y+1,z+T0,
                           eu0c,fv1, eu0c,fv0, eu1c,fv0, eu1c,fv1, 0,0,-1);
                    }
                    
                    continue;
                }

                // --- DOOR RENDERING (ID 149) ---
                if (id === 149) {
                    const dir = (val >> 8) & 0x3;
                    const isOpen = (val >> 10) & 0x1;
                    const isTopHalf = (val >> 11) & 0x1;
                    const hinge = (val >> 12) & 0x1;
                    
                    // Front face texture (faces the player who placed the door)
                    const frontTexIdx = isTopHalf ? BLOCK_DATA[149].atlasIdx.top : BLOCK_DATA[149].atlasIdx.bottom;
                    const fTX = frontTexIdx % 16, fTY = Math.floor(frontTexIdx / 16);
                    const FU = (px) => (fTX + px/16) / 16;
                    const FV = (py) => 1 - (fTY + py/16) / 16;
                    
                    // Back face texture (dedicated pre-flipped backside texture)
                    const backTexIdx = isTopHalf ? BLOCK_DATA[149].atlasIdx.backTop : BLOCK_DATA[149].atlasIdx.backBottom;
                    const bTX = backTexIdx % 16, bTY = Math.floor(backTexIdx / 16);
                    const BU = (px) => (bTX + px/16) / 16;
                    const BV = (py) => 1 - (bTY + py/16) / 16;
                    
                    const sl = getSunLight(x, y, z) / 15.0;
                    const tl = getTorchLight(x, y, z) / 15.0;
                    
                    // Single-sided quad helper (Standardized CCW outward facing)
                    const DQ1 = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                                au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
                        let sh = 1.0;
                        if (ny === -1) sh = 0.5; else if (nx !== 0) sh = 0.8; else if (nz !== 0) sh = 0.6;
                        solidPositions.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
                        solidUvs.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
                        for(let i=0;i<6;i++){ solidColors.push(sl*sh,tl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(nx,ny,nz); }
                    };
                    
                    const D = 3/16;
                    const E = 0.005;
                    
                    let effectiveDir = dir;
                    if (isOpen) {
                        if (hinge === 0) effectiveDir = (dir + 1) & 3; 
                        else effectiveDir = (dir + 3) & 3; 
                    }
                    
                    let dx0, dx1, dz0, dz1;
                    if (!isOpen) {
                        if (dir === 0) { dx0=x; dx1=x+1; dz0=z+E; dz1=z+D; }
                        else if (dir === 1) { dx0=x+1-D; dx1=x+1-E; dz0=z; dz1=z+1; }
                        else if (dir === 2) { dx0=x; dx1=x+1; dz0=z+1-D; dz1=z+1-E; }
                        else { dx0=x+E; dx1=x+D; dz0=z; dz1=z+1; }
                    } else {
                        if (dir === 0) {
                            if (hinge === 0) { dx0=x+E; dx1=x+D; dz0=z; dz1=z+1; }
                            else { dx0=x+1-D; dx1=x+1-E; dz0=z; dz1=z+1; }
                        } else if (dir === 1) {
                            if (hinge === 0) { dx0=x; dx1=x+1; dz0=z+E; dz1=z+D; }
                            else { dx0=x; dx1=x+1; dz0=z+1-D; dz1=z+1-E; }
                        } else if (dir === 2) {
                            if (hinge === 0) { dx0=x+1-D; dx1=x+1-E; dz0=z; dz1=z+1; }
                            else { dx0=x+E; dx1=x+D; dz0=z; dz1=z+1; }
                        } else {
                            if (hinge === 0) { dx0=x; dx1=x+1; dz0=z+1-D; dz1=z+1-E; }
                            else { dx0=x; dx1=x+1; dz0=z+E; dz1=z+D; }
                        }
                    }
                    
                    const isXal = (dx1-dx0) > (dz1-dz0);
                    
                    // Front/back face UVs
                    const fu0=FU(16),fu1=FU(0),fv0=FV(16),fv1=FV(0);
                    const bu0=BU(16),bu1=BU(0),bv0=BV(16),bv1=BV(0);
                    const eu0=FU(0),eu1=FU(3);
                    
                    if (isXal) {
                        const frontOnPlusZ = (effectiveDir === 2);
                        
                        // Broad faces (+Z / -Z)
                        if (frontOnPlusZ) {
                            DQ1(dx0,y+1,dz1, dx0,y,dz1, dx1,y,dz1, dx1,y+1,dz1, fu1,fv1, fu1,fv0, fu0,fv0, fu0,fv1, 0,0,1);
                            DQ1(dx1,y+1,dz0, dx1,y,dz0, dx0,y,dz0, dx0,y+1,dz0, bu1,bv1, bu1,bv0, bu0,bv0, bu0,bv1, 0,0,-1);
                        } else {
                            DQ1(dx0,y+1,dz1, dx0,y,dz1, dx1,y,dz1, dx1,y+1,dz1, bu1,bv1, bu1,bv0, bu0,bv0, bu0,bv1, 0,0,1);
                            DQ1(dx1,y+1,dz0, dx1,y,dz0, dx0,y,dz0, dx0,y+1,dz0, fu1,fv1, fu1,fv0, fu0,fv0, fu0,fv1, 0,0,-1);
                        }
                        
                        // Skinny Edges (+X / -X)
                        DQ1(dx0,y+1,dz0, dx0,y,dz0, dx0,y,dz1, dx0,y+1,dz1, eu0,fv1, eu0,fv0, eu1,fv0, eu1,fv1, -1,0,0);
                        DQ1(dx1,y+1,dz1, dx1,y,dz1, dx1,y,dz0, dx1,y+1,dz0, eu0,fv1, eu0,fv0, eu1,fv0, eu1,fv1, 1,0,0);
                        
                        // Top and Bottom (+Y / -Y)
                        DQ1(dx0,y+1,dz0, dx0,y+1,dz1, dx1,y+1,dz1, dx1,y+1,dz0, FU(0),FV(3), FU(0),FV(0), FU(16),FV(0), FU(16),FV(3), 0,1,0);
                        DQ1(dx0,y,dz1, dx0,y,dz0, dx1,y,dz0, dx1,y,dz1, FU(0),FV(0), FU(0),FV(3), FU(16),FV(3), FU(16),FV(0), 0,-1,0);
                        
                    } else {
                        const frontOnPlusX = (effectiveDir === 1);
                        
                        // Broad faces (+X / -X)
                        if (frontOnPlusX) {
                            DQ1(dx1,y+1,dz1, dx1,y,dz1, dx1,y,dz0, dx1,y+1,dz0, fu1,fv1, fu1,fv0, fu0,fv0, fu0,fv1, 1,0,0);
                            DQ1(dx0,y+1,dz0, dx0,y,dz0, dx0,y,dz1, dx0,y+1,dz1, bu1,bv1, bu1,bv0, bu0,bv0, bu0,bv1, -1,0,0);
                        } else {
                            DQ1(dx1,y+1,dz1, dx1,y,dz1, dx1,y,dz0, dx1,y+1,dz0, bu1,bv1, bu1,bv0, bu0,bv0, bu0,bv1, 1,0,0);
                            DQ1(dx0,y+1,dz0, dx0,y,dz0, dx0,y,dz1, dx0,y+1,dz1, fu1,fv1, fu1,fv0, fu0,fv0, fu0,fv1, -1,0,0);
                        }
                        
                        // Skinny Edges (+Z / -Z)
                        DQ1(dx1,y+1,dz0, dx1,y,dz0, dx0,y,dz0, dx0,y+1,dz0, eu0,fv1, eu0,fv0, eu1,fv0, eu1,fv1, 0,0,-1);
                        DQ1(dx0,y+1,dz1, dx0,y,dz1, dx1,y,dz1, dx1,y+1,dz1, eu0,fv1, eu0,fv0, eu1,fv0, eu1,fv1, 0,0,1);
                        
                        // Top and Bottom (+Y / -Y)
                        DQ1(dx0,y+1,dz0, dx0,y+1,dz1, dx1,y+1,dz1, dx1,y+1,dz0, FU(0),FV(16), FU(0),FV(0), FU(3),FV(0), FU(3),FV(16), 0,1,0);
                        DQ1(dx0,y,dz1, dx0,y,dz0, dx1,y,dz0, dx1,y,dz1, FU(0),FV(0), FU(0),FV(16), FU(3),FV(16), FU(3),FV(0), 0,-1,0);
                    }
                    continue;
                }

                // --- TRAPDOOR RENDERING (ID 150) ---
                if (id === 150) {
                    const dir = (val >> 8) & 0x3;
                    const isOpen = (val >> 10) & 0x1;
                    const isTop = (val >> 11) & 0x1;
                    
                    const texIdx = BLOCK_DATA[150].atlasIdx;
                    const TX = texIdx % 16, TY = Math.floor(texIdx / 16);
                    const U = (px) => (TX + px/16) / 16;
                    const V = (py) => 1 - (TY + py/16) / 16;
                    
                    const sl = getSunLight(x, y, z) / 15.0;
                    const tl = getTorchLight(x, y, z) / 15.0;
                    
                    const TQ = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                                au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
                        let sh = 1.0;
                        if (ny === -1) sh = 0.5; else if (nx !== 0) sh = 0.8; else if (nz !== 0) sh = 0.6;
                        solidPositions.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
                        solidUvs.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
                        for(let i=0;i<6;i++){ solidColors.push(sl*sh,tl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(nx,ny,nz); }
                        solidPositions.push(ax,ay,az, cx,cy,cz, bx,by,bz, ax,ay,az, dx,dy,dz, cx,cy,cz);
                        solidUvs.push(au,av, cu,cv, bu,bv, au,av, du,dv, cu,cv);
                        for(let i=0;i<6;i++){ solidColors.push(sl*sh,tl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(-nx,-ny,-nz); }
                    };
                    
                    const D = 3/16;
                    const E = 0.002;
                    const fu0=U(0),fu1=U(16),fv0=V(16),fv1=V(0);
                    
                    if (!isOpen) {
                        const yb = isTop ? y + 1 - D - E : y + E;
                        const yt = yb + D;
                        // Top/bottom: full 16x16
                        TQ(x,yt,z, x,yt,z+1, x+1,yt,z+1, x+1,yt,z, fu0,fv1,fu0,fv0,fu1,fv0,fu1,fv1, 0,1,0);
                        TQ(x,yb,z+1, x,yb,z, x+1,yb,z, x+1,yb,z+1, fu0,fv1,fu0,fv0,fu1,fv0,fu1,fv1, 0,-1,0);
                        // ±Z edges: 16px wide x 3px tall
                        TQ(x,yt,z+1, x,yb,z+1, x+1,yb,z+1, x+1,yt,z+1, U(0),V(0),U(0),V(3),U(16),V(3),U(16),V(0), 0,0,1);
                        TQ(x+1,yt,z, x+1,yb,z, x,yb,z, x,yt,z, U(0),V(0),U(0),V(3),U(16),V(3),U(16),V(0), 0,0,-1);
                        // ±X edges: 16px wide x 3px tall
                        TQ(x,yt,z, x,yb,z, x,yb,z+1, x,yt,z+1, U(0),V(0),U(0),V(3),U(16),V(3),U(16),V(0), -1,0,0);
                        TQ(x+1,yt,z+1, x+1,yb,z+1, x+1,yb,z, x+1,yt,z, U(0),V(0),U(0),V(3),U(16),V(3),U(16),V(0), 1,0,0);
                    } else {
                        let tx0,tx1,tz0,tz1;
                        if (dir === 0) { tx0=x; tx1=x+1; tz0=z+E; tz1=z+D; }
                        else if (dir === 1) { tx0=x+1-D; tx1=x+1-E; tz0=z; tz1=z+1; }
                        else if (dir === 2) { tx0=x; tx1=x+1; tz0=z+1-D; tz1=z+1-E; }
                        else { tx0=x+E; tx1=x+D; tz0=z; tz1=z+1; }
                        
                        const isXal = (tx1-tx0) > (tz1-tz0);
                        
                        if (isXal) {
                            TQ(tx0,y+1,tz1, tx0,y,tz1, tx1,y,tz1, tx1,y+1,tz1, fu0,fv1,fu0,fv0,fu1,fv0,fu1,fv1, 0,0,1);
                            TQ(tx1,y+1,tz0, tx1,y,tz0, tx0,y,tz0, tx0,y+1,tz0, fu0,fv1,fu0,fv0,fu1,fv0,fu1,fv1, 0,0,-1);
                            // Top/bottom: 16x3
                            TQ(tx0,y+1,tz0, tx0,y+1,tz1, tx1,y+1,tz1, tx1,y+1,tz0, U(0),V(3),U(0),V(0),U(16),V(0),U(16),V(3), 0,1,0);
                            TQ(tx0,y,tz1, tx0,y,tz0, tx1,y,tz0, tx1,y,tz1, U(0),V(3),U(0),V(0),U(16),V(0),U(16),V(3), 0,-1,0);
                            // Side edges: 3x16
                            TQ(tx0,y+1,tz0, tx0,y,tz0, tx0,y,tz1, tx0,y+1,tz1, U(0),fv1,U(0),fv0,U(3),fv0,U(3),fv1, -1,0,0);
                            TQ(tx1,y+1,tz1, tx1,y,tz1, tx1,y,tz0, tx1,y+1,tz0, U(0),fv1,U(0),fv0,U(3),fv0,U(3),fv1, 1,0,0);
                        } else {
                            TQ(tx1,y+1,tz0, tx1,y,tz0, tx1,y,tz1, tx1,y+1,tz1, fu0,fv1,fu0,fv0,fu1,fv0,fu1,fv1, 1,0,0);
                            TQ(tx0,y+1,tz1, tx0,y,tz1, tx0,y,tz0, tx0,y+1,tz0, fu0,fv1,fu0,fv0,fu1,fv0,fu1,fv1, -1,0,0);
                            // Top/bottom: 3x16
                            TQ(tx0,y+1,tz0, tx0,y+1,tz1, tx1,y+1,tz1, tx1,y+1,tz0, U(0),V(16),U(0),V(0),U(3),V(0),U(3),V(16), 0,1,0);
                            TQ(tx0,y,tz1, tx0,y,tz0, tx1,y,tz0, tx1,y,tz1, U(0),V(16),U(0),V(0),U(3),V(0),U(3),V(16), 0,-1,0);
                            // Side edges: 3x16
                            TQ(tx0,y+1,tz0, tx0,y,tz0, tx1,y,tz0, tx1,y+1,tz0, U(0),fv1,U(0),fv0,U(3),fv0,U(3),fv1, 0,0,-1);
                            TQ(tx1,y+1,tz1, tx1,y,tz1, tx0,y,tz1, tx0,y+1,tz1, U(0),fv1,U(0),fv0,U(3),fv0,U(3),fv1, 0,0,1);
                        }
                    }
                    continue;
                }

                // --- FENCE RENDERING ---
                if (typeof isFenceBlock === 'function' && isFenceBlock(id)) {
                    const texIdx = typeof BLOCK_DATA[id].atlasIdx === 'object' ? BLOCK_DATA[id].atlasIdx.side : BLOCK_DATA[id].atlasIdx;
                    const TX = texIdx % 16, TY = Math.floor(texIdx / 16);
                    
                    // Map pixel position within the 16x16 tile to atlas UV
                    const U = (px) => (TX + px/16) / 16;
                    const V = (py) => 1 - (TY + py/16) / 16;
                    
                    const sl = getSunLight(x, y, z) / 15.0;
                    const tl = getTorchLight(x, y, z) / 15.0;
                    
                    // Push a double-sided quad. a,b,c,d = CCW for front face.
                    // UVs: each vert gets (u,v) explicitly
                    const FQ = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                                au,av, bu,bv, cu,cv, du,dv, n) => {
                        let sh = 1.0;
                        if (n[1] === -1) sh = 0.5;
                        else if (n[0] !== 0) sh = 0.8;
                        else if (n[2] !== 0) sh = 0.6;
                        // Front: a,b,c + a,c,d
                        solidPositions.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
                        solidUvs.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
                        for(let i=0;i<6;i++){ solidColors.push(sl*sh,tl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(n[0],n[1],n[2]); }
                        // Back: a,c,b + a,d,c
                        solidPositions.push(ax,ay,az, cx,cy,cz, bx,by,bz, ax,ay,az, dx,dy,dz, cx,cy,cz);
                        solidUvs.push(au,av, cu,cv, bu,bv, au,av, du,dv, cu,cv);
                        for(let i=0;i<6;i++){ solidColors.push(sl*sh,tl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(-n[0],-n[1],-n[2]); }
                    };
                    
                    // Post: 4px wide centered = 6/16 to 10/16
                    const P0 = 6/16, P1 = 10/16;
                    
                    // Connectivity (exclude snow layers id=40)
                    const canConnect = (nx, nz) => {
                        const nId = getVoxel(nx, y, nz) & 0xFF;
                        if (nId === 0 || isFluidBlock(nId) || isCrossBlock(nId) || nId === 17 || nId === 40 || nId === 66 || nId === 67) return false;
                        return true;
                    };
                    const cXN = canConnect(x-1,z), cXP = canConnect(x+1,z);
                    const cZN = canConnect(x,z-1), cZP = canConnect(x,z+1);
                    
                    // === CENTER POST (4x16x4 pixels) ===
                    // Top face (4x4 square, sample pixels 6-10 both axes)
                    const u0=U(6), u1=U(10), vt0=V(10), vt1=V(6);
                    FQ(x+P0,y+1,z+P0, x+P0,y+1,z+P1, x+P1,y+1,z+P1, x+P1,y+1,z+P0,
                       u0,vt0, u0,vt1, u1,vt1, u1,vt0, [0,1,0]);
                    // Bottom face
                    FQ(x+P0,y,z+P1, x+P0,y,z+P0, x+P1,y,z+P0, x+P1,y,z+P1,
                       u0,vt0, u0,vt1, u1,vt1, u1,vt0, [0,-1,0]);
                    // Side faces: 4px wide x 16px tall strip — always drawn
                    const su0=U(6), su1=U(10), sv0=V(16), sv1=V(0);
                    FQ(x+P0,y+1,z+P1, x+P0,y,z+P1, x+P0,y,z+P0, x+P0,y+1,z+P0,
                               su0,sv1, su0,sv0, su1,sv0, su1,sv1, [-1,0,0]);
                    FQ(x+P1,y+1,z+P0, x+P1,y,z+P0, x+P1,y,z+P1, x+P1,y+1,z+P1,
                               su0,sv1, su0,sv0, su1,sv0, su1,sv1, [1,0,0]);
                    FQ(x+P0,y+1,z+P0, x+P0,y,z+P0, x+P1,y,z+P0, x+P1,y+1,z+P0,
                               su0,sv1, su0,sv0, su1,sv0, su1,sv1, [0,0,-1]);
                    FQ(x+P1,y+1,z+P1, x+P1,y,z+P1, x+P0,y,z+P1, x+P0,y+1,z+P1,
                               su0,sv1, su0,sv0, su1,sv0, su1,sv1, [0,0,1]);
                    
                    // === RAILS: upper bar y 12-15, lower bar y 6-9 (3px tall, 2px thick) ===
                    const bars = [{y0:12, y1:15}, {y0:7, y1:10}];
                    const RW = 2/16; // 2 pixels wide
                    const MID = 0.5;
                    
                    for (const bar of bars) {
                        const by0 = y + bar.y0/16, by1 = y + bar.y1/16;
                        // Side face UVs: 6px wide x 3px tall (rail length = 6px from post to edge)
                        const rv0=V(bar.y1), rv1=V(bar.y0); // V top and bottom of bar
                        // Top face UVs: 6px x 2px
                        const tv0=V(9), tv1=V(7);
                        // End cap UVs: 2px x 3px
                        const eu0=U(7), eu1=U(9);
                        
                        // -X rail (x to x+P0)
                        if (cXN) {
                            const rz0=z+MID-RW/2, rz1=z+MID+RW/2;
                            // Top
                            FQ(x,by1,rz0, x,by1,rz1, x+P0,by1,rz1, x+P0,by1,rz0,
                               U(0),tv0, U(0),tv1, U(6),tv1, U(6),tv0, [0,1,0]);
                            // Bottom
                            FQ(x,by0,rz1, x,by0,rz0, x+P0,by0,rz0, x+P0,by0,rz1,
                               U(0),tv0, U(0),tv1, U(6),tv1, U(6),tv0, [0,-1,0]);
                            // -Z face
                            FQ(x+P0,by1,rz0, x+P0,by0,rz0, x,by0,rz0, x,by1,rz0,
                               U(6),rv1, U(6),rv0, U(0),rv0, U(0),rv1, [0,0,-1]);
                            // +Z face
                            FQ(x,by1,rz1, x,by0,rz1, x+P0,by0,rz1, x+P0,by1,rz1,
                               U(0),rv1, U(0),rv0, U(6),rv0, U(6),rv1, [0,0,1]);
                            // -X end cap
                            FQ(x,by1,rz1, x,by0,rz1, x,by0,rz0, x,by1,rz0,
                               eu0,rv1, eu0,rv0, eu1,rv0, eu1,rv1, [-1,0,0]);
                        }
                        // +X rail (x+P1 to x+1)
                        if (cXP) {
                            const rz0=z+MID-RW/2, rz1=z+MID+RW/2;
                            FQ(x+P1,by1,rz0, x+P1,by1,rz1, x+1,by1,rz1, x+1,by1,rz0,
                               U(10),tv0, U(10),tv1, U(16),tv1, U(16),tv0, [0,1,0]);
                            FQ(x+P1,by0,rz1, x+P1,by0,rz0, x+1,by0,rz0, x+1,by0,rz1,
                               U(10),tv0, U(10),tv1, U(16),tv1, U(16),tv0, [0,-1,0]);
                            FQ(x+1,by1,rz0, x+1,by0,rz0, x+P1,by0,rz0, x+P1,by1,rz0,
                               U(16),rv1, U(16),rv0, U(10),rv0, U(10),rv1, [0,0,-1]);
                            FQ(x+P1,by1,rz1, x+P1,by0,rz1, x+1,by0,rz1, x+1,by1,rz1,
                               U(10),rv1, U(10),rv0, U(16),rv0, U(16),rv1, [0,0,1]);
                            FQ(x+1,by1,rz0, x+1,by0,rz0, x+1,by0,rz1, x+1,by1,rz1,
                               eu0,rv1, eu0,rv0, eu1,rv0, eu1,rv1, [1,0,0]);
                        }
                        // -Z rail (z to z+P0)
                        if (cZN) {
                            const rx0=x+MID-RW/2, rx1=x+MID+RW/2;
                            FQ(rx0,by1,z, rx0,by1,z+P0, rx1,by1,z+P0, rx1,by1,z,
                               U(0),tv0, U(0),tv1, U(6),tv1, U(6),tv0, [0,1,0]);
                            FQ(rx0,by0,z+P0, rx0,by0,z, rx1,by0,z, rx1,by0,z+P0,
                               U(0),tv0, U(0),tv1, U(6),tv1, U(6),tv0, [0,-1,0]);
                            // -X face
                            FQ(rx0,by1,z+P0, rx0,by0,z+P0, rx0,by0,z, rx0,by1,z,
                               U(6),rv1, U(6),rv0, U(0),rv0, U(0),rv1, [-1,0,0]);
                            // +X face
                            FQ(rx1,by1,z, rx1,by0,z, rx1,by0,z+P0, rx1,by1,z+P0,
                               U(0),rv1, U(0),rv0, U(6),rv0, U(6),rv1, [1,0,0]);
                            // -Z end cap
                            FQ(rx0,by1,z, rx0,by0,z, rx1,by0,z, rx1,by1,z,
                               eu0,rv1, eu0,rv0, eu1,rv0, eu1,rv1, [0,0,-1]);
                        }
                        // +Z rail (z+P1 to z+1)
                        if (cZP) {
                            const rx0=x+MID-RW/2, rx1=x+MID+RW/2;
                            FQ(rx0,by1,z+P1, rx0,by1,z+1, rx1,by1,z+1, rx1,by1,z+P1,
                               U(10),tv0, U(10),tv1, U(16),tv1, U(16),tv0, [0,1,0]);
                            FQ(rx0,by0,z+1, rx0,by0,z+P1, rx1,by0,z+P1, rx1,by0,z+1,
                               U(10),tv0, U(10),tv1, U(16),tv1, U(16),tv0, [0,-1,0]);
                            FQ(rx0,by1,z+1, rx0,by0,z+1, rx0,by0,z+P1, rx0,by1,z+P1,
                               U(16),rv1, U(16),rv0, U(10),rv0, U(10),rv1, [-1,0,0]);
                            FQ(rx1,by1,z+P1, rx1,by0,z+P1, rx1,by0,z+1, rx1,by1,z+1,
                               U(10),rv1, U(10),rv0, U(16),rv0, U(16),rv1, [1,0,0]);
                            FQ(rx1,by1,z+1, rx1,by0,z+1, rx0,by0,z+1, rx0,by1,z+1,
                               eu0,rv1, eu0,rv0, eu1,rv0, eu1,rv1, [0,0,1]);
                        }
                    }
                    continue;
                }

                // --- LILY PAD RENDERING: flat horizontal plane on water ---
                if (id === 67) {
                    for (let lpf of lilypadFaces) {
                        pushFace(x, y, z, lpf, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, null, val);
                    }
                    continue;
                }

                if (id === 40) {
                    const layers = Math.max(1, Math.min(8, (val >> 8) & 0xF));
                    const snowHeights = { h00: layers/8.0, h10: layers/8.0, h01: layers/8.0, h11: layers/8.0 };
                    for (let face of blockFaces) {
                        const nId = getLocal(lx + face.dir[0], y + face.dir[1], lz + face.dir[2]) & 0xFF;
                        let draw = false;
                        
                        if (face.dir[1] === 1) { 
                            if (layers < 8) draw = true; 
                            else if (nId === 0 || isCrossBlock(nId) || isFluidBlock(nId) || isSnowLayer(nId) || nId === 17) draw = true; 
                        } 
                        else if (face.dir[1] === -1) { 
                            if (nId === 0 || isFluidBlock(nId) || isCrossBlock(nId) || nId === 17) draw = true; 
                        } 
                        else { 
                            if (nId === 0 || isFluidBlock(nId) || isCrossBlock(nId) || isLeafBlock(nId) || nId === 38 || nId === 95 || isSnowLayer(nId) || nId === 17) draw = true; 
                        }
                        
                        if (draw) pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, snowHeights, null, val);
                    }
                    continue;
                }

                if (id === 17) {
                    const torchLevel = (val >> 8) & 0xF;
                    for (let face of blockFaces) {
                        pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, { torchLevel: torchLevel }, val);
                    }
                    continue;
                }

                for (let face of blockFaces) {
                    const nVal = getLocal(lx + face.dir[0], y + face.dir[1], lz + face.dir[2]);
                    const nId = nVal & 0xFF;

                    if (id === 4 || id === 27) { 
                        let draw = false;

                        if (nId === id) {
                            draw = false; 
                        } else if (nId === 95) {
                            draw = false; // Don't draw water/lava face against ice (prevents z-fighting)
                        } else if (isBlockTransparent(nId)) { 
                            draw = true; 
                        } else if (face.dir[1] === 1) {
                            draw = true;
                        }
                        
                        if (draw) {
                            let heights = null;
                            const isSource = (val >> 13) & 0x1;
                            const aboveVal = getLocal(lx, y+1, lz);

                            if ((aboveVal & 0xFF) !== id) {
                                heights = {
                                    h00: getCornerHeight(x, y, z, 0, 0, id), 
                                    h10: getCornerHeight(x, y, z, 1, 0, id), 
                                    h01: getCornerHeight(x, y, z, 0, 1, id), 
                                    h11: getCornerHeight(x, y, z, 1, 1, id)  
                                };
                            }

                            let fluidType = 0, flowDirX = 0, flowDirY = 0;
                            if (isSource && face.dir[1] !== 0) {
                                fluidType = 0; 
                            } else {
                                fluidType = 1; 
                                if (face.dir[1] === 0) {
                                    flowDirX = 0.0;
                                    flowDirY = -1.0; 
                                } else {
                                    if (heights) {
                                        const fdx = (heights.h00 + heights.h01) - (heights.h10 + heights.h11);
                                        const fdz = (heights.h00 + heights.h10) - (heights.h01 + heights.h11);
                                        const len = Math.sqrt(fdx*fdx + fdz*fdz);
                                        if (len > 0.001) { flowDirX = fdx / len; flowDirY = -fdz / len; } 
                                        else fluidType = 0; 
                                    } else { fluidType = 0; }
                                }
                            }

                            if (id === 27) {
                                pushFace(x, y, z, face, lavaPositions, lavaNormals, lavaUvs, lavaColors, null, id, heights, null, val);
                                for (let ft = 0; ft < 6; ft++) { lavaFluidTypes.push(fluidType); lavaFlowDirs.push(flowDirX, flowDirY); }
                            } else {
                                pushFace(x, y, z, face, waterPositions, waterNormals, waterUvs, waterColors, null, id, heights, null, val);
                                for (let ft = 0; ft < 6; ft++) { waterFluidTypes.push(fluidType); waterFlowDirs.push(flowDirX, flowDirY); }
                            }
                        }
                    } else { 
                        let draw = false;
                        
                        if (id === 20 && nId === 20 && face.dir[1] !== 0) {
                            draw = false;
                        }
                        else if (nId === 0 || nId === 4 || nId === 27 || isCrossBlock(nId) || isSnowLayer(nId) || nId === 20 || nId === 17 || nId === 54 || nId === 64 || nId === 66 || nId === 67 || nId === 68 || nId === 158 || nId === 90 || isSlabBlock(nId) || isStairBlock(nId) || isFenceBlock(nId) || nId === 149 || nId === 150) draw = true; 
                        
                        else if (isLeafBlock(nId) && !isLeafBlock(id)) draw = settingGraphicsFancy; 
                        else if (isLeafBlock(id) && isLeafBlock(nId)) draw = settingGraphicsFancy; 
                        
                        else if (nId === 38 && id !== 38) draw = true; 
                        else if (id === 38 && nId !== 38) draw = true; 
                        // Ice: don't draw ice-to-ice internal faces, draw ice against everything else
                        else if (nId === 95 && id !== 95) draw = true;
                        else if (id === 95 && nId !== 95) draw = true;

                        // FIX: Ensure Farmland sides render if the neighbor is a lower block
                        if ((nId === 62 || nId === 63) && face.dir[1] !== 1) draw = true;
                        
                        // FIX: Don't render Farmland bottom if the block below is solid
                        if ((id === 62 || id === 63) && face.dir[1] === -1 && nId !== 0 && !isBlockTransparent(nId)) draw = false;
                        
                        if (draw) {
                            let customHeights = null;
                            if (id === 62 || id === 63) {
                                customHeights = { h00: 0.9375, h10: 0.9375, h01: 0.9375, h11: 0.9375 };
                            }

                            if (id === 38 || id === 95) pushFace(x, y, z, face, glassPositions, glassNormals, glassUvs, glassColors, glassBiomeTints, id, customHeights, null, val);
                            else pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, customHeights, null, val);
                        }
                    }
                }
            }
        }
    }

    const chunkKey = `${cx},${cz}`;
    if (chunkMeshes.has(chunkKey)) {
        const group = chunkMeshes.get(chunkKey);
        scene.remove(group);
        group.children.forEach(mesh => mesh.geometry.dispose());
        chunkMeshes.delete(chunkKey);
    }

    const chunkGroup = new THREE.Group();
    if (solidPositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(solidPositions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(solidNormals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(solidUvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(solidColors, 3));
        geometry.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(solidBiomeTints, 3));
        chunkGroup.add(new THREE.Mesh(geometry, solidMaterial));
    }
    if (glassPositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(glassPositions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(glassNormals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(glassUvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(glassColors, 3));
        geometry.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(glassBiomeTints, 3));
        const glassMesh = new THREE.Mesh(geometry, glassMaterial);
        glassMesh.renderOrder = 1;
        chunkGroup.add(glassMesh);
    }
    if (waterPositions.length > 0) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(waterPositions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(waterNormals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(waterUvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
        geometry.setAttribute('aFluidType', new THREE.Float32BufferAttribute(waterFluidTypes, 1));
        geometry.setAttribute('aFlowDir', new THREE.Float32BufferAttribute(waterFlowDirs, 2));
        const waterMesh_ = new THREE.Mesh(geometry, waterMaterial);
        waterMesh_.renderOrder = 2;
        chunkGroup.add(waterMesh_);
    }
    // --- LAVA MESH ---
    if (lavaPositions.length > 0) {
        const lavaGeo = new THREE.BufferGeometry();
        lavaGeo.setAttribute('position', new THREE.Float32BufferAttribute(lavaPositions, 3));
        lavaGeo.setAttribute('normal', new THREE.Float32BufferAttribute(lavaNormals, 3));
        lavaGeo.setAttribute('uv', new THREE.Float32BufferAttribute(lavaUvs, 2));
        lavaGeo.setAttribute('color', new THREE.Float32BufferAttribute(lavaColors, 3));
        lavaGeo.setAttribute('aFluidType', new THREE.Float32BufferAttribute(lavaFluidTypes, 1));
        lavaGeo.setAttribute('aFlowDir', new THREE.Float32BufferAttribute(lavaFlowDirs, 2));
        const lavaMesh_ = new THREE.Mesh(lavaGeo, lavaMaterial);
        chunkGroup.add(lavaMesh_);
    }

    // --- FIRE MESH ---
    if (firePositions.length > 0) {
        const fireGeo = new THREE.BufferGeometry();
        fireGeo.setAttribute('position', new THREE.Float32BufferAttribute(firePositions, 3));
        fireGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fireUvs, 2));
        fireGeo.setAttribute('color', new THREE.Float32BufferAttribute(fireColors, 3));
        fireGeo.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(fireBiomeTints, 3));
        
        // Use window.fireMaterial to ensure it's found
        if (window.fireMaterial) {
            const fMesh = new THREE.Mesh(fireGeo, window.fireMaterial);
            fMesh.renderOrder = 5; 
            chunkGroup.add(fMesh);
        }
    }

    // --- PORTAL MESH ---
    if (portalPositions.length > 0) {
        const portalGeo = new THREE.BufferGeometry();
        portalGeo.setAttribute('position', new THREE.Float32BufferAttribute(portalPositions, 3));
        portalGeo.setAttribute('uv', new THREE.Float32BufferAttribute(portalUvs, 2));
        portalGeo.setAttribute('color', new THREE.Float32BufferAttribute(portalColors, 3));
        portalGeo.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(portalBiomeTints, 3));
        
        if (window.portalMaterial) {
            const pMesh = new THREE.Mesh(portalGeo, window.portalMaterial);
            pMesh.renderOrder = 6;
            chunkGroup.add(pMesh);
        }
    }

    // --- FINAL ADDITION ---
    if (chunkGroup.children.length > 0) {
        scene.add(chunkGroup);
        chunkMeshes.set(chunkKey, chunkGroup);
    }
} // End of buildChunkMesh

function updateChunks(x, y, z) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    dirtyChunks.add(`${cx},${cz}`);
    const localX = x - cx * CHUNK_SIZE;
    const localZ = z - cz * CHUNK_SIZE;
    if (localX === 0) dirtyChunks.add(`${cx - 1},${cz}`);
    if (localX === CHUNK_SIZE - 1) dirtyChunks.add(`${cx + 1},${cz}`);
    if (localZ === 0) dirtyChunks.add(`${cx},${cz - 1}`);
    if (localZ === CHUNK_SIZE - 1) dirtyChunks.add(`${cx},${cz + 1}`);
}

function updateChunksInBounds(minX, maxX, minZ, maxZ) {
    const minCx = Math.floor(minX / CHUNK_SIZE), maxCx = Math.floor(maxX / CHUNK_SIZE);
    const minCz = Math.floor(minZ / CHUNK_SIZE), maxCz = Math.floor(maxZ / CHUNK_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) for (let cz = minCz; cz <= maxCz; cz++) dirtyChunks.add(`${cx},${cz}`);
}

function updateAllChunks() {
    if (useLazyGeneration) {
        for (let ci = 0; ci < generatedChunksArr.length; ci++) {
            if (generatedChunksArr[ci]) {
                const cx = ((ci / CHUNKS_Z) | 0) - CHUNKS_X / 2;
                const cz = (ci % CHUNKS_Z) - CHUNKS_Z / 2;
                dirtyChunks.add(`${cx},${cz}`);
            }
        }
    } else {
        const minCx = -CHUNKS_X / 2, maxCx = CHUNKS_X / 2 - 1;
        const minCz = -CHUNKS_Z / 2, maxCz = CHUNKS_Z / 2 - 1;
        const chunks = [];
        for (let cx = minCx; cx <= maxCx; cx++) for (let cz = minCz; cz <= maxCz; cz++) chunks.push({cx, cz, dist: cx*cx + cz*cz});
        chunks.sort((a, b) => a.dist - b.dist);
        for (let c of chunks) dirtyChunks.add(`${c.cx},${c.cz}`);
    }
}

function queueNeighbors(x, y, z) {
    updateWaterQueue.add(getVoxelIndex(x+1, y, z)); updateWaterQueue.add(getVoxelIndex(x-1, y, z));
    updateWaterQueue.add(getVoxelIndex(x, y+1, z)); updateWaterQueue.add(getVoxelIndex(x, y-1, z));
    updateWaterQueue.add(getVoxelIndex(x, y, z+1)); updateWaterQueue.add(getVoxelIndex(x, y, z-1));
    updateLavaQueue.add(getVoxelIndex(x+1, y, z)); updateLavaQueue.add(getVoxelIndex(x-1, y, z));
    updateLavaQueue.add(getVoxelIndex(x, y+1, z)); updateLavaQueue.add(getVoxelIndex(x, y-1, z));
    updateLavaQueue.add(getVoxelIndex(x, y, z+1)); updateLavaQueue.add(getVoxelIndex(x, y, z-1));
}

let terrainPixelData = null;