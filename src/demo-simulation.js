// ──────── DEMO SIMULATION MODE ────────
// Allows testing and previewing the osu! Live Note Timeline without needing tosu or osu! running.
// Generates realistic hit circles, snaking sliders, spinners, and synchronized key presses.

let demoAnimationFrame = null;
let demoStartTimeReal = 0;
let demoSongDuration = 40000; // 40s loop
let demoKeyAlternate = 0;
let demoLastKeyCheckTime = 0;

function createDemoBeatmap() {
    mapTitle = 'Reol - No title [Insane] (Demo Mode)';
    beatmapOD = 8.5;
    beatmapSliderTickRate = 1.0;
    
    // Set vibrant demo combo colors
    comboColors = [
        { r: 255, g: 102, b: 170 }, // Pink
        { r: 0,   g: 220, b: 255 }, // Cyan
        { r: 255, g: 215, b: 0   }, // Gold
        { r: 120, g: 255, b: 120 }  // Lime
    ];

    const bpm = 200;
    const beatLength = 60000 / bpm; // 300 ms
    const halfBeat = beatLength / 2; // 150 ms

    timingPoints = [
        { time: 0, beatLength: beatLength, uninherited: true }
    ];

    const objs = [];
    let t = 1000;
    let combo = 0;

    while (t < demoSongDuration) {
        // Pattern 1: Alternating Stream of circles (8 notes at 150ms intervals)
        for (let i = 0; i < 8; i++) {
            objs.push({
                startTime: t,
                endTime: t,
                type: 'circle',
                comboColorIndex: combo,
                judged: false,
                isMissed: false,
                hitLane: -1
            });
            t += halfBeat;
        }
        combo = (combo + 1) % comboColors.length;
        t += beatLength;

        // Pattern 2: Standard Single-lane Held Slider
        objs.push({
            startTime: t,
            endTime: t + beatLength * 2,
            type: 'slider',
            comboColorIndex: combo,
            judged: false,
            isMissed: false,
            hitLane: -1
        });
        t += beatLength * 2.5;

        // Pattern 3: Rhythm Jumps with Intentional Miss! (Note 3 is missed)
        for (let i = 0; i < 4; i++) {
            const isMiss = (i === 2); // 3rd circle is intentionally missed
            objs.push({
                startTime: t,
                endTime: t,
                type: 'circle',
                comboColorIndex: combo,
                judged: false,
                isMissed: false,
                hitLane: -1,
                intentionalMiss: isMiss
            });
            t += beatLength;
        }
        combo = (combo + 1) % comboColors.length;
        t += beatLength;

        // Pattern 4: Snaking Long Slider ("Alternating clicks during slider just for fun!")
        // 5 full beats long with continuous alternating K1/K2 taps creating sine wave snaking
        objs.push({
            startTime: t,
            endTime: t + beatLength * 5,
            type: 'slider',
            snakingDemo: true,
            comboColorIndex: combo,
            judged: false,
            isMissed: false,
            hitLane: -1
        });
        t += beatLength * 5.5;

        // Pattern 5: Dropped Slider (Player lets go early -> intentional slider break)
        objs.push({
            startTime: t,
            endTime: t + beatLength * 3,
            type: 'slider',
            droppedSlider: true,
            comboColorIndex: combo,
            judged: false,
            isMissed: false,
            hitLane: -1
        });
        t += beatLength * 3.5;
        combo = (combo + 1) % comboColors.length;

        // Pattern 6: Fast Burst Stream (10 notes at 120ms)
        for (let i = 0; i < 10; i++) {
            objs.push({
                startTime: t,
                endTime: t,
                type: 'circle',
                comboColorIndex: combo,
                judged: false,
                isMissed: false,
                hitLane: -1
            });
            t += 120;
        }
        combo = (combo + 1) % comboColors.length;
        t += beatLength;

        // Pattern 7: Spinner
        objs.push({
            startTime: t,
            endTime: t + beatLength * 2.5,
            type: 'spinner',
            comboColorIndex: combo,
            judged: false,
            isMissed: false,
            hitLane: -1
        });
        t += beatLength * 3.5;
        combo = (combo + 1) % comboColors.length;
    }

    hitObjects = objs;
}

