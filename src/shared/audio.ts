import type { AudioSpec, DitherLevel, DitherLevelMap, FinAudioSpec } from "./types";
import { DITHER_LEVEL_VALUES } from "./types";

export const DEFAULT_FIN_LAYER_MUTE_MAP: DitherLevelMap<string[]> = {
  0: [],
  0.25: ["supersquare"],
  0.5: ["supersquare", "supersnare"],
  0.75: ["supersquare", "supersnare", "hh"],
  1: ["supersquare", "supersnare", "hh", "bassdm:5"]
};

export function getDitherLevelValue<T>(
  map: DitherLevelMap<T>,
  level: DitherLevel
): T | undefined {
  const targetIndex = DITHER_LEVEL_VALUES.indexOf(level);
  if (targetIndex < 0) {
    return undefined;
  }

  for (let index = targetIndex; index >= 0; index -= 1) {
    const candidateLevel = DITHER_LEVEL_VALUES[index];
    const candidateValue = candidateLevel === undefined ? undefined : map[candidateLevel];
    if (candidateValue !== undefined) {
      return candidateValue;
    }
  }

  return undefined;
}

export function getMutedLayersForLevel(
  spec: FinAudioSpec,
  level: DitherLevel
): string[] {
  const resolved = getDitherLevelValue(spec.layerMuteMap ?? DEFAULT_FIN_LAYER_MUTE_MAP, level);
  return resolved ? [...resolved] : [];
}

export function hasFinAudio(audio?: AudioSpec): audio is AudioSpec & { fin: FinAudioSpec } {
  return Boolean(audio?.fin);
}
