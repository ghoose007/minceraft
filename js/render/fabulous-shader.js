// ==========================================
// FABULOUS GRAPHICS — SHADER-BASED POST-PROCESSING
// Full post-processing pipeline: bloom, god rays/sun shafts,
// SSAO, tone mapping, enhanced lighting, volumetric light,
// color grading, vignette, and REALTIME SUN SHADOW MAPPING.
// Uses only Three.js r128 built-in classes (no addon imports).
// ==========================================

// --- Global Fabulous State ---
let fabulousEnabled = false;
let fabulousComposer = null;
let fabulousRenderTarget = null;
let fabulousDepthTexture = null;
let fabulousQuad = null;
let fabulousScene = null;
let fabulousCamera = null;

// Intermediate render targets
let _fab_rtScene = null;       // Main scene render
let _fab_rtBright = null;      // Brightness extraction
let _fab_rtBlurH = null;       // Horizontal blur
let _fab_rtBlurV = null;       // Vertical blur (= final bloom)
let _fab_rtBlurH2 = null;      // Second pass blur H (wider)
let _fab_rtBlurV2 = null;      // Second pass blur V (wider)
let _fab_rtGodRay = null;      // God ray accumulation
let _fab_rtSSAO = null;        // SSAO
let _fab_rtComposite = null;   // Final composite

// Materials
let _fab_matBright = null;
let _fab_matBlurH = null;
let _fab_matBlurV = null;
let _fab_matBlurH2 = null;
let _fab_matBlurV2 = null;
let _fab_matGodRay = null;
let _fab_matSSAO = null;
let _fab_matComposite = null;

// ==========================================
// SHADOW MAP SYSTEM
// ==========================================
let _fab_shadowRT = null;          // Shadow depth render target
let _fab_shadowCamera = null;      // Orthographic camera from sun
let _fab_shadowDepthMat = null;    // Depth-only material for shadow pass
let _fab_shadowDepthMatAlpha = null; // Depth material with alpha test (leaves, glass)
const SHADOW_MAP_SIZE = 2048;      // Shadow map resolution
const SHADOW_RANGE = 48;           // Shadow frustum half-width in blocks
const SHADOW_NEAR = 1;
const SHADOW_FAR = 200;

// Shadow matrix passed to lighting shaders
const _fab_shadowMatrix = new THREE.Matrix4();
const _fab_shadowUniforms = {
    uShadowMap: { value: null },
    uShadowMatrix: { value: new THREE.Matrix4() },
    uShadowEnabled: { value: 0.0 },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) }
};

// Uniforms shared across passes
const _fab_uniforms = {
    uSunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVisible: { value: 1.0 },
    uSunIntensity: { value: 1.0 },
    uExposure: { value: 1.0 },
    uTime: { value: 0.0 },
    uSunLevel: { value: 1.0 }
};

// ==========================================
// FULLSCREEN QUAD HELPER
// ==========================================
function _fab_createQuad(material) {
    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    return mesh;
}

function _fab_createRT(w, h, useDepth) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType
    });
    if (useDepth) {
        rt.depthTexture = new THREE.DepthTexture();
        rt.depthTexture.type = THREE.UnsignedIntType;
    }
    return rt;
}

