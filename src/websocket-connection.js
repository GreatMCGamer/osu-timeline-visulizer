// ──────── WEBSOCKET CONNECTION ────────
// Handles connection setup and real-time data streaming from tosu/gosumemory.

function connect() {
    if (wsCommon) wsCommon.close();
    if (wsPrecise) wsPrecise.close();

    wsCommon = new WebSocket('ws://127.0.0.1:24050/websocket/v2');
    wsCommon.onmessage = (e) => {
        const data = JSON.parse(e.data);
        const now = performance.now();
        if (data.state?.name) gameStateName = data.state.name;
        
        if (data.beatmap) {
            mapTitle = `${data.beatmap.artist} - ${data.beatmap.title} [${data.beatmap.version || 'Unknown'}]`;
            const cs = data.beatmap.checksum;
            if (cs && cs !== lastChecksum) {
                lastChecksum = cs;
                resetTimelineState();
                fetchBeatmap(data.beatmap);
            }
            if (data.settings?.skin?.colors) {
                if (data.settings.skin.colors.sliderTrackOverride) sliderTrackOverride = data.settings.skin.colors.sliderTrackOverride;
                if (data.settings.skin.colors.sliderBorder) sliderBorder = data.settings.skin.colors.sliderBorder;
            }
            const liveTime = data.beatmap.time?.live;
            if (liveTime !== undefined) {
                lastReceiveTime = now;
                let dtTosu = 0, dtReal = 0;
                if (lastCommonLiveTime > 0) {
                    dtTosu = liveTime - lastCommonLiveTime;
                    dtReal = now - lastCommonRealTime;
                    if (dtTosu < -500) { resetTimelineState(); dtTosu = 0; }
                }
                lastCommonLiveTime = liveTime;
                lastCommonRealTime = now;
                if (dtTosu !== 0) {
                    lastLiveTimeChangeReal = now;
                    if (currentSpeed === 0) {
                        currentSpeed = 1.0; isTimelineLocked = false;
                        speedAccumTosu = 0; speedAccumReal = 0;
                    }
                    if (dtTosu > 0 && dtTosu < 500) {
                        speedAccumTosu += dtTosu; speedAccumReal += dtReal;
                        if (speedAccumReal > 500) {
                            const raw = speedAccumTosu / speedAccumReal;
                            currentSpeed = Math.abs(raw - 0.75) < 0.15 ? 0.75 : Math.abs(raw - 1.5) < 0.15 ? 1.5 : 1.0;
                            speedAccumTosu = 0; speedAccumReal = 0;
                        }
                    } else if (dtTosu >= 500) {
                        isTimelineLocked = false; speedAccumTosu = 0; speedAccumReal = 0;
                    }
                } else if (now - lastLiveTimeChangeReal > 250 && currentSpeed !== 0) {
                    currentSpeed = 0; isTimelineLocked = false;
                }
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
        const hitErrors = Array.isArray(data.hitErrors) ? data.hitErrors :
                          (Array.isArray(data.tourney) && data.tourney[0] && Array.isArray(data.tourney[0].hitErrors)) ? data.tourney[0].hitErrors : null;

        if (data.currentTime !== undefined) {
            lastPreciseTime = data.currentTime;
            lastPreciseRealTime = now;

            // ──────── NEW: DESYNC / LAG DRIFT DETECTION ────────
            // If the timeline is currently interpolating time independently, 
            // check if it has drifted from the actual game client time.
            if (isTimelineLocked) {
                // Calculate what the drawing loop thinks the time is right now
                let predictedTime = lockedBaseTime + (now - lockedBaseRealTime) * lockedCurrentSpeed * SPEED_MULTIPLIER;
                
                // If the difference is greater than 50ms, the game likely lagged
                if (Math.abs(predictedTime - data.currentTime) > 50) {
                    // Resync the system by snapping the lock directly to the true precise time
                    lockedBaseTime = data.currentTime;
                    lockedBaseRealTime = now;
                    // We leave isTimelineLocked = true so it continues smoothly without waiting for a new hit error
                }
            }
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
                    if (activeStrokes[k]) activeStrokes[k].endTime = currentLiveTime;
                    
                    const stroke = { 
                        key: k, 
                        startTime: currentLiveTime, 
                        endTime: isDown ? null : currentLiveTime + 1,
                        matched: false
                    };
                    keyStrokes.push(stroke);
                    activeStrokes[k] = isDown ? stroke : null;
                } else if (!isDown && activeStrokes[k]) {
                    activeStrokes[k].endTime = currentLiveTime;
                    activeStrokes[k] = null;
                }

                lastCounts[k] = kCount;
                keyBoxStates[k] = isDown;
            });
            
            if (hitErrors) {
            const newCount = hitErrors.length;
            if (newCount < hitErrorCount) {
                hitErrorCount = newCount; isTimelineLocked = false;
                if (hitObjects) hitObjects.forEach(h => { h.judged = false; h.isMissed = false; });
            } else if (newCount > hitErrorCount) {
                const hitsToProcess = newCount - hitErrorCount;
                let snapTimeObj = null;

                for (let i = 0; i < hitsToProcess; i++) {
                    const error = hitErrors[hitErrorCount + i];
                    
                    let bestObj = null;
                    let bestStroke = null;
                    let minMismatch = Infinity;
                    
                    let unjudgedCandidates = hitObjects.filter(h => !h.judged).slice(0, 10);
                    
                    for (let obj of unjudgedCandidates) {
                        for (let j = keyStrokes.length - 1; j >= 0; j--) {
                            let stroke = keyStrokes[j];
                            if (stroke.matched) continue;

                            let calculatedError = stroke.startTime - obj.startTime;
                            let diff = Math.abs(calculatedError - error);
                            
                            if (diff < minMismatch) {
                                minMismatch = diff;
                                bestObj = obj;
                                bestStroke = stroke;
                            }
                        }
                        
                        let estimatedHitTime = lastPreciseTime - 20;
                        let estimatedObjStartTime = estimatedHitTime - error;
                        let timeDiff = Math.abs(obj.startTime - estimatedObjStartTime);
                        
                        if (timeDiff < minMismatch) {
                            minMismatch = timeDiff;
                            bestObj = obj;
                            bestStroke = null;
                        }
                    }

                    if (minMismatch > 150 && unjudgedCandidates.length > 0) {
                        bestObj = unjudgedCandidates[0];
                    }

                    if (bestObj) {
                        bestObj.judged = true;
                        bestObj.isMissed = false;
                        snapTimeObj = bestObj;

                        // ──────── NEW: assign lane from the matching key stroke ────────
                        if (bestStroke) {
                            bestObj.hitLane = (bestStroke.key === 'k1' || bestStroke.key === 'm1') ? 0 : 1;
                        }

                        for (let obj of hitObjects) {
                            if (obj === bestObj) break;
                            if (!obj.judged) {
                                obj.judged = true;
                                if (!obj.isMissed) {
                                    obj.isMissed = true;
                                    ourDetectedMissCount++;
                                }
                                obj.hitLane = -1; // previous unjudged notes stay centered
                            }
                        }

                        if (bestStroke) {
                            bestStroke.matched = true;
                            let wasMicrotap = bestStroke.endTime !== null && (bestStroke.endTime - bestStroke.startTime <= 2);
                            const trueHitTime = bestObj.startTime + error;
                            if (bestStroke.startTime !== null) bestStroke.startTime = trueHitTime;
                            if (wasMicrotap && bestStroke.endTime !== null) {
                                bestStroke.endTime = trueHitTime + 1;
                            } else if (bestStroke.endTime !== null && bestStroke.endTime <= trueHitTime) {
                                bestStroke.endTime = trueHitTime + 1; 
                            }
                        }
                    }
                    }

                    if (!isTimelineLocked && snapTimeObj) {
                        lockedBaseTime = snapTimeObj.startTime - hitErrors[newCount - 1];
                        lockedBaseRealTime = now;
                        lockedCurrentSpeed = currentSpeed === 0 ? 1.0 : currentSpeed;
                        isTimelineLocked = true;
                    }
                    hitErrorCount = newCount;
                }
            }
        };
        wsPrecise.onclose = () => setTimeout(connect, 2000);
    }
}

function resetTimelineState() {
    isTimelineLocked = false; hitErrorCount = 0; lastCommonLiveTime = 0;
    lastPreciseTime = 0; currentSpeed = 1.0; lockedBaseTime = 0;
    lastLiveTimeChangeReal = performance.now(); speedAccumTosu = 0; speedAccumReal = 0;
    
    keyStrokes = [];
    activeStrokes = { k1: null, k2: null, m1: null, m2: null };
    lastCounts = { k1: 0, k2: 0, m1: 0, m2: 0 };
    keyBoxStates = { k1: false, k2: false, m1: false, m2: false };
    if (hitObjects) hitObjects.forEach(h => { 
        h.judged = false; 
        h.isMissed = false;
        h.hitLane = -1;   // ← NEW
    });

    lastCombo = 0;
    ourDetectedMissCount = 0;
}

