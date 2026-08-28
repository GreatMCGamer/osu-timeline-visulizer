// ──────── UI HUD & STATUS MANAGER ────────
// Manages the connection status badge, demo controls, retry trigger, and settings drawer.
// Auto-minimizes during active gameplay for clean OBS streaming transparency.

function initUIHud() {
    const hudContainer = document.getElementById('tosu-hud');
    if (!hudContainer) return;

    if (tosuConfig.hideStatus) {
        hudContainer.style.display = 'none';
        return;
    }

    const demoBtn = document.getElementById('btn-demo-toggle');
    const retryBtn = document.getElementById('btn-retry-connect');
    const settingsBtn = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('btn-close-settings');
    const saveSettingsBtn = document.getElementById('btn-save-settings');
    const hostInput = document.getElementById('setting-host');
    const secureCheckbox = document.getElementById('setting-secure');
    const scaleSlider = document.getElementById('setting-scale');
    const scaleVal = document.getElementById('setting-scale-val');
    const minimizeBtn = document.getElementById('btn-minimize');
    const hudCard = document.getElementById('hud-card');

    if (hostInput) hostInput.value = tosuConfig.host;
    if (secureCheckbox) secureCheckbox.checked = tosuConfig.isSecure;
    if (scaleSlider) {
        scaleSlider.value = scale;
        if (scaleVal) scaleVal.textContent = scale.toFixed(2);
        scaleSlider.oninput = () => {
            scale = parseFloat(scaleSlider.value);
            if (scaleVal) scaleVal.textContent = scale.toFixed(2);
        };
    }

    // Toggle demo
    if (demoBtn) {
        demoBtn.onclick = () => {
            toggleDemoMode();
        };
    }

    // Manual Retry
    if (retryBtn) {
        retryBtn.onclick = () => {
            if (typeof window.retryTosuConnection === 'function') {
                window.retryTosuConnection();
            }
        };
    }

    // Settings open/close
    if (settingsBtn && settingsModal) {
        settingsBtn.onclick = () => {
            settingsModal.classList.toggle('hidden');
        };
    }
    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.onclick = () => {
            settingsModal.classList.add('hidden');
        };
    }

    // Save settings
    if (saveSettingsBtn) {
        saveSettingsBtn.onclick = () => {
            const newHost = hostInput ? hostInput.value.trim() : tosuConfig.host;
            const isSec = secureCheckbox ? secureCheckbox.checked : false;
            updateTosuHost(newHost, isSec);
            if (settingsModal) settingsModal.classList.add('hidden');
        };
    }

    // Minimize HUD
    if (minimizeBtn && hudCard) {
        let isMinimized = false;
        minimizeBtn.onclick = () => {
            isMinimized = !isMinimized;
            hudCard.classList.toggle('minimized', isMinimized);
            minimizeBtn.textContent = isMinimized ? '+' : '−';
            minimizeBtn.title = isMinimized ? 'Expand HUD' : 'Minimize HUD';
        };
    }

    // Hotkey listener (D for demo, H for HUD toggle)
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'd' || e.key === 'D') {
            toggleDemoMode();
        } else if (e.key === 'h' || e.key === 'H') {
            if (hudContainer.style.display === 'none') {
                hudContainer.style.display = 'block';
            } else {
                hudContainer.style.display = 'none';
            }
        }
    });

    updateStatusOverlay();
}

