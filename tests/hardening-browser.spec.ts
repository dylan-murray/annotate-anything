import { expect, test } from "@playwright/test";
import { load, open, reset, stored, ui } from "./helpers";
import { noteAndSend } from "./serve-helpers";

test.skip(({ viewport }) => (viewport?.width ?? 0) < 600, "not about the viewport");
test.beforeEach(() => reset());

const addNote = async (page: Parameters<typeof load>[0]) => {
  const t = ui(page);
  await open(page);
  await t.tool("element").click();
  const b = (await page.locator("h1").first().boundingBox())!;
  await page.mouse.click(b.x + 10, b.y + b.height / 2);
  await page.keyboard.type("Fixture note");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(t.marks).toHaveCount(1);
};

test("notes the server didn't get are not marked sent", async ({ page }) => {
  await load(page);
  const t = ui(page);
  await page.route("**/__annotate/feedback", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, body: "disk full" }) : route.continue()));
  await addNote(page);
  await t.send.click();
  await expect(t.status).toContainText("Send failed");
  await expect(t.status).toContainText("still here");
  await expect(t.marks.first()).not.toHaveClass(/\bsent\b/);
  await page.unroute("**/__annotate/feedback");
  await t.send.click();
  await expect(t.status).toContainText("Sent 1 note");
  expect(stored().notes[0].status).toBe("sent");
});

test("a destroyed bar stays gone and leaves Escape alone", async ({ page }) => {
  await load(page);
  await open(page);
  let release = () => {};
  const held = new Promise<void>((r) => (release = r));
  let pushes = 0;
  await page.route("**/__annotate/feedback", async (route) => {
    if (route.request().method() === "POST") pushes++;
    await held;
    await route.continue().catch(() => {});
  });
  const seen = await page.evaluate(async () => {
    const w = window as unknown as { annotateAnything: { destroy(): void } };
    w.annotateAnything.destroy();
    let escape = false;
    document.addEventListener("keydown", (e) => (escape = e.key === "Escape"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return { escape, host: !!document.querySelector("annotate-anything") };
  });
  expect(seen).toEqual({ escape: true, host: false });
  release();
  await page.waitForTimeout(600);
  expect(await page.locator("annotate-anything").count()).toBe(0);
  const before = pushes;
  await page.waitForTimeout(500);
  expect(pushes).toBe(before);
});

test("a server shared by two apps keeps their notes apart", async ({ page }) => {
  await page.goto("http://127.0.0.1:5193/index.html");
  await noteAndSend(page, ".title", "Only for the first app");
  await page.goto("http://localhost:5193/index.html");
  const host = page.locator("annotate-anything");
  await expect(host.locator(".launcher")).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(host.locator(".mark")).toHaveCount(0);
});
