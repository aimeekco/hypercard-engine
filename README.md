# HyperCard Engine MVP

Electron + Three.js desktop engine with 1-bit post-processing, local glTF hot-reload, JSON card routing, raycast hotspots, animation state switching, and lo-fi ambient audio.

## Prerequisites

- Homebrew Node/npm (macOS)
- `npm install`

## Run

```bash
npm run dev
```

## Build

```bash
npm run build
npm run start
```

## Project layout

- `stack.json`: card router definition
- `assets/models`: local `.glb` files
- `assets/audio`: local ambient audio files
- `src/main`: Electron main process + file watchers
- `src/preload`: secure bridge API
- `src/renderer`: Three.js runtime
- `src/shared`: shared schema/types

## Notes

- Renderer output is forced to strict black/white via custom 1-bit dither shader.
- Model/audio/stack updates hot-reload while the app is running.
- Sample `stack.json` references `assets/models/trout.glb`; add your own exported Blender model there.

## Standalone Dither Engine (PNG)

Use the renderer dither engine independently for PNG post-processing:

```ts
import { renderDitheredPngToCanvas } from "./src/renderer/src/ditherEngine";

const canvas = document.querySelector("canvas")!;
await renderDitheredPngToCanvas("assets/sprites/fish.png", canvas, {
  virtualWidth: 320,
  virtualHeight: 240,
  outputWidth: 1280,
  outputHeight: 960,
  threshold: 0.5,
  ditherStrength: 1.0
});
```

Low-level API (raw RGBA frame):

```ts
import { ditherRgbaFrame } from "./src/renderer/src/ditherEngine";
```
