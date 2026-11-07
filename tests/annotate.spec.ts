import fs from "node:fs";
import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { center, CLI, cli, DIR, load, note, open, reset, stored, trackErrors, ui } from "./helpers";

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  reset();
  errors = await trackErrors(page);
});

test.afterEach(() => {
  expect(errors, "console errors").toEqual([]);
});

test("adds no global listeners while closed with no notes, and only while there is something to track", async ({ page }) => {
  await page.addInitScript(() => {
    const live = new Map<string, number>();
    (window as any).__aaLive = live;
    const ours = () => /\/src\/annotator\.ts/.test(new Error().stack ?? "");
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: any[]) {
      if ((this === window || this === document) && ours()) live.set(type, (live.get(type) ?? 0) + 1);
      return add.call(this, type, ...(rest as [any]));
    };
    EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, ...rest: any[]) {
      if ((this === window || this === document) && ours()) live.set(type, (live.get(type) ?? 0) - 1);
      return remove.call(this, type, ...(rest as [any]));
    };
  });
  await load(page);
  const live = () => page.evaluate(() => [...(window as any).__aaLive.entries()].filter(([, n]: [string, number]) => n > 0).map(([t]: [string]) => t));
  expect(await live()).toEqual([]);
  await open(page);
  expect(await live()).toContain("keydown");
  await ui(page).launcher.click();
  expect(await live()).toEqual([]);
});

test("launcher drags, remembers its spot, resets on double-click, and a tiny move still opens it", async ({ page }) => {
  await load(page);
  const t = ui(page);
  const start = await center(t.launcher);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 2, start.y + 2);
  await page.mouse.up();
  await expect(t.toolbar).toBeVisible();
  await t.launcher.click();
  await expect(t.toolbar).toBeHidden();

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 150, start.y - 300, { steps: 8 });
  await page.mouse.up();
  await expect(t.toolbar).toBeHidden();
  const moved = await center(t.launcher);
  expect(Math.round(moved.x)).toBe(Math.round(start.x - 150));
  expect(Math.round(moved.y)).toBe(Math.round(start.y - 300));

  await page.reload();
  const after = await center(t.launcher);
  expect(Math.round(after.x)).toBe(Math.round(moved.x));
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.width - 100, height: vp.height });
  const resized = await center(t.launcher);
  expect(resized.x).toBeLessThan(after.x);

  await page.setViewportSize(vp);
  await t.launcher.dblclick();
  const back = await center(t.launcher);
  expect(Math.round(back.x)).toBe(Math.round(start.x));
  expect(Math.round(back.y)).toBe(Math.round(start.y));
});

test("pin, element and area notes save with ⌘↵ and show numbered marks", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "pin", page.getByTestId("hero-title"), "Pin on the title");
  await note(page, "element", page.locator(".lede"), "Shorter lede");
  await note(page, "area", page.getByTestId("card-pricing"), "Area over pricing");
  await expect(t.marks).toHaveCount(3);
  await expect(t.host.locator(".mark.k-pin")).toHaveCount(1);
  await expect(t.host.locator(".area:not(.drawing)")).toHaveCount(2);
  await expect(t.send).toContainText("3");
  await expect.poll(() => stored().notes.length).toBe(3);
  const kinds = stored().notes.map((n: any) => n.kind).sort();
  expect(kinds).toEqual(["area", "element", "pin"]);
  const el = stored().notes.find((n: any) => n.kind === "element");
  expect(el.targetText).toBe("Everything your team shipped this quarter, in one place.");
  expect(el.tag).toBe("p");
});

