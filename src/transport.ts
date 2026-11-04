import type { FeedbackState, Note, Status, SubmitResult, Target } from "./types.js";

export interface PageInfo {
  route: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
}

export interface Transport {
  kind: "http" | "clipboard" | "local";
  sends: boolean;
  pull(): Promise<FeedbackState>;
  push(notes: Note[], deleted: string[]): Promise<FeedbackState>;
  submit(notes: Note[], page: PageInfo, target?: Target): Promise<SubmitResult>;
  status(ids: string[], status: Status): Promise<void>;
  targets?(): Promise<Target[]>;
}

export function http(endpoint: string, extra: Record<string, string> = {}): Transport {
  const base = endpoint.replace(/\/$/, "");
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? extra : { ...extra, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(path.endsWith("/submit") ? 120000 : 20000),
    });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    return res.json() as Promise<T>;
  }
  return {
    kind: "http",
    sends: true,
    pull: () => call<FeedbackState>("/feedback"),
    push: (notes, deleted) => call<FeedbackState>("/feedback", { notes, deleted }),
    submit: (notes, page, target) =>
      call<SubmitResult>("/feedback/submit", { noteIds: notes.map((n) => n.id), ...page, target: target?.id, agent: target?.label }),
    status: async (ids, status) => {
      await call("/feedback/status", { ids, status });
    },
    targets: () => call<{ targets?: Target[] }>("/targets").then((r) => (Array.isArray(r.targets) ? r.targets : [])),
  };
}

export function clipboard(): Transport {
  return {
    ...local(),
    kind: "clipboard",
    sends: false,
    submit: async (notes, page) => {
      await navigator.clipboard.writeText(markdown(notes, page));
      return { sent: notes.length, watching: false };
    },
  };
}

export function local(): Transport {
  const state = (notes: Note[], deleted: string[]): FeedbackState => ({ notes, deleted, watching: false });
  return {
    kind: "local",
    sends: false,
    pull: () => Promise.resolve(state([], [])),
    push: (notes, deleted) => Promise.resolve(state(notes, deleted)),
    submit: () => Promise.reject(new Error("No agent connection")),
    status: () => Promise.resolve(),
  };
}

export function markdown(notes: Note[], page: PageInfo): string {
  const lines = [`UI notes on ${page.title || page.url} (${page.url}), viewport ${page.viewport.width}x${page.viewport.height}:`, ""];
  for (const n of notes) {
    lines.push(`#${n.n} ${n.kind} on ${n.route}: ${n.selector || n.tag}`);
    if (n.targetText) lines.push(`  element text: "${n.targetText}"`);
    if (n.testId) lines.push(`  test id: ${n.testId}`);
    if (Object.keys(n.context).length) lines.push(`  context: ${JSON.stringify(n.context)}`);
    lines.push(`  ${n.comment.replace(/\n/g, "\n  ")}`, "");
  }
  return lines.join("\n").trimEnd();
}
