// Server locale: serve il sito da public/ e le API da lib/api.mjs.
// Avvio: npm run dev  →  http://localhost:8888  (admin: /admin, password "admin" se non impostata)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

process.env.STORAGE ||= "file";
if (!process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_PASSWORD = "admin";
  console.warn('ADMIN_PASSWORD non impostata: in locale uso "admin".');
}
const { handle } = await import("../lib/api.mjs");

const ROOT = path.resolve("public");
const PORT = Number(process.env.PORT) || 8888;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".json": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks);
    const response = await handle(new Request(url, { method: req.method, headers: req.headers, body }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => console.log(`Sito su http://localhost:${PORT} · admin su http://localhost:${PORT}/admin/`));
