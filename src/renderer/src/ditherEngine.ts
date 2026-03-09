import { ditherRgbaFrame, type DitherOptions } from "@shared/dither.js";

export type { DitherOptions, RgbaFrame } from "@shared/dither.js";

export type PngDitherOptions = DitherOptions & {
  virtualWidth?: number;
  virtualHeight?: number;
  outputWidth?: number;
  outputHeight?: number;
  crossOrigin?: "anonymous" | "use-credentials";
};

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
