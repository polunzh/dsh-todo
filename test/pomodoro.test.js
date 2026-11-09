/**
 * 番茄钟状态机测试（test/pomodoro.test.js）
 *
 * 覆盖：
 *  - 启动、暂停、继续、放弃、跳过；
 *  - tick 递减并在到点时自动切到短休 / 专注；
 *  - 4 个专注后长休（默认 longBreakEvery: 4）；
 *  - 自定义时长（设置）；
 *  - 任务绑定与解绑；
 *  - 恢复非法/损坏状态（normalizePomodoro）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(root, "lib", "client.js"), "utf8");

function loadClient() {
  let exported = null;
  const listeners = new Map();
  // 模块闭包里引用的 window 就是这里传进去的这个对象。
  const window = {
    addEventListener(type, handler) {
      const set = listeners.get(type) || new Set();
      set.add(handler);
      listeners.set(type, set);
    },
    removeEventListener(type, handler) {
      const set = listeners.get(type);
      if (set) set.delete(handler);
    },
    __ModuleLoader__: {
      load(registration) {
        exported = registration.factory((name) => {
          assert.equal(name, "react");
          return {};
        });
      },
    },
  };
  new Function("window", SOURCE)(window);
  return { preview: exported.__preview, listeners };
}

const { preview, listeners: windowListeners } = loadClient();
const { pomodoroReducer, freshPomodoro, normalizePomodoro, modeMinutes, pomodoroRemaining } = preview;

const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartNext: false,
};

const MS_FOCUS = 25 * 60 * 1000;
const MS_SHORT = 5 * 60 * 1000;
const MS_LONG = 15 * 60 * 1000;

function reduce(state, action, extra) {
  return pomodoroReducer(state, { settings: DEFAULT_SETTINGS, ...(extra || {}), ...action });
}

/* ============================ 基础流转 ============================ */

test("初始状态为未运行的 25 分钟专注", () => {
  const initial = freshPomodoro(DEFAULT_SETTINGS);
  assert.equal(initial.mode, "focus");
  assert.equal(initial.running, false);
  assert.equal(initial.remainingMs, MS_FOCUS);
  assert.equal(initial.endsAt, null);
  assert.equal(initial.cycle, 0);
  assert.equal(initial.taskId, null);
});

test("start 设定 endsAt 并转为 running", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "start", now: 1000 });
  assert.equal(s1.running, true);
  assert.equal(s1.endsAt, 1000 + MS_FOCUS);
  assert.equal(s1.remainingMs, MS_FOCUS);
  // 重复 start 无副作用
  assert.equal(reduce(s1, { type: "start", now: 2000 }), s1);
});

test("pause 暂停并保留剩余时间", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "start", now: 0 });
  const s2 = reduce(s1, { type: "pause", now: 60 * 1000 });
  assert.equal(s2.running, false);
  assert.equal(s2.endsAt, null);
  assert.equal(s2.remainingMs, MS_FOCUS - 60 * 1000);
  // 已暂停时再 pause 无副作用
  assert.equal(reduce(s2, { type: "pause", now: 120 * 1000 }), s2);
});

test("resume 从暂停点继续倒计时", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "start", now: 0 });
  const s2 = reduce(s1, { type: "pause", now: 60 * 1000 });
  const s3 = reduce(s2, { type: "resume", now: 200 * 1000 });
  assert.equal(s3.running, true);
  assert.equal(s3.endsAt, 200 * 1000 + (MS_FOCUS - 60 * 1000));
  assert.equal(s3.remainingMs, MS_FOCUS - 60 * 1000);
});

test("toggle 切换 running 状态", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "toggle", now: 0 });
  assert.equal(s1.running, true);
  const s2 = reduce(s1, { type: "toggle", now: 1000 });
  assert.equal(s2.running, false);
});

test("abandon 重置到初始专注", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "start", now: 0 });
  const s2 = reduce(s1, { type: "abandon" });
  assert.equal(s2.mode, "focus");
  assert.equal(s2.running, false);
  assert.equal(s2.endsAt, null);
  assert.equal(s2.remainingMs, MS_FOCUS);
});

/* ============================ 倒计时与切段 ============================ */

test("tick 递减剩余时间", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "start", now: 0 });
  const s2 = reduce(s1, { type: "tick", now: 5000 });
  assert.equal(s2.remainingMs, MS_FOCUS - 5000);
  assert.equal(s2.running, true);
});

