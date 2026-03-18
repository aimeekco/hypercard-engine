import type {
  Action,
  ArrowLink,
  Card,
  MediaKind,
  MediaLayer,
  ScreenPosition,
  StackDefinition,
  StackValidationResult
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isMediaKind(value: unknown): value is MediaKind {
  return value === "image" || value === "video";
}

function parsePosition(value: unknown, path: string, errors: string[]): ScreenPosition | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isObject(value) || typeof value.x !== "number" || typeof value.y !== "number") {
    errors.push(`${path} must be an object with numeric x and y`);
    return null;
  }
  return { x: value.x, y: value.y };
}

function parseMediaLayer(value: unknown, path: string, errors: string[]): MediaLayer | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (!isMediaKind(value.kind)) {
    errors.push(`${path}.kind must be 'image' or 'video'`);
  }
  if (!isString(value.src)) {
    errors.push(`${path}.src is required`);
  }
  if (!isMediaKind(value.kind) || !isString(value.src)) {
    return null;
  }
  return {
    kind: value.kind,
    src: value.src
  };
}

function parseArrow(value: unknown, path: string, errors: string[]): ArrowLink | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (!isString(value.id)) {
    errors.push(`${path}.id is required`);
  }
  if (value.direction !== "left" && value.direction !== "right" && value.direction !== "up" && value.direction !== "down") {
    errors.push(`${path}.direction must be one of left, right, up, down`);
  }
  if (!isString(value.targetCardId)) {
    errors.push(`${path}.targetCardId is required`);
  }

  const position = parsePosition(value.position, `${path}.position`, errors);
  if (
    !isString(value.id)
    || (value.direction !== "left" && value.direction !== "right" && value.direction !== "up" && value.direction !== "down")
    || !isString(value.targetCardId)
    || position === null
  ) {
    return null;
  }

  return {
    id: value.id,
    direction: value.direction,
    targetCardId: value.targetCardId,
    label: isString(value.label) ? value.label : undefined,
    position,
    disabled: typeof value.disabled === "boolean" ? value.disabled : undefined
  };
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

function parseCard(value: unknown, path: string, errors: string[]): Card | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }

  if (!isString(value.id)) {
    errors.push(`${path}.id is required`);
  }
  const background = parseMediaLayer(value.background, `${path}.background`, errors);
  const overlay = value.overlay === undefined
    ? undefined
    : parseMediaLayer(value.overlay, `${path}.overlay`, errors);

  const arrows = value.arrows === undefined
    ? undefined
    : Array.isArray(value.arrows)
      ? value.arrows
          .map((arrow, index) => parseArrow(arrow, `${path}.arrows[${index}]`, errors))
          .filter((arrow): arrow is ArrowLink => arrow !== null)
      : null;

  if (value.arrows !== undefined && !Array.isArray(value.arrows)) {
    errors.push(`${path}.arrows must be an array`);
  }

  if (!isString(value.id) || !background || overlay === null || arrows === null) {
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
    background,
    overlay,
    audio,
    arrows
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
    for (const card of cards) {
      for (const arrow of card.arrows ?? []) {
        if (!ids.has(arrow.targetCardId)) {
          errors.push(`card '${card.id}' arrow '${arrow.id}' points to missing card '${arrow.targetCardId}'`);
        }
      }
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
