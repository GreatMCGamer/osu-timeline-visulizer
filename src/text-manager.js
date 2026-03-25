// ──────── TEXT MANAGER ────────
// Handles text rendering logic for beatmap titles and other text elements.

function renderBeatmapTitle() {
    // New title display logic
    let titleLines = [];
    const canvasHeight = canvas.height;
    const canvasWidth = canvas.width;
    
    // Set initial font size to 80% of canvas height
    let fontSize = canvasHeight * 0.8;
    
    // Limit text width to 30% of canvas width
    const maxWidth = canvasWidth * 0.3;
    
    // Check if title fits within max width at current font size
    ctx.font = `bold ${fontSize}px Arial`;
    const textWidth = ctx.measureText(mapTitle).width;
    
    // If title doesn't fit, reduce font size until it fits or reaches minimum
    if (textWidth > maxWidth) {
        // Calculate minimum font size (80% canvas height / 2)
        const minFontSize = (canvasHeight * 0.8) / 2;
        
        // Reduce font size until it fits or reaches minimum
        while (fontSize > minFontSize && textWidth > maxWidth) {
            fontSize -= 1;
            ctx.font = `bold ${fontSize}px Arial`;
            const newWidth = ctx.measureText(mapTitle).width;
            if (newWidth <= maxWidth) {
                break;
            }
        }
        
        // If we still exceed max width, split into multiple lines
        if (textWidth > maxWidth) {
            // Split title into lines that fit within max width
            let remainingTitle = mapTitle;
            let lineCount = 0;
            
            while (remainingTitle.length > 0 && lineCount < 20) { // Prevent infinite loop
                // Try to find a good break point
                let breakPoint = remainingTitle.length;
                
                // Try to break at space character if possible
                let spaceIndex = remainingTitle.lastIndexOf(' ', maxWidth / (fontSize * 0.6)); // Approximate max chars per line
                if (spaceIndex !== -1 && spaceIndex > 0) {
                    breakPoint = spaceIndex;
                } else {
                    // If no space found, break at approximate character count
                    breakPoint = Math.floor(maxWidth / (fontSize * 0.6));
                }
                
                // Make sure we don't break in the middle of a word
                if (breakPoint < remainingTitle.length && breakPoint > 0) {
                    // If we're not at a space, move back to the last space
                    if (remainingTitle[breakPoint] !== ' ' && breakPoint > 0) {
                        let lastSpace = remainingTitle.lastIndexOf(' ', breakPoint);
                        if (lastSpace !== -1) {
                            breakPoint = lastSpace;
                        }
                    }
                }
                
                if (breakPoint <= 0) breakPoint = remainingTitle.length;
                
                titleLines.push(remainingTitle.substring(0, breakPoint).trim());
                remainingTitle = remainingTitle.substring(breakPoint).trim();
                lineCount++;
            }
            
            // If we have multiple lines, adjust font size to fit
            if (titleLines.length > 1) {
                // Calculate new font size based on number of lines
                const newFontSize = (canvasHeight * 0.8) / titleLines.length;
                fontSize = newFontSize;
                
                // Ensure font size doesn't go below minimum
                if (fontSize < minFontSize) {
                    fontSize = minFontSize;
                }
            }
        }
    } else {
        titleLines = [mapTitle];
    }
    
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    
    const totalHeight = titleLines.length * fontSize * 1.2;
    const startY = TITLE_Y - (totalHeight / 2) + fontSize * 0.6;
    
    for (let i = 0; i < titleLines.length; i++) {
        ctx.fillText(titleLines[i], 15, startY + (i * fontSize * 1.2));
    }
    
    ctx.shadowBlur = 0;
}