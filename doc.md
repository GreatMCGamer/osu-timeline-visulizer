## Project Structure

The monolithic JavaScript file has been broken down into multiple modular files to improve maintainability and organization:

```
osu-timeline-visulizer/
├── index.html
├── src/
│   ├── core-config.js
│   ├── websocket-connection.js
│   ├── beatmap-parser.js
│   ├── texture-manager.js
│   ├── sliders-manager.js
│   ├── drawing-functions.js
│   ├── key-visualization.js
│   ├── miss-logic.js
│   ├── text-manager.js
│   ├── demo-simulation.js
│   ├── ui-hud.js
│   └── main-application.js
└── README.md
```

## File Descriptions

### 1. `core-config.js`
**Purpose**: Core configuration and global state management

This file contains all constants, user settings, DOM elements, and global state variables that are shared across the entire application. It establishes the foundation for the visualization by defining:
- Canvas and context references
- User configuration settings (speed multiplier, scale, etc.)
- Key press visualization configuration
- Global state variables for game state, timing, and key presses
- Texture loading configuration
- Default combo colors and timing-related constants
- Automatic OBS browser source sizing handling

### 2. `websocket-connection.js`
**Purpose**: WebSocket connection management and real-time data handling

This file handles all WebSocket connections to tosu/gosumemory and processes real-time data streams:
- Establishes connections to both the common and precise WebSocket endpoints
- Processes beatmap data including map title, checksum, and timing information
- Manages game state changes and timing synchronization
- Handles key press data from the game
- Processes hit errors to determine when objects are missed
- Implements timeline locking and speed adjustment logic
- Contains functions for resetting timeline state and marking sliders as missed
- NEW: Handles skin color loading from skin.ini
- NEW: Implements precise key press matching with hit error data

### 3. `beatmap-parser.js`
**Purpose**: Beatmap file parsing and processing

This file is responsible for fetching and parsing .osu beatmap files:
- Fetches beatmap data from tosu/gosumemory
- Parses .osu files to extract hit objects, timing points, and combo colors
- Processes different object types (HitCircles, Sliders, Spinners)
- Calculates slider durations based on timing points and slider multipliers
- Sorts hit objects by start time for proper rendering order
- Extracts difficulty settings (Overall Difficulty, Slider Tick Rate)
- NEW: Handles beatmap file caching to prevent timeline freezing
- NEW: Preserves OD = 0 and OD < 0 values correctly

### 4. `texture-manager.js`
**Purpose**: Texture loading and color tinting

This file handles loading skin textures and creating color variations:
- Loads hit circle and slider tick textures with @2x fallback support
- Implements texture upscaling to 2x resolution without blurring
- Creates color-tinted variations of textures for different combo colors
- Handles fallback logic when textures are missing or fail to load
- Provides functions for tinting images with specific colors
- NEW: Combines hitcircle and hitcircleoverlay into a single pre-combined image
- NEW: Loads skin colors from skin.ini for accurate combo color matching
- NEW: Implements flexible key:value parser for skin.ini

### 5. `sliders-manager.js`
**Purpose**: Slider body drawing and styling

This file contains the mathematical and canvas buffer operations required to draw dynamic slider bodies:
- Calculates slider styles including track colors, border colors, and alpha values
- Handles miss styling for sliders (dimmed colors and reduced opacity)
- Provides functions for creating visual effects like highlights and gradients
- Manages slider body rendering with proper styling based on combo colors
- NEW: Implements snaky slider movement logic based on key presses
- NEW: Calculates slider target Y position based on key press timing

### 6. `drawing-functions.js`
**Purpose**: Primary visual rendering and drawing logic

This is the main drawing module that handles all visual rendering:
- Draws HitCircles with proper texture handling and tinting
- Renders slider bodies with complex mathematical calculations
- Draws spinner objects with appropriate styling
- Handles key press visualization and lane indicators
- Implements timing grid and playhead visualization
- Displays map title with dynamic font sizing
- Manages debug panel functionality
- Contains the main drawing loop that updates the visualization
- NEW: Uses pre-combined hitcircle + overlay image for better performance
- NEW: Implements snaky slider movement logic based on key presses
- NEW: Improved miss detection with timing-based logic

