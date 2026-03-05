import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { FileChangedPayload } from "@shared/types";

type Unsubscribe = () => void;

type HypercardApi = {
  readStack: () => Promise<unknown>;
  listModels: () => Promise<string[]>;
  readBinary: (relativePath: string) => Promise<Uint8Array>;
  onFileChanged: (callback: (payload: FileChangedPayload) => void) => Unsubscribe;
};

const api: HypercardApi = {
  readStack: () => ipcRenderer.invoke(IPC_CHANNELS.readStack) as Promise<unknown>,
  listModels: () => ipcRenderer.invoke(IPC_CHANNELS.listModels) as Promise<string[]>,
  readBinary: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.readBinary, relativePath) as Promise<Uint8Array>,
  onFileChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: FileChangedPayload) => {
      callback(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.onFileChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.onFileChanged, listener);
    };
  }
};

contextBridge.exposeInMainWorld("hypercard", api);
