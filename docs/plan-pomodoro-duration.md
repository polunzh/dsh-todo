# 番茄钟时长设置 实施计划

设计见 [design-pomodoro-duration.md](./design-pomodoro-duration.md)。

## 状态

- [x] `lib/client.js`：`setSettings` 记旧值、`configure` 空闲立即刷新；提示文案更新
- [x] `lib/client.js`：计时盘「专注时长」快捷行（25/45/60/自定义），移除设置网格里的 focusMinutes；新增 i18n 键与样式
- [x] `lib/index.js`：`todo` 工具 `settings` 动作与参数
- [x] 测试：pomodoro（configure 四情形）、tool（settings 动作）、client-i18n
- [x] 文档：`docs/contract.md`、双语 README
- [ ] 版本 `0.2.0` → `0.2.1`，提交并 push

## 验证

1. `node --test "test/*.test.js"` 全绿。
2. `node --check lib/client.js lib/index.js`。
3. 预览页：番茄钟切 50′ → 计时盘立即显示 50:00；运行中改时长不打断；工具 `settings` 改完刷新。
