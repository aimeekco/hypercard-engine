export type ArrowDirection = "left" | "right" | "up" | "down" | "forward";
export type MediaKind = "image" | "video";

export type MediaLayer = {
  kind: MediaKind;
  src: string;
  position?: ScreenPosition;
  loop?: boolean;
  onEndedDirection?: ArrowDirection;
};

export const DITHER_LEVEL_VALUES = [0, 0.25, 0.5, 0.75, 1] as const;
export type DitherLevel = typeof DITHER_LEVEL_VALUES[number];
export type DitherLevelMap<T> = Partial<Record<DitherLevel, T>>;

export type FinAudioSpec = {
  source: string;
  layerMuteMap?: DitherLevelMap<string[]>;
};

export type AudioSpec = {
  ambient?: string;
  fin?: FinAudioSpec;
  volume?: number;
  loop?: boolean;
};

export type CardStyleLevel = "modern" | "transitional" | "hypercard";
export type ButtonVariant = "primary" | "secondary";
export type TitleAlign = "left" | "center";

export type ScreenPosition = {
  x: number;
  y: number;
};

export type ScreenBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CardTransitionSpec = {
  kind: "zoom";
  focusBounds: ScreenBounds;
  durationMs?: number;
  entryScale?: number;
};

export type ArrowLink = {
  id: string;
  direction: ArrowDirection;
  targetCardId: string;
  label?: string;
  position?: ScreenPosition;
  disabled?: boolean;
  transition?: CardTransitionSpec;
};

export type ButtonLink = {
  id: string;
  label: string;
  targetCardId: string;
  position?: ScreenPosition;
  variant?: ButtonVariant;
  disabled?: boolean;
  transition?: CardTransitionSpec;
};

export type ClickTarget = {
  id: string;
  targetCardId: string;
  bounds: ScreenBounds;
  label?: string;
  disabled?: boolean;
  transition?: CardTransitionSpec;
};

export type DragTarget = {
  id: string;
  src: string;
  targetCardId: string;
  startBounds: ScreenBounds;
  dropBounds: ScreenBounds;
  snapBounds?: ScreenBounds;
  label?: string;
  disabled?: boolean;
  transition?: CardTransitionSpec;
};

export type TitleSpec = {
  heading: string;
  subheading?: string;
  align?: TitleAlign;
};

export type GoToCardAction = {
  type: "goToCard";
  cardId: string;
  transition?: CardTransitionSpec;
};

export type SequenceAction = {
  type: "sequence";
  steps: Action[];
};

export type Action = GoToCardAction | SequenceAction;

export type Card = {
  id: string;
  styleLevel?: CardStyleLevel;
  title?: TitleSpec;
  background: MediaLayer;
  backgroundFolder?: string;
  overlay?: MediaLayer;
  audio?: AudioSpec;
  buttons?: ButtonLink[];
  clickTargets?: ClickTarget[];
  dragTargets?: DragTarget[];
  arrows?: ArrowLink[];
};

export type StackDefinition = {
  initialCardId: string;
  audio?: AudioSpec;
  cards: Card[];
};

export type FileChangedPayload = {
  kind: "stack" | "asset";
  path: string;
  eventName: "add" | "change" | "unlink";
};

export type StackValidationResult = {
  ok: true;
  value: StackDefinition;
} | {
  ok: false;
  errors: string[];
};
