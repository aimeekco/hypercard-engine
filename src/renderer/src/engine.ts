import { executeAction } from "@shared/actions";
import {
  chooseRandomEntry,
  getDitherFolderCandidates,
  getDitherLevelForStep
} from "@shared/backgroundBank";
import { getAmbientVolumeForLevel, hasFinAudio, resolveAudioSpec, shouldAutoplayFinAudio } from "@shared/audio";
import { getArrowNavigationTarget } from "@shared/navigation";
import { isEndingCard, isStochasticCard, resolveStochasticNavigationTarget } from "@shared/stochasticNavigation";
import type {
  Action,
  ArrowLink,
  ButtonLink,
  Card,
  CardTransitionSpec,
  CardStyleLevel,
  ClickTarget,
  DitherLevel,
  DragTarget,
  FileChangedPayload,
  MediaLayer,
  ScreenBounds,
  ScreenPosition,
  StackDefinition
} from "@shared/types";
import { validateStack } from "@shared/validation";
import { AudioEngine } from "./audioEngine";

const ARROW_GLYPHS: Record<ArrowLink["direction"], string> = {
  left: "<",
  right: ">",
  up: "^",
  down: "v",
  forward: "^"
};

const DEFAULT_CARD_BUTTON_POSITION = {
  x: 50,
  y: 72
};

const INTRO_CLICK_SOUND_PATH = "assets/audio/mouse_click.mp3";
const ENDING_RESTART_DELAY_MS = 5000;
const RESTART_CARD_ID = "intro_title";
const RESTART_DISK_IMAGE_PATH = "assets/images/floppy_disk.png";
const VIDEO_FRAME_SIZE = {
  width: 1920,
  height: 1080
};

type EnterCardOptions = {
  advanceProgression?: boolean;
  preserveBackgroundSelection?: boolean;
  resetProgression?: boolean;
};

type BackgroundSelection = {
  cardId: string;
  level: DitherLevel;
  layer: MediaLayer;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function guessMimeType(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (lower.endsWith(".webm")) {
    return "video/webm";
  }
  if (lower.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (lower.endsWith(".mov")) {
    return "video/quicktime";
  }
  return "application/octet-stream";
}

function guessMediaKind(relativePath: string): MediaLayer["kind"] | null {
  const lower = relativePath.toLowerCase();
  if (
    lower.endsWith(".png")
    || lower.endsWith(".jpg")
    || lower.endsWith(".jpeg")
    || lower.endsWith(".webp")
    || lower.endsWith(".gif")
    || lower.endsWith(".svg")
  ) {
    return "image";
  }
  if (lower.endsWith(".webm") || lower.endsWith(".mp4") || lower.endsWith(".mov")) {
    return "video";
  }
  return null;
}

function isSupportedBackgroundAsset(relativePath: string): boolean {
  return guessMediaKind(relativePath) !== null;
}

function arePositionsEqual(left?: ScreenPosition, right?: ScreenPosition): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.x === right.x && left.y === right.y;
}

function areMediaLayersEqual(left: MediaLayer, right: MediaLayer): boolean {
  return left.kind === right.kind
    && left.src === right.src
    && arePositionsEqual(left.position, right.position);
}

function waitForImageLoad(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error(`Image failed to load: ${image.src}`)), { once: true });
  });
}

function waitForVideoLoad(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error(`Video failed to load: ${video.currentSrc || video.src}`)), { once: true });
  });
}

function getReferencedAssetPaths(
  card: Card,
  selectedBackgroundLayer?: MediaLayer | null,
  audio?: Card["audio"]
): string[] {
  const paths = [card.background.src];
  if (selectedBackgroundLayer && selectedBackgroundLayer.src !== card.background.src) {
    paths.push(selectedBackgroundLayer.src);
  }
  if (card.overlay) {
    paths.push(card.overlay.src);
  }
  for (const dragTarget of card.dragTargets ?? []) {
    paths.push(dragTarget.src);
  }
  if (audio?.ambient) {
    paths.push(audio.ambient);
  }
  return Array.from(new Set(paths));
}

function getEnabledArrowAction(card: Card, direction: ArrowLink["direction"]): Action | null {
  const arrow = card.arrows?.find((candidate) => candidate.direction === direction && !candidate.disabled);
  if (!arrow) {
    return null;
  }

  return {
    type: "goToCard",
    cardId: arrow.targetCardId,
    transition: arrow.transition
  };
}

function participatesInDitherProgression(card: Card | null | undefined): boolean {
  return Boolean(card?.backgroundFolder);
}

function shouldPlayIntroClickSound(card: Pick<Card, "id">): boolean {
  return card.id === "boot_mac" || card.id === "intro_title";
}

function corruptTitleText(text: string, restartCount: number): string {
  if (restartCount <= 0) {
    return text;
  }

  const replacements: Record<string, readonly string[]> = {
    a: ["@", "4", "^"],
    c: ["<", "(", "["],
    f: ["F", "ph", "#"],
    h: ["#", "|-|", "H"],
    i: ["1", "!", "|"],
    k: ["K", "|<", "<"],
    s: ["$", "5", "z"],
    t: ["7", "+", "_"]
  };
  const fallbackReplacements = ["_", "/", "\\", "?", "%", "*"];
  const characters = Array.from(text);
  const candidateIndexes = characters
    .map((character, index) => (character.trim().length > 0 ? index : -1))
    .filter((index) => index >= 0);
  const replacementCount = Math.min(candidateIndexes.length, Math.max(1, restartCount * 2));
  const usedIndexes = new Set<number>();

  while (usedIndexes.size < replacementCount) {
    const characterIndex = candidateIndexes[Math.floor(Math.random() * candidateIndexes.length)];
    if (characterIndex === undefined || usedIndexes.has(characterIndex)) {
      continue;
    }
    usedIndexes.add(characterIndex);
    const character = characters[characterIndex] ?? "";
    const variants = replacements[character.toLowerCase()];
    characters[characterIndex] = variants
      ? variants[Math.floor(Math.random() * variants.length)] ?? character
      : fallbackReplacements[Math.floor(Math.random() * fallbackReplacements.length)] ?? character;
  }

  const suffix = restartCount > 3 && Math.random() > 0.35
    ? ` ${fallbackReplacements[Math.floor(Math.random() * fallbackReplacements.length)]?.repeat(Math.min(4, restartCount - 2)) ?? ""}`
    : "";
  return `${characters.join("")}${suffix}`;
}

