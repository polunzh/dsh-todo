/**
 * dsh-todo：本地 JSON 存储层。
 *
 * 数据放在 `$DSH_HOME/storages/todo/state.json`，同一台机器上的 Web 与
 * Desktop 共用一份。写入使用「临时文件 + renameSync」，进程中途退出也不会
 * 留下半截 JSON；文件损坏时改名为 `state.json.corrupt-<ts>` 后从空状态开始。
 *
 * 所有函数都接受 `opts`：
 *   - `dataDir`：覆盖数据目录（测试注入临时目录）；
 *   - `now`：覆盖当前时间戳；
 *   - `today`：覆盖本地日期字符串 `YYYY-MM-DD`。
 */
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { advanceDate, isDateString } from "./recurrence.js";

const NS = "dsh-todo";

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/** 存储层上限（docs/contract.md §1）。 */
export const LIMITS = {
  tasks: 5_000,
  projects: 100,
  sessions: 10_000,
  title: 500,
  note: 10_000,
  labels: 10,
  labelLength: 40,
  projectsName: 80,
  body: 64 * 1024,
};

/** 项目配色白名单。 */
export const COLORS = ["tomato", "amber", "lime", "sky", "grape", "slate"];

/** 优先级：0 = P0 最紧急，1 = P1，4 = P4 最低。 */
export const PRIORITIES = [0, 1, 2, 3, 4];

/** 默认设置。 */
export const DEFAULT_SETTINGS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartNext: false,
  /** 结束提示音默认关闭，用户主动打开才响。 */
  sound: false,
  dailyGoal: 8,
});

const SETTINGS_RANGES = {
  focusMinutes: [1, 180],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 120],
  longBreakEvery: [2, 12],
  dailyGoal: [1, 40],
};

const SETTINGS_BOOLEANS = ["autoStartNext", "sound"];

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ORDER_STEP = 1024;

/* ------------------------------------------------------------------ */
/* 错误                                                                */
/* ------------------------------------------------------------------ */

/** 带错误码的失败；路由层直接映射成 HTTP 状态。 */
export class StoreError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new StoreError(code, message);
}

/* ------------------------------------------------------------------ */
/* 路径与时间                                                          */
/* ------------------------------------------------------------------ */

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** 数据目录。 */
export function dataDir(opts = {}) {
  if (typeof opts.dataDir === "string" && opts.dataDir.trim()) return opts.dataDir;
  return join(dshHome(), "storages", "todo");
}

/** 数据文件。 */
export function dataFile(opts = {}) {
  return join(dataDir(opts), "state.json");
}

/** 当前时间戳。 */
export function nowOf(opts = {}) {
  const n = Number(opts.now);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
}

/** 本地日期字符串 `YYYY-MM-DD`。 */
export function localDate(ms) {
  const dt = new Date(ms);
  const y = String(dt.getFullYear()).padStart(4, "0");
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 请求上下文里的 today（本地日期）。 */
export function todayOf(opts = {}) {
  if (isDateString(opts.today)) return opts.today;
  return localDate(nowOf(opts));
}

/* ------------------------------------------------------------------ */
/* 校验                                                                */
/* ------------------------------------------------------------------ */

export function isId(value) {
  return typeof value === "string" && ID_RE.test(value);
}

function requireId(value, label = "id") {
  if (!isId(value)) fail("invalid-id", `${label} 不合法`);
  return value;
}

function isTimestamp(value) {
  return Number.isFinite(value) && value > 0 && value < 8_640_000_000_000_000;
}

function normalizeTitle(value) {
  if (typeof value !== "string") fail("invalid-title", "标题必须是文本");
  const title = value.trim();
  if (!title) fail("invalid-title", "标题不能为空");
  if (title.length > LIMITS.title) fail("title-too-long", `标题最多 ${LIMITS.title} 个字符`);
  return title;
}

function normalizeNote(value, fallback = "") {
  if (value === undefined) return fallback;
  if (value === null) return "";
  if (typeof value !== "string") fail("invalid-body", "备注必须是文本");
  if (value.length > LIMITS.note) fail("invalid-body", `备注最多 ${LIMITS.note} 个字符`);
  return value;
}

function normalizeTime(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !TIME_RE.test(value)) fail("invalid-due", "时刻必须是 HH:mm");
  return value;
}

