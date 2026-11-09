import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";

const PORT = Number(process.env.PORT ?? 8787);
const DIST = fileURLToPath(new URL("../dist/", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".ico": "image/x-icon",
};

async function serveStatic(pathname: string): Promise<{ status: number; type: string; body: Buffer }> {
  // Resolve inside dist/ only; anything that escapes falls back to index.html.
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, relative);
  if (!filePath.startsWith(DIST)) filePath = join(DIST, "index.html");
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(DIST, "index.html"); // single-page app fallback
  }
  try {
    const body = await readFile(filePath);
    return { status: 200, type: CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream", body };
  } catch {
    return {
      status: 503,
      type: "text/plain; charset=utf-8",
      body: Buffer.from("dist/ not found. Run `npm run build` first (or `npm start`)."),
    };
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    const { status, body } = handleApi(req.method ?? "GET", url.pathname);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
    return;
  }
  const file = await serveStatic(url.pathname);
  res.writeHead(file.status, { "content-type": file.type });
  res.end(file.body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Crate Designer running at http://localhost:${PORT}`);
});