// ==========================================
// INITIALIZATION
// ==========================================
function initFabulousGraphics() {
    const w = Math.floor(window.innerWidth * renderer.getPixelRatio());
    const h = Math.floor(window.innerHeight * renderer.getPixelRatio());
    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);
    const qw = Math.floor(w / 4);
    const qh = Math.floor(h / 4);

    // Scene render (full res, with depth)
    _fab_rtScene = _fab_createRT(w, h, true);

    // Bloom chain (half res)
    _fab_rtBright = _fab_createRT(hw, hh, false);
    _fab_rtBlurH = _fab_createRT(hw, hh, false);
    _fab_rtBlurV = _fab_createRT(hw, hh, false);
    // Second bloom pass (quarter res for wider glow)
    _fab_rtBlurH2 = _fab_createRT(qw, qh, false);
    _fab_rtBlurV2 = _fab_createRT(qw, qh, false);

    // God rays (half res)
    _fab_rtGodRay = _fab_createRT(hw, hh, false);

    // SSAO (half res)
    _fab_rtSSAO = _fab_createRT(hw, hh, false);

    // Final composite (full res)
    _fab_rtComposite = _fab_createRT(w, h, false);

    // --- Shadow map (hard / pixelated via NearestFilter) ---
    _fab_shadowRT = new THREE.WebGLRenderTarget(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.FloatType
    });
    _fab_shadowRT.depthTexture = new THREE.DepthTexture();
    _fab_shadowRT.depthTexture.type = THREE.UnsignedIntType;
    _fab_shadowRT.depthTexture.minFilter = THREE.NearestFilter;
    _fab_shadowRT.depthTexture.magFilter = THREE.NearestFilter;

    _fab_shadowCamera = new THREE.OrthographicCamera(
        -SHADOW_RANGE, SHADOW_RANGE,
        SHADOW_RANGE, -SHADOW_RANGE,
        SHADOW_NEAR, SHADOW_FAR
    );

    // Depth-only material for opaque geometry (FrontSide for standard cubes)
    _fab_shadowDepthMat = new THREE.MeshBasicMaterial({
        colorWrite: true,
        side: THREE.FrontSide
    });
    // Depth material with alpha test for leaves/glass cutout shadows
    // DoubleSide needed for cross-shaped geometry (tall grass, flowers)
    _fab_shadowDepthMatAlpha = new THREE.MeshBasicMaterial({
        colorWrite: true,
        side: THREE.DoubleSide,
        alphaTest: 0.5,
        transparent: false
    });

    _fab_shadowUniforms.uShadowMap.value = _fab_shadowRT.depthTexture;

    // --- Fullscreen scene ---
    fabulousScene = new THREE.Scene();
    fabulousCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ==========================================
    // PASS 1: BRIGHTNESS EXTRACTION (for bloom)
    // High threshold + tight knee = only truly bright pixels bloom
    // Prevents pigs, dirt, grass etc. from glowing
    // ==========================================
    _fab_matBright = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: null },
            uThreshold: { value: 0.78 },
            uSoftKnee: { value: 0.22 }
        },
        vertexShader: _fab_vsQuad(),
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float uThreshold;
            uniform float uSoftKnee;
            varying vec2 vUv;
            void main() {
                vec4 col = texture2D(tDiffuse, vUv);
                float brightness = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
                float knee = uThreshold * uSoftKnee;
                float soft = brightness - uThreshold + knee;
                soft = clamp(soft / (2.0 * knee + 0.0001), 0.0, 1.0);
                soft = soft * soft;
                float contribution = max(soft, step(uThreshold, brightness));
                gl_FragColor = vec4(col.rgb * contribution, 1.0);
            }
        `
    });

    // ==========================================
    // PASS 2/3: GAUSSIAN BLUR (separable)
    // ==========================================
    _fab_matBlurH = _fab_createBlurMat(true, hw, hh);
    _fab_matBlurV = _fab_createBlurMat(false, hw, hh);
    _fab_matBlurH2 = _fab_createBlurMat(true, qw, qh);
    _fab_matBlurV2 = _fab_createBlurMat(false, qw, qh);

    // ==========================================
    // PASS 4: GOD RAYS / SUN SHAFTS
    // ==========================================
    _fab_matGodRay = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: null },
            tDepth: { value: null },
            uSunPos: _fab_uniforms.uSunScreenPos,
            uSunVisible: _fab_uniforms.uSunVisible,
            uDensity: { value: 0.97 },
            uWeight: { value: 0.12 },
            uDecay: { value: 0.965 },
            uExposure: { value: 0.35 },
            uSamples: { value: 64.0 },
            uSunLevel: _fab_uniforms.uSunLevel
        },
        vertexShader: _fab_vsQuad(),
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform sampler2D tDepth;
            uniform vec2 uSunPos;
            uniform float uSunVisible;
            uniform float uDensity;
            uniform float uWeight;
            uniform float uDecay;
            uniform float uExposure;
            uniform float uSamples;
            uniform float uSunLevel;
            varying vec2 vUv;

            void main() {
                if (uSunVisible < 0.01 || uSunLevel < 0.1) {
                    gl_FragColor = vec4(0.0);
                    return;
                }
                vec2 deltaUV = (vUv - uSunPos);
                float dist = length(deltaUV);
                deltaUV *= 1.0 / uSamples * uDensity;
                vec2 coord = vUv;
                float illuminationDecay = 1.0;
                vec3 accumColor = vec3(0.0);

                for (float i = 0.0; i < 64.0; i++) {
                    coord -= deltaUV;
                    vec4 samp = texture2D(tDiffuse, clamp(coord, 0.0, 1.0));
                    float depth = texture2D(tDepth, clamp(coord, 0.0, 1.0)).r;
                    float skyMask = step(0.9999, depth);
                    float lum = dot(samp.rgb, vec3(0.2126, 0.7152, 0.0722));
                    float brightSky = skyMask * smoothstep(0.2, 0.8, lum);
                    accumColor += brightSky * samp.rgb * illuminationDecay * uWeight;
                    illuminationDecay *= uDecay;
                    if (i >= uSamples) break;
                }

                vec3 shaftColor = vec3(1.0, 0.9, 0.7);
                accumColor *= shaftColor * uExposure * uSunVisible * uSunLevel;
                float falloff = 1.0 - smoothstep(0.0, 0.7, dist);
                accumColor *= falloff;
                gl_FragColor = vec4(accumColor, 1.0);
            }
        `
    });

    // ==========================================
    // PASS 5: SCREEN-SPACE AMBIENT OCCLUSION
    // ==========================================
    _fab_matSSAO = new THREE.ShaderMaterial({
        uniforms: {
            tDepth: { value: null },
            tDiffuse: { value: null },
            uResolution: { value: new THREE.Vector2(hw, hh) },
            uCameraNear: { value: 0.1 },
            uCameraFar: { value: 1000.0 },
            uRadius: { value: 0.5 },
            uBias: { value: 0.025 },
            uIntensity: { value: 1.5 },
            uTime: _fab_uniforms.uTime
        },
        vertexShader: _fab_vsQuad(),
        fragmentShader: `
            uniform sampler2D tDepth;
            uniform sampler2D tDiffuse;
            uniform vec2 uResolution;
            uniform float uCameraNear;
            uniform float uCameraFar;
            uniform float uRadius;
            uniform float uBias;
            uniform float uIntensity;
            uniform float uTime;
            varying vec2 vUv;

            float linearDepth(float d) {
                return uCameraNear * uCameraFar / (uCameraFar - d * (uCameraFar - uCameraNear));
            }

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }

            void main() {
                float depth = texture2D(tDepth, vUv).r;
                if (depth > 0.9999) {
                    gl_FragColor = vec4(1.0);
                    return;
                }

                float linDepth = linearDepth(depth);
                float occlusion = 0.0;
                float totalWeight = 0.0;

                const int SAMPLES = 12;
                float angleOffset = hash(vUv * 1000.0 + uTime) * 6.2831;

                for (int i = 0; i < SAMPLES; i++) {
                    float angle = angleOffset + float(i) * (6.2831 / float(SAMPLES));
                    float r = uRadius * (0.3 + 0.7 * hash(vec2(float(i), uTime)));
                    vec2 offset = vec2(cos(angle), sin(angle)) * r / linDepth;
                    offset /= uResolution;

                    float sampleDepth = linearDepth(texture2D(tDepth, vUv + offset).r);
                    float diff = linDepth - sampleDepth;
                    float rangeCheck = smoothstep(0.0, 1.0, uRadius / abs(diff + 0.001));
                    occlusion += step(uBias, diff) * rangeCheck;
                    totalWeight += 1.0;
                }

                occlusion = 1.0 - (occlusion / totalWeight) * uIntensity;
                occlusion = clamp(occlusion, 0.0, 1.0);
                occlusion = mix(1.0, occlusion, 0.7);
                gl_FragColor = vec4(vec3(occlusion), 1.0);
            }
        `
    });

    // ==========================================
    // FINAL COMPOSITE PASS
    // Reduced bloom strengths to avoid glowing entities
    // ==========================================
    _fab_matComposite = new THREE.ShaderMaterial({
        uniforms: {
            tScene: { value: null },
            tBloom: { value: null },
            tBloom2: { value: null },
            tGodRay: { value: null },
            tSSAO: { value: null },
            uExposure: { value: 1.12 },
            uBloomStrength: { value: 0.18 },
            uBloom2Strength: { value: 0.08 },
            uGodRayStrength: { value: 0.55 },
            uSSAOStrength: { value: 0.85 },
            uVignetteIntensity: { value: 0.30 },
            uVignetteRadius: { value: 0.85 },
            uSaturation: { value: 1.12 },
            uContrast: { value: 1.08 },
            uWarmth: { value: 0.04 },
            uSunLevel: _fab_uniforms.uSunLevel,
            uTime: _fab_uniforms.uTime
        },
        vertexShader: _fab_vsQuad(),
        fragmentShader: `
            uniform sampler2D tScene;
            uniform sampler2D tBloom;
            uniform sampler2D tBloom2;
            uniform sampler2D tGodRay;
            uniform sampler2D tSSAO;
            uniform float uExposure;
            uniform float uBloomStrength;
            uniform float uBloom2Strength;
            uniform float uGodRayStrength;
            uniform float uSSAOStrength;
            uniform float uVignetteIntensity;
            uniform float uVignetteRadius;
            uniform float uSaturation;
            uniform float uContrast;
            uniform float uWarmth;
            uniform float uSunLevel;
            uniform float uTime;
            varying vec2 vUv;

            vec3 ACESFilm(vec3 x) {
                float a = 2.51;
                float b = 0.03;
                float c = 2.43;
                float d = 0.59;
                float e = 0.14;
                return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
            }

            void main() {
                vec3 sceneColor = texture2D(tScene, vUv).rgb;
                vec3 bloom1 = texture2D(tBloom, vUv).rgb;
                vec3 bloom2 = texture2D(tBloom2, vUv).rgb;
                vec3 godray = texture2D(tGodRay, vUv).rgb;
                float ao = texture2D(tSSAO, vUv).r;

                float aoFactor = mix(1.0, ao, uSSAOStrength * (0.4 + 0.6 * uSunLevel));
                vec3 color = sceneColor * aoFactor;

                color += bloom1 * uBloomStrength;
                color += bloom2 * uBloom2Strength;
                color += godray * uGodRayStrength;

                color *= uExposure;
                color = ACESFilm(color);
                color = (color - 0.5) * uContrast + 0.5;

                float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
                color = mix(vec3(lum), color, uSaturation);

                color.r += uWarmth * uSunLevel * smoothstep(0.3, 0.8, lum);
                color.b -= uWarmth * 0.5 * uSunLevel * smoothstep(0.3, 0.8, lum);

                vec2 vigUV = vUv * (1.0 - vUv);
                float vig = vigUV.x * vigUV.y * 15.0;
                vig = pow(vig, uVignetteIntensity);
                vig = smoothstep(0.0, uVignetteRadius, vig);
                color *= vig;

                color = clamp(color, 0.0, 1.0);
                gl_FragColor = vec4(color, 1.0);
            }
        `
    });

    fabulousQuad = _fab_createQuad(_fab_matComposite);
    fabulousScene.add(fabulousQuad);

    fabulousEnabled = true;
    console.log('[Fabulous] Initialized: ' + w + 'x' + h + ', shadow map ' + SHADOW_MAP_SIZE + 'px, hard shadows ON');
}

