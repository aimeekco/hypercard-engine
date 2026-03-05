import type { FileChangedPayload } from "@shared/types";

declare global {
  interface Window {
    hypercard: {
      readStack: () => Promise<unknown>;
      listModels: () => Promise<string[]>;
      readBinary: (relativePath: string) => Promise<Uint8Array>;
      onFileChanged: (callback: (payload: FileChangedPayload) => void) => () => void;
    };
  }
}

export {};
