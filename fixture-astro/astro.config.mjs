import { defineConfig } from "astro/config";
import annotateAnything from "annotate-anything/vite";

export default defineConfig({
  telemetry: false,
  vite: { plugins: [annotateAnything({ dir: process.env.AA_DIR })] },
});
