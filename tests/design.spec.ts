import { expect, test, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { center, CLI, cli, DIR, load, note, open, reset, stored, ui } from "./helpers";

test.beforeEach(() => reset());

const token = (page: Page, name: string) =>
  ui(page).host.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);

const paint = (page: Page, color: string) =>
  page.evaluate((c) => {
    document.documentElement.style.background = c;
    document.body.style.background = c;
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      if (el.tagName !== "ANNOTATE-ANYTHING") el.style.background = "transparent";
    }
  }, color);

test("the bar matches the page behind it, whatever the system is set to", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await load(page);
  await expect.poll(() => token(page, "--aa-ink")).toBe("#ffffff");
  await paint(page, "rgb(12, 14, 20)");
  await expect.poll(() => token(page, "--aa-ink")).toBe("#1d2630");
  await paint(page, "oklch(0.97 0.01 90)");
  await expect.poll(() => token(page, "--aa-ink")).toBe("#ffffff");
});

test("a page with no background of its own follows the system, and apps can override the colors", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await load(page);
  await paint(page, "transparent");
  await expect.poll(() => token(page, "--aa-ink")).toBe("#ffffff");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => token(page, "--aa-ink")).toBe("#1d2630");
  await ui(page).host.evaluate((el) => (el as HTMLElement).style.setProperty("--aa-ink", "#123456"));
  expect(await token(page, "--aa-ink")).toBe("#123456");
});

test("the bar keeps its width when the tool or message changes", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await open(page);
  const width = () => t.toolbar.evaluate((el) => (el as HTMLElement).offsetWidth);
  const first = await width();
  for (const mode of ["pin", "element", "area"] as const) {
    await t.tool(mode).click();
    expect(await width()).toBe(first);
  }
  await page.keyboard.press("Escape");
  expect(await width()).toBe(first);
});

test("every note kind has a round mark, and a pin centers on the spot that was clicked", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await open(page);
  await t.tool("pin").click();
  const target = page.getByTestId("hero-title");
  const spot = await center(target);
  await page.mouse.click(spot.x, spot.y);
  const fresh = await t.host.locator(".mark[data-id=new]").boundingBox();
  expect(Math.abs(fresh!.x + fresh!.width / 2 - spot.x)).toBeLessThan(1.5);
  expect(Math.abs(fresh!.y + fresh!.height / 2 - spot.y)).toBeLessThan(1.5);
  await page.keyboard.press("Escape");
  await note(page, "pin", target, "Pin");
  await note(page, "element", page.locator(".lede"), "Element");
  await note(page, "area", page.getByTestId("card-pricing"), "Area");
  await t.send.click();
  await expect(t.host.locator(".mark.sent")).toHaveCount(3);
  cli("status", "3", "resolved", "--reply", "Done");
  await expect(t.host.locator(".mark.resolved")).toHaveCount(1, { timeout: 8000 });
  for (const mark of await t.marks.all()) {
    const box = (await mark.boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  }
});

test("a selected done note keeps a readable check", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Shorter lede");
  await t.send.click();
  await expect(t.host.locator(".mark.sent")).toHaveCount(1);
  cli("status", "1", "resolved", "--reply", "Done");
  const done = t.host.locator(".mark.resolved");
  await expect(done).toHaveCount(1, { timeout: 8000 });
  await done.evaluate((el) => (el as HTMLElement).click());
  await expect(t.panel).toBeVisible();
  await expect(done).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("delete is a labelled trash button", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Delete me");
  await t.mark(1).click();
  const trash = t.panel.getByRole("button", { name: "Delete note" });
  await expect(trash).toBeVisible();
  await expect(trash).toHaveText("");
  await expect(trash.locator("svg")).toBeVisible();
});

test("a note that gets finished bursts once, and only when it changes", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Shorter lede");
  await t.send.click();
  await expect(t.host.locator(".mark.sent")).toHaveCount(1);
  cli("status", "1", "resolved", "--reply", "Done");
  await expect(t.host.locator(".burst")).toHaveCount(1, { timeout: 8000 });
  await expect(t.host.locator(".burst")).toHaveCount(0, { timeout: 2000 });
  await page.reload();
  await open(page);
  await expect(t.host.locator(".mark.resolved")).toHaveCount(1);
  await page.waitForTimeout(1000);
  await expect(t.host.locator(".burst")).toHaveCount(0);
});