test("clicking away with unsaved text keeps the panel and says so; Esc steps back one level at a time", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await open(page);
  await t.tool("element").click();
  const title = await center(page.getByTestId("hero-title"));
  await page.mouse.click(title.x, title.y);
  await page.keyboard.type("Half a thought");
  await page.mouse.click(20, 400);
  await expect(t.panel).toBeVisible();
  await expect(t.panel.locator(".hint")).toHaveText("Save or press Esc first");
  await expect(t.textarea).toHaveValue("Half a thought");

  await page.keyboard.press("Escape");
  await expect(t.panel).toBeHidden();
  await expect(t.marks).toHaveCount(1);
  await expect(t.tool("element")).toHaveAttribute("aria-pressed", "true");

  await t.act("list").click();
  await expect(t.list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(t.list).toBeHidden();
  await expect(t.tool("element")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(t.tool("element")).toHaveAttribute("aria-pressed", "false");
  await expect(t.toolbar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(t.toolbar).toBeHidden();
});

test("Esc on an empty new note discards it", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await open(page);
  await t.tool("pin").click();
  const title = await center(page.getByTestId("hero-title"));
  await page.mouse.click(title.x, title.y);
  await expect(t.textarea).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(t.panel).toBeHidden();
  await expect(t.marks).toHaveCount(0);
});

test("typing in a note never reaches the page's own keyboard shortcuts", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    (window as any).__keys = [];
    document.addEventListener("keydown", (e) => (window as any).__keys.push(e.key));
  });
  const t = ui(page);
  await open(page);
  await t.tool("pin").click();
  const title = await center(page.getByTestId("hero-title"));
  await page.mouse.click(title.x, title.y);
  await page.keyboard.type("abc");
  expect(await page.evaluate(() => (window as any).__keys)).toEqual([]);
});

test("marks follow page scroll, nested scroll and re-renders that reorder elements", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.getByTestId("card-billing"), "Billing card");
  await page.getByTestId("scroller").scrollIntoViewIfNeeded();
  const row = page.locator(".scroller .row", { hasText: /^Activity row 3$/ });
  await note(page, "pin", row, "Row three");
  await page.keyboard.press("Escape");

  const billing = t.mark(1);
  const rowMark = t.mark(2);
  const near = async (mark: typeof billing, target: typeof row) => {
    const m = await mark.boundingBox();
    const b = await target.boundingBox();
    if (!m || !b) return false;
    const x = m.x + m.width / 2;
    const y = m.y + m.height / 2;
    return x > b.x - 30 && x < b.x + b.width + 30 && y > b.y - 30 && y < b.y + b.height + 30;
  };

  await page.evaluate(() => scrollBy(0, 120));
  await expect.poll(() => near(billing, page.getByTestId("card-billing"))).toBe(true);

  await page.getByTestId("scroller").evaluate((el) => (el.scrollTop = 60));
  await expect.poll(() => near(rowMark, row)).toBe(true);

  await page.evaluate(() => scrollTo(0, 0));
  await page.getByTestId("rerender").click();
  await expect.poll(() => near(billing, page.getByTestId("card-billing"))).toBe(true);
  await expect(billing).not.toHaveClass(/detached/);
  await page.getByTestId("rerender").click();
  await page.getByTestId("rerender").click();
  await expect.poll(() => near(billing, page.getByTestId("card-billing"))).toBe(true);
});

test("a mark dims when its element is removed and nothing takes its place", async ({ page }) => {
  await load(page);
  const t = ui(page);
  const exports = page.getByTestId("card-exports");
  await exports.scrollIntoViewIfNeeded();
  await note(page, "element", exports, "Exports card");
  await page.keyboard.press("Escape");
  await expect(t.mark(1)).not.toHaveClass(/detached/);
  await exports.evaluate((el) => el.remove());
  await expect(t.mark(1)).toHaveClass(/detached/);
});

