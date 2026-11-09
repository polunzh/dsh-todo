import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { startPreviewServer } from "../preview/server.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

test("preview static assets exist and are non-empty", () => {
  const req = [
    "preview/index.html",
    "preview/server.mjs",
    "preview/vendor/react.production.min.js",
    "preview/vendor/react-dom.production.min.js",
    "icon.svg",
    "scripts/screenshot.mjs",
  ];
  for (const rel of req) {
    const full = resolve(root, rel);
    assert.ok(existsSync(full), `File must exist: ${rel}`);
    assert.ok(readFileSync(full).length > 0, `File must not be empty: ${rel}`);
  }
});

test("preview server serves index.html and vendored react", async () => {
  const { server, url } = await startPreviewServer(0);
  try {
    const resHtml = await fetch(url);
    assert.equal(resHtml.status, 200);
    const html = await resHtml.text();
    assert.match(html, /__ModuleLoader__/);
    assert.match(html, /vendor\/react\.production\.min\.js/);
    assert.match(html, /id="main-mount"/);

    const resReact = await fetch(`${url}vendor/react.production.min.js`);
    assert.equal(resReact.status, 200);
    const reactBody = await resReact.text();
    assert.ok(reactBody.length > 5000, "React bundle too small");

    const resIcon = await fetch(`${url}icon.svg`);
    assert.equal(resIcon.status, 200);
    assert.equal(resIcon.headers.get("content-type"), "image/svg+xml; charset=utf-8");

    const res404 = await fetch(`${url}non-existent-file.xyz`);
    assert.equal(res404.status, 404);
  } finally {
    server.close();
  }
});

test("index.html handles theme and locale parameters and stubs /todo/api/state", () => {
  const html = readFileSync(resolve(root, "preview/index.html"), "utf8");
  assert.match(html, /__dshTodoPreview/);
  assert.match(html, /targetLocale/);
  assert.match(html, /targetView/);
  assert.match(html, /route === "state"/);
  assert.match(html, /data-ds-dark-theme/);
  assert.match(html, /--dsw-alias-bg-base/);
});
