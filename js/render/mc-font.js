(function() {
    var fontImg = null;
    var ready = false;
    var charWidths = {};
    var _tmpCanvas = null;

    function load() {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        var v = typeof ASSET_VERSION !== 'undefined' ? '?v=' + ASSET_VERSION : '';
        img.onload = function() {
            fontImg = img;
            var c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            var ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            var data = ctx.getImageData(0, 0, 128, 128).data;
            for (var code = 0; code < 256; code++) {
                var col = code % 16, row = Math.floor(code / 16);
                var mx = 0, has = false;
                for (var py = 0; py < 8; py++) {
                    for (var px = 0; px < 8; px++) {
                        var i = ((row*8+py)*128 + (col*8+px)) * 4;
                        if (data[i+3] > 10) { has = true; mx = Math.max(mx, px+1); }
                    }
                }
                charWidths[code] = has ? mx + 1 : 4;
            }
            charWidths[32] = 4;
            ready = true;
            setTimeout(applyToAll, 50);
        };
        img.src = 'textures/minecraft_font.png' + v;
    }

    function getTmp() {
        if (!_tmpCanvas) { _tmpCanvas = document.createElement('canvas'); _tmpCanvas.width = 8; _tmpCanvas.height = 8; }
        return _tmpCanvas;
    }

    function measure(text, scale) {
        if (!scale) scale = 1;
        var w = 0;
        for (var i = 0; i < text.length; i++) w += (charWidths[text.charCodeAt(i)] || 6) * scale;
        return w;
    }

    function draw(ctx, text, x, y, scale, options) {
        if (!ready || !fontImg) return;
        if (!scale) scale = 1;
        var opt = options || {};
        var shadow = opt.shadow !== false;
        var off = Math.max(1, Math.floor(scale * 0.8));
        ctx.imageSmoothingEnabled = false;
        if (shadow) _drawRaw(ctx, text, x + off, y + off, scale, opt.shadowColor || '#3f3f3f');
        _drawRaw(ctx, text, x, y, scale, opt.color || '#ffffff');
    }

    function _drawRaw(ctx, text, x, y, scale, color) {
        var cx = x, cs = 8 * scale;
        for (var i = 0; i < text.length; i++) {
            var code = text.charCodeAt(i);
            if (code === 32) { cx += (charWidths[32] || 4) * scale; continue; }
            if (code < 0 || code > 255) { cx += 4 * scale; continue; }
            var col = code % 16, row = Math.floor(code / 16);
            var tmp = getTmp(); var tc = tmp.getContext('2d');
            tc.clearRect(0, 0, 8, 8);
            tc.imageSmoothingEnabled = false;
            tc.globalCompositeOperation = 'source-over';
            tc.drawImage(fontImg, col*8, row*8, 8, 8, 0, 0, 8, 8);
            tc.globalCompositeOperation = 'source-in';
            tc.fillStyle = color;
            tc.fillRect(0, 0, 8, 8);
            tc.globalCompositeOperation = 'source-over';
            ctx.drawImage(tmp, 0, 0, 8, 8, Math.floor(cx), Math.floor(y), cs, cs);
            cx += (charWidths[code] || 6) * scale;
        }
    }

    function makeCanvas(text, scale, options) {
        if (!ready || !text) return null;
        if (!scale) scale = 2;
        var opt = options || {};
        var shadow = opt.shadow !== false;
        var off = Math.max(1, Math.floor(scale * 0.8));
        var w = measure(text, scale) + (shadow ? off : 0) + 2;
        var h = 8 * scale + (shadow ? off : 0) + 2;
        var c = document.createElement('canvas');
        c.width = Math.ceil(w); c.height = Math.ceil(h);
        c.style.imageRendering = 'pixelated';
        c.style.display = 'inline-block';
        c.style.verticalAlign = 'middle';
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        draw(ctx, text, 0, 0, scale, opt);
        return c;
    }


    function _renderTextCanvasInto(el, text, scale, options) {
        var opt = options || {};
        var shadow = opt.shadow !== false;
        var off = Math.max(1, Math.floor(scale * 0.8));
        var w = Math.ceil(measure(text, scale) + (shadow ? off : 0) + 2);
        var h = Math.ceil(8 * scale + (shadow ? off : 0) + 2);
        var canvas = el.querySelector ? el.querySelector('canvas') : null;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.style.margin = '0 auto';
            canvas.style.display = 'block';
            canvas.style.imageRendering = 'pixelated';
            canvas.style.verticalAlign = 'middle';
            el.innerHTML = '';
            el.appendChild(canvas);
        }
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        draw(ctx, text, 0, 0, scale, opt);
        el.style.lineHeight = '0';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        return canvas;
    }

    // Convert a DOM element's text to bitmap canvas
    function convertEl(el, forceColor, forceScale) {
        if (!ready || !el) return;
        var text = el.getAttribute('data-mc-text') || el.textContent.trim();
        if (!text) return;
        // Don't re-convert if already has canvas with same text
        var existing = el.querySelector('canvas');
        if (existing && el.getAttribute('data-mc-text') === text) return;
        el.setAttribute('data-mc-text', text);

        var style = window.getComputedStyle(el);
        var fs = parseFloat(style.fontSize) || 14;
        var scale = forceScale || Math.max(1, Math.round(fs / 8));
        
        // Detect color
        var color = forceColor || style.color || '#ffffff';
        if (color.indexOf('rgb') === 0) {
            var m = color.match(/\d+/g);
            if (m) color = '#' + ((1<<24)+(+m[0]<<16)+(+m[1]<<8)+(+m[2])).toString(16).slice(1);
        }
        
        var shadowColor = '#3f3f3f';
        var ts = style.textShadow;
        if (ts && ts !== 'none') {
            var sm = ts.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (sm) shadowColor = '#' + ((1<<24)+(+sm[1]<<16)+(+sm[2]<<8)+(+sm[3])).toString(16).slice(1);
        }

        _renderTextCanvasInto(el, text, scale, {color: color, shadow: true, shadowColor: shadowColor});
    }

    // Re-convert an element when its text changes
    function updateEl(el, newText, color, scale) {
        if (!ready || !el) return;
        el.setAttribute('data-mc-text', newText);
        
        var style = window.getComputedStyle(el);
        var fs = parseFloat(style.fontSize) || 14;
        var sc = scale || Math.max(1, Math.round(fs / 8));
        var c = color || style.color || '#ffffff';
        if (c.indexOf('rgb') === 0) { var m = c.match(/\d+/g); if (m) c = '#'+((1<<24)+(+m[0]<<16)+(+m[1]<<8)+(+m[2])).toString(16).slice(1); }
        
        _renderTextCanvasInto(el, newText, sc, {color: c, shadow: true});
    }


    function shouldConvertEl(el) {
        if (!el || !el.classList) return false;
        if (el.hasAttribute && el.hasAttribute('data-no-mc-font')) return false;
        if (el.classList.contains('mc-button')) return true;
        if (el.classList.contains('mc-setting-label')) return true;
        if (el.classList.contains('mc-slider-val')) return true;
        if (el.classList.contains('mc-create-title')) return true;
        if (el.classList.contains('mc-version')) return true;
        if (el.classList.contains('mc-copyright')) return true;
        if (el.classList.contains('item-count')) return true;
        if (el.classList.contains('menu-title')) return true;
        if (el.classList.contains('death-btn')) return true;
        if (el.classList.contains('loading-subtitle')) return true;
        var id = el.id || '';
        if (id === 'loading-title' || id === 'loading-status' || id === 'action-text' ||
            id === 'xp-level-text' || id === 'camera-mode-text' || id === 'splash-text') return true;
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'button') return true;
        if (tag === 'h1' || tag === 'h2' || tag === 'h3') return true;
        if (el.closest) {
            if (el.closest('#pause-main, #options-menu, #video-settings-menu, #controls-menu, #death-screen')) {
                if (tag === 'h1' || tag === 'h2' || el.classList.contains('mc-button')) return true;
            }
        }
        return false;
    }

    function convertIfNeeded(el, explicitText) {
        if (!ready || !el || !shouldConvertEl(el)) return;
        var text = explicitText;
        if (text === undefined || text === null) {
            text = el.getAttribute('data-mc-text') || el.textContent.trim();
        }
        text = String(text).trim();
        if (!text) return;
        var existing = el.querySelector ? el.querySelector('canvas') : null;
        if (existing && el.getAttribute('data-mc-text') === text) return;
        updateEl(el, text);
    }

    function applyToAll() {
        if (!ready) return;
        // All static text elements
        var selectors = [
            'button',
            '.mc-button',
            '.mc-setting-label', 
            '.mc-slider-val',
            '.mc-create-title',
            '.mc-version',
            '.mc-copyright',
            '#loading-title',
            '.loading-subtitle',
            '#loading-status',
            '#action-text',
            '.item-count',
            '#xp-level-text',
            '.menu-title',
            'h2',
            '.death-btn',
            '#death-screen h1',
            '#death-screen .death-score',
            '.mc-input',
            '.mc-splash',
            '#pause-main .mc-button',
            '#options-menu .mc-button',
            '#video-settings-menu .mc-button',
            '#controls-menu .mc-button',
        ];
        var els = document.querySelectorAll(selectors.join(','));
        for (var i = 0; i < els.length; i++) {
            convertEl(els[i]);
        }
        
        // Splash text - yellow with rotation preserved
        var splash = document.getElementById('splash-text');
        if (splash) {
            convertEl(splash, '#ffff00', 3);
        }
        
        // Death screen title - red
        var deathTitle = document.querySelector('#death-screen h1');
        if (deathTitle) convertEl(deathTitle, '#ff0000', 4);
        
        // h2 titles in pause menu etc
        var h2s = document.querySelectorAll('h2');
        for (var h = 0; h < h2s.length; h++) convertEl(h2s[h]);
        
        // Camera mode text
        var camText = document.getElementById('camera-mode-text');
        if (camText && camText.textContent.trim()) convertEl(camText);
    }

    // Watch for DOM/text changes. Dynamic UI updates usually set textContent,
    // which replaces the old bitmap canvas with normal DOM text. Re-convert
    // every relevant UI element back through minecraft_font.png immediately.
    var _debounce = null;
    var observer = new MutationObserver(function(mutations) {
        if (_debounce) clearTimeout(_debounce);
        _debounce = setTimeout(function() {
            if (!ready) return;
            for (var m = 0; m < mutations.length; m++) {
                var target = mutations[m].target;
                if (target && target.nodeType === 1) convertIfNeeded(target);
                if (target && target.parentElement) convertIfNeeded(target.parentElement);
            }
            applyToAll();
        }, 16);
    });

    function startObserving() {
        if (!ready) { setTimeout(startObserving, 200); return; }
        observer.observe(document.body, { childList: true, subtree: true });
        applyToAll();
    }

    // Intercept textContent/innerText on bitmap-text UI so updates never show
    // browser-rendered fallback text. The element is immediately rebuilt as a
    // canvas drawn from textures/minecraft_font.png.
    function installTextSetterHook(propName) {
        var proto = Node.prototype;
        var desc = Object.getOwnPropertyDescriptor(proto, propName);
        if (!desc || !desc.set) {
            proto = HTMLElement.prototype;
            desc = Object.getOwnPropertyDescriptor(proto, propName);
        }
        if (!desc || !desc.set || !desc.get) return;

        try {
            Object.defineProperty(proto, propName, {
                set: function(val) {
                    desc.set.call(this, val);
                    if (ready && this.nodeType === 1 && shouldConvertEl(this)) {
                        convertIfNeeded(this, val);
                    }
                },
                get: function() {
                    if (this.nodeType === 1 && shouldConvertEl(this)) {
                        var stored = this.getAttribute && this.getAttribute('data-mc-text');
                        if (stored) return stored;
                    }
                    return desc.get.call(this);
                },
                configurable: true
            });
        } catch (_) {}
    }
    installTextSetterHook('textContent');
    installTextSetterHook('innerText');

    window.mcFont = {
        draw: draw,
        measure: measure,
        makeCanvas: makeCanvas,
        isReady: function() { return ready; },
        applyToAll: applyToAll,
        convertEl: convertEl,
        updateEl: updateEl,
        getImage: function() { return fontImg; },
        charWidth: function(c) { return charWidths[c] || 6; }
    };

    load();
    if (document.readyState === 'complete') startObserving();
    else window.addEventListener('load', startObserving);
})();
