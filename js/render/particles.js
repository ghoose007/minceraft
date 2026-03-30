// ==========================================
// PARTICLES & FALLING BLOCKS
// ==========================================

function getBlockHash(x, y, z) {
    let h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    return h - Math.floor(h);
}

function getParticleGeometry(blockId) {
    const cacheKey = blockId + (settingGraphicsFancy ? "_fancy" : "_fast");
    if (particleGeometries[cacheKey]) return particleGeometries[cacheKey];
    
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const uvs = geo.attributes.uv.array;
    
    const blockData = BLOCK_DATA[blockId];
    let texIndex = 0;
    if (blockData) {
        texIndex = typeof blockData.atlasIdx === 'object' ? blockData.atlasIdx.side : blockData.atlasIdx;
    }
    
    if (!settingGraphicsFancy) {
        if (blockId === 14) texIndex = 29;
        else if (blockId === 22) texIndex = 30;
        else if (blockId === 43) texIndex = 47;
        else if (blockId === 97) texIndex = 126;
    }
    
    const uScale = 1 / 16;
    const vScale = 1 / 16;
    const gridX = texIndex % 16;
    const gridY = Math.floor(texIndex / 16);
    const uOffset = gridX * uScale;
    const vOffset = 1.0 - (gridY * vScale) - vScale;

    for (let i = 0; i < uvs.length; i += 2) {
        uvs[i] = uOffset + uvs[i] * uScale;
        uvs[i+1] = vOffset + uvs[i+1] * vScale;
    }
    const colors = [];
    const tints = [];
    let pTint = [1,1,1];
    
    if ([14, 16, 22, 24, 43, 66, 67, 97].includes(blockId)) pTint = [0.55, 0.75, 0.4];

    for (let i=0; i<uvs.length/2; i++) {
        colors.push(1, 1, 1);
        tints.push(...pTint);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(tints, 3));

    particleGeometries[cacheKey] = geo;
    return geo;
}

function spawnParticles(x, y, z, blockId) {
    if (blockId === 0 || blockId === 4 || blockId === 27) return; 

    // Fire and portal blocks use smoke particles instead of block-break particles
    if (blockId === 89 || blockId === 90) {
        const smokeCount = blockId === 89 ? 5 : 8;
        if (typeof window.spawnFireSmoke === 'function') {
            for (let i = 0; i < smokeCount; i++) {
                window.spawnFireSmoke(x, y, z);
            }
        }
        return;
    }
    
    const particleBlockId = blockId === 1 ? 2 : (blockId === 149 || blockId === 150) ? 29 : blockId === 201 ? 28 : blockId;
    const count = 12 + Math.floor(Math.random() * 8); 
    
    const baseGeo = getParticleGeometry(particleBlockId);
    const geo = baseGeo.clone();
    
    let maxSun = 0;
    let maxTorch = 0;
    const dirs = [[0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,0,0]];
    for (let [dx, dy, dz] of dirs) {
        const sl = getSunLight(x + dx, y + dy, z + dz);
        const tl = getTorchLight(x + dx, y + dy, z + dz);
        if (sl > maxSun) maxSun = sl;
        if (tl > maxTorch) maxTorch = tl;
    }
    
    if (blockId === 17 || blockId === 27) maxTorch = 14; 

    const sunL = maxSun / 15.0;
    const torchL = maxTorch / 15.0;
    
    const colors = geo.attributes.color.array;
    for (let i = 0; i < colors.length; i += 3) {
        colors[i] = sunL;        
        colors[i + 1] = torchL;  
        colors[i + 2] = 1.0;     
    }
    geo.attributes.color.needsUpdate = true;
    
    geo.userData = { refCount: count };
    
    for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, solidMaterial);
        mesh.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
        mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        scene.add(mesh);
        
        const lifeTime = 0.3 + Math.random() * 0.4; 
        particles.push({ mesh: mesh, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4 + 2, vz: (Math.random() - 0.5) * 5, life: lifeTime, maxLife: lifeTime });
    }
}

function createFallingBlockMesh(blockId, wx, wy, wz) {
    const positions = [], normals = [], uvs = [], colors = [], biomeTints = [];
    for (let face of blockFaces) {
        pushFace(0, 0, 0, face, positions, normals, uvs, colors, biomeTints, blockId, null, null);
    }
    
    let maxSun = 0;
    let maxTorch = 0;
    const dirs = [[0,1,0], [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,0,0]];
    for (let [dx, dy, dz] of dirs) {
        const sl = getSunLight(wx + dx, wy + dy, wz + dz);
        const tl = getTorchLight(wx + dx, wy + dy, wz + dz);
        if (sl > maxSun) maxSun = sl;
        if (tl > maxTorch) maxTorch = tl;
    }
    
    const sunL = maxSun / 15.0;
    const torchL = maxTorch / 15.0;
    
    for (let i = 0; i < colors.length; i += 3) {
        const shade = colors[i + 2]; 
        colors[i] = sunL * shade;
        colors[i + 1] = torchL * shade;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aBiomeTint', new THREE.Float32BufferAttribute(biomeTints, 3));
    return new THREE.Mesh(geometry, solidMaterial);
}

function checkGravity(x, y, z) {
    const val = getVoxel(x, y, z);
    const id = val & 0xFF;
    if (id !== 5 && id !== 15) return; 
    
    const belowVal = getVoxel(x, y - 1, z);
    const belowId = belowVal & 0xFF;
    
    if (belowId === 0 || isFluidBlock(belowId) || isCrossBlock(belowId) || isSnowLayer(belowId)) {
        setVoxel(x, y, z, 0);
        queueNeighbors(x, y, z); 
        
        const mesh = createFallingBlockMesh(id, x, y, z);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        
        fallingBlocks.add({ x: x, y: y, z: z, id: id, vy: 0, mesh: mesh });
        checkGravity(x, y + 1, z);
    }
}

function getCornerHeight(bx, y, bz, dx, dz, fluidId = 4) {
    const maxLevel = fluidId === 27 ? 4 : 8; 
    let sum = 0, count = 0;
    for (let ix = 0; ix <= 1; ix++) {
        for (let iz = 0; iz <= 1; iz++) {
            const nx = bx + dx - 1 + ix, nz = bz + dz - 1 + iz;
            const nVal = getVoxel(nx, y, nz);
            if ((nVal & 0xFF) === fluidId) {
                const aboveVal = getVoxel(nx, y + 1, nz);
                if ((aboveVal & 0xFF) === fluidId) return 1.0; 

                const isSource = (nVal >> 13) & 0x1;
                if (isSource) { sum += 0.9; count++; } 
                else { const level = (nVal >> 8) & 0xF; sum += (level / maxLevel) * 0.8 + 0.1; count++; }
            }
        }
    }
    return count > 0 ? sum / count : 0.1;
}
