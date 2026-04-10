// ==========================================
// GAME INITIALIZATION & EVENT HANDLERS
// ==========================================

// --- "Click to Play" overlay shown after world loads ---
function _showClickToPlay() {
    // Remove any existing overlay
    const existing = document.getElementById('click-to-play-overlay');
    if (existing) existing.remove();
    
    // Hide the pause menu so it doesn't show behind the overlay
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    
    const overlay = document.createElement('div');
    overlay.id = 'click-to-play-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        cursor: pointer;
    `;
    
    const text = document.createElement('div');
    text.textContent = 'Tap to Play';
    text.style.cssText = `
        font-family: 'Minecraft', 'MinecraftBitmap', monospace, sans-serif;
        font-size: 36px;
        color: white;
        text-shadow: 3px 3px 0px #3f3f3f;
        pointer-events: none;
    `;
    overlay.appendChild(text);
    
    function _startPlaying() {
        if (!overlay.parentNode) return; // Already removed
        overlay.remove();
        document.body.requestPointerLock();
    }
    
    overlay.addEventListener('click', _startPlaying);
    overlay.addEventListener('touchend', (e) => {
        e.preventDefault();
        _startPlaying();
    });
    
    document.body.appendChild(overlay);
}

// --- 2. INITIALIZATION ---
async function init(seed, loadedData) {
    CHUNKS_X = CHUNKS_X_ACTIVE;
    CHUNKS_Z = CHUNKS_Z_ACTIVE;
    WORLD_WIDTH = CHUNKS_X * CHUNK_SIZE;
    WORLD_DEPTH = CHUNKS_Z * CHUNK_SIZE;
    
    // Save overworld dimensions for nether ratio calculations
    overworldChunksX = CHUNKS_X;
    overworldChunksZ = CHUNKS_Z;
    netherChunksX = 0;
    netherChunksZ = 0;
    
    // Reset dimension state for fresh starts (loaded worlds restore this later)
    currentDimension = 'overworld';
    netherGenerated = false;
    aetherGenerated = false;
    overworldChunkStorage = null;
    overworldGeneratedChunks = null;
    overworldBiomeMap = null;
    netherChunkStorage = null;
    netherGeneratedChunks = null;
    aetherChunkStorage = null;
    aetherGeneratedChunks = null;
    aetherBiomeMap = null;
    if (!window._portalLinks) window._portalLinks = [];
    else window._portalLinks.length = 0;
    if (!window._aetherPortalLinks) window._aetherPortalLinks = [];
    else window._aetherPortalLinks.length = 0;
    
    // Reset dimensionData table — both fresh and load paths populate it
    // (the load path does it via _loadV5IntoData/_loadV4IntoData before
    // calling init; the fresh path populates it just after initChunkStorage
    // below).
    if (!loadedData && typeof dimensionData !== 'undefined') {
        for (const dimName of ['overworld', 'nether', 'aether']) {
            const d = dimensionData[dimName];
            d.chunks = null;
            d.generatedFlags = null;
            d.biomeMap = null;
            d.chunksX = 0;
            d.chunksZ = 0;
            d.worldWidth = 0;
            d.worldDepth = 0;
            d.generated = false;
            d.playerPos = null;
        }
    }
    
    clearChunkStorage();
    initChunkStorage();
    _updateWorldHalves();
    
    // Populate dimensionData.overworld for fresh worlds. The load path
    // already populated it via _loadV5IntoData / _loadV4IntoData.
    if (!loadedData && typeof dimensionData !== 'undefined') {
        const od = dimensionData.overworld;
        od.chunksX = CHUNKS_X;
        od.chunksZ = CHUNKS_Z;
        od.worldWidth = WORLD_WIDTH;
        od.worldDepth = WORLD_DEPTH;
        od.chunks = chunkStorageArr;
        od.generatedFlags = generatedChunksArr;
        od.biomeMap = biomeMap;
        od.generated = true;
    }
    
    useLazyGeneration = (CHUNKS_X > LAZY_GEN_THRESHOLD || CHUNKS_Z > LAZY_GEN_THRESHOLD);
    
    if (!useLazyGeneration && !loadedData) {
        for (let cx = 0; cx < CHUNKS_X; cx++) {
            for (let cz = 0; cz < CHUNKS_Z; cz++) {
                _getOrCreateChunkFast(cx, cz);
            }
        }
    }
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 
    const initialDist = RENDER_DISTANCES[currentRenderDistIndex] * CHUNK_SIZE;
    scene.fog = new THREE.Fog(0x87CEEB, initialDist * 0.4, initialDist);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera); 

    uiScene = new THREE.Scene();
    uiCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    uiScene.add(uiCamera);

    heldItemGroup = new THREE.Group();
    heldItemGroup.position.set(0.56, -0.52, -0.72);
    heldItemGroup.scale.set(0.35, 0.35, 0.35);
    heldItemGroup.rotation.order = 'YXZ';
    heldItemGroup.rotation.set(0, -Math.PI / 4, Math.PI / 16);
    uiCamera.add(heldItemGroup);
    
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // PERF: Clamp pixel ratio to 1 — on high-DPI displays (Retina, mobile),
    // window.devicePixelRatio is 2-3x, which means rendering 4-9x as many pixels.
    // For pixel-art games, the visual quality difference is minimal but the perf cost is huge.
    renderer.setPixelRatio(Math.min(1, window.devicePixelRatio));
    renderer.autoClear = false; 
    document.body.appendChild(renderer.domElement);

    const highlightGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.0, 1.0, 1.0));
    const highlightMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    highlightBox = new THREE.LineSegments(highlightGeo, highlightMat);
    highlightBox.visible = false;
    scene.add(highlightBox);
    
    celestialGroup = new THREE.Group();
    scene.add(celestialGroup);
    
    const _texLoader = new THREE.TextureLoader();
    const sunTex = _texLoader.load('textures/sun.png?v=' + ASSET_VERSION);
    sunTex.magFilter = THREE.NearestFilter;
    sunTex.minFilter = THREE.NearestFilter;
    const sunMat = new THREE.MeshBasicMaterial({ map: sunTex, fog: false, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), sunMat);
    celestialGroup.add(sunMesh);
    
    const moonTex = _texLoader.load('textures/full_moon.png?v=' + ASSET_VERSION);
    moonTex.magFilter = THREE.NearestFilter;
    moonTex.minFilter = THREE.NearestFilter;
    const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, fog: false, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), moonMat);
    celestialGroup.add(moonMesh);

    // --- INITIALIZE CLOUDS (TEXTURE MAP) ---
    const cloudImg = new Image();
    cloudImg.src = 'textures/clouds.png?v=' + ASSET_VERSION;
    cloudImg.onload = () => {
        // Draw the image to a hidden canvas to extract pixel data
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cloudImg, 0, 0, 256, 256);
        
        // Store the raw RGBA pixel array globally
        window.cloudMapData = ctx.getImageData(0, 0, 256, 256).data;

        const cloudGeo = new THREE.BoxGeometry(CLOUD_W, CLOUD_H, CLOUD_W);
        const cloudColors = [];
        
        const cTop = new THREE.Color(0xffffff);  // Pure white top
        const cSide = new THREE.Color(0xdddddd); // Light gray sides
        const cBot = new THREE.Color(0xbbbbbb);  // Darker gray bottom

        for (let i = 0; i < 6; i++) {
            let c = cSide;
            if (i === 2) c = cTop;
            if (i === 3) c = cBot;
            for (let j = 0; j < 4; j++) {
                cloudColors.push(c.r, c.g, c.b);
            }
        }
        cloudGeo.setAttribute('color', new THREE.Float32BufferAttribute(cloudColors, 3));

        // 1. The "Depth Shield" - Invisible, but blocks internal faces from drawing
        const cloudDepthMat = new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true
        });

        // 2. The "Color Pass" - Transparent, draws exactly on top of the shield
        const cloudMat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            depthWrite: false, 
            fog: true 
        });

        // Create TWO instanced meshes
        window.cloudDepthMesh = new THREE.InstancedMesh(cloudGeo, cloudDepthMat, CLOUD_COVERAGE * CLOUD_COVERAGE);
        window.cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, CLOUD_COVERAGE * CLOUD_COVERAGE);

        // Force the invisible shield to render right before the colored clouds
        window.cloudDepthMesh.renderOrder = 1; 
        window.cloudMesh.renderOrder = 2; 

        scene.add(window.cloudDepthMesh);
        scene.add(window.cloudMesh);
    };
    // -------------------------

    document.addEventListener('contextmenu', e => {
        e.preventDefault(); 
    });

    if (!loadedData) {
        await generateWorld();
    } else {
        // Load textures and init noise for saved worlds
        updateLoadingBar(10, 'Initializing...');
        await yieldToUI();
        if (typeof _initWorldGenNoise === 'function') _initWorldGenNoise();
        biomeMap = new Array(WORLD_WIDTH * WORLD_DEPTH);
        
        updateLoadingBar(20, 'Loading textures...');
        await yieldToUI();
        // Load your fire texture BEFORE building chunks
        if (typeof loadFireTexture === 'function') await loadFireTexture(); 
        textureAtlas = await loadTextureAtlas();
        await loadToolAtlas();
        solidMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, alphaTest: 0.5, transparent: false, side: THREE.FrontSide, vertexColors: true });
        injectLightingShader(solidMaterial);
        if (typeof createPortalMaterial === 'function') createPortalMaterial(textureAtlas);
        if (typeof createAetherPortalMaterial === 'function') createAetherPortalMaterial(textureAtlas);
        glassMaterial = new THREE.MeshBasicMaterial({ map: textureAtlas, transparent: true, opacity: 1.0, alphaTest: 0.0, side: THREE.FrontSide, vertexColors: true, depthWrite: false });
        injectLightingShader(glassMaterial);
        const waterTex = await loadWaterTexture();
        waterMaterial = createFluidMaterial(waterTex, true);
        const lavaTex = await loadLavaTexture();
        lavaMaterial = createFluidMaterial(lavaTex, false);
    }

    // --- INIT PLAYER MODEL FOR THIRD PERSON ---
    if (typeof initPlayerModel === 'function') initPlayerModel();

    // Init fire overlay (needs camera + fireMaterial to exist)
    if (typeof getFireOverlayPlane === 'function') getFireOverlayPlane();
    
    // --- OVERLAY MESH CREATION ---
    // v279: Instead of a static 1x1x1 box, the breakingBox geometry is
    // rebuilt per-target-block to match the actual rendered shape for
    // slabs, stairs, doors, trapdoors, fences, iron bars, farmland,
    // enchanting table, and extended pistons. Everything else uses the
    // default full cube.
    breakingMat = new THREE.MeshBasicMaterial({
        map: typeof textureAtlas !== 'undefined' ? textureAtlas : null,
        transparent: true,
        alphaTest: 0.1,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
    });
    const _defaultBreakGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    breakingBox = new THREE.Mesh(_defaultBreakGeo, breakingMat);
    breakingBox.visible = false;
    scene.add(breakingBox);
    // Track current shape key so we only rebuild on change.
    breakingBox.userData.shapeKey = 'cube';
    
    // Helper: merge an array of BoxGeometry specs into one BufferGeometry.
    // Each spec is { x, y, z, w, h, d } in LOCAL voxel coordinates (0..1).
    // The output geometry is centered at (0.5, 0.5, 0.5) so when the
    // breakingBox mesh is positioned at (x+0.5, y+0.5, z+0.5) it aligns.
    function _buildMergedBoxGeometry(specs) {
        if (!specs || specs.length === 0) return _defaultBreakGeo.clone();
        if (specs.length === 1) {
            const s = specs[0];
            const g = new THREE.BoxGeometry(s.w, s.h, s.d);
            // Offset so that the local-space (0..1 voxel) box at (s.x,s.y,s.z)
            // ends up centered correctly when breakingBox.position is at
            // (wx+0.5, wy+0.5, wz+0.5). BoxGeometry is centered on origin, so
            // we need to translate by ((s.x + s.w/2) - 0.5, ...).
            g.translate((s.x + s.w/2) - 0.5, (s.y + s.h/2) - 0.5, (s.z + s.d/2) - 0.5);
            return g;
        }
        // Multiple specs: concat attribute arrays manually.
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        let vertOffset = 0;
        for (const s of specs) {
            const g = new THREE.BoxGeometry(s.w, s.h, s.d);
            g.translate((s.x + s.w/2) - 0.5, (s.y + s.h/2) - 0.5, (s.z + s.d/2) - 0.5);
            const pArr = g.attributes.position.array;
            const nArr = g.attributes.normal.array;
            const uArr = g.attributes.uv.array;
            const iArr = g.index.array;
            for (let i = 0; i < pArr.length; i++) positions.push(pArr[i]);
            for (let i = 0; i < nArr.length; i++) normals.push(nArr[i]);
            for (let i = 0; i < uArr.length; i++) uvs.push(uArr[i]);
            for (let i = 0; i < iArr.length; i++) indices.push(iArr[i] + vertOffset);
            vertOffset += g.attributes.position.count;
            g.dispose();
        }
        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
        merged.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        merged.setIndex(indices);
        return merged;
    }
    
    // Compute the list of box specs for a given block id + encoded value.
    // World coords (wx, wy, wz) are used for blocks whose shape depends on
    // neighbors (fences, glass panes, iron bars). Specs are in LOCAL voxel
    // space (0..1). Small inflate (E) makes the overlay sit slightly proud
    // of the actual block faces.
    function _breakSpecsForBlock(id, val, wx, wy, wz) {
        const E = 0.005; // inflate to prevent z-fighting
        const INF = 1.01; // full-cube inflated size
        const _inflate = (b) => ({
            x: b.x - E, y: b.y - E, z: b.z - E,
            w: b.w + 2*E, h: b.h + 2*E, d: b.d + 2*E
        });
        // Default: full cube
        const fullCube = [{x:0, y:0, z:0, w:1, h:1, d:1}];
        
        // --- Slabs ---
        if (typeof isSlabBlock === 'function' && isSlabBlock(id)) {
            const isTop = ((val >> 8) & 0x1) === 1;
            return [_inflate({x:0, y: isTop?0.5:0, z:0, w:1, h:0.5, d:1})];
        }
        // --- Stairs ---
        if (typeof isStairBlock === 'function' && isStairBlock(id)) {
            const stairDir = (val >> 8) & 0x3;
            // Note: placement writes an upsideDown bit (val bit 10) but the
            // stair renderer ignores it — stairs always render right-side-up.
            // Matching the renderer for overlay alignment.
            const bottomHalf = {x:0, y:0, z:0, w:1, h:0.5, d:1};
            // Upper step quarter block — positioned based on stairDir.
            // sd=0 (+Z side step), sd=1 (-Z side step),
            // sd=2 (+X side step), sd=3 (-X side step).
            let step;
            const stepY = 0.5;
            if (stairDir === 0)      step = {x:0, y:stepY, z:0.5, w:1, h:0.5, d:0.5};
            else if (stairDir === 1) step = {x:0, y:stepY, z:0,   w:1, h:0.5, d:0.5};
            else if (stairDir === 2) step = {x:0.5, y:stepY, z:0, w:0.5, h:0.5, d:1};
            else                     step = {x:0, y:stepY, z:0,   w:0.5, h:0.5, d:1};
            return [_inflate(bottomHalf), _inflate(step)];
        }
        // --- Door (149) ---
        if (id === 149) {
            const dir = (val >> 8) & 0x3;
            const isOpen = (val >> 10) & 0x1;
            const hinge = (val >> 12) & 0x1;
            const D = 3/16;
            const EE = 0.005;
            let b;
            if (!isOpen) {
                if (dir === 0)      b = {x:0, y:0, z:EE, w:1, h:1, d:D-EE};
                else if (dir === 1) b = {x:1-D, y:0, z:0, w:D-EE, h:1, d:1};
                else if (dir === 2) b = {x:0, y:0, z:1-D, w:1, h:1, d:D-EE};
                else                b = {x:EE, y:0, z:0, w:D-EE, h:1, d:1};
            } else {
                if (dir === 0) {
                    if (hinge===0) b = {x:EE, y:0, z:0, w:D-EE, h:1, d:1};
                    else           b = {x:1-D, y:0, z:0, w:D-EE, h:1, d:1};
                } else if (dir === 1) {
                    if (hinge===0) b = {x:0, y:0, z:EE, w:1, h:1, d:D-EE};
                    else           b = {x:0, y:0, z:1-D, w:1, h:1, d:D-EE};
                } else if (dir === 2) {
                    if (hinge===0) b = {x:1-D, y:0, z:0, w:D-EE, h:1, d:1};
                    else           b = {x:EE, y:0, z:0, w:D-EE, h:1, d:1};
                } else {
                    if (hinge===0) b = {x:0, y:0, z:1-D, w:1, h:1, d:D-EE};
                    else           b = {x:0, y:0, z:EE, w:1, h:1, d:D-EE};
                }
            }
            return [_inflate(b)];
        }
        // --- Trapdoor (150) ---
        if (id === 150) {
            const dir = (val >> 8) & 0x3;
            const isOpen = (val >> 10) & 0x1;
            const isTop = (val >> 11) & 0x1;
            const D = 3/16;
            let b;
            if (!isOpen) {
                b = {x:0, y: isTop?1-D:0, z:0, w:1, h:D, d:1};
            } else {
                if (dir === 0)      b = {x:0, y:0, z:0, w:1, h:1, d:D};
                else if (dir === 1) b = {x:1-D, y:0, z:0, w:D, h:1, d:1};
                else if (dir === 2) b = {x:0, y:0, z:1-D, w:1, h:1, d:D};
                else                b = {x:0, y:0, z:0, w:D, h:1, d:1};
            }
            return [_inflate(b)];
        }
        // Helper: matches the renderer's canConnect logic. A neighbor
        // counts as connectable if it's any solid block (not air, fluid,
        // cross block, torch, snow layer, vine, lily pad).
        const _canConnectNeighbor = (nx, ny, nz) => {
            if (typeof getVoxel !== 'function') return false;
            const nId = getVoxel(nx, ny, nz) & 0xFF;
            if (nId === 0) return false;
            if (typeof isFluidBlock === 'function' && isFluidBlock(nId)) return false;
            if (typeof isCrossBlock === 'function' && isCrossBlock(nId)) return false;
            if (nId === 17 || nId === 40 || nId === 66 || nId === 67) return false;
            return true;
        };
        
        // --- Fences (144-148): center post + horizontal rails to connected sides ---
        if (typeof isFenceBlock === 'function' && isFenceBlock(id)) {
            const P0 = 6/16, P1 = 10/16; // post 4px wide, centered
            const PW = P1 - P0;
            const specs = [];
            // Center post (full height)
            specs.push(_inflate({x:P0, y:0, z:P0, w:PW, h:1, d:PW}));
            // Connection rails. Renderer uses two bars at y=7-10 and y=12-15.
            // We render them as a single thicker bar each side for simplicity.
            // Bar dims: 2px wide on the cross-axis, spans from edge to post.
            const BW = 2/16;
            const BC = 0.5 - BW/2; // centered cross-axis offset
            // y ranges of the two rails
            const rails = [
                { y0: 7/16, y1: 10/16 },
                { y0: 12/16, y1: 15/16 }
            ];
            const hasXN = wx !== undefined && _canConnectNeighbor(wx-1, wy, wz);
            const hasXP = wx !== undefined && _canConnectNeighbor(wx+1, wy, wz);
            const hasZN = wx !== undefined && _canConnectNeighbor(wx, wy, wz-1);
            const hasZP = wx !== undefined && _canConnectNeighbor(wx, wy, wz+1);
            for (const r of rails) {
                const rh = r.y1 - r.y0;
                if (hasXN) specs.push(_inflate({x:0,    y:r.y0, z:BC, w:P0,     h:rh, d:BW}));
                if (hasXP) specs.push(_inflate({x:P1,   y:r.y0, z:BC, w:1-P1,   h:rh, d:BW}));
                if (hasZN) specs.push(_inflate({x:BC,   y:r.y0, z:0,  w:BW,     h:rh, d:P0}));
                if (hasZP) specs.push(_inflate({x:BC,   y:r.y0, z:P1, w:BW,     h:rh, d:1-P1}));
            }
            return specs;
        }
        
        // --- Iron Bars (158) and Glass Pane (68): center post + flat panes ---
        if (id === 158 || id === 68) {
            const T0 = 7/16, T1 = 9/16; // 2px wide post
            const PW = T1 - T0;
            const specs = [];
            // Center post (always present, full height)
            specs.push(_inflate({x:T0, y:0, z:T0, w:PW, h:1, d:PW}));
            const hasXN = wx !== undefined && _canConnectNeighbor(wx-1, wy, wz);
            const hasXP = wx !== undefined && _canConnectNeighbor(wx+1, wy, wz);
            const hasZN = wx !== undefined && _canConnectNeighbor(wx, wy, wz-1);
            const hasZP = wx !== undefined && _canConnectNeighbor(wx, wy, wz+1);
            const hasX = hasXN || hasXP;
            const hasZ = hasZN || hasZP;
            // Renderer rule: if no connections, draw an X-aligned segment as the default
            const drawX = hasX || (!hasX && !hasZ);
            const drawZ = hasZ;
            // X-aligned arm (thin in Z, between T0..T1)
            if (drawX) {
                if (hasXN) specs.push(_inflate({x:0,  y:0, z:T0, w:T0,    h:1, d:PW}));
                if (hasXP) specs.push(_inflate({x:T1, y:0, z:T0, w:1-T1,  h:1, d:PW}));
            }
            // Z-aligned arm (thin in X, between T0..T1)
            if (drawZ) {
                if (hasZN) specs.push(_inflate({x:T0, y:0, z:0,  w:PW, h:1, d:T0}));
                if (hasZP) specs.push(_inflate({x:T0, y:0, z:T1, w:PW, h:1, d:1-T1}));
            }
            return specs;
        }
        // --- Farmland (62, 63) ---
        if (id === 62 || id === 63) {
            return [_inflate({x:0, y:0, z:0, w:1, h:15/16, d:1})];
        }
        // --- Enchanting Table (201) ---
        if (id === 201) {
            return [_inflate({x:0, y:0, z:0, w:1, h:12/16, d:1})];
        }
        // --- Extended Pistons (207, 208) ---
        if (id === 207 || id === 208) {
            const extended = ((val >> 11) & 0x1) === 1;
            if (!extended) return fullCube; // retracted is full cube
            const pDir = (val >> 8) & 0x7;
            // Body is 12/16 = 0.75 long, positioned opposite to the extension direction
            // pDir: 0=-Y, 1=+Y, 2=-Z, 3=+Z, 4=-X, 5=+X
            const L = 12/16;
            if (pDir === 0) return [_inflate({x:0, y:1-L, z:0, w:1, h:L, d:1})]; // extends -Y: body is high
            if (pDir === 1) return [_inflate({x:0, y:0, z:0, w:1, h:L, d:1})];   // extends +Y: body is low
            if (pDir === 2) return [_inflate({x:0, y:0, z:1-L, w:1, h:1, d:L})]; // extends -Z: body is +Z
            if (pDir === 3) return [_inflate({x:0, y:0, z:0, w:1, h:1, d:L})];   // extends +Z: body is -Z
            if (pDir === 4) return [_inflate({x:1-L, y:0, z:0, w:L, h:1, d:1})]; // extends -X: body is +X
            if (pDir === 5) return [_inflate({x:0, y:0, z:0, w:L, h:1, d:1})];   // extends +X: body is -X
            return fullCube;
        }
        // Default: full cube
        return [_inflate({x:0, y:0, z:0, w:1, h:1, d:1})];
    }
    
    // Rebuild the breakingBox geometry to match a given block id+val.
    // Call before showing breakingBox.visible. Cheap no-op if shape key
    // hasn't changed (i.e. targeting the same block state as last time).
    window.rebuildBreakingBoxForBlock = function(id, val, wx, wy, wz) {
        if (!breakingBox) return;
        // v280: rebuild geometry on every call. Mining starts once per
        // block (not per frame) so this is essentially free.
        const specs = _breakSpecsForBlock(id, val, wx, wy, wz);
        const newGeo = _buildMergedBoxGeometry(specs);
        if (breakingBox.geometry && breakingBox.geometry !== _defaultBreakGeo) {
            breakingBox.geometry.dispose();
        }
        breakingBox.geometry = newGeo;
        newGeo.computeBoundingBox();
        newGeo.computeBoundingSphere();
        // Re-apply current breaking stage UVs to the new geometry.
        if (typeof window.updateBreakingUVs === 'function' && breakingBox.userData.lastUvStage != null) {
            window.updateBreakingUVs(breakingBox.userData.lastUvStage);
        }
    };
    
    if (loadedData) {
        // --- RESTORE SAVED WORLD (v5 unified path) ---
        // dimensionData has already been populated by loadWorldFromSlot.
        // We just need to bind the active dimension, reconstruct biomes for
        // any dimension that doesn't have them (v4 migration), restore the
        // player, and trigger notifyDimensionChange.
        updateLoadingBar(30, 'Restoring world data...');
        await yieldToUI();
        
        // Determine which dimension the player should be in
        const targetDim = loadedData.currentDimension || 'overworld';
        
        // v265: Superflat biome repair pass — runs unconditionally on load
        // (regardless of hasBiomes), because existing broken superflat saves
        // have wrong biomes baked into the persistent map. The bug was that
        // the worldgen worker's biomeMap proxy dropped writes from
        // _generateSuperflatChunk, so the worker sent back all-zero biome
        // IDs which the main thread interpreted as 'desert'. We force-repair
        // by overwriting all generated cells with 'plains'. New saves with
        // the v265 worldgen fix will already be correct, so this is a no-op
        // for them.
        if (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 1) {
            const od = dimensionData['overworld'];
            if (od && od.biomeMap && od.generatedFlags) {
                const ohW = od.worldWidth / 2;
                const ohD = od.worldDepth / 2;
                for (let cx = 0; cx < od.chunksX; cx++) {
                    for (let cz = 0; cz < od.chunksZ; cz++) {
                        if (od.generatedFlags[cx * od.chunksZ + cz] !== 1) continue;
                        const sx = cx * CHUNK_SIZE - ohW, sz = cz * CHUNK_SIZE - ohD;
                        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                                const gIdx = (sx + lx + ohW) + (sz + lz + ohD) * od.worldWidth;
                                if (gIdx >= 0 && gIdx < od.worldWidth * od.worldDepth) {
                                    od.biomeMap[gIdx] = 'plains';
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Reconstruct biomes for dimensions that don't have them persisted.
        // v5 saves persist biomes — only v4-migrated saves need this.
        updateLoadingBar(35, 'Rebuilding biome data...');
        await yieldToUI();
        for (const dimName of ['overworld', 'nether', 'aether']) {
            const dimMeta = loadedData.dimensions ? loadedData.dimensions[dimName] : null;
            if (!dimMeta || !dimMeta.generated) continue;
            if (dimMeta.hasBiomes) continue;  // already loaded from disk
            
            const d = dimensionData[dimName];
            if (!d || !d.chunks || !d.biomeMap) continue;
            
            // Bind to this dimension temporarily so the biome reconstruction
            // helpers operate on the right WORLD_WIDTH/CHUNKS_X. We'll re-bind
            // to the player's dimension at the end.
            _bindActiveDimension(dimName);
            
            const halfW = d.worldWidth / 2;
            const halfD = d.worldDepth / 2;
            
            if (dimName === 'overworld') {
                // Overworld: noise-based biome reconstruction via _computeChunkBiomeData
                for (let cx = 0; cx < d.chunksX; cx++) {
                    for (let cz = 0; cz < d.chunksZ; cz++) {
                        if (d.generatedFlags[cx * d.chunksZ + cz] !== 1) continue;
                        const biomeData = _computeChunkBiomeData(cx, cz);
                        const sx = cx * CHUNK_SIZE - halfW, sz = cz * CHUNK_SIZE - halfD;
                        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                                const gIdx = (sx + lx + halfW) + (sz + lz + halfD) * d.worldWidth;
                                if (gIdx >= 0 && gIdx < d.worldWidth * d.worldDepth)
                                    d.biomeMap[gIdx] = BIOME_NAMES[biomeData.biomes[lx + lz * CHUNK_SIZE]];
                            }
                        }
                    }
                }
            } else if (dimName === 'aether') {
                // Aether: noise-based dense biome reconstruction
                if (typeof _initAetherNoise === 'function') _initAetherNoise();
                if (typeof _computeAetherChunkBiomeData === 'function') {
                    for (let cx = 0; cx < d.chunksX; cx++) {
                        for (let cz = 0; cz < d.chunksZ; cz++) {
                            if (d.generatedFlags[cx * d.chunksZ + cz] !== 1) continue;
                            const aData = _computeAetherChunkBiomeData(cx, cz);
                            if (!aData || !aData.biomes) continue;
                            const sx = cx * CHUNK_SIZE - halfW, sz = cz * CHUNK_SIZE - halfD;
                            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                                    const gIdx = (sx + lx + halfW) + (sz + lz + halfD) * d.worldWidth;
                                    if (gIdx >= 0 && gIdx < d.worldWidth * d.worldDepth) {
                                        const id = aData.biomes[lx + lz * CHUNK_SIZE];
                                        if (typeof AETHER_BIOME_NAMES_BY_ID !== 'undefined')
                                            d.biomeMap[gIdx] = AETHER_BIOME_NAMES_BY_ID[id];
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Nether biomes are uniform; the smoothing kernel will handle the
            // default cells fine, no reconstruction needed.
        }
        
        // Bind to the player's actual dimension
        _bindActiveDimension(targetDim);
        
        // Restore player
        player.x = loadedData.player.x; player.y = loadedData.player.y; player.z = loadedData.player.z;
        player.yaw = loadedData.player.yaw || 0; player.pitch = loadedData.player.pitch || 0;
        player.health = loadedData.player.health || 20; player.maxHealth = loadedData.player.maxHealth || 20;
        player.hunger = (loadedData.player.hunger !== undefined) ? loadedData.player.hunger : 20;
        player.saturation = (loadedData.player.saturation !== undefined) ? loadedData.player.saturation : 5;
        player.exhaustion = (loadedData.player.exhaustion !== undefined) ? loadedData.player.exhaustion : 0;
        player.flying = loadedData.player.flying || false;
        player.highestY = loadedData.player.highestY || loadedData.player.y;
        player.vx = 0; player.vy = 0; player.vz = 0; player.onGround = false;

        // Restore world spawn point
        window.worldSpawnX = loadedData.worldSpawnX !== undefined ? loadedData.worldSpawnX : player.x;
        window.worldSpawnY = loadedData.worldSpawnY !== undefined ? loadedData.worldSpawnY : (player.y - 2);
        window.worldSpawnZ = loadedData.worldSpawnZ !== undefined ? loadedData.worldSpawnZ : player.z;
        
        // Restore inventory
        if (loadedData.inventory) {
            for (let i = 0; i < inventory.length; i++) {
                if (loadedData.inventory[i]) {
                    inventory[i].id = loadedData.inventory[i].id;
                    inventory[i].count = loadedData.inventory[i].count;
                    if (loadedData.inventory[i].durability !== undefined) {
                        inventory[i].durability = loadedData.inventory[i].durability;
                    }
                }
                else { inventory[i].id = 0; inventory[i].count = 0; }
            }
        }

        // Restore armor
        if (loadedData.armor) {
            for (let i = 0; i < 4; i++) {
                if (loadedData.armor[i]) {
                    armorSlots[i].id = loadedData.armor[i].id;
                    armorSlots[i].count = loadedData.armor[i].count;
                    if (loadedData.armor[i].durability !== undefined) {
                        armorSlots[i].durability = loadedData.armor[i].durability;
                    }
                } else {
                    armorSlots[i] = { id: 0, count: 0 };
                }
            }
        }
        
        // Restore experience state
        if (loadedData.xpState && typeof window.setPlayerXPState === 'function') {
            window.setPlayerXPState(loadedData.xpState.level, loadedData.xpState.xp, loadedData.xpState.totalXP);
        }
        
        if (typeof window._recalcArmorHealthBonus === 'function') window._recalcArmorHealthBonus();
        
        // Restore chests
        if (loadedData.chests && typeof activeChests !== 'undefined') {
            activeChests.clear();
            for (const c of loadedData.chests) {
                activeChests.set(c.key, { slots: c.slots, doublePartner: c.doublePartner });
            }
        }
        
        // Restore furnaces
        if (loadedData.furnaces && typeof activeFurnaces !== 'undefined') {
            activeFurnaces.clear();
            for (const f of loadedData.furnaces) {
                activeFurnaces.set(f.key, {
                    input: f.input, fuel: f.fuel, output: f.output,
                    burnTime: f.burnTime, totalBurnTime: f.totalBurnTime,
                    cookTime: f.cookTime, totalCookTime: f.totalCookTime
                });
            }
        }
        
        // Defer dropped items until scene+meshes ready
        if (loadedData.droppedItems && loadedData.droppedItems.length > 0) {
            window._pendingDroppedItems = loadedData.droppedItems;
        }
        
        // Restore portal links
        window._portalLinks = loadedData.portalLinks || [];
        window._aetherPortalLinks = loadedData.aetherPortalLinks || [];
        
        // CRITICAL: notify the dimension-change handler so it spawns the
        // correct dimension worker, resets the mesh worker with the new
        // world dimensions, and clears tracking caches.
        if (typeof notifyDimensionChange === 'function') {
            notifyDimensionChange();
        }
        
        // Lighting and meshing for current dimension
        updateLoadingBar(60, 'Recalculating lighting...');
        await yieldToUI();
        const loadRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        if (useLazyGeneration) {
            const pcx = Math.floor((player.x + Math.floor(WORLD_WIDTH / 2)) / CHUNK_SIZE);
            const pcz = Math.floor((player.z + Math.floor(WORLD_DEPTH / 2)) / CHUNK_SIZE);
            for (let dx = -loadRadius; dx <= loadRadius; dx++)
                for (let dz = -loadRadius; dz <= loadRadius; dz++)
                    ensureChunkGenerated(pcx + dx, pcz + dz);
        }
        recalculateLightingInRadius(player.x, player.z, loadRadius * CHUNK_SIZE);
        
        updateLoadingBar(80, 'Building chunks...');
        await yieldToUI();
        if (useLazyGeneration) updateNearbyChunks(player.x, player.z, loadRadius);
        else updateAllChunks();
        
        updateLoadingBar(90, 'Meshing chunks...');
        await yieldToUI();
        let mc2 = 0; const td2 = dirtyChunks.size;
        for (let key of dirtyChunks) {
            const sep = key.indexOf(',');
            buildChunkMesh(parseInt(key.substring(0, sep)), parseInt(key.substring(sep + 1)));
            if (++mc2 % 64 === 0) { updateLoadingBar(90 + (mc2/td2)*9, `Meshing... ${mc2}/${td2}`); await yieldToUI(); }
        }
        dirtyChunks.clear();
        
        // If loaded into nether, set nether fog/sky immediately
        if (currentDimension === 'nether') {
            scene.fog = new THREE.Fog(0x571313, 1, 100);
            scene.background = new THREE.Color(0x571313);
        }
    } else {
    // --- NORMAL WORLD GENERATION PATH ---
    if (useLazyGeneration) {
        updateLoadingBar(85, 'Preparing spawn area...');
        await yieldToUI();
        const spawnRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        const centerCX = Math.floor(CHUNKS_X / 2);
        const centerCZ = Math.floor(CHUNKS_Z / 2);
        for (let dx = -spawnRadius; dx <= spawnRadius; dx++) {
            for (let dz = -spawnRadius; dz <= spawnRadius; dz++) {
                ensureChunkGenerated(centerCX + dx, centerCZ + dz);
            }
            if (dx % 4 === 0) {
                updateLoadingBar(85 + ((dx + spawnRadius) / (spawnRadius * 2)) * 5, 'Generating spawn chunks...');
                await yieldToUI();
            }
        }
        
        updateLoadingBar(90, 'Calculating spawn lighting...');
        await yieldToUI();
        recalculateLightingInRadius(0, 0, spawnRadius * CHUNK_SIZE);
    } else {
        updateLoadingBar(85, 'Calculating lighting...');
        await yieldToUI();
        recalculateLighting();
    }
    
    updateLoadingBar(92, 'Building initial chunks...');
    await yieldToUI();
    if (useLazyGeneration) {
        const spawnRadius = Math.min(RENDER_DISTANCES[currentRenderDistIndex] + 2, 12);
        updateNearbyChunks(0, 0, spawnRadius);
    } else {
        updateAllChunks();
    }
    
    updateLoadingBar(95, 'Meshing chunks...');
    await yieldToUI();
    let meshCount = 0;
    const totalDirty = dirtyChunks.size;
    for (let key of dirtyChunks) {
        const sep = key.indexOf(',');
        const cx = parseInt(key.substring(0, sep));
        const cz = parseInt(key.substring(sep + 1));
        buildChunkMesh(cx, cz);
        meshCount++;
        if (meshCount % 64 === 0) {
            updateLoadingBar(95 + (meshCount / totalDirty) * 4, `Meshing chunks... ${meshCount}/${totalDirty}`);
            await yieldToUI();
        }
    }
    dirtyChunks.clear();

    let spawnX = 0, spawnZ = 0;
    let spawnY = getHighestBlock(0, 0);
    let foundLand = spawnY >= GEN_SEA_LEVEL || (typeof GEN_WORLD_TYPE !== 'undefined' && GEN_WORLD_TYPE === 1);
    if (!foundLand) {
        for (let r = 1; r < 200 && !foundLand; r += 2) {
            for (let dx = -r; dx <= r && !foundLand; dx += 4) {
                for (let dz = -r; dz <= r && !foundLand; dz += 4) {
                    if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
                    const sy = getHighestBlock(dx, dz);
                    const sid = getVoxel(dx, sy, dz) & 0xFF;
                    if (sy >= GEN_SEA_LEVEL && sid !== 0 && sid !== 4 && sid !== 27) {
                        spawnX = dx; spawnZ = dz; spawnY = sy;
                        foundLand = true;
                    }
                }
            }
        }
    }
    player.x = spawnX;
    player.z = spawnZ;
    player.y = spawnY + 2;

    // Store world spawn for respawning after death
    window.worldSpawnX = spawnX;
    window.worldSpawnZ = spawnZ;
    window.worldSpawnY = spawnY;
    } // end normal generation path

    if (typeof buildUI === 'function') buildUI();
    if (typeof selectSlot === 'function') selectSlot(0);
    if (typeof updateHeldItem === 'function') updateHeldItem();
    if (typeof updateHealthUI === 'function') updateHealthUI();
    if (typeof updateHungerUI === 'function') updateHungerUI();

    // Restore dropped items from save data (deferred until scene + textures are ready)
    if (window._pendingDroppedItems && typeof window.spawnDroppedItem === 'function') {
        for (const item of window._pendingDroppedItems) {
            window.spawnDroppedItem(item.x, item.y, item.z, item.id, item.count, 0, 0, 0);
            // Restore durability on the newly spawned dropped item
            if (item.durability !== undefined && droppedItems.length > 0) {
                droppedItems[droppedItems.length - 1].durability = item.durability;
            }
        }
        delete window._pendingDroppedItems;
    }

    updateLoadingBar(100, 'Done!');
    await yieldToUI();
    
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('ui-layer').classList.remove('hidden');
    document.getElementById('clock-container').style.display = '';
    document.getElementById('hud-layer').style.display = '';
    if (typeof window.buildXPBarUI === 'function') window.buildXPBarUI();
    if (typeof window.updateXPBarUI === 'function') window.updateXPBarUI();
    
    if (typeof applyGUIScale === 'function') applyGUIScale(); 
    
    // Position camera at player so the view is correct behind the overlay
    camera.position.set(player.x, player.y + player.eyeLevel, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    
    // Spawn the worldgen worker for background chunk generation.
    // Falls back to inline gen on the main thread if worker fails.
    // v267: generateWorld() now spawns the worker early for fresh worlds.
    // This call only runs for the load path (where generateWorld isn't called)
    // or as a defensive re-spawn if the early spawn somehow failed.
    const alreadySpawned = (typeof window.isWorldgenWorkerSpawned === 'function' && window.isWorldgenWorkerSpawned());
    if (typeof spawnWorldgenWorker === 'function' && !alreadySpawned) {
        try { spawnWorldgenWorker(); } catch(e) { console.warn('worker spawn failed:', e); }
    }
    // Spawn the mesh builder worker for background mesh building.
    if (typeof spawnMeshWorker === 'function') {
        try { spawnMeshWorker(); } catch(e) { console.warn('mesh worker spawn failed:', e); }
    }
    
    animate();

    // Show "Click to Play" overlay instead of auto-requesting pointer lock
    _showClickToPlay();

    window.addEventListener('resize', () => {
        onWindowResize();
        applyGUIScale(); 
    });
    
    document.addEventListener('keydown', (e) => { 
        // ---> NEW: F3 Debug Screen Toggle <---
        if (e.code === 'F3') {
            e.preventDefault(); // Stop browser search bar from opening
            window.showDebugScreen = !window.showDebugScreen;
            return;
        }

        // F3 + M: toggle mob spawn menu
        if (e.code === 'KeyM' && window.showDebugScreen && uiState === 'PLAYING') {
            e.preventDefault();
            window._toggleMobSpawnMenu();
            return;
        }

        // F3 + P: toggle gamemode between creative and survival (dev shortcut)
        if ((e.code === 'KeyP' || e.code === 'Equal') && window.showDebugScreen) {
            e.preventDefault();
            gameMode = (gameMode === 'creative') ? 'survival' : 'creative';

            // If switching to survival while flying, disable flight
            if (gameMode === 'survival' && player.flying) {
                player.flying = false;
                player.vy = 0;
                const flightEl = document.getElementById('flight-indicator');
                if (flightEl) { flightEl.textContent = '✦ Not Flying'; flightEl.style.opacity = '1'; setTimeout(() => flightEl.style.opacity = '0', 1500); }
            }

            // Refresh health bar visibility
            if (typeof updateHealthUI === 'function') updateHealthUI();
            if (typeof updateHungerUI === 'function') updateHungerUI();
            if (typeof window.updateMobileEatBtnVisibility === 'function') window.updateMobileEatBtnVisibility();
            if (typeof buildUI === 'function') buildUI();

            const el = document.getElementById('action-text');
            if (el) {
                el.textContent = 'Game Mode: ' + (gameMode === 'creative' ? 'Creative' : 'Survival');
                el.style.opacity = '1';
                clearTimeout(window._actionTextTO);
                window._actionTextTO = setTimeout(() => el.style.opacity = '0', 2000);
            }
            return;
        } 
        if (e.repeat) return; 

        if(uiState === 'PLAYING') {
            if(keys.hasOwnProperty(e.code)) keys[e.code] = true; 

            if (e.code === 'KeyW') {
                const now = performance.now();
                if (now - lastWPressTime < DOUBLE_TAP_THRESHOLD) {
                    wDoubleTapped = true;
                }
                lastWPressTime = now;
            }

            if (e.code === 'Space') {
                const now = performance.now();
                if (now - lastSpacePressTime < DOUBLE_TAP_THRESHOLD && gameMode === 'creative') {
                    player.flying = !player.flying;
                    player.vy = 0;
                    const flightEl = document.getElementById('flight-indicator');
                    flightEl.textContent = player.flying ? '✦ Flying' : '✦ Not Flying';
                    flightEl.style.opacity = '1';
                    setTimeout(() => flightEl.style.opacity = '0', 1500);
                    lastSpacePressTime = 0; 
                } else {
                    lastSpacePressTime = now;
                }
            }

            if (e.code === 'KeyQ') {
                const item = inventory[activeSlot];
                if (item && item.id !== 0 && item.count > 0) {
                    const dropCount = keys.ShiftLeft ? item.count : 1;
                    
                    window.tossItem(item.id, dropCount, item.durability);

                    item.count -= dropCount;
                    if (item.count <= 0) {
                        item.id = 0;
                        item.count = 0;
                        delete item.durability;
                    }

                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                    // Re-render open inventory UIs after dropping
                    if (uiState === 'INVENTORY' && typeof renderInventory === 'function') renderInventory();
                    else if (uiState === 'CRAFTING' && typeof renderInventory === 'function') renderInventory();
                    else if (uiState === 'FURNACE' && typeof renderFurnace === 'function') renderFurnace();
                    else if (uiState === 'CHEST' && typeof renderChest === 'function') renderChest();
                    else if (uiState === 'ENCHANTING' && typeof renderEnchanting === 'function') renderEnchanting();
                }
            }
        }

        if(e.code === 'KeyE') {
            if (uiState === 'PLAYING') {
                uiState = 'INVENTORY';
                document.exitPointerLock();
                
                if (gameMode === 'creative') {
                    document.getElementById('inventory-modal').classList.remove('hidden');
                } else {
                    document.getElementById('survival-inventory-modal').classList.remove('hidden');
                    if (typeof window._startInventoryDoll === 'function') window._startInventoryDoll();
                }
                
                if (typeof renderInventory === 'function') renderInventory();
            } else if (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING') {
                // Play chest close sound if we're closing a chest
                if (uiState === 'CHEST' && typeof window.playChestCloseSound === 'function') window.playChestCloseSound(window._lastChestX, window._lastChestY, window._lastChestZ);
                if (typeof closeCraftingTable === 'function') closeCraftingTable();
                if (typeof closeFurnace === 'function') closeFurnace();
                if (typeof closeChest === 'function') closeChest();
                if (typeof closeEnchantingTable === 'function') closeEnchantingTable();
                if (typeof window._stopInventoryDoll === 'function') window._stopInventoryDoll();
                document.body.requestPointerLock(); 
            }
        }

        if(e.code === 'KeyF' && uiState === 'PLAYING') {
            toggleRenderDist(); 
            const radius = RENDER_DISTANCES[currentRenderDistIndex];
            const el = document.getElementById('action-text');
            el.textContent = `Render Distance: ${RENDER_NAMES[currentRenderDistIndex]} (${radius} Chunks)`;
            el.style.opacity = '1';
            clearTimeout(actionTextTimeout);
            actionTextTimeout = setTimeout(() => el.style.opacity = '0', 2000);
        }

        if(e.code === 'KeyH' && uiState === 'PLAYING') {
            if (typeof toggleCameraMode === 'function') toggleCameraMode();
        }

        if ((uiState === 'PLAYING' || uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING') && e.key >= '1' && e.key <= '9') {
            selectSlot(parseInt(e.key) - 1);
            if (uiState === 'INVENTORY' || uiState === 'CRAFTING') {
                if (typeof renderInventory === 'function') renderInventory();
            }
            if (uiState === 'FURNACE' && typeof renderFurnace === 'function') {
                renderFurnace();
            }
            if (uiState === 'CHEST' && typeof renderChest === 'function') {
                renderChest();
            }
            if (uiState === 'ENCHANTING' && typeof renderEnchanting === 'function') {
                renderEnchanting();
            }
        }
    });
    
    document.addEventListener('keyup', (e) => { 
        if(keys.hasOwnProperty(e.code)) keys[e.code] = false; 
        if (e.code === 'KeyW') wDoubleTapped = false;
    });
    
    document.addEventListener('wheel', (e) => {
        if (uiState !== 'PLAYING') return;
        if (e.deltaY > 0) activeSlot = (activeSlot + 1) % 9;
        else activeSlot = (activeSlot - 1 + 9) % 9;
        selectSlot(activeSlot);
    });

        
// --- COMBAT RAYCAST ---
const _mobRayDir = new THREE.Vector3(); // FIX: Pre-allocated to prevent GC stutter!

window.getTargetedMob = function() {
    let bestMob = null;
    let bestDist = 4.0; // Max reach distance
    camera.getWorldDirection(_mobRayDir);
    
    if (typeof globalMobs === 'undefined') return null;
    
    for (let mob of globalMobs) {
        if (mob.dead || mob.dying) continue; // Don't target dying pigs
        
        const dx = mob.x - player.x;
        const dy = (mob.y + mob.height/2) - (player.y + player.eyeLevel);
        const dz = mob.z - player.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        if (dist < bestDist) {
            const dot = (dx*_mobRayDir.x + dy*_mobRayDir.y + dz*_mobRayDir.z) / dist;
            if (dot > 0.92) { 
                bestDist = dist;
                bestMob = mob;
            }
        }
    }
    return bestMob;
};

    document.addEventListener('mousedown', (e) => {
        
        // --- INVENTORY OUTSIDE-CLICK TOSS LOGIC ---
        if ((uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING') && typeof cursorItem !== 'undefined' && cursorItem) {
            const survModal = document.getElementById('survival-inventory-modal');
            const creatModal = document.getElementById('inventory-modal');
            const craftModal = document.getElementById('crafting-table-modal');
            const furnModal = document.getElementById('furnace-modal');
            const enchantModal = document.getElementById('enchanting-modal');
            
            let clickedInside = false;
            if (survModal && survModal.contains(e.target)) clickedInside = true;
            if (creatModal && creatModal.contains(e.target)) clickedInside = true;
            if (craftModal && craftModal.contains(e.target)) clickedInside = true;
            if (furnModal && furnModal.contains(e.target)) clickedInside = true;
            if (enchantModal && enchantModal.contains(e.target)) clickedInside = true;
            if (e.target.closest('.item-slot')) clickedInside = true;

            if (!clickedInside) {
                window.tossItem(cursorItem.id, cursorItem.count, cursorItem.durability);
                cursorItem = null;
                if (typeof updateCursorItemUI === 'function') updateCursorItemUI(e);
                return;
            }
        }

        if (!isPointerLocked || uiState !== 'PLAYING') return;
        
        // --- BOW SHOOTING (before swing animation) ---
        // Right-click (button 2) with bow equipped fires an arrow
        if (currentBuildBlock === 164 && e.button === 2) {
            e.preventDefault();
            console.log('[BOW] Right-click detected with bow, calling shootArrow');
            if (typeof window.shootArrow === 'function') {
                window.shootArrow();
            } else {
                console.error('[BOW] window.shootArrow is not defined!');
            }
            return;
        }

        swingAnimation = 1.0;

        // --- EAT FOOD INTERACTION (Independent of block targeting) ---

        if (e.button === 2 && typeof window.isFoodItem === 'function' && window.isFoodItem(currentBuildBlock) && uiState === 'PLAYING') {
            const hungerOn = (typeof GEN_HUNGER_ENABLED !== 'undefined' && GEN_HUNGER_ENABLED);
            if (hungerOn && gameMode === 'survival') {
                // v286: hold to eat. Only start if hunger < max.
                if (player.hunger < (player.maxHunger || 20)) {
                    window.isRightMouseHeld = true;
                    player.eatItemId = currentBuildBlock;
                    player.eatTimer = 0;
                    player.eatSoundTimer = 0;
                }
                return;
            }
            // Legacy instant eat (hunger disabled or creative)
            const didEat = typeof window.applyFoodEffect === 'function' && window.applyFoodEffect(currentBuildBlock);
            if (didEat) {
                if (typeof window.playBurpSound === 'function') window.playBurpSound();
                if (typeof gameMode !== 'undefined' && gameMode === 'survival') {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) {
                        inventory[activeSlot].id = 0;
                        inventory[activeSlot].count = 0;
                    }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                swingAnimation = 1.0;
            }
            return; // Handled item use, don't proceed to block placement logic
        }

        const target = raycastVoxel();

        if (e.button === 0) {
            window.isLeftMouseHeld = true; 
            
            // ---> NEW: COMBAT CHECK BEFORE BREAKING BLOCKS <---
            const hitMob = typeof getTargetedMob === 'function' ? getTargetedMob() : null;
            if (hitMob) {
                swingAnimation = 1.0; // Swing arm
                
                // Calculate Damage (Default fist = 1)
                let damage = 1; 
                if (currentBuildBlock !== 0 && typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock]) {
                    damage = TOOL_DATA[currentBuildBlock].damage || 1;
                }
                
                hitMob.takeDamage(damage, player.x, player.z);
                window.damageHeldTool(2); // Hitting a mob costs 2 durability in MC
                return; // Stop here so we don't break the block behind the pig!
            }
            // --------------------------------------------------

            if (!target) return; // If we didn't hit a mob, make sure we hit a block before continuing
            const [x, y, z] = target.hit;
            const targetId = getVoxel(x, y, z) & 0xFF;
            
            if (targetId === 18 || targetId === 0) return; 

            if (typeof gameMode !== 'undefined' && gameMode === 'creative') {
                // TNT: Ignite on left-click instead of breaking
                if (targetId === 65) {
                    if (typeof window.igniteTNT === 'function') window.igniteTNT(x, y, z);
                    window.blockBreakCooldown = 0.3;
                } else {
                    window.breakBlock(x, y, z);
                    window.blockBreakCooldown = 0.3; 
                }
            } else {
                miningState.isMining = true;
                miningState.x = x;
                miningState.y = y;
                miningState.z = z;
                miningState.id = targetId;
                miningState.progress = 0;
                miningState.stage = -1;
                if (typeof breakingBox !== 'undefined') {
                    // v280.1: rebuild overlay geometry for the target block
                    if (typeof window.rebuildBreakingBoxForBlock === 'function') {
                        window.rebuildBreakingBoxForBlock(targetId, getVoxel(x, y, z), x, y, z);
                    }
                    breakingBox.position.set(x + 0.5, y + 0.5, z + 0.5);
                    breakingBox.visible = true;
                }
            }
            
        } else if (e.button === 2) {
            
            // FIX: Prevent crashes if you right-click the sky
            if (!target) return; 

            // ---> NEW: Tilling Dirt/Grass with a Hoe <---
            if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock] && TOOL_DATA[currentBuildBlock].type === 'hoe') {
                const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                
                // If clicking the top face of Grass (1) or Dirt (2)
                if ((targetId === 1 || targetId === 2) && target.normal[1] === 1) {
                    const aboveId = getVoxel(target.hit[0], target.hit[1] + 1, target.hit[2]) & 0xFF;
                    if (aboveId === 0) { // Ensure the block above is air
                        setVoxel(target.hit[0], target.hit[1], target.hit[2], 62); // Turn to Dry Farmland
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                        
                        // v310: Tilling grass has a 15% chance to drop seeds.
                        // This is the primary way to get seeds since alpha
                        // worlds no longer have tall grass (and this works
                        // in regular worlds too, matching MC behavior).
                        if (targetId === 1 && Math.random() < 0.15 && typeof window.spawnDroppedItem === 'function') {
                            window.spawnDroppedItem(target.hit[0] + 0.5, target.hit[1] + 1.2, target.hit[2] + 0.5, 128, 1);
                        }
                        // v310: Track this farmland for moisture decay
                        if (typeof window._trackFarmland === 'function') {
                            window._trackFarmland(target.hit[0], target.hit[1], target.hit[2]);
                        }
                        
                        if (typeof spawnParticles === 'function') spawnParticles(target.hit[0], target.hit[1], target.hit[2], 2);
                        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
                        if (typeof window.playBlockSoundAt === 'function') window.playBlockSoundAt(2, 'dig', 0.6, target.hit[0], target.hit[1], target.hit[2]);
                        
                        swingAnimation = 1.0;
                        return; // Stop further placement logic
                    }
                }
            }

            // ---> Lily Pad Placement on Water <---
            if (currentBuildBlock === 67) {
                const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                // Place on top of water when clicking the top face, or on water surface
                if (targetId === 4 && target.normal[1] === 1) {
                    const aboveId = getVoxel(target.hit[0], target.hit[1] + 1, target.hit[2]) & 0xFF;
                    if (aboveId === 0) {
                        setVoxel(target.hit[0], target.hit[1] + 1, target.hit[2], 67);
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1] + 1, z: target.hit[2]});
                        
                        if (typeof gameMode !== 'undefined' && gameMode === 'survival') {
                            inventory[activeSlot].count--;
                            if (inventory[activeSlot].count <= 0) {
                                inventory[activeSlot].id = 0; inventory[activeSlot].count = 0;
                            }
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        }
                        swingAnimation = 1.0;
                        return;
                    }
                }
            }

            // ---> UPDATED: Planting Seeds <---
            if (currentBuildBlock === 128) {
                const targetId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                
                // FIX: Removed the strict normal check because Farmland is inset. 
                // If you click farmland and there is air above it, it will plant!
                if (targetId === 62 || targetId === 63) {
                    const aboveId = getVoxel(target.hit[0], target.hit[1] + 1, target.hit[2]) & 0xFF;
                    if (aboveId === 0) {
                        setVoxel(target.hit[0], target.hit[1] + 1, target.hit[2], 64, 0); // Place Crop Stage 0
                        
                        // Force chunk update immediately so the crop appears!
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1] + 1, z: target.hit[2]}); 
                        
                        if (typeof gameMode !== 'undefined' && gameMode === 'survival') {
                            inventory[activeSlot].count--;
                            if (inventory[activeSlot].count <= 0) {
                                inventory[activeSlot].id = 0; 
                                inventory[activeSlot].count = 0;
                            }
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        }
                        swingAnimation = 1.0;
                    }
                }
                // Seeds always return — never fall through to block placement
                return;
            }
            
            // --- UI BLOCK INTERACTIONS ---
            const interactTargetVal = getVoxel(target.hit[0], target.hit[1], target.hit[2]);
            const interactTargetId = interactTargetVal & 0xFF;
            
            if (interactTargetId === 58 && uiState === 'PLAYING') {
                uiState = 'CRAFTING';
                document.exitPointerLock();
                if (typeof openCraftingTable === 'function') openCraftingTable();
                return; // Do not place a block!
            }
            
            if (interactTargetId === 59 && uiState === 'PLAYING') {
                uiState = 'FURNACE';
                document.exitPointerLock();
                if (typeof openFurnace === 'function') openFurnace(target.hit[0], target.hit[1], target.hit[2]);
                return; 
            }

            // ---> CHEST INTERACTION <---
            if (interactTargetId === 69 && uiState === 'PLAYING') {
                uiState = 'CHEST';
                document.exitPointerLock();
                if (typeof openChest === 'function') openChest(target.hit[0], target.hit[1], target.hit[2]);
                return;
            }

            // ---> LOOT CHEST INTERACTION (opens same as normal chest) <---
            if (interactTargetId === 93 && uiState === 'PLAYING') {
                uiState = 'CHEST';
                document.exitPointerLock();
                if (typeof openChest === 'function') openChest(target.hit[0], target.hit[1], target.hit[2]);
                return;
            }

            // ---> NEW: STRUCTURE BLOCK INTERACTION <---
            if (interactTargetId === 60 && uiState === 'PLAYING') {
                if (typeof openStructureUI === 'function') {
                    openStructureUI(target.hit[0], target.hit[1], target.hit[2]);
                }
                return; 
            }

            // ---> ENCHANTING TABLE INTERACTION <---
            if (interactTargetId === 201 && uiState === 'PLAYING') {
                uiState = 'ENCHANTING';
                document.exitPointerLock();
                if (typeof openEnchantingTable === 'function') openEnchantingTable(target.hit[0], target.hit[1], target.hit[2]);
                return;
            }

            // ---> DOOR INTERACTION (toggle open/close) <---
            if (interactTargetId === 149 && uiState === 'PLAYING') {
                const dx = target.hit[0], dy = target.hit[1], dz = target.hit[2];
                const dval = getVoxel(dx, dy, dz);
                const wasOpen = (dval >> 10) & 0x1;
                setVoxel(dx, dy, dz, dval ^ (1 << 10));
                const isTopHalf = (dval >> 11) & 0x1;
                const otherY = isTopHalf ? dy - 1 : dy + 1;
                const otherVal = getVoxel(dx, otherY, dz);
                if ((otherVal & 0xFF) === 149) {
                    setVoxel(dx, otherY, dz, otherVal ^ (1 << 10));
                    if (typeof updateChunks === 'function') updateChunks(dx, otherY, dz);
                    pendingBlockUpdates.push({x: dx, y: otherY, z: dz});
                    triggerNeighborUpdates(dx, otherY, dz);
                }
                if (typeof updateChunks === 'function') updateChunks(dx, dy, dz);
                pendingBlockUpdates.push({x: dx, y: dy, z: dz});
                triggerNeighborUpdates(dx, dy, dz);
                if (typeof window.playDoorSound === 'function') window.playDoorSound(!wasOpen, dx, dy, dz);
                return;
            }

            // ---> TRAPDOOR INTERACTION (toggle open/close) <---
            if (interactTargetId === 150 && uiState === 'PLAYING') {
                const tx = target.hit[0], ty = target.hit[1], tz = target.hit[2];
                const tval = getVoxel(tx, ty, tz);
                const wasOpen = (tval >> 10) & 0x1;
                setVoxel(tx, ty, tz, tval ^ (1 << 10));
                if (typeof updateChunks === 'function') updateChunks(tx, ty, tz);
                if (typeof window.playDoorSound === 'function') window.playDoorSound(!wasOpen, tx, ty, tz);
                return;
            }

            // ---> WOOD BUTTON INTERACTION <---
            if (interactTargetId === 203 && uiState === 'PLAYING') {
                if (typeof window.pressButton === 'function') {
                    window.pressButton(target.hit[0], target.hit[1], target.hit[2]);
                }
                swingAnimation = 1.0;
                return;
            }

            // ---> LEVER INTERACTION (toggle) <---
            if (interactTargetId === 205 && uiState === 'PLAYING') {
                if (typeof window.toggleLever === 'function') {
                    window.toggleLever(target.hit[0], target.hit[1], target.hit[2]);
                }
                swingAnimation = 1.0;
                return;
            }

            if (currentBuildBlock === 0) return;

            // ---> BUCKET SYSTEM (before placement guards) <---
            if (currentBuildBlock === 223 || currentBuildBlock === 224 || currentBuildBlock === 225) {
                if (currentBuildBlock === 223) {
                    // Empty bucket — use fluid raycast to find source blocks
                    const fluidTarget = typeof raycastFluidSource === 'function' ? raycastFluidSource() : null;
                    if (fluidTarget) {
                        const fhX = fluidTarget.hit[0], fhY = fluidTarget.hit[1], fhZ = fluidTarget.hit[2];
                        const fhId = fluidTarget.id;
                        if (fhId === 4) {
                            setVoxel(fhX, fhY, fhZ, 0);
                            pendingBlockUpdates.push({x: fhX, y: fhY, z: fhZ});
                            if (typeof queueNeighbors === 'function') queueNeighbors(fhX, fhY, fhZ);
                            if (typeof updateChunks === 'function') updateChunks(fhX, fhY, fhZ);
                            if (inventory[activeSlot].count > 1) {
                                inventory[activeSlot].count--;
                                let added = false;
                                for (let s = 0; s < inventory.length; s++) {
                                    if (inventory[s].id === 0) { inventory[s] = {id: 224, count: 1}; added = true; break; }
                                }
                                if (!added && typeof window.spawnDroppedItem === 'function') window.spawnDroppedItem(player.x, player.y + 1, player.z, 224, 1);
                            } else {
                                inventory[activeSlot] = {id: 224, count: 1};
                            }
                            const sv = Math.floor(Math.random() * 3);
                            if (typeof window.playNamedSound === 'function') window.playNamedSound('water_fill_' + sv, 1.0, 0.9, 1.1);
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                            swingAnimation = 1.0; return;
                        } else if (fhId === 27) {
                            setVoxel(fhX, fhY, fhZ, 0);
                            pendingBlockUpdates.push({x: fhX, y: fhY, z: fhZ});
                            if (typeof queueNeighbors === 'function') queueNeighbors(fhX, fhY, fhZ);
                            if (typeof updateChunks === 'function') updateChunks(fhX, fhY, fhZ);
                            if (inventory[activeSlot].count > 1) {
                                inventory[activeSlot].count--;
                                let added = false;
                                for (let s = 0; s < inventory.length; s++) {
                                    if (inventory[s].id === 0) { inventory[s] = {id: 225, count: 1}; added = true; break; }
                                }
                                if (!added && typeof window.spawnDroppedItem === 'function') window.spawnDroppedItem(player.x, player.y + 1, player.z, 225, 1);
                            } else {
                                inventory[activeSlot] = {id: 225, count: 1};
                            }
                            const sv = Math.floor(Math.random() * 3);
                            if (typeof window.playNamedSound === 'function') window.playNamedSound('lava_fill_' + sv, 1.0, 0.9, 1.1);
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                            swingAnimation = 1.0; return;
                        }
                    }
                    // If no fluid found, empty bucket does nothing on right-click
                    swingAnimation = 1.0; return;
                }
                
                // Water/lava bucket placement — use normal raycast target
                const hitX = target.hit[0], hitY = target.hit[1], hitZ = target.hit[2];
                const hitId = getVoxel(hitX, hitY, hitZ) & 0xFF;
                let px = hitX + target.normal[0];
                let py = hitY + target.normal[1];
                let pz = hitZ + target.normal[2];

                if (currentBuildBlock === 224) {
                    // Water bucket can't be used in the nether at all — water
                    // would evaporate, and the aether portal frame ignition
                    // (which uses water) shouldn't work in the nether either.
                    if (typeof currentDimension !== 'undefined' && currentDimension === 'nether') {
                        swingAnimation = 1.0; return;
                    }
                    // Water bucket — place at hit pos if fluid, otherwise adjacent
                    if (hitId === 4 || hitId === 27) { px = hitX; py = hitY; pz = hitZ; }
                    const placeId = getVoxel(px, py, pz) & 0xFF;
                    if (placeId === 0 || placeId === 4 || placeId === 27 || (typeof isCrossBlock === 'function' && isCrossBlock(placeId))) {
                        // Check for aether portal frame before placing water
                        if (typeof detectAetherPortalFrame === 'function') {
                            const aetherResult = detectAetherPortalFrame(px, py, pz);
                            if (aetherResult) {
                                for (const pos of aetherResult.interior) {
                                    setVoxel(pos.x, pos.y, pos.z, 209, aetherResult.axis);
                                    pendingBlockUpdates.push({x: pos.x, y: pos.y, z: pos.z});
                                }
                                if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                                inventory[activeSlot] = {id: 223, count: 1};
                                const sv = Math.floor(Math.random() * 3);
                                if (typeof window.playNamedSound === 'function') window.playNamedSound('water_empty_' + sv, 1.0, 0.9, 1.1);
                                if (typeof buildUI === 'function') buildUI();
                                if (typeof selectSlot === 'function') selectSlot(activeSlot);
                                swingAnimation = 1.0; return;
                            }
                        }
                        setVoxel(px, py, pz, 4, 8, 0, 1);
                        pendingBlockUpdates.push({x: px, y: py, z: pz});
                        if (typeof queueNeighbors === 'function') queueNeighbors(px, py, pz);
                        if (typeof updateWaterQueue !== 'undefined' && typeof getVoxelIndex === 'function') updateWaterQueue.add(getVoxelIndex(px, py, pz));
                        if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                        inventory[activeSlot] = {id: 223, count: 1};
                        const sv = Math.floor(Math.random() * 3);
                        if (typeof window.playNamedSound === 'function') window.playNamedSound('water_empty_' + sv, 1.0, 0.9, 1.1);
                        if (typeof buildUI === 'function') buildUI();
                        if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        swingAnimation = 1.0; return;
                    }
                } else if (currentBuildBlock === 225) {
                    if (hitId === 4 || hitId === 27) { px = hitX; py = hitY; pz = hitZ; }
                    const placeId = getVoxel(px, py, pz) & 0xFF;
                    if (placeId === 0 || placeId === 4 || placeId === 27 || (typeof isCrossBlock === 'function' && isCrossBlock(placeId))) {
                        setVoxel(px, py, pz, 27, 4, 0, 1);
                        pendingBlockUpdates.push({x: px, y: py, z: pz});
                        if (typeof queueNeighbors === 'function') queueNeighbors(px, py, pz);
                        if (typeof updateLavaQueue !== 'undefined' && typeof getVoxelIndex === 'function') updateLavaQueue.add(getVoxelIndex(px, py, pz));
                        if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                        inventory[activeSlot] = {id: 223, count: 1};
                        const sv = Math.floor(Math.random() * 3);
                        if (typeof window.playNamedSound === 'function') window.playNamedSound('lava_empty_' + sv, 1.0, 0.9, 1.1);
                        if (typeof buildUI === 'function') buildUI();
                        if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        swingAnimation = 1.0; return;
                    }
                }
                swingAnimation = 1.0; return;
            }
            
            // Block placement of tools/items — only allow actual placeable blocks and saplings
            if (currentBuildBlock >= 100) {
                // These are placeable despite being >= 100
                const placeableHighIds = [116, 117, 118, 128, 136, 137, 138, 139, 140, 141, 144, 145, 146, 147, 148, 150, 151, 152, 154, 155, 156, 157, 158, 190, 191, 192, 193, 194, 195, 196, 200, 201, 202, 203, 205, 206, 207, 208, 210, 212, 213, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251];
                if (!placeableHighIds.includes(currentBuildBlock)) return;
            }

            let px = target.hit[0] + target.normal[0];
            let py = target.hit[1] + target.normal[1];
            let pz = target.hit[2] + target.normal[2];
            
            const targetVal = getVoxel(target.hit[0], target.hit[1], target.hit[2]);
            const targetId = targetVal & 0xFF;
            
            // Check if placement position is already occupied by a non-air, non-fluid block
            // (except for special cases like snow stacking, slab doubling, etc.)
            const existingId = getVoxel(px, py, pz) & 0xFF;
            if (existingId !== 0 && existingId !== 4 && existingId !== 27) {
                // Allow slab doubling, snow stacking - these are handled below
                // But block anything else from being placed here
                if (currentBuildBlock !== 40 || existingId !== 40) { // snow stacking exception
                    if (!isSlabBlock(currentBuildBlock) || !isSlabBlock(existingId)) { // slab doubling exception
                        return;
                    }
                }
            }
            
            if (currentBuildBlock === 40 && targetId === 40) {
                const curLayers = Math.max(1, Math.min(8, (targetVal >> 8) & 0xF));
                if (curLayers < 8) {
                    const newLayers = curLayers + 1;
                    if (newLayers >= 8) setVoxel(target.hit[0], target.hit[1], target.hit[2], 39); 
                    else setVoxel(target.hit[0], target.hit[1], target.hit[2], 40, newLayers);
                    pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                    
                    if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                        inventory[activeSlot].count--;
                        if (inventory[activeSlot].count <= 0) {
                            inventory[activeSlot].id = 0; inventory[activeSlot].count = 0;
                        }
                        if (typeof buildUI === 'function') buildUI();
                        if (typeof selectSlot === 'function') selectSlot(activeSlot);
                    }
                    return;
                }
            }
            
            // --- SLAB DOUBLING: Clicking a slab with matching slab fills into full block ---
            // Minecraft rules: clicking the open face of a slab (top face of bottom slab, 
            // bottom face of top slab) merges into a full block.
            // Side faces place adjacent, NOT merge.
            if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock) && currentBuildBlock === targetId) {
                const existingIsTop = (targetVal >> 8) & 0x1;
                const slabToFull = { 70: 29, 71: 44, 72: 30, 73: 3, 74: 33, 75: 32, 76: 31, 77: 98, 157: 156, 238: 227, 239: 228, 240: 231, 241: 232, 242: 233, 248: 19, 249: 154 };
                const fullBlock = slabToFull[currentBuildBlock];
                if (fullBlock) {
                    // Only merge when clicking the open (exposed) face of the slab
                    let shouldMerge = false;
                    if (existingIsTop === 0 && target.normal[1] === 1) shouldMerge = true;   // Bottom slab, clicked top face (open)
                    else if (existingIsTop === 1 && target.normal[1] === -1) shouldMerge = true; // Top slab, clicked bottom face (open)
                    
                    if (shouldMerge) {
                        setVoxel(target.hit[0], target.hit[1], target.hit[2], fullBlock);
                        pendingBlockUpdates.push({x: target.hit[0], y: target.hit[1], z: target.hit[2]});
                        if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(fullBlock, target.hit[0], target.hit[1], target.hit[2]);
                        
                        if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                            inventory[activeSlot].count--;
                            if (inventory[activeSlot].count <= 0) {
                                inventory[activeSlot].id = 0; inventory[activeSlot].count = 0;
                            }
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        }
                        return;
                    }
                    // Otherwise fall through to normal adjacent placement
                }
            }
            
            // --- SLAB MERGE AT PLACEMENT POSITION ---
            // When placing a slab into a space that already has the opposite half of the same slab,
            // merge them into a full block instead of overwriting.
            if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock)) {
                const placeVal = getVoxel(px, py, pz);
                const placeId = placeVal & 0xFF;
                if (placeId === currentBuildBlock) {
                    const existingIsTop = (placeVal >> 8) & 0x1;
                    const slabToFull = { 70: 29, 71: 44, 72: 30, 73: 3, 74: 33, 75: 32, 76: 31, 77: 98, 157: 156, 238: 227, 239: 228, 240: 231, 241: 232, 242: 233, 248: 19, 249: 154 };
                    const fullBlock = slabToFull[currentBuildBlock];
                    // Determine what half we'd place
                    let newIsTop = 0;
                    if (target.normal[1] === 1) newIsTop = 0;
                    else if (target.normal[1] === -1) newIsTop = 1;
                    else if (target.exactHit) {
                        const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                        newIsTop = (localY >= 0.5) ? 1 : 0;
                    }
                    // If opposite halves, merge into full block
                    if (fullBlock && existingIsTop !== newIsTop) {
                        setVoxel(px, py, pz, fullBlock);
                        pendingBlockUpdates.push({x: px, y: py, z: pz});
                        if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(fullBlock, px, py, pz);
                        
                        if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                            inventory[activeSlot].count--;
                            if (inventory[activeSlot].count <= 0) {
                                inventory[activeSlot].id = 0; inventory[activeSlot].count = 0;
                            }
                            if (typeof buildUI === 'function') buildUI();
                            if (typeof selectSlot === 'function') selectSlot(activeSlot);
                        }
                        return;
                    }
                    // Same half already exists — can't place here, block placement
                    if (existingIsTop === newIsTop) return;
                }
            }
            
            if (isCrossBlock(targetId)) {
                px = target.hit[0]; py = target.hit[1]; pz = target.hit[2];
            }

            // ---> SPAWN EGG USE (before canPlaceBlock since eggs aren't blocks) <---
            if (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[currentBuildBlock] && TOOL_DATA[currentBuildBlock].type === 'spawn_egg') {
                const mobType = TOOL_DATA[currentBuildBlock].mobType;
                if (typeof window.spawnMob === 'function') {
                    const sx = target.hit[0] + target.normal[0] + 0.5;
                    const sy = target.hit[1] + target.normal[1];
                    const sz = target.hit[2] + target.normal[2] + 0.5;
                    window.spawnMob(mobType, sx, sy, sz);
                }
                if (gameMode === 'survival') {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) {
                        inventory[activeSlot].id = 0;
                        inventory[activeSlot].count = 0;
                    }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                swingAnimation = 1.0;
                return;
            }

            if (!canPlaceBlock(currentBuildBlock, px, py, pz, target.normal)) return;
            
            // ---> NEW: Flint and Steel Ignition <---
            if (currentBuildBlock === 136) { 
                if ((getVoxel(px, py, pz) & 0xFF) === 0) {
                    
                    // --- PORTAL DETECTION ---
                    // Check if clicking inside a valid obsidian portal frame
                    const portalResult = detectPortalFrame(px, py, pz);
                    if (portalResult) {
                        // Nether portals can't be lit in the aether — you'd be
                        // bypassing the overworld which is not allowed.
                        if (typeof currentDimension !== 'undefined' && currentDimension === 'aether') {
                            swingAnimation = 1.0;
                            return;
                        }
                        // Fill portal interior with portal blocks
                        for (const pos of portalResult.interior) {
                            setVoxel(pos.x, pos.y, pos.z, 90, portalResult.axis); // axis: 0=X-aligned, 1=Z-aligned
                            pendingBlockUpdates.push({x: pos.x, y: pos.y, z: pos.z});
                        }
                        if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
                        if (typeof window.playFlintAndSteelSound === 'function') window.playFlintAndSteelSound(px, py, pz);
                        if (typeof buildUI === 'function') buildUI();
                        swingAnimation = 1.0;
                        return;
                    }
                    
                    let fireDir = 0; 
                    if (target.normal[0] === 1) fireDir = 1;       // -X wall
                    else if (target.normal[0] === -1) fireDir = 2; // +X wall
                    else if (target.normal[2] === 1) fireDir = 3;  // -Z wall
                    else if (target.normal[2] === -1) fireDir = 4; // +Z wall

                    setVoxel(px, py, pz, 89, (fireDir << 1)); 
                    
                    // NEW: Add to our active high-speed simulation queue!
                    if (typeof window.activeFireBlocks !== 'undefined' && typeof getVoxelIndex === 'function') {
                        window.activeFireBlocks.add(getVoxelIndex(px, py, pz));
                    }
                    
                    if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                    pendingBlockUpdates.push({x: px, y: py, z: pz});
                    
                    if (typeof window.damageHeldTool === 'function') window.damageHeldTool(1);
                    if (typeof window.playFlintAndSteelSound === 'function') window.playFlintAndSteelSound(px, py, pz);
                    if (typeof buildUI === 'function') buildUI();
                }
                swingAnimation = 1.0;
                return; // Prevent standard block placement
            }
            
            let placeLevel = 0;
            if (currentBuildBlock === 17 || currentBuildBlock === 206) {
                if (target.normal[1] === 1) placeLevel = 0;
                else if (target.normal[0] === 1) placeLevel = 1;
                else if (target.normal[0] === -1) placeLevel = 2;
                else if (target.normal[2] === 1) placeLevel = 3;
                else if (target.normal[2] === -1) placeLevel = 4;
            } else if (currentBuildBlock === 59) {
                // Furnace directional placement logic (faces the player who placed it)
                let dirX = player.x - px;
                let dirZ = player.z - pz;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    placeLevel = dirX > 0 ? 1 : 3; 
                } else {
                    placeLevel = dirZ > 0 ? 0 : 2; 
                }
            } else if (currentBuildBlock === 69) {
                // Chest directional placement (faces the player)
                let dirX = player.x - px;
                let dirZ = player.z - pz;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    placeLevel = dirX > 0 ? 1 : 3;
                } else {
                    placeLevel = dirZ > 0 ? 0 : 2;
                }
            } else if (currentBuildBlock === 93) {
                // Loot Chest — same orientation logic as normal chest
                let dirX = player.x - px;
                let dirZ = player.z - pz;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    placeLevel = dirX > 0 ? 1 : 3;
                } else {
                    placeLevel = dirZ > 0 ? 0 : 2;
                }
            } else if (currentBuildBlock === 66) {
                // Vine: attach to the face you clicked
                if (target.normal[0] === 1) placeLevel = 1;       // -X wall
                else if (target.normal[0] === -1) placeLevel = 2;  // +X wall
                else if (target.normal[2] === 1) placeLevel = 3;   // -Z wall
                else if (target.normal[2] === -1) placeLevel = 4;  // +Z wall
                else placeLevel = 1; // default
            } else if (typeof isSlabBlock === 'function' && isSlabBlock(currentBuildBlock)) {
                // Minecraft slab placement rules:
                // - Clicking top face of a block → bottom slab (level 0)
                // - Clicking bottom face of a block → top slab (level 1)
                // - Clicking side face → depends on exact Y hit position within the placement cell:
                //   if the ray hit the upper half (localY >= 0.5), top slab; otherwise bottom slab
                if (target.normal[1] === 1) {
                    placeLevel = 0; // Clicked top face = bottom slab
                } else if (target.normal[1] === -1) {
                    placeLevel = 1; // Clicked bottom face = top slab
                } else {
                    // Side face: use the exact Y coordinate where the ray hit
                    if (target.exactHit) {
                        const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                        placeLevel = (localY >= 0.5) ? 1 : 0;
                    } else {
                        placeLevel = 0;
                    }
                }
            } else if (typeof isStairBlock === 'function' && isStairBlock(currentBuildBlock)) {
                // Stairs: low step faces toward player, tall back faces away
                // sd=0: back=+Z(tall), front=-Z(low). sd=1: back=-Z, front=+Z.
                // sd=2: back=+X, front=-X. sd=3: back=-X, front=+X.
                // Player at +Z → low step at +Z → front=+Z → sd=1
                let dirX = player.x - (px + 0.5);
                let dirZ = player.z - (pz + 0.5);
                let stairDir = 0;
                if (Math.abs(dirX) > Math.abs(dirZ)) {
                    stairDir = dirX > 0 ? 3 : 2; // player at +X → front at +X → sd=3
                } else {
                    stairDir = dirZ > 0 ? 1 : 0; // player at +Z → front at +Z → sd=1
                }
                // Upside-down: bit 2 (value 4). Place upside-down when clicking bottom face or upper side
                let upsideDown = 0;
                if (target.normal[1] === -1) {
                    upsideDown = 4;
                } else if (target.normal[1] === 0) {
                    if (target.exactHit) {
                        const localY = target.exactHit[1] - Math.floor(target.exactHit[1]);
                        if (localY >= 0.5) upsideDown = 4;
                    }
                }
                placeLevel = stairDir | upsideDown;
            }
            else if (currentBuildBlock === 68) { 
                let yaw = player.yaw * (180 / Math.PI);
                if (yaw < 0) yaw += 360;
                
                // If looking East/West, align along Z-axis (1). If looking North/South, align along X-axis (0)
                if ((yaw > 45 && yaw <= 135) || (yaw > 225 && yaw <= 315)) {
                    placeLevel = 1;
                }
            }
            // Door item (151) → place door block (149) as 2-block-tall structure
            else if (currentBuildBlock === 151) {
                // Check space for both bottom and top
                const aboveId = getVoxel(px, py + 1, pz) & 0xFF;
                if (aboveId !== 0 && aboveId !== 4 && aboveId !== 27) return; // No room above
                
                // v277: Doors require a solid support block beneath them.
                // Check the block below the bottom half of the door.
                const belowId = getVoxel(px, py - 1, pz) & 0xFF;
                if (typeof canSupport === 'function' && !canSupport(belowId)) return;
                
                // v277: Direction logic — if placing on a top face, use the
                // crosshair's local position on that face to determine which
                // way the door faces (lets you place doors facing all 4
                // directions just by aiming). Otherwise fall back to player
                // facing.
                let doorDir = 0;
                if (target.normal[1] === 1 && target.exactHit) {
                    // Local position within the top face (0..1 on each axis)
                    const localX = target.exactHit[0] - target.hit[0];
                    const localZ = target.exactHit[2] - target.hit[2];
                    // Center around 0.5 and pick dominant axis
                    const cx = localX - 0.5;
                    const cz = localZ - 0.5;
                    if (Math.abs(cx) > Math.abs(cz)) {
                        doorDir = cx > 0 ? 3 : 1; // +X half → faces +X (dir 3); -X half → faces -X (dir 1)
                    } else {
                        doorDir = cz > 0 ? 0 : 2; // +Z half → faces +Z (dir 0); -Z half → faces -Z (dir 2)
                    }
                } else {
                    // Fallback: direction based on player position
                    let dirX = player.x - (px + 0.5);
                    let dirZ = player.z - (pz + 0.5);
                    if (Math.abs(dirX) > Math.abs(dirZ)) {
                        doorDir = dirX > 0 ? 1 : 3;
                    } else {
                        doorDir = dirZ > 0 ? 0 : 2;
                    }
                }
                
                // Hinge side: detect adjacent door of same direction to form
                // a double door. For doors facing ±Z, check ±X neighbors.
                // For doors facing ±X, check ±Z neighbors.
                // v275/v278: when an existing same-direction door is found on
                // one side, the new door takes the opposite hinge so the two
                // panels mirror and open outward from the center. v278 also
                // REWRITES the existing door's hinge so the pair is correct
                // regardless of which side was placed first.
                let hinge = 0;
                let updateNeighborDoor = null; // { x, y, z, newHinge }
                {
                    function _isSameDirDoor(cx, cy, cz, wantDir) {
                        const v = getVoxel(cx, cy, cz);
                        if ((v & 0xFF) !== 149) return false;
                        return ((v >> 8) & 0x3) === wantDir;
                    }
                    // Helper: for a given door direction, map "position in the
                    // pair (lower/higher world-coord)" → correct hinge value.
                    // Derived from the renderer's hinge conventions.
                    function _hingeForPos(dir, isLowerCoord) {
                        // dir 0: lower X = hinge 0, higher X = hinge 1
                        // dir 1: lower Z = hinge 0, higher Z = hinge 1
                        // dir 2: lower X = hinge 1, higher X = hinge 0
                        // dir 3: lower Z = hinge 1, higher Z = hinge 0
                        if (dir === 0 || dir === 1) return isLowerCoord ? 0 : 1;
                        return isLowerCoord ? 1 : 0;
                    }
                    let neighborCoord = null; // world coord of the neighbor door's bottom half
                    if (doorDir === 0 || doorDir === 2) {
                        if (_isSameDirDoor(px - 1, py, pz, doorDir)) {
                            neighborCoord = { x: px - 1, y: py, z: pz, axis: 'x', neighborIsLower: true };
                        } else if (_isSameDirDoor(px + 1, py, pz, doorDir)) {
                            neighborCoord = { x: px + 1, y: py, z: pz, axis: 'x', neighborIsLower: false };
                        }
                    } else {
                        if (_isSameDirDoor(px, py, pz - 1, doorDir)) {
                            neighborCoord = { x: px, y: py, z: pz - 1, axis: 'z', neighborIsLower: true };
                        } else if (_isSameDirDoor(px, py, pz + 1, doorDir)) {
                            neighborCoord = { x: px, y: py, z: pz + 1, axis: 'z', neighborIsLower: false };
                        }
                    }
                    if (neighborCoord) {
                        // Neighbor door is at a lower or higher coord than the new one
                        hinge = _hingeForPos(doorDir, !neighborCoord.neighborIsLower);
                        const neighborHinge = _hingeForPos(doorDir, neighborCoord.neighborIsLower);
                        updateNeighborDoor = {
                            x: neighborCoord.x, y: neighborCoord.y, z: neighborCoord.z,
                            newHinge: neighborHinge
                        };
                    }
                }
                
                // Encode: bits 8-9 = dir, bit 10 = open(0), bit 11 = half(0=bottom,1=top), bit 12 = hinge
                const bottomVal = (doorDir) | (0 << 2) | (0 << 3) | (hinge << 4);
                const topVal = (doorDir) | (0 << 2) | (1 << 3) | (hinge << 4);
                
                setVoxel(px, py, pz, 149, bottomVal);
                setVoxel(px, py + 1, pz, 149, topVal);
                if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                if (typeof updateChunks === 'function') updateChunks(px, py + 1, pz);
                pendingBlockUpdates.push({x: px, y: py, z: pz});
                pendingBlockUpdates.push({x: px, y: py + 1, z: pz});
                
                // v278: if a neighbor door needs hinge update (for right-first
                // double-door placement), rewrite BOTH halves of it with the
                // correct hinge. Preserve open state and direction.
                if (updateNeighborDoor) {
                    const nX = updateNeighborDoor.x;
                    const nY = updateNeighborDoor.y;
                    const nZ = updateNeighborDoor.z;
                    const newH = updateNeighborDoor.newHinge;
                    const nBotVal = getVoxel(nX, nY, nZ);
                    const nTopVal = getVoxel(nX, nY + 1, nZ);
                    if ((nBotVal & 0xFF) === 149) {
                        const nDir = (nBotVal >> 8) & 0x3;
                        const nOpen = (nBotVal >> 10) & 0x1;
                        const nBot = nDir | (nOpen << 2) | (0 << 3) | (newH << 4);
                        setVoxel(nX, nY, nZ, 149, nBot);
                        pendingBlockUpdates.push({x: nX, y: nY, z: nZ});
                        if (typeof updateChunks === 'function') updateChunks(nX, nY, nZ);
                    }
                    if ((nTopVal & 0xFF) === 149) {
                        const nTDir = (nTopVal >> 8) & 0x3;
                        const nTOpen = (nTopVal >> 10) & 0x1;
                        const nTop = nTDir | (nTOpen << 2) | (1 << 3) | (newH << 4);
                        setVoxel(nX, nY + 1, nZ, 149, nTop);
                        pendingBlockUpdates.push({x: nX, y: nY + 1, z: nZ});
                        if (typeof updateChunks === 'function') updateChunks(nX, nY + 1, nZ);
                    }
                }
                
                if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(149, px, py, pz);
                
                if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                swingAnimation = 1.0;
                return;
            }
            // Trapdoor directional placement
            else if (currentBuildBlock === 150) {
                // Direction = which face the trapdoor attaches to.
                // For side-face placement, the hinge is on the face you clicked.
                // For top/bottom-face placement, there's no clicked side, so use
                // player facing (the trapdoor's hinge points away from the player
                // so it opens toward the player).
                let tdDir = 0;
                if (target.normal[2] === 1) tdDir = 0;        // Side: -Z hinge
                else if (target.normal[0] === -1) tdDir = 1;  // Side: +X hinge
                else if (target.normal[2] === -1) tdDir = 2;  // Side: +Z hinge
                else if (target.normal[0] === 1) tdDir = 3;   // Side: -X hinge
                else {
                    // v273: Top or bottom face — use player facing.
                    // Hinge plate goes on the side OPPOSITE the player so when
                    // the trapdoor opens it swings out toward the player.
                    // dir 0 = -Z plate (opens +Z), 1 = +X plate (opens -X),
                    // 2 = +Z plate (opens -Z), 3 = -X plate (opens +X).
                    let dirX = player.x - (px + 0.5);
                    let dirZ = player.z - (pz + 0.5);
                    if (Math.abs(dirX) > Math.abs(dirZ)) {
                        tdDir = dirX > 0 ? 3 : 1; // player +X → opens +X (dir 3); -X → opens -X (dir 1)
                    } else {
                        tdDir = dirZ > 0 ? 0 : 2; // player +Z → opens +Z (dir 0); -Z → opens -Z (dir 2)
                    }
                }
                
                // Top or bottom placement based on click position.
                // v272: previously this used player eye height which was wrong —
                // it would return the same answer regardless of where on the face
                // you actually clicked. Now we use the actual click Y from
                // target.exactHit, comparing against the midpoint of the block
                // we clicked on (target.hit[1]).
                let isTop = 0;
                if (target.normal[1] === -1) {
                    // Clicked the bottom face of the block above → top trapdoor
                    isTop = 1;
                } else if (target.normal[1] === 1) {
                    // Clicked the top face of the block below → bottom trapdoor
                    isTop = 0;
                } else {
                    // Side face — decide by where on the face the click landed
                    if (target.exactHit) {
                        const localY = target.exactHit[1] - target.hit[1];
                        if (localY >= 0.5) isTop = 1;
                    }
                }
                
                // Encode: bits 8-9 = dir, bit 10 = open(0), bit 11 = isTop
                placeLevel = tdDir | (0 << 2) | (isTop << 3);
            }
            // Wood Button (203) → place on side face of block
            else if (currentBuildBlock === 203) {
                if (target.normal[1] !== 0) return; // Side faces only
                // Check that the block we're attaching to is solid
                const attachId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                if (!canSupport(attachId)) return;
                // Direction: button attaches to the face TOWARD the wall (opposite of normal)
                // normal [0,0,1] → button at -Z face of air block (dir 2)
                // normal [1,0,0] → button at -X face of air block (dir 3)
                // normal [0,0,-1] → button at +Z face of air block (dir 0)
                // normal [-1,0,0] → button at +X face of air block (dir 1)
                let btnDir = 0;
                if (target.normal[2] === 1) btnDir = 2;
                else if (target.normal[0] === 1) btnDir = 3;
                else if (target.normal[2] === -1) btnDir = 0;
                else if (target.normal[0] === -1) btnDir = 1;
                placeLevel = btnDir;
            }
            // Lever (205) → place on side face of block
            else if (currentBuildBlock === 205) {
                if (target.normal[1] !== 0) return;
                const lattachId = getVoxel(target.hit[0], target.hit[1], target.hit[2]) & 0xFF;
                if (!canSupport(lattachId)) return;
                let levDir = 0;
                if (target.normal[2] === 1) levDir = 2;
                else if (target.normal[0] === 1) levDir = 3;
                else if (target.normal[2] === -1) levDir = 0;
                else if (target.normal[0] === -1) levDir = 1;
                placeLevel = levDir; // off state (bit 10 = 0)
            }
            // Redstone Dust (202) → place flat on top of solid block
            else if (currentBuildBlock === 202) {
                if (target.normal[1] !== 1) return; // Only on top face
                const belowId = getVoxel(px, py - 1, pz) & 0xFF;
                if (!canSupport(belowId)) return;
                setVoxel(px, py, pz, 202, 0);
                pendingBlockUpdates.push({x: px, y: py, z: pz});
                if (typeof window.onRedstoneBlockChanged === 'function') window.onRedstoneBlockChanged(px, py, pz);
                if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(currentBuildBlock, px, py, pz);
                if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                queueNeighbors(px, py, pz);
                triggerNeighborUpdates(px, py, pz);
                swingAnimation = 1.0;
                return;
            }
            // Piston (207/208) → face toward player (opposite of look direction)
            else if (currentBuildBlock === 207 || currentBuildBlock === 208) {
                const camDir = new THREE.Vector3(0, 0, -1);
                camDir.applyQuaternion(camera.quaternion);
                const ax = Math.abs(camDir.x), ay = Math.abs(camDir.y), az = Math.abs(camDir.z);
                let pistonDir;
                if (ay > ax && ay > az) {
                    pistonDir = camDir.y > 0 ? 0 : 1; // looking up -> piston faces down, looking down -> faces up
                } else if (ax > az) {
                    pistonDir = camDir.x > 0 ? 4 : 5; // looking east -> faces west, etc
                } else {
                    pistonDir = camDir.z > 0 ? 2 : 3; // looking south -> faces north, etc
                }
                setVoxel(px, py, pz, currentBuildBlock, pistonDir, 0, 0);
                pendingBlockUpdates.push({x: px, y: py, z: pz});
                // Check if piston should immediately extend (if powered)
                if (typeof window.onRedstoneBlockChanged === 'function') window.onRedstoneBlockChanged(px, py, pz);
                if (typeof window._soundPlaceBlock === 'function') window._soundPlaceBlock(currentBuildBlock, px, py, pz);
                if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }
                queueNeighbors(px, py, pz);
                triggerNeighborUpdates(px, py, pz);
                swingAnimation = 1.0;
                return;
            }
            
            const margin = 0.05; 
            const pMinX = player.x - PLAYER_WIDTH/2 + margin, pMaxX = player.x + PLAYER_WIDTH/2 - margin;
            const pMinY = player.y + margin, pMaxY = player.y + player.height - margin;
            const pMinZ = player.z - PLAYER_WIDTH/2 + margin, pMaxZ = player.z + PLAYER_WIDTH/2 - margin;
            
            const bMinX = px, bMaxX = px + 1;
            const bMinY = py, bMaxY = py + 1;
            const bMinZ = pz, bMaxZ = pz + 1;
            
            const intersect = (pMinX < bMaxX && pMaxX > bMinX) &&
                              (pMinY < bMaxY && pMaxY > bMinY) &&
                              (pMinZ < bMaxZ && pMaxZ > bMinZ);
                              
            if (!intersect || currentBuildBlock === 17 || currentBuildBlock === 116 || currentBuildBlock === 117 || currentBuildBlock === 118 || currentBuildBlock === 137 || currentBuildBlock === 202 || currentBuildBlock === 203 || currentBuildBlock === 205 || currentBuildBlock === 206) {
                if (currentBuildBlock === 4) {
                    // Water can't exist in the nether — also blocks aether
                    // portal ignition in the nether since that path uses water.
                    if (typeof currentDimension !== 'undefined' && currentDimension === 'nether') {
                        swingAnimation = 1.0; return;
                    }
                    // Check if placing water inside a glowstone portal frame → Aether portal
                    if (typeof detectAetherPortalFrame === 'function') {
                        const aetherResult = detectAetherPortalFrame(px, py, pz);
                        if (aetherResult) {
                            for (const pos of aetherResult.interior) {
                                setVoxel(pos.x, pos.y, pos.z, 209, aetherResult.axis);
                                pendingBlockUpdates.push({x: pos.x, y: pos.y, z: pos.z});
                            }
                            if (typeof updateChunks === 'function') updateChunks(px, py, pz);
                            swingAnimation = 1.0;
                            // Consume water bucket in survival
                            if (gameMode === 'survival' && inventory[activeSlot]) {
                                inventory[activeSlot].count--;
                                if (inventory[activeSlot].count <= 0) { inventory[activeSlot].id = 0; inventory[activeSlot].count = 0; }
                                if (typeof buildUI === 'function') buildUI();
                                if (typeof selectSlot === 'function') selectSlot(activeSlot);
                            }
                            return;
                        }
                    }
                    setVoxel(px, py, pz, 4, 8, 0, 1); 
                    updateWaterQueue.add(getVoxelIndex(px, py, pz));
                } else if (currentBuildBlock === 27) {
                    setVoxel(px, py, pz, 27, 4, 0, 1); 
                    updateLavaQueue.add(getVoxelIndex(px, py, pz));
                } else if (currentBuildBlock === 40) {
                    setVoxel(px, py, pz, 40, 1); 
                } else if (isLeafBlock(currentBuildBlock)) {
                    // Player-placed leaves: set persistent flag (source bit 13 = 1) so they never decay
                    setVoxel(px, py, pz, currentBuildBlock, 0, 0, 1);
                } else {
                    setVoxel(px, py, pz, currentBuildBlock, placeLevel, 0, 0); 
                }
                
                // Chest placement hook — auto-merge into double chest
                if (currentBuildBlock === 69 && typeof window.onChestPlaced === 'function') {
                    window.onChestPlaced(px, py, pz);
                }

                // Loot Chest placement hook — fill with random loot
                if (currentBuildBlock === 93 && typeof window.fillLootChest === 'function') {
                    window.fillLootChest(px, py, pz);
                }

                // Spawner placement hook — register for particle/spawn ticking
                if (currentBuildBlock === 54 && typeof window.registerSpawner === 'function') {
                    window.registerSpawner(px, py, pz);
                }

                // Play block place sound
                if (typeof window._soundPlaceBlock === 'function') {
                    window._soundPlaceBlock(currentBuildBlock, px, py, pz);
                }
                
                if (typeof gameMode !== 'undefined' && gameMode === 'survival' && inventory[activeSlot]) {
                    inventory[activeSlot].count--;
                    if (inventory[activeSlot].count <= 0) {
                        inventory[activeSlot].id = 0;
                        inventory[activeSlot].count = 0;
                    }
                    if (typeof buildUI === 'function') buildUI();
                    if (typeof selectSlot === 'function') selectSlot(activeSlot);
                }

                queueNeighbors(px, py, pz);
                checkGravity(px, py, pz); 
                triggerNeighborUpdates(px, py, pz);
                
                // Trigger redstone update when placing redstone torch
                if ((currentBuildBlock === 206 || currentBuildBlock === 236) && typeof window.onRedstoneBlockChanged === 'function') {
                    window.onRedstoneBlockChanged(px, py, pz);
                }
                
                pendingBlockUpdates.push({x: px, y: py, z: pz});
            }
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            window.isLeftMouseHeld = false; 
            if (typeof miningState !== 'undefined') miningState.isMining = false;
            if (typeof breakingBox !== 'undefined' && breakingBox) {
                breakingBox.visible = false;
                if (breakingBox.userData) breakingBox.userData.shapeKey = null;
            }
        }
        if (e.button === 2) {
            // v286: right-click released — cancel in-progress eating
            window.isRightMouseHeld = false;
            if (player.eatItemId) {
                player.eatItemId = 0;
                player.eatTimer = 0;
                player.eatSoundTimer = 0;
            }
        }
    });
    
    const uiLayer = document.getElementById('ui-layer');
    const crosshair = document.getElementById('crosshair');

    uiLayer.addEventListener('click', () => { document.body.requestPointerLock(); });
    uiLayer.addEventListener('touchend', (e) => {
        e.preventDefault();
        document.body.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
        // On mobile, pointer lock is faked — ignore real pointerlockchange events
        if (window._mobileSkipPointerLock) return;
        
        if (document.pointerLockElement === document.body) {
            isPointerLocked = true;
            uiState = 'PLAYING';
            uiLayer.classList.add('hidden');
            document.getElementById('inventory-modal').classList.add('hidden');
            
            const survModal = document.getElementById('survival-inventory-modal');
            if (survModal) survModal.classList.add('hidden');
            
            if (typeof closeCraftingTable === 'function') closeCraftingTable();
            if (typeof closeFurnace === 'function') closeFurnace();
            if (typeof closeChest === 'function') closeChest();
            if (typeof closeEnchantingTable === 'function') closeEnchantingTable();
            
            document.getElementById('pause-menu').classList.add('hidden');
            crosshair.style.display = 'block';
            
            if (typeof cursorItem !== 'undefined' && cursorItem) {
                window.tossItem(cursorItem.id, cursorItem.count, cursorItem.durability);
                cursorItem = null;
                if (typeof updateCursorItemUI === 'function') updateCursorItemUI();
            }

        } else {
            isPointerLocked = false;
            crosshair.style.display = 'none';
            for(let k in keys) keys[k] = false;
            
            window.isLeftMouseHeld = false;
            if (typeof miningState !== 'undefined') miningState.isMining = false;
            if (typeof breakingBox !== 'undefined' && breakingBox) {
                breakingBox.visible = false;
                if (breakingBox.userData) breakingBox.userData.shapeKey = null;
            }

            if (uiState === 'DEAD') {
                // Don't do anything when pointer lock drops during death screen
            } else if (uiState === 'PLAYING') {
                uiState = 'PAUSED';
                document.getElementById('pause-menu').classList.remove('hidden');
                showPauseScreen('pause-main');
            // Added uiState !== 'CHEST' to prevent the game from pausing
            } else if (uiState !== 'INVENTORY' && uiState !== 'CRAFTING' && uiState !== 'FURNACE' && uiState !== 'CHEST' && uiState !== 'ENCHANTING' && uiState !== 'PAUSED') {
                uiState = 'MENU';
                uiLayer.classList.remove('hidden');
            }
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (uiState === 'INVENTORY' || uiState === 'CRAFTING' || uiState === 'FURNACE' || uiState === 'CHEST' || uiState === 'ENCHANTING') {
            const tooltip = document.getElementById('item-tooltip');
            // Tooltip is position:fixed and excluded from CSS zoom, so use raw clientX
            tooltip.style.left = (e.clientX + 16) + 'px';
            tooltip.style.top  = (e.clientY + 14) + 'px';
        }
        if (!isPointerLocked || uiState !== 'PLAYING') return;
        const sensitivity = 0.002 * (typeof settingSensitivity !== 'undefined' ? settingSensitivity : 1.0);
        player.yaw -= e.movementX * sensitivity;
        player.pitch -= e.movementY * sensitivity;
        player.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, player.pitch));
    });
}

window.damageHeldTool = function(amount) {
    if (gameMode !== 'survival') return;
    
    const item = inventory[activeSlot];
    if (!item || item.id === 0) return;

    const tool = TOOL_DATA[item.id];
    // This check ensures durability works for ANY item defined in TOOL_DATA with durability
    if (!tool || !tool.maxDurability) return;

    if (item.durability === undefined) item.durability = tool.maxDurability;
    
    item.durability -= amount;

    if (item.durability <= 0) {
        inventory[activeSlot] = { id: 0, count: 0 }; // Tool breaks
        if (typeof window.playToolBreakSound === 'function') window.playToolBreakSound();
        currentBuildBlock = 0;
    }
    
    // Refresh the UI to update the colored bar
    if (typeof buildUI === 'function') buildUI();
    if (typeof updateHeldItem === 'function') updateHeldItem();
    if (typeof updateArmorBar === 'function') updateArmorBar();
};