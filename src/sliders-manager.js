/**
 * Generates slider colors based strictly on passed-in skin/combo settings.
 */

function getSliderTargetY(timestamp, hitTime) {
    // hitTime is the actual judgment time (note.actualHitTime) once judged,
    // or the nominal startTime for unjudged sliders.
    let lane0 = false;
    let lane1 = false;
    
    // If the slider hasn't been hit yet, it stays centered
    if (timestamp < hitTime) return Y_CENTERED;

    for (let i = 0; i < keyStrokes.length; i++) {
        const s = keyStrokes[i];
        
        // Filter: Ignore strokes that fully ended before the slider was hit
        if (s.endTime !== null && s.endTime < hitTime) continue; 
        
        // Ignore strokes that start after this timestamp point or ended before it
        if (s.startTime > timestamp) continue;
        if (s.endTime !== null && s.endTime < timestamp) continue;
        
        if (s.key === 'k1' || s.key === 'm1') lane0 = true;
        else if (s.key === 'k2' || s.key === 'm2') lane1 = true;
    }
    
    const laneDist = KEY_BOX_SPACING / 2;
    if (lane0 && lane1) return Y_CENTERED;
    if (lane0) return Y_CENTERED - laneDist;
    if (lane1) return Y_CENTERED + laneDist;
    return Y_CENTERED;
}

function getSnakyY(note, targetTime) {
    const laneDist = KEY_BOX_SPACING / 2;
    const ySpeed = laneDist / 75; 
    const step = 4; 

    // Use the real judgment time once the slider has been hit
    const hitTime = (note.judged && typeof note.actualHitTime !== 'undefined')
        ? note.actualHitTime
        : note.startTime;

    // ──────── NEW: Head (and pre-hit body) now snaps to hitLane ────────
    // This makes the slider head behave exactly like a circle's hit circle.
    // The body remains fully snaky after the actual hit time.
    const isJudged = note.judged && !note.isMissed;
    let hitLaneY = Y_CENTERED;
    if (isJudged && typeof note.hitLane !== 'undefined' && note.hitLane !== -1) {
        hitLaneY = note.hitLane === 0 
            ? Y_CENTERED - laneDist 
            : Y_CENTERED + laneDist;
    }

    // ──────── REFINED SNAKY LOGIC ────────
    // calculationTime determines how far into the simulation we go.
    let calculationTime = targetTime;
    if (note.isMissed) {
        const missTime = note.missedAt || note.startTime;
        calculationTime = Math.min(targetTime, missTime);
    }

    let currentY = Y_CENTERED;
    if (isJudged) {
        currentY = hitLaneY;   // start simulation from the hit lane
    }

    // Simulate movement only up to the calculationTime
    for (let t = note.startTime; t <= calculationTime; t += step) {
        let targetY = getSliderTargetY(t, hitTime); 

        // Force the head + any body points BEFORE the actual hit time
        // to stay at the hit lane (retroactive snap for late hits).
        // This eliminates any visual discontinuity between head and path start.
        if (isJudged && t <= hitTime) {
            targetY = hitLaneY;
        }

        const dy = targetY - currentY;
        
        if (Math.abs(dy) > 0.1) {
            const move = ySpeed * step;
            if (Math.abs(dy) <= move) currentY = targetY;
            else currentY += Math.sign(dy) * move;
        }
    }
    return currentY;
}

function getSliderStyles(trackRgb, borderRgb, isMissed = false) {
    let r = 255, g = 255, b = 255;
    if (trackRgb && trackRgb.length >= 3) {
        r = trackRgb[0];
        g = trackRgb[1];
        b = trackRgb[2];
    }
    
    let br = 255, bg = 255, bb = 255;
    if (borderRgb && borderRgb.length >= 3) {
        br = borderRgb[0];
        bg = borderRgb[1];
        bb = borderRgb[2];
    }
    let alpha = 0.85;
    
    if (isMissed) {
        const avg = (r + g + b) / 3;
        r = g = b = avg * 0.5; // Darken
        br = 100; bg = 100; bb = 100;
        alpha = 0.35;
    }

    // Standard skin logic: slightly brighten the base color for the center glow
    const hr = Math.min(255, r + 90);
    const hg = Math.min(255, g + 90);
    const hb = Math.min(255, b + 90);

    return {
        border: `rgb(${br},${bg},${bb})`,
        trackBaseRgb: `${r},${g},${b}`,
        trackHighlightRgb: `${hr},${hg},${hb}`,
        baseR: r,
        baseG: g,
        baseB: b,
        highR: hr,
        highG: hg,
        highB: hb,
        alpha: alpha
    };
}
