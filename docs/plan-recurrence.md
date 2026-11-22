# 重复规则扩展实施计划

设计见 [design-recurrence.md](./design-recurrence.md)。

## 状态

- [x] `lib/recurrence.js`：`addYears` / `endOfMonth` / `nthWeekdayOfMonth`，扩展 `advanceDate` 支持 yearly、weekly 多星期几、monthly 三种模式
- [x] `lib/store.js`：`normalizeRecurrence` 支持新字段与校验
- [x] `lib/index.js`：工具参数扩展（`recurrenceWeekdays`/`recurrenceMonthMode`/`recurrenceNth`/`recurrenceWeekday`、`yearly`），拼装结构化 recurrence；`FREQ_LABELS` 补 yearly
- [x] `lib/client.js`：重复编辑器分层控件、`recurrenceLabel` 扩展、快速添加新语法、i18n 新键（中英）
- [x] 测试：recurrence / store / parse / client-i18n / tool
- [x] 文档：`docs/contract.md`、`README.md`、`README.zh-CN.md`
- [ ] 版本 `0.1.3` → `0.2.0`，提交并 push

## 验证

1. `node --test "test/*.test.js"` 全绿。
2. `node --check` 每个改动的 JS 文件。
3. 手动过一遍：新建重复任务 → 详情面板切各模式 → 完成一次看下一次日期；快速添加 `每周一三五 站会`、`每月最后一天 对账`、`每年 纪念日`。
