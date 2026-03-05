import "./styles.css";
import { HypercardEngine } from "./engine";

async function boot(): Promise<void> {
  const canvas = document.getElementById("app-canvas");
  const overlay = document.getElementById("overlay");
  if (!(canvas instanceof HTMLCanvasElement) || !(overlay instanceof HTMLElement)) {
    throw new Error("Missing required DOM nodes");
  }

  const engine = new HypercardEngine(canvas, overlay);
  await engine.start();
}

void boot().catch((error) => {
  const overlay = document.getElementById("overlay");
  if (overlay) {
    overlay.textContent = `Boot failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  console.error(error);
});
