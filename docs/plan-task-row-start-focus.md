# 任务行「开始专注」直接启动 实施计划

设计见 [design-task-row-start-focus.md](./design-task-row-start-focus.md)。

## 状态

- [x] 将任务行播放按钮复用为详情抽屉的直接启动处理器。
- [x] 添加回归测试：点击任务行入口后，任务已绑定、计时器运行、当前视图保持不变。
- [x] 运行测试、语法检查和预览截图验证。
- [ ] 递增版本、提交并推送，触发 npm 发布。

## 验证

1. `npm test` 全部通过。
2. `node --check lib/client.js` 通过。
3. `npm run screenshot` 成功，确认任务列表播放按钮及番茄钟状态无视觉回归。
4. 在 DSH GUI 中点击任务行播放按钮，倒计时立刻开始，列表不跳转。
