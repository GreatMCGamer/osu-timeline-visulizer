// ──────── TEXTURE MANAGER ────────
// Loads skin assets, handles @2x fallbacks, and creates color-tinted variations.

function loadTextures() {
    hasHitCircleTexture = false;
    hasSliderTickTexture = false;

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
                // Exit immediately because replacing image.src with data URL triggers onload again!
                return; 
            }
            
            if (image === hitCircleImg) hasHitCircleTexture = true; 
            if (image === sliderTickImg) hasSliderTickTexture = true;
            
            createTintedVersions(); 
        };

        image.onerror = () => {
            // If @2x fails, try normal variant
            if (!triedFallback) {
                triedFallback = true;
                image.src = fallbackSrc;
            } else {
                // If normal variant ALSO fails, prevent an infinite network loop by clearing onerror
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
    hitCircleOverlayImg = new Image();
    sliderTickImg = new Image();
    
    // Try @2x first, then fallback to normal
    loadImageWithFallback(hitCircleImg, tosuUrl + 'hitcircle@2x.png', tosuUrl + 'hitcircle.png');
    loadImageWithFallback(hitCircleOverlayImg, tosuUrl + 'hitcircleoverlay@2x.png', tosuUrl + 'hitcircleoverlay.png');
    loadImageWithFallback(sliderTickImg, tosuUrl + 'sliderscorepoint@2x.png', tosuUrl + 'sliderscorepoint.png');
}

function createTintedVersions() {
    if (hitCircleImg && hitCircleImg.complete && hitCircleImg.naturalWidth > 0) {
        const defaultColors = typeof DEFAULT_COMBO_COLORS !== 'undefined' ? DEFAULT_COMBO_COLORS : [{r:255,g:192,b:0}, {r:0,g:202,b:0}, {r:18,g:124,b:255}, {r:242,g:24,b:57}];
        defaultTintedHitCircles = defaultColors.map(c => tintImage(hitCircleImg, `rgb(${c.r},${c.g},${c.b})`));
        
        if (typeof beatmapComboColors !== 'undefined' && beatmapComboColors.length) {
            beatmapTintedHitCircles = beatmapComboColors.map(c => tintImage(hitCircleImg, `rgb(${c.r},${c.g},${c.b})`));
        }
    }
    
    if (sliderTickImg && sliderTickImg.complete && sliderTickImg.naturalWidth > 0) {
        const defaultColors = typeof DEFAULT_COMBO_COLORS !== 'undefined' ? DEFAULT_COMBO_COLORS : [{r:255,g:192,b:0}, {r:0,g:202,b:0}, {r:18,g:124,b:255}, {r:242,g:24,b:57}];
        defaultTintedSliderTicks = defaultColors.map(c => tintImage(sliderTickImg, `rgb(${c.r},${c.g},${c.b})`));
        
        if (typeof beatmapComboColors !== 'undefined' && beatmapComboColors.length) {
            beatmapTintedSliderTicks = beatmapComboColors.map(c => tintImage(sliderTickImg, `rgb(${c.r},${c.g},${c.b})`));
        }
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