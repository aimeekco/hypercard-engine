import type { DitherLevel, FileChangedPayload, FinAudioSpec } from "@shared/types";

declare global {
  interface Window {
    hypercard: {
      readStack: () => Promise<unknown>;
      readBinary: (relativePath: string) => Promise<Uint8Array>;
      listFiles: (relativeDir: string) => Promise<string[]>;
      musicPrewarm: () => Promise<void>;
      musicStartOrSync: (spec: FinAudioSpec, level: DitherLevel) => Promise<void>;
      musicStop: () => Promise<void>;
      onFileChanged: (callback: (payload: FileChangedPayload) => void) => () => void;
    };
  }
}

export {};
