// ──────── DRAWING FUNCTIONS ────────
// Fully scale-aware rendering (pxPerMs = scale).
// OD ≤ 0 (including Half-Time edge cases) now correctly gives LARGER windows.

function drawHitCircle(posX, colorIndex, isMissed = false, diameter = 20, yOffset = 0) {
    if (posX < -100 || posX > canvas.width + 100) return;
    
    ctx.globalAlpha = isMissed ? 0.4 : 1.0;

    // ──────── NEW: ONLY use the pre-combined image (no separate overlay draw) ────────
    if (hasHitCircleTexture) {
        let toDraw = null;

        if (isMissed) {
            toDraw = hitCircleCombinedImg;                    // non-tinted + overlay
        } else {
            const activeTinted = (useBeatmapCombos && beatmapTintedHitCircles.length > 0) 
                ? beatmapTintedHitCircles 
                : defaultTintedHitCircles;
            toDraw = activeTinted[colorIndex % activeTinted.length];
        }

        if (toDraw) {
            const w = diameter;
            const h = diameter;
            const dx = posX - w/2;
            const dy = Y_CENTERED + yOffset - h/2;
            ctx.drawImage(toDraw, dx, dy, w, h);
        } else {
            // Extremely rare fallback (should never hit if hasHitCircleTexture is true)
            drawFallbackCircle(posX, colorIndex, isMissed, diameter, yOffset);
        }
    } else {
        // Original procedural fallback when no texture is loaded
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

// Tiny helper for the ultra-rare case where combined image is missing
function drawFallbackCircle(posX, colorIndex, isMissed, diameter, yOffset) {
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

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();
    if (now - lastReceiveTime > 1000) { currentSpeed = 0;}
    if (gameStateName !== 'play' && gameStateName !== 'pause') { requestAnimationFrame(draw); return; }

    // The position of every object is now strictly tied to the last packet from wsPrecise.
    let currentTime = lastPreciseTime || lastCommonLiveTime || 0;

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

        // Judgment meter bar
        if ((note.type === 'circle' || note.type === 'slider') && SHOW_JUDGMENT_BARS) {
            const barHeight = 32;
            const barY = Y_CENTERED - barHeight / 2;
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
            drawSmoothSlider(note, xStart, xEnd, currentTime, pxPerMs, judgmentDiameterPx);
            
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
                    
                    // Use snaky Y position for the tick
                    const tickY = getSnakyY(note, tickTime);

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
                        ctx.drawImage(tickCanvas, tickX - tickW / 2, tickY - tickH / 2, tickW, tickH);
                    } else {
                        ctx.fillStyle = note.isMissed ? `rgba(100,100,100,0.5)` : `rgb(${col.r},${col.g},${col.b})`;
                        ctx.beginPath();
                        ctx.arc(tickX, tickY, 5.5, 0, Math.PI * 2);
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
            // Use snaky Y position for hit circles
            const circleY = getSnakyY(note, note.startTime);
            drawHitCircle(xStart, note.comboColorIndex, note.isMissed, judgmentDiameterPx, circleY - Y_CENTERED);
        }
        ctx.globalAlpha = 1;
    }

    drawKeyHistory(currentTime, pastMs, futureMs, pxPerMs);
    drawKeyBoxes();

    // Playhead
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(playheadX, Y_CENTERED - 45); ctx.lineTo(playheadX, Y_CENTERED + 45); ctx.stroke();
    ctx.fillStyle = '#0ff';
    
    renderBeatmapTitle();
    
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    
    // ──────── LIVE DEBUG: shows exactly what the code is calculating ────────
    const debugInfo = `${(currentTime/1000).toFixed(2)}s | Speed: ${currentSpeed.toFixed(2)}x | OD: ${beatmapOD.toFixed(1)} | 50w: ${hitWindow50.toFixed(1)}ms | diam: ${judgmentDiameterPx.toFixed(0)}px | currentLiveTime: ${lastCommonLiveTime.toFixed(0)}ms | preciseWebSocketTime: ${preciseWebSocketTime.toFixed(0)}ms`;
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
        ctx.fillText(`currentLiveTime: ${lastCommonLiveTime.toFixed(0)}ms`, canvas.width - 290, y); y += 20;
        ctx.fillText(`lastPreciseTime: ${lastPreciseTime.toFixed(0)}ms`, canvas.width - 290, y); y += 20;
    }

    requestAnimationFrame(draw);
}