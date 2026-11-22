# 番茄钟时长设置优化 设计

## 背景

番茄钟页已有「番茄设置」，可改 `focusMinutes` / `shortBreakMinutes` / `longBreakMinutes` / `longBreakEvery`。存在两个问题：

1. **调大时长不刷新空闲计时盘**：`reducer` 的 `configure` 用新设置算 `fullMs` 判断是否空闲，25→50 时旧 `remainingMs`(25′) 小于新满值，被当成「进行中」，计时盘仍显示 25′。用户以为设置无效。
2. 提示文案写死「从下一个番茄开始生效」，进一步强化「设不了」的错觉。

用户确认要三件事：改完立即生效、计时盘上直接选时长、助手也能设置。

## 范围

- 空闲（未开始/已到点）时改设置，当前计时盘立即按新时长刷新；进行中的番茄沿用原时长，不被打断。
- 计时盘内新增「专注时长」快捷选择：`25 / 45 / 60 / 自定义`。
- 智能体工具 `todo` 增加 `settings` 动作，可改全部番茄设置。
- 专注时长的数值输入从「番茄设置」网格移到计时盘快捷行（单处入口，避免重复控件）；短休 / 长休 / 长休间隔 / 每日目标仍在设置网格。

## 设计

### 立即生效

- `pomodoroEngine.setSettings` 记住旧设置，`dispatch({ type: "configure", previousSettings })`。
- `reducer` `configure`：
  - 运行中：原样返回（不打断）。
  - 空闲（`remainingMs` 约等于旧满值，或 ≤ 0）：`remainingMs = 新满值`。
  - 暂停中（0 < remainingMs < 旧满值）：`remainingMs = min(remainingMs, 新满值)`，不改进度。
- 提示文案改为「空闲时立即生效，进行中的番茄沿用原时长」。

### 计时盘快捷时长

- 番茄钟主区新增一行：`专注时长` + `25′ / 45′ / 60′` 按钮 + 自定义分钟输入。
- 点击写入 `settings.focusMinutes`（`ui.onSettings`），复用同一设置源，空闲立即生效。
- 移除设置网格里的 `focusMinutes` 输入。

### 工具设置

`todo` 工具新增 `action: "settings"`，配套可选数字/布尔参数：

- `focusMinutes` 1–180、`shortBreakMinutes` 1–60、`longBreakMinutes` 1–120、`longBreakEvery` 2–12、`dailyGoal` 1–40
- `autoStartNext`、`sound`（布尔）

执行时收集已传字段调用 `updateSettings`，返回摘要，例如「已更新番茄设置：专注 50 分钟 · 短休 5 · 长休 15 · 每 4 个长休 · 目标 8」。

## 测试

- `test/pomodoro.test.js`：`configure` 增大/减小/运行中/暂停中四种情形。
- `test/tool.test.js`：`action=settings` 生效与非法值报错。
- `test/client-i18n.test.js`：新键中英一致。

## 文档

- `docs/contract.md` §3 工具参数与动作补 `settings`。
- `README.md` / `README.zh-CN.md` 工具动作补 `settings`，番茄钟说明补充「计时盘可直接选专注时长」。