for (const kind of ["drawer", "radix", "native"] as const) {
  test(`annotating inside an open ${kind} dialog never closes it, and its notes hide while it's closed`, async ({ page }) => {
    await load(page);
    const t = ui(page);
    const opener = { drawer: "Open drawer", radix: "Open Radix dialog", native: "Open native dialog" }[kind];
    const dialog = page.getByTestId({ drawer: "hui-drawer", radix: "radix-dialog", native: "native-dialog" }[kind]);
    const copy = dialog.locator({ drawer: ".drawer-copy", radix: ".radix-copy", native: ".native-copy" }[kind]);
    const closer = { drawer: "Close drawer", radix: "Close Radix", native: "Close native" }[kind];

    await page.getByRole("button", { name: opener }).click();
    await expect(dialog).toBeVisible();
    await t.launcher.click();
    await expect(t.toolbar).toBeVisible();
    await t.act("list").click();
    await t.act("list").click();
    await t.tool("element").click();
    const c = await center(copy);
    await page.mouse.move(c.x, c.y);
    await page.mouse.click(c.x, c.y);
    await expect(t.textarea).toBeFocused();
    await page.keyboard.type(`Note in ${kind}`);
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(dialog).toBeVisible();
    await expect(t.marks).toHaveCount(1);
    await expect(t.mark(1)).toBeVisible();

    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(t.toolbar).toBeHidden();
    await expect(dialog).toBeVisible();

    await page.getByRole("button", { name: closer }).click();
    await expect(dialog).toBeHidden();
    await expect(t.mark(1)).toBeHidden();

    await page.getByRole("button", { name: opener }).click();
    await expect(dialog).toBeVisible();
    await expect(t.mark(1)).toBeVisible();
    await expect(t.mark(1)).not.toHaveClass(/detached/);
  });
}

test("a note made in a dialog never shows up in a different dialog built the same way", async ({ page }) => {
  await load(page);
  const t = ui(page);
  const make = (title: string, body: string) =>
    page.evaluate(
      ([title, body]) => {
        const d = document.createElement("dialog");
        d.className = "made";
        d.innerHTML = `<form method="dialog"><h2>${title}</h2><p>${body}</p><button>Done</button></form>`;
        document.body.append(d);
        d.showModal();
      },
      [title, body],
    );
  const drop = () => page.evaluate(() => document.querySelectorAll("dialog.made").forEach((d) => ((d as HTMLDialogElement).close(), d.remove())));
  await make("Rename desk", "Pick a new name for this desk.");
  await note(page, "element", page.locator("dialog.made h2"), "Say which desk");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(t.mark(1)).toBeVisible();
  await drop();
  await expect(t.mark(1)).toBeHidden();
  await make("Delete session", "This stops the agent and closes its terminal.");
  await expect(page.locator("dialog.made h2")).toHaveText("Delete session");
  await page.waitForTimeout(300);
  await expect(t.mark(1)).toBeHidden();
  await drop();
  await make("Rename desk", "Pick a new name for this desk.");
  await expect(t.mark(1)).toBeVisible();
});

test("page marks stay hidden behind an open dialog", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.getByTestId("hero-title"), "Title note");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(t.mark(1)).toBeVisible();
  await page.getByRole("button", { name: "Open Radix dialog" }).click();
  await expect(t.mark(1)).toBeHidden();
  await page.getByRole("button", { name: "Close Radix" }).click();
  await expect(t.mark(1)).toBeVisible();
});

test("the notes list jumps to a note on another route", async ({ page }) => {
  await load(page, "/settings");
  const t = ui(page);
  await note(page, "element", page.getByTestId("workspace-name"), "Rename the label");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Home" }).click();
  await expect(page.getByTestId("hero-title")).toBeVisible();
  await expect(t.marks).toHaveCount(0);
  await t.act("list").click();
  await expect(t.list.locator("li")).toContainText("/settings");
  await t.list.locator("li").first().click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(t.panel).toBeVisible();
  await expect(t.panel).toContainText("Rename the label");
  await expect(t.mark(1)).toBeVisible();
});

