// ==========================================
// 17. BLOCK SOUND SYSTEM — SPATIAL AUDIO
// Dig sounds during mining, break sounds on destroy, footstep sounds while walking
// Each sound category has 4 variants (0-3) that are randomly selected
// All timing is clock-based (seconds), never frame-dependent
// Distance-based attenuation and stereo panning via Web Audio PannerNode
// ==========================================

(function() {
    'use strict';

    // Versioned fetch for cache busting
    function vFetch(url) {
        const v = typeof ASSET_VERSION !== 'undefined' ? '?v=' + ASSET_VERSION : '';
        return fetch(url + v);
    }

    // --- AUDIO CONTEXT (shared, lazy-init) ---
    let _audioCtx = null;
    function getAudioCtx() {
        if (!_audioCtx) {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return _audioCtx;
    }

    function ensureAudioResumed() {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
    }
    document.addEventListener('mousedown', ensureAudioResumed);
    document.addEventListener('keydown', ensureAudioResumed);

    // =============================================
    // LISTENER UPDATE — called every frame from game loop
    // =============================================
    window._soundUpdateListener = function() {
        if (typeof player === 'undefined' || !player) return;
        if (!_audioCtx) return;
        const L = _audioCtx.listener;
        const px = player.x, py = player.y + player.eyeLevel, pz = player.z;
        
        const yaw = player.yaw || 0;
        const pitch = player.pitch || 0;

        // Calculate true 3D Forward vector (including pitch)
        const fx = -Math.sin(yaw) * Math.cos(pitch);
        const fy = Math.sin(pitch);
        const fz = -Math.cos(yaw) * Math.cos(pitch);

        // Calculate true 3D Up vector based on the camera's tilt
        const ux = Math.sin(yaw) * Math.sin(pitch);
        const uy = Math.cos(pitch);
        const uz = Math.cos(yaw) * Math.sin(pitch);

        if (typeof L.positionX !== 'undefined') {
            L.positionX.value = px;
            L.positionY.value = py;
            L.positionZ.value = pz;
            L.forwardX.value = fx;
            L.forwardY.value = fy; 
            L.forwardZ.value = fz;
            L.upX.value = ux;      
            L.upY.value = uy;
            L.upZ.value = uz;
        } else {
            L.setPosition(px, py, pz);
            L.setOrientation(fx, fy, fz, ux, uy, uz);
        }
    };

    // --- SOUND LOADING ---
    const VARIANT_COUNT = 4;
    const CATEGORY_NAMES = ['wood', 'stone', 'grass', 'gravel', 'snow', 'cloth', 'sand'];
    const _buffers = {};

    async function loadAllSounds() {
        const ctx = getAudioCtx();
        for (const cat of CATEGORY_NAMES) {
            for (const type of ['dig', 'step']) {
                for (let v = 0; v < VARIANT_COUNT; v++) {
                    const path = `sounds/${type}_${cat}_${v}.ogg`;
                    const key = `${type}_${cat}_${v}`;
                    try {
                        const resp = await vFetch(path);
                        if (!resp.ok) continue;
                        const arrayBuf = await resp.arrayBuffer();
                        _buffers[key] = await ctx.decodeAudioData(arrayBuf);
                    } catch(e) {}
                }
            }
        }
        for (const name of ['chest_open', 'chest_close']) {
            try {
                const resp = await vFetch(`sounds/${name}.ogg`);
                if (!resp.ok) continue;
                const arrayBuf = await resp.arrayBuffer();
                _buffers[name] = await ctx.decodeAudioData(arrayBuf);
            } catch(e) {}
        }
        for (let v = 0; v < VARIANT_COUNT; v++) {
            try {
                const resp = await vFetch(`sounds/dig_glass_${v}.ogg`);
                if (!resp.ok) continue;
                const arrayBuf = await resp.arrayBuffer();
                _buffers[`dig_glass_${v}`] = await ctx.decodeAudioData(arrayBuf);
            } catch(e) {}
        }
        for (const name of ['door_open', 'door_close']) {
            try {
                const resp = await vFetch(`sounds/${name}.ogg`);
                if (!resp.ok) continue;
                const arrayBuf = await resp.arrayBuffer();
                _buffers[name] = await ctx.decodeAudioData(arrayBuf);
            } catch(e) {}
        }

        // Load extra unique audio files
        const extraSounds = [
            { key: 'burp', file: 'burp.ogg' },
            { key: 'tool_break', file: 'tool_break.ogg' },
            { key: 'lava_pop', file: 'lavapop.ogg' },
            { key: 'fire_ambient', file: 'fire_burn.ogg' },
            { key: 'flint_and_steel', file: 'fire_ignite.ogg' },
            { key: 'fuse', file: 'fuse.ogg' },
            { key: 'fizz', file: 'fizz.ogg' },
            { key: 'explode_0', file: 'explode_0.mp3' },
            { key: 'explode_1', file: 'explode_1.ogg' },
            { key: 'explode_2', file: 'explode_2.ogg' },
            { key: 'explode_3', file: 'explode_3.ogg' },
            { key: 'explode_4', file: 'explode_4.ogg' }
        ];
        for (const s of extraSounds) {
            try {
                const resp = await vFetch(`sounds/${s.file}`);
                if (resp.ok) {
                    const arrayBuf = await resp.arrayBuffer();
                    _buffers[s.key] = await ctx.decodeAudioData(arrayBuf);
                }
            } catch(e) { console.error(`Could not load ${s.file}`, e); }
        }

        // LOAD FIRE AMBIENCE
        try {
            const resp = await vFetch(`sounds/fire_burn.ogg`);
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                _buffers['fire_ambient'] = await ctx.decodeAudioData(arrayBuf);
            }
        } catch(e) { console.error("Could not load fire_burn.ogg", e); }

        // LOAD FLINT AND STEEL
        try {
            const resp = await vFetch(`sounds/fire_ignite.ogg`);
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                _buffers['flint_and_steel'] = await ctx.decodeAudioData(arrayBuf);
            }
        } catch(e) { console.error("Could not load fire_ignite.ogg", e); }

        // Load the plop sound for item interactions
        try {
            const resp = await vFetch(`sounds/plop.ogg`);
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                _buffers['plop'] = await ctx.decodeAudioData(arrayBuf);
            }
        } catch(e) { console.error("Could not load plop.ogg", e); }
    }
    loadAllSounds();

    // --- BLOCK → CATEGORY MAPPING ---
    const _blockSoundLUT = new Uint8Array(256);
    const CATEGORY_KEYS = ['grass', 'wood', 'stone', 'gravel', 'snow', 'cloth', 'sand', 'glass'];

    function _setCategory(ids, catIdx) {
        for (const id of ids) _blockSoundLUT[id] = catIdx;
    }

    _setCategory([1, 65, 64, 14, 22, 43, 97, 116, 117, 118, 137, 66, 16, 24, 23, 53, 52, 67, 26, 42], 0);
    _setCategory([13, 21, 41, 96, 29, 30, 44, 98, 58, 69, 93, 51, 70, 71, 72, 77, 80, 81, 82, 94, 144, 145, 146, 147, 149, 150], 1);
    _setCategory([3, 33, 32, 10, 11, 12, 48, 6, 7, 8, 9, 49, 50, 88, 31, 28, 87, 59, 91,
                  73, 74, 75, 76, 83, 84, 85, 86, 54, 60, 38, 68, 95, 90,
                  99, 138, 139, 140, 141, 148, 152, 154, 155, 156, 19, 157, 158], 2);
    _setCategory([2, 5, 92, 61, 62, 63], 3);
    _setCategory([39, 40], 4);
    _setCategory([34, 35, 36, 37, 20], 5);
    _setCategory([15], 6);

    function getBlockSoundCategory(blockId) {
        return CATEGORY_KEYS[_blockSoundLUT[blockId] || 0];
    }

    function getStepCategory(blockId) {
        const cat = getBlockSoundCategory(blockId);
        if (cat === 'glass') return 'stone';
        return cat;
    }

    // =============================================
    // CORE PLAY FUNCTIONS
    // =============================================

    const MAX_SOUND_DIST = 32;

    function playSound(type, category, volume, pitchMin, pitchMax) {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        const variant = Math.floor(Math.random() * VARIANT_COUNT);
        const key = `${type}_${category}_${variant}`;
        const buf = _buffers[key];
        if (!buf) return;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = pitchMin + Math.random() * (pitchMax - pitchMin);

        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
    }

    function playNamedSound(bufferKey, volume, pitchMin, pitchMax) {
        const buf = _buffers[bufferKey];
        if (!buf) return;
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = pitchMin + Math.random() * (pitchMax - pitchMin);
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
    }

    function _playSpatial(buf, volume, pitchMin, pitchMax, wx, wy, wz) {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        if (typeof player !== 'undefined' && player) {
            const dx = wx - player.x;
            const dy = wy - (player.y + player.eyeLevel);
            const dz = wz - player.z;
            if (dx * dx + dy * dy + dz * dz > MAX_SOUND_DIST * MAX_SOUND_DIST) return;
        }

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = pitchMin + Math.random() * (pitchMax - pitchMin);

        const gain = ctx.createGain();
        gain.gain.value = volume;

        const panner = ctx.createPanner();
        panner.panningModel = 'equalpower'; 
        panner.distanceModel = 'linear';
        panner.refDistance = 1;
        panner.maxDistance = MAX_SOUND_DIST;
        panner.rolloffFactor = 1;

        panner.positionX.value = wx;
        panner.positionY.value = wy;
        panner.positionZ.value = wz;

        src.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
        src.start(0);
    }

    function playSoundAt(type, category, volume, pitchMin, pitchMax, wx, wy, wz) {
        const variant = Math.floor(Math.random() * VARIANT_COUNT);
        const key = `${type}_${category}_${variant}`;
        const buf = _buffers[key];
        if (!buf) return;
        _playSpatial(buf, volume, pitchMin, pitchMax, wx, wy, wz);
    }

    function playNamedSoundAt(bufferKey, volume, pitchMin, pitchMax, wx, wy, wz) {
        const buf = _buffers[bufferKey];
        if (!buf) return;
        _playSpatial(buf, volume, pitchMin, pitchMax, wx, wy, wz);
    }

    function playFluidSound(name, volume, pitchMin, pitchMax) {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const info = FLUID_SOUNDS[name];
        if (!info) return;
        const variant = Math.floor(Math.random() * info.variants);
        const key = `${name}_${variant}`;
        const buf = _buffers[key];
        if (!buf) return;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = pitchMin + Math.random() * (pitchMax - pitchMin);
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
    }

    function playFluidSoundAt(name, volume, pitchMin, pitchMax, wx, wy, wz) {
        const info = FLUID_SOUNDS[name];
        if (!info) return;
        const variant = Math.floor(Math.random() * info.variants);
        const key = `${name}_${variant}`;
        const buf = _buffers[key];
        if (!buf) return;
        _playSpatial(buf, volume, pitchMin, pitchMax, wx, wy, wz);
    }

    // =============================================
    // DIG SOUNDS — fixed interval while mining
    // =============================================
    const DIG_SOUND_INTERVAL = 0.25;
    let _digSoundTimer = 0;
    let _wasMining = false;

    window._soundCheckDigTick = function(dt) {
        if (typeof miningState === 'undefined') return;

        if (miningState.isMining && miningState.progress > 0) {
            if (!_wasMining) {
                _wasMining = true;
                _digSoundTimer = 0;
                const cat = getStepCategory(miningState.id);
                playSoundAt('dig', cat, 0.35, 0.6, 1.0,
                    miningState.x + 0.5, miningState.y + 0.5, miningState.z + 0.5);
                return;
            }

            _digSoundTimer += dt;
            if (_digSoundTimer >= DIG_SOUND_INTERVAL) {
                _digSoundTimer -= DIG_SOUND_INTERVAL;
                if (_digSoundTimer > DIG_SOUND_INTERVAL) _digSoundTimer = 0;

                const cat = getStepCategory(miningState.id);
                playSoundAt('dig', cat, 0.35, 0.6, 1.0,
                    miningState.x + 0.5, miningState.y + 0.5, miningState.z + 0.5);
            }
        } else {
            _wasMining = false;
            _digSoundTimer = 0;
        }
    };

    // =============================================
    // BREAK SOUND — when block is destroyed
    // =============================================
    const GLASS_BREAK_IDS = new Set([38, 68, 95, 90, 138]);
    
    const _origBreakBlock = window.breakBlock;
    window.breakBlock = function(x, y, z, canHarvest) {
        const val = typeof getVoxel === 'function' ? getVoxel(x, y, z) : 0;
        const blockId = val & 0xFF;

        if (typeof _origBreakBlock === 'function') {
            _origBreakBlock.call(this, x, y, z, canHarvest);
        }

        if (blockId !== 0 && blockId !== 18) {
            if (GLASS_BREAK_IDS.has(blockId)) {
                playSoundAt('dig', 'glass', 0.65, 0.7, 1.0, x + 0.5, y + 0.5, z + 0.5);
            } else {
                const cat = getBlockSoundCategory(blockId);
                playSoundAt('dig', cat, 0.65, 0.7, 1.0, x + 0.5, y + 0.5, z + 0.5);
            }
        }
    };

    // =============================================
    // PLACE SOUND — when block is placed
    // =============================================
    window._soundPlaceBlock = function(blockId, wx, wy, wz) {
        if (blockId && blockId !== 0) {
            const cat = getStepCategory(blockId);
            if (wx !== undefined && wy !== undefined && wz !== undefined) {
                playSoundAt('dig', cat, 0.55, 0.7, 0.9, wx + 0.5, wy + 0.5, wz + 0.5);
            } else {
                playSound('dig', cat, 0.55, 0.7, 0.9);
            }
        }
    };

    // =============================================
    // FOOTSTEP SOUNDS — distance-based
    // =============================================
    const STEP_DISTANCE = 1.8;
    let _stepDistAccum = 0;
    let _lastPlayerX = null;
    let _lastPlayerZ = null;

    window._soundCheckFootsteps = function(dt) {
        if (typeof player === 'undefined' || !player) return;
        if (typeof uiState !== 'undefined' && uiState !== 'PLAYING') return;

        if (_lastPlayerX === null) {
            _lastPlayerX = player.x;
            _lastPlayerZ = player.z;
            return;
        }

        const dx = player.x - _lastPlayerX;
        const dz = player.z - _lastPlayerZ;
        _lastPlayerX = player.x;
        _lastPlayerZ = player.z;

        if (player.flying || player.isSneaking) {
            return;
        }

        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist > 2.0) { _stepDistAccum = 0; return; }
        if (dist < 0.001) return;

        _stepDistAccum += dist;

        if (_stepDistAccum >= STEP_DISTANCE) {
            if (player.onGround) {
                _stepDistAccum -= STEP_DISTANCE;
                if (_stepDistAccum > STEP_DISTANCE) _stepDistAccum = 0;

                const footX = Math.floor(player.x);
                const footY = Math.floor(player.y - 0.05);
                const footZ = Math.floor(player.z);

                let blockId = 0;
                if (typeof getVoxel === 'function') {
                    blockId = getVoxel(footX, footY, footZ) & 0xFF;
                }
                if (blockId === 0 || blockId === 4 || blockId === 27) return;

                const cat = getStepCategory(blockId);
                const vol = player.isSprinting ? 0.30 : 0.22;
                playSound('step', cat, vol, 0.75, 1.05);
            } else {
                _stepDistAccum = STEP_DISTANCE;
            }
        }
    };

    // --- EXPOSE ---
    window.getBlockSoundCategory = getBlockSoundCategory;
    window.playBlockSound = function(blockId, type, volume) {
        const cat = (type === 'step') ? getStepCategory(blockId) : getBlockSoundCategory(blockId);
        playSound(type || 'dig', cat, volume || 0.5, 0.7, 1.1);
    };
    window.playBlockSoundAt = function(blockId, type, volume, wx, wy, wz) {
        const cat = (type === 'step') ? getStepCategory(blockId) : getBlockSoundCategory(blockId);
        playSoundAt(type || 'dig', cat, volume || 0.5, 0.7, 1.1, wx, wy, wz);
    };

    window.playChestOpenSound = function(wx, wy, wz) {
        if (wx !== undefined && wy !== undefined && wz !== undefined) {
            playNamedSoundAt('chest_open', 0.45, 0.9, 1.1, wx + 0.5, wy + 0.5, wz + 0.5);
        } else {
            playNamedSound('chest_open', 0.45, 0.9, 1.1);
        }
    };

    window.playChestCloseSound = function(wx, wy, wz) {
        if (wx !== undefined && wy !== undefined && wz !== undefined) {
            playNamedSoundAt('chest_close', 0.45, 0.9, 1.1, wx + 0.5, wy + 0.5, wz + 0.5);
        } else {
            playNamedSound('chest_close', 0.45, 0.9, 1.1);
        }
    };

    window.playDoorSound = function(isOpening, wx, wy, wz) {
        const key = isOpening ? 'door_open' : 'door_close';
        if (wx !== undefined && wy !== undefined && wz !== undefined) {
            playNamedSoundAt(key, 0.5, 0.9, 1.1, wx + 0.5, wy + 0.5, wz + 0.5);
        } else {
            playNamedSound(key, 0.5, 0.9, 1.1);
        }
    };

    // =============================================
    // WATER & LAVA SOUNDS
    // =============================================
    const FLUID_SOUNDS = {
        splash:     { prefix: 'sounds/water_splash_', variants: 1 },
        swim:       { prefix: 'sounds/swim_',         variants: 4 },
        flow_water: { prefix: 'sounds/flow_water_',   variants: 1 },
        flow_lava:  { prefix: 'sounds/flow_lava_',    variants: 1 }
    };

    async function loadFluidSounds() {
        const ctx = getAudioCtx();
        for (const [name, info] of Object.entries(FLUID_SOUNDS)) {
            for (let v = 0; v < info.variants; v++) {
                const path = `${info.prefix}${v}.ogg`;
                const key = `${name}_${v}`;
                try {
                    const resp = await vFetch(path);
                    if (!resp.ok) continue;
                    const arrayBuf = await resp.arrayBuffer();
                    _buffers[key] = await ctx.decodeAudioData(arrayBuf);
                } catch(e) {}
            }
        }
    }
    loadFluidSounds();

    // =============================================
    // WATER SPLASH — player enters water
    // =============================================
    let _playerWasInWater = false;

    window._soundCheckWaterSplash = function() {
        if (typeof player === 'undefined' || !player) return;
        if (typeof uiState !== 'undefined' && uiState !== 'PLAYING') return;

        const footY = Math.floor(player.y);
        const px = Math.floor(player.x), pz = Math.floor(player.z);
        let inWater = false;
        for (let by = footY; by <= footY + 1; by++) {
            if ((getVoxel(px, by, pz) & 0xFF) === 4) { inWater = true; break; }
        }

        if (inWater && !_playerWasInWater) {
            const fallSpeed = Math.abs(player.vy || 0);
            const vol = Math.min(0.2, 0.05 + fallSpeed * 0.02); 
            playFluidSound('splash', vol, 0.9, 1.1); 
        }
        _playerWasInWater = inWater;
    };

    // =============================================
    // SWIM SOUNDS — player moving in water
    // =============================================
    const SWIM_DISTANCE = 1.5;
    let _swimDistAccum = 0;
    let _swimLastX = null;
    let _swimLastZ = null;

    window._soundCheckSwim = function() {
        if (typeof player === 'undefined' || !player) return;
        if (typeof uiState !== 'undefined' && uiState !== 'PLAYING') return;

        if (_swimLastX === null) {
            _swimLastX = player.x;
            _swimLastZ = player.z;
            return;
        }

        const dx = player.x - _swimLastX;
        const dz = player.z - _swimLastZ;
        _swimLastX = player.x;
        _swimLastZ = player.z;

        if (!_playerWasInWater) {
            _swimDistAccum = 0;
            return;
        }

        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2.0 || dist < 0.001) return;

        _swimDistAccum += dist;
        if (_swimDistAccum >= SWIM_DISTANCE) {
            _swimDistAccum -= SWIM_DISTANCE;
            if (_swimDistAccum > SWIM_DISTANCE) _swimDistAccum = 0;
            playFluidSound('swim', 0.25, 0.8, 1.2);
        }
    };

    // =============================================
    // AMBIENT FLUID SOUNDS — flowing water/lava nearby (spatial)
    // =============================================
    let _ambientWaterTimer = 0;
    let _ambientLavaTimer = 0;
    let _ambientFireTimer = 0;
    let _ambientLavaPopTimer = 0;
    const WATER_AMBIENT_MIN = 1.0;
    const WATER_AMBIENT_MAX = 3.0;
    const LAVA_AMBIENT_MIN = 2.0;
    const LAVA_AMBIENT_MAX = 5.0;
    const FIRE_AMBIENT_MIN = 0.5;
    const FIRE_AMBIENT_MAX = 2.0;

    let _nextWaterAmbient = WATER_AMBIENT_MIN + Math.random() * (WATER_AMBIENT_MAX - WATER_AMBIENT_MIN);
    let _nextLavaAmbient = LAVA_AMBIENT_MIN + Math.random() * (LAVA_AMBIENT_MAX - LAVA_AMBIENT_MIN);
    let _nextFireAmbient = FIRE_AMBIENT_MIN + Math.random() * (FIRE_AMBIENT_MAX - FIRE_AMBIENT_MIN);
    let _nextLavaPopAmbient = 1.0 + Math.random() * 8.0;

    window._soundCheckAmbientFluids = function(dt) {
        if (typeof player === 'undefined' || !player) return;
        if (typeof uiState !== 'undefined' && uiState !== 'PLAYING') return;

        _ambientWaterTimer += dt;
        _ambientLavaTimer += dt;
        _ambientFireTimer += dt;
        _ambientLavaPopTimer += dt;

        if (_ambientWaterTimer >= _nextWaterAmbient) {
            _ambientWaterTimer = 0;
            _nextWaterAmbient = 1.0 + Math.random() * 2.0;
            const pos = _findFlowingFluidNearby(4, 16);
            if (pos) playFluidSoundAt('flow_water', 0.2, 0.9, 1.1, pos.x, pos.y, pos.z);
        }

        if (_ambientLavaTimer >= _nextLavaAmbient) {
            _ambientLavaTimer = 0;
            _nextLavaAmbient = 2.0 + Math.random() * 3.0;
            const pos = _findFlowingFluidNearby(27, 16);
            if (pos) playFluidSoundAt('flow_lava', 0.25, 0.9, 1.1, pos.x, pos.y, pos.z);
        }

        if (_ambientFireTimer >= _nextFireAmbient) {
            _ambientFireTimer = 0;
            _nextFireAmbient = 0.5 + Math.random() * 1.5;
            const pos = _findFlowingFluidNearby(89, 10);
            if (pos && _buffers['fire_ambient']) playNamedSoundAt('fire_ambient', 0.3, 0.8, 1.2, pos.x, pos.y, pos.z);
        }

        if (_ambientLavaPopTimer >= _nextLavaPopAmbient) {
            _ambientLavaPopTimer = 0;
            _nextLavaPopAmbient = 1.0 + Math.random() * 8.0;
            const pos = _findFlowingFluidNearby(27, 10);
            if (pos && _buffers['lava_pop']) {
                playNamedSoundAt('lava_pop', 0.35, 0.8, 1.2, pos.x, pos.y, pos.z);
                if (typeof window.spawnLavaPopParticle === 'function') window.spawnLavaPopParticle(pos.x, pos.y + 0.5, pos.z);
            }
        }
    };

    function _findFlowingFluidNearby(fluidId, radius) {
        const px = Math.floor(player.x), py = Math.floor(player.y), pz = Math.floor(player.z);
        for (let i = 0; i < 20; i++) {
            const sx = px + Math.floor(Math.random() * radius * 2) - radius;
            const sy = py + Math.floor(Math.random() * 10) - 3;
            const sz = pz + Math.floor(Math.random() * radius * 2) - radius;
            const val = getVoxel(sx, sy, sz);
            const id = val & 0xFF;
            if (id === fluidId) {
                const isSource = (val >> 13) & 0x1;
                if (!isSource) return { x: sx + 0.5, y: sy + 0.5, z: sz + 0.5 };
                const aboveId = getVoxel(sx, sy + 1, sz) & 0xFF;
                if (aboveId === 0) return { x: sx + 0.5, y: sy + 0.5, z: sz + 0.5 };
            }
        }
        return null;
    }

    // =============================================
    // MOB SOUNDS — spatial at mob position
    // =============================================
    window._soundMobWaterSplash = function(mob, wasInWater) {
        if (!mob || mob.dead || mob.dying) return;
        if (mob.inWater && !wasInWater) {
            playFluidSoundAt('splash', 0.05, 0.8, 1.2, mob.x, mob.y, mob.z);
        }
    };

    window._soundMobSwim = function(mob, moveDist) {
        if (!mob || mob.dead || mob.dying || !mob.inWater) return;
        if (!mob._swimDist) mob._swimDist = 0;
        mob._swimDist += moveDist;
        if (mob._swimDist >= SWIM_DISTANCE) {
            mob._swimDist -= SWIM_DISTANCE;
            if (mob._swimDist > SWIM_DISTANCE) mob._swimDist = 0;
            playFluidSoundAt('swim', 0.25, 0.8, 1.2, mob.x, mob.y, mob.z);
        }
    };

    // =============================================
    // CUSTOM MOB SOUNDS
    // =============================================
    const MOB_SOUNDS_DEF = {
        pig: { say: 3, step: 4, death: 1 },
        zombie: { say: 3, step: 4, hurt: 2, death: 1 },
        skeleton: { say: 3, step: 3, hurt: 3, death: 1 },
        sheep: { say: 3, step: 4, death: 0 }, // Fallback to 'say'
        zpig: { idle: 4, angry: 4, hurt: 2, death: 1 }
    };

    async function loadMobCustomSounds() {
        const ctx = getAudioCtx();
        for (const [mobName, actions] of Object.entries(MOB_SOUNDS_DEF)) {
            for (const [action, count] of Object.entries(actions)) {
                if (count === 0) continue;
                for (let v = 0; v < count; v++) {
                    const filename = count === 1 ? `sounds/${mobName}_${action}.ogg` : `sounds/${mobName}_${action}_${v}.ogg`;
                    const key = count === 1 ? `${mobName}_${action}` : `${mobName}_${action}_${v}`;
                    try {
                        const resp = await vFetch(filename);
                        if (!resp.ok) continue;
                        const arrayBuf = await resp.arrayBuffer();
                        _buffers[key] = await ctx.decodeAudioData(arrayBuf);
                    } catch(e) {}
                }
            }
        }
    }
    loadMobCustomSounds();

    window.playMobSound = function(mobName, action, wx, wy, wz, vol=0.45, pitchMin=0.9, pitchMax=1.1) {
        let actualAction = action;
        let count = MOB_SOUNDS_DEF[mobName]?.[action] || 0;
        
        if (count === 0 && action === 'death') {
            actualAction = 'say';
            count = MOB_SOUNDS_DEF[mobName]?.['say'] || 0;
        }

        if (count === 0) return;
        const key = count === 1 ? `${mobName}_${actualAction}` : `${mobName}_${actualAction}_${Math.floor(Math.random() * count)}`;
        const buf = _buffers[key];
        if (!buf) return;
        _playSpatial(buf, vol, pitchMin, pitchMax, wx, wy, wz);
    };

    // =============================================
    // ITEM INTERACTION SOUNDS
    // =============================================
    window.playItemSound = function(volume = 0.35) {
        const buf = _buffers['plop'];
        if (!buf) return;
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.95 + Math.random() * 0.25;
        const gain = ctx.createGain();
        gain.gain.value = volume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(0);
    };

    // --- CAVE AMBIENCE ---
    const CAVE_SOUND_COUNT = 13;
    async function loadCaveSounds() {
        const ctx = getAudioCtx();
        for (let i = 1; i <= CAVE_SOUND_COUNT; i++) {
            const path = `sounds/cave${i}.ogg`;
            const key = `cave_${i}`;
            try {
                const resp = await vFetch(path);
                if (!resp.ok) continue;
                const arrayBuf = await resp.arrayBuffer();
                _buffers[key] = await ctx.decodeAudioData(arrayBuf);
            } catch(e) {}
        }
    }
    loadCaveSounds();

    window.playCaveAmbience = function() {
        if (typeof player === 'undefined' || !player) return;
        const id = Math.floor(Math.random() * CAVE_SOUND_COUNT) + 1;
        const key = `cave_${id}`;
        const angle = Math.random() * Math.PI * 2;
        const distance = 10 + Math.random() * 20; 
        const wx = player.x + Math.cos(angle) * distance;
        const wy = player.y + (Math.random() - 0.5) * 10;
        const wz = player.z + Math.sin(angle) * distance;

        if (typeof playNamedSoundAt === 'function') {
            playNamedSoundAt(key, 0.8, 0.9, 1.1, wx, wy, wz);
        }
    };

    window.playFlintAndSteelSound = function(wx, wy, wz) {
        playNamedSoundAt('flint_and_steel', 0.6, 0.9, 1.1, wx + 0.5, wy + 0.5, wz + 0.5);
    };

    window.playToolBreakSound = () => { if (_buffers['tool_break']) playNamedSound('tool_break', 0.6, 0.9, 1.1); };
    window.playBurpSound = () => { if (_buffers['burp']) playNamedSound('burp', 0.5, 0.9, 1.1); };
    window.playFlintAndSteelSound = (wx, wy, wz) => playNamedSoundAt('flint_and_steel', 0.6, 0.9, 1.1, wx + 0.5, wy + 0.5, wz + 0.5);

    window.playFuseSound = function(wx, wy, wz) {
        if (!_buffers['fuse']) return;
        playNamedSoundAt('fuse', 0.7, 0.9, 1.1, wx + 0.5, wy + 0.5, wz + 0.5);
    };

    window.playExplosionSound = function(wx, wy, wz) {
        const idx = Math.floor(Math.random() * 5);
        const key = 'explode_' + idx;
        if (!_buffers[key]) return;
        playNamedSoundAt(key, 0.8, 0.8, 1.0, wx, wy, wz);
    };

    window.playFizzSound = function(wx, wy, wz) {
        if (!_buffers['fizz']) return;
        playNamedSoundAt('fizz', 0.4, 0.8, 1.2, wx + 0.5, wy + 0.5, wz + 0.5);
    };

})();