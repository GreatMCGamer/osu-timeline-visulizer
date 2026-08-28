// ──────── WEBSOCKET CONNECTION & LIFECYCLE CONTROLLER ────────
// Handles connection setup, backoff, and data streaming from tosu/gosumemory.
// Engineered to prevent runaway reconnection loops, zombie sockets, and browser memory exhaustion.

let reconnectTimer = null;
let lastReportedStatus = '';
let isConnecting = false;
let autoReconnectEnabled = true;

// Cleanly tears down a WebSocket instance by unbinding all handlers FIRST.
// This prevents calling .close() from triggering self-invoking 'onclose' cascades.
function teardownSocket(ws) {
    if (!ws) return null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
    } catch (e) {}
    return null;
}

function teardownAllSockets() {
    wsCommon = teardownSocket(wsCommon);
    wsPrecise = teardownSocket(wsPrecise);
    isConnecting = false;
}

function logConnectionStatus(status, detail) {
    if (status === lastReportedStatus && connectionRetryCount > 1) return;
    lastReportedStatus = status;

    if (status === 'connected') {
        console.log(`%c[osu! Timeline] Connected to tosu at ${tosuConfig.wsBase}`, 'color: #00ff88; font-weight: bold;');
    } else if (status === 'https_restricted') {
        console.warn(
            `[osu! Timeline] Browser Mixed-Content Restriction:\n` +
            `This page was loaded securely over HTTPS (${window.location.protocol}//).\n` +
            `Modern web browsers prohibit unencrypted 'ws://' connections to local addresses (127.0.0.1).\n` +
            `• For OBS Studio: Add Browser Source using 'http://localhost:3000' (or local HTML file) so it connects over standard HTTP.\n` +
            `• In Cloud Preview: Interactive Demo Mode is running so you can preview the 60 FPS timeline.`
        );
    } else if (status === 'disconnected') {
        console.log(`[osu! Timeline] Waiting for tosu at ${tosuConfig.wsBase} (tosu/gosumemory not detected on port ${tosuConfig.host.split(':')[1] || '24050'}).`);
    }
}

function notifyUIStatus() {
    if (typeof updateStatusOverlay === 'function') {
        updateStatusOverlay();
    }
}

// Single centralized reconnect scheduler. Enforces backoff and prevents concurrent timers.
function scheduleReconnect() {
    if (reconnectTimer) return; // Never duplicate timers
    if (!autoReconnectEnabled) return;

    // Mixed Content check: on HTTPS pages without WSS, browsers will ALWAYS reject ws://127.0.0.1
    if (tosuConfig.isHttps && !tosuConfig.isSecure) {
        isTosuConnected = false;
        tosuConnectionStatus = 'https_restricted';
        logConnectionStatus('https_restricted');
        notifyUIStatus();

        // Auto-enable demo mode so the user has an immediate, working, interactive timeline
        if (!isDemoMode && typeof startDemoMode === 'function') {
            startDemoMode();
        }
        return; // Cease automatic looping on HTTPS
    }

    connectionRetryCount++;

    // Backoff schedule: 2s -> 3s -> 5s -> 8s -> 12s -> 15s max
    const delays = [2000, 3000, 5000, 8000, 12000, 15000];
    const delay = delays[Math.min(connectionRetryCount - 1, delays.length - 1)];

    // After 6 consecutive failed attempts, enter a gentle 20s probing mode
    if (connectionRetryCount > 6) {
        tosuConnectionStatus = 'waiting';
        notifyUIStatus();
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect(false);
        }, 20000);
        return;
    }

    tosuConnectionStatus = 'disconnected';
    notifyUIStatus();

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect(false);
    }, delay);
}

function handleSocketFailure() {
    const wasConnected = isTosuConnected;
    isTosuConnected = false;
    teardownAllSockets();

    if (wasConnected) {
        logConnectionStatus('disconnected');
    }
    notifyUIStatus();
    scheduleReconnect();
}

