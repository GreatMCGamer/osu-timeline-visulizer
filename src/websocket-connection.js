// ──────── WEBSOCKET CONNECTION ────────
// Handles connection setup and real-time data streaming from tosu/gosumemory.

function connect() {
    if (wsCommon) wsCommon.close();
    if (wsPrecise) wsPrecise.close();

    wsCommon = new WebSocket('ws://127.0.0.1:24050/websocket/v2');
    wsCommon.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const now = performance.now();
        
        if (data.folders?.skin !== undefined) {
            if (data.folders.skin !== lastSkinFolder) {
                isNewSkin = true;
                lastSkinFolder = data.folders.skin;
                
                // NEW: Load real skin colors from skin.ini (tosu only gives us the file path + files, not colors in JSON)
                loadSkinIniColors();   // async, runs in parallel with texture loading
                
                // Trigger texture reload (existing behaviour)
                loadTextures(); 
            }
        }

        if (data.state?.name) gameStateName = data.state.name;
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
            if (commonLiveTime !== undefined) {
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

        if (data.currentTime !== undefined) {
            lastPreciseTime = data.currentTime;
            lastPreciseRealTime = performance.now();
        }
    };
    wsCommon.onclose = () => setTimeout(connect, 2000);

    wsPrecise = new WebSocket('ws://127.0.0.1:24050/websocket/v2/precise');
    wsPrecise.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const now = performance.now();
        const preciseWebSocketTime = data.currentTime;
        const liveTime = data.currentTime;
        const hitErrors = Array.isArray(data.hitErrors) ? data.hitErrors :
                          (Array.isArray(data.tourney) && data.tourney[0] && Array.isArray(data.tourney[0].hitErrors)) ? data.tourney[0].hitErrors : null;

        if (data.currentTime !== undefined) {
            lastPreciseTime = data.currentTime;
            lastPreciseRealTime = now;
        }
        
        if (data.keys) {
            const keys = data.keys;
            let currentLiveTime = lastPreciseTime;

            const keyNames = ['k1', 'k2', 'm1', 'm2'];
            const titleCaseNames = ['KeyK1', 'KeyK2', 'KeyM1', 'KeyM2'];

            keyNames.forEach((k, index) => {
                let keyData = keys[k] || keys[titleCaseNames[index]];
                if (!keyData) return;

                let isDown = keyData.isPressed === true;
                let kCount = keyData.count || 0;

                if (kCount < lastCounts[k]) {
                    lastCounts[k] = kCount;
                    if (activeStrokes[k]) {
                        activeStrokes[k].endTime = currentLiveTime;
                        activeStrokes[k] = null;
                    }
                }

                const hasNewPress = (kCount > lastCounts[k]) || (isDown && !keyBoxStates[k]);

                if (hasNewPress) {
                    const strokeStartTime = currentLiveTime;
                    
                    // Create the stroke visually
                    const stroke = { 
                        key: k, 
                        startTime: strokeStartTime, 
                        endTime: isDown ? null : strokeStartTime + 1,
                        matched: false
                    };
                    keyStrokes.push(stroke);
                    activeStrokes[k] = isDown ? stroke : null;

                    // IMMEDIATE MATCHING: Check if this press generated a hit error
                    if (hitErrors && hitErrors.length > hitErrorCount) {
                        const latestError = hitErrors[hitErrors.length - 1]; // Use the most recent error

                        // Find the note that perfectly fits this specific press
                        let bestObj = hitObjects.find(obj => {
                            if (obj.judged) return false;
                            const trueHitTime = obj.startTime + latestError;
                            return Math.abs(strokeStartTime - trueHitTime) <= 5; // 5ms precision check
                        });
                    
                        if (bestObj) {
                            bestObj.judged = true;
                            bestObj.hitLane = (k === 'k1' || k === 'm1') ? 0 : 1; // Assign lane immediately

                            // === NEW: store the REAL judgment time ===
                            bestObj.actualHitTime = bestObj.startTime + latestError;

                            stroke.matched = true;

                            // Sync the visual stroke start to the game's true hit time
                            stroke.startTime = bestObj.startTime + latestError;

                            hitErrorCount = hitErrors.length; // Update processed count
                        }
                    }
                } else if (!isDown && activeStrokes[k]) {
                    activeStrokes[k].endTime = currentLiveTime;
                    activeStrokes[k] = null;
                }

                lastCounts[k] = kCount;
                keyBoxStates[k] = isDown;
            });
            
// At the bottom of wsPrecise.onmessage, replacing that entire long block:
if (hitErrors) {
    const newCount = hitErrors.length;
    if (newCount < hitErrorCount) {
        // Handle map restarts/rewinds
        hitErrorCount = newCount;
        if (hitObjects) hitObjects.forEach(h => { h.judged = false; h.isMissed = false; h.hitLane = -1; });
    } else {
        // Just keep the counter in sync. 
        // Hits are handled by the key-press trigger; 
        // Misses are handled by the 'tooLateTime' check in drawing-functions.js.
        hitErrorCount = newCount; 
    }
}
        };
        wsPrecise.onclose = () => setTimeout(connect, 2000);
    }
}

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
    if (hitObjects) hitObjects.forEach(h => { 
        h.judged = false; 
        h.isMissed = false;
        h.hitLane = -1;
        h.actualHitTime = undefined;
    });
}
