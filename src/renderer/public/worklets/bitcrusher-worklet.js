class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "bits", defaultValue: 6, minValue: 1, maxValue: 16 },
      { name: "reduction", defaultValue: 0.35, minValue: 0.01, maxValue: 1.0 }
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.lastSample = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) {
      return true;
    }

    const inChannel = input[0];
    for (let ch = 0; ch < output.length; ch += 1) {
      const outChannel = output[ch];
      const bits = parameters.bits.length > 1 ? parameters.bits : null;
      const reduction = parameters.reduction.length > 1 ? parameters.reduction : null;

      for (let i = 0; i < outChannel.length; i += 1) {
        const bitDepth = bits ? bits[i] : parameters.bits[0];
        const step = Math.pow(0.5, bitDepth);
        const reduce = reduction ? reduction[i] : parameters.reduction[0];
        this.phase += reduce;

        if (this.phase >= 1) {
          this.phase -= 1;
          const sample = inChannel?.[i] ?? 0;
          this.lastSample = step * Math.floor(sample / step + 0.5);
        }
        outChannel[i] = this.lastSample;
      }
    }
    return true;
  }
}

registerProcessor("bitcrusher", BitCrusherProcessor);
