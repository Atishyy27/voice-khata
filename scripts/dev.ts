// Local run: serves public/ and mounts the same Session on /api/ws. npx tsx scripts/dev.ts [port]
import { readFileSync, existsSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import { Session } from "../api/_lib/session";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };
const root = join(process.cwd(), "public");
const server = http.createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^([\\/]\.\.)+/, "");
  const file = join(root, path === "/" || path === "\\" ? "index.html" : path);
  if (!file.startsWith(root) || !existsSync(file)) {
    res.statusCode = 404;
    return res.end("not found");
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
});
new WebSocketServer({ server, path: "/api/ws", maxPayload: 256 * 1024 }).on("connection", (ws) => new Session(ws));
const port = Number(process.argv[2] ?? 3000);
server.listen(port, () => console.log(`voice khata on http://localhost:${port}`));
