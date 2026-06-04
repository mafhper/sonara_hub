import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4175",
      "/outputs": "http://127.0.0.1:4175",
    },
    // The render pipeline writes per-frame scratch files (scene-renderer.html,
    // uploads, webm output) under .dev/ and outputs/. Those live inside the
    // project root, so Vite's watcher would fire a full-page reload for every
    // write — during a video render that reload storm crashes the dev client
    // (exit 3221226505), which then surfaces as "Servidor local indisponível".
    // These are runtime artifacts, never source, so exclude them from the watch.
    watch: {
      ignored: ["**/.dev/**", "**/outputs/**", "**/data/**"],
    },
  },
});
