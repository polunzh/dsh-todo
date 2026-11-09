/**
 * 快速添加解析测试：`明天 15:00 写周报 #工作 !p1 ~weekly` 这类输入。
 *
 * lib/client.js 是浏览器 bundle（外层 window.__ModuleLoader__.load），不能直接
 * import；这里用最小环境跑一遍 factory 拿到 window.__preview。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(root, "lib", "client.js"), "utf8");

function loadClient() {
  let exported = null;
  const window = {
    __ModuleLoader__: {
      load(registration) {
        assert.equal(registration.id, "dsh-todo");
        exported = registration.factory((name) => {
          assert.equal(name, "react", "只能 require react");
          return {};
        });
      },
    },
  };
  // 在同一个 realm 里执行，避免跨 realm 对象让 deepEqual 失效。
  new Function("window", SOURCE)(window);
  assert.ok(exported && exported.__preview, "没有拿到 __preview");
  return exported.__preview;
}

const preview = loadClient();
// Node 的 navigator.language 是 en-US，测试固定成中文；语言切换另有一条断言。
preview.setPreviewLocale("zh");
const { parseQuickAdd, formatDue, localDate } = preview;

/** 测试里固定“今天”，避免依赖运行时间的星期。 */
const MONDAY = "2026-11-09";

function parse(input, extra) {
  return parseQuickAdd(input, { today: MONDAY, ...(extra || {}) });
}

/* ============================ 日期 ============================ */

test("今天 / 明天 / 后天 / 昨天", () => {
  assert.deepEqual(parse("今天 复盘").due, { date: "2026-11-09", time: null });
  assert.equal(parse("明天 写周报").due.date, "2026-11-10");
  assert.equal(parse("后天 体检").due.date, "2026-11-11");
  assert.equal(parse("昨天 补记录").due.date, "2026-11-08");
  assert.equal(parse("今天 复盘").title, "复盘");
});

test("周五解析到本周五，下周一解析到下周", () => {
  assert.equal(parse("周五 交报告").due.date, "2026-11-13");
  assert.equal(parse("星期五 交报告").due.date, "2026-11-13");
  assert.equal(parse("下周一 计划").due.date, "2026-11-16");
  assert.equal(parse("下周五 复盘").due.date, "2026-11-20");
  // 当天就是周五时，单说“周五”指下一个周五
  assert.equal(parseQuickAdd("周五 周会", { today: "2026-11-13" }).due.date, "2026-11-20");
  // 周日算一周的最后一天
  assert.equal(parseQuickAdd("周日 休息", { today: "2026-11-09" }).due.date, "2026-11-15");
});

test("具体日期：2026-11-12 / 11月12日 / 11/20", () => {
  assert.deepEqual(parse("2026-11-12 开会").due, { date: "2026-11-12", time: null });
  assert.equal(parse("11月12日 体检").due.date, "2026-11-12");
  assert.equal(parse("11月12号 体检").due.date, "2026-11-12");
  assert.equal(parse("11/20 交房租").due.date, "2026-11-20");
  // 没写年份且已过，按明年算
  assert.equal(parse("1月5日 归档").due.date, "2027-01-05");
  assert.equal(parse("2026-11-12 开会").title, "开会");
});

test("只有时刻时默认落在今天", () => {
  assert.deepEqual(parse("15:00 下午茶").due, { date: "2026-11-09", time: "15:00" });
});

test("时间：15:00 / 3pm / 下午3点 / 3:30pm", () => {
  assert.equal(parse("明天 15:00 写周报").due.time, "15:00");
  assert.equal(parse("明天 3pm 电话").due.time, "15:00");
  assert.equal(parse("明天 3:30pm 电话").due.time, "15:30");
  assert.equal(parse("明天 下午3点 打电话").due.time, "15:00");
  assert.equal(parse("明天 上午9点 站会").due.time, "09:00");
  assert.equal(parse("明天 9am 站会").due.time, "09:00");
  assert.equal(parse("明天 12pm 午饭").due.time, "12:00");
  assert.equal(parse("明天 12am 值班").due.time, "00:00");
});

test("没有日期也没有时刻时 due 为 null", () => {
  assert.equal(parse("整理照片").due, null);
  assert.equal(parse("整理照片").title, "整理照片");
});

/* ============================ 项目 / 标签 / 优先级 ============================ */

test("#项目 与 @标签", () => {
  const parsed = parse("写文档 #工作 @紧急 @review");
  assert.equal(parsed.project, "工作");
  assert.deepEqual(parsed.labels, ["紧急", "review"]);
  assert.equal(parsed.title, "写文档");
  // 第二个 # 当作标签
  const twoHashes = parse("买咖啡 #生活 #杂事");
  assert.equal(twoHashes.project, "生活");
  assert.deepEqual(twoHashes.labels, ["杂事"]);
});