/** `{date,time}` / `null` / 字符串 `YYYY-MM-DD`。 */
export function normalizeDue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (!isDateString(value)) fail("invalid-due", "截止日期必须是 YYYY-MM-DD");
    return { date: value, time: null };
  }
  if (typeof value !== "object" || Array.isArray(value)) fail("invalid-due", "截止日期格式不对");
  const date = value.date;
  if (!isDateString(date)) fail("invalid-due", "截止日期必须是 YYYY-MM-DD");
  return { date, time: normalizeTime(value.time) };
}

function normalizePriority(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!PRIORITIES.includes(n)) fail("invalid-priority", "优先级只能是 0–4 或空");
  return n;
}

function normalizeLabels(value) {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) fail("invalid-labels", "标签必须是文本数组");
  const out = [];
  for (const raw of value) {
    if (typeof raw !== "string") fail("invalid-labels", "标签必须是文本");
    const label = raw.trim().replace(/^#/, "").trim();
    if (!label) continue;
    if (label.length > LIMITS.labelLength) fail("invalid-labels", `单个标签最多 ${LIMITS.labelLength} 个字符`);
    if (!out.includes(label)) out.push(label);
  }
  if (out.length > LIMITS.labels) fail("invalid-labels", `最多 ${LIMITS.labels} 个标签`);
  return out;
}

function normalizeRecurrence(value) {
  if (value === null || value === undefined || value === "" || value === "none") return null;
  if (typeof value === "string") {
    const freq = value;
    if (!["daily", "weekday", "weekly", "monthly"].includes(freq)) {
      fail("invalid-recurrence", "重复规则不支持");
    }
    return { freq, interval: 1 };
  }
  if (typeof value !== "object" || Array.isArray(value)) fail("invalid-recurrence", "重复规则格式不对");
  const freq = value.freq;
  if (!["daily", "weekday", "weekly", "monthly"].includes(freq)) {
    fail("invalid-recurrence", "重复规则不支持");
  }
  const rawInterval = value.interval ?? 1;
  const interval = Number(rawInterval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
    fail("invalid-recurrence", "重复间隔必须是 1–30");
  }
  return { freq, interval: freq === "weekday" ? 1 : interval };
}

function normalizeColor(value, fallback = "tomato") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !COLORS.includes(value)) fail("invalid-project", "项目颜色不支持");
  return value;
}

function normalizeProjectName(value) {
  if (typeof value !== "string") fail("invalid-project", "项目名必须是文本");
  const name = value.trim();
  if (!name) fail("invalid-project", "项目名不能为空");
  if (name.length > LIMITS.projectsName) fail("invalid-project", `项目名最多 ${LIMITS.projectsName} 个字符`);
  return name;
}

/* ------------------------------------------------------------------ */
/* 状态读写                                                            */
/* ------------------------------------------------------------------ */

/** 当前数据结构版本；v2 起提示音默认关闭。 */
export const STATE_VERSION = 2;

