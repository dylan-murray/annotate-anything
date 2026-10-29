import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const SERVE_DIR = process.env.AA_TEST_DIR + "-serve";
const DIR = SERVE_DIR;
export const stored = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, "feedback.json"), "utf8")).notes as { comment: string; status: string; route: string }[];
  } catch {
    return [];
  }
};

export async function noteAndSend(page: Page, selector: string, text: string) {
  const host = page.locator("annotate-anything");
  await host.locator(".launcher").click();
  await host.locator(".tool[data-mode=element]").click();
  const b = (await page.locator(selector).boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+Enter");
  await host.locator(".send").click();
  await expect(host.locator(".toolbar .status")).toContainText("Sent 1 note");
}