test("未运行时 tick 无副作用", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  assert.equal(reduce(s0, { type: "tick", now: 1000 }), s0);
});

test("专注到点切到短休（未开自动开始则停止）", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "start", now: 0 });
  const s2 = reduce(s1, { type: "tick", now: MS_FOCUS });
  assert.equal(s2.mode, "short");
  assert.equal(s2.cycle, 1);
  assert.equal(s2.running, false);
  assert.equal(s2.endsAt, null);
  assert.equal(s2.remainingMs, MS_SHORT);
});

test("开启 autoStartNext 时到点直接开始下一段", () => {
  const settings = { ...DEFAULT_SETTINGS, autoStartNext: true };
  const s0 = freshPomodoro(settings);
  const s1 = pomodoroReducer(s0, { type: "start", now: 0, settings });
  const s2 = pomodoroReducer(s1, { type: "tick", now: MS_FOCUS, settings });
  assert.equal(s2.mode, "short");
  assert.equal(s2.running, true);
  assert.equal(s2.endsAt, MS_FOCUS + MS_SHORT);
  assert.equal(s2.remainingMs, MS_SHORT);
});

test("短休到点切回专注，cycle 不递增", () => {
  let s = freshPomodoro(DEFAULT_SETTINGS);
  s = reduce(s, { type: "start", now: 0 });
  s = reduce(s, { type: "tick", now: MS_FOCUS });
  assert.equal(s.mode, "short");
  assert.equal(s.cycle, 1);
  // 开始短休并走完
  s = reduce(s, { type: "start", now: MS_FOCUS });
  s = reduce(s, { type: "tick", now: MS_FOCUS + MS_SHORT });
  assert.equal(s.mode, "focus");
  assert.equal(s.cycle, 1);
  assert.equal(s.remainingMs, MS_FOCUS);
  assert.equal(s.running, false);
});

test("完整 4 个专注后切到长休（15 分钟）", () => {
  let s = freshPomodoro(DEFAULT_SETTINGS);
  let now = 0;
  for (let cycle = 1; cycle <= 4; cycle += 1) {
    // 专注
    s = reduce(s, { type: "start", now });
    now += MS_FOCUS;
    s = reduce(s, { type: "tick", now });
    assert.equal(s.cycle, cycle);
    if (cycle < 4) {
      assert.equal(s.mode, "short", `第 ${cycle} 个专注后应为短休`);
      // 短休走完
      s = reduce(s, { type: "start", now });
      now += MS_SHORT;
      s = reduce(s, { type: "tick", now });
      assert.equal(s.mode, "focus");
    }
  }
  // 第 4 个专注走完应该进长休
  assert.equal(s.mode, "long");
  assert.equal(s.remainingMs, MS_LONG);
  assert.equal(s.cycle, 4);

  // 长休走完切回专注，cycle 仍为 4，第 5 个重新记起
  s = reduce(s, { type: "start", now });
  now += MS_LONG;
  s = reduce(s, { type: "tick", now });
  assert.equal(s.mode, "focus");
  assert.equal(s.cycle, 4);
});

test("skip 手动跳过当前段", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "skip" });
  assert.equal(s1.mode, "short");
  assert.equal(s1.cycle, 1);
  assert.equal(s1.running, false);
  assert.equal(s1.remainingMs, MS_SHORT);

  // 短休 skip 切回专注
  const s2 = reduce(s1, { type: "skip" });
  assert.equal(s2.mode, "focus");
  assert.equal(s2.cycle, 1);
  assert.equal(s2.remainingMs, MS_FOCUS);
});

test("bind 绑定与解绑任务", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "bind", taskId: "t-123" });
  assert.equal(s1.taskId, "t-123");
  const s2 = reduce(s1, { type: "bind", taskId: null });
  assert.equal(s2.taskId, null);
});

test("setMode 手动切换模式并重置倒计时", () => {
  const s0 = freshPomodoro(DEFAULT_SETTINGS);
  const s1 = reduce(s0, { type: "setMode", mode: "short" });
  assert.equal(s1.mode, "short");
  assert.equal(s1.remainingMs, MS_SHORT);
  const s2 = reduce(s1, { type: "setMode", mode: "long" });
  assert.equal(s2.mode, "long");
  assert.equal(s2.remainingMs, MS_LONG);
});

/* ============================ 设置与恢复 ============================ */