test("已知项目名优先匹配，未知的也当项目", () => {
  assert.equal(parse("#工作 写周报", { projects: ["工作", "生活"] }).project, "工作");
  assert.equal(parse("#新项目 开个头", { projects: ["工作"] }).project, "新项目");
});

test("优先级 !p1 到 !p4", () => {
  [1, 2, 3, 4].forEach((priority) => {
    const parsed = parse(`!p${priority} 任务`);
    assert.equal(parsed.priority, priority);
    assert.equal(parsed.title, "任务");
  });
  assert.equal(parse("!1 紧急").priority, 1);
  assert.equal(parse("!high 紧急").priority, 1);
  assert.equal(parse("没有优先级的任务").priority, null);
});

test("重复规则 ~daily / ~weekly / ~weekday / ~monthly", () => {
  assert.deepEqual(parse("8:00 跑步 ~daily").recurrence, { freq: "daily", interval: 1 });
  assert.deepEqual(parse("提交周报 ~weekly").recurrence, { freq: "weekly", interval: 1 });
  assert.deepEqual(parse("站会 ~weekday").recurrence, { freq: "weekday", interval: 1 });
  assert.deepEqual(parse("缴费 ~monthly").recurrence, { freq: "monthly", interval: 1 });
  assert.deepEqual(parse("每天 8:00 跑步").recurrence, { freq: "daily", interval: 1 });
  assert.deepEqual(parse("每周 一 复盘").recurrence, { freq: "weekly", interval: 1 });
});

/* ============================ 组合与边界 ============================ */

test("完整示例：明天 15:00 写周报 #工作 !p1 ~weekly", () => {
  const parsed = parse("明天 15:00 写周报 #工作 !p1 ~weekly");
  assert.deepEqual(parsed, {
    title: "写周报",
    due: { date: "2026-11-10", time: "15:00" },
    priority: 1,
    project: "工作",
    labels: [],
    recurrence: { freq: "weekly", interval: 1 },
  });
});

test("无法识别的部分原样留在标题里", () => {
  const parsed = parse("明天 和 design 对齐 #工作");
  assert.equal(parsed.title, "和 design 对齐");
  assert.equal(parsed.due.date, "2026-11-10");
});

test("空输入与纯空白不产生标题", () => {
  assert.equal(parse("").title, "");
  assert.equal(parse("   ").title, "");
  assert.equal(parse("  !p1  ").title, "");
  assert.equal(parse("  !p1  ").priority, 1);
});

test("只有重复规则时 due 落在今天", () => {
  assert.deepEqual(parse("~weekly 复盘").due, { date: "2026-11-09", time: null });
});

test("不传 today 时用本地日期", () => {
  const due = parseQuickAdd("明天 提醒").due;
  const expected = new Date();
  expected.setDate(expected.getDate() + 1);
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  assert.match(due.date, pattern);
  assert.equal(due.date, localDate(expected.getTime()));
});

test("localDate 输出本地日期字符串", () => {
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(localDate(new Date(2026, 10, 9, 23, 30).getTime()), "2026-11-09");
  assert.equal(localDate(new Date(2026, 0, 1, 0, 0).getTime()), "2026-01-01");
});

/* ============================ 日期标签 ============================ */

test("formatDue：今天 / 明天 / 昨天 / 周几 / 月日 / 跨年", () => {
  assert.equal(formatDue("2026-11-09", MONDAY), "今天");
  assert.equal(formatDue("2026-11-10", MONDAY), "明天");
  assert.equal(formatDue("2026-11-08", MONDAY), "昨天");
  assert.equal(formatDue("2026-11-13", MONDAY), "11 月 13 日 周五");
  assert.equal(formatDue("2026-11-25", MONDAY), "11 月 25 日");
  assert.equal(formatDue("2027-01-03", MONDAY), "2027 年 1 月 3 日");
  assert.equal(formatDue("not-a-date", MONDAY), "");
  // 没有 today 时按系统日期算
  assert.equal(formatDue(localDate(), localDate()), "今天");
  // 英文界面
  preview.setPreviewLocale("en");
  assert.equal(formatDue("2026-11-09", MONDAY), "Today");
  assert.equal(formatDue("2026-11-13", MONDAY), "Nov 13, Fri");
  assert.equal(formatDue("2027-01-03", MONDAY), "Jan 3, 2027");
  preview.setPreviewLocale("zh");
});
