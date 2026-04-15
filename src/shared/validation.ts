import type {
  ArrowLink,
  ButtonLink,
  Card,
  CardTransitionSpec,
  CardStyleLevel,
  ClickTarget,
  DragTarget,
  MediaKind,
  MediaLayer,
  ScreenBounds,
  ScreenPosition,
  StackDefinition,
  StackValidationResult,
  TitleSpec
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

function isStyleLevel(value: unknown): value is CardStyleLevel {
  return value === "modern" || value === "transitional" || value === "hypercard";
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

function parseBounds(value: unknown, path: string, errors: string[]): ScreenBounds | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (
    typeof value.x !== "number"
    || typeof value.y !== "number"
    || typeof value.width !== "number"
    || typeof value.height !== "number"
  ) {
    errors.push(`${path} must have numeric x, y, width, and height`);
    return null;
  }
  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height
  };
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
  const position = parsePosition(value.position, `${path}.position`, errors);
  if (!isMediaKind(value.kind) || !isString(value.src) || position === null) {
    return null;
  }
  return {
    kind: value.kind,
    src: value.src,
    position
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
  if (value.direction !== "left" && value.direction !== "right" && value.direction !== "up" && value.direction !== "down" && value.direction !== "forward") {
    errors.push(`${path}.direction must be one of left, right, up, down, forward`);
  }
  if (!isString(value.targetCardId)) {
    errors.push(`${path}.targetCardId is required`);
  }

  const position = parsePosition(value.position, `${path}.position`, errors);
  const transition = parseTransition(value.transition, `${path}.transition`, errors);
  if (
    !isString(value.id)
    || (value.direction !== "left" && value.direction !== "right" && value.direction !== "up" && value.direction !== "down" && value.direction !== "forward")
    || !isString(value.targetCardId)
    || position === null
    || transition === null
  ) {
    return null;
  }

  return {
    id: value.id,
    direction: value.direction,
    targetCardId: value.targetCardId,
    label: isString(value.label) ? value.label : undefined,
    position,
    disabled: typeof value.disabled === "boolean" ? value.disabled : undefined,
    transition
  };
}

function parseButton(value: unknown, path: string, errors: string[]): ButtonLink | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (!isString(value.id)) {
    errors.push(`${path}.id is required`);
  }
  if (!isString(value.label)) {
    errors.push(`${path}.label is required`);
  }
  if (!isString(value.targetCardId)) {
    errors.push(`${path}.targetCardId is required`);
  }
  if (value.variant !== undefined && value.variant !== "primary" && value.variant !== "secondary") {
    errors.push(`${path}.variant must be 'primary' or 'secondary'`);
  }

  const position = parsePosition(value.position, `${path}.position`, errors);
  const transition = parseTransition(value.transition, `${path}.transition`, errors);
  if (
    !isString(value.id)
    || !isString(value.label)
    || !isString(value.targetCardId)
    || (value.variant !== undefined && value.variant !== "primary" && value.variant !== "secondary")
    || position === null
    || transition === null
  ) {
    return null;
  }

  return {
    id: value.id,
    label: value.label,
    targetCardId: value.targetCardId,
    position,
    variant: value.variant,
    disabled: typeof value.disabled === "boolean" ? value.disabled : undefined,
    transition
  };
}

function parseTitle(value: unknown, path: string, errors: string[]): TitleSpec | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (!isString(value.heading)) {
    errors.push(`${path}.heading is required`);
  }
  if (value.align !== undefined && value.align !== "left" && value.align !== "center") {
    errors.push(`${path}.align must be 'left' or 'center'`);
  }

  if (
    !isString(value.heading)
    || (value.align !== undefined && value.align !== "left" && value.align !== "center")
  ) {
    return null;
  }

  return {
    heading: value.heading,
    subheading: isString(value.subheading) ? value.subheading : undefined,
    align: value.align
  };
}

function parseTransition(value: unknown, path: string, errors: string[]): CardTransitionSpec | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (value.kind !== "zoom") {
    errors.push(`${path}.kind must be 'zoom'`);
  }
  const focusBounds = parseBounds(value.focusBounds, `${path}.focusBounds`, errors);
  if (
    value.durationMs !== undefined
    && (typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs <= 0)
  ) {
    errors.push(`${path}.durationMs must be a positive number`);
  }
  if (
    value.entryScale !== undefined
    && (typeof value.entryScale !== "number" || !Number.isFinite(value.entryScale) || value.entryScale < 1)
  ) {
    errors.push(`${path}.entryScale must be a number greater than or equal to 1`);
  }

  if (value.kind !== "zoom" || !focusBounds) {
    return null;
  }

  return {
    kind: value.kind,
    focusBounds,
    durationMs: typeof value.durationMs === "number" ? value.durationMs : undefined,
    entryScale: typeof value.entryScale === "number" ? value.entryScale : undefined
  };
}

function parseClickTarget(value: unknown, path: string, errors: string[]): ClickTarget | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (!isString(value.id)) {
    errors.push(`${path}.id is required`);
  }
  if (!isString(value.targetCardId)) {
    errors.push(`${path}.targetCardId is required`);
  }

  const bounds = parseBounds(value.bounds, `${path}.bounds`, errors);
  const transition = parseTransition(value.transition, `${path}.transition`, errors);
  if (!isString(value.id) || !isString(value.targetCardId) || !bounds || transition === null) {
    return null;
  }

  return {
    id: value.id,
    targetCardId: value.targetCardId,
    bounds,
    label: isString(value.label) ? value.label : undefined,
    disabled: typeof value.disabled === "boolean" ? value.disabled : undefined,
    transition
  };
}

