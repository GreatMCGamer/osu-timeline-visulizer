// ──────── BEATMAP PARSER ────────
// Fetches and decodes .osu files to build the note timeline.
// Now correctly preserves OD = 0 and OD < 0 (Half-Time / custom maps).

// Variable to store the previous beatmap file path
let previousBeatmapFile = '';

async function fetchBeatmap(directPath) {
    try {
        // Appending the checksum query parameter completely prevents the browser 
        // from caching the old beatmap file, fixing the timeline freezing issue.
        const cacheBuster = typeof lastChecksum !== 'undefined' ? lastChecksum : Date.now();
        const res = await fetch(`http://127.0.0.1:24050/files/beatmap/file?cs=${cacheBuster}`);
        const text = await res.text();
        const result = parseOsuFile(text);
        
        hitObjects = result.objs;
        timingPoints = result.timing;
        beatmapComboColors = result.beatmapCombos || [];
        beatmapOD = result.od;
        beatmapSliderTickRate = result.sliderTickRate || 1.0;
        
        // Set the isNewBeatmap flag based on whether we detect a new beatmap
        isNewBeatmap = isNewBeatmapCheck(directPath);
        
        loadTextures();
    } catch(e) { 
        console.error("Failed to parse or load beatmap file:", e); 
    }
}

/**
 * Checks if the current beatmap file is different from the previous one
 * @returns {boolean} True if the beatmap file has changed, false otherwise
 */
function isNewBeatmapCheck(directPath) {
    // Check if directPath.beatmapFile exists and is different from previous beatmap file
    if (directPath && directPath.beatmapFile) {
        const currentBeatmapFile = directPath.beatmapFile;
        
        // If previousBeatmapFile is empty, this is the first beatmap
        if (previousBeatmapFile === '') {
            previousBeatmapFile = currentBeatmapFile;
            return true;
        }
        
        // Compare the current beatmap file with the previous one
        if (currentBeatmapFile !== previousBeatmapFile) {
            previousBeatmapFile = currentBeatmapFile;
            return true;
        }
        
        // Beatmap file is the same
        return false;
    }
    
    // If directPath or beatmapFile is not available, return false
    return false;
}

function parseOsuFile(osuText) {
    // Memory optimization: Extract only the sections we need before splitting into arrays.
    // This prevents the browser from crashing/freezing on massive [Events] (Storyboard) sections.
    const sectionsToParse = ['Difficulty', 'Colours', 'TimingPoints', 'HitObjects'];
    let timing = [], objs = [], beatmapComboColorsLocal = [], currentComboIndex = 0;
    let od = 8.0, sliderTickRate = 1.0, sliderMult = 1.0;
    
    for (const sectionName of sectionsToParse) {
        // Find where the section starts safely
        let startIndex = osuText.indexOf(`\n[${sectionName}]`);
        if (startIndex === -1 && osuText.startsWith(`[${sectionName}]`)) {
            startIndex = 0;
        }
        
        if (startIndex !== -1) {
            // Find the next section header to grab just this chunk of text
            let endIndex = osuText.indexOf('\n[', startIndex + 1);
            let sectionText = endIndex !== -1 ? osuText.substring(startIndex, endIndex) : osuText.substring(startIndex);
            
            // Now we only split a small, relevant chunk of the file
            const lines = sectionText.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line || line.startsWith('//') || line.startsWith('[')) continue;
                
                if (sectionName === 'Difficulty') {
                    if (line.startsWith('SliderMultiplier:')) sliderMult = parseFloat(line.split(':')[1]) || 1.0;
                    if (line.startsWith('SliderTickRate:')) sliderTickRate = parseFloat(line.split(':')[1]) || 1.0;
                    if (line.startsWith('OverallDifficulty:')) {
                        const parsedOD = parseFloat(line.split(':')[1]);
                        od = isNaN(parsedOD) ? 8.0 : parsedOD;   // ← FIXED: now accepts 0 and negative OD
                    }
                }
                else if (sectionName === 'Colours') {
                    if (line.startsWith('Combo')) {
                        const parts = line.split(':')[1].split(',');
                        if (parts.length >= 3) {
                            beatmapComboColorsLocal.push({ r: parseInt(parts[0]), g: parseInt(parts[1]), b: parseInt(parts[2]) });
                        }
                    }
                }
                else if (sectionName === 'TimingPoints') {
                    const tp = line.split(',');
                    if (tp.length >= 2) {
                        timing.push({ time: parseFloat(tp[0]), beatLength: parseFloat(tp[1]), uninherited: parseInt(tp[6]) === 1 });
                    }
                }
                else if (sectionName === 'HitObjects') {
                    const parts = line.split(',');
                    if (parts.length < 4) continue;
                    
                    const time = parseInt(parts[2]), type = parseInt(parts[3]);
                    let noteType = 'circle', endTime = time;
                    
                    if (type & 4) currentComboIndex = (currentComboIndex + 1) % 8;
                    
                    if (type & 2) {
                        noteType = 'slider';
                        const slides = parseInt(parts[6]) || 1, length = parseFloat(parts[7]) || 0;
                        let currentBeatLength = 600, currentSV = sliderMult;
                        
                        for (let tp of timing) {
                            if (tp.time > time) break;
                            if (tp.uninherited) currentBeatLength = tp.beatLength;
                            else currentSV = sliderMult * (-100 / (tp.beatLength || 1));
                        }
                        const duration = slides * length * currentBeatLength / (100 * currentSV);
                        endTime = time + (isFinite(duration) ? duration : 10000);
                    } else if (type & 8) {
                        noteType = 'spinner';
                        endTime = parseInt(parts[5]) || time + 1000;
                    }
                    
                    objs.push({ startTime: time, endTime, type: noteType, comboColorIndex: currentComboIndex, judged: false, isMissed: false, hitLane: -1 });
                }
            }
        }
    }
    
    return { 
        objs: objs.sort((a,b) => a.startTime - b.startTime),
        timing, 
        od, 
        sliderTickRate, 
        beatmapCombos: beatmapComboColorsLocal 
    };
}