// ==========================================
// DEVICE SELECTION PROMPT
// ==========================================
// This script MUST load early and outside any IIFE.
// Shows a Minecraft-styled prompt asking mobile vs desktop.

(function() {
    function showPrompt() {
        var overlay = document.createElement('div');
        overlay.id = 'device-prompt';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.75);';

        var box = document.createElement('div');
        box.style.cssText = 'background:#C6C6C6;border:2px solid #000;box-shadow:inset 3px 3px 0px 0px #FFF,inset -3px -3px 0px 0px #555;padding:24px 32px;display:flex;flex-direction:column;align-items:center;gap:12px;max-width:340px;width:90vw;';

        var title = document.createElement('div');
        title.textContent = 'How are you playing?';
        title.style.cssText = "font-family:'MinecraftBitmap',monospace;font-size:16px;color:#3F3F3F;text-align:center;margin-bottom:8px;";
        box.appendChild(title);

        var btnM = document.createElement('button');
        btnM.textContent = 'Mobile / Touchscreen';
        btnM.style.cssText = 'width:100%;height:40px;font-size:14px;font-family:"MinecraftBitmap",monospace;background:#999;border:2px solid #000;box-shadow:inset 2px 2px 0 #ccc,inset -2px -2px 0 #555;color:#fff;text-shadow:1px 1px 0 #333;cursor:pointer;';

        var btnD = document.createElement('button');
        btnD.textContent = 'Desktop / Keyboard & Mouse';
        btnD.style.cssText = 'width:100%;height:40px;font-size:14px;font-family:"MinecraftBitmap",monospace;background:#999;border:2px solid #000;box-shadow:inset 2px 2px 0 #ccc,inset -2px -2px 0 #555;color:#fff;text-shadow:1px 1px 0 #333;cursor:pointer;';

        box.appendChild(btnM);
        box.appendChild(btnD);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Convert to bitmap font when ready
        function convertPromptText() {
            if (window.mcFont && window.mcFont.isReady()) {
                window.mcFont.convertEl(title, '#3F3F3F', 2);
                window.mcFont.convertEl(btnM, '#ffffff', 2);
                window.mcFont.convertEl(btnD, '#ffffff', 2);
            } else {
                setTimeout(convertPromptText, 100);
            }
        }
        convertPromptText();

        function choose(mode) {
            overlay.remove();
            window._deviceChoice = mode;
            if (mode === 'mobile' && typeof window.enableMobileMode === 'function') {
                window.enableMobileMode();
            }
        }

        btnM.addEventListener('click', function() { choose('mobile'); });
        btnM.addEventListener('touchend', function(e) { e.preventDefault(); choose('mobile'); });
        btnD.addEventListener('click', function() { choose('desktop'); });
        btnD.addEventListener('touchend', function(e) { e.preventDefault(); choose('desktop'); });
    }

    // Show as soon as body exists
    if (document.body) {
        showPrompt();
    } else {
        document.addEventListener('DOMContentLoaded', showPrompt);
    }
})();
