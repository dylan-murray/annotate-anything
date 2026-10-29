import fs from "node:fs";
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
