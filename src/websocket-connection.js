// ──────── WEBSOCKET CONNECTION & LIFECYCLE CONTROLLER ────────
// Handles connection setup, backoff, and data streaming from tosu/gosumemory.
// Engineered to prevent runaway reconnection loops, zombie sockets, and browser memory exhaustion.

let reconnectTimer = null;
let lastReportedStatus = '';
let isConnecting = false;
let autoReconnectEnabled = true;
const DESYNK_MATCH_WINDOW_MS = 6; // Plan B: 3-packet desynk window (~6ms)

// Cleanly tears down a WebSocket instance by unbinding all handlers FIRST.
// This prevents calling .close() from triggering self-invoking 'onclose' cascades.
function teardownSocket(ws) {
    if (!ws) return null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
        }
    } catch (e) {}
    return null;
}

function teardownAllSockets() {
    wsCommon = teardownSocket(wsCommon);
    wsPrecise = teardownSocket(wsPrecise);
    isConnecting = false;
}

function logConnectionStatus(status, detail) {
    if (status === lastReportedStatus && connectionRetryCount > 1) return;
    lastReportedStatus = status;

    if (status === 'connected') {
        console.log(`%c[osu! Timeline] Connected to tosu at ${tosuConfig.wsBase}`, 'color: #00ff88; font-weight: bold;');
    } else if (status === 'https_restricted') {
        console.warn(
            `[osu! Timeline] Browser Mixed-Content Restriction:\n` +
            `This page was loaded securely over HTTPS (${window.location.protocol}//).\n` +
            `Modern web browsers prohibit unencrypted 'ws://' connections to local addresses (127.0.0.1).\n` +
            `• For OBS Studio: Add Browser Source using 'http://localhost:3000' (or local HTML file) so it connects over standard HTTP.`
        );
    } else if (status === 'disconnected') {
        console.log(`[osu! Timeline] Waiting for tosu at ${tosuConfig.wsBase} (tosu/gosumemory not detected on port ${tosuConfig.host.split(':')[1] || '24050'}).`);
    }
}

function notifyUIStatus() {
    if (typeof updateStatusOverlay === 'function') {
        updateStatusOverlay();
    }
}

// Single centralized reconnect scheduler. Enforces backoff and prevents concurrent timers.
function scheduleReconnect() {
    if (reconnectTimer) return; // Never duplicate timers
    if (!autoReconnectEnabled) return;

    // Mixed Content check: on HTTPS pages without WSS, browsers will ALWAYS reject ws://127.0.0.1
    if (tosuConfig.isHttps && !tosuConfig.isSecure) {
        isTosuConnected = false;
        tosuConnectionStatus = 'https_restricted';
        logConnectionStatus('https_restricted');
        notifyUIStatus();
        return; // Cease automatic looping on HTTPS
    }

    connectionRetryCount++;

    // Backoff schedule: 2s -> 3s -> 5s -> 8s -> 12s -> 15s max
    const delays = [2000, 3000, 5000, 8000, 12000, 15000];
    const delay = delays[Math.min(connectionRetryCount - 1, delays.length - 1)];

    // After 6 consecutive failed attempts, enter a gentle 20s probing mode
    if (connectionRetryCount > 6) {
        tosuConnectionStatus = 'waiting';
        notifyUIStatus();
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect(false);
        }, 20000);
        return;
    }

    tosuConnectionStatus = 'disconnected';
    notifyUIStatus();

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect(false);
    }, delay);
}

function handleSocketFailure() {
    const wasConnected = isTosuConnected;
    isTosuConnected = false;
    teardownAllSockets();

    if (wasConnected) {
        logConnectionStatus('disconnected');
    }
    notifyUIStatus();
    scheduleReconnect();
}

