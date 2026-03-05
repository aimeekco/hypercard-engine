export type DitherOptions = {
  threshold?: number;
  ditherStrength?: number;
};

export type RgbaFrame = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type PngDitherOptions = DitherOptions & {
  virtualWidth?: number;
  virtualHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  crossOrigin?: "anonymous" | "use-credentials";
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lumaFromRgba(data: Uint8ClampedArray, pixelIndex: number): number {
  const base = pixelIndex * 4;
  return (data[base] * 0.299 + data[base + 1] * 0.587 + data[base + 2] * 0.114) / 255;
}

function addError(buffer: Float32Array, width: number, height: number, x: number, y: number, error: number): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  buffer[y * width + x] += error;
}

export function ditherRgbaFrame(frame: RgbaFrame, options: DitherOptions = {}): Uint8ClampedArray {
  const { width, height, data } = frame;
  if (data.length !== width * height * 4) {
    throw new Error(`RGBA frame length mismatch: expected ${width * height * 4}, got ${data.length}`);
  }

  const threshold = clamp01(options.threshold ?? 0.5);
  const ditherStrength = Math.max(0, options.ditherStrength ?? 1.0);
  const lumaBuffer = new Float32Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    lumaBuffer[i] = lumaFromRgba(data, i);
  }

  const bwBuffer = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = clamp01(lumaBuffer[index]);
      const bw = value >= threshold ? 1 : 0;
      bwBuffer[index] = bw;

      const error = ((value - bw) * ditherStrength) / 8;
      addError(lumaBuffer, width, height, x + 1, y, error);
      addError(lumaBuffer, width, height, x + 2, y, error);
      addError(lumaBuffer, width, height, x - 1, y + 1, error);
      addError(lumaBuffer, width, height, x, y + 1, error);
      addError(lumaBuffer, width, height, x + 1, y + 1, error);
      addError(lumaBuffer, width, height, x, y + 2, error);
    }
  }

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < width * height; i += 1) {
    const base = i * 4;
    const channel = bwBuffer[i] === 1 ? 255 : 0;
    output[base] = channel;
    output[base + 1] = channel;
    output[base + 2] = channel;
    output[base + 3] = data[base + 3];
  }
  return output;
}

export function ditherImageData(imageData: ImageData, options: DitherOptions = {}): ImageData {
  const ditheredData = ditherRgbaFrame(
    {
      width: imageData.width,
      height: imageData.height,
      data: imageData.data
    },
    options
  );
  const arrayBufferBackedCopy = new Uint8ClampedArray(ditheredData.length);
  arrayBufferBackedCopy.set(ditheredData);
  return new ImageData(arrayBufferBackedCopy, imageData.width, imageData.height);
}

async function loadImageElement(source: string, crossOrigin?: "anonymous" | "use-credentials"): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) {
      image.crossOrigin = crossOrigin;
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load PNG: ${source}`));
    image.src = source;
  });
}

export async function renderDitheredPngToCanvas(
  source: string | HTMLImageElement,
  canvas: HTMLCanvasElement,
  options: PngDitherOptions = {}
): Promise<void> {
  const image = typeof source === "string" ? await loadImageElement(source, options.crossOrigin) : source;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("PNG source has invalid dimensions");
  }

  const virtualWidth = options.virtualWidth ?? sourceWidth;
  const virtualHeight = options.virtualHeight ?? sourceHeight;
  const outputWidth = options.outputWidth ?? virtualWidth;
  const outputHeight = options.outputHeight ?? virtualHeight;

  const workCanvas = document.createElement("canvas");
  workCanvas.width = virtualWidth;
  workCanvas.height = virtualHeight;
  const workCtx = workCanvas.getContext("2d");
  if (!workCtx) {
    throw new Error("2D context unavailable for working canvas");
  }

  workCtx.imageSmoothingEnabled = true;
  workCtx.clearRect(0, 0, virtualWidth, virtualHeight);
  workCtx.drawImage(image, 0, 0, virtualWidth, virtualHeight);

  const sourceImageData = workCtx.getImageData(0, 0, virtualWidth, virtualHeight);
  const dithered = ditherImageData(sourceImageData, options);
  workCtx.putImageData(dithered, 0, 0);

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const outputCtx = canvas.getContext("2d");
  if (!outputCtx) {
    throw new Error("2D context unavailable for output canvas");
  }

  outputCtx.imageSmoothingEnabled = false;
  outputCtx.clearRect(0, 0, outputWidth, outputHeight);
  outputCtx.drawImage(workCanvas, 0, 0, outputWidth, outputHeight);
}
