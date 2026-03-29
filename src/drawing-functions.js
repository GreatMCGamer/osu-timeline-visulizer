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
            const activeTinted = tintedHitCircles; // now the single array
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
                    const col = comboColors[colorIndex % comboColors.length];
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
        const col = comboColors[colorIndex % comboColors.length];
        ctx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
    }
    ctx.beginPath(); 
    ctx.arc(posX, Y_CENTERED + yOffset, diameter / 2, 0, Math.PI*2); 
    ctx.fill();
}

function getHitCircleY(note) {
    // If it's unjudged, missed, or has no lane assigned, keep it in the center
    if (!note.judged || note.isMissed || note.hitLane === undefined || note.hitLane === -1) {
        return Y_CENTERED;
    }

    // Move to the exact lane it was hit in
    const laneDist = KEY_BOX_SPACING / 2;
    return note.hitLane === 0 ? Y_CENTERED - laneDist : Y_CENTERED + laneDist;
}

function drawSmoothSlider(note, xStart, xEnd, currentTime, pxPerMs, judgmentDiameterPx) {
    const col = comboColors[note.comboColorIndex % comboColors.length];
    
    const trackColor = (typeof sliderTrackOverride !== 'undefined' && sliderTrackOverride) 
        ? sliderTrackOverride 
        : [col.r, col.g, col.b];
        
    const borderColor = (typeof sliderBorder !== 'undefined' && sliderBorder) 
        ? sliderBorder 
        : [255, 255, 255];
        
    const styles = getSliderStyles(trackColor, borderColor, note.isMissed);
    
    const trackDiam = (judgmentDiameterPx && judgmentDiameterPx > 0) 
        ? judgmentDiameterPx * 0.92 
        : 35;

    // ──────── BUILD SNAKY PATH (unchanged) ────────
    const path = new Path2D();
    const step = 4;
    path.moveTo(xStart, getSnakyY(note, note.startTime));
    for (let t = note.startTime + step; t <= note.endTime; t += step) {
        path.lineTo(playheadX + (t - currentTime) * pxPerMs, getSnakyY(note, t));
    }
    path.lineTo(xEnd, getSnakyY(note, note.endTime));

    // ──────── SCRATCH CANVAS SETUP (unchanged) ────────
    if (!window.sliderScratch) {
        window.sliderScratch = document.createElement('canvas');
        window.sliderCtx = window.sliderScratch.getContext('2d');
    }
    const sCanvas = window.sliderScratch;
    const sCtx = window.sliderCtx;
    if (sCanvas.width !== canvas.width || sCanvas.height !== canvas.height) {
        sCanvas.width = canvas.width;
        sCanvas.height = canvas.height;
    }
    sCtx.clearRect(0, 0, sCanvas.width, sCanvas.height);
    sCtx.lineCap = 'round';
    sCtx.lineJoin = 'round';

    const bodyWidth = trackDiam * 0.82;   // main track body width (inside border)

    // 1. Outer border (always solid — works with or without texture)
    sCtx.lineWidth = trackDiam;
    sCtx.strokeStyle = styles.border;
    sCtx.stroke(path);

    // 2. BODY: Texture OR layered gradient fallback
    const activeTinted = tintedSliderBodies;

    const tintedBodyCanvas = activeTinted 
        ? activeTinted[note.comboColorIndex % activeTinted.length] 
        : null;

    if (hasSliderBodyTexture && tintedBodyCanvas && tintedBodyCanvas.complete) {
        // ──────── TEXTURE MODE (authentic osu! sliderbody) ────────
        const pattern = sCtx.createPattern(tintedBodyCanvas, 'repeat');
        if (pattern) {
            sCtx.lineWidth = bodyWidth;
            sCtx.strokeStyle = pattern;
            sCtx.stroke(path);
        }
    } else {
        // ──────── LAYERED GRADIENT FALLBACK (your tuned 4-layer version) ────────
        // Solid base track body
        sCtx.lineWidth = bodyWidth;
        sCtx.strokeStyle = `rgb(${styles.trackBaseRgb})`;
        sCtx.stroke(path);

        // Soft radial gradient layers (smooth center glow)
        const layers = [
            { widthFactor: 1.0, alpha: 0.05, brightness: 0.10 }, // Gentle start
            { widthFactor: 0.9, alpha: 0.50, brightness: 0.18 }, // Small, natural jump
            { widthFactor: 0.8, alpha: 0.50, brightness: 0.32 },
            { widthFactor: 0.7, alpha: 0.50, brightness: 0.48 }, // Building momentum
            { widthFactor: 0.6, alpha: 0.50, brightness: 0.62 },
            { widthFactor: 0.5, alpha: 0.50, brightness: 0.75 }, // Crossing the midpoint
            { widthFactor: 0.4, alpha: 0.50, brightness: 0.85 },
            { widthFactor: 0.3, alpha: 0.50, brightness: 0.92 },
            { widthFactor: 0.2, alpha: 0.50, brightness: 0.97 }, // Still climbing...
            { widthFactor: 0.1, alpha: 0.50, brightness: 1.00 }  // Reaches peak at the very end
        ];

        for (const layer of layers) {
            const w = bodyWidth * layer.widthFactor;
            const base = styles.trackBaseRgb.split(',').map(Number);
            const high = styles.trackHighlightRgb.split(',').map(Number);
            const r = Math.round(base[0] * (1 - layer.brightness) + high[0] * layer.brightness);
            const g = Math.round(base[1] * (1 - layer.brightness) + high[1] * layer.brightness);
            const b = Math.round(base[2] * (1 - layer.brightness) + high[2] * layer.brightness);

            sCtx.globalAlpha = layer.alpha;
            sCtx.lineWidth = w;
            sCtx.strokeStyle = `rgb(${r},${g},${b})`;
            sCtx.stroke(path);
        }
        sCtx.globalAlpha = 1.0;
    }

    // ──────── RENDER TO MAIN CANVAS (unchanged) ────────
    ctx.globalAlpha = styles.alpha;
    ctx.drawImage(sCanvas, 0, 0);
    ctx.globalAlpha = 1.0;
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

        const col = comboColors[note.comboColorIndex % comboColors.length];

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
                    tickCanvas = tintedSliderTicks[note.comboColorIndex % tintedSliderTicks.length];
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
            // Sliders snake, Circles snap to their hit lane
            const yPos = note.type === 'slider' 
                ? getSnakyY(note, note.startTime) 
                : getHitCircleY(note);
                
            drawHitCircle(xStart, note.comboColorIndex, note.isMissed, judgmentDiameterPx, yPos - Y_CENTERED);
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