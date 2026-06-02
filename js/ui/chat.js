(function() {
    const CHAT_VISIBLE_MS = 20000;
    const MAX_VISIBLE_MESSAGES = 10;
    const CHAT_SCALE = 2;
    const CHAT_WIDTH = 640;
    const CHAT_LINE_HEIGHT = 20;
    const HISTORY_MAX = 256;

    let root = null;
    let historyEl = null;
    let inputBar = null;
    let inputCanvas = null;
    let inputCtx = null;

    let messages = [];
    let isOpen = false;
    let inputText = '';
    let scrollOffset = 0;
    let lastActivityTime = 0;
    let caretOn = true;
    let lastCaretToggle = 0;
    let hideTimer = null;
    let historyDirty = true;
    let lastHistoryVisible = null;
    let lastHistorySignature = '';
    let autocompleteSuffix = '';
    let sentHistory = [];
    let sentHistoryIndex = -1;

    function _inWorld() {
        return typeof uiState !== 'undefined' && uiState === 'PLAYING';
    }

    function _ensure() {
        if (root) return;

        root = document.createElement('div');
        root.id = 'mc-chat';
        root.setAttribute('data-no-mc-font', 'true');
        root.innerHTML = `
            <div id="mc-chat-history" data-no-mc-font="true"></div>
            <div id="mc-chat-input" data-no-mc-font="true">
                <canvas id="mc-chat-input-canvas" data-no-mc-font="true"></canvas>
            </div>
        `;
        document.body.appendChild(root);
        historyEl = document.getElementById('mc-chat-history');
        inputBar = document.getElementById('mc-chat-input');
        inputCanvas = document.getElementById('mc-chat-input-canvas');
        inputCtx = inputCanvas.getContext('2d');
        inputCanvas.style.imageRendering = 'pixelated';

        root.addEventListener('wheel', function(e) {
            if (!isOpen) return;
            e.preventDefault();
            const dir = e.deltaY > 0 ? -1 : 1;
            const maxScroll = Math.max(0, messages.length - MAX_VISIBLE_MESSAGES);
            scrollOffset = Math.max(0, Math.min(maxScroll, scrollOffset + dir));
            historyDirty = true;
            _renderHistory(true);
        }, { passive: false });

        _renderHistory(false);
        _renderInput();
    }

    function _wrapText(text, maxWidthPx) {
        const font = window.mcFont;
        const scale = CHAT_SCALE;
        if (!font || !font.isReady || !font.isReady()) return [String(text || '')];

        const words = String(text || '').split(' ');
        const lines = [];
        let line = '';

        const fits = (s) => font.measure(s, scale) <= maxWidthPx;

        for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (fits(test)) {
                line = test;
                continue;
            }

            if (line) lines.push(line);

            if (fits(word)) {
                line = word;
            } else {
                let chunk = '';
                for (const ch of word) {
                    if (fits(chunk + ch)) {
                        chunk += ch;
                    } else {
                        if (chunk) lines.push(chunk);
                        chunk = ch;
                    }
                }
                line = chunk;
            }
        }

        if (line) lines.push(line);
        return lines.length ? lines : [''];
    }

    function _mcDrawTextIntoLine(text, className) {
        const line = document.createElement('div');
        line.className = className || 'mc-chat-line';
        line.setAttribute('data-no-mc-font', 'true');

        const canvas = document.createElement('canvas');
        canvas.setAttribute('data-no-mc-font', 'true');
        canvas.style.imageRendering = 'pixelated';

        const font = window.mcFont;
        const scale = CHAT_SCALE;
        const maxTextWidth = CHAT_WIDTH - 12;
        const wrapped = _wrapText(text, maxTextWidth);
        const width = CHAT_WIDTH;
        const height = Math.max(CHAT_LINE_HEIGHT, wrapped.length * CHAT_LINE_HEIGHT + 4);

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        if (font && font.isReady && font.isReady()) {
            for (let i = 0; i < wrapped.length; i++) {
                font.draw(ctx, wrapped[i], 0, 2 + i * CHAT_LINE_HEIGHT, scale, { color: '#ffffff', shadow: true, shadowColor: '#3f3f3f' });
            }
        }

        line.appendChild(canvas);
        return line;
    }

    function _visibleMessages() {
        const total = messages.length;
        const visibleCount = Math.min(MAX_VISIBLE_MESSAGES, total);
        const maxScroll = Math.max(0, total - visibleCount);
        if (!isOpen) scrollOffset = 0;
        scrollOffset = Math.max(0, Math.min(maxScroll, scrollOffset));

        const end = total - scrollOffset;
        const start = Math.max(0, end - visibleCount);
        return messages.slice(start, end);
    }

    function _renderHistory(forceShown) {
        _ensure();

        const now = performance.now();
        const visible = isOpen || forceShown || (lastActivityTime > 0 && now - lastActivityTime < CHAT_VISIBLE_MS);

        root.classList.toggle('mc-chat-open', isOpen);
        root.classList.toggle('mc-chat-hidden', !visible);

        const lines = visible ? _visibleMessages() : [];
        const signature = [
            visible ? '1' : '0',
            isOpen ? '1' : '0',
            scrollOffset,
            messages.length,
            lines.map(m => m.text).join('\n')
        ].join('|');

        // v396: Do not rebuild bitmap-font chat canvases every animation frame.
        // Sent messages stay visible for 20 seconds, but the DOM/canvas rows only
        // rebuild when the visible state, scroll offset, or message list changes.
        if (!historyDirty && lastHistoryVisible === visible && lastHistorySignature === signature) return;

        historyDirty = false;
        lastHistoryVisible = visible;
        lastHistorySignature = signature;
        historyEl.innerHTML = '';

        if (!visible) return;

        for (const msg of lines) {
            historyEl.appendChild(_mcDrawTextIntoLine(msg.text, 'mc-chat-line'));
        }

        if (isOpen && messages.length > MAX_VISIBLE_MESSAGES) {
            const maxScroll = Math.max(0, messages.length - MAX_VISIBLE_MESSAGES);
            const indicator = document.createElement('div');
            indicator.className = 'mc-chat-scroll-indicator';
            indicator.setAttribute('data-no-mc-font', 'true');
            const info = 'Scroll: ' + (maxScroll - scrollOffset) + '/' + maxScroll;
            indicator.appendChild(_mcDrawTextIntoLine(info, 'mc-chat-line mc-chat-scroll-text'));
            historyEl.insertBefore(indicator, historyEl.firstChild);
        }
    }

    function _pushSystemMessage(text) {
        messages.push({ text: String(text), time: performance.now() });
        if (messages.length > HISTORY_MAX) messages.splice(0, messages.length - HISTORY_MAX);
        lastActivityTime = performance.now();
        historyDirty = true;
        _scheduleHistoryHide();
        _renderHistory(true);
    }

    function _tokenizeCommand(text) {
        const out = [];
        const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let m;
        while ((m = re.exec(text)) !== null) out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
        return out;
    }

    function _formatCommandList() {
        return [
            '/gamemode Survival',
            '/gamemode Creative',
            '/time set Day',
            '/time set Night',
            '/time set 0000-2400',
            '/give ID amount',
            '/help'
        ];
    }

    function _setGameModeCommand(modeRaw) {
        const mode = String(modeRaw || '').toLowerCase();
        if (mode !== 'survival' && mode !== 'creative') {
            _pushSystemMessage('Usage: /gamemode Survival|Creative');
            return;
        }

        gameMode = mode;
        if (gameMode === 'survival' && player && player.flying) {
            player.flying = false;
            player.vy = 0;
        }

        if (typeof window.forceRefreshSurvivalHUD === 'function') window.forceRefreshSurvivalHUD();
        else {
            if (typeof updateHealthUI === 'function') updateHealthUI();
            if (typeof updateHungerUI === 'function') updateHungerUI();
            if (typeof updateArmorBar === 'function') updateArmorBar();
            if (typeof updateXPBarUI === 'function') updateXPBarUI();
        }
        if (typeof window.updateMobileEatBtnVisibility === 'function') window.updateMobileEatBtnVisibility();
        if (typeof buildUI === 'function') buildUI();
        if (typeof selectSlot === 'function' && typeof activeSlot !== 'undefined') selectSlot(activeSlot);

        _pushSystemMessage('Set own game mode to ' + (mode === 'creative' ? 'Creative' : 'Survival') + ' Mode');
    }

    function _parseClockArg(raw) {
        const s = String(raw || '').trim().toLowerCase();
        if (s === 'day') return 900;
        if (s === 'night') return 2100;
        if (!/^\d{1,4}$/.test(s)) return null;
        const n = parseInt(s, 10);
        if (n < 0 || n > 2400) return null;
        const mins = n % 100;
        if (mins >= 60) return null;
        return n;
    }

    function _setTimeCommand(raw) {
        const clock = _parseClockArg(raw);
        if (clock === null) {
            _pushSystemMessage('Usage: /time set Day|Night|0000-2400');
            return;
        }

        const normalized = clock === 2400 ? 0 : clock;
        if (typeof TOTAL_TIME !== 'undefined') {
            // v428: Convert 24-hour clock time to the renderer's solar curve.
            // Render loop uses t=0 noon, t=.25 sunset, t=.5 midnight, t=.75 sunrise.
            const hours = Math.floor(normalized / 100);
            const mins = normalized % 100;
            const minuteOfDay = hours * 60 + mins;
            let solarT = ((minuteOfDay - 720) / 1440) % 1; // 1200 -> noon
            if (solarT < 0) solarT += 1;

            if (typeof DAY_TIME !== 'undefined' && typeof NIGHT_TIME !== 'undefined') {
                if (solarT < 0.25) {
                    globalTime = (solarT / 0.25) * (DAY_TIME / 2);
                } else if (solarT < 0.75) {
                    globalTime = (DAY_TIME / 2) + ((solarT - 0.25) / 0.5) * NIGHT_TIME;
                } else {
                    globalTime = (DAY_TIME / 2) + NIGHT_TIME + ((solarT - 0.75) / 0.25) * (DAY_TIME / 2);
                }
            } else {
                globalTime = solarT * TOTAL_TIME;
            }
            globalTime = ((globalTime % TOTAL_TIME) + TOTAL_TIME) % TOTAL_TIME;
        }

        const label = String(normalized).padStart(4, '0');
        _pushSystemMessage('Set the time to ' + label);
    }

    function _giveCommand(idRaw, amountRaw) {
        const id = parseInt(String(idRaw || ''), 10);
        if (!Number.isFinite(id) || id < 0) {
            _pushSystemMessage('Usage: /give ID amount');
            return;
        }

        const exists = (typeof BLOCK_DATA !== 'undefined' && BLOCK_DATA[id]) ||
                       (typeof ITEM_DATA !== 'undefined' && ITEM_DATA[id]) ||
                       (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id]);
        if (!exists) {
            _pushSystemMessage('No item with ID ' + id);
            return;
        }

        let amount = amountRaw === undefined ? 1 : parseInt(String(amountRaw), 10);
        if (!Number.isFinite(amount) || amount <= 0) amount = 1;
        amount = Math.min(999, Math.floor(amount));

        let leftover = amount;
        if (typeof window.addToInventory === 'function') {
            leftover = window.addToInventory(id, amount);
        }
        const given = amount - (leftover || 0);
        if (given > 0) {
            const name = (typeof BLOCK_DATA !== 'undefined' && BLOCK_DATA[id] && BLOCK_DATA[id].name) ||
                         (typeof ITEM_DATA !== 'undefined' && ITEM_DATA[id] && ITEM_DATA[id].name) ||
                         (typeof TOOL_DATA !== 'undefined' && TOOL_DATA[id] && TOOL_DATA[id].name) ||
                         ('ID ' + id);
            _pushSystemMessage('Gave Steve ' + given + 'x ' + name + ' (' + id + ')');
            if (leftover > 0) _pushSystemMessage('Inventory full: ' + leftover + ' item(s) could not fit');
        } else {
            _pushSystemMessage('Inventory full');
        }
    }

    function _executeCommand(raw) {
        const parts = _tokenizeCommand(raw);
        const cmd = (parts[0] || '').toLowerCase();

        if (cmd === '/help') {
            const list = _formatCommandList();
            _pushSystemMessage('Commands:');
            for (const line of list) _pushSystemMessage(line);
            return true;
        }

        if (cmd === '/gamemode') {
            _setGameModeCommand(parts[1]);
            return true;
        }

        if (cmd === '/time') {
            if ((parts[1] || '').toLowerCase() !== 'set') {
                _pushSystemMessage('Usage: /time set Day|Night|0000-2400');
                return true;
            }
            _setTimeCommand(parts[2]);
            return true;
        }

        if (cmd === '/give') {
            _giveCommand(parts[1], parts[2]);
            return true;
        }

        _pushSystemMessage('Unknown command. Type /help for help.');
        return true;
    }

    function _currentCommandCompletion() {
        if (!inputText || inputText.charAt(0) !== '/') return null;

        const beforeCursor = inputText;
        const lastSpace = beforeCursor.lastIndexOf(' ');
        const tokenStart = lastSpace + 1;
        const current = beforeCursor.slice(tokenStart);
        const parts = beforeCursor.slice(0, tokenStart).trim().split(/\s+/).filter(Boolean);
        const cmd = (parts[0] || '').toLowerCase();

        let choices = [];
        if (tokenStart === 0) {
            choices = ['/gamemode', '/time', '/give', '/help'];
        } else if (cmd === '/gamemode' && parts.length === 1) {
            choices = ['Survival', 'Creative'];
        } else if (cmd === '/time' && parts.length === 1) {
            choices = ['set'];
        } else if (cmd === '/time' && parts.length === 2 && (parts[1] || '').toLowerCase() === 'set') {
            choices = ['Day', 'Night'];
        }

        if (!choices.length) return null;
        const lower = current.toLowerCase();
        const match = choices.find(c => c.toLowerCase().startsWith(lower) && c.length > current.length);
        if (!match) return null;
        return { tokenStart, current, match, suffix: match.slice(current.length) };
    }

    function _applyAutocomplete() {
        const comp = _currentCommandCompletion();
        if (!comp) return false;
        inputText = inputText.slice(0, comp.tokenStart) + comp.match;
        autocompleteSuffix = '';
        caretOn = true;
        lastCaretToggle = performance.now();
        _renderInput();
        return true;
    }

    function _renderInput() {
        _ensure();
        inputBar.style.display = isOpen ? 'block' : 'none';
        if (!isOpen) return;

        const font = window.mcFont;
        const scale = CHAT_SCALE;
        const w = CHAT_WIDTH;
        const h = 12 * scale;
        if (inputCanvas.width !== w) inputCanvas.width = w;
        if (inputCanvas.height !== h) inputCanvas.height = h;

        inputCtx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
        inputCtx.imageSmoothingEnabled = false;
        if (font && font.isReady && font.isReady()) {
            const comp = _currentCommandCompletion();
            autocompleteSuffix = comp ? comp.suffix : '';
            const baseX = 4, baseY = 4;
            font.draw(inputCtx, inputText, baseX, baseY, scale, { color: '#ffffff', shadow: true, shadowColor: '#3f3f3f' });

            let cursorX = baseX + font.measure(inputText, scale);
            if (autocompleteSuffix) {
                // v401: static grey autocomplete, no pulsing.
                font.draw(inputCtx, autocompleteSuffix, cursorX, baseY, scale, { color: '#808080', shadow: true, shadowColor: '#202020' });
                cursorX += font.measure(autocompleteSuffix, scale);
            }

            font.draw(inputCtx, caretOn ? '_' : ' ', cursorX, baseY, scale, { color: '#ffffff', shadow: true, shadowColor: '#3f3f3f' });
        }
    }

    function _scheduleHistoryHide() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        hideTimer = setTimeout(function() {
            historyDirty = true;
            _renderHistory(false);
        }, CHAT_VISIBLE_MS + 50);
    }

    function openChat(startText) {
        if (!_inWorld()) return;
        _ensure();
        isOpen = true;
        historyDirty = true;
        inputText = (typeof startText === 'string') ? startText : '';
        scrollOffset = 0;
        caretOn = true;
        lastCaretToggle = performance.now();
        // Opening old chat history should not restart the post-close fade timer.
        // Only newly sent messages refresh lastActivityTime.
        window._chatSuppressNextPause = true;
        try { if (document.pointerLockElement) document.exitPointerLock(); } catch (_) {}
        if (typeof uiState !== 'undefined') uiState = 'PLAYING';
        _renderHistory(true);
        _renderInput();
    }

    function closeChat() {
        if (!isOpen) return;
        isOpen = false;
        historyDirty = true;
        inputText = '';
        scrollOffset = 0;
        _renderHistory(false);
        _renderInput();
        try {
            if (_inWorld() && document.body && document.body.requestPointerLock) document.body.requestPointerLock();
        } catch (_) {}
    }

    function sendChat() {
        const trimmed = inputText.trim();
        if (trimmed.length > 0) {
            sentHistory.push(trimmed);
            if (sentHistory.length > 50) sentHistory.shift();
            sentHistoryIndex = sentHistory.length;
            if (trimmed.charAt(0) === '/') {
                _executeCommand(trimmed);
            } else {
                messages.push({ text: '<Steve> ' + trimmed, time: performance.now() });
                if (messages.length > HISTORY_MAX) messages.splice(0, messages.length - HISTORY_MAX);
                lastActivityTime = performance.now();
                historyDirty = true;
                _scheduleHistoryHide();
            }
        }
        closeChat();
    }

    function resetChat() {
        messages = [];
        inputText = '';
        scrollOffset = 0;
        sentHistory = [];
        sentHistoryIndex = -1;
        isOpen = false;
        lastActivityTime = 0;
        historyDirty = true;
        lastHistoryVisible = null;
        lastHistorySignature = '';
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        _ensure();
        _renderHistory(false);
        _renderInput();
    }

    function handleKeyDown(e) {
        if (!_inWorld() && !isOpen) return false;

        if (!isOpen) {
            if (e.code === 'Slash' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                openChat('/');
                return true;
            }
            if (e.code === 'KeyT' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                e.stopPropagation();
                openChat();
                return true;
            }
            return false;
        }

        e.preventDefault();
        e.stopPropagation();

        if (e.code === 'Escape') {
            closeChat();
            return true;
        }
        if (e.code === 'Tab') {
            _applyAutocomplete();
            return true;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            sendChat();
            return true;
        }
        if (e.code === 'Backspace') {
            inputText = inputText.slice(0, -1);
            _renderInput();
            return true;
        }
        if (e.code === 'Delete') {
            inputText = '';
            _renderInput();
            return true;
        }
        if (e.code === 'ArrowUp') {
            if (sentHistory.length > 0) {
                sentHistoryIndex = Math.max(0, sentHistoryIndex < 0 ? sentHistory.length - 1 : sentHistoryIndex - 1);
                inputText = sentHistory[sentHistoryIndex] || '';
                caretOn = true;
                lastCaretToggle = performance.now();
                _renderInput();
            }
            return true;
        }
        if (e.code === 'ArrowDown') {
            if (sentHistory.length > 0 && sentHistoryIndex >= 0) {
                sentHistoryIndex++;
                if (sentHistoryIndex >= sentHistory.length) {
                    sentHistoryIndex = sentHistory.length;
                    inputText = '';
                } else {
                    inputText = sentHistory[sentHistoryIndex] || '';
                }
                caretOn = true;
                lastCaretToggle = performance.now();
                _renderInput();
            }
            return true;
        }
        if (e.code === 'PageUp') {
            const maxScroll = Math.max(0, messages.length - MAX_VISIBLE_MESSAGES);
            scrollOffset = Math.min(maxScroll, scrollOffset + MAX_VISIBLE_MESSAGES);
            historyDirty = true;
            _renderHistory(true);
            return true;
        }
        if (e.code === 'PageDown') {
            scrollOffset = Math.max(0, scrollOffset - MAX_VISIBLE_MESSAGES);
            historyDirty = true;
            _renderHistory(true);
            return true;
        }

        if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (inputText.length < 256) {
                inputText += e.key;
                caretOn = true;
                lastCaretToggle = performance.now();
                _renderInput();
            }
            return true;
        }
        return true;
    }

    function handleKeyUp(e) {
        if (!isOpen) return false;
        e.preventDefault();
        e.stopPropagation();
        return true;
    }

    function handleMouseMove(e) {
        if (!isOpen) return false;
        e.preventDefault();
        e.stopPropagation();
        return true;
    }

    function tick() {
        _ensure();
        const now = performance.now();
        if (isOpen) {
            if (now - lastCaretToggle > 500) {
                caretOn = !caretOn;
                lastCaretToggle = now;
            }
            _renderInput();
        }
        // v396: history hiding is handled by _scheduleHistoryHide().
        // Do not rebuild chat history every frame while the 20 second timer is active.
        requestAnimationFrame(tick);
    }

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('resize', function() {
        if (isOpen) _renderInput();
    });

    window.MinecraftChat = {
        open: openChat,
        close: closeChat,
        reset: resetChat,
        isOpen: function() { return isOpen; },
        handleKeyDown: handleKeyDown,
        handleKeyUp: handleKeyUp,
        handleMouseMove: handleMouseMove
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            _ensure();
            requestAnimationFrame(tick);
        });
    } else {
        _ensure();
        requestAnimationFrame(tick);
    }
})();
