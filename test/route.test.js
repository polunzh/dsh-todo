import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { after, before, beforeEach, test } from "node:test";

import { BODY_LIMIT, PREFIX, createHandler, inject } from "../lib/index.js";

let dataDir;
let handler;

before(() => {
  dataDir = mkdtempSync(join(tmpdir(), "dsh-todo-route-test-"));
});

after(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
  handler = createHandler({ dataDir, logger: { warn() {} } });
});

function request(method, path, body) {
  let chunks;
  if (body === undefined) {
    chunks = [];
  } else if (typeof body === "string" || Buffer.isBuffer(body)) {
    chunks = [Buffer.from(body)];
  } else {
    chunks = [Buffer.from(JSON.stringify(body))];
  }
  const req = Readable.from(chunks);
  req.method = method;
  req.url = path;
  return req;
}

function response() {
  const state = { status: 0, headers: {}, body: "" };
  return {
    state,
    writeHead(status, headers = {}) {
      state.status = status;
      state.headers = { ...state.headers, ...headers };
    },
    setHeader(name, value) {
      state.headers[name] = value;
    },
    end(chunk = "") {
      state.body = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    },
  };
}

async function call(method, path, body) {
  const res = response();
  await handler(request(method, path, body), res);
  return {
    status: res.state.status,
    headers: res.state.headers,
    body: res.state.body ? JSON.parse(res.state.body) : undefined,
  };
}

test("inject declares the host services the plugin needs", () => {
  assert.deepEqual(inject, ["webServer", "connection", "tools"]);
});

