import { describe, expect, it } from "vitest";
import { getArrowDirectionsForKey, getArrowNavigationTarget } from "../src/shared/navigation";

describe("getArrowDirectionsForKey", () => {
  it("maps arrow keys to card directions", () => {
    expect(getArrowDirectionsForKey("ArrowLeft")).toEqual(["left"]);
    expect(getArrowDirectionsForKey("ArrowRight")).toEqual(["right"]);
    expect(getArrowDirectionsForKey("ArrowUp")).toEqual(["forward", "up"]);
    expect(getArrowDirectionsForKey("ArrowDown")).toEqual(["down"]);
  });

  it("treats W as forward navigation", () => {
    expect(getArrowDirectionsForKey("w")).toEqual(["forward"]);
    expect(getArrowDirectionsForKey("W")).toEqual(["forward"]);
  });

  it("ignores unrelated keys", () => {
    expect(getArrowDirectionsForKey("Enter")).toEqual([]);
  });
});

describe("getArrowNavigationTarget", () => {
  it("chooses the first enabled arrow matching the pressed key", () => {
    const arrow = getArrowNavigationTarget({
      arrows: [
        { id: "to-reeds", direction: "left", targetCardId: "reeds_channel" },
        { id: "to-depths", direction: "forward", targetCardId: "ending_depths" }
      ]
    }, "ArrowUp");

    expect(arrow?.id).toBe("to-depths");
  });

  it("falls back from forward to up on ArrowUp", () => {
    const arrow = getArrowNavigationTarget({
      arrows: [
        { id: "to-surface", direction: "up", targetCardId: "ending_surface" }
      ]
    }, "ArrowUp");

    expect(arrow?.id).toBe("to-surface");
  });

  it("skips disabled arrows", () => {
    const arrow = getArrowNavigationTarget({
      arrows: [
        { id: "disabled-left", direction: "left", targetCardId: "reeds_channel", disabled: true },
        { id: "enabled-left", direction: "left", targetCardId: "pool_overlook" }
      ]
    }, "ArrowLeft");

    expect(arrow?.id).toBe("enabled-left");
  });
});
