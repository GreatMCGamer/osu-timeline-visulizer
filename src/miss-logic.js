// ──────── MISS LOGIC ────────
// Rules for evaluating hit errors, combo breaks, and flagging objects as missed.

// ──────── SLIDER COMBO-BREAK DETECTION ────────
// We no longer use a fixed 1000 ms start-time window.
// Instead we take the most recent slider (current or previous) that is still
// relevant at the moment the combo break packet arrives (within the normal
// 100-200 ms poll delay).
function markSliderAsMissed() {
    const now = lastPreciseTime || lastCommonLiveTime || 0;
    for (let i = hitObjects.length - 1; i >= 0; i--) {
        const note = hitObjects[i];
        if (note.type === 'slider' && !note.isMissed) {
            // Slider is either still active or ended no more than 500 ms ago
            // (covers the maximum expected combo-break packet delay)
            if (note.endTime >= now - 500 && note.startTime <= now + 300) {
                note.isMissed = true;
                break;
            }
        }
    }
}

// ──────── HIT ERROR PROCESSING ────────
// Process hit errors to determine which objects were missed and when
function processHitErrors(hitErrors) {
    const newCount = hitErrors.length;
    if (newCount < hitErrorCount) {
        hitErrorCount = newCount; 
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

                for (let obj of hitObjects) {
                    if (obj === bestObj) break;
                    if (!obj.judged) {
                        obj.judged = true;
                        if (!obj.isMissed) {
                            obj.isMissed = true;
                            ourDetectedMissCount++;
                        }
                    }
                }

                if (bestStroke) {
                    bestStroke.matched = true;

                    let wasMicrotap = bestStroke.endTime !== null && (bestStroke.endTime - bestStroke.startTime <= 2);
                    const trueHitTime = bestObj.startTime + error;
                    
                    if (bestStroke.startTime !== null) {
                        bestStroke.startTime = trueHitTime;
                    }
                    
                    if (wasMicrotap && bestStroke.endTime !== null) {
                        bestStroke.endTime = trueHitTime + 1;
                    } else if (bestStroke.endTime !== null && bestStroke.endTime <= trueHitTime) {
                        bestStroke.endTime = trueHitTime + 1; 
                    }
                }
            }
        }
        hitErrorCount = newCount;
    }
}

// ──────── MISS DETECTION FOR UNJUDGED OBJECTS ────────
// Detect when objects are missed due to timing
function detectMissedObjects(currentTime, hitWindow50, tosuLeeway, hitErrorLeeway) {
    for (let note of hitObjects) {
        if (!note.judged) {
            const tooLateTime = note.endTime + hitWindow50;
            if (currentTime > tooLateTime + tosuLeeway) {
                note.judged = true;
                if (!note.isMissed) {
                    note.isMissed = true;
                    ourDetectedMissCount++;
                }
            }
        }
    }
}

// ──────── KEY STROKE MISS HANDLING ────────
// Handle missed objects based on key strokes that are too late
function handleMissedKeyStrokes(currentTime, hitErrorLeeway) {
    let firstUnjudgedIndex = hitObjects.findIndex(h => !h.judged);
    for (let stroke of keyStrokes) {
        if (!stroke.matched && currentTime > stroke.startTime + hitErrorLeeway) {
            if (firstUnjudgedIndex !== -1) {
                let nextNote = hitObjects[firstUnjudgedIndex];
                let minHitTime = nextNote.startTime - hitWindow50;
                let maxHitTime = nextNote.startTime + hitWindow50;
                
                if (stroke.startTime >= minHitTime && stroke.startTime <= maxHitTime) {
                    nextNote.judged = true;
                    if (!nextNote.isMissed) {
                        nextNote.isMissed = true;
                        ourDetectedMissCount++;
                    }
                    stroke.matched = true;
                    
                    while (firstUnjudgedIndex < hitObjects.length && hitObjects[firstUnjudgedIndex].judged) {
                        firstUnjudgedIndex++;
                    }
                    if (firstUnjudgedIndex >= hitObjects.length) firstUnjudgedIndex = -1;
                } else if (stroke.startTime < minHitTime) {
                    stroke.matched = true;
                }
            } else {
                stroke.matched = true;
            }
        }
    }
}
