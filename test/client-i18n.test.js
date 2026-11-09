/**
 * 客户端契约与 i18n 测试（test/client-i18n.test.js）
 *
 * 校验：
 *  - 模块结构：__ModuleLoader__ 注册、inject、只 require react、两个 slot；
 *  - 中英字典键完全一致、模板占位符一致、源码里用到的键都有翻译；
 *  - DICT 之外没有遗留硬编码中文（输入解析词汇与注释除外）；
 *  - 样式全部走宿主 --dsw-* token，没有硬编码黑白颜色；
 *  - 销毁时清掉样式、定时器、window 监听与 locale 注册。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_PATH = join(root, "lib", "client.js");
const SOURCE = readFileSync(CLIENT_PATH, "utf8");
const STORAGE_KEY = "dsh-todo/pomodoro";
const PANEL_ID = "dsh-todo";

/* ============================ 运行环境 ============================ */

function installGlobals(stubs) {
  const saved = new Map();
  for (const [key, value] of Object.entries(stubs)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

function createEnv(options = {}) {
  const env = {
    styles: [],
    intervals: new Map(),
    timeouts: new Map(),
    listeners: new Map(),
    effects: [],
    disposals: 0,
    registrations: [],
    injections: [],
    localeRegistrations: [],
    localeDisposeCount: 0,
    requireNames: [],
    snapshot: { active: options.activeLocale || "zh-CN" },
    seed: options.seed,
  };
  let nextId = 1;
  const storage = new Map();
  if (options.seed) storage.set(STORAGE_KEY, JSON.stringify(options.seed));

  env.document = {
    baseURI: "http://127.0.0.1:51671/",
    head: { append: (node) => env.styles.push(node) },
    createElement(tag) {
      const node = { tagName: String(tag).toUpperCase(), id: "", textContent: "" };
      node.remove = () => {
        const index = env.styles.indexOf(node);
        if (index >= 0) env.styles.splice(index, 1);
      };
      return node;
    },
    getElementById(id) {
      return env.styles.find((node) => node.id === id) || null;
    },
  };

  env.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
  env.storage = storage;

  env.window = {
    addEventListener(type, handler) {
      const set = env.listeners.get(type) || new Set();
      set.add(handler);
      env.listeners.set(type, set);
    },
    removeEventListener(type, handler) {
      const set = env.listeners.get(type);
      if (set) set.delete(handler);
    },
    __dshTodoPreview: options.demo,
  };

  env.timers = {
    setInterval(callback, ms) {
      const id = nextId++;
      env.intervals.set(id, { callback, ms });
      return id;
    },
    clearInterval(id) {
      env.intervals.delete(id);
    },
    setTimeout(callback, ms) {
      const id = nextId++;
      env.timeouts.set(id, { callback, ms });
      return id;
    },
    clearTimeout(id) {
      env.timeouts.delete(id);
    },
  };

  env.load = () => {
    let registration = null;
    env.window.__ModuleLoader__ = {
      load(value) {
        registration = value;
      },
    };
    // 在同一个 realm 里执行，window 作为参数传进去（模块闭包引用的就是它）。
    new Function("window", SOURCE)(env.window);
    assert.ok(registration, "没有调用 window.__ModuleLoader__.load");
    env.registration = registration;
    env.exports = registration.factory((name) => {
      env.requireNames.push(name);
      if (name !== "react") throw new Error(`不允许 require ${name}`);
      return {};
    });
  };

  env.makeContext = (localeAvailable = options.localeAvailable !== false) => {
    const ctx = {
      effect(fn) {
        const disposer = fn();
        if (typeof disposer === "function") env.effects.push(disposer);
        return disposer;
      },
      slots: {
        inject(name, callback) {
          env.injections.push(name);
          callback();
        },
        register(opts, Component) {
          env.registrations.push({ opts, Component });
          return () => {
            env.registrations = env.registrations.filter((item) => item.Component !== Component);
          };
        },
      },
    };
    if (localeAvailable) {
      ctx.locale = {
        register(namespace, dict) {
          env.localeRegistrations.push({ namespace, dict });
          return () => {
            env.localeDisposeCount += 1;
          };
        },
        bind() {
          return null;
        },
        getSnapshot() {
          return env.snapshot;
        },
        subscribe() {
          return () => {};
        },
      };
    }
    env.ctx = ctx;
    return ctx;
  };

  env.disposeAll = () => {
    env.effects.forEach((disposer) => {
      env.disposals += 1;
      disposer();
    });
    env.effects = [];
  };

  return env;
}

/** 装好全局桩 → 加载模块 → apply → 跑断言 → 全部销毁并还原全局。 */
function withPlugin(options, run) {
  const env = createEnv(options);
  const restore = installGlobals({
    document: env.document,
    localStorage: env.localStorage,
    fetch: () => Promise.reject(new Error("offline")),
    setInterval: env.timers.setInterval,
    clearInterval: env.timers.clearInterval,
    setTimeout: env.timers.setTimeout,
    clearTimeout: env.timers.clearTimeout,
  });
  try {
    env.load();
    env.exports.apply(env.makeContext());
    return { result: run(env), env };
  } finally {
    env.disposeAll();
    restore();
  }
}

/* ============================ 模块结构 ============================ */

test("模块注册 id、inject 与仅 require react", () => {
  withPlugin({}, (env) => {
    assert.equal(env.registration.id, PANEL_ID);
    assert.deepEqual(env.exports.inject, ["slots", "locale"]);
    assert.deepEqual(env.requireNames, ["react"], "工厂函数只能 require react");
    assert.equal(env.exports.__preview.PANEL_ID, PANEL_ID);
    assert.equal(env.exports.__preview.API, "todo/api/");
    assert.equal(env.registration.factory.length, 1);
  });
});

test("__preview 暴露契约要求的 8 个入口", () => {
  withPlugin({}, (env) => {
    const preview = env.exports.__preview;
    assert.equal(typeof preview.TodoPage, "function");
    assert.equal(typeof preview.parseQuickAdd, "function");
    assert.equal(typeof preview.pomodoroReducer, "function");
    assert.equal(typeof preview.DICT, "object");
    assert.equal(typeof preview.PANEL_ID, "string");
    assert.equal(typeof preview.API, "string");
    assert.equal(typeof preview.localDate, "function");
    assert.equal(typeof preview.formatDue, "function");
    assert.equal(env.window.__preview, preview, "window.__preview 应该可被预览页取到");
  });
});

test("注册 sidebar.panellist、main 与输入框下方的番茄钟 dock", () => {
  const { env } = withPlugin({}, () => {});
  assert.deepEqual(env.injections, ["sidebar.panellist", "main", "conversation.composer.dock"]);
  assert.equal(env.registrations.length, 3);

  const sidebar = env.registrations.find((item) => item.opts.name === "sidebar.panellist");
  assert.ok(sidebar, "缺少 sidebar.panellist 注册");
  assert.equal(sidebar.opts.id, PANEL_ID);
  assert.equal(sidebar.opts.order, 22);
  assert.equal(typeof sidebar.opts.label, "function", "label 必须是函数，跟随语言切换");
  assert.equal(typeof sidebar.Component, "function");

  const main = env.registrations.find((item) => item.opts.name === "main");
  assert.ok(main, "缺少 main 注册");
  assert.equal(main.opts.key, PANEL_ID);
  assert.equal(typeof main.Component, "function");

  const dock = env.registrations.find((item) => item.opts.name === "conversation.composer.dock");
  assert.ok(dock, "缺少 conversation.composer.dock 注册");
  assert.equal(dock.opts.id, "dsh-todo-pomodoro");
  assert.equal(dock.opts.order, 2);
  assert.equal(typeof dock.Component, "function");
});

test("label() 跟随宿主语言切换（zh / en）", () => {
  const { env } = withPlugin({}, (env) => {
    const sidebar = env.registrations.find((item) => item.opts.name === "sidebar.panellist");
    assert.equal(sidebar.opts.label(), "待办");
    env.snapshot.active = "en";
    assert.equal(sidebar.opts.label(), "To-do");
    env.snapshot.active = "en-US";
    assert.equal(sidebar.opts.label(), "To-do");
    env.snapshot.active = "zh-CN";
    assert.equal(sidebar.opts.label(), "待办");
  });
  assert.equal(env.localeRegistrations[0].namespace, PANEL_ID);
});

test("预览页可用 window.__dshTodoPreview.locale 覆盖语言", () => {
  withPlugin({ demo: { locale: "en" } }, (env) => {
    const sidebar = env.registrations.find((item) => item.opts.name === "sidebar.panellist");
    assert.equal(sidebar.opts.label(), "To-do");
  });
});

test("没有 locale 服务时也能取到文案", () => {
  withPlugin({ localeAvailable: false }, (env) => {
    const sidebar = env.registrations.find((item) => item.opts.name === "sidebar.panellist");
    assert.ok(["待办", "To-do"].includes(sidebar.opts.label()));
  });
});

/* ============================ 字典 ============================ */

test("中英字典键集合完全一致，且没有空文案", () => {
  withPlugin({}, (env) => {
    const { DICT } = env.exports.__preview;
    const zh = Object.keys(DICT.zh).sort();
    const en = Object.keys(DICT.en).sort();
    assert.ok(zh.length > 150, `字典太小：${zh.length}`);
    assert.deepEqual(en, zh, "中英字典键必须一一对应");
    for (const key of zh) {
      assert.equal(typeof DICT.zh[key], "string", `zh.${key} 不是字符串`);
      assert.equal(typeof DICT.en[key], "string", `en.${key} 不是字符串`);
      assert.ok(DICT.zh[key].trim().length > 0, `zh.${key} 是空的`);
      assert.ok(DICT.en[key].trim().length > 0, `en.${key} 是空的`);
    }
  });
});

test("同一个键的 {占位符} 中英一致", () => {
  withPlugin({}, (env) => {
    const { DICT } = env.exports.__preview;
    const placeholders = (value) => [...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(DICT.zh)) {
      assert.deepEqual(placeholders(DICT.en[key]), placeholders(DICT.zh[key]), `${key} 的占位符不一致`);
    }
  });
});

test("源码里的 t(\"key\") 都在字典里", () => {
  withPlugin({}, (env) => {
    const { DICT } = env.exports.__preview;
    const literalKeys = new Set([...SOURCE.matchAll(/\bt\(\s*"([^"]+)"/g)].map((match) => match[1]));
    assert.ok(literalKeys.size > 100, `静态文案键太少：${literalKeys.size}`);
    const missing = [...literalKeys].filter((key) => !DICT.zh[key] || !DICT.en[key]);
    assert.deepEqual(missing, [], `这些键没有翻译：${missing.join(", ")}`);

    // t(`prefix.${...}`) 这种动态键，至少前缀要在字典里
    const dynamicPrefixes = new Set([...SOURCE.matchAll(/\bt\(\s*`([^`$]*)\$\{/g)].map((match) => match[1]));
    for (const prefix of dynamicPrefixes) {
      const covered = Object.keys(DICT.zh).some((key) => key.startsWith(prefix));
      assert.ok(covered, `动态键前缀没有对应文案：${prefix}`);
    }
  });
});

test("枚举型命名空间覆盖完整（view / rec / weekday / month / color / pom.mode / error）", () => {
  withPlugin({}, (env) => {
    const { DICT } = env.exports.__preview;
    const has = (key) => assert.ok(DICT.zh[key] && DICT.en[key], `缺少 ${key}`);

    ["today", "upcoming", "inbox", "completed", "projects", "calendar", "pomodoro", "search"].forEach((view) =>
      has(`view.${view}`),
    );
    ["none", "daily", "weekday", "weekly", "monthly"].forEach((freq) => has(`rec.${freq}`));
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      has(`weekday.${weekday}`);
      has(`weekday.short.${weekday}`);
    }
    for (let month = 1; month <= 12; month += 1) has(`date.monthShort.${month}`);
    ["tomato", "amber", "lime", "sky", "grape", "slate"].forEach((color) => has(`project.color.${color}`));
    ["focus", "short", "long"].forEach((mode) => has(`pom.mode.${mode}`));

    // contract 第 2 节的错误码都要有可读文案
    [
      "invalid-body",
      "invalid-title",
      "title-too-long",
      "invalid-due",
      "invalid-priority",
      "invalid-labels",
      "invalid-parent",
      "invalid-recurrence",
      "invalid-id",
      "invalid-project",
      "invalid-settings",
      "invalid-session",
      "not-found",
      "method-not-allowed",
      "already-exists",
      "tasks-limit",
      "projects-limit",
      "project-not-empty",
      "body-too-large",
      "internal",
      "network",
      "unknown",
    ].forEach((code) => has(`error.${code}`));
  });
});

/* ============================ 无硬编码文案 ============================ */

/** 去掉 DICT 字面量与自然语言解析词汇（输入关键词，不是界面文案），再去掉注释。 */
function codeWithoutDictionaryOrComments(source) {
  const dictStart = source.indexOf("const DICT = {");
  const dictEnd = source.indexOf("let localeApi = null;", dictStart);
  assert.ok(dictStart > 0 && dictEnd > dictStart, "找不到 DICT 区域");

  const parseStart = source.indexOf("const PARSE_WORDS = {");
  const parseEnd = source.indexOf("/* ============================ 番茄钟状态机", parseStart);
  assert.ok(parseStart > 0 && parseEnd > parseStart, "找不到自然语言解析词汇区域");

  return (source.slice(0, dictStart) + source.slice(dictEnd, parseStart) + source.slice(parseEnd))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("DICT 之外没有遗留硬编码中文", () => {
  const code = codeWithoutDictionaryOrComments(SOURCE);
  const leftovers = [];
  for (const match of code.matchAll(/(["'`])((?:\\.|[^\\])*?)\1/g)) {
    if (/[\u4e00-\u9fa5]/.test(match[2])) leftovers.push(match[2]);
  }
  assert.deepEqual(leftovers, [], `界面文案必须走 t()，发现硬编码：${leftovers.join(" / ")}`);
  assert.equal(/[\u4e00-\u9fa5]/.test(code), false);
});

test("解析词汇区域确实包含中文关键词（上面的排除不是空档）", () => {
  const parseStart = SOURCE.indexOf("const PARSE_WORDS = {");
  const parseEnd = SOURCE.indexOf("/* ============================ 番茄钟状态机", parseStart);
  const region = SOURCE.slice(parseStart, parseEnd);
  for (const word of ["今天", "明天", "周五", "每天", "下午"]) {
    assert.ok(region.includes(word), `解析词汇里缺少 ${word}`);
  }
});

/* ============================ 样式 ============================ */

test("样式只用 --dsw-* token，没有硬编码黑白颜色", () => {
  const cssStart = SOURCE.indexOf("const CSS = `");
  const cssEnd = SOURCE.indexOf("\n`;", cssStart);
  assert.ok(cssStart > 0 && cssEnd > cssStart, "找不到 CSS 字符串");
  const css = SOURCE.slice(cssStart, cssEnd);

  assert.ok(css.includes("--dsw-alias-bg-base"), "应使用宿主背景 token");
  assert.ok(css.includes("--dsw-alias-label-primary"), "应使用宿主字色 token");
  assert.ok(css.includes("--dsw-alias-border-l1"), "应使用宿主边框 token");
  assert.ok(/--dsw-radius-/.test(css), "应使用宿主圆角 token");
  assert.ok(/--dsw-shadow-/.test(css), "应使用宿主阴影 token");

  // 不能出现具体色值
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css), false, "不允许硬编码十六进制颜色");
  assert.equal(/\brgba?\(/.test(css), false, "不允许硬编码 rgb 颜色");
  assert.equal(/:\s*(white|black)\s*[;}]/.test(css), false, "不允许硬编码黑白色");
  assert.equal(/\b(background|color|border-color)\s*:\s*(white|black)\b/.test(css), false);

  // 自定义变量必须由宿主 token 派生
  for (const match of css.matchAll(/(--todo-[a-z-]+)\s*:\s*([^;]+);/g)) {
    assert.match(match[2], /var\(--dsw-/, `${match[1]} 必须由 --dsw-* token 派生`);
  }
  // 主题差异交给宿主 token，不在客户端写暗色分支
  assert.equal(/data-ds-dark-theme/.test(css), false, "暗色适配应交给宿主 token");
});

/* ============================ 销毁清理 ============================ */

test("销毁时清理样式、定时器、storage 监听与 locale 注册", () => {
  const now = Date.now();
  const { env } = withPlugin(
    {
      seed: {
        mode: "focus",
        endsAt: now + 60 * 1000,
        remainingMs: 60 * 1000,
        running: true,
        taskId: null,
        cycle: 1,
      },
    },
    (env) => {
      // apply 之后：注入了样式、挂了倒计时、监听了 storage、注册了字典
      assert.equal(env.styles.length, 1, "应注入一份样式");
      assert.equal(env.styles[0].id, "dsh-todo-style");
      assert.equal(env.intervals.size, 1, "运行中的番茄钟应有定时器");
      assert.equal((env.listeners.get("storage") || new Set()).size, 1, "应监听 storage");
      assert.equal(env.localeRegistrations.length, 1, "应注册中英字典");
      assert.ok(env.effects.length >= 3, "样式 / 字典 / 引擎都应挂在 ctx.effect 上");
    },
  );

  // withPlugin 结束时已执行所有 disposer
  assert.equal(env.disposals, env.effects.length + env.disposals);
  assert.equal(env.styles.length, 0, "销毁后样式节点应移除");
  assert.equal(env.intervals.size, 0, "销毁后不应有残留 interval");
  assert.equal(env.timeouts.size, 0, "销毁后不应有残留 timeout");
  assert.equal((env.listeners.get("storage") || new Set()).size, 0, "销毁后不应残留 storage 监听");
  assert.equal(env.localeDisposeCount, 1, "销毁后应释放 locale 字典注册");
  assert.equal(env.disposals >= 3, true);
});
