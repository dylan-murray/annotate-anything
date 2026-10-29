import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import annotateAnything from "../src/vite";

const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

const page = (title: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>` +
  `<style>body{margin:0;padding:24px 16px;font:16px/1.5 system-ui,sans-serif}</style></head>` +
  `<body><h1 class="title">${title}</h1><p class="lede">Rendered on the server, like SvelteKit or Astro pages.</p></body></html>`;

// Stands in for a server-rendered framework: HTML written straight to the response,
// never through index.html.
function serverRendered(): Plugin {
  return {
    name: "fixture-server-rendered",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/ssr") {
          const html = page("Server-rendered page");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Content-Length", Buffer.byteLength(html));
          return res.end(html);
        }
        if (req.url === "/ssr-stream") {
          const html = page("Streamed page");
          const cut = html.indexOf("<body>") + 6;
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.write(html.slice(0, cut));
          setTimeout(() => res.end(html.slice(cut)), 50);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), serverRendered(), annotateAnything({ dir: process.env.AA_DIR, client: { scope: "fixture" } })],
  resolve: { alias: { "annotate-anything": src("index.ts") } },
  server: { port: Number(process.env.PORT ?? 5199), strictPort: true },
});
