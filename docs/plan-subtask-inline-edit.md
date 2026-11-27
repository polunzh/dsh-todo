# 计划：子任务就地编辑

前置：`docs/design-subtask-inline-edit.md` 已获用户确认。基线 v0.2.22。

1. **抽屉交互**（`lib/client.js` `TaskDetail`）
   - 新增 `editingSubtaskId` / `subtaskDraft` 状态；标题 `span` 改 `button`（`aria-label`、`title`、`onClick` 进入编辑）。
   - 编辑态渲染 `.todo-drawer-subtask-input`：`autoFocus` + 光标置末尾；Enter 提交、Esc 取消、失焦提交。
   - `commitSubtaskTitle(child)`：trim 后空值或未变更直接退出；否则 `ui.onUpdate(child.id, { title })`，成功后退出编辑，失败保留编辑态并重新聚焦；退出时按 id 判定，避免覆盖另一行的编辑态。
2. **样式**（`lib/client.js` 样式段）
   - `.todo-drawer-subtask` 圆角 + `hover`（仅 `hover: hover`）；`.todo-drawer-subtask-title` 按钮化；`.todo-drawer-subtask-input` 24px / 12.5px；编辑中取消删除线。
   - 注意权重：`.todo-root button { font-size: inherit }` 会盖掉单类选择器的字号，标题按钮要用 `.todo-drawer .todo-drawer-subtask-title` 这类双类选择器并显式写 `background: transparent; border: 0; padding: 0; text-align: left`。
3. **i18n**：`detail.subtaskEdit`、`detail.subtaskEditHint`、`detail.subtaskTitle` 三键中英。
4. **测试**
   - `npm test`（重点 `test/client-i18n.test.js`）。
   - preview 手动回归：改名、连续编辑、Esc、清空、失败重试、已完成行、390px 窄屏。
5. **截图与文档**
   - `scripts/screenshot.mjs` 增 `subtask-edit` / `subtask-edit-en` 两张。
   - README 中英各补一句 + 截图。
6. **验证与发版**
   - `npm test` 全绿 → 手动回归 → bump 0.2.23 → commit + push（由 publish workflow 发 npm）。