function emptyState() {
  return {
    version: STATE_VERSION,
    tasks: [],
    projects: [],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return settings;
  for (const [key, [min, max]] of Object.entries(SETTINGS_RANGES)) {
    const n = Number(raw[key]);
    if (Number.isInteger(n) && n >= min && n <= max) settings[key] = n;
  }
  for (const key of SETTINGS_BOOLEANS) {
    if (typeof raw[key] === "boolean") settings[key] = raw[key];
  }
  return settings;
}

/** 把磁盘上的一条记录收敛成合法任务；不合法时返回 null。 */
function normalizeStoredTask(raw, projectIds) {
  if (!raw || typeof raw !== "object") return null;
  if (!isId(raw.id)) return null;
  let title;
  try {
    title = normalizeTitle(raw.title);
  } catch {
    return null;
  }
  const createdAt = isTimestamp(raw.createdAt) ? Number(raw.createdAt) : Date.now();
  let due = null;
  try {
    due = normalizeDue(raw.due);
  } catch {
    due = null;
  }
  let priority = null;
  try {
    priority = normalizePriority(raw.priority);
  } catch {
    priority = null;
  }
  let labels = [];
  try {
    labels = normalizeLabels(raw.labels);
  } catch {
    labels = [];
  }
  let recurrence = null;
  try {
    recurrence = normalizeRecurrence(raw.recurrence);
  } catch {
    recurrence = null;
  }
  const projectId =
    typeof raw.projectId === "string" && projectIds.has(raw.projectId) ? raw.projectId : null;
  return {
    id: raw.id,
    title,
    note: typeof raw.note === "string" ? raw.note.slice(0, LIMITS.note) : "",
    due,
    priority,
    projectId,
    labels,
    parentId: typeof raw.parentId === "string" && isId(raw.parentId) ? raw.parentId : null,
    recurrence,
    done: raw.done === true,
    doneAt: raw.done === true && isTimestamp(raw.doneAt) ? Number(raw.doneAt) : null,
    createdAt,
    updatedAt: isTimestamp(raw.updatedAt) ? Number(raw.updatedAt) : createdAt,
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : ORDER_STEP,
    pomodoros: Number.isInteger(raw.pomodoros) && raw.pomodoros >= 0 ? raw.pomodoros : 0,
  };
}

function normalizeStoredProject(raw, taken) {
  if (!raw || typeof raw !== "object") return null;
  if (!isId(raw.id) || taken.has(raw.id)) return null;
  let name;
  try {
    name = normalizeProjectName(raw.name);
  } catch {
    return null;
  }
  return {
    id: raw.id,
    name,
    color: COLORS.includes(raw.color) ? raw.color : COLORS[0],
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
    createdAt: isTimestamp(raw.createdAt) ? Number(raw.createdAt) : Date.now(),
  };
}

function normalizeStoredSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!isId(raw.id)) return null;
  const startedAt = Number(raw.startedAt);
  const endedAt = Number(raw.endedAt);
  if (!isTimestamp(startedAt) || !isTimestamp(endedAt)) return null;
  const minutes = Number(raw.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return null;
  return {
    id: raw.id,
    taskId: isId(raw.taskId) ? raw.taskId : null,
    kind: raw.kind === "focus" ? "focus" : "focus",
    startedAt,
    endedAt,
    minutes,
  };
}

function normalizeState(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return state;
  const projects = [];
  const taken = new Set();
  if (Array.isArray(raw.projects)) {
    for (const item of raw.projects) {
      const project = normalizeStoredProject(item, taken);
      if (project) {
        projects.push(project);
        taken.add(project.id);
      }
    }
  }
  state.projects = projects.slice(0, LIMITS.projects);

  const projectIds = new Set(state.projects.map((project) => project.id));
  const tasks = [];
  const taskIds = new Set();
  if (Array.isArray(raw.tasks)) {
    for (const item of raw.tasks) {
      const task = normalizeStoredTask(item, projectIds);
      if (task && !taskIds.has(task.id)) {
        tasks.push(task);
        taskIds.add(task.id);
      }
    }
  }
  // 子任务只允许一层：父任务本身必须是顶层任务，且不能自己引用自己。
  const topLevel = new Set(tasks.filter((task) => task.parentId === null).map((task) => task.id));
  for (const task of tasks) {
    if (task.parentId !== null && (!topLevel.has(task.parentId) || task.parentId === task.id)) {
      task.parentId = null;
    }
  }
  state.tasks = tasks.slice(0, LIMITS.tasks);

  const sessions = [];
  if (Array.isArray(raw.sessions)) {
    for (const item of raw.sessions) {
      const session = normalizeStoredSession(item);
      if (session) sessions.push(session);
    }
  }
  sessions.sort((a, b) => a.startedAt - b.startedAt);
  state.sessions = sessions.slice(-LIMITS.sessions);

  state.settings = normalizeSettings(raw.settings);
  // v1 时期提示音默认开启且无法区分"默认"与"主动打开"，迁移时统一关掉；
  // 用户之后在面板里打开会写入 version 2 的文件，不再被覆盖。
  if (!Number.isInteger(raw.version) || raw.version < STATE_VERSION) state.settings.sound = false;
  state.version = STATE_VERSION;
  return state;
}

function quarantine(file, logger) {
  const target = `${file}.corrupt-${Date.now()}`;
  try {
    renameSync(file, target);
    logger?.warn?.(`${NS}: 数据文件损坏，已改名为 ${target}`);
  } catch (error) {
    logger?.warn?.(`${NS}: 数据文件损坏且无法改名：${error instanceof Error ? error.message : error}`);
  }
  return emptyState();
}

