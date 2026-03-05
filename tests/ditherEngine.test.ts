import { describe, expect, it } from "vitest";
import { ditherRgbaFrame } from "../src/renderer/src/ditherEngine";

function rgba(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values);
}

describe("ditherRgbaFrame", () => {
  it("converts grayscale input to 1-bit black/white output", () => {
    const data = rgba([
      20, 20, 20, 255,
      240, 240, 240, 255,
      128, 128, 128, 255
    ]);

    const output = ditherRgbaFrame({ width: 3, height: 1, data });
    expect(Array.from(output)).toEqual([
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);
  });

  it("preserves alpha channel", () => {
    const data = rgba([
      200, 10, 10, 64,
      10, 200, 10, 128
    ]);

    const output = ditherRgbaFrame({ width: 2, height: 1, data });
    expect(output[3]).toBe(64);
    expect(output[7]).toBe(128);
  });

  it("throws when frame dimensions do not match data length", () => {
    const data = rgba([0, 0, 0, 255]);
    expect(() => ditherRgbaFrame({ width: 2, height: 1, data })).toThrow(/length mismatch/);
  });
});
