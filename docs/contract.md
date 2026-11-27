# dsh-todo 接口契约（实现以本文为准）

三个实现方各自只改自己的文件：

| 谁 | 写哪些文件 |
| --- | --- |
| host-dev | `lib/store.js`、`lib/recurrence.js`、`lib/index.js`、`test/store.test.js`、`test/recurrence.test.js`、`test/route.test.js`、`test/tool.test.js` |
| client-dev | `lib/client.js`、`test/parse.test.js`、`test/pomodoro.test.js`、`test/client-i18n.test.js` |
| preview-dev | `preview/`、`scripts/screenshot.mjs`、`test/preview.test.js` |
| Lead | `package.json`、`cordis.patch.yml`、`icon.svg`、`locale/*.json`、`README*.md`、`docs/`、`.gitignore`、`LICENSE`、git |

## 1. 数据模型（`state.json`）

```jsonc
{
  "version": 1,
  "tasks": [Task],
  "projects": [Project],
  "sessions": [PomodoroSession],
  "settings": Settings
}
```

```jsonc
Task = {
  "id": "uuid-v4",                    // /^[A-Za-z0-9_-]{6,64}$/
  "title": "写周报",                   // trim 后 1..500 字符
  "note": "",                          // 0..10000 字符
  "due": null | { "date": "2026-11-09", "time": null | "15:00" },  // 本地日期/时刻
  "priority": null | 0 | 1 | 2 | 3 | 4,   // 0 = P0 最紧急，4 = P4 最低，null = 无
  "projectId": null | "uuid",
  "labels": ["工作"],                  // 最多 10 个，每个 1..40 字符，去重
  "parentId": null | "uuid",           // 子任务只允许一层：父任务的 parentId 必须是 null
  "recurrence": null | { "freq": "daily"|"weekday"|"weekly"|"monthly"|"yearly", "interval": 1..30, "weekdays"?: [0..6], "monthMode"?: "date"|"lastDay"|"nthWeekday", "nth"?: 1|2|3|4|-1, "weekday"?: 0..6 },  // weekdays 仅 weekly；monthMode/nth/weekday 仅 monthly
  "done": false,
  "doneAt": null | epoch-ms,
  "createdAt": epoch-ms,
  "updatedAt": epoch-ms,
  "order": 1024,                       // 数字，同级任务升序
  "pomodoros": 0,
  "focusMinutes": null                 // null = 跟随 Settings.focusMinutes；否则 1..180 的任务级专注时长
}
```

```jsonc
Project = { "id": "uuid", "name": "工作", "color": "tomato", "order": 0, "createdAt": epoch-ms }
// color ∈ "tomato" | "amber" | "lime" | "sky" | "grape" | "slate"

PomodoroSession = {
  "id": "uuid",
  "taskId": null | "uuid",
  "kind": "focus",
  "startedAt": epoch-ms,
  "endedAt": epoch-ms,
  "minutes": 25,              // 设定时长（完整番茄 = 实际专注时长）
  "completed": true,          // false = 中断收尾（放弃 / 跳过）；老数据缺省视为 true
  "actualMinutes": 18         // 仅 completed=false：实际专注分钟（0..minutes）
}

Settings = {
  "focusMinutes": 25,        // 1..180
  "shortBreakMinutes": 5,    // 1..60
  "longBreakMinutes": 15,    // 1..120
  "longBreakEvery": 4,       // 2..12
  "autoStartNext": false,
  "sound": true,             // 任务完成与番茄结束提示音
  "tickSound": true,         // 专注倒计时每秒嘀嗒；默认开启，旧数据迁移为 true
  "dailyGoal": 8             // 1..40，每天番茄目标
}
```

上限：任务 5000、项目 100、会话 10000（超出丢最旧）。数据文件：`$DSH_HOME/storages/todo/state.json`，临时文件 + `renameSync` 原子写，权限 `0o600`；损坏文件改名为 `state.json.corrupt-<ts>` 后从空状态开始。

