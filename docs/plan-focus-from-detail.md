# 详情抽屉「开始专注」直接启动 实施计划

设计见 [design-focus-from-detail.md](./design-focus-from-detail.md)。

## 状态

- [x] `lib/client.js`：新增 `handleStartFocus` 与 `ui.onStartFocus`；详情按钮改用；`toast.focusStarted` 中英键
- [x] 无头预览验证：点击后计时运行、不跳转
- [ ] 版本 `0.2.1` → `0.2.2`，提交并 push

## 验证

1. `node --test "test/*.test.js"` 全绿。
2. `node --check lib/client.js`。
3. 预览页：详情点「开始专注此任务」→ 计时启动、仍停留当前视图。
