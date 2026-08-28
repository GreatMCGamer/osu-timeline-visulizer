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
