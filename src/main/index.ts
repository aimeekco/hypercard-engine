import { app, BrowserWindow, ipcMain } from "electron";
import chokidar, { type FSWatcher } from "chokidar";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { IPC_CHANNELS } from "@shared/ipc";
import type { DitherLevel, FileChangedPayload, FinAudioSpec } from "@shared/types";
import { FinMusicController } from "./finMusic";

let mainWindow: BrowserWindow | null = null;
const watchers: FSWatcher[] = [];
let musicController: FinMusicController | null = null;

function getProjectRoot(): string {
  if (process.env.HYPERCARD_ROOT) {
    return path.resolve(process.env.HYPERCARD_ROOT);
  }
  return app.getAppPath();
}

function ensurePathInRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(normalizedRoot) && resolved !== root) {
    throw new Error(`Path escapes project root: ${relativePath}`);
  }
  return resolved;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as unknown;
}

function createWindow(): void {
  const preloadPath = [
    path.join(__dirname, "../preload/index.cjs"),
    path.join(__dirname, "../preload/index.mjs"),
    path.join(__dirname, "../preload/index.js")
  ]
    .find((candidate) => existsSync(candidate));
  if (!preloadPath) {
    throw new Error("Unable to locate preload bundle (expected ../preload/index.cjs, index.mjs, or index.js)");
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function setupIpcHandlers(root: string): void {
  ipcMain.handle(IPC_CHANNELS.readStack, async () => {
    const stackPath = ensurePathInRoot(root, "stack.json");
    return readJsonFile(stackPath);
  });

  ipcMain.handle(IPC_CHANNELS.readBinary, async (_event, relativePath: string) => {
    const abs = ensurePathInRoot(root, relativePath);
    return fs.readFile(abs);
  });

  ipcMain.handle(IPC_CHANNELS.listFiles, async (_event, relativeDir: string) => {
    const abs = ensurePathInRoot(root, relativeDir);
    try {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      const normalizedDir = relativeDir.split(path.sep).join(path.posix.sep);
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.posix.join(normalizedDir, entry.name))
        .sort((left, right) => left.localeCompare(right));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.musicStartOrSync, async (_event, spec: FinAudioSpec, level: DitherLevel) => {
    if (!musicController) {
      musicController = new FinMusicController(root);
    }
    await musicController.startOrSync(spec, level);
  });

  ipcMain.handle(IPC_CHANNELS.musicStop, async () => {
    await musicController?.stop();
  });
}

function broadcastFileChanged(payload: FileChangedPayload): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(IPC_CHANNELS.onFileChanged, payload);
}

function setupWatchers(root: string): void {
  const watchTargets: Array<{ pattern: string; kind: FileChangedPayload["kind"] }> = [
    { pattern: path.join(root, "stack.json"), kind: "stack" },
    { pattern: path.join(root, "assets/**/*"), kind: "asset" }
  ];

  for (const { pattern, kind } of watchTargets) {
    const watcher = chokidar.watch(pattern, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50
      }
    });

    watcher.on("all", (eventName, changedPath) => {
      if (eventName !== "add" && eventName !== "change" && eventName !== "unlink") {
        return;
      }

      const relative = path.relative(root, changedPath).split(path.sep).join(path.posix.sep);
      broadcastFileChanged({
        kind,
        path: relative,
        eventName
      });
    });

    watchers.push(watcher);
  }
}

app.whenReady().then(() => {
  const root = getProjectRoot();
  createWindow();
  setupIpcHandlers(root);
  setupWatchers(root);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await musicController?.stop();
  await Promise.all(watchers.map((watcher) => watcher.close()));
});
