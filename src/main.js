// ──────── GLOBAL VARIABLES ────────
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const sliderBuffer = document.createElement('canvas');
const sctx = sliderBuffer.getContext('2d');

let scale = SCALE;
let playheadX = PLAYHEAD_X;

// ──────── DEFAULT COMBO COLORS ────────
const DEFAULT_COMBO_COLORS = [
    { r: 255, g: 192, b: 0 },
    { r: 0,   g: 202, b: 0 },
    { r: 18,  g: 124, b: 255 },
    { r: 242, g: 24,  b: 57 }
];

// ──────── TEXTURE VARIABLES ────────
let hitCircleImg = null;
let hitCircleOverlayImg = null;
let defaultTintedHitCircles = [];
let beatmapTintedHitCircles = [];
let hasHitCircleTexture = false;

let sliderTickImg = null;
let defaultTintedSliderTicks = [];
let beatmapTintedSliderTicks = [];
let hasSliderTickTexture = false;

// ──────── HIT WINDOW CALCULATIONS ────────
const hitWindow50 = 199.5 - (beatmapOD * 6);
const tosuLeeway = 350; 
const hitErrorLeeway = 150;

// ──────── TITLE DISPLAY VARIABLES ────────
let firstUnjudgedIndex = -1;

// ──────── SLIDER STYLE FUNCTIONS ────────
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

// ──────── HIT CIRCLE DRAWING ────────
function drawHitCircle(posX, colorIndex, isMissed = false) {
    if (posX < -100 || posX > canvas.width + 100) return;
    
    ctx.globalAlpha = isMissed ? 0.4 : 1.0;

    if (isMissed && hasHitCircleTexture && hitCircleImg) {
        const w = hitCircleImg.width * TEXTURE_SCALE, h = hitCircleImg.height * TEXTURE_SCALE;
        const dx = posX - w/2, dy = 50 - h/2;
        ctx.drawImage(hitCircleImg, dx, dy, w, h);
        if (hitCircleOverlayImg && hitCircleOverlayImg.complete) ctx.drawImage(hitCircleOverlayImg, dx, dy, w, h);
        ctx.globalAlpha = 1.0;
        return;
    }

    const activeTinted = (USE_BEATMAP_COMBOS && beatmapTintedHitCircles.length > 0) ? beatmapTintedHitCircles : defaultTintedHitCircles;
    const tintedCanvas = activeTinted[colorIndex % activeTinted.length];
    if (hasHitCircleTexture && tintedCanvas) {
        const w = tintedCanvas.width * TEXTURE_SCALE, h = tintedCanvas.height * TEXTURE_SCALE;
        const dx = posX - w/2, dy = 50 - h/2;
        ctx.drawImage(tintedCanvas, dx, dy, w, h);
        if (hitCircleOverlayImg && hitCircleOverlayImg.complete) ctx.drawImage(hitCircleOverlayImg, dx, dy, w, h);
    } else {
        if (isMissed) {
            ctx.fillStyle = `rgba(100, 100, 100, 0.5)`;
        } else {
            const col = (USE_BEATMAP_COMBOS && beatmapComboColors.length ? beatmapComboColors : DEFAULT_COMBO_COLORS)[colorIndex % 4];
            ctx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
        }
        ctx.beginPath(); ctx.arc(posX, 50, 10, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;
}

// ──────── MAIN INITIALIZATION ────────
connect();
requestAnimationFrame(draw);