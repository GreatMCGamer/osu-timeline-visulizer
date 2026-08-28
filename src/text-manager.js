// ──────── TEXT MANAGER ────────
// Handles text rendering logic for beatmap titles and other text elements.
// Caches line calculations to ensure zero-allocation 60+ FPS render loops.

let cachedTitleText = '';
let cachedCanvasW = 0;
let cachedCanvasH = 0;
let cachedTitleFontSize = 24;
let cachedTitleLines = [];

function updateTitleLayout() {
    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;
    const maxWidth = canvasWidth * 0.3;
    const maxHeight = canvasHeight * 0.8;
    const lineHeightFactor = 1.2;

    const titleToWrap = mapTitle || 'Waiting for map...';
    let fontSize = canvasHeight * 0.8;
    let bestLines = [titleToWrap];
    let bestFontSize = fontSize;

    // Binary search for the largest font that fits after wrapping
    let low = 10;
    let high = fontSize;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        ctx.font = `bold ${mid}px Arial`;

        const lines = wrapText(titleToWrap, mid, maxWidth);
        const totalH = lines.length * mid * lineHeightFactor;

        if (totalH <= maxHeight) {
            bestLines = lines;
            bestFontSize = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    cachedTitleFontSize = bestFontSize;
    cachedTitleLines = bestLines;
    cachedTitleText = mapTitle;
    cachedCanvasW = canvasWidth;
    cachedCanvasH = canvasHeight;
}

function renderBeatmapTitle() {
    if (!mapTitle) return;

    if (mapTitle !== cachedTitleText || canvas.width !== cachedCanvasW || canvas.height !== cachedCanvasH) {
        updateTitleLayout();
    }

    const lineHeightFactor = 1.2;
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${cachedTitleFontSize}px Arial`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.fillStyle = '#ffffff';

    const lineHeight = cachedTitleFontSize * lineHeightFactor;
    const totalBlockHeight = (cachedTitleLines.length - 1) * lineHeight;

    let currentY = Y_CENTERED - (totalBlockHeight / 2);

    for (let i = 0; i < cachedTitleLines.length; i++) {
        ctx.fillText(cachedTitleLines[i], 15, currentY);
        currentY += lineHeight;
    }

    ctx.shadowBlur = 0;
    ctx.textBaseline = 'alphabetic';
}

// Greedy word wrapping function
function wrapText(text, fontSize, maxWidth) {
    const lines = [];
    const words = (text || '').split(' ');
    let currentLine = '';
    
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        
        ctx.font = `bold ${fontSize}px Arial`;
        const testWidth = ctx.measureText(testLine).width;
        
        if (testWidth <= maxWidth && testLine.length > 0) {
            currentLine = testLine;
        } else {
            if (currentLine) {
                lines.push(currentLine);
            }
            currentLine = word;
        }
    }
    
    if (currentLine) {
        lines.push(currentLine);
    }
    
    return lines;
}