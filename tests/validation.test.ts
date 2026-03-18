import { describe, expect, it } from "vitest";
import { validateStack } from "../src/shared/validation";

describe("validateStack", () => {
  it("accepts a layered image card stack", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          background: {
            kind: "image",
            src: "assets/images/pool.png"
          },
          overlay: {
            kind: "image",
            src: "assets/images/trout.png"
          },
          arrows: [
            {
              id: "to-reeds",
              direction: "right",
              targetCardId: "reeds"
            }
          ]
        },
        {
          id: "reeds",
          background: {
            kind: "image",
            src: "assets/images/reeds.png"
          }
        }
      ]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.initialCardId).toBe("pool");
      expect(result.value.cards).toHaveLength(2);
      expect(result.value.cards[0]?.overlay?.src).toBe("assets/images/trout.png");
    }
  });

  it("accepts future video layers", () => {
    const result = validateStack({
      initialCardId: "animated",
      cards: [
        {
          id: "animated",
          background: {
            kind: "video",
            src: "assets/video/background.webm"
          },
          overlay: {
            kind: "video",
            src: "assets/video/trout-alpha.webm"
          }
        }
      ]
    });

    expect(result.ok).toBe(true);
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

  it("rejects invalid media kinds", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          background: {
            kind: "glb",
            src: "assets/images/pool.png"
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("cards[0].background.kind must be 'image' or 'video'");
    }
  });

  it("rejects arrows that point to missing cards", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          background: {
            kind: "image",
            src: "assets/images/pool.png"
          },
          arrows: [
            {
              id: "to-nowhere",
              direction: "right",
              targetCardId: "missing"
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("card 'pool' arrow 'to-nowhere' points to missing card 'missing'");
    }
  });
});
