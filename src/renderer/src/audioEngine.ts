type AmbientOptions = {
  volume?: number;
  loop?: boolean;
};

type OneShotOptions = {
  volume?: number;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private inputNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentPath: string | null = null;
  private readonly bufferCache = new Map<string, AudioBuffer>();

  private async ensureGraph(): Promise<void> {
    if (this.context && this.inputNode && this.gainNode) {
      return;
    }

    const context = new AudioContext();
    this.context = context;
    const gain = context.createGain();
    gain.gain.value = 0.0;
    this.gainNode = gain;

    try {
      await context.audioWorklet.addModule("/worklets/bitcrusher-worklet.js");
      const crusher = new AudioWorkletNode(context, "bitcrusher", {
        parameterData: {
          bits: 5,
          reduction: 0.4
        }
      });
      this.inputNode = crusher;
      crusher.connect(gain);
    } catch {
      const processor = context.createScriptProcessor(4096, 1, 1);
      let phase = 0;
      let held = 0;
      const bits = 5;
      const reduction = 0.4;
      const step = Math.pow(0.5, bits);

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const output = event.outputBuffer.getChannelData(0);
        for (let i = 0; i < input.length; i += 1) {
          phase += reduction;
          if (phase >= 1) {
            phase -= 1;
            held = step * Math.floor(input[i] / step + 0.5);
          }
          output[i] = held;
        }
      };

      this.inputNode = processor;
      processor.connect(gain);
    }

    gain.connect(context.destination);
  }

  async unlock(): Promise<void> {
    await this.ensureGraph();
    if (this.context?.state === "suspended") {
      await this.context.resume();
    }
  }

  async stop(): Promise<void> {
    if (!this.context || !this.gainNode) {
      return;
    }
    const now = this.context.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setTargetAtTime(0.0, now, 0.04);
    if (this.currentSource) {
      const source = this.currentSource;
      setTimeout(() => source.stop(), 150);
    }
    this.currentSource = null;
    this.currentPath = null;
  }

  async playAmbient(relativePath: string, options: AmbientOptions = {}): Promise<void> {
    await this.ensureGraph();
    if (!this.context || !this.inputNode || !this.gainNode) {
      return;
    }

    if (this.currentPath === relativePath && this.currentSource) {
      const now = this.context.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setTargetAtTime(options.volume ?? 0.7, now, 0.04);
      return;
    }

    const bytes = await window.hypercard.readBinary(relativePath);
    const arrayBuffer = toArrayBuffer(bytes);
    const decoded = await this.context.decodeAudioData(arrayBuffer.slice(0));

    const source = this.context.createBufferSource();
    source.buffer = decoded;
    source.loop = options.loop ?? true;
    source.connect(this.inputNode);

    await this.stop();

    const now = this.context.currentTime;
    this.gainNode.gain.cancelScheduledValues(now);
    this.gainNode.gain.setValueAtTime(0.0, now);
    this.gainNode.gain.linearRampToValueAtTime(options.volume ?? 0.7, now + 0.15);

    source.start();
    this.currentSource = source;
    this.currentPath = relativePath;
  }

  async playOneShot(relativePath: string, options: OneShotOptions = {}): Promise<void> {
    await this.ensureGraph();
    if (!this.context) {
      return;
    }

    let buffer = this.bufferCache.get(relativePath);
    if (!buffer) {
      const bytes = await window.hypercard.readBinary(relativePath);
      const arrayBuffer = toArrayBuffer(bytes);
      buffer = await this.context.decodeAudioData(arrayBuffer.slice(0));
      this.bufferCache.set(relativePath, buffer);
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = options.volume ?? 0.45;

    source.connect(gain);
    gain.connect(this.context.destination);
    source.start();
    source.addEventListener("ended", () => {
      source.disconnect();
      gain.disconnect();
    }, { once: true });
  }
}
