// ==========================================
// ITEM & BLOCK MESH BUILDER
// ==========================================

function getTerrainPixelData() {
    if (terrainPixelData) return terrainPixelData;
    if (!textureAtlas || !textureAtlas.image) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(textureAtlas.image, 0, 0, 256, 256);
    terrainPixelData = ctx.getImageData(0, 0, 256, 256);
    return terrainPixelData;
}

const toolMaterials = {};

// Router for items
window.buildItemMesh = function(id) {
    // Route materials, saplings, flowers, and bushes to the 3D extruded material mesher
    if ((id >= 112 && id <= 123) || id === 128 || id === 129 || id === 134 || id === 135 || id === 137 || id === 142 || id === 143 || id === 151 || id === 153 || id === 165 || id === 186 || id === 187 || id === 188
        || id === 197 || id === 198 || id === 199 || id === 202 || id === 205 || id === 206 || id === 211 || id === 212 || id === 213
        || id === 23 || id === 53 || id === 24 || id === 116 || id === 117 || id === 118
        || id === 17) return buildMaterialMesh(id);
    // Spawn eggs — use composited canvas texture as flat sprite
    if (id >= 190 && id <= 196) return buildSpawnEggMesh(id);
    // Vine and lilypad: render as flat 3D items like materials
    if (id === 66 || id === 67) return buildFlatBlockItemMesh(id);
    if (id >= 100 && typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id]) return buildToolMesh(id);
    return typeof buildBlockItemMesh === 'function' ? buildBlockItemMesh(id) : new THREE.Group();
};

