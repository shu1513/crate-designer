import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, normalize, relative } from "node:path";
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

type StaticFile = { status: number; type: string; body: Buffer };

async function serveStatic(pathname: string): Promise<StaticFile> {
  // A malformed percent-encoding (e.g. "/%") must not crash the service.
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { status: 400, type: "text/plain; charset=utf-8", body: Buffer.from("Bad request") };
  }
  // Resolve inside dist/ only; anything that escapes falls back to index.html.
  const insideDist = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, insideDist);
  const escape = relative(DIST, filePath);
  if (escape.startsWith("..") || isAbsolute(escape)) filePath = join(DIST, "index.html");
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
  try {
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
  } catch (err) {
    // Never let one bad request take the service down.
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Crate Designer running at http://localhost:${PORT}`);
});
