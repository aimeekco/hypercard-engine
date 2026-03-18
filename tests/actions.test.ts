import { describe, expect, it, vi } from "vitest";
import { executeAction } from "../src/shared/actions";

describe("executeAction", () => {
  it("runs simple actions", async () => {
    const goToCard = vi.fn();

    await executeAction({ type: "goToCard", cardId: "next" }, { goToCard });

    expect(goToCard).toHaveBeenCalledWith("next");
  });

  it("runs sequence actions in order", async () => {
    const calls: string[] = [];

    await executeAction(
      {
        type: "sequence",
        steps: [
          { type: "goToCard", cardId: "ruins" },
          {
            type: "sequence",
            steps: [{ type: "goToCard", cardId: "lagoon" }]
          }
        ]
      },
      {
        goToCard: (cardId) => {
          calls.push(`go:${cardId}`);
        }
      }
    );

    expect(calls).toEqual(["go:ruins", "go:lagoon"]);
  });
});
