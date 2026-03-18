import "./styles.css";
import { HypercardEngine } from "./engine";

async function boot(): Promise<void> {
  const stage = document.getElementById("card-stage");
  const status = document.getElementById("status");
  if (!(stage instanceof HTMLElement) || !(status instanceof HTMLElement)) {
    throw new Error("Missing required DOM nodes");
  }

  const engine = new HypercardEngine(stage, status);
  await engine.start();
}

void boot().catch((error) => {
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Boot failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  console.error(error);
});
