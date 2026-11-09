# dsh-todo 实施计划

设计见 [design.md](./design.md)。按阶段推进，每阶段可独立验证，完成后提交一次。

## 阶段 0 · 骨架

产出：

- `package.json`（`dsh.bundle.patch`、`dsh.client.platform=web`、exports、files）
- `cordis.patch.yml`（单行挂载 `dsh-todo`）
- `icon.svg`（原创：复选框 + 番茄，256×256 以内）
- `locale/zh.json`、`locale/en.json`（`meta.title` / `meta.description`）
- `LICENSE`、`.gitignore`

验收：`node -e` 解析 JSON 通过；`node --check` 检查所有 JS；package 名与 `window.__ModuleLoader__.load({id})` 一致。

## 阶段 1 · 宿主存储层 `lib/store.js`

- 数据模型、校验、原子写入、损坏留档、上限（5000 任务 / 5000 会话）。
- 纯函数：`readState` / `createTask` / `updateTask` / `toggleTask` / `deleteTask` / `restoreTask` / `moveTask` / 项目 CRUD / `updateSettings` / `recordSession` / `summary`。
- 自然语言解析不放在宿主：客户端解析后提交结构化字段。

验收：`test/store.test.js` 覆盖创建、非法输入、完成/撤销、删除恢复、排序、会话统计、损坏文件恢复。

## 阶段 2 · 宿主路由与工具 `lib/index.js`

- `createHandler()` 导出，便于不启动宿主的 HTTP 测试。
- 路由表见设计文档；错误码 → 状态码；`ctx.connection.requestRejection` 校验来源。
- `ctx.tools.register({...})` 注册 `todo` 工具（原生 JSON Schema，不用 `defineTool`，避免解析不到包）。
- `inject = ['webServer', 'connection', 'tools']`，`tools` 用 `ctx.get` 判断存在性。

验收：`test/route.test.js` 打全部路由；`test/tool.test.js` 直接调用工具 `execute`，与路由行为一致。

## 阶段 3 · 客户端页面 `lib/client.js`

- 注册 `sidebar.panellist`（id `dsh-todo`，order 22，label 走 locale）与 `main`（key `dsh-todo`）。
- React 组件：`TodoPage`（骨架 + 视图导航）、`TaskList`、`TaskRow`、`QuickAdd`、`TaskDetail`（抽屉）、`PomodoroBar`、`PomodoroView`、`Stats`。
- 状态：单 store（`useReducer`）+ 宿主 API 同步；乐观更新，失败回滚并提示。
- 逻辑分区：i18n 字典、日期解析、排序/分组、番茄钟状态机，均导出到 `__preview` 供测试。
- 样式：`styles.insert` 注入一次，全部用 `--dsw-alias-*` token，暗色自动适配；窄屏响应式。

验收：`test/parse.test.js`（自然语言）、`test/pomodoro.test.js`（状态机）、`test/client-i18n.test.js`（键一致、无硬编码）；`node --check lib/client.js`。

## 阶段 4 · 预览与截图

- `preview/index.html` + `preview/preview.js`：桩掉 `/todo/api/*`，本地 React UMD，可切换语言/主题/窄屏/填充数据。
- `scripts/screenshot.mjs`：headless Chrome + CDP，输出 `preview/screenshots/` 下中文亮、中文暗、英文亮、窄屏、番茄钟运行中五张。
- 预览页不进入 `files` 白名单以外的运行路径，不对宿主生效。

验收：截图脚本非 0 退出即失败；截图里无调试元素。

## 阶段 5 · 安装与真机验证

- `plugin_manager install_bundle` 安装本目录。
- 页面刷新后：侧边栏图标出现 → 打开面板 → 新建/完成/编辑/删除 → 番茄钟自测（1 分钟）→ 刷新数据仍在。
- 智能体调用 `todo` 工具，确认与 UI 同一份数据。
- 记录无法验证的部分。

## 阶段 6 · 文档与发布准备

- `README.md`（英文，默认）+ `README.zh-CN.md`（中文），顶部语言切换，含截图。
- `git init`、首次提交、创建 `polunzh/dsh-todo` 远程并推送（有 `gh` 且已登录时）。
- 如有变更涉及用户可见行为，README 与截图同步更新。

## 风险与对策

- **主面板高度/滚动**：宿主给的是整列容器，页面自己 `height:100%` + 内部滚动；用真机截图确认。
- **locale 服务形态**：按 task-notifier 的兜底方式（`ctx.locale?.register`，失败用本地表）。
- **通知权限**：只在用户点击「开始专注」时请求，不在加载时弹。
- **并发写**：路由层串行化写入（同进程内队列），工具与 UI 共用同一写入口。
