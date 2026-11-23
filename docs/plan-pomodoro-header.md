# 番茄钟迁移到会话右上角：实施计划

设计见 [design-pomodoro-header.md](./design-pomodoro-header.md)。

## 状态

- [x] 改造 `lib/client.js`：将现有计时控件注册到 `conversation.session.header.utilities`，保留同一份状态与操作逻辑；删除 composer dock 注册。
- [x] 为顶部工具区完成紧凑布局：溢出时按「任务名 → 模式 → 最小控件」收缩，保留计时、进度和主操作。
- [x] 更新客户端结构测试，覆盖新的列表插槽注册与移除旧 dock。
- [x] 更新预览壳、截图任务和预览测试，产出顶部右侧空闲/运行、亮暗与窄宽视图。
- [x] 更新双语 README 与截图。
- [x] 运行 `npm test`、`node --check lib/client.js`、截图脚本和 Impeccable UI 检测；现有 DSH 页面需要已认证的浏览器会话刷新验证。
- [x] 将版本从 `0.2.4` 按 semver 递增，提交并推送。

## 风险与对策

- `conversation.session.header.corner` 只容纳一个控件，且宿主已占用；使用可并列的 `conversation.session.header.utilities`，保持宿主控制不受影响。
- 顶栏可用宽度随标题和宿主工具变化；任务名与模式按优先级隐藏，计时和操作维持可达。
- 插件热更新依赖正在运行的 Web 构建 watcher；实施时先核验 watcher，再通过既有 GUI 刷新确认。
