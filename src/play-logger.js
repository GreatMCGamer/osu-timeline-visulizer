// ============================================================================
// play-logger.js — T19: per-play debug logger (export-only)
// ----------------------------------------------------------------------------
// The timeline visualizer runs as an OBS browser source and CANNOT write to
// disk. This module has NO recording hooks and NO background logging — it just
// snapshots the CURRENT live judgment state on demand.
//
// USAGE (in a normal browser, e.g. via `npx serve`):
//   1. Play the map with tosu connected.
//   2. In the page's DevTools console, type:      exportPlayLog()
//   3. A .log file downloads to your Downloads folder.
//
// NOTE: the live timeline is wiped when the play ends (state -> results /
// menu / new map / rewind). Export BEFORE you leave the play screen, or the
// dump will be empty.
//
// The .log contains (one line per relevant object):
//   * EVENT LOG  — every miss/break evidence event: its map time, which note it
//                  was assigned to (Δ = event − noteStart), or DROPPED(stale).
//   * NOTE TABLE — every "interesting" note with all its evidence fields:
//                  t, type, hb(judgedBy), im(isMissed), ma(missedAt),
//                  he(hitError), hs(hitSource), ht(actualHitTime), hl(hitLane),
//                  rm/rb (assigned event) + nm/nb (NEAREST miss/break event,
//                  regardless of assignment — the "miss/break nearby but not
//                  marked missed" view).
//   * SUMMARY    — counts per judgedBy + the hitWindow50 in use.
//
// It reads only the app's top-level globals (hitObjects, missEvents,
// breakEvents, mapTitle, hitWindow50), so it works from a plain classic
// <script> with no coupling to the websocket module.
// ============================================================================
(function () {
    'use strict';

    function nowIso() { try { return new Date().toISOString(); } catch (e) { return String(Date.now()); } }
    function fmt(v) { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(1) : '-'; }
    function signed(d) { return (typeof d === 'number' && isFinite(d)) ? ((d >= 0 ? '+' : '') + d.toFixed(1)) : '-'; }

    // nearest event index within `maxAbs` ms of `t`; returns { i, d } or null.
    function nearEvent(events, t, maxAbs) {
        if (!events || !events.length) return null;
        let best = null;
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (typeof ev.time !== 'number') continue;
            const d = ev.time - t;
            if (maxAbs !== Infinity && Math.abs(d) > maxAbs) continue;
            if (!best || Math.abs(d) < Math.abs(best.d)) best = { i: i, d: d };
        }
        return best;
    }

    // A note is "interesting" (worth a table row) if it carries any evidence,
    // has been judged, or sits near a miss/break event.
    function isInteresting(n) {
        if (typeof n.hitError !== 'undefined') return true;
        if (n.responsibleMiss) return true;
        if (n.responsibleBreak) return true;
        if (n.pressStroke) return true;
        if (n.judgedBy && n.judgedBy !== 'none') return true;
        const me = (typeof missEvents !== 'undefined') ? missEvents : null;
        const be = (typeof breakEvents !== 'undefined') ? breakEvents : null;
        if (nearEvent(me, n.startTime, 1500)) return true;
        if (nearEvent(be, n.startTime, 1500)) return true;
        return false;
    }

    // Build the event log + note table + summary from the CURRENT live state.
    function buildTable() {
        const objs = (typeof hitObjects !== 'undefined' && hitObjects) ? hitObjects : [];
        const me = (typeof missEvents !== 'undefined' && missEvents) ? missEvents : [];
        const be = (typeof breakEvents !== 'undefined' && breakEvents) ? breakEvents : [];
        const hw50 = (typeof hitWindow50 === 'number' && hitWindow50 > 0) ? hitWindow50 : 119.5;

        // event index maps (array order = creation order)
        const mIdx = new Map(); for (let i = 0; i < me.length; i++) mIdx.set(me[i], i);
        const bIdx = new Map(); for (let i = 0; i < be.length; i++) bIdx.set(be[i], i);

        // event log lines
        const evLines = [];
        for (let i = 0; i < me.length; i++) {
            const ev = me[i];
            if (ev.note === null) evLines.push('  M#' + i + ' t=' + fmt(ev.time) + '  DROPPED(stale)');
            else if (ev.note) evLines.push('  M#' + i + ' t=' + fmt(ev.time) + '  -> note#' + objs.indexOf(ev.note) + ' (t=' + fmt(ev.note.startTime) + ' Δ' + signed(ev.time - ev.note.startTime) + ')');
            else evLines.push('  M#' + i + ' t=' + fmt(ev.time) + '  (unassigned)');
        }
        for (let i = 0; i < be.length; i++) {
            const ev = be[i];
            if (ev.note === null) evLines.push('  B#' + i + ' t=' + fmt(ev.time) + '  DROPPED(stale)');
            else if (ev.note) evLines.push('  B#' + i + ' t=' + fmt(ev.time) + '  -> note#' + objs.indexOf(ev.note) + ' (slider t=' + fmt(ev.note.startTime) + ' Δ' + signed(ev.time - ev.note.startTime) + ')');
            else evLines.push('  B#' + i + ' t=' + fmt(ev.time) + '  (unassigned)');
        }

        // note table (interesting notes only) + summary counts (all notes)
        const rows = [];
        const counts = { 'precise-hit-error': 0, 'common-hit-error': 0, 'break-event': 0, 'miss-event': 0, 'button-press': 0, 'none': 0 };
        for (let i = 0; i < objs.length; i++) {
            const n = objs[i];
            const hb = n.judgedBy || 'none';
            if (counts[hb] === undefined) counts[hb] = 0;
            counts[hb]++;
            if (!isInteresting(n)) continue;
            const rm = n.responsibleMiss ? ('M#' + mIdx.get(n.responsibleMiss) + '@' + fmt(n.responsibleMiss.time)) : '-';
            const rb = n.responsibleBreak ? ('B#' + bIdx.get(n.responsibleBreak) + '@' + fmt(n.responsibleBreak.time)) : '-';
            const nm = nearEvent(me, n.startTime, Infinity);
            const nb = nearEvent(be, n.startTime, Infinity);
            const nmS = nm ? ('M#' + nm.i + ':' + signed(nm.d)) : '-';
            const nbS = nb ? ('B#' + nb.i + ':' + signed(nb.d)) : '-';
            rows.push(
                '  #' + String(i).padStart(4) +
                '  t=' + fmt(n.startTime).padStart(10) +
                '  ' + (n.type || '?').padEnd(7) +
                '  hb=' + hb.padEnd(15) +
                '  im=' + (n.isMissed ? 1 : 0) +
                '  ma=' + fmt(n.missedAt).padStart(10) +
                '  he=' + fmt(n.hitError).padStart(7) +
                '  hs=' + (n.hitSource || '-').padEnd(6) +
                '  ht=' + fmt(n.actualHitTime).padStart(10) +
                '  hl=' + (n.hitLane === undefined ? '?' : n.hitLane) +
                '  rm=' + rm +
                '  rb=' + rb +
                '  nm=' + nmS +
                '  nb=' + nbS
            );
        }

        const map = (typeof mapTitle !== 'undefined' && mapTitle) ? mapTitle : '?';
        const summary =
            'map: ' + map +
            '  |  hitWindow50=' + hw50.toFixed(1) + 'ms' +
            '  |  notes=' + objs.length +
            '  |  precise=' + counts['precise-hit-error'] +
            '  common=' + counts['common-hit-error'] +
            '  miss=' + counts['miss-event'] +
            '  break=' + counts['break-event'] +
            '  press=' + counts['button-press'] +
            '  none=' + counts['none'];

        return { evLines: evLines, rows: rows, summary: summary, total: objs.length };
    }

    function assemble(table) {
        const out = [];
        out.push('===== osu! timeline play log =====');
        out.push('captured: ' + nowIso());
        out.push(table.summary);
        out.push('');
        out.push('EVENT LOG (M=miss-event, B=break-event; t=map time; -> assigned note; Δ=event−noteStart)');
        if (table.evLines.length) out.push.apply(out, table.evLines);
        else out.push('  (none)');
        out.push('');
        out.push('NOTE TABLE (interesting notes only)');
        out.push('  #      t          type     hb               im  ma         he       hs      ht        hl  rm        rb        nm        nb');
        if (table.rows.length) out.push.apply(out, table.rows);
        else out.push('  (no interesting notes)');
        out.push('===== end (' + table.total + ' notes) =====');
        return out.join('\n');
    }

    // Trigger a browser download of the given text as a .log file.
    function download(text) {
        try {
            if (typeof Blob === 'undefined' || typeof document === 'undefined' || !document.body) return;
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'osu-play-' + Date.now() + '.log';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
        } catch (e) {}
    }

    // The ONLY public command: snapshot the current play state and download it.
    // Returns the .log text too (handy in the console).
    window.exportPlayLog = function () {
        const text = assemble(buildTable());
        download(text);
        return text;
    };
})();