/**
 * 读取状态。文件不存在或损坏时返回空状态，从不抛出。
 *
 * @param {{ dataDir?: string, logger?: object }} [opts]
 */
export function readState(opts = {}) {
  const file = dataFile(opts);
  if (!existsSync(file)) return emptyState();
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return emptyState();
  }
  if (!text.trim()) return quarantine(file, opts.logger);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return quarantine(file, opts.logger);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return quarantine(file, opts.logger);
  return normalizeState(raw);
}

/** 原子写入状态：临时文件 + renameSync，文件 0o600、目录 0o700。 */
export function writeState(state, opts = {}) {
  const dir = dataDir(opts);
  const file = dataFile(opts);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* 某些文件系统不支持改权限，忽略 */
  }
  const payload = `${JSON.stringify(state, null, 2)}\n`;
  const tmp = join(dir, `.state.${process.pid}.${randomUUID()}.tmp`);
  writeFileSync(tmp, payload, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(tmp, 0o600);
  } catch {
    /* 忽略 */
  }
  renameSync(tmp, file);
  return state;
}

/* ------------------------------------------------------------------ */
/* 查询辅助                                                            */
/* ------------------------------------------------------------------ */

function tasksOf(state) {
  return state.tasks;
}

function findTask(state, id) {
  return state.tasks.find((task) => task.id === id) ?? null;
}

function findProject(state, id) {
  return state.projects.find((project) => project.id === id) ?? null;
}

function childrenOf(state, id) {
  return state.tasks.filter((task) => task.parentId === id).sort(byOrder);
}

function byOrder(a, b) {
  return a.order - b.order || a.createdAt - b.createdAt;
}

function siblingsOf(state, task) {
  return state.tasks.filter((other) => other.parentId === task.parentId).sort(byOrder);
}

function nextOrder(state, parentId) {
  const siblings = state.tasks.filter((task) => task.parentId === parentId);
  if (!siblings.length) return ORDER_STEP;
  return Math.max(...siblings.map((task) => task.order)) + ORDER_STEP;
}

function resolveProjectId(state, value) {
  if (value === null || value === undefined || value === "") return null;
  if (!isId(value)) fail("invalid-project", "项目 id 不合法");
  if (!findProject(state, value)) fail("invalid-project", "找不到这个项目");
  return value;
}

function resolveParentId(state, value, task = null) {
  if (value === null || value === undefined || value === "") return null;
  if (!isId(value)) fail("invalid-parent", "父任务 id 不合法");
  if (task && value === task.id) fail("invalid-parent", "任务不能成为自己的子任务");
  const parent = findTask(state, value);
  if (!parent) fail("invalid-parent", "找不到父任务");
  if (parent.parentId !== null) fail("invalid-parent", "子任务只允许一层");
  if (task && childrenOf(state, task.id).length > 0) {
    fail("invalid-parent", "有子任务的任务不能再成为子任务");
  }
  return parent.id;
}

/* ------------------------------------------------------------------ */
/* 任务                                                                */
/* ------------------------------------------------------------------ */

function cloneTask(task) {
  return JSON.parse(JSON.stringify(task));
}

function insertNextOccurrence(state, task, opts) {
  const now = nowOf(opts);
  const today = todayOf(opts);
  const recurring = task.recurrence;
  if (!recurring) return { next: null, clones: [] };

  const dueDate = advanceDate(task.due?.date ?? null, recurring, today);

  // 顺移旧任务后面的同级任务，给新 occurrence 腾出紧邻的位置。
  for (const sibling of tasksOf(state)) {
    if (sibling.parentId === task.parentId && sibling.order > task.order) sibling.order += 1;
  }

  const next = {
    ...cloneTask(task),
    id: randomUUID(),
    due: { date: dueDate, time: task.due?.time ?? null },
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
    order: task.order + 1,
    pomodoros: 0,
  };

  const clones = [];
  for (const child of childrenOf(state, task.id)) {
    clones.push({
      ...cloneTask(child),
      id: randomUUID(),
      parentId: next.id,
      done: false,
      doneAt: null,
      createdAt: now,
      updatedAt: now,
      pomodoros: 0,
    });
  }

  if (state.tasks.length + 1 + clones.length > LIMITS.tasks) {
    fail("tasks-limit", `任务最多 ${LIMITS.tasks} 个`);
  }
  state.tasks.push(next, ...clones);
  return { next, clones };
}

