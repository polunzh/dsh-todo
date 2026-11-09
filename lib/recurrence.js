/**
 * 重复任务的日期前进规则（docs/contract.md §1）。
 *
 * 全部是纯函数，输入输出都是本地日期字符串 `YYYY-MM-DD`。内部用 UTC 时间戳
 * 做日期算术，避免夏令时把一天算成 23 或 25 小时。
 */

export const FREQS = ["daily", "weekday", "weekly", "monthly"];

/** 前进的最大次数；仍早于 today 时直接返回 today。 */
export const MAX_STEPS = 400;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** 校验是否为真实存在的日历日期。 */
export function isDateString(value) {
  if (typeof value !== "string") return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

/** 某年某月（1–12）的天数。 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUtc(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  const dt = new Date(ms);
  const y = String(dt.getUTCFullYear()).padStart(4, "0");
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 日期加减天数。 */
export function addDays(date, days) {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** 日期加减月数；日超过目标月天数时取当月最后一天。 */
export function addMonths(date, months) {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = index - ty * 12 + 1;
  const td = Math.min(d, daysInMonth(ty, tm));
  return fromUtc(Date.UTC(ty, tm - 1, td));
}

/** 0 = 周日 … 6 = 周六。 */
export function weekdayOf(date) {
  return new Date(toUtc(date)).getUTCDay();
}

function nextWeekday(date) {
  let next = addDays(date, 1);
  while (weekdayOf(next) === 0 || weekdayOf(next) === 6) next = addDays(next, 1);
  return next;
}

/** 把任意输入收敛成合法的 interval（1..30）；weekday 恒为 1。 */
export function normalizeInterval(freq, interval) {
  if (freq === "weekday") return 1;
  const n = Number(interval ?? 1);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 30);
}

/**
 * 第 k 次前进后的日期。monthly 始终以起点为锚，避免 1-31 → 2-28 → 3-28 的漂移。
 */
function step(base, freq, interval, k, prev) {
  switch (freq) {
    case "daily":
      return addDays(base, interval * k);
    case "weekly":
      return addDays(base, 7 * interval * k);
    case "monthly":
      return addMonths(base, interval * k);
    case "weekday":
      return nextWeekday(prev);
    default:
      throw new TypeError(`unknown recurrence freq: ${freq}`);
  }
}

/**
 * 计算重复任务下一次的日期。
 *
 * @param {string | null | undefined} date 当前截止日期；缺失时从 today 开始前进
 * @param {{ freq: string, interval?: number }} recurrence
 * @param {string} today 本地日期 `YYYY-MM-DD`
 * @returns {string}
 */
export function advanceDate(date, recurrence, today) {
  if (!isDateString(today)) throw new TypeError(`invalid today: ${today}`);
  const freq = recurrence?.freq;
  if (!FREQS.includes(freq)) throw new TypeError(`unknown recurrence freq: ${freq}`);
  const interval = normalizeInterval(freq, recurrence.interval);
  const base = isDateString(date) ? date : today;

  let current = base;
  for (let k = 1; k <= MAX_STEPS; k += 1) {
    current = step(base, freq, interval, k, current);
    if (current >= today) return current;
  }
  return today;
}
