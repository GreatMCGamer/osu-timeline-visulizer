// ──────── TEXTURE MANAGER ────────
// Loads skin assets, handles @2x fallbacks, and creates color-tinted variations.

// Track if textures have already been loaded for the current beatmap
let texturesLoaded = false;

// Track if we're currently loading textures (to prevent race conditions)
let isTextureLoading = false;

// Track if we've attempted to load textures for the current beatmap (to prevent repeated failed attempts)
let textureLoadAttempted = false;

// Function to load textures with fallback support for @2x and normal variants
function loadTextures() {
    // Only load textures if they haven't been loaded already for this beatmap
    if (texturesLoaded) {
        return;
    }
    
    // Prevent multiple concurrent texture loading attempts
    if (isTextureLoading) {
        return;
    }
    
    // Prevent repeated failed attempts to load textures
    if (textureLoadAttempted) {
        return;
    }
    
    // Set loading flag to prevent race conditions
    isTextureLoading = true;
    
    hasHitCircleTexture = false;
    hasSliderTickTexture = false;

    const tosuUrl = 'http://127.0.0.1:24050/files/skin/';
    
    // Helper function to load an image with fallback support
    function loadImageWithFallback(image, src, fallbackSrc) {
        image.onload = () => { 
            // If we loaded a normal (non-@2x) texture, upscale it to 2x resolution without blurring
            if (!src.includes('@2x')) {
                upscaleTextureTo2x(image);
            }
            // Only mark textures as loaded if we successfully loaded at least one texture
            if (src.includes('hitcircle')) {
                hasHitCircleTexture = true;
            } else if (src.includes('sliderscorepoint')) {
                hasSliderTickTexture = true;
            }
            createTintedVersions(); 
        };
        image.onerror = () => {
            // If @2x fails, try normal variant
            if (src.includes('@2x')) {
                image.src = fallbackSrc;
            } else {
                // If normal variant also fails, mark this texture as failed to load
                if (src.includes('hitcircle')) {
                    hasHitCircleTexture = false;
                } else if (src.includes('sliderscorepoint')) {
                    hasSliderTickTexture = false;
                }
                // Mark that we've attempted to load textures for this beatmap
                textureLoadAttempted = true;
                isTextureLoading = false;
                return;
            }
        };
        image.src = src;
    }

    // Helper function to upscale texture to 2x resolution without blurring
    function upscaleTextureTo2x(image) {
        // Create a canvas to upscale the image
        const canvas = document.createElement('canvas');
        canvas.width = image.width * 2;
        canvas.height = image.height * 2;
        
        const ctx = canvas.getContext('2d');
        // Disable image smoothing to maintain pixel-perfect quality
        ctx.imageSmoothingEnabled = false;
        
        // Draw the image at 2x scale
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        // Replace the original image with the upscaled version
        image.src = canvas.toDataURL();
        image.width = canvas.width;
        image.height = canvas.height;
    }

    // Load hit circle textures with fallback support
    hitCircleImg = new Image(); 
    hitCircleOverlayImg = new Image();
    
    // Try @2x first, then fallback to normal
    loadImageWithFallback(hitCircleImg, tosuUrl + 'hitcircle@2x.png', tosuUrl + 'hitcircle.png');
    loadImageWithFallback(hitCircleOverlayImg, tosuUrl + 'hitcircleoverlay@2x.png', tosuUrl + 'hitcircleoverlay.png');

    // Load slider tick textures with fallback support
    sliderTickImg = new Image();
    loadImageWithFallback(sliderTickImg, tosuUrl + 'sliderscorepoint@2x.png', tosuUrl + 'sliderscorepoint.png');
    
    // Mark that we've attempted to load textures for this beatmap
    textureLoadAttempted = true;
    isTextureLoading = false;
}

function createTintedVersions() {
    if (hitCircleImg && hitCircleImg.complete) {
        defaultTintedHitCircles = DEFAULT_COMBO_COLORS.map(c => tintImage(hitCircleImg, `rgb(${c.r},${c.g},${c.b})`));
        if (beatmapComboColors.length) beatmapTintedHitCircles = beatmapComboColors.map(c => tintImage(hitCircleImg, `rgb(${c.r},${c.g},${c.b})`));
    }
    
    if (sliderTickImg && sliderTickImg.complete) {
        defaultTintedSliderTicks = DEFAULT_COMBO_COLORS.map(c => tintImage(sliderTickImg, `rgb(${c.r},${c.g},${c.b})`));
        if (beatmapComboColors.length) beatmapTintedSliderTicks = beatmapComboColors.map(c => tintImage(sliderTickImg, `rgb(${c.r},${c.g},${c.b})`));
    }
}

function tintImage(baseImg, color) {
    const c = document.createElement('canvas'); c.width = baseImg.width; c.height = baseImg.height;
    const ct = c.getContext('2d'); ct.drawImage(baseImg, 0, 0);
    ct.globalCompositeOperation = 'source-atop'; ct.fillStyle = color; ct.fillRect(0, 0, c.width, c.height);
    return c;
}

// Function to reset texture loading state when a new beatmap is loaded
function resetTextureLoading() {
    texturesLoaded = false;
    isTextureLoading = false;
    textureLoadAttempted = false;
}