/**
 * 新建任务。
 *
 * @param {object} input
 * @param {object} [opts]
 */
export function createTask(input = {}, opts = {}) {
  const state = readState(opts);
  if (state.tasks.length >= LIMITS.tasks) fail("tasks-limit", `任务最多 ${LIMITS.tasks} 个`);
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "任务格式不对");

  const now = nowOf(opts);
  const parentId = resolveParentId(state, input.parentId);
  const inherited = parentId ? findTask(state, parentId)?.projectId ?? null : null;
  const projectId =
    input.projectId === undefined ? inherited : resolveProjectId(state, input.projectId);

  const task = {
    id: randomUUID(),
    title: normalizeTitle(input.title),
    note: normalizeNote(input.note),
    due: normalizeDue(input.due),
    priority: normalizePriority(input.priority),
    projectId,
    labels: normalizeLabels(input.labels),
    parentId,
    recurrence: normalizeRecurrence(input.recurrence),
    done: false,
    doneAt: null,
    createdAt: now,
    updatedAt: now,
    order: nextOrder(state, parentId),
    pomodoros: 0,
  };

  state.tasks.push(task);
  writeState(state, opts);
  return task;
}

const UPDATABLE = ["title", "note", "due", "priority", "projectId", "labels", "parentId", "recurrence"];

/**
 * 修改任务的可改字段。`due: null` 清除截止日期；未知字段忽略。
 */
export function updateTask(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "任务格式不对");
  const state = readState(opts);
  const id = requireId(input.id);
  const task = findTask(state, id);
  if (!task) fail("not-found", "找不到这个任务");

  const now = nowOf(opts);
  const patch = {};
  if (Object.hasOwn(input, "title")) patch.title = normalizeTitle(input.title);
  if (Object.hasOwn(input, "note")) patch.note = normalizeNote(input.note, task.note);
  if (Object.hasOwn(input, "due")) patch.due = normalizeDue(input.due);
  if (Object.hasOwn(input, "priority")) patch.priority = normalizePriority(input.priority);
  if (Object.hasOwn(input, "projectId")) patch.projectId = resolveProjectId(state, input.projectId);
  if (Object.hasOwn(input, "labels")) patch.labels = normalizeLabels(input.labels);
  if (Object.hasOwn(input, "recurrence")) patch.recurrence = normalizeRecurrence(input.recurrence);
  if (Object.hasOwn(input, "parentId")) {
    const parentId = resolveParentId(state, input.parentId, task);
    patch.parentId = parentId;
    if (parentId !== task.parentId) patch.order = nextOrder(state, parentId);
  }

  for (const key of UPDATABLE) {
    if (Object.hasOwn(patch, key)) task[key] = patch[key];
  }
  task.updatedAt = now;
  writeState(state, opts);
  return task;
}

/**
 * 完成 / 撤销任务。完成带 recurrence 的任务时会生成下一次 occurrence。
 *
 * @returns {{ task: object, next: object | null, clones: object[] }}
 */
export function toggleTask(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "任务格式不对");
  const state = readState(opts);
  const id = requireId(input.id);
  const task = findTask(state, id);
  if (!task) fail("not-found", "找不到这个任务");

  const now = nowOf(opts);
  const done = input.done === undefined ? !task.done : input.done === true || input.done === "true";

  if (!done) {
    if (task.done) {
      task.done = false;
      task.doneAt = null;
      task.updatedAt = now;
    }
    for (const child of childrenOf(state, task.id)) {
      if (child.done) {
        child.done = false;
        child.doneAt = null;
        child.updatedAt = now;
      }
    }
    writeState(state, opts);
    return { task, next: null, clones: [] };
  }

  // 重复完成任务且已处于完成态时，不重复生成下一次。
  if (task.done) {
    return { task, next: null, clones: [] };
  }

  task.done = true;
  task.doneAt = now;
  task.updatedAt = now;

  for (const child of childrenOf(state, task.id)) {
    if (!child.done) {
      child.done = true;
      child.doneAt = now;
      child.updatedAt = now;
    }
  }

  const { next, clones } = insertNextOccurrence(state, task, opts);
  writeState(state, opts);
  return { task, next, clones };
}

