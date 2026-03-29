/**
 * Generates slider colors based strictly on passed-in skin/combo settings.
 */

function getSliderTargetY(timestamp, hitTime) {
    let lane0 = false;
    let lane1 = false;
    
    // If the slider hasn't been hit yet, it stays centered
    if (timestamp < hitTime) return Y_CENTERED;

    for (let i = 0; i < keyStrokes.length; i++) {
        const s = keyStrokes[i];
        
        // Filter: Only count keys that started AFTER the slider was hit
        if (s.startTime < hitTime) continue; 
        
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
    const ySpeed = laneDist / 100; 
    const step = 4; 
    const hitTime = note.startTime; 

    // ──────── REFINED SNAKY LOGIC ────────
    // calculationTime determines how far into the simulation we go.
    // If targetTime is after the miss, we only simulate up to the missTime.
    let calculationTime = targetTime;
    if (note.isMissed) {
        const missTime = note.missedAt || note.startTime;
        calculationTime = Math.min(targetTime, missTime);
    }

    let currentY = Y_CENTERED;

    // Simulate movement only up to the calculationTime (either target or miss)
    for (let t = note.startTime; t <= calculationTime; t += step) {
        const targetY = getSliderTargetY(t, hitTime); 
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
    let [r, g, b] = trackRgb || [255, 255, 255];
    // Use the provided skin border color, fallback to white if undefined
    let border = borderRgb || [255, 255, 255]; 
    let alpha = 0.85;
    
    if (isMissed) {
        const avg = (r + g + b) / 3;
        r = g = b = avg * 0.5; // Darken
        border = [100, 100, 100]; // Dim missed border
        alpha = 0.35;
    }

    // Standard skin logic: slightly brighten the base color for the center glow
    const highlight = [
        Math.min(255, r + 90), 
        Math.min(255, g + 90), 
        Math.min(255, b + 90)
    ];

    return {
        border: `rgb(${border.join(',')})`,
        trackBaseRgb: `${r},${g},${b}`,
        trackHighlightRgb: `${highlight.join(',')}`,
        alpha: alpha
    };
}

function drawSmoothSlider(note, xStart, xEnd, currentTime, pxPerMs, judgmentDiameterPx) {
    const col = ((useBeatmapCombos && beatmapComboColors.length > 0) 
        ? beatmapComboColors 
        : DEFAULT_COMBO_COLORS)[note.comboColorIndex % (useBeatmapCombos && beatmapComboColors.length ? beatmapComboColors.length : 4)];
    
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
    const activeTinted = (useBeatmapCombos && beatmapTintedSliderBodies && beatmapTintedSliderBodies.length > 0)
        ? beatmapTintedSliderBodies
        : defaultTintedSliderBodies;

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
        { widthFactor: 1.0, alpha: 0.05, brightness: 0.10 },
        { widthFactor: 0.9, alpha: 0.10, brightness: 0.20 },
        { widthFactor: 0.8, alpha: 0.25, brightness: 0.30 },
        { widthFactor: 0.7, alpha: 0.30, brightness: 0.40 },
        { widthFactor: 0.6, alpha: 0.45, brightness: 0.50 },
        { widthFactor: 0.5, alpha: 0.50, brightness: 0.60 },
        { widthFactor: 0.4, alpha: 0.65, brightness: 0.70 },
        { widthFactor: 0.3, alpha: 0.70, brightness: 0.80 },
        { widthFactor: 0.2, alpha: 0.85, brightness: 0.90 },
        { widthFactor: 0.1, alpha: 0.90, brightness: 1.00 }
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