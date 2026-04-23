import { DEFAULT_DITHER_SCHEDULE } from "./backgroundBank";
import type { ArrowLink, Card, CardTransitionSpec } from "./types";

type StochasticNavigationResult = {
  cardId: string;
  transition?: CardTransitionSpec;
  countsTowardRun: boolean;
};

function isEndingCard(card: Pick<Card, "buttons">): boolean {
  return Boolean(card.buttons && card.buttons.length > 0);
}

function getExplorationCards(cards: readonly Card[]): Card[] {
  return cards.filter((card) => !isEndingCard(card) && Boolean(card.arrows && card.arrows.length > 0));
}

function getEndingArrow(card: Card, endingCardIds: ReadonlySet<string>): ArrowLink | undefined {
  return card.arrows?.find((arrow) =>
    (arrow.direction === "forward" || arrow.direction === "up")
    && endingCardIds.has(arrow.targetCardId)
    && !arrow.disabled
  );
}

export function resolveStochasticNavigationTarget(
  card: Card,
  cards: readonly Card[],
  choiceCount: number,
  randomValue = Math.random()
): StochasticNavigationResult | null {
  const explorationCards = getExplorationCards(cards);
  if (explorationCards.length === 0) {
    return null;
  }

  const endingCardIds = new Set(cards.filter((candidate) => isEndingCard(candidate)).map((candidate) => candidate.id));
  const endingArrow = getEndingArrow(card, endingCardIds);
  if (!endingArrow) {
    return null;
  }

  const remainingChoicesBeforeEnding = DEFAULT_DITHER_SCHEDULE.length - 2;
  if (choiceCount >= remainingChoicesBeforeEnding) {
    return {
      cardId: endingArrow.targetCardId,
      transition: endingArrow.transition,
      countsTowardRun: true
    };
  }

  const nextExplorationCards = explorationCards.filter((candidate) => candidate.id !== card.id);
  if (nextExplorationCards.length === 0) {
    return {
      cardId: endingArrow.targetCardId,
      transition: endingArrow.transition,
      countsTowardRun: true
    };
  }

  const normalizedRandom = Math.min(0.999999, Math.max(0, randomValue));
  const nextCard = nextExplorationCards[Math.floor(normalizedRandom * nextExplorationCards.length)];
  if (!nextCard) {
    return null;
  }

  return {
    cardId: nextCard.id,
    countsTowardRun: true
  };
}

export function isStochasticCard(card: Card | null | undefined, cards: readonly Card[]): boolean {
  if (!card) {
    return false;
  }

  const endingCardIds = new Set(cards.filter((candidate) => isEndingCard(candidate)).map((candidate) => candidate.id));
  return Boolean(getEndingArrow(card, endingCardIds));
}
