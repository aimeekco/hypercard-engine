export const IPC_CHANNELS = {
  readStack: "hypercard:read-stack",
  readBinary: "hypercard:read-binary",
  listFiles: "hypercard:list-files",
  onFileChanged: "hypercard:file-changed",
  musicPrewarm: "hypercard:music-prewarm",
  musicStartOrSync: "hypercard:music-start-or-sync",
  musicStop: "hypercard:music-stop"
} as const;
