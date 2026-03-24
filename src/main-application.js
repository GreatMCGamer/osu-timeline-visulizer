// ──────── MAIN APPLICATION ────────
// The heartbeat loop that glues the components together.

// Connect to the WebSocket and start the drawing loop
connect();
requestAnimationFrame(draw);