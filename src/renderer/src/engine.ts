import { executeAction } from "@shared/actions";
import type {
  Action,
  ArrowDirection,
  ArrowLink,
  ButtonLink,
  Card,
  CardTransitionSpec,
  CardStyleLevel,
  ClickTarget,
  DragTarget,
  FileChangedPayload,
  MediaLayer,
  ScreenBounds,
  StackDefinition
} from "@shared/types";
import { validateStack } from "@shared/validation";
import { AudioEngine } from "./audioEngine";

const ARROW_GLYPHS: Record<ArrowDirection, string> = {
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

function getReferencedAssetPaths(card: Card): string[] {
  const paths = [card.background.src];
  if (card.overlay) {
    paths.push(card.overlay.src);
  }
  for (const dragTarget of card.dragTargets ?? []) {
    paths.push(dragTarget.src);
  }
  if (card.audio?.ambient) {
    paths.push(card.audio.ambient);
  }
  return paths;
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

function getContainedFrameRect(containerRect: DOMRect, mediaWidth: number, mediaHeight: number): DOMRect {
  const mediaAspect = mediaWidth / mediaHeight;
  const containerAspect = containerRect.width / containerRect.height;

  if (mediaAspect > containerAspect) {
    const width = containerRect.width;
    const height = width / mediaAspect;
    return new DOMRect(0, (containerRect.height - height) / 2, width, height);
  }

  const height = containerRect.height;
  const width = height * mediaAspect;
  return new DOMRect((containerRect.width - width) / 2, 0, width, height);
}

function getWindowTitle(card: Card): string {
  if (card.title?.heading) {
    return card.title.heading;
  }
  return card.id
    .split(/[_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  private renderToken = 0;
  private isTransitioning = false;

  constructor(stage: HTMLElement, status: HTMLElement) {
    this.stage = stage;
    this.status = status;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("pointerdown", this.unlockAudio, { once: true });
    window.addEventListener("resize", this.handleResize);
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

  private readonly handleResize = (): void => {
    if (!this.currentCardId) {
      return;
    }
    void this.enterCard(this.currentCardId);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }

    let directions: ArrowDirection[] = [];
    if (event.key === "ArrowLeft") {
      directions = ["left"];
    } else if (event.key === "ArrowRight") {
      directions = ["right"];
    } else if (event.key === "ArrowUp") {
      directions = ["forward", "up"];
    } else if (event.key === "ArrowDown") {
      directions = ["down"];
    } else if (event.key === "w" || event.key === "W") {
      directions = ["forward"];
    }

    if (directions.length === 0) {
      return;
    }

    const card = this.currentCardId ? this.cardsById.get(this.currentCardId) : null;
    const arrow = directions
      .map((direction) => card?.arrows?.find((candidate) => candidate.direction === direction && !candidate.disabled))
      .find((candidate): candidate is ArrowLink => candidate !== undefined);
    if (!arrow) {
      return;
    }

    event.preventDefault();
    void this.applyAction({ type: "goToCard", cardId: arrow.targetCardId, transition: arrow.transition });
  };

  private setStatus(message: string): void {
    this.status.textContent = message;
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

  private async createLayerElement(layer: MediaLayer, className: string, alt: string): Promise<HTMLElement> {
    const assetUrl = await this.getAssetUrl(layer.src);

    if (layer.kind === "image") {
      const image = document.createElement("img");
      image.className = className;
      image.alt = alt;
      image.draggable = false;
      image.src = assetUrl;
      await waitForImageLoad(image);
      return image;
    }

    const video = document.createElement("video");
    video.className = className;
    video.src = assetUrl;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("aria-label", alt);
    await waitForVideoLoad(video);
    void video.play().catch((error) => {
      console.warn("Video playback did not start immediately", error);
    });
    return video;
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
        void this.applyAction({ type: "goToCard", cardId: arrow.targetCardId, transition: arrow.transition });
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

  private createClickTarget(clickTarget: ClickTarget): HTMLButtonElement {
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
        void this.applyAction({ type: "goToCard", cardId: clickTarget.targetCardId, transition: clickTarget.transition });
      });
    }

    return target;
  }

  private async createDragTarget(dragTarget: DragTarget, frameElement: HTMLElement): Promise<HTMLButtonElement> {
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
    heading.textContent = card.title.heading;
    copy.append(heading);

    if (card.title.subheading) {
      const subheading = document.createElement("p");
      subheading.className = "card-subtitle";
      subheading.textContent = card.title.subheading;
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
    title.textContent = getWindowTitle(card);

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

  private async buildCardScene(card: Card): Promise<HTMLElement> {
    const [backgroundElement, overlayElement] = await Promise.all([
      this.createLayerElement(card.background, "card-media card-media-background", `${card.id} background`),
      card.overlay
        ? this.createLayerElement(card.overlay, "card-media card-media-overlay", `${card.id} overlay`)
        : Promise.resolve(null)
    ]);

    const scene = document.createElement("div");
    scene.className = "card-scene";

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
    const backgroundSize = getMediaIntrinsicSize(backgroundElement);
    const stageRect = this.stage.getBoundingClientRect();
    const containedFrameRect = getContainedFrameRect(stageRect, backgroundSize.width, backgroundSize.height);
    const frame = document.createElement("div");
    frame.className = "card-content-frame";
    frame.style.left = `${containedFrameRect.x}px`;
    frame.style.top = `${containedFrameRect.y}px`;
    frame.style.width = `${containedFrameRect.width}px`;
    frame.style.height = `${containedFrameRect.height}px`;

    const dragTargetElements = await Promise.all((card.dragTargets ?? []).map((dragTarget) => this.createDragTarget(dragTarget, frame)));

    const titleBlock = this.createTitleBlock(card);
    if (titleBlock) {
      frame.append(titleBlock);
    }
    for (const button of card.buttons ?? []) {
      frame.append(this.createCardButton(button));
    }
    for (const clickTarget of card.clickTargets ?? []) {
      frame.append(this.createClickTarget(clickTarget));
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

  private async enterCard(cardId: string, transition?: CardTransitionSpec): Promise<void> {
    const card = this.cardsById.get(cardId);
    if (!card) {
      this.setStatus(`Unknown card '${cardId}'`);
      return;
    }

    const renderToken = ++this.renderToken;

    try {
      const scene = await this.buildCardScene(card);

      if (renderToken !== this.renderToken) {
        return;
      }

      const previousScene = this.stage.querySelector<HTMLElement>(".card-scene");
      const shouldAnimate = Boolean(transition && previousScene && this.currentCardId && this.currentCardId !== card.id);

      if (shouldAnimate && previousScene && transition) {
        this.isTransitioning = true;
        try {
          this.applyStyleLevel(card.styleLevel);
          this.stage.append(scene);
          await this.animateTransition(previousScene, scene, transition);
          this.stage.replaceChildren(scene);
        } finally {
          this.isTransitioning = false;
        }
      } else {
        this.applyStyleLevel(card.styleLevel);
        this.stage.replaceChildren(scene);
      }

      this.currentCardId = card.id;
      this.setStatus("");
      if (card.buttons && card.buttons.length > 0) {
        scene.querySelector<HTMLButtonElement>(".card-button:not(:disabled)")?.focus();
      }

      if (card.audio?.ambient) {
        await this.audio.playAmbient(card.audio.ambient, {
          volume: card.audio.volume,
          loop: card.audio.loop
        }).catch((error) => {
          console.warn("Audio load failed", error);
        });
      } else {
        await this.audio.stop();
      }
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
        await this.enterCard(nextCardId, transition);
      }
    });
  }

  private async handleFileChanged(payload: FileChangedPayload): Promise<void> {
    if (payload.kind === "stack") {
      const previousCard = this.currentCardId;
      await this.loadStack(false);
      if (previousCard && this.cardsById.has(previousCard)) {
        await this.enterCard(previousCard);
      } else if (this.stack?.initialCardId && this.cardsById.has(this.stack.initialCardId)) {
        await this.enterCard(this.stack.initialCardId);
      }
      return;
    }

    this.invalidateAsset(payload.path);

    const currentCard = this.currentCardId ? this.cardsById.get(this.currentCardId) : null;
    if (!currentCard) {
      return;
    }

    const usesChangedAsset = getReferencedAssetPaths(currentCard).includes(payload.path);
    if (!usesChangedAsset) {
      return;
    }

    await this.enterCard(currentCard.id);
    this.setStatus(`Card: ${currentCard.id}\nAsset reloaded: ${payload.path}`);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("pointerdown", this.unlockAudio);
    window.removeEventListener("resize", this.handleResize);
    this.unsubscribeFileChanged?.();
    this.unsubscribeFileChanged = null;
    for (const url of this.assetUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.assetUrlCache.clear();
    void this.audio.stop();
  }
}