function rectFromBounds(bounds: ScreenBounds, stageRect: DOMRect): DOMRect {
  return new DOMRect(
    stageRect.width * (bounds.x / 100),
    stageRect.height * (bounds.y / 100),
    stageRect.width * (bounds.width / 100),
    stageRect.height * (bounds.height / 100)
  );
}

function intersectsDropZone(itemRect: DOMRect, dropRect: DOMRect): boolean {
  const centerX = itemRect.x + itemRect.width / 2;
  const centerY = itemRect.y + itemRect.height / 2;
  return (
    centerX >= dropRect.x
    && centerX <= dropRect.x + dropRect.width
    && centerY >= dropRect.y
    && centerY <= dropRect.y + dropRect.height
  );
}

function getMediaIntrinsicSize(element: HTMLElement): { width: number; height: number } {
  if (element instanceof HTMLImageElement) {
    return {
      width: Math.max(1, element.naturalWidth),
      height: Math.max(1, element.naturalHeight)
    };
  }

  if (element instanceof HTMLVideoElement) {
    return {
      width: Math.max(1, element.videoWidth || element.clientWidth),
      height: Math.max(1, element.videoHeight || element.clientHeight)
    };
  }

  return {
    width: Math.max(1, element.clientWidth),
    height: Math.max(1, element.clientHeight)
  };
}

