import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  collectPngFiles,
  parseCliArgs,
  resolveTargetSizes,
  resizeRgbaBilinear,
  resizeRgbaNearest
} from "../src/cli/dither-png-folder.js";

function rgba(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values);
}

describe("parseCliArgs", () => {
  it("parses required directories and optional sizing flags", () => {
    expect(
      parseCliArgs([
        "--input", "assets/in",
        "--output", "assets/out",
        "--recursive",
        "--threshold", "0.35",
        "--dither-strength", "0.8",
        "--pixel-size", "8",
        "--virtual-width", "320",
        "--virtual-height", "240",
        "--output-width", "1280",
        "--output-height", "960"
      ])
    ).toEqual({
      inputDir: "assets/in",
      outputDir: "assets/out",
      recursive: true,
      threshold: 0.35,
      ditherStrength: 0.8,
      pixelSize: 8,
      virtualWidth: 320,
      virtualHeight: 240,
      outputWidth: 1280,
      outputHeight: 960
    });
  });

  it("rejects missing input directory", () => {
    expect(() => parseCliArgs(["--output", "out"])).toThrow(/--input/);
  });

  it("defaults pixel size to 2", () => {
    expect(
      parseCliArgs([
        "--input", "assets/in",
        "--output", "assets/out"
      ])
    ).toEqual({
      inputDir: "assets/in",
      outputDir: "assets/out",
      recursive: false,
      pixelSize: 2
    });
  });
});

describe("resolveTargetSizes", () => {
  it("uses pixel size to preserve the source output size by default", () => {
    expect(
      resolveTargetSizes(1280, 960, {
        inputDir: "in",
        outputDir: "out",
        recursive: false,
        pixelSize: 8
      })
    ).toEqual({
      virtualWidth: 160,
      virtualHeight: 120,
      outputWidth: 1280,
      outputHeight: 960
    });
  });

  it("defaults to a 2x pixel block size when none is provided", () => {
    expect(
      resolveTargetSizes(1280, 960, {
        inputDir: "in",
        outputDir: "out",
        recursive: false
      })
    ).toEqual({
      virtualWidth: 640,
      virtualHeight: 480,
      outputWidth: 1280,
      outputHeight: 960
    });
  });

  it("lets explicit virtual dimensions override pixel size", () => {
    expect(
      resolveTargetSizes(1280, 960, {
        inputDir: "in",
        outputDir: "out",
        recursive: false,
        pixelSize: 8,
        virtualWidth: 200,
        virtualHeight: 100
      })
    ).toEqual({
      virtualWidth: 200,
      virtualHeight: 100,
      outputWidth: 1280,
      outputHeight: 960
    });
  });

  it("uses output dimensions when pixel size and output size are both provided", () => {
    expect(
      resolveTargetSizes(640, 480, {
        inputDir: "in",
        outputDir: "out",
        recursive: false,
        pixelSize: 4,
        outputWidth: 1280,
        outputHeight: 960
      })
    ).toEqual({
      virtualWidth: 320,
      virtualHeight: 240,
      outputWidth: 1280,
      outputHeight: 960
    });
  });
});

describe("resize helpers", () => {
  it("uses nearest-neighbor when enlarging output", () => {
    const output = resizeRgbaNearest(
      {
        width: 1,
        height: 1,
        data: rgba([255, 255, 255, 255])
      },
      2,
      2
    );

    expect(Array.from(output)).toEqual([
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);
  });

  it("uses bilinear filtering when resizing the virtual source", () => {
    const output = resizeRgbaBilinear(
      {
        width: 2,
        height: 1,
        data: rgba([
          0, 0, 0, 255,
          255, 255, 255, 255
        ])
      },
      3,
      1
    );

    expect(Array.from(output.slice(4, 8))).toEqual([128, 128, 128, 255]);
  });
});

describe("collectPngFiles", () => {
  it("finds top-level PNG files in a folder", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "hypercard-dither-cli-"));
    const nestedDir = path.join(rootDir, "nested");
    const sampleFile = path.join(rootDir, "sample.png");
    const nestedFile = path.join(nestedDir, "nested.png");
    const encodedPng = PNG.sync.write({
      width: 1,
      height: 1,
      data: Buffer.from(rgba([255, 255, 255, 255]))
    });

    await mkdir(nestedDir, { recursive: true });
    await writeFile(sampleFile, encodedPng);
    await writeFile(nestedFile, encodedPng);

    const files = await collectPngFiles(rootDir, false);
    expect(files).toEqual([sampleFile]);
  });
});
