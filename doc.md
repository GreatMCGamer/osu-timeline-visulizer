## Project Structure

The monolithic JavaScript file has been broken down into multiple modular files to improve maintainability and organization. Files load in the order they are listed in `index.html`:

```
osu-timeline-visulizer/
├── index.html
├── doc.md
├── README.md
├── default_skin/            # local texture fallback (tier 3) + skin.ini
└── src/
    ├── core-config.js
    ├── websocket-connection.js
    ├── play-logger.js
    ├── beatmap-parser.js
    ├── texture-manager.js
    ├── sliders-manager.js
    ├── text-manager.js
    ├── drawing-functions.js
    ├── key-visualization.js
    ├── miss-logic.js
    └── main-application.js
```

## File Descriptions

### 1. `core-config.js`
**Purpose**: Core configuration and global state management

This file contains all constants, user settings, DOM elements, and global state variables that are shared across the entire application. It establishes the foundation for the visualization by defining:
- Canvas and context references, plus automatic OBS browser-source sizing (`resizeCanvas()` sets the playhead at 75% width and the centered lane at 50% height, and re-runs on window resize)
- User configuration settings (scale multiplier, `ComboColorSource` — currently `2` = skin colors from `skin.ini`, `TARGET_FPS`)
- tosu connection settings via `tosuConfig` (host from the `?host` URL param / `localStorage` / `127.0.0.1:24050`, `wsBase`/`httpBase` protocol getters, and `hideStatus` from `?hideStatus`)
- Key press visualization configuration (`KEY_LINE_THICKNESS`, `KEY_BOX_SIZE`, `KEY_BOX_Y`, `KEY_BOX_SPACING`). A minimum press length no longer exists — `MIN_KEY_PRESS_LENGTH_PX = 0`, so a 0ms tap renders as a dot; `MIN_KEY_PRESS_DURATION_MS` is kept only as a legacy reference
- Global state for the beatmap (objects, timing points, combo colors, overall difficulty, hit windows, map title)
- Global state for timing and game state (common/real live time, playback speed, pause detection counter)
- Global state for key presses (press history, per-key box states, buffered strokes/errors for gated matching)
- Texture and tinting state (loaded images, skin/beatmap/default combo color arrays, pre-tinted variations)
- The evidence lists (`missEvents`, `breakEvents`) and the arbitration clock (`commonPacketSeq`, etc.) that `rejudgeTimeline()` (in `miss-logic.js`) consumes
- Debug feature flags (`SHOW_DEBUG_PANEL`, `SHOW_JUDGMENT_BARS`, `SHOW_T7_DEBUG` — all currently `false`, so no debug overlay is drawn)

### 2. `websocket-connection.js`
**Purpose**: WebSocket connection management, real-time data pairing, and evidence recording

This file owns the live data path to tosu/gosumemory:
- Establishes and maintains both the common (~100ms) and precise (~2ms) WebSocket endpoints, with backoff reconnection, status reporting, and mixed-content (HTTPS) guards
- Runs the pairing engine (`processKeyAndHitData`): buffers incoming key strokes and hit errors, then pairs them inside a ~6ms desynk window so a note gets the lane and hit time of the key press that actually caused it
- Routes every payload (`parseWebsocketPayload`): skin-folder changes, game state, beatmap/checksum, live time, and combo/miss data
- Records the judgment evidence: appends to `missEvents` (game-registered misses from `hits["0"]` increments) and `breakEvents` (arbitrated slider breaks), using a ≤2-packet common-clock arbitration to tell a real miss from a slider break
- Calls into `rejudgeTimeline()` (defined in `miss-logic.js`) after pairing to re-derive every note's final state
- Provides connection reset (`resetTimelineState`) and the `window.retryTosuConnection` / `window.updateTosuHost` helpers
- (The T17 judgment logic and the T28 ghost-lane repair were moved out of this file into `miss-logic.js`; this file no longer contains the timeline unifier or lane repair.)

### 3. `play-logger.js`
**Purpose**: Per-play debug export (export-only, no live hooks)

Because the visualizer runs as an OBS browser source it cannot write to disk, so this module does no background logging — it snapshots the current live judgment state on demand:
- In a normal browser (e.g. `npx serve`), type `exportPlayLog()` in the DevTools console to download a `.log` file
- The dump contains an EVENT LOG (every miss/break evidence event with its map time and which note it was assigned to), a NOTE TABLE (every "interesting" note with all its evidence fields), and a SUMMARY (counts per judgment source + the hit window in use)
- It reads only the app's top-level globals (`hitObjects`, `missEvents`, `breakEvents`, `mapTitle`, `hitWindow50`), so it is loosely coupled
- The timeline is wiped when a play ends, so export before leaving the results screen

### 4. `beatmap-parser.js`
**Purpose**: Beatmap file parsing and processing

