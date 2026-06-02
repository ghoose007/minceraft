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
    id = Number(id);
    const itemDataForModel = (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id]) || (typeof BLOCK_DATA !== 'undefined' && BLOCK_DATA[id]);
    // v323: Let the registry force plant/material item models. This prevents
    // blocks like sugarcane from accidentally falling through to cube models.
    if (itemDataForModel && itemDataForModel.itemModel === 'material') return buildMaterialMesh(id);
    if (itemDataForModel && itemDataForModel.itemModel === 'flat') return buildFlatBlockItemMesh(id);
    // v317: New mesa/terracotta blocks are normal full-cube blocks. Force them
    // through the same cube item model path as stone/sand/sandstone before any
    // broad item-id ranges, spawn egg ranges, or tool ranges are considered.
    if (typeof isMesaBlock === 'function' && isMesaBlock(id)) {
        return typeof buildBlockItemMesh === 'function' ? buildBlockItemMesh(id) : new THREE.Group();
    }
    // Route materials, saplings, flowers, and bushes to the 3D extruded material mesher
    // v335: id 219 (Tall Grass item) joins this set so its held/dropped/inventory
    // icon renders as the same extruded-cross mesh saplings use. The override
    // to atlas 218 (leafier top) lives in buildMaterialMesh via itemAtlasIdx.
    // v339: id 16 (Grass — the 1-block plant) also joins so it gets the same
    // 3D extruded held/dropped treatment saplings have. Without this, it was
    // falling through to buildBlockItemMesh (the cube path), which made the
    // held model look like a tiny green box instead of a leaf sprite.
    if ((id >= 112 && id <= 123) || id === 128 || id === 129 || id === 134 || id === 135 || id === 137 || id === 142 || id === 143 || id === 151 || id === 153 || id === 165 || id === 186 || id === 187 || id === 188 || id === 260 || id === 261
        || id === 197 || id === 198 || id === 199 || id === 202 || id === 205 || id === 206 || id === 211 || id === 212 || id === 213
        || id === 16 || id === 23 || id === 53 || id === 24 || id === 26 || id === 52 || id === 116 || id === 117 || id === 118 || id === 219
        // v409: mushrooms use the same extruded material mesh path as the other plant items when held/dropped.
        || id === 221 || id === 222
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
    const isMushroomItem = (id === 221 || id === 222);
    
    let pixData = null;
    try {
        pixData = getTerrainPixelData();
    } catch (e) {
        console.warn("Could not read pixel data for material extrusion.", e);
    }

    // v335: an item can override its inventory/held/dropped texture by
    // specifying `itemAtlasIdx`. Used by Tall Grass (id 219), whose world
    // block uses atlas 217 (wispy bottom half) but whose icon should show
    // the leafier atlas 218 — same convention MC uses for two-tall plants.
    const atlasIdx = (itemData.itemAtlasIdx !== undefined) ? itemData.itemAtlasIdx : itemData.atlasIdx;
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
                    
                    // v410: mushroom item tiles sit near other colored atlas entries.
                    // Add a tiny inset only for mushrooms so held/dropped extrusions
                    // cannot bleed neighboring pink/red pixels at the tile edge.
                    const uvPad = isMushroomItem ? 0.035 : 0.0;
                    const uMin = (imgX + uvPad) / 256, uMax = (imgX + 1 - uvPad) / 256;
                    const vMin = 1.0 - ((imgY + 1 - uvPad) / 256), vMax = 1.0 - ((imgY + uvPad) / 256);

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
        const pad = isMushroomItem ? 0.5 : 0.0;
        addQuad([-0.5, 0.5, 0], [0.5, 0.5, 0], [-0.5, -0.5, 0], [0.5, -0.5, 0], (atlasX+pad)/256, 1.0 - ((atlasY+pad)/256), (atlasX+16-pad)/256, 1.0 - ((atlasY+16-pad)/256));
        addQuad([0.5, 0.5, -0.01], [-0.5, 0.5, -0.01], [0.5, -0.5, -0.01], [-0.5, -0.5, -0.01], (atlasX+16-pad)/256, 1.0 - ((atlasY+pad)/256), (atlasX+pad)/256, 1.0 - ((atlasY+16-pad)/256));
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    // v407: mushrooms are tiny plant items. Keep every extruded side evenly
    // bright so one side does not render dark from directional item shading.
    if (isMushroomItem && geo.attributes.normal) {
        const n = geo.attributes.normal.array;
        for (let i = 0; i < n.length; i += 3) {
            n[i] = 0;
            n[i + 1] = 0;
            n[i + 2] = 1;
        }
        geo.attributes.normal.needsUpdate = true;
    }

    const colors = new Float32Array(positions.length).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const biomeTints = new Float32Array(positions.length).fill(1);
    if (id === 16 || id === 219 || id === 24) {
        // v404: id 24 is Bush, the in-game equivalent of Minecraft's fern.
        // Its atlas texture is greyscale like the other plant sprites, so the
        // held/dropped item mesh needs the same default foliage/grass green
        // baked into aBiomeTint instead of rendering grey.
        // v339: id 16 (Grass) and id 219 (Tall Grass) also use this default
        // plains-green tint in inventory / held / dropped form.
        const PLAINS_GRASS_TINT = [0.55, 0.75, 0.4];
        for (let i = 0; i < biomeTints.length; i += 3) {
            biomeTints[i]     = PLAINS_GRASS_TINT[0];
            biomeTints[i + 1] = PLAINS_GRASS_TINT[1];
            biomeTints[i + 2] = PLAINS_GRASS_TINT[2];
        }
    }
    geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(biomeTints, 3));

    if (!toolMaterials[id]) {
        if (isMushroomItem) {
            // v410: mushrooms must render from the raw atlas colors in hand/on ground.
            // Do not use vertex colors, biome tint, or lighting shader here; those
            // paths can tint the raw mushroom pixels pink/incorrectly.
            toolMaterials[id] = new THREE.MeshBasicMaterial({
                map: textureAtlas,
                color: 0xffffff,
                transparent: true,
                alphaTest: 0.1,
                vertexColors: false,
                side: THREE.DoubleSide
            });
            toolMaterials[id].customProgramCacheKey = function() { return 'rawMushroomItemMat' + id; };
        } else {
            toolMaterials[id] = new THREE.MeshBasicMaterial({ 
                map: textureAtlas, 
                transparent: true, 
                alphaTest: 0.1, 
                vertexColors: true,
                side: THREE.DoubleSide
            });
            if (typeof injectLightingShader === 'function') injectLightingShader(toolMaterials[id]);
            toolMaterials[id].customProgramCacheKey = function() { return 'materialItemMat' + id; };
        }
    }

    const mesh = new THREE.Mesh(geo, toolMaterials[id]);
    // Material geometry is centered [-0.5..0.5] on XY, flat on Z.
    // This is the shared held-item transform for plant/material items.
    // v409: mushrooms intentionally use this exact same position/rotation/scale path.
    mesh.scale.set(0.68 / 0.35, 0.68 / 0.35, 0.68 / 0.35);
    mesh.position.set(1.13 / 16, 0.90, 0.35);
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
    mesh.position.set(-0.5 + 1.13 / 16, -0.5 + -2.5 / 16, 0.35);
    
    const group = new THREE.Group();
    group.add(mesh);
    return group;
}

