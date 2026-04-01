const textureLoader = new THREE.TextureLoader();

function loadTextureAsync(url, useMipmaps = true) {
    const vUrl = typeof ASSET_VERSION !== 'undefined' ? url + '?v=' + ASSET_VERSION : url;
    return new Promise((resolve, reject) => {
        textureLoader.load(
            vUrl,
            (tex) => {
                tex.magFilter = THREE.NearestFilter; // Crisp pixels up close
                
                // FIX: Auto-generated mipmaps use linear interpolation to scale down, 
                // which destroys pixel art and causes atlas bleeding. We force NearestFilter here.
                tex.minFilter = THREE.NearestFilter; 
                tex.generateMipmaps = false;
                
                // FIX: Anisotropy causes atlas bleeding at oblique angles. Keep it at 1.
                tex.anisotropy = 1;

                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                resolve(tex);
            },
            undefined,
            (err) => {
                console.error(`Failed to load texture at ${url}.`, err);
                const canvas = document.createElement('canvas');
                canvas.width = 16; canvas.height = 16;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ff00ff'; ctx.fillRect(0,0,8,8); ctx.fillRect(8,8,8,8);
                ctx.fillStyle = '#000000'; ctx.fillRect(8,0,8,8); ctx.fillRect(0,8,8,8);
                const fallback = new THREE.CanvasTexture(canvas);
                fallback.magFilter = THREE.NearestFilter;
                // Ensure the fallback also disables mipmaps
                fallback.minFilter = THREE.NearestFilter;
                fallback.generateMipmaps = false;
                resolve(fallback);
            }
        );
    });
}

// We pass false to useMipmaps to ensure our atlas stays crisp
async function loadTextureAtlas() { return await loadTextureAsync('textures/terrain.png', false); }
async function loadWaterTexture() { return await loadTextureAsync('textures/water.png', false); }
async function loadLavaTexture() { return await loadTextureAsync('textures/lava.png', false); }

function createFluidMaterial(texture, isWater) {
    const flowScrollSpeed = isWater ? 1.5 : 0.5;
    const frameSpeed = isWater ? 2.0 : 1.0;
    
    const uniforms = THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
            uOpacity: { value: isWater ? 0.75 : 1.0 },
            uFlowScrollSpeed: { value: flowScrollSpeed },
            uFrameSpeed: { value: frameSpeed },
            uIsWater: { value: isWater ? 1.0 : 0.0 }
        }
    ]);
    
    uniforms.map = { value: texture };
    uniforms.uTime = timeUniforms.uFluidTime; 
    uniforms.uSunLevel = timeUniforms.uSunLevel;
    uniforms.uSunColor = timeUniforms.uSunColor;
    uniforms.uTorchColor = timeUniforms.uTorchColor;
    uniforms.uAmbientColor = timeUniforms.uAmbientColor;

    return new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: `
            attribute float aFluidType;
            attribute vec2 aFlowDir;
            attribute vec3 aBiomeTint;
            varying vec2 vUv;
            varying vec3 vColor;
            varying vec3 vBiomeTint;
            varying float vFluidType;
            varying vec2 vFlowDir;
            #include <fog_pars_vertex>
            
            void main() {
                vUv = uv;
                vColor = color;
                vBiomeTint = aBiomeTint;
                vFluidType = aFluidType;
                vFlowDir = aFlowDir;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            uniform float uTime;
            uniform float uSunLevel;
            uniform vec3 uSunColor;
            uniform vec3 uTorchColor;
            uniform vec3 uAmbientColor;
            uniform float uOpacity;
            uniform float uIsWater;
            uniform float uFlowScrollSpeed;
            uniform float uFrameSpeed;
            #include <fog_pars_fragment>
            
            varying vec2 vUv;
            varying vec3 vColor;
            varying vec3 vBiomeTint;
            varying float vFluidType;
            varying vec2 vFlowDir;
            
            vec4 sampleFrame(float frame, vec2 localUV) {
                float u = (frame + fract(localUV.x)) * 0.25;
                float v = fract(localUV.y);
                return texture2D(map, vec2(u, v));
            }
            
            void main() {
                float frameF = mod(uTime * uFrameSpeed, 4.0);
                float frame0 = floor(frameF);
                float frame1 = mod(frame0 + 1.0, 4.0);
                float blend = fract(frameF);
                
                vec4 col;
                
                if (vFluidType < 0.5) {
                    col = mix(sampleFrame(frame0, vUv), sampleFrame(frame1, vUv), blend);
                } else {
                    vec2 center = vec2(0.5, 0.5);
                    vec2 centeredUv = vUv - center;

                    float c = -vFlowDir.y;
                    float s = vFlowDir.x;
                    
                    vec2 localUv = vec2(
                        c * centeredUv.x + s * centeredUv.y,
                        -s * centeredUv.x + c * centeredUv.y
                    );

                    localUv.y += uTime * uFlowScrollSpeed;
                    localUv += center;

                    col = mix(sampleFrame(frame0, localUv), sampleFrame(frame1, localUv), blend);
                }
                
                // Apply biome water tint (only for water, not lava)
                if (uIsWater > 0.5) {
                    col.rgb *= vBiomeTint;
                }
                
                float shade = vColor.b;
                float rawSun = (shade > 0.001) ? clamp(vColor.r / shade, 0.0, 1.0) : 0.0;
                float rawTorch = (shade > 0.001) ? clamp(vColor.g / shade, 0.0, 1.0) : 0.0;
                float mcSun = pow(0.8, 15.0 * (1.0 - rawSun));
                float mcTorch = pow(0.8, 15.0 * (1.0 - rawTorch));
                vec3 lightCalc = shade * uAmbientColor + mcSun * shade * uSunColor * uSunLevel + mcTorch * shade * uTorchColor;
                col.rgb *= min(vec3(1.0), lightCalc);
                col.a *= uOpacity;
                
                gl_FragColor = col;
                #include <fog_fragment>
            }
        `,
        transparent: isWater,
        fog: true,
        side: THREE.DoubleSide,
        vertexColors: true,
        depthWrite: !isWater
    });
}

