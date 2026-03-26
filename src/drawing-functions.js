// ──────── DRAWING FUNCTIONS ────────
// Fully scale-aware rendering (pxPerMs = scale).
// OD ≤ 0 (including Half-Time edge cases) now correctly gives LARGER windows.

function drawHitCircle(posX, colorIndex, isMissed = false, diameter = 20, yOffset = 0) {
    if (posX < -100 || posX > canvas.width + 100) return;
    
    ctx.globalAlpha = isMissed ? 0.4 : 1.0;

    if (isMissed && hasHitCircleTexture && hitCircleImg) {
        const w = diameter;
        const h = diameter;
        const dx = posX - w/2, dy = Y_CENTERED + yOffset - h/2;
        ctx.drawImage(hitCircleImg, dx, dy, w, h);
        if (hitCircleOverlayImg && hitCircleOverlayImg.complete) ctx.drawImage(hitCircleOverlayImg, dx, dy, w, h);
        ctx.globalAlpha = 1.0;
        return;
    }

    const activeTinted = (useBeatmapCombos && beatmapTintedHitCircles.length > 0) ? beatmapTintedHitCircles : defaultTintedHitCircles;
    const tintedCanvas = activeTinted[colorIndex % activeTinted.length];
    if (hasHitCircleTexture && tintedCanvas) {
        const w = diameter;
        const h = diameter;
        const dx = posX - w/2, dy = Y_CENTERED + yOffset - h/2;
        ctx.drawImage(tintedCanvas, dx, dy, w, h);
        if (hitCircleOverlayImg && hitCircleOverlayImg.complete) ctx.drawImage(hitCircleOverlayImg, dx, dy, w, h);
    } else {
        if (isMissed) {
            ctx.fillStyle = `rgba(100, 100, 100, 0.5)`;
        } else {
            const col = (useBeatmapCombos && beatmapComboColors.length ? beatmapComboColors : DEFAULT_COMBO_COLORS)[colorIndex % 4];
            ctx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
        }
        ctx.beginPath(); 
        ctx.arc(posX, Y_CENTERED + yOffset, diameter / 2, 0, Math.PI*2); 
        ctx.fill();
    }
    ctx.globalAlpha = 1.0;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    if (now - lastReceiveTime > 1000) { currentSpeed = 0; isTimelineLocked = false; }
    if (gameStateName !== 'play' && gameStateName !== 'pause') { requestAnimationFrame(draw); return; }

    let currentTime = isTimelineLocked 
        ? lockedBaseTime + (now - lockedBaseRealTime) * lockedCurrentSpeed * SPEED_MULTIPLIER 
        : lastCommonLiveTime || 0;

    const pastMs = playheadX / scale + 200;
    const futureMs = (canvas.width - playheadX) / scale + 200;

    const cleanupThreshold = currentTime - pastMs - 5000;
    while (keyStrokes.length > 0 && (keyStrokes[0].endTime !== null && keyStrokes[0].endTime < cleanupThreshold)) {
        keyStrokes.shift();
    }

    // ──────── HIT WINDOWS — fully unclamped for OD ≤ 0 ────────
    let hitWindow50  = 199.5 - (beatmapOD * 10);
    let hitWindow100 = 139.5 - (beatmapOD * 8);
    let hitWindow300 = 79.5  - (beatmapOD * 6);

    const tosuLeeway = 350; 
    const hitErrorLeeway = 150;

    const pxPerMs = scale;
    const judgmentDiameterPx = Math.max(0, hitWindow50 * 2 * pxPerMs);

    // Miss detection & key-stroke handling
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

    // Beat lines / timing grid
    if (timingPoints.length > 0) {
        let activeTP = timingPoints[0];
        for (let tp of timingPoints) { 
            if (tp.uninherited && tp.time <= currentTime + futureMs) activeTP = tp; 
            else if (tp.time > currentTime + futureMs) break; 
        }
        const bl = activeTP.beatLength;
        if (bl > 1 && isFinite(bl)) {
            let t = Math.floor(((currentTime - pastMs) - activeTP.time) / bl) * bl + activeTP.time;
            while (t < currentTime + futureMs + bl) {
                const x = playheadX + (t - currentTime) * pxPerMs;
                if (x >= 0 && x <= canvas.width) {
                    const isBig = Math.round((t - activeTP.time) / bl) % 4 === 0;
                    ctx.beginPath(); 
                    ctx.strokeStyle = isBig ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';
                    ctx.lineWidth = isBig ? 2 : 1; 
                    ctx.moveTo(x, 0); 
                    ctx.lineTo(x, canvas.height); 
                    ctx.stroke();
                }
                t += bl;
            }
        }
    }

    for (let note of hitObjects) {
        if (note.endTime < currentTime - pastMs || note.startTime > currentTime + futureMs) continue;
        
        const xStart = playheadX + (note.startTime - currentTime) * pxPerMs;
        const xEnd   = playheadX + (note.endTime - currentTime) * pxPerMs;
        let alpha = xEnd < 100 ? Math.max(0, xEnd / 100) : 1;
        ctx.globalAlpha = Math.max(0.1, alpha);

        const col = ((useBeatmapCombos && beatmapComboColors.length > 0) ? beatmapComboColors : DEFAULT_COMBO_COLORS)[note.comboColorIndex % (useBeatmapCombos && beatmapComboColors.length ? beatmapComboColors.length : 4)];

        // ──────── LANE OFFSET (aligns with key-press lines) ────────
        let yOffset = 0;
        if (note.hitLane !== undefined && note.hitLane >= 0) {
            yOffset = (note.hitLane === 0 ? -1 : 1) * (KEY_BOX_SPACING / 2);
        }

        // Judgment meter bar
        if ((note.type === 'circle' || note.type === 'slider') && SHOW_JUDGMENT_BARS) {
            const barHeight = 32;
            const barY = Y_CENTERED + yOffset - barHeight / 2;
            const barX = xStart - (judgmentDiameterPx / 2);
            const barWidth = judgmentDiameterPx;

            if (barX < canvas.width + 100 && barX + barWidth > -100) {
                ctx.save();

                // Outer 50 window
                ctx.globalAlpha = note.isMissed ? 0.25 : 0.40;
                ctx.fillStyle = note.isMissed 
                    ? 'rgba(160, 160, 160, 0.7)' 
                    : `rgba(${col.r}, ${col.g}, ${col.b}, 0.5)`;
                ctx.fillRect(barX, barY, barWidth, barHeight);

                // Middle 100 window
                const half100 = Math.max(0, hitWindow100 * pxPerMs);
                ctx.globalAlpha = note.isMissed ? 0.35 : 0.55;
                ctx.fillStyle = note.isMissed 
                    ? 'rgba(200, 200, 100, 0.8)' 
                    : `rgba(${col.r}, ${col.g}, ${col.b}, 0.75)`;
                ctx.fillRect(xStart - half100, barY + 4, half100 * 2, barHeight - 8);

                // Inner 300 window
                const half300 = Math.max(0, hitWindow300 * pxPerMs);
                ctx.globalAlpha = note.isMissed ? 0.40 : 0.80;
                ctx.fillStyle = note.isMissed 
                    ? 'rgba(100, 255, 120, 0.9)' 
                    : `rgba(${col.r}, ${col.g}, ${col.b}, 1)`;
                ctx.fillRect(xStart - half300, barY + 8, half300 * 2, barHeight - 16);

                ctx.restore();
            }
        }

        if (note.type === 'slider') {
            let trackDiam = hasHitCircleTexture && hitCircleImg ? judgmentDiameterPx * 0.95 : 20;
            const styles = getSliderStyles(COLORIZE_SLIDER_BODY ? [col.r, col.g, col.b] : sliderTrackOverride, sliderBorder, note.isMissed);
            const sw = Math.abs(xEnd - xStart) + trackDiam * 2;
            
            if (sliderBuffer.width < sw || sliderBuffer.height < trackDiam * 2) {
                sliderBuffer.width = sw; sliderBuffer.height = trackDiam * 2;
            }
            sctx.clearRect(0, 0, sw, trackDiam * 2);

            const sP = {x: trackDiam, y: trackDiam}, eP = {x: sw - trackDiam, y: trackDiam};
            sctx.lineCap = 'round'; sctx.lineWidth = trackDiam; sctx.strokeStyle = styles.border;
            sctx.beginPath(); sctx.moveTo(sP.x, sP.y); sctx.lineTo(eP.x, eP.y); sctx.stroke();
            sctx.globalCompositeOperation = 'destination-out';
            sctx.lineWidth = trackDiam * 0.8; sctx.stroke();
            sctx.globalCompositeOperation = 'destination-over';
            sctx.globalAlpha = styles.alpha;
            const grad = sctx.createLinearGradient(0, sP.y - trackDiam*0.5, 0, sP.y + trackDiam*0.5);
            grad.addColorStop(0, `rgb(${styles.trackBaseRgb})`); grad.addColorStop(0.5, `rgb(${styles.trackHighlightRgb})`); grad.addColorStop(1, `rgb(${styles.trackBaseRgb})`);
            sctx.strokeStyle = grad; sctx.lineWidth = trackDiam * 0.8;
            sctx.beginPath(); sctx.moveTo(sP.x, sP.y); sctx.lineTo(eP.x, eP.y); sctx.stroke();
            
            sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(sliderBuffer, 0, 0, sw, trackDiam * 2, xStart - trackDiam, Y_CENTERED + yOffset - trackDiam, sw, trackDiam * 2);

            let currentBeatLength = 600;
            for (let tp of timingPoints) {
                if (tp.time > note.startTime) break;
                if (tp.uninherited) currentBeatLength = tp.beatLength;
            }
            const tickDelta = currentBeatLength / beatmapSliderTickRate;
            if (tickDelta > 10 && isFinite(tickDelta)) {
                let tickTime = note.startTime + tickDelta;
                const lastPossible = note.endTime - 36;
                const sliderDuration = note.endTime - note.startTime;

                while (tickTime < lastPossible) {
                    const frac = (tickTime - note.startTime) / sliderDuration;
                    if (frac >= 1) break;
                    const tickX = xStart + frac * (xEnd - xStart);

                    let tickCanvas = null;
                    if (note.isMissed && hasSliderTickTexture) {
                        tickCanvas = sliderTickImg;
                    } else if (hasSliderTickTexture) {
                        const activeTinted = (useBeatmapCombos && beatmapTintedSliderTicks.length > 0) ? beatmapTintedSliderTicks : defaultTintedSliderTicks;
                        tickCanvas = activeTinted[note.comboColorIndex % activeTinted.length];
                    }

                    if (tickCanvas) {
                        const refWidth = hasHitCircleTexture && hitCircleImg ? hitCircleImg.width : 260;
                        const tickScaleFactor = 0.65 * (judgmentDiameterPx / refWidth);
                        const tickW = tickCanvas.width * tickScaleFactor;
                        const tickH = tickCanvas.height * tickScaleFactor;
                        ctx.drawImage(tickCanvas, tickX - tickW / 2, Y_CENTERED + yOffset - tickH / 2, tickW, tickH);
                    } else {
                        ctx.fillStyle = note.isMissed ? `rgba(100,100,100,0.5)` : `rgb(${col.r},${col.g},${col.b})`;
                        ctx.beginPath();
                        ctx.arc(tickX, Y_CENTERED + yOffset, 5.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    tickTime += tickDelta;
                }
            }
        } else if (note.type === 'spinner') {
            ctx.fillStyle = note.isMissed ? `rgba(100,100,100,0.3)` : `rgba(${col.r},${col.g},${col.b},0.6)`;
            ctx.fillRect(xStart, Y_CENTERED - SPINNER_BAR_HEIGHT/2, xEnd - xStart, SPINNER_BAR_HEIGHT);
        }

        if (note.type === 'circle' || note.type === 'slider') {
            drawHitCircle(xStart, note.comboColorIndex, note.isMissed, judgmentDiameterPx, yOffset);
        }
        ctx.globalAlpha = 1;
    }

    // Key visualization (scale-aware)
    ctx.lineWidth = KEY_LINE_THICKNESS;
    ctx.lineCap = 'round';
    const gap = 4;
    const radius = KEY_LINE_THICKNESS / 2;
    const maxLineX = playheadX - gap - radius; 

    for (let stroke of keyStrokes) {
        let sTime = stroke.startTime || currentTime;
        let eTime = stroke.endTime !== null ? stroke.endTime : currentTime;
        
        if (eTime < currentTime - pastMs) continue;
        if (sTime > currentTime + futureMs) continue;

        let xStart = playheadX + (sTime - currentTime) * pxPerMs;
        let xEnd = playheadX + (eTime - currentTime) * pxPerMs;

        let lane = (stroke.key === 'k1' || stroke.key === 'm1') ? 0 : 1;
        let y = Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);

        let drawXStart = Math.min(xStart, maxLineX);
        let drawXEnd = Math.min(xEnd, maxLineX);

        if (drawXStart >= drawXEnd) drawXStart = drawXEnd - 0.1; 

        ctx.strokeStyle = lane === 0 ? 'rgba(255, 105, 180, 0.8)' : 'rgba(0, 255, 255, 0.8)';
        ctx.beginPath(); ctx.moveTo(drawXStart, y); ctx.lineTo(drawXEnd, y); ctx.stroke();
    }

    // Key boxes at playhead
    for (let lane = 0; lane < 2; lane++) {
        let isDown = false;
        if (lane === 0 && (keyBoxStates['k1'] || keyBoxStates['m1'])) isDown = true;
        if (lane === 1 && (keyBoxStates['k2'] || keyBoxStates['m2'])) isDown = true;

        let y = Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);
        let size = KEY_BOX_SIZE;
        let boxX = playheadX;
        let boxY = y - size / 2;

        ctx.fillStyle = isDown ? (lane === 0 ? 'rgba(255, 105, 180, 1)' : 'rgba(0, 255, 255, 1)') : 'rgba(40, 40, 40, 0.8)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2; ctx.lineCap = 'butt'; 
        ctx.fillRect(boxX, boxY, size, size);
        ctx.strokeRect(boxX, boxY, size, size);
    }

    // Playhead
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(playheadX, Y_CENTERED - 45); ctx.lineTo(playheadX, Y_CENTERED + 45); ctx.stroke();
    ctx.fillStyle = '#0ff';
    
    renderBeatmapTitle();
    
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    
    // ──────── LIVE DEBUG: shows exactly what the code is calculating ────────
    const debugInfo = `${(currentTime/1000).toFixed(2)}s | Speed: ${currentSpeed.toFixed(2)}x | OD: ${beatmapOD.toFixed(1)} | 50w: ${hitWindow50.toFixed(1)}ms | diam: ${judgmentDiameterPx.toFixed(0)}px | ${isTimelineLocked ? 'LOCKED ✓' : 'syncing'}`;
    ctx.fillText(debugInfo, 15, canvas.height - 10);

    if (SHOW_DEBUG_PANEL) {
         ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(canvas.width - 300, 0, 300, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText('DEBUG PANEL', canvas.width - 290, 25);
        let y = 45;
        ctx.fillText(`Game State: ${gameStateName}`, canvas.width - 290, y); y += 20;
        ctx.fillText(`Key States:`, canvas.width - 290, y); y += 20;
        for (const key in keyBoxStates) {
            ctx.fillText(`${key}: ${keyBoxStates[key] ? 'DOWN' : 'UP'}`, canvas.width - 290, y);
            y += 20;
        }
        ctx.fillText(`Active Strokes:`, canvas.width - 290, y); y += 20;
        for (const key in activeStrokes) {
            const stroke = activeStrokes[key];
            ctx.fillText(`${key}: ${stroke ? 'ACTIVE' : 'INACTIVE'}`, canvas.width - 290, y);
            y += 20;
        }
        ctx.fillText(`Key Strokes Count: ${keyStrokes.length}`, canvas.width - 290, y); y += 20;
        if (keyStrokes.length > 0) {
            ctx.fillText(`Last Stroke:`, canvas.width - 290, y); y += 20;
            const lastStroke = keyStrokes[keyStrokes.length - 1];
            ctx.fillText(`  Key: ${lastStroke.key}`, canvas.width - 290, y); y += 20;
            ctx.fillText(`  Start: ${lastStroke.startTime}`, canvas.width - 290, y); y += 20;
            ctx.fillText(`  End: ${lastStroke.endTime !== null ? lastStroke.endTime : 'ACTIVE'}`, canvas.width - 290, y);
        // debug panel unchanged
        }
    }

    requestAnimationFrame(draw);
}