import { describe, expect, it } from "vitest";
import { getMutedLayersForLevel } from "../src/shared/audio";
import { renderMutedMetlSource, splitMetlSegments } from "../src/main/finMusic";

describe("splitMetlSegments", () => {
  it("keeps top-level layer blocks distinct from indented bar lines", () => {
    const source = [
      "bpm = 148",
      "",
      "[superfm] .gain 0.7",
      "  [bar1] <d5 g4 e4>",
      "",
      "[hh]",
      "  [default] /8"
    ].join("\n");

    const segments = splitMetlSegments(source);

    expect(segments).toHaveLength(3);
    expect(segments[1]).toMatchObject({
      type: "layer",
      layerName: "superfm"
    });
    expect(segments[2]).toMatchObject({
      type: "layer",
      layerName: "hh"
    });
  });
});

describe("renderMutedMetlSource", () => {
  it("removes muted layers while preserving the remaining schedule", () => {
    const source = [
      "bpm = 148",
      "bars = 32",
      "",
      "[superfm] .gain 0.7",
      "  [bar1] <d5 g4 e4>",
      "",
      "[supersquare] .gain 0.7",
      "  [bar1] <e3 a3 d4 e4>",
      "",
      "[hh]",
      "  [default] /8",
      ""
    ].join("\n");

    const rendered = renderMutedMetlSource(source, ["supersquare"]);

    expect(rendered).toContain("[superfm] .gain 0.7");
    expect(rendered).toContain("[hh]");
    expect(rendered).not.toContain("[supersquare] .gain 0.7");
    expect(rendered.endsWith("\n")).toBe(true);
  });
});

describe("getMutedLayersForLevel", () => {
  it("falls back to the nearest lower defined corruption level", () => {
    const layers = getMutedLayersForLevel({
      source: "../fin/examples/weird_fishes.metl",
      layerMuteMap: {
        0.25: ["supersquare"],
        0.75: ["supersquare", "supersnare", "hh"]
      }
    }, 0.5);

    expect(layers).toEqual(["supersquare"]);
  });
});
