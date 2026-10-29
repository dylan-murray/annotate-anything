import readline from "node:readline";
import { dump, type FileStore } from "./server/store";
import { describe, Watcher } from "./server/watcher";
import type { Status } from "./types";

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `The person you're working with leaves notes on the running web app with annotate-anything and presses Send.
Call wait_for_notes to receive the next batch (it blocks until they press Send). For each note: call update_notes with status "working" and a short reply saying what you're doing, make the change and verify it in the running app, then call update_notes with status "resolved" and a one-to-three sentence reply saying what changed. Post a new "working" reply when you move to a new step; the person sees it live on the note.
Never resolve a note you didn't change: set it to "open" with a reply saying why or asking your question. Resolved means implemented, not accepted. Call wait_for_notes again after each batch.`;

const TOOLS = [
  {
    name: "wait_for_notes",
    description: "Wait until the person presses Send in the browser, then return the notes they sent with where each one is on the page. Marks them as picked up.",
    inputSchema: {
      type: "object",
      properties: { timeout_seconds: { type: "number", description: "How long to wait, 1-3600 seconds. Default 300." } },
    },
  },
  {
    name: "list_notes",
    description: "List the notes that are open, sent or in progress, with selectors, element text and comments.",
    inputSchema: { type: "object", properties: { all: { type: "boolean", description: "Include resolved notes too." } } },
  },
  {
    name: "update_notes",
    description: "Set notes to working, resolved or open, with a reply the person reads on the note.",
    inputSchema: {
      type: "object",
      required: ["notes", "status"],
      properties: {
        notes: { type: "array", items: { type: ["number", "string"] }, description: "Note numbers (#n) or ids." },
        status: { type: "string", enum: ["working", "resolved", "open"] },
        reply: { type: "string", description: "Progress while working; what changed when resolved; why, when set back to open." },
      },
    },
  },
];

type Json = Record<string, unknown>;
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

export function serve(store: FileStore, agent?: string): Promise<number> {
  const send = (msg: Json) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  const active = new Set<Watcher>();

  async function waitForNotes(seconds: number) {
    const watcher = new Watcher(store);
    const busy = watcher.claim();
    if (busy) return text(busy, true);
    if (agent) store.setAgent(agent);
    active.add(watcher);
    const deadline = Date.now() + seconds * 1000;
    try {
      for (;;) {
        const batches = watcher.take();
        if (batches.length) return text(batches.map((b) => describe(b, store.feedback, dump)).join("\n"));
        if (Date.now() > deadline) return text("No notes before the timeout. Call wait_for_notes again to keep waiting.");
        watcher.beat();
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      active.delete(watcher);
      watcher.release();
    }
  }

  async function call(name: string, args: Json) {
    if (name === "wait_for_notes") {
      const s = Number(args.timeout_seconds ?? 300);
      return waitForNotes(Number.isFinite(s) ? Math.min(Math.max(s, 1), 3600) : 300);
    }
    if (name === "list_notes") {
      const notes = store.read().notes.filter((n) => args.all === true || n.status !== "resolved");
      return text(dump(notes, store.feedback));
    }
    if (name === "update_notes") {
      const refs = Array.isArray(args.notes) ? args.notes.map(String) : [];
      const status = args.status as Status;
      if (!refs.length || !["working", "resolved", "open"].includes(status)) return text("Pass notes and a status of working, resolved or open.", true);
      const notes = store.setStatus(refs, status, typeof args.reply === "string" ? args.reply : undefined);
      const missing = refs.filter((r) => !notes.some((n) => n.id === r.replace(/^#/, "") || String(n.n) === r.replace(/^#/, "")));
      const lines = notes.map((n) => `#${n.n} ${n.status}`);
      if (missing.length) lines.push(`No note ${missing.join(", ")}`);
      return text(lines.join("\n"), notes.length === 0);
    }
    return text(`Unknown tool ${name}`, true);
  }

  async function handle(msg: Json) {
    const { id, method } = msg as { id?: string | number; method?: string };
    const params = (msg.params ?? {}) as Json;
    if (id === undefined || id === null) return;
    try {
      if (method === "initialize") {
        const asked = String(params.protocolVersion ?? "");
        return send({
          id,
          result: {
            protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
            capabilities: { tools: {} },
            serverInfo: { name: "annotate-anything", version: "0.0.0" },
            instructions: INSTRUCTIONS,
          },
        });
      }
      if (method === "ping") return send({ id, result: {} });
      if (method === "tools/list") return send({ id, result: { tools: TOOLS } });
      if (method === "tools/call") return send({ id, result: await call(String(params.name), (params.arguments ?? {}) as Json) });
      send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (e) {
      send({ id, result: text((e as Error).message, true) });
    }
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: Json;
      try {
        msg = JSON.parse(line);
      } catch {
        return send({ id: null, error: { code: -32700, message: "Parse error" } });
      }
      void handle(msg);
    });
    rl.on("close", () => {
      for (const w of active) w.release();
      resolve(0);
      process.exit(0);
    });
  });
}
