# 番茄钟嘀嗒声：实施计划

设计见 [design-pomodoro-tick-sound.md](./design-pomodoro-tick-sound.md)，高保真稿见 [design-mockups/pomodoro-tick-sound.png](./design-mockups/pomodoro-tick-sound.png)。

## 状态

- [x] `lib/client.js`：`DEFAULT_SETTINGS` 与 `normalizedSettings` 增加 `tickSound: true`；新增可复用的带通噪声嘀嗒合成与 tick / tock 交替，试听播三次。
- [x] `lib/client.js`：番茄引擎每秒 tick 时按实时设置发声；开始 / 继续时在用户手势内 `primeAudio()`；暂停、跳过、放弃、休息、到点都不响。
- [x] `lib/client.js`：插件设置「番茄设置」在提示音下方新增「嘀嗒声」行（说明 + 复选框 + 试听），中英字典补键。
- [x] `lib/store.js`：`tickSound` 默认 `true`，加入 `SETTINGS_BOOLEANS`；旧数据迁移为 `true`，显式 `false` 保留。
- [x] `lib/index.js`：`todo` 工具 `settings` 动作与 schema 接受 `tickSound`。
- [x] `preview/index.html`：mock 设置补 `tickSound: true`；`scripts/screenshot.mjs` 新增设置面板截图，并重跑受影响的设置抽屉截图。
- [x] `docs/contract.md`、`docs/design.md`、双语 README：同步字段、行为与截图。
- [x] `test/`：覆盖默认值、迁移、工具参数、引擎每秒发声与各静音路径、设置行结构。
- [x] 跑 `npm test`、`node --check lib/client.js`、截图脚本；确认亮 / 深 / 中英 / 窄屏设置面板与设计稿一致。
- [x] 版本从 `0.2.19` 递增到 `0.2.20`，提交并 push；npm 发布走 OIDC，需要用户在 npmjs.com 确认。

## 实施要点

- 发声函数只依赖 `AudioContext`，缓存一段噪声 buffer；`getAudioContext` 与 `primeAudio` 复用现有实现。
- 引擎 tick 里读 `settingsSnapshot()`，不用会话快照，保证关闭开关立即生效。
- 试听与真实嘀嗒共用同一个合成函数，避免两套音色。
- 通知中心接管番茄结束时，嘀嗒先停，不额外处理声音。

## 风险与对策

- 浏览器自动播放策略：音频上下文只在用户手势里唤醒；唤醒失败时静默，不报错、不阻塞计时。
- 后台标签页节流：接受嘀嗒变慢或停顿，不引入长时音频调度；在文档里写明边界。
- 旧用户突然听到嘀嗒：这是本次默认开启的预期变化；关闭入口就在设置面板，说明文案明确写「默认开启」。
- 新增设置字段要让旧 `state.json` 保持可用：只做补默认值，不改写已有显式选择。