/**
 * 删除任务及其子任务，按删除顺序返回，供客户端撤销。
 *
 * @returns {object[]}
 */
export function deleteTask(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const state = readState(opts);
  const id = requireId(input.id);
  const task = findTask(state, id);
  if (!task) fail("not-found", "找不到这个任务");

  const removed = [cloneTask(task), ...childrenOf(state, id).map(cloneTask)];
  const removedIds = new Set([id, ...removed.map((item) => item.id)]);
  state.tasks = state.tasks.filter((item) => !removedIds.has(item.id));
  writeState(state, opts);
  return removed;
}

/**
 * 恢复被删除的任务（撤销）。传入的记录原样写回，父终缺失时提升为顶层。
 *
 * @returns {object[]}
 */
export function restoreTask(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const list = input.tasks;
  if (!Array.isArray(list) || list.length === 0) fail("invalid-body", "tasks 必须是非空数组");
  if (list.length > LIMITS.tasks) fail("tasks-limit", `任务最多 ${LIMITS.tasks} 个`);

  const state = readState(opts);
  const existing = new Set(state.tasks.map((task) => task.id));
  const batchIds = new Set();
  const projectIds = new Set(state.projects.map((project) => project.id));
  const incoming = [];

  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid-body", "任务格式不对");
    if (!isId(raw.id)) fail("invalid-id", "任务 id 不合法");
    if (existing.has(raw.id) || batchIds.has(raw.id)) fail("already-exists", "这个任务已经存在");
    const task = normalizeStoredTask(raw, projectIds);
    if (!task) fail("invalid-body", "任务记录不合法");
    batchIds.add(task.id);
    incoming.push(task);
  }

  if (state.tasks.length + incoming.length > LIMITS.tasks) fail("tasks-limit", `任务最多 ${LIMITS.tasks} 个`);

  const known = new Set([...existing, ...batchIds]);
  const used = new Map();
  const rows = incoming.map((task) => {
    const parentId = task.parentId && known.has(task.parentId) ? task.parentId : null;
    const key = parentId ?? "";
    if (!used.has(key)) {
      const base = nextOrder(state, parentId);
      used.set(key, { next: base, seen: new Set() });
    }
    const cursor = used.get(key);
    let order = Number.isFinite(task.order) ? task.order : cursor.next;
    while (cursor.seen.has(order)) order += 1;
    cursor.seen.add(order);
    cursor.next = Math.max(cursor.next, order + ORDER_STEP);
    return { ...task, parentId, order };
  });
  // 二次收敛：父任务本身不能是子任务。
  const topLevel = new Set(rows.filter((row) => row.parentId === null).map((row) => row.id));
  for (const row of rows) {
    if (row.parentId !== null && !topLevel.has(row.parentId)) row.parentId = null;
  }

  state.tasks.push(...rows);
  writeState(state, opts);
  return rows;
}

/**
 * 重排任务：把它移到 `beforeId` 之前；`beforeId` 省略或为 null 时移到末尾。
 *
 * @returns {object[]} 被重排的同级任务（新顺序）
 */
export function moveTask(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const state = readState(opts);
  const id = requireId(input.id);
  const task = findTask(state, id);
  if (!task) fail("not-found", "找不到这个任务");

  const siblings = siblingsOf(state, task);
  const beforeId = input.beforeId;

  if (beforeId !== undefined && beforeId !== null && beforeId !== "") {
    if (!isId(beforeId)) fail("invalid-id", "beforeId 不合法");
    if (beforeId === id) return siblings;
    const target = findTask(state, beforeId);
    if (!target) fail("not-found", "找不到 beforeId 对应的任务");
    if (target.parentId !== task.parentId) fail("invalid-parent", "beforeId 必须是同一级的任务");
    const next = siblings.filter((item) => item.id !== id);
    const index = next.findIndex((item) => item.id === beforeId);
    next.splice(index < 0 ? next.length : index, 0, task);
    siblings.length = 0;
    siblings.push(...next);
  } else {
    const next = siblings.filter((item) => item.id !== id);
    next.push(task);
    siblings.length = 0;
    siblings.push(...next);
  }

  siblings.forEach((item, index) => {
    item.order = ORDER_STEP * (index + 1);
    item.updatedAt = nowOf(opts);
  });
  writeState(state, opts);
  return siblings;
}

