// ──────── TEXTURE MANAGER ────────
// Loads skin assets, handles @2x fallbacks, and creates color-tinted variations.
// NEW: hitcircle + hitcircleoverlay are now pre-combined into a single image.

if (typeof hitCircleCombinedImg === 'undefined') {
    hitCircleCombinedImg = null;   // Safe global initialization
}

// ──────── NEW HELPER: Combine hitcircle (tinted or plain) with overlay ────────
// Now at TOP LEVEL so createTintedVersions() can always see it
function combineWithOverlay(base, overlayImg) {
    const baseWidth  = base instanceof HTMLImageElement ? base.width  : base.width;
    const baseHeight = base instanceof HTMLImageElement ? base.height : base.height;

    const combined = document.createElement('canvas');
    combined.width  = baseWidth;
    combined.height = baseHeight;
    const ctx = combined.getContext('2d');

    // Draw base (tinted or original)
    ctx.drawImage(base, 0, 0, baseWidth, baseHeight);

    // Draw overlay on top (if loaded)
    if (overlayImg && overlayImg.complete && overlayImg.naturalWidth > 0) {
        ctx.drawImage(overlayImg, 0, 0, baseWidth, baseHeight);
    }

    return combined;
}

// ──────── NEW HELPER: Central combo color selector ────────
// This function loads either default, beatmap, or skin colors into the single "comboColors" array
// (exactly as you described). Called automatically before tinting and drawing.
function updateComboColors() {
    comboColors.length = 0; // safe clear
    
    if (ComboColorSource === 0) {
        // Default colors
        comboColors.push(...DEFAULT_COMBO_COLORS);
    } else if (ComboColorSource === 1) {
        // Beatmap colors (fallback to default if none)
        if (typeof beatmapComboColors !== 'undefined' && beatmapComboColors.length > 0) {
            comboColors.push(...beatmapComboColors);
        } else {
            comboColors.push(...DEFAULT_COMBO_COLORS);
        }
    } else if (ComboColorSource === 2) {
        // Skin colors (fallback to default if none)
        if (typeof skinComboColors !== 'undefined' && skinComboColors.length > 0) {
            comboColors.push(...skinComboColors);
        } else {
            comboColors.push(...DEFAULT_COMBO_COLORS);
        }
    }
    
    // Safety: always have at least the 4 default colors
    if (comboColors.length === 0) {
        comboColors.push(...DEFAULT_COMBO_COLORS);
    }
}

// ──────── NEW: Load skin colors by parsing skin.ini (tosu does NOT send colors in JSON) ────────
// This is the correct way to get Combo1/Combo2/... and also SliderBorder/SliderTrackOverride.
async function loadSkinIniColors() {
    const cacheBustStr = `?v=${Date.now()}`;
    const tosuUrl = 'http://127.0.0.1:24050/files/skin/';

    try {
        const response = await fetch(tosuUrl + 'skin.ini' + cacheBustStr);
        if (!response.ok) throw new Error('skin.ini not found or not accessible');

        const text = await response.text();
        const lines = text.split(/\r?\n/);

        let inColoursSection = false;
        const newSkinComboColors = [];

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('//') || line.startsWith(';')) continue;

            if (line === '[Colours]') {
                inColoursSection = true;
                continue;
            }
            if (inColoursSection && line.startsWith('[')) {
                inColoursSection = false; // end of section
                continue;
            }
            if (!inColoursSection) continue;

            // ──────── FLEXIBLE KEY:VALUE PARSER (handles both : and =) ────────
            const separatorMatch = line.match(/^([^:=\s]+)\s*[:=]\s*(.+)$/);
            if (!separatorMatch) continue;

            const key = separatorMatch[1].trim();
            const value = separatorMatch[2].trim();

            // Parse Combo1 through Combo8 (in the exact order they appear)
            if (key.match(/^Combo[1-8]$/)) {
                const rgb = value.split(',').map(n => parseInt(n.trim(), 10));
                if (rgb.length >= 3 && !isNaN(rgb[0]) && !isNaN(rgb[1]) && !isNaN(rgb[2])) {
                    newSkinComboColors.push({ r: rgb[0], g: rgb[1], b: rgb[2] });
                }
            }

            // Also parse slider colors (works with both : and =)
            if (key === 'SliderBorder') {
                const rgb = value.split(',').map(n => parseInt(n.trim(), 10));
                if (rgb.length >= 3 && !isNaN(rgb[0])) sliderBorder = [rgb[0], rgb[1], rgb[2]];
            }
            if (key === 'SliderTrackOverride') {
                const rgb = value.split(',').map(n => parseInt(n.trim(), 10));
                if (rgb.length >= 3 && !isNaN(rgb[0])) sliderTrackOverride = [rgb[0], rgb[1], rgb[2]];
            }
        }

        // Update the global array used by ComboColorSource = 2
        skinComboColors = newSkinComboColors.length > 0 
            ? newSkinComboColors 
            : [...DEFAULT_COMBO_COLORS];

        updateComboColors();

        // If textures are already loaded, immediately re-tint everything with the new skin colors
        if (typeof hasHitCircleTexture !== 'undefined' && hasHitCircleTexture) {
            createTintedVersions();
        }

        console.log(`[Texture Manager] Loaded ${newSkinComboColors.length} skin combo colors from skin.ini`);

    } catch (err) {
        console.warn('[Texture Manager] Could not load skin.ini colors (using defaults instead):', err);
        skinComboColors = [...DEFAULT_COMBO_COLORS];
        updateComboColors();
        if (typeof hasHitCircleTexture !== 'undefined' && hasHitCircleTexture) {
            createTintedVersions();
        }
    }
}

