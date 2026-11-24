# 专注进行中时会话顶栏倒计时：实施计划

设计见 [design-pomodoro-header-focus-countdown.md](./design-pomodoro-header-focus-countdown.md)。

## 状态

- [x] 调整 `lib/client.js` 的 `PomodoroHeaderTimer`：将运行态 `mm:ss` 建为独立、稳定的读数元素，并保留同一份 `pomodoroEngine` 状态和全部既有动作。
- [x] 调整顶栏样式：为读数设置显式 display、收缩规则和前景色；按「任务 → 模式 → 跳过」收起，时间与暂停/继续持续保留。
- [x] 扩展 `test/client-i18n.test.js`：覆盖读数的结构、运行态可访问名称和收缩优先级。
- [x] 更新预览壳与截图：重生成专注运行、深色、英文和紧凑宽度的顶栏图。
- [x] 更新双语 README 的顶栏说明与截图。
- [x] 运行验证、将版本从 `0.2.10` 按 semver 递增、提交并推送 `main`，由发布工作流推送 npm 包。

## 验证

1. `npm test`。
2. `node --check lib/client.js`。
3. `npm run screenshot`，并检查四张顶栏截图中的 `mm:ss`。
4. Impeccable UI 检测覆盖修改过的前端文件。
5. 在现有 DSH GUI 刷新后实际启动专注：确认右上角每秒递减；再确认短休/长休、暂停/继续、跳过和窄宽收缩。