let toolTextureAtlas = null;
let toolPixelData = null;

async function loadToolAtlas() {
    toolTextureAtlas = await loadTextureAsync('textures/tools.png', false);
    const img = toolTextureAtlas.image;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    toolPixelData = ctx.getImageData(0, 0, 256, 256);
}

window.fireMaterial = null; 

async function loadFireTexture() {
    return new Promise((resolve) => {
        new THREE.TextureLoader().load('textures/fire_0.png?v=' + ASSET_VERSION, (tex) => {
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;

            window.fireMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    uTexture: { value: tex },
                    uTime: { value: 0 }
                },
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D uTexture;
                    uniform float uTime;
                    varying vec2 vUv;

                    void main() {
                        float totalFrames = 32.0;
                        // Cycle through 32 frames at Minecraft's fire animation speed
                        float frame = mod(floor(uTime * 14.0), totalFrames);

                        // GL textures are bottom-to-top so flip the frame index
                        float invertedFrame = (totalFrames - 1.0) - frame;

                        float frameHeight = 1.0 / totalFrames;
                        vec2 scrollingUv = vec2(vUv.x, (vUv.y * frameHeight) + (invertedFrame * frameHeight));
                        
                        vec4 texCol = texture2D(uTexture, scrollingUv);
                        if (texCol.a < 0.1) discard;

                        // Fire is self-luminous — raw texture color with original alpha
                        gl_FragColor = vec4(texCol.rgb, texCol.a);
                    }
                `,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            resolve();
        });
    });
}
// --- NETHER PORTAL MATERIAL ---
// Animated portal using atlas indices 111-114 (4 frames), cross-fading between them
window.portalMaterial = null;

function createPortalMaterial(atlas) {
    window.portalMaterial = new THREE.ShaderMaterial({
        uniforms: {
            map: { value: atlas },
            uTime: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D map;
            uniform float uTime;
            varying vec2 vUv;

            vec4 sampleTile(float tileIdx, vec2 localUV) {
                float tileSize = 1.0 / 16.0;
                float gx = mod(tileIdx, 16.0);
                float gy = floor(tileIdx / 16.0);
                // Inset UVs slightly to avoid atlas bleeding
                float eps = 0.002;
                float lu = clamp(localUV.x, eps, 1.0 - eps);
                float lv = clamp(localUV.y, eps, 1.0 - eps);
                vec2 uv = vec2((gx + lu) * tileSize, 1.0 - (gy + 1.0 - lv) * tileSize);
                return texture2D(map, uv);
            }

            void main() {
                // Cycle through 4 frames (atlas 111-114) with cross-fade
                float t = mod(uTime * 0.8, 4.0);
                float frame0 = floor(t);
                float frame1 = mod(frame0 + 1.0, 4.0);
                float blend = fract(t);

                vec4 c0 = sampleTile(111.0 + frame0, vUv);
                vec4 c1 = sampleTile(111.0 + frame1, vUv);
                vec4 col = mix(c0, c1, blend);

                if (col.a < 0.1) discard;

                // Portal is self-luminous
                gl_FragColor = vec4(col.rgb, col.a * 0.8);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
}