test("send stamps notes, the agent's status and reply round-trip, and reopen/clear work", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.getByTestId("hero-title"), "Make the title smaller");
  await note(page, "element", page.locator(".lede"), "Tighten the lede");

  const watcher = spawn("node", [CLI, "watch", "--once", "--agent", "Claude", "--dir", DIR], { stdio: ["ignore", "pipe", "pipe"] });
  const exited = new Promise<number>((r) => watcher.on("exit", (c) => r(c ?? 1)));
  let out = "";
  watcher.stdout.on("data", (d) => (out += d));
  await expect.poll(() => fs.existsSync(`${DIR}/watcher.json`)).toBe(true);
  await page.waitForTimeout(300);

  await t.send.click();
  await expect(t.status).toContainText("Sent 2 notes to Claude");
  await expect(t.host.locator(".mark.sent")).toHaveCount(2);
  const code = await exited;
  expect(code).toBe(0);
  expect(out).toContain("SUBMITTED 2 note(s)");
  expect(out).toContain("Make the title smaller");
  expect(out).toContain("Tighten the lede");
  expect(stored().notes.every((n: any) => n.status === "sent" && n.sentAt && n.pickedUpAt)).toBe(true);
  const busy = t.host.locator(".toolbar .busy");
  await expect(busy).toContainText("Claude picked up 2 notes");
  await expect(t.launcher).toHaveClass(/busy/);

  cli("status", "1", "working", "--reply", "Shrinking the heading");
  await expect(busy).toContainText("Claude is working on 1 note · Shrinking the heading");
  await t.mark(1).click();
  await expect(t.panel.locator(".waiting")).toContainText("Shrinking the heading");
  cli("status", "1", "resolved", "--reply", "Dropped the title to 24px.");
  await expect(t.panel.locator(".reply")).toContainText("Dropped the title to 24px.");
  await expect(t.panel.locator(".reply b")).toHaveText("Claude");
  await expect(t.status).toContainText("Claude finished note 1.");
  await expect(t.host.locator(".mark.resolved")).toHaveCount(1);

  await t.act("reopen").click();
  await expect(t.textarea).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => stored().notes.find((n: any) => n.n === 1).status).toBe("open");
  await expect(t.send).toContainText("1");

  cli("status", "2", "resolved", "--reply", "Cut it to one line.");
  await expect(t.host.locator(".mark.resolved")).toHaveCount(1, { timeout: 8000 });
  await t.act("clear-done").click();
  await expect(t.marks).toHaveCount(1);
  await expect.poll(() => stored().notes.length).toBe(1);

  await t.act("list").click();
  await t.act("confirm-clear").click();
  await t.act("clear-all").click();
  await expect(t.marks).toHaveCount(0);
  await expect.poll(() => stored().notes.length).toBe(0);
  await page.reload();
  await expect(ui(page).launcher).toBeVisible();
  await page.waitForTimeout(500);
  await expect(ui(page).marks).toHaveCount(0);
});

test("a deleted note doesn't come back from the server", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.getByTestId("hero-title"), "Delete me");
  await expect.poll(() => stored().notes.length).toBe(1);
  await t.mark(1).click();
  await t.act("delete").click();
  await expect(t.marks).toHaveCount(0);
  await expect.poll(() => stored().notes.length).toBe(0);
  await page.reload();
  await page.waitForTimeout(600);
  await expect(ui(page).marks).toHaveCount(0);
});

test("host controls render in the toolbar and keep their own clicks", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.textContent = "Redesigned";
    b.className = "variant-toggle";
    b.addEventListener("click", () => (b.textContent = b.textContent === "Redesigned" ? "Original" : "Redesigned"));
    (window as any).annotateAnything.addControl(b);
  });
  await open(page);
  const toggle = page.locator("annotate-anything > button.variant-toggle");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveText("Original");
});

test("the server refuses cross-origin and oversized writes", async ({ request }) => {
  const cross = await request.post("/__annotate/feedback", { headers: { Origin: "http://evil.example", "Content-Type": "application/json" }, data: { notes: [] } });
  expect(cross.status()).toBe(403);
  const big = await request.post("/__annotate/feedback", { headers: { "Content-Type": "application/json" }, data: { notes: [], pad: "x".repeat(600 * 1024) } });
  expect(big.status()).toBe(413);
  const form = await request.post("/__annotate/feedback/status", { headers: { "Content-Type": "text/plain" }, data: "{}" });
  expect(form.status()).toBe(415);
});

