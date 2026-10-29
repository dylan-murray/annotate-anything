import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const DIR = process.env.AA_TEST_DIR + "-astro";

test("Astro: the Vite plugin adds the tool to Astro's server-rendered pages", async ({ page }) => {
  for (const f of ["feedback.json", "submissions.jsonl"]) fs.rmSync(path.join(DIR, f), { force: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5187/");
  const host = page.locator("annotate-anything");
  await host.locator(".launcher").click();
  await host.locator(".tool[data-mode=element]").click();
  const b = (await page.locator(".lede").boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  await page.keyboard.type("Astro note");
  await page.keyboard.press("ControlOrMeta+Enter");
  await host.locator(".send").click();
  await expect(host.locator(".toolbar .status")).toContainText("Sent 1 note");
  const notes = JSON.parse(fs.readFileSync(path.join(DIR, "feedback.json"), "utf8")).notes;
  expect(notes).toMatchObject([{ comment: "Astro note", route: "/", status: "sent" }]);
  expect(errors).toEqual([]);
});