// ==========================================
// SHARED VERTEX SHADER (fullscreen quad)
// ==========================================
function _fab_vsQuad() {
    return `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
        }
    `;
}

// ==========================================
// GAUSSIAN BLUR MATERIAL FACTORY
// ==========================================
function _fab_createBlurMat(horizontal, texW, texH) {
    return new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: null },
            uDirection: { value: horizontal ? new THREE.Vector2(1.0 / texW, 0) : new THREE.Vector2(0, 1.0 / texH) }
        },
        vertexShader: _fab_vsQuad(),
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform vec2 uDirection;
            varying vec2 vUv;
            void main() {
                vec4 sum = vec4(0.0);
                sum += texture2D(tDiffuse, vUv - 4.0 * uDirection) * 0.0162;
                sum += texture2D(tDiffuse, vUv - 3.0 * uDirection) * 0.0540;
                sum += texture2D(tDiffuse, vUv - 2.0 * uDirection) * 0.1216;
                sum += texture2D(tDiffuse, vUv - 1.0 * uDirection) * 0.1945;
                sum += texture2D(tDiffuse, vUv)                     * 0.2270;
                sum += texture2D(tDiffuse, vUv + 1.0 * uDirection) * 0.1945;
                sum += texture2D(tDiffuse, vUv + 2.0 * uDirection) * 0.1216;
                sum += texture2D(tDiffuse, vUv + 3.0 * uDirection) * 0.0540;
                sum += texture2D(tDiffuse, vUv + 4.0 * uDirection) * 0.0162;
                gl_FragColor = sum;
            }
        `
    });
}

// ==========================================
// SHADOW MAP PASS
// Renders scene depth from sun's perspective.
// Uses the existing solidMaterial with alphaTest so leaves
// create pixel-accurate cutout shadows. NearestFilter on the
// shadow depth texture ensures hard pixel edges, no blurring.
// ==========================================
function _fab_renderShadowMap(sunAngle) {
    if (!_fab_shadowRT || !_fab_shadowCamera) return;

    // Sun direction matches the celestial system: Y-Z plane rotation
    const sunDirY = Math.cos(sunAngle);
    const sunDirZ = -Math.sin(sunAngle);
    const sunDir = new THREE.Vector3(0, sunDirY, sunDirZ).normalize();

    _fab_shadowUniforms.uSunDirection.value.copy(sunDir);

    // Position the shadow camera above/behind the player along the sun direction
    const center = new THREE.Vector3(
        Math.floor(player.x),
        Math.floor(player.y),
        Math.floor(player.z)
    );
    const offset = sunDir.clone().multiplyScalar(SHADOW_FAR * 0.45);
    _fab_shadowCamera.position.copy(center).add(offset);
    _fab_shadowCamera.up.set(0, 1, 0);
    
    // When sun is nearly vertical, up vector must differ from look direction
    if (Math.abs(sunDir.y) > 0.95) {
        _fab_shadowCamera.up.set(0, 0, 1);
    }
    
    _fab_shadowCamera.lookAt(center);
    _fab_shadowCamera.updateMatrixWorld(true);
    _fab_shadowCamera.updateProjectionMatrix();

    // Build shadow matrix: world -> shadow clip -> [0,1] UV space
    const biasMatrix = new THREE.Matrix4().set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
    );
    _fab_shadowMatrix.copy(biasMatrix)
        .multiply(_fab_shadowCamera.projectionMatrix)
        .multiply(_fab_shadowCamera.matrixWorldInverse);
    _fab_shadowUniforms.uShadowMatrix.value.copy(_fab_shadowMatrix);

    // Override materials for shadow depth rendering
    // Use cached shadow materials to avoid allocations per frame
    if (!_fab_shadowDepthMat._cachedAtlasMat && solidMaterial && solidMaterial.map) {
        _fab_shadowDepthMat._cachedAtlasMat = new THREE.MeshBasicMaterial({
            map: solidMaterial.map,
            alphaTest: 0.5,
            side: THREE.DoubleSide,
            colorWrite: true
        });
    }
    const atlasDepthMat = _fab_shadowDepthMat._cachedAtlasMat || _fab_shadowDepthMat;
    
    const overrides = [];
    const hiddenObjects = [];
    scene.traverse((obj) => {
        if (!obj.isMesh || !obj.material || !obj.visible) return;

        const mat = obj.material;
        overrides.push({ obj: obj, mat: mat });

        // Hide transparent non-depth-writing objects (water, particles, portals, fire)
        if ((mat.transparent && !mat.depthWrite) || mat === waterMaterial || mat === lavaMaterial) {
            obj.visible = false;
            hiddenObjects.push(obj);
            return;
        }

        // Solid/glass with the terrain atlas: use alpha-tested depth for leaf cutouts
        if (mat === solidMaterial || mat === glassMaterial) {
            obj.material = atlasDepthMat;
        } else if (mat.map && mat.alphaTest > 0.01) {
            // Other alpha-tested materials (mob textures etc.)
            obj.material = atlasDepthMat;
        } else {
            obj.material = _fab_shadowDepthMat;
        }
    });

    // Render shadow depth
    const prevRT = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(_fab_shadowRT);
    renderer.clear();
    renderer.render(scene, _fab_shadowCamera);

    // Restore all materials
    for (const entry of overrides) {
        entry.obj.material = entry.mat;
    }
    for (const obj of hiddenObjects) {
        obj.visible = true;
    }

    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAutoClear;
}

// ==========================================
// RENDER PASS (called each frame)
// ==========================================
function renderFabulous(dt) {
    if (!fabulousEnabled || !_fab_rtScene) return false;

    _fab_uniforms.uTime.value += dt;
    _fab_uniforms.uSunLevel.value = timeUniforms.uSunLevel.value;

    // --- Get current sun angle from game time ---
    let t = 0;
    if (globalTime < DAY_TIME / 2) t = (globalTime / (DAY_TIME / 2)) * 0.25;
    else if (globalTime < DAY_TIME / 2 + NIGHT_TIME) t = 0.25 + ((globalTime - DAY_TIME / 2) / NIGHT_TIME) * 0.5;
    else t = 0.75 + ((globalTime - DAY_TIME / 2 - NIGHT_TIME) / (DAY_TIME / 2)) * 0.25;
    const sunAngle = t * Math.PI * 2;
    const sunHeight = Math.cos(sunAngle);

    // --- Shadow pass (only during daytime and overworld) ---
    const shadowActive = sunHeight > -0.1 && currentDimension !== 'nether';
    if (shadowActive) {
        _fab_renderShadowMap(sunAngle);
        _fab_shadowUniforms.uShadowEnabled.value = Math.min(1.0, Math.max(0.0, (sunHeight + 0.1) * 3.0));
    } else {
        _fab_shadowUniforms.uShadowEnabled.value = 0.0;
    }

    // --- Calculate sun screen position for god rays ---
    if (sunMesh && camera) {
        const sunWorldPos = new THREE.Vector3();
        sunMesh.getWorldPosition(sunWorldPos);
        const projected = sunWorldPos.clone().project(camera);
        _fab_uniforms.uSunScreenPos.value.set(projected.x * 0.5 + 0.5, projected.y * 0.5 + 0.5);

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const toSun = sunWorldPos.clone().sub(camera.position).normalize();
        const dotProduct = camDir.dot(toSun);
        const sunLevel = timeUniforms.uSunLevel.value;
        _fab_uniforms.uSunVisible.value = (dotProduct > 0 && sunLevel > 0.15) ?
            smoothstep(0.0, 0.3, dotProduct) * smoothstep(0.15, 0.4, sunLevel) : 0.0;
    }

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = true;

    // PASS 1: Render scene to texture
    renderer.setRenderTarget(_fab_rtScene);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(uiScene, uiCamera);
    renderer.autoClear = true;

    // PASS 2: Extract bright pixels
    _fab_matBright.uniforms.tDiffuse.value = _fab_rtScene.texture;
    fabulousQuad.material = _fab_matBright;
    renderer.setRenderTarget(_fab_rtBright);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    // PASS 3a: Bloom blur (half-res)
    _fab_matBlurH.uniforms.tDiffuse.value = _fab_rtBright.texture;
    fabulousQuad.material = _fab_matBlurH;
    renderer.setRenderTarget(_fab_rtBlurH);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    _fab_matBlurV.uniforms.tDiffuse.value = _fab_rtBlurH.texture;
    fabulousQuad.material = _fab_matBlurV;
    renderer.setRenderTarget(_fab_rtBlurV);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    // PASS 3b: Bloom blur (quarter-res, wide)
    _fab_matBlurH2.uniforms.tDiffuse.value = _fab_rtBlurV.texture;
    fabulousQuad.material = _fab_matBlurH2;
    renderer.setRenderTarget(_fab_rtBlurH2);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    _fab_matBlurV2.uniforms.tDiffuse.value = _fab_rtBlurH2.texture;
    fabulousQuad.material = _fab_matBlurV2;
    renderer.setRenderTarget(_fab_rtBlurV2);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    // PASS 4: God Rays
    _fab_matGodRay.uniforms.tDiffuse.value = _fab_rtScene.texture;
    _fab_matGodRay.uniforms.tDepth.value = _fab_rtScene.depthTexture;
    fabulousQuad.material = _fab_matGodRay;
    renderer.setRenderTarget(_fab_rtGodRay);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    // PASS 5: SSAO
    _fab_matSSAO.uniforms.tDepth.value = _fab_rtScene.depthTexture;
    _fab_matSSAO.uniforms.tDiffuse.value = _fab_rtScene.texture;
    _fab_matSSAO.uniforms.uCameraNear.value = camera.near;
    _fab_matSSAO.uniforms.uCameraFar.value = camera.far;
    fabulousQuad.material = _fab_matSSAO;
    renderer.setRenderTarget(_fab_rtSSAO);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    // PASS 6: Final composite to screen
    _fab_matComposite.uniforms.tScene.value = _fab_rtScene.texture;
    _fab_matComposite.uniforms.tBloom.value = _fab_rtBlurV.texture;
    _fab_matComposite.uniforms.tBloom2.value = _fab_rtBlurV2.texture;
    _fab_matComposite.uniforms.tGodRay.value = _fab_rtGodRay.texture;
    _fab_matComposite.uniforms.tSSAO.value = _fab_rtSSAO.texture;
    fabulousQuad.material = _fab_matComposite;

    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(fabulousScene, fabulousCamera);

    renderer.autoClear = prevAutoClear;
    return true;
}

// ==========================================
// CLEANUP
// ==========================================
function disposeFabulousGraphics() {
    const targets = [_fab_rtScene, _fab_rtBright, _fab_rtBlurH, _fab_rtBlurV, 
                     _fab_rtBlurH2, _fab_rtBlurV2, _fab_rtGodRay, _fab_rtSSAO, 
                     _fab_rtComposite, _fab_shadowRT];
    for (const rt of targets) {
        if (rt) {
            rt.dispose();
            if (rt.depthTexture) rt.depthTexture.dispose();
        }
    }

    const mats = [_fab_matBright, _fab_matBlurH, _fab_matBlurV, _fab_matBlurH2, 
                  _fab_matBlurV2, _fab_matGodRay, _fab_matSSAO, _fab_matComposite,
                  _fab_shadowDepthMat, _fab_shadowDepthMatAlpha];
    for (const m of mats) {
        if (m) m.dispose();
    }

    if (fabulousQuad && fabulousQuad.geometry) fabulousQuad.geometry.dispose();

    _fab_rtScene = _fab_rtBright = _fab_rtBlurH = _fab_rtBlurV = null;
    _fab_rtBlurH2 = _fab_rtBlurV2 = _fab_rtGodRay = _fab_rtSSAO = _fab_rtComposite = null;
    _fab_shadowRT = null; _fab_shadowCamera = null;
    _fab_shadowDepthMat = null; _fab_shadowDepthMatAlpha = null;
    _fab_matBright = _fab_matBlurH = _fab_matBlurV = null;
    _fab_matBlurH2 = _fab_matBlurV2 = _fab_matGodRay = _fab_matSSAO = _fab_matComposite = null;
    fabulousScene = fabulousCamera = fabulousQuad = null;
    _fab_shadowUniforms.uShadowEnabled.value = 0.0;
    _fab_shadowUniforms.uShadowMap.value = null;
    fabulousEnabled = false;
    console.log('[Fabulous] Post-processing disposed.');
}

// ==========================================
// RESIZE HANDLER
// ==========================================
function resizeFabulousGraphics() {
    if (!fabulousEnabled) return;
    disposeFabulousGraphics();
    initFabulousGraphics();
}

// ==========================================
// ENHANCED LIGHTING SHADER FOR FABULOUS MODE
// Includes: directional sun lighting, hemisphere ambient,
// warm torch glow, AND realtime shadow map sampling.
// Shadow map uses NearestFilter for pixel-accurate hard edges:
// leaf shadows show individual pixel cutouts, no softening.
// ==========================================
function injectFabulousLightingShader(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSunLevel = timeUniforms.uSunLevel;
        shader.uniforms.uSunColor = timeUniforms.uSunColor;
        shader.uniforms.uTorchColor = timeUniforms.uTorchColor;
        shader.uniforms.uAmbientColor = timeUniforms.uAmbientColor;
        shader.uniforms.uFabTime = { value: 0.0 };
        // Shadow uniforms
        shader.uniforms.uShadowMap = _fab_shadowUniforms.uShadowMap;
        shader.uniforms.uShadowMatrix = _fab_shadowUniforms.uShadowMatrix;
        shader.uniforms.uShadowEnabled = _fab_shadowUniforms.uShadowEnabled;
        shader.uniforms.uSunDirection = _fab_shadowUniforms.uSunDirection;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_pars_vertex>',
            `#include <color_pars_vertex>
