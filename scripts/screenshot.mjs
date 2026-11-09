#!/usr/bin/env node
/**
 * dsh-todo · screenshots via headless Chrome CDP
 *
 *   node scripts/screenshot.mjs
 *   node scripts/screenshot.mjs --keep
 *
 * Emits 6 screenshots to preview/screenshots/:
 *   1. panel-light.png      1440×900  today view, light
 *   2. panel-dark.png       1440×900  today view, dark
 *   3. panel-light-en.png   1440×900  today view, English
 *   4. calendar.png         1440×900  calendar view, light
 *   5. pomodoro.png         1440×900  pomodoro view, light
 *   6. mobile.png            390×844  today view, mobile portrait
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startPreviewServer } from "../preview/server.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "..");
const outDir = join(root, "preview", "screenshots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const keepAlive = process.argv.includes("--keep");
const settleMs = 1200;
const minPngBytes = 20 * 1024;

mkdirSync(outDir, { recursive: true });

const shots = [
  {
    name: "panel-light",
    width: 1440,
    height: 900,
    url: "?view=today&theme=light&locale=zh",
    narrative: "中文 · 今天视图（亮色，分逾期与今天，展示优先级条与番茄徽标）",
  },
  {
    name: "panel-dark",
    width: 1440,
    height: 900,
    url: "?view=today&theme=dark&locale=zh",
    narrative: "中文 · 今天视图（暗色，自适应宿主深色主题）",
  },
  {
    name: "panel-light-en",
    width: 1440,
    height: 900,
    url: "?view=today&theme=light&locale=en",
    narrative: "English · Today view (light theme, full English translations)",
  },
  {
    name: "calendar",
    width: 1440,
    height: 900,
    url: "?view=calendar&theme=light&locale=zh",
    narrative: "日历视图（月历网格，高亮当天并带任务圆点，右侧任务联动）",
  },
  {
    name: "pomodoro",
    width: 1440,
    height: 900,
    url: "?view=pomodoro&theme=light&locale=zh",
    narrative: "番茄钟视图（圆形环进度、任务绑定、近 7 天柱状图统计）",
  },
  {
    name: "dock-in-chat",
    width: 1440,
    height: 900,
    url: "?mode=dock&pom=running&theme=light&locale=zh",
    narrative: "会话视图中输入框下方的常驻番茄钟（倒计时 + 绑定任务 + 暂停/跳过）",
  },
  {
    name: "sidebar-badge",
    width: 1440,
    height: 900,
    url: "?mode=rail&pom=running&theme=light&locale=zh",
    narrative: "收起侧边栏时，待办图标右上角的番茄分钟角标",
  },
  {
    name: "sidebar-badge-wide",
    width: 1440,
    height: 900,
    url: "?mode=sidebar&pom=running&theme=light&locale=zh",
    narrative: "展开侧栏时，图标角标与「待办」名称并排的实际效果",
  },
  {
    name: "mobile",
    width: 390,
    height: 844,
    url: "?view=today&theme=light&locale=zh",
    narrative: "窄屏视图（移动端 390×844，折叠侧栏为顶部下拉）",
  },
];

async function launchChrome(port) {
  const profileDir = `/tmp/dsh-todo-chrome-${Date.now()}`;
  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--hide-scrollbars",
    "--metrics-recording-only",
    "--mute-audio",
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: "ignore" });
  proc.on("error", (err) => {
    console.error("Failed to launch Chrome:", err);
    process.exit(1);
  });
  // Wait until debug endpoint is listening
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return { proc, port, profileDir };
    } catch {}
  }
  throw new Error("Chrome debug port failed to respond");
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  const eventListeners = new Set();

  const openPromise = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const { resolve, reject } = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
        else resolve(data.result);
      } else {
        for (const fn of eventListeners) fn(data);
      }
    } catch (err) {
      console.error("CDP parse error", err);
    }
  };

  async function send(method, params = {}) {
    await openPromise;
    const reqId = id++;
    return new Promise((resolve, reject) => {
      pending.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  function onEvent(fn) {
    eventListeners.add(fn);
    return () => eventListeners.delete(fn);
  }

  function close() {
    try {
      ws.close();
    } catch {}
  }

  return { send, onEvent, close };
}

async function captureShot(cdp, baseUrl, spec) {
  const targetUrl = baseUrl + spec.url;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: spec.width,
    height: spec.height,
    deviceScaleFactor: 2,
    mobile: spec.width < 500,
  });

  const pageErrors = [];
  const off = cdp.onEvent((ev) => {
    if (ev.method === "Runtime.exceptionThrown") {
      pageErrors.push(ev.params?.exceptionDetails?.text || "runtime exception");
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  // Reset ready flag on current execution context if any
  try {
    await cdp.send("Runtime.evaluate", {
      expression: `(() => { if (typeof window !== "undefined") { window.__previewReady = false; delete document.documentElement.dataset.ready; } })()`,
    });
  } catch {}

  // Wait for load event
  let pageLoaded = false;
  const loadPromise = new Promise((resolve) => {
    const unsub = cdp.onEvent((ev) => {
      if (ev.method === "Page.loadEventFired") {
        unsub();
        pageLoaded = true;
        resolve();
      }
    });
  });

  await cdp.send("Page.navigate", { url: targetUrl });
  await Promise.race([loadPromise, new Promise((r) => setTimeout(r, 4000))]);

  // Poll for ready
  let ready = false;
  const start = Date.now();
  while (Date.now() - start < 10000) {
    await new Promise((r) => setTimeout(r, 150));
    const evalRes = await cdp.send("Runtime.evaluate", {
      expression: `Boolean(window.__previewReady && document.documentElement.dataset.ready === "1" && !window.__previewLoadError)`,
      returnByValue: true,
    });
    if (evalRes?.result?.value === true) {
      ready = true;
      break;
    }
    const errRes = await cdp.send("Runtime.evaluate", {
      expression: `window.__previewLoadError ? String(window.__previewLoadError.stack || window.__previewLoadError) : null`,
      returnByValue: true,
    });
    if (errRes?.result?.value) {
      throw new Error(`Page script load error: ${errRes.result.value}`);
    }
  }

  if (!ready) throw new Error(`Timed out waiting for preview readiness on ${spec.url}`);
  await new Promise((r) => setTimeout(r, settleMs));

  // Assert banner is hidden
  const bannerVisible = await cdp.send("Runtime.evaluate", {
    expression: `(() => { const b = document.getElementById("preview-banner"); if (!b) return false; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && window.getComputedStyle(b).display !== "none"; })()`,
    returnByValue: true,
  });
  if (bannerVisible?.result?.value === true) {
    throw new Error("preview-banner is unexpectedly visible in screenshot!");
  }

  // Take screenshot
  const shotData = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });

  off();

  const buffer = Buffer.from(shotData.data, "base64");
  const outFile = join(outDir, `${spec.name}.png`);
  writeFileSync(outFile, buffer);
  const tooSmall = buffer.length < minPngBytes;
  console.log(`${tooSmall ? "!" : "✓"} ${spec.name}.png (${(buffer.length / 1024).toFixed(1)} KB) — ${spec.narrative}`);
  if (tooSmall) {
    const bodyText = await cdp.send("Runtime.evaluate", {
      expression: `({ text: (document.body.innerText || "").slice(0, 600), html: document.getElementById("main-mount")?.innerHTML?.length || 0, ready: window.__previewReady })`,
      returnByValue: true,
    });
    console.warn("  suspiciously small screenshot; page state:", JSON.stringify(bodyText?.result?.value));
    return false;
  }

  if (pageErrors.length > 0) {
    console.warn(`  [warning] page threw exceptions: ${pageErrors.join("; ")}`);
  }
  return true;
}

async function main() {
  const chromePort = 59000 + Math.floor(Math.random() * 800);
  const { server, url } = await startPreviewServer(0);
  console.log(`Preview server running at ${url}`);

  const chrome = await launchChrome(chromePort);
  console.log(`Chrome launched with remote debug port ${chromePort}`);

  try {
    const listRes = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
    const tabs = await listRes.json();
    let pageTarget = tabs.find((tab) => tab.type === "page" && tab.webSocketDebuggerUrl);
    if (!pageTarget) {
      const created = await fetch(`http://127.0.0.1:${chromePort}/json/new?about:blank`, { method: "PUT" });
      pageTarget = await created.json();
    }
    if (!pageTarget || !pageTarget.webSocketDebuggerUrl) throw new Error("No usable Chrome page target found");

    const cdp = cdpClient(pageTarget.webSocketDebuggerUrl);

    const failures = [];
    for (const spec of shots) {
      const ok = await captureShot(cdp, url, spec);
      if (!ok) failures.push(spec.name);
    }

    cdp.close();
    console.log(`\n${shots.length - failures.length}/${shots.length} screenshots written to preview/screenshots/`);
    if (failures.length > 0) {
      throw new Error(`Screenshots too small or blank: ${failures.join(", ")}`);
    }
  } finally {
    if (!keepAlive) {
      chrome.proc.kill("SIGKILL");
      server.close();
    } else {
      console.log(`--keep enabled. Server: ${url}`);
    }
  }
}

main().catch((err) => {
  console.error("Screenshot generation failed:", err);
  process.exit(1);
});