function buildMaterialMesh(id) {
    const itemData = TOOL_DATA[id] || BLOCK_DATA[id]; // CHECK BOTH PLACES
    if (!itemData) return new THREE.Group();
    
    let pixData = null;
    try {
        pixData = getTerrainPixelData();
    } catch (e) {
        console.warn("Could not read pixel data for material extrusion.", e);
    }

    const atlasIdx = itemData.atlasIdx;
    const atlasX = (atlasIdx % 16) * 16;
    const atlasY = Math.floor(atlasIdx / 16) * 16;
    
    const positions = [], uvs = [], indices = [];
    let indexOffset = 0;
    const pSize = 1/16, thick = 1/16;

    function addQuad(p1, p2, p3, p4, uMin, vMax, uMax, vMin) {
        positions.push(...p1, ...p2, ...p3, ...p4);
        uvs.push(uMin, vMax, uMax, vMax, uMin, vMin, uMax, vMin);
        indices.push(indexOffset, indexOffset+2, indexOffset+1, indexOffset+2, indexOffset+3, indexOffset+1);
        indexOffset += 4;
    }

    if (pixData && pixData.data) {
        for (let py = 0; py < 16; py++) {
            for (let px = 0; px < 16; px++) {
                const imgX = atlasX + px, imgY = atlasY + py;
                const i = (imgY * 256 + imgX) * 4;
                
                if (pixData.data[i+3] > 5) {
                    const x = (px * pSize) - 0.5;
                    const y = ((15 - py) * pSize) - 0.5;
                    
                    const uMin = imgX / 256, uMax = (imgX + 1) / 256;
                    const vMin = 1.0 - ((imgY + 1) / 256), vMax = 1.0 - (imgY / 256);

                    addQuad([x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], [x, y, thick/2], [x+pSize, y, thick/2], uMin, vMax, uMax, vMin);
                    addQuad([x+pSize, y+pSize, -thick/2], [x, y+pSize, -thick/2], [x+pSize, y, -thick/2], [x, y, -thick/2], uMax, vMax, uMin, vMin);
                    
                    if (py > 0 && pixData.data[((imgY - 1) * 256 + imgX) * 4 + 3] <= 5) addQuad([x, y+pSize, -thick/2], [x+pSize, y+pSize, -thick/2], [x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], uMin, vMax, uMax, vMin);
                    if (py < 15 && pixData.data[((imgY + 1) * 256 + imgX) * 4 + 3] <= 5) addQuad([x, y, thick/2], [x+pSize, y, thick/2], [x, y, -thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
                    if (px > 0 && pixData.data[(imgY * 256 + imgX - 1) * 4 + 3] <= 5) addQuad([x, y+pSize, -thick/2], [x, y+pSize, thick/2], [x, y, -thick/2], [x, y, thick/2], uMin, vMax, uMax, vMin);
                    if (px < 15 && pixData.data[(imgY * 256 + imgX + 1) * 4 + 3] <= 5) addQuad([x+pSize, y+pSize, thick/2], [x+pSize, y+pSize, -thick/2], [x+pSize, y, thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
                }
            }
        }
    } else {
        addQuad([-0.5, 0.5, 0], [0.5, 0.5, 0], [-0.5, -0.5, 0], [0.5, -0.5, 0], atlasX/256, 1.0 - (atlasY/256), (atlasX+16)/256, 1.0 - ((atlasY+16)/256));
        addQuad([0.5, 0.5, -0.01], [-0.5, 0.5, -0.01], [0.5, -0.5, -0.01], [-0.5, -0.5, -0.01], (atlasX+16)/256, 1.0 - (atlasY/256), atlasX/256, 1.0 - ((atlasY+16)/256));
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const colors = new Float32Array(positions.length).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const biomeTints = new Float32Array(positions.length).fill(1);
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));

    if (!toolMaterials[id]) {
        toolMaterials[id] = new THREE.MeshBasicMaterial({ 
            map: textureAtlas, 
            transparent: true, 
            alphaTest: 0.1, 
            vertexColors: true,
            side: THREE.DoubleSide
        });
        if (typeof injectLightingShader === 'function') injectLightingShader(toolMaterials[id]);
    }

    const mesh = new THREE.Mesh(geo, toolMaterials[id]);
    // Material geometry is centered [-0.5..0.5] on XY, flat on Z
    // MC generated.json firstperson: same visual treatment as handheld
    mesh.scale.set(0.68 / 0.35, 0.68 / 0.35, 0.68 / 0.35);
    mesh.position.set(1.13 / 16, -1.0 / 16, -0.35);
    mesh.rotation.set(0, -45 * Math.PI / 180, 25 * Math.PI / 180); 
    
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

function buildToolMesh(id) {
    const tool = TOOL_DATA[id];
    if (!toolPixelData) return new THREE.Group();
    
    const atlasX = (tool.atlasIdx % 16) * 16;
    const atlasY = Math.floor(tool.atlasIdx / 16) * 16;
    
    const positions = [], uvs = [], indices = [];
    let indexOffset = 0;
    const pSize = 1/16, thick = 1/16;

    function addQuad(p1, p2, p3, p4, uMin, vMax, uMax, vMin) {
        positions.push(...p1, ...p2, ...p3, ...p4);
        uvs.push(uMin, vMax, uMax, vMax, uMin, vMin, uMax, vMin);
        indices.push(indexOffset, indexOffset+2, indexOffset+1, indexOffset+2, indexOffset+3, indexOffset+1);
        indexOffset += 4;
    }

    for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
            const imgX = atlasX + px, imgY = atlasY + py;
            const i = (imgY * 256 + imgX) * 4;
            
            // FIX: If the alpha is anything greater than 0, it's a part of the sword
            if (toolPixelData.data[i+3] > 0) {
                const x = px * pSize;
                const y = (15 - py) * pSize;
                
                // Keep the small margin to prevent texture bleeding from neighboring tool icons
                const texMargin = 0.005;
                const uMin = (imgX + texMargin) / 256, uMax = (imgX + 1 - texMargin) / 256;
                const vMin = 1.0 - ((imgY + 1 - texMargin) / 256), vMax = 1.0 - ((imgY + texMargin) / 256);

                // Add Front and Back faces
                addQuad([x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], [x, y, thick/2], [x+pSize, y, thick/2], uMin, vMax, uMax, vMin);
                addQuad([x+pSize, y+pSize, -thick/2], [x, y+pSize, -thick/2], [x+pSize, y, -thick/2], [x, y, -thick/2], uMax, vMax, uMin, vMin);
                
                // --- SIDE FACE CHECKS (WITH BOUNDARY FIX) ---
                
                // 1. Top wall: Draw if at the very top edge OR if the pixel above is transparent
                if (py === 0 || toolPixelData.data[((imgY - 1) * 256 + imgX) * 4 + 3] === 0) {
                    addQuad([x, y+pSize, -thick/2], [x+pSize, y+pSize, -thick/2], [x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], uMin, vMax, uMax, vMin);
                }
                
                // 2. Bottom wall: Draw if at the very bottom edge OR if the pixel below is transparent
                if (py === 15 || toolPixelData.data[((imgY + 1) * 256 + imgX) * 4 + 3] === 0) {
                    addQuad([x, y, thick/2], [x+pSize, y, thick/2], [x, y, -thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
                }
                
                // 3. Left wall: Draw if at the very left edge OR if the pixel to the left is transparent
                if (px === 0 || toolPixelData.data[(imgY * 256 + imgX - 1) * 4 + 3] === 0) {
                    addQuad([x, y+pSize, -thick/2], [x, y+pSize, thick/2], [x, y, -thick/2], [x, y, thick/2], uMin, vMax, uMax, vMin);
                }
                
                // 4. Right wall: Draw if at the very right edge OR if the pixel to the right is transparent
                if (px === 15 || toolPixelData.data[(imgY * 256 + imgX + 1) * 4 + 3] === 0) {
                    addQuad([x+pSize, y+pSize, thick/2], [x+pSize, y+pSize, -thick/2], [x+pSize, y, thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
                }
            }
        }
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const colors = new Float32Array(positions.length).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const biomeTints = new Float32Array(positions.length).fill(1);
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));

    if (!toolMaterials[id]) {
        toolMaterials[id] = new THREE.MeshBasicMaterial({ 
            map: toolTextureAtlas, 
            transparent: true, 
            alphaTest: 0.1, 
            vertexColors: true,
            side: THREE.DoubleSide
        });
        if (typeof injectLightingShader === 'function') injectLightingShader(toolMaterials[id]);
    }

    const mesh = new THREE.Mesh(geo, toolMaterials[id]);
    
    // Tool geometry: flat sprite on XY plane [0..1, 0..1], faces along Z, thickness 1/16
    // heldItemGroup already rotates -45° Y placing the tool at a diagonal
    // MC visual: sword faces camera, tilted diagonally (tip top-left, handle bottom-right)
    // 
    // Coordinate mapping to match MC handheld firstperson:
    //   - Center the sprite at origin (-0.5 on X and Y)
    //   - Tilt ~25° in Z for the diagonal lean (matches MC handheld.json Z=25)
    //   - Small Y rotation to angle the flat face toward camera through the -45° container
    //   - Scale 0.68 is MC's handheld scale; /0.35 compensates for heldItemGroup.scale
    mesh.scale.set(0.68 / 0.35, 0.68 / 0.35, 0.68 / 0.35);
    mesh.rotation.set(0, -45 * Math.PI / 180, 25 * Math.PI / 180);
    mesh.position.set(-0.5 + 1.13 / 16, -0.5 + -1.0 / 16, -0.35);
    
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

function buildBlockItemMesh(blockId) {
    const block = BLOCK_DATA[blockId];
    if (!block || !solidMaterial) return new THREE.Group();
    
    let texIdx = typeof block.atlasIdx === 'object' ? block.atlasIdx.side : block.atlasIdx;
    
    // Slab: half-height box
    if (block.type === 'slab') {
        const geo = new THREE.BoxGeometry(1, 0.5, 1).toNonIndexed();
        const uvs = geo.attributes.uv.array;
        
        // Resolve per-face textures for slabs with different top/side textures
        let slabTexTop, slabTexSide;
        if (typeof block.atlasIdx === 'object') {
            slabTexTop = block.atlasIdx.top;
            slabTexSide = block.atlasIdx.side;
        } else {
            slabTexTop = slabTexSide = block.atlasIdx;
        }
        
        const setFaceUV = (faceIdx, tIdx, halfV) => {
            const col = tIdx % 16, row = Math.floor(tIdx / 16);
            const uMin = col / 16, uMax = (col + 1) / 16;
            const vMax = 1.0 - (row / 16), vMin = 1.0 - ((row + 1) / 16);
            const vMid = halfV ? (vMax + vMin) / 2 : vMin;
            const uvArr = [ uMin, vMax, uMin, vMid, uMax, vMax, uMin, vMid, uMax, vMid, uMax, vMax ];
            for(let i=0; i<6; i++) { uvs[(faceIdx * 6 + i) * 2] = uvArr[i*2]; uvs[(faceIdx * 6 + i) * 2 + 1] = uvArr[i*2+1]; }
        };
        // faces: 0=+X side, 1=-X side, 2=top, 3=bottom, 4=+Z side, 5=-Z side
        setFaceUV(0, slabTexSide, true); setFaceUV(1, slabTexSide, true); setFaceUV(2, slabTexTop, false);
        setFaceUV(3, slabTexTop, false); setFaceUV(4, slabTexSide, true); setFaceUV(5, slabTexSide, true);
        const colors = new Float32Array(geo.attributes.position.count * 3).fill(1);
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const biomeTints = new Float32Array(geo.attributes.position.count * 3).fill(1);
        geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));
        const mesh = new THREE.Mesh(geo, solidMaterial);
        mesh.position.set(-0.5, -0.75, -0.5);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.40 / 0.35, 0.40 / 0.35, 0.40 / 0.35);
        const group = new THREE.Group();
        group.add(mesh);
        return group;
    }
    
    // Glass Pane / Iron Bars: thin cross-shaped item mesh
    if (blockId === 68 || blockId === 158) {
        const TX = texIdx % 16, TY = Math.floor(texIdx / 16);
        const U = (px) => (TX + px/16) / 16;
        const V = (py) => 1 - (TY + py/16) / 16;
        
        const pos = [], uv = [], nrm = [];
        
        const Q = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                   au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
            pos.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
            uv.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
            for(let i=0;i<6;i++) nrm.push(nx,ny,nz);
            pos.push(ax,ay,az, cx,cy,cz, bx,by,bz, ax,ay,az, dx,dy,dz, cx,cy,cz);
            uv.push(au,av, cu,cv, bu,bv, au,av, du,dv, cu,cv);
            for(let i=0;i<6;i++) nrm.push(-nx,-ny,-nz);
        };
        
        const T0 = 7/16, T1 = 9/16;
        const fu0=U(0), fu1=U(16), fv0=V(16), fv1=V(0);
        const eu0=U(7), eu1=U(9);
        
        // X-aligned full-width segment
        // Front face (+Z)
        Q(0,1,T1, 0,0,T1, 1,0,T1, 1,1,T1, fu0,fv1, fu0,fv0, fu1,fv0, fu1,fv1, 0,0,1);
        // Back face (-Z) 
        Q(1,1,T0, 1,0,T0, 0,0,T0, 0,1,T0, fu1,fv1, fu1,fv0, fu0,fv0, fu0,fv1, 0,0,-1);
        // Top
        Q(0,1,T0, 0,1,T1, 1,1,T1, 1,1,T0, eu0,fv1, eu1,fv1, eu1,fv0, eu0,fv0, 0,1,0);
        // Bottom
        Q(0,0,T1, 0,0,T0, 1,0,T0, 1,0,T1, eu0,fv1, eu1,fv1, eu1,fv0, eu0,fv0, 0,-1,0);
        // Left end cap
        Q(0,1,T0, 0,0,T0, 0,0,T1, 0,1,T1, eu0,fv1, eu0,fv0, eu1,fv0, eu1,fv1, -1,0,0);
        // Right end cap
        Q(1,1,T1, 1,0,T1, 1,0,T0, 1,1,T0, eu0,fv1, eu0,fv0, eu1,fv0, eu1,fv1, 1,0,0);
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        const c = new Float32Array(pos.length).fill(1);
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(new Float32Array(pos.length).fill(1), 3));
        
        const mat = blockId === 68 ? (typeof glassMaterial !== 'undefined' ? glassMaterial : solidMaterial) : solidMaterial;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(-0.5, -0.5, -0.5);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.40 / 0.35, 0.40 / 0.35, 0.40 / 0.35);
        const group = new THREE.Group();
        group.add(mesh);
        return group;
    }
    
    // Fence: post + two rails — same UV math as the world fence renderer
    if (typeof isFenceBlock === 'function' && isFenceBlock(blockId)) {
        const TX = texIdx % 16, TY = Math.floor(texIdx / 16);
        const U = (px) => (TX + px/16) / 16;
        const V = (py) => 1 - (TY + py/16) / 16;
        
        const pos = [], uv = [], nrm = [];
        
        const Q = (ax,ay,az, bx,by,bz, cx,cy,cz, dx,dy,dz,
                   au,av, bu,bv, cu,cv, du,dv, nx,ny,nz) => {
            pos.push(ax,ay,az, bx,by,bz, cx,cy,cz, ax,ay,az, cx,cy,cz, dx,dy,dz);
            uv.push(au,av, bu,bv, cu,cv, au,av, cu,cv, du,dv);
            for(let i=0;i<6;i++) nrm.push(nx,ny,nz);
            pos.push(ax,ay,az, cx,cy,cz, bx,by,bz, ax,ay,az, dx,dy,dz, cx,cy,cz);
            uv.push(au,av, cu,cv, bu,bv, au,av, du,dv, cu,cv);
            for(let i=0;i<6;i++) nrm.push(-nx,-ny,-nz);
        };
        
        const P0=6/16, P1=10/16;
        const su0=U(6),su1=U(10),sv0=V(16),sv1=V(0),vt0=V(10),vt1=V(6);
        // Post top/bottom
        Q(P0,1,P0, P0,1,P1, P1,1,P1, P1,1,P0, su0,vt0,su0,vt1,su1,vt1,su1,vt0, 0,1,0);
        Q(P0,0,P1, P0,0,P0, P1,0,P0, P1,0,P1, su0,vt0,su0,vt1,su1,vt1,su1,vt0, 0,-1,0);
        // Post sides
        Q(P0,1,P1, P0,0,P1, P0,0,P0, P0,1,P0, su0,sv1,su0,sv0,su1,sv0,su1,sv1, -1,0,0);
        Q(P1,1,P0, P1,0,P0, P1,0,P1, P1,1,P1, su0,sv1,su0,sv0,su1,sv0,su1,sv1, 1,0,0);
        Q(P0,1,P0, P0,0,P0, P1,0,P0, P1,1,P0, su0,sv1,su0,sv0,su1,sv0,su1,sv1, 0,0,-1);
        Q(P1,1,P1, P1,0,P1, P0,0,P1, P0,1,P1, su0,sv1,su0,sv0,su1,sv0,su1,sv1, 0,0,1);
        
        // Rails along Z
        const bars = [{y0:12,y1:15},{y0:7,y1:10}];
        const RW=2/16, MID=8/16;
        for (const bar of bars) {
            const by0=bar.y0/16, by1=bar.y1/16, rz0=MID-RW/2, rz1=MID+RW/2;
            const rv0=V(bar.y1),rv1=V(bar.y0),tv0=V(9),tv1=V(7);
            Q(0,by1,rz0, 0,by1,rz1, 1,by1,rz1, 1,by1,rz0, U(0),tv0,U(0),tv1,U(16),tv1,U(16),tv0, 0,1,0);
            Q(0,by0,rz1, 0,by0,rz0, 1,by0,rz0, 1,by0,rz1, U(0),tv0,U(0),tv1,U(16),tv1,U(16),tv0, 0,-1,0);
            Q(1,by1,rz0, 1,by0,rz0, 0,by0,rz0, 0,by1,rz0, U(16),rv1,U(16),rv0,U(0),rv0,U(0),rv1, 0,0,-1);
            Q(0,by1,rz1, 0,by0,rz1, 1,by0,rz1, 1,by1,rz1, U(0),rv1,U(0),rv0,U(16),rv0,U(16),rv1, 0,0,1);
        }
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        const c = new Float32Array(pos.length).fill(1);
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(new Float32Array(pos.length).fill(1), 3));
        
        const mesh = new THREE.Mesh(geo, solidMaterial);
        mesh.position.set(-0.5, -0.5, -0.5);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.40 / 0.35, 0.40 / 0.35, 0.40 / 0.35);
        const group = new THREE.Group();
        group.add(mesh);
        return group;
    }
    
    // Stair: two boxes forming an L-shape
    if (block.type === 'stair') {
        const group = new THREE.Group();
        // Bottom half (full width)
        const botGeo = new THREE.BoxGeometry(1, 0.5, 1).toNonIndexed();
        const botUvs = botGeo.attributes.uv.array;
        const setUV = (uvArr, faceIdx, tIdx, halfV) => {
            const col = tIdx % 16, row = Math.floor(tIdx / 16);
            const uMin = col / 16, uMax = (col + 1) / 16;
            const vMax = 1.0 - (row / 16), vMin = 1.0 - ((row + 1) / 16);
            const vMid = halfV ? (vMax + vMin) / 2 : vMin;
            const uv = [ uMin, vMax, uMin, vMid, uMax, vMax, uMin, vMid, uMax, vMid, uMax, vMax ];
            for(let i=0; i<6; i++) { uvArr[(faceIdx * 6 + i) * 2] = uv[i*2]; uvArr[(faceIdx * 6 + i) * 2 + 1] = uv[i*2+1]; }
        };
        for (let f = 0; f < 6; f++) setUV(botUvs, f, texIdx, (f < 2 || f >= 4));
        let c = new Float32Array(botGeo.attributes.position.count * 3).fill(1);
        botGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        let bt = new Float32Array(botGeo.attributes.position.count * 3).fill(1);
        botGeo.setAttribute('aBiomeTint', new THREE.BufferAttribute(bt, 3));
        const botMesh = new THREE.Mesh(botGeo, solidMaterial);
        botMesh.position.set(-0.5, -0.75, -0.5);
        group.add(botMesh);
        // Top half (half width, back portion)
        const topGeo = new THREE.BoxGeometry(1, 0.5, 0.5).toNonIndexed();
        const topUvs = topGeo.attributes.uv.array;
        for (let f = 0; f < 6; f++) setUV(topUvs, f, texIdx, (f < 2 || f >= 4));
        c = new Float32Array(topGeo.attributes.position.count * 3).fill(1);
        topGeo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        bt = new Float32Array(topGeo.attributes.position.count * 3).fill(1);
        topGeo.setAttribute('aBiomeTint', new THREE.BufferAttribute(bt, 3));
        const topMesh = new THREE.Mesh(topGeo, solidMaterial);
        topMesh.position.set(-0.5, -0.25, -0.25);
        group.add(topMesh);
        // MC block.json firstperson_righthand: rotation [0, 45, 0], scale [0.40]
        group.rotation.set(0, 45 * Math.PI / 180, 0);
        group.scale.set(0.40 / 0.35, 0.40 / 0.35, 0.40 / 0.35);
        return group;
    }
    
    // Enchanting table: 12/16 height block (same approach as slab but 0.75 height)
    if (blockId === 201) {
        const geo = new THREE.BoxGeometry(1, 0.75, 1).toNonIndexed();
        const uvs = geo.attributes.uv.array;
        let etTop, etBot, etSide;
        if (typeof block.atlasIdx === 'object') {
            etTop = block.atlasIdx.top; etBot = block.atlasIdx.bottom; etSide = block.atlasIdx.side;
        } else { etTop = etBot = etSide = block.atlasIdx; }
        const setFaceUV = (faceIdx, tIdx, clipV) => {
            const col = tIdx % 16, row = Math.floor(tIdx / 16);
            const uMin = col / 16, uMax = (col + 1) / 16;
            const vMax = 1.0 - (row / 16), vMin = 1.0 - ((row + 1) / 16);
            const vBot = clipV ? vMin + (vMax - vMin) * 0.25 : vMin; // clip top 25% of side texture
            const uvArr = [ uMin, vMax, uMin, vBot, uMax, vMax, uMin, vBot, uMax, vBot, uMax, vMax ];
            for(let i=0; i<6; i++) { uvs[(faceIdx * 6 + i) * 2] = uvArr[i*2]; uvs[(faceIdx * 6 + i) * 2 + 1] = uvArr[i*2+1]; }
        };
        setFaceUV(0, etSide, true); setFaceUV(1, etSide, true); setFaceUV(2, etTop, false);
        setFaceUV(3, etBot, false); setFaceUV(4, etSide, true); setFaceUV(5, etSide, true);
        const colors = new Float32Array(geo.attributes.position.count * 3).fill(1);
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
        const mesh = new THREE.Mesh(geo, solidMaterial);
        mesh.position.set(-0.5, -0.625, -0.5);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.40 / 0.35, 0.40 / 0.35, 0.40 / 0.35);
        const group = new THREE.Group();
        group.add(mesh);
        return group;
    }
    
    const geo = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const uvs = geo.attributes.uv.array;
    // block already declared above
    if (!block || !solidMaterial) return new THREE.Group();
    
    let texTop = 0, texBot = 0, texSide = 0, texSideX = 0, texSideZ = 0;
    if (typeof block.atlasIdx === 'object') {
        texTop = block.atlasIdx.top; 
        texBot = block.atlasIdx.bottom; 
        texSide = block.atlasIdx.side;
        texSideX = block.atlasIdx.sideX !== undefined ? block.atlasIdx.sideX : texSide;
        texSideZ = block.atlasIdx.sideZ !== undefined ? block.atlasIdx.sideZ : texSide;
    } else {
        texTop = texBot = texSide = texSideX = texSideZ = block.atlasIdx;
    }
    
    const setFaceUV = (faceIdx, texIdx) => {
        const col = texIdx % 16, row = Math.floor(texIdx / 16);
        const uMin = col / 16, uMax = (col + 1) / 16, vMax = 1.0 - (row / 16), vMin = 1.0 - ((row + 1) / 16);
        const uvArr = [ uMin, vMax, uMin, vMin, uMax, vMax, uMin, vMin, uMax, vMin, uMax, vMax ];
        for(let i=0; i<6; i++) { uvs[(faceIdx * 6 + i) * 2] = uvArr[i*2]; uvs[(faceIdx * 6 + i) * 2 + 1] = uvArr[i*2+1]; }
    };

    setFaceUV(0, texSideX); setFaceUV(1, texSideX); setFaceUV(2, texTop);  
    setFaceUV(3, texBot); setFaceUV(4, texSideZ); setFaceUV(5, texSideZ);
    
    const colors = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const biomeTints = new Float32Array(geo.attributes.position.count * 3).fill(1);
    
    // Apply green biome tint to held items: grass top face, all faces for plants
    const greenTint = [0.55, 0.75, 0.4];
    if (blockId === 1) {
        // Grass block: tint top face (face index 2 = 6 verts starting at vert 12)
        for (let i = 12 * 3; i < 18 * 3; i += 3) {
            biomeTints[i] = greenTint[0]; biomeTints[i+1] = greenTint[1]; biomeTints[i+2] = greenTint[2];
        }
        // Also tint side faces for the grass overlay effect
        for (let i = 0; i < 12 * 3; i += 3) {
            biomeTints[i] = greenTint[0]; biomeTints[i+1] = greenTint[1]; biomeTints[i+2] = greenTint[2];
        }
        for (let i = 18 * 3; i < biomeTints.length; i += 3) {
            biomeTints[i] = greenTint[0]; biomeTints[i+1] = greenTint[1]; biomeTints[i+2] = greenTint[2];
        }
    } else if ([14, 16, 22, 24, 43, 66, 67].includes(blockId)) {
        // Full plant blocks: tint all faces
        for (let i = 0; i < biomeTints.length; i += 3) {
            biomeTints[i] = greenTint[0]; biomeTints[i+1] = greenTint[1]; biomeTints[i+2] = greenTint[2];
        }
    }
    
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));
    
    const mesh = new THREE.Mesh(geo, solidMaterial);
    
    // MC block.json firstperson_righthand: rotation [0, 45, 0], translation [0, 0, 0], scale [0.40]
    mesh.position.set(-0.5, -0.5, -0.5); 
    mesh.rotation.set(0, 45 * Math.PI / 180, 0);
    mesh.scale.set(0.40 / 0.35, 0.40 / 0.35, 0.40 / 0.35); // ~1.143, compensates for heldItemGroup.scale 
    
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

