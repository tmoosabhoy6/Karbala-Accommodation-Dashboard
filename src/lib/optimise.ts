import type { Room, Stay, Tour } from "./types";
import { autofit, type Candidate, type FitRoom } from "./autofit";
import { endMs, startMs, type StaysByRoom } from "./status";
import { addDays, at, checkoutAt, dayKey, diffDays, type DayKey } from "./time";

/**
 * The month planner.
 *
 * ERP tours arrive with Iraq dates only. Each trip is split between Najaf and Karbala:
 * trips under 7 nights spend 2 nights in Najaf, 7-night trips spend 3, and longer trips 4.
 * Karbala gets the rest. A tour can start in Karbala on arrival, or go to Najaf first and
 * come to Karbala for the end of the trip. The planner picks the order and the rooms so
 * that as many people as possible get a bed in Karbala.
 */

export interface SplitRule {
  /** Najaf nights for trips shorter than 7 nights. */
  short: number;
  /** Najaf nights for 7-night trips. */
  week: number;
  /** Najaf nights for trips of 8 nights or more. */
  long: number;
}

export const DEFAULT_RULE: SplitRule = { short: 2, week: 3, long: 4 };

export type Order = "karbala_first" | "najaf_first";

export const ORDER_LABEL: Record<Order, string> = { karbala_first: "Karbala first", najaf_first: "Najaf first" };

export interface Window {
  order: Order;
  najaf: number;
  karbala: number;
  from: number;
  to: number;
}

export function tripNights(t: Pick<Tour, "arrival" | "departure">): number | null {
  if (!t.arrival || !t.departure) return null;
  return diffDays(dayKey(Date.parse(t.arrival)), dayKey(Date.parse(t.departure)));
}

/** Nights in Najaf and Karbala for a trip of `n` nights. */
export function split(n: number, rule: SplitRule = DEFAULT_RULE): { najaf: number; karbala: number } {
  if (n <= 1) return { najaf: 0, karbala: Math.max(n, 0) };
  if (n < 4) {
    // Shorter than the four-day minimum: share what there is, Karbala gets the extra night.
    const karbala = Math.ceil(n / 2);
    return { najaf: n - karbala, karbala };
  }
  const najaf = Math.min(n - 1, n < 7 ? rule.short : n === 7 ? rule.week : rule.long);
  return { najaf, karbala: n - najaf };
}

/** Both ways the tour could do Karbala, with exact check-in and check-out times. */
export function windows(t: Tour, rule: SplitRule = DEFAULT_RULE): Window[] {
  const n = tripNights(t);
  if (n === null || n < 1) return [];
  const arr = Date.parse(t.arrival!);
  const dep = Date.parse(t.departure!);
  const arrDay = dayKey(arr);
  const { najaf, karbala } = split(n, rule);
  if (karbala <= 0) return [];
  const first: Window = { order: "karbala_first", najaf, karbala, from: arr, to: +checkoutAt(addDays(arrDay, karbala)) };
  if (najaf === 0) return [first];
  const inDay = addDays(arrDay, najaf);
  const from = +at(inDay, "12:00");
  const to = Math.min(dep, +checkoutAt(addDays(inDay, karbala)));
  const second: Window = { order: "najaf_first", najaf, karbala, from, to: to > from ? to : +checkoutAt(addDays(inDay, karbala)) };
  return [first, second];
}

/** Which way round suits the flights: land in Najaf, start in Najaf; fly out of Najaf, end there. */
export function preferredOrder(t: Tour): Order | null {
  const inNajaf = /najaf/i.test(t.entry_port ?? "");
  const outNajaf = /najaf/i.test(t.exit_port ?? "");
  if (inNajaf && !outNajaf) return "najaf_first";
  if (outNajaf && !inNajaf) return "karbala_first";
  return null;
}

export type RowStatus = "placed" | "booked" | "no_space" | "no_dates" | "skipped" | "not_needed";