attribute vec3 aBiomeTint;
varying vec3 vBiomeTint;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;`
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_vertex>',
            `#include <color_vertex>
vBiomeTint = aBiomeTint;
vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_pars_fragment>',
            `#include <color_pars_fragment>
uniform float uSunLevel;
uniform vec3 uSunColor;
uniform vec3 uTorchColor;
uniform vec3 uAmbientColor;
uniform float uFabTime;
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowEnabled;
uniform vec3 uSunDirection;
varying vec3 vBiomeTint;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

float getShadow() {
    if (uShadowEnabled < 0.01) return 1.0;

    // Only apply shadow map to surfaces that face upward toward the sun.
    // Side faces and bottom faces already have correct lighting from the
    // MC vertex-color system — shadow mapping them causes acne/flickering.
    float upDot = dot(vWorldNormal, vec3(0.0, 1.0, 0.0));
    if (upDot < 0.5) return 1.0;

    vec4 shadowCoord = uShadowMatrix * vec4(vWorldPos, 1.0);
    vec3 projCoord = shadowCoord.xyz / shadowCoord.w;

    if (projCoord.x < 0.0 || projCoord.x > 1.0 ||
        projCoord.y < 0.0 || projCoord.y > 1.0 ||
        projCoord.z > 1.0) {
        return 1.0;
    }

    float shadowDepth = texture2D(uShadowMap, projCoord.xy).r;

    // Small fixed bias — only top faces get here so acne risk is minimal
    float bias = 0.003;

    float shadow = step(projCoord.z - bias, shadowDepth);

    vec2 edgeFade = smoothstep(vec2(0.0), vec2(0.08), projCoord.xy) * 
                    smoothstep(vec2(0.0), vec2(0.08), vec2(1.0) - projCoord.xy);

    return mix(1.0, shadow, edgeFade.x * edgeFade.y * uShadowEnabled);
}`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#ifdef USE_COLOR
    float shade = vColor.b;
    float rawSun = (shade > 0.001) ? clamp(vColor.r / shade, 0.0, 1.0) : 0.0;
    float rawTorch = (shade > 0.001) ? clamp(vColor.g / shade, 0.0, 1.0) : 0.0;
    float mcSun = pow(0.8, 15.0 * (1.0 - rawSun));
    float mcTorch = pow(0.8, 15.0 * (1.0 - rawTorch));

    // REALTIME SHADOW — hard, pixel-accurate
    float shadowFactor = getShadow();

    // Directional shading from world normal vs sun direction (subtle)
    float NdotL = max(dot(vWorldNormal, uSunDirection), 0.0);
    float sunDirect = NdotL * 0.25 + 0.75; // Very subtle wrap lighting

    // Original MC lighting as base (ambient + full sun + torch)
    vec3 baseLightCalc = shade * uAmbientColor + mcSun * shade * uSunColor * uSunLevel + mcTorch * shade * uTorchColor;

    // Shadow reduces only the direct sun portion, keeping ambient and torch intact
    vec3 ambientAndTorch = shade * uAmbientColor + mcTorch * shade * uTorchColor;
    vec3 directSun = mcSun * shade * uSunColor * uSunLevel * sunDirect;

    // In shadow: only ambient + torch. In light: ambient + torch + directSun.
    // Shadow strength is ~60% — shadowed areas still get some scattered sun light
    float shadowMix = mix(1.0, shadowFactor, 0.6 * uShadowEnabled);
    vec3 lightCalc = ambientAndTorch + directSun * shadowMix;

    diffuseColor.rgb *= min(vec3(1.0), lightCalc) * vBiomeTint;
#endif`
        );

        material.userData.fabulousShader = shader;
    };
}

// ==========================================
// UTILITY: smoothstep (JS-side)
// ==========================================
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
