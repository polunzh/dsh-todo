# 番茄钟统计改进 设计

## 背景

统计的失真来自会话记录层，展示层则只有近 7 天一个窗口。翻完代码确认四类问题：

1. **休息也被记成专注会话**：`completeSession` 对任何到点状态都调 `recordSession`，且 `minutes` 固定取 `modeMinutes("focus")`（[lib/client.js:1486](../lib/client.js)）。短休/长休走完会记一条 25 分钟 focus 会话，绑定任务的番茄数 +1。开自动连播时今日番茄数约虚高一倍。**这是最大失真源。**
2. **暂停被抹平**：会话 `minutes` 永远等于设定时长，`startedAt` 由结束时刻反推。专注 15 分钟（中间暂停过）也记 25 分钟，"今日专注分钟"系统性偏高。
3. **跳过/放弃的已专注时长直接丢弃**：专注到第 18 分钟点放弃，这 18 分钟从统计里消失。
4. **口径标注错位**：侧栏卡片写"本周专注"，数据是近 7 天滚动窗口。

另外会话上限 10000 条一直累积，但 UI 只展示 7 天，历史数据"存而不可见"。

## 已确认的范围与口径（用户拍板）

- 修数据准确性 + 扩统计维度 + 重做番茄页内统计区，**不新增导航入口**。
- 中断（放弃/跳过）的专注：**已专注 ≥5 分钟则按实际专注分钟计入专注时长**；番茄**个数**只数完整结束的（中断不计个数）。
- 统计区仍在番茄视图右侧，加 7 天 / 30 天 / 全部时间范围切换。
- 更好地查看记录：会话记录列表支持翻看更长历史。

## 设计

### 1. 会话数据模型（`PomodoroSession`）

新增两个可选字段，老数据缺省按现状解释：

```jsonc
PomodoroSession = {
  "id": "uuid",
  "taskId": null | "uuid",
  "kind": "focus",               // 保留枚举，只记专注
  "startedAt": epoch-ms,         // 真实开始时刻（含暂停前的起点）
  "endedAt": epoch-ms,
  "minutes": 25,
  "completed": true,             // 新增：完整走完 true；中断收尾 false
  "actualMinutes": 18            // 新增（可选）：中断时的实际专注分钟，四舍五入
}
```

- `store.js` `recordSession` 接受 `completed`（默认 `true`）与 `actualMinutes`（中断时必填）；校验 `actualMinutes` 为 0–180 整数、`actualMinutes ≤ minutes`。
- 所有时长统计（今日专注、周/月分钟、分布）一律用 `actualMinutes ?? minutes`。
- 所有个数统计（今日番茄、目标、streak、柱状图）只数 `completed !== false` 的会话。
- **`task.pomodoros` 只在 `completed !== false` 时 +1**，中断不增加。
- 10000 条上限与"超出丢最旧"的既有行为不变。

### 2. 会话收尾（`lib/client.js`）

- `pomodoroEngine` 增加累计专注毫秒的记账：`start` 时记 `focusStartedAt`；`pause` 时把 `now - focusStartedAt` 累进 `focusElapsedMs`；`resume` 重置 `focusStartedAt`。放弃/跳过/中断时用累计值。
- `completeSession(finishedState, finishedAt)`：
  - 只在 `mode === "focus"` 时调 `recordSession`（休息到点不再记录会话）。
  - `startedAt` 用真实起点；`minutes` 仍为设定时长；`completed: true`。
- 新增 `abandonFocus(state, now)`：专注模式且 `focusElapsedMs ≥ 5 分钟` 时记一条 `completed: false, actualMinutes: round(elapsed/60000)` 的会话；小于 5 分钟静默丢弃。
- 「放弃」与「跳过」在专注模式下都走 `abandonFocus`；休息模式下两者维持现状（纯状态切换）。
- localStorage 崩溃恢复路径（多标签页判重）沿用同一函数，行为一致。

### 3. 统计区重做（番茄视图右侧）

