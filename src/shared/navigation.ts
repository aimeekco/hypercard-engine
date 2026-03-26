import type { ArrowDirection, ArrowLink, Card } from "./types";

export function getArrowDirectionsForKey(key: string): ArrowDirection[] {
  if (key === "ArrowLeft") {
    return ["left"];
  }
  if (key === "ArrowRight") {
    return ["right"];
  }
  if (key === "ArrowUp") {
    return ["forward", "up"];
  }
  if (key === "ArrowDown") {
    return ["down"];
  }
  if (key === "w" || key === "W") {
    return ["forward"];
  }
  return [];
}

export function getArrowNavigationTarget(card: Pick<Card, "arrows"> | null | undefined, key: string): ArrowLink | undefined {
  const directions = getArrowDirectionsForKey(key);
  if (directions.length === 0) {
    return undefined;
  }

  return directions
    .map((direction) => card?.arrows?.find((candidate) => candidate.direction === direction && !candidate.disabled))
    .find((candidate): candidate is ArrowLink => candidate !== undefined);
}
