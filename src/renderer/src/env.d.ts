import type { FileChangedPayload } from "@shared/types";

declare global {
  interface Window {
    hypercard: {
      readStack: () => Promise<unknown>;
      readBinary: (relativePath: string) => Promise<Uint8Array>;
      listFiles: (relativeDir: string) => Promise<string[]>;
      onFileChanged: (callback: (payload: FileChangedPayload) => void) => () => void;
    };
  }
}

export {};
