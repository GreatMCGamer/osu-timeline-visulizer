// ──────── BEATMAP PARSER ────────
// Fetches and decodes .osu files to build the note timeline.

async function fetchBeatmap() {
    try {
        const res = await fetch('http://127.0.0.1:24050/files/beatmap/file');
        const text = await res.text();
        const result = parseOsuFile(text);
        hitObjects = result.objs;
        timingPoints = result.timing;
        beatmapComboColors = result.beatmapCombos || [];
        beatmapOD = result.od;
        beatmapSliderTickRate = result.sliderTickRate || 1.0;
        loadTextures();
    } catch(e) { console.error(e); }
}

function parseOsuFile(osuText) {
    const lines = osuText.split('\n');
    let section = '', sliderMult = 1.0, timing = [], objs = [], beatmapComboColorsLocal = [], currentComboIndex = 0;
    let od = 8.0; 
    let sliderTickRate = 1.0;
    
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('[')) { section = line; continue; }
        if (section === '[Difficulty]') {
            if (line.startsWith('SliderMultiplier:')) sliderMult = parseFloat(line.split(':')[1]) || 1.0;
            if (line.startsWith('SliderTickRate:')) sliderTickRate = parseFloat(line.split(':')[1]) || 1.0;
            if (line.startsWith('OverallDifficulty:')) od = parseFloat(line.split(':')[1]) || 8.0;
        }
        if (section === '[Colours]' && line) {
            const match = line.match(/Combo\d+:\s*(\d+),\s*(\d+),\s*(\d+)/);
            if (match) beatmapComboColorsLocal.push({ r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) });
        }
        if (section === '[TimingPoints]' && line) {
            const tp = line.split(',');
            if (tp.length >= 7) timing.push({ time: parseFloat(tp[0]), beatLength: parseFloat(tp[1]), uninherited: parseInt(tp[6]) === 1 });
        }
        if (section === '[HitObjects]' && line) {
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
            objs.push({ startTime: time, endTime, type: noteType, comboColorIndex: currentComboIndex, judged: false, isMissed: false });
        }
    }
    return { 
        objs: objs.sort((a,b)=>a.startTime-b.startTime), 
        timing, 
        beatmapCombos: beatmapComboColorsLocal, 
        od, 
        sliderTickRate
    };
}