**递归完成语义**：完成一个带 `recurrence` 的任务时：

1. 旧任务标记 `done = true`、`doneAt = now`（保留在已完成视图）；
2. 新建一个 occurrence（新 id，`due.date` 按规则前进，`done = false`，`createdAt/updatedAt = now`，`order` = 旧任务 order + 1 并顺移后面的同级任务）；
3. 旧任务的子任务一并标记完成，occurrence 复制一份新的子任务（`done = false`）；
4. 返回 `{ task, next, clones }`，客户端撤销时删除 `next` 与 `clones` 并把旧任务恢复。

日期前进规则（`lib/recurrence.js`，纯函数 `advanceDate(date, recurrence, today)`，输入输出都是 `YYYY-MM-DD`）：

- `daily`：+ interval 天
- `weekday`：下一个工作日（跳过周六日），interval 固定视为 1
- `weekly`（无 `weekdays`）：+ 7 × interval 天（同一个星期几）
- `weekly`（有 `weekdays`）：base 所在周为第 0 周，活动周 = 周序号 % interval == 0，取 base 之后最早、星期几 ∈ weekdays 且落在活动周的日期
- `monthly` + `date`（默认）：+ interval 月，日超过目标月天数时取当月最后一天，以 base 为锚避免漂移
- `monthly` + `lastDay`：base 月 + interval 月后的当月最后一天
- `monthly` + `nthWeekday`：base 月 + interval 月后的「第 nth 个 weekday」，nth ∈ 1..4 或 -1（最后一个）
- `yearly`：+ interval 年，2-29 在平年取 2-28

**任务级专注时长**：`focusMinutes` 存在时，从该任务启动的专注以它为满值（`start` 动作的 `minutes` 覆盖），结束后会话按该分钟数落账；未设置时沿用 `Settings.focusMinutes`。区间外（0、181、非整数、布尔）报 `invalid-focus-minutes`；磁盘上的非法值读取时收敛为 `null`。重复任务完成时，下一次 occurrence 继承该值。
- 结果早于 `today` 时继续前进，最多 400 次；仍早于 today 则返回 today
- 任务没有 `due` 时，从 `today` 开始前进

## 2. HTTP 路由（宿主 `lib/index.js`）

前缀 `/todo/api`，同源 `fetch`，JSON body ≤ 64 KiB。统一响应：

```jsonc
{ "ok": true, ... }                          // 成功
{ "ok": false, "error": "code", "message": "人话" }  // 失败
```

| 方法与路径 | 请求体 | 成功响应 |
| --- | --- | --- |
| `GET /todo/api/health` | — | `{ ok, plugin, limits }` |
| `GET /todo/api/state` | — | `{ ok, state, today: "YYYY-MM-DD", serverNow }` |
| `POST /todo/api/tasks/create` | `{ title, note?, due?, priority?, projectId?, labels?, parentId?, recurrence? }` | `{ ok, task }` |
| `POST /todo/api/tasks/update` | `{ id, ...任意可改字段 }` | `{ ok, task }` |
| `POST /todo/api/tasks/toggle` | `{ id, done?: boolean }` | `{ ok, task, next?, clones? }` |
| `POST /todo/api/tasks/delete` | `{ id }` | `{ ok, tasks }`（含子任务，按删除顺序，供撤销） |
| `POST /todo/api/tasks/restore` | `{ tasks: Task[] }` | `{ ok, tasks }` |
| `POST /todo/api/tasks/move` | `{ id, beforeId?: string \| null }` | `{ ok, tasks }`（被重排的兄弟任务） |
| `POST /todo/api/projects/create` | `{ name, color? }` | `{ ok, project }` |
| `POST /todo/api/projects/update` | `{ id, name?, color? }` | `{ ok, project }` |
| `POST /todo/api/projects/delete` | `{ id, mode?: "tasks-to-inbox" \| "tasks-delete" }`，默认 inbox | `{ ok, deletedTasks }` |
| `POST /todo/api/settings` | `{ focusMinutes?, ... }` | `{ ok, settings }` |
| `POST /todo/api/sessions/record` | `{ taskId?, startedAt, endedAt, minutes, completed?, actualMinutes? }` | `{ ok, session, task? }` |

