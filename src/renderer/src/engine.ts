import { executeAction } from "@shared/actions";
import type {
  Action,
  ArrowDirection,
  ArrowLink,
  Card,
  FileChangedPayload,
  MediaLayer,
  StackDefinition
} from "@shared/types";
import { validateStack } from "@shared/validation";
import { AudioEngine } from "./audioEngine";

const ARROW_GLYPHS: Record<ArrowDirection, string> = {
  left: "<",
  right: ">",
  up: "^",
  down: "v"
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
  if (card.audio?.ambient) {
    paths.push(card.audio.ambient);
  }
  return paths;
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

  constructor(stage: HTMLElement, status: HTMLElement) {
    this.stage = stage;
    this.status = status;

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("pointerdown", this.unlockAudio, { once: true });
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

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }

    let direction: ArrowDirection | null = null;
    if (event.key === "ArrowLeft") {
      direction = "left";
    } else if (event.key === "ArrowRight") {
      direction = "right";
    } else if (event.key === "ArrowUp") {
      direction = "up";
    } else if (event.key === "ArrowDown") {
      direction = "down";
    }

    if (!direction) {
      return;
    }

    const card = this.currentCardId ? this.cardsById.get(this.currentCardId) : null;
    const arrow = card?.arrows?.find((candidate) => candidate.direction === direction && !candidate.disabled);
    if (!arrow) {
      return;
    }

    event.preventDefault();
    void this.applyAction({ type: "goToCard", cardId: arrow.targetCardId });
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
      this.setStatus(`Card: ${this.currentCardId ?? stack.initialCardId}`);
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
    button.textContent = ARROW_GLYPHS[arrow.direction];
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
        void this.applyAction({ type: "goToCard", cardId: arrow.targetCardId });
      });
    }
    return button;
  }

  private async enterCard(cardId: string): Promise<void> {
    const card = this.cardsById.get(cardId);
    if (!card) {
      this.setStatus(`Unknown card '${cardId}'`);
      return;
    }

    const renderToken = ++this.renderToken;

    try {
      const [backgroundElement, overlayElement] = await Promise.all([
        this.createLayerElement(card.background, "card-media card-media-background", `${card.id} background`),
        card.overlay
          ? this.createLayerElement(card.overlay, "card-media card-media-overlay", `${card.id} overlay`)
          : Promise.resolve(null)
      ]);

      if (renderToken !== this.renderToken) {
        return;
      }

      const layers = document.createElement("div");
      layers.className = "card-layers";
      layers.append(backgroundElement);
      if (overlayElement) {
        layers.append(overlayElement);
      }

      const controls = document.createElement("div");
      controls.className = "card-controls";
      for (const arrow of card.arrows ?? []) {
        controls.append(this.createArrowButton(arrow));
      }

      this.stage.replaceChildren(layers, controls);
      this.currentCardId = card.id;
      this.setStatus(`Card: ${card.id}`);

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
    await executeAction(action, {
      goToCard: async (nextCardId) => {
        await this.enterCard(nextCardId);
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
    this.unsubscribeFileChanged?.();
    this.unsubscribeFileChanged = null;
    for (const url of this.assetUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.assetUrlCache.clear();
    void this.audio.stop();
  }
}