test("GET /todo/api/health advertises plugin and limits", async () => {
  const res = await call("GET", `${PREFIX}/health`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.plugin, "dsh-todo");
  assert.equal(res.body.limits.tasks, 5000);
  assert.equal(res.body.limits.projects, 100);
  assert.equal(res.body.limits.sessions, 10000);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("GET /todo/api/state returns the whole snapshot", async () => {
  const res = await call("GET", `${PREFIX}/state`);
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.deepEqual(res.body.state.tasks, []);
  assert.match(res.body.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(res.body.serverNow > 0);
});

test("task lifecycle travels over the routes", async () => {
  const created = await call("POST", `${PREFIX}/tasks/create`, {
    title: "写周报",
    priority: 1,
    due: { date: "2026-11-09", time: "15:00" },
    labels: ["工作"],
  });
  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  const task = created.body.task;
  assert.equal(task.title, "写周报");
  assert.equal(task.priority, 1);

  const updated = await call("POST", `${PREFIX}/tasks/update`, {
    id: task.id,
    title: "写本周周报",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.task.title, "写本周周报");

  const toggled = await call("POST", `${PREFIX}/tasks/toggle`, { id: task.id });
  assert.equal(toggled.status, 200);
  assert.equal(toggled.body.task.done, true);
  assert.equal(toggled.body.next, undefined); // 非重复任务不带 next

  const deleted = await call("POST", `${PREFIX}/tasks/delete`, { id: task.id });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.tasks.length, 1);

  const restored = await call("POST", `${PREFIX}/tasks/restore`, { tasks: deleted.body.tasks });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.tasks.length, 1);

  const state = await call("GET", `${PREFIX}/state`);
  assert.equal(state.body.state.tasks.length, 1);
});

test("toggle on a recurring task returns next and clones", async () => {
  const parent = await call("POST", `${PREFIX}/tasks/create`, {
    title: "每日站会",
    due: { date: "2026-01-01", time: "09:30" },
    recurrence: { freq: "daily", interval: 1 },
  });
  assert.equal(parent.status, 200);
  const parentId = parent.body.task.id;

  const child = await call("POST", `${PREFIX}/tasks/create`, {
    title: "准备议程",
    parentId,
  });
  assert.equal(child.status, 200);

  const toggled = await call("POST", `${PREFIX}/tasks/toggle`, { id: parentId, done: true });
  assert.equal(toggled.status, 200);
  assert.ok(toggled.body.next);
  assert.equal(toggled.body.next.title, "每日站会");
  assert.equal(toggled.body.next.due.time, "09:30");
  assert.equal(toggled.body.clones.length, 1);
  assert.equal(toggled.body.clones[0].parentId, toggled.body.next.id);
  assert.equal(toggled.body.clones[0].done, false);
});

test("tasks/move reorders siblings and returns the affected tasks", async () => {
  const a = (await call("POST", `${PREFIX}/tasks/create`, { title: "A" })).body.task;
  const b = (await call("POST", `${PREFIX}/tasks/create`, { title: "B" })).body.task;

  const moved = await call("POST", `${PREFIX}/tasks/move`, { id: b.id, beforeId: a.id });
  assert.equal(moved.status, 200);
  assert.deepEqual(
    moved.body.tasks.map((task) => task.id),
    [b.id, a.id],
  );

  const toEnd = await call("POST", `${PREFIX}/tasks/move`, { id: b.id });
  assert.deepEqual(
    toEnd.body.tasks.map((task) => task.id),
    [a.id, b.id],
  );
});

test("project routes create, update and delete with both modes", async () => {
  const created = await call("POST", `${PREFIX}/projects/create`, { name: "工作", color: "sky" });
  assert.equal(created.status, 200);
  assert.equal(created.body.project.name, "工作");
  const projectId = created.body.project.id;

  const updated = await call("POST", `${PREFIX}/projects/update`, {
    id: projectId,
    name: "工作台",
    color: "grape",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.project.name, "工作台");
  assert.equal(updated.body.project.color, "grape");

  const task = (await call("POST", `${PREFIX}/tasks/create`, {
    title: "带项目的任务",
    projectId,
  })).body.task;

  const inbox = await call("POST", `${PREFIX}/projects/delete`, { id: projectId });
  assert.equal(inbox.status, 200);
  assert.deepEqual(inbox.body.deletedTasks, []);
  const state = await call("GET", `${PREFIX}/state`);
  assert.equal(state.body.state.tasks.find((item) => item.id === task.id).projectId, null);

  const second = (await call("POST", `${PREFIX}/projects/create`, { name: "学习" })).body.project;
  await call("POST", `${PREFIX}/tasks/create`, { title: "读论文", projectId: second.id });
  const cascade = await call("POST", `${PREFIX}/projects/delete`, {
    id: second.id,
    mode: "tasks-delete",
  });
  assert.equal(cascade.status, 200);
  assert.equal(cascade.body.deletedTasks.length, 1);
});

test("settings and sessions routes respond with stored values", async () => {
  const settings = await call("POST", `${PREFIX}/settings`, { focusMinutes: 30, sound: false });
  assert.equal(settings.status, 200);
  assert.equal(settings.body.settings.focusMinutes, 30);
  assert.equal(settings.body.settings.sound, false);

  const task = (await call("POST", `${PREFIX}/tasks/create`, { title: "专注" })).body.task;
  const now = Date.now();
  const session = await call("POST", `${PREFIX}/sessions/record`, {
    taskId: task.id,
    startedAt: now - 25 * 60 * 1000,
    endedAt: now,
    minutes: 25,
  });
  assert.equal(session.status, 200);
  assert.equal(session.body.session.minutes, 25);
  assert.equal(session.body.task.pomodoros, 1);
});

test("error mapping: 400 for invalid input", async () => {
  const emptyTitle = await call("POST", `${PREFIX}/tasks/create`, { title: "   " });
  assert.equal(emptyTitle.status, 400);
  assert.equal(emptyTitle.body.error, "invalid-title");

  const badJson = await call("POST", `${PREFIX}/tasks/create`, "{ not json");
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error, "invalid-body");

  const badDue = await call("POST", `${PREFIX}/tasks/create`, { title: "x", due: "2026-02-30" });
  assert.equal(badDue.status, 400);
  assert.equal(badDue.body.error, "invalid-due");

  const badPriority = await call("POST", `${PREFIX}/tasks/create`, { title: "x", priority: 9 });
  assert.equal(badPriority.status, 400);
  assert.equal(badPriority.body.error, "invalid-priority");

  const badParent = await call("POST", `${PREFIX}/tasks/create`, {
    title: "x",
    parentId: "does-not-exist",
  });
  assert.equal(badParent.status, 400);
  assert.equal(badParent.body.error, "invalid-parent");

  const badSettings = await call("POST", `${PREFIX}/settings`, { focusMinutes: 999 });
  assert.equal(badSettings.status, 400);
  assert.equal(badSettings.body.error, "invalid-settings");

  const badSession = await call("POST", `${PREFIX}/sessions/record`, {
    startedAt: "yesterday",
    endedAt: Date.now(),
    minutes: 25,
  });
  assert.equal(badSession.status, 400);
  assert.equal(badSession.body.error, "invalid-session");
});

test("error mapping: 404 for unknown task and unknown route", async () => {
  const task = await call("POST", `${PREFIX}/tasks/toggle`, { id: "missing-task" });
  assert.equal(task.status, 404);
  assert.equal(task.body.error, "not-found");

  const route = await call("GET", `${PREFIX}/nope`);
  assert.equal(route.status, 404);
  assert.equal(route.body.error, "not-found");
});

test("error mapping: 405 with Allow header for wrong method", async () => {
  const onGet = await call("POST", `${PREFIX}/state`);
  assert.equal(onGet.status, 405);
  assert.equal(onGet.body.error, "method-not-allowed");
  assert.equal(onGet.headers.Allow, "GET");

  const onPost = await call("GET", `${PREFIX}/tasks/create`);
  assert.equal(onPost.status, 405);
  assert.equal(onPost.headers.Allow, "POST");
});

test("error mapping: 409 for duplicate project name", async () => {
  await call("POST", `${PREFIX}/projects/create`, { name: "重复" });
  const duplicate = await call("POST", `${PREFIX}/projects/create`, { name: "重复" });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, "already-exists");
});

test("error mapping: 413 for bodies over the 64 KiB limit", async () => {
  const huge = JSON.stringify({ title: "x", note: "a".repeat(BODY_LIMIT) });
  const res = await call("POST", `${PREFIX}/tasks/create`, huge);
  assert.equal(res.status, 413);
  assert.equal(res.body.error, "body-too-large");
});

test("forbidden requests are rejected with 403", async () => {
  const guarded = createHandler({
    dataDir,
    isAllowed: () => false,
    logger: { warn() {} },
  });
  const res = response();
  await guarded(request("GET", `${PREFIX}/state`), res);
  assert.equal(res.state.status, 403);
  assert.equal(JSON.parse(res.state.body).error, "forbidden");
});
