import { describe, expect, it } from "vitest";
import {
  getAmbientVolumeForLevel,
  getMutedLayersForLevel,
  resolveAudioSpec,
  shouldAutoplayFinAudio
} from "../src/shared/audio";
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

describe("getAmbientVolumeForLevel", () => {
  it("falls back to the nearest lower defined ambient volume level", () => {
    expect(getAmbientVolumeForLevel({
      ambient: "assets/audio/corrupted_file.mp3",
      volumeMap: {
        0.25: 0.035,
        0.75: 0.14
      }
    }, 0.5)).toBe(0.035);
  });
});

describe("resolveAudioSpec", () => {
  it("merges card ambient overrides with stack Fin audio", () => {
    const resolved = resolveAudioSpec({
      fin: {
        source: "../fin/examples/weird_fishes.metl"
      }
    }, {
      ambient: "assets/audio/corrupted_file.mp3",
      volume: 0.12
    });

    expect(resolved?.fin?.source).toBe("../fin/examples/weird_fishes.metl");
    expect(resolved?.ambient).toBe("assets/audio/corrupted_file.mp3");
    expect(resolved?.volume).toBe(0.12);
  });
});

describe("shouldAutoplayFinAudio", () => {
  it("defers stack-level Fin audio until a fish card", () => {
    expect(shouldAutoplayFinAudio({
      backgroundFolder: undefined
    }, {
      fin: {
        source: "../fin/examples/weird_fishes.metl"
      }
    })).toBe(false);

    expect(shouldAutoplayFinAudio({
      backgroundFolder: "assets/backgrounds"
    }, {
      fin: {
        source: "../fin/examples/weird_fishes.metl"
      }
    })).toBe(true);
  });

  it("still autoplays explicit card-level Fin audio", () => {
    expect(shouldAutoplayFinAudio({
      audio: {
        fin: {
          source: "../fin/examples/weird_fishes.metl"
        }
      }
    })).toBe(true);
  });
});