布局（单列、沿用 `bg-layer-1` 卡片、radius-md、11–20px 字号体系）：

1. **范围切换与单日下钻**：卡片头部一行 `7 天 / 30 天 / 全部` 分段控件（复用 `todo-pom-mode` 分段样式）。状态存组件内 `useState`，不入持久化设置。

   **单日查看 = 图表点柱下钻**，统一一条交互规则：

   - 7 天模式（柱 = 天）：点某天柱选中该天，再点取消。选中后图表卡头部显示该日汇总（`6 个 · 143 分钟 · 中断 18`），柱子描边高亮；「专注分布」「专注记录」跟随该日。
   - 30 天模式（柱 = 周）：点柱先下钻为该周按日视图（头部 `11.16–11.22 · 按日` + `‹ 返回`），再点日柱选天。
   - 全部模式（柱 = 月）：点柱下钻为该月按周，点周柱下钻为该周按日，点日柱选天；每级 `‹ 返回` 上一层。
   - 概览三格恒为今日：目标与连续天数是「今天的仪表」，被选日的数字在图表卡头部呈现，避免选中往日时「连续天数」语义错乱。
   - 下钻状态只在组件内；切范围段或切走视图即复位，不持久化。
   - 专注记录「全部」模式按日分组，组头带当日汇总（`11 月 23 日 · 4 个 · 100 分钟`），翻旧日期不需要下钻也能一眼看到当日总量。

2. **概览统计**：今日番茄 / 今日专注分钟（副行：含中断 N 分钟）/ 连续天数，保留三格网格。
3. **每日柱状图**：7 天 = 现状 7 根；30 天 = 按周聚合成 4–5 根（标注日期区间，首周只统计落在 30 天窗口内的日期）；全部 = 按月聚合，近 12 个月。柱子高度按范围内最大值归一。每根柱 title 显示完整数据。中断部分按「中断分钟 ÷ 专注时长」折算成番茄单位与完整个数叠加（琥珀色段在柱顶），柱高因此仍可跨柱比较。点柱下钻到按日、点日柱选中单日（见上）。
4. **按任务/项目分布**：**跟随当前范围或选中的单日**（会话按 `taskId` 聚合的专注分钟横条 top5，未绑定计为「未绑定任务」）。项目分布在任务行副注显示（`工作 · 3.2h`）。
5. **专注记录**：默认今日，提供「今日 / 全部」切换；列表按日分组、倒序，组头带当日汇总；每天最多显示 8 条 + 「显示更多」折叠展开；中断会话行末加「中断」标签（amber 小 tag），minutes 显示实际值。选中单日时跟随该日。
6. **侧栏卡片**文案改为「近 7 天专注」，与口径一致；数据沿用近 7 天。

### 4. 服务端汇总（`store.js` `summary`）

`pomodoro` 节点扩展（工具 `stats` 同步受益）：

```
todayFocus / todayMinutes / dailyGoal / streak / week   // 现状
todayInterruptedMinutes                                   // 新增
totalSessions / totalMinutes                              // 保持（minutes 口径改用 actualMinutes）
byTask: [{ taskId, minutes }]  top5                       // 新增（当前完整范围）
month: [{ date, count, minutes }] 近 12 个月               // 新增
```

### 5. 兼容性

- 老会话缺 `completed`/`actualMinutes`：视为 `completed: true`、`actualMinutes = minutes`，统计口径无缝回溯。
- 官方导出 `GET /state` 原样含新字段；`sessions/record` 请求体新增可选字段，旧调用方不受影响。
- 多标签页判重逻辑（`endsAt` 比对）不变。

## 验证

1. `node --test "test/*.test.js"` 全绿（含新增用例）。
2. 预览页造数：休息完成不再新增会话；暂停后收尾的 `minutes` 反映真实时长；放弃 18 分钟出现中断会话且今日分钟 +18、个数不变。
3. 时间范围切换 7/30/全部，柱状图聚合正确、空态正常。
4. 现有 `?view=pomodoro` 截图基线更新。