function parseDragTarget(value: unknown, path: string, errors: string[]): DragTarget | null {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  if (!isString(value.id)) {
    errors.push(`${path}.id is required`);
  }
  if (!isString(value.src)) {
    errors.push(`${path}.src is required`);
  }
  if (!isString(value.targetCardId)) {
    errors.push(`${path}.targetCardId is required`);
  }

  const startBounds = parseBounds(value.startBounds, `${path}.startBounds`, errors);
  const dropBounds = parseBounds(value.dropBounds, `${path}.dropBounds`, errors);
  const snapBounds = value.snapBounds === undefined
    ? undefined
    : parseBounds(value.snapBounds, `${path}.snapBounds`, errors);
  const transition = parseTransition(value.transition, `${path}.transition`, errors);

  if (
    !isString(value.id)
    || !isString(value.src)
    || !isString(value.targetCardId)
    || !startBounds
    || !dropBounds
    || snapBounds === null
    || transition === null
  ) {
    return null;
  }

  return {
    id: value.id,
    src: value.src,
    targetCardId: value.targetCardId,
    startBounds,
    dropBounds,
    snapBounds,
    label: isString(value.label) ? value.label : undefined,
    disabled: typeof value.disabled === "boolean" ? value.disabled : undefined,
    transition
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
  const styleLevel = value.styleLevel === undefined
    ? "modern"
    : isStyleLevel(value.styleLevel)
      ? value.styleLevel
      : null;
  if (value.styleLevel !== undefined && !isStyleLevel(value.styleLevel)) {
    errors.push(`${path}.styleLevel must be 'modern', 'transitional', or 'hypercard'`);
  }
  const title = parseTitle(value.title, `${path}.title`, errors);
  const background = parseMediaLayer(value.background, `${path}.background`, errors);
  const overlay = value.overlay === undefined
    ? undefined
    : parseMediaLayer(value.overlay, `${path}.overlay`, errors);
  if (value.backgroundFolder !== undefined && !isString(value.backgroundFolder)) {
    errors.push(`${path}.backgroundFolder must be a non-empty string`);
  }

  const buttons = value.buttons === undefined
    ? undefined
    : Array.isArray(value.buttons)
      ? value.buttons
          .map((button, index) => parseButton(button, `${path}.buttons[${index}]`, errors))
          .filter((button): button is ButtonLink => button !== null)
      : null;

  const clickTargets = value.clickTargets === undefined
    ? undefined
    : Array.isArray(value.clickTargets)
      ? value.clickTargets
          .map((clickTarget, index) => parseClickTarget(clickTarget, `${path}.clickTargets[${index}]`, errors))
          .filter((clickTarget): clickTarget is ClickTarget => clickTarget !== null)
      : null;

  const dragTargets = value.dragTargets === undefined
    ? undefined
    : Array.isArray(value.dragTargets)
      ? value.dragTargets
          .map((dragTarget, index) => parseDragTarget(dragTarget, `${path}.dragTargets[${index}]`, errors))
          .filter((dragTarget): dragTarget is DragTarget => dragTarget !== null)
      : null;

  const arrows = value.arrows === undefined
    ? undefined
    : Array.isArray(value.arrows)
      ? value.arrows
          .map((arrow, index) => parseArrow(arrow, `${path}.arrows[${index}]`, errors))
          .filter((arrow): arrow is ArrowLink => arrow !== null)
      : null;

  if (value.buttons !== undefined && !Array.isArray(value.buttons)) {
    errors.push(`${path}.buttons must be an array`);
  }
  if (value.clickTargets !== undefined && !Array.isArray(value.clickTargets)) {
    errors.push(`${path}.clickTargets must be an array`);
  }
  if (value.dragTargets !== undefined && !Array.isArray(value.dragTargets)) {
    errors.push(`${path}.dragTargets must be an array`);
  }
  if (value.arrows !== undefined && !Array.isArray(value.arrows)) {
    errors.push(`${path}.arrows must be an array`);
  }

  if (
    !isString(value.id)
    || styleLevel === null
    || title === null
    || !background
    || overlay === null
    || buttons === null
    || clickTargets === null
    || dragTargets === null
    || arrows === null
  ) {
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
    styleLevel,
    title,
    background,
    backgroundFolder: isString(value.backgroundFolder) ? value.backgroundFolder : undefined,
    overlay,
    audio,
    buttons,
    clickTargets,
    dragTargets,
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
      for (const button of card.buttons ?? []) {
        if (!ids.has(button.targetCardId)) {
          errors.push(`card '${card.id}' button '${button.id}' points to missing card '${button.targetCardId}'`);
        }
      }
      for (const clickTarget of card.clickTargets ?? []) {
        if (!ids.has(clickTarget.targetCardId)) {
          errors.push(`card '${card.id}' click target '${clickTarget.id}' points to missing card '${clickTarget.targetCardId}'`);
        }
      }
      for (const dragTarget of card.dragTargets ?? []) {
        if (!ids.has(dragTarget.targetCardId)) {
          errors.push(`card '${card.id}' drag target '${dragTarget.id}' points to missing card '${dragTarget.targetCardId}'`);
        }
      }
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
