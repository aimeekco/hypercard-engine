import { gsap } from "gsap";
import {
  AmbientLight,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Clock,
  DirectionalLight,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer
} from "three";
import type { Intersection } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { executeAction } from "@shared/actions";
import type { Action, Card, Hotspot, StackDefinition } from "@shared/types";
import { validateStack } from "@shared/validation";
import { AudioEngine } from "./audioEngine";
import { AtkinsonDitherPass } from "./ditherPass";
import { resolveHotspotFromIntersections } from "./hotspots";

const DEBUG_MODE_STORAGE_KEY = "hypercard:debug-render";

function readInitialDebugMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  const query = params.get("debug");
  if (query === "1" || query === "true" || query === "on") {
    return true;
  }
  if (query === "0" || query === "false" || query === "off") {
    return false;
  }
  const stored = window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY);
  if (stored === "1") {
    return true;
  }
  if (stored === "0") {
    return false;
  }
  // Temporary default while debugging black-screen issues.
  return true;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function disposeObject3D(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as {
      geometry?: { dispose: () => void };
      material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
    };

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose?.());
    } else {
      mesh.material?.dispose?.();
    }
  });
}

export class HypercardEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly ditherPass: AtkinsonDitherPass;
  private readonly loader = new GLTFLoader();
  private readonly clock = new Clock();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly audio = new AudioEngine();

  private stack: StackDefinition | null = null;
  private cardsById = new Map<string, Card>();
  private currentCardId: string | null = null;
  private currentModel: Object3D | null = null;
  private currentMixer: AnimationMixer | null = null;
  private animationActions = new Map<string, AnimationAction>();
  private activeAction: AnimationAction | null = null;
  private hotspotsByNodeName = new Map<string, Hotspot>();
  private unsubscribeFileChanged: (() => void) | null = null;
  private currentModelSphere: Sphere | null = null;
  private overlayMessage = "";
  private debugMode = readInitialDebugMode();

  private renderHandle = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.canvas = canvas;
    this.overlay = overlay;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(46, 1, 0.1, 100);

    const ambient = new AmbientLight(0xffffff, 0.7);
    const directional = new DirectionalLight(0xffffff, 0.95);
    directional.position.set(3, 4, 2);
    this.scene.add(ambient, directional);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.ditherPass = new AtkinsonDitherPass({
      virtualWidth: 640,
      virtualHeight: 480,
      threshold: 0.5,
      ditherStrength: 1.0
    });
    this.composer.addPass(this.ditherPass.pass);
    this.ditherPass.pass.enabled = !this.debugMode;

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.handleKeyDown);
    this.canvas.addEventListener("click", this.handleClick);
    this.canvas.addEventListener("pointerdown", this.unlockAudio, { once: true });
  }

  async start(): Promise<void> {
    await this.loadStack(true);
    const initialId = this.stack?.initialCardId;
    if (!initialId) {
      throw new Error("No initial card available");
    }
    await this.enterCard(initialId, false);
    this.render();

    this.unsubscribeFileChanged = window.hypercard.onFileChanged((payload) => {
      void this.handleFileChanged(payload.kind, payload.path);
    });
  }

  private readonly unlockAudio = (): void => {
    void this.audio.unlock();
  };

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.ditherPass.setRenderSize(width, height);
  };

  private setOverlay(message: string): void {
    this.overlayMessage = message;
    const debugLine = this.debugMode
      ? "\nDEBUG: dither OFF (press D to toggle, F to frame)"
      : "\nPress D to toggle debug render";
    this.overlay.textContent = `${message}${debugLine}`;
  }

  private setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.ditherPass.pass.enabled = !enabled;
    window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, enabled ? "1" : "0");
    if (enabled) {
      this.frameCurrentModel();
    }
    this.setOverlay(this.overlayMessage || `Card: ${this.currentCardId ?? "none"}`);
  }

  private frameCurrentModel(): void {
    if (!this.currentModelSphere) {
      return;
    }
    const sphere = this.currentModelSphere;
    const distance = Math.max(sphere.radius * 2.25, 4);
    this.camera.position.set(
      sphere.center.x,
      sphere.center.y + sphere.radius * 0.25,
      sphere.center.z + distance
    );
    this.camera.lookAt(sphere.center);
    this.camera.updateProjectionMatrix();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "d") {
      this.setDebugMode(!this.debugMode);
    }
    if (key === "f") {
      this.frameCurrentModel();
      this.setOverlay(this.overlayMessage || `Card: ${this.currentCardId ?? "none"}`);
    }
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
      this.setOverlay(`Card: ${this.currentCardId ?? stack.initialCardId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isInitial || !this.stack) {
        throw error;
      }
      this.setOverlay(`Stack reload failed. Keeping last good config.\n${message}`);
      console.warn(message);
    }
  }

  private async readGlb(relativePath: string): Promise<{ scene: Object3D; animations: AnimationClip[] }> {
    const bytes = await window.hypercard.readBinary(relativePath);
    const arrayBuffer = toArrayBuffer(bytes);

    return await new Promise((resolve, reject) => {
      this.loader.parse(
        arrayBuffer,
        "",
        (gltf) => {
          resolve({ scene: gltf.scene, animations: gltf.animations });
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  private async enterCard(cardId: string, tweenCamera: boolean): Promise<void> {
    const card = this.cardsById.get(cardId);
    if (!card) {
      this.setOverlay(`Unknown card '${cardId}'`);
      return;
    }

    const { scene: nextScene, animations } = await this.readGlb(card.modelPath);

    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      disposeObject3D(this.currentModel);
    }

    this.currentModel = nextScene;
    this.scene.add(nextScene);

    this.currentMixer = animations.length > 0 ? new AnimationMixer(nextScene) : null;
    this.animationActions.clear();
    this.activeAction = null;

    if (this.currentMixer) {
      for (const clip of animations) {
        this.animationActions.set(clip.name, this.currentMixer.clipAction(clip));
      }
      if (this.animationActions.has("idle_swim")) {
        this.playAnimation("idle_swim", 0);
      } else if (animations.length > 0) {
        this.playAnimation(animations[0].name, 0);
      }
    }

    this.hotspotsByNodeName = new Map(card.hotspots.map((hotspot) => [hotspot.nodeName, hotspot]));

    const [px, py, pz] = card.camera.position;
    const [tx, ty, tz] = card.camera.target;
    const desiredPosition = new Vector3(px, py, pz);
    let lookTarget = new Vector3(tx, ty, tz);

    // Keep the camera outside model bounds if stack camera data is too close/inside.
    const bounds = new Box3().setFromObject(nextScene);
    if (!bounds.isEmpty() && Number.isFinite(bounds.min.x) && Number.isFinite(bounds.max.x)) {
      const sphere = bounds.getBoundingSphere(new Sphere());
      this.currentModelSphere = sphere.clone();
      const minDistance = Math.max(sphere.radius * 1.8, 3);
      const isInside = bounds.containsPoint(desiredPosition);
      const distanceToTarget = desiredPosition.distanceTo(lookTarget);
      if (isInside || distanceToTarget < minDistance) {
        const direction = desiredPosition.clone().sub(lookTarget);
        if (direction.lengthSq() < 1e-6) {
          direction.set(0, 0, 1);
        }
        desiredPosition.copy(lookTarget).add(direction.normalize().multiplyScalar(minDistance));
      }
      this.camera.near = Math.max(0.05, sphere.radius / 200);
      this.camera.far = Math.max(200, sphere.radius * 30);
      if (this.debugMode) {
        lookTarget = sphere.center.clone();
        desiredPosition.set(
          sphere.center.x,
          sphere.center.y + sphere.radius * 0.25,
          sphere.center.z + Math.max(sphere.radius * 2.25, 4)
        );
      }
    } else {
      this.currentModelSphere = null;
    }

    const moveDuration = tweenCamera ? 0.45 : 0;
    gsap.to(this.camera.position, {
      x: desiredPosition.x,
      y: desiredPosition.y,
      z: desiredPosition.z,
      duration: moveDuration,
      ease: "power2.out"
    });

    const tempLookAt = new Vector3();
    if (!tweenCamera) {
      this.camera.lookAt(lookTarget);
    } else {
      gsap.to(tempLookAt, {
        x: lookTarget.x,
        y: lookTarget.y,
        z: lookTarget.z,
        duration: moveDuration,
        ease: "power2.out",
        onUpdate: () => this.camera.lookAt(tempLookAt)
      });
    }

    this.camera.fov = card.camera.fov;
    this.camera.updateProjectionMatrix();

    this.currentCardId = card.id;
    this.setOverlay(`Card: ${card.id}`);

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
  }

  private playAnimation(clip: string, fadeMs = 250): void {
    const action = this.animationActions.get(clip);
    if (!action) {
      console.warn(`Animation '${clip}' not found; keeping current clip`);
      return;
    }

    action.enabled = true;
    action.reset();
    action.play();

    const fadeSeconds = Math.max(0, fadeMs) / 1000;
    if (this.activeAction && this.activeAction !== action) {
      this.activeAction.crossFadeTo(action, fadeSeconds, true);
    }
    this.activeAction = action;
  }

  private async applyAction(action: Action): Promise<void> {
    await executeAction(action, {
      goToCard: async (nextCardId) => {
        await this.enterCard(nextCardId, true);
      },
      setAnimation: async (clip, fadeMs) => {
        this.playAnimation(clip, fadeMs);
      }
    });
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.currentModel) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.currentModel.children, true) as Array<Intersection<Object3D>>;
    const hotspot = resolveHotspotFromIntersections(intersections, this.hotspotsByNodeName);
    if (!hotspot) {
      return;
    }
    void this.applyAction(hotspot.onClick);
  };

  private async handleFileChanged(kind: "stack" | "models" | "audio", changedPath: string): Promise<void> {
    if (kind === "stack") {
      const previousCard = this.currentCardId;
      await this.loadStack(false);
      if (previousCard && this.cardsById.has(previousCard)) {
        await this.enterCard(previousCard, false);
      } else if (this.stack?.initialCardId && this.cardsById.has(this.stack.initialCardId)) {
        await this.enterCard(this.stack.initialCardId, false);
      }
      return;
    }

    const currentCard = this.currentCardId ? this.cardsById.get(this.currentCardId) : null;
    if (!currentCard) {
      return;
    }

    if (kind === "models" && currentCard.modelPath === changedPath) {
      await this.enterCard(currentCard.id, false);
      this.setOverlay(`Card: ${currentCard.id}\nModel reloaded: ${changedPath}`);
      return;
    }

    if (kind === "audio" && currentCard.audio?.ambient === changedPath) {
      await this.audio.playAmbient(currentCard.audio.ambient, {
        volume: currentCard.audio.volume,
        loop: currentCard.audio.loop
      });
      this.setOverlay(`Card: ${currentCard.id}\nAudio reloaded: ${changedPath}`);
    }
  }

  private readonly render = (): void => {
    if (this.disposed) {
      return;
    }

    const delta = this.clock.getDelta();
    this.currentMixer?.update(delta);
    if (this.debugMode) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }
    this.renderHandle = window.requestAnimationFrame(this.render);
  };

  dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.renderHandle);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.canvas.removeEventListener("click", this.handleClick);
    this.canvas.removeEventListener("pointerdown", this.unlockAudio);
    this.unsubscribeFileChanged?.();
    this.unsubscribeFileChanged = null;
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      disposeObject3D(this.currentModel);
    }
    void this.audio.stop();
    this.renderer.dispose();
  }
}
