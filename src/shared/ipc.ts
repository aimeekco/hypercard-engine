export const IPC_CHANNELS = {
  readStack: "hypercard:read-stack",
  readBinary: "hypercard:read-binary",
  listFiles: "hypercard:list-files",
  onFileChanged: "hypercard:file-changed",
  musicStartOrSync: "hypercard:music-start-or-sync",
  musicStop: "hypercard:music-stop"
} as const;
