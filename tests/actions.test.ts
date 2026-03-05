import { describe, expect, it, vi } from "vitest";
import { executeAction } from "../src/shared/actions";

describe("executeAction", () => {
  it("runs simple actions", async () => {
    const goToCard = vi.fn();
    const setAnimation = vi.fn();

    await executeAction({ type: "goToCard", cardId: "next" }, { goToCard, setAnimation });
    await executeAction({ type: "setAnimation", clip: "ghost_glitch", fadeMs: 120 }, { goToCard, setAnimation });

    expect(goToCard).toHaveBeenCalledWith("next");
    expect(setAnimation).toHaveBeenCalledWith("ghost_glitch", 120);
  });

  it("runs sequence actions in order", async () => {
    const calls: string[] = [];

    await executeAction(
      {
        type: "sequence",
        steps: [
          { type: "setAnimation", clip: "idle_swim" },
          { type: "goToCard", cardId: "ruins" },
          { type: "setAnimation", clip: "ghost_glitch" }
        ]
      },
      {
        goToCard: (cardId) => {
          calls.push(`go:${cardId}`);
        },
        setAnimation: (clip) => {
          calls.push(`anim:${clip}`);
        }
      }
    );

    expect(calls).toEqual(["anim:idle_swim", "go:ruins", "anim:ghost_glitch"]);
  });
});