function buildBlockItemMesh(blockId) {
    const block = BLOCK_DATA[blockId];
    if (!block || !solidMaterial) return new THREE.Group();
    
    let texIdx = typeof block.atlasIdx === 'object' ? block.atlasIdx.side : block.atlasIdx;
    
    // v429: Dedicated Grass Block held/dropped mesh.
    // Single mesh, centered coordinates, same transform as normal held blocks.
    // Dirt sides are untinted, top is tinted, and the transparent grass side
    // overhang is a flush tinted overlay using the same material/lighting path.
    if (blockId === 1) {
        const pos = [], uv = [], nrm = [], colAttr = [], tintAttr = [];
        const greenTint = [0.55, 0.75, 0.4];
        const noTint = [1, 1, 1];

        const uvFor = (texIdx, u, v) => {
            const tc = texIdx % 16, tr = Math.floor(texIdx / 16);
            const eps = 0.01;
            const uu = u <= 0 ? eps : (u >= 1 ? 1 - eps : u);
            const vv = v <= 0 ? eps : (v >= 1 ? 1 - eps : v);
            return [(tc + uu) / 16, 1.0 - ((tr + vv) / 16)];
        };

        const pushTri = (a, b, c, au, av, bu, bv, cu, cv, nx, ny, nz, tint) => {
            pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
            uv.push(au, av, bu, bv, cu, cv);
            nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
            colAttr.push(1, 1, 1, 1, 1, 1, 1, 1, 1);
            tintAttr.push(tint[0], tint[1], tint[2], tint[0], tint[1], tint[2], tint[0], tint[1], tint[2]);
        };

        const pushQuad = (p0, p1, p2, p3, texIdx, nx, ny, nz, tint, vStart = 0, vEnd = 1) => {
            const q0 = uvFor(texIdx, 0, vStart);
            const q1 = uvFor(texIdx, 0, vEnd);
            const q2 = uvFor(texIdx, 1, vEnd);
            const q3 = uvFor(texIdx, 1, vStart);
            pushTri(p0, p1, p2, q0[0], q0[1], q1[0], q1[1], q2[0], q2[1], nx, ny, nz, tint);
            pushTri(p0, p2, p3, q0[0], q0[1], q2[0], q2[1], q3[0], q3[1], nx, ny, nz, tint);
        };

        const topTex = (typeof block.atlasIdx === 'object') ? block.atlasIdx.top : 0;
        const sideTex = (typeof block.atlasIdx === 'object') ? block.atlasIdx.side : 28;
        const bottomTex = (typeof block.atlasIdx === 'object') ? block.atlasIdx.bottom : 2;
        const overlayTex = (typeof block.atlasIdx === 'object' && block.atlasIdx.overlay !== undefined) ? block.atlasIdx.overlay : 1;

        // Base cube: centered exactly like THREE.BoxGeometry(1,1,1).
        pushQuad([ 0.5, 0.5, 0.5], [ 0.5,-0.5, 0.5], [ 0.5,-0.5,-0.5], [ 0.5, 0.5,-0.5], sideTex,  1, 0, 0, noTint);
        pushQuad([-0.5, 0.5,-0.5], [-0.5,-0.5,-0.5], [-0.5,-0.5, 0.5], [-0.5, 0.5, 0.5], sideTex, -1, 0, 0, noTint);
        pushQuad([-0.5, 0.5,-0.5], [-0.5, 0.5, 0.5], [ 0.5, 0.5, 0.5], [ 0.5, 0.5,-0.5], topTex, 0, 1, 0, greenTint);
        pushQuad([-0.5,-0.5, 0.5], [-0.5,-0.5,-0.5], [ 0.5,-0.5,-0.5], [ 0.5,-0.5, 0.5], bottomTex, 0,-1, 0, noTint);
        pushQuad([-0.5, 0.5, 0.5], [-0.5,-0.5, 0.5], [ 0.5,-0.5, 0.5], [ 0.5, 0.5, 0.5], sideTex, 0, 0, 1, noTint);
        pushQuad([ 0.5, 0.5,-0.5], [ 0.5,-0.5,-0.5], [-0.5,-0.5,-0.5], [-0.5, 0.5,-0.5], sideTex, 0, 0,-1, noTint);

        // Flush grass side overhang. Use a microscopic offset only to prevent
        // z-fighting; visually it sits flush with the dirt side, not separated.
        const o = 0.00015;
        const yTop = 0.5, yMid = 0.0;
        pushQuad([ 0.5+o,yTop, 0.5], [ 0.5+o,yMid, 0.5], [ 0.5+o,yMid,-0.5], [ 0.5+o,yTop,-0.5], overlayTex,  1,0,0, greenTint, 0, 0.5);
        pushQuad([-0.5-o,yTop,-0.5], [-0.5-o,yMid,-0.5], [-0.5-o,yMid, 0.5], [-0.5-o,yTop, 0.5], overlayTex, -1,0,0, greenTint, 0, 0.5);
        pushQuad([-0.5,yTop, 0.5+o], [-0.5,yMid, 0.5+o], [ 0.5,yMid, 0.5+o], [ 0.5,yTop, 0.5+o], overlayTex, 0,0, 1, greenTint, 0, 0.5);
        pushQuad([ 0.5,yTop,-0.5-o], [ 0.5,yMid,-0.5-o], [-0.5,yMid,-0.5-o], [-0.5,yTop,-0.5-o], overlayTex, 0,0,-1, greenTint, 0, 0.5);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colAttr), 3));
        geo.setAttribute('aBiomeTint', new THREE.BufferAttribute(new Float32Array(tintAttr), 3));

        const mesh = new THREE.Mesh(geo, solidMaterial);
        mesh.position.set(-0.24, -0.26, -0.18);
        mesh.rotation.set(0, 90 * Math.PI / 180, 0);
        mesh.scale.set(0.46 / 0.35, 0.46 / 0.35, 0.46 / 0.35);

        const group = new THREE.Group();
        group.add(mesh);
        return group;
    }

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
        mesh.position.set(-0.44, -0.56, 0.18);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.46 / 0.35, 0.46 / 0.35, 0.46 / 0.35);
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
        mesh.position.set(-0.44, -0.56, 0.18);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.46 / 0.35, 0.46 / 0.35, 0.46 / 0.35);
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
        mesh.position.set(-0.44, -0.56, 0.18);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.46 / 0.35, 0.46 / 0.35, 0.46 / 0.35);
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
        mesh.position.set(-0.44, -0.61, 0.18);
        mesh.rotation.set(0, 45 * Math.PI / 180, 0);
        mesh.scale.set(0.46 / 0.35, 0.46 / 0.35, 0.46 / 0.35);
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
        // v428: Grass Block item mesh must stay a full dirt-sided cube.
        // Tint only the top face here; the side grass overhang is added below
        // as a separate transparent overlay mesh so the dirt side is not green.
        for (let i = 12 * 3; i < 18 * 3; i += 3) {
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
    
    // v374: MC-style first-person held block: raised slightly, close to camera, upright/flat, 45° yaw around the vertical up/down axis.
    mesh.position.set(-0.24, -0.26, -0.18); 
    mesh.rotation.set(0, 90 * Math.PI / 180, 0);
    mesh.scale.set(0.46 / 0.35, 0.46 / 0.35, 0.46 / 0.35); // v372: closer, larger MC-style held block 
    
    const group = new THREE.Group();
    group.add(mesh);

    // v428: Grass side overhang overlay for held/dropped Grass Block only.
    // This keeps the base cube untouched and preserves the existing block
    // positioning/hotbar behavior. Coordinates are centered like BoxGeometry.
    if (blockId === 1 && textureAtlas) {
        const overlayTex = (typeof block.atlasIdx === 'object' && block.atlasIdx.overlay !== undefined) ? block.atlasIdx.overlay : 1;
        const tx = overlayTex % 16;
        const ty = Math.floor(overlayTex / 16);
        const eps = 0.01;
        const u0 = (tx + eps) / 16;
        const u1 = (tx + 1 - eps) / 16;
        const vTop = 1.0 - ((ty + eps) / 16);
        const vMid = 1.0 - ((ty + 0.5) / 16);
        const pos = [], uv = [], nrm = [], col = [], tint = [];
        const gt = [0.55, 0.75, 0.4];
        const pushTri = (a,b,c, au,av, bu,bv, cu,cv, nx,ny,nz) => {
            pos.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
            uv.push(au,av, bu,bv, cu,cv);
            nrm.push(nx,ny,nz, nx,ny,nz, nx,ny,nz);
            col.push(1,1,1, 1,1,1, 1,1,1);
            tint.push(gt[0],gt[1],gt[2], gt[0],gt[1],gt[2], gt[0],gt[1],gt[2]);
        };
        const quad = (p0,p1,p2,p3,nx,ny,nz) => {
            pushTri(p0,p1,p2, u0,vTop, u0,vMid, u1,vMid, nx,ny,nz);
            pushTri(p0,p2,p3, u0,vTop, u1,vMid, u1,vTop, nx,ny,nz);
        };
        const o = 0.003, yTop = 0.5, yMid = 0.0;
        quad([ 0.5+o,yTop, 0.5], [ 0.5+o,yMid, 0.5], [ 0.5+o,yMid,-0.5], [ 0.5+o,yTop,-0.5],  1,0,0);
        quad([-0.5-o,yTop,-0.5], [-0.5-o,yMid,-0.5], [-0.5-o,yMid, 0.5], [-0.5-o,yTop, 0.5], -1,0,0);
        quad([-0.5,yTop, 0.5+o], [-0.5,yMid, 0.5+o], [ 0.5,yMid, 0.5+o], [ 0.5,yTop, 0.5+o], 0,0, 1);
        quad([ 0.5,yTop,-0.5-o], [ 0.5,yMid,-0.5-o], [-0.5,yMid,-0.5-o], [-0.5,yTop,-0.5-o], 0,0,-1);

        const og = new THREE.BufferGeometry();
        og.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        og.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        og.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        og.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
        og.setAttribute('aBiomeTint', new THREE.BufferAttribute(new Float32Array(tint), 3));

        const om = new THREE.Mesh(og, solidMaterial);
        om.position.copy(mesh.position);
        om.rotation.copy(mesh.rotation);
        om.scale.copy(mesh.scale);
        group.add(om);
    }

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
