import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { DitherLevel, FileChangedPayload, FinAudioSpec } from "@shared/types";

type Unsubscribe = () => void;

type HypercardApi = {
  readStack: () => Promise<unknown>;
  readBinary: (relativePath: string) => Promise<Uint8Array>;
  listFiles: (relativeDir: string) => Promise<string[]>;
  musicPrewarm: () => Promise<void>;
  musicStartOrSync: (spec: FinAudioSpec, level: DitherLevel) => Promise<void>;
  musicStop: () => Promise<void>;
  onFileChanged: (callback: (payload: FileChangedPayload) => void) => Unsubscribe;
};

const api: HypercardApi = {
  readStack: () => ipcRenderer.invoke(IPC_CHANNELS.readStack) as Promise<unknown>,
  readBinary: (relativePath) => ipcRenderer.invoke(IPC_CHANNELS.readBinary, relativePath) as Promise<Uint8Array>,
  listFiles: (relativeDir) => ipcRenderer.invoke(IPC_CHANNELS.listFiles, relativeDir) as Promise<string[]>,
  musicPrewarm: () => ipcRenderer.invoke(IPC_CHANNELS.musicPrewarm) as Promise<void>,
  musicStartOrSync: (spec, level) => ipcRenderer.invoke(IPC_CHANNELS.musicStartOrSync, spec, level) as Promise<void>,
  musicStop: () => ipcRenderer.invoke(IPC_CHANNELS.musicStop) as Promise<void>,
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
