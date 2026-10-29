import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

import { noteAndSend, SERVE_DIR as DIR, stored } from "./serve-helpers";

test.beforeEach(() => {
  for (const f of ["feedback.json", "submissions.jsonl"]) fs.rmSync(path.join(DIR, f), { force: true });
});

test("a page from a non-Node backend uses the standalone server through one script tag", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5193/index.html");
  await noteAndSend(page, ".title", "Shorter title");
  expect(stored()).toMatchObject([{ comment: "Shorter title", status: "sent", route: "/index.html" }]);
  expect(errors).toEqual([]);
});

test("the bookmarklet adds the tool to a page with no annotate code", async ({ page, request }) => {
  const help = await (await request.get("http://localhost:5192/")).text();
  const href = help.match(/class="bm" href="([^"]+)"/)![1]!.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<");
  expect(href.startsWith("javascript:")).toBe(true);
  await page.goto("http://127.0.0.1:5193/bare.html");
  await expect(page.locator("annotate-anything")).toHaveCount(0);
  await page.evaluate((code) => new Function(code)(), href.slice("javascript:".length));
  await expect(page.locator("annotate-anything .launcher")).toBeVisible();
  await noteAndSend(page, ".lede", "Explain the bookmarklet");
  expect(stored()[0]!.comment).toBe("Explain the bookmarklet");
  await page.evaluate((code) => new Function(code)(), href.slice("javascript:".length));
  await expect(page.locator("annotate-anything")).toHaveCount(1);
});

test("the standalone server refuses pages from origins it wasn't told about", async ({ request }) => {
  const res = await request.post("http://localhost:5192/__annotate/feedback", {
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    data: { notes: [] },
  });
  expect(res.status()).toBe(403);
  const pre = await request.fetch("http://localhost:5192/__annotate/feedback", { method: "OPTIONS", headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST" } });
  expect(pre.status()).toBe(204);
  expect(pre.headers()["access-control-allow-origin"]).toBe("http://localhost:3000");
});
