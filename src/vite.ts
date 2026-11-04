import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createMiddleware } from "./server/middleware";
import type { CoreOptions } from "./server/core";

export interface PluginOptions {
  dir?: string;
  base?: string;
  onSubmit?: CoreOptions["onSubmit"];
  targets?: CoreOptions["targets"];
  client?: {
    scope?: string;
    agentName?: string;
    stableAttributes?: string[];
    theme?: Record<string, string>;
    watchCommand?: string;
  };
  inject?: boolean;
}

const VIRTUAL = "virtual:annotate-anything/client";
const RESOLVED = "\0" + VIRTUAL;
const SRC = "/@id/__x00__" + VIRTUAL;
const TAG = `<script type="module" src="${SRC}"></script>`;

type Write = (chunk: unknown, ...rest: unknown[]) => boolean;
type End = (chunk?: unknown, ...rest: unknown[]) => ServerResponse;

// Server-rendered frameworks on Vite (SvelteKit, Astro, React Router/Remix) never send
// their pages through transformIndexHtml, so add the client to any HTML response that
// passes through the dev server, streamed or not.
function injectIntoHtml(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.method !== "GET" || !String(req.headers.accept ?? "").includes("text/html")) return next();
  let html: boolean | null = null;
  let done = false;
  const isHtml = () => {
    if (html === null) {
      html = String(res.getHeader("content-type") ?? "").includes("text/html") && !res.getHeader("content-encoding");
      if (html && !res.headersSent) res.removeHeader("content-length");
    }
    return html;
  };
  const transform = (chunk: unknown) => {
    if (done || chunk == null || typeof chunk === "function" || !isHtml()) return chunk;
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (text.includes(SRC)) {
      done = true;
      return chunk;
    }
    const i = text.lastIndexOf("</body>");
    if (i < 0) return chunk;
    done = true;
    return text.slice(0, i) + TAG + text.slice(i);
  };
  const writeHead = res.writeHead.bind(res) as (...a: unknown[]) => ServerResponse;
  const write = res.write.bind(res) as Write;
  const end = res.end.bind(res) as End;
  res.writeHead = ((status: number, ...args: unknown[]) => {
    const headers = args.find((a) => a && typeof a === "object" && !Array.isArray(a)) as Record<string, string> | undefined;
    if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    isHtml();
    return typeof args[0] === "string" ? writeHead(status, args[0]) : writeHead(status);
  }) as ServerResponse["writeHead"];
  res.write = ((chunk: unknown, ...rest: unknown[]) => write(transform(chunk), ...rest)) as ServerResponse["write"];
  res.end = ((chunk?: unknown, ...rest: unknown[]) => {
    if (typeof chunk === "function") {
      rest.unshift(chunk);
      chunk = undefined;
    }
    chunk = transform(chunk);
    if (!done && isHtml()) {
      done = true;
      chunk = chunk == null ? TAG : (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)) + TAG;
    }
    return end(chunk, ...rest);
  }) as ServerResponse["end"];
  next();
}

export default function annotateAnything(options: PluginOptions = {}): Plugin {
  const base = (options.base ?? "/__annotate").replace(/\/$/, "");
  let dir = "";
  return {
    name: "annotate-anything",
    apply: "serve",
    enforce: "pre",
    config() {
      return { server: { watch: { ignored: ["**/.annotations/**"] } } };
    },
    configResolved(config) {
      dir = path.resolve(config.root, options.dir ?? ".annotations");
    },
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id !== RESOLVED) return;
      const client = { ...options.client, endpoint: base, enabled: true };
      return `import { annotate } from "annotate-anything";\nwindow.annotateAnything ??= annotate(${JSON.stringify(client)});\n`;
    },
    configureServer(server) {
      // Vite has already vetted the Host against its own list.
      const allowedHosts = server.config.server.allowedHosts;
      server.middlewares.use(createMiddleware({ dir, base, onSubmit: options.onSubmit, targets: options.targets, allowedHosts }));
      if (options.inject !== false) server.middlewares.use(injectIntoHtml);
    },
    transformIndexHtml: {
      order: "pre",
      handler() {
        if (options.inject === false) return [];
        return [{ tag: "script", attrs: { type: "module", src: SRC }, injectTo: "body" }];
      },
    },
  };
}

export { annotateAnything };
