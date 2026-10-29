import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: { entry: "src/auto.ts", formats: ["iife"], name: "AnnotateAnythingBundle", fileName: () => "annotate-anything.iife.js" },
    target: "es2022",
    emptyOutDir: false,
  },
});
