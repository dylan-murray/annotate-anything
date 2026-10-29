import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

export const DIR = path.join(os.tmpdir(), `annotate-anything-test-${process.pid}`);
process.env.AA_TEST_DIR ??= DIR;

export default defineConfig({
  testDir: "tests",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:5198", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: "npx vite --config fixture/vite.config.ts",
      url: "http://localhost:5198",
      env: { PORT: "5198", AA_DIR: process.env.AA_TEST_DIR },
      reuseExistingServer: false,
    },
    {
      command: `node dist/cli.js serve --port 5192 --dir ${process.env.AA_TEST_DIR}-serve --origin http://app.devbox.example:5193`,
      url: "http://localhost:5192",
      reuseExistingServer: false,
    },
    {
      command: "python3 -m http.server 5193 --bind 127.0.0.1 --directory fixture/plain",
      url: "http://127.0.0.1:5193/index.html",
      reuseExistingServer: false,
    },
    {
      command: "mkdir -p fixture-next/node_modules && ln -sfn ../.. fixture-next/node_modules/annotate-anything && cd fixture-next && ../node_modules/.bin/next dev -p 5191",
      url: "http://localhost:5191/api/annotate/feedback",
      env: { AA_DIR: process.env.AA_TEST_DIR + "-next", NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: "mkdir -p fixture-astro/node_modules && ln -sfn ../.. fixture-astro/node_modules/annotate-anything && cd fixture-astro && env -u AI_AGENT -u CLAUDECODE ../node_modules/.bin/astro dev --port 5187",
      url: "http://localhost:5187/__annotate/feedback",
      env: { AA_DIR: process.env.AA_TEST_DIR + "-astro", ASTRO_TELEMETRY_DISABLED: "1" },
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: "node fixture/static-server.mjs",
      url: "http://localhost:5197",
      env: { PORT: "5197", AA_DIR: process.env.AA_TEST_DIR + "-static" },
      reuseExistingServer: false,
    },
  ],
});
