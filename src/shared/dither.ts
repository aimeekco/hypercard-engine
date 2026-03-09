export type DitherOptions = {
  threshold?: number;
  ditherStrength?: number;
};

export type RgbaFrame = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
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
