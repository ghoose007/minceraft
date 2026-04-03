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

        var canvas = makeCanvas(text, scale, {color: color, shadow: true, shadowColor: shadowColor});
        if (canvas) {
            el.innerHTML = '';
            canvas.style.margin = '0 auto';
            canvas.style.display = 'block';
            el.appendChild(canvas);
            el.style.lineHeight = '0';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
        }
    }

    // Re-convert an element when its text changes
    function updateEl(el, newText, color, scale) {
        if (!ready || !el) return;
        el.setAttribute('data-mc-text', newText);
        el.innerHTML = '';
        
        var style = window.getComputedStyle(el);
        var fs = parseFloat(style.fontSize) || 14;
        var sc = scale || Math.max(1, Math.round(fs / 8));
        var c = color || style.color || '#ffffff';
        if (c.indexOf('rgb') === 0) { var m = c.match(/\d+/g); if (m) c = '#'+((1<<24)+(+m[0]<<16)+(+m[1]<<8)+(+m[2])).toString(16).slice(1); }
        
        var canvas = makeCanvas(newText, sc, {color: c, shadow: true});
        if (canvas) {
            canvas.style.margin = '0 auto';
            canvas.style.display = 'block';
            el.appendChild(canvas);
            el.style.lineHeight = '0';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
        }
    }

    function applyToAll() {
        if (!ready) return;
        // All static text elements
        var selectors = [
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

    // Watch for DOM changes
    var _debounce = null;
    var observer = new MutationObserver(function() {
        if (_debounce) clearTimeout(_debounce);
        _debounce = setTimeout(function() {
            if (!ready) return;
            // Convert any new .item-count elements
            var counts = document.querySelectorAll('.item-count');
            for (var i = 0; i < counts.length; i++) {
                var el = counts[i];
                var text = el.textContent.trim();
                if (!text || el.querySelector('canvas')) continue;
                convertEl(el);
            }
        }, 16);
    });

    function startObserving() {
        if (!ready) { setTimeout(startObserving, 200); return; }
        observer.observe(document.body, { childList: true, subtree: true });
        applyToAll();
    }

    // Intercept innerText/textContent on buttons to re-render
    var origDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText');
    if (origDesc && origDesc.set) {
        Object.defineProperty(HTMLElement.prototype, 'innerText', {
            set: function(val) {
                origDesc.set.call(this, val);
                // If this is a mc-button, re-convert with the new text
                if (ready && this.classList && this.classList.contains('mc-button')) {
                    // Clear cached text so convertEl reads fresh textContent
                    this.removeAttribute('data-mc-text');
                    var self = this;
                    setTimeout(function() { convertEl(self); }, 0);
                }
            },
            get: function() { 
                var stored = this.getAttribute('data-mc-text');
                if (stored) return stored;
                return origDesc.get.call(this); 
            }
        });
    }

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
