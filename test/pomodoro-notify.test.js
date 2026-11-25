/**
 * 番茄结束提醒 → 通知中心（test/pomodoro-notify.test.js）
 *
 * 覆盖：
 *  - 装了通知中心（window.dshNotifications.post）时，番茄结束条目由它接走，
 *    dsh-todo 不再构造 window.Notification、也不再自己响提示音；
 *  - 没装通知中心时回退到原来的 sendNotification + playChime；
 *  - 通知中心 post 抛错时番茄钟照常收尾、toast 照常出现；
 *  - 休息结束用另一组文案与 tone。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(root, "lib", "client.js"), "utf8");
const STORAGE_KEY = "dsh-todo/pomodoro";

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

/**
 * 造一个「刚好到点」的番茄：localStorage 里是 running + 已过期的 endsAt，
 * tick() 会走真实的 completeSession。
 */
function createEnv(config) {
  const calls = { posts: [], notifications: [], chimeNotes: 0 };
  const endsAt = Date.now() - 1000;
  const storage = new Map();
  storage.set(
    STORAGE_KEY,
    JSON.stringify({ mode: config.mode || "focus", running: true, endsAt, remainingMs: 0, taskId: null, cycle: 0 }),
  );

  function FakeNotification(title, options) {
    calls.notifications.push({ title, body: options && options.body });
  }
  FakeNotification.permission = "granted";
  FakeNotification.requestPermission = () => Promise.resolve("granted");

  const window = {
    Notification: FakeNotification,
    AudioContext: function FakeAudioContext() {
      return {
        state: "running",
        currentTime: 0,
        destination: {},
        createOscillator() {
          return {
            type: "sine",
            frequency: { value: 0 },
            connect() {},
            start() {
              calls.chimeNotes += 1;
            },
            stop() {},
          };
        },
        createGain() {
          return {
            gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
          };
        },
      };
    },
    __ModuleLoader__: {
      load(registration) {
        window.registration = registration;
      },
    },
  };
  if (config.notifier === "post") {
    window.dshNotifications = {
      post(entry) {
        calls.posts.push(entry);
      },
    };
  } else if (config.notifier === "throw") {
    window.dshNotifications = {
      post() {
        throw new Error("notification hub down");
      },
    };
  } else if (config.notifier === "incomplete") {
    // 只有对象没有 post：等同于没装通知中心。
    window.dshNotifications = {};
  }

  const timers = { nextId: 1 };
  const restore = installGlobals({
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    },
    fetch: () => Promise.reject(new Error("offline")),
    setInterval: () => timers.nextId++,
    clearInterval: () => {},
    setTimeout: () => timers.nextId++,
    clearTimeout: () => {},
  });

  const load = () => {
    new Function("window", SOURCE)(window);
    const registration = window.registration;
    assert.ok(registration, "没有调用 window.__ModuleLoader__.load");
    return registration.factory((name) => {
      if (name !== "react") throw new Error(`不允许 require ${name}`);
      return { createElement: () => ({}) };
    }).__preview;
  };

  return { calls, endsAt, load, restore };
}

function withEndedPomodoro(config, run) {
  const env = createEnv(config);
  try {
    const preview = env.load();
    preview.setPreviewLocale("zh");
    const engine = preview.__internal.pomodoroEngine;
    engine.setSettings({ ...preview.__internal.DEFAULT_SETTINGS, sound: true });
    engine.tick();
    return run({ preview, engine, calls: env.calls, endsAt: env.endsAt });
  } finally {
    env.restore();
  }
}

test("通知中心接走番茄结束：条目形状正确，且不再自己弹通知或响铃", () => {
  withEndedPomodoro({ notifier: "post" }, ({ preview, engine, calls, endsAt }) => {
    assert.equal(calls.posts.length, 1, "post 应该只被调用一次");
    const entry = calls.posts[0];
    assert.equal(entry.id, `dsh-todo:pomodoro:${endsAt}`);
    assert.ok(entry.id.length <= 128, "id 需要控制在 128 字符以内");
    assert.equal(entry.source, "plugin");
    assert.equal(entry.sourceLabel, "dsh-todo");
    assert.equal(entry.title, preview.DICT.zh["pom.notifyTitleFocus"]);
    assert.equal(entry.body, preview.DICT.zh["pom.notifyBodyFocus"]);
    assert.equal(entry.tone, "success");
    assert.equal(entry.sessionId, undefined, "番茄钟不绑定会话，不应带 sessionId");

    assert.equal(calls.notifications.length, 0, "通知中心在场时不应再构造 window.Notification");
    assert.equal(calls.chimeNotes, 0, "通知中心在场时不应再自己响提示音");

    assert.equal(engine.get().running, false, "番茄钟必须照常收尾");
    assert.equal(engine.get().mode, "short", "专注结束后应进入短休");
    assert.equal(preview.__internal.dataStore.getToast().message, preview.DICT.zh["pom.finishedFocus"]);
  });
});

test("没装通知中心时回退到原来的 sendNotification + playChime", () => {
  withEndedPomodoro({}, ({ preview, calls }) => {
    assert.equal(calls.posts.length, 0);
    assert.equal(calls.notifications.length, 1, "应回退到浏览器通知");
    assert.equal(calls.notifications[0].title, preview.DICT.zh["pom.notifyTitleFocus"]);
    assert.equal(calls.notifications[0].body, preview.DICT.zh["pom.notifyBodyFocus"]);
    assert.equal(calls.chimeNotes, 3, "三音提示音仍需完整播放");
    assert.equal(preview.__internal.dataStore.getToast().message, preview.DICT.zh["pom.finishedFocus"]);
  });
});

test("通知中心 post 抛错时番茄钟照常收尾、toast 照常出现", () => {
  withEndedPomodoro({ notifier: "throw" }, ({ preview, engine, calls }) => {
    assert.equal(engine.get().running, false, "通知中心出错不能影响番茄钟收尾");
    assert.equal(engine.get().mode, "short");
    assert.equal(preview.__internal.dataStore.getToast().message, preview.DICT.zh["pom.finishedFocus"]);
    // 抛错说明这条提醒没被接走，退回本地提醒，避免整轮静默。
    assert.equal(calls.notifications.length, 1);
  });
});

test("休息结束走休息文案与 info tone", () => {
  withEndedPomodoro({ notifier: "post", mode: "short" }, ({ preview, calls }) => {
    assert.equal(calls.posts.length, 1);
    const entry = calls.posts[0];
    assert.ok(entry.id.startsWith("dsh-todo:pomodoro:"));
    assert.equal(entry.title, preview.DICT.zh["pom.notifyTitleBreak"]);
    assert.equal(entry.body, preview.DICT.zh["pom.notifyBodyBreak"]);
    assert.equal(entry.tone, "info");
    assert.equal(preview.__internal.dataStore.getToast().message, preview.DICT.zh["pom.finishedBreak"]);
  });
});

test("window.dshNotifications 存在但没有 post 方法时按未安装处理", () => {
  withEndedPomodoro({ notifier: "incomplete" }, ({ preview, calls }) => {
    assert.equal(calls.posts.length, 0);
    assert.equal(calls.notifications.length, 1, "应回退到浏览器通知");
    assert.equal(calls.notifications[0].title, preview.DICT.zh["pom.notifyTitleFocus"]);
  });
});
