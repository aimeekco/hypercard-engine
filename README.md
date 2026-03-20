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
- Cards can branch with `left`, `right`, `forward`, `up`, and `down` arrows by pointing each arrow at a different `targetCardId`.
- The sample `stack.json` now demonstrates a small branching path with three distinct endings.

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

For batch PNG processing from the command line:

```bash
npm run dither:png -- --input assets/sprites --output tmp/dithered --recursive
```

Optional flags:

- `--threshold 0.5`
- `--dither-strength 1.0`
- `--pixel-size 2`
- `--virtual-width 320 --virtual-height 240`
- `--output-width 1280 --output-height 960`

`--pixel-size` keeps the final image size by default and computes a smaller virtual dither size automatically. The default is `2`; use `--pixel-size 1` if you want the old no-extra-chunking behavior. Explicit `--virtual-width` and `--virtual-height` still win if both are provided.