test("notes reach inside open shadow roots and same-origin iframes, and follow the iframe's own scrolling", async ({ page }) => {
  await load(page, "/widgets");
  const t = ui(page);
  const shadowButton = page.locator("fixture-card").locator("button.act");
  await note(page, "element", shadowButton, "Rename this action");
  const frame = page.frameLocator("[data-testid=frame]");
  await page.getByTestId("frame").scrollIntoViewIfNeeded();
  await note(page, "element", frame.locator(".frame-copy"), "Shorter frame copy");
  await page.keyboard.press("Escape");
  await expect.poll(() => stored().notes.length).toBe(2);
  const [a, b] = [...stored().notes].sort((x: any, y: any) => x.n - y.n);
  expect(a.selector).toContain(" >>> ");
  expect(a.selector).toMatch(/button\.act$/);
  expect(a.targetText).toBe("Shadow action");
  expect(b.selector).toMatch(/iframe.* >>> p\.frame-copy/);

  const over = async (n: number, target: ReturnType<typeof page.locator>) => {
    const m = (await t.mark(n).boundingBox())!;
    const r = (await target.boundingBox())!;
    return Math.abs(m.x + m.width / 2 - r.x) < 4 && Math.abs(m.y + m.height / 2 - r.y) < 4;
  };
  await expect.poll(() => over(1, shadowButton)).toBe(true);
  await expect.poll(() => over(2, frame.locator(".frame-copy"))).toBe(true);

  await frame.locator("body").evaluate(() => scrollTo(0, 40));
  await expect.poll(() => over(2, frame.locator(".frame-copy"))).toBe(true);

  await page.reload();
  await expect(ui(page).marks).toHaveCount(2);
  await expect(ui(page).mark(1)).not.toHaveClass(/detached/);
  await expect(ui(page).mark(2)).not.toHaveClass(/detached/);
  await expect.poll(() => over(1, shadowButton)).toBe(true);
});

for (const route of ["/ssr", "/ssr-stream"]) {
  test(`the Vite plugin adds itself to server-rendered HTML (${route})`, async ({ page }) => {
    await load(page, route);
    await expect(page.locator("annotate-anything")).toHaveCount(1);
    await note(page, "element", page.locator(".lede"), "Server page note");
    await ui(page).send.click();
    await expect(ui(page).status).toContainText("Sent 1 note");
    expect(stored().notes.find((n: any) => n.comment === "Server page note").route).toBe(route);
  });
}

test("a note whose target sits past the screen edge still opens its panel on screen", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Tighten the lede");
  await page.locator(".lede").evaluate((el) => Object.assign((el as HTMLElement).style, { position: "fixed", left: "3000px", top: "80px" }));
  await t.act("list").click();
  await t.list.locator("li").first().click();
  await expect(t.panel).toBeVisible();
  await expect
    .poll(async () => {
      const b = (await t.panel.boundingBox())!;
      return b.x >= 0 && b.x + b.width <= page.viewportSize()!.width;
    })
    .toBe(true);
});

test("jumping to a note shows its latest state when an update lands during the jump", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await note(page, "element", page.locator(".lede"), "Tighten the lede");
  await t.send.click();
  await expect(t.host.locator(".mark.sent")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await t.act("list").click();

  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  let polled = () => {};
  const polling = new Promise<void>((r) => (polled = r));
  await page.route("**/__annotate/feedback", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    polled();
    await held;
    await route.continue();
  });
  await polling;
  cli("status", "1", "resolved", "--reply", "Tightened it.");
  await t.list.locator("li").first().click();
  release();
  await expect(t.panel.locator(".reply")).toContainText("Tightened it.");
});

test("a note inside an iframe finds its target when the iframe loads late", async ({ page }) => {
  await load(page, "/widgets");
  const frame = page.frameLocator("[data-testid=frame]");
  await page.getByTestId("frame").scrollIntoViewIfNeeded();
  await note(page, "element", frame.locator(".frame-copy"), "Shorter frame copy");
  await page.keyboard.press("Escape");
  await expect.poll(() => stored().notes.length).toBe(1);

  await page.route("**/frame.html", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.reload();
  await expect(ui(page).mark(1)).not.toHaveClass(/detached/);
});
