import { describe, expect, it } from "vitest";
import { DEFAULT_DITHER_SCHEDULE, getFirstStepForDitherLevel } from "../src/shared/backgroundBank";
import { isStochasticCard, resolveStochasticNavigationTarget } from "../src/shared/stochasticNavigation";
import type { Card } from "../src/shared/types";

const cards: Card[] = [
  {
    id: "pool_overlook",
    background: { kind: "video", src: "pool.mov" },
    arrows: [
      { id: "left", direction: "left", targetCardId: "shallow_bend" },
      { id: "right", direction: "right", targetCardId: "reeds_channel" },
      {
        id: "up",
        direction: "up",
        targetCardId: "ending_depths",
        transition: {
          kind: "zoom",
          focusBounds: { x: 0, y: 0, width: 10, height: 10 }
        }
      }
    ]
  },
  {
    id: "shallow_bend",
    background: { kind: "video", src: "shallow.mov" },
    arrows: [
      { id: "right", direction: "right", targetCardId: "pool_overlook" },
      {
        id: "up",
        direction: "up",
        targetCardId: "ending_surface",
        transition: {
          kind: "zoom",
          focusBounds: { x: 10, y: 10, width: 20, height: 20 }
        }
      }
    ]
  },
  {
    id: "reeds_channel",
    background: { kind: "video", src: "reeds.mov" },
    arrows: [
      { id: "left", direction: "left", targetCardId: "pool_overlook" },
      {
        id: "up",
        direction: "up",
        targetCardId: "ending_current",
        transition: {
          kind: "zoom",
          focusBounds: { x: 20, y: 20, width: 30, height: 30 }
        }
      }
    ]
  },
  {
    id: "ending_surface",
    background: { kind: "video", src: "ending-surface.mov" },
    buttons: [{ id: "restart-surface", label: "Restart", targetCardId: "boot_mac" }]
  },
  {
    id: "ending_current",
    background: { kind: "video", src: "ending-current.mov" },
    buttons: [{ id: "restart-current", label: "Restart", targetCardId: "boot_mac" }]
  },
  {
    id: "ending_depths",
    background: { kind: "video", src: "ending-depths.mov" },
    buttons: [{ id: "restart-depths", label: "Restart", targetCardId: "boot_mac" }]
  }
];

describe("stochastic navigation", () => {
  it("treats fish cards with ending arrows as stochastic cards", () => {
    expect(isStochasticCard(cards[0], cards)).toBe(true);
    expect(isStochasticCard(cards[3], cards)).toBe(false);
  });

  it("keeps navigation inside the exploration pool before the final choice", () => {
    const result = resolveStochasticNavigationTarget(cards[0]!, cards, 0, 0.99);

    expect(result).not.toBeNull();
    expect(result?.cardId).toBe("reeds_channel");
    expect(result?.transition).toBeUndefined();
  });

  it("routes to the ending on the first final-level step", () => {
    const result = resolveStochasticNavigationTarget(
      cards[0]!,
      cards,
      getFirstStepForDitherLevel(DEFAULT_DITHER_SCHEDULE[DEFAULT_DITHER_SCHEDULE.length - 1]!) - 1,
      0.5
    );

    expect(result).not.toBeNull();
    expect(result?.cardId).toBe("ending_depths");
    expect(result?.transition?.kind).toBe("zoom");
  });
});
