import type { IncomingMessage } from "node:http";
import { HttpError, type CoreRequest } from "./core";

export function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "Request too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function nodeRequest(req: IncomingMessage): CoreRequest {
  return {
    method: req.method ?? "GET",
    url: req.url ?? "/",
    header: (name) => {
      const v = req.headers[name.toLowerCase()];
      return Array.isArray(v) ? v[0] : v;
    },
    body: (limit) => readBody(req, limit),
  };
}
