# 番茄钟统计改进 实施计划

设计见 [design-pomodoro-stats.md](./design-pomodoro-stats.md)，高保真稿见 [design-mockups/pomodoro-stats.html](./design-mockups/pomodoro-stats.html)。

## 状态

- [x] **T1 会话模型**（`lib/store.js`）：`recordSession` 接受 `completed` / `actualMinutes` 并校验；`summary` 的分钟口径改 `actualMinutes ?? minutes`、个数口径只数 `completed !== false`；新增 `todayInterruptedMinutes`、`byTask`、`month`。契约文档同步 `docs/contract.md`。
- [x] **T2 收尾记账**（`lib/client.js`）：`pomodoroEngine` 记 `focusElapsedMs`（pause 累计、resume 重置）；`completeSession` 只在专注到点时记录、用真实 `startedAt`；新增 `recordInterruptedFocus`（≥5 分钟记 `completed:false` 会话）；「放弃」「跳过」在专注模式先记账再派发动作。
- [x] **T3 统计区重做**（`lib/client.js`）：范围分段控件（7/30/全部，组件内状态）；三格概览（恒今日）；柱状图按范围聚合（日/周/月）+ 中断分钟叠加段 + 点柱下钻（周→日、月→周→日）与单日选中（头部当日汇总、分布与记录跟随）；任务/项目分布 top5；专注记录「今日/全部」+ 按日分组（组头当日汇总）+ 展开更多 + 中断标签；侧栏卡片改「近 7 天专注」。i18n 键补全中英。
- [x] **T4 预览与截图**（`preview/`、`scripts/screenshot.mjs`）：种子会话补 `completed` / `actualMinutes` 与更长历史；mock API 透传新字段；新增/更新 `pomodoro`、`pomodoro-stats-30d` 等截图。
- [x] **测试**：store（新字段校验、summary 口径、byTask/month 聚合、task.pomodoros 只数完整）；pomodoro（focusElapsedMs 记账、休息不记录、放弃阈值、多标签判重不变）；preview（截图叙事）；client-i18n（新键）。
- [x] **文档与发版**：双语 README 统计说明与截图；版本 `0.2.15` → `0.2.16`，提交并 push。

## 验证

1. `node --test "test/*.test.js"` 全绿。
2. `node --check lib/client.js lib/store.js`。
3. 预览页：休息完成不新增会话；暂停后收尾时长为实际值；放弃 18 分钟出现中断会话（今日分钟 +18、个数不变）；7/30/全部切换与记录列表展开正常。
4. `node scripts/screenshot.mjs` 产出新基线，双语 README 更新引用。
