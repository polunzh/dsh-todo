import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_STEPS,
  addDays,
  addMonths,
  advanceDate,
  daysInMonth,
  isDateString,
  weekdayOf,
} from "../lib/recurrence.js";

test("isDateString validates calendar dates accurately", () => {
  assert.equal(isDateString("2026-11-09"), true);
  assert.equal(isDateString("2024-02-29"), true); // 闰年
  assert.equal(isDateString("2025-02-29"), false); // 平年
  assert.equal(isDateString("2026-04-31"), false); // 4月只有 30 天
  assert.equal(isDateString("not-a-date"), false);
  assert.equal(isDateString(null), false);
  assert.equal(isDateString(""), false);
});

test("daysInMonth returns accurate days for months", () => {
  assert.equal(daysInMonth(2026, 1), 31);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 4), 30);
});

test("addDays handles day arithmetic across months and years", () => {
  assert.equal(addDays("2026-01-30", 2), "2026-02-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("addMonths clamps to end of month when day exceeds target month", () => {
  // 1-31 加 1 个月到 2 月（平年）应为 2-28
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  // 闰年 1-31 加 1 个月为 2-29
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  // 3-31 加 1 个月到 4 月应为 4-30
  assert.equal(addMonths("2026-03-31", 1), "2026-04-30");
  // 5-31 加 2 个月到 7 月应为 7-31
  assert.equal(addMonths("2026-05-31", 2), "2026-07-31");
});

test("weekdayOf returns correct day of week (0=Sun..6=Sat)", () => {
  // 2026-11-09 是周一
  assert.equal(weekdayOf("2026-11-09"), 1);
  // 2026-11-14 是周六
  assert.equal(weekdayOf("2026-11-14"), 6);
  // 2026-11-15 是周日
  assert.equal(weekdayOf("2026-11-15"), 0);
});

test("advanceDate: daily advances by interval days", () => {
  assert.equal(
    advanceDate("2026-11-09", { freq: "daily", interval: 1 }, "2026-11-09"),
    "2026-11-10",
  );
  assert.equal(
    advanceDate("2026-11-09", { freq: "daily", interval: 3 }, "2026-11-09"),
    "2026-11-12",
  );
});

test("advanceDate: weekday skips Saturday and Sunday", () => {
  // 周五 (2026-11-13) 的下一个工作日是下周一 (2026-11-16)
  assert.equal(
    advanceDate("2026-11-13", { freq: "weekday" }, "2026-11-13"),
    "2026-11-16",
  );
  // 周六 (2026-11-14) 也是下周一
  assert.equal(
    advanceDate("2026-11-14", { freq: "weekday" }, "2026-11-14"),
    "2026-11-16",
  );
  // 周一 (2026-11-09) 下一个是周二 (2026-11-10)
  assert.equal(
    advanceDate("2026-11-09", { freq: "weekday" }, "2026-11-09"),
    "2026-11-10",
  );
});

test("advanceDate: weekly advances by 7 * interval days", () => {
  assert.equal(
    advanceDate("2026-11-09", { freq: "weekly", interval: 1 }, "2026-11-09"),
    "2026-11-16",
  );
  assert.equal(
    advanceDate("2026-11-09", { freq: "weekly", interval: 2 }, "2026-11-09"),
    "2026-11-23",
  );
});

test("advanceDate: monthly advances by interval months with end-of-month clamping", () => {
  assert.equal(
    advanceDate("2026-01-31", { freq: "monthly", interval: 1 }, "2026-01-31"),
    "2026-02-28",
  );
  assert.equal(
    advanceDate("2024-01-31", { freq: "monthly", interval: 1 }, "2024-01-31"),
    "2024-02-29",
  );
  assert.equal(
    advanceDate("2026-01-15", { freq: "monthly", interval: 3 }, "2026-01-15"),
    "2026-04-15",
  );
});

test("advanceDate: past dates automatically catch up to or past today", () => {
  // 原截止日期 2026-10-01，每天一次，today 是 2026-11-09
  const nextDaily = advanceDate("2026-10-01", { freq: "daily", interval: 1 }, "2026-11-09");
  assert.equal(nextDaily, "2026-11-09");

  // 原截止 2026-10-01，每周一次（周四），today 是 2026-11-09（周一），下一个周四是 2026-11-12
  const nextWeekly = advanceDate("2026-10-01", { freq: "weekly", interval: 1 }, "2026-11-09");
  assert.equal(nextWeekly, "2026-11-12");
  assert.ok(nextWeekly >= "2026-11-09");
});

test("advanceDate: when task has no due date, starts advancing from today", () => {
  assert.equal(
    advanceDate(null, { freq: "daily", interval: 2 }, "2026-11-09"),
    "2026-11-11",
  );
  assert.equal(
    advanceDate(undefined, { freq: "weekly", interval: 1 }, "2026-11-09"),
    "2026-11-16",
  );
});

test("advanceDate: returns today if still before today after MAX_STEPS", () => {
  // 极远过去日期 + 极小步长，如果超限则兜底返回 today
  const result = advanceDate("1000-01-01", { freq: "daily", interval: 1 }, "2026-11-09");
  assert.equal(result, "2026-11-09");
});

test("advanceDate: throws on invalid inputs", () => {
  assert.throws(() => advanceDate("2026-11-09", { freq: "yearly" }, "2026-11-09"), TypeError);
  assert.throws(() => advanceDate("2026-11-09", { freq: "daily" }, "bad-today"), TypeError);
});