export interface PlanRow {
  tour: Tour;
  nights: number | null;
  options: Window[];
  preferred: Order | null;
  chosen: Window | null;
  rooms: FitRoom[];
  beds: number;
  usesMattresses: boolean;
  status: RowStatus;
  reason: string | null;
  /** Stays already booked for this tour, when it was planned before. */
  stays: Stay[];
}

export interface NightLoad {
  key: DayKey;
  beds: number;
  existing: number;
  /** Beds the plan holds that night (whole rooms, so it can be more than the people). */
  planned: number;
  people: number;
  unmet: number;
}

export interface Plan {
  rows: PlanRow[];
  demand: number;
  placed: number;
  booked: number;
  toursPlaced: number;
  toursTotal: number;
  nightly: NightLoad[];
  strategy: string;
}

interface Busy {
  from: number;
  to: number;
  pax: number;
}

interface Ctx {
  rooms: Room[];
  busy: Map<string, Busy[]>;
}

function overlaps(list: Busy[] | undefined, from: number, to: number) {
  return (list ?? []).filter((b) => b.from < to && b.to > from);
}

function candidates(ctx: Ctx, t: Tour, w: Window): Candidate[] {
  const out: Candidate[] = [];
  for (const r of ctx.rooms) {
    const clash = overlaps(ctx.busy.get(r.id), w.from, w.to);
    if (r.sharing === "none") {
      if (clash.length || r.beds <= 0) continue;
      out.push({ room: r, places: r.beds, max: r.beds + r.extra_beds });
    } else if (t.gender && t.gender === r.sharing) {
      // Sharing rooms only for a single-gender group of the same gender.
      if (clash.some((b) => b.pax < 0)) continue;
      const used = clash.reduce((n, b) => n + b.pax, 0);
      const free = r.beds - used;
      if (free > 0) out.push({ room: r, places: free, max: free + r.extra_beds });
    }
  }
  return out;
}

function place(ctx: Ctx, t: Tour, w: Window, preferBuilding: string | null) {
  const fit = autofit(candidates(ctx, t, w), t.pax_required, preferBuilding);
  return fit;
}

function commit(ctx: Ctx, w: Window, rooms: FitRoom[]) {
  for (const fr of rooms) {
    const list = ctx.busy.get(fr.room.id) ?? [];
    list.push({ from: w.from, to: w.to, pax: fr.room.sharing === "none" ? -1 : fr.pax });
    ctx.busy.set(fr.room.id, list);
  }
}

// Small deterministic random generator so the same upload always gives the same plan.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

interface Attempt {
  rows: Map<string, { chosen: Window; fit: NonNullable<ReturnType<typeof autofit>> }>;
  placed: number;
  rooms: number;
  mattresses: number;
  preferredMisses: number;
}

function attempt(base: Ctx, queue: Tour[], rule: SplitRule, pickOrder: (t: Tour, opts: Window[]) => Window[], preferBuilding: string | null): Attempt {
  const ctx: Ctx = { rooms: base.rooms, busy: new Map([...base.busy].map(([k, v]) => [k, [...v]])) };
  const rows: Attempt["rows"] = new Map();
  let placed = 0;
  let rooms = 0;
  let mattresses = 0;
  let preferredMisses = 0;
  for (const t of queue) {
    const opts = windows(t, rule).filter((w) => !t.plan_order || t.plan_order === w.order);
    for (const w of pickOrder(t, opts)) {
      const fit = place(ctx, t, w, preferBuilding ?? t.preferred_building);
      if (!fit) continue;
      commit(ctx, w, fit.rooms);
      rows.set(t.tour_id, { chosen: w, fit });
      placed += t.pax_required;
      rooms += fit.rooms.length;
      if (fit.usesMattresses) mattresses++;
      const pref = preferredOrder(t);
      if (pref && pref !== w.order) preferredMisses++;
      break;
    }
  }
  return { rows, placed, rooms, mattresses, preferredMisses };
}

