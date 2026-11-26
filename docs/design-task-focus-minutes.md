# 任务级专注时长（focusMinutes per task）设计

## 背景

番茄钟的专注时长目前只有一份全局设置（`settings.focusMinutes`，默认 25 分钟）。但不同任务需要的专注粒度差异很大：学习多邻国 + 背单词只需要 15 分钟，腹肌训练 4 组对应 20 分钟，而 LLM 学习适合 45 分钟。现状是：从任务行点「开始专注」，一律按全局时长开跑，短任务被迫中途放弃、或手动去番茄页改全局设置（还会影响其它任务）。

用户诉求：给某个 TODO 项设置自己的时长，从任务行的播放按钮开始，直接就是该时长的番茄（例：学习多邻国+背单词 → 15 分钟）。

## 目标行为

- 任务行点播放：若任务设置了专属时长，立即以该时长开始专注；未设置则沿用全局 `focusMinutes`（现状行为不变）。
- 详情抽屉提供唯一的设置入口：「专注时长」字段（默认 / 15′ / 25′ / 45′ + 自定义分钟数），走现有脏值保存队列。
- 设置了专属时长的任务，在任务行 meta 里以小 chip（如 `15′`）提示；播放按钮 tooltip 显示「开始专注 · 15 分钟」。
- 番茄页与顶栏计时器显示逻辑无需新增入口：任务绑定且带专属时长时，计时盘满值即为该时长。

## 非目标

- 不改全局番茄设置（`settings` 动作、计时盘快捷 25/45/60 行保持不变）。
- 不做每任务短休/长休差异：休息时长仍走全局。
- 不给番茄页新增任何控件或导航条目。

## 数据模型

- Task 增加可选字段 `focusMinutes: number | null`（1–180 整数）。`null` = 跟随全局默认。
- `createTask` / `updateTask` 接受该字段；`update` 传 `null` 或空字符串清除（回到跟随默认）；非法值（非整数、越界）报 `invalid-focus-minutes`（400）。
- `normalizeStoredTask` 读取时校验，磁盘上的非法值收敛为 `null`，老数据无需迁移。
- 会话记录（`recordSession`）沿用现有结构；本特性让绑定任务的会话 `minutes` 直接等于该次番茄的时长，与既定统计口径（`actualMinutes` 统计改进）天然兼容。

## 番茄引擎

- `pomodoroReducer` 的 `start` / `resume` 增加可选 `minutes` 覆盖：空闲启动时若带 `minutes`，`remainingMs = minutes × 60000`；运行中或无覆盖时行为与现状一致。
- 引擎新增 `startAt` 记录（本次番茄实际开始时刻），`completeSession` 按真实 `startAt` 与本次计划的分钟数写会话，替换「由结束时间反推默认专注分钟」的旧写法。未覆盖时长时计划分钟数 = 全局 `focusMinutes`，与现状等价。
- 绑定切换不打断进行中的计时（现状语义保持）；专属时长只在「以该任务启动」时生效。
- 多标签页 localStorage 竞态、暂停/跳过/放弃路径逻辑不变。

## HTTP / 工具契约

- `POST /todo/api/tasks/update` body 增加可选 `focusMinutes`（number 或 null/""）。
- `todo` 工具：`add` / `update` 增加可选参数 `focusMinutes`（integer 或 null，1–180，`null` 清除）；`list` 的 `formatTaskLine` 在任务带专属时长时追加 `· 专注 15 分钟`。
- `docs/contract.md` §1 Task 字段表、§2 路由表、§3 工具参数同步补齐。

## UI

- 详情抽屉在「优先级」之后新增「专注时长」字段：`默认` / `15′` / `25′` / `45′` 分段按钮 + 自定义数字输入（1–180）。`默认` 即清除（null）。保存复用现有 dirty-save 流程，无新提交路径。
- 任务行：meta 区在番茄数 chip 旁展示 `15′` chip（仅设置过时）；播放按钮 `title`/`aria-label` 用设置时长（`开始专注 · 15 分钟`），未设置保持 `开始专注`。
- 番茄页计时盘、顶栏计时器：绑定任务带专属时长且从任务入口启动时，满值即该时长（由引擎 `minutes` 覆盖自然实现，不需要额外 UI）。
- 不重复控件：全局「专注时长」仍只在番茄页快捷行；任务级时长只在详情抽屉，两处语义不同（全局默认 vs 单任务覆盖）。

## i18n

新增键（中英对照，`test/client-i18n.test.js` 校验一致性）：

- `detail.focusMinutes`：专注时长 / Focus length
- `detail.focusDefault`：默认 / Default
- `task.focusFor`：开始专注 · {n} 分钟 / Start focus · {n} min
- `tool.taskFocus`：专注 {n} 分钟 / {n} min focus（list 摘要行用）

## 测试

- `test/store.test.js`：`focusMinutes` 创建/更新/清除/非法值/磁盘收敛。
- `test/tool.test.js`：`add`/`update` 带 `focusMinutes`、非法值报错、`list` 摘要带时长标注。
- `test/pomodoro.test.js`：`start` 带 `minutes` 覆盖启动满值；会话记录分钟数与开始时间正确；无覆盖时与现状一致。
- `test/client-i18n.test.js`：新键中英一致。
- `test/route.test.js`：tasks/update 路由接受与校验 `focusMinutes`。

## 发版

- 版本 0.2.15 → 0.2.16（feature 级 minor bump）。统计准确性改进（另一分支）先合入发版则本特性顺延 0.2.17。
- README（中英）补充「任务级专注时长」说明与截图；`docs/contract.md` 同步。
