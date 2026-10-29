import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Note, Submission } from "../types";

export interface AgentDeskOptions {
  url?: string;
  target?: string;
  dataDir?: string;
}

export interface Delivery {
  to: string;
  ok: boolean;
  detail?: string;
}

function dataDir(opts: AgentDeskOptions): string {
  const dir = opts.dataDir ?? process.env.AGENT_DESK_DATA_DIR ?? path.join(os.homedir(), ".local", "share", "agent-desk");
  return dir.startsWith("~") ? path.join(os.homedir(), dir.slice(1)) : dir;
}

export function prompt(notes: Note[], submission: Submission, file: string, root: string): string {
  const lines = notes
    .sort((a, b) => a.n - b.n)
    .map((n) => `- #${n.n} ${n.kind} on ${n.route} (${n.selector || n.tag}): ${n.comment.replace(/\s+/g, " ")}`);
  const head = `UI notes from annotate-anything on ${submission.url || submission.route}:`;
  const tail =
    `\nFull details (selectors, element text, boxes) are in ${file}; run \`npx annotate-anything notes\` in ${root} to read them.` +
    " For each note, set it working (`npx annotate-anything status <n> working`), make the change, verify it, then" +
    ' `npx annotate-anything status <n> resolved --reply "<what changed>"`. Leave a note open and reply why if you change nothing.';
  let body = lines.join("\n");
  if ((head + body + tail).length > 5800) body = body.slice(0, 5800 - head.length - tail.length - 20) + "\n- …";
  return `${head}\n${body}${tail}`;
}

export async function deliver(opts: AgentDeskOptions, notes: Note[], submission: Submission, file: string, root: string): Promise<Delivery> {
  const desk = (opts.url ?? process.env.AGENT_DESK_URL ?? "http://127.0.0.1:4310").replace(/\/$/, "");
  const target = opts.target ?? process.env.AGENT_DESK_AGENT_ID ?? process.env.AGENT_DESK_COORDINATOR_ID;
  if (!target) return { to: "Agent Desk", ok: false, detail: "no target session; set agentDesk.target" };
  const to = `Agent Desk session ${target}`;
  try {
    const port = new URL(desk).port;
    if (!port) throw new Error("use an Agent Desk URL with an explicit port");
    const tokenFile = path.join(dataDir(opts), `.terminal-token-${port}`);
    let token: string;
    try {
      token = fs.readFileSync(tokenFile, "utf8").trim();
    } catch {
      throw new Error(`no Agent Desk token at ${tokenFile}; set agentDesk.dataDir`);
    }
    const res = await fetch(desk + "/api/coordinators/submit-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agent-Desk-Terminal": token },
      body: JSON.stringify({
        request_id: "aa-" + submission.id,
        target_id: target,
        prompt: prompt(notes, submission, file, root),
        notes: notes.slice(0, 200).map((n) => ({ id: n.id, note: `#${n.n} ${n.comment}`.slice(0, 2000) })),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as { sent?: boolean; queued?: boolean; error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    if (data.sent) return { to, ok: true };
    if (data.queued) return { to, ok: true, detail: "queued until the session's prompt is free" };
    return { to, ok: false, detail: "Agent Desk did not accept it" };
  } catch (e) {
    return { to, ok: false, detail: (e as Error).message };
  }
}