function connect(isManual = false) {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (isManual) {
        connectionRetryCount = 0;
        autoReconnectEnabled = true;
    }

    teardownAllSockets();

    // Guard against Mixed Content loop on HTTPS
    if (tosuConfig.isHttps && !tosuConfig.isSecure) {
        isTosuConnected = false;
        tosuConnectionStatus = 'https_restricted';
        logConnectionStatus('https_restricted');
        notifyUIStatus();
        if (!isDemoMode && typeof startDemoMode === 'function') {
            startDemoMode();
        }
        return;
    }

    isConnecting = true;
    tosuConnectionStatus = 'connecting';
    notifyUIStatus();

    const commonUrl = `${tosuConfig.wsBase}/websocket/v2`;
    const preciseUrl = `${tosuConfig.wsBase}/websocket/v2/precise`;

    // ──────── WS COMMON ────────
    try {
        wsCommon = new WebSocket(commonUrl);

        wsCommon.onopen = () => {
            isTosuConnected = true;
            isConnecting = false;
            tosuConnectionStatus = 'connected';
            connectionRetryCount = 0;
            logConnectionStatus('connected');
            if (typeof isDemoMode !== 'undefined' && isDemoMode) {
                if (typeof stopDemoMode === 'function') stopDemoMode();
            }
            notifyUIStatus();
        };

        wsCommon.onmessage = (e) => {
            let data;
            try {
                data = JSON.parse(e.data);
            } catch (err) {
                return;
            }
            const now = performance.now();
            
            if (data.folders?.skin !== undefined) {
                if (data.folders.skin !== lastSkinFolder) {
                    isNewSkin = true;
                    lastSkinFolder = data.folders.skin;
                    
                    // Load real skin colors from skin.ini
                    loadSkinIniColors();
                    
                    // Trigger texture reload
                    loadTextures(); 
                }
            }

            let incomingState = null;
            if (data.state?.name) incomingState = String(data.state.name);
            else if (typeof data.stateName === 'string') incomingState = data.stateName;
            else if (typeof data.state === 'string') incomingState = data.state;
            else if (typeof data.state?.number === 'number') {
                const num = data.state.number;
                incomingState = (num === 2) ? 'play' : (num === 1 || num === 11 ? 'songselect' : (num === 7 ? 'results' : 'menu'));
            }

            if (incomingState) {
                const normalizedState = incomingState.toLowerCase();
                if (normalizedState !== gameStateName) {
                    if (normalizedState === 'play' || normalizedState === 'songselect' || normalizedState === 'menu') {
                        resetTimelineState();
                    }
                    gameStateName = normalizedState;
                }
            }
            if (data.beatmap) {
                mapTitle = `${data.beatmap.artist} - ${data.beatmap.title} [${data.beatmap.version || 'Unknown'}]`;
                const cs = data.beatmap.checksum;
                if (cs && cs !== lastChecksum) {
                    lastChecksum = cs;
                    resetTimelineState();
                    fetchBeatmap(data.beatmap);
                }
                updateComboColors();
                if (typeof hasHitCircleTexture !== 'undefined' && hasHitCircleTexture) {
                    createTintedVersions();
                }
                
                const commonLiveTime = data.beatmap.time?.live;
                if (commonLiveTime !== undefined && typeof commonLiveTime === 'number') {
                    lastReceiveTime = now;
                    let dtTosu = 0, dtReal = 0;
                    if (lastCommonLiveTime > 0) {
                        dtTosu = commonLiveTime - lastCommonLiveTime;
                        dtReal = now - lastCommonRealTime;
                        if (dtTosu < -500) { resetTimelineState(); dtTosu = 0; }
                    }
                    lastCommonLiveTime = commonLiveTime;
                    lastCommonRealTime = now;
                }
            }

            if (data.play && data.play.combo && typeof data.play.combo.current === 'number') {
                const currCombo = data.play.combo.current;
                if (currCombo < lastCombo && lastCombo > 0) {
                    const gameMisses = (data.play.hits && typeof data.play.hits["0"] === 'number') ? data.play.hits["0"] : 0;
                    if (gameMisses === ourDetectedMissCount) {
                        markSliderAsMissed();
                    }
                }
                lastCombo = currCombo;
            }

            // In some tosu versions, currentTime is at top-level of wsCommon
            if (data.currentTime !== undefined && typeof data.currentTime === 'number') {
                lastCommonLiveTime = data.currentTime;
                lastCommonRealTime = now;
            }
        };

        wsCommon.onclose = () => {
            handleSocketFailure();
        };

        wsCommon.onerror = () => {
            // Quiet handler — avoid noisy raw Event object dumps to console
            handleSocketFailure();
        };
    } catch (err) {
        handleSocketFailure();
        return;
    }

    // ──────── WS PRECISE ────────
    try {
        wsPrecise = new WebSocket(preciseUrl);

        wsPrecise.onopen = () => {
            // Precise socket ready
        };

        wsPrecise.onmessage = (e) => {
            let data;
            try {
                data = JSON.parse(e.data);
            } catch (err) {
                return;
            }
            const now = performance.now();
            preciseWebSocketTime = data.currentTime;
            const hitErrors = Array.isArray(data.hitErrors) ? data.hitErrors :
                              (Array.isArray(data.tourney) && data.tourney[0] && Array.isArray(data.tourney[0].hitErrors)) ? data.tourney[0].hitErrors : null;

            if (data.currentTime !== undefined && typeof data.currentTime === 'number') {
                lastPreciseTime = data.currentTime;
                lastPreciseRealTime = now;
            }

            // Calculate precise live time from all available synchronization sources
            let currentLiveTime = 0;
            if (data.currentTime !== undefined && typeof data.currentTime === 'number') {
                currentLiveTime = data.currentTime;
            } else if (lastPreciseTime > 0) {
                const dt = (now - lastPreciseRealTime) * (currentSpeed || 1.0);
                currentLiveTime = lastPreciseTime + Math.min(Math.max(0, dt), 3000);
            } else if (lastCommonLiveTime > 0) {
                const dt = (now - lastCommonRealTime) * (currentSpeed || 1.0);
                currentLiveTime = lastCommonLiveTime + Math.min(Math.max(0, dt), 3000);
            }
            
            if (data.keys) {
                const keys = data.keys;

                const keyNames = ['k1', 'k2', 'm1', 'm2'];
                const titleCaseNames = ['KeyK1', 'KeyK2', 'KeyM1', 'KeyM2'];

                for (let i = 0; i < 4; i++) {
                    const k = keyNames[i];
                    const keyData = keys[k] || keys[titleCaseNames[i]];
                    if (!keyData) continue;

                    const isDown = keyData.isPressed === true;
                    const kCount = typeof keyData.count === 'number' ? keyData.count : 0;

                    // Handle count reset or rewinds
                    if (kCount < lastCounts[k]) {
                        lastCounts[k] = kCount;
                        if (activeStrokes[k]) {
                            activeStrokes[k].endTime = Math.max(currentLiveTime, activeStrokes[k].startTime + MIN_KEY_PRESS_DURATION_MS);
                            activeStrokes[k] = null;
                        }
                    }

                    const hasNewPress = (kCount > lastCounts[k]) || (isDown && !keyBoxStates[k]);

                    if (hasNewPress) {
                        // Close any orphan or previously open stroke for this key before starting a new one
                        if (activeStrokes[k]) {
                            activeStrokes[k].endTime = Math.max(currentLiveTime, activeStrokes[k].startTime + MIN_KEY_PRESS_DURATION_MS);
                            activeStrokes[k] = null;
                        }

                        const strokeStartTime = currentLiveTime;
                        const minEnd = strokeStartTime + MIN_KEY_PRESS_DURATION_MS;
                        
                        // Create the stroke visually with guaranteed minimum duration
                        const stroke = { 
                            key: k, 
                            startTime: strokeStartTime, 
                            endTime: isDown ? null : minEnd,
                            matched: false
                        };
                        keyStrokes.push(stroke);
                        activeStrokes[k] = isDown ? stroke : null;

                        // IMMEDIATE MATCHING: Check if this press generated a hit error
                        if (hitErrors && hitErrors.length > hitErrorCount) {
                            const latestError = hitErrors[hitErrors.length - 1];

                            // Find the note that fits this press within OD window tolerance
                            let bestObj = null;
                            let minDiff = Infinity;
                            const searchTolerance = Math.max(120, (typeof hitWindow50 !== 'undefined' ? hitWindow50 : 150));

                            for (let j = 0; j < hitObjects.length; j++) {
                                const obj = hitObjects[j];
                                if (obj.judged) continue;
                                const trueHitTime = obj.startTime + latestError;
                                const diff = Math.abs(strokeStartTime - trueHitTime);
                                if (diff < searchTolerance && diff < minDiff) {
                                    minDiff = diff;
                                    bestObj = obj;
                                }
                            }
                        
                            if (bestObj) {
                                bestObj.judged = true;
                                bestObj.isMissed = false;
                                bestObj.hitLane = (k === 'k1' || k === 'm1') ? 0 : 1;
                                bestObj.actualHitTime = bestObj.startTime + latestError;

                                stroke.matched = true;
                                stroke.startTime = bestObj.actualHitTime;
                                if (stroke.endTime !== null) {
                                    stroke.endTime = Math.max(stroke.endTime, stroke.startTime + MIN_KEY_PRESS_DURATION_MS);
                                }

                                hitErrorCount = hitErrors.length;
                            }
                        }
                    } else if (!isDown) {
                        // Key is not down: close active stroke if one exists
                        if (activeStrokes[k]) {
                            activeStrokes[k].endTime = Math.max(currentLiveTime, activeStrokes[k].startTime + MIN_KEY_PRESS_DURATION_MS);
                            activeStrokes[k] = null;
                        }
                    }

                    lastCounts[k] = kCount;
                    keyBoxStates[k] = isDown;
                }
            }

            if (hitErrors) {
                const newCount = hitErrors.length;
                if (newCount < hitErrorCount) {
                    // Handle map restarts/rewinds
                    hitErrorCount = newCount;
                    if (hitObjects) {
                        for (let i = 0; i < hitObjects.length; i++) {
                            const h = hitObjects[i];
                            h.judged = false;
                            h.isMissed = false;
                            h.hitLane = -1;
                        }
                    }
                } else {
                    hitErrorCount = newCount; 
                }
            }
        };

        wsPrecise.onclose = () => {
            handleSocketFailure();
        };

        wsPrecise.onerror = () => {
            handleSocketFailure();
        };
    } catch (err) {
        handleSocketFailure();
    }
}