// ──────── T17: MISS / BREAK EVIDENCE ────────
// The old markMissedNotes() / markBrokenSliderMissed() mark-gates are GONE.
// §5 now records EVIDENCE only: missEvents[] (hits["0"] increments, T14-anchored)
// and breakEvents[] (T11-arbitrated combo drops without an increment).
// rejudgeTimeline() (miss-logic.js) assigns each event to a note and derives every note's
// final state — hit error (precise/common) > break > miss > button press.
function processKeyAndHitData(keysData, hitErrorsData, liveTime) {
    // ──────── PLAN B: GATED / BUFFERED MATCHING ────────
    // The two old paths (immediate-on-press + independent-on-error) raced on
    // DESYNKED packets: tosu's precise stream can carry a key press and its hit
    // error in DIFFERENT packets (~2ms apart). We now buffer BOTH signals and only
    // judge a note once its key stroke AND its hit error are both present. A
    // 3-packet window (~6ms) bridges the desynk. A click that hit nothing (a
    // stroke with no error, or an error with no stroke/note) is consumed without
    // mis-assigning, and stale buffers expire after the window.

    // 1) Collect new key strokes (NO immediate matching — the old Path 1 is gone).
    if (keysData) {
        const keyNames = ['k1', 'k2', 'm1', 'm2'];
        const titleCaseNames = ['KeyK1', 'KeyK2', 'KeyM1', 'KeyM2'];

        for (let i = 0; i < 4; i++) {
            const k = keyNames[i];
            const keyData = keysData[k] || keysData[titleCaseNames[i]];
            if (!keyData) continue;

            const isDown = keyData.isPressed === true;
            const kCount = typeof keyData.count === 'number' ? keyData.count : 0;

            // Handle count reset or rewinds
            if (kCount < lastCounts[k]) {
                lastCounts[k] = kCount;
                if (activeStrokes[k]) {
                    activeStrokes[k].endTime = Math.max(liveTime, activeStrokes[k].startTime); // T29: no minimum press length (clamp to no-inverted-range only)
                    activeStrokes[k] = null;
                }
            }

            const hasNewPress = (kCount > lastCounts[k]) || (isDown && !keyBoxStates[k]);

            if (hasNewPress) {
                // Close any orphan or previously open stroke for this key before starting a new one
                if (activeStrokes[k]) {
                    activeStrokes[k].endTime = Math.max(liveTime, activeStrokes[k].startTime); // T29: no minimum press length
                    activeStrokes[k] = null;
                }

                const strokeStartTime = liveTime;
                const minEnd = strokeStartTime; // T29: no minimum press length (a tap may be 0ms, renders as a dot)

                // Create the stroke (T29: no minimum duration - a tap may be 0ms, renders as a dot)
                const stroke = {
                    key: k,
                    startTime: strokeStartTime,
                    endTime: isDown ? null : minEnd,
                    matched: false
                };
                const _lane = (k === 'k1' || k === 'm1') ? 0 : 1;
                stroke.pressSeq = ++lanePressCounter[_lane]; // T7 debug: per-lane press sequence
                keyStrokes.push(stroke);
                activeStrokes[k] = isDown ? stroke : null;

                // PLAN B: buffer the stroke; the gated matcher below waits for its hit error.
                pendingStrokes.push({ stroke: stroke, key: k, liveTime: strokeStartTime });
            } else if (!isDown) {
                // Key is not down: close active stroke if one exists
                if (activeStrokes[k]) {
                    activeStrokes[k].endTime = Math.max(liveTime, activeStrokes[k].startTime); // T29: no minimum press length
                    activeStrokes[k] = null;
                }
            }

            lastCounts[k] = kCount;
            keyBoxStates[k] = isDown;
        }
    }

    // 2) Collect new hit errors (NO immediate matching — the old Path 2 is gone).
    if (hitErrorsData && hitErrorsData.length > hitErrorCount) {
        const newErrors = hitErrorsData.slice(hitErrorCount);
        for (let e = 0; e < newErrors.length; e++) {
            pendingErrors.push({ error: newErrors[e], liveTime: liveTime });
        }
        hitErrorCount = hitErrorsData.length;
    }

    // 3) GATED MATCH: judge a note only when BOTH its key stroke and its hit error
    //    are buffered and within the desynk window of each other.
    for (let si = 0; si < pendingStrokes.length; si++) {
        const ps = pendingStrokes[si];
        let bestErr = -1;
        let bestErrDiff = Infinity;
        for (let ei = 0; ei < pendingErrors.length; ei++) {
            const pe = pendingErrors[ei];
            const d = Math.abs(ps.liveTime - pe.liveTime);
            if (d <= DESYNK_MATCH_WINDOW_MS && d < bestErrDiff) {
                bestErrDiff = d;
                bestErr = ei;
            }
        }
        if (bestErr === -1) continue; // no error within the window yet — wait (or expire below)

        const pe = pendingErrors[bestErr];
        const estNoteStart = pe.liveTime - pe.error;

        // Nearest unjudged note to the estimated hit time
        let bestObj = null;
        let bestIdx = -1; // T28: the note's index (j is block-scoped in the loop below)
        let minDiff = Infinity;
        const searchTolerance = Math.max(150, (typeof hitWindow50 !== 'undefined' ? hitWindow50 : 150) + 50);
        for (let j = 0; j < hitObjects.length; j++) {
            const obj = hitObjects[j];
            // T17: a precise hit is final for this note (the highest-priority
            // evidence) — never re-matched. A note without a hit error (or with
            // only a common one) is a candidate: a real hit error overrides any
            // miss/break/press judgment.
            if (obj.hitSource === 'precise') continue;
            const diff = Math.abs(obj.startTime - estNoteStart);
            if (diff < searchTolerance && diff < minDiff) {
                minDiff = diff;
                bestObj = obj;
                bestIdx = j; // T28: capture the index (j is block-scoped to the loop)
            }
        }

        if (bestObj) {
            // T17: store the evidence — rejudgeTimeline derives the final state
            // (a hit error always outranks miss/break/press judgments).
            bestObj.hitError = pe.error;
            bestObj.hitSource = 'precise';
            bestObj.hitLane = (ps.key === 'k1' || ps.key === 'm1') ? 0 : 1;
            bestObj.actualHitTime = bestObj.startTime + pe.error;
            bestObj.driftMs = minDiff; // T7 debug: per-note drift (|obj.startTime - estNoteStart|)
            hitErrorDriftSamples.push(minDiff);
            if (hitErrorDriftSamples.length > 10) hitErrorDriftSamples.shift();

            // T28: pairing-repair bookkeeping. The flag starts true on every note;
            // a successful pair proves the notes are contiguous, so the NEXT note
            // needs no repair check. If THIS note's flag is still active when it
            // pairs, its predecessor never paired normally (a desynk gap) - a ghost
            // note may exist, so repair every hit-error note that has no lane.
            const wasActive = bestObj.checkPreviousPairing;
            const nx = hitObjects[bestIdx + 1];
            if (nx) nx.checkPreviousPairing = false;
            if (wasActive) repairLanes();
            bestObj.checkPreviousPairing = false;

            // Align the stroke to the true hit time and mark it consumed
            ps.stroke.matched = true;
            ps.stroke.startTime = bestObj.actualHitTime;
            if (ps.stroke.endTime !== null) {
                ps.stroke.endTime = Math.max(ps.stroke.endTime, ps.stroke.startTime); // T29: no minimum press length (clamp to no-inverted-range only)
            }
        }
        // No note within tolerance → the click hit nothing; consume both signals.

        pendingStrokes.splice(si, 1);
        pendingErrors.splice(bestErr, 1);
        si--; // an element shifted into this index — re-check it
    }

    // 3b) T16 ERROR-ONLY FALLBACK (double check): an error that has aged past the
    //     desynk window has NO key stroke — the precise stream lost it (or the
    //     stroke packet was dropped), but the COMMON stream still carries the
    //     hit-error array (data.play.hitErrorArray, now read in §6). Judge the note
    //     from the error alone so the hit registers instead of vanishing at step 4.
    //     The error implies the click time: estNoteStart + error = the moment the
    //     player clicked. A valid hit means that click sat INSIDE the note's hit
    //     window: delay = pe.liveTime - (obj.startTime + pe.error) must be ≥ -30
    //     (click not before the window opened) and ≤ 250 (≈2.5 common packets —
    //     the error's arrival latency). Among all candidates the SMALLEST delay
    //     wins: in a skipped-note pattern (previous note missed, next hit) the
    //     previous note's implied click is a full note-gap (~hundreds of ms) older
    //     than the hit note's, so the true note wins the tiebreak. A dense
    //     double-hit can only swap error attribution between two notes that were
    //     BOTH hit — both render as hits, so it is harmless. hitLane stays -1
    //     (no stroke → lane unknown). A clean hit is never re-matched (T11);
    //     a miss-marked note CAN be matched (hit always wins).
    for (let ei = 0; ei < pendingErrors.length; ei++) {
        const pe = pendingErrors[ei];
        if ((liveTime - pe.liveTime) < DESYNK_MATCH_WINDOW_MS) continue; // the gated matcher still has a chance
        const estNoteStart = pe.liveTime - pe.error;
        let bestObj = null;
        let bestDelay = Infinity;
        const searchTolerance = Math.max(150, (typeof hitWindow50 !== 'undefined' ? hitWindow50 : 150) + 50);
        for (let j = 0; j < hitObjects.length; j++) {
            const obj = hitObjects[j];
            // T17: the common stream only FILLS a missing hit error — it never
            // overrides one the precise stream already matched.
            if (typeof obj.hitError !== 'undefined') continue;
            const diff = Math.abs(obj.startTime - estNoteStart);
            if (diff >= searchTolerance) continue;
            const delay = pe.liveTime - (obj.startTime + pe.error);
            if (delay < -30 || delay > 250) continue; // click outside the plausible window
            if (delay < bestDelay) { bestDelay = delay; bestObj = obj; }
        }
        if (bestObj) {
            // T17: store the common-sourced evidence; rejudgeTimeline derives the
            // final state. Lane unknown (no stroke) — rejudge keeps hitLane = -1.
            bestObj.hitError = pe.error;
            bestObj.hitSource = 'common';
            bestObj.hitLane = -1;
            bestObj.actualHitTime = bestObj.startTime + pe.error;
            bestObj.driftMs = Math.abs(bestObj.startTime - estNoteStart); // T7 debug, consistent with the gated path
            hitErrorDriftSamples.push(bestObj.driftMs);
            if (hitErrorDriftSamples.length > 10) hitErrorDriftSamples.shift();
        }
        pendingErrors.splice(ei, 1); // the stroke will never come — consume either way
        ei--;
    }

    // 4) EXPIRY: flush buffered signals older than the desynk window. They hit
    //    nothing (a stray click, or the partner signal never arrived).
    while (pendingStrokes.length && (liveTime - pendingStrokes[0].liveTime) > DESYNK_MATCH_WINDOW_MS) {
        pendingStrokes.shift();
    }
    while (pendingErrors.length && (liveTime - pendingErrors[0].liveTime) > DESYNK_MATCH_WINDOW_MS) {
        pendingErrors.shift();
    }

    // 5) T17: the high-water mark is monotonic — a shorter array (a stale/lagging
    //    common snapshot) is simply ignored; nothing is ever re-processed and no
    //    note is ever re-opened by a packet. Restart / quick-retry is handled by
    //    resetTimelineState (state change, new checksum, or the §4 -500ms live-time
    //    regression), which is the only path that rewrites the whole timeline.
}