test("支持自定义时长设置", () => {
  const custom = {
    focusMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 30,
    longBreakEvery: 2,
    autoStartNext: false,
  };
  assert.equal(modeMinutes("focus", custom), 50);
  assert.equal(modeMinutes("short", custom), 10);
  assert.equal(modeMinutes("long", custom), 30);

  let s = freshPomodoro(custom);
  assert.equal(s.remainingMs, 50 * 60 * 1000);
  s = pomodoroReducer(s, { type: "start", now: 0, settings: custom });
  // 第 1 个走完是短休
  s = pomodoroReducer(s, { type: "tick", now: 50 * 60 * 1000, settings: custom });
  assert.equal(s.mode, "short");
  assert.equal(s.remainingMs, 10 * 60 * 1000);
  // 短休走完
  s = pomodoroReducer(s, { type: "start", now: 50 * 60 * 1000, settings: custom });
  s = pomodoroReducer(s, { type: "tick", now: 60 * 60 * 1000, settings: custom });
  assert.equal(s.mode, "focus");
  // 第 2 个走完应直接进长休（longBreakEvery = 2）
  s = pomodoroReducer(s, { type: "start", now: 60 * 60 * 1000, settings: custom });
  s = pomodoroReducer(s, { type: "tick", now: 110 * 60 * 1000, settings: custom });
  assert.equal(s.mode, "long");
  assert.equal(s.remainingMs, 30 * 60 * 1000);
});

test("normalizePomodoro 容忍损坏/缺失的 localStorage 数据", () => {
  assert.deepEqual(normalizePomodoro(null, DEFAULT_SETTINGS), freshPomodoro(DEFAULT_SETTINGS));
  assert.deepEqual(normalizePomodoro("corrupted", DEFAULT_SETTINGS), freshPomodoro(DEFAULT_SETTINGS));
  assert.deepEqual(normalizePomodoro({}, DEFAULT_SETTINGS), freshPomodoro(DEFAULT_SETTINGS));

  // 运行中的正常状态保留 endsAt
  const running = normalizePomodoro(
    { mode: "focus", endsAt: 100000, remainingMs: 50000, running: true, taskId: "t-1", cycle: 2 },
    DEFAULT_SETTINGS,
  );
  assert.equal(running.running, true);
  assert.equal(running.endsAt, 100000);
  assert.equal(running.taskId, "t-1");
  assert.equal(running.cycle, 2);

  // running 为 true 但 endsAt 非法时自动纠正为暂停
  const fixed = normalizePomodoro(
    { mode: "focus", endsAt: null, remainingMs: 50000, running: true, taskId: null, cycle: 0 },
    DEFAULT_SETTINGS,
  );
  assert.equal(fixed.running, false);
  assert.equal(fixed.endsAt, null);
});

test("pomodoroRemaining 计算当前剩余毫秒数", () => {
  const stopped = { running: false, endsAt: null, remainingMs: 12000 };
  assert.equal(pomodoroRemaining(stopped, 0), 12000);

  const running = { running: true, endsAt: 10000, remainingMs: 10000 };
  assert.equal(pomodoroRemaining(running, 4000), 6000);
  assert.equal(pomodoroRemaining(running, 12000), 0);
});

/* ============================ 引擎：localStorage 与定时器 ============================ */

const STORAGE_KEY = preview.STORAGE_KEY;
assert.equal(STORAGE_KEY, "dsh-todo/pomodoro", "番茄钟状态键名必须是 dsh-todo/pomodoro");

