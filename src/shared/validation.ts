import type {
  Action,
  Card,
  Hotspot,
  StackDefinition,
  StackValidationResult,
  Vector3Tuple
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function asVec3(value: unknown, path: string, errors: string[]): Vector3Tuple | null {
  if (!Array.isArray(value) || value.length !== 3 || value.some((n) => typeof n !== "number")) {
    errors.push(`${path} must be a [number, number, number] tuple`);
    return null;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function parseAction(value: unknown, path: string, errors: string[]): Action | null {
  if (!isObject(value) || !isString(value.type)) {
    errors.push(`${path}.type is required`);
    return null;
  }

  if (value.type === "goToCard") {
    if (!isString(value.cardId)) {
      errors.push(`${path}.cardId is required for goToCard`);
      return null;
    }
    return { type: "goToCard", cardId: value.cardId };
  }

  if (value.type === "setAnimation") {
    if (!isString(value.clip)) {
      errors.push(`${path}.clip is required for setAnimation`);
      return null;
    }
    const fadeMs = typeof value.fadeMs === "number" ? value.fadeMs : undefined;
    return { type: "setAnimation", clip: value.clip, fadeMs };
  }

  if (value.type === "sequence") {
    if (!Array.isArray(value.steps)) {
      errors.push(`${path}.steps must be an array for sequence`);
      return null;
    }
    const steps = value.steps
      .map((step, index) => parseAction(step, `${path}.steps[${index}]`, errors))
      .filter((action): action is Action => action !== null);
    return { type: "sequence", steps };
  }

  errors.push(`${path}.type has unsupported action: ${String(value.type)}`);
  return null;
}

function parseHotspot(value: unknown, path: string, errors: string[]): Hotspot | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (!isString(value.id)) {
    errors.push(`${path}.id is required`);
  }
  if (!isString(value.nodeName)) {
    errors.push(`${path}.nodeName is required`);
  }
  const onClick = parseAction(value.onClick, `${path}.onClick`, errors);
  if (!isString(value.id) || !isString(value.nodeName) || !onClick) {
    return null;
  }
  return {
    id: value.id,
    nodeName: value.nodeName,
    onClick
  };
}

function parseCard(value: unknown, path: string, errors: string[]): Card | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }

  if (!isString(value.id)) {
    errors.push(`${path}.id is required`);
  }
  if (!isString(value.modelPath)) {
    errors.push(`${path}.modelPath is required`);
  }
  if (!isObject(value.camera)) {
    errors.push(`${path}.camera is required`);
  }
  const camera = isObject(value.camera) ? value.camera : null;

  const position = asVec3(camera?.position, `${path}.camera.position`, errors);
  const target = asVec3(camera?.target, `${path}.camera.target`, errors);
  const fov = typeof camera?.fov === "number" ? camera.fov : null;
  if (fov === null) {
    errors.push(`${path}.camera.fov must be a number`);
  }

  const hotspots = Array.isArray(value.hotspots)
    ? value.hotspots
        .map((hotspot, index) => parseHotspot(hotspot, `${path}.hotspots[${index}]`, errors))
        .filter((hotspot): hotspot is Hotspot => hotspot !== null)
    : null;

  if (!Array.isArray(value.hotspots)) {
    errors.push(`${path}.hotspots must be an array`);
  }

  if (!isString(value.id) || !isString(value.modelPath) || !position || !target || fov === null || hotspots === null) {
    return null;
  }

  const audio = isObject(value.audio) && isString(value.audio.ambient)
    ? {
        ambient: value.audio.ambient,
        volume: typeof value.audio.volume === "number" ? value.audio.volume : undefined,
        loop: typeof value.audio.loop === "boolean" ? value.audio.loop : undefined
      }
    : undefined;

  return {
    id: value.id,
    modelPath: value.modelPath,
    camera: { position, target, fov },
    audio,
    hotspots
  };
}

export function validateStack(raw: unknown): StackValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) {
    return { ok: false, errors: ["stack must be an object"] };
  }
  if (!isString(raw.initialCardId)) {
    errors.push("initialCardId is required");
  }

  let cards: Card[] = [];
  if (!Array.isArray(raw.cards)) {
    errors.push("cards must be an array");
  } else {
    cards = raw.cards
      .map((card, index) => parseCard(card, `cards[${index}]`, errors))
      .filter((card): card is Card => card !== null);
  }

  if (cards.length > 0) {
    const ids = new Set(cards.map((card) => card.id));
    if (ids.size !== cards.length) {
      errors.push("card ids must be unique");
    }
    if (isString(raw.initialCardId) && !ids.has(raw.initialCardId)) {
      errors.push(`initialCardId '${raw.initialCardId}' does not exist in cards`);
    }
  }

  if (errors.length > 0 || !isString(raw.initialCardId)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      initialCardId: raw.initialCardId,
      cards
    }
  };
}