### 7. `key-visualization.js`
**Purpose**: Key press lane visualization

This file specifically handles the visualization of key press lanes:
- Draws key press lines that extend from the playhead
- Renders key press boxes that indicate when keys are pressed
- Manages the visual styling of key press lanes (pink for left, cyan for right)
- Handles the visual feedback for active key presses
- Provides separate logic for key visualization that can be reused

### 8. `miss-logic.js`
**Purpose**: Miss detection and timing logic

This file contains all miss detection and timing-related logic:
- Implements slider combo-break detection with improved accuracy
- Processes hit errors to determine which objects were missed
- Handles timing-based miss detection for unjudged objects
- Manages key stroke miss handling and object marking
- Contains functions for detecting when objects are missed due to timing
- Implements the logic for updating timeline locking based on hit errors
- NEW: Improved slider combo-break detection with better timing accuracy
- NEW: Enhanced hit error processing with better object matching

### 9. `text-manager.js`
**Purpose**: Text rendering and title display

This file handles text rendering logic for beatmap titles and other text elements:
- Renders the beatmap title with dynamic font sizing and text wrapping
- Implements binary search algorithm to find the optimal font size that fits within constraints
- Uses greedy word wrapping to properly break text lines
- Applies visual effects like shadows and bold styling for better readability
- Manages text positioning and line height calculations

### 10. `demo-simulation.js`
**Purpose**: Built-in osu! gameplay simulator (Demo Mode)

Provides a standalone 60 FPS beatmap simulation to preview and test the timeline without requiring osu! or tosu running:
- Generates realistic hit circles, sliders with snaking lanes, and spinners
- Simulates human rhythm keypresses (K1/Lane 0 and K2/Lane 1) with hit error variance
- Can be toggled anytime via the UI button or pressing hotkey `D`
- Automatically relinquishes control when a live tosu connection is established

### 11. `ui-hud.js`
**Purpose**: Stream HUD, status monitor, and settings drawer

Provides an unobtrusive status overlay for streamers and users:
- Displays live connection status with color-coded badges (Connected, Disconnected, Connecting, Demo Mode)
- In-place Settings modal to adjust tosu host/port (`127.0.0.1:24050`) and scale
- Auto-dims during active gameplay to ensure OBS scene transparency
- Hotkeys: `D` (Toggle Demo Mode), `H` (Toggle HUD visibility)
- URL parameters: `?demo=1` (auto-start demo), `?hideStatus=1` (hide HUD for OBS)

### 12. `main-application.js`
**Purpose**: Application heartbeat and initialization

This file serves as the main application entry point that ties all components together:
- Initializes the WebSocket connection
- Starts the main drawing animation loop
- Acts as the central coordination point for the entire application
- Ensures all modules are properly initialized and connected

## Troubleshooting: WebSocket Connection Errors

### Understanding `wsCommon error: { "isTrusted": true }`
When a browser attempts to connect to `ws://127.0.0.1:24050` and the connection fails, the browser standard security model returns a generic DOM `Event` object with property `{ "isTrusted": true }`. This happens for two primary reasons:

1. **tosu / gosumemory is not running**: tosu must be actively running on your PC on port `24050`.
2. **HTTPS Mixed Content Restriction**: If the timeline overlay is opened in a web browser over HTTPS (e.g. `https://...`), web browsers strictly prohibit opening unencrypted `ws://` connections to `127.0.0.1` or `localhost`.
   - **Fix for OBS Studio**: Add the timeline as a **Browser Source** pointing to `http://localhost:3000` (over standard HTTP) or as a local file. This avoids the mixed-content block.
   - **For Testing / Preview**: Click the **Play Demo** button (or press `D`) to immediately test all visual effects without tosu.

