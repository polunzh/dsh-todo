# 完成 TODO 的音效：实施计划

设计见 [design-todo-complete-sound.md](./design-todo-complete-sound.md)，高保真稿见 [design-mockups/todo-complete-sound.png](./design-mockups/todo-complete-sound.png)。

## 状态

- [x] `lib/client.js`：`DEFAULT_SETTINGS` 与 `normalizedSettings` 增加 `completeSound: true`；`toggleTask` 的成功分支改读 `completeSound`，番茄结束仍读 `sound`。
- [x] `lib/client.js`：设置面板声音区改为三行（完成音效 / 结束提示音 / 嘀嗒声），各自复选框与试听；中英字典更新文案。
- [x] `lib/store.js`：`completeSound` 默认 `true`，加入 `SETTINGS_BOOLEANS`；旧数据迁移为 `true`，显式 `false` 保留。
- [x] `lib/index.js`：`todo` 工具 `settings` 动作与 schema 接受 `completeSound`。
- [x] `preview/index.html`：mock 设置补 `completeSound: true`；`scripts/screenshot.mjs` 的设置面板与主题截图更新为三行。
- [x] `docs/contract.md`、`docs/design.md`、`docs/design-completion-ding.md`、`docs/design-pomodoro-tick-sound.md`、`docs/design-task-completion-feedback.md` 与双语 README 同步文案与行为。
- [x] `test/`：覆盖默认值、迁移、工具参数、设置行结构，以及 `test/complete-sound.test.js` 里勾选发声 / 关闭静音 / 取消完成不发声三条真实路径。
- [x] 跑 `npm test`、`node --check lib/client.js`、截图脚本；确认亮 / 深 / 中英 / 390px 设置面板与设计稿一致。
- [ ] 版本从 `0.2.23` 递增到 `0.2.24`，提交并 push；npm staged publishing 需用户在 npmjs.com Approve。

## 实施要点

- 只拆开关，不换音色：完成音继续用 `playCompletionChime()`（峰值 0.10），结束音继续用 `playChime()`（峰值 0.13）。
- 试听按钮分别绑定真实函数，不另写合成逻辑，避免试听与真实声音不一致。
- 设置面板三行复用现有 class，只加行，不改网格结构。
- 旧用户迁移只补默认值，不改写已有显式选择；本机 `sound: false` 保持不变，完成音由新字段独立控制。

## 风险与对策

- 老用户突然听到完成音：这是本次默认开启的预期变化；关闭入口就在同一行右侧，说明文字写明「默认开启」。
- 大量勾选子任务时连续发声：音量轻、单声短，且与完成提示条一一对应；不做批量节流，保持行为可预期。
- 浏览器自动播放策略：沿用 `primeAudio()`，失败静默，不阻塞勾选与写入。
