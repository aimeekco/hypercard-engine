import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { getMutedLayersForLevel } from "../shared/audio";
import type { DitherLevel, FinAudioSpec } from "../shared/types";

type MetlSegment = {
  type: "text";
  lines: string[];
} | {
  type: "layer";
  layerName: string;
  lines: string[];
};

type FinSession = {
  sourcePath: string;
  runtimePath: string;
  child: ChildProcess | null;
  sourceWatcher: FSWatcher;
  spec: FinAudioSpec;
  level: DitherLevel;
  mutedLayersKey: string;
};

const RUNTIME_DIR = ".hypercard-runtime/music";
const LAYER_HEADER_PATTERN = /^\[([^\]]+)\](?:\s|$)/;
const SUPERDIRT_ALREADY_RUNNING_TEXT = "SuperDirt is already running";

function isTopLevelLayerHeader(line: string): boolean {
  return !line.startsWith(" ") && !line.startsWith("\t") && LAYER_HEADER_PATTERN.test(line);
}

export function splitMetlSegments(source: string): MetlSegment[] {
  const segments: MetlSegment[] = [];
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    if (isTopLevelLayerHeader(line)) {
      const layerName = line.match(LAYER_HEADER_PATTERN)?.[1];
      if (!layerName) {
        continue;
      }
      segments.push({
        type: "layer",
        layerName,
        lines: [line]
      });
      continue;
    }

    const currentSegment = segments[segments.length - 1];
    if (currentSegment) {
      currentSegment.lines.push(line);
      continue;
    }

    segments.push({
      type: "text",
      lines: [line]
    });
  }

  return segments;
}

export function renderMutedMetlSource(source: string, mutedLayers: readonly string[]): string {
  const mutedLayerSet = new Set(mutedLayers);
  const rendered = splitMetlSegments(source)
    .filter((segment) => segment.type !== "layer" || !mutedLayerSet.has(segment.layerName))
    .flatMap((segment) => segment.lines)
    .join("\n");

  return source.endsWith("\n") ? `${rendered}\n` : rendered;
}

function buildRuntimePath(root: string, sourcePath: string): string {
  const extension = path.extname(sourcePath) || ".metl";
  const basename = path.basename(sourcePath, extension);
  const hash = createHash("sha1").update(sourcePath).digest("hex").slice(0, 8);
  return path.join(root, RUNTIME_DIR, `${basename}.${hash}.live${extension}`);
}

function resolveSourcePath(root: string, source: string): string {
  return path.isAbsolute(source) ? source : path.resolve(root, source);
}

function mutedLayersKeyFor(layers: readonly string[]): string {
  return [...layers].sort((left, right) => left.localeCompare(right)).join("\u0000");
}

