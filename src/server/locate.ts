import fs from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "vendor", "coverage", ".venv", "venv"]);

function stamp(dir: string): number {
  let t = 0;
  for (const f of ["feedback.json", "submissions.jsonl", ".gitignore"]) {
    try {
      t = Math.max(t, fs.statSync(path.join(dir, f)).mtimeMs);
    } catch {}
  }
  return t;
}

// The notes folder sits next to the dev server's root, which is often not where the
// agent's shell starts (a frontend/ subfolder, or a monorepo package). Look here, then
// in parent folders, then a few levels down, and take the most recently used one.
export function findNotesDirs(start: string): string[] {
  const here = path.join(start, ".annotations");
  if (fs.existsSync(here)) return [here];
  for (let dir = path.dirname(start); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const up = path.join(dir, ".annotations");
    if (fs.existsSync(up)) return [up];
    if (fs.existsSync(path.join(dir, ".git"))) break;
  }
  const found: string[] = [];
  let level = [start];
  for (let depth = 0; depth < 4 && level.length; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name === ".annotations") found.push(path.join(dir, e.name));
        else if (!SKIP.has(e.name) && !e.name.startsWith(".")) next.push(path.join(dir, e.name));
      }
    }
    level = next;
  }
  return found.sort((a, b) => stamp(b) - stamp(a));
}

const KNOWN: [RegExp, string][] = [
  [/claude/i, "Claude"],
  [/codex/i, "Codex"],
  [/gemini/i, "Gemini"],
  [/cursor/i, "Cursor"],
  [/opencode/i, "OpenCode"],
  [/grok/i, "Grok"],
  [/copilot/i, "Copilot"],
  [/windsurf|cascade/i, "Windsurf"],
  [/cline/i, "Cline"],
  [/aider/i, "Aider"],
  [/goose/i, "Goose"],
  [/^amp\b/i, "Amp"],
  [/^pi\b/i, "Pi"],
];

// Best effort: AI_AGENT is a cross-tool convention (Claude Code sets it), the rest are
// variables individual agents set. Agents can always pass --agent instead.
export function detectAgent(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const ai = env.AI_AGENT?.trim();
  if (ai) {
    const hit = KNOWN.find(([re]) => re.test(ai));
    if (hit) return hit[1];
    const word = ai.split(/[_\s]/)[0]!;
    return word ? word[0]!.toUpperCase() + word.slice(1) : undefined;
  }
  if (env.CLAUDECODE) return "Claude";
  if (env.CODEX_SANDBOX || env.CODEX_THREAD_ID || env.CODEX_MANAGED_BY_NPM) return "Codex";
  if (env.GEMINI_CLI) return "Gemini";
  if (env.CURSOR_AGENT) return "Cursor";
  if (env.OPENCODE) return "OpenCode";
  return undefined;
}