function runDemoStep() {
    if (!isDemoMode) return;

    const now = performance.now();
    const elapsed = now - demoStartTimeReal;
    const simTime = elapsed % demoSongDuration;

    // Synchronize global timeline variables
    lastReceiveTime = now;
    lastPreciseTime = simTime;
    lastCommonLiveTime = simTime;
    currentSpeed = 1.0;
    gameStateName = 'play';

    // Loop detection: reset judged flags and counts if we wrapped around
    if (simTime < demoLastKeyCheckTime) {
        for (let i = 0; i < hitObjects.length; i++) {
            const obj = hitObjects[i];
            obj.judged = false;
            obj.isMissed = false;
            obj.hitLane = -1;
            obj.actualHitTime = undefined;
            obj.missedAt = undefined;
        }
        keyStrokes.length = 0;
        lastCounts.k1 = 0;
        lastCounts.k2 = 0;
        ourDetectedMissCount = 0;
        hitErrorCount = 0;
        demoKeyAlternate = 0;
    }
    demoLastKeyCheckTime = simTime;

    const hitWindow50 = 199.5 - (beatmapOD * 10);

    // Process hit objects
    for (let i = 0; i < hitObjects.length; i++) {
        const obj = hitObjects[i];
        if (obj.judged) continue;

        // Intentional miss circle: skip simulated click, judge as miss when past hit window
        if (obj.intentionalMiss) {
            const missThreshold = obj.startTime + hitWindow50;
            if (simTime >= missThreshold) {
                obj.judged = true;
                obj.isMissed = true;
                obj.missedAt = missThreshold;
                obj.hitLane = -1;
                ourDetectedMissCount++;
            }
            continue;
        }

        // Hit time with slight realistic human timing jitter (+/- 6ms)
        const hitJitter = Math.sin(obj.startTime * 0.1) * 6;
        const targetHitTime = obj.startTime + hitJitter;

        if (simTime >= targetHitTime) {
            obj.judged = true;
            obj.isMissed = false;
            obj.actualHitTime = targetHitTime;

            if (obj.snakingDemo) {
                // Snaking slider: simulate alternating clicks during slider just for fun!
                obj.hitLane = 0;
                const altStep = 150; // half-beat alternating taps
                let curT = targetHitTime;
                let altIdx = 0;
                while (curT < obj.endTime) {
                    const nextT = Math.min(obj.endTime, curT + altStep);
                    const k = (altIdx % 2 === 0) ? 'k1' : 'k2';
                    keyStrokes.push({
                        key: k,
                        startTime: curT,
                        endTime: nextT,
                        matched: true
                    });
                    curT = nextT;
                    altIdx++;
                }
            } else if (obj.droppedSlider) {
                // Dropped slider: player holds briefly then releases early
                obj.hitLane = (demoKeyAlternate % 2 === 0) ? 0 : 1;
                const key = (demoKeyAlternate % 2 === 0) ? 'k1' : 'k2';
                demoKeyAlternate++;
                
                const holdDuration = 300; // Released midway through slider
                keyStrokes.push({
                    key: key,
                    startTime: targetHitTime,
                    endTime: targetHitTime + holdDuration,
                    matched: true
                });
            } else if (obj.type === 'slider') {
                // Standard held slider
                const key = (demoKeyAlternate % 2 === 0) ? 'k1' : 'k2';
                const lane = (demoKeyAlternate % 2 === 0) ? 0 : 1;
                demoKeyAlternate++;

                obj.hitLane = lane;
                keyStrokes.push({
                    key: key,
                    startTime: targetHitTime,
                    endTime: obj.endTime,
                    matched: true
                });
            } else if (obj.type === 'spinner') {
                // Spinner: rapid alternating taps
                obj.hitLane = -1;
                const spinStep = 90;
                let curT = targetHitTime;
                let spinIdx = 0;
                while (curT < obj.endTime) {
                    const nextT = Math.min(obj.endTime, curT + spinStep);
                    const k = (spinIdx % 2 === 0) ? 'k1' : 'k2';
                    keyStrokes.push({
                        key: k,
                        startTime: curT,
                        endTime: nextT,
                        matched: true
                    });
                    curT = nextT;
                    spinIdx++;
                }
            } else {
                // Standard hit circle: tap with standard duration (guaranteed minimum render length)
                const key = (demoKeyAlternate % 2 === 0) ? 'k1' : 'k2';
                const lane = (demoKeyAlternate % 2 === 0) ? 0 : 1;
                demoKeyAlternate++;

                obj.hitLane = lane;
                keyStrokes.push({
                    key: key,
                    startTime: targetHitTime,
                    endTime: targetHitTime + 65,
                    matched: true
                });
            }
        }
    }

    // Check dropped sliders for combo break after release
    for (let i = 0; i < hitObjects.length; i++) {
        const obj = hitObjects[i];
        if (obj.droppedSlider && obj.judged && !obj.isMissed) {
            const dropTime = obj.actualHitTime + 300;
            if (simTime >= dropTime + 100) {
                obj.isMissed = true;
                obj.missedAt = dropTime;
                ourDetectedMissCount++;
            }
        }
    }

    // Determine real-time active key states at current playhead time (zero allocations/timers)
    let k1Active = false;
    let k2Active = false;
    for (let j = 0; j < keyStrokes.length; j++) {
        const s = keyStrokes[j];
        if (simTime >= s.startTime && (s.endTime === null || simTime < s.endTime)) {
            if (s.key === 'k1') k1Active = true;
            else if (s.key === 'k2') k2Active = true;
        }
    }

    // Detect press transitions to increment key counters
    if (k1Active && !keyBoxStates.k1) lastCounts.k1++;
    if (k2Active && !keyBoxStates.k2) lastCounts.k2++;

    keyBoxStates.k1 = k1Active;
    keyBoxStates.k2 = k2Active;

    demoAnimationFrame = requestAnimationFrame(runDemoStep);
}

