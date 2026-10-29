import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { dump, FileStore } from "./server/store";
import { describe, Watcher } from "./server/watcher";
import { detectAgent, findNotesDirs } from "./server/locate";
import { serve } from "./mcp";
import { startServer } from "./server/serve";
import type { Status } from "./types";

const USAGE = `annotate-anything: UI notes from the browser, for coding agents.

Coding agent? Run \`npx annotate-anything attach\`. It explains the loop and waits
for the person's next batch of notes.

Usage:
  annotate-anything attach [--agent "Claude"]
                                             explain the loop, then wait for the next batch of notes
  annotate-anything watch [--once] [--agent "Claude"]
                                             wait for notes sent from the browser and print them
  annotate-anything notes [--all] [--json]   print open, sent and in-progress notes
  annotate-anything status <n...> <status> [--reply "text"]
                                             set notes to working, resolved or open, with an optional reply
  annotate-anything instructions             print the full instructions for agents
  annotate-anything init                     tell this project's agents about annotate-anything (AGENTS.md / CLAUDE.md)
  annotate-anything mcp [--agent "Codex"]    run the MCP server (wait_for_notes, list_notes, update_notes)
  annotate-anything serve [--port 4319] [--origin <url>]
                                             standalone notes server for any backend (Rails, Django, Nuxt, static…),
                                             with a script tag and a no-code bookmarklet

Options:
  --dir <path>     the notes folder (default: the nearest .annotations folder)
  --agent <name>   your name as the browser shows it ("Claude is working on 2 notes");
                   detected for Claude Code, Codex, Gemini, Cursor and OpenCode

The agent loop: watch, set each note working, make the change, verify it, then
set it resolved with a one-to-three sentence reply saying what changed. Never
resolve a note you didn't change; leave it open and reply why.`;


