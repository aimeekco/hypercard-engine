import { Vector2 } from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

type DitherOptions = {
  virtualWidth?: number;
  virtualHeight?: number;
  threshold?: number;
  ditherStrength?: number;
};

const atkinsonShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new Vector2(1, 1) },
    virtualResolution: { value: new Vector2(640, 480) },
    threshold: { value: 0.5 },
    ditherStrength: { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 virtualResolution;
    uniform float threshold;
    uniform float ditherStrength;
    varying vec2 vUv;

    float luma(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }

    float quant(float value) {
      return step(threshold, value);
    }

    float sampleLuma(vec2 pixelCoord, vec2 offset) {
      vec2 uv = (pixelCoord + offset + vec2(0.5)) / virtualResolution;
      return luma(texture2D(tDiffuse, uv).rgb);
    }

    float donorError(vec2 pixelCoord, vec2 donorOffset) {
      float donorLuma = sampleLuma(pixelCoord, donorOffset);
      return (donorLuma - quant(donorLuma));
    }

    void main() {
      vec2 pixelCoord = floor(vUv * virtualResolution);

      float value = sampleLuma(pixelCoord, vec2(0.0));

      // Atkinson-style incoming error approximation from already-visited neighbors.
      float incoming = 0.0;
      incoming += donorError(pixelCoord, vec2(-1.0, 0.0));
      incoming += donorError(pixelCoord, vec2(-2.0, 0.0));
      incoming += donorError(pixelCoord, vec2(0.0, -1.0));
      incoming += donorError(pixelCoord, vec2(-1.0, -1.0));
      incoming += donorError(pixelCoord, vec2(1.0, -1.0));
      incoming += donorError(pixelCoord, vec2(0.0, -2.0));
      value += (incoming / 8.0) * ditherStrength;

      float bw = quant(clamp(value, 0.0, 1.0));
      gl_FragColor = vec4(vec3(bw), 1.0);
    }
  `
};

export class AtkinsonDitherPass {
  readonly pass: ShaderPass;

  constructor(options: DitherOptions = {}) {
    this.pass = new ShaderPass(atkinsonShader);
    const uniforms = this.pass.material.uniforms;
    uniforms.virtualResolution.value.set(options.virtualWidth ?? 640, options.virtualHeight ?? 480);
    uniforms.threshold.value = options.threshold ?? 0.5;
    uniforms.ditherStrength.value = options.ditherStrength ?? 1.0;
  }

  setRenderSize(width: number, height: number): void {
    this.pass.material.uniforms.resolution.value.set(width, height);
  }

  setVirtualSize(width: number, height: number): void {
    this.pass.material.uniforms.virtualResolution.value.set(width, height);
  }
}