// Global helper to switch tosu host at runtime
window.updateTosuHost = function(newHost, isSecure) {
    if (!newHost) return;
    tosuConfig.host = newHost.trim();
    if (typeof isSecure === 'boolean') {
        tosuConfig.isSecure = isSecure;
    }
    try {
        localStorage.setItem('osu_tosu_host', tosuConfig.host);
    } catch (e) {}
    console.log(`[osu! Timeline] Switching tosu target to: ${tosuConfig.wsBase}`);
    connect(true);
};

// Global helper for manually triggering a reconnect attempt
window.retryTosuConnection = function() {
    console.log('[osu! Timeline] Manual reconnection requested.');
    connect(true);
};

function resetTimelineState() { 
    hitErrorCount = 0; 
    lastCommonLiveTime = 0;
    lastPreciseTime = 0; 
    currentSpeed = 1.0;
    ourDetectedMissCount = 0;
    lastCombo = 0;
    
    keyStrokes = [];
    activeStrokes = { k1: null, k2: null, m1: null, m2: null };
    lastCounts = { k1: 0, k2: 0, m1: 0, m2: 0 };
    keyBoxStates = { k1: false, k2: false, m1: false, m2: false };
    if (hitObjects) {
        for (let i = 0; i < hitObjects.length; i++) {
            const h = hitObjects[i];
            h.judged = false; 
            h.isMissed = false; 
            h.hitLane = -1;
            h.actualHitTime = undefined;
        }
    }
}
