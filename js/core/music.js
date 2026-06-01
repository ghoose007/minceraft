// ==========================================
// AMBIENT MUSIC MANAGER
// ==========================================
//
// Plays root /music tracks 0_ through 18_ inside worlds only.
// - randomized 0..18 playlist order
// - no immediate repeat between playlist cycles
// - next playlist is prepared while the final track is playing
// - 10 second fade-in and 10 second fade-out
// - stops/reset when returning to title

(function() {
    const TRACKS = [
        {
                "id": 0,
                "src": "music/0_Aria Math.mp3",
                "name": "0_Aria Math.mp3"
        },
        {
                "id": 1,
                "src": "music/1_Moog City 2.mp3",
                "name": "1_Moog City 2.mp3"
        },
        {
                "id": 2,
                "src": "music/2_Blind Spots.mp3",
                "name": "2_Blind Spots.mp3"
        },
        {
                "id": 3,
                "src": "music/3_Sweden.mp3",
                "name": "3_Sweden.mp3"
        },
        {
                "id": 4,
                "src": "music/4_Wet Hands.mp3",
                "name": "4_Wet Hands.mp3"
        },
        {
                "id": 5,
                "src": "music/5_Dry Hands.mp3",
                "name": "5_Dry Hands.mp3"
        },
        {
                "id": 6,
                "src": "music/6_Mice on Venus.mp3",
                "name": "6_Mice on Venus.mp3"
        },
        {
                "id": 7,
                "src": "music/7_Minecraft.mp3",
                "name": "7_Minecraft.mp3"
        },
        {
                "id": 8,
                "src": "music/8_Haggstrom.mp3",
                "name": "8_Haggstrom.mp3"
        },
        {
                "id": 9,
                "src": "music/9_Moog City.mp3",
                "name": "9_Moog City.mp3"
        },
        {
                "id": 10,
                "src": "music/10_Living Mice.mp3",
                "name": "10_Living Mice.mp3"
        },
        {
                "id": 11,
                "src": "music/11_Subwoofer Lullaby.mp3",
                "name": "11_Subwoofer Lullaby.mp3"
        },
        {
                "id": 12,
                "src": "music/12_Dreiton.mp3",
                "name": "12_Dreiton.mp3"
        },
        {
                "id": 13,
                "src": "music/13_Clark.mp3",
                "name": "13_Clark.mp3"
        },
        {
                "id": 14,
                "src": "music/14_Oxygène.mp3",
                "name": "14_Oxygène.mp3"
        },
        {
                "id": 15,
                "src": "music/15_Key.mp3",
                "name": "15_Key.mp3"
        },
        {
                "id": 16,
                "src": "music/16_Beginning.mp3",
                "name": "16_Beginning.mp3"
        },
        {
                "id": 17,
                "src": "music/17_Danny.mp3",
                "name": "17_Danny.mp3"
        },
        {
                "id": 18,
                "src": "music/18_Flake.mp3",
                "name": "18_Flake.mp3"
        }
];

    const FADE_IN_SECONDS = 10;
    const FADE_OUT_SECONDS = 10;
    // v379: Music has its own quieter base volume, then follows the global
    // Sound slider (`settingSoundVolume`) after that.
    const MUSIC_BASE_VOLUME = 0.30;
    // v380: Minecraft-style long silence between ambient tracks.
    // After a track ends, wait a random 2–8 minutes before starting the next one.
    const GAP_MIN_SECONDS = 2 * 60;
    const GAP_MAX_SECONDS = 8 * 60;

    let audio = null;
    let playlist = [];
    let nextPlaylist = null;
    let playlistIndex = 0;
    let lastPlayedId = null;
    let inWorld = false;
    let started = false;
    let startRequested = false;
    let fadeStartMs = 0;
    let fadingIn = false;
    let fadingOut = false;
    let fadeRaf = 0;
    let gapTimer = 0;
    let metadataReady = false;
    let unlocking = false;
    let unlockHandler = null;

    function _assetVersion() {
        return (typeof ASSET_VERSION !== 'undefined') ? ASSET_VERSION : Date.now();
    }

    function _trackUrl(track) {
        return encodeURI(track.src) + '?v=' + _assetVersion();
    }

    function _soundSliderVolume() {
        return (typeof settingSoundVolume !== 'undefined') ? Math.max(0, Math.min(1, settingSoundVolume)) : 1.0;
    }

    function _targetVolume() {
        return MUSIC_BASE_VOLUME * _soundSliderVolume();
    }

    function _shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function _makePlaylist(disallowFirstId) {
        let list = _shuffle(TRACKS);
        if (list.length > 1 && disallowFirstId !== undefined && disallowFirstId !== null && list[0].id === disallowFirstId) {
            const swapIdx = list.findIndex(t => t.id !== disallowFirstId);
            if (swapIdx > 0) {
                const t = list[0]; list[0] = list[swapIdx]; list[swapIdx] = t;
            }
        }
        return list;
    }

    function _ensureAudio() {
        if (audio) return audio;
        audio = new Audio();
        audio.preload = 'metadata';
        audio.loop = false;
        audio.volume = 0;
        audio.addEventListener('ended', _onTrackEnded);
        audio.addEventListener('loadedmetadata', function() {
            metadataReady = true;
        });
        audio.addEventListener('error', function() {
            console.warn('Ambient music failed:', audio && audio.src);
            _scheduleNext(2);
        });
        return audio;
    }

    function _clearTimers() {
        if (gapTimer) {
            clearTimeout(gapTimer);
            gapTimer = 0;
        }
        if (fadeRaf) {
            cancelAnimationFrame(fadeRaf);
            fadeRaf = 0;
        }
    }

    function _fadeLoop() {
        if (!audio || !inWorld || !started) {
            fadeRaf = 0;
            return;
        }

        const now = performance.now();

        if (fadingIn) {
            const t = Math.min(1, (now - fadeStartMs) / (FADE_IN_SECONDS * 1000));
            audio.volume = _targetVolume() * t;
            if (t >= 1) fadingIn = false;
        }

        if (metadataReady && isFinite(audio.duration) && audio.duration > 0) {
            const remaining = audio.duration - audio.currentTime;
            if (!fadingOut && remaining <= FADE_OUT_SECONDS) {
                fadingOut = true;
            }
            if (fadingOut) {
                const t = Math.max(0, Math.min(1, remaining / FADE_OUT_SECONDS));
                audio.volume = Math.min(audio.volume, _targetVolume() * t);
            }

            // Prepare the next shuffled 0..18 list while the final song of this
            // list is still playing, and prevent final->first immediate repeat.
            if (!nextPlaylist && playlistIndex >= playlist.length - 1 && remaining <= Math.max(FADE_OUT_SECONDS + 5, 15)) {
                const current = playlist[playlistIndex];
                nextPlaylist = _makePlaylist(current ? current.id : lastPlayedId);
            }
        }

        fadeRaf = requestAnimationFrame(_fadeLoop);
    }

    function _beginFadeIn() {
        if (!audio) return;
        audio.volume = 0;
        fadingIn = true;
        fadingOut = false;
        fadeStartMs = performance.now();
        if (!fadeRaf) fadeRaf = requestAnimationFrame(_fadeLoop);
    }

    function _installUnlockListeners() {
        if (unlocking) return;
        unlocking = true;
        unlockHandler = function() {
            if (!inWorld || started) {
                _removeUnlockListeners();
                return;
            }
            _playCurrent();
        };
        document.addEventListener('pointerdown', unlockHandler, true);
        document.addEventListener('keydown', unlockHandler, true);
        document.addEventListener('touchend', unlockHandler, true);
    }

    function _removeUnlockListeners() {
        if (!unlocking) return;
        unlocking = false;
        if (unlockHandler) {
            document.removeEventListener('pointerdown', unlockHandler, true);
            document.removeEventListener('keydown', unlockHandler, true);
            document.removeEventListener('touchend', unlockHandler, true);
            unlockHandler = null;
        }
    }

    function _playCurrent() {
        if (!inWorld || !startRequested) return;
        const a = _ensureAudio();

        if (!playlist.length) {
            playlist = _makePlaylist(lastPlayedId);
            playlistIndex = 0;
        }
        if (playlistIndex >= playlist.length) {
            playlist = nextPlaylist || _makePlaylist(lastPlayedId);
            nextPlaylist = null;
            playlistIndex = 0;
        }

        const track = playlist[playlistIndex];
        if (!track) return;

        metadataReady = false;
        fadingIn = false;
        fadingOut = false;
        a.pause();
        a.src = _trackUrl(track);
        a.currentTime = 0;
        a.volume = 0;

        const playPromise = a.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.then(function() {
                _removeUnlockListeners();
                started = true;
                lastPlayedId = track.id;
                _beginFadeIn();
            }).catch(function(err) {
                started = false;
                _installUnlockListeners();
                console.warn('Ambient music waiting for user interaction:', err && err.message ? err.message : err);
            });
        } else {
            started = true;
            lastPlayedId = track.id;
            _beginFadeIn();
        }
    }

    function _randomGapSeconds() {
        return GAP_MIN_SECONDS + Math.random() * (GAP_MAX_SECONDS - GAP_MIN_SECONDS);
    }

    function _scheduleNext(delaySeconds) {
        if (!inWorld || !startRequested) return;
        if (gapTimer) clearTimeout(gapTimer);
        const delay = Math.max(0, delaySeconds !== undefined ? delaySeconds : _randomGapSeconds());
        gapTimer = setTimeout(function() {
            gapTimer = 0;
            _playCurrent();
        }, delay * 1000);
    }

    function _onTrackEnded() {
        if (!inWorld) return;
        if (audio) audio.volume = 0;
        started = false;
        fadingIn = false;
        fadingOut = false;
        playlistIndex++;
        if (playlistIndex >= playlist.length) {
            playlist = nextPlaylist || _makePlaylist(lastPlayedId);
            nextPlaylist = null;
            playlistIndex = 0;
        }
        _scheduleNext();
    }

    function enterWorld() {
        if (inWorld) return;
        inWorld = true;
        startRequested = true;
        playlist = _makePlaylist(lastPlayedId);
        nextPlaylist = null;
        playlistIndex = 0;
        _ensureAudio();
        _playCurrent();
    }

    function stopForMenu() {
        inWorld = false;
        startRequested = false;
        started = false;
        playlist = [];
        nextPlaylist = null;
        playlistIndex = 0;
        fadingIn = false;
        fadingOut = false;
        _clearTimers();
        _removeUnlockListeners();
        if (audio) {
            try {
                audio.pause();
                audio.currentTime = 0;
                audio.removeAttribute('src');
                audio.load();
            } catch (e) {}
            audio.volume = 0;
        }
    }

    function unlockAndStart() {
        if (!inWorld) return;
        startRequested = true;
        if (!started) _playCurrent();
    }

    function updateVolumeFromSettings() {
        if (!audio || !inWorld || !started) return;
        if (fadingIn || fadingOut) return;
        audio.volume = _targetVolume();
    }

    window.MusicManager = {
        enterWorld,
        stopForMenu,
        unlockAndStart,
        updateVolumeFromSettings,
        isInWorld: function() { return inWorld; },
        getTracks: function() { return TRACKS.slice(); }
    };
})();
