import fs from "node:fs";
import path from "node:path";
import { FileStore } from "./store";
import type { Note, Submission } from "../types";

export interface Batch {
  submission: Submission;
  notes: Note[];
}

export const NEXT =
  'Next: for each note run `npx annotate-anything status <n> working --reply "<what you\'re doing>"`, make the change and verify it, then `npx annotate-anything status <n> resolved --reply "<what changed>"`. Then run `npx annotate-anything attach` again for the next batch.';

// One receiver at a time per notes folder. It heartbeats so the browser can say
// whether anyone is listening, and keeps a byte cursor into submissions.jsonl so a
// batch is handed over exactly once, whether by `watch` or the MCP server.
export class Watcher {
  private lock: string;
  private started = Date.now();
  private offset = 0;

  constructor(readonly store: FileStore) {
    this.lock = path.join(store.dir, "watch.lock");
  }

  claim(): string | null {
    this.store.ensure();
    try {
      const other = Number(fs.readFileSync(this.lock, "utf8"));
      if (other && other !== process.pid && this.store.watching())
        return `Another agent${this.store.agent() ? ` (${this.store.agent()})` : ""} is already attached to ${this.store.dir} (pid ${other}). Only one agent receives notes at a time.`;
    } catch {}
    fs.writeFileSync(this.lock, String(process.pid));
    try {
      this.offset = Number(fs.readFileSync(this.store.cursor, "utf8")) || 0;
    } catch {
      this.offset = 0;
    }
    try {
      if (this.offset > fs.statSync(this.store.submissions).size) this.offset = 0;
    } catch {}
    this.beat();
    return null;
  }

  beat() {
    fs.writeFileSync(this.store.watcher, JSON.stringify({ pid: process.pid, beat: Date.now(), started: this.started }));
  }

  release() {
    for (const f of [this.store.watcher, this.lock]) {
      try {
        const raw = fs.readFileSync(f, "utf8");
        const pid = f === this.lock ? Number(raw) : JSON.parse(raw).pid;
        if (pid === process.pid) fs.rmSync(f);
      } catch {}
    }
  }

  take(): Batch[] {
    let data: Buffer;
    try {
      data = fs.readFileSync(this.store.submissions);
    } catch {
      return [];
    }
    const batches: Batch[] = [];
    while (this.offset < data.length) {
      const end = data.indexOf(10, this.offset);
      if (end < 0) break;
      const line = data.subarray(this.offset, end).toString("utf8");
      this.offset = end + 1;
      fs.writeFileSync(this.store.cursor, String(this.offset));
      let submission: Submission;
      try {
        submission = JSON.parse(line);
      } catch {
        continue;
      }
      this.store.pickUp(submission.noteIds);
      const ids = new Set(submission.noteIds);
      batches.push({ submission, notes: this.store.read().notes.filter((n) => ids.has(n.id)) });
    }
    return batches;
  }
}

export function describe(batch: Batch, file: string, dump: (notes: Note[], file: string) => string): string {
  const s = batch.submission;
  return `SUBMITTED ${s.count} note(s) at ${s.submittedAt} from ${s.url || s.route}\n${dump(batch.notes, file)}\n${NEXT}\n`;
}
