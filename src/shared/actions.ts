import type { Action, CardTransitionSpec } from "./types";

export type ActionHandlerContext = {
  goToCard: (cardId: string, transition?: CardTransitionSpec) => Promise<void> | void;
};

export async function executeAction(action: Action, context: ActionHandlerContext): Promise<void> {
  if (action.type === "goToCard") {
    if (action.transition) {
      await context.goToCard(action.cardId, action.transition);
      return;
    }
    await context.goToCard(action.cardId);
    return;
  }

  for (const step of action.steps) {
    await executeAction(step, context);
  }
}