function startDemoMode() {
    if (isDemoMode) return;
    isDemoMode = true;
    tosuConnectionStatus = 'demo';
    console.log('%c[osu! Timeline] Demo Mode Started', 'color: #c084fc; font-weight: bold;');

    resetTimelineState();
    createDemoBeatmap();

    demoStartTimeReal = performance.now();
    demoLastKeyCheckTime = 0;
    demoKeyAlternate = 0;

    if (demoAnimationFrame) cancelAnimationFrame(demoAnimationFrame);
    demoAnimationFrame = requestAnimationFrame(runDemoStep);

    if (typeof updateStatusOverlay === 'function') {
        updateStatusOverlay();
    }
}

function stopDemoMode() {
    if (!isDemoMode) return;
    isDemoMode = false;
    tosuConnectionStatus = isTosuConnected ? 'connected' : 'disconnected';
    console.log('[osu! Timeline] Demo Mode Stopped');

    if (demoAnimationFrame) {
        cancelAnimationFrame(demoAnimationFrame);
        demoAnimationFrame = null;
    }

    resetTimelineState();
    gameStateName = 'Menu';
    mapTitle = 'Waiting for map...';

    if (typeof updateStatusOverlay === 'function') {
        updateStatusOverlay();
    }
}

function toggleDemoMode() {
    if (isDemoMode) {
        stopDemoMode();
    } else {
        startDemoMode();
    }
}

// Auto-start demo mode if requested via URL or if running in preview
if (typeof tosuConfig !== 'undefined' && tosuConfig.startDemo) {
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(startDemoMode, 300);
    });
}
