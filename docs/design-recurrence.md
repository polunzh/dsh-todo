# dsh-todo 重复规则扩展设计

## 背景

当前重复规则是 `recurrence = { freq, interval }`，`freq` 只有 `daily / weekday / weekly / monthly` 四种，UI 是一个下拉框加一个间隔数字，选择面窄。本次扩展规则类型与粒度。

## 范围（已与用户确认）

做：

- 每年（`yearly`，每 N 年）
- 每周多选星期（如周一/三/五）
- 每月三种模式：同一天（现状）/ 当月最后一天 / 第 N 个星期几
- 快速添加同步支持新语法（`~yearly`、`每周一/三/五`、`每月最后一天` 等）

不做：

- 结束条件（`until` / `count`）
- 按完成日重算（下一次仍从原截止日锚定）

## 数据模型

```jsonc
Recurrence = {
  "freq": "daily" | "weekday" | "weekly" | "monthly" | "yearly",
  "interval": 1..30,              // weekday 恒为 1
  "weekdays"?: [0..6],            // 仅 weekly：0=周日…6=周六，升序去重；缺省=沿用 due 的星期几
  "monthMode"?: "date" | "lastDay" | "nthWeekday",  // 仅 monthly，默认 "date"
  "nth"?: 1|2|3|4|-1,             // 仅 monthly+nthWeekday：第几个；-1 = 最后一个
  "weekday"?: 0..6                // 仅 monthly+nthWeekday：星期几
}
```

- 只保留与 `freq`/`monthMode` 相关的可选字段，其余剥离，避免脏数据。
- 向后兼容：旧数据 `{freq, interval}` 归一化后行为不变；`weekly` 无 `weekdays` = 原来的「每 N 周同一星期几」。

## 日期前进语义（`lib/recurrence.js`）

`advanceDate(date, recurrence, today)` 输入输出仍是 `YYYY-MM-DD`。

| freq / 模式 | 下一次日期 |
| --- | --- |
| `daily` | `+ interval` 天 |
| `weekday` | 下一个工作日（跳过周六日），`interval` 固定 1 |
| `weekly`（无 `weekdays`） | `+ 7 × interval` 天（同一个星期几） |
| `weekly`（有 `weekdays`） | base 所在周为第 0 周；活动周 = 周序号 % interval == 0；取 base 之后最早、星期几 ∈ weekdays 且落在活动周的日期 |
| `monthly` + `date`（默认） | `addMonths(base, interval×m)`，日超出取月末（以 base 为锚，避免 1-31→2-28→3-28 漂移） |
| `monthly` + `lastDay` | base 月 + `interval×m` 个月的当月最后一天 |
| `monthly` + `nthWeekday` | base 月 + `interval×m` 个月的「第 nth 个 weekday」，nth=1..4 或 -1（最后一个） |
| `yearly` | `addYears(base, interval×m)`，2-29 在平年取 2-28 |

通用规则不变：结果早于 `today` 继续前进，最多 `MAX_STEPS` 次，仍早于则返回 `today`；任务无 `due` 时从 `today` 起算。

新增纯函数：`addYears(date, years)`、`endOfMonth(date)`、`nthWeekdayOfMonth(year, month, nth, weekday)`。

## 归一化（`lib/store.js` `normalizeRecurrence`）

- `freq` ∈ 上述 5 种，否则 `invalid-recurrence`。
- `interval` 整数 1..30；`weekday` 强制 1。
- `weekly`：`weekdays` 可为整数数组，元素 0..6，去重升序；空数组视为缺省（不写字段）。
- `monthly`：`monthMode` ∈ `date|lastDay|nthWeekday`，默认 `date`；`nthWeekday` 要求 `nth ∈ {1,2,3,4,-1}` 且 `weekday ∈ 0..6`，否则 `invalid-recurrence`；`date`/`lastDay` 剥离 `nth`/`weekday`。
- `daily|weekday|yearly`：剥离 `weekdays`/`monthMode`/`nth`/`weekday`。

## HTTP 契约

路由不变，`recurrence` 请求体直接传结构化对象即可（`normalizeRecurrence` 已支持对象）。`docs/contract.md` §1 的数据模型与日期前进规则同步更新。

## 智能体工具 `todo`

现有 `recurrence` 字符串枚举加 `yearly`，并新增可选配套参数（均为扁平标量，避免 `oneOf`）：

- `recurrenceWeekdays`: `integer[]`（0..6，仅 weekly）
- `recurrenceMonthMode`: `enum ["date","lastDay","nthWeekday"]`（仅 monthly）
- `recurrenceNth`: `integer`，1..4 或 -1
- `recurrenceWeekday`: `integer`，0..6

`index.js` 用这些参数拼出结构化 recurrence 再交给 store。

## 客户端 UI

详情面板的重复编辑器替换为按 `freq` 分层的控件：

- 频率下拉：不重复 / 每天 / 工作日 / 每周 / 每月 / 每年。
- 间隔数字：`weekday` 不显示。
- `weekly` 选中后：周一…周日 7 个可多选小按钮；不选=沿用截止日的星期几。
- `monthly` 选中后：模式下拉（每月同一天 / 每月最后一天 / 每月第 N 个星期几）；选「第 N 个」时再出「第几个」与「星期几」两个下拉。
- 右侧 `recurrenceLabel` 汇总文案（如「每月第 2 个周二」「每周一、三、五」「每 2 年」）。

新增 i18n 键：`rec.yearly`、`rec.everyYears`、`rec.monthMode`、`rec.modeDate`、`rec.modeLastDay`、`rec.modeNthWeekday`、`rec.nth`、`rec.lastUnit`、`rec.weekdayPick`、`rec.everyNthWeekday`。中英双字典同步，`client-i18n.test.js` 校验键一致。

## 快速添加语法

在日期解析前先提取重复规则并从标题移除（长匹配优先）：

| 输入 | 结果 |
| --- | --- |
| `~daily` `每天` `每日` `天天` | `{freq:"daily",interval:1}` |
| `~weekday` `工作日` | `{freq:"weekday",interval:1}` |
| `~weekly` `每周` | `{freq:"weekly",interval:1}` |
| `~yearly` `~year` `每年` | `{freq:"yearly",interval:1}` |
| `~monthly` `每月` | `{freq:"monthly",interval:1,monthMode:"date"}` |
| `每月最后一天` | `{freq:"monthly",interval:1,monthMode:"lastDay"}` |
| `每周一三五` `每周一、三、五` `每周一/三/五` | `{freq:"weekly",interval:1,weekdays:[1,3,5]}` |
| `每月第二个周二` | `{freq:"monthly",interval:1,monthMode:"nthWeekday",nth:2,weekday:2}` |

中文星期映射沿用现有 `WEEKDAY_TOKENS`；「最后一个」写作 `每月最后一个周五`（`nth=-1`）。

## 测试

- `test/recurrence.test.js`：yearly（含闰日）、weekly 多星期几、monthly lastDay / nthWeekday、与 today 的追赶。
- `test/store.test.js`：normalizeRecurrence 各分支与非法输入。
- `test/parse.test.js`：新语法解析。
- `test/client-i18n.test.js`：中英键一致。
- `test/tool.test.js`：结构化参数落到 recurrence 对象。
- 全部 `node --test "test/*.test.js"` + `node --check` 通过。

## 文档与发布

- 更新 `docs/contract.md`、`README.md` / `README.zh-CN.md` 的重复任务说明。
- 版本按 semver 递增（新功能 → `0.2.0`），提交并 push；有 `origin` 时推送。
