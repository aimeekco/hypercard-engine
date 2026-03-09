#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import { ditherRgbaFrame, type DitherOptions, type RgbaFrame } from "../shared/dither.js";

export type BatchDitherCliOptions = DitherOptions & {
  inputDir: string;
  outputDir: string;
  recursive: boolean;
  pixelSize?: number;
  virtualWidth?: number;
  virtualHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
};

const HELP_TEXT = `Dither a folder of PNG files.

Usage:
  npm run dither:png -- --input <folder> --output <folder> [options]

Options:
  --input <folder>            Input folder containing PNG files
  --output <folder>           Output folder for processed PNG files
  --recursive                 Traverse nested folders
  --threshold <number>        Dither threshold (default: 0.5)
  --dither-strength <number>  Error diffusion strength (default: 1.0)
  --pixel-size <number>       Approximate output pixel block size (default: 2)
  --virtual-width <number>    Resize source before dithering
  --virtual-height <number>   Resize source before dithering
  --output-width <number>     Resize dithered output before writing
  --output-height <number>    Resize dithered output before writing
  --help                      Show this message
`;

function parseNumber(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid value for ${flag}: ${value}`);
  }

  return parsed;
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = parseNumber(value, flag);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }

  return parsed;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

export function parseCliArgs(args: string[]): BatchDitherCliOptions {
  const options: Partial<BatchDitherCliOptions> = {
    recursive: false,
    pixelSize: 2
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--input":
        options.inputDir = requireValue(args, i, arg);
        i += 1;
        break;
      case "--output":
        options.outputDir = requireValue(args, i, arg);
        i += 1;
        break;
      case "--recursive":
        options.recursive = true;
        break;
      case "--threshold":
        options.threshold = parseNumber(requireValue(args, i, arg), arg);
        i += 1;
        break;
      case "--dither-strength":
        options.ditherStrength = parseNumber(requireValue(args, i, arg), arg);
        i += 1;
        break;
      case "--pixel-size":
        options.pixelSize = parsePositiveInteger(requireValue(args, i, arg), arg);
        i += 1;
        break;
      case "--virtual-width":
        options.virtualWidth = parsePositiveInteger(requireValue(args, i, arg), arg);
        i += 1;
        break;
      case "--virtual-height":
        options.virtualHeight = parsePositiveInteger(requireValue(args, i, arg), arg);
        i += 1;
        break;
      case "--output-width":
        options.outputWidth = parsePositiveInteger(requireValue(args, i, arg), arg);
        i += 1;
        break;
      case "--output-height":
        options.outputHeight = parsePositiveInteger(requireValue(args, i, arg), arg);
        i += 1;
        break;
      case "--help":
        process.stdout.write(HELP_TEXT);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.inputDir) {
    throw new Error("Missing required --input folder");
  }

  if (!options.outputDir) {
    throw new Error("Missing required --output folder");
  }

  return options as BatchDitherCliOptions;
}

export async function collectPngFiles(rootDir: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        if (!recursive) {
          return [];
        }

        return collectPngFiles(entryPath, true);
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
        return [entryPath];
      }

      return [];
    })
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

function createFrame(width: number, height: number, data: Uint8ClampedArray): RgbaFrame {
  return { width, height, data };
}

function sizeFromPixelSize(outputSize: number, pixelSize: number): number {
  return Math.max(1, Math.round(outputSize / pixelSize));
}

export function resolveTargetSizes(
  sourceWidth: number,
  sourceHeight: number,
  options: BatchDitherCliOptions
): {
  virtualWidth: number;
  virtualHeight: number;
  outputWidth: number;
  outputHeight: number;
} {
  const outputWidth = options.outputWidth ?? sourceWidth;
  const outputHeight = options.outputHeight ?? sourceHeight;
  const pixelSize = options.pixelSize ?? 2;
  const virtualWidth = options.virtualWidth ?? (
    sizeFromPixelSize(outputWidth, pixelSize)
  );
  const virtualHeight = options.virtualHeight ?? (
    sizeFromPixelSize(outputHeight, pixelSize)
  );

  return {
    virtualWidth,
    virtualHeight,
    outputWidth,
    outputHeight
  };
}

function sampleChannelBilinear(frame: RgbaFrame, x: number, y: number, channelOffset: number): number {
  const clampedX = Math.max(0, Math.min(frame.width - 1, x));
  const clampedY = Math.max(0, Math.min(frame.height - 1, y));
  const minX = Math.floor(clampedX);
  const minY = Math.floor(clampedY);
  const maxX = Math.max(0, Math.min(frame.width - 1, minX + 1));
  const maxY = Math.max(0, Math.min(frame.height - 1, minY + 1));
  const xWeight = clampedX - minX;
  const yWeight = clampedY - minY;

  const topLeft = frame.data[(minY * frame.width + minX) * 4 + channelOffset];
  const topRight = frame.data[(minY * frame.width + maxX) * 4 + channelOffset];
  const bottomLeft = frame.data[(maxY * frame.width + minX) * 4 + channelOffset];
  const bottomRight = frame.data[(maxY * frame.width + maxX) * 4 + channelOffset];
  const top = topLeft + (topRight - topLeft) * xWeight;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * xWeight;

  return Math.round(top + (bottom - top) * yWeight);
}

export function resizeRgbaBilinear(frame: RgbaFrame, targetWidth: number, targetHeight: number): Uint8ClampedArray {
  if (targetWidth === frame.width && targetHeight === frame.height) {
    return new Uint8ClampedArray(frame.data);
  }

  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const xScale = frame.width / targetWidth;
  const yScale = frame.height / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = (y + 0.5) * yScale - 0.5;
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x + 0.5) * xScale - 0.5;
      const base = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        output[base + channel] = sampleChannelBilinear(frame, sourceX, sourceY, channel);
      }
    }
  }

  return output;
}

export function resizeRgbaNearest(frame: RgbaFrame, targetWidth: number, targetHeight: number): Uint8ClampedArray {
  if (targetWidth === frame.width && targetHeight === frame.height) {
    return new Uint8ClampedArray(frame.data);
  }

  const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor((y / targetHeight) * frame.height));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor((x / targetWidth) * frame.width));
      const sourceBase = (sourceY * frame.width + sourceX) * 4;
      const targetBase = (y * targetWidth + x) * 4;
      output[targetBase] = frame.data[sourceBase];
      output[targetBase + 1] = frame.data[sourceBase + 1];
      output[targetBase + 2] = frame.data[sourceBase + 2];
      output[targetBase + 3] = frame.data[sourceBase + 3];
    }
  }

  return output;
}

export async function ditherPngFile(inputPath: string, outputPath: string, options: BatchDitherCliOptions): Promise<void> {
  const inputBuffer = await readFile(inputPath);
  const parsedPng = PNG.sync.read(inputBuffer);
  const sourceFrame = createFrame(parsedPng.width, parsedPng.height, new Uint8ClampedArray(parsedPng.data));

  const { virtualWidth, virtualHeight, outputWidth, outputHeight } = resolveTargetSizes(
    sourceFrame.width,
    sourceFrame.height,
    options
  );

  const resizedSource = createFrame(
    virtualWidth,
    virtualHeight,
    resizeRgbaBilinear(sourceFrame, virtualWidth, virtualHeight)
  );
  const dithered = createFrame(
    virtualWidth,
    virtualHeight,
    ditherRgbaFrame(resizedSource, {
      threshold: options.threshold,
      ditherStrength: options.ditherStrength
    })
  );
  const outputFrame = createFrame(
    outputWidth,
    outputHeight,
    resizeRgbaNearest(dithered, outputWidth, outputHeight)
  );

  const encoded = PNG.sync.write({
    width: outputFrame.width,
    height: outputFrame.height,
    data: Buffer.from(outputFrame.data)
  });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, encoded);
}

async function main(): Promise<void> {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    const inputDir = path.resolve(options.inputDir);
    const outputDir = path.resolve(options.outputDir);
    const pngFiles = await collectPngFiles(inputDir, options.recursive);

    if (pngFiles.length === 0) {
      throw new Error(`No PNG files found in ${inputDir}`);
    }

    for (const inputPath of pngFiles) {
      const relativePath = path.relative(inputDir, inputPath);
      const outputPath = path.join(outputDir, relativePath);
      await ditherPngFile(inputPath, outputPath, options);
      process.stdout.write(`Wrote ${outputPath}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${HELP_TEXT}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
