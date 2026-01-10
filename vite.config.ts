import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: false
  },
  base: "./",
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared")
    }
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node"
  }
});
