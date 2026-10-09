// Everything runs on Karbala time. Iraq has no daylight saving, so it is always UTC+3.
const OFFSET_MS = 3 * 60 * 60 * 1000;

/** A calendar day in Karbala, written YYYY-MM-DD. */
export type DayKey = string;

export const CHECKOUT_TIME = "08:00";
export const DEFAULT_CHECKIN_TIME = "12:00";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayKey(d: Date | number): DayKey {
  return new Date(+d + OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant at a Karbala wall-clock time on a given day. */
export function at(key: DayKey, hhmm = "00:00"): Date {
  return new Date(`${key}T${hhmm}:00+03:00`);
}

export function checkoutAt(key: DayKey): Date {
  return at(key, CHECKOUT_TIME);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: DayKey, to: DayKey): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export function clock(d: Date | number): string {
  return new Date(+d + OFFSET_MS).toISOString().slice(11, 16);
}

function parts(key: DayKey) {
  const d = new Date(`${key}T00:00:00Z`);
  return { dow: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}

/** "Thu 9 Oct" */
export function fmtDay(key: DayKey): string {
  const p = parts(key);
  return `${DAYS[p.dow]} ${p.day} ${MONTHS[p.month]}`;
}

/** "Thursday" */
export function weekday(key: DayKey): string {
  return DAYS_LONG[parts(key).dow];
}

export function weekdayShort(key: DayKey): string {
  return DAYS[parts(key).dow];
}

/** "9 Oct" */
export function fmtShort(key: DayKey): string {
  const p = parts(key);
  return `${p.day} ${MONTHS[p.month]}`;
}

export function monthName(key: DayKey, long = false): string {
  const p = parts(key);
  return long ? new Date(`${key}T00:00:00Z`).toLocaleString("en", { month: "long", timeZone: "UTC" }) : MONTHS[p.month];
}

/** "Thu 9 Oct, 14:30" */
export function fmtWhen(d: Date | number): string {
  return `${fmtDay(dayKey(d))}, ${clock(d)}`;
}

/** Human distance between today and a day: "today", "tomorrow", "in 3 days", "yesterday". */
export function relDay(target: DayKey, today: DayKey): string {
  const n = diffDays(today, target);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.max(1, diffDays(dayKey(checkIn), dayKey(checkOut)));
}

export function ago(d: Date | number, now: number): string {
  const s = Math.max(0, Math.round((now - +d) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Value for <input type="datetime-local"> in Karbala time. */
export function toLocalInput(d: Date | number): string {
  return new Date(+d + OFFSET_MS).toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): Date {
  return new Date(`${v}:00+03:00`);
}
