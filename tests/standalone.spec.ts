import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createCore, type CoreOptions } from "../src/server/core";

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

function post(core: ReturnType<typeof createCore>, url: string, body: unknown) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": "application/json", host: "localhost" };
  return core.handle({ method: "POST", url, header: (h) => headers[h], body: () => Promise.resolve(raw) }).then((r) => JSON.parse(r!.body));
}

async function sendOne(onSubmit: CoreOptions["onSubmit"]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-hook-"));
  const core = createCore({ dir, onSubmit });
  const note = { id: "n1", n: 3, kind: "element", route: "/settings", comment: "Rename this label", selector: "label[for=name]", tag: "label", createdAt: new Date().toISOString() };
  await post(core, "/__annotate/feedback", { notes: [note], deleted: [] });
  const res = await post(core, "/__annotate/feedback/submit", { noteIds: ["n1"], url: "http://localhost:5173/settings", route: "/settings" });
  return { res, stored: core.store.read().notes[0]! };
}

test("onSubmit gets each sent batch and the page hears where it went", async () => {
  let batch: Parameters<NonNullable<CoreOptions["onSubmit"]>>[0] | undefined;
  const { res, stored } = await sendOne((b) => {
    batch = b;
    return { to: "the review bot", ok: true };
  });
  expect(batch!.notes).toMatchObject([{ id: "n1", comment: "Rename this label", status: "sent" }]);
  expect(batch!.submission).toMatchObject({ noteIds: ["n1"], route: "/settings" });
  expect(batch!.file).toMatch(/feedback\.json$/);
  expect(res.delivery).toEqual({ to: "the review bot", ok: true });
  expect(stored.pickedUpAt).toBeTruthy();
});

test("a failing onSubmit is reported, and the notes stay sent for a watcher", async () => {
  const { res, stored } = await sendOne(() => {
    throw new Error("webhook returned 502");
  });
  expect(res.delivery).toEqual({ to: "The onSubmit hook", ok: false, detail: "webhook returned 502" });
  expect(stored).toMatchObject({ status: "sent" });
  expect(stored.pickedUpAt).toBeFalsy();
});

test("a picked target reaches the hook with a handoff that reports back to this notes folder", async () => {
  let batch: Parameters<NonNullable<CoreOptions["onSubmit"]>>[0] | undefined;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-target-"));
  const core = createCore({ dir, command: "aa", targets: () => [{ id: "s1", label: "UI agent" }], onSubmit: (b) => ((batch = b), { to: b.agent!, ok: true }) });
  const listed = await core.handle({ method: "GET", url: "/__annotate/targets", header: (h) => ({ host: "localhost" })[h], body: () => Promise.resolve("") });
  expect(JSON.parse(listed!.body)).toEqual({ targets: [{ id: "s1", label: "UI agent" }] });
  const note = { id: "n1", n: 1, kind: "element", route: "/", comment: "Tighten the header", selector: "header", tag: "header", createdAt: new Date().toISOString() };
  await post(core, "/__annotate/feedback", { notes: [note], deleted: [] });
  const res = await post(core, "/__annotate/feedback/submit", { noteIds: ["n1"], route: "/", target: "s1", agent: "UI agent" });
  expect(batch).toMatchObject({ target: "s1", agent: "UI agent" });
  expect(batch!.prompt).toContain("#1 element on / (header): Tighten the header");
  expect(batch!.prompt).toContain(`aa status <n> working --dir '${dir}' --agent 'UI agent'`);
  expect(res.delivery).toEqual({ to: "UI agent", ok: true });
  expect(res.handoff).toBeUndefined();
  expect(core.store.agent()).toBe("UI agent");
});

test("without a hook, a picked target gets the handoff back for the server in front to deliver", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aa-front-"));
  const core = createCore({ dir });
  const note = { id: "n1", n: 1, kind: "pin", route: "/", comment: "Move this", tag: "", createdAt: new Date().toISOString() };
  await post(core, "/__annotate/feedback", { notes: [note], deleted: [] });
  const res = await post(core, "/__annotate/feedback/submit", { noteIds: ["n1"], route: "/", target: "s1" });
  expect(res.handoff).toContain("npx annotate-anything status <n> resolved");
});

test("when the server offers agents, Send asks which one and says where the notes went", async ({ page, request }) => {
  fs.rmSync(process.env.AA_TEST_DIR + "-static-agents", { recursive: true, force: true });
  await page.goto("http://localhost:5197/agents");
  const host = page.locator("annotate-anything");
  await host.locator(".launcher").click();
  await expect(host.locator(".toolbar .status")).toContainText("Send lets you pick an agent");
  await host.locator(".tool[data-mode=element]").click();
  const b = (await page.locator("#headline").boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  await page.keyboard.type("Shorter headline");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(host.locator(".send.more")).toHaveCount(0);
  await host.locator(".send").click();
  await expect(host.locator(".phead")).toHaveText("Send to");
  await expect(host.locator("li[data-target]")).toHaveText([/UI agent.*fixture · Claude/, /API agent/]);
  await expect(host.locator("li[data-target]").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(host.locator(".pick")).toHaveCount(0);
  await host.locator(".send").click();
  await host.locator("li[data-target]", { hasText: "API agent" }).click();
  await expect(host.locator(".toolbar .status")).toContainText("Sent 1 note to API agent.");
  await expect(host.locator(".toolbar .busy")).toContainText("API agent picked up 1 note");
  const delivered = await (await request.get("http://localhost:5197/delivered")).json();
  expect(delivered.at(-1).target).toBe("api");
  expect(delivered.at(-1).prompt).toContain("Shorter headline");
  const p = (await page.locator(".intro").boundingBox())!;
  await page.mouse.click(p.x + 20, p.y + p.height / 2);
  await page.keyboard.type("Second note");
  await page.keyboard.press("ControlOrMeta+Enter");
  const main = host.locator('.send[data-act="send"]');
  await expect(main).toHaveText(/Send to API agent\s*1/);
  await host.locator(".send.more").click();
  await expect(host.locator("li[data-target]").first()).toHaveText(/API agent/);
  await expect(host.locator('li[aria-current="true"]')).toHaveText(/API agent/);
  await host.locator(".send.more").click();
  await expect(host.locator(".pick")).toHaveCount(0);
  await main.click();
  await expect(host.locator(".toolbar .status")).toContainText("Sent 1 note to API agent.");
  expect((await (await request.get("http://localhost:5197/delivered")).json()).at(-1).prompt).toContain("Second note");
});

test("the standalone server answers only on this machine and only to local host names", async () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  if (lan) await expect(fetch(`http://${lan}:5192/__annotate/feedback`)).rejects.toThrow();
  const get = (host: string) =>
    new Promise<number>((resolve, reject) =>
      http.get({ host: "127.0.0.1", port: 5192, path: "/__annotate/feedback", headers: { host } }, (r) => resolve(r.statusCode!)).on("error", reject),
    );
  expect(await get("localhost:5192")).toBe(200);
  expect(await get("[::1]:5192")).toBe(200);
  expect(await get("app.devbox.example:5192")).toBe(200);
  expect(await get("attacker.example:5192")).toBe(403);
});
