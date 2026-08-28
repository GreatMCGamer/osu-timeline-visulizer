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
            `• For OBS Studio: Add Browser Source using 'http://localhost:3000' (or local HTML file) so it connects over standard HTTP.`
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

function processKeyAndHitData(keysData, hitErrorsData, liveTime) {
    if (keysData) {
        const keyNames = ['k1', 'k2', 'm1', 'm2'];
        const titleCaseNames = ['KeyK1', 'KeyK2', 'KeyM1', 'KeyM2'];

        for (let i = 0; i < 4; i++) {
            const k = keyNames[i];
            const keyData = keysData[k] || keysData[titleCaseNames[i]];
            if (!keyData) continue;

            const isDown = keyData.isPressed === true;
            const kCount = typeof keyData.count === 'number' ? keyData.count : 0;

            // Handle count reset or rewinds
            if (kCount < lastCounts[k]) {
                lastCounts[k] = kCount;
                if (activeStrokes[k]) {
                    activeStrokes[k].endTime = Math.max(liveTime, activeStrokes[k].startTime + MIN_KEY_PRESS_DURATION_MS);
                    activeStrokes[k] = null;
                }
            }

            const hasNewPress = (kCount > lastCounts[k]) || (isDown && !keyBoxStates[k]);

            if (hasNewPress) {
                // Close any orphan or previously open stroke for this key before starting a new one
                if (activeStrokes[k]) {
                    activeStrokes[k].endTime = Math.max(liveTime, activeStrokes[k].startTime + MIN_KEY_PRESS_DURATION_MS);
                    activeStrokes[k] = null;
                }

                const strokeStartTime = liveTime;
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
                if (hitErrorsData && hitErrorsData.length > hitErrorCount) {
                    const latestError = hitErrorsData[hitErrorsData.length - 1];

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

                        hitErrorCount = hitErrorsData.length;
                    }
                }
            } else if (!isDown) {
                // Key is not down: close active stroke if one exists
                if (activeStrokes[k]) {
                    activeStrokes[k].endTime = Math.max(liveTime, activeStrokes[k].startTime + MIN_KEY_PRESS_DURATION_MS);
                    activeStrokes[k] = null;
                }
            }

            lastCounts[k] = kCount;
            keyBoxStates[k] = isDown;
        }
    }

    if (hitErrorsData) {
        const newCount = hitErrorsData.length;
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
}

function parseWebsocketPayload(data) {
    if (!data || typeof data !== 'object') return;
    const now = performance.now();
    lastReceiveTime = now;

    // 1. Skin folder
    const skinFolder = data.settings?.folders?.skin || data.folders?.skin || data.skinFolder;
    if (skinFolder && skinFolder !== lastSkinFolder) {
        isNewSkin = true;
        lastSkinFolder = skinFolder;
        loadSkinIniColors();
        loadTextures();
    }

    // 2. Game State
    let incomingState = null;
    if (typeof data.menu?.state === 'number') {
        const num = data.menu.state;
        incomingState = (num === 2) ? 'play' : (num === 1 || num === 11 ? 'songselect' : (num === 7 ? 'results' : 'menu'));
    } else if (data.state?.name) incomingState = String(data.state.name);
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

    // 3. Beatmap Information & Checksum
    const bm = data.menu?.bm || data.beatmap || null;
    if (bm) {
        if (bm.metadata) {
            mapTitle = `${bm.metadata.artist || 'Unknown'} - ${bm.metadata.title || 'Unknown'} [${bm.metadata.difficulty || 'Normal'}]`;
        } else if (bm.artist || bm.title) {
            mapTitle = `${bm.artist || 'Unknown'} - ${bm.title || 'Unknown'} [${bm.version || bm.difficulty || 'Normal'}]`;
        }

        const cs = bm.md5 || bm.checksum || (bm.id ? String(bm.id) : null);
        if (cs && cs !== lastChecksum) {
            lastChecksum = cs;
            resetTimelineState();
            fetchBeatmap(bm);
        }

        updateComboColors();
        if (typeof hasHitCircleTexture !== 'undefined' && hasHitCircleTexture) {
            createTintedVersions();
        }
    }

    // 4. Live Timeline Time
    const commonLiveTime = (bm && bm.time && typeof bm.time.current === 'number') ? bm.time.current :
                           (bm && bm.time && typeof bm.time.live === 'number') ? bm.time.live :
                           (typeof data.currentTime === 'number') ? data.currentTime :
                           (typeof data.time === 'number') ? data.time : null;

    if (commonLiveTime !== null) {
        let dtTosu = 0;
        if (lastCommonLiveTime > 0) {
            dtTosu = commonLiveTime - lastCommonLiveTime;
            if (dtTosu < -500) { resetTimelineState(); }
        }
        lastCommonLiveTime = commonLiveTime;
        lastCommonRealTime = now;
    }

    // 5. Combo & Misses
    const currentCombo = (data.gameplay && data.gameplay.combo && typeof data.gameplay.combo.current === 'number') 
        ? data.gameplay.combo.current 
        : (data.play && data.play.combo && typeof data.play.combo.current === 'number') 
        ? data.play.combo.current 
        : null;

    if (currentCombo !== null) {
        if (currentCombo < lastCombo && lastCombo > 0) {
            const hits = data.gameplay?.hits || data.play?.hits;
            const gameMisses = (hits && typeof hits["0"] === 'number') ? hits["0"] : 0;
            if (gameMisses === ourDetectedMissCount) {
                markSliderAsMissed();
            }
        }
        lastCombo = currentCombo;
    }

    // 6. Keys and Hit Errors
    const keyData = data.gameplay?.keyOverlay || data.keys || null;
    const hitErrorsData = Array.isArray(data.gameplay?.hitErrorArray) ? data.gameplay.hitErrorArray :
                          (Array.isArray(data.hitErrors) ? data.hitErrors : 
                          (Array.isArray(data.tourney) && data.tourney[0] && Array.isArray(data.tourney[0].hitErrors)) ? data.tourney[0].hitErrors : null);

    let activeLiveTime = 0;
    if (lastCommonLiveTime > 0) {
        activeLiveTime = lastCommonLiveTime + (now - lastCommonRealTime) * (currentSpeed || 1.0);
    } else {
        activeLiveTime = lastCommonLiveTime || 0;
    }

    if (keyData || hitErrorsData) {
        processKeyAndHitData(keyData, hitErrorsData, activeLiveTime);
    }
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
            notifyUIStatus();
        };

        wsCommon.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                parseWebsocketPayload(data);
            } catch (err) {}
        };

        wsCommon.onclose = () => {
            handleSocketFailure();
        };

        wsCommon.onerror = () => {
            handleSocketFailure();
        };
    } catch (err) {
        handleSocketFailure();
        return;
    }

    // ──────── WS PRECISE (High-Frequency Keys & Hit Errors) ────────
    try {
        wsPrecise = new WebSocket(preciseUrl);

        wsPrecise.onopen = () => {
            // High-frequency input socket ready
        };

        wsPrecise.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                parseWebsocketPayload(data);
            } catch (err) {}
        };

        wsPrecise.onclose = () => {
            wsPrecise = null;
        };

        wsPrecise.onerror = () => {
            wsPrecise = null;
        };
    } catch (err) {
        wsPrecise = null;
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

window.connect = connect;
window.resetTimelineState = resetTimelineState;