function loadTextures() {
    const cacheBustStr = (isNewBeatmap || isNewSkin) ? `?v=${Date.now()}` : '';

    // Reset the isNewBeatmap flag BEFORE texture loading begins to prevent race conditions
    if (isNewBeatmap || isNewSkin) {
        if(hitCircleImg) hitCircleImg.src = ""; 
        if(hitCircleOverlayImg) hitCircleOverlayImg.src = "";
        if(sliderTickImg) sliderTickImg.src = "";
        if(sliderBodyImg) sliderBodyImg.src = "";

        hasHitCircleTexture = false;
        hasHitCircleOverlayImg = false;
        hasSliderTickTexture = false;
        hasSliderBodyTexture = false;
        
        hitCircleImg = null;
        hitCircleOverlayImg = null;
        sliderTickImg = null;
        sliderBodyImg = null;
        hitCircleCombinedImg = null;
        
        tintedHitCircles.length = 0;
        tintedSliderTicks.length = 0;
        tintedSliderBodies.length = 0;

        isNewSkin = false;
        isNewBeatmap = false;
    }

    const tosuUrl = 'http://127.0.0.1:24050/files/skin/';
    
    // Helper function to load an image with fallback support safely
    function loadImageWithFallback(image, src, fallbackSrc) {
        let triedFallback = false;
        let isUpscaled = false;

        image.onload = () => { 
            // If we loaded a normal (non-@2x) texture, upscale it to 2x resolution
            if (triedFallback && !isUpscaled) {
                isUpscaled = true;
                upscaleTextureTo2x(image);
                return; 
            }
            
            if (image === hitCircleImg) hasHitCircleTexture = true; 
            if (image === hitCircleOverlayImg) hasHitCircleOverlayImg = true;
            if (image === sliderTickImg) hasSliderTickTexture = true;
            if (image === sliderBodyImg) hasSliderBodyTexture = true;
            
            createTintedVersions(); 
        };

        image.onerror = () => {
            if (!triedFallback) {
                triedFallback = true;
                image.src = fallbackSrc;
            } else {
                image.onerror = null;
            }
        };
        
        image.src = src;
    }

    // Helper function to upscale texture to 2x resolution without blurring
    function upscaleTextureTo2x(image) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width * 2;
        canvas.height = image.height * 2;
        
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        image.src = canvas.toDataURL();
    }

    hitCircleImg = new Image();
    hitCircleImg.crossOrigin = "Anonymous";
    
    hitCircleOverlayImg = new Image();
    hitCircleOverlayImg.crossOrigin = "Anonymous";
    
    sliderTickImg = new Image();
    sliderTickImg.crossOrigin = "Anonymous";
    
    sliderBodyImg = new Image();
    sliderBodyImg.crossOrigin = "Anonymous";
    
    // Try @2x first, then fallback to normal
    loadImageWithFallback(sliderBodyImg, tosuUrl + 'sliderbody@2x.png' + cacheBustStr, tosuUrl + 'sliderbody.png' + cacheBustStr);
    loadImageWithFallback(hitCircleImg, tosuUrl + 'hitcircle@2x.png' + cacheBustStr, tosuUrl + 'hitcircle.png' + cacheBustStr);
    loadImageWithFallback(hitCircleOverlayImg, tosuUrl + 'hitcircleoverlay@2x.png' + cacheBustStr, tosuUrl + 'hitcircleoverlay.png' + cacheBustStr);
    loadImageWithFallback(sliderTickImg, tosuUrl + 'sliderscorepoint@2x.png' + cacheBustStr, tosuUrl + 'sliderscorepoint.png' + cacheBustStr);
}

function createTintedVersions() {
    updateComboColors(); // ← always use the latest selected colors

    // Hitcircles (tinted + overlay pre-combined)
    if (hitCircleImg && hitCircleImg.complete && hitCircleImg.naturalWidth > 0) {
        tintedHitCircles.length = 0;
        comboColors.forEach(c => {
            const tintedBase = tintImage(hitCircleImg, `rgb(${c.r},${c.g},${c.b})`);
            tintedHitCircles.push(combineWithOverlay(tintedBase, hitCircleOverlayImg));
        });
        hitCircleCombinedImg = combineWithOverlay(hitCircleImg, hitCircleOverlayImg);
    }

    // Slider ticks
    if (sliderTickImg && sliderTickImg.complete && sliderTickImg.naturalWidth > 0) {
        tintedSliderTicks.length = 0;
        comboColors.forEach(c => tintedSliderTicks.push(tintImage(sliderTickImg, `rgb(${c.r},${c.g},${c.b})`)));
    }

    // Slider bodies
    if (sliderBodyImg && sliderBodyImg.complete && sliderBodyImg.naturalWidth > 0) {
        tintedSliderBodies.length = 0;
        comboColors.forEach(c => tintedSliderBodies.push(tintImage(sliderBodyImg, `rgb(${c.r},${c.g},${c.b})`)));
    }
}

function tintImage(img, colorRGB) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colorRGB;
    ctx.fillRect(0, 0, c.width, c.height);
    
    ctx.globalCompositeOperation = 'source-over';
    return c;
}