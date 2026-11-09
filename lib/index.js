/**
 * dsh-todo：宿主侧。
 *
 * 职责：
 *  1. 注册 `/todo/api/*` 同源路由，处理任务、项目、设置与番茄钟会话；
 *  2. 注册 `todo` 智能体工具（原生 JSON Schema，不依赖 `@deepseek-ai/*`）；
 *  3. 把存储层的错误码翻译成符合契约的 HTTP 状态。
 *
 * 导出 `createHandler({ logger, isAllowed, dataDir })`，测试时可直接注入虚拟
 * 请求与临时数据目录，完全不必启动真实宿主。
 */
import {
  LIMITS,
  StoreError,
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  moveTask,
  normalizeDue,
  readState,
  recordSession,
  restoreTask,
  stateSnapshot,
  summary,
  todayOf,
  toggleTask,
  updateProject,
  updateSettings,
  updateTask,
} from "./store.js";
import { addDays } from "./recurrence.js";

export const NS = "dsh-todo";
export const PREFIX = "/todo/api";
export const TOOL_NAME = "todo";
export const BODY_LIMIT = LIMITS.body;

const KNOWN_ROUTES = new Map([
  ["", ["GET"]],
  ["health", ["GET"]],
  ["state", ["GET"]],
  ["tasks/create", ["POST"]],
  ["tasks/update", ["POST"]],
  ["tasks/toggle", ["POST"]],
  ["tasks/delete", ["POST"]],
  ["tasks/restore", ["POST"]],
  ["tasks/move", ["POST"]],
  ["projects/create", ["POST"]],
  ["projects/update", ["POST"]],
  ["projects/delete", ["POST"]],
  ["settings", ["POST"]],
  ["sessions/record", ["POST"]],
]);

const STATUS_BY_CODE = {
  "invalid-body": 400,
  "invalid-title": 400,
  "title-too-long": 400,
  "invalid-due": 400,
  "invalid-priority": 400,
  "invalid-labels": 400,
  "invalid-parent": 400,
  "invalid-recurrence": 400,
  "invalid-id": 400,
  "invalid-project": 400,
  "invalid-settings": 400,
  "invalid-session": 400,
  "not-found": 404,
  "already-exists": 409,
  "tasks-limit": 409,
  "projects-limit": 409,
  "project-not-empty": 409,
  "body-too-large": 413,
  internal: 500,
};

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new StoreError("body-too-large", "请求体太大");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new StoreError("invalid-body", "请求体不是合法 JSON");
  }
}

function routeOf(url) {
  const pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === PREFIX) return "";
  if (!pathname.startsWith(`${PREFIX}/`)) return null;
  return pathname.slice(PREFIX.length + 1);
}

/**
 * 路由处理函数。
 *
 * @param {{
 *   dataDir?: string,
 *   isAllowed?: (req: any) => boolean,
 *   logger?: { warn?: (...args: any[]) => void, info?: (...args: any[]) => void }
 * }} [options]
 */
