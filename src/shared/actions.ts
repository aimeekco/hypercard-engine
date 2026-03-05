import type { Action } from "./types";

export type ActionHandlerContext = {
  goToCard: (cardId: string) => Promise<void> | void;
  setAnimation: (clip: string, fadeMs?: number) => Promise<void> | void;
};

export async function executeAction(action: Action, context: ActionHandlerContext): Promise<void> {
  if (action.type === "goToCard") {
    await context.goToCard(action.cardId);
    return;
  }

  if (action.type === "setAnimation") {
    await context.setAnimation(action.clip, action.fadeMs);
    return;
  }

  for (const step of action.steps) {
    await executeAction(step, context);
  }
}
