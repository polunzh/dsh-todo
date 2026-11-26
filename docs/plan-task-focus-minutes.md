# 计划：任务级专注时长

前置：`docs/design-task-focus-minutes.md` 已获用户确认。基线 `fe1322c`（v0.2.15）。

1. **store 层**
   - `lib/store.js`：`LIMITS`/校验函数 `normalizeFocusMinutes`（1–180 整数或 null，`""` 归 null）；`createTask` / `updateTask` / `normalizeStoredTask` 支持 `focusMinutes`。
   - `test/store.test.js` 新用例。
2. **引擎层**
   - `lib/client.js` `pomodoroReducer`：`start`/`resume` 支持可选 `minutes`；`state.startAt`；`completeSession` 用真实开始时刻与本轮分钟数写会话。
   - `test/pomodoro.test.js` 新用例（含无覆盖时行为不变的回归）。
3. **HTTP + 工具**
   - `lib/index.js`：`add`/`update` 参数、`formatTaskLine` 追加时长标注。
   - `test/route.test.js` / `test/tool.test.js` 新用例。
4. **UI**
   - 详情抽屉「专注时长」字段（分段 + 自定义，走 dirty-save）；任务行 `15′` chip 与按钮 tooltip；i18n 键。
   - `test/client-i18n.test.js` 新键校验。
5. **验证与发版**
   - `npm test` 全绿；`npm run preview` + `scripts/screenshot.mjs` 出新截图；发版 bump（0.2.16，如统计线先发则顺延）、双语 README、`docs/contract.md` 更新，commit + push。

合并注意：统计准确性改进（main 上 stash `wip-pomodoro-stats`）触及 `completeSession` 同一区域，合入顺序以先发版者为准，后者 rebase。
