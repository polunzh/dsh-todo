/**
 * 番茄钟嘀嗒声（test/pomodoro-tick-sound.test.js）
 *
 * 覆盖：
 *  - 专注运行中每秒 tick 一次，tick / tock 交替；
 *  - 关闭开关、休息模式、暂停、到点都不响；
 *  - 开始计时在用户手势内唤醒 AudioContext；
 *  - 试听播三次。
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

function createEnv(session) {
  const calls = { ticks: 0, filters: [], resumes: 0 };
  const storage = new Map();
  storage.set(STORAGE_KEY, JSON.stringify(session));

  const window = {
    AudioContext: function FakeAudioContext() {
      return {
        state: "suspended",
        sampleRate: 48000,
        currentTime: 0,
        destination: {},
        resume() {
          calls.resumes += 1;
        },
        createBuffer(channels, frames, sampleRate) {
          return { sampleRate, getChannelData: () => new Float32Array(frames) };
        },
        createBufferSource() {
          return {
            buffer: null,
            connect() {},
            start() {
              calls.ticks += 1;
            },
            stop() {},
          };
        },
        createBiquadFilter() {
          const filter = { type: "", frequency: { value: 0 }, Q: { value: 0 }, connect() {} };
          calls.filters.push(filter);
          return filter;
        },
        createGain() {
          return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
        },
        createOscillator() {
          return { type: "sine", frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
        },
      };
    },
    __ModuleLoader__: {
      load(registration) {
        window.registration = registration;
      },
    },
  };

  let timerId = 1;
  const restore = installGlobals({
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    },
    fetch: () => Promise.reject(new Error("offline")),
    setInterval: () => timerId++,
    clearInterval: () => {},
    setTimeout: () => timerId++,
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

  return { calls, load, restore };
}

function runningSession(overrides) {
  return {
    mode: "focus",
    running: true,
    endsAt: Date.now() + 60 * 1000,
    remainingMs: 60 * 1000,
    taskId: null,
    cycle: 0,
    ...overrides,
  };
}

function withEnv(session, run) {
  const env = createEnv(session);
  try {
    const preview = env.load();
    preview.setPreviewLocale("zh");
    const engine = preview.__internal.pomodoroEngine;
    return run({ preview, engine, calls: env.calls });
  } finally {
    env.restore();
  }
}

test("专注运行中每秒一声：tick / tock 交替", () => {
  withEnv(runningSession(), ({ preview, engine, calls }) => {
    engine.setSettings({ ...preview.__internal.DEFAULT_SETTINGS, tickSound: true });
    engine.tick();
    assert.equal(calls.ticks, 1, "一次 tick 应有一声嘀嗒");
    assert.equal(calls.filters.at(-1).frequency.value, 3200, "第一声是 tick");
    engine.tick();
    assert.equal(calls.ticks, 2);
    assert.equal(calls.filters.at(-1).frequency.value, 2400, "第二声是 tock");
    assert.equal(calls.filters.at(-1).type, "bandpass");
  });
});

test("关闭嘀嗒声后不发声", () => {
  withEnv(runningSession(), ({ preview, engine, calls }) => {
    engine.setSettings({ ...preview.__internal.DEFAULT_SETTINGS, tickSound: false });
    engine.tick();
    engine.tick();
    assert.equal(calls.ticks, 0);
  });
});

test("休息模式不嘀嗒", () => {
  withEnv(runningSession({ mode: "short", endsAt: Date.now() + 5 * 60 * 1000, remainingMs: 5 * 60 * 1000 }), ({ preview, engine, calls }) => {
    engine.setSettings({ ...preview.__internal.DEFAULT_SETTINGS, tickSound: true });
    engine.tick();
    assert.equal(calls.ticks, 0);
  });
});

test("暂停时不发声，继续后恢复", () => {
  withEnv(runningSession({ running: false, endsAt: null }), ({ preview, engine, calls }) => {
    engine.setSettings({ ...preview.__internal.DEFAULT_SETTINGS, tickSound: true });
    engine.tick();
    assert.equal(calls.ticks, 0, "暂停状态 tick 应当直接返回");
    engine.dispatch({ type: "start" });
    engine.tick();
    assert.equal(calls.ticks, 1);
  });
});

test("到点不追加嘀嗒，交给结束提示", () => {
  withEnv(runningSession({ endsAt: Date.now() - 1000, remainingMs: 1000 }), ({ preview, engine, calls }) => {
    engine.setSettings({ ...preview.__internal.DEFAULT_SETTINGS, tickSound: true, sound: false });
    engine.tick();
    assert.equal(calls.ticks, 0, "到点那一秒不应再响一声嘀嗒");
  });
});

test("开始计时在用户手势内唤醒 AudioContext", () => {
  withEnv(runningSession({ running: false, endsAt: null, remainingMs: 60000 }), ({ preview, engine, calls }) => {
    engine.setSettings({ ...preview.__internal.DEFAULT_SETTINGS, tickSound: true });
    engine.dispatch({ type: "start" });
    assert.ok(calls.resumes >= 1, "开始时应尝试 resume 音频上下文");
  });
});

test("试听播三次，且与真实嘀嗒共用合成", () => {
  assert.match(SOURCE, /function playTickPreview\(\)/);
  assert.match(SOURCE, /playTick\(0\);\s*playTick\(0\.4\);\s*playTick\(0\.8\);/);
  assert.match(SOURCE, /onClick: playTickPreview/);
});
