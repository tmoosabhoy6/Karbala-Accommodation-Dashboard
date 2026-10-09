import type { Room, Stay } from "./types";
import { addDays, at, dayKey, type DayKey } from "./time";

export type RoomStatus = "occupied" | "departing" | "free" | "arriving" | "blocked";

export const STATUS_META: Record<RoomStatus, { label: string; short: string; hint: string; color: string }> = {
  occupied: { label: "Occupied", short: "In", hint: "Staying past tomorrow", color: "var(--occupied)" },
  departing: { label: "Leaving tomorrow", short: "Out", hint: "Checks out by 08:00 today or tomorrow", color: "var(--departing)" },
  free: { label: "Available", short: "Free", hint: "Vacant now", color: "var(--free)" },
  arriving: { label: "Arriving", short: "Due", hint: "Free now, booked from today or tomorrow", color: "var(--arriving)" },
  blocked: { label: "Blocked", short: "Off", hint: "Faiz room, maintenance or store", color: "var(--blocked)" },
};

export const STATUS_ORDER: RoomStatus[] = ["free", "arriving", "departing", "occupied", "blocked"];

export const startMs = (s: Stay) => Date.parse(s.check_in);
export const endMs = (s: Stay) => {
  const e = s.checked_out_at ?? s.check_out;
  return e ? Date.parse(e) : Number.POSITIVE_INFINITY;
};
export const isLive = (s: Stay) => !s.cancelled_at;

export function capacity(room: Room) {
  return room.beds + room.extra_beds;
}

export function stayLabel(s: Stay): string {
  const who = [s.group_name, s.tour_id].filter(Boolean).join(" ");
  if (s.category === "staff") return s.guest_name || "Staff";
  if (s.category === "tour") return who || s.guest_name || "Guest";
  return who || s.guest_name || "";
}

export interface RoomState {
  status: RoomStatus;
  current: Stay[];
  next: Stay | null;
  /** When the room empties (ms), Infinity for open-ended stays. */
  busyUntil: number | null;
  /** When the next booking starts (ms) while the room is free. */
  freeUntil: number | null;
  used: number;
  capacity: number;
  partial: boolean;
}

export type StaysByRoom = Map<string, Stay[]>;

export function indexStays(stays: Stay[]): StaysByRoom {
  const map: StaysByRoom = new Map();
  for (const s of stays) {
    if (!isLive(s)) continue;
    const list = map.get(s.room_id);
    if (list) list.push(s);
    else map.set(s.room_id, [s]);
  }
  for (const list of map.values()) list.sort((a, b) => startMs(a) - startMs(b));
  return map;
}

export function roomState(room: Room, list: Stay[] | undefined, now: number): RoomState {
  const stays = list ?? [];
  const cap = capacity(room);
  const current = stays.filter((s) => startMs(s) <= now && endMs(s) > now);
  const upcoming = stays.filter((s) => startMs(s) > now);
  const next = upcoming[0] ?? null;
  const used = current.reduce((n, s) => n + (s.pax ?? (room.sharing === "none" ? cap : 1)), 0);
  const today = dayKey(now);
  const tomorrow = addDays(today, 1);

  if (current.some((s) => s.category === "blocked")) {
    const b = current.find((s) => s.category === "blocked")!;
    return { status: "blocked", current, next, busyUntil: endMs(b), freeUntil: null, used, capacity: cap, partial: false };
  }
  if (current.length) {
    const busyUntil = Math.max(...current.map(endMs));
    if (room.sharing !== "none" && used < cap) {
      return { status: "free", current, next, busyUntil, freeUntil: null, used, capacity: cap, partial: true };
    }
    const leavesSoon = Number.isFinite(busyUntil) && dayKey(busyUntil) <= tomorrow;
    return { status: leavesSoon ? "departing" : "occupied", current, next, busyUntil, freeUntil: null, used, capacity: cap, partial: false };
  }
  if (next && dayKey(startMs(next)) <= tomorrow) {
    return { status: "arriving", current, next, busyUntil: null, freeUntil: startMs(next), used: 0, capacity: cap, partial: false };
  }
  return { status: "free", current, next, busyUntil: null, freeUntil: next ? startMs(next) : null, used: 0, capacity: cap, partial: false };
}

/** Does this stay cover the night that starts on `key`? */
export function coversNight(s: Stay, key: DayKey): boolean {
  return startMs(s) < +at(key, "23:59") && endMs(s) > +at(addDays(key, 1), "07:59");
}

export interface Night {
  key: DayKey;
  stays: Stay[];
}

export function nights(list: Stay[] | undefined, from: DayKey, count: number): Night[] {
  const out: Night[] = [];
  for (let i = 0; i < count; i++) {
    const key = addDays(from, i);
    out.push({ key, stays: (list ?? []).filter((s) => coversNight(s, key)) });
  }
  return out;
}

export interface Availability {
  ok: boolean;
  free: number;
  clash: Stay | null;
  reason: string | null;
}

/** Can `pax` people use this room between `from` and `to` (ms)? */
export function availability(room: Room, list: Stay[] | undefined, from: number, to: number, pax: number, ignoreId?: string): Availability {
  const cap = capacity(room);
  const overlapping = (list ?? []).filter((s) => s.id !== ignoreId && startMs(s) < to && endMs(s) > from);
  const block = overlapping.find((s) => s.category === "blocked");
  if (block) return { ok: false, free: 0, clash: block, reason: `Blocked (${stayLabel(block) || "Faiz room"})` };
  if (room.sharing === "none") {
    if (overlapping.length) return { ok: false, free: 0, clash: overlapping[0], reason: `Taken by ${stayLabel(overlapping[0])}` };
    return { ok: true, free: cap, clash: null, reason: null };
  }
  const used = overlapping.reduce((n, s) => n + (s.pax ?? 1), 0);
  const free = Math.max(0, cap - used);
  if (pax > free) return { ok: false, free, clash: overlapping[0] ?? null, reason: `Only ${free} of ${cap} places free` };
  return { ok: true, free, clash: null, reason: null };
}

/** The checkout of the stay, or null when open-ended. */
export function leaveKey(s: Stay): DayKey | null {
  const e = endMs(s);
  return Number.isFinite(e) ? dayKey(e) : null;
}

export function floorLabel(floor: string): string {
  if (floor === "G") return "Ground";
  if (floor === "Annex") return "Annex";
  const n = Number(floor);
  if (!Number.isFinite(n)) return floor;
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `${n}${suffix} floor`;
}
