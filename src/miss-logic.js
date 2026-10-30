// ────── MISS LOGIC ──────
// T17: evidence-based judgment. rejudgeTimeline() is the UNIFIER: the final state
// of every note is a pure function of the evidence (hit error > break > miss > press).
// (The 4 pre-T17 mark-gate functions were removed in T31 - zero call sites.)

// T28: repair hit-error notes that never got a lane (the "ghost" note). These are
// notes the 3b error-only fallback judged after the stroke had expired the 6ms
// desynk window (OBS lag). The stroke is still in the keyStrokes press history,
// just unmatched. Pair each such note to its closest unconsumed stroke within a
// 500ms cap and consume that stroke so one press cannot claim two notes. Runs
// only when a note pairs while its checkPreviousPairing flag is still active -
// not every frame or packet.
const REPAIR_SEARCH_CAP_MS = 500;
function repairLanes() {
    for (let j = 0; j < hitObjects.length; j++) {
        const n = hitObjects[j];
        if (typeof n.hitError === 'undefined' || n.hitLane !== -1 || n.isMissed) continue;
        if (typeof n.actualHitTime !== 'number') continue; // no click time to match against
        let bestSt = null;
        let bestD = Infinity;
        for (let k = 0; k < keyStrokes.length; k++) {
            const st = keyStrokes[k];
            if (st.matched || st.claimedBy !== undefined) continue; // already consumed
            const d = Math.abs(st.startTime - n.actualHitTime);
            if (d <= REPAIR_SEARCH_CAP_MS && d < bestD) { bestD = d; bestSt = st; }
        }
        if (bestSt) {
            n.hitLane = (bestSt.key === 'k1' || bestSt.key === 'm1') ? 0 : 1;
            bestSt.matched = true; // consumed - one press cannot claim two notes
        }
    }
}


