import type { IncomingMessage, ServerResponse } from "node:http";
import { createCore, inProduction, type CoreOptions } from "./core.js";
import { clientBundle } from "./client-file.js";
import { nodeRequest } from "./node.js";

export type MiddlewareOptions = CoreOptions;
export { isLocalOrigin, isLoopbackOrigin } from "./core.js";
export type { Delivery, SubmitBatch } from "./core.js";
export { nodeRequest } from "./node.js";

type Next = (err?: unknown) => void;

// Connect/Express-style middleware: Vite, webpack-dev-server, Express, plain http.
export function createMiddleware(options: MiddlewareOptions = {}) {
  const core = createCore({ clientScript: clientBundle, ...options });
  return function annotateMiddleware(req: IncomingMessage, res: ServerResponse, next: Next) {
    if (inProduction(options)) return next();
    core
      .handle(nodeRequest(req))
      .then((out) => {
        if (!out) return next();
        res.writeHead(out.status, out.headers);
        res.end(out.body);
      })
      .catch(next);
  };
}
