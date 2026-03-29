// ==========================================
// INVENTORY PLAYER DOLL
// ==========================================
// Renders a mini Steve model in the survival inventory using a separate
// Three.js scene + orthographic camera. Head follows the mouse cursor.

(function() {
    let dollScene, dollCamera, dollRenderer;
    let dollModel, dollHeadPivot;
    let dollMaterial;
    let dollActive = false;
    let mouseX = 0, mouseY = 0;

    function initDoll() {
        if (dollScene) return;

        const canvas = document.getElementById('inv-player-doll');
        if (!canvas) return;

        dollScene = new THREE.Scene();

        // Orthographic camera sized to fit the player model nicely
        const aspect = 98 / 140;
        const viewH = 2.4; // how many blocks tall the view is
        const viewW = viewH * aspect;
        dollCamera = new THREE.OrthographicCamera(-viewW/2, viewW/2, viewH/2, -viewH/2, 0.1, 10);
        dollCamera.position.set(0, 1.0, 3);
        dollCamera.lookAt(0, 1.0, 0);

        dollRenderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
        dollRenderer.setSize(98, 140);
        dollRenderer.setClearColor(0x000000, 0);
        dollRenderer.setPixelRatio(1);

        // Add ambient light
        const light = new THREE.AmbientLight(0xffffff, 1.0);
        dollScene.add(light);

        // Build the player model (same geometry as the main player model)
        const texW = 64, texH = 64;
        const tex = new THREE.TextureLoader().load('textures/steve.png?v=' + ASSET_VERSION);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;

        dollMaterial = new THREE.MeshBasicMaterial({
            map: tex, side: THREE.FrontSide, alphaTest: 0.1, transparent: false
        });

        dollModel = new THREE.Group();

        // Use createMobBox (same UV layout as player)
        // Body
        const bodyGeo = createMobBox(8, 12, 4, 16, 16, texW, texH);
        const bodyMesh = new THREE.Mesh(bodyGeo, dollMaterial);
        bodyMesh.position.set(0, 18/16, 0);
        dollModel.add(bodyMesh);
        dollModel._bodyMesh = bodyMesh;

        // Head
        dollHeadPivot = new THREE.Group();
        dollHeadPivot.position.set(0, 24/16, 0);
        const headGeo = createMobBox(8, 8, 8, 0, 0, texW, texH);
        const headMesh = new THREE.Mesh(headGeo, dollMaterial);
        headMesh.position.set(0, 4/16, 0);
        dollHeadPivot.add(headMesh);
        dollModel.add(dollHeadPivot);

        // Right arm
        const rArmMesh = new THREE.Mesh(createMobBox(4, 12, 4, 40, 16, texW, texH), dollMaterial);
        rArmMesh.position.set(-6/16, 18/16, 0);
        dollModel.add(rArmMesh);
        dollModel._rArm = rArmMesh;

        // Left arm
        const lArmMesh = new THREE.Mesh(createMobBox(4, 12, 4, 32, 48, texW, texH), dollMaterial);
        lArmMesh.position.set(6/16, 18/16, 0);
        dollModel.add(lArmMesh);
        dollModel._lArm = lArmMesh;

        // Right leg
        const rLegMesh = new THREE.Mesh(createMobBox(4, 12, 4, 0, 16, texW, texH), dollMaterial);
        rLegMesh.position.set(-2/16, 6/16, 0);
        dollModel.add(rLegMesh);
        dollModel._rLeg = rLegMesh;

        // Left leg
        const lLegMesh = new THREE.Mesh(createMobBox(4, 12, 4, 16, 48, texW, texH), dollMaterial);
        lLegMesh.position.set(2/16, 6/16, 0);
        dollModel.add(lLegMesh);
        dollModel._lLeg = lLegMesh;

        dollScene.add(dollModel);
        dollModel._armorMeshes = [];
        dollModel._armorState = [0, 0, 0, 0];
    }

    function _createDollArmorBox(w, h, d, u, v, texW, texH, inflate) {
        const s = inflate / 16;
        const geo = new THREE.BoxGeometry(w/16 + s*2, h/16 + s*2, d/16 + s*2);
        const uvs = geo.attributes.uv.array;
        const setUV = (face, x, y, fw, fh) => {
            const u1 = x/texW, u2 = (x+fw)/texW;
            const v1 = 1.0-((y+fh)/texH), v2 = 1.0-(y/texH);
            uvs[face*8]=u1; uvs[face*8+1]=v2; uvs[face*8+2]=u2; uvs[face*8+3]=v2;
            uvs[face*8+4]=u1; uvs[face*8+5]=v1; uvs[face*8+6]=u2; uvs[face*8+7]=v1;
        };
        setUV(0, u+d+w, v+d, d, h); setUV(1, u, v+d, d, h);
        setUV(2, u+d, v, w, d); setUV(3, u+d+w, v, w, d);
        setUV(4, u+d, v+d, w, h); setUV(5, u+2*d+w, v+d, w, h);
        return geo;
    }

    let _dollArmorMatCache = {};
    function getDollArmorMat(texFile) {
        if (_dollArmorMatCache[texFile]) return _dollArmorMatCache[texFile];
        const t = new THREE.TextureLoader().load('textures/' + texFile + '?v=' + ASSET_VERSION);
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
        const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
        _dollArmorMatCache[texFile] = mat;
        return mat;
    }
    function _getDollTierPrefix(itemId) {
        if (itemId >= 170 && itemId <= 173) return 'iron';
        if (itemId >= 174 && itemId <= 177) return 'leather';
        if (itemId >= 178 && itemId <= 181) return 'diamond';
        if (itemId >= 182 && itemId <= 185) return 'gold';
        return 'iron';
    }

    function updateDollArmor() {
        if (!dollModel) return;
        const cur = [armorSlots[0].id, armorSlots[1].id, armorSlots[2].id, armorSlots[3].id];
        const prev = dollModel._armorState;
        if (cur[0]===prev[0] && cur[1]===prev[1] && cur[2]===prev[2] && cur[3]===prev[3]) return;

        // Remove old armor
        for (const m of dollModel._armorMeshes) {
            m.parent.remove(m);
            m.geometry.dispose();
        }
        dollModel._armorMeshes = [];
        dollModel._armorState = [...cur];

        const TW = 64, TH = 32, INF = 1.0, INF_LEG = 0.5;

        // Helmet
        if (cur[0] !== 0) {
            const mat = getDollArmorMat(_getDollTierPrefix(cur[0]) + '_0.png');
            const m = new THREE.Mesh(_createDollArmorBox(8,8,8, 0,0, TW,TH, INF), mat);
            m.position.set(0, 4/16, 0);
            dollHeadPivot.add(m);
            dollModel._armorMeshes.push(m);
        }
        // Chestplate
        if (cur[1] !== 0) {
            const mat = getDollArmorMat(_getDollTierPrefix(cur[1]) + '_0.png');
            const body = new THREE.Mesh(_createDollArmorBox(8,12,4, 16,16, TW,TH, INF), mat);
            body.position.set(0, 0, 0);
            dollModel._bodyMesh.add(body);
            dollModel._armorMeshes.push(body);
            const rA = new THREE.Mesh(_createDollArmorBox(4,12,4, 40,16, TW,TH, INF), mat);
            rA.position.set(-6/16, 18/16, 0);
            dollModel.add(rA);
            dollModel._armorMeshes.push(rA);
            const lA = new THREE.Mesh(_createDollArmorBox(4,12,4, 40,16, TW,TH, INF), mat);
            lA.position.set(6/16, 18/16, 0);
            dollModel.add(lA);
            dollModel._armorMeshes.push(lA);
        }
        // Leggings
        if (cur[2] !== 0) {
            const mat = getDollArmorMat(_getDollTierPrefix(cur[2]) + '_1.png');
            const rL = new THREE.Mesh(_createDollArmorBox(4,12,4, 0,16, TW,TH, INF_LEG), mat);
            rL.position.set(-2/16, 6/16, 0);
            dollModel.add(rL);
            dollModel._armorMeshes.push(rL);
            const lL = new THREE.Mesh(_createDollArmorBox(4,12,4, 0,16, TW,TH, INF_LEG), mat);
            lL.position.set(2/16, 6/16, 0);
            dollModel.add(lL);
            dollModel._armorMeshes.push(lL);
        }
        // Boots
        if (cur[3] !== 0) {
            const mat = getDollArmorMat(_getDollTierPrefix(cur[3]) + '_0.png');
            const rB = new THREE.Mesh(_createDollArmorBox(4,12,4, 0,16, TW,TH, INF), mat);
            rB.position.set(-2/16, 6/16, 0);
            dollModel.add(rB);
            dollModel._armorMeshes.push(rB);
            const lB = new THREE.Mesh(_createDollArmorBox(4,12,4, 0,16, TW,TH, INF), mat);
            lB.position.set(2/16, 6/16, 0);
            dollModel.add(lB);
            dollModel._armorMeshes.push(lB);
        }
    }

    // Track mouse position over the inventory modal
    document.addEventListener('mousemove', (e) => {
        if (!dollActive) return;
        const canvas = document.getElementById('inv-player-doll');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        // Normalized offset from center: -1 to 1
        mouseX = (e.clientX - cx) / (rect.width * 2);
        mouseY = (e.clientY - cy) / (rect.height * 2);
        // Clamp
        mouseX = Math.max(-1, Math.min(1, mouseX));
        mouseY = Math.max(-1, Math.min(1, mouseY));
    });

    function renderDoll() {
        if (!dollScene || !dollRenderer || !dollCamera) return;

        // Update armor overlays
        updateDollArmor();

        // Head follows mouse
        if (dollHeadPivot) {
            dollHeadPivot.rotation.y = mouseX * 1.2;  // yaw
            dollHeadPivot.rotation.x = mouseY * 0.8; // pitch
        }

        // Slight body rotation toward mouse for natural feel
        if (dollModel) {
            dollModel.rotation.y = mouseX * 0.3;
        }

        dollRenderer.render(dollScene, dollCamera);
    }

    // Start/stop rendering when inventory opens/closes
    let dollAnimFrame = null;

    function dollLoop() {
        if (!dollActive) return;
        renderDoll();
        dollAnimFrame = requestAnimationFrame(dollLoop);
    }

    window._startInventoryDoll = function() {
        initDoll();
        dollActive = true;
        mouseX = 0; mouseY = 0;
        dollLoop();
    };

    window._stopInventoryDoll = function() {
        dollActive = false;
        if (dollAnimFrame) {
            cancelAnimationFrame(dollAnimFrame);
            dollAnimFrame = null;
        }
    };
})();
