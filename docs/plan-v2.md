# UI 升级 v2 实施计划

设计见 [design-v2.md](./design-v2.md)，方向见 [ui-redesign-directions.md](./ui-redesign-directions.md)，设计稿在 [design-mockups/](./design-mockups/)。

## 状态

- [x] 现状截图分析与诊断
- [x] 三套设计方向稿（A/B/C，含 A 亮暗）→ 用户确认 A + Iris
- [x] Iris 配色亮/暗确认稿（`design-mockups/a-iris-precision*.png`）
- [x] 根 token 切换为 Iris，Logo 与 `icon.svg` 同步
- [x] v2 增量样式层（侧栏/顶栏/任务行/优先级/快捷添加/番茄/日历/抽屉/Toast）
- [x] 新增右侧上下文栏 `TodoRail`（今日概览 / 本周专注 / 接下来）
- [x] 宿主侧边栏秒级徽标与 composer dock 环改用品牌色
- [x] `client-i18n.test.js` 样式守卫改为放行 `brand-palette` 区块
- [x] 预览种子会话按钉住的 `todayDate` 锚定（统计截图稳定）
- [x] 全量截图回归（亮/暗、中/英、日历、番茄、dock、侧栏徽标、移动端）
- [x] README 双语更新（设计说明 + 测试数 126）
- [ ] 提交

## 验证

1. `npm test` 全绿（126）。
2. `node --check lib/client.js`。
3. `npm run screenshot` 生成 11 张；逐张检查无溢出/错位/色值不一致。
