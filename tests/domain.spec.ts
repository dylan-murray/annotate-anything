import { expect, test } from "@playwright/test";
import { noteAndSend, stored } from "./serve-helpers";

test.use({ launchOptions: { args: ["--host-resolver-rules=MAP app.devbox.example 127.0.0.1"] } });

test("starts on a custom local domain and sends when the server allows it with --origin", async ({ page }) => {
  await page.goto("http://app.devbox.example:5193/index.html");
  await noteAndSend(page, ".lede", "Custom domain works");
  expect(stored().at(-1)!.comment).toBe("Custom domain works");
});
