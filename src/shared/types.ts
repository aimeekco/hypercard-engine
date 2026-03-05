export type Vector3Tuple = [number, number, number];

export type CameraSpec = {
  position: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
};

export type AudioSpec = {
  ambient: string;
  volume?: number;
  loop?: boolean;
};

export type GoToCardAction = {
  type: "goToCard";
  cardId: string;
};

export type SetAnimationAction = {
  type: "setAnimation";
  clip: string;
  fadeMs?: number;
};

export type SequenceAction = {
  type: "sequence";
  steps: Action[];
};

export type Action = GoToCardAction | SetAnimationAction | SequenceAction;

export type Hotspot = {
  id: string;
  nodeName: string;
  onClick: Action;
};

export type Card = {
  id: string;
  modelPath: string;
  camera: CameraSpec;
  audio?: AudioSpec;
  hotspots: Hotspot[];
};

export type StackDefinition = {
  initialCardId: string;
  cards: Card[];
};

export type FileChangedPayload = {
  kind: "stack" | "models" | "audio";
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