// Flat 3D item mesh for blocks like vine/lilypad (extruded sprite from terrain atlas with biome tint)
function buildFlatBlockItemMesh(blockId) {
    const block = BLOCK_DATA[blockId];
    if (!block || !textureAtlas || !textureAtlas.image) return new THREE.Group();
    
    const atlasIdx = typeof block.atlasIdx === 'object' ? block.atlasIdx.side : block.atlasIdx;
    const img = textureAtlas.image;
    const canvas = document.createElement('canvas');
    const atlasSize = img.width;
    const tileSize = atlasSize / 16;
    canvas.width = atlasSize; canvas.height = atlasSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    const tileX = (atlasIdx % 16) * tileSize;
    const tileY = Math.floor(atlasIdx / 16) * tileSize;
    const pixelData = ctx.getImageData(tileX, tileY, tileSize, tileSize);
    
    const positions = [], uvs = [], indices = [];
    let indexOffset = 0;
    const pSize = 1 / tileSize, thick = 1 / tileSize;

    function addQuad(p1, p2, p3, p4, uMin, vMax, uMax, vMin) {
        positions.push(...p1, ...p2, ...p3, ...p4);
        uvs.push(uMin, vMax, uMax, vMax, uMin, vMin, uMax, vMin);
        indices.push(indexOffset, indexOffset+2, indexOffset+1, indexOffset+2, indexOffset+3, indexOffset+1);
        indexOffset += 4;
    }

    const texMargin = 0.002;
    for (let py = 0; py < tileSize; py++) {
        for (let px = 0; px < tileSize; px++) {
            const i = (py * tileSize + px) * 4;
            if (pixelData.data[i+3] > 0) {
                const x = px * pSize;
                const y = (tileSize - 1 - py) * pSize;
                const uMin = (tileX + px + texMargin) / atlasSize;
                const uMax = (tileX + px + 1 - texMargin) / atlasSize;
                const vMin = 1.0 - ((tileY + py + 1 - texMargin) / atlasSize);
                const vMax = 1.0 - ((tileY + py + texMargin) / atlasSize);

                addQuad([x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], [x, y, thick/2], [x+pSize, y, thick/2], uMin, vMax, uMax, vMin);
                addQuad([x+pSize, y+pSize, -thick/2], [x, y+pSize, -thick/2], [x+pSize, y, -thick/2], [x, y, -thick/2], uMax, vMax, uMin, vMin);
                
                if (py === 0 || pixelData.data[((py-1)*tileSize+px)*4+3] === 0)
                    addQuad([x, y+pSize, -thick/2], [x+pSize, y+pSize, -thick/2], [x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], uMin, vMax, uMax, vMin);
                if (py === tileSize-1 || pixelData.data[((py+1)*tileSize+px)*4+3] === 0)
                    addQuad([x, y, thick/2], [x+pSize, y, thick/2], [x, y, -thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
                if (px === 0 || pixelData.data[(py*tileSize+px-1)*4+3] === 0)
                    addQuad([x, y+pSize, -thick/2], [x, y+pSize, thick/2], [x, y, -thick/2], [x, y, thick/2], uMin, vMax, uMax, vMin);
                if (px === tileSize-1 || pixelData.data[(py*tileSize+px+1)*4+3] === 0)
                    addQuad([x+pSize, y+pSize, thick/2], [x+pSize, y+pSize, -thick/2], [x+pSize, y, thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
            }
        }
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const colors = new Float32Array(positions.length).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const biomeTints = new Float32Array(positions.length);
    const greenTint = [0.55, 0.75, 0.4];
    for (let i = 0; i < biomeTints.length; i += 3) {
        biomeTints[i] = greenTint[0]; biomeTints[i+1] = greenTint[1]; biomeTints[i+2] = greenTint[2];
    }
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));

    if (!toolMaterials[blockId]) {
        toolMaterials[blockId] = new THREE.MeshBasicMaterial({ 
            map: textureAtlas, transparent: true, alphaTest: 0.1, 
            vertexColors: true, side: THREE.DoubleSide
        });
        if (typeof injectLightingShader === 'function') injectLightingShader(toolMaterials[blockId]);
    }

    const mesh = new THREE.Mesh(geo, toolMaterials[blockId]);
    // Flat block geometry: [0..1] on XY like tools, needs centering
    mesh.scale.set(0.68 / 0.35, 0.68 / 0.35, 0.68 / 0.35);
    mesh.rotation.set(0, -45 * Math.PI / 180, 25 * Math.PI / 180);
    mesh.position.set(-0.5 + 1.13 / 16, -0.5 + -1.0 / 16, -0.35);
    
    const grp = new THREE.Group();
    grp.add(mesh);
    return grp;
}
// --- SPAWN EGG 3D MESH ---
// Extruded pixel mesh composited from base (150) + detail (151) terrain tiles with tint colors
function buildSpawnEggMesh(id) {
    const grp = new THREE.Group();
    
    let pixData = null;
    try { pixData = getTerrainPixelData(); } catch(e) { return grp; }
    if (!pixData || !pixData.data) return grp;

    const colors = typeof SPAWN_EGG_COLORS !== 'undefined' ? SPAWN_EGG_COLORS[id] : null;
    if (!colors) return grp;

    // Read base (150) and detail (151) tiles from terrain atlas, composite with tint
    const baseCol = 150 % 16, baseRow = Math.floor(150 / 16);
    const detCol = 151 % 16, detRow = Math.floor(151 / 16);
    const baseX = baseCol * 16, baseY = baseRow * 16;
    const detX = detCol * 16, detY = detRow * 16;
    const atlasW = 256; // terrain.png is 256px wide

    // Composite into a 16x16 RGBA buffer
    const comp = new Uint8Array(16 * 16 * 4);
    for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
            const ci = (py * 16 + px) * 4;
            // Base layer
            const bi = ((baseY + py) * atlasW + baseX + px) * 4;
            const ba = pixData.data[bi + 3];
            if (ba > 0) {
                const gray = pixData.data[bi] / 255;
                comp[ci] = Math.round(colors.base[0] * gray);
                comp[ci+1] = Math.round(colors.base[1] * gray);
                comp[ci+2] = Math.round(colors.base[2] * gray);
                comp[ci+3] = ba;
            }
            // Detail layer overwrites
            const di = ((detY + py) * atlasW + detX + px) * 4;
            const da = pixData.data[di + 3];
            if (da > 0) {
                const gray = pixData.data[di] / 255;
                comp[ci] = Math.round(colors.detail[0] * gray);
                comp[ci+1] = Math.round(colors.detail[1] * gray);
                comp[ci+2] = Math.round(colors.detail[2] * gray);
                comp[ci+3] = da;
            }
        }
    }

    // Create canvas texture from composited data
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(16, 16);
    imgData.data.set(comp);
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    // Build extruded pixel mesh
    const positions = [], uvs = [], indices = [];
    let indexOffset = 0;
    const pSize = 1/16, thick = 1/16;

    function addQuad(p1, p2, p3, p4, uMin, vMax, uMax, vMin) {
        positions.push(...p1, ...p2, ...p3, ...p4);
        uvs.push(uMin, vMax, uMax, vMax, uMin, vMin, uMax, vMin);
        indices.push(indexOffset, indexOffset+2, indexOffset+1, indexOffset+2, indexOffset+3, indexOffset+1);
        indexOffset += 4;
    }

    for (let py = 0; py < 16; py++) {
        for (let px = 0; px < 16; px++) {
            if (comp[(py * 16 + px) * 4 + 3] > 5) {
                const x = (px * pSize) - 0.5;
                const y = ((15 - py) * pSize) - 0.5;
                const uMin = px / 16, uMax = (px + 1) / 16;
                const vMin = 1.0 - ((py + 1) / 16), vMax = 1.0 - (py / 16);

                addQuad([x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], [x, y, thick/2], [x+pSize, y, thick/2], uMin, vMax, uMax, vMin);
                addQuad([x+pSize, y+pSize, -thick/2], [x, y+pSize, -thick/2], [x+pSize, y, -thick/2], [x, y, -thick/2], uMax, vMax, uMin, vMin);
                if (py === 0 || comp[((py-1)*16+px)*4+3] <= 5) addQuad([x, y+pSize, -thick/2], [x+pSize, y+pSize, -thick/2], [x, y+pSize, thick/2], [x+pSize, y+pSize, thick/2], uMin, vMax, uMax, vMin);
                if (py === 15 || comp[((py+1)*16+px)*4+3] <= 5) addQuad([x, y, thick/2], [x+pSize, y, thick/2], [x, y, -thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
                if (px === 0 || comp[(py*16+px-1)*4+3] <= 5) addQuad([x, y+pSize, -thick/2], [x, y+pSize, thick/2], [x, y, -thick/2], [x, y, thick/2], uMin, vMax, uMax, vMin);
                if (px === 15 || comp[(py*16+px+1)*4+3] <= 5) addQuad([x+pSize, y+pSize, thick/2], [x+pSize, y+pSize, -thick/2], [x+pSize, y, thick/2], [x+pSize, y, -thick/2], uMin, vMax, uMax, vMin);
            }
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const colors2 = new Float32Array(positions.length).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors2, 3));
    const biomeTints = new Float32Array(positions.length).fill(1);
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));

    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.set(0.68 / 0.35, 0.68 / 0.35, 0.68 / 0.35);
    mesh.rotation.set(0, -45 * Math.PI / 180, 25 * Math.PI / 180);
    mesh.position.set(-0.5 + 1.13 / 16, -0.5 + -1.0 / 16, -0.35);
    grp.add(mesh);
    return grp;
}