test("the selected tool slides, and motion stops when the system asks", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await open(page);
  await t.tool("pin").click();
  await t.tool("element").click();
  expect(await t.tool("element").evaluate((el) => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  await t.tool("pin").click();
  expect(await t.tool("pin").evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
});

test("the toolbar stays on screen at any width", async ({ page }) => {
  await load(page);
  await open(page);
  const box = (await ui(page).toolbar.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("clicking the empty page says why nothing happened", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    for (const el of [...document.body.children]) if (el.tagName !== "ANNOTATE-ANYTHING" && el.tagName !== "SCRIPT") (el as HTMLElement).style.display = "none";
  });
  const t = ui(page);
  await open(page);
  await t.tool("pin").click();
  await page.mouse.click(30, 200);
  await expect(t.status).toContainText("Nothing here to note");
  await expect(t.panel).toBeHidden();
});

const holdSend = async (page: Page) => {
  let release = () => {};
  const gate = new Promise<void>((r) => (release = r));
  await page.route("**/feedback/submit", async (route) => {
    await gate;
    await route.continue();
  });
  return release;
};

test("sending leaves the pencil and the tools where they were", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Shorter lede");
  await open(page);
  await page.waitForTimeout(800);
  const pencil = () => t.launcher.evaluate((el) => {
    const l = el as HTMLElement;
    return [l.offsetLeft, l.offsetTop, l.offsetWidth, l.offsetHeight];
  });
  const pinTool = async () => (await t.tool("pin").boundingBox())!;
  const before = { pencil: await pencil(), tool: await pinTool(), width: (await t.toolbar.boundingBox())!.width };
  const release = await holdSend(page);
  await t.send.click();
  await expect(t.send).toBeDisabled();
  await t.host.locator(".launcher.busy").waitFor();
  const during = { pencil: await pencil(), tool: await pinTool(), width: (await t.toolbar.boundingBox())!.width };
  release();
  await expect(t.host.locator(".mark.sent")).toHaveCount(1);
  expect(during.pencil).toEqual(before.pencil);
  expect(during.tool).toEqual(before.tool);
  expect(during.width).toBe(before.width);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  expect(await pencil()).toEqual(before.pencil);
  expect(await pinTool()).toEqual(before.tool);
});

test("polling does not restart the spinners or rebuild the bar", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Shorter lede");
  await open(page);
  await t.send.click();
  await expect(t.host.locator(".mark.sent")).toHaveCount(1);
  await page.waitForTimeout(6000);
  await t.host.evaluate((el) => {
    const root = el.shadowRoot!;
    (window as unknown as { kept: Element[] }).kept = [root.querySelector(".mark.sent")!, root.querySelector(".tool[data-mode=pin]")!];
  });
  await page.waitForTimeout(4500);
  const same = await t.host.evaluate((el) => {
    const root = el.shadowRoot!;
    const kept = (window as unknown as { kept: Element[] }).kept;
    return [kept[0] === root.querySelector(".mark.sent"), kept[1] === root.querySelector(".tool[data-mode=pin]")];
  });
  expect(same).toEqual([true, true]);
});

test("marks stay circles with their spinner at any number", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "pin", page.getByTestId("hero-title"), "Seed");
  await open(page);
  await t.send.click();
  await expect(t.host.locator(".mark.sent")).toHaveCount(1);
  const seed = stored().notes[0];
  const notes = [9, 10, 88, 100, 999, 1000].map((n, i) => ({ ...seed, id: `0000000${i}-0000-4000-8000-000000000000`, n, y: seed.y + (i + 1) * 30 }));
  fs.writeFileSync(path.join(DIR, "feedback.json"), JSON.stringify({ version: 1, notes, deleted: [seed.id] }));
  await page.reload();
  await expect(t.host.locator(".mark.sent")).toHaveCount(6);
  const shapes = await t.marks.evaluateAll((els) =>
    els.map((el) => {
      const after = getComputedStyle(el, "::after");
      const span = el.querySelector("span")!;
      return { w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight, rw: after.width, rh: after.height, text: span.getBoundingClientRect().width };
    }),
  );
  for (const s of shapes) {
    expect(s.w).toBe(22);
    expect(s.h).toBe(22);
    expect(s.rw).toBe(s.rh);
    expect(s.text).toBeLessThanOrEqual(18);
  }
});

