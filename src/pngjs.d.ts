declare module "pngjs" {
  export type SyncPng = {
    width: number;
    height: number;
    data: Buffer;
  };

  export class PNG {
    static sync: {
      read(buffer: Buffer): SyncPng;
      write(png: SyncPng): Buffer;
    };
  }
}