async function writeFileAtomically(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.tmp`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, contents, "utf-8");
  await fs.rename(tempPath, filePath);
}

export class FinMusicController {
  private readonly root: string;
  private readonly finBin: string;
  private session: FinSession | null = null;
  private superdirtReady = false;

  constructor(root: string, finBin = process.env.HYPERCARD_FIN_BIN || "fin") {
    this.root = root;
    this.finBin = finBin;
  }

  async startOrSync(spec: FinAudioSpec, level: DitherLevel): Promise<void> {
    const sourcePath = resolveSourcePath(this.root, spec.source);
    const runtimePath = buildRuntimePath(this.root, sourcePath);
    const mutedLayers = getMutedLayersForLevel(spec, level);
    const mutedLayersKey = mutedLayersKeyFor(mutedLayers);

    if (!this.session || this.session.sourcePath !== sourcePath) {
      await this.stop();
      const sourceWatcher = this.createSourceWatcher(sourcePath);
      this.session = {
        sourcePath,
        runtimePath,
        child: null,
        sourceWatcher,
        spec,
        level,
        mutedLayersKey
      };
      await this.syncSessionFile(this.session);
      await this.ensureSuperdirtStarted();
      this.session.child = await this.spawnWatchProcess(runtimePath);
      return;
    }

    this.session.spec = spec;
    this.session.level = level;
    if (this.session.mutedLayersKey !== mutedLayersKey) {
      this.session.mutedLayersKey = mutedLayersKey;
      await this.syncSessionFile(this.session);
    }

    if (!this.session.child || this.session.child.exitCode !== null || this.session.child.killed) {
      await this.ensureSuperdirtStarted();
      this.session.child = await this.spawnWatchProcess(runtimePath);
    }
  }

  async stop(): Promise<void> {
    const session = this.session;
    this.session = null;
    if (!session) {
      return;
    }

    await session.sourceWatcher.close();
    if (session.child && session.child.exitCode === null && !session.child.killed) {
      session.child.kill();
    }
  }

  async shutdown(): Promise<void> {
    await this.stop();

    if (!this.superdirtReady) {
      return;
    }

    const result = await this.runFinCommand(["superdirt", "kill"]);
    if (result.exitCode === 0) {
      this.superdirtReady = false;
      if (result.combinedOutput) {
        console.log(`[fin] ${result.combinedOutput}`);
      }
      return;
    }

    throw new Error(
      result.combinedOutput
        ? `failed to stop SuperDirt: ${result.combinedOutput}`
        : `failed to stop SuperDirt via '${this.finBin} superdirt kill'`
    );
  }

  private createSourceWatcher(sourcePath: string): FSWatcher {
    const watcher = chokidar.watch(sourcePath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 150,
        pollInterval: 50
      }
    });

    watcher.on("all", (eventName) => {
      if (eventName !== "add" && eventName !== "change") {
        return;
      }
      const session = this.session;
      if (!session || session.sourcePath !== sourcePath) {
        return;
      }
      void this.syncSessionFile(session).catch((error) => {
        console.warn(`fin source reload failed for ${sourcePath}:`, error);
      });
    });

    return watcher;
  }

  private async syncSessionFile(session: FinSession): Promise<void> {
    const source = await fs.readFile(session.sourcePath, "utf-8");
    const mutedLayers = getMutedLayersForLevel(session.spec, session.level);
    session.mutedLayersKey = mutedLayersKeyFor(mutedLayers);
    const rendered = renderMutedMetlSource(source, mutedLayers);
    await writeFileAtomically(session.runtimePath, rendered);
  }

  private async spawnWatchProcess(runtimePath: string): Promise<ChildProcess> {
    return await new Promise<ChildProcess>((resolve, reject) => {
      const child = spawn(this.finBin, ["watch", runtimePath], {
        cwd: this.root,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let settled = false;
      child.once("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      });
      child.once("spawn", () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(child);
      });
      child.once("exit", (code, signal) => {
        if (!settled) {
          settled = true;
          reject(new Error(`fin watch exited before startup (code=${code ?? "null"} signal=${signal ?? "null"})`));
        }
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        const output = chunk.toString().trim();
        if (output) {
          console.log(`[fin] ${output}`);
        }
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        const output = chunk.toString().trim();
        if (output) {
          console.warn(`[fin] ${output}`);
        }
      });
    });
  }

  private async ensureSuperdirtStarted(): Promise<void> {
    if (this.superdirtReady) {
      return;
    }

    const result = await this.runFinCommand(["superdirt"]);
    if (result.exitCode === 0 || result.combinedOutput.includes(SUPERDIRT_ALREADY_RUNNING_TEXT)) {
      this.superdirtReady = true;
      if (result.combinedOutput && !result.combinedOutput.includes(SUPERDIRT_ALREADY_RUNNING_TEXT)) {
        console.log(`[fin] ${result.combinedOutput}`);
      }
      return;
    }

    throw new Error(
      result.combinedOutput
        ? `failed to start SuperDirt: ${result.combinedOutput}`
        : `failed to start SuperDirt via '${this.finBin} superdirt'`
    );
  }

  private async runFinCommand(args: string[]): Promise<{ exitCode: number | null; combinedOutput: string }> {
    return await new Promise((resolve, reject) => {
      const child = spawn(this.finBin, args, {
        cwd: this.root,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.once("error", (error) => {
        reject(error);
      });
      child.once("exit", (code) => {
        const combinedOutput = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        resolve({
          exitCode: code,
          combinedOutput
        });
      });
    });
  }
}
