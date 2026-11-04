import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { execFileSync, spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { FileStore } from "../src/server/store";

const CLI = path.resolve("dist/cli.js");

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "no browser involved"));

function seeded() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-cli-"));
  const store = new FileStore(dir);
  const t = new Date().toISOString();
  const base = { kind: "element", route: "/", createdAt: t, updatedAt: t, status: "open", selector: "main > h1", tag: "h1", targetText: "Hello", x: 0, y: 0, bounds: { x: 0, y: 0, width: 100, height: 20 }, scroll: { x: 0, y: 0 }, viewport: { width: 1440, height: 900 }, inDialog: false, context: {} };
  store.sync([{ ...base, id: "a1", n: 1, comment: "Make the heading smaller" }, { ...base, id: "b2", n: 2, comment: "Fix the typo" }], []);
  return { dir, store };
}

test("the MCP server waits for a batch, marks it picked up, and lets the agent reply", async () => {
  const { dir, store } = seeded();
  const proc = spawn("node", [CLI, "mcp", "--agent", "Codex", "--dir", dir], { stdio: ["pipe", "pipe", "inherit"] });
  const replies = new Map<number, any>();
  readline.createInterface({ input: proc.stdout }).on("line", (l) => {
    const m = JSON.parse(l);
    replies.set(m.id, m);
  });
  const rpc = async (id: number, method: string, params: object = {}) => {
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    await expect.poll(() => replies.has(id), { timeout: 10000 }).toBe(true);
    return replies.get(id);
  };

  const init = await rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  expect(init.result.protocolVersion).toBe("2025-06-18");
  expect(init.result.instructions).toContain("wait_for_notes");
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const tools = await rpc(2, "tools/list");
  expect(tools.result.tools.map((t: any) => t.name)).toEqual(["wait_for_notes", "list_notes", "update_notes"]);

  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "wait_for_notes", arguments: { timeout_seconds: 20 } } }) + "\n");
  await expect.poll(() => store.watching()).toBe(true);
  expect(store.agent()).toBe("Codex");
  store.submit(["a1", "b2"], { route: "/", url: "http://localhost:5173/" });
  await expect.poll(() => replies.has(3), { timeout: 10000 }).toBe(true);
  const batch = replies.get(3).result.content[0].text;
  expect(batch).toContain("SUBMITTED 2 note(s)");
  expect(batch).toContain("Make the heading smaller");
  expect(store.read().notes.every((n) => n.pickedUpAt)).toBe(true);
  await expect.poll(() => store.watching()).toBe(false);

  const working = await rpc(4, "tools/call", { name: "update_notes", arguments: { notes: [1], status: "working", reply: "Shrinking it" } });
  expect(working.result.content[0].text).toBe("#1 working");
  await rpc(5, "tools/call", { name: "update_notes", arguments: { notes: ["#1", 2], status: "resolved", reply: "Done." } });
  expect(store.read().notes.map((n) => [n.n, n.status, n.reply])).toEqual([
    [1, "resolved", "Done."],
    [2, "resolved", "Done."],
  ]);
  const listed = await rpc(6, "tools/call", { name: "list_notes", arguments: {} });
  expect(listed.result.content[0].text).toBe("No open UI notes.");
  const bad = await rpc(7, "tools/call", { name: "update_notes", arguments: { notes: [9], status: "resolved" } });
  expect(bad.result.isError).toBe(true);
  proc.stdin.end();
  await new Promise((r) => proc.on("exit", r));
});

test("watch hands each batch over once", async () => {
  const { dir, store } = seeded();
  store.submit(["a1"], { route: "/" });
  const first = execFileSync("node", [CLI, "watch", "--once", "--dir", dir], { encoding: "utf8" });
  expect(first).toContain("Make the heading smaller");
  store.submit(["b2"], { route: "/" });
  const second = execFileSync("node", [CLI, "watch", "--once", "--dir", dir], { encoding: "utf8" });
  expect(second).toContain("Fix the typo");
  expect(second).not.toContain("Make the heading smaller");
});

test("init tells the project's agents once, in the files they already read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-init-"));
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Project\n\nUse pnpm.\n");
  fs.writeFileSync(path.join(dir, "vite.config.ts"), "export default {}\n");
  const out = execFileSync("node", [CLI, "init"], { cwd: dir, encoding: "utf8" });
  expect(out).toContain("CLAUDE.md: added");
  expect(out).toContain("Add the plugin to vite.config.ts");
  expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(false);
  const claude = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
  expect(claude).toMatch(/^# Project\n\nUse pnpm\.\n\n<!-- annotate-anything -->/);
  expect(execFileSync("node", [CLI, "init"], { cwd: dir, encoding: "utf8" })).toContain("already tells agents");
  expect(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8")).toBe(claude);

  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "aa-init-"));
  execFileSync("node", [CLI, "init"], { cwd: empty });
  expect(fs.readFileSync(path.join(empty, "AGENTS.md"), "utf8")).toContain("npx annotate-anything attach");
});

test("attach finds the notes folder below the agent's shell, names the agent, explains the loop and hands over the batch", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aa-attach-"));
  const { dir, store } = seeded();
  const nested = path.join(root, "apps", "web", ".annotations");
  fs.mkdirSync(path.dirname(nested), { recursive: true });
  fs.renameSync(dir, nested);
  const moved = new FileStore(nested);
  const env: NodeJS.ProcessEnv = { ...process.env, AI_AGENT: "codex_0-164_agent" };
  delete env.CLAUDECODE;
  const proc = spawn("node", [CLI, "attach"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (d) => (out += d));
  await expect.poll(() => out).toContain("Waiting for notes");
  expect(out).toContain(`attached as Codex to ${fs.realpathSync(nested)}`);
  expect(out).toContain("status <n> working");
  expect(moved.agent()).toBe("Codex");
  expect(moved.watching()).toBe(true);

  const second = await new Promise<{ code: number; err: string }>((r) => {
    const p2 = spawn("node", [CLI, "attach", "--agent", "Grok"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p2.stderr.on("data", (d) => (err += d));
    p2.on("exit", (code) => r({ code: code ?? 0, err }));
  });
  expect(second.code).toBe(3);
  expect(second.err).toContain("Another agent (Codex) is already attached");
  expect(moved.agent()).toBe("Codex");

  moved.submit(["a1"], { route: "/" });
  const code = await new Promise<number>((r) => proc.on("exit", (c) => r(c ?? 1)));
  expect(code).toBe(0);
  expect(out).toContain("Make the heading smaller");
  expect(moved.read().notes.find((n) => n.id === "a1")!.pickedUpAt).toBeTruthy();
  void store;
});

test("attach explains how to set things up when there are no notes to find", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "aa-none-"));
  fs.mkdirSync(path.join(empty, ".git"));
  let err = "";
  let code = 0;
  try {
    execFileSync("node", [CLI, "attach"], { cwd: empty, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e: any) {
    code = e.status;
    err = String(e.stderr);
  }
  expect(code).toBe(2);
  expect(err).toContain("No .annotations folder found");
});

test("the Next.js route answers in development and refuses in production", async () => {
  const { annotateRoute } = await import("../src/next");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-next-"));
  const before = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    const dev = await annotateRoute({ dir }).GET(new Request("http://localhost:3000/api/annotate/feedback", { headers: { host: "localhost:3000" } }));
    expect(dev.status).toBe(200);
    process.env.NODE_ENV = "production";
    const prod = await annotateRoute({ dir }).GET(new Request("http://localhost:3000/api/annotate/feedback"));
    expect(prod.status).toBe(404);
  } finally {
    process.env.NODE_ENV = before;
  }
});
