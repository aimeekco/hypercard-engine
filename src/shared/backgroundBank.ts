import type { DitherLevel } from "./types";
import { DITHER_LEVEL_VALUES } from "./types";

export const DEFAULT_DITHER_SCHEDULE: readonly DitherLevel[] = [0, 0, 0.25, 0.5, 0.75, 0.75, 1];

export function getDitherLevelForStep(
  step: number,
  schedule: readonly DitherLevel[] = DEFAULT_DITHER_SCHEDULE
): DitherLevel {
  const normalizedStep = Math.max(0, Math.floor(step));
  const index = Math.min(normalizedStep, schedule.length - 1);
  return schedule[index] ?? DEFAULT_DITHER_SCHEDULE[DEFAULT_DITHER_SCHEDULE.length - 1];
}

export function getFinalDitherLevel(schedule: readonly DitherLevel[] = DEFAULT_DITHER_SCHEDULE): DitherLevel {
  return schedule[schedule.length - 1] ?? DEFAULT_DITHER_SCHEDULE[DEFAULT_DITHER_SCHEDULE.length - 1];
}

export function getFirstStepForDitherLevel(
  level: DitherLevel,
  schedule: readonly DitherLevel[] = DEFAULT_DITHER_SCHEDULE
): number {
  const firstIndex = schedule.indexOf(level);
  return firstIndex >= 0 ? firstIndex : 0;
}

export function getDitherFolderCandidates(backgroundFolder: string, level: DitherLevel): string[] {
  const targetIndex = DITHER_LEVEL_VALUES.indexOf(level);
  if (targetIndex < 0) {
    return [];
  }

  return DITHER_LEVEL_VALUES
    .slice(0, targetIndex + 1)
    .reverse()
    .map((candidateLevel) => `${backgroundFolder}/${candidateLevel}`);
}

export function chooseRandomEntry<T>(
  options: readonly T[],
  randomValue = Math.random()
): T | null {
  if (options.length === 0) {
    return null;
  }

  const normalizedRandom = Math.min(0.999999, Math.max(0, randomValue));
  return options[Math.floor(normalizedRandom * options.length)] ?? null;
}
