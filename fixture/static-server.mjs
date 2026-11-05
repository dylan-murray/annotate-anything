import fs from "node:fs";
import http from "node:http";
import { createMiddleware } from "../dist/middleware.js";

const annotate = createMiddleware({ dir: process.env.AA_DIR });
// A host that runs its own agents: Send offers them, and the picked one gets the handoff.
const delivered = [];
let running = true;
const agents = createMiddleware({
  dir: process.env.AA_DIR + "-agents",
  base: "/__agents",
  targets: () => (running ? [{ id: "ui", label: "UI agent", detail: "fixture · Claude" }, { id: "api", label: "API agent" }] : []),
  onSubmit: ({ target, agent, prompt }) => (delivered.push({ target, prompt }), { to: agent, ok: true }),
});
const files = {
  "/": ["fixture/static/index.html", "text/html"],
  "/copy": ["fixture/static/copy.html", "text/html"],
  "/agents": ["fixture/static/agents.html", "text/html"],
  "/annotate-anything.js": ["dist/annotate-anything.iife.js", "text/javascript"],
};

http
  .createServer((req, res) => {
    if (req.url === "/delivered") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(delivered));
    if (req.url.split("?")[0] === "/agents-running" && req.method === "POST") {
      running = new URL(req.url, "http://x").searchParams.get("on") !== "false";
      return res.writeHead(204).end();
    }
    annotate(req, res, () => agents(req, res, () => {
      const file = files[req.url.split("?")[0]];
      if (!file) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": file[1] }).end(fs.readFileSync(file[0]));
    }));
  })
  .listen(Number(process.env.PORT ?? 5197));
