// ──────── MAIN APPLICATION ────────
// The heartbeat loop that glues the components together.

// Connect to the WebSocket and start the drawing loop
if (typeof connect === 'function') {
    connect();
} else if (typeof window.connect === 'function') {
    window.connect();
}

if (typeof draw === 'function') {
    requestAnimationFrame(draw);
} else if (typeof window.draw === 'function') {
    requestAnimationFrame(window.draw);
}