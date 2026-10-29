import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, type Locator, type Page } from "@playwright/test";

export const DIR = process.env.AA_TEST_DIR!;
export const CLI = path.resolve("dist/cli.js");

export function reset() {
  fs.rmSync(DIR, { recursive: true, force: true });
}

export function cli(...args: string[]): string {
  return execFileSync("node", [CLI, ...args, "--dir", DIR], { encoding: "utf8" });
}

export function stored() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, "feedback.json"), "utf8"));
  } catch {
    return { notes: [], deleted: [] };
  }
}

export const ui = (page: Page) => {
  const host = page.locator("annotate-anything");
  return {
    host,
    launcher: host.locator(".launcher"),
    toolbar: host.locator(".toolbar"),
    panel: host.locator(".panel"),
    textarea: host.locator(".panel textarea"),
    status: host.locator(".toolbar .status"),
    marks: host.locator(".mark:not([data-id=new])"),
    mark: (n: number | string) => host.locator(`.mark:not([data-id=new])`, { hasText: String(n) }),
    tool: (mode: "pin" | "element" | "area") => host.locator(`.tool[data-mode=${mode}]`),
    act: (a: string) => host.locator(`[data-act="${a}"]`),
    send: host.locator(".send"),
    list: host.locator(".list"),
  };
};

export async function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

export async function load(page: Page, url = "/") {
  await page.goto(url);
  await expect(ui(page).launcher).toBeVisible();
}

export async function open(page: Page) {
  const t = ui(page);
  if (!(await t.toolbar.isVisible())) await t.launcher.click();
  await expect(t.toolbar).toBeVisible();
}

export async function center(target: Locator) {
  const b = await target.boundingBox();
  if (!b) throw new Error("target has no box");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

export async function note(page: Page, kind: "pin" | "element" | "area", target: Locator, text: string) {
  const t = ui(page);
  await open(page);
  if ((await t.tool(kind).getAttribute("aria-pressed")) !== "true") await t.tool(kind).click();
  await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const { x, y, box } = await center(target);
  if (kind === "area") {
    await page.mouse.move(box.x + 4, box.y + 4);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(box.width - 4, 80), box.y + Math.min(box.height - 4, 40), { steps: 4 });
    await page.mouse.up();
  } else await page.mouse.click(x, y);
  await expect(t.textarea).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(t.panel).toBeHidden();
}
