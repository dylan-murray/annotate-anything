import path from "node:path";
import { FileStore, MAX_NOTES } from "./store";
import type { Note, Status, Submission } from "../types";
import { LOCAL_HOST } from "../local";

export interface Delivery {
  to: string;
  ok: boolean;
  detail?: string;
}

export interface SubmitBatch {
  notes: Note[];
  submission: Submission;
  file: string;
  root: string;
}

export interface CoreOptions {
  dir?: string;
  base?: string;
  // Push each sent batch somewhere (a webhook, a chat, an agent runner). Return where
  // it went and the page says so; ok means the receiver has the notes. Errors are
  // reported to the page, never thrown.
  onSubmit?: (batch: SubmitBatch) => Delivery | void | Promise<Delivery | void>;
  // Other origins allowed to call the API from a browser (the standalone server
  // allows any local origin). Same-origin requests are always allowed.
  allowOrigin?: (origin: string) => boolean;
  // Run even when NODE_ENV is production. Off by default.
  enabled?: boolean;
  // Source of the script-tag bundle served at <base>/client.js.
  clientScript?: () => string | null;
}

export interface CoreRequest {
  method: string;
  url: string;
  header(name: string): string | undefined;
  body(limit: number): Promise<string>;
}

export interface CoreResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const SYNC_LIMIT = 512 * 1024;
const SMALL_LIMIT = 64 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isLocalOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (u.protocol === "http:" || u.protocol === "https:") && LOCAL_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

export function inProduction(options: { enabled?: boolean }): boolean {
  return process.env.NODE_ENV === "production" && !options.enabled;
}

export function createCore(options: CoreOptions = {}) {
  const root = process.cwd();
  // Notes live outside the app's code; keep Next.js from tracing the whole project for this path.
  const store = new FileStore(path.resolve(/*turbopackIgnore: true*/ root, options.dir ?? ".annotations"));
  try {
    store.ensure();
  } catch {}
  const base = (options.base ?? "/__annotate").replace(/\/$/, "");
  const state = () => ({ ...store.read(), watching: store.watching(), agent: store.agent() });

  async function json(req: CoreRequest, limit: number): Promise<Record<string, unknown>> {
    if (Number(req.header("content-length") ?? 0) > limit) throw new HttpError(413, "Request too large");
    const raw = await req.body(limit);
    try {
      const v = JSON.parse(raw || "{}");
      if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
      return v;
    } catch {
      throw new HttpError(400, "Body must be a JSON object");
    }
  }

  async function route(req: CoreRequest, route: string): Promise<{ status?: number; data?: unknown; script?: string }> {
    if (route === "/client.js" && req.method === "GET") {
      const bundle = options.clientScript?.() ?? null;
      if (!bundle) throw new HttpError(404, "The browser bundle is missing; build annotate-anything first");
      const host = req.header("host") ?? "localhost";
      const proto = req.header("x-forwarded-proto") ?? "http";
      const config = JSON.stringify({ endpoint: `${proto}://${host}${base}`, enabled: true });
      return { script: `window.__ANNOTATE_ANYTHING__=Object.assign(${config},window.__ANNOTATE_ANYTHING__||{});\n${bundle}` };
    }
    if (route === "/feedback" && req.method === "GET") return { data: state() };
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    if (!String(req.header("content-type") ?? "").includes("application/json")) throw new HttpError(415, "Use Content-Type: application/json");
    if (route === "/feedback") {
      const b = await json(req, SYNC_LIMIT);
      const notes = Array.isArray(b.notes) ? b.notes : [];
      const deleted = Array.isArray(b.deleted) ? b.deleted : [];
      if (notes.length > MAX_NOTES) throw new HttpError(413, `At most ${MAX_NOTES} notes`);
      store.sync(notes, deleted);
      return { data: state() };
    }
    if (route === "/feedback/submit") {
      const b = await json(req, SMALL_LIMIT);
      const ids = Array.isArray(b.noteIds) ? b.noteIds : [];
      const result = store.submit(ids, b);
      let delivery: Delivery | undefined;
      if (result.submission && options.onSubmit) {
        try {
          delivery = (await options.onSubmit({ notes: result.notes, submission: result.submission, file: store.feedback, root })) ?? undefined;
        } catch (e) {
          delivery = { to: "The onSubmit hook", ok: false, detail: e instanceof Error ? e.message : String(e) };
        }
      }
      if (delivery?.ok) store.pickUp(result.submission!.noteIds);
      return { data: { submission: result.submission, sent: result.sent, watching: store.watching(), agent: store.agent(), delivery } };
    }
    if (route === "/feedback/status") {
      const b = await json(req, SMALL_LIMIT);
      const refs = (Array.isArray(b.ids) ? b.ids : [b.id ?? b.n]).filter((x) => x !== undefined && x !== null).map(String);
      if (!refs.length) throw new HttpError(400, "Pass ids");
      if (b.reply !== undefined && typeof b.reply !== "string") throw new HttpError(400, "reply must be a string");
      if (!["open", "sent", "working", "resolved"].includes(String(b.status))) throw new HttpError(400, "status must be open, sent, working or resolved");
      const notes = store.setStatus(refs, b.status as Status, b.reply as string | undefined);
      if (!notes.length) throw new HttpError(404, "No matching notes");
      return { data: { notes } };
    }
    throw new HttpError(404, "Not found");
  }

  async function handle(req: CoreRequest): Promise<CoreResponse | null> {
    const pathname = req.url.split("?")[0]!;
    if (pathname !== base && !pathname.startsWith(base + "/")) return null;
    const origin = req.header("origin");
    let sameOrigin = true;
    if (origin) {
      try {
        sameOrigin = new URL(origin).host === req.header("host");
      } catch {
        sameOrigin = false;
      }
    }
    const cross = !!origin && !sameOrigin && !!options.allowOrigin?.(origin);
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (cross) Object.assign(headers, { "Access-Control-Allow-Origin": origin!, Vary: "Origin" });
    const reply = (status: number, data: unknown): CoreResponse => ({
      status,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (req.method === "OPTIONS") {
      if (!cross) return reply(403, { error: "Cross-origin requests are not allowed" });
      const h: Record<string, string> = {
        ...headers,
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      };
      if (req.header("access-control-request-private-network")) h["Access-Control-Allow-Private-Network"] = "true";
      return { status: 204, headers: h, body: "" };
    }
    const site = req.header("sec-fetch-site");
    const script = pathname === base + "/client.js";
    if (!script && origin && !sameOrigin && !cross) return reply(403, { error: "Cross-origin requests are not allowed" });
    if (!script && site && site !== "same-origin" && site !== "none" && !cross) return reply(403, { error: "Cross-site requests are not allowed" });
    try {
      const out = await route(req, pathname.slice(base.length));
      if (out.script !== undefined) return { status: 200, headers: { ...headers, "Content-Type": "text/javascript; charset=utf-8" }, body: out.script };
      return reply(out.status ?? 200, out.data);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : e instanceof Error && /status must be/.test(e.message) ? 400 : 500;
      return reply(status, { error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { base, store, handle };
}