function updateStatusOverlay() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const demoBtn = document.getElementById('btn-demo-toggle');
    const retryBtn = document.getElementById('btn-retry-connect');
    const httpsNotice = document.getElementById('https-notice');
    const hudContainer = document.getElementById('tosu-hud');

    if (!dot || !text) return;

    if (isDemoMode) {
        dot.style.background = '#c084fc'; // Purple
        dot.style.boxShadow = '0 0 8px #c084fc';
        text.textContent = 'Demo Mode (Simulating 60 FPS)';
        if (demoBtn) {
            demoBtn.textContent = '⏹ Stop Demo';
            demoBtn.classList.add('btn-active');
        }
        if (retryBtn) {
            retryBtn.style.display = 'inline-flex';
            retryBtn.textContent = '↻ Connect to tosu';
        }
        if (httpsNotice) {
            httpsNotice.style.display = (tosuConfig.isHttps && !tosuConfig.isSecure) ? 'block' : 'none';
        }
    } else if (isTosuConnected) {
        dot.style.background = '#22c55e'; // Green
        dot.style.boxShadow = '0 0 8px #22c55e';
        text.textContent = `tosu Connected (${tosuConfig.host})`;
        if (demoBtn) {
            demoBtn.textContent = '▶ Play Demo';
            demoBtn.classList.remove('btn-active');
        }
        if (retryBtn) {
            retryBtn.style.display = 'none';
        }
        if (httpsNotice) httpsNotice.style.display = 'none';

        // In OBS streaming: gently fade HUD after connection during active gameplay
        if (gameStateName === 'play' && hudContainer) {
            hudContainer.classList.add('auto-dimmed');
        } else if (hudContainer) {
            hudContainer.classList.remove('auto-dimmed');
        }
    } else if (tosuConnectionStatus === 'connecting') {
        dot.style.background = '#f59e0b'; // Amber
        dot.style.boxShadow = '0 0 8px #f59e0b';
        text.textContent = `Connecting to ${tosuConfig.host}...`;
        if (demoBtn) {
            demoBtn.textContent = '▶ Play Demo';
            demoBtn.classList.remove('btn-active');
        }
        if (retryBtn) retryBtn.style.display = 'none';
        if (httpsNotice) httpsNotice.style.display = 'none';
    } else if (tosuConnectionStatus === 'https_restricted') {
        dot.style.background = '#38bdf8'; // Sky Blue
        dot.style.boxShadow = '0 0 8px #38bdf8';
        text.textContent = 'HTTPS Preview (Mixed-Content Block)';
        if (demoBtn) {
            demoBtn.textContent = isDemoMode ? '⏹ Stop Demo' : '▶ Play Demo';
        }
        if (retryBtn) {
            retryBtn.style.display = 'inline-flex';
            retryBtn.textContent = '↻ Retry WSS';
        }
        if (httpsNotice) {
            httpsNotice.style.display = 'block';
        }
    } else if (tosuConnectionStatus === 'waiting') {
        dot.style.background = '#ef4444'; // Red
        dot.style.boxShadow = '0 0 8px #ef4444';
        text.textContent = `Waiting for tosu (${tosuConfig.host})`;
        if (demoBtn) {
            demoBtn.textContent = '▶ Play Demo';
            demoBtn.classList.remove('btn-active');
        }
        if (retryBtn) {
            retryBtn.style.display = 'inline-flex';
            retryBtn.textContent = '↻ Retry Now';
        }
        if (httpsNotice) {
            httpsNotice.style.display = (tosuConfig.isHttps && !tosuConfig.isSecure) ? 'block' : 'none';
        }
    } else {
        dot.style.background = '#ef4444'; // Red
        dot.style.boxShadow = '0 0 8px #ef4444';
        text.textContent = `tosu Disconnected (${tosuConfig.host})`;
        if (demoBtn) {
            demoBtn.textContent = '▶ Play Demo';
            demoBtn.classList.remove('btn-active');
        }
        if (retryBtn) {
            retryBtn.style.display = 'inline-flex';
            retryBtn.textContent = '↻ Retry Now';
        }
        if (httpsNotice) {
            httpsNotice.style.display = (tosuConfig.isHttps && !tosuConfig.isSecure) ? 'block' : 'none';
        }
        if (hudContainer) {
            hudContainer.classList.remove('auto-dimmed');
        }
    }
}

window.addEventListener('DOMContentLoaded', initUIHud);