/* ------------------------------------------------------------------ */
/* 项目                                                                */
/* ------------------------------------------------------------------ */

/**
 * 新建项目。
 */
export function createProject(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const state = readState(opts);
  if (state.projects.length >= LIMITS.projects) fail("projects-limit", `项目最多 ${LIMITS.projects} 个`);
  const name = normalizeProjectName(input.name);
  if (state.projects.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
    fail("already-exists", "已经有同名项目");
  }
  const project = {
    id: randomUUID(),
    name,
    color: normalizeColor(input.color),
    order: state.projects.length
      ? Math.max(...state.projects.map((item) => item.order)) + 1
      : 0,
    createdAt: nowOf(opts),
  };
  state.projects.push(project);
  writeState(state, opts);
  return project;
}

/**
 * 修改项目名或配色。
 */
export function updateProject(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const state = readState(opts);
  const id = requireId(input.id);
  const project = findProject(state, id);
  if (!project) fail("not-found", "找不到这个项目");
  if (Object.hasOwn(input, "name")) {
    const name = normalizeProjectName(input.name);
    const clash = state.projects.some(
      (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) fail("already-exists", "已经有同名项目");
    project.name = name;
  }
  if (Object.hasOwn(input, "color")) project.color = normalizeColor(input.color, project.color);
  writeState(state, opts);
  return project;
}

/**
 * 删除项目。默认把项目里的任务移到收件箱；`mode: "tasks-delete"` 连带删除任务。
 *
 * @returns {{ deletedTasks: object[] }}
 */
export function deleteProject(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const state = readState(opts);
  const id = requireId(input.id);
  const project = findProject(state, id);
  if (!project) fail("not-found", "找不到这个项目");

  const mode = input.mode ?? "tasks-to-inbox";
  if (mode !== "tasks-to-inbox" && mode !== "tasks-delete") {
    fail("invalid-body", 'mode 只能是 "tasks-to-inbox" 或 "tasks-delete"');
  }

  const owned = state.tasks.filter((task) => task.projectId === id);
  let deletedTasks = [];
  if (mode === "tasks-delete") {
    const ids = new Set(owned.map((task) => task.id));
    deletedTasks = state.tasks
      .filter((task) => ids.has(task.id) || (task.parentId && ids.has(task.parentId)))
      .map(cloneTask);
    const removed = new Set(deletedTasks.map((task) => task.id));
    state.tasks = state.tasks.filter((task) => !removed.has(task.id));
  } else {
    for (const task of owned) task.projectId = null;
  }

  state.projects = state.projects.filter((item) => item.id !== id);
  writeState(state, opts);
  return { deletedTasks };
}

/* ------------------------------------------------------------------ */
/* 设置                                                                */
/* ------------------------------------------------------------------ */

/** 修改设置；只接受白名单字段，越界值报 invalid-settings。 */
export function updateSettings(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const state = readState(opts);
  const settings = { ...state.settings };
  let changed = false;

  for (const [key, [min, max]] of Object.entries(SETTINGS_RANGES)) {
    if (!Object.hasOwn(input, key)) continue;
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < min || n > max) {
      fail("invalid-settings", `${key} 必须是 ${min}–${max} 的整数`);
    }
    settings[key] = n;
    changed = true;
  }
  for (const key of SETTINGS_BOOLEANS) {
    if (!Object.hasOwn(input, key)) continue;
    if (typeof input[key] !== "boolean") fail("invalid-settings", `${key} 必须是布尔值`);
    settings[key] = input[key];
    changed = true;
  }

  if (changed) {
    state.settings = settings;
    writeState(state, opts);
  }
  return settings;
}

/* ------------------------------------------------------------------ */
/* 番茄会话                                                            */
/* ------------------------------------------------------------------ */

/**
 * 记录一次完成的专注。绑定任务存在时累计该任务的 pomodoros。
 *
 * @returns {{ session: object, task: object | null }}
 */
