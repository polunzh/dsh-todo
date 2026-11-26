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
  // 会话模式：用来给「右上角的番茄钟工具」出截图
  assert.match(html, /header-mount/);
  assert.match(html, /conversation\.session\.header\.utilities/);
  assert.doesNotMatch(html, /dock-mount/);
  // 收起侧边栏模式：用来给图标倒计时出截图
  assert.match(html, /rail-mount/);
  assert.match(html, /__previewSidebar/);
  // 侧边栏休息态截图：可以把番茄钟预置成短休未开始
  assert.match(html, /short-idle/);
  assert.match(html, /data-mode/);
  assert.match(html, /dsh-todo\/pomodoro/);
  assert.match(html, /todoTheme/, "预览应支持指定要展示的主题");
  assert.match(html, /: "studio-vivid"/, "预览默认主题应为 Studio Vivid");
});

test("preview seeds interrupted sessions and long-range history", () => {
  const html = readFileSync(resolve(root, "preview", "index.html"), "utf8");
  // 中断会话：completed=false + actualMinutes，供统计区与记录列表展示
  assert.match(html, /session\.completed = false/, "种子应包含中断会话");
  assert.match(html, /session\.actualMinutes = actualMinutes/);
  // 历史摊到过去数周，7/30/全部三个范围都有数据
  assert.match(html, /seedPlan\.forEach/, "种子会话应由计划表生成");
  assert.match(html, /-56, -1\.5/, "种子历史应覆盖约两个月");
  // mock 接口透传新字段，且中断不增加任务番茄数
  assert.match(html, /if \(body\.completed === false\)/);
  assert.match(html, /session\.completed !== false/);
});

test("screenshot script covers the new stats ranges", () => {
  const script = readFileSync(resolve(root, "scripts", "screenshot.mjs"), "utf8");
  assert.match(script, /name: "pomodoro-stats-30d"/);
  assert.match(script, /name: "pomodoro-stats-day"/);
  assert.match(script, /todo-stats-range-btn/);
  assert.match(script, /todo-pom-bar/);
});

test("icon.svg uses the default Studio Vivid brand accent", () => {
  const svg = readFileSync(resolve(root, "icon.svg"), "utf8");
  // 插件详情页与插件索引读的是这份静态图标，颜色必须跟着默认主题（Studio Vivid 绿）
  assert.match(svg, /#10a37f/i, "图标应使用 Studio Vivid 强调色");
  assert.match(svg, /#08745a/i, "图标渐变终点应使用 Studio Vivid 的 accent-ink");
  assert.doesNotMatch(svg, /#7f79ff|#4b45cf/i, "图标不应残留已退役的 Iris 紫");
});