`due` 请求格式：`{ "date": "YYYY-MM-DD", "time": "HH:mm" | null }` 或 `null`。`toggle` 的 `done` 省略时取反。

错误码 → HTTP 状态：

- 400：`invalid-body`、`invalid-title`、`title-too-long`、`invalid-due`、`invalid-priority`、`invalid-labels`、`invalid-parent`、`invalid-recurrence`、`invalid-focus-minutes`、`invalid-id`、`invalid-project`、`invalid-settings`、`invalid-session`
- 404：`not-found`
- 405：`method-not-allowed`
- 409：`already-exists`、`tasks-limit`、`projects-limit`、`project-not-empty`（保留）
- 413：`body-too-large`
- 500：`internal`

来源校验：`ctx.connection.requestRejection(req) === undefined` 才放行。

## 3. 智能体工具 `todo`

`ctx.tools.register({ name: "todo", description, parameters, output: { schema, render }, execute })`，不 import `@deepseek-ai/dsh-tools`。`inject = ["webServer", "connection", "tools"]`；`tools` 用 `ctx.get("tools")` 判断，缺失时只跳过工具注册。

参数（原生 JSON Schema，`additionalProperties: false`）：

```jsonc
{
  "type": "object",
  "properties": {
    "action": { "type": "string", "enum": ["list", "add", "update", "complete", "delete", "stats", "project", "settings"] },
    "id": { "type": "string" },
    "title": { "type": "string" },
    "note": { "type": "string" },
    "due": { "type": "string", "description": "YYYY-MM-DD 或 YYYY-MM-DD HH:mm；空字符串表示清除" },
    "priority": { "type": ["integer", "null"], "minimum": 0, "maximum": 4, "description": "0 = P0 最紧急，1..4 = P1..P4；null 或省略表示无" },
    "project": { "type": "string", "description": "项目名称或 id" },
    "labels": { "type": "array", "items": { "type": "string" } },
    "recurrence": { "type": "string", "enum": ["none", "daily", "weekday", "weekly", "monthly", "yearly"] },
    "recurrenceInterval": { "type": "integer", "minimum": 1, "maximum": 30 },
    "recurrenceWeekdays": { "type": "array", "items": { "type": "integer", "minimum": 0, "maximum": 6 } },
    "recurrenceMonthMode": { "type": "string", "enum": ["date", "lastDay", "nthWeekday"] },
    "recurrenceNth": { "type": "integer" },
    "recurrenceWeekday": { "type": "integer", "minimum": 0, "maximum": 6 },
    "focusMinutes": { "type": ["integer", "null"], "minimum": 1, "maximum": 180, "description": "任务级专注时长；settings 动作下改全局默认" },
    "shortBreakMinutes": { "type": "integer", "minimum": 1, "maximum": 60 },
    "longBreakMinutes": { "type": "integer", "minimum": 1, "maximum": 120 },
    "longBreakEvery": { "type": "integer", "minimum": 2, "maximum": 12 },
    "dailyGoal": { "type": "integer", "minimum": 1, "maximum": 40 },
    "autoStartNext": { "type": "boolean" },
    "sound": { "type": "boolean" },
    "tickSound": { "type": "boolean" },
    "view": { "type": "string", "enum": ["today", "upcoming", "inbox", "completed", "all"] },
    "query": { "type": "string" },
    "limit": { "type": "integer" },
    "projectName": { "type": "string" },
    "projectColor": { "type": "string" }
  },
  "required": ["action"],
  "additionalProperties": false
}
```

`output.schema`：`{ "type": "object", "properties": { "summary": {"type":"string"}, "tasks": {"type":"array"} } }`；`render` 返回 `[{ type: "text", text: summary + 任务行 }]`。