export function createHandler(options = {}) {
  const isAllowed = options.isAllowed ?? (() => true);
  const logger = options.logger ?? console;
  const storeOpts = { dataDir: options.dataDir, logger };

  return async function handler(req, res) {
    if (!isAllowed(req)) {
      json(res, 403, { ok: false, error: "forbidden", message: "只接受本机 DSH 页面的请求" });
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const route = routeOf(url);

    if (route === null) {
      json(res, 404, { ok: false, error: "not-found", message: "没有这条待办接口" });
      return;
    }

    const allowedMethods = KNOWN_ROUTES.get(route);
    if (!allowedMethods) {
      json(res, 404, { ok: false, error: "not-found", message: "没有这条待办接口" });
      return;
    }

    if (!allowedMethods.includes(req.method)) {
      res.setHeader("Allow", allowedMethods.join(", "));
      json(res, 405, { ok: false, error: "method-not-allowed", message: "这个接口不支持该请求方法" });
      return;
    }

    try {
      if ((route === "" || route === "health") && req.method === "GET") {
        json(res, 200, {
          ok: true,
          plugin: NS,
          limits: {
            tasks: LIMITS.tasks,
            projects: LIMITS.projects,
            sessions: LIMITS.sessions,
            body: LIMITS.body,
          },
        });
        return;
      }

      if (route === "state" && req.method === "GET") {
        const snap = stateSnapshot(storeOpts);
        json(res, 200, { ok: true, ...snap });
        return;
      }

      if (route === "tasks/create" && req.method === "POST") {
        const body = await readJson(req);
        const task = createTask(body, storeOpts);
        json(res, 200, { ok: true, task });
        return;
      }

      if (route === "tasks/update" && req.method === "POST") {
        const body = await readJson(req);
        const task = updateTask(body, storeOpts);
        json(res, 200, { ok: true, task });
        return;
      }

      if (route === "tasks/toggle" && req.method === "POST") {
        const body = await readJson(req);
        const { task, next, clones } = toggleTask(body, storeOpts);
        const response = { ok: true, task };
        if (next) response.next = next;
        if (clones && clones.length > 0) response.clones = clones;
        json(res, 200, response);
        return;
      }

      if (route === "tasks/delete" && req.method === "POST") {
        const body = await readJson(req);
        const tasks = deleteTask(body, storeOpts);
        json(res, 200, { ok: true, tasks });
        return;
      }

      if (route === "tasks/restore" && req.method === "POST") {
        const body = await readJson(req);
        const tasks = restoreTask(body, storeOpts);
        json(res, 200, { ok: true, tasks });
        return;
      }

      if (route === "tasks/move" && req.method === "POST") {
        const body = await readJson(req);
        const tasks = moveTask(body, storeOpts);
        json(res, 200, { ok: true, tasks });
        return;
      }

      if (route === "projects/create" && req.method === "POST") {
        const body = await readJson(req);
        const project = createProject(body, storeOpts);
        json(res, 200, { ok: true, project });
        return;
      }

      if (route === "projects/update" && req.method === "POST") {
        const body = await readJson(req);
        const project = updateProject(body, storeOpts);
        json(res, 200, { ok: true, project });
        return;
      }

      if (route === "projects/delete" && req.method === "POST") {
        const body = await readJson(req);
        const { deletedTasks } = deleteProject(body, storeOpts);
        json(res, 200, { ok: true, deletedTasks });
        return;
      }

      if (route === "settings" && req.method === "POST") {
        const body = await readJson(req);
        const settings = updateSettings(body, storeOpts);
        json(res, 200, { ok: true, settings });
        return;
      }

      if (route === "sessions/record" && req.method === "POST") {
        const body = await readJson(req);
        const { session, task } = recordSession(body, storeOpts);
        const response = { ok: true, session };
        if (task) response.task = task;
        json(res, 200, response);
        return;
      }

      json(res, 404, { ok: false, error: "not-found", message: "没有这条待办接口" });
    } catch (error) {
      if (error instanceof StoreError) {
        const status = STATUS_BY_CODE[error.code] ?? 400;
        json(res, status, { ok: false, error: error.code, message: error.message });
        return;
      }
      logger.warn?.(`${NS}: ${error instanceof Error ? error.stack : String(error)}`);
      json(res, 500, {
        ok: false,
        error: "internal",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

/* ------------------------------------------------------------------ */
/* 智能体工具 todo                                                     */
/* ------------------------------------------------------------------ */

const FREQ_LABELS = {
  daily: "每天",
  weekday: "工作日",
  weekly: "每周",
  monthly: "每月",
};

function formatTaskLine(task, projectMap, today) {
  const mark = task.done ? "[x]" : "[ ]";
  const parts = [`- ${mark} ${task.title}`];
  if (task.priority != null) parts.push(`P${task.priority}`);
  if (task.due) {
    let dueLabel = task.due.date;
    if (task.due.date === today) dueLabel = "今天";
    else if (task.due.date === addDays(today, 1)) dueLabel = "明天";
    if (task.due.time) dueLabel += ` ${task.due.time}`;
    parts.push(dueLabel);
  }
  const shownLabels = new Set();
  if (task.projectId && projectMap.has(task.projectId)) {
    const projectName = projectMap.get(task.projectId);
    shownLabels.add(projectName);
    parts.push(`#${projectName}`);
  }
  for (const label of task.labels ?? []) {
    if (!shownLabels.has(label)) parts.push(`#${label}`);
  }
  if (task.recurrence) {
    parts.push(`🔁${FREQ_LABELS[task.recurrence.freq] ?? task.recurrence.freq}`);
  }
  if (task.pomodoros > 0) {
    parts.push(`🍅${task.pomodoros}`);
  }
  return parts.join(" · ");
}

function parseDueArgument(dueStr) {
  if (dueStr === undefined) return undefined;
  if (dueStr === null || dueStr === "") return null;
  const trimmed = String(dueStr).trim();
  if (!trimmed) return null;
  const [datePart, timePart] = trimmed.split(/\s+/);
  return normalizeDue({ date: datePart, time: timePart ?? null });
}

function resolveProjectArg(state, projectArg) {
  if (!projectArg) return null;
  const needle = String(projectArg).trim().toLowerCase();
  const found = state.projects.find(
    (project) => project.id === projectArg || project.name.toLowerCase() === needle,
  );
  if (!found) throw new StoreError("invalid-project", `找不到项目: ${projectArg}`);
  return found.id;
}

/**
 * 执行 todo 工具动作。
 *
 * @param {object} args
 * @param {object} [opts]
 */
export async function executeTodoAction(args = {}, opts = {}) {
  const action = args.action;
  if (!action) throw new StoreError("invalid-body", "action 必填");

  if (action === "stats") {
    const stats = summary(opts);
    const text = [
      `📊 待办与专注统计（${stats.today}）：`,
      `· 任务：共 ${stats.tasks.total}，未完成 ${stats.tasks.open}（逾期 ${stats.tasks.overdue}，今天到期 ${stats.tasks.dueToday}，收件箱 ${stats.tasks.inbox}），今日已完成 ${stats.tasks.completedToday}`,
      `· 番茄：今日 ${stats.pomodoro.todayFocus} 个（${stats.pomodoro.todayMinutes} 分钟，目标 ${stats.pomodoro.dailyGoal}），累计 ${stats.pomodoro.totalSessions} 个（${stats.pomodoro.totalMinutes} 分钟），连续专注 ${stats.pomodoro.streak} 天`,
    ].join("\n");
    return { ok: true, action, summary: text, stats };
  }

  if (action === "list") {
    const state = readState(opts);
    const today = todayOf(opts);
    const projectMap = new Map(state.projects.map((item) => [item.id, item.name]));
    const view = args.view ?? "today";
    const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
    const projectId = args.project ? resolveProjectArg(state, args.project) : null;

    let tasks = state.tasks.slice();

    if (view === "today") {
      tasks = tasks.filter((task) => !task.done && task.due && task.due.date <= today);
    } else if (view === "upcoming") {
      tasks = tasks.filter((task) => !task.done && task.due && task.due.date > today);
    } else if (view === "inbox") {
      tasks = tasks.filter((task) => !task.done && !task.due);
    } else if (view === "completed") {
      tasks = tasks.filter((task) => task.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    } else if (view === "all") {
      // 保留所有未完成 + 完成
    }

    if (projectId) {
      tasks = tasks.filter((task) => task.projectId === projectId);
    }

    if (query) {
      tasks = tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.note.toLowerCase().includes(query) ||
          task.labels.some((lbl) => lbl.toLowerCase().includes(query)),
      );
    }

    // 默认排序：优先级 P1->P4 (null 最后) -> order 升序
    tasks.sort((a, b) => {
      const pa = a.priority ?? 99;
      const pb = b.priority ?? 99;
      return pa - pb || a.order - b.order;
    });

    const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 50;
    const sliced = tasks.slice(0, limit);

    const overdueCount = sliced.filter(
      (task) => !task.done && task.due && task.due.date < today,
    ).length;
    const summaryHead =
      view === "today"
        ? `今天 ${sliced.length} 个任务${overdueCount > 0 ? `（逾期 ${overdueCount}）` : ""}`
        : `${view} 视图下找到 ${sliced.length} 个任务`;

    const lines = [summaryHead, ...sliced.map((task) => formatTaskLine(task, projectMap, today))];
    const summaryText = lines.join("\n");
    return { ok: true, action, summary: summaryText, tasks: sliced, count: sliced.length };
  }

  if (action === "add") {
    const state = readState(opts);
    const projectId = args.project ? resolveProjectArg(state, args.project) : undefined;
    const due = parseDueArgument(args.due);
    const input = {
      title: args.title,
      note: args.note,
      due,
      priority: args.priority,
      projectId,
      labels: args.labels,
      recurrence: args.recurrence && args.recurrence !== "none" ? { freq: args.recurrence, interval: 1 } : null,
    };
    const task = createTask(input, opts);
    const today = todayOf(opts);
    const projectMap = new Map(readState(opts).projects.map((item) => [item.id, item.name]));
    const line = formatTaskLine(task, projectMap, today);
    return {
      ok: true,
      action,
      task,
      summary: `已添加任务: ${task.title}（id: ${task.id}）\n${line}`,
      tasks: [task],
    };
  }

  if (action === "update") {
    if (!args.id) throw new StoreError("invalid-id", "id 必填");
    const state = readState(opts);
    const patch = { id: args.id };
    if (args.title !== undefined) patch.title = args.title;
    if (args.note !== undefined) patch.note = args.note;
    if (args.due !== undefined) patch.due = parseDueArgument(args.due);
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.project !== undefined) {
      patch.projectId = args.project === "" || args.project === null ? null : resolveProjectArg(state, args.project);
    }
    if (args.labels !== undefined) patch.labels = args.labels;
    if (args.recurrence !== undefined) {
      patch.recurrence =
        args.recurrence === "none" || args.recurrence === "" || args.recurrence === null
          ? null
          : { freq: args.recurrence, interval: 1 };
    }
    const task = updateTask(patch, opts);
    const today = todayOf(opts);
    const projectMap = new Map(readState(opts).projects.map((item) => [item.id, item.name]));
    return {
      ok: true,
      action,
      task,
      summary: `已更新任务: ${task.title}\n${formatTaskLine(task, projectMap, today)}`,
      tasks: [task],
    };
  }

  if (action === "complete") {
    if (!args.id) throw new StoreError("invalid-id", "id 必填");
    const { task, next } = toggleTask({ id: args.id, done: true }, opts);
    let summaryText = `已完成任务: ${task.title}`;
    if (next) summaryText += `（下一次重复: ${next.due?.date}）`;
    return { ok: true, action, task, next, summary: summaryText, tasks: [task] };
  }

  if (action === "delete") {
    if (!args.id) throw new StoreError("invalid-id", "id 必填");
    const removed = deleteTask({ id: args.id }, opts);
    return {
      ok: true,
      action,
      deletedCount: removed.length,
      summary: `已删除任务及子任务共 ${removed.length} 条`,
      tasks: removed,
    };
  }

  if (action === "project") {
    const name = args.projectName ?? args.title;
    if (!name) throw new StoreError("invalid-project", "projectName 必填");
    const project = createProject({ name, color: args.projectColor }, opts);
    return {
      ok: true,
      action,
      project,
      summary: `已创建项目: ${project.name}（id: ${project.id}）`,
      tasks: [],
    };
  }

  throw new StoreError("invalid-body", `不支持的 action: ${action}`);
}

/** 构造原生工具定义对象（docs/contract.md §3）。 */
export function buildTodoTool(opts = {}) {
  return {
    name: TOOL_NAME,
    description:
      "待办清单与番茄钟助手：管理待办任务、项目和番茄统计。可查看今日/收件箱/即将到来的任务、添加、更新、完成、删除任务及创建项目。",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list", "add", "update", "complete", "delete", "stats", "project"],
        },
        id: { type: "string" },
        title: { type: "string" },
        note: { type: "string" },
        due: { type: "string", description: "YYYY-MM-DD 或 YYYY-MM-DD HH:mm；空字符串表示清除" },
        priority: {
          type: ["integer", "null"],
          minimum: 0,
          maximum: 4,
          description: "0 = P0 最紧急，1..4 = P1..P4；null 或省略表示无优先级",
        },
        project: { type: "string", description: "项目名称或 id" },
        labels: { type: "array", items: { type: "string" } },
        recurrence: { type: "string", enum: ["none", "daily", "weekday", "weekly", "monthly"] },
        view: { type: "string", enum: ["today", "upcoming", "inbox", "completed", "all"] },
        query: { type: "string" },
        limit: { type: "integer" },
        projectName: { type: "string" },
        projectColor: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          tasks: { type: "array" },
        },
      },
      render: (_args, value) => {
        const text = value && typeof value.summary === "string" ? value.summary : "待办操作已完成";
        return [{ type: "text", text }];
      },
    },
    async execute(args) {
      try {
        return await executeTodoAction(args, opts);
      } catch (error) {
        if (error instanceof StoreError) {
          return { ok: false, error: error.code, summary: `操作失败: ${error.message}` };
        }
        return {
          ok: false,
          error: "internal",
          summary: `执行出错: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* 宿主挂载                                                            */
/* ------------------------------------------------------------------ */

export const inject = ["webServer", "connection", "tools"];

export function apply(ctx) {
  const logger = ctx.logger ?? console;

  const handler = createHandler({
    logger,
    isAllowed: (req) => {
      try {
        return ctx.connection?.requestRejection?.(req) === undefined;
      } catch {
        return false;
      }
    },
  });

  ctx.effect(
    () => ctx.webServer.register({ kind: "prefix", path: PREFIX, handler }),
    `${NS}: ${PREFIX} routes`,
  );

  const tools = typeof ctx.get === "function" ? ctx.get("tools") : undefined;
  if (tools && typeof tools.register === "function") {
    const tool = buildTodoTool({ logger });
    ctx.effect(() => tools.register(tool), `${NS}: ${TOOL_NAME} tool`);
  } else {
    logger?.info?.(`${NS}: 没有 tools 服务，跳过 ${TOOL_NAME} 注册`);
  }
}
