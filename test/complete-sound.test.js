/**
 * 完成任务音效（test/complete-sound.test.js）
 *
 * 覆盖：
 *  - completeSound 开启时，勾选完成一个任务响一声「叮」；
 *  - completeSound 关闭时不发声，且不影响结束提示音的设置；
 *  - 取消完成不发声。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(root, "lib", "client.js"), "utf8");

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

function jsonResponse(payload) {
  return { ok: true, status: 200, json: () => Promise.resolve(payload) };
}

/**
 * 造一个能真正走完 dataStore.toggleTask 的环境：state 里一个未完成任务，
 * tasks/toggle 直接回写 done，AudioContext 只数振荡器启动次数。
 */
function createEnv(settings) {
  const calls = { dings: 0, requests: [] };
  const task = {
    id: "t-1",
    title: "写周报",
    done: false,
    note: "",
    due: null,
    priority: null,
    projectId: null,
    labels: [],
    createdAt: "2026-11-27T02:00:00.000Z",
    order: 1024,
  };

  const window = {
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
              calls.dings += 1;
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

  const fetch = (url, init) => {
    const target = String(url);
    calls.requests.push(target);
    if (target.endsWith("todo/api/state")) {
      return Promise.resolve(
        jsonResponse({
          ok: true,
          state: {
            tasks: [task],
            projects: [],
            sessions: [],
            settings: { ...settings },
          },
          today: "2026-11-27",
        }),
      );
    }
    if (target.endsWith("todo/api/tasks/toggle")) {
      const body = JSON.parse(init.body);
      const done = body.done === undefined ? !task.done : Boolean(body.done);
      return Promise.resolve(jsonResponse({ ok: true, task: { ...task, done } }));
    }
    return Promise.resolve(jsonResponse({ ok: false, error: "not-found", message: target }));
  };

  const restore = installGlobals({
    fetch,
    document: { baseURI: "http://localhost/" },
    // 完成动画的 220ms 等待立刻放行；toast 的长计时不执行回调，保持结果可断言。
    setTimeout: (fn, ms) => {
      if (Number(ms) >= 1000) return 1;
      queueMicrotask(fn);
      return 1;
    },
    clearTimeout: () => {},
  });

  new Function("window", SOURCE)(window);
  const registration = window.registration;
  assert.ok(registration, "没有调用 window.__ModuleLoader__.load");
  const preview = registration.factory((name) => {
    if (name !== "react") throw new Error(`不允许 require ${name}`);
    return { createElement: () => ({}) };
  }).__preview;

  return { preview, store: preview.__internal.dataStore, calls, restore };
}

async function completeTask(settings, done) {
  const env = createEnv(settings);
  try {
    env.preview.setPreviewLocale("zh");
    await env.store.load();
    const task = env.store.getState().tasks[0];
    await env.store.toggleTask(task, done);
    return { calls: env.calls, toast: env.store.getToast() };
  } finally {
    env.restore();
  }
}

const BASE_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartNext: false,
  sound: true,
  completeSound: true,
  tickSound: false,
  dailyGoal: 8,
  theme: "studio-vivid",
};

test("完成音效开启时，勾选完成一个任务响一声「叮」", async () => {
  const { calls, toast } = await completeTask(BASE_SETTINGS, true);
  assert.equal(calls.dings, 1, "应当只播一声");
  assert.equal(toast.kind, "completed", "完成提示条仍要出现");
});

test("完成音效关闭时不发声，结束提示音开关保持独立", async () => {
  const { calls, toast } = await completeTask({ ...BASE_SETTINGS, sound: false, completeSound: false }, true);
  assert.equal(calls.dings, 0, "关掉完成音效后勾选任务必须静音");
  assert.equal(toast.kind, "completed", "静音不影响完成提示条");
});

test("结束提示音关闭但完成音效开启时，完成任务照常发声", async () => {
  const { calls } = await completeTask({ ...BASE_SETTINGS, sound: false, completeSound: true }, true);
  assert.equal(calls.dings, 1, "两个开关互不影响");
});

test("取消完成不发声", async () => {
  const { calls } = await completeTask(BASE_SETTINGS, false);
  assert.equal(calls.dings, 0, "未完成改为已完成才发声");
});
