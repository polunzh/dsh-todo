# 详情抽屉显式保存 实施计划

设计见 [design-save-button.md](./design-save-button.md)。

## 状态

- [x] `lib/client.js`：将详情编辑状态拆分为 dirty / saving / saveError，并从现有自动保存逻辑导出单一 `saveNow` 提交函数。
- [x] `lib/client.js`：顶栏加入「保存」/「重试保存」按钮，支持 `⌘/Ctrl + Enter`，保留关闭按钮与自动保存。
- [x] `lib/client.js`：补齐中英文状态、无障碍标签和响应式样式；底部辅助文案调整为「自动保存已开启」。
- [x] `test/client-i18n.test.js`：断言中英文保存相关键与抽屉保存状态/按钮结构。
- [x] `npm test`、`node --check lib/client.js`、`npm run screenshot`；人工检查已保存、编辑中、保存中、失败重试和窄屏抽屉。
- [x] 递增版本，更新双语 README 的任务详情说明，提交并推送以发布 npm 包。

## 验收标准

1. 输入变更后，显式保存按钮可用，点击会立即提交当前值并显示「已保存」。
2. 自动保存继续工作；手动保存与自动保存不会产生并发覆盖。
3. 保存失败会保留输入并给出可操作的「重试保存」。
4. `⌘/Ctrl + Enter` 与点击按钮行为一致，中英文和窄屏界面完整可用。
