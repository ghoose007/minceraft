// ==========================================
// MOB PARTICLES
// ==========================================

// --- CUSTOM PARTICLES WITH WORLD LIGHTING ---
// Uses canvas textures for the classic MC Beta look, but tints by world lighting at spawn time.

let _particleAssetsReady = false;
let _smokeBaseMat = null;   // Shared white puff material
let _splashBaseMats = [];   // Array of blue-tinted splash materials
let _smokeGeo = null;
let _splashGeo = null;

function initParticleAssets() {
    if (_particleAssetsReady) return;
    _particleAssetsReady = true;

    const createTex = (drawFn) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16; canvas.height = 16;
        const ctx = canvas.getContext('2d');
        drawFn(ctx);
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        return tex;
    };

    // Classic MC smoke puff: white square on transparent bg
    const smokeTex = createTex(ctx => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(4, 4, 8, 8);
    });
    _smokeBaseMat = new THREE.MeshBasicMaterial({
        map: smokeTex, transparent: true, alphaTest: 0.01, 
        depthWrite: false, fog: true, side: THREE.DoubleSide
    });

    // Classic MC water splash shapes
    const splashTextures = [
        createTex(ctx => { ctx.fillStyle = '#ffffff'; ctx.fillRect(6, 6, 4, 4); }),
        createTex(ctx => { ctx.fillStyle = '#ffffff'; ctx.fillRect(4, 7, 8, 2); ctx.fillRect(7, 4, 2, 8); }),
        createTex(ctx => { ctx.fillStyle = '#ffffff'; ctx.fillRect(5, 5, 3, 3); ctx.fillRect(9, 9, 3, 3); })
    ];
    const waterBaseColors = [0x4444ff, 0x0000ff, 0x7777ff];
    for (const tex of splashTextures) {
        for (const col of waterBaseColors) {
            _splashBaseMats.push(new THREE.MeshBasicMaterial({
                map: tex, color: col, transparent: true, alphaTest: 0.01,
                depthWrite: false, fog: true, side: THREE.DoubleSide
            }));
        }
    }

    // Shared flat plane geometries (billboard quads)
    _smokeGeo = new THREE.PlaneGeometry(0.5, 0.5);
    _splashGeo = new THREE.PlaneGeometry(0.3, 0.3);
}

// Helper: compute a combined light multiplier from world sun/torch at a position
function _getLightTint(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const sun = getSunLight(ix, iy, iz) / 15.0;
    const torch = getTorchLight(ix, iy, iz) / 15.0;
    const sunLevel = typeof timeUniforms !== 'undefined' ? timeUniforms.uSunLevel.value : 1.0;
    // Approximate the shader's lighting: ambient + sun*sunLevel + torch  
    const light = Math.min(1.0, 0.12 + sun * sunLevel + torch * 0.85);
    return light;
}

window.spawnSmoke = function(x, y, z) {
    initParticleAssets();
    const light = _getLightTint(x, y, z);
    // Clone material so each puff can have its own brightness
    const mat = _smokeBaseMat.clone();
    const shade = 0.7 + Math.random() * 0.3;
    mat.color.setRGB(shade * light, shade * light, shade * light);
    mat.opacity = 0.8;

    const mesh = new THREE.Mesh(_smokeGeo, mat);
    mesh.position.set(x, y, z);
    // Billboard: face camera each frame via onBeforeRender
    mesh.onBeforeRender = function(renderer, scene, camera) {
        mesh.quaternion.copy(camera.quaternion);
    };
    scene.add(mesh);
    particles.push({
        mesh: mesh, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 1.0 + 0.5, vz: (Math.random() - 0.5) * 1.5,
        life: 1.0 + Math.random() * 0.5, maxLife: 1.5, noGravity: true, isSmoke: true
    });
};

// Minecraft-style fire smoke: small dark particles with random pixel shapes that rise and fade
let _fireSmokeTextures = null;

function _initFireSmokeTextures() {
    if (_fireSmokeTextures) return;
    _fireSmokeTextures = [];
    
    // Generate several random pixel-cluster textures like MC's smoke particles
    for (let i = 0; i < 8; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 8; canvas.height = 8;
        const ctx = canvas.getContext('2d');
        
        // Random scattered pixels - 3 to 6 pixels in an 8x8 grid
        const numPixels = 3 + Math.floor(Math.random() * 4);
        // Start with a center cluster then scatter
        const cx = 2 + Math.floor(Math.random() * 4);
        const cy = 2 + Math.floor(Math.random() * 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx, cy, 2, 2); // small 2x2 core
        for (let p = 0; p < numPixels; p++) {
            const px = cx + Math.floor(Math.random() * 5) - 2;
            const py = cy + Math.floor(Math.random() * 5) - 2;
            if (px >= 0 && px < 8 && py >= 0 && py < 8) {
                ctx.fillRect(px, py, 1, 1);
            }
        }
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        _fireSmokeTextures.push(tex);
    }
}

window.spawnFireSmoke = function(x, y, z) {
    initParticleAssets();
    _initFireSmokeTextures();
    
    const tex = _fireSmokeTextures[Math.floor(Math.random() * _fireSmokeTextures.length)];
    const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, alphaTest: 0.01,
        depthWrite: false, fog: true, side: THREE.DoubleSide
    });
    
    // Random dark grey to black
    const shade = Math.random() * 0.2;
    mat.color.setRGB(shade, shade, shade);
    mat.opacity = 0.7 + Math.random() * 0.3;

    const size = 0.15 + Math.random() * 0.2;
    const mesh = new THREE.Mesh(_smokeGeo, mat);
    mesh.scale.set(size, size, size);
    mesh.position.set(
        x + 0.2 + Math.random() * 0.6,
        y + 0.8 + Math.random() * 0.4,
        z + 0.2 + Math.random() * 0.6
    );
    mesh.onBeforeRender = function(renderer, scene, camera) {
        mesh.quaternion.copy(camera.quaternion);
    };
    scene.add(mesh);
    particles.push({
        mesh: mesh,
        vx: (Math.random() - 0.5) * 0.15,
        vy: 0.3 + Math.random() * 0.5,
        vz: (Math.random() - 0.5) * 0.15,
        life: 1.0 + Math.random() * 1.2,
        maxLife: 2.2,
        noGravity: true,
        isSmoke: true
    });
};

window.spawnWaterSplash = function(x, y, z) {
    if (typeof checkFluidLevel === 'function') {
        const fluid = checkFluidLevel(player.x, player.y, player.z, player.height);
        if (fluid.submerged) return;
    }

    initParticleAssets();
    const light = _getLightTint(x, y, z);
    const count = 2;
    const radius = 0.5;

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const pz = z + Math.sin(angle) * radius;

        const baseMat = _splashBaseMats[Math.floor(Math.random() * _splashBaseMats.length)];
        // Clone so each particle has individual brightness
        const mat = baseMat.clone();
        // Tint the existing blue color by world lighting  
        mat.color.multiplyScalar(light);

        const mesh = new THREE.Mesh(_splashGeo, mat);
        mesh.position.set(px, y + 0.1, pz);
        mesh.onBeforeRender = function(renderer, scene, camera) {
            mesh.quaternion.copy(camera.quaternion);
        };
        scene.add(mesh);

        particles.push({
            mesh: mesh,
            vx: (Math.random() - 0.5) * 0.5,
            vy: Math.random() * 1.2 + 0.3,
            vz: (Math.random() - 0.5) * 0.5,
            life: 0.3 + Math.random() * 0.2,
            maxLife: 0.5,
            noGravity: false,
            isSmoke: true
        });
    }
};