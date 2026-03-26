// ──────── KEY VISUALIZATION ────────
// Processes and draws the key-press lanes.

function drawKeyVisualization() {
    ctx.lineWidth = KEY_LINE_THICKNESS;
    ctx.lineCap = 'round';
    const gap = 4;
    const radius = KEY_LINE_THICKNESS / 2;
    const maxLineX = playheadX - gap - radius; 

    // FIX: Use the precise game time instead of performance.now(). 
    // Mixing performance.now() with game time causes massive visual desyncs 
    // after map restarts or lag spikes, hiding strokes and clamping active ones into dots.
    const currentTime = lastPreciseTime || lastCommonLiveTime || 0;

    for (let stroke of keyStrokes) {
        let sTime = stroke.startTime !== undefined ? stroke.startTime : currentTime;
        let eTime = stroke.endTime !== null ? stroke.endTime : currentTime;
        
        // Culling check must use the synchronized game time
        if (eTime < currentTime - (playheadX / scale + 200)) continue;
        if (sTime > currentTime + ((canvas.width - playheadX) / scale + 200)) continue;

        let xStart = playheadX + (sTime - currentTime) * scale;
        let xEnd = playheadX + (eTime - currentTime) * scale;

        let lane = (stroke.key === 'k1' || stroke.key === 'm1') ? 0 : 1;
        let y = Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);

        let drawXStart = Math.min(xStart, maxLineX);
        let drawXEnd = Math.min(xEnd, maxLineX);

        // Prevent drawing backwards, and ensure a minimum length so quick taps are visible
        if (drawXStart >= drawXEnd) drawXStart = drawXEnd - 0.1; 

        ctx.strokeStyle = lane === 0 ? 'rgba(255, 105, 180, 0.8)' : 'rgba(0, 255, 255, 0.8)';
        ctx.beginPath(); 
        ctx.moveTo(drawXStart, y); 
        ctx.lineTo(drawXEnd, y); 
        ctx.stroke();
    }

    // Draw the key impact boxes
    for (let lane = 0; lane < 2; lane++) {
        let isDown = false;
        if (lane === 0 && (keyBoxStates['k1'] || keyBoxStates['m1'])) isDown = true;
        if (lane === 1 && (keyBoxStates['k2'] || keyBoxStates['m2'])) isDown = true;

        let y = Y_CENTERED - (KEY_BOX_SPACING / 2) + (lane * KEY_BOX_SPACING);

        ctx.fillStyle = isDown 
            ? (lane === 0 ? 'rgba(255, 105, 180, 0.8)' : 'rgba(0, 255, 255, 0.8)') 
            : 'rgba(50, 50, 50, 0.8)';
            
        ctx.fillRect(playheadX, y - KEY_BOX_SIZE / 2, KEY_BOX_SIZE, KEY_BOX_SIZE);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(playheadX, y - KEY_BOX_SIZE / 2, KEY_BOX_SIZE, KEY_BOX_SIZE);
    }
}