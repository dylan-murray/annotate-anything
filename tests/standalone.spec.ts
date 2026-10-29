import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { deliver } from "../src/server/agent-desk";
import type { Note, Submission } from "../src/types";

test("one script tag and the plain Node middleware are enough", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dir = process.env.AA_TEST_DIR + "-static";
  fs.rmSync(dir, { recursive: true, force: true });
  await page.goto("http://localhost:5197/");
  const host = page.locator("annotate-anything");
  await host.locator(".launcher").click();
  await host.locator(".tool[data-mode=element]").click();
  const b = (await page.locator("#headline").boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  await page.keyboard.type("Headline is too formal");
  await page.keyboard.press("ControlOrMeta+Enter");
  await host.locator(".send").click();
  await expect(host.locator(".toolbar .status")).toContainText("Sent 1 note");
  const stored = JSON.parse(fs.readFileSync(path.join(dir, "feedback.json"), "utf8"));
  expect(stored.notes[0]).toMatchObject({ selector: "h1#headline", comment: "Headline is too formal", status: "sent" });
  expect(fs.readFileSync(path.join(dir, "submissions.jsonl"), "utf8")).toContain("Headline is too formal");
  expect(errors).toEqual([]);
});

test("copy mode puts the notes on the clipboard and never calls them sent", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("http://localhost:5197/copy");
  const host = page.locator("annotate-anything");
  await host.locator(".launcher").click();
  await expect(host.locator(".toolbar .status")).toContainText("Copy mode");
  await host.locator(".tool[data-mode=element]").click();
  const b = (await page.locator(".intro").boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  await page.keyboard.type("Say which middleware");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(host.locator(".send")).toHaveText(/Copy/);
  await host.locator(".send").click();
  await expect(host.locator(".toolbar .status")).toContainText("Copied 1 note to the clipboard");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Say which middleware");
  expect(copied).toContain("p.intro");
  await expect(host.locator(".mark.open")).toHaveCount(1);
  await expect(host.locator(".mark.sent")).toHaveCount(0);
});

test("Agent Desk delivery sends the token from the desk's data folder and words the prompt", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-desk-"));
  let seen: { headers: http.IncomingHttpHeaders; body: any } | null = null;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seen = { headers: req.headers, body: JSON.parse(raw) };
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ sent: true, target_id: "ui-agent" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  fs.writeFileSync(path.join(dataDir, `.terminal-token-${port}`), "secret-token\n");
  const note = { id: "n1", n: 3, kind: "element", route: "/settings", comment: "Rename this label", selector: "label[for=name]", tag: "label" } as Note;
  const submission = { id: "abc123", url: "http://localhost:5173/settings", route: "/settings" } as Submission;
  const result = await deliver({ url: `http://127.0.0.1:${port}`, target: "ui-agent", dataDir }, [note], submission, "/repo/.annotations/feedback.json", "/repo");
  server.close();
  expect(result).toEqual({ to: "Agent Desk session ui-agent", ok: true });
  expect(seen!.headers["x-agent-desk-terminal"]).toBe("secret-token");
  expect(seen!.body).toMatchObject({ request_id: "aa-abc123", target_id: "ui-agent", notes: [{ id: "n1", note: "#3 Rename this label" }] });
  expect(seen!.body.prompt).toContain("#3 element on /settings (label[for=name]): Rename this label");
  expect(seen!.body.prompt).toContain("npx annotate-anything status <n> resolved");
});

test("Agent Desk delivery explains a missing token instead of throwing", async () => {
  const result = await deliver({ url: "http://127.0.0.1:59999", target: "x", dataDir: os.tmpdir() + "/nope" }, [], { id: "a" } as Submission, "f", "r");
  expect(result.ok).toBe(false);
  expect(result.detail).toContain("no Agent Desk token");
});