function withGlobals(stubs, fn) {
  const saved = new Map();
  for (const [key, value] of Object.entries(stubs)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  try {
    return fn();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

/** 建一个干净的浏览器环境（假定时器 + 假 localStorage），跑一段引擎逻辑并在结束后 release。 */
function withEngine(options, fn) {
  const seed = options.seed;
  const storage = new Map(seed ? [[STORAGE_KEY, JSON.stringify(seed)]] : []);
  const intervals = new Map();
  const timeouts = new Map();
  let nextId = 1;

  const localStorageStub = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  const stubs = {
    localStorage: localStorageStub,
    fetch: () => Promise.reject(new Error("offline")),
    setInterval: (callback, ms) => {
      const id = nextId++;
      intervals.set(id, { callback, ms });
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (callback, ms) => {
      const id = nextId++;
      timeouts.set(id, { callback, ms });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
  };

  const result = withGlobals(stubs, () => {
    const engine = preview.createPomodoroEngine();
    engine.setSettings({ ...DEFAULT_SETTINGS, ...(options.settings || {}) });
    engine.setTasks(options.tasks || []);
    const release = engine.retain();
    let value;
    try {
      value = fn({ engine, storage, intervals, localStorage: localStorageStub });
    } finally {
      release();
    }
    return value;
  });

  return { value: result, storage, intervals };
}

test("刷新后按 localStorage 里的 endsAt 继续倒计时", () => {
  const now = Date.now();
  const seed = {
    mode: "focus",
    endsAt: now + 60 * 1000,
    remainingMs: 60 * 1000,
    running: true,
    taskId: "t-1",
    cycle: 2,
  };
  const { value, intervals: liveIntervals } = withEngine({ seed }, ({ engine, intervals }) => {
    const state = engine.get();
    assert.equal(state.running, true);
    assert.equal(state.taskId, "t-1");
    assert.equal(state.cycle, 2);
    assert.ok(engine.remaining() > 0, "剩余时间应继续递减");
    assert.equal(engine.hasTimer(), true, "运行中应挂上定时器");
    assert.equal(intervals.size, 1);
    assert.equal(windowListeners.get("storage").size, 1, "应监听 storage 事件以跨标签页同步");
    return state;
  });
  // release 之后所有定时器与监听器都要清掉
  assert.equal(liveIntervals.size, 0, "release 之后不应留下 interval");
  assert.equal(windowListeners.get("storage").size, 0, "release 之后不应留下 storage 监听");
  assert.equal(value.mode, "focus");
});

test("开始 / 暂停都会写入 dsh-todo/pomodoro", () => {
  const { value, storage } = withEngine({}, ({ engine, localStorage: storageApi }) => {
    engine.dispatch({ type: "start" });
    const started = JSON.parse(storageApi.getItem(STORAGE_KEY));
    assert.equal(started.running, true);
    assert.ok(started.endsAt > Date.now());

    engine.dispatch({ type: "pause" });
    const paused = JSON.parse(storageApi.getItem(STORAGE_KEY));
    assert.equal(paused.running, false);
    assert.equal(paused.endsAt, null);
    assert.ok(paused.remainingMs > 0 && paused.remainingMs <= MS_FOCUS);

    engine.dispatch({ type: "bind", taskId: "t-9" });
    assert.equal(JSON.parse(storageApi.getItem(STORAGE_KEY)).taskId, "t-9");
    return engine.get();
  });
  assert.equal(value.running, false);
  assert.equal(value.taskId, "t-9");
  // 内存里也只有这一份状态
  assert.equal(storage.size, 1);
});

test("到点 tick 会自动切段并停下定时器", () => {
  const seed = {
    mode: "focus",
    endsAt: Date.now() - 1000,
    remainingMs: 0,
    running: true,
    taskId: null,
    cycle: 0,
  };
  const { value, intervals: liveIntervals, storage } = withEngine({ seed }, ({ engine, intervals }) => {
    engine.tick();
    return engine.get();
  });
  assert.equal(value.mode, "short");
  assert.equal(value.cycle, 1);
  assert.equal(value.running, false);
  assert.equal(liveIntervals.size, 0, "到点后应清掉倒计时");
  const stored = JSON.parse(storage.get(STORAGE_KEY));
  assert.equal(stored.mode, "short");
  assert.equal(stored.running, false);
});

test("另一个标签页已经结束同一段时，不重复记录", () => {
  const endsAt = Date.now() - 1000;
  const seed = {
    mode: "focus",
    endsAt,
    remainingMs: 0,
    running: true,
    taskId: null,
    cycle: 0,
  };
  const { value, intervals: liveIntervals } = withEngine({ seed }, ({ engine, intervals, localStorage: storageApi }) => {
    // 模拟另一个标签页先完成：同一个 endsAt，但已经切到短休并停止
    storageApi.setItem(
      STORAGE_KEY,
      JSON.stringify({ mode: "short", endsAt: null, remainingMs: MS_SHORT, running: false, taskId: null, cycle: 1 }),
    );
    engine.tick();
    return engine.get();
  });
  assert.equal(value.mode, "short");
  assert.equal(value.cycle, 1, "沿用先写入的那份状态，不重复计数");
  assert.equal(liveIntervals.size, 0);
});
