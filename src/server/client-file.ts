import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The built script-tag bundle sits next to the built server code in dist/.
export function clientBundle(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const p of [path.join(here, "annotate-anything.iife.js"), path.join(here, "../../dist/annotate-anything.iife.js")]) {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {}
  }
  return null;
}
