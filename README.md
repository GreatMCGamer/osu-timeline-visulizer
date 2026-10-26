# osu! Live Note Timeline for OBS

A real-time visualization of osu! beatmaps that displays hit objects, key presses, and timing information. This project visualizes osu! gameplay in real-time using data from tosu/gosumemory.

Simply add index.html as Browser source on OBS.
And Now when you start playing a map, the timeline will render.

<img width="1921" height="1071" alt="image" src="https://github.com/user-attachments/assets/6b74ea5c-047a-4411-ad60-90ad9ffb0d93" />


## Features

- Real-time beatmap visualization
- Hit circle, slider, and spinner object rendering
- Key press lane visualization
- Miss detection and timing feedback
- Dynamic font sizing for beatmap titles
- Responsive design that works with OBS

## How It Works

1. The application starts by connecting to tosu/gosumemory via WebSocket
2. Beatmap data is fetched and parsed to build the timeline
3. Textures are loaded and color-tinted for visual consistency
4. The main drawing loop continuously updates the visualization
5. Real-time data from the game is processed to update timing and key presses
6. Miss detection logic determines when objects are missed
7. All visual elements are rendered on the canvas in real-time

### 200ms render delay

The timeline is drawn **200ms behind live time**. This is deliberate: it lets every piece of a note's judgment (hit error, combo break, miss, key press) settle before it's painted, which prevents notes from flickering or jumping as late-arriving data corrects them. In practice the playhead sits about 200ms behind the game's current time, so a note's final state (its lane, gray-out, and click line) only appears once it crosses the judgment line. Debug overlays are exempt and may update immediately.

## Installation

1. Clone or download this repository
2. Run tosu/gosumemory locally on port 24050
3. Open index.html in a browser
4. Add index.html as a Browser source in OBS

## Usage

To use this visualization:
1. Run tosu/gosumemory
2. Open index.html in a browser
3. Select an osu! map to visualize
4. The visualization will automatically start showing the beatmap timeline

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository
2. Create a new branch for your feature
3. Make your changes
4. Submit a pull request with a clear description of your changes

## Dependencies

- OBS
- tosu

## Skins

The visualizer reads its skin from **tosu** first (it fetches `skin.ini` and the hit-circle / slider textures from tosu's skin endpoint, so the combo colors and textures match the skin you actually have loaded in-game).

When tosu has no skin available, it falls back to the local **`default_skin/`** folder. You can drop your own skin files there to control how the visualizer looks when tosu isn't providing one:

| File in `default_skin/` | Used for |
| --- | --- |
| `hitcircle@2x.png` | Hit circle |
| `hitcircleoverlay@2x.png` | Hit circle overlay |
| `sliderscorepoint@2x.png` | Slider ticks (score points) |

Files are loaded at `@2x` (no upscaling). A tosu-provided texture always takes priority, so the local folder is purely a fallback. The folder is gitignored — your local skin assets are not tracked.
