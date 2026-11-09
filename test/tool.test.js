import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

import { TOOL_NAME, apply, buildTodoTool, executeTodoAction, inject } from "../lib/index.js";
import { readState } from "../lib/store.js";

const TODAY = "2026-11-09";
const NOW = Date.parse("2026-11-09T10:00:00+08:00");

let dataDir;
let tool;
let opts;

before(() => {
  dataDir = mkdtempSync(join(tmpdir(), "dsh-todo-tool-test-"));
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  opts = { dataDir, today: TODAY, now: NOW, logger: { warn() {} } };
  tool = buildTodoTool(opts);
});

test("the tool definition matches the contract", () => {
  assert.equal(tool.name, TOOL_NAME);
  assert.equal(tool.name, "todo");
  assert.equal(typeof tool.description, "string");
  assert.ok(tool.description.length > 10);

  assert.equal(tool.parameters.type, "object");
  assert.equal(tool.parameters.additionalProperties, false);
  assert.deepEqual(tool.parameters.required, ["action"]);
  assert.deepEqual(tool.parameters.properties.action.enum, [
    "list",
    "add",
    "update",
    "complete",
    "delete",
    "stats",
    "project",
  ]);
  assert.deepEqual(tool.parameters.properties.view.enum, [
    "today",
    "upcoming",
    "inbox",
    "completed",
    "all",
  ]);
  assert.deepEqual(tool.parameters.properties.recurrence.enum, [
    "none",
    "daily",
    "weekday",
    "weekly",
    "monthly",
  ]);
  assert.deepEqual(tool.parameters.properties.priority.type, ["integer", "null"]);
  assert.equal(tool.parameters.properties.labels.type, "array");
  assert.equal(tool.parameters.properties.labels.items.type, "string");

  assert.equal(tool.output.schema.type, "object");
  assert.equal(tool.output.schema.properties.summary.type, "string");
  assert.equal(tool.output.schema.properties.tasks.type, "array");
});

test("render returns one text block built from the summary", () => {
  const blocks = tool.output.render({ action: "stats" }, { summary: "今天 3 个任务" });
  assert.deepEqual(blocks, [{ type: "text", text: "今天 3 个任务" }]);

  const fallback = tool.output.render({}, {});
  assert.equal(fallback[0].type, "text");
  assert.ok(fallback[0].text.length > 0);
});