function main(argv: string[]): number | Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: "string" },
      once: { type: "boolean" },
      all: { type: "boolean" },
      json: { type: "boolean" },
      reply: { type: "string" },
      agent: { type: "string" },
      port: { type: "string" },
      origin: { type: "string", multiple: true },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, ...rest] = positionals;
  if (!cmd || values.help || cmd === "help") {
    console.log(USAGE);
    return cmd || values.help ? 0 : 1;
  }
  if (cmd === "init") return init();
  if (cmd === "serve") return serveStandalone(values.dir, Number(values.port ?? 4319), values.origin ?? []);
  if (cmd === "instructions") {
    console.log(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../agent/INSTRUCTIONS.md"), "utf8"));
    return 0;
  }
  let dir = values.dir ? path.resolve(values.dir) : undefined;
  if (!dir) {
    const found = findNotesDirs(process.cwd());
    if (!found.length && cmd !== "mcp") {
      console.error(NOT_FOUND);
      return 2;
    }
    dir = found[0] ?? path.resolve(".annotations");
    if (found.length > 1 && cmd !== "mcp") console.error(`Using ${dir} (also found ${found.slice(1).join(", ")}; pass --dir to pick)`);
  }
  const store = new FileStore(dir);
  const agent = values.agent ?? (cmd === "attach" || cmd === "watch" || cmd === "mcp" ? detectAgent() : undefined);
  if (agent && cmd === "status") store.setAgent(agent);
  if (cmd === "notes") {
    const notes = store.read().notes.filter((n) => values.all || n.status !== "resolved");
    console.log(values.json ? JSON.stringify(notes, null, 2) : dump(notes, store.feedback));
    return 0;
  }
  if (cmd === "status") {
    const status = rest.at(-1) as Status;
    const refs = rest.slice(0, -1);
    if (!refs.length || !["open", "sent", "working", "resolved"].includes(status)) {
      console.error('Usage: annotate-anything status <n...> <working|resolved|open> [--reply "text"]');
      return 2;
    }
    const notes = store.setStatus(refs, status, values.reply);
    const missing = refs.filter((r) => !notes.some((n) => n.id === r.replace(/^#/, "") || String(n.n) === r.replace(/^#/, "")));
    for (const n of notes) console.log(`#${n.n} ${n.status}${n.reply ? ` · ${n.reply}` : ""}`);
    if (missing.length) console.error(`No note ${missing.join(", ")}`);
    return missing.length ? 1 : 0;
  }
  if (cmd === "attach") return watch(store, true, agent, () => console.log(attachIntro(store, agent)));
  if (cmd === "watch") return watch(store, !!values.once, agent);
  if (cmd === "mcp") return serve(store, agent);
  console.error(`Unknown command ${cmd}\n\n${USAGE}`);
  return 2;
}

function serveStandalone(dir: string | undefined, port: number, origins: string[]): Promise<number> {
  const folder = path.resolve(dir ?? ".annotations");
  const self = process.argv[1] ?? "";
  const command = !self || /node_modules|_npx/.test(self) ? "npx annotate-anything" : `node ${/\s/.test(self) ? JSON.stringify(self) : self}`;
  const server = startServer({ dir: folder, port, origins, command });
  return new Promise((resolve) => {
    server.on("error", (e) => {
      console.error(`Could not start on port ${port}: ${(e as Error).message}`);
      resolve(1);
    });
    server.on("listening", () => {
      const base = `http://localhost:${port}/__annotate`;
      console.log(`annotate-anything is keeping notes in ${folder}

Use it on any app running on this machine:
  • no code changes: open http://localhost:${port} and drag the Annotate bookmarklet to your bookmarks bar
  • or add one tag to the app's dev layout: <script src="${base}/client.js"></script>

Then attach your coding agent from this folder: npx annotate-anything attach`);
    });
    const stop = () => server.close(() => resolve(0));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

const NOT_FOUND = `No .annotations folder found here, above or a few levels below.
Is the app's dev server running with annotate-anything? Set it up with:

  npm i -D annotate-anything
  // vite.config: import annotateAnything from "annotate-anything/vite"; plugins: [annotateAnything()]

or, for any other stack, run \`npx annotate-anything serve\` in the project and use its
script tag or bookmarklet. Either creates .annotations; then run this again.
Pass --dir <path> if the folder lives somewhere else.`;

function attachIntro(store: FileStore, agent?: string): string {
  const pending = store.read().notes.filter((n) => n.status === "sent" || n.status === "working");
  return `annotate-anything: attached${agent ? ` as ${agent}` : ""} to ${store.dir}
The person leaves notes on the running app and presses Send. This waits for that, then prints the notes.

For each note:
  1. npx annotate-anything status <n> working --reply "<what you're doing>"    (they see this live on the note)
  2. make the change and check it in the running app
  3. npx annotate-anything status <n> resolved --reply "<1-3 sentences: what changed>"
Never resolve a note you didn't change: set it open with a reply saying why or asking your question.
Afterwards, run npx annotate-anything attach again to wait for the next batch.${
    pending.length ? `\n\nAlready sent and not finished: ${pending.map((n) => `#${n.n}`).join(", ")} (npx annotate-anything notes shows them).` : ""
  }

Waiting for notes…`;
}

function watch(store: FileStore, once: boolean, agent?: string, intro?: () => void): Promise<number> {
  const watcher = new Watcher(store);
  const busy = watcher.claim();
  if (busy) {
    console.error(busy);
    return Promise.resolve(3);
  }
  if (agent) store.setAgent(agent);
  if (intro) intro();
  else console.error(`Watching for UI notes in ${store.dir}`);
  const check = () => {
    const batches = watcher.take();
    for (const b of batches) console.log(describe(b, store.feedback, dump));
    return batches.length > 0;
  };
  return new Promise<number>((resolve) => {
    const finish = (code: number) => {
      clearInterval(heart);
      clearInterval(poll);
      watcher.release();
      resolve(code);
    };
    const heart = setInterval(() => watcher.beat(), 1000);
    const poll = setInterval(() => {
      if (check() && once) finish(0);
    }, 400);
    process.once("SIGINT", () => finish(0));
    process.once("SIGTERM", () => finish(0));
    if (check() && once) finish(0);
  });
}

const MARK = "<!-- annotate-anything -->";
const SECTION = `${MARK}
## UI notes from annotate-anything

The person may leave notes on the running app and press Send. To receive them,
run \`npx annotate-anything attach\` (in the background if you can). It explains
what to do and prints the next batch; run it again after each batch. Agents
with MCP can use the annotate-anything server's wait_for_notes and
update_notes tools instead.
`;

function init(): number {
  const files = ["AGENTS.md", "CLAUDE.md"].filter((f) => fs.existsSync(f));
  if (!files.length) files.push("AGENTS.md");
  for (const f of files) {
    const before = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
    if (before.includes(MARK)) {
      console.log(`${f}: already tells agents about annotate-anything`);
      continue;
    }
    fs.writeFileSync(f, before ? before.replace(/\n*$/, "\n\n") + SECTION : `# Agent instructions\n\n${SECTION}`);
    console.log(`${f}: ${before ? "added" : "created with"} the annotate-anything section`);
  }
  const has = (...names: string[]) => names.find((f) => fs.existsSync(f));
  const mentions = (f: string) => fs.readFileSync(f, "utf8").includes("annotate-anything");
  const next = has("next.config.ts", "next.config.mjs", "next.config.js");
  const astro = has("astro.config.mjs", "astro.config.ts", "astro.config.js");
  const vite = has("vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs");
  if (next)
    console.log(
      fs.existsSync("app/api/annotate") || fs.existsSync("src/app/api/annotate")
        ? "Next.js: route already set up"
        : `\nNext.js (App Router):
  app/api/annotate/[...path]/route.ts:
    import { annotateRoute } from "annotate-anything/next";
    export const { GET, POST, OPTIONS } = annotateRoute();
  app/layout.tsx, inside <body>:
    import { Annotate } from "annotate-anything/next/client";
    <Annotate />
`,
    );
  else if (astro)
    console.log(mentions(astro) ? `${astro}: plugin already set up` : `\nAdd the plugin to ${astro}:\n\n  import annotateAnything from "annotate-anything/vite";\n  vite: { plugins: [annotateAnything()] }\n`);
  else if (vite)
    console.log(mentions(vite) ? `${vite}: plugin already set up` : `\nAdd the plugin to ${vite}:\n\n  import annotateAnything from "annotate-anything/vite";\n  plugins: [annotateAnything()]\n`);
  else
    console.log(
      "\nFor any other stack (Rails, Django, Phoenix, Nuxt, a static site…), run the standalone server:\n\n  npx annotate-anything serve\n\nand use the script tag or no-code bookmarklet it prints.\n",
    );
  console.log(
    'Agents with MCP can use the server instead of watch:\n  claude mcp add annotate-anything -- npx annotate-anything mcp --agent Claude\n  codex mcp add annotate-anything -- npx annotate-anything mcp --agent Codex',
  );
  return 0;
}

void Promise.resolve(main(process.argv.slice(2))).then((code) => {
  process.exitCode = code;
});
