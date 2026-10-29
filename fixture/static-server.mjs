import fs from "node:fs";
import http from "node:http";
import { createMiddleware } from "../dist/middleware.js";

const annotate = createMiddleware({ dir: process.env.AA_DIR });
const files = {
  "/": ["fixture/static/index.html", "text/html"],
  "/copy": ["fixture/static/copy.html", "text/html"],
  "/annotate-anything.js": ["dist/annotate-anything.iife.js", "text/javascript"],
};

http
  .createServer((req, res) => {
    annotate(req, res, () => {
      const file = files[req.url.split("?")[0]];
      if (!file) return res.writeHead(404).end();
      res.writeHead(200, { "Content-Type": file[1] }).end(fs.readFileSync(file[0]));
    });
  })
  .listen(Number(process.env.PORT ?? 5197));
