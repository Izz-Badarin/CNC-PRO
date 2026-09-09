import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the single-file build can be opened directly from the
  // filesystem (file://) with no web server required — plane mode safe.
  base: "./",
  server: {
    // allow the sandboxed live-preview host (any *.e2b.app proxy) to reach the dev server
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({
      // keep asset inlining but preserve manifest/sw as separate files in dist for PWA
      removeViteModuleLoader: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  worker: {
    format: "es",
  },
  build: {
    // ensure inline worker works for file://
    assetsInlineLimit: 100000000,
  },
});
