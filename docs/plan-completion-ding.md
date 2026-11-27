# 完成提示音改为单声「叮」：实施计划

设计见 [design-completion-ding.md](./design-completion-ding.md)。

## 状态

- [x] `lib/client.js`：新增 `playDing`（三角波 1046.5Hz，0.65s 衰减），`playChime` 与 `playCompletionChime` 都改用它，删除不再使用的 `playNotes`。
- [x] `test/pomodoro-notify.test.js`：番茄结束的提示音断言从三音改为单声，保留通知中心不重复发声的断言。
- [x] `docs/design.md`、`docs/design-pomodoro-tick-sound.md`、`docs/design-mockups/pomodoro-tick-sound.html` 与 PNG、双语 README：把「三音 / 双音」改成单声「叮」。
- [x] 跑 `npm test`、`node --check lib/client.js`、截图脚本，确认设置面板与设计稿一致。
- [x] 版本从 `0.2.21` 递增到 `0.2.22`，提交并 push；npm staged publishing 需用户 Approve。