export function recordSession(input = {}, opts = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("invalid-body", "请求体格式不对");
  const state = readState(opts);
  const now = nowOf(opts);

  const startedAt = Number(input.startedAt);
  const endedAt = Number(input.endedAt);
  if (!isTimestamp(startedAt)) fail("invalid-session", "startedAt 必须是毫秒时间戳");
  if (!isTimestamp(endedAt)) fail("invalid-session", "endedAt 必须是毫秒时间戳");
  if (endedAt < startedAt) fail("invalid-session", "endedAt 不能早于 startedAt");
  if (endedAt > now + 3_600_000) fail("invalid-session", "endedAt 不能晚于当前时间");

  const minutes = Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
    fail("invalid-session", "minutes 必须是 1–180 的整数");
  }

  let taskId = input.taskId ?? null;
  if (taskId === "" || taskId === undefined) taskId = null;
  if (taskId !== null) {
    if (!isId(taskId)) fail("invalid-session", "taskId 不合法");
    if (!findTask(state, taskId)) taskId = null;
  }

  const session = {
    id: randomUUID(),
    taskId,
    kind: "focus",
    startedAt,
    endedAt,
    minutes,
  };
  state.sessions.push(session);
  state.sessions.sort((a, b) => a.startedAt - b.startedAt);
  if (state.sessions.length > LIMITS.sessions) {
    state.sessions = state.sessions.slice(-LIMITS.sessions);
  }

  const task = taskId ? findTask(state, taskId) : null;
  if (task) {
    task.pomodoros += 1;
    task.updatedAt = now;
  }

  writeState(state, opts);
  return { session, task };
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

function focusMinutesOf(state) {
  return state.sessions.reduce((total, session) => total + session.minutes, 0);
}

function sessionsByDay(state) {
  const map = new Map();
  for (const session of state.sessions) {
    const date = localDate(session.endedAt);
    const entry = map.get(date) ?? { date, count: 0, minutes: 0 };
    entry.count += 1;
    entry.minutes += session.minutes;
    map.set(date, entry);
  }
  return map;
}

/** 连续专注天数（含今天；今天没有则从昨天往前数）。 */
export function streakOf(state, today) {
  const days = sessionsByDay(state);
  const ms = 86_400_000;
  const base = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(base)) return 0;
  let cursor = base;
  if (!days.has(localDateFromUtc(cursor))) cursor -= ms;
  let streak = 0;
  while (streak < 3650 && days.has(localDateFromUtc(cursor))) {
    streak += 1;
    cursor -= ms;
  }
  return streak;
}

function localDateFromUtc(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * 概览统计，供 `GET /state` 与 `todo` 工具的 stats 使用。
 */
export function summary(opts = {}) {
  const state = readState(opts);
  const today = todayOf(opts);
  const open = state.tasks.filter((task) => !task.done);
  const done = state.tasks.filter((task) => task.done);
  const byDay = sessionsByDay(state);
  const todayFocus = byDay.get(today)?.count ?? 0;
  const todayMinutes = byDay.get(today)?.minutes ?? 0;

  const week = [];
  const ms = 86_400_000;
  const base = Date.parse(`${today}T00:00:00Z`);
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = localDateFromUtc(base - offset * ms);
    const entry = byDay.get(date) ?? { count: 0, minutes: 0 };
    week.push({ date, count: entry.count, minutes: entry.minutes });
  }

  return {
    today,
    tasks: {
      total: state.tasks.length,
      open: open.length,
      done: done.length,
      overdue: open.filter((task) => task.due && task.due.date < today).length,
      dueToday: open.filter((task) => task.due && task.due.date === today).length,
      upcoming: open.filter((task) => task.due && task.due.date > today).length,
      inbox: open.filter((task) => !task.due).length,
      completedToday: done.filter((task) => task.doneAt && localDate(task.doneAt) === today).length,
    },
    projects: state.projects.length,
    pomodoro: {
      todayFocus,
      todayMinutes,
      totalSessions: state.sessions.length,
      totalMinutes: focusMinutesOf(state),
      dailyGoal: state.settings.dailyGoal,
      streak: streakOf(state, today),
      week,
    },
  };
}

/**
 * 契约里的 `GET /state` 响应体（不含 ok）。
 */
export function stateSnapshot(opts = {}) {
  const state = readState(opts);
  const now = nowOf(opts);
  return {
    state: {
      version: state.version,
      tasks: state.tasks,
      projects: state.projects,
      sessions: state.sessions,
      settings: state.settings,
    },
    today: todayOf(opts),
    serverNow: now,
  };
}
