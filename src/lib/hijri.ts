import type { DayKey } from "./time";

// Misri (Fatimid tabular) calendar used by the community. Matches the Hijri row of the
// old accommodation sheet; a ±1 day adjustment is available in settings for moon sighting.
const EPOCH = 1948439; // Julian day number of 1 Moharram 1 AH
const LEAP_YEARS = new Set([2, 5, 8, 10, 13, 16, 19, 21, 24, 27, 29]);

export const HIJRI_MONTHS = [
  "Moharram ul Haraam",
  "Safar ul Muzaffar",
  "Rabi ul Awwal",
  "Rabi ul Aakhar",
  "Jumadil Ula",
  "Jumadil Ukhra",
  "Rajab ul Asab",
  "Shabaan ul Karim",
  "Ramadaan ul Moazzam",
  "Shawwal ul Mukarram",
  "Zilqadatil Haraam",
  "Zilhajjatil Haraam",
];

export const HIJRI_MONTHS_SHORT = ["Moharram", "Safar", "Rabi I", "Rabi II", "Jumada I", "Jumada II", "Rajab", "Shabaan", "Ramadaan", "Shawwal", "Zilqad", "Zilhaj"];

function julianDay(key: DayKey): number {
  const [y, m, d] = key.split("-").map(Number);
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export interface HijriDate {
  day: number;
  month: number; // 0-based
  year: number;
}

export function toHijri(key: DayKey, adjust = 0): HijriDate {
  let days = julianDay(key) + adjust - EPOCH;
  const cycles = Math.floor(days / 10631);
  days -= cycles * 10631;
  let y = 0;
  for (;;) {
    const len = LEAP_YEARS.has(y + 1) ? 355 : 354;
    if (days < len) break;
    days -= len;
    y++;
  }
  for (let m = 0; m < 12; m++) {
    let len = m % 2 === 0 ? 30 : 29;
    if (m === 11 && LEAP_YEARS.has(y + 1)) len = 30;
    if (days < len) return { day: days + 1, month: m, year: cycles * 30 + y + 1 };
    days -= len;
  }
  return { day: 1, month: 0, year: cycles * 30 + y + 2 };
}

/** "28 Rabi ul Aakhar 1448" */
export function fmtHijri(key: DayKey, adjust = 0, short = false): string {
  const h = toHijri(key, adjust);
  return `${h.day} ${(short ? HIJRI_MONTHS_SHORT : HIJRI_MONTHS)[h.month]}${short ? "" : ` ${h.year}`}`;
}