const better = (a: Attempt, b: Attempt | null) =>
  !b ||
  a.placed > b.placed ||
  (a.placed === b.placed && (a.mattresses < b.mattresses || (a.mattresses === b.mattresses && a.preferredMisses * 2 + a.rooms < b.preferredMisses * 2 + b.rooms)));

export interface OptimiseInput {
  tours: Tour[];
  rooms: Room[];
  byRoom: StaysByRoom;
  rule?: SplitRule;
  now: number;
  /** How many shuffled tries to run on top of the fixed strategies. */
  tries?: number;
}

export function optimise({ tours, rooms, byRoom, rule = DEFAULT_RULE, now, tries = 24 }: OptimiseInput): Plan {
  const guest = rooms.filter((r) => r.active && r.room_type !== "Staff Room");
  const busy = new Map<string, Busy[]>();
  const bookedFor = new Map<string, Stay[]>();
  for (const r of guest) {
    const list: Busy[] = [];
    for (const s of byRoom.get(r.id) ?? []) {
      if (endMs(s) <= now) continue;
      list.push({ from: startMs(s), to: endMs(s), pax: r.sharing === "none" || s.category === "blocked" ? -1 : s.pax ?? 1 });
      if (s.tour_id) bookedFor.set(s.tour_id, [...(bookedFor.get(s.tour_id) ?? []), s]);
    }
    busy.set(r.id, list);
  }
  const ctx: Ctx = { rooms: guest, busy };

  const queue: Tour[] = [];
  const rows: PlanRow[] = [];
  const row = (t: Tour, status: RowStatus, reason: string | null = null): PlanRow => ({
    tour: t,
    nights: tripNights(t),
    options: windows(t, rule),
    preferred: preferredOrder(t),
    chosen: null,
    rooms: [],
    beds: 0,
    usesMattresses: false,
    status,
    reason,
    stays: bookedFor.get(t.tour_id) ?? [],
  });

  for (const t of tours) {
    if (t.status === "cancelled") continue;
    if (t.status === "not_needed" || t.pax_required <= 0) {
      rows.push(row(t, "not_needed", "No pax need rooms"));
      continue;
    }
    if (bookedFor.has(t.tour_id)) {
      rows.push(row(t, "booked"));
      continue;
    }
    if (t.plan_order === "skip") {
      rows.push(row(t, "skipped", "Left out by hand"));
      continue;
    }
    if (!windows(t, rule).length) {
      rows.push(row(t, "no_dates", "Arrival or departure missing"));
      continue;
    }
    if (Date.parse(t.departure!) <= now) continue;
    queue.push(t);
  }

  const preferFirst = (t: Tour, opts: Window[]) => {
    const p = preferredOrder(t);
    return p ? [...opts].sort((a) => (a.order === p ? -1 : 1)) : opts;
  };
  const byArrival = (a: Tour, b: Tour) => Date.parse(a.arrival!) - Date.parse(b.arrival!) || b.pax_required - a.pax_required;
  const karbalaNights = (t: Tour) => split(tripNights(t) ?? 0, rule).karbala;
  const strategies: [string, Tour[], (t: Tour, o: Window[]) => Window[]][] = [
    ["by arrival", [...queue].sort(byArrival), preferFirst],
    ["largest groups first", [...queue].sort((a, b) => b.pax_required - a.pax_required || byArrival(a, b)), preferFirst],
    ["fewest bed-nights first", [...queue].sort((a, b) => a.pax_required * karbalaNights(a) - b.pax_required * karbalaNights(b) || byArrival(a, b)), preferFirst],
    ["most bed-nights first", [...queue].sort((a, b) => b.pax_required * karbalaNights(b) - a.pax_required * karbalaNights(a) || byArrival(a, b)), preferFirst],
  ];

  let best: Attempt | null = null;
  let bestName = "";
  for (const [name, q, pick] of strategies) {
    const a = attempt(ctx, q, rule, pick, null);
    if (better(a, best)) {
      best = a;
      bestName = name;
    }
  }
  const rand = rng(queue.length * 7919 + 17);
  for (let i = 0; i < tries && best!.placed < queue.reduce((n, t) => n + t.pax_required, 0); i++) {
    const q = [...queue].map((t) => ({ t, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.t);
    const a = attempt(ctx, q, rule, (t, o) => (rand() < 0.75 ? preferFirst(t, o) : [...o].reverse()), null);
    if (better(a, best)) {
      best = a;
      bestName = "shuffled search";
    }
  }

  for (const t of queue) {
    const got = best!.rows.get(t.tour_id);
    if (!got) {
      rows.push(row(t, "no_space", "Not enough free rooms on those nights"));
      continue;
    }
    rows.push({ ...row(t, "placed"), chosen: got.chosen, rooms: got.fit.rooms, beds: got.fit.beds, usesMattresses: got.fit.usesMattresses });
  }
  rows.sort((a, b) => Date.parse(a.tour.arrival ?? "") - Date.parse(b.tour.arrival ?? "") || a.tour.tour_id.localeCompare(b.tour.tour_id));

  const demandRows = rows.filter((r) => r.status !== "not_needed");
  const demand = demandRows.reduce((n, r) => n + r.tour.pax_required, 0);
  const placed = rows.filter((r) => r.status === "placed").reduce((n, r) => n + r.tour.pax_required, 0);
  const booked = rows.filter((r) => r.status === "booked").reduce((n, r) => n + r.tour.pax_required, 0);

  return {
    rows,
    demand,
    placed,
    booked,
    toursPlaced: rows.filter((r) => r.status === "placed" || r.status === "booked").length,
    toursTotal: demandRows.length,
    nightly: nightly(rows, guest, byRoom, now),
    strategy: bestName,
  };
}

/** Beds each night: what is already taken, what the plan adds, and who is left without a bed. */
function nightly(rows: PlanRow[], rooms: Room[], byRoom: StaysByRoom, now: number): NightLoad[] {
  const relevant = rows.filter((r) => r.options.length);
  if (!relevant.length) return [];
  const first = dayKey(Math.max(now, Math.min(...relevant.map((r) => r.options[0].from))));
  const last = dayKey(Math.max(...relevant.flatMap((r) => r.options.map((w) => w.to))));
  const out: NightLoad[] = [];
  const covers = (from: number, to: number, k: DayKey) => from < +at(k, "23:59") && to > +at(addDays(k, 1), "07:59");
  for (let k = first; k <= last && out.length < 62; k = addDays(k, 1)) {
    let beds = 0;
    let existing = 0;
    for (const r of rooms) {
      const stays = (byRoom.get(r.id) ?? []).filter((s) => covers(startMs(s), endMs(s), k));
      if (stays.some((s) => s.category === "blocked")) continue;
      beds += r.beds;
      for (const s of stays) existing += Math.min(r.beds, s.pax ?? (r.sharing === "none" ? r.beds : 1));
    }
    let planned = 0;
    let people = 0;
    let unmet = 0;
    for (const r of relevant) {
      if (r.status === "placed" && r.chosen && covers(r.chosen.from, r.chosen.to, k)) {
        planned += r.beds;
        people += r.tour.pax_required;
      }
      if ((r.status === "no_space" || r.status === "skipped") && r.options.length) {
        const w = r.options.find((o) => o.order === (r.preferred ?? "karbala_first")) ?? r.options[0];
        if (covers(w.from, w.to, k)) unmet += r.tour.pax_required;
      }
    }
    out.push({ key: k, beds, existing: Math.min(existing, beds), planned, people, unmet });
  }
  return out;
}

export function karbalaDates(w: Window) {
  return { inKey: dayKey(w.from), outKey: dayKey(w.to) };
}
