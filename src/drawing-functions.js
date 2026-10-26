// â”€â”€â”€â”€â”€â”€â”€â”€ DRAWING FUNCTIONS â”€â”€â”€â”€â”€â”€â”€â”€
// Fully scale-aware rendering (pxPerMs = scale).
// OD â‰¤ 0 (including Half-Time edge cases) now correctly gives LARGER windows.

function drawHitCircle(posX, colorIndex, isMissed = false, diameter = 20, yOffset = 0) {
    if (posX < -100 || posX > canvas.width + 100) return;
    
    ctx.globalAlpha = isMissed ? 0.4 : 1.0;

    // â”€â”€â”€â”€â”€â”€â”€â”€ NEW: ONLY use the pre-combined image (no separate overlay draw) â”€â”€â”€â”€â”€â”€â”€â”€
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

// Static gradient layer configurations to avoid allocations inside the 60 FPS render loop
var SLIDER_GRADIENT_LAYERS = window.SLIDER_GRADIENT_LAYERS || [
    { widthFactor: 1.0, alpha: 0.05, brightness: 0.10 },
    { widthFactor: 0.9, alpha: 0.50, brightness: 0.18 },
    { widthFactor: 0.8, alpha: 0.50, brightness: 0.32 },
    { widthFactor: 0.7, alpha: 0.50, brightness: 0.48 },
    { widthFactor: 0.6, alpha: 0.50, brightness: 0.62 },
    { widthFactor: 0.5, alpha: 0.50, brightness: 0.75 },
    { widthFactor: 0.4, alpha: 0.50, brightness: 0.85 },
    { widthFactor: 0.3, alpha: 0.50, brightness: 0.92 },
    { widthFactor: 0.2, alpha: 0.50, brightness: 0.97 },
    { widthFactor: 0.1, alpha: 0.50, brightness: 1.00 }
];
window.SLIDER_GRADIENT_LAYERS = SLIDER_GRADIENT_LAYERS;

function drawSmoothSlider(note, xStart, xEnd, currentTime, pxPerMs, judgmentDiameterPx, visMissed) {
    // T18: visMissed = the REVEALED miss state (gated on crossing the delayed
    // playhead in draw()); undefined → fall back to the note's real state.
    const _im = (typeof visMissed === 'boolean') ? visMissed : note.isMissed;
    const col = comboColors[note.comboColorIndex % comboColors.length];
    
    const trackColor = (typeof sliderTrackOverride !== 'undefined' && sliderTrackOverride) 
        ? sliderTrackOverride 
        : [col.r, col.g, col.b];
        
    const borderColor = (typeof sliderBorder !== 'undefined' && sliderBorder) 
        ? sliderBorder 
        : [255, 255, 255];
        
    // T22: a broken slider (head hit + body break) grays the WHOLE track (head
    // included) via the base pass; the head keeps its lane and the body still snakes.
    // A whole-missed slider also uses the gray base pass.
    const styles = getSliderStyles(trackColor, borderColor, (note.responsibleBreak || _im)); // T22: a broken slider grays the WHOLE track (head included); the head keeps its lane and the body still snakes
    
    const trackDiam = (judgmentDiameterPx && judgmentDiameterPx > 0) 
        ? judgmentDiameterPx * 0.92 
        : 35;

    // â”€â”€â”€â”€â”€â”€â”€â”€ BUILD SNAKY PATH â”€â”€â”€â”€â”€â”€â”€â”€
    // T22: a broken slider grays the WHOLE track (head included) via the base pass —
    // no more head/tail split. The head keeps its lane and the body still snakes.
    const buildPath = (t0, t1) => {
        const p = new Path2D();
        const step = 4;
        p.moveTo(playheadX + (t0 - currentTime) * pxPerMs, getSnakyY(note, t0, currentTime));
        for (let t = t0 + step; t <= t1; t += step) {
            p.lineTo(playheadX + (t - currentTime) * pxPerMs, getSnakyY(note, t, currentTime));
        }
        p.lineTo(playheadX + (t1 - currentTime) * pxPerMs, getSnakyY(note, t1, currentTime));
        return p;
    };
    const path = buildPath(note.startTime, note.endTime);

    // â”€â”€â”€â”€â”€â”€â”€â”€ SCRATCH CANVAS SETUP (unchanged) â”€â”€â”€â”€â”€â”€â”€â”€
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

    // 1. Outer border (always solid â€” works with or without texture)
    sCtx.lineWidth = trackDiam;
    sCtx.strokeStyle = styles.border;
    sCtx.stroke(path);

    // 2. BODY: Texture OR layered gradient fallback
    const activeTinted = tintedSliderBodies;

    const tintedBodyCanvas = activeTinted 
        ? activeTinted[note.comboColorIndex % activeTinted.length] 
        : null;

    if (hasSliderBodyTexture && tintedBodyCanvas) {
        // â”€â”€â”€â”€â”€â”€â”€â”€ TEXTURE MODE (authentic osu! sliderbody) â”€â”€â”€â”€â”€â”€â”€â”€
        const pattern = sCtx.createPattern(tintedBodyCanvas, 'repeat');
        if (pattern) {
            sCtx.lineWidth = bodyWidth;
            sCtx.strokeStyle = pattern;
            sCtx.stroke(path);
        }
    } else {
        // â”€â”€â”€â”€â”€â”€â”€â”€ LAYERED GRADIENT FALLBACK (your tuned 4-layer version) â”€â”€â”€â”€â”€â”€â”€â”€
        // Solid base track body
        sCtx.lineWidth = bodyWidth;
        sCtx.strokeStyle = `rgb(${styles.trackBaseRgb})`;
        sCtx.stroke(path);

        // Soft radial gradient layers (smooth center glow with zero allocations)
        const baseR = styles.baseR !== undefined ? styles.baseR : 255;
        const baseG = styles.baseG !== undefined ? styles.baseG : 255;
        const baseB = styles.baseB !== undefined ? styles.baseB : 255;
        const highR = styles.highR !== undefined ? styles.highR : 255;
        const highG = styles.highG !== undefined ? styles.highG : 255;
        const highB = styles.highB !== undefined ? styles.highB : 255;

        for (let li = 0; li < SLIDER_GRADIENT_LAYERS.length; li++) {
            const layer = SLIDER_GRADIENT_LAYERS[li];
            const w = bodyWidth * layer.widthFactor;
            const r = Math.round(baseR * (1 - layer.brightness) + highR * layer.brightness);
            const g = Math.round(baseG * (1 - layer.brightness) + highG * layer.brightness);
            const b = Math.round(baseB * (1 - layer.brightness) + highB * layer.brightness);

            sCtx.globalAlpha = layer.alpha;
            sCtx.lineWidth = w;
            sCtx.strokeStyle = `rgb(${r},${g},${b})`;
            sCtx.stroke(path);
        }
        sCtx.globalAlpha = 1.0;
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€ RENDER TO MAIN CANVAS â”€â”€â”€â”€â”€â”€â”€â”€
    ctx.globalAlpha = styles.alpha;
    ctx.drawImage(sCanvas, 0, 0);
    ctx.globalAlpha = 1.0;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = performance.now();

    const state = (gameStateName || '').toLowerCase();
    const isPlay = (state === 'play' || state === 'playing');
    const isPause = (state === 'pause' || state === 'paused');
    const isInGameplay = isPlay || isPause;

    // Timeline is hidden only outside gameplay (Song Select, Menus, Results) — reliably detected by game state.
    if (!isInGameplay) {
        if (SHOW_DEBUG_PANEL) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(canvas.width - 300, 0, 300, canvas.height);
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.fillText('DEBUG PANEL (HIDDEN IN SONG SELECT)', canvas.width - 290, 25);
            ctx.fillText(`Game State: ${gameStateName}`, canvas.width - 290, 45);
        }
        requestAnimationFrame(draw);
        return;
    }

    // Check packet freshness
    if (now - lastReceiveTime > 1500) {
        currentSpeed = 0;
    } else if (currentSpeed === 0 && !isPause) {
        currentSpeed = 1.0;
    }

    // Time-freeze pause detection: freeze when the same map time is reported for 2 consecutive common packets.
    const isTimeFrozen = commonPacketsSinceAdvance >= 2;

    // Calculate current live timeline position
    let liveTimeNow = 0;
    if (isTimeFrozen) {
        // Paused: lock strictly to the exact frozen position reported by tosu (no extrapolation → no jerking).
        liveTimeNow = lastCommonLiveTime || 0;
    } else if (lastCommonLiveTime > 0) {
        // Smooth interpolation from websocket liveTime
        const dt = (now - lastCommonRealTime) * currentSpeed;
        const clampedDt = Math.min(Math.max(0, dt), 1000);
        liveTimeNow = lastCommonLiveTime + clampedDt;
    } else {
        liveTimeNow = 0;
    }

    // T17: render 200ms (2 common packets) BEHIND live time — anti-flicker.
    // Everything behind the playhead has settled: hit errors from both streams,
    // miss/break events and their note assignment are final. Only genuine
    // skip/not-hit misses can still arrive into the rendered region.
    const RENDER_DELAY_MS = 200;
    const currentTime = Math.max(0, liveTimeNow - RENDER_DELAY_MS);

    const pxPerMs = scale;
    const pastMs = playheadX / scale + 200;
    const futureMs = (canvas.width - playheadX) / scale + 200;

    const cleanupThreshold = currentTime - pastMs - 5000;
    while (keyStrokes.length > 0 && (keyStrokes[0].endTime !== null && keyStrokes[0].endTime < cleanupThreshold)) {
        keyStrokes.shift();
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€ HIT WINDOWS â€” fully unclamped for OD â‰¤ 0 â”€â”€â”€â”€â”€â”€â”€â”€
    const currentOD = (typeof beatmapOD === 'number' && !isNaN(beatmapOD)) ? beatmapOD : 8.0;
    hitWindow50  = 199.5 - (currentOD * 10);
    hitWindow100 = 139.5 - (currentOD * 8);
    hitWindow300 = 79.5  - (currentOD * 6);

    const tosuLeeway = 350; 
    const judgmentDiameterPx = Math.max(0, hitWindow50 * 2 * pxPerMs);

    // T17: per-frame miss detection REMOVED — rejudgeTimeline (websocket-connection.js)
    // derives every miss from the missEvents/breakEvents evidence. The old comboDropActive
    // per-frame gate is dead.

    // Beat lines / timing grid
    if (timingPoints.length > 0) {
        let activeTP = timingPoints[0];
        for (let i = 0; i < timingPoints.length; i++) { 
            const tp = timingPoints[i];
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

    // T7 DEBUG: per-note number labels, drawn in a final topmost pass below.
    const debugNoteLabels = [];

    // Render Hit Objects (circles, sliders, spinners)
    for (let i = 0; i < hitObjects.length; i++) {
        const note = hitObjects[i];
        if (note.endTime < currentTime - pastMs || note.startTime > currentTime + futureMs) continue;
        
        const xStart = playheadX + (note.startTime - currentTime) * pxPerMs;
        const xEnd   = playheadX + (note.endTime - currentTime) * pxPerMs;
        let alpha = xEnd < 100 ? Math.max(0, xEnd / 100) : 1;
        ctx.globalAlpha = Math.max(0.1, alpha);

        const col = (comboColors.length > 0)
            ? comboColors[note.comboColorIndex % comboColors.length]
            : DEFAULT_COMBO_COLORS[0];

        // T18: the judgment VISUALS (hit lane, gray) reveal only when the note has
        // CROSSED the (delayed) playhead — not the instant the judgment lands in
        // real time (that would be ~200ms early). Debug labels may still show ahead.
        const _crossed = note.startTime <= currentTime;
        const _visMissed = _crossed ? note.isMissed : false;

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
            // T18: the slider's miss/break visuals reveal only after crossing the
            // playhead (a broken slider's head→break keeps its hit style — the
            // split is inside drawSmoothSlider).
            drawSmoothSlider(note, xStart, xEnd, currentTime, pxPerMs, judgmentDiameterPx, _visMissed);

            // T17: ticks after the break moment render gray (the body split is inside drawSmoothSlider).
            const tBreakTick = (note.responsibleBreak && note.responsibleBreak.time >= note.startTime && note.responsibleBreak.time <= note.endTime) ? note.responsibleBreak.time : null;
            let currentBeatLength = 600;
            for (let tpi = 0; tpi < timingPoints.length; tpi++) {
                const tp = timingPoints[tpi];
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
                    const tickY = getSnakyY(note, tickTime, currentTime);

                    let tickCanvas = null;
                    const _tickMissed = _visMissed || (tBreakTick !== null && tickTime > tBreakTick); // T17/T18: tail ticks gray, revealed on crossing
                    if (_tickMissed && hasSliderTickTexture) {
                        tickCanvas = sliderTickImg;
                    } else if (hasSliderTickTexture && tintedSliderTicks.length > 0) {
                        tickCanvas = tintedSliderTicks[note.comboColorIndex % tintedSliderTicks.length];
                    }

                    if (tickCanvas) {
                        const refWidth = hasHitCircleTexture && hitCircleImg ? hitCircleImg.width : 260;
                        const tickScaleFactor = 0.65 * (judgmentDiameterPx / refWidth);
                        const tickW = tickCanvas.width * tickScaleFactor;
                        const tickH = tickCanvas.height * tickScaleFactor;
                        ctx.drawImage(tickCanvas, tickX - tickW / 2, tickY - tickH / 2, tickW, tickH);
                    } else {
                        ctx.fillStyle = _tickMissed ? `rgba(100,100,100,0.5)` : `rgb(${col.r},${col.g},${col.b})`;
                        ctx.beginPath();
                        ctx.arc(tickX, tickY, 5.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    tickTime += tickDelta;
                }
            }
        } else if (note.type === 'spinner') {
            ctx.fillStyle = _visMissed ? `rgba(100,100,100,0.3)` : `rgba(${col.r},${col.g},${col.b},0.6)`; // T18: revealed on crossing
            ctx.fillRect(xStart, Y_CENTERED - SPINNER_BAR_HEIGHT/2, xEnd - xStart, SPINNER_BAR_HEIGHT);
        }

        if (note.type === 'circle' || note.type === 'slider') {
            // T18: a circle reveals its hit lane only after crossing the playhead.
            const yPos = note.type === 'slider'
                ? getSnakyY(note, note.startTime, currentTime)
                : (_crossed ? getHitCircleY(note) : Y_CENTERED);

            drawHitCircle(xStart, note.comboColorIndex, _visMissed || !!note.responsibleBreak, judgmentDiameterPx, yPos - Y_CENTERED); // T25: a body-break slider's head circle grays too (not just the track)

        }

        // T7 DEBUG: collect per-note numbers for a FINAL topmost pass (drawn after the
        // playhead so a nearby note's circle can never paint over them).
        if (note.type === 'circle' || note.type === 'slider') {
            const _judgeT = (typeof note.actualHitTime !== 'undefined' && note.actualHitTime !== null) ? note.actualHitTime.toFixed(0) : '-';
            const _drift = (typeof note.driftMs !== 'undefined' && note.driftMs !== null) ? note.driftMs.toFixed(1) : '-';
            const _err = (typeof note.hitError !== 'undefined' && note.hitError !== null) ? note.hitError.toFixed(0) : '-';
            const _judgedBy = (typeof note.judgedBy !== 'undefined') ? note.judgedBy : '-';
            debugNoteLabels.push({ x: xStart, t: note.startTime.toFixed(0), j: _judgeT, e: _err, d: _drift, s: _judgedBy });
        }
        ctx.globalAlpha = 1;
    }

    drawKeyHistory(currentTime, pastMs, futureMs, pxPerMs);
    drawKeyBoxes(liveTimeNow); // T18: boxes reveal when the press crosses the delayed playhead

    // Playhead line
    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(playheadX, Y_CENTERED - 45); ctx.lineTo(playheadX, Y_CENTERED + 45); ctx.stroke();
    ctx.fillStyle = '#0ff';
    
    renderBeatmapTitle();
    
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    
    // Live debug output
    const safeTime = (typeof currentTime === 'number' && !isNaN(currentTime)) ? currentTime : 0;
    const safeOD = (typeof beatmapOD === 'number' && !isNaN(beatmapOD)) ? beatmapOD : 8.0;
    const safe50w = (typeof hitWindow50 === 'number' && !isNaN(hitWindow50)) ? hitWindow50 : 119.5;
    const safeLiveTime = (typeof lastCommonLiveTime === 'number' && !isNaN(lastCommonLiveTime)) ? lastCommonLiveTime : 0;
    const safeLiveNow = safeLiveTime + ((typeof lastCommonRealTime === 'number' && lastCommonRealTime > 0) ? (now - lastCommonRealTime) * currentSpeed : 0); // T17: undelayed live time
    
    const debugInfo = `${(safeTime/1000).toFixed(2)}s | State: ${gameStateName || 'unknown'} | OD: ${safeOD.toFixed(1)} | 50w: ${safe50w.toFixed(1)}ms | liveTime: ${safeLiveTime.toFixed(0)}ms | drift: ${((typeof hitErrorDriftSamples !== 'undefined' && hitErrorDriftSamples.length) ? (hitErrorDriftSamples.reduce((a,b)=>a+b,0)/hitErrorDriftSamples.length).toFixed(1) : '0.0')}ms (${(typeof hitErrorDriftSamples !== 'undefined' ? hitErrorDriftSamples.length : 0)}/10) | live: ${safeLiveNow.toFixed(0)}ms`;
    ctx.fillText(debugInfo, 15, canvas.height - 10);

    if (SHOW_DEBUG_PANEL) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(canvas.width - 300, 0, 300, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText('DEBUG PANEL', canvas.width - 290, 25);
        let y = 45;
        ctx.fillText(`Game State: ${gameStateName || 'unknown'}`, canvas.width - 290, y); y += 20;
        ctx.fillText(`Key States:`, canvas.width - 290, y); y += 20;
        for (const key in keyBoxStates) {
            ctx.fillText(`${key}: ${keyBoxStates[key] ? 'DOWN' : 'UP'} (count: ${lastCounts[key] || 0})`, canvas.width - 290, y);
            y += 20;
        }
        ctx.fillText(`liveTime: ${safeLiveTime.toFixed(0)}ms`, canvas.width - 290, y); y += 20;
        ctx.fillText(`Frozen: ${commonPacketsSinceAdvance >= 2 ? 'YES' : 'no'} (packets: ${commonPacketsSinceAdvance})`, canvas.width - 290, y); y += 20;
    }


    // T7 DEBUG: bright-red miss counter (bottom-right) — gated by SHOW_T7_DEBUG
    if (typeof SHOW_T7_DEBUG !== 'undefined' && SHOW_T7_DEBUG) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#ff2020';
        ctx.textAlign = 'right';
        // T17: judgment-index summary — WHAT judged each note (the array's state).
        const _jb = { 'precise-hit-error': 0, 'common-hit-error': 0, 'miss-event': 0, 'break-event': 0, 'button-press': 0, 'none': 0 };
        for (let _si = 0; _si < hitObjects.length; _si++) {
            const _s = hitObjects[_si].judgedBy;
            if (_jb[_s] !== undefined) _jb[_s]++;
        }
        ctx.font = '12px monospace';
        ctx.fillStyle = '#00ff41';
        ctx.fillText(`precise:${_jb['precise-hit-error']} common:${_jb['common-hit-error']} miss:${_jb['miss-event']} break:${_jb['break-event']} press:${_jb['button-press']} none:${_jb['none']} | ev m:${missEvents.length} b:${breakEvents.length}`, canvas.width - 15, canvas.height - 34);
        ctx.fillText('MISSES: ' + (typeof ourDetectedMissCount !== 'undefined' ? ourDetectedMissCount : 0), canvas.width - 15, canvas.height - 12);
        ctx.restore();
    }

    // T7 DEBUG: per-note numbers — FINAL topmost pass (drawn after the playhead so
    // nothing paints over them). Gated by SHOW_T7_DEBUG.
    if (typeof SHOW_T7_DEBUG !== 'undefined' && SHOW_T7_DEBUG && debugNoteLabels.length > 0) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.font = '11px monospace';
        ctx.fillStyle = '#00ff41';
        ctx.textAlign = 'left';
        for (let _di = 0; _di < debugNoteLabels.length; _di++) {
            const _dl = debugNoteLabels[_di];
            // T17 rows: t=startTime, j=hitTime, e=hitError, d=drift, s=judgedBy (judgment index)
            ctx.fillText(_dl.t, _dl.x, Y_CENTERED - 84);
            ctx.fillText(_dl.j, _dl.x, Y_CENTERED - 72);
            ctx.fillText(_dl.e, _dl.x, Y_CENTERED - 60);
            ctx.fillText(_dl.d, _dl.x, Y_CENTERED - 48);
            ctx.fillText(_dl.s, _dl.x, Y_CENTERED - 36);
        }
        ctx.restore();
    }
    requestAnimationFrame(draw);
}

window.draw = draw;
