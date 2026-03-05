import { defineConfig } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main"
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared")
      }
    }
  },
  preload: {
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "chunks/[name]-[hash].cjs"
        }
      }
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared")
      }
    }
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    publicDir: resolve(__dirname, "src/renderer/public"),
    build: {
      outDir: resolve(__dirname, "dist/renderer")
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared")
      }
    }
  }
});
