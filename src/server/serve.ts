import http from "node:http";
import { createCore, isLocalOrigin } from "./core";
import { nodeRequest } from "./node";
import { clientBundle } from "./client-file";

export interface ServeOptions {
  port?: number;
  dir?: string;
  origins?: string[];
  command?: string;
}

export function bookmarklet(base: string): string {
  const src = `${base}/client.js`;
  return `javascript:(()=>{if(window.annotateAnything)return window.annotateAnything.open();const s=document.createElement('script');s.src=${JSON.stringify(src)}+'?'+Date.now();document.body.appendChild(s)})()`;
}

function page(base: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>annotate-anything</title>
<style>body{margin:0;padding:32px 16px;font:15px/1.6 system-ui,sans-serif;background:#0a0a0a;color:#ededed}main{max-width:640px;margin:0 auto}code,pre{font:13px/1.5 ui-monospace,Menlo,monospace;background:#141414;border:1px solid #2e2e2e;border-radius:6px}code{padding:1px 5px}pre{padding:12px;overflow:auto}a.bm{display:inline-block;padding:8px 14px;color:#fff;background:#0070f3;border-radius:8px;text-decoration:none;font-weight:600}</style></head>
<body><main><h1>annotate-anything</h1>
<p>Serving notes for any app running on this machine.</p>
<h2>No code changes</h2><p>Drag this to your bookmarks bar, then click it on any local page:</p>
<p><a class="bm" href="${esc(bookmarklet(base))}">Annotate</a></p>
<h2>Or add one script tag to your app's dev layout</h2>
<pre>&lt;script src="${esc(base)}/client.js"&gt;&lt;/script&gt;</pre>
<h2>Then attach your coding agent</h2><p>From this folder: <code>npx annotate-anything attach</code></p></main></body></html>`;
}

// A standalone notes server for apps whose dev server can't host the middleware:
// Rails, Django, Phoenix, Nuxt, a static site, anything. Pages on local origins load
// the client from here and talk to it cross-origin.
export function startServer(options: ServeOptions = {}): http.Server {
  const origins = new Set(options.origins ?? []);
  const core = createCore({ dir: options.dir, command: options.command, enabled: true, clientScript: clientBundle, allowOrigin: (o) => origins.has(o) || isLocalOrigin(o) });
  const server = http.createServer((req, res) => {
    core
      .handle(nodeRequest(req))
      .then((out) => {
        if (out) {
          res.writeHead(out.status, out.headers);
          return res.end(out.body);
        }
        if ((req.url ?? "/").split("?")[0] === "/") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          return res.end(page(`http://${req.headers.host ?? "localhost"}${core.base}`));
        }
        res.writeHead(404).end();
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "text/plain" }).end(String(e));
      });
  });
  server.listen(options.port ?? 4319);
  return server;
}
