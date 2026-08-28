// ──────── KEY VISUALIZATION FUNCTIONS ────────

/**
 * Draws the trailing lines representing past and current key presses.
 */
function drawKeyHistory(currentTime, pastMs, futureMs, pxPerMs) {
    ctx.lineWidth = KEY_LINE_THICKNESS;
    ctx.lineCap = 'round';
    
    const gap = 4;
    const radius = KEY_LINE_THICKNESS / 2;
    const maxLineX = playheadX - gap - radius; 
    const minVisualLen = Math.max(MIN_KEY_PRESS_LENGTH_PX, MIN_KEY_PRESS_DURATION_MS * pxPerMs);

    for (let i = 0; i < keyStrokes.length; i++) {
        const stroke = keyStrokes[i];
        let sTime = (stroke.startTime !== undefined && stroke.startTime !== null) ? stroke.startTime : currentTime;
        let eTime = (stroke.endTime !== undefined && stroke.endTime !== null) ? stroke.endTime : currentTime;
        
        // Skip keys that have not occurred yet
        if (sTime > currentTime) continue;

        // Active key trail cannot extend into the future beyond playhead
        let effectiveETime = Math.min(eTime, currentTime);

        // Culling: Don't draw if off-screen to the left (past)
        if (Math.max(eTime, sTime + MIN_KEY_PRESS_DURATION_MS) < currentTime - pastMs) continue;

        let rawXStart = playheadX + (sTime - currentTime) * pxPerMs;
        let rawXEnd = playheadX + (effectiveETime - currentTime) * pxPerMs;

        // Guarantee a minimum visual press length regardless of how short the click was
        if (rawXEnd - rawXStart < minVisualLen) {
            rawXStart = rawXEnd - minVisualLen;
        }

        // Clamp to playhead so lines connect cleanly to key hitboxes
        let drawXEnd = Math.min(rawXEnd, maxLineX);
        let drawXStart = Math.min(rawXStart, drawXEnd - minVisualLen);

        // Determine lane (K1/M1 = top, K2/M2 = bottom)
        let lane = (stroke.key === 'k1' || stroke.key === 'm1') ? 0 : 1;
        let y = Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);

        ctx.strokeStyle = lane === 0 ? 'rgba(255, 105, 180, 0.85)' : 'rgba(0, 255, 255, 0.85)';
        ctx.beginPath(); 
        ctx.moveTo(drawXStart, y); 
        ctx.lineTo(drawXEnd, y); 
        ctx.stroke();
    }
}

/**
 * Draws the interactive hit boxes at the playhead position.
 */
function drawKeyBoxes() {
    for (let lane = 0; lane < 2; lane++) {
        let isDown = false;
        // Check states for Lane 0 (K1/M1) and Lane 1 (K2/M2)
        if (lane === 0 && (keyBoxStates['k1'] || keyBoxStates['m1'])) isDown = true;
        if (lane === 1 && (keyBoxStates['k2'] || keyBoxStates['m2'])) isDown = true;

        let y = Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);
        let size = KEY_BOX_SIZE;
        let boxX = playheadX;
        let boxY = y - size / 2;

        // Fill color based on state
        ctx.fillStyle = isDown 
            ? (lane === 0 ? 'rgba(255, 105, 180, 1)' : 'rgba(0, 255, 255, 1)') 
            : 'rgba(40, 40, 40, 0.8)';
            
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2; 
        ctx.lineCap = 'butt'; 
        
        ctx.fillRect(boxX, boxY, size, size);
        ctx.strokeRect(boxX, boxY, size, size);
    }
}