function parseWebsocketPayload(data) {
    if (!data || typeof data !== 'object') return;
    const now = performance.now();
    lastReceiveTime = now;

    // 1. Skin folder
    const skinFolder = data.settings?.folders?.skin || data.folders?.skin || data.skinFolder;
    if (skinFolder && skinFolder !== lastSkinFolder) {
        isNewSkin = true;
        lastSkinFolder = skinFolder;
        loadSkinIniColors();
        loadTextures();
    }

    // 2. Game State
    let incomingState = null;
    if (typeof data.menu?.state === 'number') {
        const num = data.menu.state;
        incomingState = (num === 2) ? 'play' : (num === 1 || num === 11 ? 'songselect' : (num === 7 ? 'results' : 'menu'));
    } else if (data.state?.name) incomingState = String(data.state.name);
    else if (typeof data.stateName === 'string') incomingState = data.stateName;
    else if (typeof data.state === 'string') incomingState = data.state;
    else if (typeof data.state?.number === 'number') {
        const num = data.state.number;
        incomingState = (num === 2) ? 'play' : (num === 1 || num === 11 ? 'songselect' : (num === 7 ? 'results' : 'menu'));
    }

    if (incomingState) {
        const normalizedState = incomingState.toLowerCase();
        if (normalizedState !== gameStateName) {
            if (normalizedState === 'play' || normalizedState === 'songselect' || normalizedState === 'menu') {
                resetTimelineState();
            }
            gameStateName = normalizedState;
        }
    }

    // 3. Beatmap Information & Checksum
    const bm = data.menu?.bm || data.beatmap || null;
    if (bm) {
        if (bm.metadata) {
            mapTitle = `${bm.metadata.artist || 'Unknown'} - ${bm.metadata.title || 'Unknown'} [${bm.metadata.difficulty || 'Normal'}]`;
        } else if (bm.artist || bm.title) {
            mapTitle = `${bm.artist || 'Unknown'} - ${bm.title || 'Unknown'} [${bm.version || bm.difficulty || 'Normal'}]`;
        }

        const cs = bm.md5 || bm.checksum || (bm.id ? String(bm.id) : null);
        if (cs && cs !== lastChecksum) {
            lastChecksum = cs;
            resetTimelineState();
            fetchBeatmap(bm);
        }

        updateComboColors();
        if (typeof hasHitCircleTexture !== 'undefined' && hasHitCircleTexture) {
            createTintedVersions();
        }
    }

    // 4. Live Timeline Time
    const commonLiveTime = (bm && bm.time && typeof bm.time.current === 'number') ? bm.time.current :
                           (bm && bm.time && typeof bm.time.live === 'number') ? bm.time.live :
                           (typeof data.currentTime === 'number') ? data.currentTime :
                           (typeof data.time === 'number') ? data.time : null;

    if (commonLiveTime !== null) {
        let dtTosu = 0;
        if (lastCommonLiveTime > 0) {
            dtTosu = commonLiveTime - lastCommonLiveTime;
            if (dtTosu < -500) { resetTimelineState(); }
        }
        if (commonLiveTime > lastCommonLiveTime) {
            commonPacketsSinceAdvance = 0; // map time advanced — not paused
        }
        lastCommonLiveTime = commonLiveTime;
        lastCommonRealTime = now;
    }

    // 5. Combo & Misses
    const currentCombo = (data.gameplay && data.gameplay.combo && typeof data.gameplay.combo.current === 'number') 
        ? data.gameplay.combo.current 
        : (data.play && data.play.combo && typeof data.play.combo.current === 'number') 
        ? data.play.combo.current 
        : null;

    if (currentCombo !== null) {
        // PRIMARY: the common packet's miss counter (hits["0"]) is the authoritative
        // count of misses. When it increments by N, the player just missed N notes in
        // a row (no successful hit errors in between) → mark N notes missed now.
        const gameMissCount = (data.gameplay && data.gameplay.hits && typeof data.gameplay.hits["0"] === 'number')
            ? data.gameplay.hits["0"]
            : (data.play && data.play.hits && typeof data.play.hits["0"] === 'number')
            ? data.play.hits["0"]
            : null;
        let missCountDelta = 0;
        if (gameMissCount !== null) {
            if (gameMissCount > lastGameMissCount) {
                missCountDelta = gameMissCount - lastGameMissCount;
                // T14: anchor the mark to the moment the game registered the miss.
                // In osu!lazer, hitting the next note auto-misses the unhit
                // previous note, and the hits["0"] increment + combo drop land in
                // the SAME packet as the next note's hit (473ms after the missed
                // note in the T14 retest). The anchor (drop time) restricts
                // selection to notes whose window closed before that moment → the
                // unhit note is marked, not the note that was hit.
                let dropNow = lastCommonLiveTime; // T24: default to the current packet's map time (consecutive misses: combo already 0, no new drop — the hits["0"] increment IS the anchor)
                if (currentCombo < lastCombo && lastCombo > 0) {
                    dropNow = lastCommonLiveTime; // drop in THIS packet
                } else if (comboDropCommonSeq >= 0 && lastMissIncrementCommonSeq === comboDropCommonSeq - 1) {
                    dropNow = lastComboDropTime; // drop in the PREVIOUS packet (T11 explained-by-prev)
                }
                // T17: record the evidence — one event per missed note, anchored to
                // the moment the game registered the miss (T14 dropNow logic).
                // rejudgeTimeline assigns each event to a note (most-recently-
                // expired window before the anchor) on a later pass — a note whose
                // window has not elapsed yet is simply assigned on the packet it
                // has, so nothing is ever lost or double-marked.
                for (let _mi = 0; _mi < missCountDelta; _mi++) {
                    missEvents.push({ time: dropNow, note: undefined });
                }
                // T11: timestamp the increment (map time + packet seq) so the
                // combo-drop arbitration below can check "current or previous packet."
                lastMissIncrementTime = lastCommonLiveTime;
                lastMissIncrementCommonSeq = commonPacketSeq;
            }
            lastGameMissCount = gameMissCount;
        }
        // FALLBACK: a combo drop NOT explained by a miss-count increment is a SLIDER
        // BREAK (cuts the combo but is not a "miss" in hits["0"]). Gray out the broken
        // slider specifically (its head was hit, so the generic miss-count path skips it).
        // T11: packet-count arbitration (≤2 common packets). The game updates
        // every 2ms and tosu reads RAM snapshots, so a real miss's hits["0"]
        // increment and the combo drop it causes are ≤1 packet apart: a drop with
        // no increment in THIS packet is either the delayed observation of the
        // PREVIOUS packet's increment (explained — no break), or the increment
        // will arrive in the NEXT packet. Defer exactly one common packet before
        // declaring a slider break.
        if (currentCombo < lastCombo && lastCombo > 0 && missCountDelta === 0) {
            const explainedByPrev = (lastMissIncrementCommonSeq === commonPacketSeq - 1);
            if (comboDropCommonSeq >= 0) {
                // A previous unexplained drop is still pending — resolve it first:
                // a break only if no increment arrived after it.
                if (lastMissIncrementCommonSeq <= comboDropCommonSeq) {
                    breakEvents.push({ time: lastComboDropTime, note: undefined }); // T17: evidence for rejudgeTimeline P2
                }
                comboDropCommonSeq = -1;
            }
            if (!explainedByPrev) {
                lastComboDropTime = lastCommonLiveTime;
                comboDropCommonSeq = commonPacketSeq;
            }
        } else if (comboDropCommonSeq >= 0 && commonPacketSeq >= comboDropCommonSeq + 1) {
            // The drop's next common packet has arrived: the increment has had
            // its ≤2-packet chance. Still no increment in the window → true
            // slider break: gray out the slider the player was on at the drop.
            if (missCountDelta === 0 && lastMissIncrementCommonSeq <= comboDropCommonSeq) {
                breakEvents.push({ time: lastComboDropTime, note: undefined }); // T17: evidence for rejudgeTimeline P2
            }
            comboDropCommonSeq = -1;
        }
        lastCombo = currentCombo;
    }

    // 6. Keys and Hit Errors
    const keyData = data.gameplay?.keyOverlay || data.keys || null;
    // T16: the COMMON stream carries the same hit-error array (data.play.hitErrorArray
    // in tosu v2 payloads — see the Architect's common-packet sample). Reading it lets
    // an error that the precise stream dropped (or delivered late) still be matched,
    // via the step 3b error-only fallback below. The shared high-water dedupe in step 2
    // means an error already consumed by the precise stream is never re-processed.
    const hitErrorsData = Array.isArray(data.gameplay?.hitErrorArray) ? data.gameplay.hitErrorArray :
                          (Array.isArray(data.hitErrors) ? data.hitErrors : 
                          (Array.isArray(data.play?.hitErrorArray) ? data.play.hitErrorArray : 
                          (Array.isArray(data.tourney) && data.tourney[0] && Array.isArray(data.tourney[0].hitErrors)) ? data.tourney[0].hitErrors : null));

    let activeLiveTime = 0;
    if (lastCommonLiveTime > 0) {
        activeLiveTime = lastCommonLiveTime + (now - lastCommonRealTime) * (currentSpeed || 1.0);
    } else {
        activeLiveTime = lastCommonLiveTime || 0;
    }

    if (keyData || hitErrorsData) {
        processKeyAndHitData(keyData, hitErrorsData, activeLiveTime);
    }

    // T17: re-derive every note's final state from the accumulated evidence
    // (hit errors > break > miss > press) — idempotent, order-independent.
    rejudgeTimeline();
}

