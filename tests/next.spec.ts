import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const DIR = process.env.AA_TEST_DIR + "-next";
const BASE = "http://localhost:5191";
const stored = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, "feedback.json"), "utf8")).notes as any[];
  } catch {
    return [];
  }
};

test.beforeEach(() => {
  for (const f of ["feedback.json", "submissions.jsonl"]) fs.rmSync(path.join(DIR, f), { force: true });
});

test("Next.js App Router: the route handler and <Annotate /> carry notes and replies, and the list jumps with the Next router", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/about");
  const host = page.locator("annotate-anything");
  await host.locator(".launcher").click();
  await host.locator(".tool[data-mode=element]").click();
  const b = (await page.locator(".lede").boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  await page.keyboard.type("Say more about the team");
  await page.keyboard.press("ControlOrMeta+Enter");
  await host.locator(".send").click();
  await expect(host.locator(".toolbar .status")).toContainText("Sent 1 note");
  expect(stored()).toMatchObject([{ route: "/about", status: "sent", comment: "Say more about the team" }]);

  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.locator("h1")).toHaveText("Next.js home");
  await expect(host.locator(".mark")).toHaveCount(0);

  execFileSync("node", [path.resolve("dist/cli.js"), "status", "1", "resolved", "--reply", "Added a paragraph about the team.", "--dir", DIR]);
  await host.locator("[data-act=list]").click();
  await host.locator(".list li").first().click();
  await expect(page).toHaveURL(BASE + "/about");
  await expect(page.locator("h1")).toHaveText("About");
  await expect(host.locator(".panel .reply")).toContainText("Added a paragraph about the team.", { timeout: 10000 });
  expect(errors).toEqual([]);
});