function applyFrameRect(frame: HTMLElement, rect: DOMRect): void {
  frame.style.left = `${rect.x}px`;
  frame.style.top = `${rect.y}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
}

function getSceneFrameSize(scene: HTMLElement): { width: number; height: number } | null {
  const width = Number(scene.dataset.frameWidth);
  const height = Number(scene.dataset.frameHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function getElementContentSize(element: HTMLElement): { width: number; height: number } {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  return {
    width: Math.max(1, rect.width - horizontalPadding),
    height: Math.max(1, rect.height - verticalPadding)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class HypercardEngine {
  private readonly stage: HTMLElement;
  private readonly status: HTMLElement;
  private readonly audio = new AudioEngine();

  private stack: StackDefinition | null = null;
  private cardsById = new Map<string, Card>();
  private currentCardId: string | null = null;
  private unsubscribeFileChanged: (() => void) | null = null;
  private readonly assetUrlCache = new Map<string, string>();
  private readonly backgroundFolderCache = new Map<string, string[]>();
  private renderToken = 0;
  private isTransitioning = false;
  private currentDitherStep = 0;
  private currentBackgroundSelection: BackgroundSelection | null = null;
  private videoFrameSize = VIDEO_FRAME_SIZE;
  private finHoldTimer: number | null = null;
  private endingRestartTimer: number | null = null;
  private restartCount = 0;
  private readonly videoFreezeTimers = new Set<number>();

  constructor(stage: HTMLElement, status: HTMLElement) {
    this.stage = stage;
    this.status = status;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("pointerdown", this.unlockAudio, { once: true });
    window.addEventListener("resize", this.handleViewportChange);
    document.addEventListener("fullscreenchange", this.handleViewportChange);
  }

  async start(): Promise<void> {
    await this.loadStack(true);
    const initialId = this.stack?.initialCardId;
    if (!initialId) {
      throw new Error("No initial card available");
    }

    await this.enterCard(initialId);
    this.unsubscribeFileChanged = window.hypercard.onFileChanged((payload) => {
      void this.handleFileChanged(payload);
    });
  }

  private readonly unlockAudio = (): void => {
    void this.audio.unlock();
  };

  private readonly handleViewportChange = (): void => {
    window.requestAnimationFrame(() => {
      this.layoutCurrentScenes();
    });
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }

    const card = this.currentCardId ? this.cardsById.get(this.currentCardId) : null;
    const arrow = getArrowNavigationTarget(card, event.key);
    if (!arrow) {
      return;
    }

    event.preventDefault();
    void this.applyArrowNavigation(arrow);
  };

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  private clearFinHoldTimer(): void {
    if (this.finHoldTimer === null) {
      return;
    }

    window.clearTimeout(this.finHoldTimer);
    this.finHoldTimer = null;
  }

  private clearVideoFreezeTimers(): void {
    for (const timer of this.videoFreezeTimers) {
      window.clearTimeout(timer);
    }
    this.videoFreezeTimers.clear();
  }

  private clearEndingRestartTimer(): void {
    if (this.endingRestartTimer === null) {
      return;
    }

    window.clearTimeout(this.endingRestartTimer);
    this.endingRestartTimer = null;
  }

  private clearSceneTimers(): void {
    this.clearFinHoldTimer();
    this.clearVideoFreezeTimers();
    this.clearEndingRestartTimer();
  }

  private async applyArrowNavigation(arrow: ArrowLink): Promise<void> {
    const card = this.currentCardId ? this.cardsById.get(this.currentCardId) : null;
    const cards = this.stack?.cards ?? [];
    const stochasticTarget = card && isStochasticCard(card, cards)
      ? resolveStochasticNavigationTarget(card, cards, this.currentDitherStep)
      : null;

    if (stochasticTarget) {
      await this.applyAction({
        type: "goToCard",
        cardId: stochasticTarget.cardId,
        transition: stochasticTarget.transition
      });
      return;
    }

    await this.applyAction({ type: "goToCard", cardId: arrow.targetCardId, transition: arrow.transition });
  }

  private async readStackValidated(): Promise<StackDefinition> {
    const raw = await window.hypercard.readStack();
    const result = validateStack(raw);
    if (!result.ok) {
      throw new Error(`stack validation failed:\n${result.errors.join("\n")}`);
    }
    return result.value;
  }

  private async loadStack(isInitial = false): Promise<void> {
    try {
      const stack = await this.readStackValidated();
      this.stack = stack;
      this.cardsById = new Map(stack.cards.map((card) => [card.id, card]));
      if (hasFinAudio(stack.audio)) {
        await window.hypercard.musicPrewarm().catch((error) => {
          console.warn("Audio prewarm failed", error);
        });
      }
      this.setStatus("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isInitial || !this.stack) {
        throw error;
      }
      this.setStatus(`Stack reload failed. Keeping last good config.\n${message}`);
      console.warn(message);
    }
  }

  private async getAssetUrl(relativePath: string): Promise<string> {
    const existing = this.assetUrlCache.get(relativePath);
    if (existing) {
      return existing;
    }

    const bytes = await window.hypercard.readBinary(relativePath);
    const blob = new Blob([toArrayBuffer(bytes)], { type: guessMimeType(relativePath) });
    const url = URL.createObjectURL(blob);
    this.assetUrlCache.set(relativePath, url);
    return url;
  }

  private invalidateAsset(relativePath: string): void {
    const existing = this.assetUrlCache.get(relativePath);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.assetUrlCache.delete(relativePath);
    }
  }

  private async createLayerElement(
    layer: MediaLayer,
    className: string,
    alt: string,
    options?: {
      card?: Card;
      renderToken?: number;
      scheduleFinHold?: boolean;
    }
  ): Promise<HTMLElement> {
    const assetUrl = await this.getAssetUrl(layer.src);

    if (layer.kind === "image") {
      const image = document.createElement("img");
      image.className = className;
      image.alt = alt;
      image.draggable = false;
      image.src = assetUrl;
      if (layer.position) {
        image.style.objectPosition = `${layer.position.x}% ${layer.position.y}%`;
      }
      await waitForImageLoad(image);
      return image;
    }

    const video = document.createElement("video");
    video.className = className;
    video.src = assetUrl;
    video.autoplay = true;
    video.loop = layer.loop ?? (layer.onEndedDirection === undefined);
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("aria-label", alt);
    if (layer.position) {
      video.style.objectPosition = `${layer.position.x}% ${layer.position.y}%`;
    }
    if (layer.onEndedDirection && options?.card) {
      const action = getEnabledArrowAction(options.card, layer.onEndedDirection);
      if (action) {
        video.addEventListener("ended", () => {
          if (
            options.renderToken !== this.renderToken
            || this.currentCardId !== options.card?.id
            || this.isTransitioning
          ) {
            return;
          }

          void this.applyAction(action).catch((error) => {
            console.warn("Video-ended navigation failed", error);
          });
        });
      } else {
        console.warn(
          `Video layer '${layer.src}' requested onEndedDirection '${layer.onEndedDirection}' on card '${options.card.id}', but no enabled arrow matched`
        );
      }
    }
    await waitForVideoLoad(video);
    if (options?.scheduleFinHold && options.card && video.loop === false && Number.isFinite(video.duration)) {
      this.scheduleFinHold(options.card, video.duration, options.renderToken);
    }
    void video.play().catch((error) => {
      console.warn("Video playback did not start immediately", error);
    });
    return video;
  }

  private scheduleFinHold(card: Card, videoDurationSeconds: number, renderToken?: number): void {
    this.clearFinHoldTimer();

    const audio = resolveAudioSpec(this.stack?.audio, card.audio);
    if (!hasFinAudio(audio) || !audio.fin.holdSource) {
      return;
    }

    const holdSource = audio.fin.holdSource;
    const holdBeforeEndSeconds = audio.fin.holdBeforeEndSeconds ?? 1.62;
    const triggerMs = Math.max(0, (videoDurationSeconds - holdBeforeEndSeconds) * 1000);
    this.finHoldTimer = window.setTimeout(() => {
      this.finHoldTimer = null;
      if (
        renderToken !== undefined
        && (renderToken !== this.renderToken || this.currentCardId !== card.id)
      ) {
        return;
      }

      const level = this.currentBackgroundSelection?.level ?? this.getDitherLevelForRender(card, false);
      void window.hypercard.musicStartOrSync({
        ...audio.fin,
        source: holdSource,
        holdSource: undefined,
        holdBeforeEndSeconds: undefined
      }, level).catch((error) => {
        console.warn("Fin hold failed", error);
      });
    }, triggerMs);
  }

  private createArrowButton(arrow: ArrowLink): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card-arrow is-${arrow.direction}`;
    const icon = document.createElement("span");
    icon.className = "card-arrow-icon";
    icon.textContent = ARROW_GLYPHS[arrow.direction];
    button.append(icon);
    button.setAttribute("aria-label", arrow.label ?? `Go ${arrow.direction}`);
    if (arrow.position) {
      button.classList.add("is-custom");
      button.style.left = `${arrow.position.x}%`;
      button.style.top = `${arrow.position.y}%`;
    }
    if (arrow.disabled) {
      button.disabled = true;
    } else {
      button.addEventListener("click", () => {
        void this.applyArrowNavigation(arrow);
      });
    }
    return button;
  }

  private createCardButton(buttonSpec: ButtonLink): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `card-button is-${buttonSpec.variant ?? "primary"}`;
    button.textContent = buttonSpec.label;
    button.setAttribute("aria-label", buttonSpec.label);

    const position = buttonSpec.position ?? DEFAULT_CARD_BUTTON_POSITION;
    button.style.left = `${position.x}%`;
    button.style.top = `${position.y}%`;

    if (buttonSpec.disabled) {
      button.disabled = true;
    } else {
      button.addEventListener("click", () => {
        void this.applyAction({ type: "goToCard", cardId: buttonSpec.targetCardId, transition: buttonSpec.transition });
      });
    }
    return button;
  }

  private playIntroClickSound(card: Pick<Card, "id">): void {
    if (!shouldPlayIntroClickSound(card)) {
      return;
    }
    void this.audio.playOneShot(INTRO_CLICK_SOUND_PATH).catch((error) => {
      console.warn("Click sound failed", error);
    });
  }

  private createClickTarget(card: Card, clickTarget: ClickTarget): HTMLButtonElement {
    const target = document.createElement("button");
    target.type = "button";
    target.className = "card-click-target";
    target.setAttribute("aria-label", clickTarget.label ?? "Continue");
    target.style.left = `${clickTarget.bounds.x}%`;
    target.style.top = `${clickTarget.bounds.y}%`;
    target.style.width = `${clickTarget.bounds.width}%`;
    target.style.height = `${clickTarget.bounds.height}%`;

    if (clickTarget.disabled) {
      target.disabled = true;
    } else {
      target.addEventListener("click", () => {
        this.playIntroClickSound(card);
        void this.applyAction({ type: "goToCard", cardId: clickTarget.targetCardId, transition: clickTarget.transition });
      });
    }

    return target;
  }

  private async createDragTarget(card: Card, dragTarget: DragTarget, frameElement: HTMLElement): Promise<HTMLButtonElement> {
    const target = document.createElement("button");
    target.type = "button";
    target.className = "card-drag-target";
    target.setAttribute("aria-label", dragTarget.label ?? "Insert disk");

    const assetUrl = await this.getAssetUrl(dragTarget.src);
    const image = document.createElement("img");
    image.className = "card-drag-target-image";
    image.alt = "";
    image.draggable = false;
    image.src = assetUrl;
    await waitForImageLoad(image);
    target.append(image);

    target.style.left = `${dragTarget.startBounds.x}%`;
    target.style.top = `${dragTarget.startBounds.y}%`;
    target.style.width = `${dragTarget.startBounds.width}%`;
    target.style.height = `${dragTarget.startBounds.height}%`;

    if (dragTarget.disabled) {
      target.disabled = true;
      return target;
    }

    target.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      const frameRect = frameElement.getBoundingClientRect();
      const startRect = rectFromBounds(dragTarget.startBounds, frameRect);
      const dropRect = rectFromBounds(dragTarget.dropBounds, frameRect);
      const snapRect = rectFromBounds(dragTarget.snapBounds ?? dragTarget.dropBounds, frameRect);
      const pointerOffsetX = event.clientX - (frameRect.left + startRect.x);
      const pointerOffsetY = event.clientY - (frameRect.top + startRect.y);

      const moveTarget = (leftPx: number, topPx: number): void => {
        target.style.left = `${(leftPx / frameRect.width) * 100}%`;
        target.style.top = `${(topPx / frameRect.height) * 100}%`;
      };

      target.classList.add("is-dragging");
      target.setPointerCapture(event.pointerId);

      const handleMove = (moveEvent: PointerEvent): void => {
        const nextLeft = Math.max(0, Math.min(frameRect.width - startRect.width, moveEvent.clientX - frameRect.left - pointerOffsetX));
        const nextTop = Math.max(0, Math.min(frameRect.height - startRect.height, moveEvent.clientY - frameRect.top - pointerOffsetY));
        moveTarget(nextLeft, nextTop);
      };

      const handleEnd = (endEvent: PointerEvent): void => {
        target.classList.remove("is-dragging");
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
        window.removeEventListener("pointercancel", handleEnd);

        const currentRect = new DOMRect(
          (parseFloat(target.style.left) / 100) * frameRect.width,
          (parseFloat(target.style.top) / 100) * frameRect.height,
          startRect.width,
          startRect.height
        );

        if (intersectsDropZone(currentRect, dropRect)) {
          target.disabled = true;
          target.classList.add("is-settled");
          moveTarget(snapRect.x, snapRect.y);
          this.playIntroClickSound(card);
          window.setTimeout(() => {
            void this.applyAction({ type: "goToCard", cardId: dragTarget.targetCardId, transition: dragTarget.transition });
          }, 180);
          return;
        }

        moveTarget(startRect.x, startRect.y);
        if (target.hasPointerCapture(endEvent.pointerId)) {
          target.releasePointerCapture(endEvent.pointerId);
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
      window.addEventListener("pointercancel", handleEnd);
    });

    return target;
  }

  private createTitleBlock(card: Card): HTMLElement | null {
    if (!card.title) {
      return null;
    }

    const copy = document.createElement("section");
    copy.className = `card-copy is-${card.title.align ?? "center"}`;

    const heading = document.createElement("h2");
    heading.className = "card-title";
    if (card.id === RESTART_CARD_ID && this.restartCount > 0) {
      heading.classList.add("is-corrupted");
      heading.textContent = corruptTitleText(card.title.heading, this.restartCount);
    } else {
      heading.textContent = card.title.heading;
    }
    copy.append(heading);

    if (card.title.subheading) {
      const subheading = document.createElement("p");
      subheading.className = "card-subtitle";
      if (card.id === RESTART_CARD_ID && this.restartCount > 0) {
        subheading.classList.add("is-corrupted");
        subheading.textContent = corruptTitleText(card.title.subheading, this.restartCount);
      } else {
        subheading.textContent = card.title.subheading;
      }
      copy.append(subheading);
    }

    return copy;
  }

  private createWindowChrome(card: Card): HTMLElement | null {
    if (card.id === "boot_mac" || card.id === "intro_title") {
      return null;
    }

    const chrome = document.createElement("section");
    chrome.className = "card-window-chrome";

    const titlebar = document.createElement("div");
    titlebar.className = "card-window-titlebar";

    const leftCap = document.createElement("div");
    leftCap.className = "card-window-cap";
    const rightCap = document.createElement("div");
    rightCap.className = "card-window-cap";

    const title = document.createElement("div");
    title.className = "card-window-title";

    titlebar.append(leftCap, title, rightCap);

    const frame = document.createElement("div");
    frame.className = "card-window-frame";

    chrome.append(titlebar, frame);
    return chrome;
  }

  private createInsetCardLabel(card: Card): HTMLElement | null {
    if (card.id === "boot_mac" || card.id === "intro_title") {
      return null;
    }

    const label = document.createElement("div");
    label.className = "card-frame-label";
    label.textContent = `Card: ${card.id}`;
    return label;
  }

  private applyStyleLevel(styleLevel: CardStyleLevel | undefined): void {
    this.stage.dataset.styleLevel = styleLevel ?? "modern";
  }

  private async getBackgroundFolderAssets(relativeDir: string): Promise<string[]> {
    const cached = this.backgroundFolderCache.get(relativeDir);
    if (cached) {
      return cached;
    }

    const assets = (await window.hypercard.listFiles(relativeDir))
      .filter((relativePath) => isSupportedBackgroundAsset(relativePath));
    this.backgroundFolderCache.set(relativeDir, assets);
    return assets;
  }

  private invalidateBackgroundFolderAssets(relativePath: string): void {
    for (const folderPath of this.backgroundFolderCache.keys()) {
      if (relativePath.startsWith(`${folderPath}/`)) {
        this.backgroundFolderCache.delete(folderPath);
      }
    }
  }

  private getDitherStepForRender(card: Card, advanceProgression: boolean): number {
    if (!participatesInDitherProgression(card)) {
      return 0;
    }

    const currentCard = this.currentCardId ? this.cardsById.get(this.currentCardId) ?? null : null;
    const sameCard = currentCard?.id === card.id;
    if (!advanceProgression || sameCard) {
      return this.currentDitherStep;
    }

    if (participatesInDitherProgression(currentCard) && participatesInDitherProgression(card)) {
      return this.currentDitherStep + 1;
    }

    if (!participatesInDitherProgression(currentCard) && participatesInDitherProgression(card)) {
      return 0;
    }

    return this.currentDitherStep;
  }

  private getDitherLevelForRender(card: Card, advanceProgression: boolean): DitherLevel {
    return getDitherLevelForStep(this.getDitherStepForRender(card, advanceProgression));
  }

  private async resolveBackgroundLayer(
    card: Card,
    preserveCurrentSelection: boolean,
    advanceProgression: boolean
  ): Promise<MediaLayer> {
    const currentLevel = this.getDitherLevelForRender(card, advanceProgression);
    let availableLayers: MediaLayer[] = [];

    if (card.backgroundFolder) {
      const candidateFolders = getDitherFolderCandidates(card.backgroundFolder, currentLevel);
      for (const folderPath of candidateFolders) {
        const folderAssets = await this.getBackgroundFolderAssets(folderPath);
        if (folderAssets.length === 0) {
          continue;
        }

        const resolvedLayers: MediaLayer[] = [];
        for (const assetPath of folderAssets) {
          const kind = guessMediaKind(assetPath);
          if (!kind) {
            continue;
          }
          resolvedLayers.push({
            kind,
            src: assetPath,
            position: card.background.position,
            loop: card.background.loop,
            onEndedDirection: card.background.onEndedDirection,
            freezeBeforeEndSeconds: card.background.freezeBeforeEndSeconds
          });
        }

        availableLayers = resolvedLayers;

        if (availableLayers.length > 0) {
          break;
        }
      }
    }

    if (availableLayers.length === 0) {
      availableLayers = [card.background];
    }

    if (
      preserveCurrentSelection
      && this.currentBackgroundSelection?.cardId === card.id
      && this.currentBackgroundSelection.level === currentLevel
    ) {
      const preservedLayer = availableLayers.find((candidate) =>
        areMediaLayersEqual(candidate, this.currentBackgroundSelection!.layer)
      );
      if (preservedLayer) {
        return preservedLayer;
      }
    }

    const selectedLayer = chooseRandomEntry(availableLayers);
    if (!selectedLayer) {
      throw new Error(`Card '${card.id}' has no background for dither level ${currentLevel}`);
    }

    this.currentBackgroundSelection = {
      cardId: card.id,
      level: currentLevel,
      layer: selectedLayer
    };
    return selectedLayer;
  }

  private async buildCardScene(card: Card, backgroundLayer: MediaLayer, renderToken: number): Promise<HTMLElement> {
    const [backgroundElement, overlayElement] = await Promise.all([
      this.createLayerElement(
        backgroundLayer,
        "card-media card-media-background",
        `${card.id} background`,
        { card, renderToken, scheduleFinHold: true }
      ),
      card.overlay
        ? this.createLayerElement(
            card.overlay,
            "card-media card-media-overlay",
            `${card.id} overlay`,
            { card, renderToken }
          )
        : Promise.resolve(null)
    ]);
    this.scheduleOverlayFreeze(backgroundElement, overlayElement, card.overlay, renderToken);
    this.scheduleEndingRestart(backgroundElement, card, renderToken);

    const scene = document.createElement("div");
    scene.className = "card-scene";
    const backgroundSize = getMediaIntrinsicSize(backgroundElement);
    if (backgroundLayer.kind === "video") {
      this.videoFrameSize = backgroundSize;
    }
    const frameSize = this.videoFrameSize;
    scene.dataset.frameWidth = String(frameSize.width);
    scene.dataset.frameHeight = String(frameSize.height);
    this.fitStageToFrame(frameSize);
    this.layoutAttachedSceneFrames();

    const layers = document.createElement("div");
    layers.className = "card-layers";
    layers.append(backgroundElement);
    if (overlayElement) {
      layers.append(overlayElement);
    }

    const controls = document.createElement("div");
    controls.className = "card-controls";
    const windowChrome = this.createWindowChrome(card);
    if (windowChrome) {
      controls.append(windowChrome);
    }
    const insetCardLabel = this.createInsetCardLabel(card);
    if (insetCardLabel) {
      controls.append(insetCardLabel);
    }
    const stageRect = this.stage.getBoundingClientRect();
    const frame = document.createElement("div");
    frame.className = "card-content-frame";
    applyFrameRect(frame, new DOMRect(0, 0, stageRect.width, stageRect.height));

    const dragTargetElements = await Promise.all((card.dragTargets ?? []).map((dragTarget) => this.createDragTarget(card, dragTarget, frame)));

    const titleBlock = this.createTitleBlock(card);
    if (titleBlock) {
      frame.append(titleBlock);
    }
    for (const button of card.buttons ?? []) {
      frame.append(this.createCardButton(button));
    }
    for (const clickTarget of card.clickTargets ?? []) {
      frame.append(this.createClickTarget(card, clickTarget));
    }
    for (const dragTargetElement of dragTargetElements) {
      frame.append(dragTargetElement);
    }
    controls.append(frame);
    for (const arrow of card.arrows ?? []) {
      controls.append(this.createArrowButton(arrow));
    }

    scene.append(layers, controls);
    return scene;
  }

  private fitStageToFrame(size: { width: number; height: number }): void {
    const mediaAspect = size.width / size.height;
    if (!Number.isFinite(mediaAspect) || mediaAspect <= 0) {
      return;
    }

    this.stage.style.setProperty("--card-aspect-ratio", String(mediaAspect));

    const containerSize = this.stage.parentElement
      ? getElementContentSize(this.stage.parentElement)
      : { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) };
    let width = containerSize.width;
    let height = width / mediaAspect;

    if (height > containerSize.height) {
      height = containerSize.height;
      width = height * mediaAspect;
    }

    this.stage.style.width = `${width}px`;
    this.stage.style.height = `${height}px`;
  }

  private layoutSceneFrame(scene: HTMLElement): void {
    const frame = scene.querySelector<HTMLElement>(".card-content-frame");
    if (!frame || !getSceneFrameSize(scene)) {
      return;
    }

    const stageRect = this.stage.getBoundingClientRect();
    applyFrameRect(frame, new DOMRect(0, 0, stageRect.width, stageRect.height));
  }

  private layoutAttachedSceneFrames(): void {
    for (const scene of Array.from(this.stage.querySelectorAll<HTMLElement>(".card-scene"))) {
      this.layoutSceneFrame(scene);
    }
  }

  private layoutCurrentScenes(): void {
    const scenes = Array.from(this.stage.querySelectorAll<HTMLElement>(".card-scene"));
    const activeScene = scenes.at(-1);
    const activeFrameSize = activeScene ? getSceneFrameSize(activeScene) : null;
    if (activeFrameSize) {
      this.fitStageToFrame(activeFrameSize);
    }

    for (const scene of scenes) {
      this.layoutSceneFrame(scene);
    }
  }

  private scheduleOverlayFreeze(
    backgroundElement: HTMLElement,
    overlayElement: HTMLElement | null,
    overlayLayer: MediaLayer | undefined,
    renderToken: number
  ): void {
    if (
      !(backgroundElement instanceof HTMLVideoElement)
      || !(overlayElement instanceof HTMLVideoElement)
      || overlayLayer?.freezeBeforeEndSeconds === undefined
      || !Number.isFinite(backgroundElement.duration)
    ) {
      return;
    }

    const triggerMs = Math.max(0, (backgroundElement.duration - overlayLayer.freezeBeforeEndSeconds) * 1000);
    const timer = window.setTimeout(() => {
      this.videoFreezeTimers.delete(timer);
      if (renderToken !== this.renderToken) {
        return;
      }

      overlayElement.pause();
    }, triggerMs);
    this.videoFreezeTimers.add(timer);
  }

  private scheduleEndingRestart(backgroundElement: HTMLElement, card: Card, renderToken: number): void {
    if (
      !isEndingCard(card)
      || !(backgroundElement instanceof HTMLVideoElement)
      || backgroundElement.loop
    ) {
      return;
    }

    const scheduleRestartOverlay = (): void => {
      if (renderToken !== this.renderToken) {
        return;
      }

      this.clearEndingRestartTimer();
      this.endingRestartTimer = window.setTimeout(() => {
        this.endingRestartTimer = null;
        if (
          renderToken !== this.renderToken
          || this.currentCardId !== card.id
          || this.isTransitioning
        ) {
          return;
        }

        void this.showEndingRestartOverlay(renderToken).catch((error) => {
          console.warn("Ending restart overlay failed", error);
        });
      }, ENDING_RESTART_DELAY_MS);
    };

    if (backgroundElement.ended) {
      scheduleRestartOverlay();
      return;
    }

    backgroundElement.addEventListener("ended", scheduleRestartOverlay, { once: true });
  }

  private async showEndingRestartOverlay(renderToken: number): Promise<void> {
    const assetUrl = await this.getAssetUrl(RESTART_DISK_IMAGE_PATH);
    if (renderToken !== this.renderToken) {
      return;
    }

    const scene = document.createElement("div");
    scene.className = "card-scene ending-restart-scene";
    scene.dataset.frameWidth = String(this.videoFrameSize.width);
    scene.dataset.frameHeight = String(this.videoFrameSize.height);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ending-restart-button";
    button.setAttribute("aria-label", "Restart fish stack");

    const image = document.createElement("img");
    image.className = "ending-restart-disk";
    image.alt = "";
    image.draggable = false;
    image.src = assetUrl;
    await waitForImageLoad(image);
    if (renderToken !== this.renderToken) {
      return;
    }

    button.append(image);
    button.addEventListener("click", () => {
      button.disabled = true;
      this.restartCount += 1;
      this.playIntroClickSound({ id: RESTART_CARD_ID });
      void this.enterCard(RESTART_CARD_ID, undefined, { resetProgression: true });
    });

    scene.append(button);
    this.stage.replaceChildren(scene);
    this.layoutCurrentScenes();
    button.focus();
    this.setStatus("");
    void window.hypercard.musicStop();
    void this.audio.stop();
  }

  private async playCardAudio(card: Card, level: DitherLevel): Promise<void> {
    const stackAudio = this.stack?.audio;
    const audio = resolveAudioSpec(stackAudio, card.audio);
    if (hasFinAudio(audio)) {
      if (shouldAutoplayFinAudio(card, stackAudio)) {
        await window.hypercard.musicStartOrSync(audio.fin, level);
      } else {
        await window.hypercard.musicStop();
      }
    } else {
      await window.hypercard.musicStop();
    }

    if (audio?.ambient) {
      await this.audio.playAmbient(audio.ambient, {
        volume: getAmbientVolumeForLevel(audio, level),
        loop: audio.loop
      });
      return;
    }

    await this.audio.stop();
  }

  private async animateTransition(outgoingScene: HTMLElement, incomingScene: HTMLElement, transition: CardTransitionSpec): Promise<void> {
    const stageRect = this.stage.getBoundingClientRect();
    const localStageRect = new DOMRect(0, 0, Math.max(1, stageRect.width), Math.max(1, stageRect.height));
    const focusRect = rectFromBounds(transition.focusBounds, localStageRect);
    const focusCenterX = focusRect.x + focusRect.width / 2;
    const focusCenterY = focusRect.y + focusRect.height / 2;
    const exitScale = clamp(
      Math.min(
        localStageRect.width / Math.max(focusRect.width, 1),
        localStageRect.height / Math.max(focusRect.height, 1)
      ),
      1,
      6
    );
    const translateX = localStageRect.width / 2 - focusCenterX;
    const translateY = localStageRect.height / 2 - focusCenterY;
    const duration = transition.durationMs ?? 720;
    const entryScale = transition.entryScale ?? 1.04;
    const incomingDelay = Math.round(duration * 0.18);
    const incomingDuration = Math.max(180, duration - incomingDelay);

    outgoingScene.style.transformOrigin = `${focusCenterX}px ${focusCenterY}px`;
    incomingScene.style.transformOrigin = `${focusCenterX}px ${focusCenterY}px`;
    incomingScene.style.opacity = "0";
    incomingScene.style.pointerEvents = "none";

    const exitAnimation = outgoingScene.animate(
      [
        {
          opacity: 1,
          filter: "blur(0px) brightness(1)",
          transform: "translate(0px, 0px) scale(1)"
        },
        {
          opacity: 0,
          filter: "blur(12px) brightness(0.6)",
          transform: `translate(${translateX}px, ${translateY}px) scale(${exitScale})`
        }
      ],
      {
        duration,
        easing: "cubic-bezier(0.2, 0.78, 0.2, 1)",
        fill: "forwards"
      }
    );

    const enterAnimation = incomingScene.animate(
      [
        {
          opacity: 0,
          filter: "blur(12px) brightness(0.58)",
          transform: `scale(${entryScale})`
        },
        {
          opacity: 1,
          filter: "blur(0px) brightness(1)",
          transform: "scale(1)"
        }
      ],
      {
        duration: incomingDuration,
        delay: incomingDelay,
        easing: "cubic-bezier(0.18, 0.8, 0.22, 1)",
        fill: "forwards"
      }
    );

    await Promise.all([
      exitAnimation.finished.catch(() => undefined),
      enterAnimation.finished.catch(() => undefined)
    ]);

    outgoingScene.remove();
    incomingScene.style.removeProperty("opacity");
    incomingScene.style.removeProperty("pointer-events");
    incomingScene.style.removeProperty("transform-origin");
  }

  private async animateDefaultTransition(outgoingScene: HTMLElement, incomingScene: HTMLElement): Promise<void> {
    const duration = 320;

    incomingScene.style.opacity = "0";
    incomingScene.style.pointerEvents = "none";

    const exitAnimation = outgoingScene.animate(
      [
        {
          opacity: 1,
          filter: "blur(0px) brightness(1)",
          transform: "scale(1)"
        },
        {
          opacity: 0,
          filter: "blur(6px) brightness(0.92)",
          transform: "scale(0.985)"
        }
      ],
      {
        duration,
        easing: "ease-out",
        fill: "forwards"
      }
    );

    const enterAnimation = incomingScene.animate(
      [
        {
          opacity: 0,
          filter: "blur(6px) brightness(0.94)",
          transform: "scale(1.015)"
        },
        {
          opacity: 1,
          filter: "blur(0px) brightness(1)",
          transform: "scale(1)"
        }
      ],
      {
        duration,
        easing: "ease-out",
        fill: "forwards"
      }
    );

    await Promise.all([
      exitAnimation.finished.catch(() => undefined),
      enterAnimation.finished.catch(() => undefined)
    ]);

    outgoingScene.remove();
    incomingScene.style.removeProperty("opacity");
    incomingScene.style.removeProperty("pointer-events");
  }

  private async enterCard(
    cardId: string,
    transition?: CardTransitionSpec,
    options: EnterCardOptions = {}
  ): Promise<void> {
    const card = this.cardsById.get(cardId);
    if (!card) {
      this.setStatus(`Unknown card '${cardId}'`);
      return;
    }

    const renderToken = ++this.renderToken;
    const previousCardId = this.currentCardId;
    this.clearSceneTimers();
    if (options.resetProgression) {
      this.currentDitherStep = 0;
      this.currentBackgroundSelection = null;
    }

    try {
      const backgroundLayer = await this.resolveBackgroundLayer(
        card,
        options.preserveBackgroundSelection ?? false,
        options.advanceProgression ?? false
      );
      const scene = await this.buildCardScene(card, backgroundLayer, renderToken);

      if (renderToken !== this.renderToken) {
        return;
      }

      const previousScene = this.stage.querySelector<HTMLElement>(".card-scene");
      const shouldAnimate = Boolean(previousScene && this.currentCardId && this.currentCardId !== card.id);

      if (shouldAnimate && previousScene) {
        this.isTransitioning = true;
        try {
          this.applyStyleLevel(card.styleLevel);
          this.stage.append(scene);
          if (transition) {
            await this.animateTransition(previousScene, scene, transition);
          } else {
            await this.animateDefaultTransition(previousScene, scene);
          }
          this.stage.replaceChildren(scene);
        } finally {
          this.isTransitioning = false;
        }
      } else {
        this.applyStyleLevel(card.styleLevel);
        this.stage.replaceChildren(scene);
      }

      if (options.advanceProgression && previousCardId && previousCardId !== card.id) {
        this.currentDitherStep = this.getDitherStepForRender(card, true);
      }
      if (!participatesInDitherProgression(card)) {
        this.currentDitherStep = 0;
      }
      this.currentCardId = card.id;
      this.setStatus("");
      if (card.buttons && card.buttons.length > 0) {
        scene.querySelector<HTMLButtonElement>(".card-button:not(:disabled)")?.focus();
      }
      const currentLevel = this.currentBackgroundSelection?.level ?? this.getDitherLevelForRender(
        card,
        options.advanceProgression ?? false
      );
      await this.playCardAudio(card, currentLevel).catch((error) => {
        console.warn("Audio load failed", error);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(`Card load failed: ${card.id}\n${message}`);
      console.warn(message);
    }
  }

  private async applyAction(action: Action): Promise<void> {
    if (this.isTransitioning) {
      return;
    }
    await executeAction(action, {
      goToCard: async (nextCardId, transition) => {
        await this.enterCard(nextCardId, transition, { advanceProgression: true });
      }
    });
  }

  private async handleFileChanged(payload: FileChangedPayload): Promise<void> {
    if (payload.kind === "stack") {
      const previousCard = this.currentCardId;
      await this.loadStack(false);
      if (previousCard && this.cardsById.has(previousCard)) {
        await this.enterCard(previousCard, undefined, { preserveBackgroundSelection: true });
      } else if (this.stack?.initialCardId && this.cardsById.has(this.stack.initialCardId)) {
        await this.enterCard(this.stack.initialCardId);
      }
      return;
    }

    this.invalidateAsset(payload.path);
    this.invalidateBackgroundFolderAssets(payload.path);

    const currentCard = this.currentCardId ? this.cardsById.get(this.currentCardId) : null;
    if (!currentCard) {
      return;
    }

    const usesChangedAsset = getReferencedAssetPaths(
      currentCard,
      this.currentBackgroundSelection?.layer,
      resolveAudioSpec(this.stack?.audio, currentCard.audio)
    ).includes(payload.path);
    if (!usesChangedAsset) {
      return;
    }

    await this.enterCard(currentCard.id, undefined, { preserveBackgroundSelection: true });
    this.setStatus(`Card: ${currentCard.id}\nAsset reloaded: ${payload.path}`);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("pointerdown", this.unlockAudio);
    window.removeEventListener("resize", this.handleViewportChange);
    document.removeEventListener("fullscreenchange", this.handleViewportChange);
    this.clearSceneTimers();
    this.unsubscribeFileChanged?.();
    this.unsubscribeFileChanged = null;
    for (const url of this.assetUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.assetUrlCache.clear();
    this.backgroundFolderCache.clear();
    void window.hypercard.musicStop();
    void this.audio.stop();
  }
}
