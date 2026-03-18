import { describe, expect, it } from "vitest";
import { validateStack } from "../src/shared/validation";

describe("validateStack", () => {
  it("accepts a layered image card stack", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          styleLevel: "modern",
          title: {
            heading: "Pool",
            subheading: "Intro",
            align: "center"
          },
          background: {
            kind: "image",
            src: "assets/images/pool.png"
          },
          overlay: {
            kind: "image",
            src: "assets/images/trout.png"
          },
          buttons: [
            {
              id: "start",
              label: "Click to start",
              targetCardId: "reeds",
              variant: "primary",
              position: { x: 50, y: 70 }
            }
          ],
          clickTargets: [
            {
              id: "click-screen",
              targetCardId: "reeds",
              bounds: {
                x: 30,
                y: 20,
                width: 20,
                height: 30
              }
            }
          ],
          dragTargets: [
            {
              id: "insert-disk",
              src: "assets/images/floppy_disk.png",
              targetCardId: "reeds",
              startBounds: {
                x: 10,
                y: 70,
                width: 12,
                height: 17
              },
              dropBounds: {
                x: 65,
                y: 35,
                width: 20,
                height: 14
              }
            }
          ],
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
      expect(result.value.cards[0]?.buttons?.[0]?.label).toBe("Click to start");
      expect(result.value.cards[0]?.clickTargets?.[0]?.bounds.width).toBe(20);
      expect(result.value.cards[0]?.dragTargets?.[0]?.src).toBe("assets/images/floppy_disk.png");
      expect(result.value.cards[0]?.styleLevel).toBe("modern");
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

  it("rejects buttons that point to missing cards", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          styleLevel: "modern",
          background: {
            kind: "image",
            src: "assets/images/pool.png"
          },
          buttons: [
            {
              id: "start",
              label: "Click to start",
              targetCardId: "missing"
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("card 'pool' button 'start' points to missing card 'missing'");
    }
  });

  it("rejects click targets that point to missing cards", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          background: {
            kind: "image",
            src: "assets/images/pool.png"
          },
          clickTargets: [
            {
              id: "computer",
              targetCardId: "missing",
              bounds: {
                x: 25,
                y: 10,
                width: 40,
                height: 75
              }
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("card 'pool' click target 'computer' points to missing card 'missing'");
    }
  });

  it("rejects invalid style levels", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          styleLevel: "future",
          background: {
            kind: "image",
            src: "assets/images/pool.png"
          }
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("cards[0].styleLevel must be 'modern', 'transitional', or 'hypercard'");
    }
  });

  it("rejects drag targets that point to missing cards", () => {
    const result = validateStack({
      initialCardId: "pool",
      cards: [
        {
          id: "pool",
          background: {
            kind: "image",
            src: "assets/images/pool.png"
          },
          dragTargets: [
            {
              id: "insert-disk",
              src: "assets/images/floppy_disk.png",
              targetCardId: "missing",
              startBounds: {
                x: 10,
                y: 70,
                width: 12,
                height: 17
              },
              dropBounds: {
                x: 65,
                y: 35,
                width: 20,
                height: 14
              }
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("card 'pool' drag target 'insert-disk' points to missing card 'missing'");
    }
  });
});
