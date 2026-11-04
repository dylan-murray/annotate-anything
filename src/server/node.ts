import type { IncomingMessage } from "node:http";
import { HttpError, type CoreRequest } from "./core.js";

export function readBody(req: IncomingMessage, limit: number): Promise<string> {
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed !== undefined) {
    const text = typeof parsed === "string" ? parsed : Buffer.isBuffer(parsed) ? parsed.toString("utf8") : JSON.stringify(parsed);
    return Buffer.byteLength(text) > limit ? Promise.reject(new HttpError(413, "Request too large")) : Promise.resolve(text);
  }
  if (req.readableEnded) return Promise.reject(new HttpError(400, "Something already read the request body; add annotate-anything before your body parser"));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) reject(new HttpError(413, "Request too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function nodeRequest(req: IncomingMessage): CoreRequest {
  return {
    remote: req.socket?.remoteAddress,
    method: req.method ?? "GET",
    url: req.url ?? "/",
    header: (name) => {
      const v = req.headers[name.toLowerCase()];
      return Array.isArray(v) ? v[0] : v;
    },
    body: (limit) => readBody(req, limit),
  };
}
