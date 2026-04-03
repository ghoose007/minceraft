// ==========================================
// CHUNK MESH BUILDER
// ==========================================

// --- Persistent reusable arrays for buildChunkMesh (avoids ~32 array allocations per chunk rebuild) ---
const _cm_firePos = [], _cm_fireNrm = [], _cm_fireUv = [], _cm_fireCol = [], _cm_fireBt = [];
const _cm_portalPos = [], _cm_portalNrm = [], _cm_portalUv = [], _cm_portalCol = [], _cm_portalBt = [];
const _cm_solidPos = [], _cm_solidNrm = [], _cm_solidUv = [], _cm_solidCol = [], _cm_solidBt = [];
const _cm_glassPos = [], _cm_glassNrm = [], _cm_glassUv = [], _cm_glassCol = [], _cm_glassBt = [];
const _cm_waterPos = [], _cm_waterNrm = [], _cm_waterUv = [], _cm_waterCol = [], _cm_waterBt = [], _cm_waterFt = [], _cm_waterFd = [];
const _cm_lavaPos = [], _cm_lavaNrm = [], _cm_lavaUv = [], _cm_lavaCol = [], _cm_lavaFt = [], _cm_lavaFd = [];

function buildChunkMesh(cx, cz) {
    // Clear per-chunk biome tint cache for fresh data
    _biomeTintCache.clear();
    _biomeFoliageTintCache.clear();
    _biomeWaterTintCache.clear();

    // Reuse arrays by clearing length (avoids GC from allocating ~30 arrays per rebuild)
    const firePositions = _cm_firePos; firePositions.length = 0;
    const fireNormals = _cm_fireNrm; fireNormals.length = 0;
    const fireUvs = _cm_fireUv; fireUvs.length = 0;
    const fireColors = _cm_fireCol; fireColors.length = 0;
    const fireBiomeTints = _cm_fireBt; fireBiomeTints.length = 0;
    const portalPositions = _cm_portalPos; portalPositions.length = 0;
    const portalNormals = _cm_portalNrm; portalNormals.length = 0;
    const portalUvs = _cm_portalUv; portalUvs.length = 0;
    const portalColors = _cm_portalCol; portalColors.length = 0;
    const portalBiomeTints = _cm_portalBt; portalBiomeTints.length = 0;
    const solidPositions = _cm_solidPos; solidPositions.length = 0;
    const solidNormals = _cm_solidNrm; solidNormals.length = 0;
    const solidUvs = _cm_solidUv; solidUvs.length = 0;
    const solidColors = _cm_solidCol; solidColors.length = 0;
    const solidBiomeTints = _cm_solidBt; solidBiomeTints.length = 0;
    const glassPositions = _cm_glassPos; glassPositions.length = 0;
    const glassNormals = _cm_glassNrm; glassNormals.length = 0;
    const glassUvs = _cm_glassUv; glassUvs.length = 0;
    const glassColors = _cm_glassCol; glassColors.length = 0;
    const glassBiomeTints = _cm_glassBt; glassBiomeTints.length = 0;
    const waterPositions = _cm_waterPos; waterPositions.length = 0;
    const waterNormals = _cm_waterNrm; waterNormals.length = 0;
    const waterUvs = _cm_waterUv; waterUvs.length = 0;
    const waterColors = _cm_waterCol; waterColors.length = 0;
    const waterBiomeTints = _cm_waterBt; waterBiomeTints.length = 0;
    const waterFluidTypes = _cm_waterFt; waterFluidTypes.length = 0;
    const waterFlowDirs = _cm_waterFd; waterFlowDirs.length = 0;
    const lavaPositions = _cm_lavaPos; lavaPositions.length = 0;
    const lavaNormals = _cm_lavaNrm; lavaNormals.length = 0;
    const lavaUvs = _cm_lavaUv; lavaUvs.length = 0;
    const lavaColors = _cm_lavaCol; lavaColors.length = 0;
    const lavaFluidTypes = _cm_lavaFt; lavaFluidTypes.length = 0;
    const lavaFlowDirs = _cm_lavaFd; lavaFlowDirs.length = 0;

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

                if (id === 17 && !(id === 206)) {
                    const torchLevel = (val >> 8) & 0xF;
                    for (let face of blockFaces) {
                        pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, { torchLevel: torchLevel }, val);
                    }
                    continue;
                }
                
                // --- REDSTONE TORCH CUSTOM RENDERING (ID 206) ---
                if (id === 206) {
                    const torchLevel = (val >> 8) & 0xF;
                    const rsOn = !((val >> 12) & 0x1);
                    const aidx = rsOn ? 163 : 164;
                    const agx = aidx % 16, agy = Math.floor(aidx / 16);
                    
                    const _sl = getSunLight(x, y, z) / 15.0;
                    const _tl = Math.max(getTorchLight(x, y, z), 7) / 15.0;
                    
                    // Atlas UV helpers for this tile
                    const TU = (px) => (agx + px / 16) / 16;
                    const TV = (py) => 1 - (agy + py / 16) / 16;
                    
                    // Torch center - rotation in RQ handles wall tilt
                    let tcx = x + 0.5, tcy = y, tcz = z + 0.5;
                    
                    // Pixel-to-world mapping for this torch:
                    // Texture row R -> world Y = tcy + 0.625 * (15 - R) / 10
                    // Texture col C -> offset from center = (C - 8) / 16 (but adjusted for mesh scale)
                    
                    // The redstone torch texture content:
                    // Cols 6-9 (4px wide), rows 5-15 (11px tall)
                    // But cols 7-8 are the stick, cols 6 and 9 are the flame glow
                    
                    // We render 4 planes (2 cross-plane pairs), each sampling the full 4x11 content
                    // Each plane is 4px wide = 4/16 = 0.25 block
                    // But pushed inward 1px on each side = starts at col 7 position, not col 6
                    // So geometry is 2px wide (cols 7-8 positions) but UV shows cols 6-9
                    
                    // Actually - 4 separate planes, each at the right position:
                    // The mesh is 2px wide geometry centered on the torch
                    // The UV maps 4px of texture (cols 6-9) onto this 2px mesh
                    // This compresses slightly but shows all flame pixels
                    
                    // NO - user said don't scale. Use 4 planes that align on pixels.
                    // Plane 1: col 6-7 strip (1px wide), at position -2px to -1px from center
                    // Plane 2: col 7-8 strip (1px wide), at position -1px to 0 from center  
                    // Plane 3: col 8-9 strip (1px wide), at position 0 to +1px from center
                    // Plane 4: col 9-10 strip (1px wide), at position +1px to +2px from center
                    // Wait that's back to 4px wide total.
                    
                    // The user wants: 4px UV on geometry that is pushed 1px inward on each side
                    // = 2px geometry but positioned correctly. 
                    // 
                    // Actually let me re-read: "MOVE THE FACES THEMSELVES INWARD BY 2PX"
                    // from the 4px version. So the 4px cross-planes each move 1px toward the
                    // OTHER cross-plane. But cross-planes intersect at center...
                    //
                    // I think the answer is: render 4 SEPARATE face planes (not cross-planes).
                    // Two face planes for the Z-normal pair, two for the X-normal pair.
                    // Each is a flat quad, 4px wide, showing the 4x11 texture.
                    // Position each plane 1px INWARD from where a normal 4px cross would be.
                    // Normal cross: Z-plane at z=tcz, X-plane at x=tcx
                    // Inward by 1px: Z-planes at tcz +/- 1/16, X-planes at tcx +/- 1/16
                    
                    const hw = 2/16; // half of 4px = 2px
                    const inset = 1/16; // push inward by 1px
                    
                    // Y positions from row mapping
                    const yBot = tcy; // row 15
                    const yTop = tcy + 0.625; // row 5 area
                    // Side UV: cols 6-10, rows 5-16
                    const su0 = TU(6), su1 = TU(10);
                    const sv0 = TV(5); // top (row 5 = high in texture = low V in atlas... wait)
                    // TV(py) = 1 - (agy + py/16)/16
                    // row 5: TV(5) is HIGHER atlas V than TV(15)
                    // In atlas: lower row number = higher on image = lower V? No...
                    // atlas V=0 is TOP of image. tile row 0 is top of tile.
                    // TV(0) = 1 - agy/16 = high V (bottom of atlas space)
                    // TV(16) = 1 - (agy+1)/16 = lower V (higher in atlas)
                    // So TV(5) > TV(15). TV(5) = bottom vertex V, TV(15) = top vertex V? No...
                    // The torch renders bottom-up: yBot=tcy at row 15, yTop=tcy+0.625 at row 5
                    // So vertex at yBot should have UV of row 15, vertex at yTop should have UV of row 5
                    const svBot = TV(16); // row 15-16 bottom of tile
                    const svTop = TV(5);  // row 5 top of content
                    
                    // Top face: 2x2px at cols 7-8, rows 6-7  
                    // Move up by 1px from default: rows 6-7 instead of 7-8
                    // Actually "move up" = show higher content. Top face shows the very tip.
                    // Regular torch top face: v = 0.5 + v*0.125 = rows 8-10 area
                    // User wants it 1px up = rows 7-9? Let me just use rows 6-8 (the flame center)
                    const tu0 = TU(7), tu1 = TU(9);
                    const tv0 = TV(6), tv1 = TV(8);
                    
                    // Helper for double-sided quad with optional rotation
                    const RQ = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                               u0,v0, u1,v1, u2,v2, u3,v3, nx,ny,nz) => {
                        // Apply wall tilt rotation if torch is on a wall
                        const rot = (vx, vy, vz) => {
                            let rx = vx - tcx, ry = vy - tcy, rz = vz - tcz;
                            if (torchLevel === 1) { // -X wall
                                const angle = -0.4;
                                const ny2 = rx * Math.sin(angle) + ry * Math.cos(angle);
                                const nx2 = rx * Math.cos(angle) - ry * Math.sin(angle);
                                return [tcx + nx2 - 0.43, tcy + ny2 + 0.22, vz];
                            } else if (torchLevel === 2) { // +X wall
                                const angle = 0.4;
                                const ny2 = rx * Math.sin(angle) + ry * Math.cos(angle);
                                const nx2 = rx * Math.cos(angle) - ry * Math.sin(angle);
                                return [tcx + nx2 + 0.43, tcy + ny2 + 0.22, vz];
                            } else if (torchLevel === 3) { // -Z wall
                                const angle = -0.4;
                                const ny2 = rz * Math.sin(angle) + ry * Math.cos(angle);
                                const nz2 = rz * Math.cos(angle) - ry * Math.sin(angle);
                                return [vx, tcy + ny2 + 0.22, tcz + nz2 - 0.43];
                            } else if (torchLevel === 4) { // +Z wall
                                const angle = 0.4;
                                const ny2 = rz * Math.sin(angle) + ry * Math.cos(angle);
                                const nz2 = rz * Math.cos(angle) - ry * Math.sin(angle);
                                return [vx, tcy + ny2 + 0.22, tcz + nz2 + 0.43];
                            }
                            return [vx, vy, vz];
                        };
                        const a = rot(ax,ay,az), b = rot(bx,by,bz), c = rot(cx,cy,cz), d = rot(dx,dy,dz);
                        solidPositions.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2], a[0],a[1],a[2], c[0],c[1],c[2], d[0],d[1],d[2]);
                        solidUvs.push(u0,v0, u1,v1, u2,v2, u0,v0, u2,v2, u3,v3);
                        for(let i=0;i<6;i++){solidColors.push(_sl,_tl,1.0);solidBiomeTints.push(1,1,1);solidNormals.push(nx,ny,nz);}
                        // Back face
                        solidPositions.push(d[0],d[1],d[2], c[0],c[1],c[2], b[0],b[1],b[2], d[0],d[1],d[2], b[0],b[1],b[2], a[0],a[1],a[2]);
                        solidUvs.push(u3,v3, u2,v2, u1,v1, u3,v3, u1,v1, u0,v0);
                        for(let i=0;i<6;i++){solidColors.push(_sl,_tl,1.0);solidBiomeTints.push(1,1,1);solidNormals.push(-nx,-ny,-nz);}
                    };
                    
                    // Build geometry at origin (tcx, tcy, tcz) - rotation handles wall offset
                    // Remove the pre-offset since rotation handles it
                    tcx = x + 0.5; tcy = y; tcz = z + 0.5;
                    
                    // 4 side planes (each 4px wide, 11px tall)
                    RQ(tcx-hw, yBot, tcz-inset,  tcx+hw, yBot, tcz-inset,  tcx+hw, yTop, tcz-inset,  tcx-hw, yTop, tcz-inset,
                       su0,svBot, su1,svBot, su1,svTop, su0,svTop, 0,0,-1);
                    RQ(tcx+hw, yBot, tcz+inset,  tcx-hw, yBot, tcz+inset,  tcx-hw, yTop, tcz+inset,  tcx+hw, yTop, tcz+inset,
                       su0,svBot, su1,svBot, su1,svTop, su0,svTop, 0,0,1);
                    RQ(tcx-inset, yBot, tcz+hw,  tcx-inset, yBot, tcz-hw,  tcx-inset, yTop, tcz-hw,  tcx-inset, yTop, tcz+hw,
                       su0,svBot, su1,svBot, su1,svTop, su0,svTop, -1,0,0);
                    RQ(tcx+inset, yBot, tcz-hw,  tcx+inset, yBot, tcz+hw,  tcx+inset, yTop, tcz+hw,  tcx+inset, yTop, tcz-hw,
                       su0,svBot, su1,svBot, su1,svTop, su0,svTop, 1,0,0);
                    
                    // Top face: 2x2px
                    const topY = yTop - 0.0625 + 0.001;
                    const thw = 1/16;
                    RQ(tcx-thw, topY, tcz-thw,  tcx+thw, topY, tcz-thw,  tcx+thw, topY, tcz+thw,  tcx-thw, topY, tcz+thw,
                       tu0,tv0, tu1,tv0, tu1,tv1, tu0,tv1, 0,1,0);
                    
                    // Bottom face: 2x2px (cols 7-8, rows 14-16)
                    const botY = yBot - 0.001;
                    const bu0 = TU(7), bu1 = TU(9);
                    const bv0 = TV(14), bv1 = TV(16);
                    RQ(tcx-thw, botY, tcz+thw,  tcx+thw, botY, tcz+thw,  tcx+thw, botY, tcz-thw,  tcx-thw, botY, tcz-thw,
                       bu0,bv0, bu1,bv0, bu1,bv1, bu0,bv1, 0,-1,0);
                    
                    continue;
                }

                // --- PISTON RENDERING (IDs 207, 208) ---
                if (id === 207 || id === 208) {
                    const pistonDir = (val >> 8) & 0x7;
                    const isExtended = (val >> 11) & 0x1;
                    const isSticky = (id === 208);
                    const dvs = [[0,-1,0],[0,1,0],[0,0,-1],[0,0,1],[-1,0,0],[1,0,0]];
                    const dv = dvs[pistonDir] || [0,1,0];
                    
                    if (!isExtended) {
                        // RETRACTED: Full block. Front/back use pushFace, sides rendered manually for UV rotation.
                        for (let face of blockFaces) {
                            const fd = face.dir;
                            const nx2 = x+fd[0], ny2 = y+fd[1], nz2 = z+fd[2];
                            const nId2 = getVoxel(nx2,ny2,nz2) & 0xFF;
                            if (nId2 !== 0 && !isBlockTransparent(nId2)) continue;
                            const isFront = (fd[0]===dv[0] && fd[1]===dv[1] && fd[2]===dv[2]);
                            const isBack = (fd[0]===-dv[0] && fd[1]===-dv[1] && fd[2]===-dv[2]);
                            
                            if (isFront || isBack) {
                                // Front/back: use pushFace (no rotation needed)
                                let tex = isFront ? (isSticky ? 169 : 168) : 165;
                                pushFace(x, y, z, face, solidPositions, solidNormals, solidUvs, solidColors, solidBiomeTints, id, null, {customTex: tex}, val);
                            } else {
                                // Side face: rotate UV so wooden strip (top of texture) faces piston direction
                                const tgx = 167%16, tgy = Math.floor(167/16);
                                const tu0=tgx/16, tv0=1-(tgy+1)/16, tu1=(tgx+1)/16, tv1=1-tgy/16;
                                
                                const flx=x+fd[0], fly=y+fd[1], flz=z+fd[2];
                                const fsl=getSunLight(flx,fly,flz)/15.0;
                                const ftl=getTorchLight(flx,fly,flz)/15.0;
                                const fsh=(fd[1]===1)?1.0:(fd[1]===-1)?0.6:(fd[0]!==0)?0.7:0.8;
                                
                                // Determine UV rotation based on piston direction relative to this face
                                // The "top" of the texture (v=v1) should map to the edge closest to the piston face
                                // face.corners: [{pos, uv}x4] - uv[0]=u, uv[1]=v where v=1 is top, v=0 is bottom
                                
                                // For a side face, we need to figure out which corner edge is toward the piston dir
                                // The piston direction projects onto this face plane
                                const corners = face.corners;
                                
                                // Default UVs from the face corners
                                let uvs = corners.map(cn => [
                                    tu0 + cn.uv[0] * (tu1-tu0),
                                    tv0 + cn.uv[1] * (tv1-tv0)
                                ]);
                                
                                // Check if piston direction aligns with the "up" direction of this face's UV
                                // For vertical faces (fd[1]=0): uv[1]=1 maps to y=1 (top of block)
                                // If piston faces up (dv[1]=1): top of texture should be at top -> no rotation
                                // If piston faces down (dv[1]=-1): top of texture at bottom -> flip V
                                // If piston faces horizontally: top of texture should be toward piston face
                                
                                // For Y-axis faces (top/bottom of block being used as "side"):
                                // these shouldn't normally be sides of a piston, but handle anyway
                                
                                // Rotate UV so wooden strip (top of texture) faces piston direction
                                if (dv[1] === 1) {
                                    // Piston faces up: strip at top of vertical faces (default), no change needed
                                } else if (dv[1] === -1) {
                                    if (fd[1] === 0) {
                                        // Vertical side: flip V so strip faces down
                                        uvs = corners.map(cn => [
                                            tu0 + cn.uv[0] * (tu1-tu0),
                                            tv0 + (1-cn.uv[1]) * (tv1-tv0)
                                        ]);
                                    }
                                    // Top/bottom faces don't need rotation for up/down pistons
                                } else {
                                    // Horizontal piston: rotate UVs based on face orientation
                                    if (fd[1] === 0) {
                                        // Vertical side face: rotate 90° so strip faces piston dir
                                        uvs = corners.map(cn => {
                                            // Distance along piston axis (0=back, 1=front), always positive
                                            let pDist = cn.pos[0]*dv[0] + cn.pos[1]*dv[1] + cn.pos[2]*dv[2];
                                            if (dv[0]<0||dv[1]<0||dv[2]<0) pDist = 1 + pDist; // fix for negative dirs
                                            let otherVal = 0;
                                            for (let a = 0; a < 3; a++) {
                                                if (fd[a] !== 0 || dv[a] !== 0) continue;
                                                otherVal = cn.pos[a];
                                            }
                                            return [tu0 + otherVal*(tu1-tu0), tv0 + pDist*(tv1-tv0)];
                                        });
                                    } else {
                                        // Top or bottom face of horizontal piston
                                        uvs = corners.map(cn => {
                                            let pDist = cn.pos[0]*dv[0] + cn.pos[1]*dv[1] + cn.pos[2]*dv[2];
                                            if (dv[0]<0||dv[1]<0||dv[2]<0) pDist = 1 + pDist;
                                            let otherVal = 0;
                                            for (let a = 0; a < 3; a++) {
                                                if (a === 1) continue;
                                                if (dv[a] !== 0) continue;
                                                otherVal = cn.pos[a];
                                            }
                                            return [tu0 + otherVal*(tu1-tu0), tv0 + pDist*(tv1-tv0)];
                                        });
                                    }
                                }
                                
                                // Push vertices
                                const mc = corners;
                                solidPositions.push(
                                    x+mc[0].pos[0],y+mc[0].pos[1],z+mc[0].pos[2],
                                    x+mc[1].pos[0],y+mc[1].pos[1],z+mc[1].pos[2],
                                    x+mc[2].pos[0],y+mc[2].pos[1],z+mc[2].pos[2],
                                    x+mc[0].pos[0],y+mc[0].pos[1],z+mc[0].pos[2],
                                    x+mc[2].pos[0],y+mc[2].pos[1],z+mc[2].pos[2],
                                    x+mc[3].pos[0],y+mc[3].pos[1],z+mc[3].pos[2]);
                                for (let ci of [0,1,2,0,2,3]) solidUvs.push(uvs[ci][0], uvs[ci][1]);
                                for(let fi=0;fi<6;fi++){solidColors.push(fsl*fsh,ftl*fsh,fsh);solidBiomeTints.push(1,1,1);solidNormals.push(fd[0],fd[1],fd[2]);}
                            }
                        }
                    } else {
                        // EXTENDED: 12px base + arm + head
                        // Base uses modified blockFaces for proper lighting
                        const BF = 12/16;
                        
                        // Render base (12/16 shortened block)
                        for (let face of blockFaces) {
                            const fd = face.dir;
                            const isFront = (fd[0]===dv[0] && fd[1]===dv[1] && fd[2]===dv[2]);
                            const isBack = (fd[0]===-dv[0] && fd[1]===-dv[1] && fd[2]===-dv[2]);
                            
                            if (isFront) continue; // front face drawn separately as inside face
                            
                            if (!isBack) {
                                const nx2 = x+fd[0], ny2 = y+fd[1], nz2 = z+fd[2];
                                const nId2 = getVoxel(nx2,ny2,nz2) & 0xFF;
                                if (nId2 !== 0 && !isBlockTransparent(nId2)) continue;
                            }
                            
                            let tex = isBack ? 165 : 167;
                            
                            // Modify corners to shrink in piston direction
                            const modCorners = face.corners.map(cn => {
                                let p = [cn.pos[0], cn.pos[1], cn.pos[2]];
                                if (dv[0]===1) p[0] = Math.min(p[0], BF);
                                else if (dv[0]===-1) p[0] = Math.max(p[0], 1-BF);
                                if (dv[1]===1) p[1] = Math.min(p[1], BF);
                                else if (dv[1]===-1) p[1] = Math.max(p[1], 1-BF);
                                if (dv[2]===1) p[2] = Math.min(p[2], BF);
                                else if (dv[2]===-1) p[2] = Math.max(p[2], 1-BF);
                                return { pos: p, uv: cn.uv };
                            });
                            
                            const tgx = tex%16, tgy = Math.floor(tex/16);
                            const tu0=tgx/16, tv0=1-(tgy+1)/16, tu1=(tgx+1)/16, tv1=1-tgy/16;
                            const flx=x+fd[0], fly=y+fd[1], flz=z+fd[2];
                            const sl2 = getSunLight(flx,fly,flz)/15.0;
                            const tl2 = getTorchLight(flx,fly,flz)/15.0;
                            const sh2 = (fd[1]===1)?1.0:(fd[1]===-1)?0.6:(fd[0]!==0)?0.7:0.8;
                            
                            const mc = modCorners;
                            solidPositions.push(
                                x+mc[0].pos[0],y+mc[0].pos[1],z+mc[0].pos[2],
                                x+mc[1].pos[0],y+mc[1].pos[1],z+mc[1].pos[2],
                                x+mc[2].pos[0],y+mc[2].pos[1],z+mc[2].pos[2],
                                x+mc[0].pos[0],y+mc[0].pos[1],z+mc[0].pos[2],
                                x+mc[2].pos[0],y+mc[2].pos[1],z+mc[2].pos[2],
                                x+mc[3].pos[0],y+mc[3].pos[1],z+mc[3].pos[2]);
                            
                            if (!isBack) {
                                // Side: scale UV to 12/16
                                const sv12 = tv0 + (tv1-tv0)*12/16;
                                for (let ci of [0,1,2,0,2,3]) {
                                    solidUvs.push(tu0+mc[ci].uv[0]*(tu1-tu0), tv0+mc[ci].uv[1]*(sv12-tv0));
                                }
                            } else {
                                for (let ci of [0,1,2,0,2,3]) {
                                    solidUvs.push(tu0+mc[ci].uv[0]*(tu1-tu0), tv0+mc[ci].uv[1]*(tv1-tv0));
                                }
                            }
                            for(let fi=0;fi<6;fi++){solidColors.push(sl2*sh2,tl2*sh2,sh2);solidBiomeTints.push(1,1,1);solidNormals.push(fd[0],fd[1],fd[2]);}
                        }
                        
                        // Inside face (166) at 12/16
                        for (let face of blockFaces) {
                            if (face.dir[0]!==dv[0]||face.dir[1]!==dv[1]||face.dir[2]!==dv[2]) continue;
                            const mc2 = face.corners.map(cn => {
                                let p = [cn.pos[0], cn.pos[1], cn.pos[2]];
                                if (dv[0]===1) p[0]=BF; else if (dv[0]===-1) p[0]=1-BF;
                                if (dv[1]===1) p[1]=BF; else if (dv[1]===-1) p[1]=1-BF;
                                if (dv[2]===1) p[2]=BF; else if (dv[2]===-1) p[2]=1-BF;
                                return { pos: p, uv: cn.uv };
                            });
                            const igx=166%16, igy=Math.floor(166/16);
                            const iu0=igx/16, iv0=1-(igy+1)/16, iu1=(igx+1)/16, iv1=1-igy/16;
                            const ilx=x+dv[0], ily=y+dv[1], ilz=z+dv[2];
                            const sl3=getSunLight(ilx,ily,ilz)/15.0;
                            const tl3=getTorchLight(ilx,ily,ilz)/15.0;
                            const sh3=(dv[1]===1)?1.0:(dv[1]===-1)?0.6:(dv[0]!==0)?0.7:0.8;
                            solidPositions.push(
                                x+mc2[0].pos[0],y+mc2[0].pos[1],z+mc2[0].pos[2],
                                x+mc2[1].pos[0],y+mc2[1].pos[1],z+mc2[1].pos[2],
                                x+mc2[2].pos[0],y+mc2[2].pos[1],z+mc2[2].pos[2],
                                x+mc2[0].pos[0],y+mc2[0].pos[1],z+mc2[0].pos[2],
                                x+mc2[2].pos[0],y+mc2[2].pos[1],z+mc2[2].pos[2],
                                x+mc2[3].pos[0],y+mc2[3].pos[1],z+mc2[3].pos[2]);
                            for(let ci of [0,1,2,0,2,3]) solidUvs.push(iu0+mc2[ci].uv[0]*(iu1-iu0), iv0+mc2[ci].uv[1]*(iv1-iv0));
                            for(let fi=0;fi<6;fi++){solidColors.push(sl3*sh3,tl3*sh3,sh3);solidBiomeTints.push(1,1,1);solidNormals.push(dv[0],dv[1],dv[2]);}
                            break;
                        }
                        
                        // === ARM + HEAD ===
                        {
                            const lx2=x+dv[0], ly2=y+dv[1], lz2=z+dv[2];
                            const sl4=Math.max(getSunLight(x,y,z),getSunLight(lx2,ly2,lz2))/15.0;
                            const tl4=Math.max(getTorchLight(x,y,z),getTorchLight(lx2,ly2,lz2))/15.0;
                            
                            const faceTex = isSticky ? 169 : 168;
                            const fgx=faceTex%16,fgy=Math.floor(faceTex/16);
                            const fu0=fgx/16,fv0=1-(fgy+1)/16,fu1=(fgx+1)/16,fv1=1-fgy/16;
                            const sgx=167%16,sgy=Math.floor(167/16);
                            const su0=sgx/16,sv0=1-(sgy+1)/16,su1=(sgx+1)/16,sv1=1-sgy/16;
                            const s4v0=sv1-(sv1-sv0)*4/16;
                            const rU0=su0,rU1=su1,rV0=sv1-(sv1-sv0)*4/16,rV1=sv1;
                            
                            const PQ2 = (p0,p1,p2,p3, u0,v0,u1,v1,u2,v2,u3,v3, nx,ny,nz) => {
                                const sh=(ny===1)?1.0:(ny===-1)?0.6:(nx!==0)?0.7:0.8;
                                if (_flipWinding) {
                                    // Reverse winding for negative-direction pistons
                                    solidPositions.push(p3[0],p3[1],p3[2],p2[0],p2[1],p2[2],p1[0],p1[1],p1[2],
                                                       p3[0],p3[1],p3[2],p1[0],p1[1],p1[2],p0[0],p0[1],p0[2]);
                                    solidUvs.push(u3,v3,u2,v2,u1,v1,u3,v3,u1,v1,u0,v0);
                                } else {
                                    solidPositions.push(p0[0],p0[1],p0[2],p1[0],p1[1],p1[2],p2[0],p2[1],p2[2],
                                                       p0[0],p0[1],p0[2],p2[0],p2[1],p2[2],p3[0],p3[1],p3[2]);
                                    solidUvs.push(u0,v0,u1,v1,u2,v2,u0,v0,u2,v2,u3,v3);
                                }
                                for(let i=0;i<6;i++){solidColors.push(sl4*sh,tl4*sh,sh);solidBiomeTints.push(1,1,1);solidNormals.push(nx,ny,nz);}
                            };
                            
                            // Position helper: along=piston axis, p1/p2=perpendicular [0..1]
                            const _flipWinding = (pistonDir === 0 || pistonDir === 3 || pistonDir === 5);
                            const W = (along, p1v, p2v) => {
                                if (dv[0]===1)  return [x+along, y+p1v, z+p2v];
                                if (dv[0]===-1) return [x+1-along, y+p1v, z+p2v];
                                if (dv[1]===1)  return [x+p1v, y+along, z+p2v];
                                if (dv[1]===-1) return [x+p1v, y+1-along, z+p2v];
                                if (dv[2]===1)  return [x+p1v, y+p2v, z+along];
                                return [x+p1v, y+p2v, z+1-along];
                            };
                            
                            // World-space normals for perpendicular axes
                            let nP1p,nP1n,nP2p,nP2n;
                            if (Math.abs(dv[0])===1) {nP1p=[0,1,0];nP1n=[0,-1,0];nP2p=[0,0,1];nP2n=[0,0,-1];}
                            else if (Math.abs(dv[1])===1) {nP1p=[1,0,0];nP1n=[-1,0,0];nP2p=[0,0,1];nP2n=[0,0,-1];}
                            else {nP1p=[1,0,0];nP1n=[-1,0,0];nP2p=[0,1,0];nP2n=[0,-1,0];}
                            const nFwd=dv, nBwd=[-dv[0],-dv[1],-dv[2]];
                            
                            const rr=2/16, rc=0.5;
                            const AE=BF+1.0, HF=AE+4/16;
                            
                            // ARM: 4 rect faces
                            PQ2(W(BF,rc-rr,rc-rr),W(BF,rc-rr,rc+rr),W(AE,rc-rr,rc+rr),W(AE,rc-rr,rc-rr),
                                rU0,rV0,rU0,rV1,rU1,rV1,rU1,rV0, nP1n[0],nP1n[1],nP1n[2]);
                            PQ2(W(BF,rc+rr,rc+rr),W(BF,rc+rr,rc-rr),W(AE,rc+rr,rc-rr),W(AE,rc+rr,rc+rr),
                                rU0,rV0,rU0,rV1,rU1,rV1,rU1,rV0, nP1p[0],nP1p[1],nP1p[2]);
                            PQ2(W(BF,rc+rr,rc-rr),W(BF,rc-rr,rc-rr),W(AE,rc-rr,rc-rr),W(AE,rc+rr,rc-rr),
                                rU0,rV0,rU0,rV1,rU1,rV1,rU1,rV0, nP2n[0],nP2n[1],nP2n[2]);
                            PQ2(W(BF,rc-rr,rc+rr),W(BF,rc+rr,rc+rr),W(AE,rc+rr,rc+rr),W(AE,rc-rr,rc+rr),
                                rU0,rV0,rU0,rV1,rU1,rV1,rU1,rV0, nP2p[0],nP2p[1],nP2p[2]);
                            
                            // HEAD: front (piston face)
                            PQ2(W(HF,0,0),W(HF,0,1),W(HF,1,1),W(HF,1,0),
                                fu0,fv0,fu0,fv1,fu1,fv1,fu1,fv0, nFwd[0],nFwd[1],nFwd[2]);
                            // HEAD: back (piston face)
                            PQ2(W(AE,1,0),W(AE,1,1),W(AE,0,1),W(AE,0,0),
                                fu0,fv0,fu0,fv1,fu1,fv1,fu1,fv0, nBwd[0],nBwd[1],nBwd[2]);
                            // HEAD: 4 sides (u=width 16px, v=thickness top 4/16 of texture)
                            PQ2(W(AE,0,0),W(AE,0,1),W(HF,0,1),W(HF,0,0),
                                su0,s4v0,su1,s4v0,su1,sv1,su0,sv1, nP1n[0],nP1n[1],nP1n[2]);
                            PQ2(W(HF,1,0),W(HF,1,1),W(AE,1,1),W(AE,1,0),
                                su0,s4v0,su1,s4v0,su1,sv1,su0,sv1, nP1p[0],nP1p[1],nP1p[2]);
                            PQ2(W(AE,1,0),W(AE,0,0),W(HF,0,0),W(HF,1,0),
                                su0,s4v0,su1,s4v0,su1,sv1,su0,sv1, nP2n[0],nP2n[1],nP2n[2]);
                            PQ2(W(AE,0,1),W(AE,1,1),W(HF,1,1),W(HF,0,1),
                                su0,s4v0,su1,s4v0,su1,sv1,su0,sv1, nP2p[0],nP2p[1],nP2p[2]);
                        }
                    }
                    
                    continue;
                }

                // --- REDSTONE DUST RENDERING (ID 202) ---
                if (id === 202) {
                    const power = (val >> 8) & 0xF;
                    const tintR = 0.3 + (power / 15) * 0.7;
                    const tintG = 0.0;
                    const tintB = 0.0;
                    
                    const sl = getSunLight(x, y, z) / 15.0;
                    const tl = getTorchLight(x, y, z) / 15.0;
                    
                    // Helper to push a tinted quad
                    const RQ = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                               au,av, bu,bv, cu,cv, du,dv, nx,ny,nz, shade) => {
                        solidPositions.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
                        solidUvs.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
                        for(let i=0;i<6;i++) {
                            solidColors.push(sl*shade, tl*shade, shade);
                            solidBiomeTints.push(tintR, tintG, tintB);
                            solidNormals.push(nx,ny,nz);
                        }
                    };
                    
                    // Check horizontal connections (same level)
                    const isRSAt = (nx, ny, nz) => (getVoxel(nx, ny, nz) & 0xFF) === 202;
                    const isSolid = (nx, ny, nz) => { const nid = getVoxel(nx, ny, nz) & 0xFF; return nid !== 0 && !isFluidBlock(nid) && !isCrossBlock(nid) && nid !== 202 && nid !== 203 && !isBlockTransparent(nid); };
                    
                    // Horizontal connections
                    let connXP = isRSAt(x+1, y, z) || (getVoxel(x+1, y, z) & 0xFF) === 203;
                    let connXN = isRSAt(x-1, y, z) || (getVoxel(x-1, y, z) & 0xFF) === 203;
                    let connZP = isRSAt(x, y, z+1) || (getVoxel(x, y, z+1) & 0xFF) === 203;
                    let connZN = isRSAt(x, y, z-1) || (getVoxel(x, y, z-1) & 0xFF) === 203;
                    
                    // Vertical connections: dust goes UP a block
                    // If neighbor is solid and there's dust on top of it, connect up
                    const upXP = isSolid(x+1, y, z) && isRSAt(x+1, y+1, z);
                    const upXN = isSolid(x-1, y, z) && isRSAt(x-1, y+1, z);
                    const upZP = isSolid(x, y, z+1) && isRSAt(x, y+1, z+1);
                    const upZN = isSolid(x, y, z-1) && isRSAt(x, y+1, z-1);
                    
                    // Vertical connections: dust goes DOWN a block
                    // If neighbor is air and there's dust one level down, connect down
                    const dnXP = !isSolid(x+1, y, z) && isRSAt(x+1, y-1, z);
                    const dnXN = !isSolid(x-1, y, z) && isRSAt(x-1, y-1, z);
                    const dnZP = !isSolid(x, y, z+1) && isRSAt(x, y+1-2, z+1);
                    const dnZN = !isSolid(x, y, z-1) && isRSAt(x, y+1-2, z-1);
                    
                    // Include vertical in connection count
                    if (upXP || dnXP) connXP = true;
                    if (upXN || dnXN) connXN = true;
                    if (upZP || dnZP) connZP = true;
                    if (upZN || dnZN) connZN = true;
                    
                    const connCount = (connXP?1:0) + (connXN?1:0) + (connZP?1:0) + (connZN?1:0);
                    
                    // Choose texture: line for 2 opposing connections, cross/dot otherwise
                    const isLine = connCount === 2 && ((connXP && connXN) || (connZP && connZN));
                    const texIdx = isLine ? 161 : 160;
                    const gx = texIdx % 16, gy = Math.floor(texIdx / 16);
                    const e = 0.005;
                    const u0 = (gx + e) / 16, u1 = (gx + 1 - e) / 16;
                    const v0 = 1 - (gy + 1 - e) / 16, v1 = 1 - (gy + e) / 16;
                    
                    // Flat top quad
                    const dustY = y + 1/16 + 0.001;
                    if (isLine && connZP && connZN) {
                        RQ(x,dustY,z, x,dustY,z+1, x+1,dustY,z+1, x+1,dustY,z,
                           u0,v0, u1,v0, u1,v1, u0,v1, 0,1,0, 1.0);
                    } else {
                        RQ(x,dustY,z, x,dustY,z+1, x+1,dustY,z+1, x+1,dustY,z,
                           u0,v0, u0,v1, u1,v1, u1,v0, 0,1,0, 1.0);
                    }
                    
                    // Vertical side textures: draw redstone line texture on the side face going up
                    // Use the line texture (161) for vertical runs
                    const vtx = 161;
                    const vgx = vtx % 16, vgy = Math.floor(vtx / 16);
                    const vu0 = (vgx + e) / 16, vu1 = (vgx + 1 - e) / 16;
                    const vv0 = 1 - (vgy + 1 - e) / 16, vv1 = 1 - (vgy + e) / 16;
                    
                    if (upXP) { // Redstone goes up on +X face
                        const wx = x + 1 - 0.001;
                        RQ(wx,y,z, wx,y,z+1, wx,y+1,z+1, wx,y+1,z,
                           vu0,vv0, vu0,vv1, vu1,vv1, vu1,vv0, -1,0,0, 0.8);
                    }
                    if (upXN) { // Redstone goes up on -X face
                        const wx = x + 0.001;
                        RQ(wx,y,z+1, wx,y,z, wx,y+1,z, wx,y+1,z+1,
                           vu0,vv0, vu0,vv1, vu1,vv1, vu1,vv0, 1,0,0, 0.8);
                    }
                    if (upZP) { // Redstone goes up on +Z face
                        const wz = z + 1 - 0.001;
                        RQ(x+1,y,wz, x,y,wz, x,y+1,wz, x+1,y+1,wz,
                           vu0,vv0, vu0,vv1, vu1,vv1, vu1,vv0, 0,0,-1, 0.6);
                    }
                    if (upZN) { // Redstone goes up on -Z face
                        const wz = z + 0.001;
                        RQ(x,y,wz, x+1,y,wz, x+1,y+1,wz, x,y+1,wz,
                           vu0,vv0, vu0,vv1, vu1,vv1, vu1,vv0, 0,0,1, 0.6);
                    }
                    
                    continue;
                }

                // --- WOOD BUTTON RENDERING (ID 203) ---
                if (id === 203) {
                    const bdir = (val >> 8) & 0x3;
                    const pressed = (val >> 10) & 0x1;
                    const dp = pressed ? 1/16 : 2/16;
                    const dpPx = pressed ? 1 : 2;
                    
                    const texIdx = 32;
                    const tgx = texIdx % 16, tgy = Math.floor(texIdx / 16);
                    const U = (px) => (tgx + px/16) / 16;
                    const V = (py) => 1 - (tgy + py/16) / 16;
                    
                    const bsl = getSunLight(x, y, z) / 15.0;
                    const btl = getTorchLight(x, y, z) / 15.0;
                    
                    const BQ = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                               au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
                        let sh = 1.0;
                        if (ny === -1) sh = 0.5; else if (nx !== 0) sh = 0.8; else if (nz !== 0) sh = 0.6;
                        solidPositions.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
                        solidUvs.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
                        for(let i=0;i<6;i++) { solidColors.push(bsl*sh,btl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(nx,ny,nz); }
                    };
                    
                    // Compute box corners
                    let bx0, bx1, by0, by1, bz0, bz1;
                    by0 = y + 6/16; by1 = y + 10/16;
                    if (bdir === 0) { bx0 = x+5/16; bx1 = x+11/16; bz0 = z+1-dp; bz1 = z+1; }
                    else if (bdir === 1) { bx0 = x+1-dp; bx1 = x+1; bz0 = z+5/16; bz1 = z+11/16; }
                    else if (bdir === 2) { bx0 = x+5/16; bx1 = x+11/16; bz0 = z; bz1 = z+dp; }
                    else { bx0 = x; bx1 = x+dp; bz0 = z+5/16; bz1 = z+11/16; }
                    
                    // UVs: front face = 6x4 pixels, top/bottom = 6xdepth, sides = depthx4
                    const ff0 = U(5), ff1 = U(11), fg0 = V(6), fg1 = V(10);
                    const tf0 = U(5), tf1 = U(11), tg0 = V(6), tg1 = V(6+dpPx);
                    const sf0 = U(5), sf1 = U(5+dpPx), sg0 = V(6), sg1 = V(10);
                    
                    // Which faces are "front" (6x4) vs "side" (depthx4) vs "top" (6xdepth)?
                    const isFrontX = (bdir === 1 || bdir === 3); // front faces are +X/-X
                    const isFrontZ = (bdir === 0 || bdir === 2); // front faces are +Z/-Z
                    
                    // Winding from blockFaces (proven correct):
                    // +X: (x1,y1,z1),(x1,y0,z1),(x1,y0,z0),(x1,y1,z0)
                    BQ(bx1,by1,bz1, bx1,by0,bz1, bx1,by0,bz0, bx1,by1,bz0,
                       isFrontX?ff0:sf0, isFrontX?fg0:sg0, isFrontX?ff0:sf0, isFrontX?fg1:sg1, isFrontX?ff1:sf1, isFrontX?fg1:sg1, isFrontX?ff1:sf1, isFrontX?fg0:sg0, 1,0,0);
                    // -X: (x0,y1,z0),(x0,y0,z0),(x0,y0,z1),(x0,y1,z1)
                    BQ(bx0,by1,bz0, bx0,by0,bz0, bx0,by0,bz1, bx0,by1,bz1,
                       isFrontX?ff0:sf0, isFrontX?fg0:sg0, isFrontX?ff0:sf0, isFrontX?fg1:sg1, isFrontX?ff1:sf1, isFrontX?fg1:sg1, isFrontX?ff1:sf1, isFrontX?fg0:sg0, -1,0,0);
                    // +Y: (x0,y1,z0),(x0,y1,z1),(x1,y1,z1),(x1,y1,z0)
                    BQ(bx0,by1,bz0, bx0,by1,bz1, bx1,by1,bz1, bx1,by1,bz0,
                       tf0,tg0, tf0,tg1, tf1,tg1, tf1,tg0, 0,1,0);
                    // -Y: (x0,y0,z1),(x0,y0,z0),(x1,y0,z0),(x1,y0,z1)
                    BQ(bx0,by0,bz1, bx0,by0,bz0, bx1,by0,bz0, bx1,by0,bz1,
                       tf0,tg0, tf0,tg1, tf1,tg1, tf1,tg0, 0,-1,0);
                    // +Z: (x0,y1,z1),(x0,y0,z1),(x1,y0,z1),(x1,y1,z1)
                    BQ(bx0,by1,bz1, bx0,by0,bz1, bx1,by0,bz1, bx1,by1,bz1,
                       isFrontZ?ff0:sf0, isFrontZ?fg0:sg0, isFrontZ?ff0:sf0, isFrontZ?fg1:sg1, isFrontZ?ff1:sf1, isFrontZ?fg1:sg1, isFrontZ?ff1:sf1, isFrontZ?fg0:sg0, 0,0,1);
                    // -Z: (x1,y1,z0),(x1,y0,z0),(x0,y0,z0),(x0,y1,z0)
                    BQ(bx1,by1,bz0, bx1,by0,bz0, bx0,by0,bz0, bx0,by1,bz0,
                       isFrontZ?ff0:sf0, isFrontZ?fg0:sg0, isFrontZ?ff0:sf0, isFrontZ?fg1:sg1, isFrontZ?ff1:sf1, isFrontZ?fg1:sg1, isFrontZ?ff1:sf1, isFrontZ?fg0:sg0, 0,0,-1);
                    
                    continue;
                }

                // --- LEVER RENDERING (ID 205) ---
                if (id === 205) {
                    const ldir = (val >> 8) & 0x3;
                    const leverOn = (val >> 10) & 0x1;
                    
                    const lsl = getSunLight(x, y, z) / 15.0;
                    const ltl = getTorchLight(x, y, z) / 15.0;
                    
                    const LQ = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                               au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
                        let sh = 1.0;
                        if (ny === -1) sh = 0.5; else if (nx !== 0) sh = 0.8; else if (nz !== 0) sh = 0.6;
                        solidPositions.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
                        solidUvs.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
                        for(let i=0;i<6;i++) { solidColors.push(lsl*sh,ltl*sh,sh); solidBiomeTints.push(1,1,1); solidNormals.push(nx,ny,nz); }
                    };
                    
                    // Cobblestone UV helper (atlas 36)
                    const cgx = 36 % 16, cgy = Math.floor(36 / 16);
                    const CU = (px) => (cgx + px/16) / 16;
                    const CV = (py) => 1 - (cgy + py/16) / 16;
                    
                    // --- BASE PLATE ---
                    // MC lever base: 4px wide x 6px tall x 2px deep, centered on wall face
                    let bx0, bx1, by0b, by1b, bz0, bz1;
                    by0b = y + 5/16; by1b = y + 11/16; // 6px tall centered
                    if (ldir === 0) { bx0=x+6/16; bx1=x+10/16; bz0=z+1-2/16; bz1=z+1; }
                    else if (ldir === 1) { bx0=x+1-2/16; bx1=x+1; bz0=z+6/16; bz1=z+10/16; }
                    else if (ldir === 2) { bx0=x+6/16; bx1=x+10/16; bz0=z; bz1=z+2/16; }
                    else { bx0=x; bx1=x+2/16; bz0=z+6/16; bz1=z+10/16; }
                    
                    // UV pixel crops from cobblestone (atlas 36):
                    // Wide=4px, Tall=6px, Depth=2px
                    const cw0=CU(6),cw1=CU(10);   // 4px wide
                    const ch0=CV(5),ch1=CV(11);    // 6px tall
                    const cd0=CU(7),cd1=CU(9);    // 2px depth
                    const ct0=CV(7),ct1=CV(9);     // 2px depth for top/bottom
                    
                    if (ldir === 0 || ldir === 2) {
                        // +-Z walls: X=wide(4), Y=tall(6), Z=depth(2)
                        LQ(bx1,by1b,bz1, bx1,by0b,bz1, bx1,by0b,bz0, bx1,by1b,bz0, cd0,ch0, cd0,ch1, cd1,ch1, cd1,ch0, 1,0,0);
                        LQ(bx0,by1b,bz0, bx0,by0b,bz0, bx0,by0b,bz1, bx0,by1b,bz1, cd0,ch0, cd0,ch1, cd1,ch1, cd1,ch0, -1,0,0);
                        LQ(bx0,by1b,bz0, bx0,by1b,bz1, bx1,by1b,bz1, bx1,by1b,bz0, cw0,ct0, cw0,ct1, cw1,ct1, cw1,ct0, 0,1,0);
                        LQ(bx0,by0b,bz1, bx0,by0b,bz0, bx1,by0b,bz0, bx1,by0b,bz1, cw0,ct0, cw0,ct1, cw1,ct1, cw1,ct0, 0,-1,0);
                        LQ(bx0,by1b,bz1, bx0,by0b,bz1, bx1,by0b,bz1, bx1,by1b,bz1, cw0,ch0, cw0,ch1, cw1,ch1, cw1,ch0, 0,0,1);
                        LQ(bx1,by1b,bz0, bx1,by0b,bz0, bx0,by0b,bz0, bx0,by1b,bz0, cw0,ch0, cw0,ch1, cw1,ch1, cw1,ch0, 0,0,-1);
                    } else {
                        // +-X walls: Z=wide(4), Y=tall(6), X=depth(2)
                        LQ(bx1,by1b,bz1, bx1,by0b,bz1, bx1,by0b,bz0, bx1,by1b,bz0, cw0,ch0, cw0,ch1, cw1,ch1, cw1,ch0, 1,0,0);
                        LQ(bx0,by1b,bz0, bx0,by0b,bz0, bx0,by0b,bz1, bx0,by1b,bz1, cw0,ch0, cw0,ch1, cw1,ch1, cw1,ch0, -1,0,0);
                        // +Y top: CCW viewed from above = (x0,z1)->(x1,z1)->(x1,z0)->(x0,z0)
                        LQ(bx0,by1b,bz1, bx1,by1b,bz1, bx1,by1b,bz0, bx0,by1b,bz0, ct0,cw1, ct1,cw1, ct1,cw0, ct0,cw0, 0,1,0);
                        // -Y bottom: CCW viewed from below = (x0,z0)->(x1,z0)->(x1,z1)->(x0,z1)
                        LQ(bx0,by0b,bz0, bx1,by0b,bz0, bx1,by0b,bz1, bx0,by0b,bz1, ct0,cw0, ct1,cw0, ct1,cw1, ct0,cw1, 0,-1,0);
                        LQ(bx0,by1b,bz1, bx0,by0b,bz1, bx1,by0b,bz1, bx1,by1b,bz1, cd0,ch0, cd0,ch1, cd1,ch1, cd1,ch0, 0,0,1);
                        LQ(bx1,by1b,bz0, bx1,by0b,bz0, bx0,by0b,bz0, bx0,by1b,bz0, cd0,ch0, cd0,ch1, cd1,ch1, cd1,ch0, 0,0,-1);
                    }
                    
                    // --- LEVER STICK ---
                    // Pivot: on the outer surface of base, recessed 1px into plate for joint look
                    let pcx = (bx0 + bx1) / 2;
                    const pcy = (by0b + by1b) / 2;
                    let pcz = (bz0 + bz1) / 2;
                    if (ldir === 0) pcz = bz0 + 1/16;
                    else if (ldir === 1) pcx = bx0 + 1/16;
                    else if (ldir === 2) pcz = bz1 - 1/16;
                    else pcx = bx1 - 1/16;
                    
                    // Stick: 2x2x7 pixels
                    const stLen = 6/16;
                    const tAng = 0.85; // ~49 degrees
                    const cT = Math.cos(tAng), sT = Math.sin(tAng);
                    
                    // Tip offset: vertical + horizontal tilt
                    // Horizontal always goes OUTWARD from wall (same direction both states)
                    // Vertical goes UP when off, DOWN when on
                    let hx = 0, hz = 0;
                    const hy = leverOn ? -(cT * stLen) : (cT * stLen);
                    const hOut = sT * stLen;
                    // Always tilt outward (away from wall)
                    if (ldir === 0) hz = -hOut;      // +Z wall → outward is -Z
                    else if (ldir === 1) hx = -hOut;  // +X wall → outward is -X
                    else if (ldir === 2) hz = hOut;    // -Z wall → outward is +Z
                    else hx = hOut;                     // -X wall → outward is +X
                    
                    const tipX = pcx + hx, tipY = pcy + hy, tipZ = pcz + hz;
                    const sw = 0.75/16; // slightly thinner handle
                    
                    // Lever texture UVs (atlas 162): stick at pixels 7-8, rows 6-16
                    const sgx = 162 % 16, sgy = Math.floor(162 / 16);
                    const SU = (px) => (sgx + px/16) / 16;
                    const SV = (py) => 1 - (sgy + py/16) / 16;
                    // Side: 2x7 pixels from lever texture
                    const su0=SU(7),su1=SU(9),sv0=SV(6),sv1=SV(13); // 2x7 pixels
                    // Cap: 2x2 tip
                    const cu0=SU(7),cu1=SU(9),cv0=SV(6),cv1=SV(8);
                    
                    // Build the stick as a proper oriented rectangular prism
                    // Compute the stick axis vector and two perpendicular vectors
                    const axX = tipX - pcx, axY = tipY - pcy, axZ = tipZ - pcz;
                    
                    // We need two vectors perpendicular to the stick axis
                    // For a wall lever, the stick tilts in one plane, so we can use
                    // world-Y cross stick-axis for one perp, then cross again for the other
                    // Perp1: always along the "width" of the lever (the axis the stick doesn't tilt in)
                    let p1x, p1y, p1z;
                    if (ldir === 0 || ldir === 2) {
                        // Stick tilts in YZ plane, perp1 is along X
                        p1x = sw; p1y = 0; p1z = 0;
                    } else {
                        // Stick tilts in YX plane, perp1 is along Z
                        p1x = 0; p1y = 0; p1z = sw;
                    }
                    
                    // Perp2: perpendicular to both axis and perp1
                    // cross(axis, perp1) normalized and scaled by sw
                    let c2x = axY * p1z - axZ * p1y;
                    let c2y = axZ * p1x - axX * p1z;
                    let c2z = axX * p1y - axY * p1x;
                    const c2len = Math.sqrt(c2x*c2x + c2y*c2y + c2z*c2z);
                    if (c2len > 0.001) { c2x = c2x/c2len*sw; c2y = c2y/c2len*sw; c2z = c2z/c2len*sw; }
                    
                    // 8 corners of the stick prism
                    // Bottom face (at pivot): 4 corners = pivot ± perp1 ± perp2
                    const b0x=pcx-p1x-c2x, b0y=pcy-p1y-c2y, b0z=pcz-p1z-c2z;
                    const b1x=pcx+p1x-c2x, b1y=pcy+p1y-c2y, b1z=pcz+p1z-c2z;
                    const b2x=pcx+p1x+c2x, b2y=pcy+p1y+c2y, b2z=pcz+p1z+c2z;
                    const b3x=pcx-p1x+c2x, b3y=pcy-p1y+c2y, b3z=pcz-p1z+c2z;
                    // Top face (at tip): same offsets from tip
                    const t0x=tipX-p1x-c2x, t0y=tipY-p1y-c2y, t0z=tipZ-p1z-c2z;
                    const t1x=tipX+p1x-c2x, t1y=tipY+p1y-c2y, t1z=tipZ+p1z-c2z;
                    const t2x=tipX+p1x+c2x, t2y=tipY+p1y+c2y, t2z=tipZ+p1z+c2z;
                    const t3x=tipX-p1x+c2x, t3y=tipY-p1y+c2y, t3z=tipZ-p1z+c2z;
                    
                    // 4 side faces (double-sided for safety)
                    // Face along +perp1 direction
                    LQ(b1x,b1y,b1z, b2x,b2y,b2z, t2x,t2y,t2z, t1x,t1y,t1z,
                       su0,sv1, su1,sv1, su1,sv0, su0,sv0, p1x,p1y,p1z);
                    LQ(t1x,t1y,t1z, t2x,t2y,t2z, b2x,b2y,b2z, b1x,b1y,b1z,
                       su0,sv0, su1,sv0, su1,sv1, su0,sv1, -p1x,-p1y,-p1z);
                    // Face along -perp1
                    LQ(b3x,b3y,b3z, b0x,b0y,b0z, t0x,t0y,t0z, t3x,t3y,t3z,
                       su0,sv1, su1,sv1, su1,sv0, su0,sv0, -p1x,-p1y,-p1z);
                    LQ(t3x,t3y,t3z, t0x,t0y,t0z, b0x,b0y,b0z, b3x,b3y,b3z,
                       su0,sv0, su1,sv0, su1,sv1, su0,sv1, p1x,p1y,p1z);
                    // Face along +perp2
                    LQ(b2x,b2y,b2z, b3x,b3y,b3z, t3x,t3y,t3z, t2x,t2y,t2z,
                       su0,sv1, su1,sv1, su1,sv0, su0,sv0, c2x,c2y,c2z);
                    LQ(t2x,t2y,t2z, t3x,t3y,t3z, b3x,b3y,b3z, b2x,b2y,b2z,
                       su0,sv0, su1,sv0, su1,sv1, su0,sv1, -c2x,-c2y,-c2z);
                    // Face along -perp2
                    LQ(b0x,b0y,b0z, b1x,b1y,b1z, t1x,t1y,t1z, t0x,t0y,t0z,
                       su0,sv1, su1,sv1, su1,sv0, su0,sv0, -c2x,-c2y,-c2z);
                    LQ(t0x,t0y,t0z, t1x,t1y,t1z, b1x,b1y,b1z, b0x,b0y,b0z,
                       su0,sv0, su1,sv0, su1,sv1, su0,sv1, c2x,c2y,c2z);
                    // Tip cap (perpendicular to stick axis, double-sided)
                    LQ(t0x,t0y,t0z, t3x,t3y,t3z, t2x,t2y,t2z, t1x,t1y,t1z,
                       cu0,cv0, cu0,cv1, cu1,cv1, cu1,cv0, axX,axY,axZ);
                    LQ(t1x,t1y,t1z, t2x,t2y,t2z, t3x,t3y,t3z, t0x,t0y,t0z,
                       cu0,cv0, cu0,cv1, cu1,cv1, cu1,cv0, -axX,-axY,-axZ);
                    
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
                                const wTint = getSmoothedWaterTint(x, z);
                                for (let ft = 0; ft < 6; ft++) {
                                    waterBiomeTints.push(wTint[0], wTint[1], wTint[2]);
                                    waterFluidTypes.push(fluidType);
                                    waterFlowDirs.push(flowDirX, flowDirY);
                                }
                            }
                        }
                    } else { 
                        let draw = false;
                        
                        if (id === 20 && nId === 20 && face.dir[1] !== 0) {
                            draw = false;
                        }
                        else if (nId === 0 || nId === 4 || nId === 27 || isCrossBlock(nId) || isSnowLayer(nId) || nId === 20 || nId === 17 || nId === 54 || nId === 64 || nId === 66 || nId === 67 || nId === 68 || nId === 158 || nId === 90 || isSlabBlock(nId) || isStairBlock(nId) || isFenceBlock(nId) || nId === 149 || nId === 150 || nId === 202 || nId === 203 || nId === 205 || nId === 206) draw = true; 
                        // Extended pistons are partially transparent (arm+head don't fill the block)
                        else if ((nId === 207 || nId === 208) && ((nVal >> 11) & 0x1)) draw = true;
                        
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
        geometry.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(waterBiomeTints, 3));
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
        const lavaTints = new Float32Array(lavaPositions.length).fill(1);
        lavaGeo.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(lavaTints, 3));
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