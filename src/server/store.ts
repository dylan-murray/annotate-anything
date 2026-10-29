import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { LIFECYCLE, type Box, type Kind, type Note, type Status, type Submission } from "../types";

const KINDS: Kind[] = ["pin", "element", "area"];
const STATUSES: Status[] = ["open", "sent", "working", "resolved"];
const ID = /^[\w.-]{1,100}$/;
export const WATCHER_STALE_MS = 6000;
export const MAX_NOTES = 1000;

export interface State {
  version: 1;
  notes: Note[];
  deleted: string[];
}

export interface PageMeta {
  route?: unknown;
  url?: unknown;
  title?: unknown;
  viewport?: unknown;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);
const iso = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v.slice(0, 40) : undefined);

function box(v: unknown): Box {
  const b = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return { x: num(b.x), y: num(b.y), width: num(b.width), height: num(b.height) };
}

export function cleanNote(raw: unknown): Note | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id)) return null;
  const kind = KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : null;
  const comment = str(r.comment, 20000).trim();
  if (!kind || !comment) return null;
  let context: Record<string, unknown> = {};
  if (r.context && typeof r.context === "object" && !Array.isArray(r.context) && JSON.stringify(r.context).length <= 4000)
    context = r.context as Record<string, unknown>;
  const scroll = (r.scroll ?? {}) as Record<string, unknown>;
  const viewport = (r.viewport ?? {}) as Record<string, unknown>;
  const note: Note = {
    id: r.id,
    n: Number.isInteger(r.n) && (r.n as number) > 0 ? Math.min(r.n as number, 1e6) : 0,
    kind,
    route: str(r.route, 500) || "/",
    comment,
    createdAt: iso(r.createdAt) ?? new Date().toISOString(),
    updatedAt: iso(r.updatedAt) ?? new Date().toISOString(),
    status: STATUSES.includes(r.status as Status) ? (r.status as Status) : "open",
    selector: str(r.selector, 1000),
    tag: str(r.tag, 40),
    targetText: str(r.targetText, 400),
    x: num(r.x),
    y: num(r.y),
    bounds: box(r.bounds),
    scroll: { x: num(scroll.x), y: num(scroll.y) },
    viewport: { width: num(viewport.width), height: num(viewport.height) },
    inDialog: r.inDialog === true,
    context,
  };
  const testId = str(r.testId, 200);
  if (testId) note.testId = testId;
  if (r.offset) note.offset = box(r.offset);
  const sentAt = iso(r.sentAt);
  if (sentAt) note.sentAt = sentAt;
  const pickedUpAt = iso(r.pickedUpAt);
  if (pickedUpAt) note.pickedUpAt = pickedUpAt;
  const resolvedAt = iso(r.resolvedAt);
  if (resolvedAt) note.resolvedAt = resolvedAt;
  const reply = str(r.reply, 20000);
  if (reply) note.reply = reply;
  return note;
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function alive(pid: unknown): boolean {
  if (typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class FileStore {
  readonly feedback: string;
  readonly submissions: string;
  readonly watcher: string;
  readonly cursor: string;
  private readonly lockPath: string;

  constructor(readonly dir: string) {
    this.feedback = path.join(dir, "feedback.json");
    this.submissions = path.join(dir, "submissions.jsonl");
    this.watcher = path.join(dir, "watcher.json");
    this.cursor = path.join(dir, "watch.cursor");
    this.lockPath = path.join(dir, ".lock");
  }

  ensure() {
    fs.mkdirSync(this.dir, { recursive: true });
    const ignore = path.join(this.dir, ".gitignore");
    if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n");
  }

  read(): State {
    try {
      const d = JSON.parse(fs.readFileSync(this.feedback, "utf8"));
      return {
        version: 1,
        notes: Array.isArray(d.notes) ? d.notes.map(cleanNote).filter(Boolean) : [],
        deleted: Array.isArray(d.deleted) ? d.deleted.filter((x: unknown) => typeof x === "string") : [],
      };
    } catch {
      return { version: 1, notes: [], deleted: [] };
    }
  }

  private write(state: State) {
    this.ensure();
    const tmp = `${this.feedback}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1) + "\n");
    fs.renameSync(tmp, this.feedback);
  }

  locked<T>(fn: () => T): T {
    this.ensure();
    const deadline = Date.now() + 5000;
    for (;;) {
      try {
        fs.closeSync(fs.openSync(this.lockPath, "wx"));
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        try {
          if (Date.now() - fs.statSync(this.lockPath).mtimeMs > 10000) fs.rmSync(this.lockPath, { force: true });
        } catch {}
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${this.lockPath}`);
        sleep(15);
      }
    }
    try {
      return fn();
    } finally {
      fs.rmSync(this.lockPath, { force: true });
    }
  }

  sync(incoming: unknown[], deleted: unknown[]): State {
    return this.locked(() => {
      const state = this.read();
      const gone = new Set([...state.deleted, ...deleted.filter((d): d is string => typeof d === "string" && ID.test(d))]);
      const byId = new Map(state.notes.map((n) => [n.id, n]));
      for (const raw of incoming) {
        const note = cleanNote(raw);
        if (!note || gone.has(note.id)) continue;
        const stored = byId.get(note.id);
        if (!stored) {
          byId.set(note.id, note);
          continue;
        }
        const merged = { ...note } as Record<string, unknown>;
        for (const k of LIFECYCLE) {
          if (stored[k] !== undefined) merged[k] = stored[k];
          else delete merged[k];
        }
        byId.set(note.id, merged as unknown as Note);
      }
      const next: State = { version: 1, notes: [...byId.values()].filter((n) => !gone.has(n.id)), deleted: [...gone].slice(-5000) };
      this.write(next);
      return next;
    });
  }

  submit(ids: unknown[], page: PageMeta): { submission?: Submission; sent: number; notes: Note[] } {
    return this.locked(() => {
      const state = this.read();
      const want = new Set(ids.filter((x): x is string => typeof x === "string"));
      const fresh = state.notes.filter((n) => want.has(n.id) && n.status === "open");
      if (!fresh.length) return { sent: 0, notes: [] };
      const submittedAt = new Date().toISOString();
      for (const n of fresh) {
        n.status = "sent";
        n.sentAt = submittedAt;
      }
      const submission: Submission = {
        id: crypto.randomUUID().replace(/-/g, ""),
        submittedAt,
        route: str(page.route, 500),
        url: str(page.url, 2000),
        title: str(page.title, 300),
        noteIds: fresh.map((n) => n.id),
        count: fresh.length,
        excerpts: fresh.map((n) => `#${n.n} ${n.comment.replace(/\s+/g, " ").slice(0, 140)}`),
      };
      this.write(state);
      fs.appendFileSync(this.submissions, JSON.stringify(submission) + "\n");
      return { submission, sent: fresh.length, notes: fresh };
    });
  }

  resolveRefs(state: State, refs: string[]): Note[] {
    return refs
      .map((ref) => {
        const r = ref.replace(/^#/, "");
        return state.notes.find((n) => n.id === r || String(n.n) === r);
      })
      .filter((n): n is Note => !!n);
  }

  setStatus(refs: string[], status: Status, reply?: string): Note[] {
    if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(", ")}`);
    return this.locked(() => {
      const state = this.read();
      const notes = this.resolveRefs(state, refs);
      const t = new Date().toISOString();
      for (const n of notes) {
        n.status = status;
        n.updatedAt = t;
        if (status === "open") {
          delete n.sentAt;
          delete n.pickedUpAt;
        }
        if (status === "resolved") n.resolvedAt = t;
        else delete n.resolvedAt;
        if (reply !== undefined) {
          const text = reply.trim().slice(0, 20000);
          if (text) n.reply = text;
          else delete n.reply;
        }
      }
      if (notes.length) this.write(state);
      return notes;
    });
  }

  pickUp(ids: string[]): void {
    this.locked(() => {
      const state = this.read();
      const want = new Set(ids);
      const t = new Date().toISOString();
      let changed = false;
      for (const n of state.notes)
        if (want.has(n.id) && n.status === "sent" && !n.pickedUpAt) {
          n.pickedUpAt = t;
          changed = true;
        }
      if (changed) this.write(state);
    });
  }

  agent(): string | undefined {
    try {
      const name = JSON.parse(fs.readFileSync(path.join(this.dir, "agent.json"), "utf8")).name;
      return typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : undefined;
    } catch {
      return undefined;
    }
  }

  setAgent(name: string) {
    this.ensure();
    fs.writeFileSync(path.join(this.dir, "agent.json"), JSON.stringify({ name: name.trim().slice(0, 60) }) + "\n");
  }

  watching(): boolean {
    try {
      const info = JSON.parse(fs.readFileSync(this.watcher, "utf8"));
      return Date.now() - Number(info.beat) < WATCHER_STALE_MS && alive(info.pid);
    } catch {
      return false;
    }
  }
}

export function dump(notes: Note[], file: string): string {
  if (!notes.length) return "No open UI notes.";
  const lines = [`${notes.length} UI note(s)`, `file: ${file}`, ""];
  for (const n of [...notes].sort((a, b) => a.n - b.n)) {
    lines.push(`#${n.n} [${n.status}] ${n.kind} on ${n.route}  ${n.selector || n.tag || "page"}`);
    lines.push(`  id: ${n.id}`);
    if (n.testId) lines.push(`  test id: ${n.testId}`);
    if (n.targetText) lines.push(`  element text: ${JSON.stringify(n.targetText)}`);
    const b = n.bounds;
    lines.push(`  element box: x=${b.x} y=${b.y} w=${b.width} h=${b.height} (viewport ${n.viewport.width}x${n.viewport.height}, scrolled ${n.scroll.x},${n.scroll.y})`);
    if (n.kind === "pin") lines.push(`  pin at: x=${n.x} y=${n.y}`);
    if (n.kind === "area" && n.offset) lines.push(`  area in element: x=${n.offset.x} y=${n.offset.y} w=${n.offset.width} h=${n.offset.height}`);
    if (n.inDialog) lines.push("  inside a dialog");
    if (Object.keys(n.context).length) lines.push(`  context: ${JSON.stringify(n.context)}`);
    lines.push(...n.comment.split("\n").map((l) => "  > " + l));
    if (n.reply) lines.push(`  reply: ${n.reply}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
