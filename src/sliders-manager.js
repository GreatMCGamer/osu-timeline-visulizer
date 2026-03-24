// ──────── SLIDERS MANAGER ────────
// Extracts the complex mathematical and canvas buffer operations required to draw dynamic slider bodies.

function getSliderStyles(trackRgb, borderRgb, isMissed = false) {
    let [r, g, b] = trackRgb;
    let border = borderRgb;
    let alpha = 0.8;
    
    if (isMissed) {
        const avg = (r + g + b) / 3;
        r = g = b = avg * 0.5;
        border = [100, 100, 100];
        alpha = 0.3;
    }

    const highlight = [Math.min(255, r + 90), Math.min(255, g + 90), Math.min(255, b + 90)];
    return {
        border: `rgb(${border.join(',')})`,
        trackBaseRgb: `${r},${g},${b}`,
        trackHighlightRgb: `${highlight.join(',')}`,
        alpha: alpha
    };
}