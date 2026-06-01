import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/sonara_hub/",
  plugins: [react()],
  root: "site",
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
