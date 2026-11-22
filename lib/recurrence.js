/**
 * 重复任务的日期前进规则（docs/contract.md §1）。
 *
 * 全部是纯函数，输入输出都是本地日期字符串 `YYYY-MM-DD`。内部用 UTC 时间戳
 * 做日期算术，避免夏令时把一天算成 23 或 25 小时。
 */

export const FREQS = ["daily", "weekday", "weekly", "monthly", "yearly"];

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

/** 日期加减年数；2-29 在目标平年取 2-28。 */
export function addYears(date, years) {
  const [y, m, d] = date.split("-").map(Number);
  const ty = y + years;
  const td = Math.min(d, daysInMonth(ty, m));
  return fromUtc(Date.UTC(ty, m - 1, td));
}

/** 当月最后一天。 */
export function endOfMonth(date) {
  const [y, m] = date.split("-").map(Number);
  return fromUtc(Date.UTC(y, m - 1, daysInMonth(y, m)));
}

/**
 * 某年某月（1–12）的第 nth 个星期几（nth 1..4，或 -1 表示最后一个）。
 * weekday：0 = 周日 … 6 = 周六。
 */
export function nthWeekdayOfMonth(year, month, nth, weekday) {
  const last = daysInMonth(year, month);
  if (nth === -1) {
    const lastDate = fromUtc(Date.UTC(year, month - 1, last));
    const back = (weekdayOf(lastDate) - weekday + 7) % 7;
    return addDays(lastDate, -back);
  }
  const first = fromUtc(Date.UTC(year, month - 1, 1));
  const forward = (weekday - weekdayOf(first) + 7) % 7;
  const day = 1 + forward + (nth - 1) * 7;
  if (day > last) return null;
  return fromUtc(Date.UTC(year, month - 1, day));
}

/** 周一为一周开始（与客户端一致）。 */
function startOfWeek(date) {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

function diffDays(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
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
 * 第 k 次前进后的日期。monthly 值日期模式始终以起点为锚，避免 1-31 → 2-28 → 3-28 的漂移。
 */
function step(base, recurrence, interval, k, prev) {
  switch (recurrence.freq) {
    case "daily":
      return addDays(base, interval * k);
    case "weekly":
      return addDays(base, 7 * interval * k);
    case "monthly": {
      const anchor = addMonths(base, interval * k);
      const mode = recurrence.monthMode;
      if (mode === "lastDay") return endOfMonth(anchor);
      if (mode === "nthWeekday") {
        const [y, m] = anchor.split("-").map(Number);
        return nthWeekdayOfMonth(y, m, recurrence.nth, recurrence.weekday) ?? endOfMonth(anchor);
      }
      return anchor;
    }
    case "yearly":
      return addYears(base, interval * k);
    case "weekday":
      return nextWeekday(prev);
    default:
      throw new TypeError(`unknown recurrence freq: ${recurrence.freq}`);
  }
}

/**
 * weekly 多选星期：以 base 所在周为第 0 周，活动周 = 周序号 % interval == 0，
 * 返回 base 之后最早、且不早于 today 的匹配日期。
 */
function nextWeekly(base, weekdays, interval, today) {
  const set = new Set(weekdays);
  const floorDate = today > base ? today : addDays(base, 1);
  const baseWeek = startOfWeek(base);
  let cur = floorDate;
  const guard = 7 * interval + 14;
  for (let i = 0; i <= guard; i += 1) {
    const weekIndex = diffDays(baseWeek, startOfWeek(cur)) / 7;
    if (weekIndex >= 0 && weekIndex % interval === 0 && set.has(weekdayOf(cur)) && cur > base) {
      return cur;
    }
    cur = addDays(cur, 1);
  }
  return floorDate;
}

/**
 * 计算重复任务下一次的日期。
 *
 * @param {string | null | undefined} date 当前截止日期；缺失时从 today 开始前进
 * @param {{ freq: string, interval?: number, weekdays?: number[], monthMode?: string, nth?: number, weekday?: number }} recurrence
 * @param {string} today 本地日期 `YYYY-MM-DD`
 * @returns {string}
 */
export function advanceDate(date, recurrence, today) {
  if (!isDateString(today)) throw new TypeError(`invalid today: ${today}`);
  const freq = recurrence?.freq;
  if (!FREQS.includes(freq)) throw new TypeError(`unknown recurrence freq: ${freq}`);
  const interval = normalizeInterval(freq, recurrence.interval);
  const base = isDateString(date) ? date : today;

  if (freq === "weekly" && Array.isArray(recurrence.weekdays) && recurrence.weekdays.length) {
    return nextWeekly(base, recurrence.weekdays.map(Number), interval, today);
  }

  let current = base;
  for (let k = 1; k <= MAX_STEPS; k += 1) {
    current = step(base, recurrence, interval, k, current);
    if (current >= today) return current;
  }
  return today;
}
