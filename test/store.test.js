import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import {
  DEFAULT_SETTINGS,
  LIMITS,
  StoreError,
  createProject,
  createTask,
  dataFile,
  deleteProject,
  deleteTask,
  moveTask,
  readState,
  recordSession,
  restoreTask,
  summary,
  toggleTask,
  updateProject,
  updateSettings,
  updateTask,
  writeState,
} from "../lib/store.js";

let testDir;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "dsh-todo-store-test-"));
});

afterEach(() => {
  if (testDir && existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test("readState returns default empty state when file does not exist", () => {
  const state = readState({ dataDir: testDir });
  assert.equal(state.version, 2);
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.projects, []);
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.settings, DEFAULT_SETTINGS);
});

test("createTask and updateTask CRUD lifecycle", () => {
  const task = createTask(
    {
      title: "  写周报  ",
      note: "周五前完成",
      due: { date: "2026-11-09", time: "15:00" },
      priority: 1,
      labels: ["工作", "#工作", "周报"],
      recurrence: { freq: "weekly", interval: 1 },
    },
    { dataDir: testDir },
  );

  assert.equal(task.title, "写周报");
  assert.equal(task.note, "周五前完成");
  assert.deepEqual(task.due, { date: "2026-11-09", time: "15:00" });
  assert.equal(task.priority, 1);
  assert.deepEqual(task.labels, ["工作", "周报"]); // 去重且去掉 #
  assert.equal(task.done, false);
  assert.equal(task.parentId, null);
  assert.equal(task.pomodoros, 0);

  // 更新任务
  const updated = updateTask(
    {
      id: task.id,
      title: "写本周周报",
      priority: 2,
      due: null,
      recurrence: null,
    },
    { dataDir: testDir },
  );

  assert.equal(updated.title, "写本周周报");
  assert.equal(updated.priority, 2);
  assert.equal(updated.due, null);
  assert.equal(updated.recurrence, null);
  assert.equal(updated.note, "周五前完成"); // 未传字段保留

  const reloaded = readState({ dataDir: testDir });
  assert.equal(reloaded.tasks.length, 1);
  assert.equal(reloaded.tasks[0].title, "写本周周报");
});

test("createTask validation errors", () => {
  assert.throws(
    () => createTask({ title: "" }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-title",
  );
  assert.throws(
    () => createTask({ title: "a".repeat(501) }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "title-too-long",
  );
  assert.throws(
    () => createTask({ title: "ok", due: "bad-date" }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-due",
  );
  assert.throws(
    () => createTask({ title: "ok", priority: 5 }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-priority",
  );
  assert.throws(
    () => createTask({ title: "ok", recurrence: "yearly" }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-recurrence",
  );
});

test("subtask constraints: only one level allowed", () => {
  const parent = createTask({ title: "父任务" }, { dataDir: testDir });
  const child = createTask({ title: "子任务", parentId: parent.id }, { dataDir: testDir });
  assert.equal(child.parentId, parent.id);

  // 尝试以子任务为父（第二层）必须失败
  assert.throws(
    () => createTask({ title: "孙任务", parentId: child.id }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-parent",
  );

  // 自身不能做自己的父任务
  assert.throws(
    () => updateTask({ id: parent.id, parentId: parent.id }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-parent",
  );

  // 已有子任务的父任务不能变成别人的子任务
  const another = createTask({ title: "另一个父任务" }, { dataDir: testDir });
  assert.throws(
    () => updateTask({ id: parent.id, parentId: another.id }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-parent",
  );
});

test("subtask cascade: completion, reset, delete, and restore", () => {
  const parent = createTask({ title: "父任务" }, { dataDir: testDir });
  const child1 = createTask({ title: "子 1", parentId: parent.id }, { dataDir: testDir });
  const child2 = createTask({ title: "子 2", parentId: parent.id }, { dataDir: testDir });

  // 完成父任务：连带完成所有子任务
  const { task: completedParent } = toggleTask({ id: parent.id, done: true }, { dataDir: testDir });
  assert.equal(completedParent.done, true);
  const state1 = readState({ dataDir: testDir });
  assert.ok(state1.tasks.find((t) => t.id === child1.id).done);
  assert.ok(state1.tasks.find((t) => t.id === child2.id).done);

  // 撤销父任务完成：子任务也撤销
  toggleTask({ id: parent.id, done: false }, { dataDir: testDir });
  const state2 = readState({ dataDir: testDir });
  assert.equal(state2.tasks.find((t) => t.id === parent.id).done, false);
  assert.equal(state2.tasks.find((t) => t.id === child1.id).done, false);

  // 删除父任务：连带删除子任务，并按顺序返回用于撤销
  const deleted = deleteTask({ id: parent.id }, { dataDir: testDir });
  assert.equal(deleted.length, 3);
  assert.equal(deleted[0].id, parent.id);
  assert.equal(readState({ dataDir: testDir }).tasks.length, 0);

  // 恢复任务
  const restored = restoreTask({ tasks: deleted }, { dataDir: testDir });
  assert.equal(restored.length, 3);
  const state3 = readState({ dataDir: testDir });
  assert.equal(state3.tasks.length, 3);
  const restoredChild = state3.tasks.find((t) => t.id === child1.id);
  assert.equal(restoredChild.parentId, parent.id);
});

test("moveTask reorders sibling tasks accurately", () => {
  const t1 = createTask({ title: "任务 1" }, { dataDir: testDir });
  const t2 = createTask({ title: "任务 2" }, { dataDir: testDir });
  const t3 = createTask({ title: "任务 3" }, { dataDir: testDir });

  // 把 t3 移到 t1 前面
  const reordered = moveTask({ id: t3.id, beforeId: t1.id }, { dataDir: testDir });
  assert.deepEqual(
    reordered.map((t) => t.id),
    [t3.id, t1.id, t2.id],
  );
  assert.ok(reordered[0].order < reordered[1].order);
  assert.ok(reordered[1].order < reordered[2].order);

  // 把 t3 移到末尾 (beforeId = null)
  const movedToEnd = moveTask({ id: t3.id, beforeId: null }, { dataDir: testDir });
  assert.deepEqual(
    movedToEnd.map((t) => t.id),
    [t1.id, t2.id, t3.id],
  );
});

test("recurring task completion spawns next occurrence and clones subtasks", () => {
  const opts = { dataDir: testDir, today: "2026-11-09", now: 1_700_000_000_000 };
  const parent = createTask(
    {
      title: "每日例会",
      due: { date: "2026-11-09", time: "09:30" },
      recurrence: { freq: "daily", interval: 1 },
    },
    opts,
  );
  const child = createTask({ title: "准备投屏", parentId: parent.id }, opts);
  const nextSibling = createTask({ title: "后续任务" }, opts);

  const initialSiblingOrder = nextSibling.order;

  // 完成递归父任务
  const { task, next, clones } = toggleTask({ id: parent.id, done: true }, opts);
  assert.equal(task.done, true);
  assert.ok(task.doneAt);
  assert.ok(next);
  assert.equal(next.title, "每日例会");
  assert.equal(next.due.date, "2026-11-10");
  assert.equal(next.due.time, "09:30");
  assert.equal(next.done, false);
  assert.equal(next.order, task.order + 1);

  // 后面的兄弟任务 order 被顺移
  const state = readState(opts);
  const reloadedSibling = state.tasks.find((t) => t.id === nextSibling.id);
  assert.equal(reloadedSibling.order, initialSiblingOrder + 1);

  // 子任务被复制到 next
  assert.equal(clones.length, 1);
  assert.equal(clones[0].title, "准备投屏");
  assert.equal(clones[0].parentId, next.id);
  assert.equal(clones[0].done, false);
});

test("projects CRUD and deletion modes", () => {
  const p1 = createProject({ name: "工作", color: "tomato" }, { dataDir: testDir });
  assert.equal(p1.name, "工作");
  assert.equal(p1.color, "tomato");

  // 重名冲突抛 409
  assert.throws(
    () => createProject({ name: "工作" }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "already-exists",
  );

  updateProject({ id: p1.id, name: "工作事宜", color: "sky" }, { dataDir: testDir });
  assert.equal(readState({ dataDir: testDir }).projects[0].name, "工作事宜");
  assert.equal(readState({ dataDir: testDir }).projects[0].color, "sky");

  // 关联任务测试
  const task = createTask({ title: "项目任务", projectId: p1.id }, { dataDir: testDir });
  assert.equal(task.projectId, p1.id);

  // 删除项目模式 1：tasks-to-inbox（默认）
  deleteProject({ id: p1.id, mode: "tasks-to-inbox" }, { dataDir: testDir });
  const stateAfterInbox = readState({ dataDir: testDir });
  assert.equal(stateAfterInbox.projects.length, 0);
  assert.equal(stateAfterInbox.tasks.find((t) => t.id === task.id).projectId, null);

  // 删除项目模式 2：tasks-delete
  const p2 = createProject({ name: "学习" }, { dataDir: testDir });
  const task2 = createTask({ title: "读论文", projectId: p2.id }, { dataDir: testDir });
  const { deletedTasks } = deleteProject({ id: p2.id, mode: "tasks-delete" }, { dataDir: testDir });
  assert.equal(deletedTasks.length, 1);
  assert.equal(deletedTasks[0].id, task2.id);
  assert.equal(readState({ dataDir: testDir }).tasks.length, 1); // 仅剩之前移到 inbox 的 task
});

test("updateSettings validates boundaries", () => {
  const updated = updateSettings(
    {
      focusMinutes: 30,
      dailyGoal: 10,
      autoStartNext: true,
    },
    { dataDir: testDir },
  );
  assert.equal(updated.focusMinutes, 30);
  assert.equal(updated.dailyGoal, 10);
  assert.equal(updated.autoStartNext, true);

  // 越界值报 invalid-settings
  assert.throws(
    () => updateSettings({ focusMinutes: 0 }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-settings",
  );
  assert.throws(
    () => updateSettings({ dailyGoal: 50 }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "invalid-settings",
  );
});

test("recordSession validates, increments task pomodoros, and feeds summary", () => {
  const task = createTask({ title: "专注写代码" }, { dataDir: testDir });
  const now = Date.parse("2026-11-09T10:00:00Z");
  const opts = { dataDir: testDir, today: "2026-11-09", now };

  const { session, task: updatedTask } = recordSession(
    {
      taskId: task.id,
      startedAt: now - 25 * 60 * 1000,
      endedAt: now,
      minutes: 25,
    },
    opts,
  );

  assert.equal(session.taskId, task.id);
  assert.equal(session.minutes, 25);
  assert.equal(updatedTask.pomodoros, 1);

  const stats = summary(opts);
  assert.equal(stats.pomodoro.todayFocus, 1);
  assert.equal(stats.pomodoro.todayMinutes, 25);
  assert.equal(stats.pomodoro.streak, 1);
  assert.equal(stats.tasks.total, 1);
});

test("corrupt state file is quarantined and recovered to empty state", () => {
  const file = dataFile({ dataDir: testDir });
  writeState({ version: 1, tasks: [] }, { dataDir: testDir });
  assert.ok(existsSync(file));

  // 写入非法 JSON 损坏文件
  writeFileSync(file, "{ this is not json }", "utf8");

  const warnings = [];
  const fakeLogger = { warn: (msg) => warnings.push(msg) };
  const recovered = readState({ dataDir: testDir, logger: fakeLogger });

  assert.equal(recovered.version, 2);
  assert.deepEqual(recovered.tasks, []);
  assert.ok(warnings.length > 0);

  // 原文件已被重命名为 .corrupt-*
  const files = readdirSync(testDir);
  const corruptFile = files.find((f) => f.includes("corrupt-"));
  assert.ok(corruptFile, "corrupt archive file should exist");
});

test("limits enforcement: tasks and projects", () => {
  const state = readState({ dataDir: testDir });
  // 模拟填充到上限
  state.projects = Array.from({ length: LIMITS.projects }, (_, i) => ({
    id: `project-${String(i).padStart(6, "0")}`,
    name: `项目 ${i}`,
    color: "tomato",
    order: i,
    createdAt: Date.now(),
  }));
  writeState(state, { dataDir: testDir });

  assert.throws(
    () => createProject({ name: "超限项目" }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "projects-limit",
  );
});

test("state file is written atomically with 0o600 and dir 0o700", () => {
  createTask({ title: "权限测试" }, { dataDir: testDir });
  const file = dataFile({ dataDir: testDir });
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(testDir).mode & 0o777, 0o700);
  // 临时文件不残留
  assert.deepEqual(
    readdirSync(testDir).filter((name) => name.endsWith(".tmp")),
    [],
  );
});

test("dataDir defaults to $DSH_HOME/storages/todo and honours overrides", () => {
  const home = mkdtempSync(join(tmpdir(), "dsh-todo-home-test-"));
  const previous = process.env.DSH_HOME;
  try {
    process.env.DSH_HOME = home;
    assert.equal(dataFile(), join(home, "storages", "todo", "state.json"));
    assert.equal(dataFile({ dataDir: "/tmp/override" }), join("/tmp/override", "state.json"));
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});

test("session list is trimmed to the newest 10000 records", () => {
  const state = readState({ dataDir: testDir });
  const base = 1_700_000_000_000;
  state.sessions = Array.from({ length: LIMITS.sessions }, (_, i) => ({
    id: `sess-${String(i).padStart(8, "0")}`,
    taskId: null,
    kind: "focus",
    startedAt: base + i * 1000,
    endedAt: base + i * 1000 + 1500,
    minutes: 25,
  }));
  writeState(state, { dataDir: testDir });

  recordSession(
    { startedAt: base + 100_000_000, endedAt: base + 100_000_000 + 1500, minutes: 25 },
    { dataDir: testDir, now: base + 100_000_000 + 2000 },
  );

  const reloaded = readState({ dataDir: testDir });
  assert.equal(reloaded.sessions.length, LIMITS.sessions);
  // 最旧的一条被丢弃，最新的一条保留
  assert.equal(reloaded.sessions[0].id, "sess-00000001");
  assert.equal(reloaded.sessions.at(-1).minutes, 25);
});

test("task limit rejects creation beyond 5000", () => {
  const state = readState({ dataDir: testDir });
  state.tasks = Array.from({ length: LIMITS.tasks }, (_, i) => ({
    id: `task-${String(i).padStart(6, "0")}`,
    title: `任务 ${i}`,
    note: "",
    due: null,
    priority: null,
    projectId: null,
    labels: [],
    parentId: null,
    recurrence: null,
    done: false,
    doneAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    order: i * 1024,
    pomodoros: 0,
  }));
  writeState(state, { dataDir: testDir });

  assert.throws(
    () => createTask({ title: "超额任务" }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "tasks-limit",
  );
});

test("restoreTask rejects duplicates and orphans without a parent", () => {
  const parent = createTask({ title: "父任务" }, { dataDir: testDir });
  const child = createTask({ title: "子任务", parentId: parent.id }, { dataDir: testDir });

  assert.throws(
    () => restoreTask({ tasks: [parent] }, { dataDir: testDir }),
    (err) => err instanceof StoreError && err.code === "already-exists",
  );

  deleteTask({ id: parent.id }, { dataDir: testDir });

  // 只恢复子任务：父任务缺失时提升为顶层
  const restored = restoreTask({ tasks: [child] }, { dataDir: testDir });
  assert.equal(restored.length, 1);
  assert.equal(restored[0].parentId, null);
});

test("summary counts views and computes a multi-day streak", () => {
  const day = 86_400_000;
  const base = Date.parse("2026-11-09T12:00:00Z");
  const state = readState({ dataDir: testDir });
  state.tasks = [
    { title: "逾期", due: { date: "2026-11-01", time: null } },
    { title: "今天", due: { date: "2026-11-09", time: null } },
    { title: "将来", due: { date: "2026-11-20", time: null } },
    { title: "收件箱", due: null },
  ].map((item, index) => ({
    id: `task-${String(index).padStart(6, "0")}`,
    title: item.title,
    note: "",
    due: item.due,
    priority: null,
    projectId: null,
    labels: [],
    parentId: null,
    recurrence: null,
    done: false,
    doneAt: null,
    createdAt: base,
    updatedAt: base,
    order: index * 1024,
    pomodoros: 0,
  }));
  state.sessions = [0, 1, 2].map((offset) => ({
    id: `sess-${String(offset).padStart(6, "0")}`,
    taskId: null,
    kind: "focus",
    startedAt: base - offset * day - 60_000,
    endedAt: base - offset * day,
    minutes: 25,
  }));
  writeState(state, { dataDir: testDir });

  const opts = { dataDir: testDir, today: "2026-11-09", now: base };
  const stats = summary(opts);
  assert.equal(stats.tasks.total, 4);
  assert.equal(stats.tasks.overdue, 1);
  assert.equal(stats.tasks.dueToday, 1);
  assert.equal(stats.tasks.upcoming, 1);
  assert.equal(stats.tasks.inbox, 1);
  assert.equal(stats.pomodoro.streak, 3);
  assert.equal(stats.pomodoro.todayFocus, 1);
  assert.equal(stats.pomodoro.week.length, 7);
  assert.equal(stats.pomodoro.week.at(-1).date, "2026-11-09");
});

test("提示音默认关闭，且 v1 旧文件迁移为关闭", () => {
  // 新文件：默认不响
  const fresh = readState({ dataDir: testDir });
  assert.equal(fresh.settings.sound, false);
  assert.equal(DEFAULT_SETTINGS.sound, false);

  // 旧 v1 文件（当年默认 true）读出来必须关掉
  mkdirSync(testDir, { recursive: true });
  writeFileSync(
    dataFile({ dataDir: testDir }),
    JSON.stringify({
      version: 1,
      tasks: [],
      projects: [],
      sessions: [],
      settings: { ...DEFAULT_SETTINGS, sound: true, dailyGoal: 12 },
    }),
    { mode: 0o600 },
  );
  const migrated = readState({ dataDir: testDir });
  assert.equal(migrated.settings.sound, false, "v1 迁移后应关闭提示音");
  assert.equal(migrated.settings.dailyGoal, 12, "其他设置不受迁移影响");
  assert.equal(migrated.version, 2);
});

test("用户在面板里打开提示音后保持开启", () => {
  updateSettings({ sound: true }, { dataDir: testDir });
  const state = readState({ dataDir: testDir });
  assert.equal(state.settings.sound, true, "version 2 文件不应再被迁移覆盖");
});
