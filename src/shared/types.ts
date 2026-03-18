export type AudioSpec = {
  ambient: string;
  volume?: number;
  loop?: boolean;
};

export type MediaKind = "image" | "video";

export type MediaLayer = {
  kind: MediaKind;
  src: string;
};

export type ArrowDirection = "left" | "right" | "up" | "down";

export type ScreenPosition = {
  x: number;
  y: number;
};

export type ArrowLink = {
  id: string;
  direction: ArrowDirection;
  targetCardId: string;
  label?: string;
  position?: ScreenPosition;
  disabled?: boolean;
};

export type GoToCardAction = {
  type: "goToCard";
  cardId: string;
};

export type SequenceAction = {
  type: "sequence";
  steps: Action[];
};

export type Action = GoToCardAction | SequenceAction;

export type Card = {
  id: string;
  background: MediaLayer;
  overlay?: MediaLayer;
  audio?: AudioSpec;
  arrows?: ArrowLink[];
};

export type StackDefinition = {
  initialCardId: string;
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