test("action=add creates a task and reports it", async () => {
  const result = await tool.execute({
    action: "add",
    title: "写周报",
    due: "2026-11-09 15:00",
    priority: 1,
    labels: ["工作"],
    recurrence: "weekly",
    note: "周五前",
  });

  assert.equal(result.ok, true);
  assert.equal(result.task.title, "写周报");
  assert.deepEqual(result.task.due, { date: TODAY, time: "15:00" });
  assert.equal(result.task.priority, 1);
  assert.deepEqual(result.task.labels, ["工作"]);
  assert.equal(result.task.recurrence.freq, "weekly");
  assert.match(result.summary, /写周报/);
  assert.match(result.summary, /P1/);
  assert.match(result.summary, /15:00/);
  assert.match(result.summary, /#工作/);

  const state = readState(opts);
  assert.equal(state.tasks.length, 1);
});

test("action=add resolves project by name and inherits it", async () => {
  await executeTodoAction({ action: "project", projectName: "工作", projectColor: "sky" }, opts);
  const project = readState(opts).projects[0];

  const result = await tool.execute({ action: "add", title: "项目任务", project: "工作" });
  assert.equal(result.ok, true);
  assert.equal(result.task.projectId, project.id);
  assert.match(result.summary, /工作/);
});

test("action=list returns the right view and ordering", async () => {
  await executeTodoAction(
    { action: "add", title: "逾期任务", due: "2026-11-01", priority: 3 },
    opts,
  );
  await executeTodoAction(
    { action: "add", title: "今天任务", due: "2026-11-09", priority: 1 },
    opts,
  );
  await executeTodoAction(
    { action: "add", title: "将来任务", due: "2026-11-20" },
    opts,
  );
  await executeTodoAction({ action: "add", title: "收件箱任务" }, opts);

  const today = await tool.execute({ action: "list", view: "today" });
  assert.equal(today.ok, true);
  assert.deepEqual(today.tasks.map((task) => task.title), ["今天任务", "逾期任务"]);
  assert.match(today.summary, /今天 2 个任务/);
  assert.match(today.summary, /逾期 1/);

  const upcoming = await tool.execute({ action: "list", view: "upcoming" });
  assert.deepEqual(upcoming.tasks.map((task) => task.title), ["将来任务"]);

  const inbox = await tool.execute({ action: "list", view: "inbox" });
  assert.deepEqual(inbox.tasks.map((task) => task.title), ["收件箱任务"]);

  const all = await tool.execute({ action: "list", view: "all" });
  assert.equal(all.tasks.length, 4);

  const completed = await tool.execute({ action: "list", view: "completed" });
  assert.equal(completed.tasks.length, 0);
});

test("action=list filters by query and project", async () => {
  await executeTodoAction({ action: "project", projectName: "工作" }, opts);
  await executeTodoAction(
    { action: "add", title: "写周报", project: "工作", note: "周五前交给老板" },
    opts,
  );
  await executeTodoAction({ action: "add", title: "买牛奶" }, opts);

  const byQuery = await tool.execute({ action: "list", view: "all", query: "老板" });
  assert.deepEqual(byQuery.tasks.map((task) => task.title), ["写周报"]);

  const byProject = await tool.execute({ action: "list", view: "all", project: "工作" });
  assert.deepEqual(byProject.tasks.map((task) => task.title), ["写周报"]);

  const limited = await tool.execute({ action: "list", view: "all", limit: 1 });
  assert.equal(limited.tasks.length, 1);
});

test("action=list view=completed shows done tasks", async () => {
  const added = await executeTodoAction({ action: "add", title: "已完成" }, opts);
  await executeTodoAction({ action: "complete", id: added.task.id }, opts);

  const completed = await tool.execute({ action: "list", view: "completed" });
  assert.equal(completed.tasks.length, 1);
  assert.equal(completed.tasks[0].done, true);
  assert.match(completed.summary, /\[x\]/);
});

test("action=add accepts P0 as the top priority", async () => {
  const result = await executeTodoAction(
    { action: "add", title: "线上故障", priority: 0 },
    opts,
  );
  assert.equal(result.task.priority, 0);
  assert.match(result.summary, /P0/);

  const listed = await executeTodoAction({ action: "list", view: "all" }, opts);
  assert.match(listed.summary, /\[ \] 线上故障 · P0/);
});

test("action=update changes fields and clears due/priority", async () => {
  const added = await executeTodoAction(
    { action: "add", title: "旧标题", due: "2026-11-20", priority: 2 },
    opts,
  );

  const updated = await tool.execute({
    action: "update",
    id: added.task.id,
    title: "新标题",
    due: "",
    priority: null,
    note: "补充说明",
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.task.title, "新标题");
  assert.equal(updated.task.due, null);
  assert.equal(updated.task.priority, null);
  assert.equal(updated.task.note, "补充说明");
});

test("action=complete finishes a task and reports the next occurrence", async () => {
  const added = await executeTodoAction(
    { action: "add", title: "每日站会", due: TODAY, recurrence: "daily" },
    opts,
  );
  const done = await tool.execute({ action: "complete", id: added.task.id });
  assert.equal(done.ok, true);
  assert.equal(done.task.done, true);
  assert.ok(done.next);
  assert.equal(done.next.due.date, "2026-11-10");
  assert.match(done.summary, /下一次重复/);
});

test("action=delete removes the task", async () => {
  const added = await executeTodoAction({ action: "add", title: "要删除" }, opts);
  const deleted = await tool.execute({ action: "delete", id: added.task.id });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.deletedCount, 1);
  assert.match(deleted.summary, /已删除/);
  assert.equal(readState(opts).tasks.length, 0);
});

test("action=stats reports task and pomodoro numbers", async () => {
  const added = await executeTodoAction({ action: "add", title: "专注任务", due: TODAY }, opts);
  await executeTodoAction({ action: "complete", id: added.task.id }, opts);
  await executeTodoAction({ action: "add", title: "逾期任务", due: "2026-11-01" }, opts);

  const stats = await tool.execute({ action: "stats" });
  assert.equal(stats.ok, true);
  assert.equal(stats.stats.tasks.total, 2);
  assert.equal(stats.stats.tasks.done, 1);
  assert.equal(stats.stats.tasks.overdue, 1);
  assert.equal(stats.stats.pomodoro.todayFocus, 0);
  assert.match(stats.summary, /待办与专注统计/);
});

test("action=project creates a project", async () => {
  const created = await tool.execute({ action: "project", projectName: "学习", projectColor: "lime" });
  assert.equal(created.ok, true);
  assert.equal(created.project.name, "学习");
  assert.equal(created.project.color, "lime");
  assert.match(created.summary, /学习/);
});

test("tool errors are reported as ok:false without throwing", async () => {
  const unknown = await tool.execute({ action: "archive" });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, "invalid-body");

  const missingId = await tool.execute({ action: "complete" });
  assert.equal(missingId.ok, false);
  assert.equal(missingId.error, "invalid-id");

  const missingTitle = await tool.execute({ action: "add" });
  assert.equal(missingTitle.ok, false);
  assert.equal(missingTitle.error, "invalid-title");

  const unknownProject = await tool.execute({
    action: "add",
    title: "x",
    project: "不存在的项目",
  });
  assert.equal(unknownProject.ok, false);
  assert.equal(unknownProject.error, "invalid-project");

  const missingTask = await tool.execute({ action: "update", id: "does-not-exist", title: "x" });
  assert.equal(missingTask.ok, false);
  assert.equal(missingTask.error, "not-found");
});

test("apply registers the route prefix and the tool when tools service exists", () => {
  const registered = { routes: [], tools: [], effects: 0 };
  const ctx = {
    logger: { info() {}, warn() {} },
    connection: { requestRejection: () => undefined },
    webServer: {
      register(spec) {
        registered.routes.push(spec);
        return () => {};
      },
    },
    get(name) {
      if (name !== "tools") return undefined;
      return {
        register(definition) {
          registered.tools.push(definition);
          return () => {};
        },
      };
    },
    effect(fn) {
      registered.effects += 1;
      return fn();
    },
  };

  apply(ctx);
  assert.equal(registered.routes.length, 1);
  assert.equal(registered.routes[0].kind, "prefix");
  assert.equal(registered.routes[0].path, "/todo/api");
  assert.equal(typeof registered.routes[0].handler, "function");
  assert.equal(registered.tools.length, 1);
  assert.equal(registered.tools[0].name, "todo");
  assert.equal(registered.effects, 2);
});

test("apply skips tool registration when tools service is missing", () => {
  const registered = { routes: [], tools: 0 };
  const ctx = {
    logger: { info() {}, warn() {} },
    connection: { requestRejection: () => undefined },
    webServer: {
      register(spec) {
        registered.routes.push(spec);
        return () => {};
      },
    },
    get: () => undefined,
    effect(fn) {
      return fn();
    },
  };

  apply(ctx);
  assert.equal(registered.routes.length, 1);
  assert.equal(registered.tools, 0);
});

test("inject still declares the three host services", () => {
  assert.deepEqual(inject, ["webServer", "connection", "tools"]);
});
