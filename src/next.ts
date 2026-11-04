import type { IncomingMessage, ServerResponse } from "node:http";
import { createCore, HttpError, inProduction, type CoreOptions } from "./server/core.js";
import { nodeRequest } from "./server/node.js";

export type NextOptions = CoreOptions;
export type { Delivery, SubmitBatch } from "./server/core.js";

const BASE = "/api/annotate";

// App Router. In app/api/annotate/[...path]/route.ts:
//   export const { GET, POST, OPTIONS } = annotateRoute();
export function annotateRoute(options: NextOptions = {}) {
  const core = createCore({ base: BASE, ...options });
  async function handler(request: Request): Promise<Response> {
    if (inProduction(options)) return new Response("Not found", { status: 404 });
    const url = new URL(request.url);
    const out = await core.handle({
      method: request.method,
      url: url.pathname + url.search,
      header: (name) => request.headers.get(name) ?? undefined,
      body: async (limit) => {
        const text = await request.text();
        if (Buffer.byteLength(text) > limit) throw new HttpError(413, "Request too large");
        return text;
      },
    });
    if (!out) return new Response("Not found", { status: 404 });
    return new Response(out.status === 204 ? null : out.body, { status: out.status, headers: out.headers });
  }
  return { GET: handler, POST: handler, OPTIONS: handler };
}

// Pages Router. In pages/api/annotate/[...path].ts:
//   export default annotatePagesRoute();
//   export const config = { api: { bodyParser: false } };
export function annotatePagesRoute(options: NextOptions = {}) {
  const core = createCore({ base: BASE, ...options });
  return async (req: IncomingMessage, res: ServerResponse) => {
    const out = inProduction(options) ? null : await core.handle(nodeRequest(req));
    if (!out) {
      res.statusCode = 404;
      return res.end("Not found");
    }
    res.writeHead(out.status, out.headers);
    res.end(out.body);
  };
}