function connect(isManual = false) {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (isManual) {
        connectionRetryCount = 0;
        autoReconnectEnabled = true;
    }

    teardownAllSockets();

    // Guard against Mixed Content loop on HTTPS
    if (tosuConfig.isHttps && !tosuConfig.isSecure) {
        isTosuConnected = false;
        tosuConnectionStatus = 'https_restricted';
        logConnectionStatus('https_restricted');
        notifyUIStatus();
        return;
    }

    isConnecting = true;
    tosuConnectionStatus = 'connecting';
    notifyUIStatus();

    const commonUrl = `${tosuConfig.wsBase}/websocket/v2`;
    const preciseUrl = `${tosuConfig.wsBase}/websocket/v2/precise`;

    // ──────── WS COMMON ────────
    try {
        wsCommon = new WebSocket(commonUrl);

        wsCommon.onopen = () => {
            isTosuConnected = true;
            isConnecting = false;
            tosuConnectionStatus = 'connected';
            connectionRetryCount = 0;
            logConnectionStatus('connected');
            notifyUIStatus();
        };

        wsCommon.onmessage = (e) => {
            try {
                commonPacketsSinceAdvance++; // count common packets; reset to 0 when time advances
                commonPacketSeq++; // T11: packet-count clock for the ≤2-packet miss/drop arbitration
                const data = JSON.parse(e.data);
                parseWebsocketPayload(data);
            } catch (err) {}
        };

        wsCommon.onclose = () => {
            handleSocketFailure();
        };

        wsCommon.onerror = () => {
            handleSocketFailure();
        };
    } catch (err) {
        handleSocketFailure();
        return;
    }

    // ──────── WS PRECISE (High-Frequency Keys & Hit Errors) ────────
    try {
        wsPrecise = new WebSocket(preciseUrl);

        wsPrecise.onopen = () => {
            // High-frequency input socket ready
        };

        wsPrecise.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                parseWebsocketPayload(data);
            } catch (err) {}
        };

        wsPrecise.onclose = () => {
            wsPrecise = null;
        };

        wsPrecise.onerror = () => {
            wsPrecise = null;
        };
    } catch (err) {
        wsPrecise = null;
    }
}

