# AGENTS.md

## Project Snapshot

`hypercard-engine` is an Electron + Three.js desktop runtime for HyperCard-style scene navigation.
Current core features:

- Card-based scene routing via `stack.json`
- Local `.glb` model loading and file-watch hot reload
- Raycast hotspots mapped by node name
- Action system (`goToCard`, `setAnimation`, `sequence`)
- Lo-fi ambient audio pipeline with bitcrusher worklet fallback
- 1-bit postprocessing dither pass
- Standalone dither engine for PNG/`ImageData` processing

## Required Commands

Use these before handing off changes:

- `npm run typecheck`
- `npm test`
- `npm run build`

Use this for local runtime verification:

- `npm run dev`

## Code Map

- `src/main/index.ts`: Electron main process, IPC handlers, filesystem watchers, preload path resolution
- `src/preload/index.ts`: secure renderer bridge exposed as `window.hypercard`
- `src/shared/*`: IPC constants, shared types, validators, action executor
- `src/renderer/src/engine.ts`: main runtime engine (scene load, camera, animation, input, hot reload handling)
- `src/renderer/src/ditherPass.ts`: Three.js shader pass for 1-bit dithering
- `src/renderer/src/ditherEngine.ts`: standalone CPU dither API for PNG/`ImageData`
- `tests/*`: unit tests for shared logic + hotspot + dither engine

## Critical Runtime Notes

- Preload must resolve to CommonJS bundle first.
  Main process currently searches in this order:
  `dist/preload/index.cjs` -> `index.mjs` -> `index.js`.
- If renderer throws `Cannot read properties of undefined (reading 'readStack')`, preload did not execute.
  Check preload path and dev startup logs first.
- The sample hotspot node in `stack.json` is currently `"FIsh"` (exact case from the model).

## Debug Render Mode (Temporary)

`engine.ts` includes a temporary debug render path to isolate dither issues.

- Default is debug ON unless query/localStorage overrides it.
- `D` toggles debug render.
- `F` reframes camera to current model bounds.
- Storage key: `hypercard:debug-render`

In debug mode, composer/dither is bypassed and renderer draws scene directly.

## Dither Engine Reuse

Standalone API lives in `src/renderer/src/ditherEngine.ts`:

- `ditherRgbaFrame({ width, height, data }, options)`
- `ditherImageData(imageData, options)`
- `renderDitheredPngToCanvas(source, canvas, options)`

Use this module when you need PNG postprocessing independent of Three.js.

## Change Safety Checklist

- Keep `IPC_CHANNELS`, preload bridge, and `env.d.ts` signatures in sync.
- Preserve strict TypeScript compatibility (`tsc --noEmit` is the source of truth).
- If touching camera/model load flow, retest with current sample `stack.json`.
- Do not remove debug mode until dithering black-screen behavior is fully understood and fixed.
