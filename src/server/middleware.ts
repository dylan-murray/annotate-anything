import type { IncomingMessage, ServerResponse } from "node:http";
import { createCore, inProduction, type CoreOptions } from "./core";
import { clientBundle } from "./client-file";
import { nodeRequest } from "./node";

export type MiddlewareOptions = CoreOptions;
export { isLocalOrigin } from "./core";
export type { Delivery, SubmitBatch } from "./core";
export { nodeRequest } from "./node";

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
