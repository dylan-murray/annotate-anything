import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        vite: "src/vite.ts",
        middleware: "src/server/middleware.ts",
        cli: "src/cli.ts",
        next: "src/next.ts",
        react: "src/react.ts",
        "next-client": "src/next-client.ts",
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [/^node:/, "vite", "react", "next", /^next\//],
      output: {
        banner: (chunk) => (chunk.name === "cli" ? "#!/usr/bin/env node" : chunk.name === "react" || chunk.name === "next-client" ? '"use client";' : ""),
      },
    },
    target: "es2022",
    minify: false,
    emptyOutDir: true,
  },
});