行为：调用同一份 store 函数（与路由完全一致），返回文本摘要，例如 `今天 3 个任务（逾期 1）` 后跟每行 `- [ ] 写周报 · P1 · 今天 15:00 · #工作`。`action: "settings"` 改番茄设置（专注/短休/长休时长、长休间隔、自动开始、提示音、嘀嗒声、每日目标），走 `updateSettings` 校验。

`focusMinutes` 有两种语义：在 `add` / `update` 下写入任务级专注时长（`null` 或 `""` 清除覆盖，回到跟随全局）；在 `settings` 下改全局默认专注时长。任务带覆盖时，`list` / `add` / `update` 的摘要行追加 `⏱15 分钟`。

## 4. 客户端约定

- 模块 id / 包名：`dsh-todo`；`PANEL_ID = "dsh-todo"`。
- `window.__ModuleLoader__.load({ id: "dsh-todo", factory(require) {...} })`，只 `require("react")`。
- `inject = ["slots", "locale"]`；`ctx.slots.inject("sidebar.panellist", ...)`（id `dsh-todo`、order 22、`label: () => t("panel.title")`）、`ctx.slots.inject("main", ...)`（key `dsh-todo`）。
- 样式：`ensureStyles()` 向 `document.head` 插一个 `<style>`，`ctx.effect` 返回删除函数；背景/字色/边框只用 `--dsw-alias-*`，圆角/阴影用 `--dsw-radius-*` / `--dsw-shadow-*`，字色用 `--dsw-alias-label-*`。品牌强调色（Iris）集中在 CSS 末尾 `/* brand-palette:start */ … end */` 区块，是唯一允许字面色值的地方（见 `docs/design-v2.md`）。
- API 基址：`"todo/api/"`，用 `new URL(API, document.baseURI)`。
- i18n：`DICT = { zh: {...}, en: {...} }`，`ctx.locale?.register("dsh-todo", DICT)`；`ctx.locale?.getSnapshot()` 取当前语言；变化时 `ctx.locale?.subscribe` 触发重渲染；无 locale 服务时回退 `zh`。
- 番茄钟状态存 `localStorage["dsh-todo/pomodoro"]`：`{ mode: "focus"|"short"|"long", endsAt: number|null, remainingMs: number, running: boolean, taskId: string|null, cycle: number, focusMinutes: number|null }`。`focusMinutes` 是本轮的任务级时长覆盖（`start` 动作的 `minutes` 写入），切换到下一轮（`tick` / `skip` / `abandon` / `setMode`）时清空。
- 导出 `__preview = { TodoPage, parseQuickAdd, pomodoroReducer, DICT, PANEL_ID, API, localDate, formatDue }` 供测试与预览。
- `window.__previewMount` 不需要：预览页用桩 ctx 捕获 `ctx.slots.register` 的组件后自行渲染。

## 5. 客户端派生规则（UI 一致性）

- `today` 用宿主返回的 `today`（本地日期字符串），不要用浏览器时区另算。
- 视图：`today`（`due.date <= today` 且未完成，分「逾期 / 今天」两组）、`upcoming`（`due.date > today`，按日期分组）、`inbox`（`due == null`）、`completed`（`done`，按 `doneAt` 倒序，最多 200 条）、`project:<id>`、`calendar:<YYYY-MM>`、`pomodoro`。
- 排序：`priority` 升序（P0 在前，null 最后）→ `order` 升序。
- 子任务缩进显示在父任务下方；父任务显示 `完成 2/3`。
- 重复任务行显示循环图标，完成时出现提示「下一次：11 月 10 日」。

## 6. 测试要求

- 全部 `node --test "test/*.test.js"` 通过，无网络。
- store/route/tool 测试不启动真实 DSH：`createHandler({ isAllowed, dataDir })` 支持注入数据目录。
- client 测试用 src；不要渲染真实 DOM 之外的东西。
- `node --check` 每个 JS 文件。
