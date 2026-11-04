import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const work = mkdtempSync(join(tmpdir(), "aa-package-"));
const npm = (args, cwd) => execFileSync("npm", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

try {
  const [packed] = JSON.parse(npm(["pack", "--json", "--ignore-scripts", "--pack-destination", work], root));
  const files = packed.files.map((f) => f.path);
  const stray = files.filter((f) => !/^(dist\/|agent\/|package\.json$|README\.md$|LICENSE$)/.test(f));
  if (stray.length) throw new Error(`Unexpected files in the package: ${stray.join(", ")}`);
  if (pkg.private) throw new Error("package.json is still private");

  const app = join(work, "app");
  execFileSync("mkdir", [app]);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", private: true, type: "module" }));
  npm(["install", "--no-audit", "--no-fund", join(work, packed.filename)], app);

  const installed = join(app, "node_modules", "annotate-anything");
  const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
  for (const [name, entry] of Object.entries(manifest.exports)) {
    for (const target of typeof entry === "string" ? [entry] : Object.values(entry)) {
      readFileSync(join(installed, target));
    }
    if (name === "./script" || name === "./next" || name === "./next/client" || name === "./react") continue;
    await import(pathToFileURL(join(installed, entry.default ?? entry)).href);
  }

  const cli = join(app, "node_modules", ".bin", "annotate-anything");
  const version = execFileSync(cli, ["--version"], { cwd: app, encoding: "utf8" }).trim();
  if (version !== pkg.version) throw new Error(`The CLI says ${version}, package.json says ${pkg.version}`);
  const bad = spawnSync(cli, ["bogus"], { cwd: app, encoding: "utf8" });
  if (bad.status !== 2) throw new Error(`An unknown command should exit 2, got ${bad.status}`);

  console.log(`${pkg.name}@${pkg.version}: ${files.length} files, installed and ran cleanly`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
