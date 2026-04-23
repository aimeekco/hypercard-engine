import { describe, expect, it } from "vitest";
import {
  chooseRandomEntry,
  DEFAULT_DITHER_SCHEDULE,
  getFinalDitherLevel,
  getFirstStepForDitherLevel,
  getDitherFolderCandidates,
  getDitherLevelForStep
} from "../src/shared/backgroundBank";

describe("background bank scheduling", () => {
  it("resolves the explicit dither schedule by step", () => {
    expect(getDitherLevelForStep(0, DEFAULT_DITHER_SCHEDULE)).toBe(0);
    expect(getDitherLevelForStep(1, DEFAULT_DITHER_SCHEDULE)).toBe(0);
    expect(getDitherLevelForStep(2, DEFAULT_DITHER_SCHEDULE)).toBe(0.25);
    expect(getDitherLevelForStep(99, DEFAULT_DITHER_SCHEDULE)).toBe(1);
  });

  it("finds the first step for a level and the final schedule level", () => {
    expect(getFirstStepForDitherLevel(0, DEFAULT_DITHER_SCHEDULE)).toBe(0);
    expect(getFirstStepForDitherLevel(1, DEFAULT_DITHER_SCHEDULE)).toBe(5);
    expect(getFinalDitherLevel(DEFAULT_DITHER_SCHEDULE)).toBe(1);
  });

  it("returns folder candidates from active level down to zero", () => {
    expect(getDitherFolderCandidates("assets/backgrounds", 0)).toEqual([
      "assets/backgrounds/0"
    ]);
    expect(getDitherFolderCandidates("assets/backgrounds", 0.75)).toEqual([
      "assets/backgrounds/0.75",
      "assets/backgrounds/0.5",
      "assets/backgrounds/0.25",
      "assets/backgrounds/0"
    ]);
  });

  it("chooses among only the provided options", () => {
    const options = [
      "assets/backgrounds/0/a.mov",
      "assets/backgrounds/0/b.mov",
      "assets/backgrounds/0/c.mov"
    ];

    expect(chooseRandomEntry(options, 0)).toBe("assets/backgrounds/0/a.mov");
    expect(chooseRandomEntry(options, 0.4)).toBe("assets/backgrounds/0/b.mov");
    expect(chooseRandomEntry(options, 0.99)).toBe("assets/backgrounds/0/c.mov");
  });

  it("returns null when there are no options", () => {
    expect(chooseRandomEntry([], 0.5)).toBeNull();
  });
});
