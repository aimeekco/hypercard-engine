import type { FileChangedPayload } from "@shared/types";

declare global {
  interface Window {
    hypercard: {
      readStack: () => Promise<unknown>;
      readBinary: (relativePath: string) => Promise<Uint8Array>;
      onFileChanged: (callback: (payload: FileChangedPayload) => void) => () => void;
    };
  }
}

export {};