// Global helper to switch tosu host at runtime
window.updateTosuHost = function(newHost, isSecure) {
    if (!newHost) return;
    tosuConfig.host = newHost.trim();
    if (typeof isSecure === 'boolean') {
        tosuConfig.isSecure = isSecure;
    }
    try {
        localStorage.setItem('osu_tosu_host', tosuConfig.host);
    } catch (e) {}
    console.log(`[osu! Timeline] Switching tosu target to: ${tosuConfig.wsBase}`);
    connect(true);
};

// Global helper for manually triggering a reconnect attempt
window.retryTosuConnection = function() {
    console.log('[osu! Timeline] Manual reconnection requested.');
    connect(true);
};

function resetTimelineState() { 
    hitErrorCount = 0; 
    lastCommonLiveTime = 0;
    commonPacketsSinceAdvance = 0;
    currentSpeed = 1.0;
    ourDetectedMissCount = 0;
    hitErrorDriftSamples = [];
    lastCombo = 0;
    comboDropActive = false; // T15: reset with the rest of the combo/miss state
    lastGameMissCount = 0;
    lastComboDropTime = -1;
    commonPacketSeq = 0; // T11
    lastMissIncrementTime = -1; // T11
    lastMissIncrementCommonSeq = -1; // T11
    comboDropCommonSeq = -1; // T11
    missEvents = []; // T17: clear the miss evidence on map change/rewind
    breakEvents = []; // T17: clear the break evidence on map change/rewind
    
    keyStrokes = [];
    pendingStrokes = [];
    pendingErrors = [];
    activeStrokes = { k1: null, k2: null, m1: null, m2: null };
    lastCounts = { k1: 0, k2: 0, m1: 0, m2: 0 };
    keyBoxStates = { k1: false, k2: false, m1: false, m2: false };
    if (hitObjects) {
        for (let i = 0; i < hitObjects.length; i++) {
            const h = hitObjects[i];
            h.judged = false;
            h.isMissed = false;
            h.hitLane = -1;
            h.actualHitTime = undefined;
            h.hitError = undefined; // T17
            h.hitSource = undefined; // T17
            h.responsibleMiss = undefined; // T17
            h.responsibleBreak = undefined; // T17
            h.pressStroke = undefined; // T17
            h.judgedBy = 'none'; // T17
        }
    }
}

window.connect = connect;
window.resetTimelineState = resetTimelineState;