This file is responsible for fetching and parsing .osu beatmap files:
- Fetches the beatmap from tosu (with a checksum cache-buster so the browser never serves a stale file, plus a `/Songs/folder/file` fallback)
- Parses only the sections it needs (Difficulty, Colours, TimingPoints, HitObjects) to avoid choking on large storyboard sections
- Processes hit circles, sliders, and spinners; computes slider durations from timing points and the slider multiplier; tracks the cycling combo color index
- Sorts hit objects by start time and extracts difficulty settings (Overall Difficulty, Slider Tick Rate)
- Preserves OD = 0 and OD < 0 (half-time / custom maps) correctly
- Tags every note with a `checkPreviousPairing` flag (used by the pairing engine's ghost-note repair)

### 5. `texture-manager.js`
**Purpose**: Texture loading and color tinting

This file handles loading skin textures and creating color variations:
- Loads hit circle, overlay, slider tick, and slider body textures with a 3-tier fallback: tosu @2x → tosu normal → the local `default_skin/` folder (the slider body has no local track and stays tosu-only)
- Upscales non-@2x textures to 2x resolution without blurring
- Central combo-color selector (`updateComboColors`) chooses default, beatmap, or skin colors with a safe fallback
- Loads and parses `skin.ini` for the skin's `Combo1`–`Combo8`, `SliderBorder`, and `SliderTrackOverride` (flexible `:`/`=` key:value parser)
- Pre-combines the hit circle with its overlay into a single image and produces tinted variations per combo color

### 6. `sliders-manager.js`
**Purpose**: Slider body drawing and styling

This file contains the math and canvas-buffer operations required to draw dynamic slider bodies:
- Computes slider styles (track color, border color, highlight, and alpha), dimming and fading missed sliders
- Calculates the slider's target Y position from which key(s) are currently pressed (lane 0 → up, lane 1 → down, both/none → centered), ignoring keys that were already held before the head was hit
- Implements the "snaky" body movement: once a slider is judged it always snakes with the key presses — whether the head was hit (a body break) or missed (starting centered) — while points ahead of the playhead stay centered

### 7. `text-manager.js`
**Purpose**: Text rendering and title display

This file handles text rendering logic for beatmap titles and other text elements:
- Renders the beatmap title with dynamic font sizing (binary search for the largest font that fits) and greedy word wrapping
- Caches the computed font size and line layout so the render loop does zero per-frame allocation (keeps 60+ FPS)
- Applies shadow and bold styling and centers the wrapped title block vertically

### 8. `drawing-functions.js`
**Purpose**: Primary visual rendering and drawing logic

This is the main drawing module that handles all visual rendering:
- Runs the main animation loop (`draw`) and derives a **200ms-delayed** playhead time (`RENDER_DELAY_MS`) that every key-visual element shares, which suppresses flicker from packet jitter
- Draws hit circles with texture handling and tinting, slider bodies, and spinners
- Renders the timing grid, the playhead, and the key-press lanes and boxes (delegated to `key-visualization.js`)
- Displays the map title and manages the (currently disabled) debug panels and debug overlay, all gated behind the `SHOW_DEBUG_PANEL` / `SHOW_T7_DEBUG` flags so none draw by default

### 9. `key-visualization.js`
**Purpose**: Key press lane visualization

This file specifically handles the visualization of key press lanes:
- Draws the key-press trail lines extending from the playhead; with no minimum line length a 0ms tap renders as a round dot
- Draws the key-press boxes that indicate when each key is held
- Both the lines and the boxes are driven by the same 200ms-delayed playhead time so a box lights in lockstep with its line/dot (no early flash)

### 10. `miss-logic.js`
**Purpose**: Timeline judgment — the evidence-based state unifier

This file decides the final state of every note. The final state is a pure function of the evidence recorded by the websocket layer:
- `rejudgeTimeline()` (the T17 "unifier") assigns each miss/break evidence event to a note and derives every note's final state by priority: a hit error always wins, then a responsible combo break grays the note, then a press is assumed a hit, otherwise the note is left unjudged
- `repairLanes()` (T28) fixes "ghost" notes — a hit-error note left with no lane when the pairing window expired (OBS lag) — by pairing it to its closest unconsumed key press within a 500ms cap
- (The pre-T17 mark-gate functions that previously lived here were removed; judgment now flows entirely through the evidence model above)

### 11. `main-application.js`
**Purpose**: Application heartbeat and initialization

This file serves as the main application entry point that ties all components together:
- Initializes the WebSocket connection
- Starts the main drawing animation loop
- Acts as the central coordination point that ensures all modules are initialized and connected

## Troubleshooting: WebSocket Connection Errors

### Understanding `wsCommon error: { "isTrusted": true }`
When a browser attempts to connect to `ws://127.0.0.1:24050` and the connection fails, the browser standard security model returns a generic DOM `Event` object with property `{ "isTrusted": true }`. This happens for two primary reasons:

1. **tosu / gosumemory is not running**: tosu must be actively running on your PC on port `24050`.
2. **HTTPS Mixed Content Restriction**: If the timeline overlay is opened in a web browser over HTTPS (e.g. `https://...`), web browsers strictly prohibit opening unencrypted `ws://` connections to `127.0.0.1` or `localhost`.
   - **Fix for OBS Studio**: Add the timeline as a **Browser Source** pointing to `http://localhost:3000` (over standard HTTP) or as a local file. This avoids the mixed-content block.
   - **Host/port**: override the tosu host with the `?host=127.0.0.1:24050` URL parameter (or the in-memory stored host); `?hideStatus=1` hides the status badge for a clean OBS scene.
