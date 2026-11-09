#!/usr/bin/env node
/**
 * dsh-todo · local preview server
 *
 *   node preview/server.mjs            # http://127.0.0.1:57996/
 *   PORT=58010 node preview/server.mjs
 *
 * Static files only. The preview page stubs every /todo/api/* request with an
 * in-memory mock, so there is no API, no data file and no network here.
 * Listens on 127.0.0.1 only.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..");
const host = "127.0.0.1";

const contentTypeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

const fixed = new Map([
  ["/", join(here, "index.html")],
  ["/index.html", join(here, "index.html")],
  ["/vendor/react.production.min.js", join(here, "vendor", "react.production.min.js")],
  ["/vendor/react-dom.production.min.js", join(here, "vendor", "react-dom.production.min.js")],
  ["/lib/client.js", join(root, "lib", "client.js")],
  ["/icon.svg", join(root, "icon.svg")],
  ["/favicon.ico", join(root, "icon.svg")],
]);

function resolveTarget(pathname) {
  if (fixed.has(pathname)) return fixed.get(pathname);
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const candidate = resolve(here, relative);
  if (candidate !== here && !candidate.startsWith(here + sep)) return null;
  return candidate;
}

/**
 * Start the preview server.
 * @param {number} [port] 0 picks a free port.
 * @returns {Promise<{ server: import("node:http").Server, url: string }>}
 */
export function startPreviewServer(port = Number(process.env.PORT ?? 57996)) {
  const server = createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
      response.end("method not allowed");
      return;
    }
    let pathname;
    try {
      pathname = new URL(request.url, `http://${host}`).pathname;
    } catch {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("bad request");
      return;
    }
    const target = resolveTarget(pathname);
    if (!target || !existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(`not found: ${pathname}`);
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypeByExt[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(target).pipe(response);
  });
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolvePromise({ server, url: `http://${host}:${address.port}/` });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startPreviewServer();
  console.log(`dsh-todo preview: ${url}`);
}
