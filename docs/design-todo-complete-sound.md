# 完成 TODO 的音效：设计

## 背景

0.2.22 起勾选完成一个任务会播一声「叮」，但它和番茄结束共用同一个「提示音」开关（`sound`）。本机 `state.json` 里 `sound: false`，所以完成任务时实际是静音——用户看到的就是「完成 TODO 没有音效」。

共用一个开关是根因：想关掉番茄结束提示，就会连任务完成音一起关掉；想保留任务完成音，就得一直听着番茄结束音。0.2.20 把嘀嗒声拆成独立开关解决过同一类问题，这次按同样的方式拆开。

## 目标

- 勾选完成一个任务时稳定响一声轻「叮」，不再受番茄结束开关影响。
- 任务完成音有自己的开关，默认开启；旧 `state.json` 没有该字段时迁移为开启。
- 番茄结束提示音、嘀嗒声、通知中心接管、完成提示条与撤销行为全部保持不变。
- 设置面板仍是唯一入口，一个事件只对应一个开关。

## 声音

沿用 0.2.22 的单声「叮」：三角波 1046.5Hz，6ms 起音后指数衰减 0.65 秒。任务完成峰值 0.10，番茄结束峰值 0.13，同一音色，任务完成略轻。不新增音频文件或第三方依赖，系统静音与系统音量优先。

- 勾选任务写入成功且 `done: true` 后发声，与完成提示条同时出现；主任务与子任务一致。
- 取消完成、失败、改标题、拖拽排序、删除不发声。
- 勾选时仍先在用户手势内 `primeAudio()`，浏览器策略拦下时静默失败。

## 设置

「番茄设置」里的两行声音扩成三行，每行只描述一件事：

| 行 | 字段 | 默认 | 说明 |
| --- | --- | --- | --- |
| 完成音效 | `completeSound`（新增） | 开 | 勾选完成一个任务时轻响一声 |
| 结束提示音 | `sound`（沿用） | 开 | 番茄结束时轻响一声 |
| 嘀嗒声 | `tickSound`（沿用） | 开 | 专注计时每秒轻响 |

- 原「提示音」文案改为「结束提示音」，只讲番茄结束；存储键 `sound` 不变，老用户已保存的选择继续生效。
- 三行都保留「试听」：完成音效播完成「叮」，结束提示音播结束「叮」，嘀嗒声播三声 tick / tock。
- 行结构复用现有 `todo-setting-sound`：整行占满网格，左侧名称 + 10px 说明，右侧 15px 复选框 + 26px 试听按钮。
- 顺序固定为 完成音效 → 结束提示音 → 嘀嗒声：先任务、再番茄、最后环境声。

## 布局

- 桌面抽屉宽 420px，三行声音仍为单列整行，行高与现有声音行一致；抽屉高度不变。
- 窄屏（≤520px）抽屉铺满宽度，说明文字允许换行，复选框与试听按钮不换行。
- 深色宿主沿用 label / border token；三行层级一致，只有说明文字降为 tertiary。

高保真稿：[todo-complete-sound.png](./design-mockups/todo-complete-sound.png)（亮 / 深 / 中英 / 390px，含现状方案对照）。

## 文案

| key | 中文 | English |
| --- | --- | --- |
| `settings.completeSound` | 完成音效 | Completion |
| `settings.completeSoundHint` | 勾选完成一个任务时轻响一声，默认开启 | A short ding when you check off a task; on by default |
| `settings.sound` | 结束提示音 | End alert |
| `settings.soundHint` | 番茄结束时轻响一声，默认开启 | A short ding when a Pomodoro ends; on by default |

`settings.tickSound`、`settings.tickSoundHint`、`settings.soundTest`（试听 / Test）保持不变。

## 数据与接口

- 设置新增 `completeSound: boolean`，默认 `true`。
- `lib/store.js`：`DEFAULT_SETTINGS` 增加 `completeSound: true`，`SETTINGS_BOOLEANS` 加入 `completeSound`，读取、写入、校验与持久化自动覆盖；旧文件缺字段补 `true`，显式 `false` 保留。
- `lib/index.js`：`todo` 工具 `settings` 动作接受 `completeSound`，schema 增加布尔字段。
- `lib/client.js`：`DEFAULT_SETTINGS` 与 `normalizedSettings` 同步；`toggleTask` 的成功分支改读 `completeSound`，番茄结束仍读 `sound`。
- `preview/index.html` 的 mock 设置补 `completeSound: true`。
- `docs/contract.md` 的 Settings 形状与工具说明同步。
- 双语 README 与 `docs/design.md` 的「提示音管任务完成与番茄结束」改为「完成音效 / 结束提示音 / 嘀嗒声」三行。

## 非目标

- 不做音量滑杆、音色选择、不同任务不同提示音。
- 不把任务完成接入通知中心（它只处理番茄结束）。
- 不改完成提示条、撤销、完成后收起动画。
- 不新增设置入口或第二个设置面板。

## 备选方案

**方案 B：保持一个「提示音」开关（现状）。** 不加行，界面最简；但无法只关番茄结束音而保留任务完成音，本次问题就会复发。

**方案 C：任务完成音始终播放，不提供开关。** 少一个设置项，但用户无法静音；与现有三个声音开关的可控性不一致。

因此推荐方案 A：独立「完成音效」开关。

## 验收

1. 勾选完成任务响一声「叮」；「结束提示音」关闭时任务完成音照常响。
2. 关闭「完成音效」后勾选静音，重新开启后立即恢复；取消完成、失败不发声。
3. 番茄结束提示音、通知中心接管、嘀嗒声行为不变。
4. 旧 `state.json` 缺 `completeSound` 时迁移为 `true`；显式 `false` 保留；工具可读写。
5. 设置面板三行在中英、亮暗与 390px 下与设计稿一致；`npm test`、`node --check`、截图脚本通过。
