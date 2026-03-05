import { describe, expect, it } from "vitest";
import { validateStack } from "../src/shared/validation";

describe("validateStack", () => {
  it("accepts a valid stack", () => {
    const result = validateStack({
      initialCardId: "a",
      cards: [
        {
          id: "a",
          modelPath: "assets/models/trout.glb",
          camera: {
            position: [0, 1, 2],
            target: [0, 0, 0],
            fov: 45
          },
          hotspots: [
            {
              id: "h1",
              nodeName: "Trout",
              onClick: {
                type: "setAnimation",
                clip: "ghost_glitch"
              }
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.initialCardId).toBe("a");
      expect(result.value.cards).toHaveLength(1);
    }
  });

  it("rejects missing required fields", () => {
    const result = validateStack({
      cards: []
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("initialCardId is required");
    }
  });

  it("rejects unknown initial card id", () => {
    const result = validateStack({
      initialCardId: "missing",
      cards: [
        {
          id: "a",
          modelPath: "assets/models/trout.glb",
          camera: {
            position: [0, 1, 2],
            target: [0, 0, 0],
            fov: 45
          },
          hotspots: []
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("initialCardId 'missing' does not exist in cards");
    }
  });
});