// ──────── T17: THE UNIFIER — evidence-based timeline judgment ────────
// The final state of every note is a PURE FUNCTION of the evidence:
//   P1 hit error (precise or common) → HIT (always wins; rejudge keeps the
//      matcher's actualHitTime/driftMs/hitLane)
//   P2 a responsible combo-break event (slider) → GRAY (a body break grays even
//      when the head has a hit error — the events coexist; the break paints the
//      tail, the drawing layer splits the slider)
//   P3 a responsible miss event (hits["0"] increment) → MISS (gray)
//   P4 window elapsed, no hit error, no miss/break → ASSUME HIT from the nearest
//      unassigned button press (Option A: claims are provisional and recomputed
//      every pass — a later hit error or miss event simply outranks them)
// Events are assigned by TIMING (T14: most-recently-expired window before the
// event's anchor) and, once assigned, are consumed (ev.note set) so a single
// game event can never judge two notes. A hit error and a miss/break may coexist
// on one note — only the RENDERED judgment is priority-resolved, and a note with
// a hit error is never rendered as a miss.
function rejudgeTimeline() {
    const now = lastCommonLiveTime || 0;
    if (now <= 0 || !hitObjects || hitObjects.length === 0) return;
    const hw50 = (typeof hitWindow50 === 'number' && hitWindow50 > 0) ? hitWindow50 : 119.5;
    const curOD = (typeof beatmapOD === 'number' && !isNaN(beatmapOD)) ? beatmapOD : 8.0;

    // T20: HYBRID look-back window for assigning a miss/break event to a note.
    // A note is eligible if it is EITHER within LOOKBACK_TIME before the event
    // anchor OR is one of the LOOKBACK_COUNT most-recent expired objects before
    // the anchor. The time part is OD-based (tighter at high OD); the count part
    // is the safety net for long sliders (> the time window).
    const lookbackTime = Math.max(400, 1200 - curOD * 70);
    const LOOKBACK_COUNT = 12;

    // P1: assign MISS events to notes (in event order = game order).
    // T20: a miss can NEVER sit on a note that has a hit error (a hit error is a
    // 100% confirmed hit). If a note we assigned later gains a hit error, release
    // the miss so it re-flows to the note that was actually missed (RULE B/E).
    // Assignments are stable (once assigned, consumed) and anchored at the FIXED
    // miss time, so they do not drift as now advances. A miss may only be claimed
    // from within the hybrid look-back window (no stale grabs).
    for (let i = 0; i < missEvents.length; i++) {
        const ev = missEvents[i];
        // Release a miss if its assigned note later gained a hit error.
        if (ev.note && ev.note !== null && typeof ev.note.hitError !== 'undefined') {
            ev.note.responsibleMiss = undefined;
            ev.note = undefined;
        }
        if (ev.note !== undefined) continue; // already assigned (and still valid) — keep
        if (now - ev.time > 4000) { ev.note = null; continue; } // stale (4s) — drop
        const anchor = ev.time; // fixed miss time (stable, no drift)
        let best = null;
        for (let j = 0; j < hitObjects.length; j++) {
            const n = hitObjects[j];
            if (typeof n.hitError !== 'undefined') continue; // a hit error outranks this miss
            if (n.responsibleMiss || n.responsibleBreak) continue; // already owned by another event
            const expired = n.startTime + hw50;
            if (expired < anchor - lookbackTime) continue; // closed too long ago (stale — no stale grabs)
            if (expired > anchor + hw50) continue; // T23: still open well after the miss (not the missed note; tosu timing can lag slightly so allow up to one window)
            const dist = Math.abs(expired - anchor); // T23: target the note whose window closed closest to the miss (handles tosu jitter both ways)
            if (!best || dist < best.dist) best = { n: n, dist: dist };
        }
        if (best) { best.n.responsibleMiss = ev; ev.note = best.n; }
    }

    // P2: assign BREAK events to sliders (head at/before the drop), bounded by the
    // same hybrid look-back window (T20). A break COEXISTS with a head hit error
    // (case 5: head hit, body gray) — so a break is NOT released when the slider
    // has a hit error; the drawing layer splits the slider.
    for (let i = 0; i < breakEvents.length; i++) {
        const ev = breakEvents[i];
        if (ev.note !== undefined) continue; // already assigned — keep (coexists with hit error)
        if (now - ev.time > 4000) { ev.note = null; continue; } // stale (4s) — drop
        const anchor = ev.time;
        // count cut over SLIDERS only: a long slider's head is far back, so the
        // window extends to the LOOKBACK_COUNT-th most-recent slider (or the oldest
        // if fewer). A flat time window can't reach a slider longer than the window.
        const recents = [];
        for (let j = 0; j < hitObjects.length; j++) {
            if (hitObjects[j].type === 'slider' && hitObjects[j].startTime + hw50 < anchor) recents.push(hitObjects[j].startTime);
        }
        recents.sort((a, b) => b - a);
        const countCut = recents.length >= LOOKBACK_COUNT ? recents[LOOKBACK_COUNT - 1] : -Infinity;
        let best = null;
        for (let j = 0; j < hitObjects.length; j++) {
            const n = hitObjects[j];
            if (n.type !== 'slider' || n.startTime > anchor) continue;
            if (n.responsibleBreak) continue; // already owned
            if (!(anchor - n.startTime <= lookbackTime || n.startTime >= countCut)) continue; // T20 window
            if (!best || n.startTime > best.startTime) best = n; // most recent slider in window
        }
        if (best) { best.responsibleBreak = ev; ev.note = best; }
    }

    // P3: claim button presses for assume-hit notes (Option A — recomputed every
    // pass; a later miss/break simply outranks the press and the claim reflows).
    for (let j = 0; j < keyStrokes.length; j++) keyStrokes[j].claimedBy = undefined;
    for (let j = 0; j < hitObjects.length; j++) {
        const n = hitObjects[j];
        n.pressStroke = undefined; // recompute every pass
        if (typeof n.hitError !== 'undefined') continue; // hit error outranks a press
        if (n.responsibleMiss || n.responsibleBreak) continue;
        if (now <= n.startTime + hw50) continue; // window not elapsed yet
        let best = null;
        for (let k = 0; k < keyStrokes.length; k++) {
            const st = keyStrokes[k];
            if (st.matched || st.claimedBy !== undefined) continue; // consumed by the gated matcher or claimed
            const d = Math.abs(st.startTime - n.startTime);
            if (d <= hw50 + 30 && (!best || d < best.d)) best = { st: st, d: d };
        }
        if (best) { n.pressStroke = best.st; best.st.claimedBy = n; }
    }

    // P4: derive the final state of every note from the evidence.
    let missCount = 0;
    for (let j = 0; j < hitObjects.length; j++) {
        const n = hitObjects[j];
        n.judged = false;
        n.isMissed = false;
        n.judgedBy = 'none';
        if (typeof n.hitError !== 'undefined') {
            // (1) HIT — the highest-priority evidence (100% confirmed hit).
            n.judged = true;
            n.judgedBy = (n.hitSource === 'common') ? 'common-hit-error' : 'precise-hit-error';
            if (typeof n.actualHitTime === 'undefined') n.actualHitTime = n.startTime + (n.hitError || 0);
        } else if (n.responsibleBreak) {
            // (2) SLIDER BREAK — gray. Coexists with a head hit-error (case 5):
            // the hit keeps its error; the drawing layer paints the tail gray.
            n.judged = true;
            n.isMissed = true;
            n.judgedBy = 'break-event';
            n.missedAt = n.startTime + hw50;
            n.hitLane = -1; // T20: a miss/break can only sit on a lane-less note
        } else if (n.responsibleMiss) {
            // (3) MISS — the note the hits["0"] increment is responsible for.
            n.judged = true;
            n.isMissed = true;
            n.judgedBy = 'miss-event';
            n.missedAt = n.startTime + hw50;
            n.hitLane = -1; // T20: a miss/break can only sit on a lane-less note
            missCount++;
        } else if (now > n.startTime + hw50 && n.pressStroke) {
            // (4) ASSUME HIT (Option A): no hit error, no miss/break, AND a real
            // press exists — the press's timing sets the hit time and lane.
            n.judged = true;
            n.judgedBy = 'button-press';
            n.actualHitTime = n.pressStroke.startTime;
            n.hitLane = (n.pressStroke.key === 'k1' || n.pressStroke.key === 'm1') ? 0 : 1;
        }
        // (5) else: unjudged (no evidence yet) — a note with no hit error, no
        // miss/break, and no press is left centered with NO fabricated hit.
    }
    ourDetectedMissCount = missCount; // DERIVED — breaks are not misses
}