# osu! Live Note Timeline

A real-time visualization of osu! beatmaps that displays hit objects, key presses, and timing information. This project visualizes osu! gameplay in real-time using data from tosu/gosumemory.

## Project Structure

The monolithic JavaScript file has been broken down into multiple modular files to improve maintainability and organization:

```
osu-timeline/
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

### 3. `beatmap-parser.js`
**Purpose**: Beatmap file parsing and processing

This file is responsible for fetching and parsing .osu beatmap files:
- Fetches beatmap data from tosu/gosumemory
- Parses .osu files to extract hit objects, timing points, and combo colors
- Processes different object types (HitCircles, Sliders, Spinners)
- Calculates slider durations based on timing points and slider multipliers
- Sorts hit objects by start time for proper rendering order
- Extracts difficulty settings (Overall Difficulty, Slider Tick Rate)

### 4. `texture-manager.js`
**Purpose**: Texture loading and color tinting

This file handles loading skin textures and creating color variations:
- Loads hit circle and slider tick textures with @2x fallback support
- Implements texture upscaling to 2x resolution without blurring
- Creates color-tinted variations of textures for different combo colors
- Handles fallback logic when textures are missing or fail to load
- Provides functions for tinting images with specific colors

### 5. `sliders-manager.js`
**Purpose**: Slider body drawing and styling

This file contains the mathematical and canvas buffer operations required to draw dynamic slider bodies:
- Calculates slider styles including track colors, border colors, and alpha values
- Handles miss styling for sliders (dimmed colors and reduced opacity)
- Provides functions for creating visual effects like highlights and gradients
- Manages slider body rendering with proper styling based on combo colors

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

### 9. `main-application.js`
**Purpose**: Application heartbeat and initialization

This file serves as the main application entry point that ties all components together:
- Initializes the WebSocket connection
- Starts the main drawing animation loop
- Acts as the central coordination point for the entire application
- Ensures all modules are properly initialized and connected

## How It Works

1. The application starts by connecting to tosu/gosumemory via WebSocket
2. Beatmap data is fetched and parsed to build the timeline
3. Textures are loaded and color-tinted for visual consistency
4. The main drawing loop continuously updates the visualization
5. Real-time data from the game is processed to update timing and key presses
6. Miss detection logic determines when objects are missed
7. All visual elements are rendered on the canvas in real-time

## Usage

To use this visualization:
1. Run tosu/gosumemory
2. Open index.html in a browser
3. Select an osu! map to visualize
4. The visualization will automatically start showing the beatmap timeline

## Dependencies

- Modern web browser with Canvas and WebSocket support
- tosu/gosumemory running locally on port 24050