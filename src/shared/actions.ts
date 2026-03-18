import type { Action } from "./types";

export type ActionHandlerContext = {
  goToCard: (cardId: string) => Promise<void> | void;
};

export async function executeAction(action: Action, context: ActionHandlerContext): Promise<void> {
  if (action.type === "goToCard") {
    await context.goToCard(action.cardId);
    return;
  }

  for (const step of action.steps) {
    await executeAction(step, context);
  }
}
