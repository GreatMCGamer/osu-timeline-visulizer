// ──────── DRAWING FUNCTIONS ────────
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

    firstUnjudgedIndex = hitObjects.findIndex(h => !h.judged);
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

    if (timingPoints.length > 0) {
        let activeTP = timingPoints[0];
        for (let tp of timingPoints) { if (tp.uninherited && tp.time <= currentTime + futureMs) activeTP = tp; else if (tp.time > currentTime + futureMs) break; }
        const bl = activeTP.beatLength;
        if (bl > 1 && isFinite(bl)) {
            let t = Math.floor(((currentTime - pastMs) - activeTP.time) / bl) * bl + activeTP.time;
            while (t < currentTime + futureMs + bl) {
                const x = playheadX + (t - currentTime) * scale;
                if (x >= 0 && x <= canvas.width) {
                    const isBig = Math.round((t - activeTP.time) / bl) % 4 === 0;
                    ctx.beginPath(); ctx.strokeStyle = isBig ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)';;
                    ctx.lineWidth = isBig ? 2 : 1; ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
                }
                t += bl;
            }
        }
    }

    for (let note of hitObjects) {
        if (note.endTime < currentTime - pastMs || note.startTime > currentTime + futureMs) continue;
        
        const xStart = playheadX + (note.startTime - currentTime) * scale;
        const xEnd   = playheadX + (note.endTime - currentTime) * scale;
        let alpha = xEnd < 100 ? Math.max(0, xEnd / 100) : 1;
        ctx.globalAlpha = Math.max(0.1, alpha);

        const col = ((USE_BEATMAP_COMBOS && beatmapComboColors.length > 0) ? beatmapComboColors : DEFAULT_COMBO_COLORS)[note.comboColorIndex % (USE_BEATMAP_COMBOS && beatmapComboColors.length ? beatmapComboColors.length : 4)];

        if (note.type === 'slider') {
            let trackDiam = hasHitCircleTexture && hitCircleImg ? hitCircleImg.height * TEXTURE_SCALE * 0.95 : 20;
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
            ctx.drawImage(sliderBuffer, 0, 0, sw, trackDiam * 2, xStart - trackDiam, 50 - trackDiam, sw, trackDiam * 2);

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
                        const activeTinted = (USE_BEATMAP_COMBOS && beatmapTintedSliderTicks.length > 0) ? beatmapTintedSliderTicks : defaultTintedSliderTicks;
                        tickCanvas = activeTinted[note.comboColorIndex % activeTinted.length];
                    }

                    if (tickCanvas) {
                        const tickScaleFactor = TEXTURE_SCALE * 0.65;
                        const tickW = tickCanvas.width * tickScaleFactor;
                        const tickH = tickCanvas.height * tickScaleFactor;
                        ctx.drawImage(tickCanvas, tickX - tickW / 2, 50 - tickH / 2, tickW, tickH);
                    } else {
                        ctx.fillStyle = note.isMissed ? `rgba(100,100,100,0.5)` : `rgb(${col.r},${col.g},${col.b})`;
                        ctx.beginPath();
                        ctx.arc(tickX, 50, 5.5, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    tickTime += tickDelta;
                }
            }
        } else if (note.type === 'spinner') {
            ctx.fillStyle = note.isMissed ? `rgba(100,100,100,0.3)` : `rgba(${col.r},${col.g},${col.b},0.6)`;
            ctx.fillRect(xStart, 50 - SPINNER_BAR_HEIGHT/2, xEnd - xStart, SPINNER_BAR_HEIGHT);
        }

        if (note.type === 'circle' || note.type === 'slider') {
            drawHitCircle(xStart, note.comboColorIndex, note.isMissed);
        }
        ctx.globalAlpha = 1;
    }

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

        let xStart = playheadX + (sTime - currentTime) * scale;
        let xEnd = playheadX + (eTime - currentTime) * scale;

        let lane = (stroke.key === 'k1' || stroke.key === 'm1') ? 0 : 1;
        let y = KEY_BOX_Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);

        let drawXStart = Math.min(xStart, maxLineX);
        let drawXEnd = Math.min(xEnd, maxLineX);

        if (drawXStart >= drawXEnd) drawXStart = drawXEnd - 0.1; 

        ctx.strokeStyle = lane === 0 ? 'rgba(255, 105, 180, 0.8)' : 'rgba(0, 255, 255, 0.8)';
        ctx.beginPath(); ctx.moveTo(drawXStart, y); ctx.lineTo(drawXEnd, y); ctx.stroke();
    }

    for (let lane = 0; lane < 2; lane++) {
        let isDown = false;
        if (lane === 0 && (keyBoxStates['k1'] || keyBoxStates['m1'])) isDown = true;
        if (lane === 1 && (keyBoxStates['k2'] || keyBoxStates['m2'])) isDown = true;

        let y = KEY_BOX_Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);
        let size = KEY_BOX_SIZE;
        let boxX = playheadX;
        let boxY = y - size / 2;

        ctx.fillStyle = isDown ? (lane === 0 ? 'rgba(255, 105, 180, 1)' : 'rgba(0, 255, 255, 1)') : 'rgba(40, 40, 40, 0.8)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2; ctx.lineCap = 'butt'; 
        ctx.fillRect(boxX, boxY, size, size);
        ctx.strokeRect(boxX, boxY, size, size);
    }

    ctx.strokeStyle = '#0ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(playheadX, 10); ctx.lineTo(playheadX, 100); ctx.stroke();
    ctx.fillStyle = '#0ff';
    
    // New title display logic
    let titleLines = [];
    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;
    
    // Set initial font size to 80% of canvas height
    let fontSize = canvasHeight * 0.8;
    
    // Limit text width to 30% of canvas width
    const maxWidth = canvasWidth * 0.3;
    
    // Check if title fits within max width at current font size
    ctx.font = `bold ${fontSize}px Arial`;
    const textWidth = ctx.measureText(mapTitle).width;
    
    // If title doesn't fit, reduce font size until it fits or reaches minimum
    if (textWidth > maxWidth) {
        // Calculate minimum font size (80% canvas height / 2)
        const minFontSize = (canvasHeight * 0.8) / 2;
        
        // Reduce font size until it fits or reaches minimum
        while (fontSize > minFontSize && textWidth > maxWidth) {
            fontSize -= 1;
            ctx.font = `bold ${fontSize}px Arial`;
            const newWidth = ctx.measureText(mapTitle).width;
            if (newWidth <= maxWidth) {
                break;
            }
        }
        
        // If we still exceed max width, split into multiple lines
        if (textWidth > maxWidth) {
            // Split title into lines that fit within max width
            let remainingTitle = mapTitle;
            let lineCount = 0;
            
            while (remainingTitle.length > 0 && lineCount < 20) { // Prevent infinite loop
                // Try to find a good break point
                let breakPoint = remainingTitle.length;
                
                // Try to break at space character if possible
                let spaceIndex = remainingTitle.lastIndexOf(' ', maxWidth / (fontSize * 0.6)); // Approximate max chars per line
                if (spaceIndex !== -1 && spaceIndex > 0) {
                    breakPoint = spaceIndex;
                } else {
                    // If no space found, break at approximate character count
                    breakPoint = Math.floor(maxWidth / (fontSize * 0.6));
                }
                
                // Make sure we don't break in the middle of a word
                if (breakPoint < remainingTitle.length && breakPoint > 0) {
                    // If we're not at a space, move back to the last space
                    if (remainingTitle[breakPoint] !== ' ' && breakPoint > 0) {
                        let lastSpace = remainingTitle.lastIndexOf(' ', breakPoint);
                        if (lastSpace !== -1) {
                            breakPoint = lastSpace;
                        }
                    }
                }
                
                if (breakPoint <= 0) breakPoint = remainingTitle.length;
                
                titleLines.push(remainingTitle.substring(0, breakPoint).trim());
                remainingTitle = remainingTitle.substring(breakPoint).trim();
                lineCount++;
            }
            
            // If we have multiple lines, adjust font size to fit
            if (titleLines.length > 1) {
                // Calculate new font size based on number of lines
                const newFontSize = (canvasHeight * 0.8) / titleLines.length;
                fontSize = newFontSize;
                
                // Ensure font size doesn't go below minimum
                if (fontSize < minFontSize) {
                    fontSize = minFontSize;
                }
            }
        }
    } else {
        titleLines = [mapTitle];
    }
    
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    
    const totalHeight = titleLines.length * fontSize * 1.2;
    const startY = 65 - (totalHeight / 2) + fontSize * 0.6;
    
    for (let i = 0; i < titleLines.length; i++) {
        ctx.fillText(titleLines[i], 15, startY + (i * fontSize * 1.2));
    }
    
    ctx.shadowBlur = 0;
    ctx.font = '14px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${(currentTime/1000).toFixed(2)}s | Speed: ${currentSpeed.toFixed(2)}x | ${isTimelineLocked ? 'LOCKED ✓' : 'syncing'}`, 15, 95);

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
        }
    }

    requestAnimationFrame(draw);
}