test("a note's panel sits above the pencil when they overlap", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await open(page);
  await page.waitForTimeout(400);
  const pencil = (await t.launcher.boundingBox())!;
  const center = { x: pencil.x + pencil.width / 2, y: pencil.y + pencil.height / 2 };
  const width = Math.min(300, page.viewportSize()!.width - 16);
  await t.tool("pin").click();
  await page.mouse.click(Math.max(30, center.x - width - 4), center.y);
  await expect(t.panel).toBeVisible();
  const box = (await t.panel.boundingBox())!;
  expect(box.x).toBeLessThan(center.x);
  expect(box.x + box.width).toBeGreaterThan(center.x);
  expect(box.y).toBeLessThan(center.y);
  expect(box.y + box.height).toBeGreaterThan(center.y);
  const onTop = await t.host.evaluate((el, p) => !!el.shadowRoot!.elementFromPoint(p.x, p.y)?.closest(".panel"), center);
  expect(onTop).toBe(true);
});

test("clicking a mark leaves a collapsed bar collapsed", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Shorter lede");
  await expect.poll(() => stored().notes.length).toBe(1);
  await page.reload();
  await expect(t.marks).toHaveCount(1);
  await expect(t.toolbar).toBeHidden();

  await t.mark(1).click();
  await expect(t.panel).toBeVisible();
  await expect(t.toolbar).toBeHidden();
  await expect(t.launcher).not.toHaveClass(/\bon\b/);
  await page.keyboard.press("Escape");
  await expect(t.panel).toBeHidden();
  await expect(t.toolbar).toBeHidden();

  await t.mark(1).click();
  await page.mouse.click(5, 5);
  await expect(t.panel).toBeHidden();
  await expect(t.toolbar).toBeHidden();

  await t.mark(1).click();
  await page.evaluate(() => new Promise((r) => setTimeout(r)));
  await t.textarea.fill("Edited while collapsed");
  await t.act("save").click();
  await expect(t.panel).toBeHidden();
  await expect(t.toolbar).toBeHidden();
  await expect.poll(() => stored().notes[0].comment).toBe("Edited while collapsed");

  await t.mark(1).click();
  await t.launcher.click({ force: true });
  await expect(t.toolbar).toBeVisible();
});

test("with no agent attached, a small button copies a prompt, until one attaches", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await load(page);
  const t = ui(page);
  await open(page);
  await expect(t.status).toContainText("No agent attached");
  const copy = t.status.getByRole("button", { name: "Copy prompt for your agent" });
  await copy.click();
  await expect(t.status.getByRole("button", { name: "Copied" })).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("npx annotate-anything attach");
  await expect(copy).toHaveText("Copy prompt", { timeout: 3000 });

  await note(page, "element", page.locator(".lede"), "Shorter lede");
  await t.send.click();
  await expect(t.host.locator(".mark.sent")).toHaveCount(1);
  await expect(t.toolbar.locator(".busy")).toHaveCount(0);
  await expect(t.status.getByRole("button", { name: "Copy prompt for your agent" })).toBeVisible();
  await t.mark(1).click();
  await t.panel.getByRole("button", { name: "Copy prompt for your agent" }).click();
  await expect(t.panel.getByRole("button", { name: "Copied" })).toBeVisible();
  await page.keyboard.press("Escape");

  const agent = spawn("node", [CLI, "watch", "--dir", DIR, "--timeout", "25"], { stdio: "ignore" });
  try {
    await expect(t.status.getByRole("button")).toHaveCount(0, { timeout: 15000 });
  } finally {
    agent.kill();
  }
});
